/**
 * Topology host protocol endpoints.
 *
 * Exposes /api/topology/snapshot and /api/topology/command — the same
 * endpoints the dev harness uses, so the UI's topologyHostClient.ts
 * works without changes.
 *
 * Each lab gets a TopologyHostCore backed by ClabApiFileSystemAdapter.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ClabApiClient, ClabContainerInfo } from "./clabApiClient.js";
import { ClabApiFileSystemAdapter } from "./clabApiFileSystem.js";
import { getTokenFromRequest } from "./middleware.js";
import { TopologyHostCore } from "@srl-labs/clab-ui/core/host/TopologyHostCore";
import type { ContainerDataProvider, ContainerInfo } from "@srl-labs/clab-ui/core/parsing/types";
import type {
  TopologyHostCommand,
  TopologyHostResponseMessage,
  TopologySnapshot
} from "@srl-labs/clab-ui/core/types/messages";

interface SnapshotRequest {
  path: string;
  mode?: "edit" | "view";
  deploymentState?: DeploymentState;
  externalChange?: boolean;
}

interface CommandRequest {
  path: string;
  mode?: "edit" | "view";
  deploymentState?: DeploymentState;
  baseRevision: number;
  command: TopologyHostCommand;
}

// Cache TopologyHostCore instances per token+lab combination
type DeploymentState = "deployed" | "undeployed" | "unknown";

const hostCache = new Map<string, { host: TopologyHostCore; lastAccess: number; path: string }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isMissingTopologyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ENOENT") || message.includes("(404)");
}

function normalizeCachePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of hostCache.entries()) {
    if (now - entry.lastAccess > CACHE_TTL_MS) {
      entry.host.dispose();
      hostCache.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupCache, 60_000);

function extractLabName(filePath: string): string {
  // The path comes as "labName.clab.yml" or similar
  // The clab-api-server expects just the lab name (without .clab.yml)
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const basename = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;
  // Strip .clab.yml/.clab.yaml suffix to get lab name
  return basename.replace(/\.clab\.ya?ml$/i, "");
}

function stripCidr(address: string | undefined): string {
  if (!address) {
    return "";
  }
  const [value] = address.split("/");
  return value ?? "";
}

function shortContainerName(container: ClabContainerInfo): string {
  if (container.node_name && container.node_name.length > 0) {
    return container.node_name;
  }
  const fullName = container.name ?? "";
  const prefix = container.lab_name ? `clab-${container.lab_name}-` : "";
  if (prefix && fullName.startsWith(prefix)) {
    return fullName.slice(prefix.length);
  }
  return fullName;
}

function normalizeLabName(labName: string): string {
  return labName.trim().toLowerCase();
}

function createContainerDataProvider(
  labs: Record<string, ClabContainerInfo[]>
): ContainerDataProvider {
  const containersByLab = new Map<string, ClabContainerInfo[]>(
    Object.entries(labs).map(([labName, containers]) => [normalizeLabName(labName), containers])
  );

  const findContainerEntry = (containerName: string, labName: string): ClabContainerInfo | undefined => {
    const containers = containersByLab.get(normalizeLabName(labName)) ?? [];
    return containers.find((container) => {
      if (container.name === containerName) return true;
      if (container.node_name === containerName) return true;
      return shortContainerName(container) === containerName;
    });
  };

  const toContainerInfo = (container: ClabContainerInfo): ContainerInfo => ({
    name: container.name,
    name_short: shortContainerName(container),
    rootNodeName: container.node_name,
    state: container.state ?? "",
    kind: container.kind ?? "",
    image: container.image ?? "",
    IPv4Address: stripCidr(container.ipv4_address),
    IPv6Address: stripCidr(container.ipv6_address),
    interfaces: [],
    label: container.node_name || container.name
  });

  return {
    findContainer(containerName: string, labName: string): ContainerInfo | undefined {
      const container = findContainerEntry(containerName, labName);
      return container ? toContainerInfo(container) : undefined;
    },
    findInterface() {
      return undefined;
    }
  };
}

async function getOrCreateHost(
  client: ClabApiClient,
  token: string,
  filePath: string,
  mode: "edit" | "view",
  deploymentState: DeploymentState,
  containerDataProvider?: ContainerDataProvider
): Promise<TopologyHostCore> {
  const labName = extractLabName(filePath);
  const normalizedPath = normalizeCachePath(filePath);
  const cacheKey = `${client.getBaseUrl()}:${token}:${labName}`;

  const cached = hostCache.get(cacheKey);
  if (cached) {
    if (cached.path !== normalizedPath) {
      cached.host.dispose();
      hostCache.delete(cacheKey);
    } else {
      cached.lastAccess = Date.now();
      cached.host.updateContext({ mode, deploymentState, containerDataProvider });
      return cached.host;
    }
  }

  const fs = new ClabApiFileSystemAdapter({ client, token, labName });

  const host = new TopologyHostCore({
    fs,
    yamlFilePath: filePath,
    mode,
    deploymentState,
    containerDataProvider,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: console.error
    }
  });

  hostCache.set(cacheKey, { host, lastAccess: Date.now(), path: normalizedPath });
  return host;
}

type ClientResolver = (request: FastifyRequest) => ClabApiClient;

export function registerTopologyProxy(app: FastifyInstance, getClient: ClientResolver): void {
  app.post<{ Body: SnapshotRequest }>(
    "/api/topology/snapshot",
    async (request: FastifyRequest<{ Body: SnapshotRequest }>, reply: FastifyReply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        return reply.status(401).send({ error: "Not authenticated" });
      }
      const client = getClient(request);

      const body = request.body;
      if (!body.path) {
        return reply.status(400).send({ error: "Missing path" });
      }

      try {
        const deploymentState = body.deploymentState ?? "undeployed";
        const mode = body.mode ?? (deploymentState === "deployed" ? "view" : "edit");
        const containerDataProvider = deploymentState === "deployed"
          ? createContainerDataProvider(await client.listLabs(token))
          : undefined;
        const host = await getOrCreateHost(
          client,
          token,
          body.path,
          mode,
          deploymentState,
          containerDataProvider
        );

        let snapshot: TopologySnapshot;
        if (body.externalChange) {
          snapshot = await host.onExternalChange();
        } else {
          snapshot = await host.getSnapshot();
        }

        return reply.send({ snapshot });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = isMissingTopologyError(error) ? 404 : 500;
        return reply.status(statusCode).send({ error: message });
      }
    }
  );

  app.post<{ Body: CommandRequest }>(
    "/api/topology/command",
    async (request: FastifyRequest<{ Body: CommandRequest }>, reply: FastifyReply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        return reply.status(401).send({ error: "Not authenticated" });
      }
      const client = getClient(request);

      const body = request.body;
      if (!body.path || !body.command) {
        return reply.status(400).send({ error: "Missing path or command" });
      }

      try {
        const deploymentState = body.deploymentState ?? "undeployed";
        const mode = body.mode ?? (deploymentState === "deployed" ? "view" : "edit");
        const containerDataProvider = deploymentState === "deployed"
          ? createContainerDataProvider(await client.listLabs(token))
          : undefined;
        const host = await getOrCreateHost(
          client,
          token,
          body.path,
          mode,
          deploymentState,
          containerDataProvider
        );

        const response: TopologyHostResponseMessage = await host.applyCommand(
          body.command,
          body.baseRevision
        );
        return reply.send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = isMissingTopologyError(error) ? 404 : 500;
        return reply.status(statusCode).send({
          type: "topology-host:error",
          error: message
        });
      }
    }
  );
}
