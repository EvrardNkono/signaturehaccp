import { CheckCircle2, Circle, Clock, Pencil, Trash2 } from "lucide-react";
import { CleaningTask, frequencyLabels } from "@/lib/nettoyage";
import { hhmm } from "@/lib/time";

export function TaskRow({
  task,
  overdue,
  tz,
  disabled = false,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: CleaningTask;
  overdue: boolean;
  tz?: string;
  disabled?: boolean;
  onToggle: (id: string) => void;
  /** Affichés uniquement pour les responsables. */
  onEdit?: (task: CleaningTask) => void;
  onDelete?: (task: CleaningTask) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        disabled={disabled}
        aria-label={task.done ? "Marquer comme à faire" : "Marquer comme faite"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          task.done
            ? "text-status-ok"
            : overdue
              ? "text-status-critical hover:bg-status-critical/10"
              : "text-ink-400 hover:bg-ivory-200"
        }`}
      >
        {task.done ? (
          <CheckCircle2 size={26} strokeWidth={1.75} />
        ) : (
          <Circle size={26} strokeWidth={1.5} />
        )}
      </button>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`font-medium leading-snug ${task.done ? "text-ink-400 line-through" : ""}`}>
            {task.title}
          </p>
          {overdue && (
            <span className="rounded-full bg-status-critical/10 px-2.5 py-0.5 text-[11px] font-medium text-status-critical">
              En retard
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-ink-500">{task.method}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span className="rounded-full bg-ivory-200 px-2.5 py-0.5 text-ink-500">
            {frequencyLabels[task.frequency]}
          </span>
          {task.done ? (
            <span className="text-status-ok">
              Validé par {task.doneBy} à {hhmm(task.doneAt, tz)}
            </span>
          ) : (
            <span className={`flex items-center gap-1 ${overdue ? "text-status-critical" : ""}`}>
              <Clock size={12} strokeWidth={1.75} /> Avant {task.dueTime}
            </span>
          )}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              aria-label={`Modifier « ${task.title} »`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ivory-200 hover:text-gold-600"
            >
              <Pencil size={17} strokeWidth={1.5} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              aria-label={`Supprimer « ${task.title} »`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-status-critical/10 hover:text-status-critical"
            >
              <Trash2 size={17} strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}