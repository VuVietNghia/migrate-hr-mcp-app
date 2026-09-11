export interface TaskQueueOptions {
  /**
   * Thời gian chờ giữa các lần thực thi task (milliseconds).
   * Mặc định: 1000ms
   */
  delayMs?: number;
}

type Task<T> = () => Promise<T>;

interface QueueItem<T> {
  task: Task<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

/**
 * Hàng đợi xử lý tác vụ bất đồng bộ (In-memory Queue)
 * 
 * - Đảm bảo các tác vụ được thực thi tuần tự (Sequential).
 * - Tránh hiện tượng Spam/Rate Limit bằng cách duy trì thời gian trễ (delayMs) giữa các lần gọi.
 * - Chuẩn Clean Code: Single Responsibility (Chỉ làm nhiệm vụ xếp hàng và chạy).
 */
export class TaskQueue {
  private queue: QueueItem<any>[] = [];
  private isProcessing: boolean = false;
  private readonly delayMs: number;

  constructor(options: TaskQueueOptions = {}) {
    this.delayMs = options.delayMs ?? 1000;
  }

  /**
   * Đẩy một tác vụ vào hàng đợi và trả về Promise.
   * Cấu trúc này giúp người gọi (caller) có thể await kết quả thực tế của task
   * dù task đó có thể bị trì hoãn thực thi.
   * 
   * @param task Hàm bất đồng bộ cần thực thi
   */
  public enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNextTask();
    });
  }

  /**
   * Vòng lặp xử lý nội bộ. Lấy task đầu tiên ra chạy, sau đó chờ `delayMs` và đệ quy.
   */
  private async processNextTask(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();

    if (!item) {
      this.isProcessing = false;
      return;
    }

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      // Đợi hết delayMs trước khi cho phép chạy task tiếp theo
      setTimeout(() => {
        this.isProcessing = false;
        this.processNextTask();
      }, this.delayMs);
    }
  }

  /**
   * Lấy số lượng tác vụ đang còn trong hàng đợi
   */
  public getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Xóa toàn bộ tác vụ đang chờ
   */
  public clear(): void {
    this.queue = [];
  }
}
