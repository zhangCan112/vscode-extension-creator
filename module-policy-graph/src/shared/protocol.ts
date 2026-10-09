// 宿主 <-> webview 消息协议：禁止 import vscode
import type { GraphPayload } from "./model";

export type HostToWebview =
  | { type: "load"; payload: GraphPayload }
  | { type: "focusModule"; module: string };

export type WebviewToHost =
  | { type: "ready" }
  | { type: "openFile"; module: string };
