/**
 * Typed HTTP client for clab-api-server REST endpoints.
 */

interface HttpError extends Error {
  status?: number;
}

export interface ClabApiClientOptions {
  baseUrl: string;
}

export interface LoginResponse {
  token: string;
}

export interface TopologyEntry {
  labName: string;
  yamlFileName: string;
  annotationsFileName: string;
  hasAnnotations: boolean;
  deploymentState: string;
}

export interface ClabLabInfo {
  name: string;
  containers: ClabContainerInfo[];
}

export interface ClabContainerInfo {
  name: string;
  container_id: string;
  lab_name: string;
  lab_path: string;
  node_name: string;
  kind: string;
  image: string;
  state: string;
  status: string;
  ipv4_address: string;
  ipv6_address: string;
}

export class ClabApiClient {
  private readonly baseUrl: string;

  constructor(options: ClabApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${this.baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Login failed: ${text}`);
    }
    return (await res.json()) as LoginResponse;
  }

  async listTopologies(token: string): Promise<TopologyEntry[]> {
    const res = await this.get(`/api/v1/topologies`, token);
    return (await res.json()) as TopologyEntry[];
  }

  async getTopologyYaml(token: string, labName: string): Promise<string> {
    try {
      const res = await this.get(`/api/v1/topologies/${enc(labName)}/yaml`, token);
      return await res.text();
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      const res = await this.get(`/api/v1/labs/${enc(labName)}/topology/yaml`, token);
      return await res.text();
    }
  }

  async putTopologyYaml(token: string, labName: string, content: string): Promise<void> {
    try {
      await this.request("PUT", `/api/v1/topologies/${enc(labName)}/yaml`, token, content, "text/plain");
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      await this.request("PUT", `/api/v1/labs/${enc(labName)}/topology/yaml`, token, content, "text/plain");
    }
  }

  async getAnnotations(token: string, labName: string): Promise<string> {
    try {
      const res = await this.get(`/api/v1/topologies/${enc(labName)}/annotations`, token);
      return await res.text();
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      const res = await this.get(`/api/v1/labs/${enc(labName)}/topology/annotations`, token);
      return await res.text();
    }
  }

  async putAnnotations(token: string, labName: string, content: string): Promise<void> {
    try {
      await this.request("PUT", `/api/v1/topologies/${enc(labName)}/annotations`, token, content, "text/plain");
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      await this.request("PUT", `/api/v1/labs/${enc(labName)}/topology/annotations`, token, content, "text/plain");
    }
  }

  async getFile(token: string, labName: string, filePath: string): Promise<string> {
    const res = await this.get(
      `/api/v1/topologies/${enc(labName)}/file?path=${encodeURIComponent(filePath)}`,
      token
    );
    return await res.text();
  }

  async putFile(token: string, labName: string, filePath: string, content: string): Promise<void> {
    await this.request(
      "PUT",
      `/api/v1/topologies/${enc(labName)}/file?path=${encodeURIComponent(filePath)}`,
      token,
      content,
      "text/plain"
    );
  }

  async headFile(token: string, labName: string, filePath: string): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/topologies/${enc(labName)}/file?path=${encodeURIComponent(filePath)}`,
      {
        method: "HEAD",
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    return res.ok;
  }

  async deleteFile(token: string, labName: string, filePath: string): Promise<void> {
    await this.request(
      "DELETE",
      `/api/v1/topologies/${enc(labName)}/file?path=${encodeURIComponent(filePath)}`,
      token
    );
  }

  async renameFile(
    token: string,
    labName: string,
    oldPath: string,
    newPath: string
  ): Promise<void> {
    await this.request(
      "POST",
      `/api/v1/topologies/${enc(labName)}/file/rename`,
      token,
      JSON.stringify({ oldPath, newPath }),
      "application/json"
    );
  }

  async deployLab(token: string, labName: string): Promise<unknown> {
    const res = await this.request(
      "POST",
      `/api/v1/topologies/${enc(labName)}/deploy`,
      token,
      JSON.stringify({}),
      "application/json"
    );
    return await res.json();
  }

  async destroyLab(token: string, labName: string): Promise<void> {
    await this.request("DELETE", `/api/v1/labs/${enc(labName)}`, token);
  }

  async redeployLab(token: string, labName: string): Promise<unknown> {
    const res = await this.request(
      "PUT",
      `/api/v1/labs/${enc(labName)}`,
      token,
      JSON.stringify({}),
      "application/json"
    );
    return await res.json();
  }

  async listLabs(token: string): Promise<Record<string, ClabContainerInfo[]>> {
    const res = await this.get(`/api/v1/labs`, token);
    return (await res.json()) as Record<string, ClabContainerInfo[]>;
  }

  async inspectLab(token: string, labName: string): Promise<unknown> {
    const res = await this.get(`/api/v1/labs/${enc(labName)}`, token);
    return await res.json();
  }

  /**
   * Opens an NDJSON event stream. Returns the raw Response for streaming.
   */
  async openEventStream(
    token: string,
    options: { initialState?: boolean; interfaceStats?: boolean; interfaceStatsInterval?: string } = {}
  ): Promise<Response> {
    const params = new URLSearchParams();
    if (options.initialState !== undefined) {
      params.set("initialState", String(options.initialState));
    }
    if (options.interfaceStats !== undefined) {
      params.set("interfaceStats", String(options.interfaceStats));
    }
    if (options.interfaceStatsInterval) {
      params.set("interfaceStatsInterval", options.interfaceStatsInterval);
    }
    const qs = params.toString();
    const url = `${this.baseUrl}/api/v1/events${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Failed to open event stream: ${res.status} ${res.statusText}`);
    }
    return res;
  }

  private async get(path: string, token: string): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      const err: HttpError = new Error(`GET ${path} failed (${res.status}): ${text}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  private async request(
    method: string,
    path: string,
    token: string,
    body?: string,
    contentType?: string
  ): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    const res = await fetch(`${this.baseUrl}${path}`, { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      const err: HttpError = new Error(`${method} ${path} failed (${res.status}): ${text}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

export function isNotFoundError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("(404)");
}
