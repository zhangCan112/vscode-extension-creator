// 100 模块演示数据生成器：纯函数、固定种子，验证大规模布局与交互。
// 禁止 import vscode / node 模块（可被独立打包做不变量验证）。
import {
  channelEdgeId,
  type Channel,
  type ChannelStatus,
  type Graph,
  type MessageType,
  type ModulePolicy,
  type PolicyDirection,
  type Tier,
} from "./schema";

/** mulberry32：确定性伪随机，种子固定保证每次生成同一张图 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_ORDER: Tier[] = ["entry", "feature", "domain", "infra"];

export function generateLargeDemoGraph(total = 100): Graph {
  const rand = mulberry32(20260101);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)] as T;
  const typeRoll = (): MessageType => {
    const r = rand();
    return r < 0.3 ? "command" : r < 0.7 ? "query" : "viewquery";
  };

  // 按比例分层，总量修正到 total
  const counts: number[] = [0.08, 0.3, 0.42].map((w) => Math.max(2, Math.round(total * w)));
  counts.push(Math.max(2, total - counts.reduce((a, b) => a + b, 0)));
  const tierOf = new Map<string, Tier>();
  const byTier = new Map<Tier, string[]>();
  TIER_ORDER.forEach((tier, i) => {
    const names = Array.from({ length: counts[i] as number }, (_, j) => `${tier}-${j + 1}`);
    byTier.set(tier, names);
    for (const n of names) {
      tierOf.set(n, tier);
    }
  });
  const allIds = [...tierOf.keys()];

  // 构造已对齐通道：数据流自上而下（entry → feature → domain → infra）
  const seen = new Set<string>();
  const add = (s: string, t: string, type: MessageType): boolean => {
    if (s === t) {
      return false;
    }
    const key = `${s}->${t}:${type}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };
  const matched: Array<{ s: string; t: string; type: MessageType }> = [];
  const push = (s: string, t: string, type: MessageType): void => {
    if (add(s, t, type)) {
      matched.push({ s, t, type });
    }
  };
  for (let i = 1; i < TIER_ORDER.length; i++) {
    const targets = byTier.get(TIER_ORDER[i] as Tier) ?? [];
    const sources = byTier.get(TIER_ORDER[i - 1] as Tier) ?? [];
    for (const t of targets) {
      const k = 1 + Math.floor(rand() * 2);
      for (let j = 0; j < k; j++) {
        push(pick(sources), t, typeRoll());
      }
    }
  }
  // feature → infra 直连捷径
  for (const f of byTier.get("feature") ?? []) {
    if (rand() < 0.3) {
      push(f, pick(byTier.get("infra") ?? allIds), typeRoll());
    }
  }
  // domain 同层互查 → 制造真实循环依赖
  const domains = byTier.get("domain") ?? [];
  for (let c = 0; c < 3; c++) {
    const a = pick(domains);
    let b = pick(domains);
    let guard = 0;
    while (b === a && guard++ < 10) {
      b = pick(domains);
    }
    if (a !== b) {
      push(a, b, "query");
      push(b, a, "viewquery");
    }
  }

  // 匹配态 → 悬空：随机 6 条改为 sendOnly，再补 4 条 receiveOnly
  const demo: Array<{ s: string; t: string; type: MessageType; status: ChannelStatus }> = matched.map((c) => ({
    ...c,
    status: "matched" as ChannelStatus,
  }));
  let sendOnlyCount = 0;
  let guard = 0;
  while (sendOnlyCount < 6 && guard++ < 200) {
    const idx = Math.floor(rand() * demo.length);
    if (demo[idx]?.status === "matched") {
      demo[idx].status = "sendOnly";
      sendOnlyCount++;
    }
  }
  let receiveOnlyCount = 0;
  guard = 0;
  while (receiveOnlyCount < 4 && guard++ < 200) {
    const s = pick(allIds);
    let t = pick(allIds);
    let inner = 0;
    while (t === s && inner++ < 10) {
      t = pick(allIds);
    }
    if (t === s) {
      continue;
    }
    const type = typeRoll();
    if (!add(s, t, type)) {
      continue;
    }
    demo.push({ s, t, type, status: "receiveOnly" });
    receiveOnlyCount++;
  }

  // 由通道反推各模块 policy 视图
  const sendMap = new Map<string, PolicyDirection[]>(allIds.map((id) => [id, []]));
  const recvMap = new Map<string, PolicyDirection[]>(allIds.map((id) => [id, []]));
  const channels: Channel[] = demo.map((c) => {
    if (c.status === "receiveOnly") {
      recvMap.get(c.t)?.push({ peer: c.s, type: c.type, matched: false });
    } else {
      sendMap.get(c.s)?.push({ peer: c.t, type: c.type, matched: c.status === "matched" });
      if (c.status === "matched") {
        recvMap.get(c.t)?.push({ peer: c.s, type: c.type, matched: true });
      }
    }
    return {
      id: channelEdgeId(c.s, c.t, c.type),
      source: c.s,
      target: c.t,
      type: c.type,
      status: c.status,
    };
  });

  const policies: ModulePolicy[] = allIds.map((id) => ({
    id,
    tier: tierOf.get(id) as Tier,
    description: "演示模块",
    send: sendMap.get(id) ?? [],
    receive: recvMap.get(id) ?? [],
  }));

  return { policies, channels };
}
