/**
 * Jeu de données de démonstration (mêmes noms et valeurs que les données d'exemple du front).
 *   npm run seed            → refuse si la base contient déjà des utilisateurs
 *   npm run seed -- --reset → vide les collections de l'application puis recrée le jeu de démonstration
 */
import { connectDb, disconnectDb } from "../config/db";
import { env, isProd } from "../config/env";
import {
  Alert, AuditLog, CleaningCompletion, CleaningTask, Company, DocumentModel, Equipment, Establishment, Lot,
  OilChange, OilControl, Reading, RefreshToken, User,
} from "../models";
import { hashPassword, randomToken, sha256 } from "../utils/password";
import { statusForValue } from "../domain/equipment";
import { getOilStatus } from "../domain/oil";
import { isoWeekKey, nowInTz } from "../domain/time";
import { formatRange, formatTemp } from "../domain/format";

const reset = process.argv.includes("--reset");
const force = process.argv.includes("--force");

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const minAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function main() {
  if (isProd && !force) {
    console.error("Refus : NODE_ENV=production. Ajoutez --force si vous voulez vraiment alimenter cette base.");
    process.exit(1);
  }
  await connectDb();

  if (await User.exists({})) {
    if (!reset) {
      console.error("La base contient déjà des utilisateurs. Relancez avec : npm run seed -- --reset (efface les données de l'application).");
      process.exit(1);
    }
    await Promise.all([
      Alert.deleteMany({}), AuditLog.deleteMany({}), CleaningCompletion.deleteMany({}), CleaningTask.deleteMany({}),
      Company.deleteMany({}), DocumentModel.deleteMany({}), Equipment.deleteMany({}), Establishment.deleteMany({}),
      Lot.deleteMany({}), OilChange.deleteMany({}), OilControl.deleteMany({}), Reading.deleteMany({}),
      RefreshToken.deleteMany({}), User.deleteMany({}),
    ]);
  }

  const company = await Company.create({ name: "Signature Restauration", kbis: "12345678900012", onboarding: { completedSteps: ["establishment", "equipments"] } });

  const [e1, e2, e3] = await Establishment.create([
    { companyId: company._id, name: "Le Bistrot du Coin", city: "Lyon", siret: "12345678900012", manager: "Jules Dupont", email: "contact@bistrot-du-coin.fr", timezone: "Europe/Paris" },
    { companyId: company._id, name: "La Table de Léon", city: "Villeurbanne", siret: "12345678900020", timezone: "Europe/Paris" },
    { companyId: company._id, name: "Chez Marcel", city: "Lyon", siret: "12345678900038", timezone: "Europe/Paris" },
  ]);

  const hash = await hashPassword(env.SEED_PASSWORD);
  const mk = (firstName: string, lastName: string, email: string, role: string, extra: Record<string, unknown> = {}) => ({
    companyId: company._id, firstName, lastName, email, role, passwordHash: hash, ...extra,
  });
  await User.create([
    mk("Jules", "Dupont", "jules@signature.fr", "super_admin"),
    mk("Camille", "Roux", "camille.roux@signature.fr", "admin", { authorizedEstablishmentIds: [e1._id, e2._id] }),
    mk("Nadia", "Benali", "nadia.benali@signature.fr", "manager", { authorizedEstablishmentIds: [e1._id] }),
    mk("Marc", "Lefèvre", "marc.lefevre@signature.fr", "operator", { primaryEstablishmentId: e1._id }),
    mk("Sophie", "Garnier", "sophie.garnier@ddpp.fr", "auditor", { authorizedEstablishmentIds: [e1._id, e2._id, e3._id], active: false }),
  ]);

  // ---- Équipements du premier établissement (mêmes valeurs que le front) ----
  type Seed = { name: string; type: "fridge" | "freezer" | "coldroom" | "fryer"; zone: string; min: number; max: number; warnMargin: number; history: number[]; sensor: null | { battery: number; signal: number; online: boolean }; sinceMin: number };
  const defs: Seed[] = [
    { name: "Chambre froide n°1", type: "coldroom", zone: "Cuisine", min: 0, max: 3, warnMargin: 0.3, history: [2.4, 2.6, 2.5, 2.9, 2.7, 2.8, 2.8], sensor: { battery: 84, signal: 4, online: true }, sinceMin: 4 },
    { name: "Congélateur n°1", type: "freezer", zone: "Réserve", min: -30, max: -18, warnMargin: 1, history: [-19.8, -19.5, -19.6, -19.2, -19.4, -19.3, -19.4], sensor: { battery: 91, signal: 3, online: true }, sinceMin: 6 },
    { name: "Réfrigérateur bar", type: "fridge", zone: "Bar", min: 0, max: 4, warnMargin: 0.5, history: [3.2, 3.5, 3.6, 3.7, 3.7, 3.8, 3.8], sensor: { battery: 62, signal: 2, online: true }, sinceMin: 2 },
    { name: "Chambre froide n°2", type: "coldroom", zone: "Cuisine", min: 0, max: 3, warnMargin: 0.3, history: [3.0, 3.4, 4.1, 5.2, 6.0, 6.8, 7.1], sensor: { battery: 77, signal: 4, online: true }, sinceMin: 9 },
    { name: "Friteuse double", type: "fryer", zone: "Cuisine", min: 150, max: 180, warnMargin: 5, history: [172, 175, 176, 174, 175, 175, 175], sensor: null, sinceMin: 40 },
    { name: "Réfrigérateur pâtisserie", type: "fridge", zone: "Pâtisserie", min: 0, max: 4, warnMargin: 0.5, history: [3.1, 3.2, 3.0, 3.3, 3.2, 3.1, 3.2], sensor: { battery: 8, signal: 0, online: false }, sinceMin: 180 },
  ];

  const devKeys: Record<string, string> = {};
  const equipments: InstanceType<typeof Equipment>[] = [];
  for (const d of defs) {
    const key = `shk_${randomToken(24)}`;
    const offline = d.sensor && !d.sensor.online;
    const eq = await Equipment.create({
      establishmentId: e1._id, name: d.name, type: d.type, zone: d.zone, min: d.min, max: d.max, warnMargin: d.warnMargin,
      temp: offline ? null : d.history[d.history.length - 1],
      lastReadingAt: minAgo(d.sinceMin),
      recentValues: d.history,
      sensor: d.sensor ? { ...d.sensor, pairing: "paired", deviceKeyHash: sha256(key), lastSeenAt: minAgo(d.sinceMin) } : null,
    });
    devKeys[d.name] = key;
    equipments.push(eq);

    // Historique : 1 point toutes les 30 minutes, le dernier à l'heure du dernier relevé.
    const n = d.history.length;
    await Reading.create(
      d.history.map((value, i) => ({
        establishmentId: e1._id, equipmentId: eq._id, equipmentName: eq.name, value,
        status: statusForValue(value, eq), source: d.sensor ? "iot" : "manual", by: d.sensor ? "Capteur" : "Jules Dupont",
        at: minAgo(d.sinceMin + (n - 1 - i) * 30),
      }))
    );
  }
  const byName = (n: string) => equipments.find((e) => e.name === n)!;

  // ---- Alertes (mêmes cas que le front) ----
  const cf2 = byName("Chambre froide n°2");
  const bar = byName("Réfrigérateur bar");
  const patis = byName("Réfrigérateur pâtisserie");
  await Alert.create([
    { establishmentId: e1._id, severity: "critical", kind: "temperature", state: "open", title: "Température critique dépassée", detail: "Les denrées sont en danger. Vérifier la porte et le groupe froid.", equipmentId: cf2._id, equipmentName: cf2.name, zone: cf2.zone, value: formatTemp(7.1), threshold: formatRange(cf2.min, cf2.max), dedupeKey: `temp:${cf2._id}`, createdAt: minAgo(9) },
    { establishmentId: e1._id, severity: "warn", kind: "temperature", state: "in_progress", title: "Température proche du seuil", detail: "La température approche du seuil autorisé. Surveiller l'équipement.", equipmentId: bar._id, equipmentName: bar.name, zone: bar.zone, value: formatTemp(3.8), threshold: formatRange(bar.min, bar.max), takenBy: "Marc Lefèvre", takenAt: minAgo(20), dedupeKey: `temp:${bar._id}`, createdAt: minAgo(32) },
    { establishmentId: e1._id, severity: "critical", kind: "sensor", state: "open", title: "Capteur hors ligne", detail: "Le capteur ne répond plus. Relever la température manuellement.", equipmentId: patis._id, equipmentName: patis.name, zone: patis.zone, dedupeKey: `sensor-offline:${patis._id}`, createdAt: minAgo(150) },
    { establishmentId: e1._id, severity: "info", kind: "sensor", state: "resolved", title: "Connexion capteur rétablie", detail: "Le capteur a perdu la connexion quelques minutes.", equipmentId: byName("Congélateur n°1")._id, equipmentName: "Congélateur n°1", correctiveAction: "Capteur redémarré, connexion rétablie.", resolvedBy: "Marc Lefèvre", resolvedAt: minAgo(1425), createdAt: minAgo(1440) },
  ]);

  // ---- Nettoyage ----
  const today = nowInTz("Europe/Paris").date;
  const tasks = await CleaningTask.create([
    { establishmentId: e1._id, title: "Nettoyage des plans de travail", zone: "Cuisine", frequency: "after_service", method: "Détergent alimentaire puis désinfectant, rinçage", dueTime: "11:30" },
    { establishmentId: e1._id, title: "Nettoyage des sols", zone: "Cuisine", frequency: "daily", method: "Dégraissant sol, serpillière propre", dueTime: "15:00" },
    { establishmentId: e1._id, title: "Dégraissage de la hotte", zone: "Cuisine", frequency: "weekly", method: "Dégraissant professionnel, filtres à tremper", dueTime: "16:00" },
    { establishmentId: e1._id, title: "Désinfection des poignées de chambres froides", zone: "Cuisine", frequency: "daily", method: "Lingette désinfectante alimentaire", dueTime: "10:00" },
    { establishmentId: e1._id, title: "Nettoyage du comptoir et des verres", zone: "Bar", frequency: "after_service", method: "Eau chaude, détergent, séchage", dueTime: "12:00" },
    { establishmentId: e1._id, title: "Nettoyage de la machine à glaçons", zone: "Bar", frequency: "weekly", method: "Produit détartrant, rinçage abondant", dueTime: "17:00" },
    { establishmentId: e1._id, title: "Rangement et nettoyage des étagères", zone: "Réserve", frequency: "weekly", method: "Chiffon humide, vérification des DLC", dueTime: "18:00" },
    { establishmentId: e1._id, title: "Désinfection du laboratoire", zone: "Pâtisserie", frequency: "daily", method: "Détergent puis désinfectant, laisser agir 5 min", dueTime: "09:30" },
  ]);
  for (const i of [0, 1, 4, 6]) {
    const t = tasks[i];
    await CleaningCompletion.create({ establishmentId: e1._id, taskId: t._id, periodKey: t.frequency === "weekly" ? isoWeekKey(today) : today, doneBy: "Jules Dupont", doneAt: minAgo(60 + i * 15) });
  }

  // ---- Huile ----
  const fryer = byName("Friteuse double");
  const ctl = { polar: 18, temp: 175, aspect: "normal" as const };
  await OilControl.create({
    establishmentId: e1._id, fryerId: fryer._id, fryerName: fryer.name, slot: "morning", dayKey: today, ...ctl,
    status: getOilStatus(ctl.polar, ctl.temp, ctl.aspect, e1.settings), by: "Jules Dupont", at: minAgo(300),
  });
  await OilChange.create({ establishmentId: e1._id, fryerId: fryer._id, fryerName: fryer.name, by: "Marc Lefèvre", note: "Changement complet", at: minAgo(4 * 1440) });

  // ---- Traçabilité ----
  await Lot.create([
    { establishmentId: e1._id, product: "Filet de poulet", supplier: "Boucherie Martin", lotNumber: "BM-24811", category: "meat", quantity: "6 kg", receivedAt: addDays(today, -3), dlc: addDays(today, -1), receptionTemp: 3.1 },
    { establishmentId: e1._id, product: "Pavé de saumon", supplier: "Marée du Port", lotNumber: "MP-7730", category: "fish", quantity: "4 kg", receivedAt: addDays(today, -1), dlc: today, receptionTemp: 1.4 },
    { establishmentId: e1._id, product: "Crème fraîche", supplier: "Laiterie des Alpes", lotNumber: "LA-5521", category: "dairy", quantity: "10 L", receivedAt: addDays(today, -2), dlc: addDays(today, 2), receptionTemp: 3.6 },
    { establishmentId: e1._id, product: "Beurre doux", supplier: "Laiterie des Alpes", lotNumber: "LA-5498", category: "dairy", quantity: "5 kg", receivedAt: addDays(today, -4), dlc: addDays(today, 12), receptionTemp: 3.9 },
    { establishmentId: e1._id, product: "Salade verte", supplier: "Maraîcher Dupont", lotNumber: "MD-1203", category: "veg", quantity: "20 pièces", receivedAt: today, dlc: addDays(today, 4), receptionTemp: null },
    { establishmentId: e1._id, product: "Farine T55", supplier: "Grands Moulins", lotNumber: "GM-90021", category: "dry", quantity: "25 kg", receivedAt: addDays(today, -10), dlc: addDays(today, 90), receptionTemp: null },
    { establishmentId: e1._id, product: "Jambon blanc", supplier: "Boucherie Martin", lotNumber: "BM-24790", category: "meat", quantity: "3 kg", receivedAt: addDays(today, -8), dlc: addDays(today, -2), receptionTemp: 3.4, state: "discarded", closedAt: addDays(today, -2), note: "Jeté à la date limite." },
  ]);

  console.log("\nJeu de démonstration créé.\n");
  console.log(`Mot de passe de tous les comptes : ${env.SEED_PASSWORD}`);
  console.log("Comptes : jules@signature.fr (super admin) · camille.roux@signature.fr (admin) · nadia.benali@signature.fr (responsable) · marc.lefevre@signature.fr (opérateur)");
  console.log("(sophie.garnier@ddpp.fr, contrôleur, est créée désactivée comme dans le front)\n");
  console.log("Clés d'appareil de démonstration (en-tête x-device-key, POST /api/v1/iot/readings) :");
  for (const [name, key] of Object.entries(devKeys)) if (defs.find((d) => d.name === name)?.sensor) console.log(`  ${name.padEnd(28)} ${key}`);
  console.log("");
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
