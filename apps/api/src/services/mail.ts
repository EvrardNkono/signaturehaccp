import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

export const mailEnabled = Boolean(env.SMTP_HOST);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1d1b17">
  <h2 style="font-family:Georgia,serif;color:#8a6a1f;margin-bottom:4px">Signature HACCP</h2>
  <h3 style="margin-top:0">${esc(title)}</h3>${body}
  <hr style="border:none;border-top:1px solid #e8e0cf;margin:24px 0"/>
  <p style="font-size:12px;color:#7a7468">Message automatique, merci de ne pas répondre.</p></div>`;
}

export async function sendMail(opts: { to: string | string[]; subject: string; html: string; text: string }): Promise<void> {
  const info = await getTransporter().sendMail({ from: env.MAIL_FROM, ...opts });
  if (!mailEnabled) {
    // Sans SMTP configuré : on affiche l'e-mail dans les logs (développement).
    logger.info({ to: opts.to, subject: opts.subject, text: opts.text }, "E-mail simulé (SMTP non configuré)");
  } else {
    logger.info({ messageId: info.messageId, to: opts.to }, "E-mail envoyé");
  }
}

export const buildResetEmail = (firstName: string, link: string) => ({
  subject: "Réinitialisation de votre mot de passe",
  text: `Bonjour ${firstName},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  html: layout(
    "Réinitialisation du mot de passe",
    `<p>Bonjour ${esc(firstName)},</p><p>Pour choisir un nouveau mot de passe, cliquez ci-dessous (lien valable 1 heure).</p>
     <p><a href="${esc(link)}" style="background:#c9a24a;color:#1d1b17;padding:10px 18px;border-radius:8px;text-decoration:none">Choisir un mot de passe</a></p>
     <p style="font-size:13px;color:#7a7468">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`
  ),
});

export const buildInviteEmail = (firstName: string, inviter: string, company: string, link: string) => ({
  subject: `${inviter} vous invite sur Signature HACCP`,
  text: `Bonjour ${firstName},\n\n${inviter} vous a créé un accès Signature HACCP pour ${company}.\nDéfinissez votre mot de passe (lien valable 7 jours) :\n${link}`,
  html: layout(
    "Votre accès Signature HACCP",
    `<p>Bonjour ${esc(firstName)},</p><p>${esc(inviter)} vous a créé un accès pour <b>${esc(company)}</b>.</p>
     <p><a href="${esc(link)}" style="background:#c9a24a;color:#1d1b17;padding:10px 18px;border-radius:8px;text-decoration:none">Définir mon mot de passe</a></p>
     <p style="font-size:13px;color:#7a7468">Lien valable 7 jours.</p>`
  ),
});

export const buildAlertEmail = (a: {
  establishment: string;
  severityLabel: string;
  title: string;
  detail: string;
  equipment?: string;
  value?: string;
  threshold?: string;
  link: string;
}) => ({
  subject: `[${a.severityLabel}] ${a.title}${a.equipment ? ` — ${a.equipment}` : ""} (${a.establishment})`,
  text: `${a.severityLabel} · ${a.establishment}\n${a.title}\n${a.detail}\n${a.value ? `Mesuré : ${a.value}\n` : ""}${a.threshold ? `Seuil : ${a.threshold}\n` : ""}\nTraiter l'alerte : ${a.link}`,
  html: layout(
    `${a.severityLabel} : ${a.title}`,
    `<p><b>${esc(a.establishment)}</b>${a.equipment ? ` · ${esc(a.equipment)}` : ""}</p><p>${esc(a.detail)}</p>
     ${a.value ? `<p>Mesuré : <b>${esc(a.value)}</b>${a.threshold ? ` · Seuil : ${esc(a.threshold)}` : ""}</p>` : ""}
     <p><a href="${esc(a.link)}" style="background:#c9a24a;color:#1d1b17;padding:10px 18px;border-radius:8px;text-decoration:none">Traiter l'alerte</a></p>`
  ),
});
