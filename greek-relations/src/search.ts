import * as vscode from "vscode";
import { RELATION_TYPES, RelationIndex, relationKey } from "./model";
import { Relation, RelationType } from "./types";

export type SearchPick =
  | { kind: "deity"; deityId: string }
  | { kind: "relation"; deityId: string; key: string }
  | { kind: "pair"; key: string; a: string; b: string };

interface MythItem extends vscode.QuickPickItem {
  pick?: SearchPick;
}

function separator(label: string): MythItem {
  return { label, kind: vscode.QuickPickItemKind.Separator };
}

function statusDetail(r: Relation): string {
  const parts: string[] = [];
  if (r.status) {
    parts.push(`status: ${r.status}`);
  }
  if (r.note) {
    parts.push(r.note);
  }
  return parts.join(" · ");
}

export function buildItems(index: RelationIndex, query: string): MythItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return index.deities.map(
      (d): MythItem => ({
        label: `$(person) ${d.name}`,
        description: `deity — ${d.title}`,
        detail: `${index.relationsOf(d.id).length} recorded relations`,
        pick: { kind: "deity", deityId: d.id }
      })
    );
  }
  const deityHits = index.deities.filter((d) => d.name.toLowerCase().includes(q));
  const typeHits = (Object.keys(RELATION_TYPES) as RelationType[]).filter((t) => {
    const meta = RELATION_TYPES[t];
    return meta.label.includes(q) || meta.keywords.some((k) => k.includes(q));
  });
  const items: MythItem[] = [];
  if (deityHits.length > 0) {
    items.push(separator(`Deities matching "${query.trim()}"`));
    for (const d of deityHits) {
      items.push({
        label: `$(person) ${d.name}`,
        description: `deity — relations of ${d.name}`,
        detail: d.title,
        pick: { kind: "deity", deityId: d.id }
      });
      for (const r of index.relationsOf(d.id)) {
        const meta = RELATION_TYPES[r.type];
        items.push({
          label: `$(${meta.icon}) ${index.nameOf(index.otherParty(r, d.id))}`,
          description: `${index.directedLabel(r, d.id)} of ${d.name}`,
          detail: statusDetail(r),
          pick: { kind: "relation", deityId: d.id, key: relationKey(r) }
        });
      }
    }
  }
  if (typeHits.length > 0) {
    items.push(separator("Pairs by relation type"));
    for (const t of typeHits) {
      for (const r of index.pairsOfType(t)) {
        const meta = RELATION_TYPES[t];
        items.push({
          label: `$(${meta.icon}) ${index.nameOf(r.a)} ↔ ${index.nameOf(r.b)}`,
          description: meta.label,
          detail: statusDetail(r),
          pick: { kind: "pair", key: relationKey(r), a: r.a, b: r.b }
        });
      }
    }
  }
  if (items.length === 0) {
    return [{ label: `No matches for "${query.trim()}"`, alwaysShow: true }];
  }
  return items;
}

export function openSearch(index: RelationIndex, onPick: (pick: SearchPick) => void): void {
  const qp = vscode.window.createQuickPick<MythItem>();
  qp.placeholder = "Type a deity name (e.g. Zeus) or a relation type (e.g. rival)";
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.onDidChangeValue((value) => {
    qp.items = buildItems(index, value);
  });
  qp.onDidAccept(() => {
    const sel = qp.activeItems[0];
    qp.hide();
    if (sel && sel.pick) {
      onPick(sel.pick);
    }
  });
  qp.onDidHide(() => qp.dispose());
  qp.items = buildItems(index, "");
  qp.show();
}
