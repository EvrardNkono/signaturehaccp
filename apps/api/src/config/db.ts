import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

mongoose.set("strictQuery", true);

let listenersAttached = false;
let pending: Promise<typeof mongoose> | null = null;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on("disconnected", () => {
    pending = null; // force une nouvelle connexion au prochain appel
    logger.warn("MongoDB déconnecté");
  });
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnecté"));
}

/** Connexion classique (serveur local : server.ts). */
export async function connectDb(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  attachListeners();
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: conn.connection.name }, "MongoDB connecté");
  return conn;
}

/** Connexion paresseuse et mise en cache (serverless / Vercel). Sans effet si déjà connecté. */
export function ensureDb(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!pending) {
    pending = connectDb(uri).catch((err) => {
      pending = null; // permet de réessayer à la requête suivante
      throw err;
    });
  }
  return pending;
}

export async function disconnectDb(): Promise<void> {
  pending = null;
  await mongoose.disconnect();
}