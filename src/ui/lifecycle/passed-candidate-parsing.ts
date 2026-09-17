const POSITION_RULES: ReadonlyArray<{ value: string; keys: ReadonlyArray<string> }> = [
  { value: 'Developer', keys: ['dev', 'developer', 'programmer', 'lap trinh'] },
  { value: 'Tester', keys: ['test', 'tester', 'qa', 'qc', 'kiem thu'] },
  { value: 'Designer', keys: ['design', 'designer', 'ui', 'ux'] },
  { value: 'Product Manager', keys: ['product', 'pm'] },
  { value: 'HR', keys: ['hr', 'nhan su', 'recruiter'] },
  { value: 'Sales', keys: ['sale', 'sales', 'kinh doanh'] },
  { value: 'Marketing', keys: ['marketing'] },
];

const UNNAMED_CANDIDATE = 'Không có tên';

function toSearchText(raw: string): string {
  const tokens = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return ` ${tokens.join(' ')} `;
}

/** Khớp theo nguyên từ, để "pm" không ăn vào "Pham" và "ui" không ăn vào "Bui". */
export function normalizePosition(rawPosition: string): string {
  const text = toSearchText(rawPosition);
  const rule = POSITION_RULES.find(r => r.keys.some(key => text.includes(` ${key} `)));
  return rule ? rule.value : rawPosition.trim();
}

/**
 * Item trong list chấm CV không có trường vị trí; vị trí chỉ nằm ở tên list,
 * do pipeline đặt là `SCREENING_<VI_TRI>` theo tên file JD.
 */
export function positionFromScreeningListName(listName: string): string | undefined {
  const raw = listName.replace(/^.*?SCREENING_?/i, '').replace(/_+/g, ' ').trim();
  if (!raw || raw.toUpperCase() === 'UNKNOWN') return undefined;
  return normalizePosition(raw);
}

/** Tiêu đề thẻ có dạng `2026-09-11_CV_Vu_Viet_Nghia.md`; họ tên là toàn bộ phần sau `CV_`. */
export function parseCandidateName(rawTitle: string): string {
  const name = rawTitle
    .replace(/\.(md|pdf|docx|doc)$/i, '')
    .replace(/^\d{4}[-_]\d{2}[-_]\d{2}[-_]?/, '')
    .replace(/^CV[-_]?/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || UNNAMED_CANDIDATE;
}
