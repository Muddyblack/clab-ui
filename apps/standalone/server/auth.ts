/**
 * Auth routes - proxies login to clab-api-server and manages JWT cookies.
 */

import type { FastifyInstance } from "fastify";
import type { ClabApiClient } from "./clabApiClient.js";
import { getTokenFromRequest, setTokenCookie, clearTokenCookie } from "./middleware.js";

export function registerAuthRoutes(app: FastifyInstance, client: ClabApiClient): void {
  app.post<{
    Body: { username: string; password: string };
  }>("/auth/login", async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.status(400).send({ error: "Username and password are required" });
    }

    try {
      const result = await client.login(username, password);
      setTokenCookie(reply, result.token);
      return reply.send({ success: true, username });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      return reply.status(401).send({ error: message });
    }
  });

  app.post("/auth/logout", async (_request, reply) => {
    clearTokenCookie(reply);
    return reply.send({ success: true });
  });

  app.get("/auth/me", async (request, reply) => {
    const token = getTokenFromRequest(request);
    if (!token) {
      return reply.send({ authenticated: false });
    }

    // Validate token by making a lightweight API call
    try {
      await client.listTopologies(token);
      return reply.send({ authenticated: true });
    } catch {
      clearTokenCookie(reply);
      return reply.send({ authenticated: false });
    }
  });
}
