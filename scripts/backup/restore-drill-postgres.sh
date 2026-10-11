#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${PGHOST:?Set PGHOST}"
: "${PGPORT:=5432}"
: "${PGUSER:?Set PGUSER}"
: "${PGPASSWORD:?Set PGPASSWORD via your secret manager}"
: "${JASLYN_RESTORE_TEST_DATABASE:?Set a disposable target database name}"

BACKUP="${1:?Usage: restore-drill-postgres.sh /path/to/backup.dump}"
case "$JASLYN_RESTORE_TEST_DATABASE" in
  jaslyn_restore_test_*) ;;
  *) echo "Refusing target DB outside jaslyn_restore_test_* namespace" >&2; exit 2 ;;
esac
if [[ ! -f "$BACKUP" || ! -f "$BACKUP.sha256" ]]; then
  echo "Backup and its .sha256 manifest are required" >&2; exit 2
fi
sha256sum --check "$BACKUP.sha256"
pg_restore --list "$BACKUP" >/dev/null

# createdb fails if the target exists; this script never drops an existing database.
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$JASLYN_RESTORE_TEST_DATABASE"
cleanup() {
  if [[ "${KEEP_RESTORE_TEST_DB:-false}" != "true" ]]; then
    dropdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --if-exists "$JASLYN_RESTORE_TEST_DATABASE"
  else
    printf 'Restore test DB retained for inspection: %s\n' "$JASLYN_RESTORE_TEST_DATABASE"
  fi
}
trap cleanup EXIT

pg_restore --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$JASLYN_RESTORE_TEST_DATABASE" \
  --exit-on-error --single-transaction --no-owner --no-acl "$BACKUP"

psql --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$JASLYN_RESTORE_TEST_DATABASE" \
  --set=ON_ERROR_STOP=1 --command="DO \$\$ BEGIN
    IF to_regclass('public.tenants') IS NULL THEN RAISE EXCEPTION 'Missing tenants table'; END IF;
    IF to_regclass('public.users') IS NULL THEN RAISE EXCEPTION 'Missing users table'; END IF;
    IF to_regclass('public.payments') IS NULL THEN RAISE EXCEPTION 'Missing payments table'; END IF;
    IF to_regclass('public.invoices') IS NULL THEN RAISE EXCEPTION 'Missing invoices table'; END IF;
  END \$\$;"

printf 'Restore drill passed for backup %s\n' "$BACKUP"
