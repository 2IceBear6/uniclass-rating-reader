# UniClass Rating Reader

> Hệ thống tự động thu thập, chuẩn hóa, lưu trữ và phân tích dữ liệu đánh giá sao (Rating) và nhận xét (Review) công khai dành riêng cho hệ sinh thái ứng dụng **UniClass** trên Google Play Store và Apple App Store.

---

## 1. Giới Thiệu & Giới Hạn Phạm Vi Dự Án (Scope)

Hệ thống được thiết kế độc quyền cho hệ sinh thái **UniClass**:
- **CHỈ** theo dõi và phân tích các ứng dụng UniClass chính thức.
- **TUYỆT ĐỐI KHÔNG** hỗ trợ hoặc mở rộng cho các ứng dụng ngoài phạm vi UniClass.
- **KHÔNG** sử dụng bất kỳ hệ quản trị cơ sở dữ liệu nào (PostgreSQL, MySQL, SQLite, MongoDB, Redis, Drizzle ORM, Prisma). Hệ thống áp dụng kiến trúc **Zero-Database (Local Filesystem)** an toàn, nguyên tử và hiệu năng cao.

### Ứng dụng Production mục tiêu:
| Nền tảng | Tên hiển thị trên Store | Định danh ứng dụng (Production ID) | Quốc gia |
| :--- | :--- | :--- | :--- |
| **Android** | UniClass: Học Online Lớp 1-9 | `com.edupia.edupiaclass.vn` | `vn` |
| **iOS** | UniClass: Học Online Lớp 1-9 | `6475161683` | `vn` |

*(Lưu ý: Nghiêm cấm sử dụng package development `com.edupia.edupiaclass.vn.dev` thay thế cho production).*

---

## 2. Kiến Trúc Hệ Thống: Modular Monolith

Dự án áp dụng mô hình kiến trúc đơn khối theo mô-đun (Modular Monolith) với phân định trách nhiệm rõ ràng:

```
src/
├── core/                  # Hạt nhân trung tâm: Types, Interfaces, Zod Schemas, Utils (Độc lập 100%)
├── providers/
│   ├── google-play/       # Thu thập dữ liệu Android từ Google Play Store (Playwright Headless + HTTP fallback)
│   └── app-store/         # Thu thập dữ liệu iOS từ iTunes Lookup API & RSS Feed
├── storage/               # Local Filesystem Engine: Atomic Write, Safe Append, File Lock, Deduplicator
├── collector/             # Điều phối thu thập dữ liệu & Scheduler định kỳ (node-cron)
├── analytics/             # Tính toán số liệu thống kê ngày, phân loại cảm xúc (Sentiment)
├── api/                   # Fastify REST API Server
├── sdk/                   # Node.js Client SDK (Hỗ trợ cả Local Mode và Remote Mode)
└── index.ts               # Entry point khởi chạy server
```

---

## 3. Cấu Trúc Dữ Liệu Cục Bộ (Local Filesystem Layout)

Toàn bộ dữ liệu được lưu trực tiếp trên ổ cứng cục bộ (thư mục `data/` được đưa vào `.gitignore` để tránh commit dữ liệu thực tế):

```
data/
├── apps/
│   └── uniclass/
│       ├── app.json                 # Cấu hình & thông tin meta của ứng dụng UniClass
│       ├── reviews.jsonl            # Toàn bộ danh sách nhận xét người dùng (chuẩn hóa, mỗi dòng 1 JSON)
│       ├── rating-history.jsonl     # Lịch sử snapshot rating theo từng đợt thu thập
│       └── daily-stats/             # Báo cáo thống kê tổng hợp theo từng ngày
│           └── YYYY-MM-DD.json
├── collection-logs/                 # Nhật ký kiểm toán của từng phiên crawl
│   └── YYYY-MM-DD-collection.jsonl
└── metadata/
    └── apps-registry.json           # Danh mục quản lý các ứng dụng UniClass được phép
```

### Tiêu chuẩn an toàn tầng Storage:
1. **Ghi nguyên tử (Atomic Writes):** Ghi qua tệp tạm `.tmp.[uuid]` kết hợp `fsync` trước khi đổi tên (`fs.rename`), loại bỏ hoàn toàn rủi ro file bị rỗng (0 byte) hoặc hỏng định dạng khi mất điện đột ngột.
2. **Ghi nối an toàn (Safe Append cho JSONL):** Tự động phát hiện và sửa lỗi thiếu ngắt dòng `\n` của tệp cũ trước khi ghi tiếp.
3. **Bộ máy Khử trùng lặp (Review Deduplication):** Lọc trùng lặp theo Composite Unique Key: `${platform}:${externalReviewId}`. Đảm bảo một bài đánh giá không bao giờ bị tính nhiều lần vào số liệu ngày.
4. **Khóa chống xung đột (File-based Lock):** Tạo `.storage.lock` bằng cờ nguyên tử `wx` kết hợp cơ chế tự động dọn dẹp khóa chết (Stale lock cleanup với TTL 30s) chống xung đột giữa cron job và manual trigger API.
5. **Đọc chịu lỗi (Fault-tolerant JSONL Reader):** Tự động bỏ qua các dòng rác hoặc hỏng mà không làm mất dữ liệu lịch sử còn lại.
6. **Sao lưu dữ liệu tự động (Safe Backup):** Hỗ trợ tạo bản sao lưu toàn bộ dữ liệu ứng dụng sang `data/backups/uniclass/YYYYMMDD-HHmmss/`.

---

## 4. Bắt Đầu Nhanh (Getting Started)

### Yêu cầu môi trường:
- **Node.js:** `20.19.5` (hoặc `>= 20.x`)
- **Package Manager:** `npm` (nghiêm cấm dùng `yarn` hoặc `pnpm`)

### Cài đặt dependencies:
```bash
npm install
```

### Các lệnh thực thi (NPM Scripts):
```bash
# Kiểm tra Type tĩnh với TypeScript
npm run typecheck

# Kiểm tra Linter với ESLint 9 Flat Config
npm run lint

# Chạy toàn bộ bộ kiểm thử tự động (Vitest)
npm test

# Biên dịch mã nguồn ra thư mục dist/
npm run build

# Khởi chạy Web Dashboard & API Server ở chế độ phát triển (Hot reload)
npm run dev

# Khởi chạy dịch vụ API Server & Scheduler tự động (Production)
npm start

# Cào dữ liệu UniClass thủ công ngay lập tức qua dòng lệnh (CLI)
npm run crawl
```

---

## 5. Tài Liệu REST API (Fastify Endpoints)

| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/` | Web Dashboard trực quan hóa thống kê Rating & Review (Dark UI) |
| `GET` | `/health` | Kiểm tra tình trạng hoạt động của dịch vụ |
| `GET` | `/api/apps` | Danh sách ứng dụng UniClass đang được theo dõi |
| `GET` | `/api/apps/:appId` | Xem chi tiết cấu hình ứng dụng UniClass |
| `GET` | `/api/apps/:appId/ratings` | Xem lịch sử snapshot rating (`?limit=50&offset=0`) |
| `GET` | `/api/apps/:appId/reviews` | Danh sách nhận xét (`?limit=50&offset=0&platform=android&sentiment=positive&date=YYYY-MM-DD&startDate=...&endDate=...`) |
| `GET` | `/api/apps/:appId/analytics/daily` | Báo cáo thống kê ngày (`?date=YYYY-MM-DD` hoặc `?startDate=...&endDate=...`) |
| `GET` | `/api/apps/:appId/analytics/overview` | Bức tranh tổng quan toàn diện về ứng dụng |
| `POST` | `/api/collector/trigger` | Kích hoạt phiên cào dữ liệu ngay lập tức (`{ "appId": "uniclass" }`) |
| `GET` | `/api/collector/status` | Xem trạng thái của tiến trình Scheduler và Collector |

*(Ghi chú: Mọi endpoint truyền `appId` nằm ngoài phạm vi UniClass sẽ lập tức bị từ chối với mã lỗi `403 Forbidden`).*

---

## 6. Hướng Dẫn Sử Dụng Node.js Client SDK

Thư viện SDK `UniClassRatingReader` cho phép ứng dụng bên ngoài tích hợp theo 2 chế độ:

### Chế độ 1: Trực tiếp qua Local Filesystem (Khuyên dùng khi cùng máy chủ)
```typescript
import { UniClassRatingReader } from "uniclass-rating-reader/sdk";

// Khởi tạo SDK đọc trực tiếp từ thư mục data
const reader = new UniClassRatingReader({ dataDir: "./data" });

// Lấy danh sách nhận xét mới nhất
const reviews = await reader.getReviews("uniclass", { limit: 20, sentiment: "negative" });
console.log(`Số bài nhận xét tiêu cực: ${reviews.length}`);

// Lấy báo cáo thống kê ngày
const dailyStats = await reader.getDailyStats("uniclass", "2026-11-16");
console.log(`Review mới trong ngày: ${dailyStats?.totalNewReviews}`);

// Lấy tổng quan ứng dụng
const overview = await reader.getAppOverview("uniclass");
console.log(`Tổng số nhận xét: ${overview.totalReviews}`);
```

### Chế độ 2: Gọi qua Remote HTTP REST API
```typescript
import { UniClassRatingReader } from "uniclass-rating-reader/sdk";

// Khởi tạo SDK kết nối tới Fastify Server
const reader = new UniClassRatingReader({ apiUrl: "http://localhost:3000" });

// Kích hoạt phiên cào dữ liệu từ xa
const cycleResult = await reader.triggerCollection("uniclass");
console.log(`Trạng thái phiên cào: ${cycleResult.status}`);
```

---

## 7. Phân Loại Cảm Xúc Mặc Định (Sentiment Mapping)

Hệ thống tự động phân loại cảm xúc dựa trên số sao đánh giá:
- **1 – 2 sao:** `negative` (Tiêu cực)
- **3 sao:** `neutral` (Trung tính)
- **4 – 5 sao:** `positive` (Tích cực)

---

## 8. Tài Liệu Kỹ Thuật Tham Khảo Thêm

- [AGENTS.md](file:///d:/uniclass/uniclass-rating-reader/AGENTS.md): Quy chuẩn kỹ thuật, nguyên tắc code và hướng dẫn dành cho AI Agents.
- [docs/PROJECT_SPECIFICATION.md](file:///d:/uniclass/uniclass-rating-reader/docs/PROJECT_SPECIFICATION.md): Đặc tả yêu cầu dự án.
- [docs/TECHNICAL_SPECIFICATION.md](file:///d:/uniclass/uniclass-rating-reader/docs/TECHNICAL_SPECIFICATION.md): Đặc tả kỹ thuật chi tiết.
- [docs/ARCHITECTURE.md](file:///d:/uniclass/uniclass-rating-reader/docs/ARCHITECTURE.md): Kiến trúc Modular Monolith và luồng dữ liệu.
- [docs/POC_REPORT.md](file:///d:/uniclass/uniclass-rating-reader/docs/POC_REPORT.md): Báo cáo thực nghiệm bóc tách dữ liệu thực tế từ Store.

