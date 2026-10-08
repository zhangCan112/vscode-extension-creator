import { readdir, readFile } from "node:fs/promises";
import * as vscode from "vscode";
import {
  MESSAGE_TYPES,
  TIERS,
  channelEdgeId,
  type Channel,
  type Graph,
  type MessageType,
  type ModulePolicy,
  type Tier,
} from "./schema";

export { MESSAGE_TYPES, TIERS } from "./schema";
export type { Channel, ChannelStatus, Graph, MessageType, ModulePolicy, PolicyDirection, Tier } from "./schema";

function isMessageType(v: unknown): v is MessageType {
  return typeof v === "string" && (MESSAGE_TYPES as readonly string[]).includes(v);
}

function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

interface RawDirection {
  peer: string;
  type: MessageType;
  note?: string;
}

interface RawPolicy {
  module: string;
  tier: Tier;
  description?: string;
  send: RawDirection[];
  receive: RawDirection[];
}

/** 单个 policy 文件解析：报错必须带上文件名，否则无法定位问题文件 */
function parsePolicyFile(fileName: string, raw: unknown): RawPolicy {
  const where = `policies/${fileName}`;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${where}: 根节点必须是对象`);
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.module !== "string" || !p.module) {
    throw new Error(`${where}: module 必须是非空字符串`);
  }
  if (!isTier(p.tier)) {
    throw new Error(`${where}: tier 必须是 ${TIERS.join(" / ")} 之一`);
  }
  if (p.description !== undefined && typeof p.description !== "string") {
    throw new Error(`${where}: description 必须是字符串`);
  }
  const parseDirections = (key: "send" | "receive", peerKey: "to" | "from"): RawDirection[] => {
    const list = p[key];
    if (!Array.isArray(list)) {
      throw new Error(`${where}: ${key} 必须是数组`);
    }
    const seen = new Set<string>();
    return list.map((entry, i) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error(`${where}: ${key}[${i}] 必须是对象`);
      }
      const a = entry as Record<string, unknown>;
      if (typeof a[peerKey] !== "string" || !a[peerKey]) {
        throw new Error(`${where}: ${key}[${i}].${peerKey} 必须是非空字符串`);
      }
      if (!isMessageType(a.type)) {
        throw new Error(`${where}: ${key}[${i}].type 必须是 ${MESSAGE_TYPES.join(" / ")} 之一`);
      }
      if (a.note !== undefined && typeof a.note !== "string") {
        throw new Error(`${where}: ${key}[${i}].note 必须是字符串`);
      }
      const peer = a[peerKey] as string;
      const type = a.type as MessageType;
      const dedupe = `${peer}:${type}`;
      if (seen.has(dedupe)) {
        throw new Error(`${where}: ${key} 重复声明 ${peer} 的 ${type}`);
      }
      seen.add(dedupe);
      return { peer, type, note: a.note as string | undefined };
    });
  };
  return {
    module: p.module,
    tier: p.tier,
    description: p.description as string | undefined,
    send: parseDirections("send", "to"),
    receive: parseDirections("receive", "from"),
  };
}

/**
 * 聚合 data/policies/*.json：
 * 1. 逐文件严格校验（peer 存在性跨文件统一检查）
 * 2. SEND/RECEIVE 匹配：通道成立要求双方声明对齐，产出 matched / sendOnly / receiveOnly
 */
export async function loadPolicies(extensionUri: vscode.Uri): Promise<Graph> {
  const dir = vscode.Uri.joinPath(extensionUri, "data", "policies");
  const files = (await readdir(dir.fsPath)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    throw new Error("data/policies 下没有任何 .json 策略文件");
  }
  const policies: RawPolicy[] = [];
  const ids = new Set<string>();
  for (const file of files) {
    const text = await readFile(vscode.Uri.joinPath(dir, file).fsPath, "utf-8");
    const parsed = parsePolicyFile(file, JSON.parse(text));
    if (ids.has(parsed.module)) {
      throw new Error(`policies/${file}: 模块 id 重复声明: ${parsed.module}`);
    }
    ids.add(parsed.module);
    policies.push(parsed);
  }
  // 跨文件引用校验
  for (const p of policies) {
    for (const s of p.send) {
      if (!ids.has(s.peer)) {
        throw new Error(`policies/${p.module}.policy.json: send 指向未知模块: ${s.peer}`);
      }
    }
    for (const r of p.receive) {
      if (!ids.has(r.peer)) {
        throw new Error(`policies/${p.module}.policy.json: receive 指向未知模块: ${r.peer}`);
      }
    }
  }

  // 匹配索引：key = 目标模块|对端|类型
  const receiveKeys = new Set<string>();
  const sendKeys = new Set<string>();
  for (const p of policies) {
    for (const r of p.receive) {
      receiveKeys.add(`${p.module}|${r.peer}|${r.type}`);
    }
    for (const s of p.send) {
      sendKeys.add(`${s.peer}|${p.module}|${s.type}`);
    }
  }

  const channels: Channel[] = [];
  for (const p of policies) {
    for (const s of p.send) {
      const matched = receiveKeys.has(`${s.peer}|${p.module}|${s.type}`);
      channels.push({
        id: channelEdgeId(p.module, s.peer, s.type),
        source: p.module,
        target: s.peer,
        type: s.type,
        status: matched ? "matched" : "sendOnly",
      });
    }
    for (const r of p.receive) {
      if (!sendKeys.has(`${p.module}|${r.peer}|${r.type}`)) {
        channels.push({
          id: channelEdgeId(r.peer, p.module, r.type),
          source: r.peer,
          target: p.module,
          type: r.type,
          status: "receiveOnly",
        });
      }
    }
  }

  const view: ModulePolicy[] = policies.map((p) => ({
    id: p.module,
    tier: p.tier,
    description: p.description,
    send: p.send.map((s) => ({
      peer: s.peer,
      type: s.type,
      matched: receiveKeys.has(`${s.peer}|${p.module}|${s.type}`),
    })),
    receive: p.receive.map((r) => ({
      peer: r.peer,
      type: r.type,
      matched: sendKeys.has(`${p.module}|${r.peer}|${r.type}`),
    })),
  }));

  return { policies: view, channels };
}
