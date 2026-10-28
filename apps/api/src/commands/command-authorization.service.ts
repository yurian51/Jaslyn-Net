import { Injectable } from '@nestjs/common';

export type CommandOrigin = 'MANUAL' | 'AUTOMATION';

export interface CommandPrincipal {
  userId: string;
  tenantId: string;
  role: string;
  origin?: CommandOrigin;
  /** Label stored on queued network commands. Defaults to the user id. */
  actorLabel?: string;
  automation?: { ruleId: string; jobId: string };
}

export type AuthorizationDecision =
  | { decision: 'ALLOW'; destructive: boolean }
  | { decision: 'REQUIRE_CONFIRMATION'; destructive: true }
  | { decision: 'DENY'; destructive: true; reason: string };

/** Roles allowed to confirm/execute destructive commands. Single source of truth for manual AND automated commands. */
export const OPERATOR_ROLES: ReadonlySet<string> = new Set(['OWNER', 'ADMIN', 'NETWORK_ADMIN', 'NOC_ENGINEER']);

export const DESTRUCTIVE_COMMAND = /^(restart router|suspend subscriber|refund payment|terminate session|disable account|delete message|delete user)\b/i;

export const OPERATOR_REQUIRED_MESSAGE = 'Operator confirmation permission required';

/**
 * The one place that decides whether a command may run. Manual commands (communication center) and
 * automation actions both call it, so tightening a rule here tightens both. It is deliberately
 * dependency-free and pure so it can be unit tested exhaustively.
 */
@Injectable()
export class CommandAuthorizationService {
  isDestructive(command: string): boolean {
    return DESTRUCTIVE_COMMAND.test(command.trim().replace(/\s+/g, ' '));
  }

  authorize(principal: Pick<CommandPrincipal, 'role'>, command: string, options: { confirmed: boolean }): AuthorizationDecision {
    if (!this.isDestructive(command)) return { decision: 'ALLOW', destructive: false };
    if (!OPERATOR_ROLES.has(principal.role)) return { decision: 'DENY', destructive: true, reason: OPERATOR_REQUIRED_MESSAGE };
    if (!options.confirmed) return { decision: 'REQUIRE_CONFIRMATION', destructive: true };
    return { decision: 'ALLOW', destructive: true };
  }
}
