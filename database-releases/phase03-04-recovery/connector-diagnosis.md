## Verified recovery outcome
A single fresh reviewed apply_migration call succeeded through the existing HRIS connector and recorded native version 20261020043721. The earlier requestState error did not recur. The precise internal cause of the earlier failed resume remains unobserved; do not claim its signing, expiry or routing implementation was repaired. No sign-in, credentials transfer or alternate organization was used.

# Connector submission diagnosis

## Verified observations
- HRIS project oslgwxaqfbteqtwqvdzs, organization qdcgrdntvspjsdszuzmy: healthy.
- Existing HRIS connector executes SQL reads as postgres.
- Database/public CREATE and migration-history SELECT/INSERT/UPDATE confirmed.
- apply_migration is exposed and a fresh real submission succeeded in this recovery checkpoint.
- Earlier reported error: `Invalid or expired requestState`.
- Existing CLI workflow run 39292936014 logs empty required credential values; it aborts before database connection. This is a separate failure, not evidence that connector authentication is missing.

## Official code evidence
- [MCP TypeScript server request-state validation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/server.ts)
  validates resumed state before handler invocation and reports frozen InvalidParams (-32602), reason invalid_request_state.
  Internal verification details go to server onerror/logs rather than the wire.
- [MCP request-state codec documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/input-required.md)
  describes integrity/expiry verification and byte-exact state echo across confirmation rounds.
- [Supabase migration tool](https://github.com/supabase/mcp/blob/main/packages/mcp-server-supabase/src/tools/database-operation-tools.ts)
  binds migration confirmation state to project, name and SQL hash before database.applyMigration.

## Diagnosis and limits
The exact reported message matches the protocol's resume-state verification boundary. This supports a connector confirmation/resumption failure rather than a demonstrated SQL privilege error.
The deployed connector/server version and internal rejection reason are not available here. Do not claim whether expiry, argument mismatch, principal binding, signing-key rotation or routing caused it without server-side evidence.
Successful reads do not independently prove management API migration write scope.

## Safe next diagnostic
After the real reviewed migration passes all release gates, submit it once as a fresh apply_migration operation using the existing HRIS connector and unchanged project/name/SQL through any native confirmation round.
If state validation fails again, preserve the exact tool error and timestamp, then re-read migration history and object state. Do not repeat unchanged submissions, manufacture requestState, disable confirmation, obfuscate SQL, transfer connector credentials or use execute_sql for production DDL.
Connector-provider investigation should correlate tool/project/time and inspect server request-state rejection logs, byte-exact resume arguments, token lifetime, principal/context binding and shared verification keys across instances.
This is connector infrastructure work; database GRANT changes and dashboard login do not repair a rejected resume token.

## Existing CLI fallback
The previous run has neither a confirmed credential-backed connection nor a successful migration dry-run.
No secrets are copied from the connector. Before any future CLI release, independently verify its authorized credentials and reconcile existing remote history without manual fabrication or destructive repair.
