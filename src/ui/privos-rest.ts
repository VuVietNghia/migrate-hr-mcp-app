/**
 * Thin wrapper around `app.rest()` — the REST-first way to talk to the hub.
 *
 * `app.rest()` resolves `{ statusCode, body }` where `body` is the hub's
 * API.v1 payload (e.g. `{ success: true, lists: [...] }`). This helper unwraps
 * that, throwing on HTTP errors or `success: false` so callers can `try/catch`
 * the same way they did with the legacy `callServerTool` tools.
 *
 * Every call runs as the logged-in user and is gated server-side by the app's
 * exact installation grant, so no bespoke tools are needed.
 */
import type { McpApp, RestRequestParams } from '@privos_ai/app-react';

export class OptionalFeatureUnavailableError extends Error {
  readonly code = 'OPTIONAL_PERMISSION_NOT_GRANTED';

  constructor(public readonly scope?: string) {
    super('This optional feature is disabled because its permission was not granted. An administrator can enable it in app settings.');
    this.name = 'OptionalFeatureUnavailableError';
  }
}

/**
 * A hub failure that carried a machine-readable code.
 *
 * The message is what a person reads; `code` is what the app branches on. They
 * are kept apart on purpose — matching prose would break the moment the copy
 * changes, and the hub's recoverable failures (a bot key the sandbox no longer
 * holds, an automatic sync already spent) are exactly the ones an app should
 * react to rather than merely display.
 */
export class PrivosRestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PrivosRestError';
  }
}

/**
 * Surface the REAL failure. Only a genuine optional-scope denial (a 403 that `restCall` turns
 * into `OptionalFeatureUnavailableError`) gets the shared "feature disabled" copy; every other
 * failure shows the endpoint's own message. Prefer this over `safeFeatureError` on any owner/admin
 * or business-rule path — `safeFeatureError` rewrites any message merely containing "permission"
 * (e.g. "Only a room owner or admin may set additionalReaders/additionalEditors") into the generic
 * copy, which hides the actual cause and the failing step.
 */
export function describeFeatureError(error: unknown, fallback: string): string {
  if (error instanceof OptionalFeatureUnavailableError) return error.message;
  const message = error instanceof Error ? error.message : String(error || '');
  return message || fallback;
}

export function safeFeatureError(error: unknown, fallback: string): string {
  if (error instanceof OptionalFeatureUnavailableError) return error.message;
  const message = error instanceof Error ? error.message : String(error || '');
  // "unauthorized" is in the list because the Hub words its room-role refusals
  // that way ("error-unauthorized"); without it a permission problem reached the
  // user as a bare generic failure with nothing actionable in it.
  if (/permission|forbidden|unauthori[sz]ed|scope|not.granted|\b403\b/i.test(message)) {
    return new OptionalFeatureUnavailableError().message;
  }
  return fallback;
}

export async function restCall<T = any>(
  app: McpApp,
  method: RestRequestParams['method'],
  path: string,
  opts?: { query?: Record<string, string | number | boolean>; body?: any; timeoutMs?: number },
): Promise<T> {
  const res = await app.rest({ method, path, query: opts?.query, body: opts?.body, timeoutMs: opts?.timeoutMs });
  const body: any = res?.body ?? res;
  // Meteor's API.v1.failure(message) convention: the real reason travels in
  // `body.error`. Surfacing it lets callers distinguish failure modes (e.g. an
  // unprovisioned bot vs. a task already bound to a different executor)
  // instead of a bare status code; safeFeatureError still strips it down to a
  // generic message when it looks permission-related.
  const detail = typeof body?.error === 'string' ? body.error : undefined;
  const code = typeof body?.errorType === 'string' ? body.errorType : undefined;
  if (res?.statusCode && res.statusCode >= 400) {
    if (res.statusCode === 403) throw new OptionalFeatureUnavailableError();
    throw new PrivosRestError(detail || `Request failed (${res.statusCode})`, res.statusCode, code);
  }
  if (body && body.success === false) {
    throw new PrivosRestError(detail || 'Request failed', res?.statusCode, code);
  }
  return body as T;
}

/**
 * File helpers ported from the HR Mini App. `getFileContent` reads a RoomFiles path through the
 * REST file API; `ensureFolderPath` walks/creates a folder chain; `createOrUpdateFile` uploads a
 * UTF-8 markdown file into it. Tool names are the mediated `mcpapp.*` namespace of this scaffold.
 */

/**
 * Read a room file's text by id through the Hub's file-management content route. This is the read
 * path the Hub grants MCP apps: `api/files/content` answers 403 "App is not permitted", and the
 * presigned `downloadUrl` can point at a MinIO host the browser cannot reach. The Hub wraps the
 * payload in a JSON string (`{ result }`), so only text files survive; binary files come back mangled.
 * Throws when the file cannot be read, so callers can show a failure instead of an empty JD.
 */
export async function getFileTextById(app: McpApp, fileId: string, timeoutMs = 15000): Promise<string> {
  const body = await restCall<any>(app, 'GET', `file-management.files/${fileId}/content`, { timeoutMs });
  if (typeof body?.result !== 'string') {
    throw new PrivosRestError('File content response did not include text');
  }
  return body.result;
}

const DOWNLOAD_URL_TIMEOUT_MS = 8000;

/**
 * Read a room text file (e.g. a JD) by id, falling back to its presigned `downloadUrl`. The fallback
 * is bounded because the Hub can hand out a MinIO host the browser cannot reach, and an unbounded
 * fetch then hangs for ~20s before failing. Resolves the text (possibly empty for an empty file);
 * throws the first failure when neither path could read the file.
 */
export async function readRoomFileText(
  app: McpApp,
  file: { _id?: string; downloadUrl?: string },
  downloadTimeoutMs = DOWNLOAD_URL_TIMEOUT_MS,
): Promise<string> {
  let firstError: unknown;
  let readEmptyFile = false;
  if (file._id) {
    try {
      const text = await getFileTextById(app, file._id);
      if (text.trim()) return text;
      readEmptyFile = true;
    } catch (error) {
      firstError = error;
      console.warn('[File read] file-management content route failed:', error);
    }
  }
  if (file.downloadUrl) {
    try {
      const response = await fetch(file.downloadUrl, { signal: AbortSignal.timeout(downloadTimeoutMs) });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      return await response.text();
    } catch (error) {
      firstError = firstError ?? error;
      console.warn('[File read] downloadUrl fetch failed:', error);
    }
  }
  if (readEmptyFile) return '';
  if (firstError) throw firstError;
  throw new PrivosRestError('File has no id or download link');
}

export async function getFileContent(app: McpApp, path: string): Promise<string> {
  try {
    const res = await app.rest({
      method: 'GET',
      path: 'api/files/content',
      query: {
        path: path,
        basePath: '/app/data/projects/workspace/RoomFiles'
      }
    } as any);
    const body: any = res?.body ?? res;
    return body?.content || '';
  } catch (err) {
    console.error('Failed to get file content', err);
    return '';
  }
}

/**
 * The array a `mcpapp.*` list tool returned. Throws when the response cannot be read, so a failed
 * read is never mistaken for an empty folder.
 */
export function readToolList(res: any, key: string): any[] {
  if (res?.isError) {
    throw new Error(res?.content?.[0]?.text || 'Tool call failed');
  }
  const text = res?.content?.[0]?.text;
  const parsed = typeof text === 'string' ? JSON.parse(text) : res;
  const list = Array.isArray(parsed) ? parsed : parsed?.[key];
  if (!Array.isArray(list)) {
    throw new Error(`Tool response did not include a ${key} list`);
  }
  return list;
}

/**
 * Resolve an existing folder chain without creating anything. Returns `undefined` when a segment
 * does not exist; throws when a listing cannot be read.
 */
export async function findFolderPath(app: McpApp, channelId: string, folderNames: string[]): Promise<string | undefined> {
  let parentId: string | undefined;
  for (const folderName of folderNames.filter(Boolean)) {
    const res = await app.callServerTool({
      name: 'mcpapp.folders.getByChannel',
      arguments: { channelId, limit: 100, ...(parentId ? { parentId } : {}) },
    });
    const match = readToolList(res, 'folders').find((folder: any) => folder?.name === folderName);
    if (!match?._id) return undefined;
    parentId = match._id;
  }
  return parentId;
}

export async function ensureFolderPath(app: McpApp, channelId: string, folderNames: string[]): Promise<string | undefined> {
  let currentParentId: string | undefined = undefined;

  for (const folderName of folderNames) {
    if (!folderName) continue;
    
    // 1. Lấy danh sách folder con trong currentParentId
    const args: any = { channelId, limit: 100 };
    if (currentParentId) {
      args.parentId = currentParentId;
    }
    
    const getRes: any = await app.callServerTool({
      name: 'mcpapp.folders.getByChannel',
      arguments: args
    });
    
    let folders: any[] = [];
    try {
      const text = getRes?.content?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        folders = Array.isArray(parsed) ? parsed : (parsed?.folders || []);
      }
    } catch (e) {
      console.error('Failed to parse getByChannel response', e);
    }
    
    const existingFolder = folders.find((f: any) => f.name === folderName);
    
    if (existingFolder && existingFolder._id) {
      currentParentId = existingFolder._id;
    } else {
      // 2. Tạo folder nếu chưa tồn tại
      const createArgs: any = { channelId, name: folderName };
      if (currentParentId) {
        createArgs.parentId = currentParentId;
      }
      const createRes: any = await app.callServerTool({
        name: 'mcpapp.folders.create',
        arguments: createArgs
      });
      
      try {
        const text = createRes?.content?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          currentParentId = parsed?._id;
        }
      } catch (e) {
        console.error('Failed to parse create folder response', e);
      }
      
      if (!currentParentId) {
        throw new Error(`Failed to create folder: ${folderName}`);
      }
    }
  }

  return currentParentId;
}

export async function createOrUpdateFile(app: McpApp, path: string, content: string): Promise<any> {
  try {
    // path is expected to be `${roomId}/path/to/file`
    const parts = path.split('/');
    const roomId = parts[0];
    const fileName = parts[parts.length - 1];
    const folderNames = parts.slice(1, parts.length - 1);
    
    // Tự động tạo cây thư mục
    const targetFolderId = await ensureFolderPath(app, roomId, folderNames);
    
    // Xử lý base64 encode chuẩn cho chuỗi UTF-8 (tiếng Việt)
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    
    const uploadArgs: any = {
      channelId: roomId,
      fileName: fileName,
      base64Data: 'data:text/markdown;base64,' + base64Content,
      mimeType: 'text/markdown',
      duplicateAction: 'replace'
    };
    
    if (targetFolderId) {
      uploadArgs.folderId = targetFolderId;
    }
    
    const res: any = await app.uploadFile(uploadArgs);
    
    if (!res) throw new Error("No response from uploadFile");
    return res;
  } catch (err: any) {
    console.error('Failed to create/update file', err);
    throw new Error(`Failed to create/update file: ${err.message || err}`);
  }
}