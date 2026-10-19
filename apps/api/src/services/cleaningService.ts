import { HydratedDocument, Types } from "mongoose";
import { CleaningCompletion, CleaningTask, IEstablishment } from "../models";
import { isoWeekKey, nowInTz } from "../domain/time";

export const periodKeyFor = (frequency: string, day: string) => (frequency === "weekly" ? isoWeekKey(day) : day);

/** Liste des tâches actives, avec l'état "fait / à faire" de la période en cours (jour ou semaine). */
export async function tasksForDay(est: HydratedDocument<IEstablishment>, day?: string) {
  const date = day ?? nowInTz(est.timezone).date;
  const tasks = await CleaningTask.find({ establishmentId: est._id, active: true }).sort({ dueTime: 1, title: 1 });
  const keys = [...new Set(tasks.map((t) => periodKeyFor(t.frequency, date)))];
  const completions = await CleaningCompletion.find({
    establishmentId: est._id,
    periodKey: { $in: keys },
    taskId: { $in: tasks.map((t) => t._id) },
  });
  const byTask = new Map<string, (typeof completions)[number]>();
  for (const c of completions) {
    if (c.periodKey === periodKeyFor(tasks.find((t) => String(t._id) === String(c.taskId))?.frequency ?? "daily", date)) {
      byTask.set(String(c.taskId), c);
    }
  }
  return {
    date,
    tasks: tasks.map((t) => {
      const c = byTask.get(String(t._id));
      return {
        id: String(t._id),
        establishmentId: String(t.establishmentId),
        title: t.title,
        zone: t.zone,
        frequency: t.frequency,
        method: t.method,
        dueTime: t.dueTime,
        done: Boolean(c),
        doneBy: c?.doneBy,
        doneAt: c?.doneAt.toISOString(),
      };
    }),
  };
}

export async function completeTask(estId: Types.ObjectId, taskId: Types.ObjectId, frequency: string, day: string, by: string, userId: Types.ObjectId) {
  const periodKey = periodKeyFor(frequency, day);
  try {
    return await CleaningCompletion.create({ establishmentId: estId, taskId, periodKey, doneBy: by, doneByUserId: userId });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return CleaningCompletion.findOne({ taskId, periodKey }); // déjà validée : opération idempotente
    }
    throw err;
  }
}
