import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { CollectorService, CollectionScheduler } from "./index.js";
import { LocalStorageEngine } from "../storage/index.js";
import { GooglePlayProvider } from "../providers/google-play/index.js";
import { AppStoreProvider } from "../providers/app-store/index.js";
import type { AppConfig, RatingSnapshot, Review } from "../core/types.js";
import { CollectionCycleResultSchema } from "../core/schemas.js";

const TEST_COLLECTOR_DIR = path.resolve("./.data-test-collector");

describe("Collector & Scheduler (Milestone 5)", () => {
  let storage: LocalStorageEngine;

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
    await fs.mkdir(TEST_COLLECTOR_DIR, { recursive: true });
    storage = new LocalStorageEngine(TEST_COLLECTOR_DIR);
    await storage.saveAppConfig(sampleAppConfig);
  });

  afterEach(async () => {
    await fs.rm(TEST_COLLECTOR_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe("CollectorService", () => {
    it("thực hiện một chu kỳ thu thập hoàn chỉnh cho ứng dụng UniClass", async () => {
      // Giả lập 2 Provider trả về kết quả thành công
      const mockGpProvider = new GooglePlayProvider();
      const mockSnapshotAndroid: RatingSnapshot = {
        snapshotId: "00000000-0000-4000-8000-000000000001",
        appId: "uniclass",
        platform: "android",
        averageRating: 4.55,
        totalRatings: 1140,
        ratingBreakdown: { 5: 921, 4: 78, 3: 49, 2: 19, 1: 68 },
        country: "vn",
        collectedAt: new Date().toISOString(),
      };
      const mockReviewsAndroid: Review[] = [
        {
          id: "android:r1",
          externalReviewId: "r1",
          appId: "uniclass",
          platform: "android",
          rating: 5,
          title: null,
          content: "Rất hay",
          author: "Học sinh A",
          createdAt: new Date().toISOString(),
          country: "vn",
          sentiment: "positive",
          collectedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(mockGpProvider, "fetchRatingSnapshot").mockResolvedValue({
        status: "SUCCESS",
        data: mockSnapshotAndroid,
        timestamp: new Date().toISOString(),
      });
      vi.spyOn(mockGpProvider, "fetchReviews").mockResolvedValue({
        status: "SUCCESS",
        data: mockReviewsAndroid,
        timestamp: new Date().toISOString(),
      });

      const mockAsProvider = new AppStoreProvider();
      const mockSnapshotIos: RatingSnapshot = {
        snapshotId: "00000000-0000-4000-8000-000000000002",
        appId: "uniclass",
        platform: "ios",
        averageRating: 4.18,
        totalRatings: 577,
        country: "vn",
        collectedAt: new Date().toISOString(),
      };

      vi.spyOn(mockAsProvider, "fetchRatingSnapshot").mockResolvedValue({
        status: "SUCCESS",
        data: mockSnapshotIos,
        timestamp: new Date().toISOString(),
      });
      vi.spyOn(mockAsProvider, "fetchReviews").mockResolvedValue({
        status: "SUCCESS",
        data: [],
        timestamp: new Date().toISOString(),
      });

      const collector = new CollectorService({
        storage,
        googlePlayProvider: mockGpProvider,
        appStoreProvider: mockAsProvider,
      });

      const result = await collector.collectApp("uniclass");

      // Xác thực kết quả chu kỳ thu thập
      expect(result.status).toBe("SUCCESS");
      expect(result.appId).toBe("uniclass");
      expect(result.platforms.android?.status).toBe("SUCCESS");
      expect(result.platforms.android?.snapshotSaved).toBe(true);
      expect(result.platforms.android?.newReviewsSaved).toBe(1);

      expect(result.platforms.ios?.status).toBe("SUCCESS");
      expect(result.platforms.ios?.snapshotSaved).toBe(true);
      expect(result.totalNewReviewsSaved).toBe(1);

      // Xác thực cấu trúc qua Zod schema
      const validated = CollectionCycleResultSchema.parse(result);
      expect(validated.runId).toBeDefined();

      // Kiểm tra dữ liệu đã được lưu trữ thực tế trong filesystem
      const savedSnapshots = await storage.getRatingSnapshots("uniclass");
      expect(savedSnapshots.length).toBe(2);

      const savedReviews = await storage.getReviews("uniclass");
      expect(savedReviews.length).toBe(1);
    });

    it("xử lý phục hồi lỗi: khi một store bị lỗi thì kết quả đánh dấu PARTIAL và không làm gián đoạn store còn lại", async () => {
      const mockGpProvider = new GooglePlayProvider();
      vi.spyOn(mockGpProvider, "fetchRatingSnapshot").mockResolvedValue({
        status: "UNAVAILABLE",
        error: "Google Play bị lỗi mạng 503",
        timestamp: new Date().toISOString(),
      });
      vi.spyOn(mockGpProvider, "fetchReviews").mockResolvedValue({
        status: "UNAVAILABLE",
        data: [],
        error: "Google Play bị lỗi mạng 503",
        timestamp: new Date().toISOString(),
      });

      const mockAsProvider = new AppStoreProvider();
      vi.spyOn(mockAsProvider, "fetchRatingSnapshot").mockResolvedValue({
        status: "SUCCESS",
        data: {
          snapshotId: "00000000-0000-4000-8000-000000000003",
          appId: "uniclass",
          platform: "ios",
          averageRating: 4.2,
          totalRatings: 500,
          country: "vn",
          collectedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
      vi.spyOn(mockAsProvider, "fetchReviews").mockResolvedValue({
        status: "SUCCESS",
        data: [],
        timestamp: new Date().toISOString(),
      });

      const collector = new CollectorService({
        storage,
        googlePlayProvider: mockGpProvider,
        appStoreProvider: mockAsProvider,
      });

      const result = await collector.collectApp("uniclass");

      // Nền tảng iOS thành công nhưng Android lỗi -> Trạng thái PARTIAL
      expect(result.status).toBe("PARTIAL");
      expect(result.platforms.android?.status).toBe("UNAVAILABLE");
      expect(result.platforms.ios?.status).toBe("SUCCESS");
      expect(result.platforms.ios?.snapshotSaved).toBe(true);
    });

    it("ngăn chặn chạy đồng thời hai phiên thu thập cho cùng một ứng dụng", async () => {
      const mockGpProvider = new GooglePlayProvider();
      vi.spyOn(mockGpProvider, "fetchRatingSnapshot").mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ status: "SUCCESS", timestamp: new Date().toISOString() }), 100))
      );
      vi.spyOn(mockGpProvider, "fetchReviews").mockResolvedValue({
        status: "SUCCESS",
        data: [],
        timestamp: new Date().toISOString(),
      });

      const mockAsProvider = new AppStoreProvider();
      vi.spyOn(mockAsProvider, "fetchRatingSnapshot").mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ status: "SUCCESS", timestamp: new Date().toISOString() }), 100))
      );
      vi.spyOn(mockAsProvider, "fetchReviews").mockResolvedValue({
        status: "SUCCESS",
        data: [],
        timestamp: new Date().toISOString(),
      });

      const collector = new CollectorService({
        storage,
        googlePlayProvider: mockGpProvider,
        appStoreProvider: mockAsProvider,
      });

      const promise1 = collector.collectApp("uniclass");
      await expect(collector.collectApp("uniclass")).rejects.toThrow(
        "đang có một phiên thu thập dữ liệu đang chạy"
      );

      await promise1;
    });
  });

  describe("CollectionScheduler", () => {
    it("quản lý vòng đời start/stop và kiểm tra biểu thức cron", () => {
      const collector = new CollectorService({ storage });
      const scheduler = new CollectionScheduler(collector, {
        cronExpression: "0 */6 * * *",
      });

      expect(scheduler.getStatus().isRunning).toBe(false);

      scheduler.start();
      expect(scheduler.getStatus().isRunning).toBe(true);

      scheduler.stop();
      expect(scheduler.getStatus().isRunning).toBe(false);
    });

    it("báo lỗi nếu biểu thức cron không hợp lệ", () => {
      const collector = new CollectorService({ storage });
      const scheduler = new CollectionScheduler(collector, {
        cronExpression: "invalid-cron-format",
      });

      expect(() => scheduler.start()).toThrow("Biểu thức cron không hợp lệ");
    });

    it("triggerManual kích hoạt phiên thu thập và cập nhật thống kê scheduler", async () => {
      const collector = new CollectorService({ storage });
      vi.spyOn(collector, "collectApp").mockResolvedValue({
        runId: "manual-run-1",
        appId: "uniclass",
        status: "SUCCESS",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 50,
        platforms: {},
        totalNewReviewsSaved: 0,
      });

      const scheduler = new CollectionScheduler(collector);
      const result = await scheduler.triggerManual("uniclass");

      expect(result.runId).toBe("manual-run-1");
      const status = scheduler.getStatus();
      expect(status.runCount).toBe(1);
      expect(status.lastRunTime).toBeDefined();
      expect(status.lastResult?.status).toBe("SUCCESS");
    });
  });
});

