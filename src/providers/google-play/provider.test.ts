import { describe, it, expect } from "vitest";
import { GooglePlayProvider } from "./index.js";
import type { AppConfig } from "../../core/types.js";
import { RatingSnapshotSchema, ReviewSchema } from "../../core/schemas.js";

describe("GooglePlayProvider (Milestone 3)", () => {
  const validUniClassConfig: AppConfig = {
    id: "uniclass",
    name: "UniClass: Học Online Lớp 1-9",
    organization: "UniClass",
    scope: "uniclass-only",
    platforms: {
      android: {
        name: "UniClass: Học Online Lớp 1-9",
        packageId: "com.edupia.edupiaclass.vn",
        country: "vn",
        enabled: true,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const provider = new GooglePlayProvider();

  it("triển khai đúng thuộc tính platform là android", () => {
    expect(provider.platform).toBe("android");
  });

  it("thu thập RatingSnapshot thành công và vượt qua xác thực RatingSnapshotSchema", async () => {
    const result = await provider.fetchRatingSnapshot(validUniClassConfig);
    expect(result.status).toBe("SUCCESS");
    expect(result.data).toBeDefined();

    if (result.data) {
      // Xác thực nghiêm ngặt với Zod Schema
      const validated = RatingSnapshotSchema.parse(result.data);
      expect(validated.appId).toBe("uniclass");
      expect(validated.platform).toBe("android");
      expect(validated.country).toBe("vn");
      expect(validated.averageRating).toBeGreaterThanOrEqual(1);
      expect(validated.averageRating).toBeLessThanOrEqual(5);
      expect(validated.totalRatings).toBeGreaterThan(0);
      expect(validated.ratingBreakdown).toBeDefined();
    }
  }, 20000);

  it("nghiêm cấm và từ chối package development com.edupia.edupiaclass.vn.dev", async () => {
    const devConfig: AppConfig = {
      ...validUniClassConfig,
      platforms: {
        android: {
          name: "UniClass Dev",
          packageId: "com.edupia.edupiaclass.vn.dev",
          country: "vn",
          enabled: true,
        },
      },
    };

    const result = await provider.fetchRatingSnapshot(devConfig);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.error).toContain("Package ID không hợp lệ");
  });

  it("từ chối thu thập khi nền tảng Android bị vô hiệu hóa", async () => {
    const disabledConfig: AppConfig = {
      ...validUniClassConfig,
      platforms: {
        android: {
          ...validUniClassConfig.platforms.android!,
          enabled: false,
        },
      },
    };

    const result = await provider.fetchRatingSnapshot(disabledConfig);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.error).toContain("đang bị vô hiệu hóa");
  });

  it("thu thập danh sách nhận xét qua fetchReviews và xác thực với ReviewSchema", async () => {
    const result = await provider.fetchReviews(validUniClassConfig, { maxCount: 5 });
    expect(result.status).toBe("SUCCESS");
    expect(Array.isArray(result.data)).toBe(true);

    if (result.data && result.data.length > 0) {
      expect(result.data.length).toBeLessThanOrEqual(5);
      for (const rev of result.data) {
        const validated = ReviewSchema.parse(rev);
        expect(validated.platform).toBe("android");
        expect(validated.appId).toBe("uniclass");
        expect(["positive", "neutral", "negative"]).toContain(validated.sentiment);
        expect(validated.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    }
  }, 20000);
});

