import { AsyncLocalStorage } from 'node:async_hooks';

export type CorrelationContext = {
  correlationId: string;
};

const storage = new AsyncLocalStorage<CorrelationContext>();

export function runWithCorrelation<T>(correlationId: string, callback: () => T): T {
  return storage.run({ correlationId }, callback);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
