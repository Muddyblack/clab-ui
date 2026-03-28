/**
 * Topology host client facade.
 *
 * The UI talks to an injected transport. A VS Code message transport is used
 * as lazy default when `window.vscode` exists and is not a dev mock.
 */

import type {
  TopologyHostCommand,
  TopologyHostResponseMessage,
  TopologyHostSnapshotMessage,
  TopologySnapshot
} from "../core/types/messages";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../core/types/messages";
import type { DeploymentState } from "../core/types/topology";
import { subscribeToWebviewMessages } from "../messaging/webviewMessageBus";

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void; __isDevMock__?: boolean };
  }
}

export interface HostContext {
  path?: string;
  mode?: "edit" | "view";
  deploymentState?: DeploymentState;
  sessionId?: string;
}

export interface SnapshotRequestOptions {
  externalChange?: boolean;
}

export interface TopologyHostTransport {
  requestSnapshot(options?: SnapshotRequestOptions): Promise<TopologySnapshot>;
  dispatch(command: TopologyHostCommand, revision: number): Promise<TopologyHostResponseMessage>;
  setContext?(context: Partial<HostContext>): void;
  dispose?(): void;
}

type HostResponseMessage = Extract<
  TopologyHostResponseMessage,
  { type: "topology-host:ack" | "topology-host:reject" | "topology-host:error" }
>;

type RequestKind = "snapshot" | "command";

interface PendingRequest {
  kind: RequestKind;
  resolve: (value: TopologySnapshot | TopologyHostResponseMessage) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface VsCodeTransportOptions {
  timeoutMs?: number;
  vscodeApi?: { postMessage(data: unknown): void; __isDevMock__?: boolean };
}

const DEFAULT_TIMEOUT_MS = 30_000;

function createRequestId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSnapshotMessage(data: unknown): data is TopologyHostSnapshotMessage {
  return isObject(data) && data.type === "topology-host:snapshot" && isObject(data.snapshot);
}

function isHostResponse(data: unknown): data is HostResponseMessage {
  return (
    isObject(data) &&
    (data.type === "topology-host:ack" || data.type === "topology-host:reject" || data.type === "topology-host:error")
  );
}

class VsCodeMessageTopologyHostTransport implements TopologyHostTransport {
  private readonly timeoutMs: number;
  private readonly vscodeApi?: { postMessage(data: unknown): void; __isDevMock__?: boolean };
  private readonly pending = new Map<string, PendingRequest>();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(options: VsCodeTransportOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.vscodeApi = options.vscodeApi ?? window.vscode;

    this.unsubscribe = subscribeToWebviewMessages(
      (event) => {
        this.handleMessage(event.data);
      },
      (event) => {
        const type = event.data?.type;
        return (
          type === "topology-host:snapshot" ||
          type === "topology-host:ack" ||
          type === "topology-host:reject" ||
          type === "topology-host:error"
        );
      }
    );
  }

  async requestSnapshot(_options: SnapshotRequestOptions = {}): Promise<TopologySnapshot> {
    return this.sendRequest<TopologySnapshot>(
      {
        type: "topology-host:get-snapshot",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION
      },
      "snapshot"
    );
  }

  async dispatch(command: TopologyHostCommand, revision: number): Promise<TopologyHostResponseMessage> {
    return this.sendRequest<TopologyHostResponseMessage>(
      {
        type: "topology-host:command",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        baseRevision: revision,
        command
      },
      "command"
    );
  }

  setContext(_context: Partial<HostContext>): void {
    // VS Code transport does not need client-side context injection.
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribe();

    for (const [requestId, request] of this.pending.entries()) {
      clearTimeout(request.timeoutId);
      request.reject(new Error(`Transport disposed while request ${requestId} was pending`));
    }
    this.pending.clear();
  }

  private sendRequest<T>(payload: Record<string, unknown>, kind: RequestKind): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("Transport is disposed"));
    }
    if (!this.vscodeApi || this.vscodeApi.__isDevMock__) {
      return Promise.reject(new Error("VS Code API is unavailable for topology transport"));
    }

    const requestId = createRequestId();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${kind} request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pending.set(requestId, {
        kind,
        resolve: resolve as PendingRequest["resolve"],
        reject,
        timeoutId
      });

      this.vscodeApi?.postMessage({ ...payload, requestId });
    });
  }

  private handleMessage(data: unknown): void {
    if (isSnapshotMessage(data)) {
      const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
      if (!requestId) {
        return;
      }

      const pending = this.pending.get(requestId);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeoutId);
      this.pending.delete(requestId);

      if (pending.kind !== "snapshot") {
        pending.reject(new Error("Received snapshot response for non-snapshot request"));
        return;
      }

      pending.resolve(data.snapshot);
      return;
    }

    if (!isHostResponse(data)) {
      return;
    }

    const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
    if (!requestId) {
      return;
    }

    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pending.delete(requestId);

    if (pending.kind !== "command") {
      pending.reject(new Error("Received command response for non-command request"));
      return;
    }

    pending.resolve(data);
  }
}

let revision = 1;
let hostContext: HostContext = {};
let configuredTransport: TopologyHostTransport | null = null;
let defaultTransport: TopologyHostTransport | null = null;

function disposeTransport(transport: TopologyHostTransport | null): void {
  if (!transport || typeof transport.dispose !== "function") {
    return;
  }
  transport.dispose();
}

function createDefaultTransport(): TopologyHostTransport | null {
  if (typeof window === "undefined") {
    return null;
  }

  const vscodeApi = window.vscode;
  if (!vscodeApi || vscodeApi.__isDevMock__) {
    return null;
  }

  return new VsCodeMessageTopologyHostTransport({ vscodeApi });
}

function resolveTransport(): TopologyHostTransport {
  if (configuredTransport) {
    return configuredTransport;
  }

  if (!defaultTransport) {
    defaultTransport = createDefaultTransport();
    defaultTransport?.setContext?.(hostContext);
  }

  if (!defaultTransport) {
    throw new Error(
      "No topology host transport configured. Call setHostTransport(...) before using TopoViewer host commands."
    );
  }

  return defaultTransport;
}

export function setHostTransport(transport: TopologyHostTransport | null): void {
  if (configuredTransport && configuredTransport !== transport) {
    disposeTransport(configuredTransport);
  }
  configuredTransport = transport;

  if (defaultTransport) {
    disposeTransport(defaultTransport);
    defaultTransport = null;
  }

  configuredTransport?.setContext?.(hostContext);
}

export function resetHostTransport(): void {
  if (configuredTransport) {
    disposeTransport(configuredTransport);
    configuredTransport = null;
  }
  if (defaultTransport) {
    disposeTransport(defaultTransport);
    defaultTransport = null;
  }
}

export function setHostContext(update: Partial<HostContext>): void {
  hostContext = { ...hostContext, ...update };
  configuredTransport?.setContext?.(hostContext);
  defaultTransport?.setContext?.(hostContext);
}

export function getHostContext(): HostContext {
  return hostContext;
}

export function getHostRevision(): number {
  return revision;
}

export function setHostRevision(nextRevision: number): void {
  revision = nextRevision;
}

export async function requestSnapshot(
  options: SnapshotRequestOptions = {}
): Promise<TopologySnapshot> {
  return resolveTransport().requestSnapshot(options);
}

export async function dispatchTopologyCommand(
  command: TopologyHostCommand
): Promise<TopologyHostResponseMessage> {
  return resolveTransport().dispatch(command, revision);
}
