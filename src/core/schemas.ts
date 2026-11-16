import { z } from "zod";

/**
 * Zod Schema xác thực cấu hình nền tảng Android
 */
export const AndroidPlatformConfigSchema = z.object({
  name: z.string(),
  packageId: z.string().regex(/^com\.edupia\.edupiaclass\.vn$/, {
    message: "Chỉ chấp nhận package production của UniClass (com.edupia.edupiaclass.vn)",
  }),
  country: z.string().default("vn"),
  enabled: z.boolean().default(true),
});

/**
 * Zod Schema xác thực cấu hình nền tảng iOS
 */
export const IosPlatformConfigSchema = z.object({
  name: z.string(),
  appStoreId: z.string().regex(/^6475161683$/, {
    message: "Chỉ chấp nhận App Store ID của UniClass (6475161683)",
  }),
  country: z.string().default("vn"),
  enabled: z.boolean().default(true),
});

/**
 * Zod Schema xác thực cấu hình ứng dụng UniClass
 */
export const AppConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  organization: z.string().default("UniClass"),
  scope: z.literal("uniclass-only"),
  platforms: z.object({
    android: AndroidPlatformConfigSchema.optional(),
    ios: IosPlatformConfigSchema.optional(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Zod Schema xác thực ảnh chụp đánh giá rating (Rating Snapshot)
 */
export const RatingSnapshotSchema = z.object({
  snapshotId: z.string().uuid(),
  appId: z.string().min(1),
  platform: z.enum(["android", "ios"]),
  averageRating: z.number().min(0).max(5),
  totalRatings: z.number().int().nonnegative(),
  ratingBreakdown: z
    .object({
      1: z.number().int().nonnegative().optional(),
      2: z.number().int().nonnegative().optional(),
      3: z.number().int().nonnegative().optional(),
      4: z.number().int().nonnegative().optional(),
      5: z.number().int().nonnegative().optional(),
    })
    .optional(),
  country: z.string(),
  collectedAt: z.string().datetime(),
});

/**
 * Zod Schema xác thực nhận xét người dùng (Review)
 */
export const ReviewSchema = z.object({
  id: z.string().min(1),
  externalReviewId: z.string().min(1),
  appId: z.string().min(1),
  platform: z.enum(["android", "ios"]),
  rating: z.number().int().min(1).max(5),
  title: z.string().nullable(),
  content: z.string(),
  author: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable().optional(),
  country: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  collectedAt: z.string().datetime(),
});

/**
 * Zod Schema xác thực dữ liệu thống kê hàng ngày (DailyStats)
 */
export const DailyStatsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appId: z.string().min(1),
  totalNewReviews: z.number().int().nonnegative(),
  sentimentCounts: z.object({
    positive: z.number().int().nonnegative(),
    neutral: z.number().int().nonnegative(),
    negative: z.number().int().nonnegative(),
  }),
  platformBreakdown: z.object({
    android: z.object({
      newReviews: z.number().int().nonnegative(),
      averageRating: z.number().min(0).max(5),
    }),
    ios: z.object({
      newReviews: z.number().int().nonnegative(),
      averageRating: z.number().min(0).max(5),
    }),
  }),
  latestRatingSnapshot: z.object({
    android: z
      .object({
        average: z.number(),
        total: z.number(),
      })
      .optional(),
    ios: z
      .object({
        average: z.number(),
        total: z.number(),
      })
      .optional(),
  }),
  calculatedAt: z.string().datetime(),
});

/**
 * Zod Schema xác thực kết quả của một chu kỳ thu thập
 */
export const CollectionCycleResultSchema = z.object({
  runId: z.string().uuid(),
  appId: z.string().min(1),
  status: z.enum(["SUCCESS", "PARTIAL", "UNAVAILABLE"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  platforms: z.object({
    android: z
      .object({
        status: z.enum(["SUCCESS", "PARTIAL", "UNAVAILABLE"]),
        snapshotSaved: z.boolean(),
        reviewsCollected: z.number().int().nonnegative(),
        newReviewsSaved: z.number().int().nonnegative(),
        duplicatesSkipped: z.number().int().nonnegative(),
        error: z.string().optional(),
      })
      .optional(),
    ios: z
      .object({
        status: z.enum(["SUCCESS", "PARTIAL", "UNAVAILABLE"]),
        snapshotSaved: z.boolean(),
        reviewsCollected: z.number().int().nonnegative(),
        newReviewsSaved: z.number().int().nonnegative(),
        duplicatesSkipped: z.number().int().nonnegative(),
        error: z.string().optional(),
      })
      .optional(),
  }),
  totalNewReviewsSaved: z.number().int().nonnegative(),
  error: z.string().optional(),
});

/**
 * Zod Schema xác thực bản ghi nhật ký phiên thu thập
 */
export const CollectionLogSchema = z.object({
  logId: z.string().uuid(),
  timestamp: z.string().datetime(),
  cycleResult: CollectionCycleResultSchema,
});

