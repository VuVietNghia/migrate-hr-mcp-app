import { describe, expect, it } from 'vitest';
import { saveEmployeeMd } from '../src/ui/lifecycle/services/employee-md-save';

function createAppStub(options: { restStatus?: number } = {}) {
  const app = {
    async rest() {
      return { statusCode: options.restStatus ?? 200, body: { success: true } };
    },
    async uploadFile() {
      return { file: { _id: 'file-1' } };
    },
  };
  return app as any;
}

const REF = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

describe('saveEmployeeMd', () => {
  it('ghi file truoc roi moi dong bo item', async () => {
    const order: string[] = [];
    const app = {
      async rest() {
        order.push('write-file');
        return { statusCode: 200, body: { success: true } };
      },
    } as any;

    const result = await saveEmployeeMd({
      app,
      roomId: 'room-1',
      ref: REF,
      content: '# noi dung',
      syncItem: async () => { order.push('sync-item'); },
    });

    expect(result).toEqual({ status: 'saved', route: 'update-content' });
    expect(order).toEqual(['write-file', 'sync-item']);
  });

  it('bao saved-item-stale khi file da ghi xong nhung the chua cap nhat', async () => {
    // Thu nguoi dung vua go DA an toan trong file; chi the Kanban la cu. Bao that bai
    // chung chung se khien ho go lai tu dau va ghi de len ban vua luu dung.
    const result = await saveEmployeeMd({
      app: createAppStub(),
      roomId: 'room-1',
      ref: REF,
      content: '# noi dung',
      syncItem: async () => { throw new Error('updateItem bi tu choi'); },
    });

    expect(result.status).toBe('saved-item-stale');
    expect(result.route).toBe('update-content');
    expect(result).toHaveProperty('detail', 'updateItem bi tu choi');
  });

  it('khong dong bo item khi ghi file that bai', async () => {
    // Dong bo the trong khi file chua ghi duoc se lam the noi mot dang, file noi mot neo.
    let synced = false;
    const app = {
      async rest() { return { statusCode: 500, body: { error: 'MinIO down' } }; },
      async uploadFile() { throw new Error('MinIO down'); },
    } as any;

    await expect(saveEmployeeMd({
      app,
      roomId: 'room-1',
      ref: REF,
      content: '# noi dung',
      syncItem: async () => { synced = true; },
    })).rejects.toThrow(/MinIO down/);
    expect(synced).toBe(false);
  });
});
