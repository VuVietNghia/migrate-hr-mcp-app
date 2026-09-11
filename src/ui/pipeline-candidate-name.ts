export function extractCandidateNameFromMarkdown(markdown: string): string | undefined {
  const match = markdown.match(/^#\s*(?:📄\s*)?Thông Tin Ứng Viên\s*:\s*(.+)$/imu);
  const candidateName = match?.[1]?.replace(/\*+/g, '').trim();

  if (!candidateName || /^\[.*\]$/.test(candidateName)) return undefined;
  return candidateName;
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

  return safeName ? `${date}_CV_${safeName}.md` : undefined;
}

export function formatKanbanItemTitle(rawTitle: string): string {
  if (!rawTitle) return 'CV_Unknown.md';

  const fileName = rawTitle.split(/[\\/]/).pop() || rawTitle;
  const nameWithoutExt = fileName.replace(/\.(md|pdf|docx|doc)$/i, '').trim();
  return `${nameWithoutExt}.md`;
}
