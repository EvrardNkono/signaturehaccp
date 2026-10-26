import "dotenv/config";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: bool(false),

  MONGODB_URI: z.string().min(1, "MONGODB_URI est obligatoire"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET : 32 caractères minimum"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET : 32 caractères minimum"),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  COOKIE_SECURE: bool(false),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Signature HACCP <no-reply@signature-haccp.local>"),

  STORAGE_DRIVER: z.enum(["local", "cloudinary"]).default("local"),
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  JOBS_ENABLED: bool(true),
  SENSOR_OFFLINE_MINUTES: z.coerce.number().int().positive().default(45),
  SENSOR_LOW_BATTERY: z.coerce.number().int().min(1).max(100).default(15),
  // Conservation des relevés de température : 0 = jamais supprimés (défaut), sinon 365 jours minimum (1 an).
  READING_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .refine((v) => v === 0 || v >= 365, "READING_RETENTION_DAYS : 0 (conservation illimitée) ou 365 jours minimum")
    .default(0),

  SEED_PASSWORD: z.string().min(8).default("Haccp2026!"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")} : ${i.message}`).join("\n");
    // eslint-disable-next-line no-console
    console.error(`Configuration invalide (.env) :\n${lines}`);
    process.exit(1);
  }
  const env = parsed.data;
  if (env.STORAGE_DRIVER === "cloudinary") {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      // eslint-disable-next-line no-console
      console.error("STORAGE_DRIVER=cloudinary exige CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.");
      process.exit(1);
    }
  }
  if (env.COOKIE_SAMESITE === "none" && !env.COOKIE_SECURE) {
    // eslint-disable-next-line no-console
    console.error("COOKIE_SAMESITE=none exige COOKIE_SECURE=true (HTTPS).");
    process.exit(1);
  }
  return env;
}

export const env = load();
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
export const isProd = env.NODE_ENV === "production";
