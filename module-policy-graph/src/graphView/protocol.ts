// 宿主（扩展进程）与策略图 webview（浏览器环境）之间共享的消息协议。
// 纯类型 + 纯函数文件：禁止 import vscode——它同时被 node（extension）与 browser（webviewGraph）两个 bundle 引用。
import type { Channel, ModulePolicy } from "../schema";

/** 宿主 → webview */
export type ToWebviewMessage = {
  type: "graph";
  modules: ModulePolicy[];
  channels: Channel[];
};

/** webview → 宿主 */
export type ToHostMessage =
  | { type: "ready" }
  | { type: "requestDemo" }
  | { type: "webviewError"; message: string };

/** 宿主侧收窄守卫：webview 消息当不可信输入校验后才使用 */
export function parseToHostMessage(raw: unknown): ToHostMessage | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const msg = raw as Record<string, unknown>;
  switch (msg.type) {
    case "ready":
      return { type: "ready" };
    case "requestDemo":
      return { type: "requestDemo" };
    case "webviewError":
      return typeof msg.message === "string" ? { type: "webviewError", message: msg.message } : undefined;
    default:
      return undefined;
  }
}
