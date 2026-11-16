# Tài Liệu Đặc Tả Kỹ Thuật (Technical Specification)
## Dự án: UniClass Rating Reader

---

### 1. Môi Trường & Cấu Hình Nền Tảng (Environment & Compiler Setup)

#### 1.1. Môi trường thực thi
- **Node.js:** Phiên bản cố định `20.19.5 LTS`.
- **Trình quản lý gói:** `npm`.
- **Hệ điều hành hỗ trợ:** Windows / Linux (sử dụng API đường dẫn độc lập nền tảng qua `node:path`).

#### 1.2. Cấu hình TypeScript (`tsconfig.json`)
Cấu hình bắt buộc theo tiêu chuẩn dự án:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "data"]
}
```

---

### 2. Thiết Kế Tầng Lưu Trữ File Cục Bộ (Local Storage Engine)

Hệ thống lưu trữ hoàn toàn bằng filesystem, không sử dụng bất kỳ database engine nào. Tầng lưu trữ chịu trách nhiệm đảm bảo tính toàn vẹn, hiệu năng và an toàn đồng thời.

```
       +---------------------------------------------+
       |           StorageEngine (Singleton)         |
       +---------------------------------------------+
              |                     |
     [FileLockManager]      [AtomicWriter / Appender]
              |                     |
     +--------v---------------------v----------------+
     |         data/apps/{appId}/                    |
     |         - reviews.jsonl                       |
     |         - rating-history.jsonl                |
     |         - daily-stats/{date}.json             |
     +-----------------------------------------------+
```

#### 2.1. Cơ chế Ghi Nguyên Tử (Atomic File Writes)
- Áp dụng cho các file JSON (cấu hình, daily statistics, registry).
- **Quy trình:**
  1. Ghi dữ liệu vào file tạm có đuôi `.tmp.[uuid]` hoặc `.tmp.[timestamp]` cùng thư mục với file đích (đảm bảo cùng phân vùng ổ đĩa).
  2. Thực hiện `fsync` để đảm bảo dữ liệu đã ghi xuống phiến đĩa vật lý.
  3. Sử dụng `fs.rename` (hoặc xử lý fallback trên Windows nếu file đích đang bị khóa đọc) để tráo đổi tên file nguyên tử.
  4. Nếu xảy ra lỗi giữa chừng, tự động dọn dẹp file `.tmp`, file dữ liệu gốc không bị ảnh hưởng.

#### 2.2. Cơ chế Ghi Nối An Toàn (Safe Append cho JSONL)
- Áp dụng cho `reviews.jsonl`, `rating-history.jsonl` và `collection-logs/*.jsonl`.
- **Quy trình:**
  1. Kiểm tra dòng cuối cùng của file hiện tại: nếu thiếu ký tự xuống dòng `\n`, tự động chèn `\n` trước khi ghi dòng mới.
  2. Mỗi bản ghi được tuần tự hóa thành chuỗi JSON trên đúng 1 dòng (single-line JSON), kết thúc bằng `\n`.
  3. Mở file ở chế độ `append` (`a` flag) với `fs.promises.appendFile`.
  4. Xác thực dữ liệu với Zod Schema trước khi thực hiện tuần tự hóa.

#### 2.3. Khóa Đồng Thời Tránh Race Condition (File-based Lock / Concurrency Control)
- Ngăn chặn tình trạng hai tiến trình (ví dụ: cron worker và manual trigger API) ghi đồng thời vào cùng một file dữ liệu.
- Sử dụng cơ chế Lock file (`.lock`) kết hợp PID và timestamp hoặc thư viện file-locking nhẹ không phụ thuộc native binaries (`proper-lockfile` logic triển khai nội bộ).
- Thiết lập thời gian sống tối đa của lock (TTL, ví dụ: 30 giây) để tự động giải phóng lock bị bỏ rơi (stale lock) khi tiến trình bị crash đột ngột.

#### 2.4. Khử Trùng Lặp Nhận Xét (Review Deduplication)
- **Composite Key:** `${platform}:${externalReviewId}` (Ví dụ: `android:gp_rev_12345` hoặc `ios:ios_rev_67890`).
- **Index cơ sở:** Khi Storage khởi động, nạp tập hợp các khóa định danh đã có từ `reviews.jsonl` vào bộ nhớ RAM (`Set<string>`).
- Khi tiếp nhận một lô (batch) review mới từ Crawler:
  1. Lọc qua `Set`: bản ghi nào đã tồn tại trong Set thì đánh dấu là cũ (`isDuplicate = true`).
  2. Chỉ ghi các bản ghi chưa từng xuất hiện (`isDuplicate = false`) vào `reviews.jsonl`.
  3. Cập nhật `Set` với các ID mới.
  4. Trả về số lượng review mới thực sự để tầng Analytics cập nhật số liệu.

#### 2.5. Sao Lưu & Phục Hồi Lỗi (Backup & Error Recovery)
- **Sao lưu:** Trước mỗi phiên cập nhật lớn, tạo snapshot dạng copy vào thư mục `data/backups/YYYYMMDD-HHmmss/`.
- **Phục hồi:** Khi đọc file `.jsonl`, nếu gặp dòng bị lỗi cú pháp JSON do tiến trình trước đó bị tắt ngang đột ngột, ghi nhận cảnh báo vào `collection-logs`, bỏ qua dòng hỏng mà không làm đổ vỡ toàn bộ dữ liệu lịch sử.

---

### 3. Chuẩn Hóa Mô Hình Dữ Liệu (Normalized Data Schemas)

Sử dụng thư viện `zod` để định nghĩa và xác thực schema nghiêm ngặt:

#### 3.1. Cấu hình ứng dụng (`AppConfig`)
```typescript
export interface AppConfig {
  id: string; // "uniclass"
  name: string; // "UniClass: Học Online Lớp 1-9"
  organization: string; // "UniClass"
  scope: "uniclass-only";
  platforms: {
    android?: {
      name: string;
      packageId: string; // "com.edupia.edupiaclass.vn"
      country: string; // "vn"
      enabled: boolean;
    };
    ios?: {
      name: string;
      appStoreId: string; // "6475161683"
      country: string; // "vn"
      enabled: boolean;
    };
  };
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

#### 3.2. Ảnh chụp đánh giá sao (`RatingSnapshot`)
```typescript
export interface RatingSnapshot {
  snapshotId: string; // UUID v4
  appId: string; // "uniclass"
  platform: "android" | "ios";
  averageRating: number; // 1.0 -> 5.0
  totalRatings: number; // Tổng số lượt rate
  ratingBreakdown?: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  country: string; // "vn"
  collectedAt: string; // ISO 8601
}
```

#### 3.3. Nhận xét người dùng (`Review`)
```typescript
export type SentimentType = "positive" | "neutral" | "negative";

export interface Review {
  id: string; // "${platform}:${externalReviewId}"
  externalReviewId: string; // ID gốc từ store
  appId: string; // "uniclass"
  platform: "android" | "ios";
  rating: number; // 1 -> 5
  title: string | null;
  content: string;
  author: string | null;
  createdAt: string; // ISO 8601 từ store
  updatedAt?: string | null;
  country: string; // "vn"
  sentiment: SentimentType;
  collectedAt: string; // ISO 8601 lúc crawl
}
```

#### 3.4. Thống kê hàng ngày (`DailyStats`)
```typescript
export interface DailyStats {
  date: string; // "YYYY-MM-DD"
  appId: string; // "uniclass"
  totalNewReviews: number;
  sentimentCounts: {
    positive: number; // rating 4 - 5
    neutral: number;  // rating 3
    negative: number; // rating 1 - 2
  };
  platformBreakdown: {
    android: {
      newReviews: number;
      averageRating: number;
    };
    ios: {
      newReviews: number;
      averageRating: number;
    };
  };
  latestRatingSnapshot: {
    android?: { average: number; total: number };
    ios?: { average: number; total: number };
  };
  calculatedAt: string;
}
```

---

### 4. Thiết Kế Bộ Thu Thập Dữ Liệu (Store Providers)

Mỗi Store Provider phải triển khai chung một interface `IStoreProvider`:

```typescript
export type CollectionStatus = "SUCCESS" | "PARTIAL" | "UNAVAILABLE";

export interface ProviderResult<T> {
  status: CollectionStatus;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface IStoreProvider {
  readonly platform: "android" | "ios";
  fetchRatingSnapshot(config: AppConfig): Promise<ProviderResult<RatingSnapshot>>;
  fetchReviews(config: AppConfig, options?: { maxCount?: number }): Promise<ProviderResult<Review[]>>;
}
```

#### 4.1. Google Play Provider (`provider-google-play`)
- **Nguồn:** `https://play.google.com/store/apps/details?id=com.edupia.edupiaclass.vn&hl=vi&gl=vn`
- **Phương thức thu thập:**
  1. Truy vấn HTTP qua `undici` để phân tích HTML bóc tách điểm trung bình và tổng số rating ban đầu.
  2. Đối với danh sách nhận xét tương tác, sử dụng Playwright crawler headless (chạy ngầm, không mở browser giao diện test) để trích xuất danh sách reviews người dùng mới nhất.
- **Ranh giới:**
  - Không vượt CAPTCHA hay giả mạo danh tính bot.
  - Xử lý timeout và trả về `UNAVAILABLE` hoặc `PARTIAL` nếu Google Play thay đổi markup hoặc giới hạn số request.

#### 4.2. Apple App Store Provider (`provider-app-store`)
- **Nguồn 1: iTunes Lookup API**
  - Endpoint: `https://itunes.apple.com/lookup?id=6475161683&country=vn`
  - Trích xuất: `averageUserRating`, `userRatingCount`.
- **Nguồn 2: Customer Reviews RSS Feed**
  - Endpoint: `https://itunes.apple.com/vn/rss/customerreviews/id=6475161683/sortBy=mostRecent/json`
  - Trích xuất mảng `feed.entry`: ID, author, rating (`im:rating`), title, content.
- **Xử lý chuẩn hóa:** Chuyển đổi trực tiếp các trường sang cấu trúc `Review` chuẩn.

---

### 5. Lập Lịch & Phân Tích (Scheduler & Analytics)

#### 5.1. Collection Scheduler
- Sử dụng `node-cron`.
- Lịch trình mặc định: Chạy định kỳ vào các khung giờ cấu hình (ví dụ: 6 tiếng một lần: `0 */6 * * *`, hoặc mỗi ngày 1 lần vào lúc 02:00: `0 2 * * *`).
- Kiểm soát quá trình:
  - Kiểm tra xem phiên crawl trước đó đã hoàn tất chưa (tránh chạy đè).
  - Ghi nhật ký vào `data/collection-logs/`.

#### 5.2. Analytics Engine
- Tính toán incremental: Khi có đợt reviews mới sau deduplication, cập nhật số liệu của ngày tương ứng vào `daily-stats/YYYY-MM-DD.json`.
- Phân loại sentiment dựa trên số sao:
  - 1 hoặc 2 sao $\rightarrow$ `negative`
  - 3 sao $\rightarrow$ `neutral`
  - 4 hoặc 5 sao $\rightarrow$ `positive`

---

### 6. Giao Diện Lập Trình (API & SDK)

#### 6.1. REST API Endpoints (Fastify)
- `GET /health` - Trạng thái hoạt động của hệ thống.
- `GET /api/apps` - Danh sách ứng dụng UniClass đang theo dõi.
- `GET /api/apps/:appId` - Chi tiết cấu hình ứng dụng UniClass.
- `GET /api/apps/:appId/ratings` - Lịch sử snapshot rating theo thời gian.
- `GET /api/apps/:appId/reviews` - Danh sách nhận xét (hỗ trợ phân trang `page`, `limit`, lọc theo `platform`, `sentiment`, `date`).
- `GET /api/apps/:appId/analytics/daily` - Báo cáo thống kê hàng ngày.
- `POST /api/collector/trigger` - Kích hoạt thu thập dữ liệu thủ công ngay lập tức.

#### 6.2. Node.js SDK
- Cung cấp class `UniClassRatingReader` cho các dịch vụ khác import:
  ```typescript
  import { UniClassRatingReader } from "uniclass-rating-reader/sdk";

  const reader = new UniClassRatingReader({ dataDir: "./data" });
  const reviews = await reader.getReviews("uniclass", { limit: 50, sentiment: "negative" });
  const stats = await reader.getDailyStats("uniclass", "2026-11-16");
  ```

