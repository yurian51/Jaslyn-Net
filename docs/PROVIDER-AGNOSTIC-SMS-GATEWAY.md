# Provider-agnostic SMS Gateway

## Design

JASLYN NET uses tenant-scoped provider configuration with a shared outbox and campaign API. Supported options are Beem's native request format and a constrained generic REST adapter with HTTPS POST, configurable authentication (`none`, bearer token, API-key header, or Basic), JSON field mapping, and response message-ID/success mapping.

## Migration and environment

Apply `apps/api/migrations/062_sms_provider_configs.sql` after migrations 060 and 061. Set `SMS_ENABLED=false`, `JASLYN_SMS_CREDENTIAL_ENCRYPTION_KEY` to a fresh 32-byte random key encoded as 64 hex characters, and `SMS_CUSTOM_ALLOWED_HOSTS` to comma-separated exact approved hostnames in the API secret manager. Never commit secrets. Back up the encryption key securely; losing it makes saved credentials unreadable.

## Operator workflow

1. Apply migration and configure the encryption key.
2. Add the provider's exact hostname to the deployment allowlist and deploy that environment change.
3. In Notifications, configure provider, HTTPS endpoint, Sender ID, authentication, credentials and request/response mapping.
4. Save disabled, verify provider contract and Sender ID approval, then enable the tenant's provider.
5. Keep the global `SMS_ENABLED=false` release switch until a controlled test is approved. Enable only for the planned test window.
6. Provider acceptance is not handset delivery; delivery receipts require a provider-specific verified callback/adapter.

## Safety constraints

- Credentials are encrypted in the database using AES-256-GCM. API responses expose only `hasCredentials`, never secret values. Blank credential fields retain existing secrets.
- Custom hosts must be approved by a system operator through the deployment allowlist; the tenant operator cannot allow arbitrary destinations. HTTPS only, no URL credentials/fragments, private IP literals and localhost-like hostnames are rejected, and redirects are disabled.
- Mapping supports simple nested JSON paths only. No user-supplied scripts are executed. Provider-specific delivery callbacks may require a dedicated adapter.
- Apply migration, run CI/API/UI tests, validate the provider contract, and conduct a controlled real-SMS test before production approval.
