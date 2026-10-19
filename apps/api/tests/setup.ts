import os from "os";
import path from "path";

// Les tests n'utilisent JAMAIS la base du .env : base jetable, supprimée à la fin.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/haccp_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret-0123456789";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret-0123456789";
process.env.JOBS_ENABLED = "false";
process.env.STORAGE_DRIVER = "local";
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `haccp-uploads-${process.pid}`);
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_SAMESITE = "lax";
process.env.SMTP_HOST = "";
