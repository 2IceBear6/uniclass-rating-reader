import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/api/index.js";
import { LocalStorageEngine } from "../src/storage/index.js";
import { CollectorService, CollectionScheduler } from "../src/collector/index.js";
import { AnalyticsEngine } from "../src/analytics/index.js";
import { GooglePlayProvider } from "../src/providers/google-play/index.js";
import { AppStoreProvider } from "../src/providers/app-store/index.js";
import { UniClassRatingReader } from "../src/sdk/index.js";
import type { AppConfig, RatingSnapshot, Review } from "../src/core/types.js";

const TEST_E2E_DIR = path.resolve("./.data-test-e2e");

describe("E2E Integration Test - Vòng Đời Hoàn Chỉnh Hệ Thống (Milestone 8)", () => {
  let server: FastifyInstance;
  let serverUrl: string;
  let storage: LocalStorageEngine;
  let analytics: AnalyticsEngine;
  let collector: CollectorService;
  let scheduler: CollectionScheduler;

  const uniClassAppConfig: AppConfig = {
    id: "uniclass",
    name: "UniClass: Học Online Lớp 1-9",
    organization: "UniClass",
    scope: "uniclass-only",
    platforms: {
      android: {
        name: "UniClass",
        packageId: "com.edupia.edupiaclass.vn",
        country: "vn",
        enabled: true,
      },
      ios: {
        name: "UniClass",
        appStoreId: "6475161683",
        country: "vn",
        enabled: true,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    // 1. Tạo thư mục dữ liệu test E2E riêng biệt
    await fs.mkdir(TEST_E2E_DIR, { recursive: true });

    storage = new LocalStorageEngine(TEST_E2E_DIR);
    analytics = new AnalyticsEngine({ storage });

    // Khởi tạo các Provider (có thể gọi trực tiếp hoặc dùng mock provider)
    const gpProvider = new GooglePlayProvider();
    const asProvider = new AppStoreProvider();

    collector = new CollectorService({
      storage,
      googlePlayProvider: gpProvider,
      appStoreProvider: asProvider,
      analyticsEngine: analytics,
      maxReviewsPerStore: 10,
    });

    scheduler = new CollectionScheduler(collector, {
      cronExpression: "0 */6 * * *",
    });

    // 2. Khởi tạo cấu hình ban đầu cho ứng dụng UniClass
    await storage.saveAppConfig(uniClassAppConfig);

    // 3. Khởi động Fastify REST API Server trên cổng ngẫu nhiên localhost
    server = createServer({
      storage,
      analytics,
      collector,
      scheduler,
    });

    await server.listen({ port: 0, host: "127.0.0.1" });
    const addr = server.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 3000;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.close();
    await fs.rm(TEST_E2E_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("Giai đoạn 1: Thu thập dữ liệu từ các store và lưu trữ an toàn vào filesystem", async () => {
    // Tạo sẵn 1 snapshot và review ban đầu mô phỏng phiên crawl
    const initialSnapshot: RatingSnapshot = {
      snapshotId: "00000000-0000-4000-8000-000000000001",
      appId: "uniclass",
      platform: "android",
      averageRating: 4.55,
      totalRatings: 1140,
      ratingBreakdown: { 5: 921, 4: 78, 3: 49, 2: 19, 1: 68 },
      country: "vn",
      collectedAt: new Date().toISOString(),
    };
    await storage.saveRatingSnapshot(initialSnapshot);

    const initialReview: Review = {
      id: "android:e2e_rev_1",
      externalReviewId: "e2e_rev_1",
      appId: "uniclass",
      platform: "android",
      rating: 5,
      title: null,
      content: "Bài giảng rất dễ hiểu",
      author: "Nguyễn Văn A",
      createdAt: new Date().toISOString(),
      country: "vn",
      sentiment: "positive",
      collectedAt: new Date().toISOString(),
    };
    const saveResult = await storage.saveReviews("uniclass", [initialReview]);
    expect(saveResult.savedCount).toBe(1);
    expect(saveResult.duplicateCount).toBe(0);

    // Kiểm tra file tồn tại trong filesystem
    const appDir = path.join(TEST_E2E_DIR, "apps", "uniclass");
    const reviewsPath = path.join(appDir, "reviews.jsonl");
    const historyPath = path.join(appDir, "rating-history.jsonl");

    const reviewsExist = await fs.stat(reviewsPath).then(() => true).catch(() => false);
    const historyExists = await fs.stat(historyPath).then(() => true).catch(() => false);

    expect(reviewsExist).toBe(true);
    expect(historyExists).toBe(true);
  });

  it("Giai đoạn 2: Khử trùng lặp khi tiếp nhận batch reviews tiếp theo", async () => {
    const duplicateReview: Review = {
      id: "android:e2e_rev_1", // Khóa trùng với bài trên
      externalReviewId: "e2e_rev_1",
      appId: "uniclass",
      platform: "android",
      rating: 5,
      title: null,
      content: "Bài giảng rất dễ hiểu",
      author: "Nguyễn Văn A",
      createdAt: new Date().toISOString(),
      country: "vn",
      sentiment: "positive",
      collectedAt: new Date().toISOString(),
    };

    const newReview: Review = {
      id: "ios:e2e_rev_2", // Khóa mới
      externalReviewId: "e2e_rev_2",
      appId: "uniclass",
      platform: "ios",
      rating: 4,
      title: "Ứng dụng tốt",
      content: "Giao diện đẹp",
      author: "Trần Thị B",
      createdAt: new Date().toISOString(),
      country: "vn",
      sentiment: "positive",
      collectedAt: new Date().toISOString(),
    };

    const saveResult = await storage.saveReviews("uniclass", [duplicateReview, newReview]);
    expect(saveResult.savedCount).toBe(1); // Chỉ lưu 1 bài mới
    expect(saveResult.duplicateCount).toBe(1); // Đã lọc bỏ 1 bài trùng

    const allReviews = await storage.getReviews("uniclass");
    expect(allReviews.length).toBe(2);
  });

  it("Giai đoạn 3: Tính toán và cập nhật thống kê Analytics Engine", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const dailyStats = await analytics.computeAndSaveDailyStats("uniclass", today);

    expect(dailyStats.date).toBe(today);
    expect(dailyStats.appId).toBe("uniclass");
    expect(dailyStats.totalNewReviews).toBe(2);
    expect(dailyStats.sentimentCounts.positive).toBe(2);
    expect(dailyStats.sentimentCounts.negative).toBe(0);

    // Kiểm tra tệp daily-stats/YYYY-MM-DD.json
    const statsPath = path.join(TEST_E2E_DIR, "apps", "uniclass", "daily-stats", `${today}.json`);
    const statsFileExists = await fs.stat(statsPath).then(() => true).catch(() => false);
    expect(statsFileExists).toBe(true);
  });

  it("Giai đoạn 4: Truy vấn toàn diện qua REST API", async () => {
    // 1. GET /api/apps/uniclass
    const appRes = await server.inject({ method: "GET", url: "/api/apps/uniclass" });
    expect(appRes.statusCode).toBe(200);
    const appBody = JSON.parse(appRes.payload);
    expect(appBody.id).toBe("uniclass");

    // 2. GET /api/apps/uniclass/reviews
    const revRes = await server.inject({ method: "GET", url: "/api/apps/uniclass/reviews" });
    expect(revRes.statusCode).toBe(200);
    const revBody = JSON.parse(revRes.payload);
    expect(revBody.total).toBe(2);

    // 3. GET /api/apps/uniclass/analytics/overview
    const overviewRes = await server.inject({
      method: "GET",
      url: "/api/apps/uniclass/analytics/overview",
    });
    expect(overviewRes.statusCode).toBe(200);
    const overviewBody = JSON.parse(overviewRes.payload);
    expect(overviewBody.totalReviews).toBe(2);
  });

  it("Giai đoạn 5: Tích hợp qua Node.js Client SDK (Chế độ Remote & Local)", async () => {
    // 1. Thử nghiệm qua SDK Remote Mode (HTTP)
    const remoteSdk = new UniClassRatingReader({ apiUrl: serverUrl });
    const remoteConfig = await remoteSdk.getAppConfig("uniclass");
    expect(remoteConfig?.name).toBe("UniClass: Học Online Lớp 1-9");

    const remoteReviews = await remoteSdk.getReviews("uniclass");
    expect(remoteReviews.length).toBe(2);

    const today = new Date().toISOString().slice(0, 10);
    const remoteStats = await remoteSdk.getDailyStats("uniclass", today);
    expect(remoteStats?.totalNewReviews).toBe(2);

    // 2. Thử nghiệm qua SDK Local Mode (Filesystem trực tiếp)
    const localSdk = new UniClassRatingReader({ dataDir: TEST_E2E_DIR });
    const localOverview = await localSdk.getAppOverview("uniclass");
    expect(localOverview.totalReviews).toBe(2);
    expect(localOverview.platforms.android?.totalReviews).toBe(1);
    expect(localOverview.platforms.ios?.totalReviews).toBe(1);
  });

  it("Giai đoạn 6: Kiểm tra bảo mật và ranh giới scope UniClass", async () => {
    // 1. API phải trả về 403 Forbidden nếu request gửi app ngoài phạm vi UniClass
    const forbiddenRes = await server.inject({
      method: "GET",
      url: "/api/apps/random-external-app",
    });
    expect(forbiddenRes.statusCode).toBe(403);
    const forbiddenBody = JSON.parse(forbiddenRes.payload);
    expect(forbiddenBody.error).toContain("Hệ thống chỉ hỗ trợ ứng dụng UniClass");

    // 2. SDK phải ném lỗi nếu truyền app ngoài phạm vi UniClass
    const localSdk = new UniClassRatingReader({ dataDir: TEST_E2E_DIR });
    await expect(localSdk.getAppConfig("facebook")).rejects.toThrow(
      "nghiêm cấm thu thập ứng dụng ngoài"
    );
  });
});

