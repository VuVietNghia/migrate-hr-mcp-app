export function extractCandidateNameFromMarkdown(markdown: string): string | undefined {
  const match = markdown.match(/^#\s*(?:📄\s*)?Thông Tin Ứng Viên\s*:\s*(.+)$/imu);
  const candidateName = match?.[1]?.replace(/\*+/g, '').trim();

  if (!candidateName || /^\[.*\]$/.test(candidateName)) return undefined;
  return candidateName;
}

/**
 * "NGUYEN" → "Nguyen". Only an ALL-CAPS part is lowered first: in a mixed-case part such as
 * "NguyenVanA" the capitals mark word boundaries — `parseCandidateName` splits on them — so it just
 * gets its first letter raised.
 */
function toNamePartCase(part: string): string {
  const isAllCaps = part === part.toUpperCase() && part !== part.toLowerCase();
  const body = isAllCaps ? part.toLowerCase() : part;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

/** `NGUYEN_VIET_HUNG` → `Nguyen_Viet_Hung`. CVs usually print the name in capitals and the AI copies it. */
function toCandidateNameCase(name: string): string {
  return name.split('_').map(toNamePartCase).join('_');
}

export function buildCandidateMarkdownFileName(candidateName: string | undefined, date: string): string | undefined {
  if (!candidateName) return undefined;

  const safeName = candidateName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  return safeName ? `${date}_CV_${toCandidateNameCase(safeName)}.md` : undefined;
}

/**
 * Card title for a scored CV: its file name without the extension, name in title case —
 * `2026-09-12_CV_NGUYEN_VIET_HUNG.md` → `2026-09-12_CV_Nguyen_Viet_Hung`.
 *
 * Only the card drops `.md`; the saved file keeps it. The name is recased here as well as in
 * `buildCandidateMarkdownFileName` because the pipeline's fallbacks take the name from the AI's
 * reply instead, in whatever case it wrote.
 */
export function formatKanbanItemTitle(rawTitle: string): string {
  const fileName = (rawTitle || '').split(/[\\/]/).pop() || '';
  const nameWithoutExt = fileName.replace(/\.(md|pdf|docx|doc)$/i, '').trim();
  if (!nameWithoutExt) return 'CV_Unknown';

  const marker = nameWithoutExt.indexOf('_CV_');
  if (marker === -1) return nameWithoutExt;
  const nameStart = marker + '_CV_'.length;
  return nameWithoutExt.slice(0, nameStart) + toCandidateNameCase(nameWithoutExt.slice(nameStart));
}
