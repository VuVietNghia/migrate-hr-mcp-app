# Cột "Đầu vào" trên Kanban CV — Design

Ngày: 2026-09-18. Phương án đã chốt: A (chỉ hiển thị cột + phát hiện thẻ kẹt). Không commit.

## Vấn đề (đã xác minh trong code)

1. `batchCreateItems` luôn đặt thẻ ở stage đầu tiên `01_Dau_Vao` (`src/ui/pipeline-service.ts:1158`), sau đó vòng lặp chuyển từng thẻ sang đúng stage.
   Vòng lặp gọi thẳng `this.app.callServerTool({ name: 'mcpapp.lists.moveItemToStage' })`. Lời gọi thẳng resolve bình thường khi Hub từ chối (`isError: true`), nên `catch` không bắt được. Log cuối vẫn báo "vào đúng stage".
2. `getCVColumnsForStages` (`src/ui/cv-scored/kanban-stages.ts:22-26`) không có cột `01_Dau_Vao`. Board lọc thẻ theo `cv.status === col.status` (`src/ui/cv-scored/CVScoredTab.tsx:283`), nên thẻ ở `01_Dau_Vao` không hiển thị ở đâu cả.
3. Luồng đọc tự gán `01_Dau_Vao` khi không xác định được stage (`CVScoredTab.tsx:694`, `:701`), kể cả khi list không có stage đó.

## Thiết kế

### 1. Cột Đầu vào (`kanban-stages.ts`)
- Hằng số riêng `INBOX_COLUMN = { status: '01_Dau_Vao', label: 'Đầu vào', color: '#6b7280' }`. Không thêm vào `NEW_LIST_COLUMNS`, vì `LEGACY_LIST_COLUMNS` dựng bằng `NEW_LIST_COLUMNS.slice(0, 4)`.
- `getCVColumnsForStages(stagesMap, hasInboxCards = false)`: đặt `INBOX_COLUMN` lên đầu khi `Object.values(stagesMap)` chứa `'01_Dau_Vao'` hoặc khi `hasInboxCards === true`. Ngoài hai trường hợp đó, kết quả giữ nguyên như hiện tại.
- `getCVColumnLabel(stagesMap, status)` giữ nguyên signature. Với `status === '01_Dau_Vao'` hàm trả về `'Đầu vào'`, kể cả khi list không có stage đó.
- Kéo thẻ vào cột Đầu vào trên list không có stage `01_Dau_Vao` thì không có tác dụng. `handleMove` đã tự dừng khi không có `stageId` (`CVScoredTab.tsx:809`).

### 2. Wiring (`CVScoredTab.tsx:228`)
`getCVColumnsForStages(board.stagesMap, board.cvs.some((cv) => cv.status === '01_Dau_Vao'))`.

### 3. Phát hiện thẻ kẹt (`pipeline-service.ts:1158-1176`)
- Chuyển cột bằng `moveCVToStage` (`src/ui/cv-scored/cv-stage-move.ts`). Hàm này ném lỗi khi Hub từ chối.
- Gom tiêu đề các thẻ không chuyển được. Thẻ trong danh sách gửi lên mà `batchRes.items[i]?._id` không có cũng tính là không chuyển được.
- Không có thẻ kẹt: giữ nguyên câu log thành công hiện tại.
- Có thẻ kẹt: log `[Kanban] Đã tạo List "<listName>" và lưu <N> thẻ; <M> thẻ chưa chuyển được sang cột đích, đang nằm ở cột "Đầu vào": <tiêu đề, cách nhau bởi ", ">`. Không ném lỗi.

## Ngoài phạm vi
`getTargetStageName` và cách xếp category; CV chấm lỗi (phương án B); cột `04_Phone_Screening`; Hub API; `pipeline-dashboard.tsx`.

## Kiểm thử
- `tests/kanban-stages.spec.ts`: 5 trường hợp của cột Đầu vào và label.
- `tests/cv-kanban-inbox-column.spec.ts`: quét source, xác nhận `CVScoredTab.tsx` truyền `hasInboxCards`.
- `tests/pipeline-kanban-stage-move.spec.ts`:
  - Hub trả `isError` cho một lần chuyển cột → log nêu thẻ kẹt.
  - Mọi lần chuyển đều thành công → log cũ.
  - `batchRes.items` thiếu phần tử → thẻ tương ứng được báo kẹt.
  - Quét source: không còn gọi thẳng `'mcpapp.lists.moveItemToStage'`.
- Chạy `npm test`, `npm run typecheck`, `npm run build`; kiểm tra thực tế bằng `npm start`.
