import { SecurityPostureService } from './security-posture.service';

describe('SecurityPostureService',()=>{
  it('marks unsupported desired-state keys as unverified instead of claiming live-device compliance',async()=>{
    const db={query:jest.fn()
      .mockResolvedValueOnce({rows:[{id:'policy-1',policy_key:'ssid-baseline',scope_type:'TENANT',scope_id:null,desired_state:{ssidSecurity:'WPA3'},status:'ACTIVE'}],rowCount:1})
      .mockResolvedValueOnce({rows:[{id:'router-1',name:'Router 1',vendor:'MIKROTIK',model:'RB5009',os_version:'7.15',status:'ONLINE',management_protocol:'ROUTEROS_V7',management_enabled:true,controller_endpoint:null,capabilities:{},management_credentials_encrypted:'ciphertext'}],rowCount:1})
      .mockResolvedValueOnce({rows:[{id:'eval-1',routerId:'router-1',result:'UNVERIFIED',observedState:{},drift:{},evaluatedAt:'2026-10-11T00:00:00Z'}],rowCount:1})};
    const audit={record:jest.fn().mockResolvedValue(undefined)};
    const service=new SecurityPostureService(db as any,audit as any);
    const result=await service.evaluatePolicy('tenant-1','policy-1');
    expect(result).toMatchObject({count:1,source:'DATABASE_CONFIGURATION',liveDeviceVerified:false,evaluations:[{result:'UNVERIFIED'}]});
    expect(result.note).toContain('not proof of live device state');
    expect(db.query.mock.calls[1][1]).toEqual(['tenant-1',null]);
  });
  it('rejects a router-scoped policy without a router ID before persistence',async()=>{
    const db={query:jest.fn()};
    const service=new SecurityPostureService(db as any,{record:jest.fn()} as any);
    await expect(service.createPolicy('tenant-1','user-1',{policyKey:'router-baseline',name:'Router baseline',scopeType:'ROUTER',desiredState:{managementEnabled:true},enforcementMode:'MONITOR'} as any)).rejects.toThrow('Router-scoped policies require a router ID');
    expect(db.query).not.toHaveBeenCalled();
  });
});
