// Shared message protocol between the extension host and the graph webview.
// Hard rule: this file must not import "vscode" or any Node/DOM-only module —
// it compiles into BOTH the extension-host bundle and the webview bundle.

import { Deity, Relation } from "../types";

export type GraphToHostMessage = { type: "ready" } | { type: "selectDeity"; deityId: string };

export type HostToGraphMessage =
  | { type: "data"; deities: Deity[]; relations: Relation[] }
  | { type: "focus"; nodeIds: string[]; edgeIds: string[] }
  | { type: "clearFocus" };

/** Stable id for a graph edge; same format as the tree's relation key. */
export function edgeIdOf(r: Relation): string {
  return `${r.a}|${r.b}|${r.type}`;
}

export function isGraphToHostMessage(v: unknown): v is GraphToHostMessage {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const m = v as Record<string, unknown>;
  if (m.type === "ready") {
    return true;
  }
  return m.type === "selectDeity" && typeof m.deityId === "string";
}

export function isHostToGraphMessage(v: unknown): v is HostToGraphMessage {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const m = v as Record<string, unknown>;
  if (m.type === "data") {
    const d = m as Record<string, unknown>;
    return Array.isArray(d.deities) && Array.isArray(d.relations);
  }
  if (m.type === "clearFocus") {
    return true;
  }
  if (m.type === "focus") {
    const f = m as Record<string, unknown>;
    return Array.isArray(f.nodeIds) && Array.isArray(f.edgeIds);
  }
  return false;
}
