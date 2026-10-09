// 确定性 100 模块演示数据生成器：固定种子、无 Date/Math.random、所有集合排序后输出。
// 目标规模：entry 8 / feature 30 / domain 34 / infra 28 = 100 模块，
// 约 220 条对齐通道（含 4 组循环）+ 6 条悬空发送 + 5 条悬空订阅。
import { TIERS, type MsgType, type PolicyFile, type ReceiveDecl, type SendDecl, type Tier } from "../shared/model";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_SEED = 20261008;

const TIER_COUNTS: ReadonlyArray<readonly [Tier, number]> = [
  ["entry", 8],
  ["feature", 30],
  ["domain", 34],
  ["infra", 28],
];

const TIER_NAMES: Record<Tier, string> = {
  entry: "入口层",
  feature: "特性层",
  domain: "领域层",
  infra: "基础设施层",
};

function key(from: string, to: string, type: MsgType): string {
  return `${from}|${to}|${type}`;
}

export function generateDemoPolicies(): PolicyFile[] {
  const rng = mulberry32(DEMO_SEED);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

  const modules: { id: string; tier: Tier }[] = [];
  for (const [tier, count] of TIER_COUNTS) {
    for (let i = 1; i <= count; i++) {
      modules.push({ id: `${tier}-${String(i).padStart(2, "0")}`, tier });
    }
  }
  const byTier: Record<Tier, string[]> = { entry: [], feature: [], domain: [], infra: [] };
  for (const m of modules) {
    byTier[m.tier].push(m.id);
  }

  const sends = new Map<string, SendDecl[]>();
  const receives = new Map<string, ReceiveDecl[]>();
  for (const m of modules) {
    sends.set(m.id, []);
    receives.set(m.id, []);
  }
  const known = new Set<string>();

  const addSend = (from: string, to: string, type: MsgType) => {
    sends.get(from)?.push({ to, type });
  };
  const addReceive = (from: string, to: string, type: MsgType) => {
    receives.get(to)?.push({ from, type });
  };
  const addAligned = (from: string, to: string, type: MsgType): boolean => {
    const k = key(from, to, type);
    if (from === to || known.has(k)) {
      return false;
    }
    known.add(k);
    addSend(from, to, type);
    addReceive(from, to, type);
    return true;
  };

  const randType = (): MsgType => {
    const r = rng();
    if (r < 0.4) {
      return "command";
    }
    if (r < 0.8) {
      return "query";
    }
    return "viewquery";
  };
  const receiverTierFor = (sender: Tier): Tier => {
    const r = rng();
    switch (sender) {
      case "entry":
        return r < 0.6 ? "feature" : r < 0.9 ? "domain" : "infra";
      case "feature":
        return r < 0.55 ? "domain" : r < 0.9 ? "infra" : "feature";
      case "domain":
        return r < 0.7 ? "infra" : r < 0.85 ? "domain" : "feature";
      default:
        return "infra";
    }
  };

  // 1) 常规对齐通道：沿层级向下为主
  for (const m of modules) {
    const outDeg =
      m.tier === "entry"
        ? 3 + Math.floor(rng() * 2)
        : m.tier === "feature"
          ? 2 + Math.floor(rng() * 3)
          : m.tier === "domain"
            ? 1 + Math.floor(rng() * 3)
            : rng() < 0.5
              ? 0
              : 1;
    for (let d = 0; d < outDeg; d++) {
      const tier = receiverTierFor(m.tier);
      const to = pick(byTier[tier]);
      addAligned(m.id, to, randType());
    }
  }

  // 2) 枢纽注入：infra-01 / infra-02 承接高频调用
  for (const hub of ["infra-01", "infra-02"]) {
    for (let i = 0; i < 8; i++) {
      const from = pick(rng() < 0.6 ? byTier.feature : byTier.domain);
      addAligned(from, hub, rng() < 0.7 ? "query" : "command");
    }
  }

  // 3) 循环依赖（全部成对对齐，构成真实环）
  const distinctPair = (tiers: readonly [Tier, Tier]): readonly [string, string] => {
    for (let guard = 0; guard < 64; guard++) {
      const a = pick(byTier[tiers[0]]);
      const b = pick(byTier[tiers[1]]);
      if (a !== b) {
        return [a, b];
      }
    }
    return [byTier[tiers[0]][0], byTier[tiers[1]][1 % byTier[tiers[1]].length]];
  };
  {
    const [f, d] = distinctPair(["feature", "domain"]);
    addAligned(f, d, "query");
    addAligned(d, f, "command");
  }
  {
    const [a, b] = distinctPair(["feature", "feature"]);
    addAligned(a, b, "command");
    addAligned(b, a, "query");
  }
  {
    const [a, b] = distinctPair(["domain", "domain"]);
    addAligned(a, b, "query");
    addAligned(b, a, "viewquery");
  }
  {
    // 三元环：feature -> domain -> domain -> feature
    const f = pick(byTier.feature);
    const d1 = pick(byTier.domain);
    const d2 = pick(byTier.domain.filter((x) => x !== d1));
    if (addAligned(f, d1, "command")) {
      addAligned(d1, d2, "query");
      addAligned(d2, f, "viewquery");
    }
  }

  // 4) 悬空声明：单边发送 / 单边订阅（与现有声明不重复）
  const danglingTargets = [...byTier.domain, ...byTier.infra];
  const danglingSources = [...byTier.feature, ...byTier.domain];
  let danglingSends = 0;
  for (let guard = 0; guard < 64 && danglingSends < 6; guard++) {
    const from = pick(danglingSources);
    const to = pick(danglingTargets);
    const type = randType();
    const k = key(from, to, type);
    if (from !== to && !known.has(k)) {
      known.add(k);
      addSend(from, to, type);
      danglingSends++;
    }
  }
  let danglingReceives = 0;
  for (let guard = 0; guard < 64 && danglingReceives < 5; guard++) {
    const from = pick(danglingSources);
    const to = pick(danglingTargets);
    const type = randType();
    const k = key(from, to, type);
    if (from !== to && !known.has(k)) {
      known.add(k);
      addReceive(from, to, type);
      danglingReceives++;
    }
  }

  return modules.map((m) => ({
    module: m.id,
    tier: m.tier,
    description: `演示模块 ${m.id}（${TIER_NAMES[m.tier]}）`,
    send: (sends.get(m.id) ?? []).slice().sort((a, b) => (a.to + a.type).localeCompare(b.to + b.type)),
    receive: (receives.get(m.id) ?? [])
      .slice()
      .sort((a, b) => (a.from + a.type).localeCompare(b.from + b.type)),
  }));
}

export const DEMO_TIER_ORDER = TIERS;
