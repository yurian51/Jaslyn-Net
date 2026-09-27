import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
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

  async getIdentity(actor: Actor) {
    const result = await this.db.query(
      `SELECT cp.username,cp.phone_visibility AS "phoneVisibility",cp.discoverable_by_username AS "discoverableByUsername",
              cp.discoverable_by_phone AS "discoverableByPhone",u.full_name AS "fullName",u.email
         FROM communication_profiles cp JOIN users u ON u.tenant_id=cp.tenant_id AND u.id=cp.user_id
        WHERE cp.tenant_id=$1 AND cp.user_id=$2`,
      [actor.tenantId,actor.userId],
    );
    return result.rows[0] ?? null;
  }

  async upsertIdentity(actor: Actor, input: { username: string; phoneVisibility?: string; discoverableByUsername?: boolean; discoverableByPhone?: boolean }) {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9_][a-z0-9_.-]{2,31}$/.test(username)) throw new BadRequestException('Username must be 3-32 characters using letters, numbers, dot, dash or underscore');
    const phoneVisibility = input.phoneVisibility ?? 'CONTACTS';
    if (!['EVERYONE','CONTACTS','NOBODY'].includes(phoneVisibility)) throw new BadRequestException('Invalid phone visibility');
    try {
      const result = await this.db.query(
        `INSERT INTO communication_profiles (tenant_id,user_id,username,phone_visibility,discoverable_by_username,discoverable_by_phone)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tenant_id,user_id) DO UPDATE SET username=EXCLUDED.username,phone_visibility=EXCLUDED.phone_visibility,
           discoverable_by_username=EXCLUDED.discoverable_by_username,discoverable_by_phone=EXCLUDED.discoverable_by_phone,updated_at=now()
         RETURNING username,phone_visibility AS "phoneVisibility",discoverable_by_username AS "discoverableByUsername",
           discoverable_by_phone AS "discoverableByPhone"`,
        [actor.tenantId,actor.userId,username,phoneVisibility,input.discoverableByUsername !== false,input.discoverableByPhone !== false],
      );
      return result.rows[0];
    } catch (error:any) {
      if (error?.code === '23505') throw new ConflictException('Username is already in use');
      throw error;
    }
  }

  async findByUsername(actor: Actor, username: string) {
    const normalized = username.trim().toLowerCase().replace(/^@/,'');
    if (!/^[a-z0-9_][a-z0-9_.-]{2,31}$/.test(normalized)) throw new BadRequestException('Invalid username');
    const result = await this.db.query(
      `SELECT cp.user_id AS "userId",cp.username,u.full_name AS "fullName",
              EXISTS(SELECT 1 FROM conversation_members cm1 JOIN conversation_members cm2
                       ON cm2.tenant_id=cm1.tenant_id AND cm2.conversation_id=cm1.conversation_id
                      WHERE cm1.tenant_id=cp.tenant_id AND cm1.user_id=$2 AND cm2.user_id=cp.user_id
                        AND cm1.left_at IS NULL AND cm2.left_at IS NULL) AS "isConnection"
         FROM communication_profiles cp JOIN users u ON u.tenant_id=cp.tenant_id AND u.id=cp.user_id
        WHERE cp.tenant_id=$1 AND cp.username=$3 AND cp.discoverable_by_username=true AND u.is_active=true`,
      [actor.tenantId,actor.userId,normalized],
    );
    if (!result.rowCount) throw new NotFoundException('User not found');
    return result.rows[0];
  }

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
          )) OR (s.audience='CUSTOM' AND EXISTS (
            SELECT 1 FROM story_allowed_users sau
             WHERE sau.tenant_id=s.tenant_id AND sau.story_id=s.id AND sau.user_id=$2
          )))
        ORDER BY s.created_at DESC LIMIT 100`,
      [actor.tenantId,actor.userId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async createStory(actor: Actor, input: {kind?:string;body?:string;mediaKey?:string;audience?:string;expiresAt?:string;allowedUserIds?:string[]}) {
    const kind = input.kind ?? 'TEXT';
    const audience = input.audience ?? 'CONTACTS';
    if (!['TEXT','IMAGE','VIDEO','LINK','POLL'].includes(kind)) throw new BadRequestException('Unsupported story kind');
    if (!['PUBLIC','CONTACTS','PRIVATE','CUSTOM'].includes(audience)) throw new BadRequestException('Unsupported story audience');
    const allowedUserIds = [...new Set((input.allowedUserIds ?? []).map(value => value.trim()).filter(Boolean))];
    if (allowedUserIds.some(value => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) throw new BadRequestException('Custom story audience contains an invalid user id');
    if (audience === 'CUSTOM' && allowedUserIds.length === 0) throw new BadRequestException('Custom story audience requires at least one user');
    if (allowedUserIds.length > 200) throw new BadRequestException('Custom story audience is limited to 200 users');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now()+24*60*60*1000);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new BadRequestException('Story expiry must be in the future');
    if (!input.body?.trim() && !input.mediaKey?.trim()) throw new BadRequestException('Story requires body or media');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO stories (tenant_id,author_user_id,kind,body,media_key,audience,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,kind,body,media_key AS "mediaKey",audience,expires_at AS "expiresAt",created_at AS "createdAt"`,
        [actor.tenantId,actor.userId,kind,input.body?.trim()||null,input.mediaKey?.trim()||null,audience,expiresAt.toISOString()],
      );
      if (audience === 'CUSTOM') {
        await client.query(
          `INSERT INTO story_allowed_users (tenant_id,story_id,user_id)
           SELECT $1,$2,u.id FROM users u
            WHERE u.tenant_id=$1 AND u.id = ANY($3::uuid[]) AND u.is_active=true
           ON CONFLICT DO NOTHING`,
          [actor.tenantId,result.rows[0].id,allowedUserIds],
        );
        const count = await client.query(
          `SELECT COUNT(*)::int AS count FROM story_allowed_users WHERE tenant_id=$1 AND story_id=$2`,
          [actor.tenantId,result.rows[0].id],
        );
        if (count.rows[0].count !== allowedUserIds.length) throw new BadRequestException('One or more custom story audience users are invalid');
      }
      await client.query('COMMIT');
      this.realtime.publish({type:'story.created',tenantId:actor.tenantId,data:{...result.rows[0],authorUserId:actor.userId}});
      await this.audit.record(actor.tenantId,'STORY_CREATED','story',result.rows[0].id,{kind,audience,allowedUserCount:allowedUserIds.length},{userId:actor.userId});
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async viewStory(actor: Actor, storyId: string) {
    const story = await this.db.query(
      `SELECT id FROM stories s
        WHERE s.tenant_id=$1 AND s.id=$2 AND s.expires_at>now()
          AND (
            s.audience='PUBLIC' OR s.author_user_id=$3
            OR (s.audience='CONTACTS' AND EXISTS (
              SELECT 1 FROM conversation_members cm1
              JOIN conversation_members cm2 ON cm2.tenant_id=cm1.tenant_id AND cm2.conversation_id=cm1.conversation_id
              WHERE cm1.tenant_id=s.tenant_id AND cm1.user_id=s.author_user_id AND cm2.user_id=$3
                AND cm1.left_at IS NULL AND cm2.left_at IS NULL
            ))
            OR (s.audience='CUSTOM' AND EXISTS (
              SELECT 1 FROM story_allowed_users sau
              WHERE sau.tenant_id=s.tenant_id AND sau.story_id=s.id AND sau.user_id=$3
            ))
          )`,
      [actor.tenantId,storyId,actor.userId],
    );
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
    const secret = process.env.JASLYN_MINI_APP_SECRET?.trim();
    if (!secret) throw new InternalServerErrorException('Mini app signing secret is not configured');
    const issuedAt = Math.floor(Date.now()/1000);
    const expiresAt = issuedAt + 300;
    const payload = { v:1, tenantId:actor.tenantId, userId:actor.userId, miniAppId:app.rows[0].id, slug:app.rows[0].slug, permissions:app.rows[0].permissions ?? [], iat:issuedAt, exp:expiresAt };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256',secret).update(encodedPayload).digest('base64url');
    const launchToken = `${encodedPayload}.${signature}`;
    await this.audit.record(actor.tenantId,'MINI_APP_OPENED','mini_app',miniAppId,{slug:app.rows[0].slug,expiresAt},{userId:actor.userId});
    return { ...app.rows[0], launchContext:{token:launchToken,expiresAt:new Date(expiresAt*1000).toISOString(),tenantId:actor.tenantId,userId:actor.userId,miniAppId:app.rows[0].id,permissions:app.rows[0].permissions ?? []} };
  }

  async verifyMiniAppLaunch(actor: Actor, token: string, expectedMiniAppId?: string) {
    const secret = process.env.JASLYN_MINI_APP_SECRET?.trim();
    if (!secret) throw new InternalServerErrorException('Mini app signing secret is not configured');
    const raw = token.trim();
    const parts = raw.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new BadRequestException('Invalid mini app launch token');
    const [encodedPayload, encodedSignature] = parts;
    const expected = createHmac('sha256', secret).update(encodedPayload).digest();
    let supplied: Buffer;
    try { supplied = Buffer.from(encodedSignature, 'base64url'); } catch { throw new BadRequestException('Invalid mini app launch token'); }
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw new ForbiddenException('Invalid mini app launch signature');
    let payload: { v?: number; tenantId?: string; userId?: string; miniAppId?: string; slug?: string; permissions?: string[]; iat?: number; exp?: number };
    try { payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')); } catch { throw new BadRequestException('Invalid mini app launch payload'); }
    const now = Math.floor(Date.now() / 1000);
    if (payload.v !== 1 || !payload.tenantId || !payload.userId || !payload.miniAppId || !payload.slug || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat || payload.exp < now || payload.iat > now + 30) throw new ForbiddenException('Mini app launch token is expired or invalid');
    if (payload.tenantId !== actor.tenantId || payload.userId !== actor.userId) throw new ForbiddenException('Mini app launch token is not valid for this user');
    if (expectedMiniAppId && payload.miniAppId !== expectedMiniAppId) throw new ForbiddenException('Mini app launch token does not match this mini app');
    const app = await this.db.query(`SELECT m.id,m.slug,m.enabled,i.permissions
       FROM mini_apps m
       JOIN mini_app_installs i ON i.tenant_id=m.tenant_id AND i.mini_app_id=m.id AND i.user_id=$2
      WHERE m.tenant_id=$1 AND m.id=$3`, [actor.tenantId, actor.userId, payload.miniAppId]);
    if (!app.rowCount || app.rows[0].enabled !== true || app.rows[0].slug !== payload.slug) throw new ForbiddenException('Mini app is no longer available to this user');
    const installedPermissions = Array.isArray(app.rows[0].permissions) ? app.rows[0].permissions : [];
    const tokenPermissions = Array.isArray(payload.permissions) ? payload.permissions : [];
    const permissionSet = new Set(installedPermissions.map((value: unknown) => String(value)));
    if (tokenPermissions.some((permission: unknown) => !permissionSet.has(String(permission)))) throw new ForbiddenException('Mini app launch permissions are no longer valid');
    return { valid:true, tenantId:actor.tenantId, userId:actor.userId, miniAppId:app.rows[0].id, slug:app.rows[0].slug, permissions:tokenPermissions, expiresAt:new Date(payload.exp * 1000).toISOString() };
  }
  async processExpired() {
    const client = await this.db.connect();
    let locked = false;
    try {
      const lock = await client.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [9817242],
      );
      locked = Boolean(lock.rows[0]?.acquired);
      if (!locked) return { expiredMessages: 0, expiredPins: 0, liveEvents: 0, endedEvents: 0 };

      const result = await client.query(
        `UPDATE messages m SET deleted_at=now(),updated_at=now()
           FROM message_expirations e
          WHERE e.tenant_id=m.tenant_id AND e.message_id=m.id AND e.expires_at<=now() AND m.deleted_at IS NULL
          RETURNING m.tenant_id AS "tenantId",m.id,m.conversation_id AS "conversationId"`,
      );
      for (const row of result.rows) {
        this.realtime.publish({
          type:'message.expired',
          tenantId:row.tenantId,
          conversationId:row.conversationId,
          messageId:row.id,
          data:{expired:true},
        });
      }

      const expiredPins = await client.query(
        `DELETE FROM pinned_messages
          WHERE expires_at IS NOT NULL AND expires_at<=now()
          RETURNING tenant_id AS "tenantId",conversation_id AS "conversationId",message_id AS "messageId"`,
      );
      for (const row of expiredPins.rows) {
        this.realtime.publish({
          type:'message.pinned',
          tenantId:row.tenantId,
          conversationId:row.conversationId,
          messageId:row.messageId,
          data:{messageId:row.messageId,pinned:false,expired:true},
        });
      }

      await client.query('DELETE FROM stories WHERE expires_at<=now()');

      const live = await client.query(
        `UPDATE conversation_events SET status='LIVE',updated_at=now()
           WHERE status='SCHEDULED' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())
           RETURNING tenant_id AS "tenantId",conversation_id AS "conversationId",id`,
      );
      const ended = await client.query(
        `UPDATE conversation_events SET status='ENDED',updated_at=now()
           WHERE status IN ('SCHEDULED','LIVE')
             AND ((ends_at IS NOT NULL AND ends_at<=now())
               OR (ends_at IS NULL AND starts_at + interval '24 hours'<=now()))
           RETURNING tenant_id AS "tenantId",conversation_id AS "conversationId",id`,
      );

      for (const row of live.rows) {
        this.realtime.publish({
          type:'conversation.event.live',
          tenantId:row.tenantId,
          conversationId:row.conversationId,
          data:{eventId:row.id,status:'LIVE'},
        });
      }
      for (const row of ended.rows) {
        this.realtime.publish({
          type:'conversation.event.ended',
          tenantId:row.tenantId,
          conversationId:row.conversationId,
          data:{eventId:row.id,status:'ENDED'},
        });
      }

      return {
        expiredMessages:result.rowCount ?? 0,
        expiredPins:expiredPins.rowCount ?? 0,
        liveEvents:live.rowCount ?? 0,
        endedEvents:ended.rowCount ?? 0,
      };
    } finally {
      if (locked) {
        await client.query('SELECT pg_advisory_unlock($1)', [9817242]).catch(()=>undefined);
      }
      client.release();
    }
  }

  private async assertMember(actor: Actor, conversationId: string) {
    const result = await this.db.query(
      'SELECT 1 FROM conversation_members WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL',
      [actor.tenantId,conversationId,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Conversation not found');
  }
}
