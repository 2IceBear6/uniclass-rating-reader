import { request } from "undici";
import type {
  AppConfig,
  Review,
  RatingSnapshot,
  DailyStats,
  AppOverview,
  CollectionCycleResult,
} from "../core/types.js";
import { LocalStorageEngine } from "../storage/index.js";
import { AnalyticsEngine } from "../analytics/index.js";
import { CollectorService } from "../collector/collector.js";
import type { SchedulerStatus } from "../collector/scheduler.js";
import { assertUniClassApp } from "../core/utils.js";

/**
 * Tùy chọn cấu hình cho UniClassRatingReader SDK Client
 */
export interface UniClassRatingReaderOptions {
  dataDir?: string; // Thư mục dữ liệu cục bộ (chế độ Local Storage)
  apiUrl?: string; // Địa chỉ base URL của Fastify REST API (chế độ Remote API, ví dụ: "http://localhost:3000")
}

/**
 * SDK Client UniClass Rating Reader dành cho ứng dụng Node.js
 * Hỗ trợ hai chế độ hoạt động:
 * 1. Chế độ Trực tiếp (Local Filesystem Mode - Không cần API server chạy ngầm)
 * 2. Chế độ Máy khách HTTP (Remote REST API Mode)
 */
export class UniClassRatingReader {
  private isRemote: boolean;
  private apiUrl?: string;
  private storage?: LocalStorageEngine;
  private analytics?: AnalyticsEngine;
  private collector?: CollectorService;

  /**
   * Khởi tạo UniClassRatingReader SDK
   * @param options Tùy chọn thư mục lưu trữ hoặc địa chỉ API server
   */
  constructor(options: UniClassRatingReaderOptions = {}) {
    if (options.apiUrl) {
      this.isRemote = true;
      this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    } else {
      this.isRemote = false;
      this.storage = new LocalStorageEngine(options.dataDir ?? "./data");
      this.analytics = new AnalyticsEngine({ storage: this.storage });
      this.collector = new CollectorService({
        storage: this.storage,
        analyticsEngine: this.analytics,
      });
    }
  }

  /**
   * Lấy cấu hình ứng dụng UniClass
   * @param appId Mã định danh ứng dụng (mặc định: "uniclass")
   */
  async getAppConfig(appId: string = "uniclass"): Promise<AppConfig | null> {
    assertUniClassApp(appId);
    if (this.isRemote) {
      const res = await request(`${this.apiUrl}/api/apps/${appId}`);
      if (res.statusCode === 404) return null;
      return (await res.body.json()) as AppConfig;
    }
    return this.storage!.getAppConfig(appId);
  }

  /**
   * Lấy lịch sử ảnh chụp đánh giá rating snapshots
   * @param appId Mã ứng dụng (mặc định: "uniclass")
   * @param options Tùy chọn phân trang
   */
  async getRatingHistory(
    appId: string = "uniclass",
    options?: { limit?: number; offset?: number }
  ): Promise<RatingSnapshot[]> {
    assertUniClassApp(appId);
    if (this.isRemote) {
      const query = new URLSearchParams();
      if (options?.limit) query.set("limit", String(options.limit));
      if (options?.offset) query.set("offset", String(options.offset));
      const url = `${this.apiUrl}/api/apps/${appId}/ratings?${query.toString()}`;
      const res = await request(url);
      const data = (await res.body.json()) as { data: RatingSnapshot[] };
      return data.data ?? [];
    }
    return this.storage!.getRatingSnapshots(appId, options);
  }

  /**
   * Lấy danh sách nhận xét người dùng của ứng dụng
   * @param appId Mã ứng dụng (mặc định: "uniclass")
   * @param options Tùy chọn phân trang, lọc theo platform, sentiment và ngày tháng (date, startDate, endDate)
   */
  async getReviews(
    appId: string = "uniclass",
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
    assertUniClassApp(appId);
    if (this.isRemote) {
      const query = new URLSearchParams();
      if (options?.limit) query.set("limit", String(options.limit));
      if (options?.offset) query.set("offset", String(options.offset));
      if (options?.platform) query.set("platform", options.platform);
      if (options?.sentiment) query.set("sentiment", options.sentiment);
      if (options?.date) query.set("date", options.date);
      if (options?.startDate) query.set("startDate", options.startDate);
      if (options?.endDate) query.set("endDate", options.endDate);
      const url = `${this.apiUrl}/api/apps/${appId}/reviews?${query.toString()}`;
      const res = await request(url);
      const data = (await res.body.json()) as { data: Review[] };
      return data.data ?? [];
    }
    return this.storage!.getReviews(appId, options);
  }

  /**
   * Lấy số liệu thống kê hàng ngày của ứng dụng
   * @param appId Mã ứng dụng (mặc định: "uniclass")
   * @param date Ngày thống kê định dạng YYYY-MM-DD (mặc định là hôm nay)
   */
  async getDailyStats(
    appId: string = "uniclass",
    date?: string
  ): Promise<DailyStats | null> {
    assertUniClassApp(appId);
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    if (this.isRemote) {
      const res = await request(`${this.apiUrl}/api/apps/${appId}/analytics/daily?date=${targetDate}`);
      if (res.statusCode === 404) return null;
      return (await res.body.json()) as DailyStats;
    }
    return this.analytics!.getDailyStats(appId, targetDate, true);
  }

  /**
   * Lấy số liệu thống kê theo một khoảng ngày liên tục [startDate, endDate]
   * @param appId Mã ứng dụng (mặc định: "uniclass")
   * @param startDate Ngày bắt đầu (YYYY-MM-DD)
   * @param endDate Ngày kết thúc (YYYY-MM-DD)
   */
  async getDailyStatsRange(
    appId: string = "uniclass",
    startDate: string,
    endDate: string
  ): Promise<DailyStats[]> {
    assertUniClassApp(appId);
    if (this.isRemote) {
      const url = `${this.apiUrl}/api/apps/${appId}/analytics/daily?startDate=${startDate}&endDate=${endDate}`;
      const res = await request(url);
      const data = (await res.body.json()) as { data: DailyStats[] };
      return data.data ?? [];
    }
    return this.analytics!.getDailyStatsRange(appId, startDate, endDate);
  }

  /**
   * Lấy danh sách lịch sử tất cả các báo cáo ngày đã được lưu
   * @param appId Mã ứng dụng (mặc định: "uniclass")
   * @returns Danh sách DailyStats sắp xếp từ ngày mới nhất
   */
  async getDailyStatsHistory(appId: string = "uniclass"): Promise<DailyStats[]> {
    assertUniClassApp(appId);
    if (this.isRemote) {
      const url = `${this.apiUrl}/api/apps/${appId}/analytics/daily/history`;
      const res = await request(url);
      if (res.statusCode !== 200) return [];
      const data = (await res.body.json()) as { data: DailyStats[] };
      return data.data ?? [];
    }
    return this.analytics!.listAllDailyStats(appId);
  }

  /**
   * Lấy tổng quan các chỉ số đánh giá của ứng dụng
   * @param appId Mã ứng dụng (mặc định: "uniclass")
   */
  async getAppOverview(appId: string = "uniclass"): Promise<AppOverview> {
    assertUniClassApp(appId);
    if (this.isRemote) {
      const res = await request(`${this.apiUrl}/api/apps/${appId}/analytics/overview`);
      return (await res.body.json()) as AppOverview;
    }
    return this.analytics!.getAppOverview(appId);
  }

  /**
   * Kích hoạt phiên thu thập dữ liệu mới
   * @param appId Mã ứng dụng
   * @param maxReviews Giới hạn số bài nhận xét tối đa mỗi store
   */
  async triggerCollection(
    appId: string = "uniclass",
    maxReviews?: number
  ): Promise<CollectionCycleResult> {
    assertUniClassApp(appId);
    if (this.isRemote) {
      const res = await request(`${this.apiUrl}/api/collector/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, maxReviews }),
      });
      return (await res.body.json()) as CollectionCycleResult;
    }
    return this.collector!.collectApp(appId, maxReviews);
  }

  /**
   * Lấy trạng thái của tiến trình Scheduler và Collector
   */
  async getCollectorStatus(): Promise<SchedulerStatus> {
    if (this.isRemote) {
      const res = await request(`${this.apiUrl}/api/collector/status`);
      return (await res.body.json()) as SchedulerStatus;
    }
    return {
      isRunning: false,
      cronExpression: "N/A (Local Mode)",
      isCollecting: this.collector!.isAppCollecting("uniclass"),
      appId: "uniclass",
      runCount: 0,
    };
  }
}
