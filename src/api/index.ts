import fastify, { FastifyInstance } from "fastify";

/**
 * Tùy chọn cấu hình máy chủ Fastify REST API
 */
export interface ServerOptions {
  port?: number;
  host?: string;
}

/**
 * Khởi tạo ứng dụng Fastify REST API
 * @param _options Tùy chọn máy chủ
 * @returns Thể hiện FastifyInstance
 */
export function createServer(_options?: ServerOptions): FastifyInstance {
  const app = fastify({ logger: false });

  /**
   * Endpoint kiểm tra trạng thái hoạt động của hệ thống
   */
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "uniclass-rating-reader",
    };
  });

  return app;
}

