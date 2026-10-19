import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { CommunicationRealtime, CommunicationEvent } from './communication.realtime';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

type SocketContext = { tenantId: string; userId: string; role: string; sessionId: string };

@Injectable()
export class CommunicationWebSocket implements OnModuleDestroy {
  private server?: WebSocketServer;
  private readonly sockets = new Map<WebSocket, SocketContext>();
  private readonly lastPong = new Map<WebSocket, number>();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(private readonly realtime: CommunicationRealtime, @Inject(PG_POOL) private readonly db: Pool) {}

  attach(httpServer: HttpServer, jwtSecret: string) {
    if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET is required for communication WebSocket');
    this.server = new WebSocketServer({ noServer: true, path: '/api/v1/communication/socket' });
    httpServer.on('upgrade', async (request, socket, head) => {
      const pathname = new URL(request.url || '/', 'http://jaslyn.local').pathname;
      if (pathname !== '/api/v1/communication/socket') return;
      const context = await this.authenticate(request, jwtSecret).catch(() => null);
      if (!context) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.server!.handleUpgrade(request, socket, head, (client) => {
        this.server!.emit('connection', client, request, context);
      });
    });

    this.server.on('connection', (client: WebSocket, _request: IncomingMessage, context: SocketContext) => {
      this.sockets.set(client, context);
      this.lastPong.set(client, Date.now());
      void this.markDelivered(context);
      client.send(JSON.stringify({ type: 'connected', data: { userId: context.userId }, createdAt: new Date().toISOString() }));
      client.on('pong', () => this.lastPong.set(client, Date.now()));
      client.on('message', (raw) => void this.handleClientEvent(client, context, raw.toString()));
      client.on('close', () => { this.sockets.delete(client); this.lastPong.delete(client); });
      client.on('error', () => { this.sockets.delete(client); this.lastPong.delete(client); });
    });
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [client] of this.sockets) {
        if (now - (this.lastPong.get(client) ?? 0) > 75_000) { client.terminate(); continue; }
        if (client.readyState === WebSocket.OPEN) client.ping();
      }
      // Existing connections must also stop receiving events after logout or
      // revocation. One batched lookup avoids an N+1 query per connected socket.
      void this.closeInactiveSessions();
    }, 30_000);
    this.realtime.subscribe((event) => this.broadcast(event));
  }

  private async authenticate(request: IncomingMessage, secret: string): Promise<SocketContext> {
    const url = new URL(request.url || '/', 'http://jaslyn.local');
    const token = url.searchParams.get('access_token')?.trim();
    if (!token) throw new Error('access_token is required');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: 'jaslyn-net',
      audience: 'jaslyn-net-api',
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string'
      || typeof payload.role !== 'string' || typeof payload.sid !== 'string') {
      throw new Error('invalid authentication claims');
    }

    // Keep WebSocket authorization aligned with HTTP requests: a valid JWT alone
    // is insufficient after logout, password reset, or explicit session revocation.
    // Fail closed if the session store is unavailable.
    const session = await this.db.query(
      `SELECT id FROM auth_sessions
       WHERE id=$1 AND tenant_id=$2 AND user_id=$3
         AND revoked_at IS NULL AND expires_at>now()`,
      [payload.sid, payload.tenantId, payload.sub],
    );
    if (!session.rowCount) throw new Error('session has been revoked or expired');

    return { userId: payload.sub, tenantId: payload.tenantId, role: payload.role, sessionId: payload.sid };
  }

  private async closeInactiveSessions() {
    if (this.sockets.size === 0) return;

    const sessionIds = [...new Set([...this.sockets.values()].map((context) => context.sessionId))];
    try {
      const result = await this.db.query<{ id: string }>(
        `SELECT id FROM auth_sessions
         WHERE id = ANY($1::uuid[]) AND revoked_at IS NULL AND expires_at > now()`,
        [sessionIds],
      );
      const activeSessionIds = new Set(result.rows.map((row) => row.id));
      for (const [client, context] of this.sockets) {
        if (!activeSessionIds.has(context.sessionId)) client.close(1008, 'Session expired or revoked');
      }
    } catch {
      // Session state cannot be established reliably; close sockets rather than
      // continue delivering tenant data without a current authorization check.
      for (const client of this.sockets.keys()) client.close(1011, 'Session validation unavailable');
    }
  }

  private async broadcast(event: CommunicationEvent) {
    const payload = JSON.stringify(event);
    for (const [client, context] of this.sockets) {
      if (context.tenantId !== event.tenantId || client.readyState !== WebSocket.OPEN) continue;
      if (event.conversationId) {
        const membership = await this.db.query(
          `SELECT 1 FROM conversation_members
             WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL
             LIMIT 1`,
          [context.tenantId, event.conversationId, context.userId],
        );
        if (!membership.rowCount) continue;
      }
      client.send(payload);
    }
  }

  private async markDelivered(context: SocketContext) {
    const result = await this.db.query(
      `UPDATE message_deliveries SET status='DELIVERED', delivered_at=COALESCE(delivered_at,now()), updated_at=now()
         WHERE tenant_id=$1 AND user_id=$2 AND status='SENT'
         RETURNING message_id AS "messageId"`,
      [context.tenantId, context.userId],
    ).catch(() => ({ rows: [] } as any));
    for (const row of result.rows ?? []) {
      this.realtime.publish({
        type: 'message.delivered',
        tenantId: context.tenantId,
        messageId: row.messageId,
        data: { userId: context.userId, messageId: row.messageId },
      });
    }
  }

  private async handleClientEvent(client: WebSocket, context: SocketContext, raw: string) {
    let event: any;
    try { event = JSON.parse(raw); } catch { return; }
    const type = typeof event?.type === 'string' ? event.type : '';
    const conversationId = typeof event?.conversationId === 'string' ? event.conversationId : null;
    if (!conversationId || !['typing.started','typing.stopped'].includes(type)) return;
    const membership = await this.db.query(
      `SELECT 1 FROM conversation_members WHERE tenant_id=$1 AND conversation_id=$2 AND user_id=$3 AND left_at IS NULL LIMIT 1`,
      [context.tenantId, conversationId, context.userId],
    ).catch(() => ({ rowCount: 0 } as any));
    if (!membership.rowCount) return;
    this.realtime.publish({
      type,
      tenantId: context.tenantId,
      conversationId,
      data: { userId: context.userId },
    });
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const client of this.sockets.keys()) client.close();
    this.sockets.clear();
    this.lastPong.clear();
    this.server?.close();
  }
}
