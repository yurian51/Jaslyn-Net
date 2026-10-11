import { RevenueAssuranceService } from './revenue-assurance.service';

describe('RevenueAssuranceService',()=>{
  it('requires a reason before accepting a financial discrepancy',async()=>{
    const db={query:jest.fn()};const audit={record:jest.fn()};
    const service=new RevenueAssuranceService(db as any,audit as any);
    await expect(service.updateDiscrepancy('tenant-1','owner-1','finding-1',{status:'ACCEPTED',note:'   '} as any)).rejects.toThrow('A reason is required');
    expect(db.query).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('keeps discrepancy mutations tenant-scoped and audits successful resolution',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[{id:'finding-1',status:'RESOLVED',resolutionNote:'Fixed',resolvedAt:'2026-10-11T00:00:00Z'}],rowCount:1})};
    const audit={record:jest.fn().mockResolvedValue(undefined)};
    const service=new RevenueAssuranceService(db as any,audit as any);
    await service.updateDiscrepancy('tenant-1','owner-1','finding-1',{status:'RESOLVED',note:'Fixed'} as any,{userId:'owner-1'});
    expect(db.query.mock.calls[0][0]).toContain('WHERE tenant_id=$1 AND id=$2 AND status=\'OPEN\'');
    expect(db.query.mock.calls[0][1][0]).toBe('tenant-1');
    expect(audit.record).toHaveBeenCalledWith('tenant-1','REVENUE_DISCREPANCY_RESOLVED','revenue_discrepancy','finding-1',{noteProvided:true},{userId:'owner-1'});
  });
});
