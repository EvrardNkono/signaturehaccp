import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { IDocument } from "../models";

export type StoredFile = { driver: "local" | "cloudinary"; key: string; url?: string };

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

function safeName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "fichier";
}

let cloudinaryReady = false;
function cloud() {
  if (!cloudinaryReady) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    cloudinaryReady = true;
  }
  return cloudinary;
}

export async function saveFile(buffer: Buffer, opts: { originalName: string; mime: string; folder: string }): Promise<StoredFile> {
  if (env.STORAGE_DRIVER === "cloudinary") {
    const result = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
      const stream = cloud().uploader.upload_stream(
        { folder: `signature-haccp/${opts.folder}`, resource_type: "auto", type: "authenticated" },
        (err, res) => (err || !res ? reject(err ?? new Error("Échec de l'envoi Cloudinary")) : resolve(res))
      );
      Readable.from(buffer).pipe(stream);
    });
    return { driver: "cloudinary", key: result.public_id, url: result.secure_url };
  }

  const dir = path.join(uploadRoot, opts.folder);
  await fs.promises.mkdir(dir, { recursive: true });
  const key = `${opts.folder}/${crypto.randomUUID()}-${safeName(opts.originalName)}`;
  await fs.promises.writeFile(path.join(uploadRoot, key), buffer);
  return { driver: "local", key };
}

/** Résout le chemin local en refusant toute sortie du dossier d'upload (path traversal). */
function localPath(key: string): string {
  const full = path.resolve(uploadRoot, key);
  if (!full.startsWith(uploadRoot + path.sep)) throw new Error("Chemin de fichier invalide");
  return full;
}

export type FileSource = { kind: "stream"; stream: fs.ReadStream } | { kind: "redirect"; url: string } | { kind: "missing" };

export async function openFile(doc: Pick<IDocument, "storageDriver" | "storageKey" | "fileType">): Promise<FileSource> {
  if (doc.storageDriver === "cloudinary") {
    const resourceType = doc.fileType.startsWith("image/") ? "image" : "raw";
    const url = cloud().url(doc.storageKey, { sign_url: true, type: "authenticated", resource_type: resourceType, secure: true });
    return { kind: "redirect", url };
  }
  const p = localPath(doc.storageKey);
  if (!fs.existsSync(p)) return { kind: "missing" };
  return { kind: "stream", stream: fs.createReadStream(p) };
}

export async function removeFile(doc: Pick<IDocument, "storageDriver" | "storageKey" | "fileType">): Promise<void> {
  if (doc.storageDriver === "cloudinary") {
    await cloud().uploader.destroy(doc.storageKey, {
      resource_type: doc.fileType.startsWith("image/") ? "image" : "raw",
      type: "authenticated",
    });
    return;
  }
  await fs.promises.rm(localPath(doc.storageKey), { force: true });
}
