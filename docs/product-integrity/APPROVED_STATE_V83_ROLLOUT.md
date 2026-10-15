# UX/UI Agent v8.3 — Approved-state protection rollout

The v8.3 checker is now available at `scripts/ui-regression-guard.mjs`. Its `--self-test` is wired into current PR CI. **`--check` is intentionally not enabled yet for this project:** it requires an explicitly approved and protected UI-state inventory, baseline image hashes, and visual-comparison assertions. It must not certify or freeze a known defective implementation.

Project: **HRIS Main**. Likely consumer areas to inventory: LiveApp/LiveHrisWorkspace, role navigation, sidebar, tenant-scoped lists and shared forms. Current blocker: original Figma approval and role/state signoff; main still contains older generic renderer.

Before activation: recover independently approved source/Figma screenshots (not generated goldens), record role/user/locale/viewport/interaction states, trace reverse component/style dependencies, install a project-specific `qa/ui-regression-contract.json`, then run `--check --base <target-commit>` in both PR and release workflows. Human design approval and actual matched browser screenshot comparison remain necessary. Do not call self-tests final visual acceptance.

Never introduce unrelated UI features, demo banners, arbitrary warnings, or self-approved snapshot updates. The target branch must hold the approved baseline before a feature PR can change it.
