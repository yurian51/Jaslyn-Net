export type AiRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AiAgentKey = 'network' | 'subscriber' | 'billing' | 'payment' | 'security' | 'monitoring' | 'incident' | 'radius' | 'workflow' | 'support' | 'orchestrator';
export interface AiPlanStep { id: string; title: string; agent: AiAgentKey; capability: string; toolKey: string; risk: AiRiskLevel; requiresApproval: boolean; verify: string; }
export interface AiPlan { summary: string; steps: AiPlanStep[]; stopConditions: string[]; }