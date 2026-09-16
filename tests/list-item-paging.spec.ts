import { describe, expect, it } from 'vitest';
import { fetchAllListItems, readItemId } from '../src/ui/list-item-paging';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * `fetchAllListItems` chỉ chạm `app.callServerTool`, nên một hàm trả trang là stub đầy đủ.
 * SDK bọc payload thành JSON trong `content[0].text`; stub tái tạo đúng hình dạng đó vì
 * module dùng `parseToolResult` để bóc.
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
  return Array.from({ length: n }, (_, i) => ({ _id: `item-${start + i}`, name: `Item ${start + i}` }));
}

describe('readItemId', () => {
  it('doc _id truoc, roi toi id', () => {
    expect(readItemId({ _id: 'a', id: 'b' })).toBe('a');
    expect(readItemId({ id: 'b' })).toBe('b');
  });

  it('tra chuoi rong khi khong co id nao dung duoc', () => {
    expect(readItemId({ name: 'x' })).toBe('');
    expect(readItemId({ _id: '' })).toBe('');
    expect(readItemId({ _id: 123 })).toBe('');
    expect(readItemId(null)).toBe('');
  });
});

describe('fetchAllListItems', () => {
  it('doc tiep trang sau thay vi cat o 100', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0 ? page(0, 100) : page(100, 7)));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(107);
    expect(calls.map(c => c.arguments!.offset)).toEqual([0, 100]);
    expect(calls.every(c => c.arguments!.count === 100)).toBe(true);
  });

  it('cham pageSize vuot 100, khong dung sau mot trang day', async () => {
    // Hub chan `count` o 100 va tra du 100 dong ma khong bao loi. Neu pageSize khong duoc
    // cham, `items.length < pageSize` (100 < 1000) se dung true tren mot trang DAY, vong lap
    // thoat sau dung mot trang va tra ve du lieu cat cut trong im lang — dung cai loi module
    // nay sinh ra de chan.
    const { app, calls } = createAppStub((offset) => (offset === 0 ? page(0, 100) : page(100, 7)));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10, pageSize: 1000 }))
      .resolves.toHaveLength(107);
    expect(calls.map(c => c.arguments!.offset)).toEqual([0, 100]);
    expect(calls.every(c => Number(c.arguments!.count) <= 100)).toBe(true);
  });

  it('dung o trang dau ngan, khong hoi trang thu hai', async () => {
    const { app, calls } = createAppStub(() => page(0, 3));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it('chap nhan hinh dang { items: [...] } ben canh mang tran', async () => {
    const { app } = createAppStub(() => ({ items: page(0, 2) }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(2);
  });

  it('nem loi khi Hub bo qua offset thay vi lap vo tan hoac cat bot', async () => {
    const { app } = createAppStub(() => page(0, 100));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/offset/i);
  });

  it('nem loi khi vuot tran so trang', async () => {
    let next = 0;
    const { app } = createAppStub(() => { const p = page(next, 100); next += 100; return p; });

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 3 }))
      .rejects.toThrow(/300 item/);
  });

  it('missingId throw nem loi khi item khong co id', async () => {
    const { app } = createAppStub(() => [{ name: 'Khong co id' }]);

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/_id/);
  });

  it('missingId skip bo qua item khong co id va giu phan con lai', async () => {
    const { app } = createAppStub(() => [{ name: 'Khong co id' }, { _id: 'item-1', name: 'Co id' }]);

    const items = await fetchAllListItems(app, 'list-1', { missingId: 'skip', maxPages: 10 });
    expect(items).toEqual([{ _id: 'item-1', name: 'Co id' }]);
  });

  it('khong nham mot trang toan item khong-id thanh tien do khi missingId la skip', async () => {
    // Trang khong co id nao thi khong ket luan duoc gi ve offset, nen chi duoc dung o tran trang,
    // khong duoc nem loi "bo qua offset" sai.
    const { app } = createAppStub(() => Array.from({ length: 100 }, () => ({ name: 'Khong co id' })));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'skip', maxPages: 2 }))
      .rejects.toThrow(/200 item/);
  });
});
