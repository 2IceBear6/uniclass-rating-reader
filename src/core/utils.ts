/**
 * Chuyển đổi các định dạng ngày tháng (bao gồm ngày Tiếng Việt) sang chuỗi ISO 8601 hợp lệ
 * @param dateStr Chuỗi ngày tháng đầu vào (ví dụ: "13 tháng 11, 2026" hoặc ISO 8601)
 * @returns Chuỗi ISO 8601 UTC chuẩn (ví dụ: "2026-11-13T00:00:00.000Z")
 */
export function normalizeDateToIso(dateStr: string): string {
  if (!dateStr || typeof dateStr !== "string") {
    return new Date().toISOString();
  }

  // 1. Kiểm tra nếu đã là ISO datetime hợp lệ
  const parsedTimestamp = Date.parse(dateStr);
  if (!isNaN(parsedTimestamp)) {
    return new Date(parsedTimestamp).toISOString();
  }

  // 2. Phân tích chuỗi ngày Tiếng Việt: "DD tháng MM, YYYY" hoặc "D tháng M, YYYY"
  const vnMatch = dateStr.match(/(\d{1,2})\s+tháng\s+(\d{1,2}),\s+(\d{4})/i);
  if (vnMatch) {
    const day = parseInt(vnMatch[1], 10);
    const month = parseInt(vnMatch[2], 10) - 1; // 0-indexed trong JS Date
    const year = parseInt(vnMatch[3], 10);
    const dateObj = new Date(Date.UTC(year, month, day, 0, 0, 0));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString();
    }
  }

  // Fallback về thời điểm hiện tại
  return new Date().toISOString();
}

