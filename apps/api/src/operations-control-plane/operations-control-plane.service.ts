import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreateControlRecordDto, CreateTopologyEdgeDto, UpdateControlRecordDto, UpsertTopologyNodeDto } from './operations-control-plane.dto';
import { CreateSignatureEvidenceDto, LinkSignatureEvidenceDto } from './signature-evidence.dto';

@Injectable()
export class OperationsControlPlaneService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  async upsertNode(tenantId:string, actorId:string, d:UpsertTopologyNodeDto) {
    const r=await this.db.query(`INSERT INTO network_topology_nodes(tenant_id,node_type,resource_id,name,status,metadata,observed_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(tenant_id,node_type,resource_id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,metadata=EXCLUDED.metadata,observed_at=EXCLUDED.observed_at,updated_at=now()
      RETURNING id,node_type AS "nodeType",resource_id AS "resourceId",name,status,metadata,observed_at AS "observedAt",updated_at AS "updatedAt"`,
      [tenantId,d.nodeType,d.resourceId??null,d.name.trim(),d.status??'UNKNOWN',JSON.stringify(d.metadata??{}),d.observedAt??null]);
    await this.audit.record(tenantId,'TOPOLOGY_NODE_UPSERTED','network_topology_node',r.rows[0].id,{nodeType:d.nodeType,status:r.rows[0].status},{userId:actorId});
    return r.rows[0];
  }
  async addEdge(tenantId:string, actorId:string, d:CreateTopologyEdgeDto) {
    if(d.sourceNodeId===d.targetNodeId) throw new BadRequestException('A topology edge cannot connect a node to itself');
    const r=await this.db.query(`INSERT INTO network_topology_edges(tenant_id,source_node_id,target_node_id,relation,metadata)
      SELECT $1,s.id,t.id,$4,$5::jsonb FROM network_topology_nodes s JOIN network_topology_nodes t ON t.tenant_id=s.tenant_id
      WHERE s.tenant_id=$1 AND s.id=$2 AND t.id=$3 ON CONFLICT(tenant_id,source_node_id,target_node_id,relation) DO UPDATE SET metadata=EXCLUDED.metadata
      RETURNING id,source_node_id AS "sourceNodeId",target_node_id AS "targetNodeId",relation,metadata`,
      [tenantId,d.sourceNodeId,d.targetNodeId,d.relation??'DEPENDS_ON',JSON.stringify(d.metadata??{})]);
    if(!r.rowCount) throw new NotFoundException('Both topology nodes must exist in this tenant');
    await this.audit.record(tenantId,'TOPOLOGY_EDGE_UPSERTED','network_topology_edge',r.rows[0].id,{sourceNodeId:d.sourceNodeId,targetNodeId:d.targetNodeId,relation:r.rows[0].relation},{userId:actorId});
    return r.rows[0];
  }
  async topology(tenantId:string) {
    const [nodes,edges]=await Promise.all([
      this.db.query(`SELECT id,node_type AS "nodeType",resource_id AS "resourceId",name,status,metadata,observed_at AS "observedAt",updated_at AS "updatedAt" FROM network_topology_nodes WHERE tenant_id=$1 ORDER BY node_type,name LIMIT 5000`,[tenantId]),
      this.db.query(`SELECT id,source_node_id AS "sourceNodeId",target_node_id AS "targetNodeId",relation,metadata FROM network_topology_edges WHERE tenant_id=$1 ORDER BY created_at LIMIT 10000`,[tenantId])]);
    const byId=new Map(nodes.rows.map(n=>[n.id,n]));
    const impacts=edges.rows.map(e=>({...e,source:byId.get(e.sourceNodeId)?.name??null,target:byId.get(e.targetNodeId)?.name??null}));
    const down=nodes.rows.filter(n=>n.status==='DOWN'||n.status==='DEGRADED');
    const staleThresholdSeconds=300;
    const freshness=await this.db.query(`SELECT
      COUNT(*) FILTER (WHERE observed_at IS NULL)::int AS "neverObserved",
      COUNT(*) FILTER (WHERE observed_at IS NOT NULL AND observed_at < now() - ($2::int * interval '1 second'))::int AS "staleObservations",
      MAX(observed_at) AS "latestObservationAt"
      FROM network_topology_nodes WHERE tenant_id=$1`,[tenantId,staleThresholdSeconds]);
    return {data:{nodes:nodes.rows,edges:impacts,summary:{
      nodes:nodes.rowCount,edges:edges.rowCount,down:down.filter(n=>n.status==='DOWN').length,
      degraded:down.filter(n=>n.status==='DEGRADED').length,
      neverObserved:freshness.rows[0].neverObserved,staleObservations:freshness.rows[0].staleObservations,
      latestObservationAt:freshness.rows[0].latestObservationAt,staleThresholdSeconds
    },source:'tenant-scoped topology records; status and freshness are only as reliable as adapter observations',generatedAt:new Date().toISOString()}};
  }
  async affected(tenantId:string,nodeId:string) {
    const exists=await this.db.query('SELECT id,name,status FROM network_topology_nodes WHERE tenant_id=$1 AND id=$2',[tenantId,nodeId]);
    if(!exists.rowCount) throw new NotFoundException('Topology node not found in this tenant');
    const r=await this.db.query(`WITH RECURSIVE impact(id,depth,path) AS (
      SELECT target_node_id,1,ARRAY[source_node_id,target_node_id] FROM network_topology_edges WHERE tenant_id=$1 AND source_node_id=$2
      UNION ALL SELECT e.target_node_id,i.depth+1,i.path||e.target_node_id FROM network_topology_edges e JOIN impact i ON e.source_node_id=i.id
      WHERE e.tenant_id=$1 AND i.depth<20 AND NOT e.target_node_id=ANY(i.path))
      SELECT DISTINCT n.id,n.node_type AS "nodeType",n.name,n.status,MIN(i.depth)::int AS "dependencyDepth"
      FROM impact i JOIN network_topology_nodes n ON n.tenant_id=$1 AND n.id=i.id GROUP BY n.id,n.node_type,n.name,n.status ORDER BY "dependencyDepth",n.name LIMIT 2000`,[tenantId,nodeId]);
    return {root:exists.rows[0],affected:r.rows,method:'bounded dependency graph traversal',generatedAt:new Date().toISOString()};
  }
  async createRecord(tenantId:string, actorId:string, d:CreateControlRecordDto) {
    try {
      const r=await this.db.query(`INSERT INTO operations_control_records(tenant_id,record_type,title,description,status,priority,resource_type,resource_id,customer_id,due_at,idempotency_key,payload,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$13) RETURNING id,record_type AS "recordType",title,description,status,priority,resource_type AS "resourceType",resource_id AS "resourceId",customer_id AS "customerId",due_at AS "dueAt",payload,created_at AS "createdAt",updated_at AS "updatedAt"`,
        [tenantId,d.recordType,d.title.trim(),d.description?.trim()??null,d.status??'OPEN',d.priority??'NORMAL',d.resourceType??null,d.resourceId??null,d.customerId??null,d.dueAt??null,d.idempotencyKey??null,JSON.stringify(d.payload??{}),actorId]);
      await this.db.query(`INSERT INTO operations_control_events(tenant_id,record_id,actor_user_id,event_type,note,metadata) VALUES($1,$2,$3,'CREATED',$4,$5::jsonb)`,[tenantId,r.rows[0].id,actorId,d.description??null,JSON.stringify({recordType:d.recordType})]);
      await this.audit.record(tenantId,'OPERATIONS_RECORD_CREATED','operations_control_record',r.rows[0].id,{recordType:d.recordType,priority:d.priority??'NORMAL'},{userId:actorId});
      return r.rows[0];
    } catch(e:unknown) {
      const code=(e as {code?:string})?.code;
      if(code==='23505') throw new ConflictException('Idempotency key already exists for this record type');
      if(code==='23503') throw new NotFoundException('Referenced customer or resource was not found in this tenant');
      throw e;
    }
  }
  async listRecords(tenantId:string,type?:string,status?:string) {
    const allowed=['CONFIG_SNAPSHOT','CHANGE_PLAN','TICKET','RUNBOOK','INTEGRATION','ASSET','MAINTENANCE','SECURITY_EVENT','BACKUP_DRILL','COMMUNICATION','REVENUE_FINDING','SLA_EVENT','FIELD_WORK_ORDER'];
    if(type&&!allowed.includes(type)) throw new BadRequestException('Unsupported operations record type');
    const allowedStatuses=['OPEN','IN_PROGRESS','RESOLVED','CLOSED','BLOCKED','APPROVAL_REQUIRED'];
    if(status&&!allowedStatuses.includes(status)) throw new BadRequestException('Unsupported operations record status');
    const r=await this.db.query(`SELECT id,record_type AS "recordType",title,description,status,priority,resource_type AS "resourceType",resource_id AS "resourceId",customer_id AS "customerId",due_at AS "dueAt",payload,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM operations_control_records WHERE tenant_id=$1 AND ($2::text IS NULL OR record_type=$2) AND ($3::text IS NULL OR status=$3) ORDER BY priority DESC,created_at DESC LIMIT 1000`,[tenantId,type??null,status??null]);
    return {data:r.rows,count:r.rowCount};
  }
  async updateRecord(tenantId:string,actorId:string,id:string,d:UpdateControlRecordDto) {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const old=await client.query('SELECT * FROM operations_control_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!old.rowCount) throw new NotFoundException('Operations record not found in this tenant');
      const prev=old.rows[0];
      const next=await client.query(`UPDATE operations_control_records SET status=COALESCE($3,status),priority=COALESCE($4,priority),description=COALESCE($5,description),payload=CASE WHEN $6::jsonb IS NULL THEN payload ELSE $6::jsonb END,updated_by=$7,updated_at=now() WHERE tenant_id=$1 AND id=$2
        RETURNING id,record_type AS "recordType",title,description,status,priority,payload,updated_at AS "updatedAt"`,[tenantId,id,d.status??null,d.priority??null,d.description??null,d.payload?JSON.stringify(d.payload):null,actorId]);
      await client.query(`INSERT INTO operations_control_events(tenant_id,record_id,actor_user_id,event_type,note,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[tenantId,id,actorId,d.status&&d.status!==prev.status?'STATUS_CHANGED':'UPDATED',d.note??null,JSON.stringify({fromStatus:prev.status,toStatus:d.status??prev.status,fromPriority:prev.priority,toPriority:d.priority??prev.priority})]);
      await client.query('COMMIT');
      await this.audit.record(tenantId,'OPERATIONS_RECORD_UPDATED','operations_control_record',id,{status:next.rows[0].status,priority:next.rows[0].priority},{userId:actorId});
      return next.rows[0];
    } catch(e) { await client.query('ROLLBACK').catch(()=>undefined); throw e; }
    finally { client.release(); }
  }

  async rootCause(tenantId:string) {
    const r=await this.db.query(`WITH RECURSIVE upstream(node_id,depth,path) AS (
      SELECT e.source_node_id,1,ARRAY[e.target_node_id,e.source_node_id] FROM network_topology_edges e
      WHERE e.tenant_id=$1 AND e.target_node_id IN (SELECT id FROM network_topology_nodes WHERE tenant_id=$1 AND status IN ('DOWN','DEGRADED'))
      UNION ALL SELECT e.source_node_id,u.depth+1,u.path||e.source_node_id FROM network_topology_edges e JOIN upstream u ON e.target_node_id=u.node_id
      WHERE e.tenant_id=$1 AND u.depth<20 AND NOT e.source_node_id=ANY(u.path))
      SELECT n.id,n.node_type AS "nodeType",n.name,n.status,MIN(u.depth)::int AS "dependencyDepth",
      (CASE WHEN n.status='DOWN' THEN 100 WHEN n.status='DEGRADED' THEN 65 ELSE 10 END) AS "evidenceScore"
      FROM upstream u JOIN network_topology_nodes n ON n.tenant_id=$1 AND n.id=u.node_id
      GROUP BY n.id,n.node_type,n.name,n.status ORDER BY "evidenceScore" DESC,"dependencyDepth" ASC LIMIT 100`,[tenantId]);
    const alarms=await this.db.query(`SELECT id,title,priority,status,resource_type AS "resourceType",resource_id AS "resourceId",created_at AS "createdAt"
      FROM operations_control_records WHERE tenant_id=$1 AND record_type IN ('SECURITY_EVENT','SLA_EVENT','TICKET') AND status NOT IN ('RESOLVED','CLOSED')
      ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,created_at DESC LIMIT 100`,[tenantId]);
    return {method:'topology dependency correlation; candidate ranking only, not causal proof',candidates:r.rows,openSignals:alarms.rows,generatedAt:new Date().toISOString()};
  }
  async slaSummary(tenantId:string) {
    const r=await this.db.query(`SELECT status,priority,COUNT(*)::int AS count,MIN(created_at) AS "oldestAt",
      COUNT(*) FILTER(WHERE due_at IS NOT NULL AND due_at<now() AND status NOT IN ('RESOLVED','CLOSED'))::int AS "overdue"
      FROM operations_control_records WHERE tenant_id=$1 AND record_type IN ('SLA_EVENT','TICKET') GROUP BY status,priority ORDER BY status,priority`,[tenantId]);
    return {data:r.rows,generatedAt:new Date().toISOString(),note:'Record-based operational SLA queue summary; availability percentages require verified monitoring samples and exclusions.'};
  }


  async createEvidence(tenantId:string, actorId:string, d:CreateSignatureEvidenceDto) {
    try {
      const r=await this.db.query(`INSERT INTO signature_evidence
        (tenant_id,evidence_type,subject_type,subject_id,source_type,source_ref,observed_at,confidence,payload,idempotency_key,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
        RETURNING id,evidence_type AS "evidenceType",subject_type AS "subjectType",subject_id AS "subjectId",
          source_type AS "sourceType",source_ref AS "sourceRef",observed_at AS "observedAt",
          recorded_at AS "recordedAt",confidence,payload,idempotency_key AS "idempotencyKey"`,
        [tenantId,d.evidenceType,d.subjectType,d.subjectId,d.sourceType,d.sourceRef??null,d.observedAt,d.confidence??null,JSON.stringify(d.payload??{}),d.idempotencyKey??null,actorId]);
      await this.audit.record(tenantId,'SIGNATURE_EVIDENCE_RECORDED','signature_evidence',r.rows[0].id,
        {evidenceType:d.evidenceType,subjectType:d.subjectType,sourceType:d.sourceType},{userId:actorId});
      return r.rows[0];
    } catch(e:unknown) {
      if((e as {code?:string})?.code==='23505') throw new ConflictException('Evidence idempotency key already exists');
      throw e;
    }
  }

  async listEvidence(tenantId:string, subjectType?:string, subjectId?:string, evidenceType?:string) {
    if(Boolean(subjectType)!==Boolean(subjectId)) throw new BadRequestException('subjectType and subjectId must be supplied together');
    const r=await this.db.query(`SELECT id,evidence_type AS "evidenceType",subject_type AS "subjectType",subject_id AS "subjectId",
      source_type AS "sourceType",source_ref AS "sourceRef",observed_at AS "observedAt",recorded_at AS "recordedAt",
      confidence,payload,created_by AS "createdBy",
      (observed_at < now() - interval '5 minutes') AS "olderThanFiveMinutes"
      FROM signature_evidence WHERE tenant_id=$1
      AND ($2::text IS NULL OR subject_type=$2) AND ($3::text IS NULL OR subject_id=$3)
      AND ($4::text IS NULL OR evidence_type=$4)
      ORDER BY observed_at DESC,id DESC LIMIT 500`,[tenantId,subjectType??null,subjectId??null,evidenceType??null]);
    return {data:r.rows,count:r.rowCount,limit:500,generatedAt:new Date().toISOString(),
      note:'Evidence freshness is based on observed_at; source attribution does not independently verify the source claim.'};
  }

  async linkEvidence(tenantId:string, actorId:string, d:LinkSignatureEvidenceDto) {
    if(d.fromEvidenceId===d.toEvidenceId) throw new BadRequestException('Evidence cannot link to itself');
    const r=await this.db.query(`INSERT INTO signature_evidence_links(tenant_id,from_evidence_id,to_evidence_id,relation,created_by)
      SELECT $1,a.id,b.id,$4,$5 FROM signature_evidence a JOIN signature_evidence b ON b.tenant_id=a.tenant_id
      WHERE a.tenant_id=$1 AND a.id=$2 AND b.id=$3
      ON CONFLICT(tenant_id,from_evidence_id,to_evidence_id,relation) DO UPDATE SET relation=EXCLUDED.relation
      RETURNING id,from_evidence_id AS "fromEvidenceId",to_evidence_id AS "toEvidenceId",relation,created_at AS "createdAt"`,
      [tenantId,d.fromEvidenceId,d.toEvidenceId,d.relation,actorId]);
    if(!r.rowCount) throw new NotFoundException('Both evidence records must exist in this tenant');
    await this.audit.record(tenantId,'SIGNATURE_EVIDENCE_LINKED','signature_evidence_link',r.rows[0].id,
      {relation:d.relation,fromEvidenceId:d.fromEvidenceId,toEvidenceId:d.toEvidenceId},{userId:actorId});
    return r.rows[0];
  }

  async evidenceLineage(tenantId:string, evidenceId:string) {
    const exists=await this.db.query('SELECT id,evidence_type AS "evidenceType",subject_type AS "subjectType",subject_id AS "subjectId",source_type AS "sourceType",observed_at AS "observedAt" FROM signature_evidence WHERE tenant_id=$1 AND id=$2',[tenantId,evidenceId]);
    if(!exists.rowCount) throw new NotFoundException('Evidence record not found in this tenant');
    const r=await this.db.query(`WITH RECURSIVE lineage(id,from_id,to_id,relation,depth,path) AS (
      SELECT l.id,l.from_evidence_id,l.to_evidence_id,l.relation,1,ARRAY[l.from_evidence_id,l.to_evidence_id]
      FROM signature_evidence_links l WHERE l.tenant_id=$1 AND (l.from_evidence_id=$2 OR l.to_evidence_id=$2)
      UNION ALL
      SELECT l.id,l.from_evidence_id,l.to_evidence_id,l.relation,x.depth+1,x.path||l.to_evidence_id
      FROM signature_evidence_links l JOIN lineage x ON l.from_evidence_id=x.to_id
      WHERE l.tenant_id=$1 AND x.depth<12 AND NOT l.to_evidence_id=ANY(x.path))
      SELECT DISTINCT x.id,x.from_id AS "fromEvidenceId",x.to_id AS "toEvidenceId",x.relation,x.depth,
        a.evidence_type AS "fromType",a.subject_type AS "fromSubjectType",a.subject_id AS "fromSubjectId",
        b.evidence_type AS "toType",b.subject_type AS "toSubjectType",b.subject_id AS "toSubjectId"
      FROM lineage x JOIN signature_evidence a ON a.tenant_id=$1 AND a.id=x.from_id
      JOIN signature_evidence b ON b.tenant_id=$1 AND b.id=x.to_id ORDER BY x.depth LIMIT 500`,[tenantId,evidenceId]);
    return {root:exists.rows[0],links:r.rows,depthLimit:12,generatedAt:new Date().toISOString(),
      note:'Lineage shows explicitly recorded links only; it does not infer missing relationships.'};
  }

  async events(tenantId:string,id:string) {
    const exists=await this.db.query('SELECT id FROM operations_control_records WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!exists.rowCount) throw new NotFoundException('Operations record not found in this tenant');
    const r=await this.db.query(`SELECT id,actor_user_id AS "actorUserId",event_type AS "eventType",note,metadata,created_at AS "createdAt" FROM operations_control_events WHERE tenant_id=$1 AND record_id=$2 ORDER BY created_at DESC LIMIT 500`,[tenantId,id]);
    return {data:r.rows};
  }
}
