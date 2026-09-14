/**
 * Reads the text the Hub's document parser (ocr-worker) extracted from an uploaded CV.
 *
 * Scoring used to hand the Sandbox the raw file (`@Files:<room>/<cv.pdf>`) and rely on the
 * model reading the PDF itself. The Sandbox model no longer does, and has no PDF text tools,
 * so the pipeline now reads the parsed artefact and passes the text inline. The parser writes
 * `{roomId}/.markdown/{relative path}.md`, dropping the source extension and replacing spaces
 * with `_` (`NGUYỄN VIỆT_HƯNG_Resume.pdf` → `.markdown/NGUYỄN_VIỆT_HƯNG_Resume.md`).
 */
import type { McpApp } from '@privos_ai/app-react';
import { getFileTextById, restCall } from './privos-rest';

const MARKDOWN_FOLDER = '.markdown';
const PAGE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 15000;
/** A parse shorter than this is a title at best, not a CV worth scoring. */
const MIN_CV_TEXT_LENGTH = 30;

export class ParsedCvUnavailableError extends Error {
  constructor(message: string, readonly parseStatus?: string | null) {
    super(`CV_NOT_PARSED: ${message}`);
    this.name = 'ParsedCvUnavailableError';
  }
}

interface RoomFile {
  _id?: string;
  name?: string;
  father?: string | null;
}

const normalizeName = (name: string) => name.normalize('NFC').replace(/\s+/g, '_').toLowerCase();

/** CV text is untrusted data: it must not be able to close or reopen the `<cv_content>` block around it. */
export function stripCvContentTags(text: string): string {
  return text.replace(/<\/?\s*cv_content\s*>/gi, '');
}

/** The file name the parser gives the extracted text of `fileName`. */
export function parsedMarkdownName(fileName: string): string {
  const base = fileName.split('/').pop() || fileName;
  const stem = base.replace(/\.[^.]+$/, '');
  return `${stem.normalize('NFC').replace(/\s+/g, '_')}.md`;
}

export function findParsedMarkdownFile<T extends RoomFile>(files: T[], cvName: string): T | undefined {
  const target = normalizeName(parsedMarkdownName(cvName));
  return files.find(file => typeof file.name === 'string' && normalizeName(file.name) === target);
}

function describeParseStatus(status: string, cvName: string): string {
  if (/^(pending|queued|processing|running)$/i.test(status)) {
    return `CV "${cvName}" đang chờ hệ thống bóc tách nội dung (parse_status: ${status}). Vui lòng chấm lại sau khi parse hoàn tất.`;
  }
  return `Hệ thống không bóc tách được nội dung CV "${cvName}" (parse_status: ${status}). Cần parse lại file trước khi chấm.`;
}

async function findMarkdownFolderId(app: McpApp, roomId: string): Promise<string | undefined> {
  const root = await restCall<any>(app, 'GET', `file-management.channels/${roomId}/root`, { timeoutMs: REQUEST_TIMEOUT_MS });
  const folders: RoomFile[] = Array.isArray(root?.folders) ? root.folders : [];
  return folders.find(folder => folder.name === MARKDOWN_FOLDER && !folder.father)?._id;
}

async function findParsedFileId(app: McpApp, roomId: string, folderId: string, cvName: string): Promise<string | undefined> {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await restCall<any>(app, 'GET', `file-management.files.channel/${roomId}`, {
      query: { folderId, count: PAGE_SIZE, offset },
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    const files: RoomFile[] = Array.isArray(page?.files) ? page.files : [];
    const match = findParsedMarkdownFile(files, cvName);
    if (match?._id) return match._id;
    const total = typeof page?.total === 'number' ? page.total : 0;
    if (files.length < PAGE_SIZE || offset + files.length >= total) return undefined;
  }
}

/**
 * Text of `cv` as extracted by the Hub parser. Throws `ParsedCvUnavailableError` when the parse
 * is not finished, failed, or produced nothing usable, so scoring stops before calling the AI.
 */
export async function readParsedCvText(app: McpApp, roomId: string, cv: { _id: string; name: string }): Promise<string> {
  const info = await restCall<any>(app, 'GET', `file-management.files/${cv._id}`, { timeoutMs: REQUEST_TIMEOUT_MS });
  const status: string | null | undefined = info?.parse_status ?? info?.file?.parse_status;
  // A stale `.markdown` from an earlier version of the same file must not be scored while a re-parse is running.
  if (status && status !== 'complete') {
    throw new ParsedCvUnavailableError(describeParseStatus(status, cv.name), status);
  }

  const expected = `${MARKDOWN_FOLDER}/${parsedMarkdownName(cv.name)}`;
  const folderId = await findMarkdownFolderId(app, roomId);
  const fileId = folderId ? await findParsedFileId(app, roomId, folderId, cv.name) : undefined;
  if (!fileId) {
    throw new ParsedCvUnavailableError(
      `Không tìm thấy bản bóc tách ${expected} của CV "${cv.name}". Hãy bật Auto Parse cho room và parse file trước khi chấm.`,
      status,
    );
  }

  const text = (await getFileTextById(app, fileId)).trim();
  if (text.length < MIN_CV_TEXT_LENGTH) {
    throw new ParsedCvUnavailableError(
      `Bản bóc tách ${expected} gần như trống (${text.length} ký tự); file CV có thể là ảnh mờ hoặc không có chữ.`,
      status,
    );
  }
  return text;
}
