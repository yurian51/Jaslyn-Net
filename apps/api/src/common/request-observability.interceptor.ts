import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { getCorrelationId } from './correlation-context';

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  requestId?: string;
  correlationId?: string;
  route?: { path?: string };
};

type ResponseLike = {
  statusCode?: number;
};

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<RequestLike>();
    const response = context.switchToHttp().getResponse<ResponseLike>();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response, startedAt),
        error: (error: unknown) => this.log(request, response, startedAt, error),
      }),
    );
  }

  private log(request: RequestLike, response: ResponseLike, startedAt: bigint, error?: unknown) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const rawPath = request.route?.path ?? request.originalUrl ?? request.url ?? '/';
    const path = rawPath.split('?')[0] || '/';
    const status = error instanceof HttpException
      ? error.getStatus()
      : response.statusCode && response.statusCode >= 400
        ? response.statusCode
        : error
          ? 500
          : response.statusCode ?? 200;
    const requestId = request.requestId ?? '-';
    const correlationId = request.correlationId ?? getCorrelationId() ?? requestId;

    this.logger.log(JSON.stringify({
      requestId,
      correlationId,
      method: request.method ?? 'UNKNOWN',
      path,
      status,
      durationMs: Number(durationMs.toFixed(2)),
    }));
  }
}
