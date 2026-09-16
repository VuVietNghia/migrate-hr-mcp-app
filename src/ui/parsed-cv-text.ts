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

/** Which document the parser was asked for; only affects the wording a caller shows. */
export type ParsedDocumentKind = 'CV' | 'JD';

export class ParsedCvUnavailableError extends Error {
  constructor(message: string, readonly parseStatus?: string | null, kind: ParsedDocumentKind = 'CV') {
    super(`${kind}_NOT_PARSED: ${message}`);
    this.name = 'ParsedCvUnavailableError';
  }
}

interface RoomFile {
  _id?: string;
  name?: string;
  father?: string | null;
}

const normalizeName = (name: string) => name.normalize('NFC').replace(/\s+/g, '_').toLowerCase();

/**
 * The parser hands back a text-layer PDF as `<section data-source-page="N"><pre>…</pre></section>`
 * with every space and newline written as a numeric character reference. Passed on untouched that
 * reaches the model as `&#x20;` noise and burns tokens, so the wrapper is dropped and the entities
 * decoded here. Callers still run `stripCvContentTags` afterwards, so decoding cannot smuggle a
 * `<cv_content>` tag into the prompt. Plain OCR output has neither marker and passes through.
 */
export function decodeParserMarkup(raw: string): string {
  if (!/<pre>|<section\b/i.test(raw)) return raw;
  return raw
    .replace(/<section\b[^>]*>/gi, '\n')
    .replace(/<\/section>/gi, '\n')
    .replace(/<\/?pre>/gi, '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // `&amp;` last, so an escaped `&amp;lt;` does not decode all the way to `<`.
    .replace(/&amp;/g, '&')
    .trim();
}

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

function describeParseStatus(status: string, fileName: string, kind: ParsedDocumentKind): string {
  if (/^(pending|queued|processing|running)$/i.test(status)) {
    return `${kind} "${fileName}" đang chờ hệ thống bóc tách nội dung (parse_status: ${status}). Vui lòng thử lại sau khi parse hoàn tất.`;
  }
  return `Hệ thống không bóc tách được nội dung ${kind} "${fileName}" (parse_status: ${status}). Cần parse lại file trước khi dùng.`;
}

const MARKDOWN_VIEW_ID_PREFIX = 'smv1_d_';

/**
 * `.markdown` is not a real folder: the Hub serves it as a synthetic view whose id is
 * `smv1_d_` + base64url of `{"c":<roomId>,"p":<source path prefix>}`, and the view mirrors the
 * source tree — a room-root file has its artefact under `p:""`, a file in `hr-miniapp/jds` under
 * `p:"hr-miniapp/jds"`. No API maps a file to its artefact and `mcpapp.folders.getByChannel` does
 * not walk this synthetic tree, so the branch id is re-derived from the root one. Verified against
 * roxane-dev on 2026-09-16; if the Hub changes the encoding this yields undefined and the caller
 * simply falls back to the root view.
 */
function nestedMarkdownViewId(rootFolderId: string, segments: string[]): string | undefined {
  if (segments.length === 0 || !rootFolderId.startsWith(MARKDOWN_VIEW_ID_PREFIX)) return undefined;
  try {
    const encoded = rootFolderId.slice(MARKDOWN_VIEW_ID_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(encoded)) as { c?: unknown; p?: unknown };
    if (typeof decoded?.c !== 'string') return undefined;
    const payload = JSON.stringify({ c: decoded.c, p: segments.join('/') });
    const base64url = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return MARKDOWN_VIEW_ID_PREFIX + base64url;
  } catch {
    return undefined;
  }
}

/** The `.markdown` views worth searching, most specific first. */
async function markdownFolderIds(
  app: McpApp,
  roomId: string,
  sourceFolderSegments: string[],
): Promise<string[]> {
  const root = await restCall<any>(app, 'GET', `file-management.channels/${roomId}/root`, { timeoutMs: REQUEST_TIMEOUT_MS });
  const folders: RoomFile[] = Array.isArray(root?.folders) ? root.folders : [];
  const rootId = folders.find(folder => folder.name === MARKDOWN_FOLDER && !folder.father)?._id;
  if (!rootId) return [];
  const nested = nestedMarkdownViewId(rootId, sourceFolderSegments);
  return nested ? [nested, rootId] : [rootId];
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
 * Text of `file` as extracted by the Hub parser. Throws `ParsedCvUnavailableError` when the parse
 * is not finished, failed, or produced nothing usable, so the caller stops before using the text.
 *
 * A JD needs exactly the same treatment as a CV: `file-management.files/{id}/content` wraps the
 * payload in a JSON string, so a PDF or .docx comes back as mangled binary rather than an error —
 * silently scoring against that garbage is worse than refusing.
 */
export async function readParsedDocumentText(
  app: McpApp,
  roomId: string,
  file: { _id: string; name: string },
  kind: ParsedDocumentKind = 'CV',
  sourceFolderSegments: string[] = [],
): Promise<string> {
  const info = await restCall<any>(app, 'GET', `file-management.files/${file._id}`, { timeoutMs: REQUEST_TIMEOUT_MS });
  const status: string | null | undefined = info?.parse_status ?? info?.file?.parse_status;
  // A stale `.markdown` from an earlier version of the same file must not be used while a re-parse is running.
  if (status && status !== 'complete') {
    throw new ParsedCvUnavailableError(describeParseStatus(status, file.name, kind), status, kind);
  }

  const expected = [MARKDOWN_FOLDER, ...sourceFolderSegments, parsedMarkdownName(file.name)].join('/');
  const folderIds = await markdownFolderIds(app, roomId, sourceFolderSegments);
  let fileId: string | undefined;
  for (const folderId of folderIds) {
    fileId = await findParsedFileId(app, roomId, folderId, file.name);
    if (fileId) break;
  }
  if (!fileId) {
    throw new ParsedCvUnavailableError(
      `Không tìm thấy bản bóc tách ${expected} của ${kind} "${file.name}". Hãy bật Auto Parse cho room và parse file trước khi dùng.`,
      status,
      kind,
    );
  }

  const text = decodeParserMarkup((await getFileTextById(app, fileId)).trim());
  if (text.length < MIN_CV_TEXT_LENGTH) {
    throw new ParsedCvUnavailableError(
      `Bản bóc tách ${expected} gần như trống (${text.length} ký tự); file ${kind} có thể là ảnh mờ hoặc không có chữ.`,
      status,
      kind,
    );
  }
  return text;
}

/** Scoring entry point, kept so callers and tests read as CV-specific. */
export async function readParsedCvText(app: McpApp, roomId: string, cv: { _id: string; name: string }): Promise<string> {
  return readParsedDocumentText(app, roomId, cv, 'CV');
}
