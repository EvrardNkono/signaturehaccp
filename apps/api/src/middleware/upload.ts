import multer from "multer";
import { env } from "../config/env";
import { ACCEPTED_TYPES } from "../domain/documents";
import { unprocessable } from "../utils/httpError";

/** Fichiers en mémoire (10 Mo par défaut) puis transmis au service de stockage. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ACCEPTED_TYPES.includes(file.mimetype)) {
      return cb(unprocessable("Format accepté : PDF, JPG, PNG, WEBP, XLS(X), DOC(X).", "FILE_TYPE_INVALID"));
    }
    cb(null, true);
  },
});
