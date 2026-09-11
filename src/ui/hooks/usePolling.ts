import { useEffect, useRef } from 'react';

export interface UsePollingOptions {
  /**
   * Khoảng thời gian giữa các lần thăm dò (milliseconds).
   * Mặc định: 1000 (1 giây)
   */
  interval?: number;

  /**
   * Cờ điều kiện để kích hoạt polling.
   * Chỉ chạy khi `enabled: true`. Khi chuyển sang `false` sẽ tự động hủy timer.
   * Mặc định: true
   */
  enabled?: boolean;

  /**
   * Có thực thi callback ngay lập tức khi vừa kích hoạt không.
   * Mặc định: true
   */
  immediate?: boolean;

  /**
   * Tự động tạm dừng polling khi người dùng chuyển sang tab trình duyệt khác để tiết kiệm CPU & Pin.
   * Mặc định: true
   */
  pauseOnTabHidden?: boolean;
}

/**
 * Hook polling dùng chung chuẩn Clean Code & Zero Boilerplate:
 * - Đóng gói hoàn chỉnh logic chu kỳ thời gian (Timer lifecycle).
 * - Chống chồng chéo request async (Chờ request trước hoàn tất mới đếm tiếp).
 * - Tự dọn dẹp timer khi component unmount hoặc khi `enabled: false`.
 * - Tương thích mọi tính năng cần polling trong tương lai chỉ với 1 dòng gọi hook.
 *
 * @example
 * ```tsx
 * // Polling mỗi 1s khi form mở
 * usePolling(fetchNewData, { enabled: isFormOpen, interval: 1000 });
 * ```
 */
export function usePolling(
  callback: () => Promise<void> | void,
  options: UsePollingOptions = {}
): void {
  const {
    interval = 1000,
    enabled = true,
    immediate = true,
    pauseOnTabHidden = true,
  } = options;

  // Giữ tham chiếu callback mới nhất để tránh closure cũ mà không trigger re-subscribe effect
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isExecuting = false;

    const isTabHidden = () => pauseOnTabHidden
      && typeof document !== 'undefined'
      && document.hidden;

    const clearScheduledCycle = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleNextCycle = () => {
      if (!isMounted || isTabHidden()) return;
      clearScheduledCycle();
      timerId = setTimeout(executeCycle, interval);
    };

    const executeCycle = async () => {
      if (!isMounted || isTabHidden() || isExecuting) return;
      isExecuting = true;

      try {
        await savedCallback.current();
      } catch (error) {
        console.error('[usePolling] Lỗi trong chu kỳ polling:', error);
      } finally {
        isExecuting = false;
        // Chỉ kích hoạt lần tiếp theo SAU KHI lần trước đã xử lý xong
        scheduleNextCycle();
      }
    };

    const handleVisibilityChange = () => {
      if (isTabHidden() || isExecuting) return;
      clearScheduledCycle();
      void executeCycle();
    };

    if (pauseOnTabHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (immediate && !isTabHidden()) {
      executeCycle();
    } else {
      scheduleNextCycle();
    }

    return () => {
      isMounted = false;
      clearScheduledCycle();
      if (pauseOnTabHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [enabled, interval, immediate, pauseOnTabHidden]);
}
