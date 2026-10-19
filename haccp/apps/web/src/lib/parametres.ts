export type Settings = {
  // Établissement
  name: string;
  manager: string;
  address: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  siret: string;
  // Seuils par défaut (valeurs saisies sous forme de texte dans le formulaire)
  coldroomMax: string;
  fridgeMax: string;
  freezerMax: string;
  warnMargin: string;
  polarWarn: string;
  polarLimit: string;
  oilMaxTemp: string;
  dlcSoonDays: string;
  // Régional
  timezone: string;
};

export const defaultSettings: Settings = {
  name: "",
  manager: "",
  address: "",
  zip: "",
  city: "",
  phone: "",
  email: "",
  siret: "",
  coldroomMax: "3",
  fridgeMax: "4",
  freezerMax: "-18",
  warnMargin: "0.5",
  polarWarn: "22",
  polarLimit: "25",
  oilMaxTemp: "180",
  dlcSoonDays: "2",
  timezone: "Europe/Paris",
};

export const timezones: { value: string; label: string }[] = [
  { value: "Europe/Paris", label: "Paris (France)" },
  { value: "Europe/Brussels", label: "Bruxelles (Belgique)" },
  { value: "Europe/Zurich", label: "Zurich (Suisse)" },
  { value: "Africa/Douala", label: "Douala (Cameroun)" },
  { value: "Africa/Abidjan", label: "Abidjan (Côte d'Ivoire)" },
  { value: "Africa/Casablanca", label: "Casablanca (Maroc)" },
  { value: "America/Montreal", label: "Montréal (Canada)" },
  { value: "Indian/Reunion", label: "La Réunion" },
];

export function num(input: string): number | null {
  const n = Number(input.trim().replace(",", "."));
  return input.trim() !== "" && Number.isFinite(n) ? n : null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type Errors = Partial<Record<keyof Settings, string>>;

export function validate(s: Settings): Errors {
  const e: Errors = {};

  if (!s.name.trim()) e.name = "Le nom est obligatoire.";
  if (s.email.trim() && !isValidEmail(s.email)) e.email = "Adresse e-mail invalide.";
  if (s.siret.trim() && !/^\d{14}$/.test(s.siret.replace(/\s/g, ""))) {
    e.siret = "Le SIRET comporte 14 chiffres.";
  }

  const numeric: (keyof Settings)[] = [
    "coldroomMax", "fridgeMax", "freezerMax", "warnMargin",
    "polarWarn", "polarLimit", "oilMaxTemp", "dlcSoonDays",
  ];
  numeric.forEach((k) => {
    if (num(s[k]) === null) e[k] = "Nombre attendu.";
  });

  const warn = num(s.polarWarn);
  const limit = num(s.polarLimit);
  if (warn !== null && limit !== null && warn >= limit) {
    e.polarWarn = "Doit être inférieur à la limite.";
  }
  if (limit !== null && (limit <= 0 || limit > 100)) {
    e.polarLimit = "Entre 1 et 100 %.";
  }
  const margin = num(s.warnMargin);
  if (margin !== null && margin < 0) e.warnMargin = "Ne peut pas être négatif.";
  const days = num(s.dlcSoonDays);
  if (days !== null && (days < 0 || !Number.isInteger(days))) {
    e.dlcSoonDays = "Nombre entier de jours.";
  }

  return e;
}

/** Réponse de GET /establishments/:id/settings. */
export type SettingsPayload = {
  profile: {
    name: string;
    manager?: string;
    address?: string;
    zip?: string;
    city?: string;
    phone?: string;
    email?: string;
    siret?: string;
    timezone: string;
  };
  thresholds: {
    coldroomMax: number;
    fridgeMax: number;
    freezerMax: number;
    warnMargin: number;
    polarWarn: number;
    polarLimit: number;
    oilMaxTemp: number;
    dlcSoonDays: number;
  };
};

const str = (n: number) => String(n).replace(".", ",");

export function fromApi(p: SettingsPayload): Settings {
  return {
    name: p.profile.name ?? "",
    manager: p.profile.manager ?? "",
    address: p.profile.address ?? "",
    zip: p.profile.zip ?? "",
    city: p.profile.city ?? "",
    phone: p.profile.phone ?? "",
    email: p.profile.email ?? "",
    siret: p.profile.siret ?? "",
    coldroomMax: str(p.thresholds.coldroomMax),
    fridgeMax: str(p.thresholds.fridgeMax),
    freezerMax: str(p.thresholds.freezerMax),
    warnMargin: str(p.thresholds.warnMargin),
    polarWarn: str(p.thresholds.polarWarn),
    polarLimit: str(p.thresholds.polarLimit),
    oilMaxTemp: str(p.thresholds.oilMaxTemp),
    dlcSoonDays: str(p.thresholds.dlcSoonDays),
    timezone: p.profile.timezone,
  };
}

/** Corps de PUT /establishments/:id/settings (les préférences de notification ne sont pas touchées). */
export function toApi(s: Settings) {
  const n = (v: string) => num(v) as number;
  return {
    profile: {
      name: s.name.trim(),
      manager: s.manager.trim(),
      address: s.address.trim(),
      zip: s.zip.trim(),
      city: s.city.trim(),
      phone: s.phone.trim(),
      email: s.email.trim(),
      siret: s.siret.trim(),
      timezone: s.timezone,
    },
    thresholds: {
      coldroomMax: n(s.coldroomMax),
      fridgeMax: n(s.fridgeMax),
      freezerMax: n(s.freezerMax),
      warnMargin: n(s.warnMargin),
      polarWarn: n(s.polarWarn),
      polarLimit: n(s.polarLimit),
      oilMaxTemp: n(s.oilMaxTemp),
      dlcSoonDays: n(s.dlcSoonDays),
    },
  };
}
