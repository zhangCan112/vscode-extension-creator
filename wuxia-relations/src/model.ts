import { readFile } from "node:fs/promises";
import * as vscode from "vscode";

export interface Character {
  id: string;
  name: string;
  faction: string;
  title: string;
}

export interface Relation {
  source: string;
  target: string;
  type: RelationType;
  status?: string;
  note?: string;
}

export interface Graph {
  characters: Character[];
  relations: Relation[];
}

export const RELATION_TYPES = ["朋友", "敌人", "师徒", "亲属", "恋人"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export function isRelationType(v: unknown): v is RelationType {
  return typeof v === "string" && (RELATION_TYPES as readonly string[]).includes(v);
}

export function relationIcon(type: RelationType): string {
  switch (type) {
    case "朋友":
      return "people";
    case "敌人":
      return "flame";
    case "师徒":
      return "mortar-board";
    case "亲属":
      return "home";
    case "恋人":
      return "heart";
  }
}

export function shifuTag(rel: Relation, otherPersonId: string): string {
  if (rel.type !== "师徒") {
    return "";
  }
  return rel.target === otherPersonId ? "（徒）" : "（师）";
}

function isCharacter(v: unknown): v is Character {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    typeof c.faction === "string" &&
    typeof c.title === "string"
  );
}

function isRelation(v: unknown): v is Relation {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const r = v as Record<string, unknown>;
  return (
    typeof r.source === "string" &&
    typeof r.target === "string" &&
    isRelationType(r.type) &&
    (r.status === undefined || typeof r.status === "string") &&
    (r.note === undefined || typeof r.note === "string")
  );
}

export function parseGraph(raw: unknown): Graph {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("graph.json 根节点必须是对象");
  }
  const root = raw as Record<string, unknown>;
  if (!Array.isArray(root.characters) || !Array.isArray(root.relations)) {
    throw new Error("graph.json 缺少 characters / relations 数组");
  }
  const characters: Character[] = [];
  const seen = new Set<string>();
  for (const c of root.characters) {
    if (!isCharacter(c)) {
      throw new Error(`非法人物条目: ${JSON.stringify(c)}`);
    }
    if (seen.has(c.id)) {
      throw new Error(`人物 id 重复: ${c.id}`);
    }
    seen.add(c.id);
    characters.push(c);
  }
  const relations: Relation[] = [];
  for (const r of root.relations) {
    if (!isRelation(r)) {
      throw new Error(`非法关系条目: ${JSON.stringify(r)}`);
    }
    if (!seen.has(r.source) || !seen.has(r.target)) {
      throw new Error(`关系引用了不存在的人物: ${r.source} / ${r.target}`);
    }
    relations.push(r);
  }
  return { characters, relations };
}

export async function loadGraph(extensionUri: vscode.Uri): Promise<Graph> {
  const uri = vscode.Uri.joinPath(extensionUri, "data", "graph.json");
  const raw = await readFile(uri.fsPath, "utf-8");
  return parseGraph(JSON.parse(raw));
}

export function charById(graph: Graph, id: string): Character {
  const c = graph.characters.find((ch) => ch.id === id);
  if (!c) {
    throw new Error(`未知人物 id: ${id}`);
  }
  return c;
}

export function relationsOf(graph: Graph, id: string): Relation[] {
  return graph.relations.filter((r) => r.source === id || r.target === id);
}

export function otherId(rel: Relation, id: string): string {
  return rel.source === id ? rel.target : rel.source;
}
