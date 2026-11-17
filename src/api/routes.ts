import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { LocalStorageEngine } from "../storage/index.js";
import type { CollectorService, CollectionScheduler } from "../collector/index.js";
import type { AnalyticsEngine } from "../analytics/index.js";
import { isUniClassApp } from "../core/utils.js";

/**
 * Tùy chọn dịch vụ phụ thuộc được tiêm vào các route API
 */
export interface ApiDependencies {
  storage: LocalStorageEngine;
  collector: CollectorService;
  scheduler: CollectionScheduler;
  analytics: AnalyticsEngine;
}

/**
 * Đăng ký toàn bộ các endpoint REST API cho ứng dụng Fastify
 * @param app Thể hiện FastifyInstance
 * @param deps Các dịch vụ phụ thuộc (storage, collector, scheduler, analytics)
 */
export function registerRoutes(app: FastifyInstance, deps: ApiDependencies): void {
  const { storage, collector, scheduler, analytics } = deps;

  /**
   * GET / - Giao diện Web Dashboard thống kê và xem chi tiết Rating & Review
   */
  app.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const htmlPath = path.join(process.cwd(), "src", "web", "index.html");
      const html = await fs.readFile(htmlPath, "utf-8");
      return reply.type("text/html; charset=utf-8").send(html);
    } catch (err) {
      return reply
        .type("text/html; charset=utf-8")
        .status(500)
        .send(`<h1>Lỗi tải Web Dashboard</h1><p>${String(err)}</p>`);
    }
  });

  /**
   * GET /dashboard - Điều hướng về Dashboard chính
   */
  app.get("/dashboard", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect("/");
  });

  /**
   * GET /favicon.ico - Trả về mã 204 No Content cho yêu cầu favicon
   */
  app.get("/favicon.ico", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(204).send();
  });

  /**
   * GET /health - Kiểm tra tình trạng hoạt động của hệ thống
   */
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "uniclass-rating-reader",
      version: "1.0.0",
    };
  });

  /**
   * GET /api/apps - Danh sách các ứng dụng UniClass đang được theo dõi
   */
  app.get("/api/apps", async () => {
    const config = await storage.getAppConfig("uniclass");
    return {
      apps: config
        ? [
            {
              id: config.id,
              name: config.name,
              organization: config.organization,
              platforms: config.platforms,
            },
          ]
        : [],
    };
  });

  /**
   * GET /api/apps/:appId - Xem chi tiết cấu hình của ứng dụng UniClass
   */
  app.get(
    "/api/apps/:appId",
    async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply
    ) => {
      const { appId } = request.params;
      if (!isUniClassApp(appId)) {
        return reply.status(403).send({
          error: `Ứng dụng "${appId}" không hợp lệ. Hệ thống chỉ hỗ trợ ứng dụng UniClass`,
        });
      }

      const config = await storage.getAppConfig(appId);

      if (!config) {
        return reply.status(404).send({
          error: `Không tìm thấy cấu hình cho ứng dụng: "${appId}"`,
        });
      }

      return config;
    }
  );

  /**
   * GET /api/apps/:appId/ratings - Lịch sử điểm đánh giá rating snapshots
   */
  app.get(
    "/api/apps/:appId/ratings",
    async (
      request: FastifyRequest<{
        Params: { appId: string };
        Querystring: { limit?: string; offset?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { appId } = request.params;
      if (!isUniClassApp(appId)) {
        return reply.status(403).send({
          error: `Ứng dụng "${appId}" không hợp lệ. Hệ thống chỉ hỗ trợ ứng dụng UniClass`,
        });
      }

      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

      const snapshots = await storage.getRatingSnapshots(appId, { limit, offset });
      return {
        appId,
        total: snapshots.length,
        data: snapshots,
      };
    }
  );

  /**
   * GET /api/apps/:appId/reviews - Danh sách nhận xét người dùng (hỗ trợ lọc platform, sentiment, pagination)
   */
  app.get(
    "/api/apps/:appId/reviews",
    async (
      request: FastifyRequest<{
        Params: { appId: string };
        Querystring: {
          limit?: string;
          offset?: string;
          platform?: "android" | "ios";
          sentiment?: "positive" | "neutral" | "negative";
          date?: string;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { appId } = request.params;
      if (!isUniClassApp(appId)) {
        return reply.status(403).send({
          error: `Ứng dụng "${appId}" không hợp lệ. Hệ thống chỉ hỗ trợ ứng dụng UniClass`,
        });
      }

      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
      const platform = request.query.platform;
      const sentiment = request.query.sentiment;
      const date = request.query.date;
      const startDate = request.query.startDate;
      const endDate = request.query.endDate;

      const reviews = await storage.getReviews(appId, {
        limit,
        offset,
        platform,
        sentiment,
        date,
        startDate,
        endDate,
      });

      return {
        appId,
        limit,
        offset,
        total: reviews.length,
        data: reviews,
      };
    }
  );

  /**
   * GET /api/apps/:appId/analytics/daily - Báo cáo thống kê hàng ngày theo ngày hoặc dải ngày
   */
  app.get(
    "/api/apps/:appId/analytics/daily",
    async (
      request: FastifyRequest<{
        Params: { appId: string };
        Querystring: {
          date?: string;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { appId } = request.params;
      if (!isUniClassApp(appId)) {
        return reply.status(403).send({
          error: `Ứng dụng "${appId}" không hợp lệ. Hệ thống chỉ hỗ trợ ứng dụng UniClass`,
        });
      }

      const { date, startDate, endDate } = request.query;

      if (startDate && endDate) {
        try {
          const rangeStats = await analytics.getDailyStatsRange(appId, startDate, endDate);
          return {
            appId,
            startDate,
            endDate,
            data: rangeStats,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(400).send({ error: message });
        }
      }

      const targetDate = date ?? new Date().toISOString().slice(0, 10);
      const stats = await analytics.getDailyStats(appId, targetDate, true);

      if (!stats) {
        return reply.status(404).send({
          error: `Không tìm thấy thống kê ngày ${targetDate} cho ứng dụng ${appId}`,
        });
      }

      return stats;
    }
  );

  /**
   * GET /api/apps/:appId/analytics/daily/history - Danh sách tất cả các báo cáo thống kê ngày đã lưu
   */
  app.get(
    "/api/apps/:appId/analytics/daily/history",
    async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply
    ) => {
      const { appId } = request.params;
      if (!isUniClassApp(appId)) {
        return reply.status(403).send({
          error: `Ứng dụng "${appId}" không hợp lệ. Hệ thống chỉ hỗ trợ ứng dụng UniClass`,
        });
      }

      const history = await analytics.listAllDailyStats(appId);
      return {
        appId,
        totalDays: history.length,
        data: history,
      };
    }
  );

  /**
   * GET /api/apps/:appId/analytics/overview - Bức tranh tổng quan toàn diện về ứng dụng
   */
  app.get(
    "/api/apps/:appId/analytics/overview",
    async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply
    ) => {
      const { appId } = request.params;
      if (!isUniClassApp(appId)) {
        return reply.status(403).send({
          error: `Ứng dụng "${appId}" không hợp lệ. Hệ thống chỉ hỗ trợ ứng dụng UniClass`,
        });
      }

      return analytics.getAppOverview(appId);
    }
  );

  /**
   * POST /api/collector/trigger - Kích hoạt thu thập dữ liệu ngay lập tức
   */
  app.post(
    "/api/collector/trigger",
    async (
      request: FastifyRequest<{
        Body?: { appId?: string; maxReviews?: number };
      }>,
      reply: FastifyReply
    ) => {
      const targetAppId = request.body?.appId ?? "uniclass";
      if (!isUniClassApp(targetAppId)) {
        return reply.status(403).send({
          error: `Ứng dụng "${targetAppId}" không hợp lệ. Hệ thống chỉ cho phép thu thập ứng dụng UniClass`,
        });
      }

      const maxReviews = request.body?.maxReviews;

      try {
        const cycleResult = await collector.collectApp(targetAppId, maxReviews);
        return cycleResult;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(409).send({
          error: `Không thể kích hoạt phiên cào: ${message}`,
        });
      }
    }
  );

  /**
   * GET /api/collector/status - Trạng thái của scheduler và tiến trình cào dữ liệu
   */
  app.get("/api/collector/status", async () => {
    return scheduler.getStatus();
  });
}

