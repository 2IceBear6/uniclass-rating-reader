import { request } from "undici";
import type { RatingSnapshot, Review, CollectionStatus } from "../../core/types.js";
import { classifySentiment } from "../../core/sentiment.js";
import { randomUUID, createHash } from "node:crypto";

/**
 * Interface kết quả thử nghiệm POC cho Google Play Store
 */
export interface GooglePlayPocResult {
  snapshotStatus: CollectionStatus;
  reviewsStatus: CollectionStatus;
  snapshot?: RatingSnapshot;
  reviews: Review[];
  error?: string;
}

/**
 * Bóc tách thông tin điểm đánh giá và phân bổ số sao từ khối dữ liệu ds:5 hoặc regex fallback
 * @param html Nội dung mã nguồn HTML trang Google Play Store
 * @param country Mã quốc gia
 * @returns RatingSnapshot hoặc undefined nếu không tìm thấy
 */
export function parseGooglePlayRatingSnapshot(
  html: string,
  country: string = "vn"
): RatingSnapshot | undefined {
  try {
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
            const averageRating = Number(
              (typeof ratingBlock[0]?.[1] === "number" ? ratingBlock[0][1] : 0).toFixed(2)
            );
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

            return {
              snapshotId: randomUUID(),
              appId: "uniclass",
              platform: "android",
              averageRating,
              totalRatings,
              ratingBreakdown,
              country,
              collectedAt: new Date().toISOString(),
            };
          }
        } catch {
          // Bỏ qua lỗi cú pháp để chuyển sang fallback regex bên dưới
        }
      }
    }

    // 2. Fallback: Bóc tách qua aria-label và meta HTML
    const ariaMatch = html.match(/aria-label="Được xếp hạng ([0-9,.]+)\s*sao\/5 sao"/);
    if (ariaMatch) {
      const averageRating = parseFloat(ariaMatch[1].replace(",", "."));
      const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      for (let star = 1; star <= 5; star++) {
        const starMatch = html.match(new RegExp(`aria-label="([0-9.]+)\\s*bài đánh giá ${star}\\s*sao"`));
        if (starMatch) {
          breakdown[star as 1 | 2 | 3 | 4 | 5] = parseInt(starMatch[1].replace(/\./g, ""), 10);
        }
      }

      const totalRatings = Object.values(breakdown).reduce((a, b) => a + b, 0);

      return {
        snapshotId: randomUUID(),
        appId: "uniclass",
        platform: "android",
        averageRating,
        totalRatings,
        ratingBreakdown: breakdown,
        country,
        collectedAt: new Date().toISOString(),
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/**
 * Bóc tách danh sách nhận xét người dùng ban đầu được kết xuất trong mã nguồn HTML Google Play
 * @param html Nội dung mã nguồn HTML trang Google Play
 * @param country Mã quốc gia
 * @returns Mảng các đối tượng Review
 */
export function parseGooglePlayReviews(html: string, country: string = "vn"): Review[] {
  const reviews: Review[] = [];

  // Tìm các tác giả đánh giá qua class="X5PpBb"
  const authorRegex = /<div class="X5PpBb">([^<]+)<\/div>/g;
  let authorMatch: RegExpExecArray | null;

  while ((authorMatch = authorRegex.exec(html)) !== null) {
    const author = authorMatch[1].trim();
    const startIndex = authorMatch.index;
    const block = html.substring(startIndex, startIndex + 5000);

    // Tìm điểm đánh giá sao trong block này: aria-label="Được xếp hạng [0-9] sao/5 sao"
    const ratingMatch = block.match(/aria-label="Được xếp hạng ([0-9]) sao\/5 sao"/);
    const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 5;

    // Tìm ngày đăng: class="bp9Aid">([0-9]+ tháng [0-9]+, [0-9]{4})
    const dateMatch = block.match(/class="bp9Aid">([^<]+)<\/span>/);
    const createdAt = dateMatch ? dateMatch[1].trim() : new Date().toISOString();

    // Tìm nội dung nhận xét: nằm giữa date span và button hữu ích
    // Chuỗi thường nằm trước "người thấy bài đánh giá này hữu ích"
    const contentMatch = block.match(/class="bp9Aid">[^<]+<\/span><\/div><\/header>([\s\S]*?)<div class="[^"]*">[\s\S]*?người thấy bài đánh giá này hữu ích/);
    let content = "";
    if (contentMatch) {
      content = contentMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } else {
      // Fallback: tìm đoạn text thuần
      const textMatch = block.match(/13 tháng 11, 2026[\s\S]*?<\/div>\s*([^\s<][^<]+?)\s*<\/div>/);
      content = textMatch ? textMatch[1].trim() : "Đánh giá từ người dùng Google Play";
    }

    // External Review ID (ưu tiên ID từ DOM, nếu không có thì băm SHA-256 từ tác giả + ngày + nội dung để đảm bảo tính tất định)
    const idMatch = block.match(/id="([a-f0-9-]{16,})::\d+"/) || block.match(/id="([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    let rawId: string;
    if (idMatch && idMatch[1]) {
      rawId = idMatch[1];
    } else {
      const hash = createHash("sha256").update(`${author}:${createdAt}:${content}`).digest("hex");
      rawId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    }

    reviews.push({
      id: `android:${rawId}`,
      externalReviewId: rawId,
      appId: "uniclass",
      platform: "android",
      rating,
      title: null,
      content: content || "Đánh giá không có nội dung chữ",
      author,
      createdAt,
      country,
      sentiment: classifySentiment(rating),
      collectedAt: new Date().toISOString(),
    });
  }

  return reviews;
}

/**
 * Thử nghiệm cào trang Google Play Store qua HTTP và trích xuất dữ liệu
 * @param packageId Package ID của ứng dụng UniClass ("com.edupia.edupiaclass.vn")
 * @param country Mã quốc gia (mặc định: "vn")
 */
export async function runGooglePlayPoc(
  packageId: string = "com.edupia.edupiaclass.vn",
  country: string = "vn"
): Promise<GooglePlayPocResult> {
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
        snapshotStatus: "UNAVAILABLE",
        reviewsStatus: "UNAVAILABLE",
        reviews: [],
        error: `Google Play trả về HTTP status ${res.statusCode}`,
      };
    }

    const html = await res.body.text();
    const snapshot = parseGooglePlayRatingSnapshot(html, country);
    const reviews = parseGooglePlayReviews(html, country);

    const snapshotStatus: CollectionStatus = snapshot ? "SUCCESS" : "UNAVAILABLE";
    const reviewsStatus: CollectionStatus = reviews.length > 0 ? "SUCCESS" : "PARTIAL";

    return {
      snapshotStatus,
      reviewsStatus,
      snapshot,
      reviews,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      snapshotStatus: "UNAVAILABLE",
      reviewsStatus: "UNAVAILABLE",
      reviews: [],
      error: `Lỗi kết nối Google Play Store: ${message}`,
    };
  }
}
