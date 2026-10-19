import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { CLEANING_FREQUENCIES, CleaningCompletion, CleaningTask } from "../models";
import { getAuth, getEst, requireAccess } from "../middleware/auth";
import { isHHMM, nowInTz } from "../domain/time";
import { notFound } from "../utils/httpError";
import { oid } from "../utils/mongo";
import { audit } from "../services/audit";
import { completeTask, periodKeyFor, tasksForDay } from "../services/cleaningService";
import { isoDay, optText, requireRoleAtLeast, text } from "./helpers";

const router = Router({ mergeParams: true });

const hhmm = z.string().refine(isHHMM, "Format HH:MM attendu.");

const createSchema = z.object({
  title: text(160, "Intitulé"),
  zone: text(80, "Zone"),
  frequency: z.enum(CLEANING_FREQUENCIES),
  method: optText(400).default(""),
  dueTime: hhmm,
});

router.get("/", async (req, res) => {
  const est = getEst(req);
  const { day } = z.object({ day: isoDay.optional() }).parse(req.query);
  const { date, tasks } = await tasksForDay(est, day);
  const done = tasks.filter((t) => t.done).length;
  res.json({ date, data: tasks, progress: { done, total: tasks.length } });
});

async function loadTask(req: Parameters<typeof getEst>[0]) {
  const est = getEst(req);
  const task = await CleaningTask.findOne({ _id: oid(req.params.id, "Tâche"), establishmentId: est._id, active: true });
  if (!task) throw notFound("Tâche introuvable.");
  return task;
}

// Modèles de tâches : réservés aux responsables et au-dessus.
router.post("/", requireAccess("nettoyage", "write"), requireRoleAtLeast("manager"), async (req, res) => {
  const est = getEst(req);
  const body = createSchema.parse(req.body);
  const task = await CleaningTask.create({ establishmentId: est._id, ...body });
  await audit(req, { action: "cleaning.task_create", entity: "cleaning_task", entityId: String(task._id), meta: { title: task.title } });
  res.status(201).json(task.toJSON());
});

router.patch("/:id", requireAccess("nettoyage", "write"), requireRoleAtLeast("manager"), async (req, res) => {
  const task = await loadTask(req);
  const body = createSchema.partial().parse(req.body);
  Object.assign(task, body);
  await task.save();
  await audit(req, { action: "cleaning.task_update", entity: "cleaning_task", entityId: String(task._id), meta: { fields: Object.keys(body) } });
  res.json(task.toJSON());
});

router.delete("/:id", requireAccess("nettoyage", "write"), requireRoleAtLeast("manager"), async (req, res) => {
  const task = await loadTask(req);
  task.active = false; // l'historique des validations reste consultable
  await task.save();
  await audit(req, { action: "cleaning.task_delete", entity: "cleaning_task", entityId: String(task._id), meta: { title: task.title } });
  res.json({ ok: true });
});

/** Validation d'une tâche (idempotente : la revalider ne crée pas de doublon). */
router.post("/:id/complete", requireAccess("nettoyage", "write"), async (req, res) => {
  const est = getEst(req);
  const { userId, name } = getAuth(req);
  const task = await loadTask(req);
  const day = nowInTz(est.timezone).date;
  const c = await completeTask(est._id, task._id, task.frequency, day, name, new Types.ObjectId(userId));
  res.status(201).json({ taskId: String(task._id), done: true, doneBy: c?.doneBy, doneAt: c?.doneAt.toISOString() });
});

/** Annulation d'une validation : réservée aux responsables (la preuve ne doit pas être effaçable à la légère). */
router.delete("/:id/complete", requireAccess("nettoyage", "write"), requireRoleAtLeast("manager"), async (req, res) => {
  const est = getEst(req);
  const task = await loadTask(req);
  const periodKey = periodKeyFor(task.frequency, nowInTz(est.timezone).date);
  await CleaningCompletion.deleteOne({ taskId: task._id, periodKey });
  await audit(req, { action: "cleaning.completion_undo", entity: "cleaning_task", entityId: String(task._id), meta: { periodKey } });
  res.json({ taskId: String(task._id), done: false });
});

export default router;
