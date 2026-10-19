import { HydratedDocument, Types } from "mongoose";
import { Equipment, IEquipment, Reading } from "../models";
import { statusForValue, ReadingStatus } from "../domain/equipment";
import { formatRange, formatTemp } from "../domain/format";
import { autoResolve, raiseAlert } from "./alertService";
import { env } from "../config/env";

const HISTORY_SIZE = 24;

type RecordInput = {
  equipment: HydratedDocument<IEquipment>;
  value: number;
  source: "manual" | "iot";
  by: string;
  byUserId?: Types.ObjectId | null;
  action?: string;
  at?: Date;
};

/** Enregistre un relevé, met à jour l'équipement et génère/actualise l'alerte de température si besoin. */
export async function recordReading(input: RecordInput) {
  const { equipment: e, value, source, by, byUserId, action } = input;
  const at = input.at ?? new Date();
  const status: ReadingStatus = statusForValue(value, e);

  const reading = await Reading.create({
    establishmentId: e.establishmentId,
    equipmentId: e._id,
    equipmentName: e.name,
    value,
    status,
    source,
    by,
    byUserId: byUserId ?? null,
    action: action?.trim() || undefined,
    at,
  });

  // On ne remplace l'état courant que si le relevé est plus récent que le précédent (relevés IoT retardés).
  if (!e.lastReadingAt || at >= e.lastReadingAt) {
    await Equipment.updateOne(
      { _id: e._id },
      {
        $set: { temp: value, lastReadingAt: at },
        $push: { recentValues: { $each: [value], $slice: -HISTORY_SIZE } },
      }
    );
    e.temp = value;
    e.lastReadingAt = at;
    e.recentValues = [...(e.recentValues ?? []), value].slice(-HISTORY_SIZE);
  }

  let alert = null;
  if (status !== "ok") {
    const critical = status === "critical";
    const res = await raiseAlert({
      establishmentId: e.establishmentId,
      severity: critical ? "critical" : "warn",
      kind: "temperature",
      title: critical ? "Température critique dépassée" : "Température proche du seuil",
      detail: critical
        ? "Les denrées sont en danger. Vérifier la porte et le groupe froid."
        : "La température approche du seuil autorisé. Surveiller l'équipement.",
      equipmentId: e._id,
      equipmentName: e.name,
      zone: e.zone,
      value: formatTemp(value),
      threshold: formatRange(e.min, e.max),
      dedupeKey: `temp:${e._id}`,
    });
    alert = res.alert;
  }
  return { reading, status, alert };
}

/** Met à jour l'état du capteur à chaque message IoT, gère les alertes batterie / reconnexion. */
export async function touchSensor(e: HydratedDocument<IEquipment>, info: { battery?: number; signal?: number }) {
  if (!e.sensor) return;
  const set: Record<string, unknown> = { "sensor.online": true, "sensor.lastSeenAt": new Date() };
  if (info.battery !== undefined) set["sensor.battery"] = info.battery;
  if (info.signal !== undefined) set["sensor.signal"] = info.signal;
  await Equipment.updateOne({ _id: e._id }, { $set: set });

  // Le capteur répond de nouveau : l'alerte "capteur perdu" se clôt toute seule.
  await autoResolve(e.establishmentId, `sensor-offline:${e._id}`, "Reconnexion automatique du capteur.");

  if (info.battery !== undefined) {
    if (info.battery < env.SENSOR_LOW_BATTERY) {
      await raiseAlert({
        establishmentId: e.establishmentId,
        severity: "warn",
        kind: "sensor",
        title: "Batterie du capteur faible",
        detail: `La batterie du capteur est à ${info.battery} %. Prévoir son remplacement.`,
        equipmentId: e._id,
        equipmentName: e.name,
        zone: e.zone,
        value: `${info.battery} %`,
        threshold: `${env.SENSOR_LOW_BATTERY} %`,
        dedupeKey: `sensor-battery:${e._id}`,
      });
    } else {
      await autoResolve(e.establishmentId, `sensor-battery:${e._id}`, "Batterie remplacée ou rechargée.");
    }
  }
}
