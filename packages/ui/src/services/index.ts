/**
 * Webview Services (Host-authoritative)
 */

export { executeTopologyCommand, executeTopologyCommands } from "./topologyHostCommands";
export {
  dispatchTopologyCommand,
  getHostContext,
  getHostRevision,
  requestSnapshot,
  resetHostTransport,
  setHostContext,
  setHostRevision,
  setHostTransport
} from "./topologyHostClient";
export type {
  HostContext,
  SnapshotRequestOptions,
  TopologyHostTransport
} from "./topologyHostClient";
export { toLinkSaveData } from "./linkSaveData";

export {
  saveEdgeAnnotations,
  saveViewerSettings,
  saveNodeGroupMembership,
  saveAllNodeGroupMemberships,
  saveAnnotationNodesFromGraph,
  saveAnnotationNodesWithMemberships
} from "./annotationSaveHelpers";

export {
  createNode,
  deleteNode,
  createLink,
  deleteLink,
  buildNetworkNodeAnnotations,
  saveNetworkNodesFromGraph,
  saveNodePositions,
  saveNodePositionsWithAnnotations,
  saveNodePositionsWithMemberships
} from "./topologyCrud";

export type { NodeSaveData, LinkSaveData, NetworkNodeData } from "./topologyCrud";

export { getCustomIconMap, buildCustomIconMap } from "../utils/iconUtils";
