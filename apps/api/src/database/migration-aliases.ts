import { createHash } from 'node:crypto';

type LegacyMigrationAlias = {
  legacyVersion: string;
  expectedGitBlobSha: string;
};

/**
 * These renamed migrations are byte-for-byte equivalent to historical files
 * already applied in production. Expected Git blob hashes prevent future edits
 * from being silently skipped as aliases.
 */
export const LEGACY_MIGRATION_ALIASES: Readonly<Record<string, LegacyMigrationAlias>> = {
  '005a_payment_indexes': { legacyVersion: '005_payment_indexes', expectedGitBlobSha: '3f25e5bc944f29ce0d6b80ff59cddefcacc65879' },
  '044a_radius_correlation_convergence': { legacyVersion: '044_radius_correlation_convergence', expectedGitBlobSha: '18222a872d06057c872fc6380a9c04269cd5e12c' },
  '045a_invoice_number_sequences': { legacyVersion: '045_invoice_number_sequences', expectedGitBlobSha: '8d70d32c2a481255393779b63555a4458d57154d' },
  '046a_upesipay_capabilities': { legacyVersion: '046_upesipay_capabilities', expectedGitBlobSha: '41b0aa1013ad8f88e1e1fea6276ad8980b45b2f4' },
  '048a_remove_upesilipa_subsystem': { legacyVersion: '048_remove_upesilipa_subsystem', expectedGitBlobSha: 'cb55a2c3d4f78359391895cefaac406825cf4854' },
  '060a_sms_delivery_provider': { legacyVersion: '060_sms_delivery_provider', expectedGitBlobSha: '5371ae394cae4b6da85881e17e7cce8dc6a7551f' },
  '061a_sms_campaigns': { legacyVersion: '061_sms_campaigns', expectedGitBlobSha: '0f92829bf47c7cbe7b9825d973cd83786dd407e7' },
  '062a_sms_provider_configs': { legacyVersion: '062_sms_provider_configs', expectedGitBlobSha: '1cc8fad11685951e4c00fb1207e88aae3c757317' },
  '071a_public_captive_portal_voucher_security': { legacyVersion: '071_public_captive_portal_voucher_security', expectedGitBlobSha: '1f1a3b8bb32701f7edbb5735947f417d50248fb0' },
  '075_event_driven_automation': { legacyVersion: '074_event_driven_automation', expectedGitBlobSha: '6b65557e464150e06ba47b6a24fa96c8379bf86d' },
  '076_tenant_usage_quotas': { legacyVersion: '075_tenant_usage_quotas', expectedGitBlobSha: '05e43a0c4dd17a233e347fd55e4082ec57759024' },
  '077_financial_audit_head_guard': { legacyVersion: '076_financial_audit_head_guard', expectedGitBlobSha: 'ac47afbcdfe9b4d3c8243f4c04757d7fbd4e1932' },
  '077a_workflow_automation_engine': { legacyVersion: '077_workflow_automation_engine', expectedGitBlobSha: 'a776167bc1b65fe461a4b8d64bf35c05f48e9c68' },
};

export function gitBlobSha(content: string): string {
  const header = `blob ${Buffer.byteLength(content)}\0`;
  return createHash('sha1').update(header).update(content).digest('hex');
}

export function findLegacyMigrationAlias(
  version: string,
  appliedVersions: ReadonlySet<string>,
  actualGitBlobSha: string,
): string | undefined {
  const alias = LEGACY_MIGRATION_ALIASES[version];
  if (!alias || !appliedVersions.has(alias.legacyVersion)) return undefined;
  if (actualGitBlobSha !== alias.expectedGitBlobSha) {
    throw new Error(`Migration ${version} no longer matches its reviewed legacy SQL alias; refusing to skip it`);
  }
  return alias.legacyVersion;
}
