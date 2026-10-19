export type Frequency = "daily" | "after_service" | "weekly";

export type CleaningTask = {
  id: string;
  title: string;
  zone: string;
  frequency: Frequency;
  method: string;
  dueTime: string; // heure limite, format "HH:MM"
  done: boolean;
  doneBy?: string;
  doneAt?: string; // ISO
};

export const frequencyLabels: Record<Frequency, string> = {
  daily: "Quotidienne",
  after_service: "Après service",
  weekly: "Hebdomadaire",
};

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
