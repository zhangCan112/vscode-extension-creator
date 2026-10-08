// 宿主（扩展进程）与关系图 webview（浏览器环境）之间共享的消息协议。
// 纯类型 + 纯函数文件：禁止 import vscode——它同时被 node（extension）与 browser（webviewGraph）两个 bundle 引用。

export interface GraphViewCharacter {
  id: string;
  name: string;
  faction: string;
  title: string;
}

export interface GraphViewRelation {
  source: string;
  target: string;
  type: string;
  status?: string;
  note?: string;
}

/** 宿主 → webview */
export type ToWebviewMessage =
  | { type: "graph"; characters: GraphViewCharacter[]; relations: GraphViewRelation[] }
  | { type: "highlight"; personId: string }
  | { type: "clearHighlight" };

/** webview → 宿主 */
export type ToHostMessage =
  | { type: "ready" }
  | { type: "selectPerson"; personId: string }
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
    case "selectPerson":
      return typeof msg.personId === "string" && msg.personId.length > 0
        ? { type: "selectPerson", personId: msg.personId }
        : undefined;
    case "webviewError":
      return typeof msg.message === "string" ? { type: "webviewError", message: msg.message } : undefined;
    default:
      return undefined;
  }
}
