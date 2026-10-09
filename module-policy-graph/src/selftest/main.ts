// 自验脚本（node dist/selftest.js）：枚举预期结果核对匹配判定 / 循环检测 / 错误定位 / 演示数据确定性。
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateDemoPolicies } from "../policy/demo";
import { matchChannels } from "../policy/matcher";
import { parsePolicyDir } from "../policy/parser";
import { MSG_TYPES, TIERS } from "../shared/model";

const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${(e as Error).message}`);
  }
}

const dataDir = path.join(process.cwd(), "data", "policies");

console.log("\n[1] 文件数据解析与匹配判定");
const parsed = parsePolicyDir(dataDir);
const matched = matchChannels(parsed.policies, "files");

check("10 个 policy 文件解析通过、零校验错误", () => {
  assert.strictEqual(parsed.errors.length, 0, `errors: ${parsed.errors.join("; ")}`);
  assert.strictEqual(parsed.policies.length, 10);
});

check("四层均有模块", () => {
  const tiers = new Set(parsed.policies.map((p) => p.tier));
  for (const t of TIERS) {
    assert.ok(tiers.has(t), `缺少层级 ${t}`);
  }
});

const ALIGNED = [
  "app-shell|workspace|command",
  "app-shell|auth|query",
  "command-palette|workspace|query",
  "command-palette|auth|query",
  "auth|logger|command",
  "auth|settings|query",
  "workspace|editor|command",
  "workspace|fs|query",
  "workspace|file-tree|viewquery",
  "workspace|git|viewquery",
  "editor|workspace|query",
  "editor|fs|query",
  "editor|logger|command",
  "editor|auth|query",
  "file-tree|fs|query",
  "file-tree|git|query",
  "git|fs|command",
  "git|logger|command",
  "fs|logger|command",
  "settings|fs|command",
].sort();

check("已对齐通道恰为预期的 20 条", () => {
  const actual = matched.edges
    .filter((e) => e.state === "aligned")
    .map((e) => `${e.from}|${e.to}|${e.type}`)
    .sort();
  assert.deepStrictEqual(actual, ALIGNED);
});

check("悬空发送恰为 git→logger query 一处", () => {
  const actual = matched.edges
    .filter((e) => e.state === "dangling-send")
    .map((e) => `${e.from}|${e.to}|${e.type}`);
  assert.deepStrictEqual(actual, ["git|logger|query"]);
});

check("悬空订阅恰为 app-shell→settings command 一处", () => {
  const actual = matched.edges
    .filter((e) => e.state === "dangling-receive")
    .map((e) => `${e.from}|${e.to}|${e.type}`);
  assert.deepStrictEqual(actual, ["app-shell|settings|command"]);
});

check("循环通道恰为 workspace↔editor 两条（仅统计已对齐）", () => {
  const actual = matched.cycleEdgeIds.map((id) => id.replace(/^a\|/, "")).sort();
  assert.deepStrictEqual(actual, ["editor|workspace|query", "workspace|editor|command"]);
  assert.deepStrictEqual(matched.cycleModules, ["editor", "workspace"]);
});

console.log("\n[2] 校验错误定位到具体文件");
check("非法 tier / 重复声明 / 引用缺失 / 文件名不一致均可定位", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-selftest-"));
  const write = (name: string, content: unknown) =>
    fs.writeFileSync(path.join(tmp, name), JSON.stringify(content), "utf8");
  write("ok.policy.json", { module: "ok", tier: "infra", send: [], receive: [] });
  write("bad-tier.policy.json", { module: "bad-tier", tier: "middle", send: [], receive: [] });
  write("bad-dup.policy.json", {
    module: "bad-dup",
    tier: "infra",
    send: [
      { to: "ok", type: "command" },
      { to: "ok", type: "command" },
    ],
    receive: [],
  });
  write("bad-ref.policy.json", {
    module: "bad-ref",
    tier: "domain",
    send: [{ to: "ghost", type: "query" }],
    receive: [],
  });
  write("mismatch.policy.json", { module: "other-name", tier: "domain", send: [], receive: [] });
  write("bad-type.policy.json", {
    module: "bad-type",
    tier: "domain",
    send: [{ to: "ok", type: "event" }],
    receive: [],
  });

  const r = parsePolicyDir(tmp);
  const joined = r.errors.join("\n");
  for (const file of ["bad-tier.policy.json", "bad-dup.policy.json", "bad-ref.policy.json", "mismatch.policy.json", "bad-type.policy.json"]) {
    assert.ok(joined.includes(file), `错误信息未定位到 ${file}:\n${joined}`);
  }
  assert.ok(r.policies.length >= 1, "合法文件应被保留");
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("\n[3] 100 模块演示数据");
const demo = generateDemoPolicies();
const demoMatched = matchChannels(demo, "demo");

check("规模：entry 8 / feature 30 / domain 34 / infra 28 = 100", () => {
  assert.strictEqual(demo.length, 100);
  const counts: Record<string, number> = { entry: 0, feature: 0, domain: 0, infra: 0 };
  demo.forEach((p) => (counts[p.tier] += 1));
  assert.deepStrictEqual(counts, { entry: 8, feature: 30, domain: 34, infra: 28 });
});

check("引用完整性：模块 id 唯一、跨文件引用全部存在、类型/层级合法", () => {
  const ids = new Set(demo.map((p) => p.module));
  assert.strictEqual(ids.size, 100);
  const keys = new Set<string>();
  for (const p of demo) {
    assert.ok(TIERS.includes(p.tier), `${p.module} tier 非法`);
    for (const s of p.send) {
      assert.ok(MSG_TYPES.includes(s.type), `${p.module} send type 非法`);
      assert.ok(ids.has(s.to), `${p.module} send 引用缺失 ${s.to}`);
      const k = `s|${p.module}|${s.to}|${s.type}`;
      assert.ok(!keys.has(k), `${p.module} send 重复声明`);
      keys.add(k);
    }
    for (const r of p.receive) {
      assert.ok(MSG_TYPES.includes(r.type), `${p.module} receive type 非法`);
      assert.ok(ids.has(r.from), `${p.module} receive 引用缺失 ${r.from}`);
      const k = `r|${p.module}|${r.from}|${r.type}`;
      assert.ok(!keys.has(k), `${p.module} receive 重复声明`);
      keys.add(k);
    }
  }
});

check("含循环依赖与悬空声明", () => {
  assert.ok(demoMatched.cycleEdgeIds.length >= 2, `循环通道过少: ${demoMatched.cycleEdgeIds.length}`);
  const dangling = demoMatched.edges.filter((e) => e.state !== "aligned");
  assert.ok(dangling.length >= 4, `悬空声明过少: ${dangling.length}`);
  assert.ok(dangling.some((e) => e.state === "dangling-send"), "缺悬空发送");
  assert.ok(dangling.some((e) => e.state === "dangling-receive"), "缺悬空订阅");
});

check("确定性：同一进程两次生成结果完全一致", () => {
  assert.strictEqual(JSON.stringify(generateDemoPolicies()), JSON.stringify(generateDemoPolicies()));
});

check("100 模块总览规模阶梯：边默认透明度由 webview 侧 >60 阈值控制（此处验证节点数触发条件）", () => {
  assert.ok(demoMatched.nodes.length > 60);
});

console.log("");
if (failures.length > 0) {
  console.error(`SELFTEST FAILED: ${failures.length} 项未通过 —— ${failures.join(", ")}`);
  process.exit(1);
} else {
  console.log("SELFTEST PASSED: 全部通过");
}
