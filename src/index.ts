import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./api/index.js";
import { LocalStorageEngine } from "./storage/index.js";
import { AnalyticsEngine } from "./analytics/index.js";
import { CollectorService, CollectionScheduler } from "./collector/index.js";

/**
 * Lấy danh sách địa chỉ IPv4 của các card mạng đang hoạt động (Wi-Fi, LAN)
 * @returns Mảng địa chỉ IP mạng nội bộ
 */
export function getLocalNetworkIps(): string[] {
  const nets = os.networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

/**
 * Hàm khởi động chính của ứng dụng UniClass Rating Reader
 */
export async function main(): Promise<void> {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const host = process.env.HOST || "0.0.0.0";
  const dataDir = process.env.DATA_DIR || "./data";
  // Mặc định chạy 2 lần mỗi ngày: 01:15 AM (đêm) và 07:15 AM (sáng)
  const cronExpr = process.env.CRON_SCHEDULE || "15 1,7 * * *";

  console.log("====================================================");
  console.log("          UNICLASS RATING & REVIEW READER           ");
  console.log("====================================================");
  console.log(`[Khởi tạo] Thư mục dữ liệu: ${dataDir}`);
  console.log(`[Khởi tạo] Lịch trình Cron: ${cronExpr}`);

  const storage = new LocalStorageEngine(dataDir);
  const analytics = new AnalyticsEngine({ storage });
  const collector = new CollectorService({ storage, analyticsEngine: analytics });
  const scheduler = new CollectionScheduler(collector, {
    cronExpression: cronExpr,
    appId: "uniclass",
  });

  // Khởi động bộ lập lịch cào dữ liệu định kỳ
  scheduler.start();
  console.log("[Scheduler] Đã kích hoạt bộ lập lịch cào dữ liệu tự động");

  // Khởi tạo máy chủ Fastify REST API
  const server = createServer({
    port,
    host,
    storage,
    analytics,
    collector,
    scheduler,
  });

  // Đăng ký xử lý tắt ứng dụng an toàn (Graceful shutdown)
  const shutdown = async (signal: string) => {
    console.log(`\n[Hệ thống] Nhận tín hiệu ${signal}. Đang dừng máy chủ...`);
    scheduler.stop();
    await server.close();
    console.log("[Hệ thống] Đã dừng toàn bộ dịch vụ an toàn. Tạm biệt!");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const address = await server.listen({ port, host });
    const networkIps = getLocalNetworkIps();

    console.log(`[Web Dashboard] Đã sẵn sàng phục vụ:`);
    console.log(`  ➜ Local:   http://localhost:${port}/`);
    for (const ip of networkIps) {
      console.log(`  ➜ Network: http://${ip}:${port}/ (cho máy khác cùng mạng Wi-Fi/LAN)`);
    }
    console.log(`\n[API Server]    Đang lắng nghe tại: ${address}`);
    console.log("\nCác endpoints sẵn sàng:");
    console.log(`  - WEB  http://localhost:${port}/ (Web Dashboard)`);
    console.log(`  - GET  http://localhost:${port}/health`);
    console.log(`  - GET  http://localhost:${port}/api/apps`);
    console.log(`  - GET  http://localhost:${port}/api/apps/uniclass`);
    console.log(`  - GET  http://localhost:${port}/api/apps/uniclass/ratings`);
    console.log(`  - GET  http://localhost:${port}/api/apps/uniclass/reviews`);
    console.log(`  - GET  http://localhost:${port}/api/apps/uniclass/analytics/daily`);
    console.log(`  - GET  http://localhost:${port}/api/apps/uniclass/analytics/daily/history`);
    console.log(`  - GET  http://localhost:${port}/api/apps/uniclass/analytics/overview`);
    console.log(`  - POST http://localhost:${port}/api/collector/trigger`);
    console.log(`  - GET  http://localhost:${port}/api/collector/status`);
    console.log("====================================================\n");
  } catch (err) {
    console.error("[UniClass Rating Reader] Lỗi khởi động máy chủ:", err);
    scheduler.stop();
    process.exit(1);
  }
}

// Khởi động server nếu file được chạy trực tiếp qua CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
