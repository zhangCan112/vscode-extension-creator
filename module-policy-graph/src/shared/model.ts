// 共享领域模型：宿主与 webview 双 bundle 共用，禁止 import vscode

export const TIERS = ["entry", "feature", "domain", "infra"] as const;
export type Tier = (typeof TIERS)[number];

export const MSG_TYPES = ["command", "query", "viewquery"] as const;
export type MsgType = (typeof MSG_TYPES)[number];

export interface SendDecl {
  to: string;
  type: MsgType;
}

export interface ReceiveDecl {
  from: string;
  type: MsgType;
}

export interface PolicyFile {
  module: string;
  tier: Tier;
  description?: string;
  send: SendDecl[];
  receive: ReceiveDecl[];
}

export type ChannelState = "aligned" | "dangling-send" | "dangling-receive";

export interface GraphNode {
  id: string;
  tier: Tier;
  description: string;
  /** 涉及该模块的声明总数（含悬空），用于枢纽度量 */
  degree: number;
  /** 该模块参与的悬空声明数（发送 + 接受） */
  danglingCount: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: MsgType;
  state: ChannelState;
}

export interface GraphPayload {
  source: "files" | "demo";
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 处在循环依赖上的已对齐通道 id 集合 */
  cycleEdgeIds: string[];
}
