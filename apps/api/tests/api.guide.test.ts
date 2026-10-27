import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEquipment, loginAs, registerCompany, startDb, stopDb } from "./helpers";

beforeAll(startDb);
afterAll(stopDb);

describe("guide d'utilisation (par utilisateur)", () => {
  it("un nouvel utilisateur démarre avec un guide actif et vide", async () => {
    const { agent } = await registerCompany("GuideNeuf");
    const res = await agent.get("/api/v1/me/guide");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "active", seenSteps: [], checklistHidden: false, lastStartedAt: null });
    expect(res.body.steps).toContain("welcome");
    expect(res.body.steps).toContain("releves");
  });

  it("exige une session", async () => {
    const { agent } = await registerCompany("GuideAnon");
    await agent.post("/api/v1/auth/logout");
    expect((await agent.get("/api/v1/me/guide")).status).toBe(401);
  });

  it("met à jour la progression : doublons retirés, mise à jour partielle", async () => {
    const { agent } = await registerCompany("GuideMaj");
    const put = await agent.put("/api/v1/me/guide").send({ seenSteps: ["welcome", "dashboard", "dashboard"] });
    expect(put.status).toBe(200);
    expect(put.body.seenSteps).toEqual(["welcome", "dashboard"]);
    expect(put.body.status).toBe("active");

    const dismissed = await agent.put("/api/v1/me/guide").send({ status: "dismissed" });
    expect(dismissed.body).toMatchObject({ status: "dismissed", seenSteps: ["welcome", "dashboard"] });

    const hide = await agent.put("/api/v1/me/guide").send({ checklistHidden: true });
    expect(hide.body).toMatchObject({ status: "dismissed", checklistHidden: true });

    // Persistance
    expect((await agent.get("/api/v1/me/guide")).body).toMatchObject({ status: "dismissed", checklistHidden: true });
  });

  it("refuse les valeurs inconnues", async () => {
    const { agent } = await registerCompany("GuideInvalide");
    expect((await agent.put("/api/v1/me/guide").send({ seenSteps: ["inconnu"] })).status).toBe(422);
    expect((await agent.put("/api/v1/me/guide").send({ status: "termine" })).status).toBe(422);
    expect((await agent.put("/api/v1/me/guide").send({ checklistHidden: "oui" })).status).toBe(422);
  });

  it("relance le guide depuis le début", async () => {
    const { agent } = await registerCompany("GuideReset");
    await agent.put("/api/v1/me/guide").send({ status: "completed", seenSteps: ["welcome", "alertes"], checklistHidden: true });
    const reset = await agent.post("/api/v1/me/guide/reset");
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ status: "active", seenSteps: [], checklistHidden: false });
    expect(typeof reset.body.lastStartedAt).toBe("string");
  });

  it("chaque utilisateur a son propre guide, même sans droit d'administration", async () => {
    const { agent, companyId } = await registerCompany("GuideEquipe");
    const { agent: operator } = await loginAs(companyId, "operator");

    await agent.put("/api/v1/me/guide").send({ status: "completed", seenSteps: ["welcome", "dashboard"] });

    // L'opérateur n'est pas touché par la progression de l'administrateur…
    expect((await operator.get("/api/v1/me/guide")).body).toMatchObject({ status: "active", seenSteps: [] });
    // …et peut enregistrer la sienne (le PUT de /company/onboarding lui est interdit).
    const own = await operator.put("/api/v1/me/guide").send({ seenSteps: ["welcome"], status: "dismissed" });
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ status: "dismissed", seenSteps: ["welcome"] });
    expect((await operator.put("/api/v1/company/onboarding").send({ completedSteps: ["team"] })).status).toBe(403);

    // La progression de l'administrateur est intacte.
    expect((await agent.get("/api/v1/me/guide")).body).toMatchObject({ status: "completed", seenSteps: ["welcome", "dashboard"] });
  });
});

describe("checklist de démarrage : détection automatique des étapes", () => {
  it("coche les étapes d'après les données réelles", async () => {
    const { agent, estId, companyId } = await registerCompany("GuideDetect");

    const first = (await agent.get("/api/v1/company/onboarding")).body;
    expect(first.detectedSteps).toEqual(["establishment"]);
    expect(first.completedSteps).toEqual([]);
    expect(first.completed).toBe(false);

    await createEquipment(agent, estId, { name: "CF détection", type: "coldroom" });
    await loginAs(companyId, "operator");

    const second = (await agent.get("/api/v1/company/onboarding")).body;
    expect(second.detectedSteps).toEqual(expect.arrayContaining(["establishment", "equipments", "team"]));
    expect(second.detectedSteps).not.toContain("document");
    expect(second.completed).toBe(false);
  });

  it("une étape confirmée à la main compte pour la complétion, et tout rôle peut lire", async () => {
    const { agent, companyId } = await registerCompany("GuideManuel");
    const put = await agent.put("/api/v1/company/onboarding").send({ completedSteps: ["equipments", "team", "thresholds", "document"] });
    expect(put.status).toBe(200);
    expect(put.body.detectedSteps).toContain("establishment");
    expect(put.body.completed).toBe(true);

    const { agent: operator } = await loginAs(companyId, "operator");
    const read = await operator.get("/api/v1/company/onboarding");
    expect(read.status).toBe(200);
    expect(read.body.completed).toBe(true);
  });
});
