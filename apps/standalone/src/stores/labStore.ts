import { create } from "zustand";

type EventAttributeValue = string | number;

export interface ContainerState {
  name: string;
  containerId: string;
  labName: string;
  labPath: string;
  owner: string;
  nodeName: string;
  kind: string;
  image: string;
  state: string;
  status: string;
  ipv4Address: string;
  ipv6Address: string;
  interfaces: Map<string, InterfaceState>;
}

export interface InterfaceState {
  name: string;
  alias: string;
  state: string;
  type: string;
  mac: string;
  mtu: string;
  ifIndex?: string;
  rxBps?: string;
  txBps?: string;
  rxPps?: string;
  txPps?: string;
  rxBytes?: string;
  txBytes?: string;
  rxPackets?: string;
  txPackets?: string;
  statsIntervalSeconds?: string;
  netemDelay?: string;
  netemJitter?: string;
  netemLoss?: string;
  netemRate?: string;
  netemCorruption?: string;
}

export interface LabState {
  name: string;
  owner: string;
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
  attributes: Record<string, EventAttributeValue>;
}

function getAttrString(
  attrs: Record<string, EventAttributeValue>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function extractContainerState(attrs: Record<string, EventAttributeValue>): ContainerState {
  return {
    name: getAttrString(attrs, "name") ?? "",
    containerId: getAttrString(attrs, "container-id", "id", "name") ?? "",
    labName: getAttrString(attrs, "lab", "containerlab") ?? "",
    labPath: getAttrString(attrs, "lab-path", "clab-topo-file") ?? "",
    owner: getAttrString(attrs, "clab-owner", "owner") ?? "",
    nodeName: getAttrString(attrs, "clab-node-name") ?? "",
    kind: getAttrString(attrs, "clab-node-kind") ?? "",
    image: getAttrString(attrs, "image") ?? "",
    state: getAttrString(attrs, "state") ?? "running",
    status: getAttrString(attrs, "status") ?? "",
    ipv4Address: getAttrString(attrs, "ipv4-address", "mgmt_ipv4") ?? "N/A",
    ipv6Address: getAttrString(attrs, "ipv6-address", "mgmt_ipv6") ?? "N/A",
    interfaces: new Map()
  };
}

function upsertInterface(
  container: ContainerState,
  attrs: Record<string, EventAttributeValue>,
  action: string
): void {
  const interfaceName = getAttrString(attrs, "ifname", "interface") ?? "";
  if (!interfaceName) return;
  if (interfaceName.startsWith("clab-")) {
    container.interfaces.delete(interfaceName);
    return;
  }
  if (action === "delete") {
    container.interfaces.delete(interfaceName);
    return;
  }

  const existing = container.interfaces.get(interfaceName);
  const next: InterfaceState = {
    name: interfaceName,
    alias: getAttrString(attrs, "alias") ?? existing?.alias ?? "",
    state: getAttrString(attrs, "state") ?? existing?.state ?? "",
    type: getAttrString(attrs, "type") ?? existing?.type ?? "",
    mac: getAttrString(attrs, "mac") ?? existing?.mac ?? "",
    mtu: getAttrString(attrs, "mtu") ?? existing?.mtu ?? "",
    ifIndex: getAttrString(attrs, "index") ?? existing?.ifIndex,
    rxBps: getAttrString(attrs, "rx_bps") ?? existing?.rxBps,
    txBps: getAttrString(attrs, "tx_bps") ?? existing?.txBps,
    rxPps: getAttrString(attrs, "rx_pps") ?? existing?.rxPps,
    txPps: getAttrString(attrs, "tx_pps") ?? existing?.txPps,
    rxBytes: getAttrString(attrs, "rx_bytes") ?? existing?.rxBytes,
    txBytes: getAttrString(attrs, "tx_bytes") ?? existing?.txBytes,
    rxPackets: getAttrString(attrs, "rx_packets") ?? existing?.rxPackets,
    txPackets: getAttrString(attrs, "tx_packets") ?? existing?.txPackets,
    statsIntervalSeconds: getAttrString(attrs, "interval_seconds") ?? existing?.statsIntervalSeconds,
    netemDelay: getAttrString(attrs, "netem_delay") ?? existing?.netemDelay,
    netemJitter: getAttrString(attrs, "netem_jitter") ?? existing?.netemJitter,
    netemLoss: getAttrString(attrs, "netem_loss") ?? existing?.netemLoss,
    netemRate: getAttrString(attrs, "netem_rate") ?? existing?.netemRate,
    netemCorruption: getAttrString(attrs, "netem_corruption") ?? existing?.netemCorruption
  };

  if (action === "stats") {
    next.alias = existing?.alias ?? next.alias;
    next.type = existing?.type ?? next.type;
    next.mac = existing?.mac ?? next.mac;
    next.mtu = existing?.mtu ?? next.mtu;
  }

  container.interfaces.set(interfaceName, next);
}

export const useLabStore = create<LabStoreState>((set, get) => ({
  labs: new Map(),
  connected: false,

  setConnected: (connected) => set({ connected }),

  processEvent: (event) => {
    const attrs = event.attributes;
    const labName = getAttrString(attrs, "lab", "containerlab");
    if (!labName) return;

    const previousLabs = get().labs;
    const labs = new Map(previousLabs);
    const existingLab = previousLabs.get(labName);
    const lab: LabState = existingLab
      ? { name: existingLab.name, owner: existingLab.owner, containers: new Map(existingLab.containers) }
      : {
          name: labName,
          owner: getAttrString(attrs, "clab-owner", "owner") ?? "",
          containers: new Map()
        };

    const containerName = getAttrString(attrs, "name") ?? "";
    if (!containerName) return;
    const action = event.action;

    if (event.type === "container") {
      if (action === "destroy" || action === "die" || action === "kill") {
        lab.containers.delete(containerName);
        // If no containers left, remove the lab
        if (lab.containers.size === 0) {
          labs.delete(labName);
        } else {
          labs.set(labName, lab);
        }
      } else {
        // start, create, running, health_status, etc.
        const incoming = extractContainerState(attrs);
        const existing = lab.containers.get(containerName);
        const container = {
          ...(existing ?? incoming),
          ...incoming,
          interfaces: new Map(existing?.interfaces ?? incoming.interfaces)
        };
        if (incoming.owner) {
          lab.owner = incoming.owner;
        }
        lab.containers.set(containerName, container);
        labs.set(labName, lab);
      }
    } else if (event.type === "interface" || event.type === "interface-stats") {
      const existing = lab.containers.get(containerName);
      const placeholder = extractContainerState(attrs);
      const container: ContainerState = existing
        ? { ...existing, interfaces: new Map(existing.interfaces) }
        : placeholder;
      upsertInterface(container, attrs, action);
      lab.containers.set(containerName, container);
      labs.set(labName, lab);
    }

    set({ labs });
  },

  clear: () => set({ labs: new Map(), connected: false })
}));
