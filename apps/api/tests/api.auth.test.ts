import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, startDb, stopDb, registerCompany, uniqueEmail, PASSWORD, loginAs } from "./helpers";
import { User, RefreshToken } from "../src/models";
import { sha256 } from "../src/utils/password";

beforeAll(startDb);
afterAll(stopDb);

describe("santé", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", db: "up" });
  });
  it("route inconnue : 404 JSON", async () => {
    const res = await request(app).get("/api/v1/nimporte");
    expect(res.status).toBe(401); // protégée : l'authentification passe avant
    const res2 = await request(app).get("/inconnue");
    expect(res2.status).toBe(404);
    expect(res2.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

describe("inscription", () => {
  it("crée entreprise + établissement + super admin et ouvre une session", async () => {
    const { agent, user, estId } = await registerCompany("Chez Test");
    expect(user.role).toBe("super_admin");
    expect(estId).toBeTruthy();
    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
    expect(me.body.permissions.utilisateurs).toBe("write");
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it("refuse les données invalides avec le détail par champ", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ company: "", kbis: "12", manager: "", email: "x", password: "abc", confirm: "zzz", accepted: false });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(["company", "kbis", "manager", "email", "password", "accepted"]));
  });

  it("refuse un e-mail déjà utilisé", async () => {
    const { email } = await registerCompany("Doublon A");
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ company: "Doublon B", kbis: "123456789", manager: "Autre Personne", email, password: PASSWORD, accepted: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("accepte un Kbis en pièce jointe (multipart) et le range dans les documents", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail("kbis");
    const res = await agent
      .post("/api/v1/auth/register")
      .field("company", "Avec Kbis")
      .field("kbis", "12345678900012")
      .field("manager", "Léa Martin")
      .field("email", email)
      .field("password", PASSWORD)
      .field("accepted", "true")
      .attach("kbisFile", Buffer.from("%PDF-1.4 test"), { filename: "kbis.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    const docs = await agent.get(`/api/v1/establishments/${res.body.establishments[0].id}/documents`);
    expect(docs.body.data).toHaveLength(1);
    expect(docs.body.data[0].name).toBe("Extrait Kbis");
  });
});

describe("connexion", () => {
  it("mauvais mot de passe : message générique", async () => {
    const { email } = await registerCompany("Login KO");
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: "Mauvais123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    const unknown = await request(app).post("/api/v1/auth/login").send({ email: "inconnu@test.fr", password: "Mauvais123" });
    expect(unknown.body.error.message).toBe(res.body.error.message); // pas d'énumération de comptes
  });

  it("verrouille le compte après 5 échecs", async () => {
    const { email } = await registerCompany("Verrou");
    for (let i = 0; i < 5; i++) await request(app).post("/api/v1/auth/login").send({ email, password: "Mauvais123" });
    const locked = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("cookies httpOnly et aucun jeton dans le corps (navigateur)", async () => {
    const { email } = await registerCompany("Cookies");
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    const cookies = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookies).toMatch(/access_token=.*HttpOnly/i);
    expect(cookies).toMatch(/refresh_token=.*HttpOnly/i);
    expect(res.body.accessToken).toBeUndefined();
  });

  it("client mobile : jetons dans le corps + Bearer", async () => {
    const { email } = await registerCompany("Mobile");
    const res = await request(app).post("/api/v1/auth/login").set("X-Client", "mobile").send({ email, password: PASSWORD });
    expect(res.body.accessToken).toBeTruthy();
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it("route protégée sans session : 401", async () => {
    const res = await request(app).get("/api/v1/establishments");
    expect(res.status).toBe(401);
    const bad = await request(app).get("/api/v1/establishments").set("Authorization", "Bearer nimportequoi");
    expect(bad.status).toBe(401);
  });

  it("déconnexion : le refresh token ne marche plus", async () => {
    const { agent } = await registerCompany("Logout");
    const out = await agent.post("/api/v1/auth/logout");
    expect(out.status).toBe(200);
    const r = await agent.post("/api/v1/auth/refresh");
    expect(r.status).toBe(401);
  });
});

describe("rafraîchissement de session", () => {
  it("rotation + détection de réutilisation d'un jeton volé", async () => {
    const { email } = await registerCompany("Rotation");
    const login = await request(app).post("/api/v1/auth/login").set("X-Client", "mobile").send({ email, password: PASSWORD });
    const t1 = login.body.refreshToken as string;

    const r1 = await request(app).post("/api/v1/auth/refresh").set("X-Client", "mobile").send({ refreshToken: t1 });
    expect(r1.status).toBe(200);
    const t2 = r1.body.refreshToken as string;
    expect(t2).not.toBe(t1);

    // Rejouer t1 (déjà utilisé) = vol présumé : toute la famille est révoquée.
    const replay = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t1 });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_REUSED");
    const t2try = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t2 });
    expect(t2try.status).toBe(401);
    expect(await RefreshToken.countDocuments({ tokenHash: sha256(t2), revokedAt: { $ne: null } })).toBe(1);
  });
});

describe("mot de passe oublié et changement", () => {
  it("réinitialisation complète, lien à usage unique", async () => {
    const { email } = await registerCompany("Reset");
    const forgot = await request(app).post("/api/v1/auth/forgot-password").send({ email });
    expect(forgot.status).toBe(200);
    const unknown = await request(app).post("/api/v1/auth/forgot-password").send({ email: "personne@test.fr" });
    expect(unknown.body.message).toBe(forgot.body.message);

    const token = "t".repeat(40);
    await User.updateOne({ email }, { $set: { passwordResetTokenHash: sha256(token), passwordResetExpires: new Date(Date.now() + 3_600_000) } });
    const weak = await request(app).post("/api/v1/auth/reset-password").send({ token, password: "court" });
    expect(weak.status).toBe(422);
    const ok = await request(app).post("/api/v1/auth/reset-password").send({ token, password: "Nouveau1234" });
    expect(ok.status).toBe(200);
    const again = await request(app).post("/api/v1/auth/reset-password").send({ token, password: "Autre1234567" });
    expect(again.status).toBe(400);
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Nouveau1234" })).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD })).status).toBe(401);
  });

  it("lien expiré refusé", async () => {
    const { email } = await registerCompany("Expire");
    const token = "e".repeat(40);
    await User.updateOne({ email }, { $set: { passwordResetTokenHash: sha256(token), passwordResetExpires: new Date(Date.now() - 1000) } });
    const res = await request(app).post("/api/v1/auth/reset-password").send({ token, password: "Nouveau1234" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("change-password exige le mot de passe actuel", async () => {
    const { agent, email } = await registerCompany("Change");
    const bad = await agent.post("/api/v1/auth/change-password").send({ currentPassword: "Faux12345", newPassword: "Nouveau1234" });
    expect(bad.status).toBe(422);
    const ok = await agent.post("/api/v1/auth/change-password").send({ currentPassword: PASSWORD, newPassword: "Nouveau1234" });
    expect(ok.status).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Nouveau1234" })).status).toBe(200);
  });
});

describe("protection CSRF par origine", () => {
  it("refuse une requête modifiante venant d'une origine inconnue (cookie)", async () => {
    const { agent, estId } = await registerCompany("Csrf");
    const res = await agent.post(`/api/v1/establishments/${estId}/equipments`).set("Origin", "https://pirate.example").send({ name: "X", type: "fridge", zone: "Z" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("BAD_ORIGIN");
    const ok = await agent.post(`/api/v1/establishments/${estId}/equipments`).set("Origin", "http://localhost:3000").send({ name: "X", type: "fridge", zone: "Z" });
    expect(ok.status).toBe(201);
  });
});

describe("compte désactivé", () => {
  it("une session ouverte est refusée dès la désactivation", async () => {
    const { companyId } = await registerCompany("Desactive");
    const { agent, user } = await loginAs(companyId, "operator", { primaryEstablishmentId: undefined });
    await User.updateOne({ _id: user.id }, { $set: { active: false } });
    const res = await agent.get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });
});
