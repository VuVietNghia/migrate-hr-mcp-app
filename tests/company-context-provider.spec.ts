import type { McpApp } from '@privos_ai/app-react';
import { describe, expect, it } from 'vitest';
import { CompanyContextProvider } from '../src/ui/drafting/services/CompanyContextProvider';

const ROOM_ID = 'room-1';

interface ToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

/** A Room Files / Folders listing as the Hub actually returns it: JSON inside `content[0].text`. */
function listing(collection: Record<string, unknown[]>): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(collection) }] };
}

/**
 * Wire a fake Hub that resolves `hr-miniapp/company` and then answers the file listing with
 * whatever the test supplies. Folder resolution is deliberately kept working so each test
 * exercises exactly one failure, and a test asserting on the "no documents" path cannot pass
 * for the unrelated reason that the folder was never found.
 */
function providerWithFileListing(filesResponse: unknown): CompanyContextProvider {
  const app = {
    callServerTool: async ({ name, arguments: args }: ToolCall) => {
      if (name === 'mcpapp.folders.getByChannel') {
        return args?.parentId === 'folder-hr-miniapp'
          ? listing({ folders: [{ _id: 'folder-company', name: 'company' }] })
          : listing({ folders: [{ _id: 'folder-hr-miniapp', name: 'hr-miniapp' }] });
      }
      if (name === 'mcpapp.files.getByChannel') return filesResponse;
      throw new Error(`unexpected tool call: ${name}`);
    },
  } as unknown as McpApp;

  return new CompanyContextProvider(app, ROOM_ID);
}

describe('CompanyContextProvider — telling "no company information" apart from a failure', () => {
  it('reports missing company information when the company folder does not exist', async () => {
    const app = {
      callServerTool: async () => listing({ folders: [] }),
    } as unknown as McpApp;

    await expect(new CompanyContextProvider(app, ROOM_ID).getContext()).rejects.toThrow(
      /Chưa có thông tin công ty/,
    );
  });

  it('reports missing company information when the folder exists but holds no documents', async () => {
    await expect(providerWithFileListing(listing({ files: [] })).getContext()).rejects.toThrow(
      /Chưa có thông tin công ty/,
    );
  });

  it('points the user at the Company tab, where the two write paths live', async () => {
    await expect(providerWithFileListing(listing({ files: [] })).getContext()).rejects.toThrow(/Company/);
  });

  // The bug this suite exists for: every unreadable response used to collapse into an empty
  // list, so a permission or transport failure was announced as "there are no documents".
  it('does NOT claim missing company information when Room Files returns an error', async () => {
    const errorResponse = { isError: true, content: [{ type: 'text', text: 'Permission denied' }] };

    await expect(providerWithFileListing(errorResponse).getContext()).rejects.toThrow(
      /Không đọc được danh sách tài liệu công ty/,
    );
    await expect(providerWithFileListing(errorResponse).getContext()).rejects.not.toThrow(
      /Chưa có thông tin công ty/,
    );
  });

  it('does NOT claim missing company information when the listing payload is malformed', async () => {
    await expect(providerWithFileListing({ content: [{ type: 'text', text: 'not json' }] }).getContext())
      .rejects.toThrow(/Không đọc được danh sách tài liệu công ty/);
  });

  it('still returns @Files references for every document in the folder', async () => {
    const files = listing({ files: [{ name: 'b-profile.md' }, { name: 'a-overview.md' }] });

    await expect(providerWithFileListing(files).getContext()).resolves.toBe(
      `@Files:${ROOM_ID}/hr-miniapp/company/a-overview.md\n@Files:${ROOM_ID}/hr-miniapp/company/b-profile.md`,
    );
  });
});
