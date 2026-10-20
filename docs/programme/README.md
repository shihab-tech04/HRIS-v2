# Canonical HRIS story verification

`CANONICAL_USER_STORY_MATRIX.json` is the immutable source-linked inventory recovered from the original 1,047-story / 153-module master record. All 1,047 source rows currently have `status: "NOT TESTED"`. That is source completeness, **not** implementation or acceptance.

`HRIS_STORY_ACCEPTANCE.json` is a separate evidence overlay. A row may be added only after its original `storyId`, complete-task acceptance criteria, actual test IDs, evidence reference, independent reviewer, and exact tested source commit are available. Do not alter the canonical inventory to make release green.

The product gate verifies the canonical matrix's exact SHA-256, source IDs and module count. It blocks final release while any of the original stories lacks independent end-to-end acceptance or while a product-wide evidence requirement is unresolved.
