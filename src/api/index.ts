import fastify, { FastifyInstance } from "fastify";
import { LocalStorageEngine } from "../storage/index.js";
import { CollectorService, CollectionScheduler } from "../collector/index.js";
import { AnalyticsEngine } from "../analytics/index.js";
import { registerRoutes } from "./routes.js";

export * from "./routes.js";

/**
 * Tùy chọn cấu hình máy chủ Fastify REST API
 */
export interface ServerOptions {
  port?: number;
  host?: string;
  storage?: LocalStorageEngine;
  collector?: CollectorService;
  scheduler?: CollectionScheduler;
  analytics?: AnalyticsEngine;
}

/**
 * Khởi tạo ứng dụng Fastify REST API với đầy đủ các routes và dependency injection
 * @param options Tùy chọn máy chủ và các dịch vụ phụ thuộc
 * @returns Thể hiện FastifyInstance đã sẵn sàng phục vụ
 */
export function createServer(options: ServerOptions = {}): FastifyInstance {
  const app = fastify({
    logger: false,
    trustProxy: true,
  });

  const storage = options.storage ?? new LocalStorageEngine();
  const analytics = options.analytics ?? new AnalyticsEngine({ storage });
  const collector = options.collector ?? new CollectorService({ storage, analyticsEngine: analytics });
  const scheduler = options.scheduler ?? new CollectionScheduler(collector);

  // Đăng ký toàn bộ API endpoints
  registerRoutes(app, {
    storage,
    collector,
    scheduler,
    analytics,
  });

  return app;
}
