import { describe, expect, it } from 'vitest';
import { PrivOSLifecycleService } from '../src/ui/lifecycle/services/PrivOSLifecycleService';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/** Service chỉ gọi `app.callServerTool`; SDK thật bọc payload thành JSON trong `content[0].text`. */
function createAppStub(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  return {
    async callServerTool(call: ToolCall) {
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      return { content: [{ type: 'text', text: JSON.stringify(handler(call.arguments ?? {})) }] };
    },
  };
}

const STAGE_INVITED = { _id: 'stage-05', name: '05_Moi_Phong_Van' };

function screeningRoom(listName: string, itemTitle: string) {
  const list = { _id: 'screening-1', name: listName, stages: [STAGE_INVITED] };
  const item = {
    _id: 'cv-1',
    name: itemTitle,
    stageId: STAGE_INVITED._id,
    customFields: [{ fieldId: 'tong_diem', value: 82 }],
  };
  return createAppStub({
    'mcpapp.lists.getAll': () => [list],
    'mcpapp.lists.getItems': () => [item],
  });
}

async function loadOnlyCandidate(listName: string, itemTitle: string) {
  const app = screeningRoom(listName, itemTitle);
  // Stub chỉ cài đúng phần McpApp mà service dùng tới.
  const service = new PrivOSLifecycleService(app as unknown as ConstructorParameters<typeof PrivOSLifecycleService>[0]);
  const candidates = await service.loadPassedCandidates('room-1');
  expect(candidates).toHaveLength(1);
  return candidates[0];
}

describe('PrivOSLifecycleService.loadPassedCandidates', () => {
  it('lấy vị trí từ tên list JD, không đoán từ tên ứng viên', async () => {
    // Bản cũ: "Van Bui" chứa "ui" nên thành Designer dù JD là Backend Developer.
    const candidate = await loadOnlyCandidate('SCREENING_BACKEND_DEVELOPER', '2026-09-11_CV_Pham_Van_Bui.md');
    expect(candidate.position).toBe('Developer');
  });

  it('giữ họ tên đầy đủ của ứng viên', async () => {
    // Bản cũ chỉ giữ phần trước dấu gạch dưới đầu tiên: "Pham".
    const candidate = await loadOnlyCandidate('SCREENING_BACKEND_DEVELOPER', '2026-09-11_CV_Pham_Van_Bui.md');
    expect(candidate.name).toBe('Pham Van Bui');
  });

  it('không tách chữ hoa liền nhau thành từng ký tự', async () => {
    // Bản cũ sinh "L U U" và vị trí "S O N T R U O N G".
    const candidate = await loadOnlyCandidate('SCREENING_UX_DESIGNER', '2026-09-17_CV_LUU_SON_TRUONG.md');
    expect(candidate.name).toBe('LUU SON TRUONG');
    expect(candidate.position).toBe('Designer');
  });

  it('để trống vị trí khi list không mang tên JD', async () => {
    const candidate = await loadOnlyCandidate('SCREENING_UNKNOWN', '2026-09-11_CV_Vu_Viet_Nghia.md');
    expect(candidate.position).toBeUndefined();
    expect(candidate.score).toBe(82);
  });
});

describe('PrivOSLifecycleService.loadPassedCandidates — lọc theo stage', () => {
  const STAGES = [
    { _id: 'stage-02', name: '02_Loai_CV' },
    STAGE_INVITED,
    { _id: 'stage-07', name: '07_Chua_Phong_Van' },
    { _id: 'stage-08', name: '08_Da_Phong_Van' },
  ];

  async function loadCandidateIds(): Promise<string[]> {
    const list = { _id: 'screening-1', name: 'SCREENING_BACKEND_DEVELOPER', stages: STAGES };
    const items = STAGES.map((stage) => ({
      _id: `cv-${stage._id}`,
      name: `2026-09-18_CV_Ung_Vien_${stage._id}.md`,
      stageId: stage._id,
    }));
    const app = createAppStub({
      'mcpapp.lists.getAll': () => [list],
      'mcpapp.lists.getItems': () => items,
    });
    // Stub chỉ cài đúng phần McpApp mà service dùng tới.
    const service = new PrivOSLifecycleService(app as unknown as ConstructorParameters<typeof PrivOSLifecycleService>[0]);
    const candidates = await service.loadPassedCandidates('room-1');
    return candidates.map((c) => c._id).sort();
  }

  it('chỉ lấy ứng viên ở 05_Moi_Phong_Van và 08_Da_Phong_Van', async () => {
    expect(await loadCandidateIds()).toEqual(['cv-stage-05', 'cv-stage-08']);
  });
});

describe('PrivOSLifecycleService.loadPassedCandidates — lỗi', () => {
  it('reject khi đọc item lỗi, không trả về danh sách rỗng', async () => {
    // Trả [] khi lỗi làm form hiểu nhầm là ứng viên đã bị kéo khỏi cột và xoá dữ liệu đang nhập.
    const app = createAppStub({
      'mcpapp.lists.getAll': () => [{ _id: 'screening-1', name: 'SCREENING_BACKEND_DEVELOPER', stages: [STAGE_INVITED] }],
      'mcpapp.lists.getItems': () => { throw new Error('hub down'); },
    });
    // Stub chỉ cài đúng phần McpApp mà service dùng tới.
    const service = new PrivOSLifecycleService(app as unknown as ConstructorParameters<typeof PrivOSLifecycleService>[0]);
    await expect(service.loadPassedCandidates('room-1')).rejects.toThrow('hub down');
  });
});

describe('PrivOSLifecycleService.loadPassedCandidates — không lấy được stage', () => {
  it('reject khi list không kèm stage và không tải được stage', async () => {
    // Không có stage thì mọi thẻ rơi về stage mặc định, không qua bộ lọc 05/08, và form hiểu nhầm
    // là ứng viên đang chọn đã bị kéo khỏi cột.
    const app = createAppStub({
      'mcpapp.lists.getAll': () => [{ _id: 'screening-1', name: 'SCREENING_BACKEND_DEVELOPER' }],
      'mcpapp.stages.getByList': () => { throw new Error('hub down'); },
      'mcpapp.lists.getItems': () => [{ _id: 'cv-1', name: '2026-09-18_CV_Ung_Vien.md', stageId: STAGE_INVITED._id }],
    });
    // Stub chỉ cài đúng phần McpApp mà service dùng tới.
    const service = new PrivOSLifecycleService(app as unknown as ConstructorParameters<typeof PrivOSLifecycleService>[0]);
    await expect(service.loadPassedCandidates('room-1')).rejects.toThrow('SCREENING_BACKEND_DEVELOPER');
  });
});
