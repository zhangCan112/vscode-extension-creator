import * as vscode from "vscode";
import { Deity, GreekData, Relation, RelationType, isGreekData } from "./types";

export interface RelationTypeMeta {
  label: string;
  icon: string;
  keywords: string[];
}

export const RELATION_TYPES: Record<RelationType, RelationTypeMeta> = {
  "parent-child": { label: "parent / child", icon: "organization", keywords: ["parent", "child", "son", "daughter"] },
  spouse: { label: "spouse", icon: "heart", keywords: ["spouse", "wife", "husband", "married", "marriage"] },
  sibling: { label: "sibling", icon: "people", keywords: ["sibling", "brother", "sister"] },
  rival: { label: "rival", icon: "sword", keywords: ["rival", "rivalry", "enemy", "feud"] },
  "secret-lover": { label: "secret lover", icon: "eye-closed", keywords: ["secret lover", "lover", "affair"] }
};

export function relationKey(r: Relation): string {
  return `${r.a}|${r.b}|${r.type}`;
}

export class RelationIndex {
  private readonly deitiesById = new Map<string, Deity>();
  private readonly relationsByDeity = new Map<string, Relation[]>();

  constructor(readonly data: GreekData) {
    for (const d of data.deities) {
      this.deitiesById.set(d.id, d);
    }
    for (const r of data.relations) {
      for (const party of [r.a, r.b]) {
        const list = this.relationsByDeity.get(party);
        if (list) {
          list.push(r);
        } else {
          this.relationsByDeity.set(party, [r]);
        }
      }
    }
  }

  get deities(): Deity[] {
    return this.data.deities;
  }

  get relations(): Relation[] {
    return this.data.relations;
  }

  deity(id: string): Deity | undefined {
    return this.deitiesById.get(id);
  }

  nameOf(id: string): string {
    return this.deitiesById.get(id)?.name ?? id;
  }

  relationsOf(id: string): Relation[] {
    return this.relationsByDeity.get(id) ?? [];
  }

  pairsOfType(type: RelationType): Relation[] {
    return this.data.relations.filter((r) => r.type === type);
  }

  otherParty(r: Relation, perspective: string): string {
    return r.a === perspective ? r.b : r.a;
  }

  directedLabel(r: Relation, perspective: string): string {
    if (r.type === "parent-child") {
      return r.a === perspective ? "child" : "parent";
    }
    return RELATION_TYPES[r.type].label;
  }
}

export async function loadRelationIndex(extensionUri: vscode.Uri): Promise<RelationIndex> {
  const fileUri = vscode.Uri.joinPath(extensionUri, "data", "deities.json");
  const bytes = await vscode.workspace.fs.readFile(fileUri);
  const parsed: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (!isGreekData(parsed)) {
    throw new Error("data/deities.json is not a valid deity dataset");
  }
  const index = new RelationIndex(parsed);
  for (const r of parsed.relations) {
    if (!index.deity(r.a) || !index.deity(r.b)) {
      throw new Error(`relation references unknown deity: ${r.a} / ${r.b}`);
    }
  }
  return index;
}
