/**
 * The runner owns the transaction that also records schema_migrations. Remove
 * a file's optional outer BEGIN/COMMIT so the SQL cannot commit that transaction
 * before its version is recorded.
 */
export function stripOuterTransactionWrapper(sql: string): string {
  return sql
    .replace(/^\s*BEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;\s*$/i, '\n');
}
