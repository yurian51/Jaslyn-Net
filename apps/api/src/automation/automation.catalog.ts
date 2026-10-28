export type RiskClass = 'LOW' | 'MEDIUM' | 'DESTRUCTIVE';
export type EmitterStatus = 'WIRED';

export interface EventDefinition {
  canonical: string;
  description: string;
  /** Raw outbox event types (communication_domain_events.event_type) that map to this canonical event. */
  rawTypes: readonly string[];
  /** Where it is emitted from. */
  source: string;
  /** Payload path identifying the subject; used for cooldown/concurrency keys. */
  subjectPath: string | null;
  /** Payload fields exposed to conditions and stored on jobs (everything else is dropped). */
  fields: readonly string[];
}

export const EVENT_CATALOG: readonly EventDefinition[] = [
  { canonical: 'device.offline', description: 'A router went OFFLINE.', rawTypes: ['DEVICE.OFFLINE'], source: 'trigger: routers.status', subjectPath: 'routerId',
    fields: ['routerId', 'locationId', 'name', 'vendor', 'previousStatus', 'status', 'source'] },
  { canonical: 'device.recovered', description: 'A router returned ONLINE from OFFLINE/DEGRADED.', rawTypes: ['DEVICE.RECOVERED'], source: 'trigger: routers.status', subjectPath: 'routerId',
    fields: ['routerId', 'locationId', 'name', 'vendor', 'previousStatus', 'status', 'source'] },
  { canonical: 'subscriber.auth_failed', description: 'RADIUS rejected a subscriber login (at most one event per NAS/username/minute).', rawTypes: ['SUBSCRIBER.AUTH_FAILED'], source: 'trigger: radius_events', subjectPath: 'username',
    fields: ['username', 'customerId', 'nasClientId', 'windowSeconds', 'source'] },
  { canonical: 'session.started', description: 'A subscriber session started.', rawTypes: ['SESSION.STARTED', 'RADIUS.SESSION_STARTED'], source: 'trigger: sessions insert; RADIUS accounting START', subjectPath: 'sessionId',
    fields: ['sessionId', 'customerId', 'routerId', 'username', 'nasClientId', 'callingStationId', 'source'] },
  { canonical: 'session.ended', description: 'A subscriber session ended.', rawTypes: ['SESSION.ENDED', 'RADIUS.SESSION_STOPPED'], source: 'SessionsService.end; RADIUS accounting STOP', subjectPath: 'sessionId',
    fields: ['sessionId', 'routerId', 'username', 'nasClientId', 'bytesIn', 'bytesOut', 'bytesTotal', 'previousState', 'inputOctets', 'outputOctets', 'sessionTime', 'source'] },
  { canonical: 'bandwidth.threshold', description: "A router's fairness mode escalated into FAIRNESS_ACTIVE or AGGRESSIVE (its configured activate/aggressive thresholds were crossed).", rawTypes: ['BANDWIDTH.THRESHOLD'], source: 'trigger: traffic_enforcement_events', subjectPath: 'routerId',
    fields: ['routerId', 'locationId', 'mode', 'previousMode', 'direction', 'commandCount', 'applied', 'source'] },
  { canonical: 'payment.completed', description: 'A payment reached PAID.', rawTypes: ['PAYMENT.COMPLETED'], source: 'trigger: payments.status', subjectPath: 'paymentId',
    fields: ['paymentId', 'purchaseId', 'customerId', 'provider', 'amount', 'currency', 'previousStatus', 'status', 'verificationStatus', 'source'] },
  { canonical: 'payment.failed', description: 'A payment reached FAILED.', rawTypes: ['PAYMENT.FAILED'], source: 'trigger: payments.status', subjectPath: 'paymentId',
    fields: ['paymentId', 'purchaseId', 'customerId', 'provider', 'amount', 'currency', 'previousStatus', 'status', 'verificationStatus', 'source'] },
  { canonical: 'entitlement.expired', description: 'A customer access grant (entitlement) expired.', rawTypes: ['ENTITLEMENT.EXPIRED'], source: 'trigger: access_grants.status', subjectPath: 'grantId',
    fields: ['grantId', 'purchaseId', 'customerId', 'routerId', 'endsAt', 'previousStatus', 'source'] },
  { canonical: 'incident.created', description: 'An incident was opened.', rawTypes: ['INCIDENT.CREATED'], source: 'trigger: incidents insert', subjectPath: 'incidentId',
    fields: ['incidentId', 'severity', 'category', 'title', 'rootResourceType', 'rootResourceId', 'routerId', 'source'] },
  { canonical: 'incident.resolved', description: 'An incident was resolved (any path, including manual).', rawTypes: ['INCIDENT.STATUS_RESOLVED'], source: 'trigger: incidents.status', subjectPath: 'incidentId',
    fields: ['incidentId', 'severity', 'category', 'title', 'resolution', 'previousStatus', 'routerId', 'source'] },
  { canonical: 'provider.degraded', description: 'An uplink provider (WAN connection) became DEGRADED or UNAVAILABLE.', rawTypes: ['PROVIDER.DEGRADED'], source: 'trigger: wan_connections.health_state', subjectPath: 'wanConnectionId',
    fields: ['wanConnectionId', 'routerId', 'locationId', 'provider', 'name', 'state', 'previousState', 'latencyMs', 'packetLossPercent', 'utilizationPercent', 'source'] },
] as const;

const BY_CANONICAL = new Map(EVENT_CATALOG.map((e) => [e.canonical, e]));
const RAW_TO_CANONICAL = new Map<string, EventDefinition>();
for (const def of EVENT_CATALOG) for (const raw of def.rawTypes) RAW_TO_CANONICAL.set(raw, def);

/** [rawType, canonical] pairs for SQL joins. */
export const RAW_CANONICAL_PAIRS: ReadonlyArray<readonly [string, string]> =
  EVENT_CATALOG.flatMap((d) => d.rawTypes.map((r) => [r, d.canonical] as const));

export function getEventDefinition(canonical: string) { return BY_CANONICAL.get(canonical); }

export interface ResolvedEventType { stored: string; canonical: string | null; legacy: boolean }

/** Resolves a rule's eventType input. Catalog names/aliases -> canonical lowercase; other uppercase raw types stay legacy. */
export function resolveRuleEventType(input: string): ResolvedEventType | null {
  const trimmed = input.trim();
  if (trimmed === '*') return { stored: '*', canonical: null, legacy: true };
  const lower = trimmed.toLowerCase();
  if (BY_CANONICAL.has(lower)) return { stored: lower, canonical: lower, legacy: false };
  const viaRaw = RAW_TO_CANONICAL.get(trimmed.toUpperCase());
  if (viaRaw) return { stored: viaRaw.canonical, canonical: viaRaw.canonical, legacy: false };
  if (/^[A-Z][A-Z0-9_.-]{1,119}$/.test(trimmed)) return { stored: trimmed, canonical: null, legacy: true };
  return null;
}

export interface NormalizedEvent {
  canonical: string | null;
  rawType: string;
  /** Payload exposed to conditions (catalog fields only for catalog events; {} for legacy events). */
  payload: Record<string, unknown>;
  subject: string | null;
  routerId: string | null;
  locationId: string | null;
}

function str(v: unknown): string | null { return typeof v === 'string' && v ? v : null; }

export function normalizeEvent(rawType: string, payload: Record<string, unknown> | null | undefined, aggregateId?: string | null): NormalizedEvent {
  const raw = (rawType ?? '').trim().toUpperCase();
  const def = RAW_TO_CANONICAL.get(raw);
  const source = payload ?? {};
  if (!def) return { canonical: null, rawType: raw, payload: {}, subject: null, routerId: null, locationId: null };
  const picked: Record<string, unknown> = {};
  for (const field of def.fields) if (Object.prototype.hasOwnProperty.call(source, field)) picked[field] = source[field];
  if (picked.sessionId === undefined && def.fields.includes('sessionId') && raw.startsWith('SESSION.') && aggregateId) picked.sessionId = aggregateId;
  if (picked.source === undefined) picked.source = raw.startsWith('RADIUS.') ? 'RADIUS' : 'SESSIONS';
  const subjectRaw = def.subjectPath ? picked[def.subjectPath] : null;
  return {
    canonical: def.canonical, rawType: raw, payload: picked,
    subject: subjectRaw == null ? null : String(subjectRaw).slice(0, 200),
    routerId: str(picked.routerId), locationId: str(picked.locationId),
  };
}

export interface ActionDefinition {
  type: string;
  risk: RiskClass;
  /** Permission the rule author must hold at creation and the run-as user at every execution. */
  requiredPermission: string;
  description: string;
}

export const ACTION_CATALOG: readonly ActionDefinition[] = [
  { type: 'CREATE_ALERT', risk: 'LOW', requiredPermission: 'automation.manage', description: 'Open an automation alert (one per rule+event).' },
  { type: 'EMIT_WEBHOOK', risk: 'LOW', requiredPermission: 'automation.manage', description: 'Queue a signed webhook to subscribed tenant endpoints.' },
  { type: 'TERMINATE_SESSION', risk: 'DESTRUCTIVE', requiredPermission: 'sessions.revoke', description: 'Disconnect a session via the same command authorization path as the manual "terminate session" command.' },
] as const;

const ACTIONS = new Map(ACTION_CATALOG.map((a) => [a.type, a]));
export function getActionDefinition(type: string) { return ACTIONS.get(type); }
