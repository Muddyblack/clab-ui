/**
 * File listing proxy - returns topology files in the format the Explorer expects.
 */

import type { FastifyInstance } from "fastify";
import type { ClabApiClient } from "./clabApiClient.js";
import { getTokenFromRequest } from "./middleware.js";

export function registerFileProxy(app: FastifyInstance, client: ClabApiClient): void {
  app.get("/files", async (request, reply) => {
    const token = getTokenFromRequest(request);
    if (!token) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    try {
      const topologies = await client.listTopologies(token);
      const labs = await client.listLabs(token);

      const filesByLab = new Map<string, {
        filename: string;
        path: string;
        hasAnnotations: boolean;
        labName: string;
        deploymentState: string;
      }>();

      // Transform to the format expected by the Explorer bridge
      for (const topo of topologies) {
        filesByLab.set(topo.labName, {
          filename: topo.yamlFileName,
          path: topo.yamlFileName,
          hasAnnotations: topo.hasAnnotations,
          labName: topo.labName,
          deploymentState: topo.deploymentState
        });
      }

      for (const labName of Object.keys(labs)) {
        const existing = filesByLab.get(labName);
        if (existing) {
          existing.deploymentState = "deployed";
          filesByLab.set(labName, existing);
          continue;
        }

        filesByLab.set(labName, {
          filename: `${labName}.clab.yml`,
          path: `${labName}.clab.yml`,
          hasAnnotations: false,
          labName,
          deploymentState: "deployed"
        });
      }

      return reply.send(Array.from(filesByLab.values()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: message });
    }
  });
}
