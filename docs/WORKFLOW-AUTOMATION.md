# Jaslyn Net deterministic workflow automation

The workflow engine adds tenant-scoped workflow definitions, durable execution records, interval schedules, domain-event triggers, authenticated inbound webhooks, approval gates, delayed steps, webhook event emission, execution history and integration metadata. It deliberately excludes AI features.

## Supported trigger types

- `MANUAL`: authorised operator queues an execution.
- `EVENT`: reacts to a matching processed `communication_domain_events.event_type`.
- `SCHEDULE`: interval in seconds, from 60 to 86,400.
- `WEBHOOK`: receives a JSON object at `POST /api/v1/automation/workflows/:id/webhook`; send the one-time token in `x-jaslyn-webhook-token`.

Webhook tokens are generated with high entropy, shown once at workflow creation, and stored as SHA-256 hashes. Rotate by creating a replacement webhook workflow; never put the token in a URL or logs.

## Supported deterministic steps

```json
[
  { "type": "CONDITION", "path": "payment.status", "op": "eq", "value": "CONFIRMED" },
  { "type": "APPROVAL", "title": "Approve access change", "details": { "risk": "medium" } },
  { "type": "EMIT_WEBHOOK", "eventType": "payment.workflow.completed", "payload": { "source": "jaslyn-net" } },
  { "type": "WAIT", "seconds": 60 },
  { "type": "LOG", "message": "Workflow reviewed" }
]
```

Conditions support `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, and `exists`. Prototype traversal is rejected. Arbitrary code/shell execution and unbounded outbound HTTP are not supported.

## Security and operational boundaries

- API access is authenticated, tenant-scoped, role-gated and permission-gated.
- Workflow definitions, runs, approvals and integration metadata are audited.
- Runs use tenant/workflow/idempotency keys, bounded retries and queue claiming with PostgreSQL row locks.
- Approval decisions are tenant-scoped and only OWNER/ADMIN can approve or reject.
- Integrations are disabled by default. Generic HTTP URLs must use HTTPS and cannot embed credentials; secret references must resolve to a secret in the same tenant.
- `EMIT_WEBHOOK` enqueues delivery only to tenant webhook endpoints already subscribed to the event type. A queued delivery is not proof of downstream delivery.
- No payment settlement, SMS sending, router mutation or access-control action is executed by these generic workflow steps. Use existing domain services/adapters and add explicit approval-gated actions with provider-level verification before enabling those actions in production.
- This feature is not production-approved until migration 077, API/web builds, typecheck, tests, runtime smoke tests and Render deployment are verified.

## API endpoints

- `GET/POST /api/v1/automation/workflows`
- `PATCH /api/v1/automation/workflows/:id/enabled`
- `POST /api/v1/automation/workflows/:id/run`
- `POST /api/v1/automation/workflows/:id/webhook`
- `GET /api/v1/automation/workflows/runs`
- `GET /api/v1/automation/workflows/approvals`
- `POST /api/v1/automation/workflows/approvals/:id/decision`
- `GET/POST /api/v1/automation/workflows/integrations`

The console is at `/dashboard/automation`.
