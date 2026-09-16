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

  it('khong gan cung nghiep vu bang luong vao thong bao loi dung chung', async () => {
    // Module dung chung cho nhieu man hinh. Cau bao loi khong duoc noi ve bang luong, vi
    // caller `throw` tiep theo se hien mot thong bao sai nghiep vu cho nguoi dung.
    const { app } = createAppStub(() => [{ name: 'Khong co id' }]);

    const error = await fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 })
      .then(() => null, (e: unknown) => e as Error);

    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain('không mang _id lẫn id');
    expect(error!.message).not.toContain('bảng lương');
  });

  it('khong doc lai khi Hub tra total on dinh qua cac trang', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0
      ? { items: page(0, 100), total: 107 }
      : { items: page(100, 7), total: 107 }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(107);
    expect(calls).toHaveLength(2);
  });

  it('doc lai tu dau khi total doi giua chung', async () => {
    // Luot 1 bat dau voi total 107 roi tut xuong 106 o trang hai: co dong bi xoa giua chung,
    // moi offset dang giu deu khong con dang tin. Luot 2 doc lai on dinh o 106.
    let attempt = 0;
    const { app, calls } = createAppStub((offset) => {
      if (offset === 0) attempt += 1;
      if (attempt === 1) {
        return offset === 0
          ? { items: page(0, 100), total: 107 }
          : { items: page(100, 7), total: 106 };
      }
      return offset === 0
        ? { items: page(0, 100), total: 106 }
        : { items: page(100, 6), total: 106 };
    });

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(106);
    expect(calls.map(c => c.arguments!.offset)).toEqual([0, 100, 0, 100]);
  });

  it('phat hien dong bi xoa qua so item khong khop total, roi doc lai', async () => {
    // Hub bao tong 5 nhung chi tra ve 4 dong. `seenIds` mu truoc truong hop nay vi no chi bat
    // duoc dong LAP, khong bat duoc dong THIEU — day la lo hong ma phep doi chieu total va lap.
    let attempt = 0;
    const { app } = createAppStub(() => {
      attempt += 1;
      return attempt === 1
        ? { items: page(0, 4), total: 5 }
        : { items: page(0, 5), total: 5 };
    });

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(5);
  });

  it('nem loi khi list doi lien tuc qua moi luot doc lai', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0
      ? { items: page(0, 100), total: 107 }
      : { items: page(100, 7), total: 106 }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/thay đổi liên tục/);
    // 3 luot doc, moi luot 2 trang: co tran cung, khong doc lai vo han.
    expect(calls).toHaveLength(6);
  });

  it('khong bao lech gia khi item thieu id bi bo qua nhung van nam trong total', async () => {
    // Voi missingId 'skip', item khong id khong vao mang ket qua nhung Hub van dem no trong
    // total. Neu khong tinh rieng phan bi bo qua thi moi list co item hong se bi doc lai 3 lan
    // roi nem loi — hong nang hon chinh loi dang sua.
    const { app, calls } = createAppStub(() => ({
      items: [{ name: 'Khong co id' }, { _id: 'item-1', name: 'Co id' }],
      total: 2,
    }));

    const items = await fetchAllListItems(app, 'list-1', { missingId: 'skip', maxPages: 10 });
    expect(items).toEqual([{ _id: 'item-1', name: 'Co id' }]);
    expect(calls).toHaveLength(1);
  });

  it('khong doc lai khi loi la loi cung chu khong phai list bi doi', async () => {
    // Hub bo qua offset la loi cung: doc lai chi nhan ba lan so request roi van hong y het.
    const { app, calls } = createAppStub(() => ({ items: page(0, 100), total: 100 }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/offset/i);
    expect(calls).toHaveLength(2);
  });

  it('khong doc lai khi total chi tang giua chung (them dong an toan duoi createdAt asc)', async () => {
    // Duoi sortBy createdAt asc, mot dong THEM giua luc doc luon roi xuong cuoi, sau con tro
    // hien tai - code cu tra ve dung du lieu cho truong hop nay. Chi tang total khong duoc coi
    // la mutation, chi giam moi la dau hieu co dong bi XOA.
    const { app, calls } = createAppStub((offset) => (offset === 0
      ? { items: page(0, 100), total: 100 }
      : { items: page(100, 5), total: 105 }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(105);
    expect(calls).toHaveLength(2);
  });
});
