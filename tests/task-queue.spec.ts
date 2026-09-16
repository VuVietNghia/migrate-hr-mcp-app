import { describe, expect, it } from 'vitest';
import { TaskQueue, TaskQueueClearedError } from '../src/services/mail/task-queue';

describe('TaskQueue', () => {
  it('chay tuan tu theo dung thu tu enqueue', async () => {
    const queue = new TaskQueue({ delayMs: 0 });
    const order: number[] = [];

    await Promise.all([
      queue.enqueue(async () => { order.push(1); }),
      queue.enqueue(async () => { order.push(2); }),
      queue.enqueue(async () => { order.push(3); }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('tra ve gia tri that cua task cho nguoi goi', async () => {
    const queue = new TaskQueue({ delayMs: 0 });
    await expect(queue.enqueue(async () => 'ket qua')).resolves.toBe('ket qua');
  });

  it('day loi cua task ve cho nguoi goi thay vi nuot', async () => {
    const queue = new TaskQueue({ delayMs: 0 });
    await expect(queue.enqueue(async () => { throw new Error('task hong'); }))
      .rejects.toThrow('task hong');
  });

  it('clear() reject moi item dang cho thay vi de chung treo vinh vien', async () => {
    const queue = new TaskQueue({ delayMs: 50 });

    // Task dau chiem cho xu ly, hai task sau nam lai trong hang doi.
    const running = queue.enqueue(async () => 'xong');
    const pendingA = queue.enqueue(async () => 'khong bao gio chay');
    const pendingB = queue.enqueue(async () => 'khong bao gio chay');

    queue.clear();

    await expect(pendingA).rejects.toBeInstanceOf(TaskQueueClearedError);
    await expect(pendingB).rejects.toBeInstanceOf(TaskQueueClearedError);
    await expect(running).resolves.toBe('xong');
  });

  it('clear() dua getPendingCount ve 0', async () => {
    const queue = new TaskQueue({ delayMs: 50 });
    const running = queue.enqueue(async () => 'xong');
    const dropped = queue.enqueue(async () => 'bi bo');

    queue.clear();
    expect(queue.getPendingCount()).toBe(0);

    await expect(dropped).rejects.toBeInstanceOf(TaskQueueClearedError);
    await running;
  });
});
