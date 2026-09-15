import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  requestId?: string;
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
        error: () => this.log(request, response, startedAt),
      }),
    );
  }

  private log(request: RequestLike, response: ResponseLike, startedAt: bigint) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const method = request.method ?? 'UNKNOWN';
    const path = request.originalUrl ?? request.url ?? '/';
    const status = response.statusCode ?? 0;
    const requestId = request.requestId ?? '-';

    this.logger.log(JSON.stringify({
      requestId,
      method,
      path,
      status,
      durationMs: Number(durationMs.toFixed(2)),
    }));
  }
}
