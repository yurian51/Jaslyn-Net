# Vendor Adapter and Firmware Lifecycle Implementation Contract

**Status:** Engineering contract / implementation backlog. This document is not evidence that adapters or firmware updates are already operational.

## Goals

Bring every registered vendor adapter to an explicit, testable capability level and build a safe end-to-end firmware inventory and update workflow. Preserve existing behavior and never label catalogue metadata as an executable integration.

## 1. Adapter inventory and truth states

Every registered adapter must be listed with vendor, adapter identifier, supported models/protocols, implemented capabilities, test evidence, and last verification time. Use only these states:

- `NATIVE_TESTED`: executable implementation and repeatable automated tests; integration evidence is recorded.
- `BETA_LIMITED`: executable but only a documented subset is supported or only non-production verification exists.
- `CATALOGUE_ONLY`: discovery/metadata entry only; no operational capability claim.
- `UNAVAILABLE`: cannot execute in the current deployment.
- `UNVERIFIED`: evidence is missing, stale, or inconclusive.

Missing firmware version, unsupported model, missing vendor source, stale metadata, or a failed device query must never be represented as "up to date".

## 2. Common adapter contract

Each adapter should implement the shared interface where applicable, while preserving vendor-specific capabilities:

- Identify vendor, product/model, hardware revision, serial/device identifier, OS/firmware version and observation time.
- Probe connectivity and report a normalized health result with raw evidence metadata.
- Read supported metrics and interface status without claiming unsupported fields.
- Read configuration and perform backup/diff/restore only when the device supports the operation.
- Execute commands through typed, allowlisted operations; enforce timeout, bounded retry with backoff, cancellation where possible, and normalized errors.
- Declare capabilities explicitly. Unsupported operations must return a typed unsupported result, never a simulated success or an implicit command translated from another vendor.
- Apply tenant authorization and secret isolation at the service boundary; redact credentials and sensitive configuration from logs.
- For mutations, require policy evaluation, preview, approval according to risk, idempotency, audit record, and post-operation verification.

Shared contract tests must run against every adapter. Vendor-specific tests must cover the actual supported operations. Test disconnected devices, invalid credentials, timeouts, throttling, malformed/partial responses, retries, tenant boundary violations and mutation verification.

## 3. Firmware inventory data

Track per device observation and per vendor/model release metadata:

- Device tenant/site/router ID and adapter ID.
- Vendor, exact model, hardware revision and bootloader constraints when relevant.
- Installed firmware version/build, observed-at timestamp and evidence source.
- Latest vendor-published release compatible with the exact model/revision, release date, release notes and authoritative source URL.
- Security advisories/CVEs, known issues, prerequisites and incompatibilities when vendor data supplies them.
- Artifact checksum/signature and verification result when available.
- Last metadata check, freshness/expiry policy, and explicit status/reason.

Firmware status must distinguish `UNKNOWN`, `CURRENT`, `UPDATE_AVAILABLE`, `BLOCKED_INCOMPATIBLE`, `STALE`, `CHECK_FAILED`, `UPDATE_PENDING`, `UPDATING`, `VERIFYING`, `SUCCEEDED`, `FAILED`, and `RECOVERY_REQUIRED`. A vendor's latest version is not automatically the recommended version: staged releases, hardware constraints and security advisories must be considered.

Use authoritative vendor metadata or verified vendor APIs. Do not scrape arbitrary links as trusted firmware sources, invent versions/download URLs, or mark an update safe solely because version strings compare as newer.

## 4. Safe update workflow

1. Refresh and record device identity, installed version and current health.
2. Resolve exact model/hardware compatibility and trusted release metadata.
3. Check prerequisites, storage/power/reachability, maintenance window, backup support, known issues and recovery plan.
4. Generate a preview of the exact target version, source, risks, affected devices and expected outage.
5. Require explicit authorized approval; high-risk or bulk operations need stricter policy. Default to one device/canary at a time.
6. Verify the artifact checksum/signature where the vendor supplies it; never bypass certificate checks.
7. Execute only through that vendor's supported upgrade mechanism, with bounded timeouts and persisted job state.
8. Reconnect and independently read firmware version and health from the device. Command acceptance alone is not success.
9. Record outcome, evidence, duration, operator/approver and audit event; alert on failure or stale verification.
10. Offer rollback/recovery only when the exact device/vendor supports it and a tested recovery path exists. Otherwise clearly state that downgrade/recovery is unsupported and require an explicit maintenance plan before proceeding.

Never perform fleet-wide automatic firmware installation by default. Do not run firmware operations against production devices without explicit approval and verified compatibility.

## 5. End-to-end implementation requirements

The finished implementation must connect:

- Persistent schema/migrations for inventory, vendor release metadata, update plans/jobs, approvals, execution attempts and audit evidence.
- Tenant-scoped API endpoints with RBAC, validation, pagination and idempotent job creation.
- Background worker with bounded concurrency, retry/backoff, lease/duplicate protection, cancellation and durable failure state.
- Web UI for adapter capability inventory, device firmware state, evidence freshness, release notes, update preview/approval, job progress, verification and audit history.
- Notifications/incident integration for failed upgrades and devices that fail to return.
- Metrics and structured redacted logs.
- Unit, contract, integration, migration and UI/API end-to-end tests.
- A vendor hardware/lab validation record before promoting an adapter to `NATIVE_TESTED`.

## 6. Release gates

- Enumerate all adapters from the actual runtime registry; do not rely on a manually curated list alone.
- Every capability shown in the UI must map to an executable API/service path or be explicitly marked unavailable/catalogue-only.
- Run workspace lint, typecheck, tests and builds, plus disposable-PostgreSQL migration and rollback checks.
- Verify tenant isolation and approval enforcement for reads and mutations.
- Exercise firmware upgrade and recovery on representative non-production hardware for each supported vendor/model family.
- Record exact commit, CI run, test counts, device/model/firmware, source evidence and result.
- If CI runners or hardware are unavailable, report the gate as BLOCKED/UNVERIFIED; do not imply success.

## 7. Current known repository caveat

The existing production-readiness and enterprise capability documents report router retry/timeout/credential isolation, live non-production hardware verification, model-specific firmware baselines and verified remediation as outstanding gates. GitHub Actions runner startup failures have also prevented reliable CI evidence. Re-check the current repository and live CI before claiming these conditions still apply or have been resolved.

## Delivery sequence

1. Inventory existing adapter registry and tests; map real code paths and remove duplicate/catalogue-only ambiguity.
2. Harden the shared contract and add tests without breaking existing adapters.
3. Implement firmware inventory and authoritative metadata refresh, with stale/unknown handling.
4. Implement approval-gated, durable update jobs and independent post-upgrade verification.
5. Wire UI, audit, notifications, monitoring and deployment controls end-to-end.
6. Run CI and hardware lab gates; publish a capability-by-capability evidence matrix.

## Implementation progress on this branch

- The runtime adapter registry now declares functional scope (ENFORCEMENT_AND_TELEMETRY, TELEMETRY_ONLY, or GENERIC_TELEMETRY) and explicitly flags every entry as requiring live-device validation. This is not a claim that all adapters are fully operational.
- Added tenant-scoped firmware inventory persistence in apps/api/migrations/202610140001_network_firmware_inventory.sql.
- Added GET /routers/:id/firmware and POST /routers/:id/firmware/observation. The observation route is restricted to owner/admin/agent roles, checks router ownership by tenant, validates inputs, and writes an audit event.
- Unverified latest-release metadata deliberately remains UNKNOWN; a caller-supplied URL/version cannot mark firmware current or authorize an update.
- Added unit coverage for scope metadata, unknown firmware status, invalid release URLs, tenant isolation, and empty inventory.
- First vendor in sequence: MikroTik RouterOS v7. Added a native REST executor for live board/version/update-channel inspection, official-channel installation, configuration export backup, HTTPS/redirect protections, production-channel gating, exact target-version checks, and idempotent post-reboot verification state.
- Added `GET /routers/:id/firmware/live`, `POST /routers/:id/firmware/upgrades/:jobId/backup`, and `POST /routers/:id/firmware/upgrades/:jobId/verify`. Backup exports are encrypted with the configured AES-GCM network-credential key before persistence; approval checks the stored backup receipt, maintenance window, and live version again before sending the install command.
- MikroTik install flow is not hardware-validated yet. Post-reboot verification is currently an explicit API action, not an autonomous background worker.

## Remaining release blockers

- MikroTik now has a vendor-specific RouterOS REST executor, but it has not been tested against a physical router and is not yet `NATIVE_TESTED`. All other vendors still lack enabled, individually verified firmware executors. Model-specific release constraints and recovery behavior must be validated per device family.
- CI run results on this branch currently fail before useful job-step logs are available; inspect GitHub Actions after runner availability returns.
- No live device, vendor credentials, hardware/model inventory, or maintenance-window approval was supplied, so firmware compatibility and upgrade/recovery cannot be verified against physical devices.
- Do not promote adapters to fully verified or perform production firmware upgrades until these gates pass.
- OpenWrt client polling now destroys the authenticated ubus session in a `finally` path, including when telemetry polling fails; its test checks session cleanup.
