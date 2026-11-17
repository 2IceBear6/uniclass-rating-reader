import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { AnalyticsEngine } from "./index.js";
import { LocalStorageEngine } from "../storage/index.js";
import type { Review, RatingSnapshot, AppConfig } from "../core/types.js";
import { DailyStatsSchema } from "../core/schemas.js";

const TEST_ANALYTICS_DIR = path.resolve("./.data-test-analytics");

describe("Analytics Engine (Milestone 6)", () => {
  let storage: LocalStorageEngine;
  let analytics: AnalyticsEngine;

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
    await fs.mkdir(TEST_ANALYTICS_DIR, { recursive: true });
    storage = new LocalStorageEngine(TEST_ANALYTICS_DIR);
    analytics = new AnalyticsEngine({ storage });
    await storage.saveAppConfig(sampleAppConfig);
  });

  afterEach(async () => {
    await fs.rm(TEST_ANALYTICS_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("calculateDailyStatsFromReviews phân loại sentiment và tính trung bình rating chuẩn xác", () => {
    const reviews: Review[] = [
      {
        id: "android:r1",
        externalReviewId: "r1",
        appId: "uniclass",
        platform: "android",
        rating: 5,
        title: null,
        content: "Cực kỳ xuất sắc",
        author: "User 1",
        createdAt: "2026-11-16T08:00:00.000Z",
        country: "vn",
        sentiment: "positive",
        collectedAt: "2026-11-16T08:00:00.000Z",
      },
      {
        id: "android:r2",
        externalReviewId: "r2",
        appId: "uniclass",
        platform: "android",
        rating: 4,
        title: null,
        content: "Khá ổn",
        author: "User 2",
        createdAt: "2026-11-16T09:00:00.000Z",
        country: "vn",
        sentiment: "positive",
        collectedAt: "2026-11-16T09:00:00.000Z",
      },
      {
        id: "ios:r3",
        externalReviewId: "r3",
        appId: "uniclass",
        platform: "ios",
        rating: 3,
        title: "Bình thường",
        content: "Tạm được",
        author: "User 3",
        createdAt: "2026-11-16T10:00:00.000Z",
        country: "vn",
        sentiment: "neutral",
        collectedAt: "2026-11-16T10:00:00.000Z",
      },
      {
        id: "ios:r4",
        externalReviewId: "r4",
        appId: "uniclass",
        platform: "ios",
        rating: 1,
        title: "Lỗi",
        content: "Không vào được",
        author: "User 4",
        createdAt: "2026-11-16T11:00:00.000Z",
        country: "vn",
        sentiment: "negative",
        collectedAt: "2026-11-16T11:00:00.000Z",
      },
    ];

    const latestAndroidSnapshot: RatingSnapshot = {
      snapshotId: "00000000-0000-4000-8000-000000000001",
      appId: "uniclass",
      platform: "android",
      averageRating: 4.55,
      totalRatings: 1140,
      country: "vn",
      collectedAt: "2026-11-16T12:00:00.000Z",
    };

    const latestIosSnapshot: RatingSnapshot = {
      snapshotId: "00000000-0000-4000-8000-000000000002",
      appId: "uniclass",
      platform: "ios",
      averageRating: 4.18,
      totalRatings: 577,
      country: "vn",
      collectedAt: "2026-11-16T12:00:00.000Z",
    };

    const stats = analytics.calculateDailyStatsFromReviews(
      "uniclass",
      "2026-11-16",
      reviews,
      latestAndroidSnapshot,
      latestIosSnapshot
    );

    expect(stats.totalNewReviews).toBe(4);
    expect(stats.sentimentCounts.positive).toBe(2);
    expect(stats.sentimentCounts.neutral).toBe(1);
    expect(stats.sentimentCounts.negative).toBe(1);

    expect(stats.platformBreakdown.android.newReviews).toBe(2);
    expect(stats.platformBreakdown.android.averageRating).toBe(4.5); // (5 + 4) / 2

    expect(stats.platformBreakdown.ios.newReviews).toBe(2);
    expect(stats.platformBreakdown.ios.averageRating).toBe(2); // (3 + 1) / 2

    expect(stats.latestRatingSnapshot.android?.average).toBe(4.55);
    expect(stats.latestRatingSnapshot.ios?.total).toBe(577);

    // Xác thực qua Zod Schema
    const validated = DailyStatsSchema.parse(stats);
    expect(validated.date).toBe("2026-11-16");
  });

  it("computeAndSaveDailyStats tính toán từ filesystem và lưu vào file YYYY-MM-DD.json", async () => {
    // 1. Lưu snapshot
    await storage.saveRatingSnapshot({
      snapshotId: "00000000-0000-4000-8000-000000000010",
      appId: "uniclass",
      platform: "android",
      averageRating: 4.6,
      totalRatings: 1200,
      country: "vn",
      collectedAt: "2026-11-16T02:00:00.000Z",
    });

    // 2. Lưu reviews
    await storage.saveReviews("uniclass", [
      {
        id: "android:r10",
        externalReviewId: "r10",
        appId: "uniclass",
        platform: "android",
        rating: 5,
        title: null,
        content: "Học rất tốt",
        author: "Bé Mai",
        createdAt: "2026-11-16T08:00:00.000Z",
        country: "vn",
        sentiment: "positive",
        collectedAt: "2026-11-16T08:00:00.000Z",
      },
    ]);

    // 3. Tính và lưu thống kê ngày
    const stats = await analytics.computeAndSaveDailyStats("uniclass", "2026-11-16");
    expect(stats.totalNewReviews).toBe(1);
    expect(stats.sentimentCounts.positive).toBe(1);
    expect(stats.latestRatingSnapshot.android?.average).toBe(4.6);

    // 4. Đọc lại từ storage
    const readBack = await storage.getDailyStats("uniclass", "2026-11-16");
    expect(readBack).toEqual(stats);
  });

  it("getDailyStatsRange trả về danh sách thống kê theo khoảng ngày", async () => {
    // Lưu trước 2 ngày thống kê
    await storage.saveDailyStats({
      date: "2026-11-14",
      appId: "uniclass",
      totalNewReviews: 2,
      sentimentCounts: { positive: 2, neutral: 0, negative: 0 },
      platformBreakdown: {
        android: { newReviews: 2, averageRating: 5 },
        ios: { newReviews: 0, averageRating: 0 },
      },
      latestRatingSnapshot: {},
      calculatedAt: new Date().toISOString(),
    });

    await storage.saveDailyStats({
      date: "2026-11-15",
      appId: "uniclass",
      totalNewReviews: 3,
      sentimentCounts: { positive: 1, neutral: 1, negative: 1 },
      platformBreakdown: {
        android: { newReviews: 1, averageRating: 5 },
        ios: { newReviews: 2, averageRating: 2.5 },
      },
      latestRatingSnapshot: {},
      calculatedAt: new Date().toISOString(),
    });

    const range = await analytics.getDailyStatsRange("uniclass", "2026-11-14", "2026-11-15");
    expect(range.length).toBe(2);
    expect(range[0].date).toBe("2026-11-14");
    expect(range[1].date).toBe("2026-11-15");
  });

  it("getAppOverview cung cấp bức tranh tổng thể đa nền tảng chính xác", async () => {
    await storage.saveRatingSnapshot({
      snapshotId: "00000000-0000-4000-8000-000000000020",
      appId: "uniclass",
      platform: "android",
      averageRating: 4.55,
      totalRatings: 1140,
      ratingBreakdown: { 5: 921, 1: 68 },
      country: "vn",
      collectedAt: new Date().toISOString(),
    });

    await storage.saveRatingSnapshot({
      snapshotId: "00000000-0000-4000-8000-000000000021",
      appId: "uniclass",
      platform: "ios",
      averageRating: 4.18,
      totalRatings: 577,
      country: "vn",
      collectedAt: new Date().toISOString(),
    });

    await storage.saveReviews("uniclass", [
      {
        id: "android:r100",
        externalReviewId: "r100",
        appId: "uniclass",
        platform: "android",
        rating: 5,
        title: null,
        content: "Hay",
        author: "A",
        createdAt: new Date().toISOString(),
        country: "vn",
        sentiment: "positive",
        collectedAt: new Date().toISOString(),
      },
      {
        id: "ios:r200",
        externalReviewId: "r200",
        appId: "uniclass",
        platform: "ios",
        rating: 3,
        title: "Bình thường",
        content: "Tạm",
        author: "B",
        createdAt: new Date().toISOString(),
        country: "vn",
        sentiment: "neutral",
        collectedAt: new Date().toISOString(),
      },
    ]);

    const overview = await analytics.getAppOverview("uniclass");
    expect(overview.appId).toBe("uniclass");
    expect(overview.totalReviews).toBe(2);
    expect(overview.overallSentiment.positive).toBe(1);
    expect(overview.overallSentiment.neutral).toBe(1);
    expect(overview.overallSentiment.negative).toBe(0);

    expect(overview.platforms.android?.totalReviews).toBe(1);
    expect(overview.platforms.android?.averageRatingReviews).toBe(5);
    expect(overview.platforms.android?.latestSnapshot?.averageRating).toBe(4.55);

    expect(overview.platforms.ios?.totalReviews).toBe(1);
    expect(overview.platforms.ios?.averageRatingReviews).toBe(3);
    expect(overview.platforms.ios?.latestSnapshot?.averageRating).toBe(4.18);

    // Kiểm tra sentiment và ratingBreakdown theo từng nền tảng
    expect(overview.platforms.android?.sentiment?.positive).toBe(1);
    expect(overview.platforms.android?.ratingBreakdown?.[5]).toBe(1);
    expect(overview.platforms.ios?.sentiment?.neutral).toBe(1);
    expect(overview.platforms.ios?.ratingBreakdown?.[3]).toBe(1);
    expect(overview.overallRatingBreakdown?.[5]).toBe(1);
    expect(overview.overallRatingBreakdown?.[3]).toBe(1);
  });
});

