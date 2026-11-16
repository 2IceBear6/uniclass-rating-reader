import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Định dạng thời gian hiện tại thành chuỗi dùng làm tên thư mục backup: YYYYMMDD-HHmmss
 */
function getBackupTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Sao lưu toàn bộ dữ liệu ứng dụng UniClass sang thư mục backup an toàn
 * @param baseDir Thư mục gốc chứa dữ liệu (ví dụ: "./data")
 * @param appId Mã ứng dụng (ví dụ: "uniclass")
 * @returns Đường dẫn thư mục bản sao lưu vừa tạo
 */
export async function createAppDataBackup(baseDir: string, appId: string): Promise<string> {
  const sourceAppDir = path.join(baseDir, "apps", appId);
  const timestamp = getBackupTimestamp();
  const backupDir = path.join(baseDir, "backups", appId, timestamp);

  await fs.mkdir(backupDir, { recursive: true });

  const targetFiles = ["app.json", "reviews.jsonl", "rating-history.jsonl"];

  for (const fileName of targetFiles) {
    const srcPath = path.join(sourceAppDir, fileName);
    const destPath = path.join(backupDir, fileName);

    try {
      await fs.copyFile(srcPath, destPath);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "ENOENT") {
        throw err;
      }
      // Bỏ qua nếu file nguồn chưa tồn tại
    }
  }

  return backupDir;
}

