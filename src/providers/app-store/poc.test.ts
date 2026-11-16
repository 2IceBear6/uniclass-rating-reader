import { describe, it, expect } from "vitest";
import { fetchAppStoreLookupPoc, fetchAppStoreRssPoc, runAppStorePoc } from "./poc.js";

describe("App Store POC", () => {
  it("truy vấn thành công thông tin đánh giá qua iTunes Lookup API cho UniClass (6475161683)", async () => {
    const result = await fetchAppStoreLookupPoc("6475161683", "vn");
    expect(result.status).toBe("SUCCESS");
    expect(result.snapshot).toBeDefined();
    if (result.snapshot) {
      expect(result.snapshot.appId).toBe("uniclass");
      expect(result.snapshot.platform).toBe("ios");
      expect(result.snapshot.country).toBe("vn");
      expect(result.snapshot.averageRating).toBeGreaterThanOrEqual(1);
      expect(result.snapshot.averageRating).toBeLessThanOrEqual(5);
      expect(result.snapshot.totalRatings).toBeGreaterThan(0);
    }
  }, 15000);

  it("xử lý trường hợp không tìm thấy ứng dụng với ID không tồn tại", async () => {
    const result = await fetchAppStoreLookupPoc("0000000000", "vn");
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.snapshot).toBeUndefined();
    expect(result.error).toBeDefined();
  }, 15000);

  it("thực hiện Customer Reviews RSS feed và trả về cấu trúc hợp lệ", async () => {
    const result = await fetchAppStoreRssPoc("6475161683", "vn");
    // RSS có thể SUCCESS với mảng reviews (dù rỗng do store chưa có review mới)
    expect(result.status).toBe("SUCCESS");
    expect(Array.isArray(result.reviews)).toBe(true);
  }, 15000);

  it("runAppStorePoc tổng hợp kết quả trạng thái rõ ràng", async () => {
    const result = await runAppStorePoc("6475161683", "vn");
    expect(result.snapshotStatus).toBe("SUCCESS");
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot?.totalRatings).toBeGreaterThan(0);
  }, 15000);
});

