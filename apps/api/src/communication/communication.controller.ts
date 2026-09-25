import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CommunicationService } from './communication.service';
import { CommunicationRealtime } from './communication.realtime';

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

class SaveDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller('communication')
@UseGuards(AuthGuard)
export class CommunicationController {
  constructor(private readonly communication: CommunicationService, private readonly realtime: CommunicationRealtime) {}

  @Get('conversations')
  conversations(@Req() req: AuthenticatedRequest) {
    return this.communication.listConversations({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role});
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

  @Post('messages/:id/forward')
  forward(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:ForwardMessageDto) {
    return this.communication.forwardMessage({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.targetConversationId);
  }

  @Post('messages/:id/reactions')
  react(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() dto:ReactionDto) {
    return this.communication.react({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},id,dto.reaction);
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

  @Get('notifications')
  notifications(@Req() req: AuthenticatedRequest,@Query('unreadOnly') unreadOnly?:string) {
    return this.communication.listNotifications({userId:req.user!.id,tenantId:req.user!.tenantId,role:req.user!.role},unreadOnly==='true');
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
