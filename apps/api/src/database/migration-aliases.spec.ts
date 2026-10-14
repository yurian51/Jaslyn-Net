import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLegacyMigrationAlias, gitBlobSha, LEGACY_MIGRATION_ALIASES } from './migration-aliases';

describe('legacy migration aliases', () => {
  it('maps renamed migrations to their historical deployed version', () => {
    expect(findLegacyMigrationAlias('044a_radius_correlation_convergence', new Set(['044_radius_correlation_convergence']), '18222a872d06057c872fc6380a9c04269cd5e12c'))
      .toBe('044_radius_correlation_convergence');
    expect(findLegacyMigrationAlias('075_event_driven_automation', new Set(['074_event_driven_automation']), '6b65557e464150e06ba47b6a24fa96c8379bf86d'))
      .toBe('074_event_driven_automation');
    expect(findLegacyMigrationAlias('076_tenant_usage_quotas', new Set(['075_tenant_usage_quotas']), '05e43a0c4dd17a233e347fd55e4082ec57759024'))
      .toBe('075_tenant_usage_quotas');
    expect(findLegacyMigrationAlias('077a_workflow_automation_engine', new Set(['077_workflow_automation_engine']), 'a776167bc1b65fe461a4b8d64bf35c05f48e9c68'))
      .toBe('077_workflow_automation_engine');
  });

  it('does not skip a migration unless its exact legacy version is recorded as applied', () => {
    expect(findLegacyMigrationAlias('044a_radius_correlation_convergence', new Set(), '18222a872d06057c872fc6380a9c04269cd5e12c')).toBeUndefined();
    expect(findLegacyMigrationAlias('078_fiber_topology_inventory', new Set(['077_workflow_automation_engine']), 'not-an-alias')).toBeUndefined();
  });

  it('refuses to skip an alias if its SQL content has changed', () => {
    expect(() => findLegacyMigrationAlias('044a_radius_correlation_convergence', new Set(['044_radius_correlation_convergence']), 'changed-content'))
      .toThrow('no longer matches its reviewed legacy SQL alias');
  });

  it('keeps every alias SQL byte-for-byte pinned to the reviewed Git blob hash', () => {
    for (const [version, alias] of Object.entries(LEGACY_MIGRATION_ALIASES)) {
      const sql = readFileSync(join(__dirname, '../../migrations', version + '.sql'), 'utf8');
      expect(gitBlobSha(sql)).toBe(alias.expectedGitBlobSha);
    }
  });
});
