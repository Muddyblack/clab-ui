import { create } from "zustand";

export interface ContainerState {
  name: string;
  containerId: string;
  labName: string;
  labPath: string;
  nodeName: string;
  kind: string;
  image: string;
  state: string;
  status: string;
  ipv4Address: string;
  ipv6Address: string;
}

export interface LabState {
  name: string;
  containers: Map<string, ContainerState>;
}

interface LabStoreState {
  labs: Map<string, LabState>;
  connected: boolean;
  setConnected: (connected: boolean) => void;
  processEvent: (event: EventData) => void;
  clear: () => void;
}

export interface EventData {
  time?: number;
  type: string;
  action: string;
  attributes: Record<string, string>;
}

function extractContainerState(attrs: Record<string, string>): ContainerState {
  return {
    name: attrs.name ?? "",
    containerId: attrs["container-id"] ?? attrs.name ?? "",
    labName: attrs.lab ?? "",
    labPath: attrs["lab-path"] ?? attrs["clab-topo-file"] ?? "",
    nodeName: attrs["clab-node-name"] ?? "",
    kind: attrs["clab-node-kind"] ?? "",
    image: attrs.image ?? "",
    state: attrs.state ?? "running",
    status: attrs.status ?? "",
    ipv4Address: attrs["ipv4-address"] ?? "N/A",
    ipv6Address: attrs["ipv6-address"] ?? "N/A"
  };
}

export const useLabStore = create<LabStoreState>((set, get) => ({
  labs: new Map(),
  connected: false,

  setConnected: (connected) => set({ connected }),

  processEvent: (event) => {
    if (event.type !== "container") return;

    const attrs = event.attributes;
    const labName = attrs.lab || attrs.containerlab;
    if (!labName) return;

    const labs = new Map(get().labs);
    let lab = labs.get(labName);

    if (!lab) {
      lab = { name: labName, containers: new Map() };
      labs.set(labName, lab);
    }

    const containerName = attrs.name ?? "";
    if (!containerName) return;
    const action = event.action;

    if (action === "destroy" || action === "die" || action === "kill") {
      lab.containers.delete(containerName);
      // If no containers left, remove the lab
      if (lab.containers.size === 0) {
        labs.delete(labName);
      }
    } else {
      // start, create, running, health_status, etc.
      const container = extractContainerState(attrs);
      lab.containers = new Map(lab.containers);
      lab.containers.set(containerName, container);
      labs.set(labName, { ...lab });
    }

    set({ labs });
  },

  clear: () => set({ labs: new Map(), connected: false })
}));
