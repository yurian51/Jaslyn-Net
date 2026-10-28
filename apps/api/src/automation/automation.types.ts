import { RiskClass } from './automation.catalog';

export type JobStatus = 'PENDING' | 'WAITING_APPROVAL' | 'RUNNING' | 'SUCCEEDED' | 'DENIED' | 'CANCELLED' | 'EXPIRED' | 'DEAD';

export interface JobRow {
  id: string; tenantId: string; ruleId: string; ruleVersion: number; eventId: string; eventType: string;
  actionIndex: number; actionType: string; action: Record<string, unknown>; payload: Record<string, unknown>;
  risk: RiskClass; subjectKey: string | null; concurrencyKey: string | null; status: JobStatus;
  attempts: number; requeueCount: number; maxAttempts: number; timeoutMs: number; approvedBy: string | null; correlationId: string | null;
}
export interface ActionOutcome { result: Record<string, unknown>; noop?: boolean }
