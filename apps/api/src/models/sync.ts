import mongoose from "mongoose";
import "./index";

/** Crée les index déclarés dans les schémas (utile au premier démarrage et après une évolution). */
export const models = {
  async syncIndexes() {
    for (const name of mongoose.modelNames()) {
      await mongoose.model(name).syncIndexes();
    }
  },
};
