import { describe, expect, it } from 'vitest';

import {
  JD_DOCUMENT_MODES,
  buildJDChangeRows,
  getChangedJDLineIndexes,
} from '../src/ui/jd-chatbot-view-model';

describe('JD assistant document modes', () => {
  it('orders the three user-facing modes as preview, changes, then manual editing', () => {
    expect(JD_DOCUMENT_MODES).toEqual([
      { id: 'preview', label: 'Xem trước' },
      { id: 'changes', label: 'Xem thay đổi' },
      { id: 'manual', label: 'Chỉnh sửa thủ công' },
    ]);
  });
});

describe('getChangedJDLineIndexes', () => {
  it('returns no changed rows when the saved and draft documents match', () => {
    expect([...getChangedJDLineIndexes('# JD\nNội dung', '# JD\nNội dung')]).toEqual([]);
  });

  it('marks inserted and replaced draft rows without losing their order', () => {
    expect([...getChangedJDLineIndexes('a\nb\nc', 'a\nB\nc\nd')]).toEqual([1, 3]);
  });

  it('handles duplicate lines deterministically', () => {
    expect([...getChangedJDLineIndexes('a\nx\nx\nb', 'a\nx\nnew\nx\nb')]).toEqual([2]);
  });

  it('keeps blank rows and Vietnamese text intact in change rows', () => {
    const rows = buildJDChangeRows(
      '# Chức danh\n\n- Nội dung cũ',
      '# Chức danh\n\n- Nội dung mới\n- Bổ sung',
    );

    expect(rows).toEqual([
      { index: 0, text: '# Chức danh', changed: false },
      { index: 1, text: '', changed: false },
      { index: 2, text: '- Nội dung mới', changed: true },
      { index: 3, text: '- Bổ sung', changed: true },
    ]);
  });
});
