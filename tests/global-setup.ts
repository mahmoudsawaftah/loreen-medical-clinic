import { execSync } from "node:child_process";
import path from "node:path";

const TEST_DB_URL = "postgresql://clinic:clinic_dev_password@localhost:5432/clinic_test?schema=public";

export default async function globalSetup() {
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: "pipe",
      timeout: 120000,
    });
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? "";
    if (!stderr.includes("Database is not reachable")) {
      // rethrow unless it's a connection problem (would spam every run)
      console.error("prisma db push failed", stderr.slice(0, 2000));
      throw e;
    }
  }
}