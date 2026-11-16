# AGENTS.md - Quy Tắc Kỹ Thuật & Hướng Dẫn Dành Cho AI Agents
## Dự án: UniClass Rating Reader

Tài liệu này định nghĩa các quy tắc bắt buộc mà mọi AI Agent (hoặc kỹ sư phần mềm) **phải tuân thủ tuyệt đối** khi tham gia phát triển, bảo trì, sửa lỗi hoặc tái cấu trúc mã nguồn trong repository `uniclass-rating-reader`.

---

### 1. Quy Tắc Cốt Lõi Bắt Buộc (Universal Agent Rules)

1. **Comment định nghĩa hàm bằng Tiếng Việt:**
   - Mọi hàm, phương thức (method), interface hoặc class được tạo mới hoặc chỉnh sửa **bắt buộc phải có comment định nghĩa/mô tả chức năng bằng Tiếng Việt** ngay phía trên (sử dụng JSDoc hoặc block comment chuẩn).
   - Ví dụ:
     ```typescript
     /**
      * Đọc danh sách nhận xét của ứng dụng từ file reviews.jsonl
      * @param appId Mã định danh ứng dụng (ví dụ: "uniclass")
      * @returns Danh sách các đối tượng Review đã chuẩn hóa
      */
     export async function readReviews(appId: string): Promise<Review[]> { ... }
     ```

2. **Tuyệt đối không tự ý mở trình duyệt để test (No Browser Auto-Launch):**
   - Không tự động chạy lệnh mở browser hoặc UI (như `xdg-open`, `open`, `start`, `chrome`, Playwright có cờ `headless: false`).
   - Mọi scraper/crawler Playwright phải chạy ở chế độ **Headless** (`headless: true`).
   - Kiểm thử phải được thực hiện tự động qua unit test / integration test (Vitest).

3. **Luôn kiểm tra lại mã nguồn sau khi làm/sửa:**
   - Sau khi hoàn thành một đoạn mã hoặc chỉnh sửa file, phải chạy kiểm tra lại xem còn lỗi cú pháp, lỗi logic, lỗi type hay warning không (`npx tsc --noEmit`, `npm run lint`, `npm test`).
   - Đảm bảo các tính năng vừa code xong phải hoạt động chính xác **100%**.

4. **Tuyệt đối không tự động chạy lệnh git:**
   - **Nghiêm cấm** thực thi các lệnh `git` (như `git add`, `git commit`, `git push`, `git checkout`, `git init`...) trừ khi có chỉ thị rõ ràng từ người dùng.

5. **Làm đúng phạm vi nhiệm vụ được yêu cầu:**
   - Chỉ thực hiện đúng nhiệm vụ được giao trong prompt hoặc milestone hiện tại.
   - Không tự ý triển khai trước các tính năng của milestone tiếp theo.

6. **Không xóa bất kỳ dữ liệu người dùng nào:**
   - Tuyệt đối không xóa các file dữ liệu trong thư mục `data/` hoặc dữ liệu thực tế do người dùng tạo ra.
   - Khi cần thao tác dọn dẹp hoặc test, phải sử dụng cơ chế backup an toàn hoặc thư mục tạm thời riêng biệt.

---

### 2. Giới Hạn Phạm Vi Dự Án (Scope Constraints)

1. **Chỉ theo dõi ứng dụng UniClass:**
   - Hệ thống này được xây dựng **độc quyền** cho hệ sinh thái UniClass.
   - **Tuyệt đối không** biến dự án thành công cụ quét đại trà cho mọi ứng dụng trên Google Play hay App Store.
2. **Cấu hình ứng dụng Production chính xác:**
   - **Android:** Package ID là `com.edupia.edupiaclass.vn`. **Nghiêm cấm** sử dụng package development `com.edupia.edupiaclass.vn.dev` thay thế cho production.
   - **iOS:** App Store ID là `6475161683` (Country: `vn`).
3. **Cơ chế whitelist mở rộng:**
   - Thiết kế mô hình cấu hình cho phép bổ sung thêm ứng dụng UniClass khác trong tương lai, nhưng chặn tuyệt đối việc thêm ứng dụng ngoài phạm vi UniClass.

---

### 3. Quy Chuẩn Lưu Trữ Dữ Liệu (Storage Constraints)

1. **Cấm hoàn toàn SQL & Database Engines:**
   - **Không sử dụng:** PostgreSQL, MySQL, SQLite, MongoDB, Drizzle ORM, Prisma, Redis.
   - Dự án là Zero-Database. Mọi dữ liệu phải lưu trực tiếp xuống **local filesystem**.
2. **Định dạng file:**
   - Dùng `.json` cho file cấu hình (`app.json`), danh mục registry, và thống kê ngày (`daily-stats/YYYY-MM-DD.json`).
   - Dùng `.jsonl` cho dữ liệu dạng chuỗi sự kiện / nhật ký lớn (`reviews.jsonl`, `rating-history.jsonl`, `collection-logs/*.jsonl`).
3. **Bắt buộc áp dụng:**
   - **Atomic file writes:** Ghi qua file `.tmp` rồi đổi tên (`fs.rename`).
   - **Review deduplication:** Khử trùng lặp dựa trên khóa duy nhất `${platform}:${externalReviewId}`. Không ghi trùng một review nhiều lần vào file hay thống kê.
   - **Safe append:** Kiểm tra dòng kết thúc, đảm bảo mỗi record nằm trên đúng một dòng JSON hợp lệ.
   - **Process lock:** Có cơ chế file lock / mutex chống việc hai tiến trình ghi đồng thời làm hỏng file.
   - **Error recovery & backup:** Bỏ qua dòng hỏng mà không làm mất dữ liệu cũ khi một lần crawl thất bại.

---

### 4. Quy Chuẩn Thu Thập Dữ Liệu (Scraper Constraints)

1. **Thu thập từ nguồn công khai:**
   - Không yêu cầu và không phụ thuộc vào Google Play Console credentials hay App Store Connect credentials.
   - App Store: Dùng iTunes Lookup API và RSS feed công khai.
   - Google Play: Dùng HTTP parsing hoặc Playwright headless.
2. **Đạo đức cào dữ liệu & Giới hạn:**
   - **Tuyệt đối không** tìm cách giải CAPTCHA, bypass bot detection hoặc phá vỡ hàng rào bảo mật.
   - Phân biệt rõ 3 trạng thái kết quả thu thập: `SUCCESS`, `PARTIAL`, `UNAVAILABLE`.
   - Không giả định nguồn cấp sẽ trả về toàn bộ dữ liệu lịch sử; chấp nhận giới hạn của phân trang công khai.

---

### 5. Ngăn Xếp Công Nghệ & Tiêu Chuẩn TypeScript (Tech Stack & Tooling)

- **Node.js:** `20.19.5`
- **Package Manager:** `npm` (nghiêm cấm dùng `pnpm` hoặc `yarn`).
- **TypeScript:** `^5` với các cờ bắt buộc trong `tsconfig.json`:
  - `strict`: `true`
  - `moduleResolution`: `"bundler"`
  - `module`: `"esnext"`
  - `target`: `"ES2017"`
  - `jsx`: `"react-jsx"`
  - `isolatedModules`: `true`
- **Libraries cho phép:**
  - `fastify` (Web server)
  - `zod` (Data validation)
  - `undici` (HTTP requests)
  - `playwright` (Headless browser crawling)
  - `node-cron` (Job scheduler)
  - `vitest` (Testing framework)
  - `eslint` (Flat config)
- **Cấm:** Không cài `Next.js` cho MVP; không cài các dependencies dư thừa.

---

### 6. Quy Tắc Kiến Trúc (Architecture Rules - Modular Monolith)

1. Phân chia rõ ràng thành các mô-đun:
   - `core`
   - `provider-google-play`
   - `provider-app-store`
   - `storage`
   - `collector`
   - `analytics`
   - `api`
   - `sdk`
2. **Quy tắc phụ thuộc:**
   - `core` không được phép phụ thuộc trực tiếp vào các `provider` hay `storage`.
   - Cả hai Provider (`google-play` và `app-store`) buộc phải hiện thực hóa chung interface `IStoreProvider` định nghĩa từ `core`.
   - `storage` chỉ làm việc với filesystem, không chứa logic cào web hay HTTP.
   - `api` và `sdk` dùng chung domain logic từ `core` và đọc dữ liệu qua `storage`.

---

### 7. Quy Trình Phát Triển Theo Milestone (Milestone Workflow)

Dự án phát triển tuần tự qua 8 milestone:
1. **Milestone 1:** Project foundation (TypeScript, ESLint, Vitest, modular structure).
2. **Milestone 2:** Google Play & App Store POC (Proof of concept cào dữ liệu công khai).
3. **Milestone 3:** Providers & Normalization (Hiện thực hóa IStoreProvider & Zod schema).
4. **Milestone 4:** Local Storage Engine (Atomic write, safe append, deduplication, locking).
5. **Milestone 5:** Collection Scheduler (node-cron, logs, error recovery).
6. **Milestone 6:** Analytics Engine (Sentiment classification, daily statistics).
7. **Milestone 7:** REST API & Node.js SDK (Fastify endpoints, client SDK).
8. **Milestone 8:** Integration Testing & Documentation hoàn thiện.

**Sau mỗi milestone:**
1. Chạy toàn bộ test (`npm test`).
2. Kiểm tra type (`npx tsc --noEmit`).
3. Kiểm tra lint (`npm run lint`).
4. Liệt kê rõ các file đã thêm/sửa đổi.
5. Liệt kê các vấn đề còn tồn đọng (nếu có).
6. Dừng lại, báo cáo kết quả và **chờ người dùng xác nhận** trước khi bắt đầu milestone tiếp theo.

