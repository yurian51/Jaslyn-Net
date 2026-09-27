import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { AiAgentKey, AiPlan, AiPlanStep, AiRiskLevel } from './ai.types';

const AGENTS = [
  ['orchestrator', 'Jaslyn Orchestrator', 'Coordinates specialist agents and verifies cross-domain work.', 'HIGH'],
  ['network', 'Network Agent', 'Devices, interfaces, topology, WAN, QoS and network commands.', 'HIGH'],
  ['subscriber', 'Subscriber Agent', 'Customer service lifecycle, access and entitlement state.', 'HIGH'],
  ['billing', 'Billing Agent', 'Plans, invoices, purchases and commercial state.', 'MEDIUM'],
  ['payment', 'Payment Agent', 'Payment verification, callbacks and reconciliation.', 'HIGH'],
  ['security', 'Security Agent', 'Authorization, tenant isolation, secrets and security events.', 'CRITICAL'],
  ['monitoring', 'Monitoring Agent', 'Telemetry, health, anomalies and operational signals.', 'MEDIUM'],
  ['incident', 'Incident Agent', 'Correlation, RCA, remediation plans and verification.', 'HIGH'],
  ['radius', 'RADIUS Agent', 'AAA, accounting, NAS and session authorization.', 'HIGH'],
  ['workflow', 'Workflow Agent', 'Event-driven automations and operational workflows.', 'HIGH'],
  ['support', 'Support Agent', 'Communication and operator assistance.', 'MEDIUM'],
] as const;

const TOOLS = [
  ['device.health','DEVICE.HEALTH','LOW','DIRECT'],
  ['device.configuration','DEVICE.CONFIGURATION','HIGH','APPROVAL_REQUIRED'],
  ['session.list','SESSION.LIST','LOW','DIRECT'],
  ['session.disconnect','SESSION.DISCONNECT','HIGH','APPROVAL_REQUIRED'],
  ['subscriber.inspect','SUBSCRIBER.INSPECT','LOW','DIRECT'],
  ['subscriber.activate','SUBSCRIBER.ACTIVATE','HIGH','APPROVAL_REQUIRED'],
  ['subscriber.suspend','SUBSCRIBER.SUSPEND','HIGH','APPROVAL_REQUIRED'],
  ['bandwidth.inspect','BANDWIDTH.INSPECT','LOW','DIRECT'],
  ['bandwidth.limit','BANDWIDTH.LIMIT','HIGH','APPROVAL_REQUIRED'],
  ['hotspot.users','HOTSPOT.USERS','LOW','DIRECT'],
  ['payment.reconcile','PAYMENT.RECONCILE','HIGH','APPROVAL_REQUIRED'],
  ['incident.investigate','INCIDENT.INVESTIGATE','MEDIUM','DIRECT'],
  ['incident.remediate','INCIDENT.REMEDIATE','HIGH','APPROVAL_REQUIRED'],
  ['security.audit','SECURITY.AUDIT','MEDIUM','DIRECT'],
] as const;

@Injectable()
export class AiService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  capabilities(_tenantId: string) {
    return {
      agents: AGENTS.map(([key, name, description, risk]) => ({ key, name, description, risk })),
      capabilities: TOOLS.map(([key, capability, risk, executionMode]) => ({ key, capability, risk, executionMode })),
      autonomy: { LOW: 'AUTO', MEDIUM: 'AUTO_OR_APPROVAL', HIGH: 'APPROVAL', CRITICAL: 'APPROVAL_OR_BLOCK' },
      modelProvider: this.config.get<string>('AI_PROVIDER', 'anthropic'),
      architecture: ['agent-orchestrator','skills','dynamic-tool-registry','MCP-gateway','approval-policy','checkpoint-rollback','agent-audit','model-router'],
    };
  }

  tools(_tenantId: string) {
    return TOOLS.map(([key, capability, risk, executionMode]) => ({
      key,
      name: key,
      description: 'JASLYN capability: ' + capability,
      capability,
      risk,
      executionMode,
      schema: {},
    }));
  }

  async createRun(userId: string, tenantId: string, task: string, context: Record<string, unknown>) {
    const correlationId = randomUUID();
    const plan = this.buildPlan(task);
    const risk = this.planRisk(plan);
    const status = plan.steps.some((step) => step.requiresApproval) ? 'WAITING_APPROVAL' : 'PLANNING';
    const result = await this.db.query(
      'INSERT INTO ai_runs (tenant_id, actor_user_id, agent_key, task, status, risk_level, plan, correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at AS "createdAt", status, risk_level AS "riskLevel", plan, correlation_id AS "correlationId"',
      [tenantId, userId, 'orchestrator', task.trim(), status, risk, JSON.stringify(plan), correlationId],
    );
    await this.audit.record(tenantId, 'AI_RUN_CREATED', 'ai_run', result.rows[0].id, { task: task.trim(), risk, context, plan }, { userId, correlationId });
    return { ...result.rows[0], execution: { mode: status === 'WAITING_APPROVAL' ? 'approval_required' : 'planning', message: status === 'WAITING_APPROVAL' ? 'High-risk actions require operator approval before execution.' : 'Plan created.' } };
  }

  async runs(tenantId: string) {
    const result = await this.db.query(
      'SELECT id, agent_key AS "agentKey", task, status, risk_level AS "riskLevel", plan, result, error, correlation_id AS "correlationId", created_at AS "createdAt", started_at AS "startedAt", finished_at AS "finishedAt" FROM ai_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',
      [tenantId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async run(tenantId: string, id: string) {
    const result = await this.db.query(
      'SELECT id, actor_user_id AS "actorUserId", agent_key AS "agentKey", task, status, risk_level AS "riskLevel", plan, result, error, correlation_id AS "correlationId", created_at AS "createdAt", started_at AS "startedAt", finished_at AS "finishedAt" FROM ai_runs WHERE tenant_id=$1 AND id=$2 LIMIT 1',
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('AI run not found');
    return result.rows[0];
  }

  private buildPlan(task: string): AiPlan {
    const text = task.toLowerCase();
    const steps: AiPlanStep[] = [];
    const add = (title: string, agent: AiAgentKey, capability: string, toolKey: string, risk: AiRiskLevel, verify: string) => {
      steps.push({ id: randomUUID(), title, agent, capability, toolKey, risk, requiresApproval: risk === 'HIGH' || risk === 'CRITICAL', verify });
    };
    if (/(slow|latency|packet loss|offline|router|wan|bandwidth|network)/.test(text)) {
      add('Inspect network health and evidence', 'monitoring', 'DEVICE.HEALTH', 'device.health', 'LOW', 'Re-read telemetry after inspection.');
      add('Correlate the network incident', 'incident', 'INCIDENT.INVESTIGATE', 'incident.investigate', 'MEDIUM', 'Confirm evidence supports the incident.');
    }
    if (/(customer|subscriber|user|account|service)/.test(text)) {
      add('Inspect subscriber state', 'subscriber', 'SUBSCRIBER.INSPECT', 'subscriber.inspect', 'LOW', 'Confirm service and entitlement state.');
    }
    if (/(payment|paid|transaction|mpesa|airtel|tigo|reconcile)/.test(text)) {
      add('Reconcile payment lifecycle', 'payment', 'PAYMENT.RECONCILE', 'payment.reconcile', 'HIGH', 'Verify payment, ledger, purchase, entitlement and access state.');
    }
    if (/(radius|aaa|session|disconnect)/.test(text)) {
      add('Inspect AAA and session state', 'radius', 'SESSION.LIST', 'session.list', 'LOW', 'Verify session and accounting evidence.');
    }
    if (/(security|permission|tenant|audit|secret)/.test(text)) {
      add('Inspect security evidence', 'security', 'SECURITY.AUDIT', 'security.audit', 'MEDIUM', 'Confirm tenant and authorization boundaries.');
    }
    if (/(activate|suspend|limit|disconnect|change|reboot|remediate)/.test(text)) {
      add('Prepare controlled remediation', 'orchestrator', 'INCIDENT.REMEDIATE', 'incident.remediate', 'HIGH', 'Verify requested state and rollback availability.');
    }
    if (!steps.length) add('Inspect relevant operational context', 'orchestrator', 'SECURITY.AUDIT', 'security.audit', 'MEDIUM', 'Return only evidence-backed findings.');
    return {
      summary: 'Evidence-first JASLYN NET operational plan.',
      steps,
      stopConditions: [
        'Stop when required evidence is unavailable.',
        'Stop before high or critical actions without explicit approval.',
        'Stop if tenant scope cannot be proven.',
        'Verify every state-changing action before success.',
      ],
    };
  }

  private planRisk(plan: AiPlan): AiRiskLevel {
    if (plan.steps.some((s) => s.risk === 'CRITICAL')) return 'CRITICAL';
    if (plan.steps.some((s) => s.risk === 'HIGH')) return 'HIGH';
    if (plan.steps.some((s) => s.risk === 'MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }
}