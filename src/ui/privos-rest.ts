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