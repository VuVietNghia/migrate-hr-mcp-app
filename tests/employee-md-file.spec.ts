import { describe, expect, it, vi } from 'vitest';
import {
  canWriteEmployeeMd,
  resolveEmployeeMdFileRef,
  writeEmployeeMdText,
} from '../src/ui/lifecycle/services/employee-md-file';

type RestCall = { method: string; path: string; body?: any };
type UploadCall = Record<string, unknown>;

/**
 * `employee-md-file` chi cham `app.rest` va `app.uploadFile`, nen hai ham nay la
 * stub day du. `app.rest` tra `{ statusCode, body }` dung nhu SDK that, vi
 * `restCall` doc hai truong do de quyet dinh nem hay khong.
 */
function createAppStub(options: {
  restStatus?: number;
  restBody?: any;
  uploadThrows?: Error;
} = {}) {
  const restCalls: RestCall[] = [];
  const uploadCalls: UploadCall[] = [];
  const app = {
    async rest(params: any) {
      restCalls.push({ method: params.method, path: params.path, body: params.body });
      return {
        statusCode: options.restStatus ?? 200,
        body: options.restBody ?? { success: true },
      };
    },
    async uploadFile(params: UploadCall) {
      uploadCalls.push(params);
      if (options.uploadThrows) throw options.uploadThrows;
      return { file: { _id: 'file-1' } };
    },
  };
  return { app: app as any, restCalls, uploadCalls };
}

describe('resolveEmployeeMdFileRef', () => {
  it('doc folder_id snake_case cua Hub, khong chi doc folderId', () => {
    // File Object cua Hub dung snake_case (`file-management-api.md:37`). Doc sai khoa
    // thi nhanh du phong tuong la khong biet thu muc va tu choi ghi.
    const ref = resolveEmployeeMdFileRef({
      attachedFileObj: {
        _id: 'file-1',
        name: 'ho-so.md',
        folder_id: 'folder-9',
        downloadUrl: 'https://minio/ho-so.md',
      },
    });
    expect(ref).toEqual({
      fileId: 'file-1',
      downloadUrl: 'https://minio/ho-so.md',
      folderId: 'folder-9',
      fileName: 'ho-so.md',
    });
  });

  it('chap nhan folderId camelCase khi khong co folder_id', () => {
    const ref = resolveEmployeeMdFileRef({
      attachedFileObj: { id: 'file-2', fileName: 'x.md', folderId: 'folder-3' },
    });
    expect(ref!.fileId).toBe('file-2');
    expect(ref!.folderId).toBe('folder-3');
    expect(ref!.fileName).toBe('x.md');
  });

  it('tut ve fileId trong description khi khong co file object', () => {
    const ref = resolveEmployeeMdFileRef({ attachedFileId: 'file-4' });
    expect(ref).toEqual({ fileId: 'file-4' });
  });

  it('bo qua chuoi "null" ma luong cu ghi vao fileUrl', () => {
    expect(resolveEmployeeMdFileRef({ attachedFileUrl: 'null' })).toBeNull();
  });

  it('tra null khi ho so khong co file dinh kem nao', () => {
    expect(resolveEmployeeMdFileRef({})).toBeNull();
  });
});

describe('canWriteEmployeeMd', () => {
  it('tra false khi khong co ref', () => {
    expect(canWriteEmployeeMd(null)).toBe(false);
  });

  it('tra false khi chi co duong dan tai ve', () => {
    expect(canWriteEmployeeMd({ downloadUrl: 'https://x' })).toBe(false);
  });

  it('tra true khi co id file', () => {
    expect(canWriteEmployeeMd({ fileId: 'f' })).toBe(true);
  });

  it('tra true khi du thu muc lan ten file', () => {
    expect(canWriteEmployeeMd({ folderId: 'd', fileName: 'x.md' })).toBe(true);
  });

  it('tra false khi co thu muc nhung thieu ten file', () => {
    expect(canWriteEmployeeMd({ folderId: 'd' })).toBe(false);
  });
});

describe('writeEmployeeMdText', () => {
  it('uu tien update-content va khong dung toi uploadFile', async () => {
    const { app, restCalls, uploadCalls } = createAppStub();
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, '# noi dung'))
      .resolves.toBe('update-content');
    expect(restCalls).toEqual([{
      method: 'POST',
      path: 'file-management.files/file-1/update-content',
      body: { content: '# noi dung' },
    }]);
    expect(uploadCalls).toHaveLength(0);
  });

  it('tut ve uploadFile replace khi update-content bi tu choi', async () => {
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, '# noi dung'))
      .resolves.toBe('upload-replace');
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]).toMatchObject({
      channelId: 'room-1',
      fileName: 'ho-so.md',
      folderId: 'folder-9',
      mimeType: 'text/markdown',
      duplicateAction: 'replace',
    });
  });

  it('khong upload khi thieu folderId, de khong de ra file lac cho', async () => {
    // Thieu folderId thi upload roi vao thu muc goc va tao file THU HAI thay vi ghi
    // de, de lai file mo coi ma item khong tro toi.
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });

    await expect(writeEmployeeMdText(app, 'room-1', { fileId: 'file-1', fileName: 'x.md' }, 'noi dung'))
      .rejects.toThrow(/thư mục/);
    expect(uploadCalls).toHaveLength(0);
  });

  it('khong upload khi thieu ten file goc', async () => {
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });

    await expect(writeEmployeeMdText(app, 'room-1', { fileId: 'file-1', folderId: 'folder-9' }, 'noi dung'))
      .rejects.toThrow(/tên file/);
    expect(uploadCalls).toHaveLength(0);
  });

  it('nem loi khi ca hai duong deu hong', async () => {
    const { app, restCalls, uploadCalls } = createAppStub({ restStatus: 403, uploadThrows: new Error('MinIO down') });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, 'noi dung'))
      .rejects.toThrow(/MinIO down/);
    expect(restCalls).toHaveLength(1);
    expect(uploadCalls).toHaveLength(1);
  });

  it('khong upload khi update-content loi khac 403', async () => {
    // 404/500 khong phai route bi chan. Upload luc nay co the upsert ra file moi, vd khi file
    // da bi xoa trong luc form dang mo.
    const { app, uploadCalls } = createAppStub({ restStatus: 500 });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, 'noi dung'))
      .rejects.toThrow(/Không ghi được file hồ sơ/);
    expect(uploadCalls).toHaveLength(0);
  });

  it('doi ma loi tho cua Hub thanh cau nguoi dung doc duoc', async () => {
    // `error-quota-exceeded` hien nguyen xi len banner thi khong ai biet phai lam gi.
    const { app } = createAppStub({
      restStatus: 403,
      uploadThrows: new Error('error-quota-exceeded'),
    });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, 'noi dung'))
      .rejects.toThrow(/Kho lưu trữ của Room đã đầy/);
  });

  it('ma hoa UTF-8 tieng Viet sang base64 chu khong cat dau', async () => {
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await writeEmployeeMdText(app, 'room-1', ref, '# HỒ SƠ NHÂN SỰ');

    const data = String(uploadCalls[0].base64Data);
    expect(data.startsWith('data:text/markdown;base64,')).toBe(true);
    const decoded = Buffer.from(data.slice('data:text/markdown;base64,'.length), 'base64').toString('utf8');
    expect(decoded).toBe('# HỒ SƠ NHÂN SỰ');
  });
});
