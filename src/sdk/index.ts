import type { Review, DailyStats } from "../core/types.js";
import { LocalStorageEngine } from "../storage/index.js";

/**
 * Tùy chọn khởi tạo Client SDK
 */
export interface UniClassRatingReaderOptions {
  dataDir?: string;
}

/**
 * SDK Client cho phép ứng dụng bên thứ ba tích hợp và đọc dữ liệu UniClass
 */
export class UniClassRatingReader {
  private storage: LocalStorageEngine;

  /**
   * Khởi tạo UniClassRatingReader SDK
   * @param options Tùy chọn thư mục lưu trữ
   */
  constructor(options: UniClassRatingReaderOptions = {}) {
    this.storage = new LocalStorageEngine(options.dataDir ?? "./data");
  }

  /**
   * Lấy danh sách nhận xét của ứng dụng UniClass
   * @param appId Mã ứng dụng ("uniclass")
   * @param options Tùy chọn phân trang
   */
  async getReviews(
    appId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Review[]> {
    return this.storage.getReviews(appId, options);
  }

  /**
   * Lấy thống kê hàng ngày của ứng dụng UniClass
   * @param appId Mã ứng dụng ("uniclass")
   * @param date Ngày thống kê (YYYY-MM-DD)
   */
  async getDailyStats(appId: string, date: string): Promise<DailyStats | null> {
    return this.storage.getDailyStats(appId, date);
  }
}

