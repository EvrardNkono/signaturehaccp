import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import { app, base, createEquipment, loginAs, registerCompany, startDb, stopDb } from "./helpers";
import { Alert, CleaningTask, Equipment, Lot } from "../src/models";
import { cleaningWatcher, dlcWatcher, sensorWatchdog } from "../src/jobs";
import { nowInTz } from "../src/domain/time";

beforeAll(startDb);
afterAll(stopDb);

describe("équipements", () => {
  it("création avec seuils par défaut selon le type, validation, doublons", async () => {
    const { agent, estId } = await registerCompany("Equip");
    const cf = await createEquipment(agent, estId, { name: "CF1", type: "coldroom" });
    expect(cf).toMatchObject({ min: 0, max: 3 });
    const fz = await createEquipment(agent, estId, { name: "Congel", type: "freezer" });
    expect(fz).toMatchObject({ min: -30, max: -18 });

    const dup = await agent.post(`${base(estId)}/equipments`).send({ name: "cf1", type: "fridge", zone: "Z" });
    expect(dup.status).toBe(422);
    expect(dup.body.error.code).toBe("NAME_TAKEN");

    const bad = await agent.post(`${base(estId)}/equipments`).send({ name: "Bad", type: "fridge", zone: "Z", min: 5, max: 2 });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("RANGE_INVALID");

    const unknownType = await agent.post(`${base(estId)}/equipments`).send({ name: "Y", type: "four", zone: "Z" });
    expect(unknownType.status).toBe(422);
  });

  it("archivage avec motif obligatoire, restauration, liste filtrée", async () => {
    const { agent, estId } = await registerCompany("Archive");
    const eq = await createEquipment(agent, estId, { name: "A archiver" });
    expect((await agent.delete(`${base(estId)}/equipments/${eq.id}`).send({})).status).toBe(422);
    expect((await agent.delete(`${base(estId)}/equipments/${eq.id}`).send({ reason: "other" })).status).toBe(422); // note exigée
    const ok = await agent.delete(`${base(estId)}/equipments/${eq.id}`).send({ reason: "breakdown" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ archived: true, deleteReason: "breakdown", deletedBy: "Jules Dupont" });
    expect((await agent.get(`${base(estId)}/equipments`)).body.data).toHaveLength(0);
    expect((await agent.get(`${base(estId)}/equipments?archived=true`)).body.data).toHaveLength(1);
    expect((await agent.patch(`${base(estId)}/equipments/${eq.id}`).send({ name: "Z" })).status).toBe(422);
    expect((await agent.post(`${base(estId)}/equipments/${eq.id}/restore`)).body.archived).toBe(false);
  });

  it("identifiant invalide : 404 et non 500", async () => {
    const { agent, estId } = await registerCompany("BadId");
    expect((await agent.get(`${base(estId)}/equipments/pas-un-id`)).status).toBe(404);
    expect((await agent.get(`/api/v1/establishments/pas-un-id/equipments`)).status).toBe(404);
  });
});

describe("relevés et alertes de température", () => {
  it("conforme : pas d'alerte ; mise à jour de l'équipement", async () => {
    const { agent, estId } = await registerCompany("Rel1");
    const eq = await createEquipment(agent, estId);
    const res = await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: "2,0" }); // virgule acceptée
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ok");
    expect(res.body.alert).toBeNull();
    expect(res.body.equipment).toMatchObject({ temp: 2, status: "ok", history: [2] });
    const stored = (await agent.get(`${base(estId)}/equipments/${eq.id}`)).body;
    expect(stored).toMatchObject({ temp: 2, history: [2] });
  });

  it("critique : action obligatoire, alerte créée puis dédupliquée", async () => {
    const { agent, estId } = await registerCompany("Rel2");
    const eq = await createEquipment(agent, estId, { name: "CF2" });
    const noAction = await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 7.1 });
    expect(noAction.status).toBe(422);
    expect(noAction.body.error.code).toBe("ACTION_REQUIRED");

    const ok = await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 7.1, action: "Porte refermée, produits déplacés" });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe("critical");
    expect(ok.body.alert).toMatchObject({ severity: "critical", kind: "temperature", state: "open", equipment: "CF2", value: "+7,1°C", threshold: "0 à +3°C" });

    await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 8.4, action: "Technicien appelé" });
    const list = await agent.get(`${base(estId)}/alerts`);
    expect(list.body.data).toHaveLength(1); // pas de doublon
    expect(list.body.data[0].value).toBe("+8,4°C"); // valeur mise à jour
    expect(list.body.summary).toMatchObject({ open: 1, critical: 1 });
  });

  it("proche du seuil : alerte d'attention, montée en critique sur la même alerte", async () => {
    const { agent, estId } = await registerCompany("Rel3");
    const eq = await createEquipment(agent, estId, { name: "CF3" }); // max 3, marge 0.5
    const warn = await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 2.8 });
    expect(warn.body.status).toBe("warn");
    expect(warn.body.alert.severity).toBe("warn");
    await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 5, action: "Vérification en cours" });
    const list = await agent.get(`${base(estId)}/alerts`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].severity).toBe("critical");
  });

  it("valeurs absurdes et équipements étrangers refusés", async () => {
    const { agent, estId } = await registerCompany("Rel4");
    const eq = await createEquipment(agent, estId);
    expect((await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 9999 })).status).toBe(422);
    expect((await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: "abc" })).status).toBe(422);
    const other = await registerCompany("Rel4b");
    const foreign = await createEquipment(other.agent, other.estId);
    expect((await agent.post(`${base(estId)}/readings`).send({ equipmentId: foreign.id, value: 2 })).status).toBe(404);
  });

  it("liste du jour avec pagination, et courbe de l'équipement", async () => {
    const { agent, estId } = await registerCompany("Rel5");
    const eq = await createEquipment(agent, estId);
    for (const v of [1.5, 2, 2.2]) await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: v });
    const day = await agent.get(`${base(estId)}/readings?limit=2`);
    expect(day.body.meta).toMatchObject({ total: 3, pages: 2 });
    expect(day.body.data).toHaveLength(2);
    expect(day.body.data[0].value).toBe(2.2); // plus récent d'abord
    const hist = await agent.get(`${base(estId)}/equipments/${eq.id}/history`);
    expect(hist.body.points.map((p: { value: number }) => p.value)).toEqual([1.5, 2, 2.2]);
    expect(hist.body.stats).toMatchObject({ min: 1.5, max: 2.2 });
  });
});

describe("cycle de vie d'une alerte", () => {
  async function criticalAlert() {
    const ctx = await registerCompany("Alert");
    const eq = await createEquipment(ctx.agent, ctx.estId);
    const r = await ctx.agent.post(`${base(ctx.estId)}/readings`).send({ equipmentId: eq.id, value: 9, action: "Contrôle" });
    return { ...ctx, alertId: r.body.alert.id as string };
  }

  it("prise en charge, libération, résolution avec action obligatoire, réouverture", async () => {
    const { agent, estId, alertId } = await criticalAlert();
    const a = `${base(estId)}/alerts/${alertId}`;

    const take = await agent.post(`${a}/take`);
    expect(take.body).toMatchObject({ state: "in_progress", takenBy: "Jules Dupont" });
    expect((await agent.post(`${a}/take`)).status).toBe(200); // idempotent pour le même utilisateur

    expect((await agent.post(`${a}/release`)).body.state).toBe("open");
    await agent.post(`${a}/take`);

    const noAction = await agent.post(`${a}/resolve`).send({});
    expect(noAction.status).toBe(422);
    expect(noAction.body.error.code).toBe("ACTION_REQUIRED");
    expect((await agent.post(`${a}/resolve`).send({ correctiveAction: "ok" })).status).toBe(422); // trop court

    const done = await agent.post(`${a}/resolve`).send({ correctiveAction: "Groupe froid redémarré, produits contrôlés" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ state: "resolved", resolvedBy: "Jules Dupont", escalation: 0 });
    expect((await agent.post(`${a}/resolve`).send({ correctiveAction: "encore une fois" })).status).toBe(422);

    expect((await agent.post(`${a}/reopen`)).body.state).toBe("open");
  });

  it("une nouvelle anomalie après résolution rouvre une nouvelle alerte", async () => {
    const { agent, estId, alertId } = await criticalAlert();
    await agent.post(`${base(estId)}/alerts/${alertId}/resolve`).send({ correctiveAction: "Problème réglé" });
    const eqId = (await agent.get(`${base(estId)}/equipments`)).body.data[0].id;
    await agent.post(`${base(estId)}/readings`).send({ equipmentId: eqId, value: 8, action: "Nouvelle panne" });
    const all = await agent.get(`${base(estId)}/alerts?state=all`.replace("state=all", "limit=50"));
    void all;
    const active = await agent.get(`${base(estId)}/alerts?state=active`);
    const resolved = await agent.get(`${base(estId)}/alerts?state=resolved`);
    expect(active.body.data).toHaveLength(1);
    expect(resolved.body.data).toHaveLength(1);
  });

  it("l'escalade est calculée selon l'ancienneté", async () => {
    const { agent, estId, alertId } = await criticalAlert();
    // createdAt est immuable côté Mongoose : on passe par le pilote natif pour simuler une alerte ancienne.
    await Alert.collection.updateOne({ _id: new Types.ObjectId(alertId) }, { $set: { createdAt: new Date(Date.now() - 70 * 60_000) } });
    const res = await agent.get(`${base(estId)}/alerts/${alertId}`);
    expect(res.body.escalation).toBe(2);
    expect(res.body.escalationReason).toMatch(/non prise en charge depuis 1 h/);
    const list = await agent.get(`${base(estId)}/alerts`);
    expect(list.body.summary.escalated).toBe(1);
  });

  it("filtres : gravité, type, recherche", async () => {
    const { agent, estId } = await criticalAlert();
    expect((await agent.get(`${base(estId)}/alerts?severity=warn`)).body.data).toHaveLength(0);
    expect((await agent.get(`${base(estId)}/alerts?kind=temperature`)).body.data).toHaveLength(1);
    expect((await agent.get(`${base(estId)}/alerts?kind=oil`)).body.data).toHaveLength(0);
    expect((await agent.get(`${base(estId)}/alerts?search=critique`)).body.data).toHaveLength(1);
    expect((await agent.get(`${base(estId)}/alerts?search=zzz`)).body.data).toHaveLength(0);
  });
});

describe("capteurs IoT", () => {
  it("appairage, ingestion, clé invalide, batterie faible, reconnexion", async () => {
    const { agent, estId } = await registerCompany("Iot");
    const eq = await createEquipment(agent, estId, { name: "CF IoT" });

    const pair = await agent.post(`${base(estId)}/equipments/${eq.id}/sensor/pair`);
    expect(pair.status).toBe(201);
    expect(pair.body.deviceKey).toMatch(/^shk_/);
    expect(pair.body.equipment.sensor.pairing).toBe("pending");
    expect(JSON.stringify(pair.body.equipment)).not.toContain("deviceKeyHash");
    const key = pair.body.deviceKey as string;

    expect((await request(app).post("/api/v1/iot/readings").send({ value: 2 })).status).toBe(401);
    expect((await request(app).post("/api/v1/iot/readings").set("x-device-key", "shk_inconnue_inconnue_inconnue").send({ value: 2 })).status).toBe(401);

    const ok = await request(app).post("/api/v1/iot/readings").set("x-device-key", key).send({ value: 2.1, battery: 88, signal: 4 });
    expect(ok.status).toBe(201);
    let e = (await agent.get(`${base(estId)}/equipments/${eq.id}`)).body;
    expect(e).toMatchObject({ temp: 2.1, status: "ok" });
    expect(e.sensor).toMatchObject({ pairing: "paired", online: true, battery: 88, signal: 4 });

    // batterie faible → alerte ; remontée → alerte clôturée automatiquement
    await request(app).post("/api/v1/iot/readings").set("x-device-key", key).send({ value: 2.0, battery: 9 });
    let alerts = (await agent.get(`${base(estId)}/alerts`)).body.data;
    expect(alerts.find((a: { title: string }) => a.title === "Batterie du capteur faible")).toBeTruthy();
    await request(app).post("/api/v1/iot/readings").set("x-device-key", key).send({ value: 2.0, battery: 100 });
    alerts = (await agent.get(`${base(estId)}/alerts`)).body.data;
    expect(alerts.find((a: { title: string }) => a.title === "Batterie du capteur faible")).toBeUndefined();

    // un relevé IoT critique crée l'alerte de température sans action corrective exigée
    const crit = await request(app).post("/api/v1/iot/readings").set("x-device-key", key).send({ value: 6 });
    expect(crit.body.status).toBe("critical");
    e = (await agent.get(`${base(estId)}/equipments/${eq.id}`)).body;
    expect(e.status).toBe("critical");
  });

  it("un relevé retardé (horodatage ancien) n'écrase pas l'état courant", async () => {
    const { agent, estId } = await registerCompany("IotLate");
    const eq = await createEquipment(agent, estId);
    const key = (await agent.post(`${base(estId)}/equipments/${eq.id}/sensor/pair`)).body.deviceKey;
    await request(app).post("/api/v1/iot/readings").set("x-device-key", key).send({ value: 2.5 });
    await request(app).post("/api/v1/iot/readings").set("x-device-key", key).send({ value: 1.0, at: new Date(Date.now() - 3_600_000).toISOString() });
    const e = (await agent.get(`${base(estId)}/equipments/${eq.id}`)).body;
    expect(e.temp).toBe(2.5);
    expect((await agent.get(`${base(estId)}/readings?limit=10`)).body.meta.total).toBe(2);
  });

  it("désappairage : l'ancienne clé ne fonctionne plus", async () => {
    const { agent, estId } = await registerCompany("IotUnpair");
    const eq = await createEquipment(agent, estId);
    const key = (await agent.post(`${base(estId)}/equipments/${eq.id}/sensor/pair`)).body.deviceKey;
    await agent.delete(`${base(estId)}/equipments/${eq.id}/sensor`);
    expect((await request(app).post("/api/v1/iot/readings").set("x-device-key", key).send({ value: 2 })).status).toBe(401);
  });
});

describe("nettoyage", () => {
  it("création réservée aux responsables, validation idempotente, annulation", async () => {
    const { agent, estId, companyId } = await registerCompany("Clean");
    const operator = await loginAs(companyId, "operator", { primaryEstablishmentId: estId });

    const t = { title: "Sols", zone: "Cuisine", frequency: "daily", method: "Dégraissant", dueTime: "15:00" };
    expect((await operator.agent.post(`${base(estId)}/cleaning`).send(t)).status).toBe(403);
    expect((await agent.post(`${base(estId)}/cleaning`).send({ ...t, dueTime: "25:99" })).status).toBe(422);
    const created = await agent.post(`${base(estId)}/cleaning`).send(t);
    expect(created.status).toBe(201);

    const id = created.body.id;
    expect((await operator.agent.get(`${base(estId)}/cleaning`)).body.data[0]).toMatchObject({ title: "Sols", done: false });
    const done = await operator.agent.post(`${base(estId)}/cleaning/${id}/complete`);
    expect(done.status).toBe(201);
    expect((await operator.agent.post(`${base(estId)}/cleaning/${id}/complete`)).status).toBe(201); // rejouer = pas de doublon
    const list = await operator.agent.get(`${base(estId)}/cleaning`);
    expect(list.body.data[0]).toMatchObject({ done: true, doneBy: "operator Test" });
    expect(list.body.progress).toEqual({ done: 1, total: 1 });

    expect((await operator.agent.delete(`${base(estId)}/cleaning/${id}/complete`)).status).toBe(403);
    await agent.delete(`${base(estId)}/cleaning/${id}/complete`);
    expect((await agent.get(`${base(estId)}/cleaning`)).body.data[0].done).toBe(false);
  });

  it("tâche hebdomadaire : validée pour toute la semaine", async () => {
    const { agent, estId } = await registerCompany("CleanWeek");
    const id = (await agent.post(`${base(estId)}/cleaning`).send({ title: "Hotte", zone: "Cuisine", frequency: "weekly", dueTime: "16:00" })).body.id;
    await agent.post(`${base(estId)}/cleaning/${id}/complete`);
    expect((await agent.get(`${base(estId)}/cleaning`)).body.data[0].done).toBe(true);
  });
});

describe("huile de friture", () => {
  it("action obligatoire si l'huile doit être changée, alerte, puis clôture au changement d'huile", async () => {
    const { agent, estId } = await registerCompany("Oil");
    const fryer = await createEquipment(agent, estId, { name: "Friteuse", type: "fryer" });
    const o = `${base(estId)}/oil`;

    const ok = await agent.post(`${o}/controls`).send({ fryerId: fryer.id, slot: "morning", temp: 175, polar: "18,5", aspect: "normal" });
    expect(ok.status).toBe(201);
    expect(ok.body.control.status).toBe("ok");
    expect(ok.body.alert).toBeNull();

    const warn = await agent.post(`${o}/controls`).send({ fryerId: fryer.id, slot: "evening", temp: 175, polar: 23, aspect: "normal" });
    expect(warn.body.control.status).toBe("warn");
    expect(warn.body.alert.severity).toBe("warn");

    const noAction = await agent.post(`${o}/controls`).send({ fryerId: fryer.id, slot: "evening", temp: 175, polar: 26, aspect: "dark" });
    expect(noAction.status).toBe(422);
    expect(noAction.body.error.code).toBe("ACTION_REQUIRED");

    const change = await agent.post(`${o}/controls`).send({ fryerId: fryer.id, slot: "evening", temp: 175, polar: 26, aspect: "dark", action: "Huile changée à 18h" });
    expect(change.body.control.status).toBe("change");
    expect(change.body.alert).toMatchObject({ severity: "critical", kind: "oil", title: "Huile de friture à changer" });
    expect((await agent.get(`${base(estId)}/alerts`)).body.data).toHaveLength(1); // même alerte, aggravée

    const rec = await agent.post(`${o}/fryers/${fryer.id}/changes`).send({ note: "Vidange complète" });
    expect(rec.status).toBe(201);
    expect(rec.body.alertsResolved).toBe(1);
    expect((await agent.get(`${base(estId)}/alerts`)).body.data).toHaveLength(0);

    const overview = await agent.get(`${o}/fryers`);
    expect(overview.body.data[0]).toMatchObject({ name: "Friteuse", slotsDone: expect.arrayContaining(["morning", "evening"]), expected: 2 });
    expect(overview.body.data[0].lastChangeAt).toBeTruthy();
  });

  it("n'accepte que les friteuses", async () => {
    const { agent, estId } = await registerCompany("OilFridge");
    const fridge = await createEquipment(agent, estId, { type: "fridge" });
    const res = await agent.post(`${base(estId)}/oil/controls`).send({ fryerId: fridge.id, slot: "morning", temp: 170, polar: 10, aspect: "normal" });
    expect(res.status).toBe(404);
  });
});

describe("traçabilité", () => {
  const lot = (over: Record<string, unknown> = {}) => ({
    product: "Filet de poulet", supplier: "Boucherie", lotNumber: "BM-1", category: "meat", quantity: "6 kg",
    dlc: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), receptionTemp: 3, ...over,
  });

  it("température de réception non conforme : décision écrite obligatoire", async () => {
    const { agent, estId } = await registerCompany("Lot1");
    const bad = await agent.post(`${base(estId)}/lots`).send(lot({ receptionTemp: 6 }));
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("NOTE_REQUIRED");
    const ok = await agent.post(`${base(estId)}/lots`).send(lot({ receptionTemp: 6, note: "Acceptée sous réserve, avoir demandé" }));
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ dlcStatus: "ok", daysLeft: 3, state: "stock" });
  });

  it("DLC avant réception refusée ; statuts, filtres et compteurs", async () => {
    const { agent, estId } = await registerCompany("Lot2");
    const today = nowInTz("Europe/Paris").date;
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

    expect((await agent.post(`${base(estId)}/lots`).send(lot({ receivedAt: day(0), dlc: day(-1) }))).status).toBe(422);
    for (const [i, d] of [-2, 0, 2, 10].entries()) {
      const r = await agent.post(`${base(estId)}/lots`).send(lot({ lotNumber: `L${i}`, receivedAt: day(-5), dlc: day(d) }));
      expect(r.status).toBe(201);
    }
    const all = await agent.get(`${base(estId)}/lots`);
    expect(all.body.counts).toEqual({ expired: 1, today: 1, soon: 1, ok: 1, stock: 4 });
    expect((await agent.get(`${base(estId)}/lots?dlcStatus=expired`)).body.data).toHaveLength(1);
    expect((await agent.get(`${base(estId)}/lots?dlcStatus=soon`)).body.data[0].lotNumber).toBe("L2");
    expect((await agent.get(`${base(estId)}/lots?search=l3`)).body.data).toHaveLength(1);
  });

  it("utilisation / rebut d'un lot, une seule clôture possible", async () => {
    const { agent, estId } = await registerCompany("Lot3");
    const id = (await agent.post(`${base(estId)}/lots`).send(lot())).body.id;
    const used = await agent.post(`${base(estId)}/lots/${id}/use`);
    expect(used.body).toMatchObject({ state: "used", dlcStatus: null });
    expect((await agent.post(`${base(estId)}/lots/${id}/discard`)).status).toBe(422);
  });
});

describe("documents", () => {
  const pdf = Buffer.from("%PDF-1.4\n%test\n");

  it("dépôt, téléchargement protégé, métadonnées, archivage avec motif", async () => {
    const { agent, estId } = await registerCompany("Docs");
    const up = await agent
      .post(`${base(estId)}/documents`)
      .field("category", "formation")
      .field("name", "Formation HACCP Marc")
      .field("expiresAt", new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10))
      .field("tags", "haccp, marc")
      .attach("file", pdf, { filename: "attestation.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ name: "Formation HACCP Marc", category: "formation", expiryStatus: "soon", tags: ["haccp", "marc"], fileType: "application/pdf" });
    expect(up.body.storageKey).toBeUndefined();
    const id = up.body.id;

    const file = await agent.get(`${base(estId)}/documents/${id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/pdf");
    expect(file.headers["content-disposition"]).toContain("inline");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(file.body).toString()).toContain("%PDF-1.4");
    expect((await request(app).get(`${base(estId)}/documents/${id}/file`)).status).toBe(401);

    expect((await agent.get(`${base(estId)}/documents`)).body.counts.soon).toBe(1);
    expect((await agent.get(`${base(estId)}/documents?expiry=expired`)).body.data).toHaveLength(0);
    expect((await agent.delete(`${base(estId)}/documents/${id}`).send({})).status).toBe(422);
    const arch = await agent.delete(`${base(estId)}/documents/${id}`).send({ reason: "Remplacé par une version à jour" });
    expect(arch.body).toMatchObject({ archived: true, deletedBy: "Jules Dupont" });
    expect((await agent.get(`${base(estId)}/documents`)).body.data).toHaveLength(0);
    expect((await agent.delete(`${base(estId)}/documents/${id}/permanent`)).body.ok).toBe(true);
  });

  it("refuse les formats non autorisés, l'absence de fichier et l'expiration hors catégorie", async () => {
    const { agent, estId } = await registerCompany("DocsKO");
    const exe = await agent.post(`${base(estId)}/documents`).field("category", "autre").attach("file", Buffer.from("MZ"), { filename: "virus.exe", contentType: "application/x-msdownload" });
    expect(exe.status).toBe(422);
    expect(exe.body.error.code).toBe("FILE_TYPE_INVALID");
    expect((await agent.post(`${base(estId)}/documents`).field("category", "autre")).status).toBe(422);
    const bad = await agent.post(`${base(estId)}/documents`).field("category", "facture").field("expiresAt", "2027-01-01").attach("file", pdf, { filename: "f.pdf", contentType: "application/pdf" });
    expect(bad.body.error.code).toBe("EXPIRY_NOT_ALLOWED");
  });
});

describe("utilisateurs et rôles", () => {
  it("invitation, hiérarchie des rôles, règles de protection", async () => {
    const { agent, estId, companyId, user } = await registerCompany("Users");
    const admin = await loginAs(companyId, "admin", { authorizedEstablishmentIds: [estId] });
    const manager = await loginAs(companyId, "manager", { authorizedEstablishmentIds: [estId] });

    const invite = await agent.post("/api/v1/users").send({ firstName: "Marc", lastName: "Lefèvre", email: "Marc@Test.fr", role: "operator", primaryEstablishmentId: estId });
    expect(invite.status).toBe(201);
    expect(invite.body).toMatchObject({ email: "marc@test.fr", role: "operator", mustChangePassword: true });
    expect(invite.body.passwordHash).toBeUndefined();
    expect((await agent.post("/api/v1/users").send({ firstName: "M", email: "marc@test.fr", role: "operator", primaryEstablishmentId: estId })).status).toBe(409);

    expect((await agent.post("/api/v1/users").send({ firstName: "M", email: "x1@test.fr", role: "operator" })).body.error.code).toBe("PRIMARY_REQUIRED");
    expect((await agent.post("/api/v1/users").send({ firstName: "M", email: "x2@test.fr", role: "manager", authorizedEstablishmentIds: [] })).body.error.code).toBe("ESTABLISHMENT_REQUIRED");
    expect((await agent.post("/api/v1/users").send({ firstName: "M", email: "x3@test.fr", role: "operator", primaryEstablishmentId: "507f1f77bcf86cd799439011" })).body.error.code).toBe("ESTABLISHMENT_UNKNOWN");

    // l'admin ne peut pas créer un admin ni un super admin ; il peut créer un responsable
    expect((await admin.agent.post("/api/v1/users").send({ firstName: "A", email: "x4@test.fr", role: "admin", authorizedEstablishmentIds: [estId] })).status).toBe(403);
    expect((await admin.agent.post("/api/v1/users").send({ firstName: "S", email: "x5@test.fr", role: "super_admin" })).status).toBe(403);
    expect((await admin.agent.post("/api/v1/users").send({ firstName: "R", email: "x6@test.fr", role: "manager", authorizedEstablishmentIds: [estId] })).status).toBe(201);

    // un responsable peut lister mais pas créer
    expect((await manager.agent.get("/api/v1/users")).status).toBe(200);
    expect((await manager.agent.post("/api/v1/users").send({ firstName: "O", email: "x7@test.fr", role: "operator", primaryEstablishmentId: estId })).status).toBe(403);

    // le dernier super admin est protégé ; on ne se désactive pas soi-même
    expect((await agent.delete(`/api/v1/users/${user.id}`)).body.error.code).toBe("SELF_DEACTIVATE");
    expect((await agent.patch(`/api/v1/users/${user.id}`).send({ role: "admin", authorizedEstablishmentIds: [estId] })).body.error.code).toBe("SELF_ROLE_CHANGE");
    expect((await admin.agent.patch(`/api/v1/users/${user.id}`).send({ firstName: "Pirate" })).status).toBe(403); // rang supérieur
  });

  it("désactivation : la session de la personne est fermée", async () => {
    const { agent, estId, companyId } = await registerCompany("Users2");
    const op = await loginAs(companyId, "operator", { primaryEstablishmentId: estId });
    expect((await op.agent.get("/api/v1/auth/me")).status).toBe(200);
    expect((await agent.delete(`/api/v1/users/${op.user.id}`)).body.active).toBe(false);
    expect((await op.agent.get("/api/v1/auth/me")).status).toBe(401);
  });
});

describe("droits par rôle et par établissement", () => {
  it("opérateur : saisit mais ne lit pas les rapports ni les utilisateurs ; contrôleur en lecture seule", async () => {
    const { agent, estId, companyId } = await registerCompany("Roles");
    const eq = await createEquipment(agent, estId);
    const op = await loginAs(companyId, "operator", { primaryEstablishmentId: estId });
    const aud = await loginAs(companyId, "auditor", { authorizedEstablishmentIds: [estId] });

    expect((await op.agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 2 })).status).toBe(201);
    expect((await op.agent.post(`${base(estId)}/equipments`).send({ name: "N", type: "fridge", zone: "Z" })).status).toBe(403);
    expect((await op.agent.get(`${base(estId)}/reports/summary`)).status).toBe(403);
    expect((await op.agent.get("/api/v1/users")).status).toBe(403);
    expect((await op.agent.get(`${base(estId)}/settings`)).status).toBe(403);

    expect((await aud.agent.get(`${base(estId)}/readings`)).status).toBe(200);
    expect((await aud.agent.get(`${base(estId)}/reports/summary`)).status).toBe(200);
    expect((await aud.agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 2 })).status).toBe(403);
    expect((await aud.agent.get("/api/v1/company/audit-logs")).status).toBe(200);
    expect((await op.agent.get("/api/v1/company/audit-logs")).status).toBe(403);
  });

  it("accès limité aux établissements autorisés + création d'établissement", async () => {
    const { agent, estId, companyId } = await registerCompany("Multi");
    const second = await agent.post("/api/v1/establishments").send({ name: "Deuxième site", city: "Lyon" });
    expect(second.status).toBe(201);
    const est2 = second.body.id;

    const mgr = await loginAs(companyId, "manager", { authorizedEstablishmentIds: [estId] });
    expect((await mgr.agent.get(`${base(estId)}/equipments`)).status).toBe(200);
    const forbidden = await mgr.agent.get(`${base(est2)}/equipments`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("ESTABLISHMENT_FORBIDDEN");
    expect((await mgr.agent.get("/api/v1/establishments")).body.data.map((e: { id: string }) => e.id)).toEqual([estId]);
    expect((await mgr.agent.post("/api/v1/establishments").send({ name: "Interdit" })).status).toBe(403);
    expect((await agent.get("/api/v1/establishments")).body.data).toHaveLength(2);
  });

  it("isolation entre entreprises : l'établissement d'une autre entreprise est introuvable", async () => {
    const a = await registerCompany("Entreprise A");
    const b = await registerCompany("Entreprise B");
    const eqA = await createEquipment(a.agent, a.estId);
    expect((await b.agent.get(`${base(a.estId)}/equipments`)).status).toBe(404);
    expect((await b.agent.get(`${base(a.estId)}/equipments/${eqA.id}`)).status).toBe(404);
    expect((await b.agent.get(`${base(b.estId)}/equipments/${eqA.id}`)).status).toBe(404);
    expect((await b.agent.get("/api/v1/users")).body.data.every((u: { companyId: string }) => u.companyId === b.companyId)).toBe(true);
    expect((await b.agent.get(`/api/v1/users/${a.user.id}`)).status).toBe(404);
  });
});

describe("paramètres, tableau de bord, rapports, audit, onboarding", () => {
  it("paramètres : validation comme le front, seuils pris en compte à la création d'équipement", async () => {
    const { agent, estId } = await registerCompany("Settings");
    const s = `${base(estId)}/settings`;
    expect((await agent.get(s)).body.thresholds).toMatchObject({ coldroomMax: 3, polarLimit: 25 });

    const bad = await agent.put(s).send({ thresholds: { coldroomMax: 3, fridgeMax: 4, freezerMax: -18, warnMargin: 0.5, polarWarn: 26, polarLimit: 25, oilMaxTemp: 180, dlcSoonDays: 2 } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields["thresholds.polarWarn"]).toBe("Doit être inférieur à la limite.");

    const ok = await agent.put(s).send({
      thresholds: { coldroomMax: "4", fridgeMax: "5", freezerMax: "-20", warnMargin: "0,5", polarWarn: "20", polarLimit: "24", oilMaxTemp: "175", dlcSoonDays: "3" },
      notificationPrefs: { channels: { push: true, email: true }, byLevel: { critical: true, warn: false, info: false }, quietHours: { enabled: true, from: "22:00", to: "07:00" }, frequency: "immediate", extraRecipients: "chef@test.fr; compta@test.fr" },
      profile: { name: "Bistrot Renommé", siret: "123 456 789 00012", timezone: "Europe/Brussels" },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.thresholds).toMatchObject({ coldroomMax: 4, polarLimit: 24, dlcSoonDays: 3 });
    expect(ok.body.notificationPrefs.extraRecipients).toEqual(["chef@test.fr", "compta@test.fr"]);
    expect(ok.body.profile).toMatchObject({ name: "Bistrot Renommé", siret: "12345678900012", timezone: "Europe/Brussels" });

    const eq = await createEquipment(agent, estId, { type: "coldroom" });
    expect(eq.max).toBe(4); // les réglages de l'établissement servent de valeurs par défaut

    expect((await agent.put(s).send({ notificationPrefs: { channels: { push: true, email: true }, byLevel: { critical: true, warn: true, info: false }, quietHours: { enabled: true, from: "25:00", to: "07:00" }, frequency: "immediate", extraRecipients: "" } })).status).toBe(422);
    expect((await agent.put(s).send({ profile: { timezone: "Mars/Olympus" } })).status).toBe(422);
  });

  it("tableau de bord cohérent avec les données", async () => {
    const { agent, estId } = await registerCompany("Dash");
    const ok = await createEquipment(agent, estId, { name: "OK" });
    const ko = await createEquipment(agent, estId, { name: "KO" });
    await agent.post(`${base(estId)}/readings`).send({ equipmentId: ok.id, value: 1.5 });
    await agent.post(`${base(estId)}/readings`).send({ equipmentId: ko.id, value: 8, action: "Dépannage en cours" });
    const d = (await agent.get(`${base(estId)}/dashboard`)).body;
    expect(d.equipmentCounts).toMatchObject({ ok: 1, critical: 1, total: 2 });
    expect(d.criticalEquipment).toMatchObject({ name: "KO", status: "critical" });
    expect(d.alerts).toMatchObject({ open: 1, critical: 1 });
    expect(d.progress[0]).toEqual({ label: "Équipements relevés", done: 2, total: 2 });
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(100);
  });

  it("exports CSV et PDF, journal d'audit", async () => {
    const { agent, estId } = await registerCompany("Reports");
    const eq = await createEquipment(agent, estId, { name: "=CMD()" }); // tentative d'injection de formule
    await agent.post(`${base(estId)}/readings`).send({ equipmentId: eq.id, value: 2 });

    const csv = await agent.get(`${base(estId)}/reports/export.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["content-disposition"]).toContain("attachment");
    expect(csv.text.startsWith("\uFEFF")).toBe(true);
    expect(csv.text).toContain('"Domaine";"Élément"');
    expect(csv.text).toContain(`"'=CMD()"`); // neutralisée
    expect(csv.text).not.toContain(`;"=CMD()"`);

    const pdf = await agent.get(`${base(estId)}/reports/export.pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    const summary = await agent.get(`${base(estId)}/reports/summary`);
    expect(summary.body.summary).toHaveLength(6);

    const logs = await agent.get("/api/v1/company/audit-logs?limit=100");
    const actions = logs.body.data.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["auth.register", "equipment.create", "report.export_csv", "report.export_pdf"]));
  });

  it("modification de seuils tracée dans le journal d'audit", async () => {
    const { agent, estId } = await registerCompany("AuditSeuils");
    const eq = await createEquipment(agent, estId);
    await agent.patch(`${base(estId)}/equipments/${eq.id}`).send({ max: 5 });
    const logs = (await agent.get("/api/v1/company/audit-logs?action=equipment.thresholds")).body.data;
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toMatchObject({ before: { max: 3 }, after: { max: 5 } });
  });

  it("onboarding", async () => {
    const { agent } = await registerCompany("Onboarding");
    expect((await agent.get("/api/v1/company/onboarding")).body).toMatchObject({ completedSteps: [], completed: false });
    const put = await agent.put("/api/v1/company/onboarding").send({ completedSteps: ["establishment", "equipments", "equipments"] });
    expect(put.body.completedSteps).toEqual(["establishment", "equipments"]);
    expect((await agent.put("/api/v1/company/onboarding").send({ completedSteps: ["inconnu"] })).status).toBe(422);
  });

  it("archivage d'un établissement : jamais le dernier", async () => {
    const { agent, estId } = await registerCompany("ArchEst");
    expect((await agent.delete(base(estId))).body.error.code).toBe("LAST_ESTABLISHMENT");
    const second = (await agent.post("/api/v1/establishments").send({ name: "Second" })).body.id;
    expect((await agent.delete(base(second))).body.active).toBe(false);
    expect((await agent.post(`${base(second)}/equipments`).send({ name: "X", type: "fridge", zone: "Z" })).status).toBe(403); // archivé : lecture seule
  });
});

describe("tâches planifiées", () => {
  it("capteur muet : hors ligne + alerte critique, une seule fois", async () => {
    const { agent, estId } = await registerCompany("JobSensor");
    const eq = await createEquipment(agent, estId, { name: "CF muette" });
    await agent.post(`${base(estId)}/equipments/${eq.id}/sensor/pair`);
    await Equipment.updateOne({ _id: eq.id }, { $set: { "sensor.pairing": "paired", "sensor.online": true, "sensor.lastSeenAt": new Date(Date.now() - 2 * 3_600_000) } });

    expect(await sensorWatchdog()).toBeGreaterThanOrEqual(1);
    expect(await sensorWatchdog()).toBe(0); // déjà signalée
    const a = (await agent.get(`${base(estId)}/alerts`)).body.data;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ severity: "critical", kind: "sensor", title: "Capteur hors ligne", equipment: "CF muette" });
    expect((await agent.get(`${base(estId)}/equipments/${eq.id}`)).body.status).toBe("offline");
  });

  it("DLC : alertes périmé / jour / proche, clôturées quand le lot sort du stock", async () => {
    const { agent, estId } = await registerCompany("JobDlc");
    const today = nowInTz("Europe/Paris").date;
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const mk = (n: string, d: number) => agent.post(`${base(estId)}/lots`).send({ product: n, supplier: "F", lotNumber: n, category: "dry", quantity: "1", receivedAt: day(-3), dlc: day(d) });
    const expired = (await mk("perime", -1)).body.id;
    await mk("jour", 0);
    await mk("bientot", 1);
    await mk("loin", 30);

    expect(await dlcWatcher()).toBeGreaterThanOrEqual(3);
    const a = (await agent.get(`${base(estId)}/alerts?kind=dlc`)).body.data;
    expect(a.map((x: { title: string }) => x.title).sort()).toEqual(["DLC atteinte aujourd'hui", "DLC proche", "Produit périmé en stock"]);
    expect(a.find((x: { title: string }) => x.title === "DLC proche").severity).toBe("warn");

    await agent.post(`${base(estId)}/lots/${expired}/discard`);
    await dlcWatcher();
    expect((await agent.get(`${base(estId)}/alerts?kind=dlc`)).body.data).toHaveLength(2);
    await Lot.deleteMany({});
  });

  it("nettoyage en retard : alerte uniquement après l'heure limite et si non validé", async () => {
    const { agent, estId } = await registerCompany("JobClean");
    const t = (title: string, dueTime: string) => agent.post(`${base(estId)}/cleaning`).send({ title, zone: "Cuisine", frequency: "daily", dueTime });
    await t("Déjà passée", "00:00");
    const done = (await t("Faite", "00:00")).body.id;
    await t("Pas encore", "23:59");
    await agent.post(`${base(estId)}/cleaning/${done}/complete`);

    const before = nowInTz("Europe/Paris").minutes;
    await cleaningWatcher();
    const a = (await agent.get(`${base(estId)}/alerts?kind=cleaning`)).body.data;
    expect(a.map((x: { detail: string }) => x.detail.split(" (")[0])).toEqual(before >= 1439 ? ["Déjà passée", "Pas encore"] : ["Déjà passée"]);
    expect(a[0]).toMatchObject({ severity: "warn", kind: "cleaning" });
    expect(await CleaningTask.countDocuments({ establishmentId: estId })).toBe(3);
  });
});
