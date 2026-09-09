/**
 * Extracts 1-2 letter uppercase initials from the employee's name
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface TimelineInfo {
  type: 'probation' | 'tenure' | 'resigned';
  text: string;
  isUrgent?: boolean;
}

/**
 * Calculates probation remaining days or employment tenure
 */
export function calculateTimelineInfo(status: string, startDateStr?: string): TimelineInfo | null {
  if (status === 'Nghỉ việc') {
    return { type: 'resigned', text: 'Đã kết thúc hợp đồng' };
  }

  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return null;

  const now = new Date();
  const diffTime = now.getTime() - start.getTime();
  const elapsedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (status === 'Đang thử việc') {
    const probationLength = 60; // Chuẩn 60 ngày thử việc
    const remainingDays = Math.max(0, probationLength - elapsedDays);
    const isUrgent = remainingDays <= 7;
    return {
      type: 'probation',
      text: remainingDays === 0 ? 'Hết hạn thử việc' : `Còn ${remainingDays} ngày thử việc`,
      isUrgent,
    };
  }

  if (status === 'Chính thức') {
    if (elapsedDays < 30) {
      return { type: 'tenure', text: 'Mới chính thức' };
    }
    const months = Math.floor(elapsedDays / 30);
    if (months < 12) {
      return { type: 'tenure', text: `${months} tháng làm việc` };
    }
    const years = (elapsedDays / 365).toFixed(1);
    return { type: 'tenure', text: `${years} năm cống hiến` };
  }

  return null;
}
