// prisma.config.ts intentionally left minimal.
// DATABASE_URL is set via .env (loaded by the Prisma CLI automatically
// when this file is absent – delete this file if migrate issues persist).
import { defineConfig } from "prisma/config";
export default defineConfig({});
