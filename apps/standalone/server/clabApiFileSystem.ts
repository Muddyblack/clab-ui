/**
 * FileSystemAdapter backed by clab-api-server REST endpoints.
 * This allows TopologyHostCore to read/write topology files through the API.
 */

import type { ClabApiClient } from "./clabApiClient.js";
import { isNotFoundError } from "./clabApiClient.js";

export interface ClabApiFileSystemOptions {
  client: ClabApiClient;
  token: string;
  labName: string;
}

const ANNOTATIONS_SUFFIX = ".annotations.json";

function toPosixPath(pathValue: string): string {
  return pathValue.replace(/\\/g, "/");
}

function normalizePath(pathValue: string): string {
  return toPosixPath(pathValue).replace(/\/+/g, "/").replace(/^\.\//, "");
}

function isAnnotationsPath(filePath: string): boolean {
  return normalizePath(filePath).endsWith(ANNOTATIONS_SUFFIX);
}

/**
 * FileSystemAdapter that delegates to clab-api-server topology file endpoints.
 *
 * Maps file operations as follows:
 * - YAML files: GET/PUT /api/v1/topologies/{labName}/yaml
 * - Annotation files: GET/PUT /api/v1/topologies/{labName}/annotations
 * - Other files: GET/PUT/DELETE/HEAD /api/v1/topologies/{labName}/file?path=
 */
export class ClabApiFileSystemAdapter {
  private readonly client: ClabApiClient;
  private readonly token: string;
  private readonly labName: string;

  constructor(options: ClabApiFileSystemOptions) {
    this.client = options.client;
    this.token = options.token;
    this.labName = options.labName;
  }

  async readFile(filePath: string): Promise<string> {
    const normalized = normalizePath(filePath);

    if (isAnnotationsPath(normalized)) {
      try {
        return await this.client.getAnnotations(this.token, this.labName);
      } catch (error) {
        if (isNotFoundError(error)) {
          const err = new Error(`ENOENT: no such file ${normalized}`) as Error & { code?: string };
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    }

    if (normalized.endsWith(".clab.yml") || normalized.endsWith(".clab.yaml")) {
      try {
        return await this.client.getTopologyYaml(this.token, this.labName);
      } catch (error) {
        if (isNotFoundError(error)) {
          const err = new Error(`ENOENT: no such file ${normalized}`) as Error & { code?: string };
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    }

    try {
      return await this.client.getFile(this.token, this.labName, normalized);
    } catch (error) {
      if (isNotFoundError(error)) {
        const err = new Error(`ENOENT: no such file ${normalized}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }
      throw error;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const normalized = normalizePath(filePath);

    if (isAnnotationsPath(normalized)) {
      await this.client.putAnnotations(this.token, this.labName, content);
      return;
    }

    if (normalized.endsWith(".clab.yml") || normalized.endsWith(".clab.yaml")) {
      await this.client.putTopologyYaml(this.token, this.labName, content);
      return;
    }

    await this.client.putFile(this.token, this.labName, normalized, content);
  }

  async unlink(filePath: string): Promise<void> {
    const normalized = normalizePath(filePath);
    try {
      await this.client.deleteFile(this.token, this.labName, normalized);
    } catch (error) {
      // Swallow ENOENT-like errors per FileSystemAdapter contract
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.client.renameFile(this.token, this.labName, normalizePath(oldPath), normalizePath(newPath));
  }

  async exists(filePath: string): Promise<boolean> {
    const normalized = normalizePath(filePath);

    if (isAnnotationsPath(normalized)) {
      try {
        await this.client.getAnnotations(this.token, this.labName);
        return true;
      } catch (error) {
        if (isNotFoundError(error)) return false;
        throw error;
      }
    }

    if (normalized.endsWith(".clab.yml") || normalized.endsWith(".clab.yaml")) {
      try {
        await this.client.getTopologyYaml(this.token, this.labName);
        return true;
      } catch (error) {
        if (isNotFoundError(error)) return false;
        throw error;
      }
    }

    return this.client.headFile(this.token, this.labName, normalized);
  }

  dirname(filePath: string): string {
    const normalized = normalizePath(filePath);
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash <= 0) {
      return ".";
    }
    return normalized.slice(0, lastSlash);
  }

  basename(filePath: string): string {
    const normalized = normalizePath(filePath);
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash < 0) {
      return normalized;
    }
    return normalized.slice(lastSlash + 1);
  }

  join(...segments: string[]): string {
    return normalizePath(segments.filter((s) => s.length > 0).join("/"));
  }
}
