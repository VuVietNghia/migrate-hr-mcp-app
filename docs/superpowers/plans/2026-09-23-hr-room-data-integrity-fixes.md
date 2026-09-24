# Sửa 5 lỗi toàn vẹn dữ liệu cho room HR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chặn 5 trường hợp app lặng lẽ mất dữ liệu hoặc cho kết quả sai khi dùng trong room HR nhỏ.

**Architecture:** Có 5 task độc lập, mỗi task sửa một luồng code đã có và kèm test riêng. Các task không dùng chung hàm mới nào của nhau. Thứ tự làm đi từ rủi ro thấp đến cao; Task 5 sửa hàm tạo thư mục dùng chung cho mọi đường lưu file nên để cuối cùng.

**Tech Stack:** React 18 + TypeScript strict, `@privos_ai/app-react` (`callServerTool`, `rest`, `parseToolResult`), vitest (`environment: 'node'`).

**Spec:** Không có file spec. Thiết kế đã thống nhất trong hội thoại ngày 2026-09-23, gồm:
- Danh sách lỗi đã lọc theo điều kiện "room HR nhỏ, 1–2 người dùng tin cậy nhau".
- Hai quyết định lấy theo đề xuất, vì người dùng không chọn khác:
  - (A) Task 4 thêm hậu tố cố định lấy từ id của CV gốc vào tên file.
  - (B) Task 1 báo lỗi ngay khi Hub không trả `aiMessageId`.

## Global Constraints

- Không commit, không push. Git chỉ được dùng read-only (`status`, `diff`, `log`, `show`, `blame`, `rev-parse`).
- Lệnh hợp lệ duy nhất để chạy code là `npm start`. Vitest, typecheck và build chỉ là công cụ lúc phát triển. Kết quả của chúng không được báo là "pass" hay "hoàn thành".
- TypeScript strict. Không thêm `any` mới, trừ khi file đang sửa vốn đã dùng `any` cho đúng giá trị đó.
- Không dùng icon hay emoji trong code, comment hoặc chuỗi mới.
- Ngoài phạm vi, không sửa:
  - mục 3 (XSS ở phần xem trước soạn thảo, `bot-drafting-tab.tsx`);
  - mục 8 (lệch tên app giữa `package.json` và `privos-app.json`);
  - dependency `gitnexus`;
  - phân quyền, tải hệ thống.
- `tests/manifest.spec.ts` đang fail sẵn từ trước vì mục 8. Không tính là lỗi của plan này.
- Hậu tố tên file ở Task 4 có dạng `-` + 6 ký tự hex cuối (chữ thường) của `_id` file CV gốc, đặt ngay trước `.md`. Ví dụ: `2026-09-23_CV_Nguyen_Van_A-3f9c1a.md`.

## Review Focus

1. **Hub trả danh sách tin nhắn AI theo thứ tự mới nhất trước:** CV đang chấm phải nhận đúng câu trả lời của chính nó, không nhận kết quả đã xong của CV trước. Test ở Task 1: "chon dung tin theo aiMessageId khi Hub tra tin moi nhat truoc".
2. **Đang chạy một loạt CV thì gửi thêm yêu cầu soạn thảo:** mỗi bên chỉ nhận câu trả lời của mình. Test ở Task 1: "bo qua tin AI da xong cua yeu cau khac".
3. **Hub trả id hồ sơ vừa tạo lồng trong `item`** (`{ item: { _id } }`, như cách `email-history-repository.ts:191` đọc): tạo hồ sơ vẫn thành công, không báo lỗi nhầm. Test ở Task 2: "doc id tu item long nhau".
4. **Chấm lại cùng một CV trong cùng ngày:** phải ghi đè đúng file của CV đó, không sinh file mới. Test ở Task 4: "cung CV cho cung ten, hai CV khac nhau cho ten khac nhau".
5. **Tên ứng viên hiển thị trong email mời và trong form tạo hồ sơ nhân sự:** không được dính hậu tố hex. Test ở Task 4: "parseCandidateName bo hau to hex" và "onInvite bo hau to truoc khi dung ten".

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `src/ui/pipeline-service.ts` | `askAI` chọn tin nhắn theo `aiMessageId`; `processCV` báo lỗi khi lưu MD thất bại và gắn hậu tố tên file | 1, 3, 4 |
| `src/ui/lifecycle/services/PrivOSLifecycleService.ts` | `createProfile` ném lỗi thay vì trả hồ sơ giả | 2 |
| `src/ui/lifecycle/LifecycleDashboard.tsx` | `handleCreateSubmit` xoá thông báo "đang khởi tạo" và ném lỗi tiếp cho form | 2 |
| `src/ui/pipeline-candidate-name.ts` | Thêm `cvFileSuffix`, `withCvFileSuffix`, `stripCvFileSuffix` | 4 |
| `src/ui/lifecycle/passed-candidate-parsing.ts` | `parseCandidateName` bỏ hậu tố | 4 |
| `src/ui/cv-scored/CVScoredTab.tsx` | Tên ứng viên trong email mời bỏ hậu tố | 4 |
| `src/ui/privos-rest.ts` | `ensureFolderPath` ném lỗi khi đọc hoặc tạo thư mục thất bại | 5 |
| `tests/pipeline-ai-polling.spec.ts` | Sửa fixture, thêm test | 1 |
| `tests/lifecycle-load-profiles.spec.ts` | Thay test id local bằng test ném lỗi | 2 |
| `tests/data-integrity-wiring.spec.ts` (mới) | Quét source để kiểm tra wiring của Task 2, 3, 4 | 2, 3, 4 |
| `tests/pipeline-candidate-name.spec.ts`, `tests/passed-candidate-parsing.spec.ts` | Test hậu tố | 4 |
| `tests/ensure-folder-path.spec.ts` (mới) | Test tạo thư mục | 5 |

---

### Task 1: `askAI` chỉ nhận đúng tin nhắn của yêu cầu vừa gửi

**Files:**
- Modify: `src/ui/pipeline-service.ts:880-920` (thân `askAI`, từ `const sessionId = sent.sessionId;` đến khối `if (aiMsg) {...}`)
- Test: `tests/pipeline-ai-polling.spec.ts`

**Interfaces:**
- Produces: chữ ký `askAI(content, _fileName?, fileId?, onLog?, customFlowChatId?, signal?): Promise<{ text: string }>` giữ nguyên. Hành vi mới:
  - Ném `Error` chứa chuỗi `aiMessage._id` khi response của `ai-messages.send` không có id.
  - Chỉ trả về khi tin nhắn có `_id === aiMessageId` đạt trạng thái `completed`, `failed` hoặc `cancelled`.

- [ ] **Step 1: Sửa stub và thêm test (sẽ fail)**

Trong `tests/pipeline-ai-polling.spec.ts`:

1a. Thay chữ ký và nhánh `ai-messages.send` của `createAppStub`:

```ts
function createAppStub(
  onList: () => unknown,
  sendBody: unknown = { sessionId: 'sess-1', aiMessage: { _id: 'msg-1' } },
) {
  let listCalls = 0;
  const app = {
    async rest(req: { method: string; path: string }) {
      if (req.path === 'ai-messages.send') {
        return { statusCode: 200, body: sendBody };
      }
```

Phần còn lại của `createAppStub` giữ nguyên.

1b. Trong test `'tra ve ngay khi AI bao completed'`, đổi phần tử tin nhắn thành `{ _id: 'msg-1', type: 'ai', status: 'completed', content: 'xong roi' }`.

1c. Trong test `'dung ngay khi signal bi abort'`, đổi phần tử tin nhắn thành `{ _id: 'msg-1', type: 'ai', status: 'processing' }`.

1d. Thêm vào cuối khối `describe('askAI', ...)`:

```ts
  it('bo qua tin AI da xong cua yeu cau khac trong cung phien', async () => {
    vi.useFakeTimers();
    try {
      let poll = 0;
      const app = createAppStub(() => {
        poll += 1;
        return {
          messages: [
            { _id: 'msg-1', type: 'ai', status: poll >= 2 ? 'completed' : 'processing', content: 'dung cua minh' },
            // Tin cua yeu cau soan thao gui sau, nam cuoi danh sach va da xong truoc.
            { _id: 'msg-other', type: 'ai', status: 'completed', content: 'cua yeu cau khac' },
          ],
        };
      });
      const service = new PipelineService(app as never, 'room-1', {} as never);

      const pending = service.askAI('prompt');
      await vi.advanceTimersByTimeAsync(4000);
      await expect(pending).resolves.toEqual({ text: 'dung cua minh' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('chon dung tin theo aiMessageId khi Hub tra tin moi nhat truoc', async () => {
    vi.useFakeTimers();
    try {
      const app = createAppStub(() => ({
        messages: [
          { _id: 'msg-1', type: 'ai', status: 'completed', content: 'ket qua CV moi' },
          { _id: 'msg-old', type: 'ai', status: 'completed', content: 'ket qua CV truoc' },
        ],
      }));
      const service = new PipelineService(app as never, 'room-1', {} as never);

      const pending = service.askAI('prompt');
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toEqual({ text: 'ket qua CV moi' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bao loi ngay khi Hub khong tra id tin nhan AI', async () => {
    const app = createAppStub(
      () => ({ messages: [{ _id: 'msg-x', type: 'ai', status: 'completed', content: 'khong phai cua minh' }] }),
      { sessionId: 'sess-1' },
    );
    const service = new PipelineService(app as never, 'room-1', {} as never);

    await expect(service.askAI('prompt')).rejects.toThrow(/aiMessage\._id/);
    expect(app.listCalls).toBe(0);
  });
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/pipeline-ai-polling.spec.ts`
Expected: FAIL ở 3 test mới. Test 1 và 2 nhận nhầm `'cua yeu cau khac'` / `'ket qua CV truoc'`. Test 3 resolve thay vì reject. Ba test cũ vẫn xanh.

- [ ] **Step 3: Sửa `askAI`**

Trong `src/ui/pipeline-service.ts`, thay:

```ts
    const sessionId = sent.sessionId;
    const aiMessageId = sent.aiMessage?._id;

    if (aiMessageId) {
      if (onLog) onLog(`>> Đã khởi tạo Session: ${sessionId}, Yêu cầu AI phản hồi...`);
      await restCall(this.app, 'POST', 'ai-messages.startGeneration', { body: { messageId: aiMessageId } });
    }
```

bằng:

```ts
    const sessionId = sent.sessionId;
    const aiMessageId: unknown = sent.aiMessage?._id;
    // Chấm CV, soạn thảo và trang công ty dùng chung một phiên chat của room, nên chỉ id này phân
    // biệt được câu trả lời của yêu cầu vừa gửi. Không có id thì không đoán theo "tin AI mới nhất".
    if (typeof aiMessageId !== 'string' || !aiMessageId) {
      throw new Error('Hub không trả về id tin nhắn AI (aiMessage._id), không xác định được câu trả lời của yêu cầu này.');
    }

    if (onLog) onLog(`>> Đã khởi tạo Session: ${sessionId}, Yêu cầu AI phản hồi...`);
    await restCall(this.app, 'POST', 'ai-messages.startGeneration', { body: { messageId: aiMessageId } });
```

và thay dòng:

```ts
      const aiMsg = [...list].reverse().find((m: any) => m.type === 'ai');
```

bằng:

```ts
      const aiMsg = list.find((m: any) => m?._id === aiMessageId);
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run tests/pipeline-ai-polling.spec.ts tests/fetch-available-files.spec.ts tests/pipeline-kanban-stage-move.spec.ts tests/skill-templates.spec.ts`
Expected: tất cả xanh. Chỉ là tín hiệu lúc phát triển.

- [ ] **Step 5: Không commit.**

---

### Task 2: Tạo hồ sơ nhân sự thất bại thì báo lỗi, không trả hồ sơ giả

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:133-151` (đọc kết quả `createItem`, khối `catch` và nhánh fallback), `:258-262` (xoá `generateLocalId`)
- Modify: `src/ui/lifecycle/LifecycleDashboard.tsx:124-140` (`handleCreateSubmit`)
- Test: `tests/lifecycle-load-profiles.spec.ts`, `tests/data-integrity-wiring.spec.ts` (mới)

**Interfaces:**
- Produces:
  - `createProfile(roomId, data): Promise<EmployeeProfile>` giữ nguyên chữ ký, nay ném `Error` khi có lỗi thay vì trả hồ sơ `local-…`.
  - `_id` được đọc từ `parsed._id`, `parsed.id`, `parsed.item._id` hoặc `parsed.item.id`.
- Consumes: `CreateDetailedProfileForm.tsx:291-310` đã có `catch` hiển thị `setErrorMsg(err.message)`. Không sửa file này.

- [ ] **Step 1: Viết test (sẽ fail)**

1a. Trong `tests/lifecycle-load-profiles.spec.ts`, thay nguyên khối `describe('PrivOSLifecycleService id local khi tao ho so that bai', ...)` bằng:

```ts
describe('PrivOSLifecycleService khong tra ho so gia khi tao that bai', () => {
  const LIST_OK = { ...HR_LIST, stages: STAGES };

  it('nem loi khi Hub khong phan hoi, khong tra id local', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => { throw new Error('hub khong phan hoi'); },
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.createProfile('room-1', { name: 'NV A' } as never)).rejects.toBeInstanceOf(Error);
  });

  it('nem loi khi createItem tra isError', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_OK],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => rawResult({ isError: true, content: [{ type: 'text', text: 'createItem bi tu choi' }] }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.createProfile('room-1', { name: 'NV A' } as never)).rejects.toThrow('createItem bi tu choi');
  });

  it('nem loi khi createItem khong tra id', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_OK],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({}),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.createProfile('room-1', { name: 'NV A' } as never)).rejects.toThrow(/id/);
  });

  it('doc id tu item long nhau', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_OK],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ item: { _id: 'emp-long-nhau' } }),
    });
    const service = new PrivOSLifecycleService(app as never);

    const created = await service.createProfile('room-1', { name: 'NV A' } as never);
    expect(created._id).toBe('emp-long-nhau');
  });
});
```

1b. Tạo `tests/data-integrity-wiring.spec.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(file, 'utf8');

function slice(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('Task 2: tao ho so that bai khong bao thanh cong', () => {
  const service = source('src/ui/lifecycle/services/PrivOSLifecycleService.ts');
  const dashboard = source('src/ui/lifecycle/LifecycleDashboard.tsx');

  it('service khong con sinh id local', () => {
    expect(service).not.toContain('generateLocalId');
    expect(service).not.toContain('local-');
  });

  it('handleCreateSubmit xoa thong bao dang khoi tao va nem loi tiep cho form', () => {
    const handler = slice(dashboard, 'const handleCreateSubmit', 'const handleMoveProfile');
    const catchBlock = handler.slice(handler.indexOf('catch'));
    expect(catchBlock).toContain('setStatusMsg(null)');
    expect(catchBlock).toMatch(/throw\s+err/);
    // Thong bao thanh cong chi den sau khi createProfile tra ve.
    expect(handler.indexOf('await service.createProfile')).toBeLessThan(handler.indexOf('thành công'));
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts tests/data-integrity-wiring.spec.ts`
Expected: FAIL ở các test sau:
- "nem loi khi Hub khong phan hoi", "nem loi khi createItem tra isError", "nem loi khi createItem khong tra id": hiện đều resolve với id local.
- "doc id tu item long nhau": nhận id `local-…`.
- Cả hai test trong `data-integrity-wiring.spec.ts`.

- [ ] **Step 3: Sửa `createProfile`**

Trong `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, thay:

```ts
        const parsed = JSON.parse(res?.content?.[0]?.text || '{}');
        return {
          ...data,
          _id: parsed._id || parsed.id || this.generateLocalId(),
          status: PrivOSLifecycleService.DEFAULT_STAGE
        };
      }
    } catch (err) {
      console.error('[PrivOSLifecycleService] Connection error when creating profile:', err);
    }

    // Fallback if failed
    return {
      ...data,
      _id: this.generateLocalId(),
      status: PrivOSLifecycleService.DEFAULT_STAGE
    };
  }
```

bằng:

```ts
        // `parseToolResult` turns a tool-level `isError` into a rejection instead of a JSON.parse
        // failure that used to be swallowed into a fake local profile.
        const parsed: any = parseToolResult(res);
        const item = parsed?.item ?? parsed;
        const createdId = item?._id || item?.id;
        if (typeof createdId !== 'string' || !createdId) {
          throw new Error('Hub không trả về id của hồ sơ vừa tạo.');
        }
        return {
          ...data,
          _id: createdId,
          status: PrivOSLifecycleService.DEFAULT_STAGE
        };
      }
    } catch (err) {
      console.error('[PrivOSLifecycleService] Connection error when creating profile:', err);
      // No fallback profile: the caller must show the failure, otherwise HR believes the profile
      // was saved and the card silently disappears on the next refresh.
      throw err;
    }

    throw new Error('Không tìm thấy hoặc không tạo được danh sách "Hồ sơ nhân sự" trong room.');
  }
```

Rồi xoá hẳn phương thức `generateLocalId` (dòng 258-262, gồm comment ngay trên thân hàm):

```ts
  private generateLocalId(): string {
    // Hậu tố ngẫu nhiên là bắt buộc: hai hồ sơ tạo trong cùng một mili-giây (bấm hai lần nhanh,
    // hoặc tạo liên tiếp khi Hub đang lỗi) sẽ nhận cùng `Date.now()` và trùng `_id`.
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
```

Sau khi xoá, chạy `grep -n "generateLocalId\|local-" src/ui/lifecycle/services/PrivOSLifecycleService.ts`. Expected: không có kết quả.

- [ ] **Step 4: Sửa `handleCreateSubmit`**

Trong `src/ui/lifecycle/LifecycleDashboard.tsx`, thay:

```tsx
    // Create via service
    const newProfile = await service.createProfile(roomId, data);
    
    // Optimistic UI update
    setProfiles(prev => [...prev, newProfile]);
    setStatusMsg({ text: `Đã thêm hồ sơ "${data.name}" thành công!`, type: 'success' });
```

bằng:

```tsx
    // Create via service. A failure is re-thrown so CreateDetailedProfileForm shows it; the
    // "đang khởi tạo" banner is cleared so it does not stay up after the error.
    let newProfile: EmployeeProfile;
    try {
      newProfile = await service.createProfile(roomId, data);
    } catch (err) {
      setStatusMsg(null);
      throw err;
    }
    
    // Optimistic UI update
    setProfiles(prev => [...prev, newProfile]);
    setStatusMsg({ text: `Đã thêm hồ sơ "${data.name}" thành công!`, type: 'success' });
```

Nếu `EmployeeProfile` chưa được import trong file thì thêm vào import từ `./types`. Kiểm tra bằng `grep -n "EmployeeProfile" src/ui/lifecycle/LifecycleDashboard.tsx`.

- [ ] **Step 5: Chạy test và kiểm tra kiểu**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts tests/data-integrity-wiring.spec.ts tests/lifecycle-load-passed-candidates.spec.ts tests/lifecycle-update-profile-fields.spec.ts` rồi `npm run typecheck:strict-unused`
Expected: tất cả xanh, không có lỗi kiểu. Chỉ là tín hiệu lúc phát triển.

- [ ] **Step 6: Không commit.**

---

### Task 3: Lưu file đánh giá CV lỗi thì CV chuyển sang `error`

**Files:**
- Modify: `src/ui/pipeline-service.ts:711-716` (khối `try/catch` quanh `createOrUpdateFile(this.app, targetRoomFilePath, ...)` trong `processCV`)
- Test: `tests/data-integrity-wiring.spec.ts`

**Interfaces:**
- Consumes: `processCV` đã có `catch` ngoài cùng gọi `updateStatus({ status: 'error', errorMsg: err.message })` (`pipeline-service.ts:765-768`). Dashboard chỉ đưa CV có `status === 'completed'` vào Kanban (`pipeline-dashboard.tsx:1021-1022`). Không sửa hai chỗ này.

- [ ] **Step 1: Viết test (sẽ fail)**

Thêm vào cuối `tests/data-integrity-wiring.spec.ts`:

```ts
describe('Task 3: luu file danh gia CV that bai thi CV bao loi', () => {
  const pipeline = source('src/ui/pipeline-service.ts');

  it('catch quanh viec luu file MD nem loi thay vi chi console.warn', () => {
    const saveBlock = slice(
      pipeline,
      'await createOrUpdateFile(this.app, targetRoomFilePath, extractedMarkdown);',
      'updateStatus({',
    );
    const catchBlock = saveBlock.slice(saveBlock.indexOf('catch'));
    expect(catchBlock).toContain('throw new Error(');
    expect(catchBlock).not.toContain('console.warn');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/data-integrity-wiring.spec.ts`
Expected: FAIL ở test Task 3, vì `catch` hiện chỉ có `console.warn`.

- [ ] **Step 3: Sửa code**

Trong `src/ui/pipeline-service.ts`, thay:

```ts
        } catch (fileSaveErr: any) {
          console.warn('[Room Files] Lỗi lưu fallback file MD:', fileSaveErr);
        }
```

bằng:

```ts
        } catch (fileSaveErr: any) {
          // Không lưu được file đánh giá thì CV không được coi là hoàn tất: thẻ Kanban và email mời
          // đều đọc file này, còn bản trong bộ nhớ sẽ mất khi tải lại trang. Lỗi này rơi vào catch
          // ngoài cùng của processCV, nơi CV được chuyển sang status 'error'.
          throw new Error(`Không lưu được file đánh giá ${newMdName}: ${fileSaveErr?.message || fileSaveErr}`);
        }
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run tests/data-integrity-wiring.spec.ts tests/pipeline-ai-polling.spec.ts`
Expected: tất cả xanh. Chỉ là tín hiệu lúc phát triển.

- [ ] **Step 5: Không commit.**

---

### Task 4: Hai ứng viên trùng họ tên không ghi đè file đánh giá của nhau

**Files:**
- Modify: `src/ui/pipeline-candidate-name.ts` (thêm 3 hàm ở cuối file)
- Modify: `src/ui/pipeline-service.ts:10` (import) và đoạn ngay trước `if (onLog) onLog(\`[Giữ nguyên File Gốc] AI đã tạo file MD: ${newMdName}\`);` trong `processCV`
- Modify: `src/ui/lifecycle/passed-candidate-parsing.ts:42-52` (`parseCandidateName`), thêm import
- Modify: `src/ui/cv-scored/CVScoredTab.tsx:875` (`onInvite`), thêm import
- Test: `tests/pipeline-candidate-name.spec.ts`, `tests/passed-candidate-parsing.spec.ts`, `tests/data-integrity-wiring.spec.ts`

**Interfaces:**
- Produces (trong `src/ui/pipeline-candidate-name.ts`):
  - `cvFileSuffix(cvFileId: string): string`: trả `'-' + 6 hex cuối viết thường`, hoặc `''` nếu id có ít hơn 6 ký tự hex.
  - `withCvFileSuffix(fileName: string, cvFileId: string): string`: chèn hậu tố trước `.md`. Hàm idempotent: gọi lại trên tên đã có hậu tố thì giữ nguyên.
  - `stripCvFileSuffix(name: string): string`: bỏ hậu tố `-[0-9a-f]{6}` ở cuối tên (tên đã bỏ phần mở rộng).

Ghi chú: tiêu đề thẻ Kanban sẽ có hậu tố, ví dụ `2026-09-23_CV_Nguyen_Van_A-3f9c1a`. Việc tìm file MD theo tiêu đề thẻ vẫn khớp, vì `formatKanbanItemTitle` không đổi phần `A-3f9c1a` (không phải toàn chữ hoa). Thẻ tạo trước khi sửa không có hậu tố, nên chấm lại một CV cũ sẽ tạo file và thẻ mới. Đây là chi phí chuyển đổi một lần, chấp nhận được.

- [ ] **Step 1: Viết test (sẽ fail)**

1a. Thêm vào cuối `tests/pipeline-candidate-name.spec.ts` (sửa dòng import ở đầu file thành `import { buildCandidateMarkdownFileName, cvFileSuffix, formatKanbanItemTitle, stripCvFileSuffix, withCvFileSuffix } from '../src/ui/pipeline-candidate-name';`):

```ts
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
```

1b. Thêm vào cuối `tests/passed-candidate-parsing.spec.ts` (thêm `parseCandidateName` vào import nếu chưa có):

```ts
describe('parseCandidateName bo hau to hex', () => {
  it('khong dua hau to vao ho ten', () => {
    expect(parseCandidateName('2026-09-23_CV_Nguyen_Van_A-3f9c1a.md')).toBe('Nguyen Van A');
    expect(parseCandidateName('2026-09-23_CV_Nguyen_Van_A-3f9c1a')).toBe('Nguyen Van A');
  });
});
```

1c. Thêm vào cuối `tests/data-integrity-wiring.spec.ts`:

```ts
describe('Task 4: ten file danh gia gan hau to CV goc', () => {
  const pipeline = source('src/ui/pipeline-service.ts');
  const cvScored = source('src/ui/cv-scored/CVScoredTab.tsx');

  it('processCV gan hau to truoc khi luu file', () => {
    const suffixAt = pipeline.indexOf('withCvFileSuffix(newMdName, cv._id)');
    expect(suffixAt).toBeGreaterThan(-1);
    expect(suffixAt).toBeLessThan(pipeline.indexOf('await createOrUpdateFile(this.app, targetRoomFilePath'));
  });

  it('onInvite bo hau to truoc khi dung ten', () => {
    const onInvite = slice(cvScored, 'onInvite={(cv, posName) => {', 'setInviteCandidateName(cleanName)');
    expect(onInvite).toContain('stripCvFileSuffix(');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/pipeline-candidate-name.spec.ts tests/passed-candidate-parsing.spec.ts tests/data-integrity-wiring.spec.ts`
Expected: FAIL. Chưa có các hàm hậu tố, `parseCandidateName` trả `'Nguyen Van A 3f9c1a'`, và chưa có wiring.

- [ ] **Step 3: Thêm hàm vào `src/ui/pipeline-candidate-name.ts`**

Thêm vào cuối file:

```ts
/** `-` + six lowercase hex characters, right before the extension. */
const CV_FILE_SUFFIX = /-[0-9a-f]{6}$/i;

/**
 * Stable per-CV suffix: the last 6 hex characters of the raw CV's Room file id. Two candidates with
 * the same full name scored on the same day get different evaluation files; re-scoring the same CV
 * gets the same name, so it overwrites its own file as before. `''` when the id has no 6 hex chars.
 */
export function cvFileSuffix(cvFileId: string): string {
  const hex = (cvFileId || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  return hex.length >= 6 ? `-${hex.slice(-6)}` : '';
}

/** Inserts `cvFileSuffix(cvFileId)` before a trailing `.md`. Idempotent. */
export function withCvFileSuffix(fileName: string, cvFileId: string): string {
  const suffix = cvFileSuffix(cvFileId);
  if (!suffix) return fileName;
  const extStart = /\.md$/i.test(fileName) ? fileName.length - 3 : fileName.length;
  const base = fileName.slice(0, extStart);
  if (base.endsWith(suffix)) return fileName;
  return `${base}${suffix}${fileName.slice(extStart)}`;
}

/** Drops the per-CV suffix from a name that no longer carries its extension. */
export function stripCvFileSuffix(name: string): string {
  return name.replace(CV_FILE_SUFFIX, '');
}
```

- [ ] **Step 4: Gắn hậu tố trong `processCV`**

4a. Dòng 10 của `src/ui/pipeline-service.ts` đổi thành:

```ts
import { buildCandidateMarkdownFileName, extractCandidateNameFromMarkdown, formatKanbanItemTitle, withCvFileSuffix } from './pipeline-candidate-name';
```

4b. Ngay trước dòng `if (onLog) onLog(\`[Giữ nguyên File Gốc] AI đã tạo file MD: ${newMdName}\`);`, chèn:

```ts
      // Hai ứng viên trùng họ tên chấm cùng ngày không được ghi đè file của nhau; chấm lại cùng một
      // CV vẫn ra đúng tên cũ nên ghi đè đúng file của CV đó.
      if (newMdName) newMdName = withCvFileSuffix(newMdName, cv._id);
```

- [ ] **Step 5: Bỏ hậu tố khi tách họ tên**

5a. `src/ui/lifecycle/passed-candidate-parsing.ts`: thêm ở đầu file:

```ts
import { stripCvFileSuffix } from '../pipeline-candidate-name';
```

Trong `parseCandidateName`, đổi hai dòng đầu của chuỗi xử lý:

```ts
  const name = rawTitle
    .replace(/\.(md|pdf|docx|doc)$/i, '')
```

thành:

```ts
  const name = stripCvFileSuffix(rawTitle.replace(/\.(md|pdf|docx|doc)$/i, ''))
```

Các dòng `.replace(...)` phía sau giữ nguyên.

5b. `src/ui/cv-scored/CVScoredTab.tsx`: thêm import `import { stripCvFileSuffix } from '../pipeline-candidate-name';` cạnh các import `../privos-rest`. Trong `onInvite`, đổi:

```tsx
                let cleanName = cv.name.replace(/\.md$/i, '');
```

thành:

```tsx
                let cleanName = stripCvFileSuffix(cv.name.replace(/\.md$/i, ''));
```

- [ ] **Step 6: Chạy test và kiểm tra kiểu**

Run: `npx vitest run tests/pipeline-candidate-name.spec.ts tests/passed-candidate-parsing.spec.ts tests/data-integrity-wiring.spec.ts tests/candidate-selection.spec.ts tests/lifecycle-load-passed-candidates.spec.ts` rồi `npm run typecheck:strict-unused`
Expected: tất cả xanh, không có lỗi kiểu. Chỉ là tín hiệu lúc phát triển.

- [ ] **Step 7: Không commit.**

---

### Task 5: `ensureFolderPath` không tạo thư mục trùng khi tool trả lỗi

**Files:**
- Modify: `src/ui/privos-rest.ts:12` (import) và toàn bộ hàm `ensureFolderPath` (dòng 207-265)
- Test: `tests/ensure-folder-path.spec.ts` (mới)

**Interfaces:**
- Consumes: `readToolList(res, key)` đã có trong cùng file (ném lỗi khi `isError` hoặc không đọc được danh sách); `parseToolResult` từ `@privos_ai/app-react`.
- Produces: `ensureFolderPath(app, channelId, folderNames): Promise<string | undefined>` giữ nguyên chữ ký. Nay ném lỗi khi đọc danh sách thư mục thất bại, khi tạo thư mục trả `isError`, hoặc khi tạo thư mục mà không có `_id`.

Các chỗ gọi đều đã có `try/catch` hoặc báo lỗi lên UI, nên không cần sửa:
- `pipeline-service.ts:189-206` (khối `try` tạo thư mục gốc);
- `pipeline-service.ts:335` (nằm trong `try` của `fetchAvailableJDs`; `cachedJdsFolderId` không bị gán khi lỗi nên lần sau thử lại);
- `privos-rest.ts:279` (`createOrUpdateFile` bọc lỗi rồi ném tiếp);
- `company-home.tsx:95`, `CreateDetailedProfileForm.tsx:223`, `interview-email-template-repository.ts:332`, `PayrollExportService.ts:88` (đều nằm trong `try` hiển thị lỗi).

- [ ] **Step 1: Viết test (sẽ fail)**

Tạo `tests/ensure-folder-path.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ensureFolderPath } from '../src/ui/privos-rest';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/** Tool result the SDK hands back: payload JSON inside `content[0].text`, or a raw `isError` shape. */
function ok(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function folderApp(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      return handler(call.arguments ?? {});
    },
  };
  return { app: app as never, calls };
}

describe('ensureFolderPath', () => {
  it('reuses existing folders without creating any', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': (args) =>
        ok({ folders: args.parentId ? [{ _id: 'jds', name: 'jds' }] : [{ _id: 'root', name: 'hr-miniapp' }] }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp', 'jds'])).resolves.toBe('jds');
    expect(calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('creates only the missing segment', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': (args) => ok({ folders: args.parentId ? [] : [{ _id: 'root', name: 'hr-miniapp' }] }),
      'mcpapp.folders.create': () => ok({ _id: 'new-jds' }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp', 'jds'])).resolves.toBe('new-jds');
    expect(calls.filter((call) => call.name === 'mcpapp.folders.create').map((call) => call.arguments)).toEqual([
      { channelId: 'room-1', name: 'jds', parentId: 'root' },
    ]);
  });

  it('never creates a duplicate folder when the listing returns a tool error', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': () => toolError('Hub tam thoi loi'),
      'mcpapp.folders.create': () => ok({ _id: 'duplicate' }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp'])).rejects.toThrow('Hub tam thoi loi');
    expect(calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('never creates a duplicate folder when the listing is unreadable', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': () => ({ content: [{ type: 'text', text: 'not json' }] }),
      'mcpapp.folders.create': () => ok({ _id: 'duplicate' }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp'])).rejects.toThrow();
    expect(calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('fails instead of returning the parent when a nested create is refused', async () => {
    const { app } = folderApp({
      'mcpapp.folders.getByChannel': (args) => ok({ folders: args.parentId ? [] : [{ _id: 'root', name: 'hr-miniapp' }] }),
      'mcpapp.folders.create': () => toolError('tao thu muc bi tu choi'),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp', 'jds'])).rejects.toThrow('tao thu muc bi tu choi');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/ensure-folder-path.spec.ts`
Expected: 2 test đầu xanh, vì chúng pin hành vi đúng hiện có. 3 test sau FAIL:
- Khi danh sách thư mục báo lỗi hoặc không đọc được, code hiện tại gọi `folders.create`.
- Khi tạo thư mục con bị từ chối, code hiện tại trả id thư mục cha `'root'` thay vì ném lỗi.

- [ ] **Step 3: Sửa import và hàm**

3a. Dòng 12 của `src/ui/privos-rest.ts` đổi thành:

```ts
import { parseToolResult, type McpApp, type RestRequestParams } from '@privos_ai/app-react';
```

3b. Thay toàn bộ hàm `ensureFolderPath` (từ `export async function ensureFolderPath(` đến dấu `}` đóng ngay trước `export async function createOrUpdateFile`) bằng:

```ts
export async function ensureFolderPath(app: McpApp, channelId: string, folderNames: string[]): Promise<string | undefined> {
  let currentParentId: string | undefined = undefined;

  for (const folderName of folderNames) {
    if (!folderName) continue;

    // `readToolList` throws on an `isError` result or an unreadable listing. A failed read must
    // never look like "folder missing": that used to create another copy of the folder on every
    // transient Hub error, splitting files across duplicates.
    const listing = await app.callServerTool({
      name: 'mcpapp.folders.getByChannel',
      arguments: { channelId, limit: 100, ...(currentParentId ? { parentId: currentParentId } : {}) },
    });
    const existingFolder = readToolList(listing, 'folders').find((f: any) => f?.name === folderName);

    if (existingFolder?._id) {
      currentParentId = existingFolder._id;
      continue;
    }

    // `parseToolResult` rejects a refused create. Previously a refused nested create left
    // `currentParentId` on the parent, and the file was written one level too high.
    const created: any = parseToolResult(await app.callServerTool({
      name: 'mcpapp.folders.create',
      arguments: { channelId, name: folderName, ...(currentParentId ? { parentId: currentParentId } : {}) },
    }));
    if (typeof created?._id !== 'string' || !created._id) {
      throw new Error(`Failed to create folder: ${folderName}`);
    }
    currentParentId = created._id;
  }

  return currentParentId;
}
```

- [ ] **Step 4: Chạy test và kiểm tra kiểu**

Run: `npx vitest run tests/ensure-folder-path.spec.ts tests/privos-rest.spec.ts tests/interview-email-template-gateway.spec.ts tests/employee-md-save.spec.ts tests/skill-templates.spec.ts tests/company-context-provider.spec.ts` rồi `npm run typecheck:strict-unused`
Expected: tất cả xanh, không có lỗi kiểu. Nếu một test cũ fail vì stub trả tool result không có `folders`, thì đó là stub dựa vào hành vi nuốt lỗi cũ. Sửa stub để trả `{ folders: [...] }`, ghi `Ruling:` vào ledger, và không nới lỏng code.

- [ ] **Step 5: Không commit.**

---

### Task 6: Chạy toàn bộ và kiểm tra trên môi trường thật (kiểm tra hợp lệ duy nhất)

**Files:** không sửa file nào.

- [ ] **Step 1: Công cụ phát triển (chỉ để tham khảo)**

Run: `npx vitest run` và `npm run typecheck:strict-unused`
Expected: chỉ còn `tests/manifest.spec.ts` fail (đã fail từ trước). Không báo kết quả này là "pass".

- [ ] **Step 2: Người dùng chạy `npm start` và kiểm tra trong room HR**

1. **Task 1:** chạy chấm 2–3 CV. Trong lúc đó mở tab Soạn thảo và gửi một yêu cầu. Kiểm tra:
   - mỗi CV có điểm, lý do và file MD đúng của chính CV đó;
   - văn bản soạn thảo là văn bản, không phải nội dung chấm CV.
2. **Task 2:** kiểm tra hai trường hợp:
   - Tạo hồ sơ nhân sự bình thường: báo thành công và thẻ còn lại sau khi tải lại.
   - Tắt mạng (DevTools > Network > Offline) rồi bấm tạo: form hiện lỗi, không báo "thành công", không có thẻ giả.
3. **Task 3:** (khó giả lập) đọc log lỗi. Nếu lưu file MD lỗi, CV hiện trạng thái lỗi và không có thẻ Kanban tương ứng.
4. **Task 4:** tạo 2 file CV khác nhau cho 2 người cùng họ tên, chấm cùng ngày. Kiểm tra:
   - trong `hr-miniapp/outputs-cv/<tháng>/...` có 2 file MD khác nhau, tên kết thúc bằng `-xxxxxx.md`;
   - bấm gửi email mời thì tên ứng viên không có hậu tố;
   - form tạo hồ sơ từ ứng viên đạt hiển thị họ tên không có hậu tố.
5. **Task 5:** tạo JD, lưu hồ sơ và upload tài liệu công ty như thường. Trong Room Files không xuất hiện thư mục `hr-miniapp` thứ hai.

- [ ] **Step 3: Không commit.**
