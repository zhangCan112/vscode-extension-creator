import * as vscode from "vscode";
import type { GraphPayload } from "./shared/model";

export class PolicyStore {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _payload: GraphPayload = { source: "files", nodes: [], edges: [], cycleEdgeIds: [] };
  private _errors: string[] = [];

  get payload(): GraphPayload {
    return this._payload;
  }

  get errors(): string[] {
    return this._errors;
  }

  set(payload: GraphPayload, errors: string[]): void {
    this._payload = payload;
    this._errors = errors;
    this._onDidChange.fire();
  }
}
