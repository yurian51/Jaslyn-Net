import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard',()=>{
  const context=(user:any)=>({getHandler:()=>({}),getClass:()=>({}),switchToHttp:()=>({getRequest:()=>({user})})}) as any;
  it('applies per-user deny overrides before role defaults',async()=>{
    const db={query:jest.fn().mockResolvedValueOnce({rows:[{allowed:false}],rowCount:1})};
    const reflector={getAllAndOverride:jest.fn().mockReturnValue(['secrets.write'])};
    const guard=new PermissionsGuard(reflector as any,db as any);
    const allowed=await guard.canActivate(context({id:'u1',tenantId:'t1',role:'OWNER'}));
    expect(allowed).toBe(false);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('user_permission_overrides'),['t1','u1','secrets.write']);
  });
  it('uses the tenant role override before the code default',async()=>{
    const db={query:jest.fn().mockResolvedValueOnce({rows:[],rowCount:0}).mockResolvedValueOnce({rows:[{allowed:false}],rowCount:1})};
    const reflector={getAllAndOverride:jest.fn().mockReturnValue(['secrets.write'])};
    const guard=new PermissionsGuard(reflector as any,db as any);
    expect(await guard.canActivate(context({id:'u1',tenantId:'t1',role:'OWNER'}))).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  it('falls back to the least-privilege default role map when no overrides exist',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[],rowCount:0})};
    const reflector={getAllAndOverride:jest.fn().mockReturnValue(['secrets.write'])};
    const guard=new PermissionsGuard(reflector as any,db as any);
    expect(await guard.canActivate(context({id:'u1',tenantId:'t1',role:'AGENT'}))).toBe(false);
  });
});
