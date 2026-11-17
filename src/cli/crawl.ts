import * as path from "node:path";
import * as process from "node:process";
import { fileURLToPath } from "node:url";
import { LocalStorageEngine } from "../storage/index.js";
import { AnalyticsEngine } from "../analytics/index.js";
import { CollectorService } from "../collector/collector.js";

/**
 * Lệnh CLI thực hiện một chu kỳ thu thập dữ liệu ngay lập tức cho UniClass
 */
export async function runCliCrawl(): Promise<void> {
  console.log("====================================================");
  console.log("   UNICLASS RATING READER - THU THẬP DỮ LIỆU THỦ CÔNG");
  console.log("====================================================");

  const storage = new LocalStorageEngine("./data");
  const analytics = new AnalyticsEngine({ storage });
  const collector = new CollectorService({
    storage,
    analyticsEngine: analytics,
    maxReviewsPerStore: 200,
  });

  console.log("[Collector] Đang bắt đầu cào dữ liệu cho ứng dụng UniClass...");
  const startTime = Date.now();

  try {
    const result = await collector.collectApp("uniclass");
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n[Hoàn thành trong ${duration}s] Trạng thái: ${result.status}`);
    console.log("Chi tiết theo nền tảng:");

    if (result.platforms.android) {
      console.log(`  - Android (Google Play): ${result.platforms.android.status}`);
      console.log(`    + Snapshot Rating: ${result.platforms.android.snapshotSaved ? "Đã lưu" : "Không có"}`);
      console.log(`    + Reviews mới lưu: ${result.platforms.android.newReviewsSaved}`);
      console.log(`    + Reviews trùng lặp bỏ qua: ${result.platforms.android.duplicatesSkipped}`);
      if (result.platforms.android.error) {
        console.log(`    + Lỗi: ${result.platforms.android.error}`);
      }
    }

    if (result.platforms.ios) {
      console.log(`  - iOS (Apple App Store): ${result.platforms.ios.status}`);
      console.log(`    + Snapshot Rating: ${result.platforms.ios.snapshotSaved ? "Đã lưu" : "Không có"}`);
      console.log(`    + Reviews mới lưu: ${result.platforms.ios.newReviewsSaved}`);
      console.log(`    + Reviews trùng lặp bỏ qua: ${result.platforms.ios.duplicatesSkipped}`);
      if (result.platforms.ios.error) {
        console.log(`    + Lỗi: ${result.platforms.ios.error}`);
      }
    }

    console.log(`\nTổng số nhận xét mới lưu đợt này: ${result.totalNewReviewsSaved}`);

    // Hiển thị tóm tắt báo cáo ngày
    const today = new Date().toISOString().slice(0, 10);
    const stats = await analytics.getDailyStats("uniclass", today);
    if (stats) {
      console.log(`\n[Thống kê ngày ${today}]:`);
      console.log(`  - Tổng nhận xét mới trong ngày: ${stats.totalNewReviews}`);
      console.log(`  - Phân loại: ${stats.sentimentCounts.positive} tích cực | ${stats.sentimentCounts.neutral} trung tính | ${stats.sentimentCounts.negative} tiêu cực`);
    }

    console.log("====================================================");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("\n[Lỗi] Không thể thu thập dữ liệu:", message);
    process.exit(1);
  }
}

// Kiểm tra nếu được chạy trực tiếp từ CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runCliCrawl();
}
