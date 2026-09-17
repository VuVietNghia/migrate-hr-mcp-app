import type { McpApp } from '@privos_ai/app-react';
import { OptionalFeatureUnavailableError, readRoomFileText, restCall } from '../../privos-rest';

/** Đủ thông tin để đọc file và để ghi đè đúng chỗ. */
export interface EmployeeMdFileRef {
  fileId?: string;
  downloadUrl?: string;
  folderId?: string;
  fileName?: string;
}

/**
 * Phần của một hồ sơ mang tham chiếu tới file. `attachedFileObj` là File Object thô
 * do Hub trả về nên không có schema tĩnh — đây là lý do duy nhất dùng `any` ở đây.
 */
export interface EmployeeMdFileSource {
  attachedFileObj?: any;
  attachedFileId?: string;
  attachedFileUrl?: string;
}

export type EmployeeMdWriteRoute = 'update-content' | 'upload-replace';

const MD_DATA_URI_PREFIX = 'data:text/markdown;base64,';

/**
 * Mã lỗi của file-management (`file-management-api.md:1033-1050`) là chuỗi máy đọc.
 * Hiện nguyên xi lên banner thì người dùng không biết phải làm gì tiếp.
 */
const HUB_ERROR_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ['error-quota-exceeded', 'Kho lưu trữ của Room đã đầy, cần dọn bớt file rồi lưu lại.'],
  ['error-rate-limited', 'Hub đang chặn vì có quá nhiều yêu cầu, chờ một lát rồi lưu lại.'],
  ['error-file-not-found', 'File hồ sơ không còn tồn tại trong Room.'],
  ['error-folder-not-found', 'Thư mục chứa file hồ sơ không còn tồn tại trong Room.'],
  ['error-forbidden', 'Room từ chối quyền truy cập file này cho tài khoản đang đăng nhập.'],
];

/**
 * `restCall` biến MỌI 403 thành `OptionalFeatureUnavailableError` với câu "quyền tuỳ
 * chọn chưa được cấp". Nhưng `files:read` và `files:write` trong `privos-app.json`
 * đều khai `requirement: "required"`, nên 403 ở đây là Room từ chối theo ACL chứ
 * không phải thiếu scope — hiện đúng câu kia sẽ chỉ sai hướng người dùng. Không sửa
 * được ở gốc vì `privos-rest.ts` là file cấm đụng, nên viết lại câu tại đây.
 */
export function describeFileError(error: unknown): string {
  if (error instanceof OptionalFeatureUnavailableError) {
    return 'Room từ chối quyền truy cập file này cho tài khoản đang đăng nhập.';
  }
  const raw = error instanceof Error ? error.message : String(error || 'lỗi không rõ');
  for (const [code, message] of HUB_ERROR_MESSAGES) {
    if (raw.includes(code)) return message;
  }
  return raw;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function resolveEmployeeMdFileRef(source: EmployeeMdFileSource): EmployeeMdFileRef | null {
  const obj = source.attachedFileObj;
  const ref: EmployeeMdFileRef = {};

  if (typeof obj === 'string' && obj.length > 0) {
    if (obj.startsWith('http') || obj.startsWith('/')) ref.downloadUrl = obj;
    else ref.fileId = obj;
  } else if (obj && typeof obj === 'object') {
    ref.fileId = readString(obj._id) ?? readString(obj.id);
    ref.downloadUrl = readString(obj.downloadUrl) ?? readString(obj.url);
    // File Object của Hub dùng snake_case (`file-management-api.md:37`); bản do
    // `app.uploadFile` trả về có thể đã bọc lại thành camelCase, nên đọc cả hai.
    ref.folderId = readString(obj.folder_id) ?? readString(obj.folderId);
    ref.fileName = readString(obj.name) ?? readString(obj.fileName);
  }

  if (!ref.fileId) ref.fileId = readString(source.attachedFileId);
  if (!ref.downloadUrl) {
    // Luồng cũ có lúc ghi đúng chuỗi "null" vào description, nên phải loại riêng.
    const url = readString(source.attachedFileUrl);
    if (url && url !== 'null') ref.downloadUrl = url;
  }

  if (!ref.fileId && !ref.downloadUrl) return null;
  return ref;
}

/**
 * Ghi lại được khi có id file (đường chính) hoặc đủ thư mục lẫn tên file (đường dự phòng).
 * Một liên kết chỉ có đường dẫn tải về thì đọc được nhưng không ghi lại được, nên không được
 * mở form cho người dùng gõ rồi mới báo lỗi lúc lưu.
 */
export function canWriteEmployeeMd(ref: EmployeeMdFileRef | null): boolean {
  if (!ref) return false;
  return Boolean(ref.fileId) || (Boolean(ref.folderId) && Boolean(ref.fileName));
}

export async function readEmployeeMdText(app: McpApp, ref: EmployeeMdFileRef): Promise<string> {
  if (!ref.fileId && !ref.downloadUrl) {
    throw new Error('Hồ sơ này chưa có file Markdown đính kèm để đọc.');
  }

  try {
    return await readRoomFileText(app, { _id: ref.fileId, downloadUrl: ref.downloadUrl });
  } catch (error) {
    const detail = describeFileError(error);
    // Hub có trả kèm `hint: "id matches a folder, not a file"` để tách trường hợp id
    // trỏ nhầm vào thư mục ra khỏi trường hợp file đã bị xoá
    // (`stable-file-id-and-replace-semantics.md:90-102`), nhưng `restCall` chỉ lấy
    // `body.error` và bỏ `hint`, mà `privos-rest.ts` là file cấm đụng. Nên gộp hai
    // nguyên nhân vào một câu thay vì đoán bừa một trong hai.
    if (/not found/i.test(detail) || detail.includes('không còn tồn tại')) {
      throw new Error(
        `Không đọc được file hồ sơ: ${detail}. `
        + 'Id lưu trong thẻ có thể đang trỏ vào thư mục thay vì file, hoặc file đã bị xoá khỏi Room.',
      );
    }
    throw new Error(`Không đọc được file hồ sơ: ${detail}`);
  }
}

/**
 * Ghi đè nội dung file hồ sơ.
 *
 * Đường chính là `POST file-management.files/:fileId/update-content`
 * (`file-management-api.md:370-394`) — nhận fileId nên không phải giải quyết thư mục,
 * không phải encode base64, và không đụng tới xử lý trùng tên.
 *
 * Đường dự phòng là `app.uploadFile` + `duplicateAction: 'replace'`, cần vì chưa xác
 * nhận được path dạng gạch chéo có nằm trong allowlist REST của scope `files:write`
 * hay không. `replace` là upsert tại chỗ và giữ nguyên `_id`
 * (`stable-file-id-and-replace-semantics.md:18-38`) nên link cũ không gãy.
 *
 * Khi có fileId, chỉ rơi xuống đường dự phòng nếu đường chính trả 403
 * (`OptionalFeatureUnavailableError`: route chưa nằm trong allowlist hoặc ACL từ chối). Lỗi
 * khác như 404/500 thì ném luôn: upload `replace` là upsert, nên nếu file đã bị xoá trong lúc
 * form đang mở, đường dự phòng sẽ âm thầm tạo ra một file mới thay vì báo lỗi.
 */
export async function writeEmployeeMdText(
  app: McpApp,
  roomId: string,
  ref: EmployeeMdFileRef,
  content: string,
): Promise<EmployeeMdWriteRoute> {
  let primaryError: unknown;

  if (ref.fileId) {
    try {
      await restCall(app, 'POST', `file-management.files/${ref.fileId}/update-content`, {
        body: { content },
        timeoutMs: 15000,
      });
      return 'update-content';
    } catch (error) {
      if (!(error instanceof OptionalFeatureUnavailableError)) {
        throw new Error(`Không ghi được file hồ sơ: ${describeFileError(error)}`);
      }
      primaryError = error;
      console.warn('[employee-md-file] update-content bi 403, chuyen sang uploadFile replace:', error);
    }
  }

  // Thiếu thư mục hoặc tên file thì upload sẽ rơi vào thư mục gốc và tạo file THỨ HAI
  // thay vì ghi đè, để lại một file mồ côi mà item không trỏ tới. Dừng còn hơn.
  if (!ref.folderId) {
    const reason = primaryError ? describeFileError(primaryError) : 'thẻ không mang id file';
    throw new Error(
      `Không ghi được file hồ sơ: ${reason}. `
      + 'Đường dự phòng cần biết thư mục gốc của file, không có thì dừng để khỏi tạo file lạc chỗ.',
    );
  }
  if (!ref.fileName) {
    const reason = primaryError ? describeFileError(primaryError) : 'thẻ không mang id file';
    throw new Error(
      `Không ghi được file hồ sơ: ${reason}. `
      + 'Đường dự phòng cần biết tên file gốc, không có thì dừng để khỏi tạo file lạc chỗ.',
    );
  }

  try {
    await app.uploadFile({
      channelId: roomId,
      fileName: ref.fileName,
      folderId: ref.folderId,
      base64Data: MD_DATA_URI_PREFIX + btoa(unescape(encodeURIComponent(content))),
      mimeType: 'text/markdown',
      duplicateAction: 'replace',
    });
  } catch (error) {
    throw new Error(`Không ghi được file hồ sơ: ${describeFileError(error)}`);
  }

  return 'upload-replace';
}
