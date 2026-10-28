# JASLYN NET Workflow Automation Foundation

**Status:** Scope and acceptance contract. PR #83 implements a subset of this contract (safe TRANSFORM node, visual editor support, immutable workflow version history, execution snapshots, import/export and guarded run controls). Remaining capabilities still require implementation and verification; this document is not a production-readiness claim.
**Scope:** Core workflow automation capabilities inspired by n8n, Activepieces, Make, Zapier, Pipedream, Windmill, Node-RED, Microsoft Power Automate, Workato and Temporal.
**Product constraint:** No AI features are included in this scope.

## Product decision

Build a native, tenant-safe workflow engine around the existing NestJS, PostgreSQL and Redis/BullMQ stack. Do not embed another vendor's hosted runtime or copy proprietary code. Use external automation platforms as product benchmarks only. Reuse existing Jaslyn Net domain services and vendor adapters instead of building duplicate payment, router, notification or customer logic.

## Core capabilities to deliver

1. **Workflow definition and versioning**
   - Create, edit, validate, activate, pause and archive workflows.
   - Version definitions; activating a new version must not mutate already-running executions.
   - Support manual, schedule, webhook and internal domain-event triggers.
   - Provide a visual graph editor in the web app, with node configuration, edges, validation feedback and a run/test action.
2. **Composable steps**
   - Trigger, condition/branch, delay, bounded loop/each, transform/map, HTTP/API request, approval, notification, and call-existing Jaslyn Net service.
   - Typed inputs/outputs, explicit required fields, bounded execution time and payload-size limits.
   - No arbitrary shell execution, eval, unrestricted code execution or unrestricted outbound network access.
3. **Durable asynchronous execution**
   - Queue-backed workers, persisted execution state, checkpoints, timeout/cancellation and bounded retries with exponential backoff and jitter.
   - Dead-letter state, replay from a safe checkpoint, execution history and per-step logs.
   - Idempotency keys for triggers and side-effecting steps; prevent duplicate payments, provisioning, notifications and other repeatable side effects.
4. **Integration hub**
   - Reusable connector contracts for internal modules and approved external APIs.
   - Webhook signature verification, timestamp/replay protection, request validation, rate limits and outbound destination allowlists/SSRF protections.
   - Credentials stored encrypted in the existing secret/configuration mechanism; never expose secret values in workflow exports or logs.
   - Connector capability metadata must distinguish executable integrations from catalogue-only entries.
5. **Approvals and business processes**
   - Human approval/rejection with actor, timestamp, reason and expiry.
   - Role/permission checks on every action; sensitive actions fail closed when approval is required but missing.
   - Assignment, escalation, notification and resumable paused executions.
6. **Operations and observability**
   - Searchable execution list, status, duration, attempts, errors, step logs and correlation/request IDs.
   - Queue depth, worker health, retry/dead-letter counts and workflow success/failure metrics.
   - Audit events for create/edit/publish/pause/run/replay/cancel and credential changes.
7. **Tenant governance**
   - Tenant-scoped definitions, runs, credentials, webhooks and logs enforced in database queries and authorization.
   - RBAC, per-tenant concurrency/rate quotas, payload retention controls and export permissions.
   - Cross-tenant access tests, secret-redaction tests and audit coverage are release blockers.
8. **Safe network operations**
   - Reuse the existing network command/adapter fabric and its capability checks.
   - Read-only monitoring workflows may run automatically within tenant policy.
   - Router writes, access suspension, destructive actions and financial mutations require explicit policy checks, appropriate permission, idempotency and approval where configured.
   - Verify actual device/provider outcome after state-changing actions; do not mark success merely because a request was sent.
9. **Offline/event resilience**
   - Accept duplicate or out-of-order events safely, record event identity, and support bounded retries and reconciliation.
   - Scheduled triggers must use timezone-aware schedules and prevent unintended duplicate firings.
10. **Import/export and developer ergonomics**
   - Versioned, schema-validated JSON definitions with secret references removed.
   - Dry-run validation, test fixtures, connector health checks and documented API contracts.
   - Import must reject unknown/unsafe node types and invalid tenant/credential references.

## Benchmark-to-product mapping

| Benchmark | Useful pattern to adopt | Jaslyn Net implementation boundary |
|---|---|---|
| n8n | Node graph, triggers, branching, credentials, execution logs | Native graph schema and approved connectors; respect n8n's license |
| Activepieces | Composable pieces and self-hosting orientation | Native connector contract; evaluate license per dependency |
| Make | Visual routing, iterators and data mapping | Bounded branches/loops and typed payloads |
| Zapier | Discoverable app triggers/actions and approachable setup | Connector catalogue with clear executable status |
| Pipedream | Webhooks, API steps and developer-oriented integrations | Typed HTTP connector, destination allowlist, no unrestricted code |
| Windmill | Jobs, scripts and operational tooling | Approved typed actions and existing domain services; no arbitrary shell |
| Node-RED | Event/IoT flows | Network telemetry and vendor events through adapter fabric |
| Power Automate | Human approvals and business process routing | Tenant-aware approvals and audit trail |
| Workato | Enterprise governance and integration operations | RBAC, quotas, connector ownership and policy checks |
| Temporal | Durable execution, retries, recovery and workflow history | Persisted run state, safe checkpoints, idempotent side effects |

## Initial domain workflow templates

- Payment received -> verify provider event -> reconcile idempotently -> update authoritative account state -> issue receipt/notification.
- Subscription/package expiry -> check current authoritative status -> notify -> apply configured access policy -> verify result.
- Router/site incident -> correlate monitoring event -> open incident -> notify assigned operator -> require approval for risky remediation -> verify device state.
- Supplier/purchase or stock event -> validate approved record -> route approval -> update through the existing business service -> audit.
- Customer onboarding -> validate tenant/site/package -> create required records through existing services -> provision only when authorized -> verify outcome.

Templates are not considered functional until each step calls a real service, the full path is tested, and failure/replay behaviour is verified.

## Minimum data model (implementation target)

- Workflow: tenant ID, name, description, status, active version ID, creator and timestamps.
- Workflow version: immutable version number, validated definition JSON, schema version, publisher and timestamp.
- Workflow execution: tenant ID, workflow/version ID, trigger identity/idempotency key, status, correlation ID, timestamps and safe error summary.
- Step execution: execution ID, step key, attempt, status, start/end, redacted input/output references and error classification.
- Approval: tenant ID, execution/step, assigned role/user, state, decision reason, expiry and audit metadata.
- Connector credential reference: tenant ID, connector key, encrypted secret reference and rotation metadata; secret values never appear in workflow JSON.

Use existing repository migration conventions and tenant-key constraints rather than introducing a parallel database or auth system.

## Security and reliability release gates

- Tenant A cannot list, read, run, replay, cancel or export Tenant B workflows, executions, approvals or credentials.
- Repeated webhook/event delivery creates one logical run and does not duplicate side effects.
- A worker restart resumes or safely retries recoverable work without losing execution history.
- Retry exhaustion reaches a visible dead-letter/failed state with a safe replay path.
- Workflow export and logs contain no raw secrets, authorization headers or sensitive payment data.
- Invalid graph, cycles without bounded iteration, oversized payloads and unsafe URLs are rejected.
- Permission-denied and approval-required operations fail closed.
- Network mutations verify actual device state through the existing adapter fabric.
- Unit, integration, migration, API authorization and UI tests pass; production deployment and provider/device tests are separately evidenced.

## Implemented in PR #83 (verification pending)

- Safe `TRANSFORM` step with 1–30 bounded field mappings, dotted-path validation and prototype-key rejection.
- `NOTIFY` action wired to the existing notification outbox, with deduplication and SMS category/marketing-consent enforcement.
- `HTTP_REQUEST` action for enabled tenant-owned REST integrations, using HTTPS, pinned public DNS resolution, response/time limits, tenant vault bearer credentials, and `Idempotency-Key` enforcement for write methods.
- Bounded conditional branch routing (`STOP` or skip 1–29 following nodes) with validation and visual editor controls.
- Visual editor controls for transformation mappings.
- Workflow definition version history and versioned definition updates.
- Execution step snapshots captured when a run is queued, so later edits do not silently replace steps for an already-queued run.
- Tenant-scoped definition export/import; imported workflows are disabled by default and webhook tokens are never exported.
- Execution detail endpoint and guarded cancellation/replay controls. Replay is restricted to failed runs at step zero to avoid knowingly repeating completed side effects.
- Tests added for safe/unsafe transformation paths. CI and PostgreSQL migration smoke verification are still pending because the observed Actions run ended in startup failure without jobs.

## Delivery sequence

1. Inspect and extend the existing auth, audit, database migration, queue and UI patterns.
2. Add schema/migrations and tenant-scoped workflow CRUD/versioning.
3. Add graph validation and the durable execution state machine.
4. Add safe triggers, idempotency, retries, logs and replay.
5. Add connector contracts and selected Jaslyn Net domain actions.
6. Add approvals, governance and visual editor.
7. Add benchmarked templates and run end-to-end tests.
8. Verify CI, migration on PostgreSQL, Render deploy, health checks and live integrations before declaring production-ready.

## Explicit non-goals

- No AI/LLM nodes or AI workflow features.
- No claim that all ten third-party products are being embedded.
- No arbitrary code/shell execution by default.
- No automatic router/payment mutation without existing domain authorization and safety policy.
- No production-ready claim based on documentation, mocks, a successful build alone or a health endpoint alone.
