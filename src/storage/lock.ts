import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Tùy chọn cấu hình cho FileLockManager
 */
export interface FileLockOptions {
  ttlMs?: number; // Thời gian sống tối đa của lock (mặc định 30,000ms = 30s)
  retryIntervalMs?: number; // Thời gian chờ giữa các lần thử lại (mặc định 50ms)
  timeoutMs?: number; // Thời gian tối đa chờ nhận lock (mặc định 10,000ms = 10s)
}

/**
 * Quản lý khóa tệp tin (File Lock) nhằm ngăn chặn xung đột khi nhiều tiến trình ghi đồng thời
 */
export class FileLockManager {
  private lockPath: string;
  private ttlMs: number;
  private retryIntervalMs: number;
  private timeoutMs: number;
  private isLockedBySelf: boolean = false;

  /**
   * Khởi tạo FileLockManager
   * @param targetDirectory Thư mục cần khóa bảo vệ
   * @param lockFileName Tên tệp khóa (mặc định: ".storage.lock")
   * @param options Tùy chọn cấu hình lock
   */
  constructor(
    targetDirectory: string,
    lockFileName: string = ".storage.lock",
    options: FileLockOptions = {}
  ) {
    this.lockPath = path.join(targetDirectory, lockFileName);
    this.ttlMs = options.ttlMs ?? 30000;
    this.retryIntervalMs = options.retryIntervalMs ?? 50;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  /**
   * Kiểm tra và giải phóng khóa chết (Stale lock) nếu quá thời hạn TTL
   */
  private async cleanStaleLock(): Promise<void> {
    try {
      const stats = await fs.stat(this.lockPath);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs > this.ttlMs) {
        // Lock đã quá hạn (tiến trình trước bị tắt đột ngột), tiến hành dọn dẹp an toàn
        await fs.unlink(this.lockPath).catch(() => {});
      }
    } catch {
      // File lock không tồn tại, không cần làm gì
    }
  }

  /**
   * Yêu cầu nhận khóa (Acquire lock). Chờ với backoff nếu file đang bị khóa
   * @returns true nếu nhận khóa thành công
   */
  async acquire(): Promise<boolean> {
    const targetDir = path.dirname(this.lockPath);
    await fs.mkdir(targetDir, { recursive: true });

    const startTime = Date.now();

    while (Date.now() - startTime < this.timeoutMs) {
      await this.cleanStaleLock();

      try {
        // Cờ 'wx' đảm bảo thao tác tạo file là nguyên tử; thất bại nếu file đã tồn tại
        const handle = await fs.open(this.lockPath, "wx");
        const lockContent = JSON.stringify({
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
          ttlMs: this.ttlMs,
        });
        await handle.writeFile(lockContent, "utf8");
        await handle.close();

        this.isLockedBySelf = true;
        return true;
      } catch (err: unknown) {
        const nodeErr = err as { code?: string };
        if (nodeErr.code === "EEXIST") {
          // File lock đang được giữ bởi tiến trình khác, chờ một khoảng rồi thử lại
          await new Promise((resolve) => setTimeout(resolve, this.retryIntervalMs));
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `Không thể nhận file lock sau ${this.timeoutMs}ms tại đường dẫn: ${this.lockPath}`
    );
  }

  /**
   * Giải phóng khóa (Release lock)
   */
  async release(): Promise<void> {
    if (!this.isLockedBySelf) {
      return;
    }

    try {
      await fs.unlink(this.lockPath);
    } catch {
      // Bỏ qua lỗi nếu file lock đã bị xóa
    } finally {
      this.isLockedBySelf = false;
    }
  }

  /**
   * Thực thi một hàm tác vụ trong phạm vi được bảo vệ bởi File Lock
   * @param task Hàm tác vụ cần thực thi an toàn
   * @returns Kết quả trả về của tác vụ
   */
  async withLock<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      await this.release();
    }
  }
}
