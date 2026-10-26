import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { base, createEquipment, loginAs, registerCompany, startDb, stopDb } from "./helpers";
import { Reading } from "../src/models";

beforeAll(startDb);
afterAll(stopDb);

const DAY = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

async function seed(name: string) {
  const ctx = await registerCompany(name);
  const fridge = await createEquipment(ctx.agent, ctx.estId, { name: "Frigo-1", type: "fridge" });
  const freezer = await createEquipment(ctx.agent, ctx.estId, { name: "Congel-1", type: "freezer" });
  await ctx.agent.post(`${base(ctx.estId)}/readings`).send({ equipmentId: fridge.id, value: "2,5" });
  await ctx.agent.post(`${base(ctx.estId)}/readings`).send({ equipmentId: freezer.id, value: -20 });
  // Relevés anciens insérés directement : il y a 10 jours (dans la période) et 400 jours (hors période).
  const mk = (eq: { id: string; name: string }, daysAgo: number, value: number) =>
    Reading.create({
      establishmentId: new Types.ObjectId(ctx.estId),
      equipmentId: new Types.ObjectId(eq.id),
      equipmentName: eq.name,
      value,
      status: "ok",
      source: "iot",
      by: "Capteur",
      at: new Date(Date.now() - daysAgo * DAY),
    });
  await mk(fridge, 10, 3.1);
  await mk(fridge, 400, 1.9);
  return { ...ctx, fridge, freezer };
}

describe("export des relevés par période", () => {
  it("CSV : respecte la période, garde les températures négatives numériques, journalise l'export", async () => {
    const { agent, estId } = await seed("Export CSV");
    const res = await agent.get(`${base(estId)}/reports/readings.csv?from=${isoDay(-30)}&to=${isoDay(1)}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.text.startsWith("\uFEFF")).toBe(true);

    const lines = res.text.replace("\uFEFF", "").split("\r\n").filter(Boolean);
    expect(lines[0]).toBe('"Date / heure";"Équipement";"Température (°C)";"Statut";"Source";"Responsable";"Action corrective"');
    expect(lines).toHaveLength(1 + 3); // 2 relevés du jour + celui d'il y a 10 jours ; pas celui d'il y a 400 jours
    expect(res.text).toContain('"2,5"'); // virgule décimale (Excel FR)
    expect(res.text).toContain('"-20"'); // négatif non neutralisé : reste un nombre
    expect(res.text).toContain('"3,1"');
    expect(res.text).not.toContain('"1,9"');
    // classés du plus ancien au plus récent
    expect(lines[1]).toContain('"3,1"');

    const logs = await agent.get("/api/v1/company/audit-logs?limit=100");
    expect(logs.body.data.map((l: { action: string }) => l.action)).toContain("report.export_readings_csv");
  });

  it("CSV : filtre par équipement et refuse un équipement étranger", async () => {
    const { agent, estId, fridge } = await seed("Export filtre");
    const res = await agent.get(`${base(estId)}/reports/readings.csv?from=${isoDay(-30)}&to=${isoDay(1)}&equipmentId=${fridge.id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Frigo-1");
    expect(res.text).not.toContain("Congel-1");

    const other = await seed("Export autre");
    const foreign = await agent.get(`${base(estId)}/reports/readings.csv?from=${isoDay(-30)}&to=${isoDay(1)}&equipmentId=${other.fridge.id}`);
    expect(foreign.status).toBe(404);
  });

  it("valide la période : obligatoire, ordre, 12 mois maximum", async () => {
    const { agent, estId } = await seed("Export période");
    expect((await agent.get(`${base(estId)}/reports/readings.csv`)).status).toBe(422);
    expect((await agent.get(`${base(estId)}/reports/readings.csv?from=2026-13-40&to=2026-01-02`)).status).toBe(422);

    const reversed = await agent.get(`${base(estId)}/reports/readings.csv?from=${isoDay(0)}&to=${isoDay(-5)}`);
    expect(reversed.status).toBe(422);
    expect(reversed.body.error.code).toBe("PERIOD_INVALID");

    const tooLong = await agent.get(`${base(estId)}/reports/readings.pdf?from=${isoDay(-400)}&to=${isoDay(0)}`);
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.code).toBe("PERIOD_TOO_LONG");

    // 366 jours exactement : accepté
    const ok = await agent.get(`${base(estId)}/reports/readings.csv?from=${isoDay(-365)}&to=${isoDay(0)}`);
    expect(ok.status).toBe(200);
  });

  it("PDF : document valide, journalisé", async () => {
    const { agent, estId } = await seed("Export PDF");
    const res = await agent
      .get(`${base(estId)}/reports/readings.pdf?from=${isoDay(-30)}&to=${isoDay(1)}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    const logs = await agent.get("/api/v1/company/audit-logs?limit=100");
    expect(logs.body.data.map((l: { action: string }) => l.action)).toContain("report.export_readings_pdf");
  });

  it("droits : l'opérateur n'a pas accès aux rapports, l'auditeur oui", async () => {
    const { agent, estId, companyId } = await seed("Export droits");
    void agent;
    const op = await loginAs(companyId, "operator", { primaryEstablishmentId: estId });
    const aud = await loginAs(companyId, "auditor", { authorizedEstablishmentIds: [estId] });
    const q = `from=${isoDay(-30)}&to=${isoDay(1)}`;
    expect((await op.agent.get(`${base(estId)}/reports/readings.csv?${q}`)).status).toBe(403);
    expect((await aud.agent.get(`${base(estId)}/reports/readings.csv?${q}`)).status).toBe(200);
  });
});
