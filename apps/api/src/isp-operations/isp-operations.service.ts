import { Injectable } from '@nestjs/common';

@Injectable()
export class IspOperationsService {
  /**
   * Domain boundary for tenant-scoped ISP field operations.
   * Persistence is intentionally introduced through migrations first so existing
   * control-plane modules remain backward compatible while service workflows are
   * wired incrementally against the same tenant-safe schema.
   */
  readonly moduleName = 'isp-operations';
}
