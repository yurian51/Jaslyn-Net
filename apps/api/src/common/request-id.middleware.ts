import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type RequestWithId = Request & { requestId?: string };

export class RequestIdMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = typeof req.headers['x-request-id'] === 'string'
      ? req.headers['x-request-id'].trim()
      : '';
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
