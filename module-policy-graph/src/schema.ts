// 纯类型 + 常量文件：宿主（node）与 webview（browser）共享的核心 schema。
// 禁止 import vscode / node 模块——被两个 bundle 同时引用。

/** 固定的消息类型集合：policy 里只允许出现这三种 */
export const MESSAGE_TYPES = ["command", "query", "viewquery"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** 模块层级 */
export const TIERS = ["entry", "feature", "domain", "infra"] as const;
export type Tier = (typeof TIERS)[number];

/** policy 单方向声明（发送/接受）对齐后的视图 */
export interface PolicyDirection {
  peer: string;
  type: MessageType;
  matched: boolean;
}

/** 一个模块的完整 policy（含匹配结果），供 webview 审计面板使用 */
export interface ModulePolicy {
  id: string;
  tier: Tier;
  description?: string;
  send: PolicyDirection[];
  receive: PolicyDirection[];
}

/**
 * 通道匹配状态：
 * - matched     双方声明对齐（A.send + B.receive），数据可流动
 * - sendOnly    悬空发送：A 声明发送，B 未声明接受
 * - receiveOnly 悬空订阅：B 声明接受，A 未声明发送
 */
export type ChannelStatus = "matched" | "sendOnly" | "receiveOnly";

/** 图上一条通道 = (source → target, type)，source 为数据流方向（SEND 方向） */
export interface Channel {
  id: string;
  source: string;
  target: string;
  type: MessageType;
  status: ChannelStatus;
}

export interface Graph {
  policies: ModulePolicy[];
  channels: Channel[];
}

export function channelEdgeId(source: string, target: string, type: string): string {
  return `${source}->${target}:${type}`;
}
