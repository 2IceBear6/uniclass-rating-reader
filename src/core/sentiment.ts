import type { SentimentType } from "./types.js";

/**
 * Phân loại cảm xúc dựa trên số sao đánh giá của người dùng
 * - 1 đến 2 sao: Negative (Tiêu cực)
 * - 3 sao: Neutral (Trung tính)
 * - 4 đến 5 sao: Positive (Tích cực)
 * @param rating Số sao đánh giá (từ 1 đến 5)
 * @returns Loại cảm xúc (SentimentType)
 */
export function classifySentiment(rating: number): SentimentType {
  if (rating <= 2) {
    return "negative";
  }
  if (rating === 3) {
    return "neutral";
  }
  return "positive";
}

