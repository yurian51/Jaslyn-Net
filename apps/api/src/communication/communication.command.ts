import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NetworkCommandService } from '../modules/traffic/network-command.service';

type Actor = { userId:string; tenantId:string; role:string };

const OPERATOR_ROLES = new Set(['OWNER','ADMIN']);
const NETWORK_READ_ROLES = new Set(['OWNER','ADMIN','AGENT']);
const FINANCE_READ_ROLES = new Set(['OWNER','ADMIN','AGENT','CASHIER']);

@Injectable()
export class CommunicationCommandService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService, private readonly networkCommands: NetworkCommandService) {}

  async execute(actor: Actor, command: string, confirm = false) {
    const normalized = command.trim().replace(/\s+/g,' ');
    if (!normalized || normalized.length > 500) throw new BadRequestException('Command is required');
    const requestId = randomUUID();

    const dangerous = /^(restart router|suspend subscriber|refund payment|terminate session|disable account|delete message|delete user)\b/i.test(normalized);
    if (dangerous && !confirm) {
      const preview = await this.previewDangerous(actor, normalized);
      await this.record(actor, normalized, 'AWAITING_CONFIRMATION', preview, requestId);
      return { status:'AWAITING_CONFIRMATION', command:normalized, requestId, preview };
    }
    if (dangerous) {
      if (!OPERATOR_ROLES.has(actor.role)) throw new ForbiddenException('Operator confirmation permission required');
      if (/^restart router\b/i.test(normalized)) {
        const routerName = normalized.replace(/^restart router\s*/i,'').trim();
        if (!routerName) throw new BadRequestException('Usage: restart router <router-name>');
        const router = await this.db.query(
          'SELECT id,name,management_protocol AS "managementProtocol",management_enabled AS "managementEnabled",api_endpoint AS "apiEndpoint" FROM routers WHERE tenant_id=$1 AND name=$2 LIMIT 1',
          [actor.tenantId,routerName],
        );
        if (!router.rowCount) throw new BadRequestException('Router not found');
        const row = router.rows[0];
        if (!row.managementEnabled || !row.apiEndpoint) throw new BadRequestException('Router management is not configured for this router');
        if (row.managementProtocol !== 'MIKROTIK_REST') throw new ForbiddenException('Verified router restart is currently supported only for MikroTik REST');
        const queued = await this.networkCommands.queue(actor.tenantId,{
          routerId:row.id,
          commandType:'ROUTER_RESTART',
          actor:actor.userId,
          provider:row.managementProtocol,
          correlationId:requestId,
          target:{routerId:row.id,routerName:row.name},
          request:{command:normalized},
        });
        const result = { verified:false, queued:true, networkCommandId:queued.id, status:queued.status, message:'Router restart queued through the verified network command fabric.' };
        await this.record(actor,normalized,'SUCCESS',result,requestId);
        return { status:'QUEUED', command:normalized, requestId, actor:actor.userId, resource:{routerId:row.id,routerName:row.name}, result, timestamp:new Date().toISOString() };
      }
      throw new ForbiddenException('This dangerous command is not connected to a verified execution fabric');
    }

    const parts = normalized.split(' ');
    const verb = parts[0].toLowerCase();
    let result: Record<string, unknown>;

    if (verb === '/status' || verb === 'status') {
      const active = await this.db.query(
        'SELECT COUNT(*)::int AS sessions FROM sessions WHERE tenant_id=$1 AND status=\'ACTIVE\'',
        [actor.tenantId],
      );
      const routers = await this.db.query(
        'SELECT COUNT(*) FILTER (WHERE status=\'ONLINE\')::int AS online, COUNT(*)::int AS total FROM routers WHERE tenant_id=$1',
        [actor.tenantId],
      );
      result = { verified:true, activeSessions:Number(active.rows[0]?.sessions||0), routers:{online:Number(routers.rows[0]?.online||0),total:Number(routers.rows[0]?.total||0)} };
    } else if (verb === '/router' || verb === 'router') {
      if (!NETWORK_READ_ROLES.has(actor.role)) throw new ForbiddenException('Network command access denied');
      if (parts[1]?.toLowerCase() !== 'status' || !parts[2]) throw new BadRequestException('Usage: /router status <router-name>');
      const router = await this.db.query(
        'SELECT id,name,status,vendor,model,active_users AS "activeUsers",updated_at AS "updatedAt" FROM routers WHERE tenant_id=$1 AND name=$2 LIMIT 1',
        [actor.tenantId,parts.slice(2).join(' ')],
      );
      if (!router.rowCount) result = { verified:true, dataAvailable:false, message:'No data available for the requested router.' };
      else result = { verified:true, router:router.rows[0] };
    } else if (verb === '/balance' || verb === 'balance') {
      if (!FINANCE_READ_ROLES.has(actor.role)) throw new ForbiddenException('Billing command access denied');
      if (!parts[1]) throw new BadRequestException('Usage: /balance <customer-username>');
      const customer = await this.db.query('SELECT id,full_name AS "fullName",username FROM customers WHERE tenant_id=$1 AND username=$2 LIMIT 1',[actor.tenantId,parts[1]]);
      if (!customer.rowCount) result = { verified:true, dataAvailable:false, message:'No subscriber found.' };
      else {
        const invoices = await this.db.query(
          'SELECT COALESCE(SUM(total) FILTER (WHERE status IN (\'ISSUED\',\'PARTIALLY_PAID\',\'OVERDUE\')),0)::numeric AS outstanding,currency FROM invoices WHERE tenant_id=$1 AND customer_id=$2 GROUP BY currency',
          [actor.tenantId,customer.rows[0].id],
        );
        result = { verified:true, customer:customer.rows[0], outstanding:invoices.rows };
      }
    } else if (verb === '/payment' || verb === 'payment') {
      if (!FINANCE_READ_ROLES.has(actor.role)) throw new ForbiddenException('Payment command access denied');
      if (!parts[1]) throw new BadRequestException('Usage: /payment <customer-username>');
      const payment = await this.db.query(
        'SELECT p.id,p.amount,p.currency,p.provider,p.provider_reference AS "reference",p.status,p.created_at AS "createdAt" FROM payments p JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id WHERE p.tenant_id=$1 AND c.username=$2 ORDER BY p.created_at DESC LIMIT 10',
        [actor.tenantId,parts[1]],
      );
      result = { verified:true, data:payment.rows };
    } else if (verb === '/package' || verb === 'package') {
      if (!FINANCE_READ_ROLES.has(actor.role)) throw new ForbiddenException('Package command access denied');
      if (!parts[1]) throw new BadRequestException('Usage: /package <customer-username>');
      const purchase = await this.db.query(
        'SELECT p.id,p.status,p.starts_at AS "startsAt",p.ends_at AS "endsAt",pkg.name AS "packageName",pkg.download_bps AS "downloadBps",pkg.upload_bps AS "uploadBps",p.price,p.currency FROM wifi_plan_purchases p JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id JOIN packages pkg ON pkg.tenant_id=p.tenant_id AND pkg.id=p.package_id WHERE p.tenant_id=$1 AND c.username=$2 ORDER BY p.created_at DESC LIMIT 1',
        [actor.tenantId,parts[1]],
      );
      result = { verified:true, data:purchase.rows };
    } else if (verb === '/support' || verb === 'support') {
      result = { verified:true, action:'OPEN_SUPPORT', message:'Support workflow is available through the Communication Center. No ticket was created by this read-only command.' };
    } else if (verb === 'show' && parts[1]?.toLowerCase()==='offline' && parts[2]?.toLowerCase()==='routers') {
      if (!NETWORK_READ_ROLES.has(actor.role)) throw new ForbiddenException('Network command access denied');
      const routers = await this.db.query(
        'SELECT id,name,status,vendor,model,active_users AS "activeUsers",updated_at AS "updatedAt" FROM routers WHERE tenant_id=$1 AND status=\'OFFLINE\' ORDER BY updated_at DESC LIMIT 200',
        [actor.tenantId],
      );
      result = { verified:true, data:routers.rows, count:routers.rowCount??0 };
    } else {
      result = { verified:false, dataAvailable:false, message:'Insufficient verified data for this command.' };
    }

    await this.record(actor, normalized, 'SUCCESS', result, requestId);
    return { status:'SUCCESS', command:normalized, requestId, actor:actor.userId, resource:result.router ?? result.customer ?? null, result, timestamp:new Date().toISOString() };
  }

  private async previewDangerous(actor: Actor, command: string) {
    return {
      scope:'COMMAND',
      command,
      requiresConfirmation:true,
      actor:actor.userId,
      warning:'This operation can change service state and is not executed automatically.',
    };
  }

  private async record(actor:Actor, command:string, status:string, result:Record<string,unknown>, requestId:string) {
    await this.db.query(
      status === 'AWAITING_CONFIRMATION'
      ? 'INSERT INTO command_executions (tenant_id,actor_user_id,command,status,result,request_id) VALUES ($1,$2,$3,$4,$5,$6)'
      : 'INSERT INTO command_executions (tenant_id,actor_user_id,command,status,result,request_id,completed_at) VALUES ($1,$2,$3,$4,$5,$6,now())',
      [actor.tenantId,actor.userId,command,status,JSON.stringify(result),requestId],
    );
    await this.audit.record(actor.tenantId,status === 'AWAITING_CONFIRMATION' ? 'COMMAND_PREVIEWED' : 'COMMAND_EXECUTED','command',requestId,{command,status,result},{userId:actor.userId,requestId});
  }
}
