import type { McpApp } from '@privos_ai/app-react';
import {
  EmployeeMdFileRef,
  EmployeeMdWriteRoute,
  describeFileError,
  writeEmployeeMdText,
} from './employee-md-file';

export type SaveEmployeeMdResult =
  | { status: 'saved'; route: EmployeeMdWriteRoute }
  | { status: 'saved-item-stale'; route: EmployeeMdWriteRoute; detail: string };

export interface SaveEmployeeMdParams {
  app: McpApp;
  roomId: string;
  ref: EmployeeMdFileRef;
  content: string;
  /** Cập nhật item trong list. Lỗi ở đây không làm hỏng phần đã ghi vào file. */
  syncItem: () => Promise<void>;
}

/**
 * Lưu hồ sơ: ghi file TRƯỚC, đồng bộ item SAU.
 *
 * Thứ tự này là bắt buộc. Hỏng ở bước item thì thứ người dùng vừa gõ đã an toàn trong
 * file, chỉ thẻ Kanban là cũ — gọi lần sau là khớp lại. Ngược thứ tự thì thẻ nói một
 * đằng, file nói một nẻo, và bản ghi thật (file) là bản cũ.
 */
export async function saveEmployeeMd(params: SaveEmployeeMdParams): Promise<SaveEmployeeMdResult> {
  const route = await writeEmployeeMdText(params.app, params.roomId, params.ref, params.content);

  try {
    await params.syncItem();
  } catch (error) {
    return { status: 'saved-item-stale', route, detail: describeFileError(error) };
  }

  return { status: 'saved', route };
}
