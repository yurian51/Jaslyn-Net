import { randomUUID } from 'node:crypto';
import { runWithCorrelation } from './correlation-context';

type RequestWithId = {
  headers?: Record<string, string | string[] | undefined>;
  requestId?: string;
  correlationId?: string;
};

type ResponseLike = {
  setHeader(name: string, value: string): void;
};

type NextFunction = () => void;

export class RequestIdMiddleware {
  use(req: RequestWithId, res: ResponseLike, next: NextFunction) {
    const requestHeader = req.headers?.['x-request-id'];
    const correlationHeader = req.headers?.['x-correlation-id'];
    const incomingRequestId = typeof requestHeader === 'string' ? requestHeader.trim() : '';
    const incomingCorrelationId = typeof correlationHeader === 'string' ? correlationHeader.trim() : '';
    const requestId = incomingRequestId && incomingRequestId.length <= 128 ? incomingRequestId : randomUUID();
    const correlationId = incomingCorrelationId && incomingCorrelationId.length <= 128
      ? incomingCorrelationId
      : requestId;

    req.requestId = requestId;
    req.correlationId = correlationId;
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);

    runWithCorrelation(correlationId, next);
  }
}
