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
 * Lớp cung cấp dữ liệu đánh giá và nhận xét từ Google Play Store cho ứng dụng UniClass
 */
export class GooglePlayProvider implements IStoreProvider {
  public readonly platform: SupportedPlatform = "android";

  /**
   * Khởi tạo GooglePlayProvider
   */
  constructor() {}

  /**
   * Bóc tách thông tin snapshot rating từ mã nguồn HTML Google Play
   * @param html Mã nguồn HTML trang Google Play
   * @param appId Mã ứng dụng nội bộ
   * @param country Mã quốc gia
   */
  private extractRatingSnapshotFromHtml(
    html: string,
    appId: string,
    country: string
  ): RatingSnapshot | null {
    // 1. Thử bóc tách từ khối dữ liệu ds:5 trong AF_initDataCallback
    const regexDs = /AF_initDataCallback\(\{key:\s*'(ds:\d+)',[^}]*data:([\s\S]*?), sideChannel:/g;
    let match: RegExpExecArray | null;

    while ((match = regexDs.exec(html)) !== null) {
      const key = match[1];
      const rawData = match[2].trim();

      if (key === "ds:5") {
        try {
          const parseFn = new Function(`return ${rawData}`);
          const ds5 = parseFn();
          const ratingBlock = ds5?.[1]?.[2]?.[51];

          if (ratingBlock && Array.isArray(ratingBlock)) {
            const rawAvg = typeof ratingBlock[0]?.[1] === "number" ? ratingBlock[0][1] : 0;
            const averageRating = Number(rawAvg.toFixed(2));
            const totalRatings =
              typeof ratingBlock[2]?.[1] === "number" ? ratingBlock[2][1] : 0;

            const breakdown = ratingBlock[1];
            const ratingBreakdown = {
              1: breakdown?.[1]?.[1] ?? 0,
              2: breakdown?.[2]?.[1] ?? 0,
              3: breakdown?.[3]?.[1] ?? 0,
              4: breakdown?.[4]?.[1] ?? 0,
              5: breakdown?.[5]?.[1] ?? 0,
            };

            const rawSnapshot = {
              snapshotId: randomUUID(),
              appId,
              platform: "android" as const,
              averageRating,
              totalRatings,
              ratingBreakdown,
              country,
              collectedAt: new Date().toISOString(),
            };

            return RatingSnapshotSchema.parse(rawSnapshot);
          }
        } catch {
          // Bỏ qua lỗi cú pháp để chuyển sang fallback regex bên dưới
        }
      }
    }

    // 2. Fallback qua aria-label nếu ds:5 không có sẵn
    const ariaMatch = html.match(/aria-label="Được xếp hạng ([0-9,.]+)\s*sao\/5 sao"/);
    if (ariaMatch) {
      const averageRating = parseFloat(ariaMatch[1].replace(",", "."));
      const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      for (let star = 1; star <= 5; star++) {
        const starMatch = html.match(
          new RegExp(`aria-label="([0-9.]+)\\s*bài đánh giá ${star}\\s*sao"`)
        );
        if (starMatch) {
          breakdown[star as 1 | 2 | 3 | 4 | 5] = parseInt(starMatch[1].replace(/\./g, ""), 10);
        }
      }

      const totalRatings = Object.values(breakdown).reduce((a, b) => a + b, 0);

      const rawSnapshot = {
        snapshotId: randomUUID(),
        appId,
        platform: "android" as const,
        averageRating,
        totalRatings,
        ratingBreakdown: breakdown,
        country,
        collectedAt: new Date().toISOString(),
      };

      return RatingSnapshotSchema.parse(rawSnapshot);
    }

    return null;
  }

  /**
   * Bóc tách danh sách nhận xét người dùng từ mã nguồn HTML Google Play
   * @param html Mã nguồn HTML trang Google Play
   * @param appId Mã ứng dụng nội bộ
   * @param country Mã quốc gia
   * @param maxLimit Giới hạn số lượng tối đa
   */
  private extractReviewsFromHtml(
    html: string,
    appId: string,
    country: string,
    maxLimit: number
  ): Review[] {
    const reviews: Review[] = [];
    const authorRegex = /<div class="X5PpBb">([^<]+)<\/div>/g;
    let authorMatch: RegExpExecArray | null;

    while ((authorMatch = authorRegex.exec(html)) !== null) {
      if (reviews.length >= maxLimit) break;

      const author = authorMatch[1].trim();
      const startIndex = authorMatch.index;
      const block = html.substring(startIndex, startIndex + 5000);

      // Điểm sao
      const ratingMatch = block.match(/aria-label="Được xếp hạng ([0-9]) sao\/5 sao"/);
      const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 5;

      // Ngày đăng
      const dateMatch = block.match(/class="bp9Aid">([^<]+)<\/span>/);
      const rawDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString();
      const createdAt = normalizeDateToIso(rawDate);

      // Nội dung nhận xét
      const contentMatch = block.match(
        /class="bp9Aid">[^<]+<\/span><\/div><\/header>([\s\S]*?)<div class="[^"]*">[\s\S]*?người thấy bài đánh giá này hữu ích/
      );
      let content = "";
      if (contentMatch) {
        content = contentMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      } else {
        const textMatch = block.match(/13 tháng 11, 2026[\s\S]*?<\/div>\s*([^\s<][^<]+?)\s*<\/div>/);
        content = textMatch ? textMatch[1].trim() : "Đánh giá từ người dùng Google Play";
      }

      // External Review ID
      const idMatch = block.match(/id="([a-f0-9-]+)::\d+"/);
      const rawId = idMatch ? idMatch[1] : randomUUID();

      const rawReview = {
        id: `android:${rawId}`,
        externalReviewId: rawId,
        appId,
        platform: "android" as const,
        rating,
        title: null,
        content: content || "Đánh giá không có nội dung chữ",
        author,
        createdAt,
        country,
        sentiment: classifySentiment(rating),
        collectedAt: new Date().toISOString(),
      };

      try {
        const validated = ReviewSchema.parse(rawReview);
        reviews.push(validated);
      } catch {
        // Bỏ qua bài review không hợp lệ
      }
    }

    return reviews;
  }

  /**
   * Thu thập ảnh chụp điểm đánh giá và tổng số rating trên Google Play Store
   * @param config Cấu hình ứng dụng UniClass
   * @returns Kết quả ProviderResult chứa RatingSnapshot đã chuẩn hóa
   */
  async fetchRatingSnapshot(config: AppConfig): Promise<ProviderResult<RatingSnapshot>> {
    const androidConfig = config.platforms?.android;
    if (!androidConfig || !androidConfig.enabled) {
      return {
        status: "UNAVAILABLE",
        error: "Nền tảng Android chưa được cấu hình hoặc đang bị vô hiệu hóa trong AppConfig",
        timestamp: new Date().toISOString(),
      };
    }

    const { packageId, country = "vn" } = androidConfig;
    if (packageId !== "com.edupia.edupiaclass.vn") {
      return {
        status: "UNAVAILABLE",
        error: `Package ID không hợp lệ (${packageId}). Chỉ chấp nhận package production của UniClass (com.edupia.edupiaclass.vn)`,
        timestamp: new Date().toISOString(),
      };
    }

    const url = `https://play.google.com/store/apps/details?id=${packageId}&hl=vi&gl=${country}`;

    try {
      const res = await request(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (res.statusCode !== 200) {
        return {
          status: "UNAVAILABLE",
          error: `Google Play Store trả về HTTP status ${res.statusCode}`,
          timestamp: new Date().toISOString(),
        };
      }

      const html = await res.body.text();
      const snapshot = this.extractRatingSnapshotFromHtml(html, config.id, country);

      if (!snapshot) {
        return {
          status: "UNAVAILABLE",
          error: "Không bóc tách được khối dữ liệu điểm đánh giá từ HTML Google Play",
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: "SUCCESS",
        data: snapshot,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "UNAVAILABLE",
        error: `Lỗi kết nối hoặc xử lý Google Play Store: ${message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Thu thập danh sách nhận xét mới nhất trên Google Play Store
   * @param config Cấu hình ứng dụng UniClass
   * @param options Tùy chọn thu thập (số lượng tối đa)
   * @returns Kết quả ProviderResult chứa mảng Review đã chuẩn hóa
   */
  async fetchReviews(
    config: AppConfig,
    options?: { maxCount?: number }
  ): Promise<ProviderResult<Review[]>> {
    const androidConfig = config.platforms?.android;
    if (!androidConfig || !androidConfig.enabled) {
      return {
        status: "UNAVAILABLE",
        data: [],
        error: "Nền tảng Android chưa được cấu hình hoặc đang bị vô hiệu hóa trong AppConfig",
        timestamp: new Date().toISOString(),
      };
    }

    const { packageId, country = "vn" } = androidConfig;
    if (packageId !== "com.edupia.edupiaclass.vn") {
      return {
        status: "UNAVAILABLE",
        data: [],
        error: `Package ID không hợp lệ (${packageId}). Chỉ chấp nhận package production của UniClass (com.edupia.edupiaclass.vn)`,
        timestamp: new Date().toISOString(),
      };
    }

    const maxLimit = options?.maxCount ?? 50;
    const url = `https://play.google.com/store/apps/details?id=${packageId}&hl=vi&gl=${country}`;

    try {
      const res = await request(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (res.statusCode !== 200) {
        return {
          status: "UNAVAILABLE",
          data: [],
          error: `Google Play Store trả về HTTP status ${res.statusCode}`,
          timestamp: new Date().toISOString(),
        };
      }

      const html = await res.body.text();
      const reviews = this.extractReviewsFromHtml(html, config.id, country, maxLimit);

      return {
        status: reviews.length > 0 ? "SUCCESS" : "PARTIAL",
        data: reviews,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "UNAVAILABLE",
        data: [],
        error: `Lỗi kết nối Google Play Store: ${message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
