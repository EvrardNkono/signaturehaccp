import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { corsOrigins, env } from "./config/env";
import { logger } from "./config/logger";
import api from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Pas d'en-tête Origin : appels serveur à serveur, application mobile, capteurs.
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Client", "X-Device-Key"],
      exposedHeaders: ["Content-Disposition"],
      maxAge: 600,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.NODE_ENV === "test" ? 100_000 : 600,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (req) => req.path === "/health",
      message: { error: { code: "RATE_LIMITED", message: "Trop de requêtes. Réessayez dans un instant." } },
    })
  );

  app.get("/health", (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "degraded", db: ready ? "up" : "down", uptime: Math.round(process.uptime()) });
  });

  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// 👇 Instance exportée par défaut : c'est ce que Vercel attend.
const app = createApp();
export default app;