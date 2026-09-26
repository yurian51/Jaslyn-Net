# Customer Commerce Reliability Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox syntax for tracking.

**Goal:** Make Jaslyn Net customer-commerce wallet renewals atomic, concurrency-safe, idempotent, and correctly connected to canonical purchase/payment/access lifecycle.

**Architecture:** Keep PurchasesService authoritative for payment, purchase, and access_grants. CustomerCommerceService orchestrates renewal execution using database claims and immutable wallet ledger entries. Failed post-debit settlement is compensated with an idempotent wallet credit.

**Tech Stack:** NestJS, TypeScript, PostgreSQL, Jest, Next.js.

## Global Constraints

- No duplicate purchase, payment, entitlement, AAA, or network state.
- No fake/mock production data.
- Wallet ledger mutations are immutable and idempotent.
- Auto-renewal must be safe across multiple application instances.
- Successful access comes only from the canonical purchase/payment/access lifecycle.
- Post-debit settlement failure must produce an auditable compensating credit.
- TZS remains the initial wallet currency for this flow.
- Existing repository structure is preserved unless required by the reliability changes.
- Completion requires source-level and available CI verification; unavailable external runtime verification must be reported rather than assumed.

---

### Task 1: Harden renewal persistence and claiming

**Files:**
- Modify: `apps/api/migrations/051_customer_commerce_parity.sql`
- Modify: `apps/api/src/customer-commerce/customer-commerce.service.ts`
- Test: existing API Jest structure, plus focused customer-commerce tests if present

**Interfaces:**
- Consumes: `commerce_renewal_schedules`, `commerce_saved_purchases`, `customer_wallets`
- Produces: claimed renewal executions with stable execution identifiers

- [ ] **Step 1: Add focused failing tests**
  - Verify two concurrent workers cannot claim the same due schedule.
  - Verify stale processing claims can be recovered.
  - Verify a claimed execution has a unique stable idempotency identity.

- [ ] **Step 2: Verify the relevant failure**
  - Run the API focused Jest command.
  - Expected: tests fail against the current unclaimed interval-based implementation.

- [ ] **Step 3: Implement minimum behavior**
  - Add processing/claim metadata to renewal schedules.
  - Replace the pre-transaction `FOR UPDATE` query with a transaction-scoped claim using row locks and `SKIP LOCKED`.
  - Reclaim stale processing rows after a bounded lease interval.
  - Replace calendar-date idempotency with an execution identifier.
  - Keep the scheduler trigger lightweight and make DB claiming authoritative.

- [ ] **Step 4: Verify focused pass**
  - Run the focused Jest command.
  - Expected: concurrency and claim tests pass.

- [ ] **Step 5: Run affected integration check**
  - Run `pnpm --filter @jaslyn-net/api typecheck` or the repository-equivalent API typecheck command.
  - Expected: TypeScript succeeds.

- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `fix: make renewal claiming concurrency safe`

### Task 2: Make wallet debit and settlement recovery-safe

**Files:**
- Modify: `apps/api/src/customer-commerce/customer-commerce.service.ts`
- Modify: `apps/api/src/purchases/purchases.service.ts` only if a small canonical idempotency seam is required
- Test: focused wallet/renewal tests

**Interfaces:**
- Consumes: claimed renewal execution, `PurchasesService.create`, `PurchasesService.confirmPayment`
- Produces: exactly-once wallet debit or idempotent compensating credit tied to execution

- [ ] **Step 1: Add failing tests**
  - Insufficient balance causes no debit.
  - Concurrent wallet updates cannot overdraw the wallet.
  - Repeated execution cannot double-debit.
  - Payment confirmation failure after debit creates exactly one compensation.
  - Retrying compensation does not double-credit.

- [ ] **Step 2: Verify the relevant failure**
  - Run focused Jest tests.
  - Expected: current implementation exposes the post-debit loss and duplicate execution gaps.

- [ ] **Step 3: Implement minimum behavior**
  - Create purchase using an execution-derived correlation/idempotency identity.
  - Lock wallet only inside a real transaction.
  - Insert debit ledger entry with unique execution key.
  - Confirm through the canonical manual payment path.
  - If confirmation fails after debit, create an idempotent `REFUND` ledger entry referencing the purchase/execution and restore the wallet.
  - Persist failure state and retry count without pretending access was granted.

- [ ] **Step 4: Verify focused pass**
  - Run focused Jest tests.
  - Expected: all wallet/settlement recovery assertions pass.

- [ ] **Step 5: Run affected integration check**
  - Run API typecheck and API tests.
  - Expected: both pass.

- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `fix: make wallet renewal settlement recoverable`

### Task 3: Complete subscription/access lifecycle and customer commerce state

**Files:**
- Modify: `apps/api/src/customer-commerce/customer-commerce.service.ts`
- Modify: `apps/api/src/customer-commerce/customer-commerce.controller.ts`
- Modify: `apps/web/app/customer-commerce/page.tsx`
- Modify: `apps/web/app/console-chrome.tsx` only if navigation/state requires it
- Test: API commerce tests and web typecheck

**Interfaces:**
- Consumes: canonical `wifi_plan_purchases`, `payments`, `access_grants`
- Produces: truthful renewal/access status in API and UI

- [ ] **Step 1: Add failing tests**
  - Successful renewal advances schedule and exposes active access.
  - Expired/failed renewal does not report active access.
  - Grace/failure state is represented from canonical records.
  - Customer overview exposes next renewal, failure state, and access status without fabricated values.

- [ ] **Step 2: Verify the relevant failure**
  - Run focused API tests.
  - Expected: current overview/renewal response lacks the required lifecycle state.

- [ ] **Step 3: Implement minimum behavior**
  - Query canonical purchase/payment/access records.
  - Expose renewal execution status and access status.
  - Avoid parallel entitlement tables.
  - Update the customer-commerce UI to present wallet readiness, next renewal, failures, purchase/payment status, and access status.

- [ ] **Step 4: Verify focused pass**
  - Run API tests and web typecheck.
  - Expected: lifecycle assertions and TypeScript pass.

- [ ] **Step 5: Run affected integration check**
  - Run web build/typecheck and API build/test.
  - Expected: successful builds and tests.

- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat: expose truthful commerce access lifecycle`

### Task 4: Verification, migration integrity, and CI evidence

**Files:**
- Modify only files proven necessary by verification failures.
- Test: repository CI and migration checks.

**Interfaces:**
- Consumes: completed customer-commerce reliability implementation.
- Produces: verified branch state with no migration collision and no known compile/test failures.

- [ ] **Step 1: Run focused and full verification**
  - API: `pnpm --filter @jaslyn-net/api test`, `pnpm --filter @jaslyn-net/api typecheck`, `pnpm --filter @jaslyn-net/api build`.
  - Web: `pnpm --filter @jaslyn-net/web typecheck`, `pnpm --filter @jaslyn-net/web build`.
  - Run available repository UI/asset verification where applicable.

- [ ] **Step 2: Verify migration ordering**
  - Confirm migration 051 is unique and follows the repository sequence.
  - Expected: no duplicate migration number.

- [ ] **Step 3: Verify GitHub Actions**
  - Fetch workflow runs for the resulting commit.
  - Expected: required CI checks pass; if GitHub infrastructure prevents execution, report the exact unavailable state.

- [ ] **Step 4: Commit only verified fixes**
  - Commit message: `chore: verify customer commerce reliability`
