# JASLYN NET CI Runner Diagnostic

## Finding

The repository's pull-request workflows are being created and completed with `conclusion=failure`, but GitHub reports zero job steps and the job-log endpoint returns `BlobNotFound`.

A minimal workflow that only prints Node/npm versions and exits 0 reproduces the same behavior. Therefore this failure is not evidence of an application, dependency, database, lint, test, or build failure.

## Required GitHub-side checks

1. Repository **Settings → Actions → General**: confirm Actions are enabled.
2. Confirm workflow permissions allow workflows to execute for this repository.
3. Check organization/account Actions policy if the repository is governed by one.
4. Confirm `ubuntu-latest` hosted runners are available to the repository/account.
5. Confirm no repository ruleset, branch protection rule, environment protection, or Actions policy is preventing job execution before the first step.
6. Re-run the CI smoke workflow after the above checks.

## Acceptance criteria

The smoke workflow is considered healthy only when GitHub reports at least one executed step and a successful conclusion. Only after that should the full JASLYN NET CI pipeline be used as evidence for application correctness.
