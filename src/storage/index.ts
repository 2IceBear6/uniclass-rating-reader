import type { AppConfig, RatingSnapshot, Review, DailyStats } from "../core/types.js";

/**
 * Interface cho công cụ lưu trữ tệp tin cục bộ (Local Storage Engine)
 */
export interface IStorageEngine {
  getAppConfig(appId: string): Promise<AppConfig | null>;
  saveRatingSnapshot(snapshot: RatingSnapshot): Promise<void>;
  saveReviews(reviews: Review[]): Promise<{ savedCount: number; duplicateCount: number }>;
  getReviews(appId: string, options?: { limit?: number; offset?: number }): Promise<Review[]>;
  getDailyStats(appId: string, date: string): Promise<DailyStats | null>;
  saveDailyStats(stats: DailyStats): Promise<void>;
}

/**
 * Lớp triển khai công cụ lưu trữ dữ liệu cục bộ trên Local Filesystem
 */
export class LocalStorageEngine implements IStorageEngine {
  private baseDir: string;

  /**
   * Khởi tạo LocalStorageEngine với đường dẫn thư mục gốc dữ liệu
   * @param baseDir Thư mục dữ liệu (mặc định là "./data")
   */
  constructor(baseDir: string = "./data") {
    this.baseDir = baseDir;
  }

  /**
   * Lấy cấu hình ứng dụng UniClass
   * @param _appId Mã ứng dụng (ví dụ: "uniclass")
   */
  async getAppConfig(_appId: string): Promise<AppConfig | null> {
    return null;
  }

  /**
   * Lưu ảnh chụp điểm rating vào lịch sử
   * @param _snapshot Bản ghi ảnh chụp rating
   */
  async saveRatingSnapshot(_snapshot: RatingSnapshot): Promise<void> {}

  /**
   * Lưu danh sách nhận xét mới với cơ chế khử trùng lặp (Deduplication)
   * @param _reviews Danh sách nhận xét cần lưu
   */
  async saveReviews(_reviews: Review[]): Promise<{ savedCount: number; duplicateCount: number }> {
    return { savedCount: 0, duplicateCount: 0 };
  }

  /**
   * Đọc danh sách nhận xét đã lưu
   * @param _appId Mã ứng dụng
   * @param _options Tùy chọn phân trang
   */
  async getReviews(_appId: string, _options?: { limit?: number; offset?: number }): Promise<Review[]> {
    return [];
  }

  /**
   * Đọc số liệu thống kê ngày
   * @param _appId Mã ứng dụng
   * @param _date Ngày thống kê định dạng YYYY-MM-DD
   */
  async getDailyStats(_appId: string, _date: string): Promise<DailyStats | null> {
    return null;
  }

  /**
   * Lưu số liệu thống kê ngày bằng cơ chế ghi nguyên tử (Atomic write)
   * @param _stats Đối tượng thống kê ngày
   */
  async saveDailyStats(_stats: DailyStats): Promise<void> {}

  /**
   * Lấy đường dẫn cơ sở của thư mục lưu trữ
   */
  getBaseDir(): string {
    return this.baseDir;
  }
}

