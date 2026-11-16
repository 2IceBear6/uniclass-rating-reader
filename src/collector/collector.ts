import { randomUUID } from "node:crypto";
import type {
  AppConfig,
  CollectionCycleResult,
  CollectionStatus,
  CollectionLog,
} from "../core/types.js";
import { CollectionCycleResultSchema, CollectionLogSchema } from "../core/schemas.js";
import { LocalStorageEngine } from "../storage/index.js";
import { GooglePlayProvider } from "../providers/google-play/index.js";
import { AppStoreProvider } from "../providers/app-store/index.js";
import { AnalyticsEngine } from "../analytics/index.js";

/**
 * Tùy chọn cấu hình cho dịch vụ Collector
 */
export interface CollectorOptions {
  storage?: LocalStorageEngine;
  googlePlayProvider?: GooglePlayProvider;
  appStoreProvider?: AppStoreProvider;
  analyticsEngine?: AnalyticsEngine;
  maxReviewsPerStore?: number;
}

/**
 * Dịch vụ điều phối quá trình thu thập dữ liệu (Collector Service)
 * Quản lý vòng đời thu thập rating, reviews, khử trùng lặp và ghi nhật ký
 */
export class CollectorService {
  private storage: LocalStorageEngine;
  private googlePlayProvider: GooglePlayProvider;
  private appStoreProvider: AppStoreProvider;
  private analyticsEngine: AnalyticsEngine;
  private maxReviewsPerStore: number;
  private activeAppRuns: Set<string> = new Set();

  /**
   * Khởi tạo CollectorService
   * @param options Tùy chọn cấu hình Collector
   */
  constructor(options: CollectorOptions = {}) {
    this.storage = options.storage ?? new LocalStorageEngine();
    this.googlePlayProvider = options.googlePlayProvider ?? new GooglePlayProvider();
    this.appStoreProvider = options.appStoreProvider ?? new AppStoreProvider();
    this.analyticsEngine = options.analyticsEngine ?? new AnalyticsEngine({ storage: this.storage });
    this.maxReviewsPerStore = options.maxReviewsPerStore ?? 50;
  }

  /**
   * Kiểm tra xem ứng dụng có đang trong tiến trình cào dữ liệu hay không
   * @param appId Mã ứng dụng
   */
  isAppCollecting(appId: string): boolean {
    return this.activeAppRuns.has(appId);
  }

  /**
   * Thu thập dữ liệu cho một ứng dụng UniClass cụ thể
   * @param appId Mã ứng dụng (ví dụ: "uniclass")
   * @param maxReviews Giới hạn số nhận xét tối đa mỗi store
   * @returns Kết quả chu kỳ thu thập CollectionCycleResult
   */
  async collectApp(
    appId: string = "uniclass",
    maxReviews?: number
  ): Promise<CollectionCycleResult> {
    if (this.activeAppRuns.has(appId)) {
      throw new Error(`Ứng dụng ${appId} đang có một phiên thu thập dữ liệu đang chạy`);
    }

    this.activeAppRuns.add(appId);
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const limit = maxReviews ?? this.maxReviewsPerStore;

    try {
      const appConfig = await this.storage.getAppConfig(appId);
      if (!appConfig) {
        return this.createUnavailableResult(
          runId,
          appId,
          startedAt,
          `Không tìm thấy cấu hình ứng dụng trong tệp data/apps/${appId}/app.json`
        );
      }

      // Thu thập song song trên các nền tảng được kích hoạt
      const [androidResult, iosResult] = await Promise.allSettled([
        this.collectAndroidPlatform(appConfig, limit),
        this.collectIosPlatform(appConfig, limit),
      ]);

      const androidData =
        androidResult.status === "fulfilled"
          ? androidResult.value
          : {
              status: "UNAVAILABLE" as CollectionStatus,
              snapshotSaved: false,
              reviewsCollected: 0,
              newReviewsSaved: 0,
              duplicatesSkipped: 0,
              error: androidResult.reason instanceof Error ? androidResult.reason.message : String(androidResult.reason),
            };

      const iosData =
        iosResult.status === "fulfilled"
          ? iosResult.value
          : {
              status: "UNAVAILABLE" as CollectionStatus,
              snapshotSaved: false,
              reviewsCollected: 0,
              newReviewsSaved: 0,
              duplicatesSkipped: 0,
              error: iosResult.reason instanceof Error ? iosResult.reason.message : String(iosResult.reason),
            };

      // Đánh giá trạng thái tổng thể của chu kỳ
      const overallStatus = this.determineOverallStatus(
        appConfig,
        androidData.status,
        iosData.status
      );

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      const totalNewReviewsSaved = androidData.newReviewsSaved + iosData.newReviewsSaved;

      const rawCycleResult: CollectionCycleResult = {
        runId,
        appId,
        status: overallStatus,
        startedAt,
        completedAt,
        durationMs,
        platforms: {
          android: appConfig.platforms?.android?.enabled ? androidData : undefined,
          ios: appConfig.platforms?.ios?.enabled ? iosData : undefined,
        },
        totalNewReviewsSaved,
      };

      const validatedCycleResult = CollectionCycleResultSchema.parse(rawCycleResult);

      // Ghi nhật ký vào collection-logs
      const logRecord: CollectionLog = {
        logId: randomUUID(),
        timestamp: completedAt,
        cycleResult: validatedCycleResult,
      };
      await this.storage.appendCollectionLog(CollectionLogSchema.parse(logRecord));

      // Tự động kích hoạt tính toán cập nhật thống kê ngày
      const today = completedAt.slice(0, 10);
      await this.analyticsEngine.computeAndSaveDailyStats(appId, today).catch((err) => {
        console.warn(`[Collector] Lỗi khi cập nhật thống kê ngày cho ${appId}:`, err);
      });

      return validatedCycleResult;
    } finally {
      this.activeAppRuns.delete(appId);
    }
  }

  /**
   * Thu thập dữ liệu trên nền tảng Android (Google Play Store)
   */
  private async collectAndroidPlatform(
    appConfig: AppConfig,
    maxLimit: number
  ) {
    if (!appConfig.platforms?.android || !appConfig.platforms.android.enabled) {
      return {
        status: "UNAVAILABLE" as CollectionStatus,
        snapshotSaved: false,
        reviewsCollected: 0,
        newReviewsSaved: 0,
        duplicatesSkipped: 0,
        error: "Nền tảng Android không được cấu hình hoặc đã bị tắt",
      };
    }

    let snapshotSaved = false;
    let reviewsCollected = 0;
    let newReviewsSaved = 0;
    let duplicatesSkipped = 0;
    let platformStatus: CollectionStatus = "SUCCESS";
    let errorMessage: string | undefined;

    // 1. Thu thập Rating Snapshot
    const snapshotRes = await this.googlePlayProvider.fetchRatingSnapshot(appConfig);
    if (snapshotRes.status === "SUCCESS" && snapshotRes.data) {
      await this.storage.saveRatingSnapshot(snapshotRes.data);
      snapshotSaved = true;
    } else {
      errorMessage = snapshotRes.error;
    }

    // 2. Thu thập Reviews
    const reviewsRes = await this.googlePlayProvider.fetchReviews(appConfig, { maxCount: maxLimit });
    if (reviewsRes.data && reviewsRes.data.length > 0) {
      reviewsCollected = reviewsRes.data.length;
      const saveRes = await this.storage.saveReviews(appConfig.id, reviewsRes.data);
      newReviewsSaved = saveRes.savedCount;
      duplicatesSkipped = saveRes.duplicateCount;
    }

    // Xác định trạng thái nền tảng
    if (!snapshotSaved && reviewsCollected === 0) {
      platformStatus = "UNAVAILABLE";
    } else if (!snapshotSaved || reviewsRes.status === "PARTIAL") {
      platformStatus = "PARTIAL";
    }

    return {
      status: platformStatus,
      snapshotSaved,
      reviewsCollected,
      newReviewsSaved,
      duplicatesSkipped,
      error: errorMessage,
    };
  }

  /**
   * Thu thập dữ liệu trên nền tảng iOS (Apple App Store)
   */
  private async collectIosPlatform(
    appConfig: AppConfig,
    maxLimit: number
  ) {
    if (!appConfig.platforms?.ios || !appConfig.platforms.ios.enabled) {
      return {
        status: "UNAVAILABLE" as CollectionStatus,
        snapshotSaved: false,
        reviewsCollected: 0,
        newReviewsSaved: 0,
        duplicatesSkipped: 0,
        error: "Nền tảng iOS không được cấu hình hoặc đã bị tắt",
      };
    }

    let snapshotSaved = false;
    let reviewsCollected = 0;
    let newReviewsSaved = 0;
    let duplicatesSkipped = 0;
    let platformStatus: CollectionStatus = "SUCCESS";
    let errorMessage: string | undefined;

    // 1. Thu thập Rating Snapshot qua iTunes Lookup API
    const snapshotRes = await this.appStoreProvider.fetchRatingSnapshot(appConfig);
    if (snapshotRes.status === "SUCCESS" && snapshotRes.data) {
      await this.storage.saveRatingSnapshot(snapshotRes.data);
      snapshotSaved = true;
    } else {
      errorMessage = snapshotRes.error;
    }

    // 2. Thu thập Reviews qua RSS Feed
    const reviewsRes = await this.appStoreProvider.fetchReviews(appConfig, { maxCount: maxLimit });
    if (reviewsRes.data && reviewsRes.data.length > 0) {
      reviewsCollected = reviewsRes.data.length;
      const saveRes = await this.storage.saveReviews(appConfig.id, reviewsRes.data);
      newReviewsSaved = saveRes.savedCount;
      duplicatesSkipped = saveRes.duplicateCount;
    }

    // Xác định trạng thái nền tảng
    if (!snapshotSaved && reviewsRes.status === "UNAVAILABLE") {
      platformStatus = "UNAVAILABLE";
    } else if (!snapshotSaved || reviewsRes.status === "PARTIAL") {
      platformStatus = "PARTIAL";
    }

    return {
      status: platformStatus,
      snapshotSaved,
      reviewsCollected,
      newReviewsSaved,
      duplicatesSkipped,
      error: errorMessage,
    };
  }

  /**
   * Xác định trạng thái kết quả tổng thể (SUCCESS, PARTIAL, UNAVAILABLE)
   */
  private determineOverallStatus(
    config: AppConfig,
    androidStatus: CollectionStatus,
    iosStatus: CollectionStatus
  ): CollectionStatus {
    const androidEnabled = Boolean(config.platforms?.android?.enabled);
    const iosEnabled = Boolean(config.platforms?.ios?.enabled);

    const statuses: CollectionStatus[] = [];
    if (androidEnabled) statuses.push(androidStatus);
    if (iosEnabled) statuses.push(iosStatus);

    if (statuses.length === 0) return "UNAVAILABLE";

    const allSuccess = statuses.every((s) => s === "SUCCESS");
    if (allSuccess) return "SUCCESS";

    const allUnavailable = statuses.every((s) => s === "UNAVAILABLE");
    if (allUnavailable) return "UNAVAILABLE";

    return "PARTIAL";
  }

  /**
   * Tạo kết quả lỗi khi ứng dụng không thể thu thập
   */
  private createUnavailableResult(
    runId: string,
    appId: string,
    startedAt: string,
    error: string
  ): CollectionCycleResult {
    const completedAt = new Date().toISOString();
    return {
      runId,
      appId,
      status: "UNAVAILABLE",
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      platforms: {},
      totalNewReviewsSaved: 0,
      error,
    };
  }

  /**
   * Lấy thể hiện Storage Engine đang sử dụng
   */
  getStorage(): LocalStorageEngine {
    return this.storage;
  }
}

