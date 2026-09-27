import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CommunicationRealtime } from './communication.realtime';

type Actor = { userId: string; tenantId: string; role: string };

@Injectable()
export class CommunicationSuperAppService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly realtime: CommunicationRealtime,
  ) {}

  async setMessageExpiry(actor: Actor, messageId: string, expiresAt: string) {
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new BadRequestException('Expiry must be a future timestamp');
    const message = await this.db.query(
      `SELECT m.id,m.conversation_id AS "conversationId",m.sender_user_id AS "senderUserId"
         FROM messages m
        WHERE m.tenant_id=$1 AND m.id=$2
          AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.tenant_id=m.tenant_id AND cm.conversation_id=m.conversation_id AND cm.user_id=$3 AND cm.left_at IS NULL)`,
      [actor.tenantId,messageId,actor.userId],
    );
    if (!message.rowCount) throw new NotFoundException('Message not found');
    if (message.rows[0].senderUserId !== actor.userId && !['OWNER','ADMIN'].includes(actor.role)) throw new ForbiddenException('Only the sender or conversation administrator can set message expiry');
    await this.db.query(
      `INSERT INTO message_expirations (tenant_id,message_id,expires_at) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id,message_id) DO UPDATE SET expires_at=EXCLUDED.expires_at`,
      [actor.tenantId,messageId,expiry.toISOString()],
    );
    this.realtime.publish({type:'message.expiry.updated',tenantId:actor.tenantId,conversationId:message.rows[0].conversationId,messageId,data:{expiresAt:expiry.toISOString()}});
    return {messageId,expiresAt:expiry.toISOString()};
  }

  async listStories(actor: Actor) {
    const result = await this.db.query(
      `SELECT s.id,s.author_user_id AS "authorUserId",u.full_name AS "authorName",s.kind,s.body,s.media_key AS "mediaKey",
              s.audience,s.expires_at AS "expiresAt",s.created_at AS "createdAt",
              EXISTS(SELECT 1 FROM story_views v WHERE v.tenant_id=s.tenant_id AND v.story_id=s.id AND v.viewer_user_id=$2) AS viewed,
              (SELECT COUNT(*)::int FROM story_views v2 WHERE v2.tenant_id=s.tenant_id AND v2.story_id=s.id) AS "viewCount"
         FROM stories s JOIN users u ON u.tenant_id=s.tenant_id AND u.id=s.author_user_id
        WHERE s.tenant_id=$1 AND s.expires_at > now()
          AND (s.audience='PUBLIC' OR s.author_user_id=$2 OR (s.audience='CONTACTS' AND EXISTS (
            SELECT 1 FROM conversation_members cm1 JOIN conversation_members cm2
              ON cm2.tenant_id=cm1.tenant_id AND cm2.conversation_id=cm1.conversation_id
             WHERE cm1.tenant_id=s.tenant_id AND cm1.user_id=s.author_user_id AND cm2.user_id=$2 AND cm1.left_at IS NULL AND cm2.left_at IS NULL
          )))
        ORDER BY s.created_at DESC LIMIT 100`,
      [actor.tenantId,actor.userId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async createStory(actor: Actor, input: {kind?:string;body?:string;mediaKey?:string;audience?:string;expiresAt?:string}) {
    const kind = input.kind ?? 'TEXT';
    const audience = input.audience ?? 'CONTACTS';
    if (!['TEXT','IMAGE','VIDEO','LINK','POLL'].includes(kind)) throw new BadRequestException('Unsupported story kind');
    if (!['PUBLIC','CONTACTS','PRIVATE'].includes(audience)) throw new BadRequestException('Unsupported story audience');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now()+24*60*60*1000);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new BadRequestException('Story expiry must be in the future');
    if (!input.body?.trim() && !input.mediaKey?.trim()) throw new BadRequestException('Story requires body or media');
    const result = await this.db.query(
      `INSERT INTO stories (tenant_id,author_user_id,kind,body,media_key,audience,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,kind,body,media_key AS "mediaKey",audience,expires_at AS "expiresAt",created_at AS "createdAt"`,
      [actor.tenantId,actor.userId,kind,input.body?.trim()||null,input.mediaKey?.trim()||null,audience,expiresAt.toISOString()],
    );
    this.realtime.publish({type:'story.created',tenantId:actor.tenantId,data:{...result.rows[0],authorUserId:actor.userId}});
    await this.audit.record(actor.tenantId,'STORY_CREATED','story',result.rows[0].id,{kind,audience},{userId:actor.userId});
    return result.rows[0];
  }

  async viewStory(actor: Actor, storyId: string) {
    const story = await this.db.query('SELECT id FROM stories WHERE tenant_id=$1 AND id=$2 AND expires_at>now()',[actor.tenantId,storyId]);
    if (!story.rowCount) throw new NotFoundException('Story not found or expired');
    await this.db.query(
      `INSERT INTO story_views (tenant_id,story_id,viewer_user_id) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id,story_id,viewer_user_id) DO UPDATE SET viewed_at=now()`,
      [actor.tenantId,storyId,actor.userId],
    );
    return {storyId,viewed:true};
  }

  async createEvent(actor: Actor, conversationId: string, input: {title:string;description?:string;startsAt:string;endsAt?:string;timezone?:string;location?:string}) {
    await this.assertMember(actor,conversationId);
    const starts = new Date(input.startsAt);
    const ends = input.endsAt ? new Date(input.endsAt) : null;
    if (Number.isNaN(starts.getTime()) || (ends && Number.isNaN(ends.getTime()))) throw new BadRequestException('Invalid event timestamp');
    if (ends && ends.getTime() <= starts.getTime()) throw new BadRequestException('Event end must be after start');
    if (!input.title.trim()) throw new BadRequestException('Event title is required');
    const result = await this.db.query(
      `INSERT INTO conversation_events (tenant_id,conversation_id,created_by_user_id,title,description,starts_at,ends_at,timezone,location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,title,description,starts_at AS "startsAt",ends_at AS "endsAt",timezone,location,status,created_at AS "createdAt"`,
      [actor.tenantId,conversationId,actor.userId,input.title.trim(),input.description?.trim()||null,starts.toISOString(),ends?.toISOString()||null,input.timezone?.trim()||'Africa/Dar_es_Salaam',input.location?.trim()||null],
    );
    await this.db.query(
      `INSERT INTO conversation_event_attendees (tenant_id,event_id,user_id,response)
       SELECT $1,$2,user_id,'INVITED' FROM conversation_members WHERE tenant_id=$1 AND conversation_id=$3 AND user_id IS NOT NULL AND left_at IS NULL
       ON CONFLICT DO NOTHING`,
      [actor.tenantId,result.rows[0].id,conversationId],
    );
    this.realtime.publish({type:'conversation.event.created',tenantId:actor.tenantId,conversationId,data:result.rows[0]});
    return result.rows[0];
  }

  async listEvents(actor: Actor, conversationId: string) {
    await this.assertMember(actor,conversationId);
    const result = await this.db.query(
      `SELECT e.id,e.title,e.description,e.starts_at AS "startsAt",e.ends_at AS "endsAt",e.timezone,e.location,e.status,
              e.created_by_user_id AS "createdByUserId",a.response
         FROM conversation_events e
         LEFT JOIN conversation_event_attendees a ON a.tenant_id=e.tenant_id AND a.event_id=e.id AND a.user_id=$3
        WHERE e.tenant_id=$1 AND e.conversation_id=$2
        ORDER BY e.starts_at ASC`,
      [actor.tenantId,conversationId,actor.userId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async respondEvent(actor: Actor, eventId: string, response: 'GOING'|'MAYBE'|'DECLINED') {
    if (!['GOING','MAYBE','DECLINED'].includes(response)) throw new BadRequestException('Invalid event response');
    const event = await this.db.query('SELECT conversation_id AS "conversationId" FROM conversation_events WHERE tenant_id=$1 AND id=$2',[actor.tenantId,eventId]);
    if (!event.rowCount) throw new NotFoundException('Event not found');
    await this.assertMember(actor,event.rows[0].conversationId);
    await this.db.query(
      `INSERT INTO conversation_event_attendees (tenant_id,event_id,user_id,response,responded_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (tenant_id,event_id,user_id) DO UPDATE SET response=EXCLUDED.response,responded_at=now()`,
      [actor.tenantId,eventId,actor.userId,response],
    );
    this.realtime.publish({type:'conversation.event.response',tenantId:actor.tenantId,conversationId:event.rows[0].conversationId,data:{eventId,userId:actor.userId,response}});
    return {eventId,response};
  }

  async listMiniApps(actor: Actor) {
    const result = await this.db.query(
      `SELECT id,slug,name,description,launch_url AS "launchUrl",icon_url AS "iconUrl",permissions,enabled,
              EXISTS(SELECT 1 FROM mini_app_installs i WHERE i.tenant_id=m.tenant_id AND i.mini_app_id=m.id AND i.user_id=$2) AS installed
         FROM mini_apps m WHERE m.tenant_id=$1 AND m.enabled=true ORDER BY name ASC`,
      [actor.tenantId,actor.userId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async registerMiniApp(actor: Actor, input: {slug:string;name:string;description?:string;launchUrl:string;iconUrl?:string;permissions?:string[]}) {
    if (!['OWNER','ADMIN'].includes(actor.role)) throw new ForbiddenException('Mini app registration requires administrator permission');
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
    if (!slug || !input.name.trim() || !/^https?:\/\//i.test(input.launchUrl.trim())) throw new BadRequestException('Valid slug, name and HTTPS/HTTP launch URL are required');
    const permissions = [...new Set((input.permissions ?? []).map(v=>v.trim()).filter(Boolean))].slice(0,50);
    try {
      const result = await this.db.query(
        `INSERT INTO mini_apps (tenant_id,owner_user_id,slug,name,description,launch_url,icon_url,permissions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,slug,name,description,launch_url AS "launchUrl",icon_url AS "iconUrl",permissions,enabled`,
        [actor.tenantId,actor.userId,slug,input.name.trim(),input.description?.trim()||null,input.launchUrl.trim(),input.iconUrl?.trim()||null,JSON.stringify(permissions)],
      );
      await this.audit.record(actor.tenantId,'MINI_APP_REGISTERED','mini_app',result.rows[0].id,{slug,name:input.name.trim()},{userId:actor.userId});
      return result.rows[0];
    } catch(error:any) {
      if(error?.code==='23505') throw new BadRequestException('Mini app slug already exists');
      throw error;
    }
  }

  async installMiniApp(actor: Actor, miniAppId: string) {
    const app = await this.db.query('SELECT id,permissions,enabled FROM mini_apps WHERE tenant_id=$1 AND id=$2',[actor.tenantId,miniAppId]);
    if (!app.rowCount || app.rows[0].enabled !== true) throw new NotFoundException('Mini app not found');
    await this.db.query(
      `INSERT INTO mini_app_installs (tenant_id,mini_app_id,user_id,permissions,last_opened_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (tenant_id,mini_app_id,user_id) DO UPDATE SET permissions=EXCLUDED.permissions,last_opened_at=now()`,
      [actor.tenantId,miniAppId,actor.userId,JSON.stringify(app.rows[0].permissions ?? [])],
    );
    return {miniAppId,installed:true,permissions:app.rows[0].permissions ?? []};
  }

  async openMiniApp(actor: Actor, miniAppId: string) {
    const app = await this.db.query(
      `SELECT m.id,m.slug,m.name,m.launch_url AS "launchUrl",m.permissions
         FROM mini_apps m JOIN mini_app_installs i ON i.tenant_id=m.tenant_id AND i.mini_app_id=m.id AND i.user_id=$2
        WHERE m.tenant_id=$1 AND m.id=$3 AND m.enabled=true`,
      [actor.tenantId,actor.userId,miniAppId],
    );
    if (!app.rowCount) throw new ForbiddenException('Install the mini app before opening it');
    await this.db.query('UPDATE mini_app_installs SET last_opened_at=now() WHERE tenant_id=$1 AND mini_app_id=$2 AND user_id=$3',[actor.tenantId,miniAppId,actor.userId]);
    return { ...app.rows[0], launchContext:{tenantId:actor.tenantId,userId:actor.userId,issuedAt:new Date().toISOString()} };
  }

  async processExpired() {
    const result = await this.db.query(
      `UPDATE messages m SET deleted_at=now(),updated_at=now()
         FROM message_expirations e
        WHERE e.tenant_id=m.tenant_id AND e.message_id=m.id AND e.expires_at<=now() AND m.deleted_at IS NULL
        RETURNING m.tenant_id AS "tenantId",m.id,m.conversation_id AS "conversationId"`,
    );
    for (const row of result.rows) this.realtime.publish({type:'message.expired',tenantId:row.tenantId,conversationId:row.conversationId,messageId:row.id,data:{expired:true}});
    await this.db.query('DELETE FROM stories WHERE expires_at<=now()');
    return {expiredMessages:result.rowCount ?? 0};
  }

  private async assertMember(actor: Actor, conversationId: string) {
    const result = await this.db.query(
      'SELECT 1 FROM conversation_members WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL',
      [actor.tenantId,conversationId,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Conversation not found');
  }
}
