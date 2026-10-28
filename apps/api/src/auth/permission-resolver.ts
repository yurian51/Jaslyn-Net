import { Pool } from 'pg';
import { DEFAULT_PERMISSION_ROLES } from './permission-defaults';

export type PermissionSubject = { tenantId: string; userId: string; role: string };

/**
 * Effective-permission resolution: user override -> tenant role override -> platform default.
 * Used by PermissionsGuard (HTTP) and by the automation engine (execution-time re-check) so both agree.
 */
export async function hasPermission(db: Pick<Pool, 'query'>, subject: PermissionSubject, permission: string): Promise<boolean> {
  const userOverride = await db.query('SELECT allowed FROM user_permission_overrides WHERE tenant_id=$1 AND user_id=$2 AND permission_key=$3', [subject.tenantId, subject.userId, permission]);
  if (userOverride.rowCount) return userOverride.rows[0].allowed === true;
  const roleOverride = await db.query('SELECT allowed FROM tenant_role_permissions WHERE tenant_id=$1 AND role=$2 AND permission_key=$3', [subject.tenantId, subject.role, permission]);
  if (roleOverride.rowCount) return roleOverride.rows[0].allowed === true;
  return (DEFAULT_PERMISSION_ROLES[permission] ?? []).includes(subject.role);
}

export const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_PERMISSION_ROLES));
