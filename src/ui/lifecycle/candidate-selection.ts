import type { PassedCandidate } from './types';

/**
 * Ứng viên đang chọn trong form không còn trong danh sách mới nhất (bị kéo khỏi cột 05/08,
 * hoặc đã có hồ sơ). Danh sách chỉ đáng tin khi lần tải thành công: loadPassedCandidates ném lỗi
 * thay vì trả [] nên một lần poll hỏng không tới được đây.
 */
export function isSelectedCandidateGone(
  selectedId: string,
  candidates: ReadonlyArray<Pick<PassedCandidate, '_id'>>,
): boolean {
  return selectedId !== '' && !candidates.some((candidate) => candidate._id === selectedId);
}
