import { findLegacyMigrationAlias, LEGACY_MIGRATION_ALIASES } from './migration-aliases';

describe('legacy migration aliases', () => {
  it('maps renamed migrations to their historical deployed version', () => {
    expect(findLegacyMigrationAlias('044a_radius_correlation_convergence', new Set(['044_radius_correlation_convergence'])))
      .toBe('044_radius_correlation_convergence');
    expect(findLegacyMigrationAlias('075_event_driven_automation', new Set(['074_event_driven_automation'])))
      .toBe('074_event_driven_automation');
    expect(findLegacyMigrationAlias('076_tenant_usage_quotas', new Set(['075_tenant_usage_quotas'])))
      .toBe('075_tenant_usage_quotas');
    expect(findLegacyMigrationAlias('077a_workflow_automation_engine', new Set(['077_workflow_automation_engine'])))
      .toBe('077_workflow_automation_engine');
  });

  it('does not skip a migration unless its exact legacy version is recorded as applied', () => {
    expect(findLegacyMigrationAlias('044a_radius_correlation_convergence', new Set())).toBeUndefined();
    expect(findLegacyMigrationAlias('078_fiber_topology_inventory', new Set(['077_workflow_automation_engine'])))
      .toBeUndefined();
  });

  it('only contains the reviewed identical-SQL aliases', () => {
    expect(Object.keys(LEGACY_MIGRATION_ALIASES)).toEqual([
      '005a_payment_indexes',
      '044a_radius_correlation_convergence',
      '045a_invoice_number_sequences',
      '046a_upesipay_capabilities',
      '048a_remove_upesilipa_subsystem',
      '060a_sms_delivery_provider',
      '061a_sms_campaigns',
      '062a_sms_provider_configs',
      '071a_public_captive_portal_voucher_security',
      '075_event_driven_automation',
      '076_tenant_usage_quotas',
      '077_financial_audit_head_guard',
      '077a_workflow_automation_engine',
    ]);
  });
});
