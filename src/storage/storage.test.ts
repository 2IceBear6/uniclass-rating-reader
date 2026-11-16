import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  LocalStorageEngine,
  FileLockManager,
  atomicWriteJson,
  readJsonSafe,
  safeAppendJsonl,
  readJsonlFaultTolerant,
  ReviewDeduplicator,
} from "./index.js";
import type { AppConfig, RatingSnapshot, Review, DailyStats } from "../core/types.js";

const TEST_DATA_DIR = path.resolve("./.data-test-storage");

describe("Local Storage Engine (Milestone 4)", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Dọn dẹp thư mục test tạm thời
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe("FileLockManager", () => {
    it("nhận và giải phóng lock thành công", async () => {
      const lock = new FileLockManager(TEST_DATA_DIR, ".test.lock", { ttlMs: 2000 });
      const acquired = await lock.acquire();
      expect(acquired).toBe(true);

      const lockFilePath = path.join(TEST_DATA_DIR, ".test.lock");
      const exists = await fs
        .stat(lockFilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      await lock.release();
      const existsAfter = await fs
        .stat(lockFilePath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it("withLock thực thi tác vụ an toàn và tự động giải phóng lock", async () => {
      const lock = new FileLockManager(TEST_DATA_DIR, ".test2.lock");
      let executed = false;

      const result = await lock.withLock(async () => {
        executed = true;
        return "result-123";
      });

      expect(executed).toBe(true);
      expect(result).toBe("result-123");

      const lockFilePath = path.join(TEST_DATA_DIR, ".test2.lock");
      const exists = await fs
        .stat(lockFilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("tự động dọn dẹp stale lock khi quá thời gian TTL", async () => {
      const lockPath = path.join(TEST_DATA_DIR, ".stale.lock");
      // Tạo file lock giả định bị bỏ lại từ trước
      await fs.writeFile(lockPath, JSON.stringify({ pid: 99999, acquiredAt: "2020-01-01" }));

      // Đặt mtime lùi về quá khứ để giả lập lock đã hết hạn
      const past = new Date(Date.now() - 100000);
      await fs.utimes(lockPath, past, past);

      const lock = new FileLockManager(TEST_DATA_DIR, ".stale.lock", { ttlMs: 1000 });
      const acquired = await lock.acquire();
      expect(acquired).toBe(true);
      await lock.release();
    });
  });

  describe("Atomic Write", () => {
    it("atomicWriteJson và readJsonSafe hoạt động chính xác", async () => {
      const testJsonPath = path.join(TEST_DATA_DIR, "sub", "test.json");
      const payload = { name: "UniClass", version: 1 };

      await atomicWriteJson(testJsonPath, payload);
      const readBack = await readJsonSafe<typeof payload>(testJsonPath);

      expect(readBack).toEqual(payload);
    });

    it("readJsonSafe trả về null khi tệp không tồn tại", async () => {
      const nonExistent = path.join(TEST_DATA_DIR, "not-found.json");
      const data = await readJsonSafe(nonExistent);
      expect(data).toBeNull();
    });
  });

  describe("JSONL Safe Append & Fault Tolerant Reader", () => {
    it("safeAppendJsonl ghi nối chính xác từng dòng JSON", async () => {
      const jsonlPath = path.join(TEST_DATA_DIR, "test.jsonl");
      await safeAppendJsonl(jsonlPath, [{ id: 1 }, { id: 2 }]);
      await safeAppendJsonl(jsonlPath, [{ id: 3 }]);

      const records = await readJsonlFaultTolerant<{ id: number }>(jsonlPath);
      expect(records).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it("safeAppendJsonl tự động chèn ngắt dòng nếu file cũ thiếu ngắt dòng cuối", async () => {
      const jsonlPath = path.join(TEST_DATA_DIR, "broken-trailing.jsonl");
      // Ghi thủ công chuỗi thiếu \n ở cuối
      await fs.writeFile(jsonlPath, '{"id":100}', "utf8");

      await safeAppendJsonl(jsonlPath, [{ id: 200 }]);

      const records = await readJsonlFaultTolerant<{ id: number }>(jsonlPath);
      expect(records).toEqual([{ id: 100 }, { id: 200 }]);
    });

    it("readJsonlFaultTolerant bỏ qua dòng hỏng mà không làm đổ vỡ", async () => {
      const jsonlPath = path.join(TEST_DATA_DIR, "corrupt.jsonl");
      const corruptContent = `{"id":1}\nCORRUPT_BROKEN_JSON_LINE\n{"id":3}\n`;
      await fs.writeFile(jsonlPath, corruptContent, "utf8");

      const records = await readJsonlFaultTolerant<{ id: number }>(jsonlPath);
      expect(records).toEqual([{ id: 1 }, { id: 3 }]);
    });
  });

  describe("ReviewDeduplicator", () => {
    it("phát hiện và loại bỏ review trùng lặp dựa trên composite key", () => {
      const existing: Review = {
        id: "android:rev_1",
        externalReviewId: "rev_1",
        appId: "uniclass",
        platform: "android",
        rating: 5,
        title: null,
        content: "Hay",
        author: "User A",
        createdAt: new Date().toISOString(),
        country: "vn",
        sentiment: "positive",
        collectedAt: new Date().toISOString(),
      };

      const dedup = new ReviewDeduplicator([existing]);
      expect(dedup.has(existing)).toBe(true);

      const incoming: Review[] = [
        existing, // Trùng
        {
          id: "android:rev_2",
          externalReviewId: "rev_2",
          appId: "uniclass",
          platform: "android",
          rating: 4,
          title: null,
          content: "Tốt",
          author: "User B",
          createdAt: new Date().toISOString(),
          country: "vn",
          sentiment: "positive",
          collectedAt: new Date().toISOString(),
        },
      ];

      const { newReviews, duplicateCount } = dedup.filterNewReviews(incoming);
      expect(duplicateCount).toBe(1);
      expect(newReviews.length).toBe(1);
      expect(newReviews[0].externalReviewId).toBe("rev_2");
    });
  });

  describe("LocalStorageEngine Tích Hợp Toàn Diện", () => {
    it("lưu và đọc cấu hình AppConfig thành công", async () => {
      const storage = new LocalStorageEngine(TEST_DATA_DIR);
      const appConfig: AppConfig = {
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

      await storage.saveAppConfig(appConfig);
      const readBack = await storage.getAppConfig("uniclass");
      expect(readBack).toEqual(appConfig);
    });

    it("lưu và đọc lịch sử RatingSnapshot", async () => {
      const storage = new LocalStorageEngine(TEST_DATA_DIR);
      const snapshot: RatingSnapshot = {
        snapshotId: "a0000000-0000-4000-8000-000000000001",
        appId: "uniclass",
        platform: "android",
        averageRating: 4.5,
        totalRatings: 1000,
        ratingBreakdown: { 5: 800, 1: 50 },
        country: "vn",
        collectedAt: new Date().toISOString(),
      };

      await storage.saveRatingSnapshot(snapshot);
      const history = await storage.getRatingSnapshots("uniclass");
      expect(history.length).toBe(1);
      expect(history[0].averageRating).toBe(4.5);
    });

    it("khử trùng lặp khi lưu danh sách nhận xét reviews.jsonl", async () => {
      const storage = new LocalStorageEngine(TEST_DATA_DIR);
      const review1: Review = {
        id: "android:r1",
        externalReviewId: "r1",
        appId: "uniclass",
        platform: "android",
        rating: 5,
        title: null,
        content: "Ứng dụng rất bổ ích",
        author: "Nam",
        createdAt: new Date().toISOString(),
        country: "vn",
        sentiment: "positive",
        collectedAt: new Date().toISOString(),
      };

      const review2: Review = {
        id: "ios:r2",
        externalReviewId: "r2",
        appId: "uniclass",
        platform: "ios",
        rating: 2,
        title: "Lag",
        content: "Hơi chậm khi vào bài",
        author: "Lan",
        createdAt: new Date().toISOString(),
        country: "vn",
        sentiment: "negative",
        collectedAt: new Date().toISOString(),
      };

      // Lần 1: Lưu review 1 và 2
      const res1 = await storage.saveReviews("uniclass", [review1, review2]);
      expect(res1.savedCount).toBe(2);
      expect(res1.duplicateCount).toBe(0);

      // Lần 2: Thử lưu lại review 1 (trùng) và thêm review 3 (mới)
      const review3: Review = {
        ...review1,
        id: "android:r3",
        externalReviewId: "r3",
      };

      const res2 = await storage.saveReviews("uniclass", [review1, review3]);
      expect(res2.savedCount).toBe(1);
      expect(res2.duplicateCount).toBe(1);
      expect(res2.newReviews[0].id).toBe("android:r3");

      // Kiểm tra đọc và lọc
      const allReviews = await storage.getReviews("uniclass");
      expect(allReviews.length).toBe(3);

      const negativeReviews = await storage.getReviews("uniclass", { sentiment: "negative" });
      expect(negativeReviews.length).toBe(1);
      expect(negativeReviews[0].id).toBe("ios:r2");
    });

    it("lưu và đọc DailyStats thành công", async () => {
      const storage = new LocalStorageEngine(TEST_DATA_DIR);
      const stats: DailyStats = {
        date: "2026-11-16",
        appId: "uniclass",
        totalNewReviews: 10,
        sentimentCounts: {
          positive: 8,
          neutral: 1,
          negative: 1,
        },
        platformBreakdown: {
          android: { newReviews: 6, averageRating: 4.6 },
          ios: { newReviews: 4, averageRating: 4.2 },
        },
        latestRatingSnapshot: {
          android: { average: 4.55, total: 1140 },
          ios: { average: 4.18, total: 577 },
        },
        calculatedAt: new Date().toISOString(),
      };

      await storage.saveDailyStats(stats);
      const readBack = await storage.getDailyStats("uniclass", "2026-11-16");
      expect(readBack).toEqual(stats);
    });

    it("tạo bản sao lưu backup an toàn", async () => {
      const storage = new LocalStorageEngine(TEST_DATA_DIR);
      await storage.saveAppConfig({
        id: "uniclass",
        name: "UniClass",
        organization: "UniClass",
        scope: "uniclass-only",
        platforms: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const backupPath = await storage.createBackup("uniclass");
      expect(backupPath).toContain("backups");

      const backupConfigExists = await fs
        .stat(path.join(backupPath, "app.json"))
        .then(() => true)
        .catch(() => false);
      expect(backupConfigExists).toBe(true);
    });
  });
});
