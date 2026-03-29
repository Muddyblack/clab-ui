/**
 * Lab lifecycle action proxy - deploy, destroy, redeploy.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ClabApiClient } from "./clabApiClient.js";
import { getTokenFromRequest } from "./middleware.js";

interface LabActionBody {
  labName: string;
}

type ClientResolver = (request: FastifyRequest) => ClabApiClient;

export function registerLabProxy(app: FastifyInstance, getClient: ClientResolver): void {
  app.post<{ Body: LabActionBody }>(
    "/api/lab/deploy",
    async (request: FastifyRequest<{ Body: LabActionBody }>, reply: FastifyReply) => {
      const token = getTokenFromRequest(request);
      if (!token) return reply.status(401).send({ error: "Not authenticated" });

      const { labName } = request.body;
      if (!labName) return reply.status(400).send({ error: "Missing labName" });

      try {
        const client = getClient(request);
        const result = await client.deployLab(token, labName);
        return reply.send({ success: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: message });
      }
    }
  );

  app.post<{ Body: LabActionBody }>(
    "/api/lab/destroy",
    async (request: FastifyRequest<{ Body: LabActionBody }>, reply: FastifyReply) => {
      const token = getTokenFromRequest(request);
      if (!token) return reply.status(401).send({ error: "Not authenticated" });

      const { labName } = request.body;
      if (!labName) return reply.status(400).send({ error: "Missing labName" });

      try {
        const client = getClient(request);
        await client.destroyLab(token, labName);
        return reply.send({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: message });
      }
    }
  );

  app.post<{ Body: LabActionBody }>(
    "/api/lab/redeploy",
    async (request: FastifyRequest<{ Body: LabActionBody }>, reply: FastifyReply) => {
      const token = getTokenFromRequest(request);
      if (!token) return reply.status(401).send({ error: "Not authenticated" });

      const { labName } = request.body;
      if (!labName) return reply.status(400).send({ error: "Missing labName" });

      try {
        const client = getClient(request);
        const result = await client.redeployLab(token, labName);
        return reply.send({ success: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: message });
      }
    }
  );
}
