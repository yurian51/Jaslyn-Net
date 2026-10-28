# Automation Fabric

`EVENT -> RULE -> POLICY -> ACTION -> RESULT -> AUDIT`, built on PostgreSQL (the repo has no BullMQ/Redis
consumers; every queue here is Postgres-backed with `FOR UPDATE SKIP LOCKED`, so the fabric follows suit and
gets transactional idempotency for free).

## Stages
| Stage | Where | Notes |
|---|---|---|
| EVENT | AFTER triggers on authoritative tables -> `communication_domain_events` outbox | Same transaction as the state change; keys namespaced `auto:` |
| RULE | `AutomationFanoutService` | scope -> conditions -> cooldown (atomic upsert) -> admission; one txn per event |
| POLICY | `AutomationPolicyService` | Re-run immediately before **every** execution |
| ACTION | `AutomationActionExecutor` | Idempotent per job id |
| RESULT | `AutomationJobRunner` | Job + attempt + audit row commit atomically; fenced on (worker, attempt) |
| AUDIT | `AuditService.record(..., executor)` | Same transaction as the result |

## Events (12)
device.offline, device.recovered (routers.status) · subscriber.auth_failed (radius REJECT, max 1/NAS/user/min) ·
session.started (sessions insert) · session.ended (existing SESSION.ENDED / RADIUS stop) · bandwidth.threshold
(fairness mode escalation into FAIRNESS_ACTIVE/AGGRESSIVE) · payment.completed/failed (payments.status) ·
entitlement.expired (access_grants.status) · incident.created/resolved (incidents) · provider.degraded
(wan_connections.health_state). `GET /automation/catalog` lists fields.

## Guarantees
* **Tenant scope**: every query is tenant-filtered; rules may also narrow to locations/routers (fails closed).
* **Idempotency**: `UNIQUE(tenant_id, idempotency_key)` = `rule:event:actionIndex`; executors key side effects on job id.
* **Retries**: 1-5 attempts (DB `CHECK attempts <= max_attempts`), exponential backoff +/-20% jitter, 15s..15m.
* **No infinite loops**: attempts increment at claim (a crash still costs one); expired leases never stay RUNNING;
  fan-out receipts cap at 5; DLQ requeue capped at 3 (DB `CHECK`); automation cannot emit events.
* **Timeout** per rule (1-120s); timed-out attempts are retried within budget.
* **Concurrency**: per tenant, per rule (`max_concurrency`), per target (destructive), enforced with advisory locks.
* **Dead letters**: `RETRIES_EXHAUSTED`, `NON_RETRYABLE`, `LEASE_EXPIRED_EXHAUSTED`, `FANOUT_EXHAUSTED`.

## Destructive actions
`TERMINATE_SESSION` executes through `CommandFabricService.executeDestructive`, the same path as the manual
`terminate session` command, which re-checks `CommandAuthorizationService` itself. Requirements: platform flag
`AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED=true` (default off); run-as user active with operator role and permissions;
either per-job operator approval (`POST /automation/jobs/:id/approve`) or `autonomy=AUTO` with a standing approval
bound to the rule's definition hash (any edit voids it); cooldown >= 60s; hourly tenant budget.
A job SUCCEEDED means the command was **queued** to the network command fabric, not that the router confirmed it.

## Operations
`GET /automation/ops/overview` (health OK/DEGRADED/STALLED), `/jobs`, `/jobs/:id` (attempts + audit),
`/dead-letters`, `POST /jobs/:id/{cancel,approve,reject}`, `POST /dead-letters/:id/{requeue,dismiss}`.
New permissions: `automation.operate`, `automation.approve`.

## Testing
Unit: `pnpm --filter @jaslyn-net/api test automation commands`. Integration (real PostgreSQL, all migrations applied):
`AUTOMATION_TEST_DATABASE_URL=postgresql://... pnpm --filter @jaslyn-net/api test automation.fabric` (skipped if unset).

## Known limitations
* No UI yet for jobs/dead letters (API only).
* `bandwidth.threshold` is derived from fairness-mode transitions recorded when enforcement is applied, not raw counters.
* Only `TERMINATE_SESSION` is destructive-and-executable, because it is the only destructive manual command with a verified path.
