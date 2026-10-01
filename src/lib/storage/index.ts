import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Storage abstraction for attachments.
 * - local: files on disk under STORAGE_DIR (default ./storage)
 * - s3:   S3-compatible provider; implementation boundary documented in README.
 *         The S3 adapter is a thin, ready-to-fill implementation — credentials are
 *         external and cannot be generated locally, so local storage is the default.
 */

export interface StoredFile {
  storedName: string;
}

export interface StorageProvider {
  save(data: Buffer, storedName: string): Promise<StoredFile>;
  read(storedName: string): Promise<Buffer>;
  exists(storedName: string): Promise<boolean>;
  delete(storedName: string): Promise<void>;
  /** Path-safe canonical name */
  nameFor(original: string): string;
}

export function safeStoredName(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const base = original.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}-${base || "file"}${ext || ".bin"}`;
}

class LocalStorageProvider implements StorageProvider {
  private dir: string;

  constructor() {
    this.dir = path.resolve(process.env.STORAGE_DIR || "./storage");
  }

  private fullPath(storedName: string): string {
    return path.join(this.dir, path.basename(storedName));
  }

  async save(data: Buffer, storedName: string): Promise<StoredFile> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.fullPath(storedName), data);
    return { storedName };
  }

  async read(storedName: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(storedName));
  }

  async exists(storedName: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(storedName));
      return true;
    } catch {
      return false;
    }
  }

  async delete(storedName: string): Promise<void> {
    try {
      await fs.unlink(this.fullPath(storedName));
    } catch {
      // ignore missing file
    }
  }

  nameFor(original: string): string {
    return safeStoredName(original);
  }
}

/**
 * S3-compatible provider. Requires external credentials (S3_ENDPOINT, keys, bucket).
 * Left intentionally dependency-light: when credentials exist, install an S3 SDK
 * (e.g. @aws-sdk/client-s3) and implement save/read/exists/delete against it.
 */
class S3StorageProvider implements StorageProvider {
  nameFor(original: string): string {
    return safeStoredName(original);
  }

  async save(data: Buffer, storedName: string): Promise<StoredFile> {
    void data;
    void storedName;
    throw new Error(
      "S3 storage selected but not configured. Set S3_ENDPOINT/S3_BUCKET/credentials and install an S3 SDK (see README 'Storage')",
    );
  }

  async read(_storedName: string): Promise<Buffer> {
    throw new Error("S3 storage not configured");
  }

  async exists(_storedName: string): Promise<boolean> {
    return false;
  }

  async delete(_storedName: string): Promise<void> {
    // no-op until configured
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!provider) {
    const kind = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
    provider = kind === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
  }
  return provider;
}

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "image/heic",
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
