/**
 * Fastify middleware for cookie-based JWT session management.
 */

import type { FastifyRequest, FastifyReply } from "fastify";

const COOKIE_NAME = "clab_token";

/**
 * Extracts JWT token from httpOnly cookie.
 * Attaches it to request headers for downstream use.
 */
export function getTokenFromRequest(request: FastifyRequest): string | null {
  const cookies = request.cookies as Record<string, string | undefined>;
  return cookies[COOKIE_NAME] ?? null;
}

/**
 * Sets JWT token as httpOnly cookie on the response.
 */
export function setTokenCookie(reply: FastifyReply, token: string): void {
  void reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 3600 // 1 hour, matches default JWT expiration
  });
}

/**
 * Clears the JWT cookie.
 */
export function clearTokenCookie(reply: FastifyReply): void {
  void reply.clearCookie(COOKIE_NAME, {
    path: "/"
  });
}

/**
 * Auth guard - returns 401 if no valid token present.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = getTokenFromRequest(request);
  if (!token) {
    reply.status(401).send({ error: "Not authenticated" });
  }
}
