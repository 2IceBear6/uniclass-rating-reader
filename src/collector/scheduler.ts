import cron, { ScheduledTask } from "node-cron";
import type { CollectionCycleResult } from "../core/types.js";
import { CollectorService } from "./collector.js";

/**
 * Tùy chọn cấu hình cho CollectionScheduler
 */
export interface SchedulerOptions {
  cronExpression?: string; // Mặc định: "0 */6 * * *" (mỗi 6 tiếng một lần)
  appId?: string; // Mặc định: "uniclass"
  runOnInit?: boolean; // Tự động chạy ngay khi start (mặc định: false)
}

/**
 * Trạng thái hiện tại của bộ lập lịch
 */
export interface SchedulerStatus {
  isRunning: boolean;
  cronExpression: string;
  isCollecting: boolean;
  appId: string;
  lastRunTime?: string;
  runCount: number;
  lastResult?: CollectionCycleResult;
}

/**
 * Bộ lập lịch thu thập dữ liệu định kỳ (Collection Scheduler) sử dụng node-cron
 * Tích hợp cơ chế chống chạy chồng chéo (Job Overlap Prevention)
 */
export class CollectionScheduler {
  private collector: CollectorService;
  private cronExpression: string;
  private appId: string;
  private runOnInit: boolean;
  private scheduledTask: ScheduledTask | null = null;
  private isCollecting: boolean = false;
  private lastRunTime?: string;
  private lastResult?: CollectionCycleResult;
  private runCount: number = 0;

  /**
   * Khởi tạo CollectionScheduler
   * @param collector Dịch vụ Collector điều phối
   * @param options Tùy chọn biểu thức cron và ứng dụng
   */
  constructor(collector: CollectorService, options: SchedulerOptions = {}) {
    this.collector = collector;
    this.cronExpression = options.cronExpression ?? "0 */6 * * *";
    this.appId = options.appId ?? "uniclass";
    this.runOnInit = options.runOnInit ?? false;
  }

  /**
   * Bắt đầu tiến trình lập lịch chạy định kỳ
   */
  start(): void {
    if (this.scheduledTask) {
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      throw new Error(`Biểu thức cron không hợp lệ: "${this.cronExpression}"`);
    }

    this.scheduledTask = cron.schedule(this.cronExpression, async () => {
      await this.executeJob();
    });

    if (this.runOnInit) {
      this.executeJob().catch((err) => {
        console.error("[Scheduler] Lỗi khi thực thi khởi động ban đầu:", err);
      });
    }
  }

  /**
   * Dừng tiến trình lập lịch chạy định kỳ
   */
  stop(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }
  }

  /**
   * Kích hoạt một phiên thu thập dữ liệu thủ công ngay lập tức
   * @param appId Mã ứng dụng (tùy chọn, mặc định lấy appId đã cấu hình)
   */
  async triggerManual(appId?: string): Promise<CollectionCycleResult> {
    return this.executeJob(appId ?? this.appId);
  }

  /**
   * Thực thi một phiên thu thập dữ liệu có kiểm tra chống chồng chéo
   */
  private async executeJob(targetAppId?: string): Promise<CollectionCycleResult> {
    const app = targetAppId ?? this.appId;

    if (this.isCollecting) {
      console.warn(
        `[Scheduler] Bỏ qua lượt chạy: Phiên thu thập trước đó của ứng dụng ${app} chưa hoàn tất`
      );
      return {
        runId: "skipped-overlap",
        appId: app,
        status: "UNAVAILABLE",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        platforms: {},
        totalNewReviewsSaved: 0,
        error: "Phiên thu thập bị bỏ qua do phiên trước đang chạy",
      };
    }

    this.isCollecting = true;
    this.lastRunTime = new Date().toISOString();

    try {
      const result = await this.collector.collectApp(app);
      this.lastResult = result;
      this.runCount++;
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Scheduler] Lỗi trong phiên thu thập ứng dụng ${app}:`, message);
      throw err;
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * Lấy thông tin trạng thái hoạt động hiện tại của Scheduler
   */
  getStatus(): SchedulerStatus {
    return {
      isRunning: this.scheduledTask !== null,
      cronExpression: this.cronExpression,
      isCollecting: this.isCollecting,
      appId: this.appId,
      lastRunTime: this.lastRunTime,
      runCount: this.runCount,
      lastResult: this.lastResult,
    };
  }
}

