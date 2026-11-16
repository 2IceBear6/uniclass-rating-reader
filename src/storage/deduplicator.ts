import type { Review } from "../core/types.js";

/**
 * Công cụ khử trùng lặp nhận xét (Review Deduplicator) dựa trên khóa duy nhất platform:externalReviewId
 */
export class ReviewDeduplicator {
  private knownKeys: Set<string> = new Set();

  /**
   * Khởi tạo ReviewDeduplicator
   * @param initialReviews Danh sách nhận xét ban đầu để nạp vào index
   */
  constructor(initialReviews: Review[] = []) {
    this.registerReviews(initialReviews);
  }

  /**
   * Sinh khóa duy nhất cho một bài review
   * @param review Đối tượng nhận xét
   * @returns Chuỗi khóa duy nhất `${platform}:${externalReviewId}`
   */
  public static generateKey(review: Review): string {
    return review.id || `${review.platform}:${review.externalReviewId}`;
  }

  /**
   * Đăng ký một danh sách reviews vào tập hợp chỉ mục
   * @param reviews Danh sách reviews cần ghi nhớ
   */
  public registerReviews(reviews: Review[]): void {
    for (const rev of reviews) {
      const key = ReviewDeduplicator.generateKey(rev);
      this.knownKeys.add(key);
    }
  }

  /**
   * Kiểm tra xem một review đã từng tồn tại trong hệ thống hay chưa
   * @param review Đối tượng review cần kiểm tra
   */
  public has(review: Review): boolean {
    const key = ReviewDeduplicator.generateKey(review);
    return this.knownKeys.has(key);
  }

  /**
   * Lọc và tách riêng các reviews mới chưa từng xuất hiện trong hệ thống
   * Đồng thời tự động cập nhật index với các review mới này
   * @param incomingReviews Danh sách reviews vừa thu thập được
   * @returns Danh sách reviews mới và số lượng bài bị trùng lặp
   */
  public filterNewReviews(incomingReviews: Review[]): {
    newReviews: Review[];
    duplicateCount: number;
  } {
    const newReviews: Review[] = [];
    let duplicateCount = 0;

    for (const rev of incomingReviews) {
      const key = ReviewDeduplicator.generateKey(rev);
      if (this.knownKeys.has(key)) {
        duplicateCount++;
      } else {
        newReviews.push(rev);
        this.knownKeys.add(key);
      }
    }

    return {
      newReviews,
      duplicateCount,
    };
  }

  /**
   * Lấy tổng số lượng khóa nhận xét đang được theo dõi trong bộ nhớ
   */
  public size(): number {
    return this.knownKeys.size;
  }

  /**
   * Xóa toàn bộ chỉ mục trong bộ nhớ
   */
  public clear(): void {
    this.knownKeys.clear();
  }
}

