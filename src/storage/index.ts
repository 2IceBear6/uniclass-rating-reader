import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig, RatingSnapshot, Review, DailyStats } from "../core/types.js";
import { AppConfigSchema, DailyStatsSchema } from "../core/schemas.js";
import { assertUniClassApp } from "../core/utils.js";
import { FileLockManager } from "./lock.js";
import { atomicWriteJson, readJsonSafe } from "./atomic.js";
import { safeAppendJsonl, readJsonlFaultTolerant } from "./jsonl.js";
import { ReviewDeduplicator } from "./deduplicator.js";
import { createAppDataBackup } from "./backup.js";

export * from "./lock.js";
export * from "./atomic.js";
export * from "./jsonl.js";
export * from "./deduplicator.js";
export * from "./backup.js";

/**
 * Interface công cụ lưu trữ dữ liệu tệp tin cục bộ (Local Storage Engine)
 */
export interface IStorageEngine {
  getAppConfig(appId: string): Promise<AppConfig | null>;
  saveAppConfig(config: AppConfig): Promise<void>;
  saveRatingSnapshot(snapshot: RatingSnapshot): Promise<void>;
  getRatingSnapshots(
    appId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<RatingSnapshot[]>;
  saveReviews(
    appId: string,
    reviews: Review[]
  ): Promise<{ savedCount: number; duplicateCount: number; newReviews: Review[] }>;
  getReviews(
    appId: string,
    options?: {
      limit?: number;
      offset?: number;
      platform?: "android" | "ios";
      sentiment?: "positive" | "neutral" | "negative";
    }
  ): Promise<Review[]>;
  getDailyStats(appId: string, date: string): Promise<DailyStats | null>;
  listDailyStats(appId: string): Promise<DailyStats[]>;
  saveDailyStats(stats: DailyStats): Promise<void>;
  appendCollectionLog(logRecord: Record<string, unknown>): Promise<void>;
  createBackup(appId: string): Promise<string>;
}

/**
 * Lớp triển khai công cụ lưu trữ dữ liệu cục bộ trên Local Filesystem (Zero-Database)
 */
export class LocalStorageEngine implements IStorageEngine {
  private baseDir: string;
  private deduplicators: Map<string, ReviewDeduplicator> = new Map();

  /**
   * Khởi tạo LocalStorageEngine với đường dẫn thư mục gốc dữ liệu
   * @param baseDir Thư mục dữ liệu (mặc định là "./data")
   */
  constructor(baseDir: string = "./data") {
    this.baseDir = path.resolve(baseDir);
  }

  /**
   * Lấy đường dẫn thư mục của một ứng dụng cụ thể (chỉ cho phép UniClass)
   * @param appId Mã ứng dụng ("uniclass")
   */
  private getAppDir(appId: string): string {
    assertUniClassApp(appId);
    return path.join(this.baseDir, "apps", appId);
  }

  /**
   * Tạo thể hiện FileLockManager cho thư mục ứng dụng
   * @param appId Mã ứng dụng
   */
  private getLockManager(appId: string): FileLockManager {
    return new FileLockManager(this.getAppDir(appId));
  }

  /**
   * Nạp hoặc lấy bộ khử trùng lặp trong bộ nhớ cho một ứng dụng
   * @param appId Mã ứng dụng
   */
  private async getDeduplicator(appId: string): Promise<ReviewDeduplicator> {
    let dedup = this.deduplicators.get(appId);
    if (!dedup) {
      const reviewsPath = path.join(this.getAppDir(appId), "reviews.jsonl");
      const existingReviews = await readJsonlFaultTolerant<Review>(reviewsPath);
      dedup = new ReviewDeduplicator(existingReviews);
      this.deduplicators.set(appId, dedup);
    }
    return dedup;
  }

  /**
   * Đọc cấu hình ứng dụng UniClass từ tệp app.json
   * @param appId Mã ứng dụng (ví dụ: "uniclass")
   */
  async getAppConfig(appId: string): Promise<AppConfig | null> {
    const configPath = path.join(this.getAppDir(appId), "app.json");
    const data = await readJsonSafe<AppConfig>(configPath);
    if (!data) return null;
    return AppConfigSchema.parse(data);
  }

  /**
   * Lưu cấu hình ứng dụng UniClass vào tệp app.json bằng cơ chế ghi nguyên tử
   * @param config Đối tượng cấu hình ứng dụng
   */
  async saveAppConfig(config: AppConfig): Promise<void> {
    const validated = AppConfigSchema.parse(config);
    const configPath = path.join(this.getAppDir(config.id), "app.json");
    const lock = this.getLockManager(config.id);

    await lock.withLock(async () => {
      await atomicWriteJson(configPath, validated);
    });
  }

  /**
   * Lưu ảnh chụp điểm rating vào rating-history.jsonl bằng cơ chế safe append
   * @param snapshot Bản ghi ảnh chụp rating
   */
  async saveRatingSnapshot(snapshot: RatingSnapshot): Promise<void> {
    const historyPath = path.join(this.getAppDir(snapshot.appId), "rating-history.jsonl");
    const lock = this.getLockManager(snapshot.appId);

    await lock.withLock(async () => {
      await safeAppendJsonl(historyPath, [snapshot]);
    });
  }

  /**
   * Đọc lịch sử snapshot rating từ rating-history.jsonl
   * @param appId Mã ứng dụng
   * @param options Tùy chọn phân trang (limit, offset)
   */
  async getRatingSnapshots(
    appId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<RatingSnapshot[]> {
    const historyPath = path.join(this.getAppDir(appId), "rating-history.jsonl");
    return readJsonlFaultTolerant<RatingSnapshot>(historyPath, options);
  }

  /**
   * Lưu danh sách nhận xét mới với cơ chế Khử Trùng Lặp (Deduplication) và Safe Append
   * Chỉ những nhận xét chưa từng xuất hiện mới được lưu vào reviews.jsonl
   * @param appId Mã ứng dụng
   * @param reviews Danh sách nhận xét cần lưu
   * @returns Thống kê số lượng bản ghi mới đã lưu và số lượng bản ghi trùng
   */
  async saveReviews(
    appId: string,
    reviews: Review[]
  ): Promise<{ savedCount: number; duplicateCount: number; newReviews: Review[] }> {
    if (reviews.length === 0) {
      return { savedCount: 0, duplicateCount: 0, newReviews: [] };
    }

    const lock = this.getLockManager(appId);

    return lock.withLock(async () => {
      const dedup = await this.getDeduplicator(appId);
      const { newReviews, duplicateCount } = dedup.filterNewReviews(reviews);

      if (newReviews.length > 0) {
        const reviewsPath = path.join(this.getAppDir(appId), "reviews.jsonl");
        await safeAppendJsonl(reviewsPath, newReviews);
      }

      return {
        savedCount: newReviews.length,
        duplicateCount,
        newReviews,
      };
    });
  }

  /**
   * Đọc danh sách nhận xét đã lưu từ reviews.jsonl có hỗ trợ phân trang và bộ lọc theo ngày, platform, sentiment
   * @param appId Mã ứng dụng
   * @param options Tùy chọn lọc theo platform, sentiment, ngày đăng (date, startDate, endDate) và phân trang
   */
  async getReviews(
    appId: string,
    options?: {
      limit?: number;
      offset?: number;
      platform?: "android" | "ios";
      sentiment?: "positive" | "neutral" | "negative";
      date?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<Review[]> {
    const reviewsPath = path.join(this.getAppDir(appId), "reviews.jsonl");
    const allReviews = await readJsonlFaultTolerant<Review>(reviewsPath);

    // Áp dụng bộ lọc nếu có
    let filtered = allReviews;
    if (options?.platform) {
      filtered = filtered.filter((r) => r.platform === options.platform);
    }
    if (options?.sentiment) {
      filtered = filtered.filter((r) => r.sentiment === options.sentiment);
    }
    if (options?.date) {
      filtered = filtered.filter((r) => {
        const d = r.createdAt ? r.createdAt.slice(0, 10) : "";
        return d === options.date;
      });
    }
    if (options?.startDate) {
      filtered = filtered.filter((r) => {
        const d = r.createdAt ? r.createdAt.slice(0, 10) : "";
        return d >= options.startDate!;
      });
    }
    if (options?.endDate) {
      filtered = filtered.filter((r) => {
        const d = r.createdAt ? r.createdAt.slice(0, 10) : "";
        return d <= options.endDate!;
      });
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Đọc số liệu thống kê ngày từ daily-stats/YYYY-MM-DD.json
   * @param appId Mã ứng dụng
   * @param date Ngày thống kê (định dạng YYYY-MM-DD)
   */
  async getDailyStats(appId: string, date: string): Promise<DailyStats | null> {
    const statsPath = path.join(this.getAppDir(appId), "daily-stats", `${date}.json`);
    const data = await readJsonSafe<DailyStats>(statsPath);
    if (!data) return null;
    return DailyStatsSchema.parse(data);
  }

  /**
   * Đọc danh sách tất cả các file thống kê ngày đã lưu trong thư mục daily-stats
   * @param appId Mã định danh ứng dụng ("uniclass")
   * @returns Danh sách các đối tượng DailyStats sắp xếp từ ngày mới nhất
   */
  async listDailyStats(appId: string): Promise<DailyStats[]> {
    const dir = path.join(this.getAppDir(appId), "daily-stats");
    try {
      const files = await fs.promises.readdir(dir);
      const jsonFiles = files
        .filter((f) => f.endsWith(".json") && !f.startsWith("."))
        .sort()
        .reverse();

      const list: DailyStats[] = [];
      for (const file of jsonFiles) {
        const filePath = path.join(dir, file);
        const data = await readJsonSafe<DailyStats>(filePath);
        if (data) {
          try {
            list.push(DailyStatsSchema.parse(data));
          } catch {
            // Bỏ qua file lỗi định dạng
          }
        }
      }
      return list;
    } catch {
      return [];
    }
  }

  /**
   * Lưu số liệu thống kê ngày bằng cơ chế ghi nguyên tử (Atomic Write)
   * @param stats Đối tượng thống kê ngày
   */
  async saveDailyStats(stats: DailyStats): Promise<void> {
    const validated = DailyStatsSchema.parse(stats);
    const statsPath = path.join(this.getAppDir(stats.appId), "daily-stats", `${stats.date}.json`);
    const lock = this.getLockManager(stats.appId);

    await lock.withLock(async () => {
      await atomicWriteJson(statsPath, validated);
    });
  }

  /**
   * Ghi nối nhật ký một lần thu thập vào thư mục collection-logs
   * @param logRecord Bản ghi nhật ký
   */
  async appendCollectionLog(logRecord: Record<string, unknown>): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(this.baseDir, "collection-logs", `${today}-collection.jsonl`);
    await safeAppendJsonl(logPath, [logRecord]);
  }

  /**
   * Tạo bản sao lưu an toàn toàn bộ dữ liệu của ứng dụng
   * @param appId Mã ứng dụng
   * @returns Đường dẫn thư mục bản sao lưu
   */
  async createBackup(appId: string): Promise<string> {
    const lock = this.getLockManager(appId);
    return lock.withLock(async () => {
      return createAppDataBackup(this.baseDir, appId);
    });
  }

  /**
   * Lấy đường dẫn thư mục cơ sở dữ liệu
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Dọn dẹp chỉ mục bộ nhớ đệm (thường dùng trong unit tests)
   */
  clearCache(): void {
    this.deduplicators.clear();
  }
}
