import { randomUUID } from 'node:crypto';

type RequestWithId = {
  headers?: Record<string, string | string[] | undefined>;
  requestId?: string;
};

type ResponseLike = {
  setHeader(name: string, value: string): void;
};

type NextFunction = () => void;

export class RequestIdMiddleware {
  use(req: RequestWithId, res: ResponseLike, next: NextFunction) {
    const header = req.headers?.['x-request-id'];
    const incoming = typeof header === 'string' ? header.trim() : '';
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
