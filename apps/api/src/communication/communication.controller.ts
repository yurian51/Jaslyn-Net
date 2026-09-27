import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CommunicationService } from './communication.service';
import { CommunicationRealtime } from './communication.realtime';
import { CommunicationCommandService } from './communication.command';
import { CommunicationBotService } from './communication.bot';
import { CommunicationPlatformService } from './communication.platform';

class DirectConversationDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
}

class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsOptional() @IsString() @MaxLength(128) idempotencyKey?: string;
  @IsOptional() @IsUUID() replyToMessageId?: string;
  @IsOptional() @IsBoolean() protected?: boolean;
}

class EditMessageDto {
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
}

class ForwardMessageDto {
  @IsUUID() targetConversationId!: string;
}

class ReactionDto {
  @IsString() @MinLength(1) @MaxLength(32) reaction!: string;
}

class PresenceDto {
  @IsIn(['ONLINE','OFFLINE','AWAY','BUSY','INVISIBLE']) status!: 'ONLINE'|'OFFLINE'|'AWAY'|'BUSY'|'INVISIBLE';
}

class ReadDto {
  @IsOptional() @IsUUID() messageId?: string;
}

class CommandDto {
  @IsString() @MinLength(1) @MaxLength(500) command!: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
}

class BotExecuteDto {
  @IsString() @MinLength(1) @MaxLength(500) command!: string;
  @IsOptional() @IsUUID() conversationId?: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
}

class GroupConversationDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isPrivate?: boolean;
}
class MemberDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsIn(['ADMIN','MODERATOR','MEMBER','READ_ONLY']) role?: 'ADMIN'|'MODERATOR'|'MEMBER'|'READ_ONLY';
}
class ChannelDto {
  @IsString() @MinLength(2) @MaxLength(80) slug!: string;
  @IsString() @MinLength(1) @MaxLength(200) publicName!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}
class SupportTicketDto {
  @IsString() @MinLength(1) @MaxLength(160) subject!: string;
  @IsString() @MinLength(1) @MaxLength(100) category!: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','CRITICAL']) priority?: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL';
  @IsOptional() @IsUUID() customerId?: string;
}
class MuteDto {
  @IsOptional() @IsString() until?: string;
}
class NotificationPreferenceDto {
  @IsOptional() @IsBoolean() inApp?: boolean;
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
}

class ScheduleMessageDto {
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsString() scheduledAt!: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
}

class SaveDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class TopicDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
class FolderDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() rules?: Record<string, unknown>;
  @IsOptional() position?: number;
}
class CommunityDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsString() @MinLength(2) @MaxLength(80) slug!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
class PollDto {
  @IsString() @MinLength(1) @MaxLength(500) question!: string;
  @IsString({ each:true }) options!: string[];
  @IsOptional() @IsBoolean() anonymous?: boolean;
  @IsOptional() @IsBoolean() multipleChoice?: boolean;
  @IsOptional() @IsString() closesAt?: string;
}
class PollVoteDto {
  @IsUUID('4', { each:true }) optionIds!: string[];
}
class CommunicationNotificationDto {
  @IsUUID() userId!: string;
  @IsString() @MinLength(1) @MaxLength(64) type!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsString() @MaxLength(80) resourceType?: string;
  @IsOptional() @IsUUID() resourceId?: string;
}

@Controller('communication')
@UseGuards(AuthGuard)
export class CommunicationController {
  constructor(private readonly communication: CommunicationService, private readonly realtime: CommunicationRealtime, private readonly commands: CommunicationCommandService, private readonly bots: CommunicationBotService, private readonly platform: CommunicationPlatformService) {}

  @Post('commands/execute')
  command(@Req() req: AuthenticatedRequest,@Body() dto:CommandDto) {
    return this.commands.execute({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto.command,dto.confirm===true);
  }

  @Get('bots')
  botsList(@Req() req: AuthenticatedRequest) {
    return this.bots.listBots({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Post('bots/:id/execute')
  botExecute(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:BotExecuteDto) {
    return this.bots.execute({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.command,dto.conversationId,dto.confirm===true);
  }

  @Get('conversations')
  conversations(@Req() req: AuthenticatedRequest) {
    return this.communication.listConversations({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Post('conversations/group')
  group(@Req() req: AuthenticatedRequest,@Body() dto:GroupConversationDto) {
    return this.communication.createGroupConversation({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto);
  }

  @Post('conversations/direct')
  direct(@Req() req: AuthenticatedRequest,@Body() dto: DirectConversationDto) {
    return this.communication.createDirectConversation({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto);
  }

  @Get('conversations/:id/messages')
  messages(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Query('limit') limit?:string,@Query('before') before?:string) {
    return this.communication.getConversation({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,Number(limit)||50,before);
  }

  @Post('conversations/:id/messages')
  send(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:SendMessageDto) {
    return this.communication.sendMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto);
  }

  @Patch('messages/:id')
  edit(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:EditMessageDto) {
    return this.communication.editMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.body);
  }

  @Delete('messages/:id')
  delete(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.deleteMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('messages/:id/pin')
  pin(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.pinMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Delete('messages/:id/pin')
  unpin(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.unpinMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('messages/:id/forward')
  forward(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:ForwardMessageDto) {
    return this.communication.forwardMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.targetConversationId);
  }

  @Post('messages/:id/reactions')
  react(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:ReactionDto) {
    return this.communication.react({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.reaction);
  }

  @Get('conversations/:id/pins')
  pins(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.listPinnedMessages({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('conversations/:id/members')
  addMember(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:MemberDto) {
    return this.communication.addMember({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.userId,dto.role);
  }

  @Delete('conversations/:id/members/:userId')
  removeMember(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Param('userId') userId:string) {
    return this.communication.removeMember({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,userId);
  }

  @Post('conversations/:id/archive')
  archive(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.archiveConversation({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Delete('conversations/:id/archive')
  unarchive(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.unarchiveConversation({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('conversations/:id/mute')
  mute(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:MuteDto) {
    return this.communication.muteConversation({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.until);
  }

  @Delete('conversations/:id/mute')
  unmute(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.unmuteConversation({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Get('channels')
  channels(@Req() req: AuthenticatedRequest) {
    return this.communication.listChannels({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Post('channels')
  createChannel(@Req() req: AuthenticatedRequest,@Body() dto:ChannelDto) {
    return this.communication.createChannel({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto);
  }

  @Post('support/tickets')
  createSupportTicket(@Req() req: AuthenticatedRequest,@Body() dto:SupportTicketDto) {
    return this.communication.createSupportTicket({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto);
  }

  @Get('notification-preferences')
  notificationPreferences(@Req() req: AuthenticatedRequest) {
    return this.communication.getNotificationPreferences({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Patch('notification-preferences/:category')
  updateNotificationPreference(@Req() req: AuthenticatedRequest,@Param('category') category:string,@Body() dto:NotificationPreferenceDto) {
    return this.communication.updateNotificationPreference({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},category,dto);
  }

  @Get('conversations/:id/topics')
  topics(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.platform.listTopics({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('conversations/:id/topics')
  createTopic(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:TopicDto) {
    return this.platform.createTopic({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.name,dto.description);
  }

  @Delete('topics/:id')
  archiveTopic(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.platform.archiveTopic({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Get('folders')
  folders(@Req() req: AuthenticatedRequest) {
    return this.platform.listFolders({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Post('folders')
  upsertFolder(@Req() req: AuthenticatedRequest,@Body() dto:FolderDto) {
    return this.platform.upsertFolder({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto);
  }

  @Delete('folders/:id')
  deleteFolder(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.platform.deleteFolder({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Get('communities')
  communities(@Req() req: AuthenticatedRequest) {
    return this.platform.listCommunities({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Post('communities')
  createCommunity(@Req() req: AuthenticatedRequest,@Body() dto:CommunityDto) {
    return this.platform.createCommunity({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto);
  }

  @Post('communities/:id/join')
  joinCommunity(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.platform.joinCommunity({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('conversations/:id/polls')
  createPoll(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:PollDto) {
    return this.platform.createPoll({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto);
  }

  @Get('polls/:id')
  getPoll(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.platform.getPoll({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('polls/:id/vote')
  votePoll(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:PollVoteDto) {
    return this.platform.votePoll({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.optionIds);
  }

  @Post('notifications')
  createNotification(@Req() req: AuthenticatedRequest,@Body() dto:CommunicationNotificationDto) {
    return this.platform.createNotification({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto);
  }

  @Post('conversations/:id/read')
  read(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:ReadDto) {
    return this.communication.markRead({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.messageId);
  }

  @Get('search')
  search(@Req() req: AuthenticatedRequest,@Query('q') q:string,@Query('limit') limit?:string) {
    return this.communication.search({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},q||'',Number(limit)||50);
  }

  @Post('messages/:id/save')
  save(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:SaveDto) {
    return this.communication.saveMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.note);
  }

  @Post('conversations/:id/scheduled-messages')
  schedule(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:ScheduleMessageDto) {
    return this.communication.scheduleMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto);
  }

  @Get('scheduled-messages')
  scheduled(@Req() req: AuthenticatedRequest,@Query('conversationId') conversationId?:string) {
    return this.communication.listScheduledMessages({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},conversationId);
  }

  @Delete('scheduled-messages/:id')
  cancelScheduled(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.cancelScheduledMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Get('saved-messages')
  saved(@Req() req: AuthenticatedRequest) {
    return this.communication.listSavedMessages({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Get('commands/history')
  commandHistory(@Req() req: AuthenticatedRequest) {
    return this.communication.listCommandHistory({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
  }

  @Get('notifications')
  notifications(@Req() req: AuthenticatedRequest,@Query('unreadOnly') unreadOnly?:string) {
    return this.communication.listNotifications({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},unreadOnly==='true');
  }

  @Post('notifications/:id/read')
  notificationRead(@Req() req: AuthenticatedRequest,@Param('id') id:string) {
    return this.communication.markNotificationRead({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id);
  }

  @Post('presence')
  presence(@Req() req: AuthenticatedRequest,@Body() dto:PresenceDto) {
    return this.communication.setPresence({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},dto.status);
  }

  @Get('events')
  events(@Req() req: AuthenticatedRequest,@Res() res:Response) {
    const tenantId=req.user!.tenantId;
    res.status(200);
    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache, no-transform');
    res.setHeader('Connection','keep-alive');
    res.setHeader('X-Accel-Buffering','no');
    res.flushHeaders?.();
    const send=(event:unknown)=>res.write(`data: ${JSON.stringify(event)}\n\n`);
    send({type:'connected',tenantId,createdAt:new Date().toISOString()});
    const unsubscribe=this.realtime.subscribe(event=>{if(event.tenantId===tenantId) send(event);});
    const stopHeartbeat=this.realtime.onHeartbeat(()=>res.write(': keepalive\n\n'));
    const cleanup=()=>{unsubscribe();stopHeartbeat();if(!res.writableEnded)res.end();};
    req.on('close',cleanup);
  }
}
