import { execSync } from "child_process";
import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "file:./test.db";
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: {
      ...process.env,
      DATABASE_URL: "file:./test.db",
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
    },
    stdio: "pipe",
  });
});
