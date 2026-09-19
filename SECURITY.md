# JASLYN NET Security Policy

JASLYN NET is proprietary software owned by YURIAN TECH LTD.

## Source protection

Repository access is not permission to copy, redistribute, publish, reverse engineer, or modify JASLYN NET outside an authorized development workflow.

Do not commit production passwords, API keys, private keys, signing keys, payment credentials, router credentials, database credentials, or other secrets.

## Credential handling

Keep credentials in GitHub/deployment secret storage or local untracked environment files. If a credential is ever committed or exposed, treat it as compromised and rotate it.

## Reporting

Do not publish credentials or sensitive exploit details in public issues. Report security issues privately to the repository owner through GitHub.

## Verification

Security-sensitive changes must pass automated secret scanning and the repository CI checks before they are considered complete.
