import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { UniClassRatingReader } from "./index.js";
import { createServer } from "../api/index.js";
import { LocalStorageEngine } from "../storage/index.js";
import type { AppConfig, Review, RatingSnapshot } from "../core/types.js";

const TEST_SDK_DIR = path.resolve("./.data-test-sdk");

describe("Node.js Client SDK (Milestone 7)", () => {
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
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await fs.mkdir(TEST_SDK_DIR, { recursive: true });
    storage = new LocalStorageEngine(TEST_SDK_DIR);
    await storage.saveAppConfig(sampleAppConfig);
  });

  afterEach(async () => {
    await fs.rm(TEST_SDK_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe("Chế độ Trực Tiếp (Local Filesystem Mode)", () => {
    it("đọc AppConfig, Reviews, RatingHistory và DailyStats trực tiếp từ file", async () => {
      const sdk = new UniClassRatingReader({ dataDir: TEST_SDK_DIR });

      // 1. Kiểm tra getAppConfig
      const config = await sdk.getAppConfig("uniclass");
      expect(config).toBeDefined();
      expect(config?.id).toBe("uniclass");
      expect(config?.name).toBe("UniClass: Học Online Lớp 1-9");

      // 2. Lưu và đọc snapshot
      const snapshot: RatingSnapshot = {
        snapshotId: "00000000-0000-4000-8000-000000000001",
        appId: "uniclass",
        platform: "android",
        averageRating: 4.5,
        totalRatings: 1000,
        country: "vn",
        collectedAt: new Date().toISOString(),
      };
      await storage.saveRatingSnapshot(snapshot);

      const history = await sdk.getRatingHistory("uniclass");
      expect(history.length).toBe(1);
      expect(history[0].averageRating).toBe(4.5);

      // 3. Lưu và đọc reviews
      const review: Review = {
        id: "android:r1",
        externalReviewId: "r1",
        appId: "uniclass",
        platform: "android",
        rating: 5,
        title: null,
        content: "Ứng dụng rất hữu ích",
        author: "Phụ huynh",
        createdAt: new Date().toISOString(),
        country: "vn",
        sentiment: "positive",
        collectedAt: new Date().toISOString(),
      };
      await storage.saveReviews("uniclass", [review]);

      const reviews = await sdk.getReviews("uniclass");
      expect(reviews.length).toBe(1);
      expect(reviews[0].sentiment).toBe("positive");

      // 4. Kiểm tra getAppOverview
      const overview = await sdk.getAppOverview("uniclass");
      expect(overview.totalReviews).toBe(1);
      expect(overview.overallSentiment.positive).toBe(1);

      // 5. Kiểm tra getCollectorStatus
      const status = await sdk.getCollectorStatus();
      expect(status.appId).toBe("uniclass");
      expect(status.isCollecting).toBe(false);
    });
  });

  describe("Chế độ Máy Khách HTTP (Remote REST API Mode)", () => {
    let server: FastifyInstance;
    let serverUrl: string;

    beforeEach(async () => {
      server = createServer({ storage });
      // Lắng nghe trên cổng ngẫu nhiên khả dụng của localhost
      await server.listen({ port: 0, host: "127.0.0.1" });
      const addr = server.server.address();
      const port = typeof addr === "object" && addr ? addr.port : 3000;
      serverUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
      await server.close();
    });

    it("truy vấn dữ liệu qua HTTP API thành công", async () => {
      const sdk = new UniClassRatingReader({ apiUrl: serverUrl });

      // 1. Kiểm tra getAppConfig qua API
      const config = await sdk.getAppConfig("uniclass");
      expect(config).toBeDefined();
      expect(config?.id).toBe("uniclass");

      // 2. Lưu review vào storage và đọc qua SDK HTTP
      const review: Review = {
        id: "android:r2",
        externalReviewId: "r2",
        appId: "uniclass",
        platform: "android",
        rating: 4,
        title: null,
        content: "Bài giảng tốt",
        author: "Học sinh B",
        createdAt: new Date().toISOString(),
        country: "vn",
        sentiment: "positive",
        collectedAt: new Date().toISOString(),
      };
      await storage.saveReviews("uniclass", [review]);

      const reviews = await sdk.getReviews("uniclass");
      expect(reviews.length).toBe(1);
      expect(reviews[0].id).toBe("android:r2");

      // 3. Kiểm tra getDailyStats qua API
      const today = new Date().toISOString().slice(0, 10);
      const stats = await sdk.getDailyStats("uniclass", today);
      expect(stats).toBeDefined();
      expect(stats?.date).toBe(today);

      // 4. Kiểm tra getCollectorStatus qua API
      const status = await sdk.getCollectorStatus();
      expect(status.isRunning).toBeDefined();
    });
  });
});
