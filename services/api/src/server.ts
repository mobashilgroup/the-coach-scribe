import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { prisma, disconnect } from "./db.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildApp({ prisma, env });

  const close = async () => {
    await app.close();
    await disconnect();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`The Coach Scribe API listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
