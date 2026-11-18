import * as fs from "node:fs/promises";
import * as path from "node:path";
import { LocalStorageEngine } from "../storage/index.js";
import { AnalyticsEngine } from "../analytics/index.js";

/**
 * Xuất dữ liệu thống kê, danh sách nhận xét và giao diện Web Dashboard thành bộ tệp tĩnh cho GitHub Pages
 * @param outputDir Thư mục đầu ra cho website tĩnh (mặc định là "./dist-static")
 */
export async function exportStaticSite(outputDir = "./dist-static"): Promise<void> {
  console.log("====================================================");
  console.log("   UNICLASS RATING READER - XUẤT WEB TĨNH GITHUB PAGES");
  console.log("====================================================");

  const resolvedOutput = path.resolve(outputDir);
  const dataDir = path.join(resolvedOutput, "data");

  // Đảm bảo thư mục đầu ra và thư mục con data tồn tại
  await fs.mkdir(dataDir, { recursive: true });

  const storage = new LocalStorageEngine("./data");
  const analytics = new AnalyticsEngine({ storage });

  console.log("[Export] Đang đọc và tính toán dữ liệu tổng quan...");
  const overview = await analytics.getAppOverview("uniclass");

  console.log("[Export] Đang lấy danh sách toàn bộ nhận xét...");
  // Lấy tối đa 1000 bài nhận xét mới nhất cho giao diện tĩnh
  const reviews = await storage.getReviews("uniclass", { limit: 1000 });

  // 1. Ghi tệp overview.json
  const overviewPath = path.join(dataDir, "overview.json");
  await fs.writeFile(overviewPath, JSON.stringify(overview, null, 2), "utf-8");
  console.log(`[Export] Đã xuất: ${overviewPath}`);

  // 2. Ghi tệp reviews.json
  const reviewsPayload = {
    appId: "uniclass",
    limit: reviews.length,
    offset: 0,
    total: reviews.length,
    data: reviews,
  };
  const reviewsPath = path.join(dataDir, "reviews.json");
  await fs.writeFile(reviewsPath, JSON.stringify(reviewsPayload, null, 2), "utf-8");
  console.log(`[Export] Đã xuất: ${reviewsPath} (${reviews.length} nhận xét)`);

  // 3. Sao chép index.html từ src/web/ sang dist-static/
  const srcHtmlPath = path.resolve("src/web/index.html");
  const destHtmlPath = path.join(resolvedOutput, "index.html");
  const htmlContent = await fs.readFile(srcHtmlPath, "utf-8");
  await fs.writeFile(destHtmlPath, htmlContent, "utf-8");
  console.log(`[Export] Đã sao chép Web Dashboard: ${destHtmlPath}`);

  // 4. Tạo tệp .nojekyll để GitHub Pages không bỏ qua các tệp bắt đầu bằng dấu gạch dưới
  const noJekyllPath = path.join(resolvedOutput, ".nojekyll");
  await fs.writeFile(noJekyllPath, "", "utf-8");

  console.log("\n[Hoàn thành] Đã sẵn sàng để deploy lên GitHub Pages!");
  console.log("====================================================");
}

// Kiểm tra nếu chạy trực tiếp từ dòng lệnh
if (process.argv[1] && process.argv[1].includes("export-static")) {
  exportStaticSite().catch((err: unknown) => {
    console.error("[Lỗi xuất web tĩnh]:", err);
    process.exit(1);
  });
}

