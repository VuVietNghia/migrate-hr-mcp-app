import { describe, expect, it } from 'vitest';

import { buildCandidateMarkdownFileName, cvFileSuffix, formatKanbanItemTitle, stripCvFileSuffix, withCvFileSuffix } from '../src/ui/pipeline-candidate-name';
import { parseCandidateName } from '../src/ui/lifecycle/passed-candidate-parsing';

describe('buildCandidateMarkdownFileName — the saved .md file', () => {
  it('title-cases a name the CV printed in capitals', () => {
    expect(buildCandidateMarkdownFileName('NGUYEN VIET HUNG', '2026-09-12')).toBe('2026-09-12_CV_Nguyen_Viet_Hung.md');
  });

  it('keeps the .md extension: only the card title drops it', () => {
    expect(buildCandidateMarkdownFileName('Nguyen Viet Hung', '2026-09-12')).toMatch(/\.md$/);
  });

  it('strips Vietnamese diacritics before recasing', () => {
    expect(buildCandidateMarkdownFileName('NGUYỄN VIỆT HÙNG', '2026-09-12')).toBe('2026-09-12_CV_Nguyen_Viet_Hung.md');
    expect(buildCandidateMarkdownFileName('ĐẶNG THÙY LINH', '2026-09-12')).toBe('2026-09-12_CV_Dang_Thuy_Linh.md');
  });

  it('capitalises a lower-case name', () => {
    expect(buildCandidateMarkdownFileName('nguyen van a', '2026-09-12')).toBe('2026-09-12_CV_Nguyen_Van_A.md');
  });
});

describe('formatKanbanItemTitle — the Kanban card', () => {
  it('shows the name in title case and without .md', () => {
    expect(formatKanbanItemTitle('2026-09-12_CV_NGUYEN_VIET_HUNG.md')).toBe('2026-09-12_CV_Nguyen_Viet_Hung');
  });

  it('recases names that came from the AI reply rather than the builder', () => {
    expect(formatKanbanItemTitle('2026-07-03_CV_NGUYEN_VAN_A_LAP_TRINH_VIEN_1.md')).toBe(
      '2026-07-03_CV_Nguyen_Van_A_Lap_Trinh_Vien_1',
    );
  });

  it('leaves camelCase alone: its capitals are the word boundaries', () => {
    // Lowering "NguyenVanA" to "Nguyenvana" would make it read as one word.
    expect(formatKanbanItemTitle('2026-07-01_CV_NguyenVanA.md')).toBe('2026-07-01_CV_NguyenVanA');
  });

  it('drops the folder and any CV extension', () => {
    expect(formatKanbanItemTitle('room/hr-miniapp/outputs-cv/2026-09-12_CV_HOANG_MINH.pdf')).toBe(
      '2026-09-12_CV_Hoang_Minh',
    );
  });

  it('does not recase a title that has no _CV_ marker', () => {
    expect(formatKanbanItemTitle('ho_so_DAC_BIET.docx')).toBe('ho_so_DAC_BIET');
  });

  it('never returns an empty title', () => {
    expect(formatKanbanItemTitle('')).toBe('CV_Unknown');
    expect(formatKanbanItemTitle('.md')).toBe('CV_Unknown');
  });
});

describe('readers of the card title still get the candidate name', () => {
  it('Hồ sơ NS reads the same person from the new title as from the old one', () => {
    const oldTitle = '2026-09-12_CV_NGUYEN_VIET_HUNG.md';
    const newTitle = formatKanbanItemTitle(oldTitle);

    expect(parseCandidateName(newTitle)).toBe('Nguyen Viet Hung');
    expect(parseCandidateName(oldTitle).toLowerCase()).toBe(parseCandidateName(newTitle).toLowerCase());
  });
});

describe('hau to tu id CV goc', () => {
  it('lay 6 ky tu hex cuoi, viet thuong', () => {
    expect(cvFileSuffix('66F1A2B3C4D5E6F7A8B9C0D1')).toBe('-b9c0d1');
  });

  it('khong co hau to khi id khong du 6 ky tu hex', () => {
    expect(cvFileSuffix('abc')).toBe('');
    expect(cvFileSuffix('')).toBe('');
  });

  it('chen hau to truoc .md', () => {
    expect(withCvFileSuffix('2026-09-23_CV_Nguyen_Van_A.md', '66f1a2b3c4d5e6f7a83f9c1a')).toBe(
      '2026-09-23_CV_Nguyen_Van_A-3f9c1a.md',
    );
  });

  it('cung CV cho cung ten, hai CV khac nhau cho ten khac nhau', () => {
    const name = '2026-09-23_CV_Nguyen_Van_A.md';
    const a1 = withCvFileSuffix(name, '66f1a2b3c4d5e6f7a8000001');
    const a2 = withCvFileSuffix(name, '66f1a2b3c4d5e6f7a8000001');
    const b = withCvFileSuffix(name, '66f1a2b3c4d5e6f7a8000002');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it('goi lai tren ten da co hau to thi giu nguyen', () => {
    const once = withCvFileSuffix('2026-09-23_CV_Nguyen_Van_A.md', '66f1a2b3c4d5e6f7a83f9c1a');
    expect(withCvFileSuffix(once, '66f1a2b3c4d5e6f7a83f9c1a')).toBe(once);
  });

  it('bo hau to khoi ten khong co phan mo rong', () => {
    expect(stripCvFileSuffix('2026-09-23_CV_Nguyen_Van_A-3f9c1a')).toBe('2026-09-23_CV_Nguyen_Van_A');
    expect(stripCvFileSuffix('2026-09-23_CV_Nguyen_Van_A')).toBe('2026-09-23_CV_Nguyen_Van_A');
  });

  it('tieu de the Kanban giu nguyen hau to de tim lai dung file MD', () => {
    expect(formatKanbanItemTitle('2026-09-23_CV_Nguyen_Van_A-3f9c1a.md')).toBe('2026-09-23_CV_Nguyen_Van_A-3f9c1a');
  });
});
