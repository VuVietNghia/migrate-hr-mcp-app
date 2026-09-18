# Xoá form hồ sơ khi ứng viên đang chọn bị kéo khỏi cột — Design

Ngày: 2026-09-18. Không commit.

## Vấn đề (đã xác minh trong code)

1. Form tạo hồ sơ đang dùng là `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx`, duy nhất được import ở `LifecycleDashboard.tsx:12`. `CreateProfileForm.tsx` không được import ở đâu, nằm ngoài phạm vi.
2. `LifecycleDashboard.tsx:108-111` poll `refreshCandidates` mỗi 3 giây khi form mở. Ứng viên bị kéo ra khỏi `05_Moi_Phong_Van` hoặc `08_Da_Phong_Van` sẽ biến mất khỏi `passedCandidates`.
3. Form không phản ứng khi điều đó xảy ra:
   - `selectedCandidateId` và dữ liệu đã tự điền vẫn giữ nguyên.
   - Nếu bấm Lưu, `sourceCandidateId` được gửi là `undefined`, vì `selectedCandidate` ở `CreateDetailedProfileForm.tsx:107` không còn tìm thấy.
4. `loadPassedCandidates` (`PrivOSLifecycleService.ts:72-75`) nuốt mọi lỗi và trả về `[]`. Nếu có logic xoá form, một lần poll lỗi sẽ trông giống như "ứng viên biến mất" và xoá nhầm form.

## Thiết kế

### 1. Service không nuốt lỗi
- Bỏ `try/catch` trong `loadPassedCandidates`, để lỗi được ném ra ngoài.
- `refreshCandidates` (`LifecycleDashboard.tsx:74-77`) đã có `catch` và giữ nguyên danh sách cũ.
- Room không có list SCREENING nào vẫn trả về `[]`.

### 2. Hàm thuần `isSelectedCandidateGone`
- Đặt trong file mới `src/ui/lifecycle/candidate-selection.ts`.
- Signature: `isSelectedCandidateGone(selectedId: string, candidates: ReadonlyArray<Pick<PassedCandidate, '_id'>>): boolean`.
- Trả `true` khi `selectedId !== ''` và không có phần tử nào có `_id === selectedId`.

### 3. Reset form (`CreateDetailedProfileForm.tsx`)
- Tách giá trị ban đầu của `formData` ra hàm module-level `createInitialFormData()`. Hàm này dùng cho cả `useState` lẫn lúc reset.
- Lưu tên ứng viên đang chọn vào `selectedCandidateNameRef` trong `handleSelectCandidate`.
- Gắn `idPhotoInputRef` vào `<input id="idPhotoInput" type="file">`.
- `useEffect` theo `[passedCandidates, selectedCandidateId, isSubmitting, isSuccess]`:
  - Bỏ qua khi `isSubmitting` hoặc `isSuccess`. Lúc đang lưu hoặc vừa lưu xong, ứng viên tự rời `availableCandidates` vì đã có hồ sơ.
  - Khi `isSelectedCandidateGone(selectedCandidateId, passedCandidates)`:
    - `setSelectedCandidateId('')`, `setFormData(createInitialFormData())`, `setIdPhoto(null)`.
    - Xoá giá trị của file input.
    - `setErrorMsg('Ứng viên "<tên>" đã bị chuyển khỏi cột Mời phỏng vấn / Đã phỏng vấn nên thông tin đã nhập được xoá.')`.
- Reset toàn bộ form, không chỉ 5 trường tự điền. Các trường nhập tay (CCCD, địa chỉ, ngân hàng...) thuộc về ứng viên vừa bị kéo đi.

## Ngoài phạm vi
`CreateProfileForm.tsx`; chu kỳ polling (giữ 3 giây); `fetchAllLists` trả `[]` khi response rỗng.

## Kiểm thử
- `tests/candidate-selection.spec.ts`: id rỗng, id vẫn còn, id đã biến mất.
- `tests/lifecycle-load-passed-candidates.spec.ts`: `getItems` lỗi thì `loadPassedCandidates` reject.
- `tests/profile-form-candidate-removed.spec.ts`: quét source, xác nhận form gọi `isSelectedCandidateGone`, có chặn theo `isSubmitting` và `isSuccess`, và reset bằng `createInitialFormData()`.
- Chạy `npm test`, `npm run typecheck`; kiểm tra thực tế bằng `npm start`.
