#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${PGHOST:?Set PGHOST}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?Set PGDATABASE}"
: "${PGUSER:?Set PGUSER}"
: "${PGPASSWORD:?Set PGPASSWORD via your secret manager}"

DEST="${1:-./backups}"
mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$DEST/.jaslyn-${PGDATABASE}-$STAMP.dump.tmp"
OUT="$DEST/jaslyn-${PGDATABASE}-$STAMP.dump"

cleanup() { rm -f "$TMP" "$TMP.sha256"; }
trap cleanup ERR INT TERM

pg_dump --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$PGDATABASE" \
  --format=custom --no-owner --no-acl --file="$TMP"

# A successful exit plus a parseable archive list catches truncated/incomplete dumps.
pg_restore --list "$TMP" >/dev/null
sha256sum "$TMP" > "$TMP.sha256"
mv "$TMP" "$OUT"
mv "$TMP.sha256" "$OUT.sha256"
chmod 600 "$OUT" "$OUT.sha256"
printf 'Backup created and archive-verified: %s\n' "$OUT"
printf 'Checksum manifest: %s.sha256\n' "$OUT"
