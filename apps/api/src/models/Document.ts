import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";
import { DOCUMENT_CATEGORIES, DocumentCategory } from "../domain/documents";

export interface IDocument {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  name: string;
  category: DocumentCategory;
  description?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storageDriver: "local" | "cloudinary";
  storageKey: string;
  fileUrl?: string;
  uploadedAt: Date;
  uploadedBy: string;
  uploadedByUserId?: Types.ObjectId | null;
  expiresAt?: Date | null;
  tags: string[];
  archived: boolean;
  archivedAt?: Date | null;
  deleteReason?: string;
  deletedBy?: string;
}

const schema = new Schema<IDocument>(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, enum: DOCUMENT_CATEGORIES, required: true },
    description: { type: String, maxlength: 600 },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, required: true },
    storageDriver: { type: String, enum: ["local", "cloudinary"], required: true },
    storageKey: { type: String, required: true },
    fileUrl: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: true },
    uploadedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    expiresAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    archived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    deleteReason: { type: String, maxlength: 300 },
    deletedBy: String,
  },
  { timestamps: false }
);
schema.plugin(jsonPlugin);
export const DocumentModel = model<IDocument>("Document", schema);
