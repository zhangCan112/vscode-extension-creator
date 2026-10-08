export const RELATION_TYPE_IDS = ["parent-child", "spouse", "sibling", "rival", "secret-lover"] as const;

export type RelationType = (typeof RELATION_TYPE_IDS)[number];

export interface Deity {
  id: string;
  name: string;
  title: string;
  domain: string;
}

export interface Relation {
  a: string;
  b: string;
  type: RelationType;
  status?: string;
  note?: string;
}

export interface GreekData {
  deities: Deity[];
  relations: Relation[];
}

export function isRelationType(v: unknown): v is RelationType {
  return typeof v === "string" && (RELATION_TYPE_IDS as readonly string[]).includes(v);
}

function isDeity(v: unknown): v is Deity {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const d = v as Record<string, unknown>;
  return typeof d.id === "string" && typeof d.name === "string" && typeof d.title === "string" && typeof d.domain === "string";
}

function isRelation(v: unknown): v is Relation {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const r = v as Record<string, unknown>;
  if (typeof r.a !== "string" || typeof r.b !== "string" || !isRelationType(r.type)) {
    return false;
  }
  const statusOk = r.status === undefined || typeof r.status === "string";
  const noteOk = r.note === undefined || typeof r.note === "string";
  return statusOk && noteOk;
}

export function isGreekData(v: unknown): v is GreekData {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const d = v as Record<string, unknown>;
  return Array.isArray(d.deities) && Array.isArray(d.relations) && d.deities.every(isDeity) && d.relations.every(isRelation);
}
