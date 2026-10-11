import { SyntheticMonitoringService } from './synthetic-monitoring.service';

describe('SyntheticMonitoringService target validation',()=>{
  const makeService=(query=jest.fn())=>new SyntheticMonitoringService({query} as any,{get:()=>''} as any,{record:jest.fn()} as any);
  it('rejects HTTP and IP-literal targets before writing monitor records',async()=>{
    const query=jest.fn();const service=makeService(query);
    await expect(service.create('tenant-1','user-1',{name:'Unsafe target',checkType:'HTTP',target:'http://127.0.0.1/admin'} as any)).rejects.toThrow('Monitor URLs must use HTTPS');
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects local DNS names by default',async()=>{
    const query=jest.fn();const service=makeService(query);
    await expect(service.create('tenant-1','user-1',{name:'Local target',checkType:'DNS',target:'router.local'} as any)).rejects.toThrow('DNS monitor target must be a fully qualified public hostname');
    expect(query).not.toHaveBeenCalled();
  });
});
