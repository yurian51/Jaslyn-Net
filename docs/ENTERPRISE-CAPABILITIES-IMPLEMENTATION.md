# Enterprise Operations Capabilities — Implementation Status

**Branch:** `work/security-ops-capabilities`  
**Scope:** Security, field operations, incidents, change intelligence, policy/compliance, synthetic monitoring and revenue assurance  
**Status:** Implementation staged for review; production verification is blocked by GitHub Actions runner startup failures.  
**AI:** No new AI features are introduced.

## Feature map

| Capability | Implementation | Acceptance/verification status |
|---|---|---|
| Session list/revoke | `apps/api/src/sessions`, `apps/web/app/audit` | Code and unit tests staged; runtime not verified |
| Credential key rotation | `apps/api/src/routers/secure-network-credentials.ts` and router credential rotation service | Keyring-dependent; runtime not verified |
| Tenant least-privilege permissions | `apps/api/src/auth/permissions.guard.ts`, `apps/api/src/access-control`, `apps/web/app/access-control` | Default role map + tenant role/user overrides; owner-only grant management; tests staged |
| Tamper-evident audit and security alerts | `apps/api/migrations/062_session_audit_security_integrity.sql`, `apps/api/src/audit` | Database append-only/hash-chain design staged; database verification not run |
| Offline field operations | `apps/api/src/isp-operations`, `apps/web/app/field-operations` | IndexedDB queue, server receipts, checklist sync, photo storage and UUID photo idempotency staged |
| QR asset labels/scanning | `apps/web/app/network/page.tsx`, `apps/web/app/field-operations/page.tsx` | PNG generation/print and camera scan staged; camera requires HTTPS or localhost and browser permission |
| Incident lifecycle, ownership, timeline, SLA report | `apps/api/src/incidents`, `apps/web/app/incidents`, `apps/web/app/incident-reports` | API/UI and automated timeline/escalation code staged; runtime not verified |
| Maintenance windows and public status page | `apps/api/src/incidents`, `apps/web/app/incident-operations`, `apps/web/app/status/[slug]` | Scheduled lifecycle, scoped suppression, published public status page staged |
| Network change intelligence | `apps/api/migrations/065_network_change_intelligence.sql`, router service/controller and `apps/web/app/network-change-intelligence` | Captures router configuration and command transitions; correlation is temporal, not causal |
| Declarative network policies | `apps/api/src/security-posture`, `apps/web/app/security-posture` | Stored-configuration drift evaluation staged; unsupported keys are UNVERIFIED |
| Continuous compliance | `apps/api/src/security-posture/compliance-scan.worker.ts` | Scheduled every six hours; currently checks missing encrypted management credentials and configured HTTP controller endpoints; missing firmware versions count as unverified |
| Synthetic monitoring | `apps/api/src/synthetic-monitoring`, `apps/web/app/synthetic-monitoring` | Scheduled DNS/HTTPS checks, history, SSRF-oriented target restrictions, and incidents after two consecutive failures staged |
| Revenue assurance | `apps/api/src/revenue-assurance`, `apps/web/app/revenue-assurance` | Scheduled reconciliation of purchases, payments, access grants and ledger postings staged; no silent auto-correction |
| Fine-grained permission overrides | `apps/api/migrations/070_fine_grained_permissions.sql`, access-control API/UI | User override > tenant role override > application default; route role guards remain an additional ceiling |

## Migrations

New migration sequence on this branch:

- `062_session_audit_security_integrity.sql`
- `063_field_operations_offline_sync.sql`
- `064_incident_timeline_maintenance_status.sql`
- `065_network_change_intelligence.sql`
- `066_network_policy_compliance.sql`
- `067_synthetic_monitoring.sql`
- `068_revenue_assurance_reconciliation.sql`
- `069_tenant_secrets_vault.sql`
- `070_fine_grained_permissions.sql`

Apply migrations in order, using the repository's supported migration runner, against a disposable PostgreSQL database first. Confirm rollback/restore behavior before any production migration. The CI workflow checks for the files and now defines a disposable PostgreSQL migration-smoke job that applies the full migration set in lexical order. That job has not run because GitHub Actions is failing before jobs are created.

## Required deployment configuration

### Secret vault

Set these in the deployment secret manager, not Git:
- `JASLYN_SECRET_VAULT_KEYRING`: JSON object mapping key IDs to 64-character hexadecimal keys (32 bytes each).
- `JASLYN_SECRET_VAULT_ACTIVE_KEY_ID`: the key ID used for new ciphertext.
- Optional legacy `JASLYN_SECRET_VAULT_KEY`: a 64-character hexadecimal key mapped to ID `legacy`.

Generate keys with a secure random generator such as `openssl rand -hex 32`. Keep old decryption keys available until rotation is verified. The vault UI never returns plaintext. The generic vault retrieval method exists for internal integrations, but existing SMS/payment/router adapters are not automatically migrated to use vault references by this change; that wiring must be done and tested per provider before calling the vault a universal credential source.

### Synthetic checks

- `SYNTHETIC_ALLOWED_PRIVATE_HOSTS` is an optional comma-separated list of exact, reviewed hostnames allowed to resolve to private addresses in self-hosted environments.
- By default the monitor rejects private/reserved IP resolutions, requires HTTPS for HTTP/portal checks, does not follow redirects, rejects URL credentials/query/fragment, and uses bounded timeouts.
- Checks run from the Jaslyn-Net control-plane host. They do not prove reachability from every branch/customer site. Site-local probes and distributed vantage points remain a follow-on capability.

### QR scanning

Browser camera access requires HTTPS (or localhost) and explicit camera permission. The QR payload contains only `JASLYN-NET:ROUTER:<UUID>`; it contains no credentials. The scanner resolves the UUID through the authenticated tenant-scoped router API.

## Explicit limitations — do not describe as complete

1. **Live device policy enforcement is not enabled by the new desired-state evaluator.** It compares selected stored Jaslyn-Net router fields only. It does not claim live SSID/firewall/device configuration, and does not automatically mutate devices.
2. **Compliance coverage is an initial rule set, not a full standards certification engine.** Firmware baselines, model-specific hardening rules, exception expiry, and verified remediation still need explicit policy sources and device capability tests.
3. **Synthetic monitoring currently runs centrally.** Site-local probes, multi-region comparisons, and a configurable failure-to-incident threshold beyond two consecutive failures are not implemented.
4. **Revenue reconciliation currently covers purchases, payments, access grants and ledger entries.** No canonical invoice table was found in the inspected migration set; invoice-total reconciliation must be added only after the authoritative invoice domain is identified. Provider settlement-file reconciliation and automatic correction are also not included.
5. **The secrets vault is not yet the source of truth for every existing integration.** Each adapter must be migrated to retrieve a tenant-scoped secret reference and pass provider contract tests.
6. **Tests and database migrations have not been executed in a runtime in this turn.** GitHub Actions runs for the branch terminate with `startup_failure` and zero jobs, so no passing CI/build/test claim is made.
7. **No production release or live external operation has been performed.** SMS delivery, provider API calls, router mutation, backup/restore, load, failover, and security verification require a controlled environment.

## Evidence required to close the work

- GitHub Actions creates jobs and completes API lint/typecheck/tests/build plus web typecheck/tests/build.
- Apply migrations 062–070 to a disposable PostgreSQL instance and execute migration/rollback tests.
- Run security tests for tenant isolation, permission overrides, secret rotation/tamper detection, photo replay, monitor SSRF protection, incident maintenance suppression, and financial reconciliation edge cases.
- Exercise QR generation/scanning on a supported mobile browser.
- Verify DNS/HTTPS monitor results and incident open/resolve behavior.
- Verify both cloud/SaaS and self-hosted fresh install, upgrade, backup/restore and rollback.
- Record the exact commit, CI run, database version, test counts, and any external device/provider evidence in the PR before merge.
