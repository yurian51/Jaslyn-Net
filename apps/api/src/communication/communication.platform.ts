import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { Inject } from '@nestjs/common';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CommunicationRealtime } from './communication.realtime';

type Actor = { userId: string; tenantId: string; role: string };

@Injectable()
export class CommunicationPlatformService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly realtime: CommunicationRealtime,
  ) {}

  async listTopics(actor: Actor, conversationId: string) {
    await this.assertMember(actor, conversationId);
    const result = await this.db.query(
      `SELECT t.id,t.name,t.description,t.archived_at AS "archivedAt",
              t.created_at AS "createdAt",t.updated_at AS "updatedAt",
              COALESCE((SELECT COUNT(*) FROM messages m WHERE m.tenant_id=t.tenant_id AND m.topic_id=t.id AND m.deleted_at IS NULL),0)::int AS "messageCount"
         FROM conversation_topics t
        WHERE t.tenant_id=$1 AND t.conversation_id=$2
        ORDER BY t.archived_at NULLS FIRST,t.updated_at DESC,t.name ASC`,
      [actor.tenantId, conversationId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async createTopic(actor: Actor, conversationId: string, name: string, description?: string) {
    await this.assertConversationAdmin(actor, conversationId);
    const normalized = name.trim();
    if (!normalized || normalized.length > 120) throw new BadRequestException('Topic name must contain 1-120 characters');
    try {
      const result = await this.db.query(
        `INSERT INTO conversation_topics (tenant_id,conversation_id,name,description,created_by_user_id)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id,name,description,created_at AS "createdAt",updated_at AS "updatedAt"`,
        [actor.tenantId, conversationId, normalized, description?.trim() || null, actor.userId],
      );
      await this.audit.record(actor.tenantId,'TOPIC_CREATED','conversation_topic',result.rows[0].id,{conversationId,name:normalized},{userId:actor.userId});
      return result.rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('A topic with this name already exists');
      throw error;
    }
  }

  async archiveTopic(actor: Actor, topicId: string) {
    const topic = await this.getTopic(actor, topicId);
    await this.assertConversationAdmin(actor, topic.conversationId);
    const result = await this.db.query(
      `UPDATE conversation_topics SET archived_at=COALESCE(archived_at,now()),updated_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,archived_at AS "archivedAt"`,
      [actor.tenantId, topicId],
    );
    this.realtime.publish({ type:'conversation.topic.updated', tenantId:actor.tenantId, conversationId:topic.conversationId, data:result.rows[0] });
    return result.rows[0];
  }

  async listFolders(actor: Actor) {
    const result = await this.db.query(
      `SELECT id,name,rules,position,created_at AS "createdAt",updated_at AS "updatedAt"
         FROM chat_folders WHERE tenant_id=$1 AND user_id=$2 ORDER BY position ASC,name ASC`,
      [actor.tenantId, actor.userId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async upsertFolder(actor: Actor, input: { name: string; rules?: Record<string, unknown>; position?: number }) {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new BadRequestException('Folder name must contain 1-80 characters');
    const result = await this.db.query(
      `INSERT INTO chat_folders (tenant_id,user_id,name,rules,position)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id,user_id,name)
       DO UPDATE SET rules=EXCLUDED.rules,position=EXCLUDED.position,updated_at=now()
       RETURNING id,name,rules,position,updated_at AS "updatedAt"`,
      [actor.tenantId, actor.userId, name, JSON.stringify(input.rules ?? {}), Math.max(0, Math.trunc(input.position ?? 0))],
    );
    return result.rows[0];
  }

  async deleteFolder(actor: Actor, id: string) {
    const result = await this.db.query(
      'DELETE FROM chat_folders WHERE tenant_id=$1 AND id=$2 AND user_id=$3 RETURNING id',
      [actor.tenantId,id,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Chat folder not found');
    return { deleted:true, id };
  }

  async listCommunities(actor: Actor) {
    const result = await this.db.query(
      `SELECT c.id,c.name,c.slug,c.description,c.created_at AS "createdAt",c.updated_at AS "updatedAt",
              COALESCE((SELECT COUNT(*) FROM community_members cm WHERE cm.tenant_id=c.tenant_id AND cm.community_id=c.id AND cm.left_at IS NULL),0)::int AS "memberCount"
         FROM communities c
        WHERE c.tenant_id=$1
          AND EXISTS (SELECT 1 FROM community_members cm WHERE cm.tenant_id=c.tenant_id AND cm.community_id=c.id AND cm.user_id=$2 AND cm.left_at IS NULL)
        ORDER BY c.updated_at DESC,c.name ASC`,
      [actor.tenantId,actor.userId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async createCommunity(actor: Actor, input: { name: string; slug: string; description?: string }) {
    if (!['OWNER','ADMIN'].includes(actor.role)) throw new BadRequestException('Community administration permission required');
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
    if (!name || !slug) throw new BadRequestException('Community name and slug are required');
    try {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        const community = await client.query(
          `INSERT INTO communities (tenant_id,name,slug,description,created_by_user_id)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id,name,slug,description,created_at AS "createdAt",updated_at AS "updatedAt"`,
          [actor.tenantId,name,slug,input.description?.trim() || null,actor.userId],
        );
        await client.query(
          `INSERT INTO community_members (tenant_id,community_id,user_id,role)
           VALUES ($1,$2,$3,'OWNER')`,
          [actor.tenantId,community.rows[0].id,actor.userId],
        );
        await client.query('COMMIT');
        await this.audit.record(actor.tenantId,'COMMUNITY_CREATED','community',community.rows[0].id,{name,slug},{userId:actor.userId});
        return community.rows[0];
      } catch (error) {
        await client.query('ROLLBACK').catch(()=>undefined);
        throw error;
      } finally { client.release(); }
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Community slug already exists');
      throw error;
    }
  }

  async joinCommunity(actor: Actor, communityId: string) {
    const exists = await this.db.query('SELECT id FROM communities WHERE tenant_id=$1 AND id=$2',[actor.tenantId,communityId]);
    if (!exists.rowCount) throw new NotFoundException('Community not found');
    await this.db.query(
      `INSERT INTO community_members (tenant_id,community_id,user_id,role)
       VALUES ($1,$2,$3,'MEMBER')
       ON CONFLICT (tenant_id,community_id,user_id) DO UPDATE SET left_at=NULL`,
      [actor.tenantId,communityId,actor.userId],
    );
    return { communityId, joined:true };
  }

  async createPoll(actor: Actor, conversationId: string, input: { question: string; options: string[]; anonymous?: boolean; multipleChoice?: boolean; closesAt?: string }) {
    await this.assertMember(actor, conversationId);
    const question = input.question.trim();
    const options = input.options.map(v=>v.trim()).filter(Boolean);
    if (!question || question.length > 500) throw new BadRequestException('Poll question must contain 1-500 characters');
    if (options.length < 2 || options.length > 20) throw new BadRequestException('Polls require 2-20 options');
    const closesAt = input.closesAt ? new Date(input.closesAt) : null;
    if (closesAt && Number.isNaN(closesAt.getTime())) throw new BadRequestException('Invalid closesAt');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const poll = await client.query(
        `INSERT INTO polls (tenant_id,conversation_id,question,anonymous,multiple_choice,closes_at,created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,question,anonymous,multiple_choice,closes_at AS "closesAt"`,
        [actor.tenantId,conversationId,question,input.anonymous===true,input.multipleChoice===true,closesAt?.toISOString() ?? null,actor.userId],
      );
      for (const [position,label] of options.entries()) {
        await client.query(
          'INSERT INTO poll_options (tenant_id,poll_id,label,position) VALUES ($1,$2,$3,$4)',
          [actor.tenantId,poll.rows[0].id,label,position],
        );
      }
      await client.query('COMMIT');
      await this.audit.record(actor.tenantId,'POLL_CREATED','poll',poll.rows[0].id,{conversationId},{userId:actor.userId});
      return this.getPoll(actor,poll.rows[0].id);
    } catch (error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally { client.release(); }
  }

  async getPoll(actor: Actor, pollId: string) {
    const poll = await this.db.query(
      `SELECT p.id,p.conversation_id AS "conversationId",p.question,p.anonymous,p.multiple_choice AS "multipleChoice",
              p.quiz_mode AS "quizMode",p.closes_at AS "closesAt",p.closed_at AS "closedAt"
         FROM polls p
        WHERE p.tenant_id=$1 AND p.id=$2
          AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.tenant_id=p.tenant_id AND cm.conversation_id=p.conversation_id AND cm.user_id=$3 AND cm.left_at IS NULL)`,
      [actor.tenantId,pollId,actor.userId],
    );
    if (!poll.rowCount) throw new NotFoundException('Poll not found');
    const options = await this.db.query(
      `SELECT po.id,po.label,po.position,
              COUNT(pv.id)::int AS "votes",
              EXISTS (SELECT 1 FROM poll_votes mine WHERE mine.tenant_id=po.tenant_id AND mine.poll_id=po.poll_id AND mine.option_id=po.id AND mine.user_id=$2) AS "voted"
         FROM poll_options po
         LEFT JOIN poll_votes pv ON pv.tenant_id=po.tenant_id AND pv.option_id=po.id
        WHERE po.tenant_id=$1 AND po.poll_id=$3
        GROUP BY po.id ORDER BY po.position ASC`,
      [actor.tenantId,actor.userId,pollId],
    );
    return {...poll.rows[0],options:options.rows};
  }

  async votePoll(actor: Actor, pollId: string, optionIds: string[]) {
    const poll = await this.getPoll(actor,pollId);
    if (poll.closedAt || (poll.closesAt && new Date(poll.closesAt).getTime() <= Date.now())) throw new BadRequestException('Poll is closed');
    const unique = [...new Set(optionIds)];
    if (!poll.multipleChoice && unique.length > 1) throw new BadRequestException('This poll accepts one option');
    if (!unique.length || unique.length > 20) throw new BadRequestException('Select at least one option');
    const valid = await this.db.query(
      'SELECT id FROM poll_options WHERE tenant_id=$1 AND poll_id=$2 AND id=ANY($3::uuid[])',
      [actor.tenantId,pollId,unique],
    );
    if (valid.rowCount !== unique.length) throw new BadRequestException('One or more poll options are invalid');
    await this.db.query('DELETE FROM poll_votes WHERE tenant_id=$1 AND poll_id=$2 AND user_id=$3',[actor.tenantId,pollId,actor.userId]);
    for (const optionId of unique) {
      await this.db.query('INSERT INTO poll_votes (tenant_id,poll_id,option_id,user_id) VALUES ($1,$2,$3,$4)',[actor.tenantId,pollId,optionId,actor.userId]);
    }
    await this.audit.record(actor.tenantId,'POLL_VOTED','poll',pollId,{optionIds:unique},{userId:actor.userId});
    return this.getPoll(actor,pollId);
  }

  async createNotification(actor: Actor, input: { userId: string; type: string; title: string; body?: string; resourceType?: string; resourceId?: string }) {
    const target = await this.db.query('SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND is_active=true',[actor.tenantId,input.userId]);
    if (!target.rowCount) throw new NotFoundException('Notification recipient not found');
    const result = await this.db.query(
      `INSERT INTO communication_notifications (tenant_id,user_id,type,title,body,resource_type,resource_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,type,title,body,resource_type AS "resourceType",resource_id AS "resourceId",created_at AS "createdAt"`,
      [actor.tenantId,input.userId,input.type.trim(),input.title.trim(),input.body?.trim() || null,input.resourceType?.trim() || null,input.resourceId || null],
    );
    this.realtime.publish({type:'notification.created',tenantId:actor.tenantId,data:{...result.rows[0],userId:input.userId}});
    return result.rows[0];
  }

  private async assertMember(actor: Actor, conversationId: string) {
    const result = await this.db.query(
      'SELECT 1 FROM conversation_members WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL',
      [actor.tenantId,conversationId,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Conversation not found');
  }

  private async assertConversationAdmin(actor: Actor, conversationId: string) {
    const result = await this.db.query(
      `SELECT cm.role FROM conversation_members cm
       WHERE cm.tenant_id=$1 AND cm.conversation_id=$2 AND cm.user_id=$3 AND cm.left_at IS NULL`,
      [actor.tenantId,conversationId,actor.userId],
    );
    if (!result.rowCount) throw new NotFoundException('Conversation not found');
    if (!['OWNER','ADMIN'].includes(result.rows[0].role)) throw new BadRequestException('Conversation administrator permission required');
  }

  private async getTopic(actor: Actor, topicId: string) {
    const result = await this.db.query(
      `SELECT id,conversation_id AS "conversationId",name FROM conversation_topics
        WHERE tenant_id=$1 AND id=$2`,
      [actor.tenantId,topicId],
    );
    if (!result.rowCount) throw new NotFoundException('Topic not found');
    await this.assertMember(actor,result.rows[0].conversationId);
    return result.rows[0] as {id:string;conversationId:string;name:string};
  }
}
