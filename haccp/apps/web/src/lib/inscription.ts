export type SignupForm = {
  company: string;
  kbis: string;
  manager: string;
  email: string;
  password: string;
  confirm: string;
  accepted: boolean;
};

export type SignupErrors = Partial<Record<keyof SignupForm | "kbisFile", string>>;

export const emptySignup: SignupForm = {
  company: "",
  kbis: "",
  manager: "",
  email: "",
  password: "",
  confirm: "",
  accepted: false,
};

export const MAX_FILE_MB = 5;
export const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Kbis (RCS) = 9 chiffres (SIREN), SIRET = 14 chiffres
export function isValidKbis(input: string): boolean {
  const digits = input.replace(/[\s.]/g, "");
  return /^\d{9}$/.test(digits) || /^\d{14}$/.test(digits);
}

/** Même règle que l'API : 8 caractères minimum, avec au moins une lettre et un chiffre. */
export function passwordProblem(p: string): string | undefined {
  if (p.length < 8) return "8 caractères minimum.";
  if (p.length > 128) return "128 caractères maximum.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Doit contenir au moins une lettre et un chiffre.";
  return undefined;
}

export const PASSWORD_HINT = "8 caractères minimum, avec au moins une lettre et un chiffre";

export function validateFile(file: File | null): string | undefined {
  if (!file) return undefined; // le document est facultatif
  if (!ACCEPTED_TYPES.includes(file.type)) return "Format accepté : PDF, JPG ou PNG.";
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Fichier trop lourd (max ${MAX_FILE_MB} Mo).`;
  return undefined;
}

export function validate(f: SignupForm, file: File | null): SignupErrors {
  const e: SignupErrors = {};
  if (!f.company.trim()) e.company = "Le nom de l'établissement est obligatoire.";
  if (!f.kbis.trim()) e.kbis = "Le numéro de Kbis est obligatoire.";
  else if (!isValidKbis(f.kbis)) e.kbis = "9 chiffres (Kbis/RCS) ou 14 chiffres (SIRET).";
  if (!f.manager.trim()) e.manager = "Votre nom est obligatoire.";
  if (!isValidEmail(f.email)) e.email = "Adresse e-mail invalide.";
  const pw = passwordProblem(f.password);
  if (pw) e.password = pw;
  if (f.confirm !== f.password) e.confirm = "Les mots de passe ne correspondent pas.";
  if (!f.accepted) e.accepted = "Vous devez accepter les conditions.";
  const fileError = validateFile(file);
  if (fileError) e.kbisFile = fileError;
  return e;
}
