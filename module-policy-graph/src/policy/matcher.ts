// 通道匹配：一条通道成立当且仅当 A.send 与 B.receive 双方声明对齐。
// 单边声明产出悬空发送 / 悬空订阅。全部在宿主侧算好，webview 只消费状态。
import type { GraphEdge, GraphNode, GraphPayload, MsgType, PolicyFile } from "../shared/model";

export interface MatchResult extends GraphPayload {
  /** 循环依赖涉及的模块 id（升序） */
  cycleModules: string[];
}

export function matchChannels(policies: PolicyFile[], source: "files" | "demo"): MatchResult {
  const sendKey = (from: string, to: string, type: MsgType) => `${from}|${to}|${type}`;

  // 接受侧索引：key -> 声明方
  const receiveIndex = new Set<string>();
  for (const p of policies) {
    for (const r of p.receive) {
      receiveIndex.add(sendKey(r.from, p.module, r.type));
    }
  }

  const edges: GraphEdge[] = [];
  const sendDeclared = new Set<string>();
  const danglingSend = new Set<string>();

  for (const p of policies) {
    for (const s of p.send) {
      const key = sendKey(p.module, s.to, s.type);
      sendDeclared.add(key);
      if (receiveIndex.has(key)) {
        edges.push({ id: `a|${key}`, from: p.module, to: s.to, type: s.type, state: "aligned" });
      } else {
        danglingSend.add(key);
        edges.push({
          id: `ds|${key}`,
          from: p.module,
          to: s.to,
          type: s.type,
          state: "dangling-send",
        });
      }
    }
  }

  for (const p of policies) {
    for (const r of p.receive) {
      const key = sendKey(r.from, p.module, r.type);
      if (!sendDeclared.has(key)) {
        edges.push({
          id: `dr|${key}`,
          from: r.from,
          to: p.module,
          type: r.type,
          state: "dangling-receive",
        });
      }
    }
  }

  edges.sort((a, b) => a.id.localeCompare(b.id));

  // 节点：度数 = 涉及该模块的声明总数（两端都计）
  const nodes: GraphNode[] = policies.map((p) => ({
    id: p.module,
    tier: p.tier,
    description: p.description ?? "",
    degree: 0,
    danglingCount: 0,
  }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const src = nodeById.get(e.from);
    const dst = nodeById.get(e.to);
    if (src) {
      src.degree += 1;
      if (e.state !== "aligned") {
        src.danglingCount += 1;
      }
    }
    if (dst) {
      dst.degree += 1;
      if (e.state !== "aligned") {
        dst.danglingCount += 1;
      }
    }
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  // 循环检测只统计已对齐通道（悬空声明不承载真实数据流）
  const cycleEdgeIds = findCycleEdges(
    nodes.map((n) => n.id),
    edges.filter((e) => e.state === "aligned")
  );
  const cycleSet = new Set(cycleEdgeIds);
  const cycleModules = new Set<string>();
  for (const e of edges) {
    if (cycleSet.has(e.id)) {
      cycleModules.add(e.from);
      cycleModules.add(e.to);
    }
  }

  return {
    source,
    nodes,
    edges,
    cycleEdgeIds: cycleEdgeIds.slice().sort(),
    cycleModules: [...cycleModules].sort(),
  };
}

/**
 * Tarjan 强连通分量：同一 size>=2 的 SCC 内部边，或自环边，视为处在环上。
 */
export function findCycleEdges(nodeIds: string[], aligned: GraphEdge[]): string[] {
  const idToIdx = new Map(nodeIds.map((id, i) => [id, i]));
  const adj: number[][] = nodeIds.map(() => []);
  const selfLoops: string[] = [];
  for (const e of aligned) {
    const u = idToIdx.get(e.from);
    const v = idToIdx.get(e.to);
    if (u === undefined || v === undefined) {
      continue;
    }
    if (u === v) {
      selfLoops.push(e.id);
      continue;
    }
    adj[u].push(v);
  }

  const n = nodeIds.length;
  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const sccOf = new Array<number>(n).fill(-1);
  const sccSize = new Map<number, number>();
  let counter = 0;
  let sccCounter = 0;

  const strongconnect = (start: number) => {
    const work: { v: number; ei: number }[] = [{ v: start, ei: 0 }];
    index[start] = low[start] = counter++;
    stack.push(start);
    onStack[start] = true;
    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.ei < adj[frame.v].length) {
        const w = adj[frame.v][frame.ei++];
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          work.push({ v: w, ei: 0 });
        } else if (onStack[w]) {
          low[frame.v] = Math.min(low[frame.v], index[w]);
        }
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1].v;
          low[parent] = Math.min(low[parent], low[frame.v]);
        }
        if (low[frame.v] === index[frame.v]) {
          const members: number[] = [];
          let w: number;
          do {
            w = stack.pop() as number;
            onStack[w] = false;
            sccOf[w] = sccCounter;
            members.push(w);
          } while (w !== frame.v);
          sccSize.set(sccCounter, members.length);
          sccCounter++;
        }
      }
    }
  };

  for (let i = 0; i < n; i++) {
    if (index[i] === -1) {
      strongconnect(i);
    }
  }

  const cyclic: string[] = [...selfLoops];
  for (const e of aligned) {
    const u = idToIdx.get(e.from);
    const v = idToIdx.get(e.to);
    if (u === undefined || v === undefined || u === v) {
      continue;
    }
    const su = sccOf[u];
    if (su === sccOf[v] && (sccSize.get(su) ?? 0) >= 2) {
      cyclic.push(e.id);
    }
  }
  return cyclic;
}
