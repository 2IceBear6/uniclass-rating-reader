import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Ghi nối an toàn (Safe Append) danh sách các bản ghi vào tệp JSONL
 * Đảm bảo mỗi bản ghi nằm trên một dòng riêng biệt hợp lệ và có ký tự ngắt dòng UTF-8 chuẩn
 * @param filePath Đường dẫn tệp tin JSONL
 * @param records Mảng các bản ghi đối tượng cần ghi nối
 */
export async function safeAppendJsonl<T>(filePath: string, records: T[]): Promise<number> {
  if (records.length === 0) return 0;

  const targetDir = path.dirname(filePath);
  await fs.mkdir(targetDir, { recursive: true });

  let prependNewline = false;

  try {
    // Kiểm tra ký tự cuối cùng của tệp hiện có
    const handle = await fs.open(filePath, "r");
    const stats = await handle.stat();
    if (stats.size > 0) {
      const buffer = Buffer.alloc(1);
      await handle.read(buffer, 0, 1, stats.size - 1);
      if (buffer[0] !== 0x0a) {
        // Ký tự cuối không phải '\n', cần chèn '\n' trước dòng mới
        prependNewline = true;
      }
    }
    await handle.close();
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOENT") {
      throw err;
    }
    // Tệp chưa tồn tại, không cần chèn newline đầu tiên
  }

  // Chuẩn bị chuỗi nội dung append
  const lines = records.map((rec) => JSON.stringify(rec)).join("\n") + "\n";
  const payload = (prependNewline ? "\n" : "") + lines;

  await fs.appendFile(filePath, payload, "utf8");
  return records.length;
}

/**
 * Đọc dữ liệu từ tệp JSONL với cơ chế chịu lỗi (Fault-tolerant)
 * Tự động bỏ qua các dòng bị lỗi định dạng hoặc hỏng mà không làm mất dữ liệu còn lại
 * @param filePath Đường dẫn tệp tin JSONL
 * @param options Tùy chọn giới hạn số lượng và vị trí bắt đầu
 * @returns Mảng các bản ghi hợp lệ đã được phân tích cú pháp
 */
export async function readJsonlFaultTolerant<T>(
  filePath: string,
  options?: { limit?: number; offset?: number }
): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    if (!content.trim()) {
      return [];
    }

    const rawLines = content.split(/\r?\n/);
    const validRecords: T[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;

      try {
        const parsed = JSON.parse(line) as T;
        validRecords.push(parsed);
      } catch {
        console.warn(
          `[Storage Engine] Bỏ qua dòng hỏng #${i + 1} trong tệp: ${filePath}`
        );
      }
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? validRecords.length;

    return validRecords.slice(offset, offset + limit);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

