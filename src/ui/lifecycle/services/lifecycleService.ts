import { McpApp } from '@privos_ai/app-react';
import { EmployeeProfile } from '../types';

export function getMockProfiles(): EmployeeProfile[] {
  return [
    { _id: 'sample-1', name: 'Nguyễn Văn A', status: 'Mới nhận việc' },
    { _id: 'sample-2', name: 'Lê Thị B', status: 'Đang thử việc' },
    { _id: 'sample-3', name: 'Trần Văn C', status: 'Chính thức' },
    { _id: 'sample-4', name: 'Phạm Thị D', status: 'Nghỉ việc' },
  ];
}

export async function getHrListId(app: McpApp, roomId: string): Promise<string | null> {
  try {
    const res: any = await app.callServerTool({
      name: 'mcpapp.lists.getAll',
      arguments: { channelId: roomId }
    });

    const text = res?.content?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    const lists = Array.isArray(parsed) ? parsed : (parsed?.lists || []);

    const hrList = lists.find((l: any) =>
      ['nhan-su', 'nhansu', 'employee', 'lifecycle', 'hồ sơ'].some(kw =>
        (l.name || '').toLowerCase().includes(kw)
      )
    );
    
    return hrList?._id || hrList?.id || null;
  } catch (err) {
    console.error('Failed to get HR List ID:', err);
    return null;
  }
}

export async function createHrList(app: McpApp, roomId: string): Promise<string | null> {
  try {
    const res: any = await app.callServerTool({
      name: 'mcpapp.lists.create',
      arguments: { channelId: roomId, name: 'Hồ sơ nhân sự' }
    });
    const parsed = JSON.parse(res?.content?.[0]?.text || '{}');
    return parsed._id || parsed.id || null;
  } catch (err) {
    console.error('Failed to create HR List:', err);
    return null;
  }
}

export async function fetchProfilesFromServer(app: McpApp, listId: string): Promise<EmployeeProfile[]> {
  const res: any = await app.callServerTool({
    name: 'mcpapp.lists.getItems',
    arguments: { listId }
  });

  const text = res?.content?.[0]?.text;
  if (!text) return [];

  const parsed = JSON.parse(text);
  const items = Array.isArray(parsed) ? parsed : (parsed?.items || []);

  return items.map((item: any) => ({
    _id: item._id || item.id,
    name: item.name || item.title || 'Không có tên',
    status: item.status || item.stage || 'Mới nhận việc',
  }));
}

export async function loadEmployeeProfiles(app: McpApp, roomId: string): Promise<EmployeeProfile[]> {
  try {
    const listId = await getHrListId(app, roomId);
    if (!listId) {
      console.log('[Lifecycle] Không tìm thấy list nhân sự trên server. Đang dùng data mẫu.');
      return getMockProfiles();
    }
    return await fetchProfilesFromServer(app, listId);
  } catch (err) {
    console.warn('[Lifecycle] Lỗi khi load hồ sơ từ server. Dùng data mẫu:', err);
    return getMockProfiles();
  }
}

export async function createEmployeeProfile(app: McpApp, roomId: string, name: string): Promise<EmployeeProfile> {
  const newProfile: EmployeeProfile = {
    _id: `local-${Date.now()}`,
    name,
    status: 'Mới nhận việc'
  };

  try {
    let listId = await getHrListId(app, roomId);
    if (!listId) {
      listId = await createHrList(app, roomId);
    }

    if (listId) {
      await app.callServerTool({
        name: 'mcpapp.lists.create_item',
        arguments: {
          listId,
          item: {
            title: name,
            name: name,
            status: 'Mới nhận việc',
            stage: 'Mới nhận việc'
          }
        }
      });
    }
  } catch (err) {
    console.warn(`[Lifecycle] Lỗi kết nối khi tạo hồ sơ. Fallback local.`, err);
  }
  return newProfile;
}
