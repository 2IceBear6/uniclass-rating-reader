# Tài Liệu Đặc Tả Dự Án (Project Specification)
## Dự án: UniClass Rating Reader

---

### 1. Tổng Quan & Phạm Vi Dự Án (Project Scope)

- **Tên dự án:** UniClass Rating Reader.
- **Mục đích:** Thu thập, lưu trữ, chuẩn hóa và phân tích dữ liệu rating (đánh giá sao) và review (nhận xét) công khai của các ứng dụng di động thuộc hệ sinh thái **UniClass** trên Google Play Store (Android) và Apple App Store (iOS).
- **Phạm vi giám sát:**
  - **CHỈ** theo dõi các ứng dụng chính thức của UniClass.
  - **TUYỆT ĐỐI KHÔNG** xây dựng hệ thống thu thập dữ liệu chung cho mọi ứng dụng trên Store.
  - Hỗ trợ cơ chế mở rộng cấu hình để có thể bổ sung các ứng dụng khác thuộc UniClass trong tương lai, nhưng chặn tuyệt đối việc thêm các ứng dụng ngoài phạm vi UniClass.

#### Ứng dụng Production mục tiêu hiện tại:
1. **Android:**
   - **Tên ứng dụng:** UniClass: Học Online Lớp 1-9
   - **Package ID (Production):** `com.edupia.edupiaclass.vn`
   - *Lưu ý quan trọng:* Không sử dụng package development (`com.edupia.edupiaclass.vn.dev`).
2. **iOS:**
   - **Tên ứng dụng:** UniClass: Học Online Lớp 1-9
   - **App Store ID:** `6475161683`
   - **Country:** `vn`

---

### 2. Yêu Cầu Lưu Trữ Dữ Liệu (Storage Requirements)

Hệ thống tuân thủ nguyên tắc không phụ thuộc vào hệ quản trị cơ sở dữ liệu (Zero-Database Architecture):

- **NGHIÊM CẤM SỬ DỤNG:**
  - SQL / Database engines: PostgreSQL, MySQL, SQLite, MongoDB.
  - ORM / Query Builders: Drizzle ORM, Prisma.
  - In-memory cache engines ngoài quy trình: Redis.
- **Phương thức lưu trữ:** Lưu trữ trực tiếp trên Local Filesystem thông qua Node.js Filesystem APIs (`node:fs/promises`, `node:fs`).
- **Định dạng dữ liệu:**
  - `JSON`: Cấu hình ứng dụng (`app.json`), danh mục registry, và báo cáo thống kê hàng ngày (`daily-stats/*.json`).
  - `JSONL` (JSON Lines): Nhật ký nhận xét (`reviews.jsonl`), lịch sử đánh giá sao (`rating-history.jsonl`), và collection logs (`collection-logs/*.jsonl`).
- **Yêu cầu kỹ thuật đối với tầng Storage:**
  - **Atomic File Writes:** Cơ chế ghi file nguyên tử (ghi ra file tạm `.tmp` rồi rename) nhằm chống mất mát hoặc hỏng dữ liệu khi tiến trình bị gián đoạn.
  - **Review Deduplication:** Loại bỏ trùng lặp dựa trên khóa định danh duy nhất (`externalReviewId` kết hợp platform/app). Không lưu hoặc cộng dồn review đã tồn tại.
  - **Safe Append:** Ghi nối tiếp an toàn cho file JSONL, kiểm tra định dạng từng dòng, xử lý ngắt dòng chuẩn UTF-8.
  - **Error Recovery:** Khôi phục khi gặp file hỏng, dòng rác hoặc tiến trình crawl bị dừng đột ngột.
  - **Data Backup:** Cơ chế tạo bản sao lưu dữ liệu tự động trước các thao tác có khả năng thay đổi cấu trúc dữ liệu.
  - **Fault Tolerance:** Giữ nguyên vẹn dữ liệu lịch sử cũ khi một đợt thu thập (collection cycle) gặp lỗi hoặc bị gián đoạn mạng.
  - **Process Concurrency Lock:** Cơ chế khóa (file-lock / mutex) ngăn chặn nhiều tiến trình ghi đồng thời vào cùng một file dữ liệu.

---

### 3. Thu Thập Dữ Liệu (Data Collection)

Hệ thống hoạt động theo tiêu chuẩn tự động, khai thác các kênh thông tin công khai không đòi hỏi thông tin xác thực quản trị:

#### 3.1. Google Play Store (Android)
- **Đối tượng:** Chỉ thu thập cho ứng dụng UniClass đã được đăng ký (`com.edupia.edupiaclass.vn`).
- **Nguồn dữ liệu:** Trang web công khai trên Google Play Store (hoặc Playwright scraper cho các trường hợp nội dung kết xuất qua client JavaScript).
- **Yêu cầu ủy quyền:** Không sử dụng Google Play Console credentials hay private APIs.

#### 3.2. Apple App Store (iOS)
- **Đối tượng:** Chỉ thu thập cho ứng dụng UniClass đã đăng ký (ID: `6475161683`, Region: `vn`).
- **Nguồn dữ liệu:**
  - **iTunes Lookup API:** `https://itunes.apple.com/lookup?id=6475161683&country=vn` (lấy thông tin tổng quan, average rating, rating count).
  - **Customer Reviews RSS Feed:** `https://itunes.apple.com/vn/rss/customerreviews/id=6475161683/sortBy=mostRecent/json` (lấy danh sách review mới nhất).
- **Yêu cầu ủy quyền:** Không yêu cầu tài khoản hay API key App Store Connect.

#### 3.3. Nguyên tắc vận hành cào dữ liệu (Crawler Ethics & Safety)
- **Tuân thủ ranh giới:** Không vượt CAPTCHA, Cloudflare, bot-check hoặc bất kỳ cơ chế bypass vi phạm chính sách nào. Nếu bị chặn, báo cáo trạng thái `BLOCKED` hoặc chờ backoff hợp lý.
- **Phân loại trạng thái dữ liệu rõ ràng:**
  - `SUCCESS`: Dữ liệu thu thập đầy đủ và toàn vẹn.
  - `PARTIAL`: Dữ liệu thu thập một phần (ví dụ: lấy được metadata rating nhưng feed reviews bị timeout).
  - `UNAVAILABLE`: Nguồn dữ liệu không phản hồi hoặc không khả dụng.
- **Tính thực tế của nguồn:** Không giả định Store cung cấp 100% toàn bộ review trong lịch sử; chấp nhận và xử lý giới hạn phân trang (pagination limit) của RSS và Storefront.

---

### 4. Chỉ Số & Mô Hình Dữ Liệu (Metrics & Models)

#### 4.1. Rating (Ảnh chụp trạng thái đánh giá)
- `averageRating`: Điểm đánh giá trung bình (thang điểm 1.0 - 5.0).
- `totalRatings`: Tổng số lượt đánh giá ghi nhận trên store.
- `ratingBreakdown` (nếu có): Chi tiết số lượng 1 sao, 2 sao, 3 sao, 4 sao, 5 sao.
- `timestamp`: Thời điểm ghi nhận (ISO 8601 UTC).
- `country`: Quốc gia thu thập (`vn`).
- `platform`: `android` | `ios`.

#### 4.2. Reviews (Nhận xét người dùng)
- `externalReviewId`: ID định danh duy nhất của review trên store.
- `appId`: Mã định danh ứng dụng nội bộ (`uniclass`).
- `platform`: Nền tảng phát hành (`android` / `ios`).
- `rating`: Số sao người dùng chấm (1 - 5).
- `title`: Tiêu đề nhận xét (nếu có, đặc biệt trên iOS).
- `content`: Nội dung nhận xét của người dùng.
- `author`: Tên tác giả / người đánh giá (nếu có).
- `createdAt`: Ngày giờ đăng nhận xét.
- `updatedAt`: Ngày giờ chỉnh sửa nhận xét (nếu store cung cấp).
- `country`: Mã quốc gia (`vn`).
- `sentiment`: Phân loại cảm xúc (`positive` | `neutral` | `negative`).

#### 4.3. Quy tắc phân loại Sentiment mặc định
- **Negative (Tiêu cực):** Đánh giá 1 sao hoặc 2 sao.
- **Neutral (Trung tính):** Đánh giá 3 sao.
- **Positive (Tích cực):** Đánh giá 4 sao hoặc 5 sao.

#### 4.4. Thống Kê Hàng Ngày (Daily Statistics)
- `date`: Ngày thống kê (định dạng `YYYY-MM-DD`).
- `appId`: Mã ứng dụng.
- `newReviewsCount`: Số lượng review mới ghi nhận trong ngày (sau khi deduplication).
- `positiveCount`: Số lượng review tích cực trong ngày.
- `negativeCount`: Số lượng review tiêu cực trong ngày.
- `neutralCount`: Số lượng review trung tính trong ngày.
- `averageRatingDaily`: Điểm đánh giá trung bình của các review mới trong ngày.
- `latestSnapshotRating`: Điểm trung bình store ghi nhận vào snapshot cuối ngày.

---

### 5. Công Nghệ & Môi Trường (Technology Stack)

- **Runtime:** Node.js `20.19.5`.
- **Package Manager:** `npm` (nghiêm cấm dùng yarn hoặc pnpm).
- **Ngôn ngữ:** TypeScript `^5`.
- **Cấu hình TypeScript:**
  - `strict`: `true`
  - `moduleResolution`: `bundler`
  - `module`: `esnext`
  - `target`: `ES2017`
  - `jsx`: `react-jsx`
  - `isolatedModules`: `true`
- **Framework & Libraries cốt lõi:**
  - HTTP Server: `fastify` (^5).
  - Schema Validation: `zod` (^4).
  - HTTP Client: `undici` (^8).
  - Scraper / Headless Browser: `playwright`.
  - Scheduler: `node-cron`.
  - Unit / Integration Test: `vitest` (^4).
  - Linter: `eslint` (^9 Flat Config) + `typescript-eslint`.
  - Development runner: `tsx`.
- **Ràng buộc:** Không cài đặt Next.js cho giai đoạn MVP; không cài các thư viện phụ thuộc không cần thiết.

---

### 6. Cấu Trúc Dữ Liệu Filesystem Thực Tế (Local Storage Layout)

```
data/
  apps/
    uniclass/
      app.json                   # Cấu hình & thông tin meta của ứng dụng UniClass
      reviews.jsonl              # Toàn bộ danh sách nhận xét đã chuẩn hóa (mỗi dòng 1 JSON)
      rating-history.jsonl       # Lịch sử snapshot rating theo các phiên crawl
      daily-stats/               # Thư mục lưu thống kê tổng hợp theo từng ngày
        YYYY-MM-DD.json
  collection-logs/               # Nhật ký chi tiết của các lần thực thi crawl
    YYYY-MM-DD-collection.jsonl
  metadata/                      # Quản lý danh mục và trạng thái đồng bộ
    apps-registry.json
```

---

### 7. Kết Quả Bàn Giao Của Dự Án (Deliverables)

1. **Google Play Provider:** Module kết nối và bóc tách dữ liệu Android cho UniClass.
2. **App Store Provider:** Module kết nối iTunes Lookup API & RSS Feed iOS cho UniClass.
3. **Normalized Data Models:** Hệ thống schema Zod và TypeScript types chuẩn hóa dữ liệu xuyên nền tảng.
4. **Local File Storage Engine:** Thư viện xử lý đọc/ghi filesystem nguyên tử, deduplication, safe append và locking.
5. **Collection Scheduler:** Bộ lập lịch định kỳ thu thập dữ liệu với `node-cron`.
6. **Review Deduplication Engine:** Cơ chế lọc và loại bỏ trùng lặp review hiệu năng cao.
7. **Daily Analytics Engine:** Bộ máy tính toán và tổng hợp báo cáo chỉ số hàng ngày.
8. **Fastify REST API:** Cung cấp các endpoint truy vấn thông tin app, reviews, rating snapshots và daily analytics.
9. **Node.js SDK:** Thư viện client tinh gọn để các dịch vụ khác có thể tích hợp trực tiếp.
10. **Automated Test Suite:** Bộ kiểm thử tự động với Vitest đạt độ bao phủ cao.
11. **Technical Documentation:** Tài liệu kiến trúc, API spec và quy tắc vận hành.

