import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CommunicationRealtime } from './communication.realtime';

type Actor = { userId: string; tenantId: string; role: string };

@Injectable()
export class CommunicationService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly realtime: CommunicationRealtime,
  ) {}

  async listConversations(actor: Actor) {
    const result = await this.db.query(
      `SELECT c.id, c.kind, c.title, c.description, c.is_private AS "isPrivate",
              c.created_at AS "createdAt", c.updated_at AS "updatedAt",
              lm.id AS "lastMessageId", lm.body AS "lastMessageBody", lm.created_at AS "lastMessageAt",
              COALESCE(unread.unread_count,0)::int AS "unreadCount"
         FROM conversations c
         JOIN conversation_members cm ON cm.tenant_id=c.tenant_id AND cm.conversation_id=c.id
                                      AND cm.user_id=$2 AND cm.left_at IS NULL
         LEFT JOIN LATERAL (
           SELECT m.id,m.body,m.created_at FROM messages m
            WHERE m.tenant_id=c.tenant_id AND m.conversation_id=c.id AND m.deleted_at IS NULL
            ORDER BY m.created_at DESC,m.id DESC LIMIT 1
         ) lm ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS unread_count
             FROM messages m
            WHERE m.tenant_id=c.tenant_id AND m.conversation_id=c.id AND m.deleted_at IS NULL
              AND m.created_at > COALESCE((SELECT mr.read_at FROM message_reads mr
                                            WHERE mr.tenant_id=c.tenant_id AND mr.conversation_id=c.id AND mr.user_id=$2), 'epoch'::timestamptz)
         ) unread ON true
        WHERE c.tenant_id=$1
        ORDER BY COALESCE(lm.created_at,c.updated_at) DESC`,
      [actor.tenantId, actor.userId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async getConversation(actor: Actor, id: string, limit = 50, before?: string) {
    await this.assertMember(actor, id);
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 50), 1), 100);
    const result = await this.db.query(
      `SELECT m.id,m.conversation_id AS "conversationId",m.topic_id AS "topicId",
              m.message_type AS "messageType",m.body,m.reply_to_message_id AS "replyToMessageId",
              m.forwarded_from_message_id AS "forwardedFromMessageId",m.protected,
              m.edited_at AS "editedAt",m.deleted_at AS "deletedAt",m.created_at AS "createdAt",
              u.id AS "senderUserId",u.full_name AS "senderName",
              cu.id AS "senderCustomerId",cu.full_name AS "senderCustomerName"
         FROM messages m
         LEFT JOIN users u ON u.tenant_id=m.tenant_id AND u.id=m.sender_user_id
         LEFT JOIN customers cu ON cu.tenant_id=m.tenant_id AND cu.id=m.sender_customer_id
        WHERE m.tenant_id=$1 AND m.conversation_id=$2
          AND ($3::timestamptz IS NULL OR m.created_at < $3)
        ORDER BY m.created_at DESC,m.id DESC
        LIMIT $4`,
      [actor.tenantId, id, before ?? null, safeLimit],
    );
    return { data: result.rows.reverse(), count: result.rowCount ?? 0 };
  }

  async createDirectConversation(actor: Actor, input: { userId?: string; customerId?: string; title?: string }) {
    if ((input.userId ? 1 : 0) + (input.customerId ? 1 : 0) !== 1) throw new BadRequestException('Exactly one userId or customerId is required');
    if (input.userId === actor.userId) throw new BadRequestException('Cannot create a direct conversation with yourself');
    const target = input.userId
      ? await this.db.query(`SELECT id,full_name AS "fullName" FROM users WHERE tenant_id=$1 AND id=$2 AND is_active=true`,[actor.tenantId,input.userId])
      : await this.db.query(`SELECT id,full_name AS "fullName" FROM customers WHERE tenant_id=$1 AND id=$2 AND is_active=true`,[actor.tenantId,input.customerId]);
    if (!target.rowCount) throw new NotFoundException('Conversation target not found');

    const existing = await this.db.query(
      `SELECT c.id FROM conversations c
         JOIN conversation_members a ON a.tenant_id=c.tenant_id AND a.conversation_id=c.id AND a.user_id=$2 AND a.left_at IS NULL
         JOIN conversation_members b ON b.tenant_id=c.tenant_id AND b.conversation_id=c.id AND b.left_at IS NULL
             AND (($3::uuid IS NOT NULL AND b.user_id=$3) OR ($4::uuid IS NOT NULL AND b.customer_id=$4))
        WHERE c.tenant_id=$1 AND c.kind='DIRECT'
          AND (SELECT COUNT(*) FROM conversation_members x WHERE x.tenant_id=c.tenant_id AND x.conversation_id=c.id AND x.left_at IS NULL)=2
        LIMIT 1`,
      [actor.tenantId, actor.userId, input.userId ?? null, input.customerId ?? null],
    );
    if (existing.rowCount) return this.getConversationSummary(actor, existing.rows[0].id);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const conversation = await client.query(`INSERT INTO conversations (tenant_id,kind,title,created_by_user_id) VALUES ($1,'DIRECT',$2,$3) RETURNING id`,[actor.tenantId,input.title?.trim() || target.rows[0].fullName,actor.userId]);
      const id = conversation.rows[0].id as string;
      await client.query(`INSERT INTO conversation_members (tenant_id,conversation_id,user_id,role) VALUES ($1,$2,$3,'OWNER')`,[actor.tenantId,id,actor.userId]);
      if (input.userId) await client.query(`INSERT INTO conversation_members (tenant_id,conversation_id,user_id,role) VALUES ($1,$2,$3,'MEMBER')`,[actor.tenantId,id,input.userId]);
      else await client.query(`INSERT INTO conversation_members (tenant_id,conversation_id,customer_id,role) VALUES ($1,$2,$3,'MEMBER')`,[actor.tenantId,id,input.customerId]);
      await client.query('COMMIT');
      await this.audit.record(actor.tenantId,'CONVERSATION_CREATED','conversation',id,{kind:'DIRECT',targetUserId:input.userId??null,targetCustomerId:input.customerId??null},{userId:actor.userId});
      return this.getConversationSummary(actor,id);
    } catch (error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; }
    finally { client.release(); }
  }

  async sendMessage(actor: Actor, conversationId: string, input: { body: string; idempotencyKey?: string; replyToMessageId?: string; protected?: boolean }) {
    await this.assertMember(actor, conversationId);
    const body = input.body.trim();
    if (!body || body.length > 10_000) throw new BadRequestException('Message body must contain 1-10000 characters');
    if (input.protected && !['OWNER','ADMIN'].includes(actor.role)) throw new BadRequestException('Protected messages require OWNER or ADMIN');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      if (input.replyToMessageId) {
        const reply = await client.query(`SELECT id FROM messages WHERE tenant_id=$1 AND id=$2 AND conversation_id=$3 AND deleted_at IS NULL`,[actor.tenantId,input.replyToMessageId,conversationId]);
        if (!reply.rowCount) throw new NotFoundException('Reply target not found in this conversation');
      }
      if (input.idempotencyKey?.trim()) {
        const existing = await client.query(`SELECT id FROM messages WHERE tenant_id=$1 AND idempotency_key=$2`,[actor.tenantId,input.idempotencyKey.trim()]);
        if (existing.rowCount) { await client.query('ROLLBACK'); return this.getMessage(actor,existing.rows[0].id); }
      }
      const result = await client.query(
        `INSERT INTO messages (tenant_id,conversation_id,sender_user_id,message_type,body,reply_to_message_id,idempotency_key,protected)
         VALUES ($1,$2,$3,'TEXT',$4,$5,$6,$7) RETURNING id`,
        [actor.tenantId,conversationId,actor.userId,body,input.replyToMessageId??null,input.idempotencyKey?.trim()||null,input.protected===true],
      );
      const id = result.rows[0].id as string;
      await client.query(
        `INSERT INTO message_deliveries (tenant_id,message_id,user_id,status)
         SELECT $1,$2,cm.user_id,'SENT'
           FROM conversation_members cm
          WHERE cm.tenant_id=$1 AND cm.conversation_id=$3 AND cm.user_id IS NOT NULL
            AND cm.user_id <> $4 AND cm.left_at IS NULL
         ON CONFLICT (tenant_id,message_id,user_id) DO NOTHING`,
        [actor.tenantId,id,conversationId,actor.userId],
      );
      await client.query(`UPDATE conversations SET updated_at=now() WHERE tenant_id=$1 AND id=$2`,[actor.tenantId,conversationId]);
      await client.query('COMMIT');
      const message = await this.getMessage(actor,id);
      await this.audit.record(actor.tenantId,'MESSAGE_CREATED','message',id,{conversationId,protected:Boolean(input.protected)},{userId:actor.userId});
      this.realtime.publish({type:'message.created',tenantId:actor.tenantId,conversationId,messageId:id,data:message});
      return message;
    } catch(error:any) {
      await client.query('ROLLBACK').catch(()=>undefined);
      if(error?.code==='23505' && input.idempotencyKey) return this.getMessageByIdempotency(actor,input.idempotencyKey);
      throw error;
    } finally { client.release(); }
  }

  async react(actor: Actor, messageId: string, reaction: string) {
    const message = await this.getMessage(actor,messageId);
    const normalized = reaction.trim();
    if (!normalized || normalized.length > 32) throw new BadRequestException('Reaction must contain 1-32 characters');
    await this.db.query(
      `INSERT INTO message_reactions (tenant_id,message_id,user_id,reaction) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id,message_id,user_id,reaction) DO NOTHING`,
      [actor.tenantId,message.id,actor.userId,normalized],
    );
    this.realtime.publish({type:'message.reaction.created',tenantId:actor.tenantId,conversationId:message.conversationId,messageId:message.id,data:{reaction:normalized,userId:actor.userId}});
    return this.getMessage(actor,message.id);
  }

  async markRead(actor: Actor, conversationId: string, messageId?: string) {
    await this.assertMember(actor,conversationId);
    if(messageId){
      const target=await this.db.query(`SELECT id FROM messages WHERE tenant_id=$1 AND id=$2 AND conversation_id=$3`,[actor.tenantId,messageId,conversationId]);
      if(!target.rowCount) throw new NotFoundException('Message not found in this conversation');
    }
    await this.db.query(
      `INSERT INTO message_reads (tenant_id,conversation_id,user_id,last_read_message_id,read_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (tenant_id,conversation_id,user_id)
       DO UPDATE SET last_read_message_id=EXCLUDED.last_read_message_id,read_at=EXCLUDED.read_at`,
      [actor.tenantId,conversationId,actor.userId,messageId??null],
    );
    await this.db.query(`UPDATE conversation_members SET last_read_message_id=$4 WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3`,[actor.tenantId,conversationId,actor.userId,messageId??null]);
    if (messageId) {
      await this.db.query(
        `UPDATE message_deliveries md
            SET status='READ', read_at=now(), delivered_at=COALESCE(delivered_at,now()), updated_at=now()
           WHERE md.tenant_id=$1 AND md.user_id=$2
             AND EXISTS (
               SELECT 1 FROM messages m
                WHERE m.tenant_id=md.tenant_id AND m.id=md.message_id
                  AND m.conversation_id=$3 AND m.created_at <= (
                    SELECT created_at FROM messages WHERE tenant_id=$1 AND id=$4
                  )
             )`,
        [actor.tenantId,actor.userId,conversationId,messageId],
      );
    }
    this.realtime.publish({type:'message.read',tenantId:actor.tenantId,conversationId,data:{userId:actor.userId,messageId:messageId??null}});
    return {conversationId,messageId:messageId??null,read:true};
  }

  async search(actor: Actor, query: string, limit = 50) {
    const q=query.trim();
    if(q.length<2) return {data:[],count:0};
    const safeLimit=Math.min(Math.max(Math.trunc(limit||50),1),100);
    const messages=await this.db.query(
      `SELECT m.id,m.conversation_id AS "conversationId",m.body,m.created_at AS "createdAt",c.title AS "conversationTitle",u.full_name AS "senderName"
         FROM messages m
         JOIN conversation_members cm ON cm.tenant_id=m.tenant_id AND cm.conversation_id=m.conversation_id AND cm.user_id=$1 AND cm.left_at IS NULL
         JOIN conversations c ON c.tenant_id=m.tenant_id AND c.id=m.conversation_id
         LEFT JOIN users u ON u.tenant_id=m.tenant_id AND u.id=m.sender_user_id
        WHERE m.tenant_id=$2 AND m.deleted_at IS NULL AND m.body ILIKE '%'||$3||'%'
        ORDER BY m.created_at DESC LIMIT $4`,
      [actor.userId,actor.tenantId,q,safeLimit],
    );
    const users=await this.db.query(
      `SELECT id,full_name AS "fullName",email,'USER' AS type FROM users
        WHERE tenant_id=$1 AND is_active=true AND (full_name ILIKE '%'||$2||'%' OR email ILIKE '%'||$2||'%')
        ORDER BY full_name LIMIT $3`,[actor.tenantId,q,safeLimit],
    );
    const customers=await this.db.query(
      `SELECT id,full_name AS "fullName",username,'CUSTOMER' AS type FROM customers
        WHERE tenant_id=$1 AND is_active=true AND (full_name ILIKE '%'||$2||'%' OR username ILIKE '%'||$2||'%' OR phone ILIKE '%'||$2||'%')
        ORDER BY full_name LIMIT $3`,[actor.tenantId,q,safeLimit],
    );
    return {data:[...messages.rows.map(row=>({...row,type:'MESSAGE'})),...users.rows,...customers.rows],count:messages.rowCount!+users.rowCount!+customers.rowCount!};
  }

  async saveMessage(actor: Actor, messageId: string, note?: string) {
    const message=await this.getMessage(actor,messageId);
    await this.db.query(`INSERT INTO saved_messages (tenant_id,user_id,message_id,note) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,user_id,message_id) DO UPDATE SET note=EXCLUDED.note`,[actor.tenantId,actor.userId,message.id,note?.trim()||null]);
    return {saved:true,messageId:message.id};
  }

  async listNotifications(actor: Actor, unreadOnly = false) {
    const result=await this.db.query(
      `SELECT id,type,title,body,resource_type AS "resourceType",resource_id AS "resourceId",read_at AS "readAt",created_at AS "createdAt"
       FROM communication_notifications WHERE tenant_id=$1 AND user_id=$2 AND ($3::boolean=false OR read_at IS NULL)
       ORDER BY created_at DESC LIMIT 100`,[actor.tenantId,actor.userId,unreadOnly],
    );
    return {data:result.rows,count:result.rowCount??0};
  }

  async scheduleMessage(actor: Actor, conversationId: string, input: { body: string; scheduledAt: string; timezone?: string; recurrence?: Record<string, unknown> | null }) {
    await this.assertMember(actor, conversationId);
    const body = input.body.trim();
    if (!body || body.length > 10_000) throw new BadRequestException('Scheduled message body must contain 1-10000 characters');
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be a valid future timestamp');
    }
    const result = await this.db.query(
      `INSERT INTO scheduled_messages (tenant_id,conversation_id,created_by_user_id,body,scheduled_at,timezone,recurrence)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,conversation_id AS "conversationId",body,scheduled_at AS "scheduledAt",timezone,recurrence,status,created_at AS "createdAt"`,
      [actor.tenantId, conversationId, actor.userId, body, scheduledAt.toISOString(), input.timezone?.trim() || 'Africa/Dar_es_Salaam', input.recurrence ?? null],
    );
    const item = result.rows[0];
    await this.audit.record(actor.tenantId,'MESSAGE_SCHEDULED','scheduled_message',item.id,{conversationId,scheduledAt:item.scheduledAt},{userId:actor.userId});
    return item;
  }

  async listScheduledMessages(actor: Actor, conversationId?: string) {
    const params: unknown[] = [actor.tenantId, actor.userId];
    const condition = conversationId ? ' AND sm.conversation_id=$3' : '';
    if (conversationId) {
      await this.assertMember(actor, conversationId);
      params.push(conversationId);
    }
    const result = await this.db.query(
      `SELECT sm.id,sm.conversation_id AS "conversationId",sm.body,sm.scheduled_at AS "scheduledAt",sm.timezone,sm.recurrence,sm.status,sm.sent_message_id AS "sentMessageId",sm.created_at AS "createdAt"
         FROM scheduled_messages sm
        WHERE sm.tenant_id=$1 AND sm.created_by_user_id=$2${condition}
        ORDER BY sm.scheduled_at ASC
        LIMIT 200`,
      params,
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async cancelScheduledMessage(actor: Actor, id: string) {
    const result = await this.db.query(
      `UPDATE scheduled_messages
          SET status='CANCELED',updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND created_by_user_id=$3 AND status='SCHEDULED'
        RETURNING id,conversation_id AS "conversationId",status`,
      [actor.tenantId,id,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Scheduled message not found or no longer cancellable');
    await this.audit.record(actor.tenantId,'MESSAGE_SCHEDULE_CANCELED','scheduled_message',id,result.rows[0],{userId:actor.userId});
    return result.rows[0];
  }

  async markNotificationRead(actor: Actor, id: string) {
    const result = await this.db.query(
      `UPDATE communication_notifications SET read_at=COALESCE(read_at,now())
        WHERE tenant_id=$1 AND id=$2 AND user_id=$3
        RETURNING id,read_at AS "readAt"`,
      [actor.tenantId,id,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Notification not found');
    this.realtime.publish({type:'notification.read',tenantId:actor.tenantId,data:{notificationId:id,userId:actor.userId}});
    return {read:true,...result.rows[0]};
  }

  async listSavedMessages(actor: Actor) {
    const result = await this.db.query(
      `SELECT sm.id,sm.message_id AS "messageId",sm.note,sm.created_at AS "createdAt",
              m.conversation_id AS "conversationId",m.body,m.created_at AS "messageCreatedAt"
         FROM saved_messages sm
         JOIN messages m ON m.tenant_id=sm.tenant_id AND m.id=sm.message_id
        WHERE sm.tenant_id=$1 AND sm.user_id=$2
        ORDER BY sm.created_at DESC LIMIT 200`,
      [actor.tenantId,actor.userId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async listCommandHistory(actor: Actor) {
    const result = await this.db.query(
      `SELECT id,command,status,result,error,request_id AS "requestId",created_at AS "createdAt",completed_at AS "completedAt"
         FROM command_executions
        WHERE tenant_id=$1 AND actor_user_id=$2
        ORDER BY created_at DESC LIMIT 100`,
      [actor.tenantId,actor.userId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async setPresence(actor: Actor, status: 'ONLINE'|'OFFLINE'|'AWAY'|'BUSY'|'INVISIBLE') {
    const ttlSeconds=status==='OFFLINE'?60:75;
    await this.db.query(
      `INSERT INTO user_presence (tenant_id,user_id,status,last_seen_at,expires_at,updated_at)
       VALUES ($1,$2,$3,now(),now()+($4*interval '1 second'),now())
       ON CONFLICT (tenant_id,user_id)
       DO UPDATE SET status=EXCLUDED.status,last_seen_at=now(),expires_at=EXCLUDED.expires_at,updated_at=now()`,
      [actor.tenantId,actor.userId,status,ttlSeconds],
    );
    this.realtime.publish({type:'presence.changed',tenantId:actor.tenantId,data:{userId:actor.userId,status}});
    return {userId:actor.userId,status,expiresInSeconds:ttlSeconds};
  }


  async editMessage(actor: Actor, messageId: string, body: string) {
    const nextBody = body.trim();
    if (!nextBody || nextBody.length > 10_000) throw new BadRequestException('Message body must contain 1-10000 characters');
    const existing = await this.db.query(
      `SELECT id,conversation_id AS "conversationId",sender_user_id AS "senderUserId",body,protected
         FROM messages
        WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.tenant_id=$1 AND cm.conversation_id=messages.conversation_id AND cm.user_id=$3 AND cm.left_at IS NULL)`,
      [actor.tenantId, messageId, actor.userId],
    );
    if (!existing.rowCount) throw new NotFoundException('Message not found');
    const message = existing.rows[0];
    if (message.senderUserId !== actor.userId && !['OWNER','ADMIN'].includes(actor.role)) {
      throw new BadRequestException('Only the sender or an authorized operator can edit this message');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO message_edits (tenant_id,message_id,edited_by_user_id,previous_body) VALUES ($1,$2,$3,$4)`,
        [actor.tenantId,messageId,actor.userId,message.body],
      );
      await client.query(
        `UPDATE messages SET body=$3,edited_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [actor.tenantId,messageId,nextBody],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally { client.release(); }
    const updated=await this.getMessage(actor,messageId);
    await this.audit.record(actor.tenantId,'MESSAGE_EDITED','message',messageId,{conversationId:message.conversationId},{userId:actor.userId});
    this.realtime.publish({type:'message.updated',tenantId:actor.tenantId,conversationId:message.conversationId,messageId,data:updated});
    return updated;
  }

  async deleteMessage(actor: Actor, messageId: string) {
    const existing = await this.db.query(
      `SELECT id,conversation_id AS "conversationId",sender_user_id AS "senderUserId",protected
         FROM messages
        WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.tenant_id=$1 AND cm.conversation_id=messages.conversation_id AND cm.user_id=$3 AND cm.left_at IS NULL)`,
      [actor.tenantId,messageId,actor.userId],
    );
    if (!existing.rowCount) throw new NotFoundException('Message not found');
    const message=existing.rows[0];
    if (message.senderUserId !== actor.userId && !['OWNER','ADMIN'].includes(actor.role)) {
      throw new BadRequestException('Only the sender or an authorized operator can delete this message');
    }
    await this.db.query(
      `UPDATE messages SET deleted_at=now(),deleted_by_user_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`,
      [actor.tenantId,messageId,actor.userId],
    );
    await this.audit.record(actor.tenantId,'MESSAGE_DELETED','message',messageId,{conversationId:message.conversationId},{userId:actor.userId});
    this.realtime.publish({type:'message.deleted',tenantId:actor.tenantId,conversationId:message.conversationId,messageId,data:{messageId}});
    return {id:messageId,deleted:true};
  }

  async pinMessage(actor: Actor, messageId: string, duration: '24H'|'7D'|'30D'|'FOREVER' = 'FOREVER') {
    const message = await this.getMessage(actor, messageId);
    if (!['OWNER','ADMIN'].includes(actor.role)) throw new BadRequestException('Pinning requires an authorized conversation operator');
    if (!['24H','7D','30D','FOREVER'].includes(duration)) throw new BadRequestException('Invalid pin duration');

    const expiresAt = duration === 'FOREVER'
      ? null
      : new Date(Date.now() + ({'24H': 24 * 60 * 60 * 1000, '7D': 7 * 24 * 60 * 60 * 1000, '30D': 30 * 24 * 60 * 60 * 1000} as const)[duration]).toISOString();

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 9817241))',
        [`${actor.tenantId}:${message.conversationId}`],
      );
      await client.query(
        'DELETE FROM pinned_messages WHERE tenant_id=$1 AND conversation_id=$2 AND expires_at IS NOT NULL AND expires_at<=now()',
        [actor.tenantId,message.conversationId],
      );
      const count = await client.query(
        'SELECT id FROM pinned_messages WHERE tenant_id=$1 AND conversation_id=$2 ORDER BY created_at ASC LIMIT 1 OFFSET 2',
        [actor.tenantId,message.conversationId],
      );
      if (count.rowCount) {
        await client.query(
          'DELETE FROM pinned_messages WHERE tenant_id=$1 AND id=$2',
          [actor.tenantId,count.rows[0].id],
        );
      }
      await client.query(
        `INSERT INTO pinned_messages (tenant_id,conversation_id,message_id,pinned_by_user_id,expires_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id,conversation_id,message_id)
         DO UPDATE SET expires_at=EXCLUDED.expires_at,pinned_by_user_id=EXCLUDED.pinned_by_user_id`,
        [actor.tenantId,message.conversationId,message.id,actor.userId,expiresAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally {
      client.release();
    }

    await this.audit.record(actor.tenantId,'MESSAGE_PINNED','message',message.id,{conversationId:message.conversationId,duration,expiresAt},{userId:actor.userId});
    this.realtime.publish({type:'message.pinned',tenantId:actor.tenantId,conversationId:message.conversationId,messageId:message.id,data:{messageId:message.id,pinned:true,expiresAt}});
    return {messageId:message.id,pinned:true,expiresAt};
  }

  async unpinMessage(actor: Actor, messageId: string) {
    const message = await this.getMessage(actor, messageId);
    if (!['OWNER','ADMIN'].includes(actor.role)) throw new BadRequestException('Unpinning requires an authorized conversation operator');
    await this.db.query(
      `DELETE FROM pinned_messages WHERE tenant_id=$1 AND conversation_id=$2 AND message_id=$3`,
      [actor.tenantId,message.conversationId,message.id],
    );
    await this.audit.record(actor.tenantId,'MESSAGE_UNPINNED','message',message.id,{conversationId:message.conversationId},{userId:actor.userId});
    this.realtime.publish({type:'message.pinned',tenantId:actor.tenantId,conversationId:message.conversationId,messageId:message.id,data:{messageId:message.id,pinned:false}});
    return {messageId:message.id,pinned:false};
  }

  async forwardMessage(actor: Actor, messageId: string, targetConversationId: string) {
    const source=await this.getMessage(actor,messageId);
    await this.assertMember(actor,targetConversationId);
    if (source.protected && !['OWNER','ADMIN'].includes(actor.role)) {
      throw new BadRequestException('Protected messages cannot be forwarded by this role');
    }
    const result=await this.db.query(
      `INSERT INTO messages (tenant_id,conversation_id,sender_user_id,message_type,body,forwarded_from_message_id,protected)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [actor.tenantId,targetConversationId,actor.userId,source.messageType,source.body,source.id,source.protected],
    );
    const forwarded=await this.getMessage(actor,result.rows[0].id);
    await this.audit.record(actor.tenantId,'MESSAGE_FORWARDED','message',source.id,{targetConversationId,forwardedMessageId:forwarded.id},{userId:actor.userId});
    this.realtime.publish({type:'message.created',tenantId:actor.tenantId,conversationId:targetConversationId,messageId:forwarded.id,data:forwarded});
    return forwarded;
  }

  async createGroupConversation(actor: Actor, input: { title: string; description?: string; isPrivate?: boolean }) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Group title is required');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO conversations (tenant_id,kind,title,description,is_private,created_by_user_id)
         VALUES ($1,'GROUP',$2,$3,$4,$5) RETURNING id`,
        [actor.tenantId,title,input.description?.trim() || null,input.isPrivate !== false,actor.userId],
      );
      const id = result.rows[0].id as string;
      await client.query(`INSERT INTO conversation_members (tenant_id,conversation_id,user_id,role) VALUES ($1,$2,$3,'OWNER')`,[actor.tenantId,id,actor.userId]);
      await client.query('COMMIT');
      await this.audit.record(actor.tenantId,'GROUP_CREATED','conversation',id,{title},{userId:actor.userId});
      return this.getConversationSummary(actor,id);
    } catch (error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; }
    finally { client.release(); }
  }

  private async assertConversationAdmin(actor: Actor, conversationId: string) {
    const result = await this.db.query(
      `SELECT cm.role,c.kind FROM conversation_members cm
       JOIN conversations c ON c.tenant_id=cm.tenant_id AND c.id=cm.conversation_id
       WHERE cm.tenant_id=$1 AND cm.conversation_id=$2 AND cm.user_id=$3 AND cm.left_at IS NULL LIMIT 1`,
      [actor.tenantId,conversationId,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Conversation not found');
    if (!['OWNER','ADMIN'].includes(result.rows[0].role)) throw new BadRequestException('Conversation administrator permission required');
    if (!['GROUP','CHANNEL','SUPPORT','INCIDENT','NOC'].includes(result.rows[0].kind)) throw new BadRequestException('This conversation does not support member administration');
    return result.rows[0];
  }

  async addMember(actor: Actor, conversationId: string, userId: string, role: 'ADMIN'|'MODERATOR'|'MEMBER'|'READ_ONLY' = 'MEMBER') {
    await this.assertConversationAdmin(actor,conversationId);
    const target = await this.db.query(`SELECT id,full_name AS "fullName" FROM users WHERE tenant_id=$1 AND id=$2 AND is_active=true`,[actor.tenantId,userId]);
    if (!target.rowCount) throw new NotFoundException('User not found');
    await this.db.query(
      `INSERT INTO conversation_members (tenant_id,conversation_id,user_id,role) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id,conversation_id,user_id) DO UPDATE SET role=EXCLUDED.role,left_at=NULL`,
      [actor.tenantId,conversationId,userId,role],
    );
    this.realtime.publish({type:'conversation.member.added',tenantId:actor.tenantId,conversationId,data:{userId,role}});
    return {conversationId,userId,fullName:target.rows[0].fullName,role};
  }

  async removeMember(actor: Actor, conversationId: string, userId: string) {
    await this.assertConversationAdmin(actor,conversationId);
    if (userId === actor.userId) throw new BadRequestException('Use leave workflow to remove yourself');
    const result = await this.db.query(`UPDATE conversation_members SET left_at=now() WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL RETURNING user_id AS "userId"`,[actor.tenantId,conversationId,userId]);
    if (!result.rowCount) throw new NotFoundException('Active member not found');
    this.realtime.publish({type:'conversation.member.removed',tenantId:actor.tenantId,conversationId,data:{userId}});
    return {conversationId,userId,removed:true};
  }

  async listPinnedMessages(actor: Actor, conversationId: string) {
    await this.assertMember(actor,conversationId);
    const result = await this.db.query(
      `SELECT p.id,p.message_id AS "messageId",p.pinned_by_user_id AS "pinnedByUserId",p.created_at AS "createdAt",
              m.body,m.created_at AS "messageCreatedAt",u.full_name AS "pinnedByName"
       FROM pinned_messages p JOIN messages m ON m.tenant_id=p.tenant_id AND m.id=p.message_id
       LEFT JOIN users u ON u.tenant_id=p.tenant_id AND u.id=p.pinned_by_user_id
       WHERE p.tenant_id=$1 AND p.conversation_id=$2 AND (p.expires_at IS NULL OR p.expires_at>now()) ORDER BY p.created_at DESC LIMIT 100`,
      [actor.tenantId,conversationId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async archiveConversation(actor: Actor, conversationId: string) {
    await this.assertMember(actor,conversationId);
    await this.db.query(`UPDATE conversations SET archived_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2`,[actor.tenantId,conversationId]);
    this.realtime.publish({type:'conversation.archived',tenantId:actor.tenantId,conversationId,data:{archived:true,userId:actor.userId}});
    return {conversationId,archived:true};
  }

  async unarchiveConversation(actor: Actor, conversationId: string) {
    await this.assertMember(actor,conversationId);
    await this.db.query(`UPDATE conversations SET archived_at=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[actor.tenantId,conversationId]);
    this.realtime.publish({type:'conversation.archived',tenantId:actor.tenantId,conversationId,data:{archived:false,userId:actor.userId}});
    return {conversationId,archived:false};
  }

  async muteConversation(actor: Actor, conversationId: string, until?: string) {
    await this.assertMember(actor,conversationId);
    let mutedUntil: string;
    if (until) {
      const parsed = new Date(until);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) throw new BadRequestException('Mute expiry must be a future timestamp');
      mutedUntil = parsed.toISOString();
    } else mutedUntil = new Date(Date.now()+86400000).toISOString();
    await this.db.query(`UPDATE conversation_members SET muted_until=$4 WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL`,[actor.tenantId,conversationId,actor.userId,mutedUntil]);
    return {conversationId,mutedUntil};
  }

  async unmuteConversation(actor: Actor, conversationId: string) {
    await this.assertMember(actor,conversationId);
    await this.db.query(`UPDATE conversation_members SET muted_until=NULL WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL`,[actor.tenantId,conversationId,actor.userId]);
    return {conversationId,muted:false};
  }

  async listChannels(actor: Actor) {
    const result=await this.db.query(
      `SELECT ch.id,ch.slug,ch.public_name AS "publicName",ch.description,ch.is_public AS "isPublic",
              ch.conversation_id AS "conversationId",ch.created_at AS "createdAt",c.title,c.updated_at AS "updatedAt"
       FROM channels ch JOIN conversations c ON c.tenant_id=ch.tenant_id AND c.id=ch.conversation_id
       WHERE ch.tenant_id=$1 AND (ch.is_public=true OR EXISTS (
         SELECT 1 FROM channel_members cm WHERE cm.tenant_id=ch.tenant_id AND cm.channel_id=ch.id AND cm.user_id=$2 AND cm.left_at IS NULL))
       ORDER BY ch.public_name ASC`,
      [actor.tenantId,actor.userId],
    );
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async createChannel(actor: Actor, input: { slug: string; publicName: string; description?: string; isPublic?: boolean }) {
    if (!['OWNER','ADMIN'].includes(actor.role)) throw new BadRequestException('Channel administration permission required');
    const slug=input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
    const publicName=input.publicName.trim();
    if(!slug || !publicName) throw new BadRequestException('Channel slug and name are required');
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const conversation=await client.query(`INSERT INTO conversations (tenant_id,kind,title,description,is_private,created_by_user_id) VALUES ($1,'CHANNEL',$2,$3,$4,$5) RETURNING id`,[actor.tenantId,publicName,input.description?.trim()||null,input.isPublic!==true,actor.userId]);
      const conversationId=conversation.rows[0].id as string;
      const channel=await client.query(`INSERT INTO channels (tenant_id,conversation_id,slug,public_name,description,is_public) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,slug,public_name AS "publicName",description,is_public AS "isPublic",conversation_id AS "conversationId"`,[actor.tenantId,conversationId,slug,publicName,input.description?.trim()||null,input.isPublic===true]);
      await client.query(`INSERT INTO channel_members (tenant_id,channel_id,user_id,role) VALUES ($1,$2,$3,'OWNER') ON CONFLICT DO NOTHING`,[actor.tenantId,channel.rows[0].id,actor.userId]);
      await client.query('COMMIT');
      await this.audit.record(actor.tenantId,'CHANNEL_CREATED','channel',channel.rows[0].id,{slug,publicName},{userId:actor.userId});
      return channel.rows[0];
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      if((error as any)?.code==='23505') throw new ConflictException('Channel slug already exists');
      throw error;
    } finally { client.release(); }
  }

  async createSupportTicket(actor: Actor, input: { subject: string; category: string; priority?: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL'; customerId?: string }) {
    const subject=input.subject.trim();
    if(!subject) throw new BadRequestException('Support subject is required');
    if(input.customerId) {
      const customer=await this.db.query(`SELECT id FROM customers WHERE tenant_id=$1 AND id=$2 AND is_active=true`,[actor.tenantId,input.customerId]);
      if(!customer.rowCount) throw new NotFoundException('Customer not found');
    }
    const result=await this.db.query(
      `INSERT INTO support_tickets (tenant_id,ticket_number,customer_id,category,priority,subject,created_by_user_id)
       VALUES ($1,'SUP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),$2,$3,$4,$5,$6)
       RETURNING id,ticket_number AS "ticketNumber",customer_id AS "customerId",category,priority,status,subject,created_at AS "createdAt"`,
      [actor.tenantId,input.customerId??null,input.category.trim(),input.priority??'NORMAL',subject,actor.userId],
    );
    await this.audit.record(actor.tenantId,'SUPPORT_TICKET_CREATED','support_ticket',result.rows[0].id,result.rows[0],{userId:actor.userId});
    return result.rows[0];
  }

  async getNotificationPreferences(actor: Actor) {
    const result=await this.db.query(`SELECT category,in_app AS "inApp",push,email,sms,updated_at AS "updatedAt" FROM notification_preferences WHERE tenant_id=$1 AND user_id=$2 ORDER BY category`,[actor.tenantId,actor.userId]);
    return {data:result.rows,count:result.rowCount ?? 0};
  }

  async updateNotificationPreference(actor: Actor, category: string, input: { inApp?: boolean; push?: boolean; email?: boolean; sms?: boolean }) {
    const normalized=category.trim().toLowerCase();
    if(!normalized || normalized.length>64) throw new BadRequestException('Notification category is required');
    const existing=await this.db.query(`SELECT in_app AS "inApp",push,email,sms FROM notification_preferences WHERE tenant_id=$1 AND user_id=$2 AND category=$3 LIMIT 1`,[actor.tenantId,actor.userId,normalized]);
    const current=existing.rows[0] ?? {inApp:true,push:true,email:true,sms:false};
    const values={inApp:input.inApp??current.inApp,push:input.push??current.push,email:input.email??current.email,sms:input.sms??current.sms};
    const result=await this.db.query(
      `INSERT INTO notification_preferences (tenant_id,user_id,category,in_app,push,email,sms,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (tenant_id,user_id,category) DO UPDATE SET in_app=EXCLUDED.in_app,push=EXCLUDED.push,email=EXCLUDED.email,sms=EXCLUDED.sms,updated_at=now()
       RETURNING category,in_app AS "inApp",push,email,sms,updated_at AS "updatedAt"`,
      [actor.tenantId,actor.userId,normalized,values.inApp,values.push,values.email,values.sms],
    );
    this.realtime.publish({type:'notification.preference.updated',tenantId:actor.tenantId,data:{userId:actor.userId,category:normalized}});
    return result.rows[0];
  }

  private async assertMember(actor: Actor, conversationId: string) {
    const result=await this.db.query(`SELECT 1 FROM conversation_members WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL`,[actor.tenantId,conversationId,actor.userId]);
    if(!result.rowCount) throw new NotFoundException('Conversation not found');
  }

  private async getMessage(actor: Actor, messageId: string) {
    const result=await this.db.query(
      `SELECT m.id,m.conversation_id AS "conversationId",m.message_type AS "messageType",m.body,
              m.reply_to_message_id AS "replyToMessageId",m.forwarded_from_message_id AS "forwardedFromMessageId",
              m.protected,m.edited_at AS "editedAt",m.deleted_at AS "deletedAt",m.created_at AS "createdAt",
              u.id AS "senderUserId",u.full_name AS "senderName",cu.id AS "senderCustomerId",cu.full_name AS "senderCustomerName"
         FROM messages m
         LEFT JOIN users u ON u.tenant_id=m.tenant_id AND u.id=m.sender_user_id
         LEFT JOIN customers cu ON cu.tenant_id=m.tenant_id AND cu.id=m.sender_customer_id
        WHERE m.tenant_id=$1 AND m.id=$2
          AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.tenant_id=m.tenant_id AND cm.conversation_id=m.conversation_id AND cm.user_id=$3 AND cm.left_at IS NULL)`,
      [actor.tenantId,messageId,actor.userId],
    );
    if(!result.rowCount) throw new NotFoundException('Message not found');
    const reactions=await this.db.query(`SELECT reaction,count(*)::int AS count FROM message_reactions WHERE tenant_id=$1 AND message_id=$2 GROUP BY reaction ORDER BY reaction`,[actor.tenantId,messageId]);
    return {...result.rows[0],reactions:reactions.rows};
  }

  private async getMessageByIdempotency(actor: Actor, key: string) {
    const result=await this.db.query(`SELECT id FROM messages WHERE tenant_id=$1 AND idempotency_key=$2`,[actor.tenantId,key.trim()]);
    if(!result.rowCount) throw new ConflictException('Message idempotency key conflict could not be resolved');
    return this.getMessage(actor,result.rows[0].id);
  }

  private async getConversationSummary(actor: Actor,id:string){
    await this.assertMember(actor,id);
    const result=await this.db.query(`SELECT c.id,c.kind,c.title,c.description,c.is_private AS "isPrivate",c.created_at AS "createdAt",c.updated_at AS "updatedAt" FROM conversations c WHERE c.tenant_id=$1 AND c.id=$2`,[actor.tenantId,id]);
    if(!result.rowCount) throw new NotFoundException('Conversation not found');
    return result.rows[0];
  }
}
