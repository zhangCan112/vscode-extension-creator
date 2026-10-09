// 纯领域代码：解析 + 校验 policy 文件。不依赖 vscode，可被宿主与 selftest 共同复用。
import * as fs from "fs";
import * as path from "path";
import {
  MSG_TYPES,
  TIERS,
  type MsgType,
  type PolicyFile,
  type Tier,
} from "../shared/model";

export interface ParseResult {
  policies: PolicyFile[];
  errors: string[];
}

function isMsgType(v: unknown): v is MsgType {
  return typeof v === "string" && (MSG_TYPES as readonly string[]).includes(v);
}

function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

function isDecl(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * 解析目录下所有 *.policy.json 并做全量校验。
 * 校验失败的信息一律带文件相对路径定位。
 */
export function parsePolicyDir(dir: string): ParseResult {
  const errors: string[] = [];
  const policies: PolicyFile[] = [];
  const rel = (f: string) => path.join("data/policies", path.basename(f));

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".policy.json"))
      .sort();
  } catch (e) {
    return { policies: [], errors: [`读取策略目录失败 ${dir}: ${(e as Error).message}`] };
  }

  for (const file of files) {
    const full = path.join(dir, file);
    const where = rel(file);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch (e) {
      errors.push(`${where}: JSON 解析失败 —— ${(e as Error).message}`);
      continue;
    }
    const policy = validateOne(raw, where, errors);
    if (policy) {
      policies.push(policy);
    }
  }

  // 跨文件校验：module id 全局唯一
  const seen = new Map<string, string>();
  for (const p of policies) {
    const first = seen.get(p.module);
    if (first) {
      errors.push(`${rel(p.module + ".policy.json")}: module id "${p.module}" 与 ${first} 重复`);
    } else {
      seen.set(p.module, rel(p.module + ".policy.json"));
    }
  }

  // 跨文件校验：引用的模块必须存在
  const ids = new Set(policies.map((p) => p.module));
  for (const p of policies) {
    for (const s of p.send) {
      if (!ids.has(s.to)) {
        errors.push(`${rel(p.module + ".policy.json")}: send 引用了不存在的模块 "${s.to}"`);
      }
    }
    for (const r of p.receive) {
      if (!ids.has(r.from)) {
        errors.push(`${rel(p.module + ".policy.json")}: receive 引用了不存在的模块 "${r.from}"`);
      }
    }
  }

  policies.sort((a, b) => a.module.localeCompare(b.module));
  return { policies, errors };
}

function validateOne(raw: unknown, where: string, errors: string[]): PolicyFile | null {
  if (typeof raw !== "object" || raw === null) {
    errors.push(`${where}: 根必须是对象`);
    return null;
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.module !== "string" || o.module.length === 0) {
    errors.push(`${where}: "module" 必须是非空字符串`);
    return null;
  }
  const module = o.module;

  const expected = `${module}.policy.json`;
  if (path.basename(where) !== expected) {
    errors.push(`${where}: module 字段 "${module}" 与文件名 "${expected}" 不一致`);
  }

  if (!isTier(o.tier)) {
    errors.push(`${where}: "tier" 必须是 ${TIERS.join(" | ")} 之一，实际为 ${JSON.stringify(o.tier)}`);
    return null;
  }

  if (o.description !== undefined && typeof o.description !== "string") {
    errors.push(`${where}: "description" 必须是字符串`);
  }

  const send = readDecls(o.send, "send", "to", where, errors);
  const receive = readDecls(o.receive, "receive", "from", where, errors);
  if (!send || !receive) {
    return null;
  }
  return {
    module,
    tier: o.tier,
    description: typeof o.description === "string" ? o.description : "",
    send: send.map((d) => ({ to: d.peer, type: d.type })),
    receive: receive.map((d) => ({ from: d.peer, type: d.type })),
  };
}

function readDecls(
  input: unknown,
  listName: "send" | "receive",
  key: "to" | "from",
  where: string,
  errors: string[]
): Array<{ peer: string; type: MsgType }> | null {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    errors.push(`${where}: "${listName}" 必须是数组`);
    return null;
  }
  const out: Array<{ peer: string; type: MsgType }> = [];
  const seen = new Set<string>();
  input.forEach((item, i) => {
    if (!isDecl(item) || typeof item[key] !== "string" || item[key].length === 0) {
      errors.push(`${where}: ${listName}[${i}] 缺少非空 "${key}" 字段`);
      return;
    }
    if (!isMsgType(item.type)) {
      errors.push(
        `${where}: ${listName}[${i}] 的 "type" 必须是 ${MSG_TYPES.join(" | ")} 之一，实际为 ${JSON.stringify(item.type)}`
      );
      return;
    }
    const peer = item[key] as string;
    const dedup = `${peer}|${item.type}`;
    if (seen.has(dedup)) {
      errors.push(`${where}: ${listName}[${i}] 重复声明 "${peer}" 的 "${item.type}"`);
      return;
    }
    seen.add(dedup);
    out.push({ peer, type: item.type });
  });
  return out;
}
