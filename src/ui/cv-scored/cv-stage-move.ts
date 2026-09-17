import { parseToolResult } from '@privos_ai/app-react';

export interface CVStageMoveApp {
  callServerTool(call: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
}

// callServerTool chi reject khi loi duong truyen; Hub tu choi thi van resolve voi
// isError: true. parseToolResult bien truong hop do thanh loi nem ra.
export async function moveCVToStage(
  app: CVStageMoveApp,
  itemId: string,
  stageId: string,
): Promise<void> {
  parseToolResult(
    await app.callServerTool({
      name: 'mcpapp.lists.moveItemToStage',
      arguments: { itemId, stageId },
    }),
  );
}
