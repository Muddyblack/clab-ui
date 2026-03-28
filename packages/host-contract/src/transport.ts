import type {
  LifecycleAction,
  LifecycleResult,
  NodeRuntimeData,
  SnapshotRequestOptions,
  TopologyCommand,
  TopologyHostContext,
  TopologyHostEvent,
  TopologyHostResponse,
  TopologySnapshotState
} from "./types";

export type Unsubscribe = () => void;

/**
 * Transport-neutral interface for topology host communication.
 * Implemented by each adapter package.
 */
export interface TopologyHostTransport {
  requestSnapshot(options?: SnapshotRequestOptions): Promise<TopologySnapshotState>;

  dispatch(command: TopologyCommand, revision: number): Promise<TopologyHostResponse>;

  subscribe(handler: (event: TopologyHostEvent) => void): Unsubscribe;

  setContext?(context: Partial<TopologyHostContext>): void;

  executeLifecycleAction?(action: LifecycleAction): Promise<LifecycleResult>;

  getNodeRuntime?(labName: string, nodeName: string): Promise<NodeRuntimeData>;

  dispose(): void;
}
