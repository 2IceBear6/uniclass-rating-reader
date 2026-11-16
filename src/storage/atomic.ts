import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Ghi tệp tin một cách nguyên tử (Atomic write) qua tệp tạm (.tmp) và đổi tên
 * Đảm bảo dữ liệu không bị hỏng hoặc rỗng (0 byte) nếu hệ thống bị dừng đột ngột
 * @param filePath Đường dẫn đích của tệp tin cần ghi
 * @param content Nội dung chuỗi cần ghi
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const targetDir = path.dirname(filePath);
  await fs.mkdir(targetDir, { recursive: true });

  const tempFilePath = path.join(
    targetDir,
    `.${path.basename(filePath)}.tmp.${randomUUID()}`
  );

  let fileHandle: fs.FileHandle | null = null;
  try {
    // 1. Mở và ghi ra file tạm thời trong cùng thư mục
    fileHandle = await fs.open(tempFilePath, "w");
    await fileHandle.writeFile(content, "utf8");
    // 2. Đảm bảo dữ liệu đã được ghi hoàn toàn xuống đĩa cứng vật lý
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = null;

    // 3. Đổi tên tệp tạm thành tệp đích (nguyên tử)
    // Trên Windows, xử lý thử lại với backoff nếu tệp đích tạm thời bị khóa đọc
    let renamed = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!renamed && attempts < maxAttempts) {
      try {
        await fs.rename(tempFilePath, filePath);
        renamed = true;
      } catch (renameErr: unknown) {
        attempts++;
        const errCode = (renameErr as { code?: string }).code;
        if ((errCode === "EPERM" || errCode === "EBUSY") && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 20 * attempts));
          continue;
        }

        // Nếu rename vẫn thất bại (do phân vùng hoặc cơ chế Windows), fallback bằng copy & unlink
        await fs.copyFile(tempFilePath, filePath);
        await fs.unlink(tempFilePath).catch(() => {});
        renamed = true;
      }
    }
  } catch (err) {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
    await fs.unlink(tempFilePath).catch(() => {});
    throw err;
  }
}

/**
 * Ghi đối tượng dữ liệu JSON một cách nguyên tử
 * @param filePath Đường dẫn đích của tệp JSON
 * @param data Đối tượng dữ liệu cần tuần tự hóa
 */
export async function atomicWriteJson<T>(filePath: string, data: T): Promise<void> {
  const jsonContent = JSON.stringify(data, null, 2);
  await atomicWriteFile(filePath, jsonContent);
}

/**
 * Đọc và phân tích cú pháp tệp JSON an toàn
 * @param filePath Đường dẫn tệp JSON cần đọc
 * @returns Đối tượng phân tích cú pháp hoặc null nếu tệp không tồn tại
 */
export async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

