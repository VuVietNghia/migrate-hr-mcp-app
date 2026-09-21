import { describe, expect, it } from 'vitest';
import { fetchScreeningListItems } from '../src/ui/cv-scored/cv-list-reader';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * Hai ham chi cham `app.callServerTool`, nen mot ham tra trang la stub day du.
 * SDK boc payload thanh JSON trong `content[0].text`; stub tai tao dung hinh dang do.
 */
function createAppStub(pages: (offset: number) => unknown) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const payload = pages(Number(call.arguments?.offset ?? 0));
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
  };
  return { app, calls };
}

function page(start: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    _id: `cv-${start + i}`,
    name: `CV ${start + i}`,
    stageId: 'stage-1',
  }));
}

describe('fetchScreeningListItems', () => {
  it('doc tiep trang sau thay vi cat danh sach CV o trang dau', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0 ? page(0, 100) : page(100, 7)));

    await expect(fetchScreeningListItems(app, 'list-1')).resolves.toHaveLength(107);
    expect(calls.map(c => c.arguments!.offset)).toEqual([0, 100]);
  });

  it('loai item cau hinh he thong ra khoi danh sach CV', async () => {
    const { app } = createAppStub(() => [
      { _id: 'cfg-1', name: '[Hệ thống] Không xoá - Cấu hình Kanban' },
      { _id: 'cv-1', name: 'Nguyen Van A' },
    ]);

    const items = await fetchScreeningListItems(app, 'list-1');
    expect(items.map((i: { _id: string }) => i._id)).toEqual(['cv-1']);
  });

  it('loai item cau hinh he thong khi name rong va marker chi nam trong title', async () => {
    const { app } = createAppStub(() => [
      { _id: 'cfg-1', name: '', title: '[Hệ thống] Không xoá - Cấu hình Stages' },
      { _id: 'cv-1', name: 'Nguyen Van A' },
    ]);

    const items = await fetchScreeningListItems(app, 'list-1');
    expect(items.map((i: { _id: string }) => i._id)).toEqual(['cv-1']);
  });

  it('giu thu tu moi-nhat-truoc nhu truoc khi chuyen sang phan trang', async () => {
    // `fetchAllListItems` ghim `createdAt asc`, trong khi loi goi cu an theo mac dinh
    // `createdAt desc` cua Hub. Khong dao lai thi thu tu the CV tren Kanban bi lat nguoc.
    const { app } = createAppStub(() => page(0, 3));

    const items = await fetchScreeningListItems(app, 'list-1');
    expect(items.map((i: { _id: string }) => i._id)).toEqual(['cv-2', 'cv-1', 'cv-0']);
  });
});
