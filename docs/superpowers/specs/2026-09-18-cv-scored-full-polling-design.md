# Polling đầy đủ cho tab "CV đã chấm" — Design

Ngày: 2026-09-18. Không commit.

## Vấn đề (đã xác minh trong code)

1. `pollStageMoves` (`src/ui/cv-scored/CVScoredTab.tsx:741-784`) gọi `readBoardStatuses` (`cv-list-reader.ts:41-60`) mỗi 3 giây.
   - `readBoardStatuses` đã tải toàn bộ item của list, nhưng chỉ giữ lại tên stage của từng item.
   - Poll chỉ đổi `status` của những thẻ đang có sẵn trên board (`CVScoredTab.tsx:761-766`).
2. Hệ quả:
   - Thẻ mới tạo trên Hub không hiện ra.
   - Thẻ đã bị xoá trên Hub vẫn nằm lại trên board.
   - Điểm, phân loại, lý do, email, SĐT, cờ "Đã gửi mail phỏng vấn" và `customFields` không được làm mới.
   - Những thay đổi này chỉ hiện ra sau khi `loadData()` chạy lại.
3. Logic chuyển item thành `CVProfile` nằm hẳn trong `loadData` (`CVScoredTab.tsx:633-708`), nên poll không dùng lại được.
4. `customFields` cũ là rủi ro ghi đè dữ liệu. Luồng gửi mail mời (`CVScoredTab.tsx:445-452`) gửi `markInviteMailSent(selectedCVForInvite.customFields)` lên `items.update`. Nếu `customFields` trên board đã cũ, lần ghi này sẽ đè mất thay đổi mà người khác đã lưu trên Hub.
5. Luồng gửi mail mời không đi qua `CVBoardPollingGuard`. Một lần poll bắt đầu trước khi ghi cờ đã gửi mail có thể trả kết quả cũ và đè lên cập nhật lạc quan của `applyInviteSentToBoards`. Hiện tại lỗi này chỉ ảnh hưởng `status`. Khi poll làm mới đủ các field, nó sẽ ảnh hưởng thêm `inviteMailSent` và `customFields`.

## Thiết kế

### 1. `mapItemsToCVProfiles` (`src/ui/cv-scored/cv-item-mapper.ts`, mới)
- Signature: `mapItemsToCVProfiles(items: ReadonlyArray<any>, fieldsMap: Readonly<Record<string, string>>, stagesMap: Readonly<Record<string, string>>): MappedBoardCVs`.
- `MappedBoardCVs = { cvs: CVProfile[]; stagesMap: Record<string, string> }`.
- Thân hàm là nguyên văn logic ở `CVScoredTab.tsx:633-708`, với `fMap` đổi thành `fieldsMap`.
- `stagesMap` được sao chép trước khi dùng. Stage đoán theo phân loại cho `stageId` lạ ghi vào bản sao, không sửa đầu vào. Các item phía sau trong cùng lần gọi thấy được stage đã đoán, giống hành vi hiện tại.

### 2. So sánh (`src/ui/cv-scored/cv-poll-diff.ts`, mới)
- `areCvListsEqual(a, b)`: bằng nhau khi cùng độ dài, cùng `_id` theo đúng thứ tự, và cùng `status`, `name`, `score`, `category`, `reason`, `email`, `sdt`, `inviteMailSent`. `customFields` so bằng `JSON.stringify`.
- `areStageMapsEqual(a, b)`: cùng tập key và cùng giá trị ở từng key.

### 3. Wiring (`CVScoredTab.tsx`)
- `CVBoardData` thêm `fieldsMap: Record<string, string>`. `loadData` lưu `fMap` vào đó và dùng `mapItemsToCVProfiles(items, fMap, sMap)`.
- `pollStageMoves` đổi tên thành `pollBoards`. Mỗi board được xử lý như sau:
  - Tải item bằng `fetchScreeningListItems(app, board.listId)`.
  - Dựng lại thẻ bằng `mapItemsToCVProfiles(items, board.fieldsMap, board.stagesMap)`.
  - Chỉ thay board khi `areCvListsEqual` hoặc `areStageMapsEqual` trả về false.
  - Khi không board nào thay đổi, trả lại đúng mảng `previous` để React không re-render.
  - Toàn bộ phần kiểm tra của `CVBoardPollingGuard` giữ nguyên.
- Luồng gửi mail mời: bọc đoạn từ `items.update` tới `setBoards(applyInviteSentToBoards(...))` bằng `beginMove(cvId)` / `endMove(cvId)`, rồi gọi `pollBoards(true)`.
- Xoá `readBoardStatuses` và 3 test của nó, vì không còn chỗ nào dùng.
- `selectedCVForDetail` và `selectedCVForInvite` giữ nguyên. Popup đang mở tiếp tục hiển thị snapshot của thẻ lúc bấm mở.

## Ngoài phạm vi
- List SCREENING mới tạo: chỉ hiện sau khi `loadData` chạy lại.
- Chu kỳ poll giữ 3 giây.
- `CVBoardPollingGuard` giữ nguyên.

## Kiểm thử
- Vitest (`tests/cv-item-mapper.spec.ts`, `tests/cv-poll-diff.spec.ts`, `tests/cv-scored-full-polling.spec.ts`) chỉ là công cụ lúc phát triển. Theo quy tắc của dự án, kết quả vitest, typecheck và build không được tính là pass.
- Kiểm tra hợp lệ duy nhất: chạy `npm start`, mở tab "CV đã chấm", rồi thực hiện các bước sau trên Hub. Board phải tự cập nhật trong khoảng 3 giây.
  - Thêm một thẻ.
  - Xoá một thẻ.
  - Sửa điểm của một thẻ.
  - Chuyển cột một thẻ.
