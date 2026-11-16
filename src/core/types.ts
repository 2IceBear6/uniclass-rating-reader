/**
 * Định nghĩa trạng thái của kết quả thu thập dữ liệu
 * - SUCCESS: Thu thập thành công toàn bộ dữ liệu
 * - PARTIAL: Thu thập thành công một phần (ví dụ: lấy được rating nhưng lỗi lấy reviews)
 * - UNAVAILABLE: Nguồn dữ liệu không thể truy cập hoặc bị giới hạn
 */
export type CollectionStatus = "SUCCESS" | "PARTIAL" | "UNAVAILABLE";

/**
 * Định nghĩa loại cảm xúc của một đánh giá dựa trên thang điểm sao
 * - positive: 4 - 5 sao
 * - neutral: 3 sao
 * - negative: 1 - 2 sao
 */
export type SentimentType = "positive" | "neutral" | "negative";

/**
 * Định nghĩa nền tảng kho ứng dụng được hỗ trợ
 */
export type SupportedPlatform = "android" | "ios";

/**
 * Interface cấu hình nền tảng Android cho ứng dụng UniClass
 */
export interface AndroidPlatformConfig {
  name: string;
  packageId: string;
  country: string;
  enabled: boolean;
}

/**
 * Interface cấu hình nền tảng iOS cho ứng dụng UniClass
 */
export interface IosPlatformConfig {
  name: string;
  appStoreId: string;
  country: string;
  enabled: boolean;
}

/**
 * Interface cấu hình tổng thể của một ứng dụng UniClass
 */
export interface AppConfig {
  id: string;
  name: string;
  organization: string;
  scope: "uniclass-only";
  platforms: {
    android?: AndroidPlatformConfig;
    ios?: IosPlatformConfig;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Interface biểu diễn ảnh chụp trạng thái đánh giá (Rating Snapshot)
 */
export interface RatingSnapshot {
  snapshotId: string;
  appId: string;
  platform: SupportedPlatform;
  averageRating: number;
  totalRatings: number;
  ratingBreakdown?: {
    1?: number;
    2?: number;
    3?: number;
    4?: number;
    5?: number;
  };
  country: string;
  collectedAt: string;
}

/**
 * Interface biểu diễn một nhận xét người dùng đã chuẩn hóa
 */
export interface Review {
  id: string;
  externalReviewId: string;
  appId: string;
  platform: SupportedPlatform;
  rating: number;
  title: string | null;
  content: string;
  author: string | null;
  createdAt: string;
  updatedAt?: string | null;
  country: string;
  sentiment: SentimentType;
  collectedAt: string;
}

/**
 * Interface dữ liệu thống kê tổng hợp theo ngày
 */
export interface DailyStats {
  date: string;
  appId: string;
  totalNewReviews: number;
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
  platformBreakdown: {
    android: {
      newReviews: number;
      averageRating: number;
    };
    ios: {
      newReviews: number;
      averageRating: number;
    };
  };
  latestRatingSnapshot: {
    android?: { average: number; total: number };
    ios?: { average: number; total: number };
  };
  calculatedAt: string;
}

/**
 * Interface kết quả phản hồi từ Provider
 */
export interface ProviderResult<T> {
  status: CollectionStatus;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Interface chuẩn chung cho các Store Providers (Google Play và App Store)
 */
export interface IStoreProvider {
  readonly platform: SupportedPlatform;
  /**
   * Lấy ảnh chụp điểm rating và tổng số lượt đánh giá
   * @param config Cấu hình ứng dụng cần thu thập
   */
  fetchRatingSnapshot(config: AppConfig): Promise<ProviderResult<RatingSnapshot>>;

  /**
   * Lấy danh sách nhận xét mới nhất từ kho ứng dụng
   * @param config Cấu hình ứng dụng cần thu thập
   * @param options Tùy chọn thu thập (số lượng tối đa)
   */
  fetchReviews(
    config: AppConfig,
    options?: { maxCount?: number }
  ): Promise<ProviderResult<Review[]>>;
}

/**
 * Interface biểu diễn kết quả thu thập của một chu kỳ crawl
 */
export interface CollectionCycleResult {
  runId: string;
  appId: string;
  status: CollectionStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  platforms: {
    android?: {
      status: CollectionStatus;
      snapshotSaved: boolean;
      reviewsCollected: number;
      newReviewsSaved: number;
      duplicatesSkipped: number;
      error?: string;
    };
    ios?: {
      status: CollectionStatus;
      snapshotSaved: boolean;
      reviewsCollected: number;
      newReviewsSaved: number;
      duplicatesSkipped: number;
      error?: string;
    };
  };
  totalNewReviewsSaved: number;
  error?: string;
}

/**
 * Interface cấu trúc log một phiên thu thập lưu trữ vào collection-logs
 */
export interface CollectionLog {
  logId: string;
  timestamp: string;
  cycleResult: CollectionCycleResult;
}

/**
 * Interface tổng quan số liệu toàn diện của ứng dụng UniClass
 */
export interface AppOverview {
  appId: string;
  totalReviews: number;
  overallSentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  platforms: {
    android?: {
      totalReviews: number;
      averageRatingReviews: number;
      latestSnapshot?: {
        averageRating: number;
        totalRatings: number;
        collectedAt: string;
        ratingBreakdown?: {
          1?: number;
          2?: number;
          3?: number;
          4?: number;
          5?: number;
        };
      };
    };
    ios?: {
      totalReviews: number;
      averageRatingReviews: number;
      latestSnapshot?: {
        averageRating: number;
        totalRatings: number;
        collectedAt: string;
      };
    };
  };
  updatedAt: string;
}

