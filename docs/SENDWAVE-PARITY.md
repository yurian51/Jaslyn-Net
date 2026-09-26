# JASLYN NET Sendwave-parity commerce layer

ISP adaptation of the previously agreed Sendwave-like experience. This is not a remittance or crypto product.

Implemented customer-commerce capabilities:
- wallet/balance ledger with idempotent entries
- saved beneficiaries/favorites
- saved/repeat purchases
- auto-renew schedule persistence
- referral and reward persistence
- customer transaction limits
- phone/email/identity/device verification state
- notification preferences
- support cases linked to purchases/payments
- wallet-backed automatic renewal scheduling with purchase-engine settlement
- one authenticated customer commerce overview

The canonical financial/access chain remains Payment -> Purchase -> Entitlement/Access Grant -> AAA/Network -> Session. The commerce layer orchestrates customer experience around those canonical modules and never treats an unverified external callback as settlement.
