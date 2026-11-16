import { request } from "undici";
import type { RatingSnapshot, Review, CollectionStatus } from "../../core/types.js";
import { classifySentiment } from "../../core/sentiment.js";
import { randomUUID } from "node:crypto";

/**
 * Interface kết quả thử nghiệm POC cho Apple App Store
 */
export interface AppStorePocResult {
  snapshotStatus: CollectionStatus;
  reviewsStatus: CollectionStatus;
  snapshot?: RatingSnapshot;
  reviews: Review[];
  error?: string;
}

/**
 * Thử nghiệm truy vấn thông tin điểm đánh giá từ iTunes Lookup API
 * @param appStoreId ID ứng dụng trên Apple App Store (ví dụ: "6475161683")
 * @param country Mã quốc gia (mặc định: "vn")
 * @returns RatingSnapshot hoặc null nếu không thành công
 */
export async function fetchAppStoreLookupPoc(
  appStoreId: string,
  country: string = "vn"
): Promise<{ status: CollectionStatus; snapshot?: RatingSnapshot; error?: string }> {
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
        error: `Không tìm thấy ứng dụng với ID ${appStoreId} trên Store ${country}`,
      };
    }

    const appData = payload.results[0];
    const averageRating = Number((appData.averageUserRating ?? 0).toFixed(2));
    const totalRatings = appData.userRatingCount ?? 0;

    const snapshot: RatingSnapshot = {
      snapshotId: randomUUID(),
      appId: "uniclass",
      platform: "ios",
      averageRating,
      totalRatings,
      country,
      collectedAt: new Date().toISOString(),
    };

    return {
      status: "SUCCESS",
      snapshot,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "UNAVAILABLE",
      error: `Lỗi kết nối iTunes Lookup API: ${message}`,
    };
  }
}

/**
 * Thử nghiệm thu thập nhận xét người dùng từ Apple Customer Reviews RSS Feed
 * @param appStoreId ID ứng dụng trên App Store
 * @param country Mã quốc gia (mặc định: "vn")
 * @returns Danh sách nhận xét Review đã chuẩn hóa
 */
export async function fetchAppStoreRssPoc(
  appStoreId: string,
  country: string = "vn"
): Promise<{ status: CollectionStatus; reviews: Review[]; error?: string }> {
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
        reviews: [],
        error: `Apple RSS Feed trả về HTTP status ${res.statusCode}`,
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
    const reviews: Review[] = [];

    // Bỏ qua entry đầu tiên nếu là thông tin metadata ứng dụng
    const reviewEntries = rawEntries.length > 0 && rawEntries[0]["im:rating"] ? rawEntries : rawEntries.slice(1);

    for (const item of reviewEntries) {
      const rawId = item.id?.label || randomUUID();
      const rating = item["im:rating"]?.label ? parseInt(item["im:rating"].label, 10) : 5;
      const title = item.title?.label || null;
      const content = item.content?.label || "";
      const author = item.author?.name?.label || null;
      const createdAt = item.updated?.label || new Date().toISOString();

      reviews.push({
        id: `ios:${rawId}`,
        externalReviewId: rawId,
        appId: "uniclass",
        platform: "ios",
        rating,
        title,
        content,
        author,
        createdAt,
        country,
        sentiment: classifySentiment(rating),
        collectedAt: new Date().toISOString(),
      });
    }

    return {
      status: "SUCCESS",
      reviews,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "UNAVAILABLE",
      reviews: [],
      error: `Lỗi kết nối Apple RSS Feed: ${message}`,
    };
  }
}

/**
 * Tổng hợp POC cho nền tảng Apple App Store
 * @param appStoreId ID ứng dụng UniClass trên App Store
 * @param country Mã quốc gia
 */
export async function runAppStorePoc(
  appStoreId: string = "6475161683",
  country: string = "vn"
): Promise<AppStorePocResult> {
  const [lookupResult, rssResult] = await Promise.all([
    fetchAppStoreLookupPoc(appStoreId, country),
    fetchAppStoreRssPoc(appStoreId, country),
  ]);

  return {
    snapshotStatus: lookupResult.status,
    reviewsStatus: rssResult.status,
    snapshot: lookupResult.snapshot,
    reviews: rssResult.reviews,
    error: lookupResult.error || rssResult.error,
  };
}

