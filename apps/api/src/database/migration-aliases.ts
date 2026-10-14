/**
 * These renamed migrations are byte-for-byte equivalent to historical files
 * already applied in production. Keep this list explicit: changed migrations
 * must not be skipped just because their names look similar.
 */
export const LEGACY_MIGRATION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '005a_payment_indexes': ['005_payment_indexes'],
  '044a_radius_correlation_convergence': ['044_radius_correlation_convergence'],
  '045a_invoice_number_sequences': ['045_invoice_number_sequences'],
  '046a_upesipay_capabilities': ['046_upesipay_capabilities'],
  '048a_remove_upesilipa_subsystem': ['048_remove_upesilipa_subsystem'],
  '060a_sms_delivery_provider': ['060_sms_delivery_provider'],
  '061a_sms_campaigns': ['061_sms_campaigns'],
  '062a_sms_provider_configs': ['062_sms_provider_configs'],
  '071a_public_captive_portal_voucher_security': ['071_public_captive_portal_voucher_security'],
  '075_event_driven_automation': ['074_event_driven_automation'],
  '076_tenant_usage_quotas': ['075_tenant_usage_quotas'],
  '077_financial_audit_head_guard': ['076_financial_audit_head_guard'],
  '077a_workflow_automation_engine': ['077_workflow_automation_engine'],
};

export function findLegacyMigrationAlias(version: string, appliedVersions: ReadonlySet<string>): string | undefined {
  return LEGACY_MIGRATION_ALIASES[version]?.find((legacyVersion) => appliedVersions.has(legacyVersion));
}
