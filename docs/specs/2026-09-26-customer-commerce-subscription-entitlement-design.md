# Jaslyn Net Customer Commerce, Subscription & Entitlement Reliability Design

**Date:** 2026-09-26  
**Scope:** Sendwave-inspired customer commerce parity adapted for ISP/connectivity use cases.

## 1. Goal

Harden the existing customer-commerce layer so wallet-funded purchases, auto-renewals, purchase/payment state, entitlements, AAA/network access, notifications, support, and audit state remain consistent under retries, concurrency, payment failure, and horizontal scaling.

The design does not introduce remittance, crypto, or money-transfer functionality. Wallet funds are customer/accounting balances used for connectivity purchases and refunds/adjustments.

## 2. Architecture

The existing canonical engines remain authoritative:

- Customer Commerce: customer-facing orchestration, saved targets, wallet presentation, rewards, limits, verification, preferences, support.
- Purchases/Payments: canonical purchase and payment lifecycle.
- Entitlement/Subscription: canonical access entitlement and lifecycle where already present.
- RADIUS/AAA: canonical authentication, authorization, accounting, and session state.
- Network Command/Adapter Fabric: canonical router/network operations.
- Notifications/Audit: existing platform event and audit facilities.

Customer Commerce must not duplicate canonical payment, purchase, entitlement, AAA, or network records.

## 3. Auto-Renewal Execution

Auto-renewals use a database-backed claim/lease model rather than an uncoordinated per-process timer.

Flow:

1. Find due ACTIVE schedules.
2. Atomically claim a bounded batch using row locking/claim state.
3. Generate a unique execution identifier for the claimed run.
4. Validate customer, saved purchase, package, wallet currency, balance, and limits.
5. Create/reuse the canonical purchase with an idempotent execution key.
6. Debit wallet exactly once.
7. Confirm payment through the canonical purchase/payment engine.
8. Let the canonical purchase lifecycle establish/renew entitlement.
9. Advance the renewal schedule only after successful settlement.
10. Emit notification/audit events.
11. On recoverable failure, release/retry the claim with bounded attempts.
12. On post-debit settlement failure, perform an idempotent compensating wallet credit and preserve an auditable failure state.

No calendar-date-only idempotency key will be used for an execution. Each claimed execution gets its own stable idempotency identity.

## 4. Wallet Consistency

Wallet ledger entries are immutable financial records.

Rules:

- Every mutation has an idempotency key.
- Debit and credit signs are deterministic.
- Balance changes are performed under row locking.
- Duplicate requests return the original ledger result.
- Failed downstream settlement after a committed debit requires an idempotent compensating credit.
- Wallet balance must never be silently altered to recover from an application exception.
- Every compensation links back to the originating execution/purchase.

Initial supported customer currency remains TZS unless the existing canonical payment/package model already supports another currency for the same flow.

## 5. Purchase, Payment & Entitlement State

The purchase engine remains the source of truth for purchase/payment status.

The commerce layer must not independently mark a purchase as active merely because wallet debit succeeded.

Successful sequence:

Wallet readiness -> canonical purchase -> wallet debit -> canonical payment confirmation -> entitlement/subscription activation or renewal -> AAA/network enforcement.

Failure sequence:

Any failed stage is persisted with an auditable execution state. If wallet debit has already committed and downstream payment confirmation cannot complete, a compensating wallet credit is created before the renewal execution is considered failed.

Entitlement activation/suspension must use existing canonical entitlement/subscription mechanisms. New duplicate entitlement tables are prohibited unless repository inspection proves none exists.

## 6. Subscription Lifecycle & Access

Renewal processing must respect:

- active/expired/cancelled states;
- package validity;
- grace periods where supported;
- suspension after entitlement expiry;
- restoration after successful renewal;
- customer/device/session limits already defined by the platform;
- RADIUS authorization/accounting state.

The implementation will integrate with existing lifecycle tables/services rather than create parallel access state.

## 7. Concurrency & Recovery

The scheduler must be safe across multiple API instances.

Claiming a schedule must prevent two workers from executing the same renewal simultaneously. Stale claims must be recoverable after worker/process failure.

Retries must be bounded and idempotent. A failed retry must not create a second wallet debit, duplicate purchase, duplicate entitlement, or duplicate notification.

## 8. Notifications, Support & Audit

Renewal success, failure, low balance, verification/limit blocks, refunds/compensation, and support-relevant failures should use existing notification/event infrastructure where available.

Every material commerce execution should retain:

- execution identifier;
- customer;
- renewal schedule;
- purchase/payment reference;
- wallet ledger reference;
- outcome;
- failure code/message;
- timestamps;
- retry count.

Support cases remain linked to customer, purchase, and payment references.

## 9. API & UI

Customer commerce APIs expose reliable lifecycle state rather than optimistic UI state.

The UI should show:

- wallet balance/readiness;
- next renewal;
- renewal status;
- retry/failure state;
- saved purchase;
- purchase/payment status;
- entitlement/access status;
- verification and transaction limits;
- relevant notifications/support state.

No fake balances, fake purchases, fake network status, or placeholder production data may be introduced.

## 10. Testing & Verification

Required verification covers:

- wallet debit idempotency;
- duplicate renewal execution;
- concurrent renewal workers;
- insufficient balance;
- payment confirmation failure after wallet debit;
- compensating wallet credit;
- retry/recovery;
- successful entitlement renewal;
- failed/expired subscription behavior;
- notification/event idempotency;
- migration ordering;
- API type checking;
- web build/type checking;
- existing repository test suites;
- GitHub Actions/CI results where available.

Completion is a verified engineering state, not a claim based on source inspection alone.
