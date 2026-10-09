// 批注收集服务（配套 annot-layer.js）：pending 落盘 + 旁路消化审计。
// 用法：node annot-server.mjs [dir] [port]   （默认 ./annot-data 6177）
//   POST   /pin      {op:"add", id, note, anchor, ctx, target, shotData?} —— shotData 为 PNG dataURL 时存 <dir>/pin-<id>.png
//                      {op:"del", id}
//   POST   /consume  {id, fix}  —— 代理消化后的 ack：条目移出 pending，追加进 annotations-audit.jsonl
//   GET    /list                —— 当前 pending
//   DELETE /all                 —— 清空 pending（不动审计）
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

const DIR = path.resolve(process.cwd(), process.argv[2] || "annot-data");
const PORT = Number(process.argv[3] || 6177);
const PENDING = path.join(DIR, "annotations.jsonl");
const AUDIT = path.join(DIR, "annotations-audit.jsonl");
fs.mkdirSync(DIR, { recursive: true });

function readLines(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeLines(file, rows) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

const server = http.createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const json = (code, obj) => {
    res.writeHead(code, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/list") {
    json(200, readLines(PENDING));
    return;
  }
  if (req.method === "DELETE" && req.url === "/all") {
    writeLines(PENDING, []);
    json(200, { ok: true });
    return;
  }
  if (req.method === "POST" && (req.url === "/pin" || req.url === "/consume")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);
        if (req.url === "/pin" && msg.op === "add") {
          const rec = { ts: Date.now(), id: msg.id, note: msg.note, anchor: msg.anchor, ctx: msg.ctx, target: msg.target };
          if (typeof msg.shotData === "string" && /^data:image\/png;base64,/.test(msg.shotData)) {
            const name = `pin-${msg.id}.png`;
            fs.writeFileSync(path.join(DIR, name), Buffer.from(msg.shotData.replace(/^data:image\/png;base64,/, ""), "base64"));
            rec.shot = name;
          }
          fs.appendFileSync(PENDING, JSON.stringify(rec) + "\n", "utf8");
        } else if (req.url === "/pin" && msg.op === "del") {
          writeLines(PENDING, readLines(PENDING).filter((p) => String(p.id) !== String(msg.id)));
        } else if (req.url === "/consume") {
          const rows = readLines(PENDING);
          const hit = rows.find((p) => String(p.id) === String(msg.id));
          if (!hit) {
            json(404, { ok: false, error: "not found" });
            return;
          }
          writeLines(PENDING, rows.filter((p) => p !== hit));
          fs.appendFileSync(
            AUDIT,
            JSON.stringify({
              ts: Date.now(),
              id: hit.id,
              action: "annotation_applied",
              old: hit.note,
              new: typeof msg.fix === "string" ? msg.fix : null,
              target: hit.target || null,
            }) + "\n",
            "utf8"
          );
        }
        json(200, { ok: true });
      } catch (e) {
        json(400, { ok: false, error: String(e) });
      }
    });
    return;
  }
  json(404, { ok: false, error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`annot-server on http://127.0.0.1:${PORT} -> ${DIR}`);
});
