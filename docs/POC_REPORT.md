# Báo Cáo Thực Nghiệm Bóc Tách Dữ Liệu (POC Report)
## Dự án: UniClass Rating Reader - Milestone 2

---

### 1. Mục Tiêu & Phạm Vi Thực Nghiệm
Chứng minh tính khả thi kỹ thuật (Proof of Concept) của việc thu thập dữ liệu rating và reviews công khai từ 2 kho ứng dụng:
1. **Google Play Store (Android):** Ứng dụng UniClass (`com.edupia.edupiaclass.vn`).
2. **Apple App Store (iOS):** Ứng dụng UniClass (`6475161683`, Region: `vn`).

Mọi việc thu thập được thực hiện qua các kênh công khai, **không yêu cầu** tài khoản hay credentials quản trị (Google Play Console hoặc App Store Connect).

---

### 2. Kết Quả Thu Thập Trên Apple App Store (iOS)

#### 2.1. iTunes Lookup API
- **Endpoint:** `https://itunes.apple.com/lookup?id=6475161683&country=vn`
- **Giao thức:** HTTP GET (`undici`), trả về định dạng JSON chuẩn.
- **Tốc độ phản hồi:** ~300ms.
- **Trạng thái:** `SUCCESS` (Hoạt động ổn định 100%, không bị giới hạn tần suất trong thử nghiệm).
- **Dữ liệu thực tế bóc tách được:**
  - **Tên ứng dụng:** `Uniclass: Học Online Lớp 1-9`
  - **Điểm đánh giá trung bình (`averageUserRating`):** `4.18` / 5.0
  - **Tổng số lượt đánh giá (`userRatingCount`):** `577` lượt
  - **Thể loại:** `Education`

#### 2.2. Customer Reviews RSS Feed
- **Endpoint:** `https://itunes.apple.com/vn/rss/customerreviews/page=1/id=6475161683/sortby=mostrecent/json`
- **Kết quả:** Trả về HTTP 200, cấu trúc feed JSON hợp lệ.
- **Đặc điểm:** Mảng `feed.entry` trả về 0 phần tử do cơ chế rolling window của RSS Apple tại Storefront Việt Nam chỉ giữ các đánh giá có chữ viết mới nhất trong một khoảng thời gian ngắn hoặc người dùng chủ yếu rate sao mà không viết bài nhận xét.
- **Xử lý trạng thái chuẩn hóa:**
  - Khi `snapshot` thành công nhưng `reviews` rỗng: Đánh dấu trạng thái Snapshot là `SUCCESS`, Reviews là `SUCCESS` (với mảng 0 phần tử) hoặc `PARTIAL` nếu có sự gián đoạn mạng.

---

### 3. Kết Quả Thu Thập Trên Google Play Store (Android)

#### 3.1. Phân Tích Web HTML & Khối Dữ Liệu Nội Bộ `AF_initDataCallback (ds:5)`
- **URL công khai:** `https://play.google.com/store/apps/details?id=com.edupia.edupiaclass.vn&hl=vi&gl=vn`
- **Kỹ thuật trích xuất:**
  - Sử dụng HTTP Client `undici` tải trực tiếp trang HTML (~1.25 MB).
  - Khối dữ liệu cấu trúc `ds:5` nằm trong thẻ `<script>` chứa hàm `AF_initDataCallback` chứa dữ liệu phân tích chi tiết của Google Play.
- **Dữ liệu thực tế trích xuất được từ `ds:5` (Khối `[1][2][51]`):**
  - **Tên ứng dụng:** `UniClass: Học Online Lớp 1-9`
  - **Điểm đánh giá trung bình:** `4.55` / 5.0 (làm tròn từ `4.5478263`)
  - **Tổng số lượt đánh giá (`totalRatings`):** `1140` lượt
  - **Tổng số bài nhận xét có nội dung chữ:** `477` bài
  - **Phân bổ chi tiết số sao (`ratingBreakdown`):**
    - 5 sao: `921` lượt
    - 4 sao: `78` lượt
    - 3 sao: `49` lượt
    - 2 sao: `19` lượt
    - 1 sao: `68` lượt
  - **Cơ chế Fallback:** Bóc tách bằng regex qua các thuộc tính trợ năng `aria-label="Được xếp hạng 4,5 sao/5 sao"` và `aria-label="X bài đánh giá Y sao"`.

#### 3.2. Bóc Tách Reviews Người Dùng
- Bóc tách thành công các thẻ nhận xét hiển thị mặc định trên trang web với đầy đủ thông tin:
  - Tác giả (`author`), Điểm sao (`rating`), Ngày nhận xét (`createdAt`), Nội dung (`content`), Mã định danh (`externalReviewId`).
- Phân loại cảm xúc tự động (Sentiment):
  - 1-2 sao: `negative`
  - 3 sao: `neutral`
  - 4-5 sao: `positive`

---

### 4. Kết Luận & Đề Xuất Cho Milestone 3 (Providers & Normalization)

1. **Hiệu năng vượt trội của HTTP Parsing:**
   Việc bóc tách qua HTTP request kết hợp phân tích khối `ds:5` và HTML DOM cho tốc độ dưới **1 giây**, nhẹ nhàng và không tiêu tốn tài nguyên RAM của headless browser.
2. **Vai trò của Playwright:**
   Sử dụng Playwright headless như một giải pháp thứ cấp (secondary / fallback crawler) khi cần tương tác bấm nút "Xem tất cả bài đánh giá" để cuộn lấy thêm các trang review cũ hơn.
3. **Tính tương thích hoàn toàn:**
   Cả hai nguồn đều được ánh xạ chuẩn xác vào mô hình `RatingSnapshot` và `Review` định nghĩa tại `core`.

