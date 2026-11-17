import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { createServer } from "./index.js";
import { LocalStorageEngine } from "../storage/index.js";
import { CollectorService, CollectionScheduler } from "../collector/index.js";
import { AnalyticsEngine } from "../analytics/index.js";
import type { AppConfig, Review, RatingSnapshot } from "../core/types.js";

const TEST_API_DIR = path.resolve("./.data-test-api");

describe("Fastify REST API (Milestone 7)", () => {
  let app: FastifyInstance;
  let storage: LocalStorageEngine;
  let analytics: AnalyticsEngine;
  let collector: CollectorService;
  let scheduler: CollectionScheduler;

  const sampleAppConfig: AppConfig = {
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

  beforeEach(async () => {
    await fs.mkdir(TEST_API_DIR, { recursive: true });
    storage = new LocalStorageEngine(TEST_API_DIR);
    analytics = new AnalyticsEngine({ storage });
    collector = new CollectorService({ storage, analyticsEngine: analytics });
    scheduler = new CollectionScheduler(collector);

    await storage.saveAppConfig(sampleAppConfig);

    app = createServer({
      storage,
      analytics,
      collector,
      scheduler,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(TEST_API_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("GET / phục vụ giao diện Web Dashboard với mã 200 và header text/html", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.payload).toContain("UniClass Rating Reader");
    expect(res.payload).toContain("tab-overview");
    expect(res.payload).toContain("overview-btn-all");
    expect(res.payload).toContain("overview-btn-android");
    expect(res.payload).toContain("overview-btn-ios");
  });

  it("GET /dashboard điều hướng về / với mã 302", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/dashboard",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
  });

  it("GET /health trả về mã 200 và thông tin trạng thái dịch vụ", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("uniclass-rating-reader");
  });

  it("GET /api/apps trả về danh sách ứng dụng UniClass", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/apps",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.apps)).toBe(true);
    expect(body.apps.length).toBe(1);
    expect(body.apps[0].id).toBe("uniclass");
  });

  it("GET /api/apps/:appId trả về chi tiết cấu hình app UniClass", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/apps/uniclass",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe("uniclass");
    expect(body.platforms.android.packageId).toBe("com.edupia.edupiaclass.vn");
  });

  it("từ chối 403 Forbidden nếu appId không thuộc UniClass", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/apps/other-app-fake",
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain("Hệ thống chỉ hỗ trợ ứng dụng UniClass");
  });

  it("GET /api/apps/:appId/ratings trả về lịch sử snapshot ratings", async () => {
    const snapshot: RatingSnapshot = {
      snapshotId: "00000000-0000-4000-8000-000000000001",
      appId: "uniclass",
      platform: "android",
      averageRating: 4.6,
      totalRatings: 1000,
      country: "vn",
      collectedAt: new Date().toISOString(),
    };
    await storage.saveRatingSnapshot(snapshot);

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/uniclass/ratings",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.appId).toBe("uniclass");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].averageRating).toBe(4.6);
  });

  it("GET /api/apps/:appId/reviews trả về danh sách nhận xét có hỗ trợ phân trang và lọc", async () => {
    const reviews: Review[] = [
      {
        id: "android:rev1",
        externalReviewId: "rev1",
        appId: "uniclass",
        platform: "android",
        rating: 5,
        title: null,
        content: "Rất tốt",
        author: "A",
        createdAt: "2026-11-10T00:00:00.000Z",
        country: "vn",
        sentiment: "positive",
        collectedAt: new Date().toISOString(),
      },
      {
        id: "ios:rev2",
        externalReviewId: "rev2",
        appId: "uniclass",
        platform: "ios",
        rating: 1,
        title: "Tệ",
        content: "Hay lag",
        author: "B",
        createdAt: "2026-11-09T00:00:00.000Z",
        country: "vn",
        sentiment: "negative",
        collectedAt: new Date().toISOString(),
      },
    ];
    await storage.saveReviews("uniclass", reviews);

    // Lọc theo platform
    const resPlatform = await app.inject({
      method: "GET",
      url: "/api/apps/uniclass/reviews?platform=android",
    });
    expect(resPlatform.statusCode).toBe(200);
    const bodyPlatform = JSON.parse(resPlatform.payload);
    expect(bodyPlatform.total).toBe(1);
    expect(bodyPlatform.data[0].platform).toBe("android");

    // Lọc theo sentiment
    const resSentiment = await app.inject({
      method: "GET",
      url: "/api/apps/uniclass/reviews?sentiment=negative",
    });
    expect(resSentiment.statusCode).toBe(200);
    const bodySentiment = JSON.parse(resSentiment.payload);
    expect(bodySentiment.total).toBe(1);
    expect(bodySentiment.data[0].sentiment).toBe("negative");

    // Lọc theo date
    const resDate = await app.inject({
      method: "GET",
      url: "/api/apps/uniclass/reviews?date=2026-11-10",
    });
    expect(resDate.statusCode).toBe(200);
    const bodyDate = JSON.parse(resDate.payload);
    expect(bodyDate.total).toBe(1);
    expect(bodyDate.data[0].id).toBe("android:rev1");
  });

  it("GET /api/apps/:appId/analytics/daily trả về báo cáo ngày", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.inject({
      method: "GET",
      url: `/api/apps/uniclass/analytics/daily?date=${today}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.appId).toBe("uniclass");
    expect(body.date).toBe(today);
    expect(body.sentimentCounts).toBeDefined();
  });

  it("GET /api/apps/:appId/analytics/daily/history trả về danh sách lịch sử báo cáo ngày", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/apps/uniclass/analytics/daily/history",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.appId).toBe("uniclass");
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /api/apps/:appId/analytics/overview trả về bức tranh tổng quan", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/apps/uniclass/analytics/overview",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.appId).toBe("uniclass");
    expect(body.totalReviews).toBeDefined();
    expect(body.overallSentiment).toBeDefined();
    expect(body.overallRatingBreakdown).toBeDefined();
    expect(body.platforms.android?.sentiment).toBeDefined();
    expect(body.platforms.android?.ratingBreakdown).toBeDefined();
    expect(body.platforms.ios?.sentiment).toBeDefined();
    expect(body.platforms.ios?.ratingBreakdown).toBeDefined();
  });

  it("POST /api/collector/trigger kích hoạt thu thập thành công", async () => {
    vi.spyOn(collector, "collectApp").mockResolvedValue({
      runId: "api-run-1",
      appId: "uniclass",
      status: "SUCCESS",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 40,
      platforms: {},
      totalNewReviewsSaved: 0,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/collector/trigger",
      payload: { appId: "uniclass" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.runId).toBe("api-run-1");
    expect(body.status).toBe("SUCCESS");
  });

  it("GET /api/collector/status trả về trạng thái scheduler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/collector/status",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.cronExpression).toBeDefined();
    expect(body.isCollecting).toBe(false);
  });
});
