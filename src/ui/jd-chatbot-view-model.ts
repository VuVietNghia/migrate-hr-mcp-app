export type JDDocumentMode = 'preview' | 'changes' | 'manual';

const JD_CREATED_MESSAGE = 'Đã tạo JD mới. Nội dung được hiển thị ở bên phải.';
const JD_UPDATED_MESSAGE = 'Đã cập nhật JD. Bạn có thể xem thay đổi ở bên phải.';
const LEGACY_JD_COMPLETION_MESSAGE = 'Nội dung JD mới được hiển thị ở bên phải màn hình, bạn có muốn chỉnh sửa thêm không? Hãy nói cho tôi biết nhé.';
const EMPTY_JD_CONTENT = /^(?:null|không xác định|n\/a)$/iu;

export interface InterpretedJDAIResponse {
  chatText: string;
  documentContent: string | null;
  nextMode: Extract<JDDocumentMode, 'preview' | 'changes'> | null;
}

export function interpretJDAIResponse(text: string, hasSelectedJD: boolean): InterpretedJDAIResponse {
  const taggedContent = text.match(/<jd_content>\s*([\s\S]*?)\s*<\/jd_content>/iu)?.[1]?.trim() || '';
  const documentContent = taggedContent && !EMPTY_JD_CONTENT.test(taggedContent) ? taggedContent : null;
  const positionName = text.match(/<position_name>\s*([\s\S]*?)\s*<\/position_name>/iu)?.[1]?.trim();
  const cleanText = text
    .replace(/<jd_content>[\s\S]*?<\/jd_content>/giu, '')
    .replace(/<saved_file>[\s\S]*?<\/saved_file>/giu, '')
    .replace(/<position_name>[\s\S]*?<\/position_name>/giu, '')
    .replace(LEGACY_JD_COMPLETION_MESSAGE, '')
    .trim();
  const completionMessage = hasSelectedJD
    ? JD_UPDATED_MESSAGE
    : positionName
      ? `Đã tạo JD cho vị trí ${positionName}. Nội dung được hiển thị ở bên phải.`
      : JD_CREATED_MESSAGE;

  return {
    chatText: documentContent ? completionMessage : cleanText,
    documentContent,
    nextMode: documentContent ? (hasSelectedJD ? 'changes' : 'preview') : null,
  };
}

export const JD_DOCUMENT_MODES = [
  { id: 'preview', label: 'Xem trước' },
  { id: 'changes', label: 'Xem thay đổi' },
  { id: 'manual', label: 'Chỉnh sửa thủ công' },
] as const satisfies ReadonlyArray<{ id: JDDocumentMode; label: string }>;

export interface JDChangeRow {
  index: number;
  text: string;
  changed: boolean;
}

export function getChangedJDLineIndexes(saved: string, draft: string): Set<number> {
  const before = saved.split('\n');
  const after = draft.split('\n');
  const rows = before.length + 1;
  const columns = after.length + 1;
  const lcs = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex]
        ? lcs[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(lcs[beforeIndex + 1][afterIndex], lcs[beforeIndex][afterIndex + 1]);
    }
  }

  const unchanged = new Set<number>();
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length && afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      unchanged.add(afterIndex);
      beforeIndex += 1;
      afterIndex += 1;
    } else if (lcs[beforeIndex + 1][afterIndex] >= lcs[beforeIndex][afterIndex + 1]) {
      beforeIndex += 1;
    } else {
      afterIndex += 1;
    }
  }

  return new Set(after.map((_, index) => index).filter((index) => !unchanged.has(index)));
}

export function buildJDChangeRows(saved: string, draft: string): JDChangeRow[] {
  const changedLines = getChangedJDLineIndexes(saved, draft);
  return draft.split('\n').map((line, index) => ({
    index,
    text: line,
    changed: changedLines.has(index),
  }));
}
