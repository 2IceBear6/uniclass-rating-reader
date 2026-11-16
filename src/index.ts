import { createServer } from "./api/index.js";

/**
 * Hàm khởi động chính của ứng dụng UniClass Rating Reader
 */
export async function main(): Promise<void> {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const host = process.env.HOST || "0.0.0.0";
  const server = createServer({ port, host });

  try {
    const address = await server.listen({ port, host });
    console.log(`[UniClass Rating Reader] Máy chủ đã khởi động tại: ${address}`);
  } catch (err) {
    console.error("[UniClass Rating Reader] Lỗi khởi động máy chủ:", err);
    process.exit(1);
  }
}

// Khởi động server nếu file được chạy trực tiếp qua CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

