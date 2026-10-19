import dns from "node:dns";
import { createApp } from "./app";
import { connectDb, disconnectDb } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { startJobs } from "./jobs";
import { models } from "./models/sync";

// Développement local uniquement : un programme sur ce PC (127.0.0.1) refuse les requêtes DNS SRV d'Atlas.
// À retirer avant la mise en production.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function main() {
  await connectDb();
  await models.syncIndexes();

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`API Signature HACCP en écoute sur http://localhost:${env.PORT} (${env.NODE_ENV})`));
  const stopJobs = env.JOBS_ENABLED ? startJobs() : () => undefined;

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "Arrêt en cours...");
    stopJobs();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (err) => logger.error({ err }, "Promesse rejetée non gérée"));
}

main().catch((err) => {
  logger.error({ err }, "Démarrage impossible");
  process.exit(1);
});