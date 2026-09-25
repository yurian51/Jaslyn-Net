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

  async pinMessage(actor: Actor, messageId: string) {
    const message = await this.getMessage(actor, messageId);
    if (!['OWNER','ADMIN'].includes(actor.role)) throw new BadRequestException('Pinning requires an authorized conversation operator');
    await this.db.query(
      `INSERT INTO pinned_messages (tenant_id,conversation_id,message_id,pinned_by_user_id)
       VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,conversation_id,message_id) DO NOTHING`,
      [actor.tenantId,message.conversationId,message.id,actor.userId],
    );
    await this.audit.record(actor.tenantId,'MESSAGE_PINNED','message',message.id,{conversationId:message.conversationId},{userId:actor.userId});
    this.realtime.publish({type:'message.pinned',tenantId:actor.tenantId,conversationId:message.conversationId,messageId:message.id,data:{messageId:message.id,pinned:true}});
    return {messageId:message.id,pinned:true};
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
