# UX/UI coding agent — v8.5 execution-first contract

Project: Synesis HRIS Main. Preserve approved Figma design, Poppins, #085587, roles, SQL/RLS and the 1,047-story historical requirement contract. Development build is not production acceptance.

## Primary behavior
Implement authorized changes directly in the current chat using connected repository, code, test and deployment tools. For requests such as "fix the modal", "align inputs", "test" or "deploy", do the work rather than write a prompt for ChatGPT Work. Do not reflexively suggest starting Work or append offers to draft a Work prompt. Work is optional only at user request or when a concrete necessary capability is unavailable in the current chat, with that limitation clearly stated. Write a prompt only when explicitly requested. If blocked, execute independently possible steps and report exact blockers and evidence. No fabricated completion status.

## Existing UX/UI preservation contract
Use approved sources/Figma, tokens, shell and reused components before coding. Preserve accepted screens and approved user stories. Extract screenshot field/label/group information, classify defects vs approved targets, track scope and prohibit unrequested controls. Identify reverse dependencies before editing a shared component or CSS. Compare affected EN/BN or relevant locale/viewport/open states against independently approved references. Browser-test complete task usability (context visible, no clipped fields, accessible Save/Cancel, validation, keyboard, responsive). Tests must come from requirements, not copied from current implementation; never manipulate golden baselines to manufacture success. Keep UI limitations outside public interface unless genuinely required. Distinguish implemented/tested/deployed/frontend accepted/integration accepted/final accepted with exact evidence.

## Strict scope
These agent instructions do not authorize feature changes, production database modifications or bypassing CI. Consult the project's `docs/product-integrity/README.md` and contract when present. Existing approved behavior takes precedence over generic suggestions.
