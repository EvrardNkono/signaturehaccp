import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/config/db";
import { User } from "../src/models";
import { hashPassword } from "../src/utils/password";

export const app = createApp();

export async function startDb() {
  await connectDb();
}

export async function stopDb() {
  const name = mongoose.connection.name;
  if (name.startsWith("haccp_test_")) await mongoose.connection.dropDatabase();
  await disconnectDb();
}

let counter = 0;
export const uniqueEmail = (p = "user") => `${p}${Date.now()}${++counter}@test.fr`;
export const PASSWORD = "Motdepasse1";

/** Crée une entreprise (inscription) et renvoie l'agent connecté (cookies conservés). */
export async function registerCompany(name = "Bistrot Test") {
  const agent = request.agent(app);
  const email = uniqueEmail("owner");
  const res = await agent
    .post("/api/v1/auth/register")
    .send({ company: name, kbis: "123456789", manager: "Jules Dupont", email, password: PASSWORD, confirm: PASSWORD, accepted: true });
  if (res.status !== 201) throw new Error(`register a échoué : ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, companyId: res.body.company.id as string, estId: res.body.establishments[0].id as string, user: res.body.user };
}

/** Crée un utilisateur directement en base (mot de passe connu) et renvoie un agent connecté. */
export async function loginAs(companyId: string, role: string, extra: Record<string, unknown> = {}) {
  const email = uniqueEmail(role);
  await User.create({
    companyId,
    firstName: role,
    lastName: "Test",
    email,
    role,
    passwordHash: await hashPassword(PASSWORD),
    ...extra,
  });
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login a échoué : ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, user: res.body.user };
}

export const base = (estId: string) => `/api/v1/establishments/${estId}`;

export async function createEquipment(agent: request.Agent, estId: string, over: Record<string, unknown> = {}) {
  const res = await agent
    .post(`${base(estId)}/equipments`)
    .send({ name: `Chambre froide ${Math.random().toString(36).slice(2, 7)}`, type: "coldroom", zone: "Cuisine", ...over });
  if (res.status !== 201) throw new Error(`équipement : ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; min: number; max: number; name: string };
}
