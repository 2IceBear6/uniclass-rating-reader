import { describe, it, expect } from "vitest";
import { AppStoreProvider } from "./index.js";
import type { AppConfig } from "../../core/types.js";
import { RatingSnapshotSchema, ReviewSchema } from "../../core/schemas.js";

describe("AppStoreProvider (Milestone 3)", () => {
  const validUniClassConfig: AppConfig = {
    id: "uniclass",
    name: "UniClass: Học Online Lớp 1-9",
    organization: "UniClass",
    scope: "uniclass-only",
    platforms: {
      ios: {
        name: "UniClass: Học Online Lớp 1-9",
        appStoreId: "6475161683",
        country: "vn",
        enabled: true,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const provider = new AppStoreProvider();

  it("triển khai đúng thuộc tính platform là ios", () => {
    expect(provider.platform).toBe("ios");
  });

  it("thu thập RatingSnapshot thành công và vượt qua xác thực RatingSnapshotSchema", async () => {
    const result = await provider.fetchRatingSnapshot(validUniClassConfig);
    expect(result.status).toBe("SUCCESS");
    expect(result.data).toBeDefined();

    if (result.data) {
      // Xác thực nghiêm ngặt với Zod Schema
      const validated = RatingSnapshotSchema.parse(result.data);
      expect(validated.appId).toBe("uniclass");
      expect(validated.platform).toBe("ios");
      expect(validated.country).toBe("vn");
      expect(validated.averageRating).toBeGreaterThanOrEqual(1);
      expect(validated.averageRating).toBeLessThanOrEqual(5);
      expect(validated.totalRatings).toBeGreaterThan(0);
    }
  }, 15000);

  it("từ chối thu thập khi App Store ID không phải là UniClass", async () => {
    const invalidConfig: AppConfig = {
      ...validUniClassConfig,
      platforms: {
        ios: {
          name: "Other App",
          appStoreId: "1234567890",
          country: "vn",
          enabled: true,
        },
      },
    };

    const result = await provider.fetchRatingSnapshot(invalidConfig);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.error).toContain("App Store ID không hợp lệ");
  });

  it("từ chối thu thập khi nền tảng iOS bị vô hiệu hóa", async () => {
    const disabledConfig: AppConfig = {
      ...validUniClassConfig,
      platforms: {
        ios: {
          ...validUniClassConfig.platforms.ios!,
          enabled: false,
        },
      },
    };

    const result = await provider.fetchRatingSnapshot(disabledConfig);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.error).toContain("đang bị vô hiệu hóa");
  });

  it("thu thập danh sách nhận xét qua fetchReviews và xác thực với ReviewSchema", async () => {
    const result = await provider.fetchReviews(validUniClassConfig, { maxCount: 10 });
    expect(result.status).toBe("SUCCESS");
    expect(Array.isArray(result.data)).toBe(true);

    if (result.data && result.data.length > 0) {
      for (const rev of result.data) {
        const validated = ReviewSchema.parse(rev);
        expect(validated.platform).toBe("ios");
        expect(validated.appId).toBe("uniclass");
      }
    }
  }, 15000);
});

