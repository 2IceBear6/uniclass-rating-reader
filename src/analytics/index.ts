import type { Review, DailyStats } from "../core/types.js";
import { classifySentiment } from "../core/sentiment.js";

/**
 * Lớp tính toán và phân tích các chỉ số đánh giá UniClass
 */
export class AnalyticsEngine {
  /**
   * Khởi tạo AnalyticsEngine
   */
  constructor() {}

  /**
   * Tổng hợp thống kê ngày từ danh sách nhận xét mới
   * @param appId Mã ứng dụng
   * @param date Ngày thống kê (YYYY-MM-DD)
   * @param reviews Danh sách nhận xét trong ngày
   * @returns Báo cáo DailyStats
   */
  calculateDailyStats(appId: string, date: string, reviews: Review[]): DailyStats {
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

    return {
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
          averageRating: androidCount > 0 ? Number((androidScoreSum / androidCount).toFixed(2)) : 0,
        },
        ios: {
          newReviews: iosCount,
          averageRating: iosCount > 0 ? Number((iosScoreSum / iosCount).toFixed(2)) : 0,
        },
      },
      latestRatingSnapshot: {},
      calculatedAt: new Date().toISOString(),
    };
  }
}

