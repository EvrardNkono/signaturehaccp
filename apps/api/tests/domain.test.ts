import { describe, expect, it } from "vitest";
import { statusForValue, equipmentStatus, defaultThresholds } from "../src/domain/equipment";
import { computeEscalation, escalationReason } from "../src/domain/alerts";
import { getOilStatus } from "../src/domain/oil";
import { daysUntil, getDlcStatus, isTempOk } from "../src/domain/traceability";
import { dayBounds, isoWeekKey, nowInTz } from "../src/domain/time";
import { canAssignRole, allowedEstablishmentIds, hasAccess } from "../src/domain/permissions";
import { expiryStatus } from "../src/domain/documents";
import { formatRange, formatTemp } from "../src/domain/format";
import { passwordProblem } from "../src/utils/password";

describe("statut de température (identique au front)", () => {
  const cold = { min: 0, max: 3, warnMargin: 0.3 };
  it("conforme / à surveiller / critique", () => {
    expect(statusForValue(2, cold)).toBe("ok");
    expect(statusForValue(2.8, cold)).toBe("warn");
    expect(statusForValue(3.1, cold)).toBe("critical");
    expect(statusForValue(-0.5, cold)).toBe("critical");
    expect(statusForValue(7.1, cold)).toBe("critical");
  });
  it("capteur hors ligne ou sans mesure = hors ligne", () => {
    expect(equipmentStatus({ temp: 2, ...cold, sensor: { online: false } })).toBe("offline");
    expect(equipmentStatus({ temp: null, ...cold, sensor: null })).toBe("offline");
    expect(equipmentStatus({ temp: 2, ...cold, sensor: null })).toBe("ok");
  });
  it("seuils par défaut selon le type", () => {
    const s = { coldroomMax: 3, fridgeMax: 4, freezerMax: -18, warnMargin: 0.5, oilMaxTemp: 180 };
    expect(defaultThresholds("freezer", s)).toMatchObject({ min: -30, max: -18 });
    expect(defaultThresholds("fryer", s)).toMatchObject({ min: 150, max: 180 });
  });
  it("formats", () => {
    expect(formatTemp(7.1)).toBe("+7,1°C");
    expect(formatTemp(-19.4)).toBe("-19,4°C");
    expect(formatTemp(null)).toBe("--");
    expect(formatRange(0, 3)).toBe("0 à +3°C");
  });
});

describe("escalade des alertes", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const ago = (m: number) => new Date(now.getTime() - m * 60_000);
  it("critique : N1 15 min, N2 60 min, N3 240 min", () => {
    const a = (m: number) => computeEscalation({ severity: "critical", state: "open", createdAt: ago(m) }, now);
    expect([a(5), a(15), a(60), a(240)]).toEqual([0, 1, 2, 3]);
  });
  it("attention : N1 60 min", () => {
    expect(computeEscalation({ severity: "warn", state: "open", createdAt: ago(59) }, now)).toBe(0);
    expect(computeEscalation({ severity: "warn", state: "in_progress", createdAt: ago(61) }, now)).toBe(1);
  });
  it("info et résolue : jamais d'escalade", () => {
    expect(computeEscalation({ severity: "info", state: "open", createdAt: ago(9999) }, now)).toBe(0);
    expect(computeEscalation({ severity: "critical", state: "resolved", createdAt: ago(9999) }, now)).toBe(0);
  });
  it("motif lisible", () => {
    expect(escalationReason({ state: "open", createdAt: ago(30) }, 1, now)).toBe("non prise en charge depuis 30 min");
    expect(escalationReason({ state: "in_progress", createdAt: ago(180) }, 2, now)).toBe("en cours depuis 3 h");
  });
});

describe("huile de friture", () => {
  const limits = { polarWarn: 22, polarLimit: 25, oilMaxTemp: 180 };
  it("seuils polaires, température et aspect", () => {
    expect(getOilStatus(18, 175, "normal", limits)).toBe("ok");
    expect(getOilStatus(22, 175, "normal", limits)).toBe("warn");
    expect(getOilStatus(10, 185, "normal", limits)).toBe("warn");
    expect(getOilStatus(10, 175, "foam", limits)).toBe("warn");
    expect(getOilStatus(25, 175, "normal", limits)).toBe("change");
  });
});

describe("traçabilité / DLC", () => {
  it("jours restants et statut", () => {
    expect(daysUntil("2026-10-17", "2026-10-15")).toBe(2);
    expect(daysUntil("2026-10-14", "2026-10-15")).toBe(-1);
    expect(getDlcStatus(-1, 2)).toBe("expired");
    expect(getDlcStatus(0, 2)).toBe("today");
    expect(getDlcStatus(2, 2)).toBe("soon");
    expect(getDlcStatus(3, 2)).toBe("ok");
  });
  it("température de réception", () => {
    expect(isTempOk("meat", 4)).toBe(true);
    expect(isTempOk("meat", 4.1)).toBe(false);
    expect(isTempOk("fish", 3)).toBe(false);
    expect(isTempOk("dry", 30)).toBe(true);
    expect(isTempOk("meat", null)).toBe(true);
  });
});

describe("dates et fuseaux", () => {
  it("clé de semaine ISO", () => {
    expect(isoWeekKey("2026-10-15")).toBe("2026-W42");
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01");
  });
  it("jour local selon le fuseau", () => {
    const at = new Date("2026-10-15T22:30:00Z"); // 00:30 le 16 à Paris (UTC+2)
    expect(nowInTz("Europe/Paris", at).date).toBe("2026-10-16");
    expect(nowInTz("UTC", at).date).toBe("2026-10-15");
    expect(nowInTz("Fuseau/Inconnu", at).date).toBe("2026-10-16"); // repli sur Paris
  });
  it("bornes d'une journée locale", () => {
    const { start, end } = dayBounds("Europe/Paris", "2026-10-15");
    expect(start.toISOString()).toBe("2026-10-14T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    const utc = dayBounds("UTC", "2026-10-15");
    expect(utc.start.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
});

describe("droits", () => {
  it("matrice par module", () => {
    expect(hasAccess("operator", "releves", "write")).toBe(true);
    expect(hasAccess("operator", "rapports")).toBe(false);
    expect(hasAccess("auditor", "releves", "write")).toBe(false);
    expect(hasAccess("auditor", "rapports", "read")).toBe(true);
    expect(hasAccess("manager", "utilisateurs", "write")).toBe(false);
    expect(hasAccess("admin", "utilisateurs", "write")).toBe(true);
  });
  it("attribution des rôles", () => {
    expect(canAssignRole("super_admin", "super_admin")).toBe(true);
    expect(canAssignRole("admin", "super_admin")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("admin", "manager")).toBe(true);
  });
  it("établissements accessibles", () => {
    expect(allowedEstablishmentIds({ role: "super_admin" })).toBeNull();
    expect(allowedEstablishmentIds({ role: "operator", primaryEstablishmentId: "e1" })).toEqual(["e1"]);
    expect(allowedEstablishmentIds({ role: "manager", authorizedEstablishmentIds: ["e1", "e2"] })).toEqual(["e1", "e2"]);
    expect(allowedEstablishmentIds({ role: "manager" })).toEqual([]);
  });
});

describe("documents et mots de passe", () => {
  it("expiration", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    expect(expiryStatus(null, now)).toBe("none");
    expect(expiryStatus(new Date("2026-10-01T00:00:00Z"), now)).toBe("expired");
    expect(expiryStatus(new Date("2026-11-01T00:00:00Z"), now)).toBe("soon");
    expect(expiryStatus(new Date("2027-03-01T00:00:00Z"), now)).toBe("ok");
  });
  it("politique de mot de passe", () => {
    expect(passwordProblem("court1")).not.toBeNull();
    expect(passwordProblem("uniquementlettres")).not.toBeNull();
    expect(passwordProblem("12345678")).not.toBeNull();
    expect(passwordProblem("Motdepasse1")).toBeNull();
  });
});
