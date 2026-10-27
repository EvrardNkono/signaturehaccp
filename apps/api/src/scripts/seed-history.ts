/**
 * Historique de relevés de démonstration, pour tester l'export par période.
 *   npx tsx src/scripts/seed-history.ts                → 365 jours, 1 relevé toutes les 2 h par équipement
 *   npx tsx src/scripts/seed-history.ts --days 90 --every 60
 *
 * À lancer après `npm run seed`. Ne touche qu'à l'établissement de démonstration « Le Bistrot du Coin » et
 * ne supprime que les relevés qu'il a lui-même créés (responsable « Historique démo ») : relançable à volonté.
 */
import dns from "node:dns";
import { connectDb, disconnectDb } from "../config/db";
import { isProd } from "../config/env";
import { Equipment, Establishment, Reading } from "../models";
import { statusForValue } from "../domain/equipment";

// Même contournement que src/server.ts : sur certains PC / réseaux, le DNS refuse les requêtes SRV d'Atlas
// (erreur « querySrv ECONNREFUSED »). Hors production uniquement.
if (!isProd) dns.setServers(["8.8.8.8", "1.1.1.1"]);

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : def;
  return Number.isFinite(v) && v > 0 ? v : def;
};
const days = Math.min(arg("days", 365), 366);
const everyMin = Math.max(arg("every", 120), 15);
const MARK = "Historique démo";

async function main() {
  if (isProd && !process.argv.includes("--force")) {
    console.error("Refus : NODE_ENV=production. Ajoutez --force si vous voulez vraiment alimenter cette base.");
    process.exit(1);
  }
  await connectDb();

  const est = await Establishment.findOne({ name: "Le Bistrot du Coin" });
  if (!est) {
    console.error("Établissement de démonstration introuvable : lancez d'abord « npm run seed ».");
    await disconnectDb();
    process.exit(1);
  }
  const equipments = await Equipment.find({ establishmentId: est._id, archived: false });

  const removed = await Reading.deleteMany({ establishmentId: est._id, by: MARK });

  // On s'arrête avant les relevés récents du seed (≈ 4 h) pour ne pas créer de doublons.
  const end = Date.now() - 4 * 3_600_000;
  const start = end - days * 86_400_000;
  const step = everyMin * 60_000;

  let created = 0;
  for (const eq of equipments) {
    const mid = (eq.min + eq.max) / 2;
    const amp = (eq.max - eq.min) / 14; // petites oscillations autour du milieu de la plage
    const docs = [];
    for (let t = start, i = 0; t < end; t += step, i++) {
      const daily = Math.sin((i * everyMin * 2 * Math.PI) / 1440) * amp;
      let value = mid + daily + (Math.random() - 0.5) * amp;
      const roll = Math.random();
      if (roll < 0.01) value = eq.max + 0.5 + Math.random() * 2; // dépassement ponctuel (critique)
      else if (roll < 0.03) value = eq.max - eq.warnMargin / 2; // proche du seuil (à surveiller)
      value = Math.round(value * 10) / 10;
      const status = statusForValue(value, eq);
      docs.push({
        establishmentId: est._id,
        equipmentId: eq._id,
        equipmentName: eq.name,
        value,
        status,
        source: eq.sensor ? ("iot" as const) : ("manual" as const),
        by: MARK,
        action: status === "critical" ? "Porte refermée, produits contrôlés." : undefined,
        at: new Date(t),
      });
    }
    for (let k = 0; k < docs.length; k += 5000) await Reading.insertMany(docs.slice(k, k + 5000), { ordered: false });
    created += docs.length;
  }

  console.log(`\n${removed.deletedCount} ancien(s) relevé(s) de démonstration supprimé(s).`);
  console.log(`${created} relevés créés sur ${days} jours (1 toutes les ${everyMin} min) pour ${equipments.length} équipements.\n`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});