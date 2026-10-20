import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPhaseReadiness } from './phase-readiness.mjs';

// Operational gates summarize what has been inspected, not end-user acceptance.
// All 1,047 canonical stories remain subject to Phase 20 authenticated
// requirement-by-requirement verification and Phase 21 hosted release signoff.
export const operationalPhaseGates = Object.freeze({
  '00': { title: 'Source and scope reconciliation', state: 'SOURCE_SCOPE_GATE_PASSED', note: 'Source hash, all canonical IDs, and module mapping verified; legacy aggregate membership still unknown.' },
  '01': { title: 'Architecture and integration blueprint', state: 'BLUEPRINT_GATE_PASSED', note: 'Static integration coverage checked; hosted browser/API/database parity not certified.' },
  '02': { title: 'Design foundation', state: 'FOUNDATION_GATE_PASSED', note: 'Tokens and reference anchors checked; complete Figma/role/mobile parity outstanding.' },
  '03': { title: 'SaaS platform and tenant lifecycle', state: 'STAGED_TESTED_RELEASE_BLOCKED', note: 'Production migration baseline is applied; seven platform RPCs remain staged and tenant lifecycle/API release acceptance is pending.' },
  '04': { title: 'Authentication, authorization and RLS', state: 'HOSTED_API_ACCEPTANCE_PENDING', note: 'Production migration head and hosted schema/security gates are verified; signed-in API and tenant-isolation acceptance remains pending.' },
  '05': { title: 'People master and organization', state: 'STORY_ACCEPTANCE_OPEN', note: 'HR01-04 is individually evidenced; document upload/replacement/reminders still require HR-approved categories and lifecycle rules.' },
  '06': { title: 'Recruitment and Candidate integration', state: 'STORY_ACCEPTANCE_OPEN', note: 'Requested-document source recovered; whole Candidate-to-HRIS live acceptance remains open.' },
  '07': { title: 'Onboarding and employee conversion', state: 'STORY_ACCEPTANCE_OPEN', note: 'Previously tested journey exists; exact canonical requirement evidence and hosted gate pending.' },
  '08': { title: 'Attendance, roster and time', state: 'STORY_ACCEPTANCE_OPEN', note: 'Previously tested journeys exist; incomplete policy and canonical acceptance remain.' },
  '09': { title: 'Leave and absence', state: 'STORY_ACCEPTANCE_OPEN', note: 'Tenant-wide leave path tested historically; entitlement, accrual and cancellation contracts open.' },
  '10': { title: 'Projects and resource allocation', state: 'STORY_ACCEPTANCE_OPEN', note: 'Previously tested project journey exists; remaining canonical cases not certified.' },
  '11': { title: 'Performance', state: 'STORY_ACCEPTANCE_OPEN', note: 'Task and review journeys exist; appraisal lifecycle and canonical acceptance open.' },
  '12': { title: 'Learning and career', state: 'STORY_ACCEPTANCE_OPEN', note: 'Completion verification historically tested; programme-wide acceptance open.' },
  '13': { title: 'Compensation, payroll and benefits', state: 'BUSINESS_RULES_REQUIRED', note: 'Pay-run authority and calculation rules unapproved; payslip/register read path not pay-run acceptance.' },
  '14': { title: 'Expense, travel and claims', state: 'BUSINESS_RULES_REQUIRED', note: 'Expense decision roles and tier limits unapproved; submission does not imply approval workflow.' },
  '15': { title: 'Employee lifecycle and services', state: 'STORY_ACCEPTANCE_OPEN', note: 'Service-request resolution historically tested; wider lifecycle not accepted.' },
  '16': { title: 'Communications and task engine', state: 'STORY_ACCEPTANCE_OPEN', note: 'In-app alerts exist; delivery/reminder/tenant rules require further acceptance.' },
  '17': { title: 'Dashboards and analytics', state: 'STORY_ACCEPTANCE_OPEN', note: 'Some live metrics and views exist; complete reporting coverage open.' },
  '18': { title: 'Mobile, localization, accessibility and UX', state: 'CROSS_CUTTING_GATE_OPEN', note: 'No exclusive source modules: acceptance must span every role, route, language and viewport.' },
  '19': { title: 'Migrations and cross-system security certification', state: 'HOSTED_API_ACCEPTANCE_PENDING', note: 'Production migration history is confirmed through 20261020044145; signed-in cross-system API and tenant-isolation acceptance remains pending.' },
  '20': { title: 'Canonical story coverage and gap closure', state: 'STORY_COVERAGE_GATE_OPEN', note: 'Exact-ID disposable evidence is not hosted acceptance; old 82-story aggregate cannot be unioned.' },
  '21': { title: 'Release candidate and publication', state: 'RELEASE_BLOCKED', note: 'Backup/readback, hosted parity, full acceptance and two-app publication not authorized yet.' },
});

export function programmePhaseDashboard(getPhase = readPhaseReadiness) {
  const rows = Object.entries(operationalPhaseGates).sort(([a], [b]) => Number(a) - Number(b)).map(([phase, gate]) => {
    const readiness = getPhase(phase);
    return {
      phase, title: gate.title, state: gate.state, note: gate.note,
      modules: readiness.module_ids.length, ...readiness.counts,
    };
  });
  if (rows.length !== 22) throw new Error('All 22 operational phases must be represented.');
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const modules = rows.reduce((sum, row) => sum + row.modules, 0);
  const evidenced = rows.reduce((sum, row) => sum + row.disposable_evidenced, 0);
  const blocked = rows.reduce((sum, row) => sum + row.blocked, 0);
  const partial = rows.reduce((sum, row) => sum + row.partial, 0);
  const unclassified = rows.reduce((sum, row) => sum + row.not_classified, 0);
  if (total !== 1047 || modules !== 153 || evidenced + blocked + partial + unclassified !== total) {
    throw new Error('Programme coverage does not reconcile with the 1,047-story/153-module canonical matrix.');
  }
  return {
    scope: 'Operational checkpoint, not production certification. Source/scope, blueprint, design-foundation, and Phase 03/04 hosted migration prerequisite gates have passed; signed-in production app acceptance remains pending.',
    totals: { phases: rows.length, modules, stories: total, individually_disposable_evidenced: evidenced, blocked, partial, unclassified, hosted_story_accepted: 0 },
    phases: rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = programmePhaseDashboard();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  else {
    for (const row of snapshot.phases) {
      process.stdout.write(`${row.phase} ${row.state.padEnd(29)} ${String(row.modules).padStart(3)} modules / ${String(row.total).padStart(3)} stories / ${String(row.disposable_evidenced).padStart(2)} individually evidenced\n`);
    }
    process.stdout.write(`TOTAL: ${snapshot.totals.phases} phases, ${snapshot.totals.modules} modules, ${snapshot.totals.stories} canonical stories; ${snapshot.totals.individually_disposable_evidenced} exact-ID disposable evidence; 0 hosted story acceptance claims.\n`);
  }
}
