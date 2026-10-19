import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

mongoose.set("strictQuery", true);

export async function connectDb(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB déconnecté"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnecté"));
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: conn.connection.name }, "MongoDB connecté");
  return conn;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
