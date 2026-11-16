import { request } from "undici";
import { randomUUID } from "node:crypto";
import type {
  IStoreProvider,
  AppConfig,
  ProviderResult,
  RatingSnapshot,
  Review,
  SupportedPlatform,
} from "../../core/types.js";
import { RatingSnapshotSchema, ReviewSchema } from "../../core/schemas.js";
import { classifySentiment } from "../../core/sentiment.js";
import { normalizeDateToIso } from "../../core/utils.js";

/**
 * Lớp cung cấp dữ liệu đánh giá và nhận xét từ Apple App Store cho ứng dụng UniClass
 */
export class AppStoreProvider implements IStoreProvider {
  public readonly platform: SupportedPlatform = "ios";

  /**
   * Khởi tạo AppStoreProvider
   */
  constructor() {}

  /**
   * Thu thập ảnh chụp điểm đánh giá và tổng số rating trên Apple App Store qua iTunes Lookup API
   * @param config Cấu hình ứng dụng UniClass
   * @returns Kết quả ProviderResult chứa RatingSnapshot đã chuẩn hóa
   */
  async fetchRatingSnapshot(config: AppConfig): Promise<ProviderResult<RatingSnapshot>> {
    const iosConfig = config.platforms?.ios;
    if (!iosConfig || !iosConfig.enabled) {
      return {
        status: "UNAVAILABLE",
        error: "Nền tảng iOS chưa được cấu hình hoặc đang bị vô hiệu hóa trong AppConfig",
        timestamp: new Date().toISOString(),
      };
    }

    const { appStoreId, country = "vn" } = iosConfig;
    if (appStoreId !== "6475161683") {
      return {
        status: "UNAVAILABLE",
        error: `App Store ID không hợp lệ (${appStoreId}). Chỉ chấp nhận ứng dụng UniClass (6475161683)`,
        timestamp: new Date().toISOString(),
      };
    }

    const url = `https://itunes.apple.com/lookup?id=${appStoreId}&country=${country}`;

    try {
      const res = await request(url, {
        headers: {
          "User-Agent": "UniClassRatingReader/1.0",
          "Accept": "application/json",
        },
      });

      if (res.statusCode !== 200) {
        return {
          status: "UNAVAILABLE",
          error: `iTunes Lookup API trả về HTTP status ${res.statusCode}`,
          timestamp: new Date().toISOString(),
        };
      }

      const payload = (await res.body.json()) as {
        resultCount: number;
        results?: Array<{
          trackName?: string;
          averageUserRating?: number;
          userRatingCount?: number;
        }>;
      };

      if (!payload.results || payload.results.length === 0) {
        return {
          status: "UNAVAILABLE",
          error: `Không tìm thấy ứng dụng UniClass với ID ${appStoreId} tại store ${country}`,
          timestamp: new Date().toISOString(),
        };
      }

      const appData = payload.results[0];
      const rawSnapshot = {
        snapshotId: randomUUID(),
        appId: config.id,
        platform: "ios" as const,
        averageRating: Number((appData.averageUserRating ?? 0).toFixed(2)),
        totalRatings: appData.userRatingCount ?? 0,
        country,
        collectedAt: new Date().toISOString(),
      };

      // Xác thực và chuẩn hóa thông qua Zod Schema
      const validatedSnapshot = RatingSnapshotSchema.parse(rawSnapshot);

      return {
        status: "SUCCESS",
        data: validatedSnapshot,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "UNAVAILABLE",
        error: `Lỗi kết nối hoặc xử lý dữ liệu iTunes Lookup API: ${message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Thu thập danh sách nhận xét mới nhất trên Apple App Store qua Customer Reviews RSS Feed
   * @param config Cấu hình ứng dụng UniClass
   * @param options Tùy chọn thu thập (số lượng tối đa)
   * @returns Kết quả ProviderResult chứa mảng Review đã chuẩn hóa
   */
  async fetchReviews(
    config: AppConfig,
    options?: { maxCount?: number }
  ): Promise<ProviderResult<Review[]>> {
    const iosConfig = config.platforms?.ios;
    if (!iosConfig || !iosConfig.enabled) {
      return {
        status: "UNAVAILABLE",
        data: [],
        error: "Nền tảng iOS chưa được cấu hình hoặc đang bị vô hiệu hóa trong AppConfig",
        timestamp: new Date().toISOString(),
      };
    }

    const { appStoreId, country = "vn" } = iosConfig;
    if (appStoreId !== "6475161683") {
      return {
        status: "UNAVAILABLE",
        data: [],
        error: `App Store ID không hợp lệ (${appStoreId}). Chỉ chấp nhận ứng dụng UniClass (6475161683)`,
        timestamp: new Date().toISOString(),
      };
    }

    const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=1/id=${appStoreId}/sortby=mostrecent/json`;

    try {
      const res = await request(url, {
        headers: {
          "User-Agent": "UniClassRatingReader/1.0",
          "Accept": "application/json",
        },
      });

      if (res.statusCode !== 200) {
        return {
          status: "UNAVAILABLE",
          data: [],
          error: `Apple Customer Reviews RSS trả về HTTP status ${res.statusCode}`,
          timestamp: new Date().toISOString(),
        };
      }

      const payload = (await res.body.json()) as {
        feed?: {
          entry?: Array<{
            id?: { label?: string };
            title?: { label?: string };
            content?: { label?: string };
            "im:rating"?: { label?: string };
            author?: { name?: { label?: string } };
            updated?: { label?: string };
          }>;
        };
      };

      const rawEntries = payload.feed?.entry || [];
      const validatedReviews: Review[] = [];

      // Bỏ qua mục đầu tiên nếu là thông tin mô tả ứng dụng thay vì đánh giá thực tế
      const reviewEntries =
        rawEntries.length > 0 && rawEntries[0]["im:rating"] ? rawEntries : rawEntries.slice(1);

      const maxLimit = options?.maxCount ?? 50;

      for (const item of reviewEntries) {
        if (validatedReviews.length >= maxLimit) break;

        const rawId = item.id?.label || randomUUID();
        const rating = item["im:rating"]?.label ? parseInt(item["im:rating"].label, 10) : 5;
        const title = item.title?.label || null;
        const content = item.content?.label || "";
        const author = item.author?.name?.label || null;
        const rawDate = item.updated?.label || new Date().toISOString();
        const createdAt = normalizeDateToIso(rawDate);

        const rawReview = {
          id: `ios:${rawId}`,
          externalReviewId: rawId,
          appId: config.id,
          platform: "ios" as const,
          rating,
          title,
          content,
          author,
          createdAt,
          country,
          sentiment: classifySentiment(rating),
          collectedAt: new Date().toISOString(),
        };

        try {
          const parsedReview = ReviewSchema.parse(rawReview);
          validatedReviews.push(parsedReview);
        } catch {
          // Bỏ qua bài review không hợp lệ để đảm bảo an toàn dữ liệu
        }
      }

      return {
        status: "SUCCESS",
        data: validatedReviews,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "UNAVAILABLE",
        data: [],
        error: `Lỗi kết nối Apple Customer Reviews RSS: ${message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
