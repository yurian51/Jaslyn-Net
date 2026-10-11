# Jaslyn-Net Backup, High Availability and Recovery

## Backup job

Run `scripts/backup/backup-postgres.sh /secure/backup/path` from a trusted host with PostgreSQL client tools installed. Supply connection variables through the deployment secret manager. The script creates a custom-format dump, verifies that PostgreSQL can enumerate the archive, writes a SHA-256 checksum manifest, and restricts file permissions.

Store backups encrypted at rest and in a separate failure domain from the primary database. Do not put credentials in shell arguments, repository files, CI logs or the backup directory. Define retention and deletion according to the operator's legal obligations.

## Restore drill

1. Copy both the dump and its `.sha256` manifest to a trusted test host.
2. Set `JASLYN_RESTORE_TEST_DATABASE` to a new name beginning with `jaslyn_restore_test_`.
3. Run `scripts/backup/restore-drill-postgres.sh /path/to/backup.dump`.
4. The script verifies the checksum, creates only a new disposable database, restores in a single transaction, checks critical tables and drops the test database on exit.
5. Set `KEEP_RESTORE_TEST_DB=true` only when an operator intentionally wants to retain the restored database for inspection. The script never drops an existing database.

## HA/DR release gate

This repository change supplies backup/restore automation, not an automatically provisioned HA cluster. Before production, the operator must configure and verify:

- PostgreSQL replication/failover appropriate to the deployment, including fencing to prevent split-brain writes.
- Encrypted off-host backups and protected access to encryption keys.
- Explicit Recovery Point Objective (RPO) and Recovery Time Objective (RTO).
- A scheduled restore drill and a failover rehearsal, with timestamps and evidence recorded.
- Application readiness checks after failover, including migrations, background workers, tenant isolation and payment/webhook idempotency.
- A documented rollback and incident owner.

A dump completing successfully is not proof that a restore, failover or production recovery has passed. Record the backup ID, checksum, database version, restore target, elapsed time, validation results and operator approval for every drill.
