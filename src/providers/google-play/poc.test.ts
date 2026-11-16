import { describe, it, expect } from "vitest";
import {
  parseGooglePlayRatingSnapshot,
  parseGooglePlayReviews,
  runGooglePlayPoc,
} from "./poc.js";

describe("Google Play Store POC", () => {
  const sampleHtml = `
    <html>
      <head>
        <title>Google Play Mock</title>
      </head>
      <body>
        <div aria-label="Được xếp hạng 4,5 sao/5 sao">4.5</div>
        <div aria-label="721 bài đánh giá 5 sao">721</div>
        <div aria-label="44 bài đánh giá 4 sao">44</div>
        <div aria-label="26 bài đánh giá 3 sao">26</div>
        <div aria-label="26 bài đánh giá 2 sao">26</div>
        <div aria-label="70 bài đánh giá 1 sao">70</div>

        <div class="X5PpBb">Nguyễn Văn Test</div>
        <div aria-label="Được xếp hạng 5 sao/5 sao"></div>
        <span class="bp9Aid">13 tháng 11, 2026</span>
        <div class="h3YV2d">Ứng dụng học tập tuyệt vời cho học sinh lớp 1-9</div>
        <div id="test-rev-1::2">1 người thấy bài đánh giá này hữu ích</div>
      </body>
    </html>
  `;

  it("bóc tách snapshot rating chính xác từ HTML mẫu", () => {
    const snapshot = parseGooglePlayRatingSnapshot(sampleHtml, "vn");
    expect(snapshot).toBeDefined();
    if (snapshot) {
      expect(snapshot.appId).toBe("uniclass");
      expect(snapshot.platform).toBe("android");
      expect(snapshot.averageRating).toBe(4.5);
      expect(snapshot.totalRatings).toBe(887);
      expect(snapshot.ratingBreakdown?.[5]).toBe(721);
      expect(snapshot.ratingBreakdown?.[1]).toBe(70);
    }
  });

  it("bóc tách danh sách reviews chính xác từ HTML mẫu", () => {
    const reviews = parseGooglePlayReviews(sampleHtml, "vn");
    expect(reviews.length).toBeGreaterThan(0);
    const firstReview = reviews[0];
    expect(firstReview.author).toBe("Nguyễn Văn Test");
    expect(firstReview.rating).toBe(5);
    expect(firstReview.sentiment).toBe("positive");
    expect(firstReview.platform).toBe("android");
  });

  it("runGooglePlayPoc thu thập thành công dữ liệu trực tiếp từ Google Play của UniClass", async () => {
    const result = await runGooglePlayPoc("com.edupia.edupiaclass.vn", "vn");
    expect(result.snapshotStatus).toBe("SUCCESS");
    expect(result.snapshot).toBeDefined();
    if (result.snapshot) {
      expect(result.snapshot.appId).toBe("uniclass");
      expect(result.snapshot.platform).toBe("android");
      expect(result.snapshot.averageRating).toBeGreaterThanOrEqual(1);
      expect(result.snapshot.averageRating).toBeLessThanOrEqual(5);
      expect(result.snapshot.totalRatings).toBeGreaterThan(0);
      expect(result.snapshot.ratingBreakdown).toBeDefined();
    }
    expect(Array.isArray(result.reviews)).toBe(true);
  }, 20000);
});

