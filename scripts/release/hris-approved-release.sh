#!/usr/bin/env bash
# Operates ONLY existing approved manual production workflows; never applies SQL directly.
set -euo pipefail
umask 077
export GH_PROMPT_DISABLED=1
REPO='shihab-tech04/HRIS-v2'
SQL_WF='ws05-employee-profile-sql-release.yml'
PAGES_WF='deploy-pages.yml'
HOST="$(printenv HRIS_POOLER_HOST || true)"
EXECUTE=false
BACKUP_RUN_ID=''
RESTORE_RUN_ID=''
OFFSITE_VERIFIED=false
usage() {
  cat <<'USAGE'
Usage: hris-approved-release.sh --host aws-0-ap-northeast-2.pooler.supabase.com [--backup-run ID --restore-run ID --offsite-verified --execute]
Without --execute this is a no-write dry-run.
With --execute, the authenticated gh operator dispatches the EXISTING owner-approved SQL
workflow, verifies exact-Main success, then dispatches and verifies the existing Pages
workflow. Requires gh CLI, Python 3, repository workflow permission, configured GitHub
secret HRIS_DB_PASSWORD, and a current checked/restored encrypted backup off GitHub.
Never give passwords, tokens or encryption passphrases as arguments.
USAGE
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) [[ $# -ge 2 ]] || { usage; exit 2; }; HOST="$2"; shift 2 ;;
    --backup-run) [[ $# -ge 2 ]] || { usage; exit 2; }; BACKUP_RUN_ID="$2"; shift 2 ;;
    --restore-run) [[ $# -ge 2 ]] || { usage; exit 2; }; RESTORE_RUN_ID="$2"; shift 2 ;;
    --offsite-verified) OFFSITE_VERIFIED=true; shift ;;
    --execute) EXECUTE=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done
[[ "$HOST" =~ ^aws-[0-9]+-ap-northeast-2\.pooler\.supabase\.com$ ]] || {
  echo "FAIL: use the actual HRIS session pooler hostname from Supabase Connect" >&2
  exit 2
}
if [[ "$EXECUTE" != true ]]; then
  echo "DRY RUN: No GitHub or database action taken."
  echo "Sequence: SQL workflow -> check success/exact Main -> Pages workflow -> check success/exact Main."
  exit 0
fi
[[ "$BACKUP_RUN_ID" =~ ^[0-9]+$ && "$RESTORE_RUN_ID" =~ ^[0-9]+$ && "$OFFSITE_VERIFIED" == true ]] || {
  echo "FAIL: exact backup/restore run IDs and independently verified offsite recovery are required" >&2
  exit 4
}
command -v gh >/dev/null || { echo "FAIL: gh CLI missing" >&2; exit 3; }
command -v python3 >/dev/null || { echo "FAIL: Python 3 missing" >&2; exit 3; }
gh auth status >/dev/null || { echo "FAIL: gh is not authenticated" >&2; exit 3; }
main_sha() { gh api "repos/$REPO/branches/main" --jq '.commit.sha'; }
SHA="$(main_sha)"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo "FAIL: cannot determine protected Main SHA" >&2; exit 3; }
PR_COUNT="$(gh api "repos/$REPO/pulls?state=open&per_page=100" --jq 'length')"
[[ "$PR_COUNT" == 0 ]] || { echo "FAIL: open PRs require review before release" >&2; exit 4; }
CHECK_PASS="$(gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" --jq '[.check_runs[] | select(.name=="check" and .status=="completed" and .conclusion=="success")] | length')"
[[ "$CHECK_PASS" -ge 1 ]] || { echo "FAIL: current Main did not pass exact-SHA CI" >&2; exit 4; }

# A successful artifact/restore/run is enforced by the APPROVED SQL workflow;
# do not patch or bypass its backup TTL, PR #159, exact SQL hash and migration inventory gates.
find_run() {
  local wf="$1" started="$2" sha="$3" reply id
  for attempt in $(seq 1 30); do
    reply="$(gh api "repos/$REPO/actions/workflows/$wf/runs?event=workflow_dispatch&per_page=100")"
    id="$(printf '%s' "$reply" | python3 -c '
import json,sys
started,sha=sys.argv[1:]
runs=json.load(sys.stdin).get("workflow_runs",[])
hits=[r for r in runs if r.get("event")=="workflow_dispatch" and r.get("head_sha")==sha and r.get("created_at","")>=started]
print(max(hits,key=lambda r:r.get("created_at",""))["id"] if hits else "")
' "$started" "$sha")"
    if [[ "$id" =~ ^[0-9]+$ ]]; then printf '%s\n' "$id"; return 0; fi
    sleep 5
  done
  echo "FAIL: approved GitHub workflow dispatch was not found" >&2
  return 1
}
run_protected() {
  local wf="$1" sha="$2" started id actual conclusion
  [[ "$(main_sha)" == "$sha" ]] || {
    echo "FAIL: Main moved; new source and acceptance review required" >&2
    exit 4
  }
  started="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  if [[ "$wf" == "$SQL_WF" ]]; then
    gh workflow run "$wf" --repo "$REPO" --ref main \
      --field release_approved=true --field offsite_recovery_verified=true \
      --field backup_run_id="$BACKUP_RUN_ID" --field restore_run_id="$RESTORE_RUN_ID" \
      --field session_pooler_host="$HOST"
  else
    gh workflow run "$wf" --repo "$REPO" --ref main \
      --field release_approved=true --field session_pooler_host="$HOST"
  fi
  id="$(find_run "$wf" "$started" "$sha")"
  echo "Watching protected workflow $wf run $id"
  gh run watch "$id" --repo "$REPO" --exit-status
  actual="$(gh api "repos/$REPO/actions/runs/$id" --jq '.head_sha')"
  conclusion="$(gh api "repos/$REPO/actions/runs/$id" --jq '.conclusion')"
  [[ "$actual" == "$sha" && "$conclusion" == success ]] || {
    echo "FAIL: workflow did not finish successfully on the exact protected Main" >&2
    exit 5
  }
  echo "PASS: $wf, exact Main $sha, run $id"
}
echo "Approved HRIS production target: $SHA"
run_protected "$SQL_WF" "$SHA"
run_protected "$PAGES_WF" "$SHA"
[[ "$(main_sha)" == "$SHA" ]] || { echo "FAIL: Main changed after Pages release" >&2; exit 5; }
echo "PASS: approved SQL and Pages workflows both passed on exact Main $SHA"
echo "Production URL: https://shihab-tech04.github.io/HRIS-v2/"
echo "The Pages workflow checked byte-identical JS/CSS and real login/recovery browser smoke."
echo "Full 1,047-story feature acceptance remains a separate release sign-off."
