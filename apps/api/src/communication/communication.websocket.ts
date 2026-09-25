import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { CommunicationRealtime, CommunicationEvent } from './communication.realtime';

type SocketContext = { tenantId: string; userId: string; role: string };

@Injectable()
export class CommunicationWebSocket implements OnModuleDestroy {
  private server?: WebSocketServer;
  private readonly sockets = new Map<WebSocket, SocketContext>();

  constructor(private readonly realtime: CommunicationRealtime) {}

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
      client.send(JSON.stringify({ type: 'connected', data: { userId: context.userId }, createdAt: new Date().toISOString() }));
      client.on('close', () => this.sockets.delete(client));
      client.on('error', () => this.sockets.delete(client));
    });
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
    if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string' || typeof payload.role !== 'string') {
      throw new Error('invalid authentication claims');
    }
    return { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
  }

  private broadcast(event: CommunicationEvent) {
    const payload = JSON.stringify(event);
    for (const [client, context] of this.sockets) {
      if (context.tenantId !== event.tenantId || client.readyState !== WebSocket.OPEN) continue;
      client.send(payload);
    }
  }

  onModuleDestroy() {
    for (const client of this.sockets.keys()) client.close();
    this.sockets.clear();
    this.server?.close();
  }
}
