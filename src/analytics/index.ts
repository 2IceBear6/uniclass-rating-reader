import type {
  Review,
  DailyStats,
  RatingSnapshot,
  AppOverview,
} from "../core/types.js";
import { DailyStatsSchema } from "../core/schemas.js";
import { classifySentiment } from "../core/sentiment.js";
import { LocalStorageEngine } from "../storage/index.js";

/**
 * Tùy chọn cấu hình cho AnalyticsEngine
 */
export interface AnalyticsEngineOptions {
  storage?: LocalStorageEngine;
}

/**
 * Bộ máy tính toán và phân tích các chỉ số đánh giá UniClass (Analytics Engine)
 * Xử lý phân loại cảm xúc, tổng hợp báo cáo ngày và tổng quan đa nền tảng
 */
export class AnalyticsEngine {
  private storage: LocalStorageEngine;

  /**
   * Khởi tạo AnalyticsEngine
   * @param options Tùy chọn cấu hình
   */
  constructor(options: AnalyticsEngineOptions = {}) {
    this.storage = options.storage ?? new LocalStorageEngine();
  }

  /**
   * Tính toán đối tượng DailyStats thuần túy từ mảng nhận xét và ảnh chụp rating
   * @param appId Mã ứng dụng ("uniclass")
   * @param date Ngày thống kê (YYYY-MM-DD)
   * @param reviews Danh sách nhận xét trong ngày
   * @param latestAndroidSnapshot Snapshot rating Android mới nhất
   * @param latestIosSnapshot Snapshot rating iOS mới nhất
   * @returns Đối tượng DailyStats đã chuẩn hóa
   */
  calculateDailyStatsFromReviews(
    appId: string,
    date: string,
    reviews: Review[],
    latestAndroidSnapshot?: RatingSnapshot,
    latestIosSnapshot?: RatingSnapshot
  ): DailyStats {
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    let androidCount = 0;
    let androidScoreSum = 0;
    let iosCount = 0;
    let iosScoreSum = 0;

    for (const rev of reviews) {
      const sentiment = classifySentiment(rev.rating);
      if (sentiment === "positive") positive++;
      else if (sentiment === "neutral") neutral++;
      else negative++;

      if (rev.platform === "android") {
        androidCount++;
        androidScoreSum += rev.rating;
      } else {
        iosCount++;
        iosScoreSum += rev.rating;
      }
    }

    const rawStats = {
      date,
      appId,
      totalNewReviews: reviews.length,
      sentimentCounts: {
        positive,
        neutral,
        negative,
      },
      platformBreakdown: {
        android: {
          newReviews: androidCount,
          averageRating:
            androidCount > 0 ? Number((androidScoreSum / androidCount).toFixed(2)) : 0,
        },
        ios: {
          newReviews: iosCount,
          averageRating:
            iosCount > 0 ? Number((iosScoreSum / iosCount).toFixed(2)) : 0,
        },
      },
      latestRatingSnapshot: {
        android: latestAndroidSnapshot
          ? { average: latestAndroidSnapshot.averageRating, total: latestAndroidSnapshot.totalRatings }
          : undefined,
        ios: latestIosSnapshot
          ? { average: latestIosSnapshot.averageRating, total: latestIosSnapshot.totalRatings }
          : undefined,
      },
      calculatedAt: new Date().toISOString(),
    };

    return DailyStatsSchema.parse(rawStats);
  }

  /**
   * Tính toán và lưu số liệu thống kê ngày vào tệp daily-stats/YYYY-MM-DD.json
   * @param appId Mã ứng dụng
   * @param date Ngày cần tính toán (định dạng YYYY-MM-DD)
   * @returns Báo cáo DailyStats vừa được lưu
   */
  async computeAndSaveDailyStats(appId: string, date: string): Promise<DailyStats> {
    // 1. Lấy tất cả reviews đã lưu của ứng dụng
    const allReviews = await this.storage.getReviews(appId);

    // 2. Lọc các review thuộc ngày này (theo ngày thu thập collectedAt hoặc ngày tạo createdAt)
    const dayReviews = allReviews.filter((r) => {
      const collectedDay = r.collectedAt ? r.collectedAt.slice(0, 10) : "";
      const createdDay = r.createdAt ? r.createdAt.slice(0, 10) : "";
      return collectedDay === date || createdDay === date;
    });

    // 3. Lấy lịch sử snapshots để tìm snapshot mới nhất tính đến ngày này
    const allSnapshots = await this.storage.getRatingSnapshots(appId);
    const dateLimit = `${date}T23:59:59.999Z`;

    const snapshotsBeforeDate = allSnapshots.filter((s) => s.collectedAt <= dateLimit);

    const latestAndroid = [...snapshotsBeforeDate]
      .reverse()
      .find((s) => s.platform === "android");

    const latestIos = [...snapshotsBeforeDate]
      .reverse()
      .find((s) => s.platform === "ios");

    // 4. Tính toán số liệu thống kê
    const dailyStats = this.calculateDailyStatsFromReviews(
      appId,
      date,
      dayReviews,
      latestAndroid,
      latestIos
    );

    // 5. Lưu vào storage bằng cơ chế atomic write
    await this.storage.saveDailyStats(dailyStats);

    return dailyStats;
  }

  /**
   * Đọc số liệu thống kê ngày. Nếu chưa tồn tại, tự động tính toán và lưu
   * @param appId Mã ứng dụng
   * @param date Ngày thống kê (YYYY-MM-DD)
   * @param autoCompute Tự động tính toán nếu chưa có tệp thống kê (mặc định: true)
   */
  async getDailyStats(
    appId: string,
    date: string,
    autoCompute: boolean = true
  ): Promise<DailyStats | null> {
    const existing = await this.storage.getDailyStats(appId, date);
    if (existing) {
      return existing;
    }

    if (autoCompute) {
      return this.computeAndSaveDailyStats(appId, date);
    }

    return null;
  }

  /**
   * Lấy danh sách thống kê theo một dải ngày liên tục [startDate, endDate]
   * @param appId Mã ứng dụng
   * @param startDate Ngày bắt đầu (YYYY-MM-DD)
   * @param endDate Ngày kết thúc (YYYY-MM-DD)
   */
  async getDailyStatsRange(
    appId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyStats[]> {
    const results: DailyStats[] = [];
    const current = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    if (isNaN(current.getTime()) || isNaN(end.getTime()) || current > end) {
      throw new Error(`Khoảng thời gian không hợp lệ: từ "${startDate}" đến "${endDate}"`);
    }

    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const stats = await this.getDailyStats(appId, dateStr, true);
      if (stats) {
        results.push(stats);
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return results;
  }

  /**
   * Tổng hợp bức tranh tổng quan toàn diện về ứng dụng UniClass
   * @param appId Mã ứng dụng
   * @returns Báo cáo AppOverview
   */
  async getAppOverview(appId: string): Promise<AppOverview> {
    const allReviews = await this.storage.getReviews(appId);
    const allSnapshots = await this.storage.getRatingSnapshots(appId);

    let positive = 0;
    let neutral = 0;
    let negative = 0;

    const androidReviews = allReviews.filter((r) => r.platform === "android");
    const iosReviews = allReviews.filter((r) => r.platform === "ios");

    for (const r of allReviews) {
      const sentiment = classifySentiment(r.rating);
      if (sentiment === "positive") positive++;
      else if (sentiment === "neutral") neutral++;
      else negative++;
    }

    const calcAvg = (revs: Review[]) => {
      if (revs.length === 0) return 0;
      const sum = revs.reduce((acc, cur) => acc + cur.rating, 0);
      return Number((sum / revs.length).toFixed(2));
    };

    const latestAndroidSnapshot = [...allSnapshots].reverse().find((s) => s.platform === "android");
    const latestIosSnapshot = [...allSnapshots].reverse().find((s) => s.platform === "ios");

    return {
      appId,
      totalReviews: allReviews.length,
      overallSentiment: {
        positive,
        neutral,
        negative,
      },
      platforms: {
        android: {
          totalReviews: androidReviews.length,
          averageRatingReviews: calcAvg(androidReviews),
          latestSnapshot: latestAndroidSnapshot
            ? {
                averageRating: latestAndroidSnapshot.averageRating,
                totalRatings: latestAndroidSnapshot.totalRatings,
                collectedAt: latestAndroidSnapshot.collectedAt,
                ratingBreakdown: latestAndroidSnapshot.ratingBreakdown,
              }
            : undefined,
        },
        ios: {
          totalReviews: iosReviews.length,
          averageRatingReviews: calcAvg(iosReviews),
          latestSnapshot: latestIosSnapshot
            ? {
                averageRating: latestIosSnapshot.averageRating,
                totalRatings: latestIosSnapshot.totalRatings,
                collectedAt: latestIosSnapshot.collectedAt,
              }
            : undefined,
        },
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Lấy thể hiện Storage Engine đang sử dụng
   */
  getStorage(): LocalStorageEngine {
    return this.storage;
  }
}
