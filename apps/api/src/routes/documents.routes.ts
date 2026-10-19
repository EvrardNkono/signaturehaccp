import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { DocumentModel } from "../models";
import { getAuth, getEst, requireAccess } from "../middleware/auth";
import { DOCUMENT_CATEGORIES, categoriesWithExpiry, expiryStatus } from "../domain/documents";
import { forbidden, notFound, unprocessable } from "../utils/httpError";
import { escapeRegex, oid } from "../utils/mongo";
import { upload } from "../middleware/upload";
import { openFile, removeFile, saveFile } from "../services/storage";
import { presentDocument } from "../services/presenters";
import { audit } from "../services/audit";
import { optText, text } from "./helpers";

const router = Router({ mergeParams: true });

const metaSchema = z.object({
  name: text(160, "Nom").optional(),
  category: z.enum(DOCUMENT_CATEGORIES),
  description: optText(600),
  expiresAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.coerce.date().optional()),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : (v ?? "").split(",")).map((t) => t.trim()).filter(Boolean).slice(0, 10)),
});

router.get("/", async (req, res) => {
  const est = getEst(req);
  const q = z
    .object({
      category: z.enum(DOCUMENT_CATEGORIES).optional(),
      archived: z.enum(["true", "false", "all"]).default("false"),
      expiry: z.enum(["soon", "expired", "ok", "none"]).optional(),
      search: z.string().trim().max(80).optional(),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = { establishmentId: est._id };
  if (q.category) filter.category = q.category;
  if (q.archived !== "all") filter.archived = q.archived === "true";
  if (q.search) {
    const rx = { $regex: escapeRegex(q.search), $options: "i" };
    filter.$or = [{ name: rx }, { fileName: rx }, { tags: rx }];
  }
  const docs = await DocumentModel.find(filter).sort({ uploadedAt: -1 });
  const now = new Date();
  const list = docs.filter((d) => !q.expiry || expiryStatus(d.expiresAt, now) === q.expiry).map((d) => presentDocument(d, now));
  res.json({
    data: list,
    counts: {
      expired: docs.filter((d) => !d.archived && expiryStatus(d.expiresAt, now) === "expired").length,
      soon: docs.filter((d) => !d.archived && expiryStatus(d.expiresAt, now) === "soon").length,
    },
  });
});

/** Dépôt d'un document (multipart/form-data : champ "file" + métadonnées). */
router.post("/", requireAccess("documents", "write"), upload.single("file"), async (req, res) => {
  const est = getEst(req);
  const { userId, name } = getAuth(req);
  if (!req.file) throw unprocessable("Fichier obligatoire.", "FILE_REQUIRED", { field: "file" });
  const meta = metaSchema.parse(req.body);
  if (meta.expiresAt && !categoriesWithExpiry.includes(meta.category)) {
    throw unprocessable("Cette catégorie n'a pas de date d'expiration.", "EXPIRY_NOT_ALLOWED", { field: "expiresAt" });
  }

  const stored = await saveFile(req.file.buffer, { originalName: req.file.originalname, mime: req.file.mimetype, folder: `est-${est._id}` });
  const doc = await DocumentModel.create({
    establishmentId: est._id,
    name: meta.name ?? req.file.originalname.replace(/\.[^.]+$/, ""),
    category: meta.category,
    description: meta.description,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    fileType: req.file.mimetype,
    storageDriver: stored.driver,
    storageKey: stored.key,
    fileUrl: stored.url,
    uploadedBy: name,
    uploadedByUserId: new Types.ObjectId(userId),
    expiresAt: meta.expiresAt ?? null,
    tags: meta.tags,
  });
  await audit(req, { action: "document.upload", entity: "document", entityId: String(doc._id), meta: { name: doc.name, category: doc.category } });
  res.status(201).json(presentDocument(doc));
});

async function loadDoc(req: Parameters<typeof getEst>[0]) {
  const est = getEst(req);
  const doc = await DocumentModel.findOne({ _id: oid(req.params.id, "Document"), establishmentId: est._id });
  if (!doc) throw notFound("Document introuvable.");
  return doc;
}

router.get("/:id", async (req, res) => res.json(presentDocument(await loadDoc(req))));

/** Téléchargement : toujours derrière l'authentification, jamais d'URL publique directe. */
router.get("/:id/file", async (req, res) => {
  const doc = await loadDoc(req);
  const src = await openFile(doc);
  if (src.kind === "missing") throw notFound("Fichier introuvable sur le stockage.");
  if (src.kind === "redirect") return res.redirect(302, src.url);
  const inline = req.query.download !== "1" && (doc.fileType === "application/pdf" || doc.fileType.startsWith("image/"));
  res.setHeader("Content-Type", doc.fileType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
  src.stream.pipe(res);
});

router.patch("/:id", requireAccess("documents", "write"), async (req, res) => {
  const doc = await loadDoc(req);
  const meta = metaSchema.partial().parse(req.body);
  const category = meta.category ?? doc.category;
  if (meta.expiresAt && !categoriesWithExpiry.includes(category)) {
    throw unprocessable("Cette catégorie n'a pas de date d'expiration.", "EXPIRY_NOT_ALLOWED", { field: "expiresAt" });
  }
  if (meta.name !== undefined) doc.name = meta.name;
  if (meta.category !== undefined) doc.category = meta.category;
  if (meta.description !== undefined) doc.description = meta.description;
  if (req.body && "expiresAt" in req.body) doc.expiresAt = meta.expiresAt ?? null;
  if (meta.tags !== undefined && req.body && "tags" in req.body) doc.tags = meta.tags;
  await doc.save();
  await audit(req, { action: "document.update", entity: "document", entityId: String(doc._id), meta: { fields: Object.keys(req.body ?? {}) } });
  res.json(presentDocument(doc));
});

/** Archivage avec motif (soft delete). */
router.delete("/:id", requireAccess("documents", "write"), async (req, res) => {
  const doc = await loadDoc(req);
  const { name } = getAuth(req);
  const { reason } = z.object({ reason: text(300, "Motif") }).parse(req.body ?? {});
  doc.archived = true;
  doc.archivedAt = new Date();
  doc.deleteReason = reason;
  doc.deletedBy = name;
  await doc.save();
  await audit(req, { action: "document.archive", entity: "document", entityId: String(doc._id), meta: { reason } });
  res.json(presentDocument(doc));
});

router.post("/:id/restore", requireAccess("documents", "write"), async (req, res) => {
  const doc = await loadDoc(req);
  doc.archived = false;
  doc.archivedAt = null;
  doc.deleteReason = undefined;
  doc.deletedBy = undefined;
  await doc.save();
  await audit(req, { action: "document.restore", entity: "document", entityId: String(doc._id) });
  res.json(presentDocument(doc));
});

/** Suppression définitive : fichier + fiche (administrateurs, document déjà archivé). */
router.delete("/:id/permanent", requireAccess("documents", "write"), async (req, res) => {
  const { user } = getAuth(req);
  if (!["super_admin", "admin"].includes(user.role)) throw forbidden("Réservé aux administrateurs.", "INSUFFICIENT_ROLE");
  const doc = await loadDoc(req);
  if (!doc.archived) throw unprocessable("Archivez d'abord le document.", "NOT_ARCHIVED");
  await removeFile(doc).catch(() => undefined);
  await doc.deleteOne();
  await audit(req, { action: "document.delete_permanent", entity: "document", entityId: String(doc._id), meta: { name: doc.name } });
  res.json({ ok: true });
});

export default router;
