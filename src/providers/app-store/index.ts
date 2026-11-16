import type {
  IStoreProvider,
  AppConfig,
  ProviderResult,
  RatingSnapshot,
  Review,
  SupportedPlatform,
} from "../../core/types.js";

/**
 * Lớp cung cấp dữ liệu từ Apple App Store cho ứng dụng UniClass
 */
export class AppStoreProvider implements IStoreProvider {
  public readonly platform: SupportedPlatform = "ios";

  /**
   * Khởi tạo AppStoreProvider
   */
  constructor() {}

  /**
   * Thu thập ảnh chụp điểm đánh giá và tổng số rating trên Apple App Store
   * @param _config Cấu hình ứng dụng UniClass
   */
  async fetchRatingSnapshot(_config: AppConfig): Promise<ProviderResult<RatingSnapshot>> {
    return {
      status: "UNAVAILABLE",
      error: "AppStoreProvider chưa được triển khai đầy đủ (sẽ hoàn thiện tại Milestone 2/3)",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Thu thập danh sách nhận xét mới nhất trên Apple App Store
   * @param _config Cấu hình ứng dụng UniClass
   * @param _options Tùy chọn số lượng nhận xét
   */
  async fetchReviews(
    _config: AppConfig,
    _options?: { maxCount?: number }
  ): Promise<ProviderResult<Review[]>> {
    return {
      status: "UNAVAILABLE",
      error: "AppStoreProvider chưa được triển khai đầy đủ (sẽ hoàn thiện tại Milestone 2/3)",
      timestamp: new Date().toISOString(),
    };
  }
}

