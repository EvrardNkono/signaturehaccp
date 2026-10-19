import { Router } from "express";
import { authenticate, originGuard } from "../middleware/auth";
import authRoutes from "./auth.routes";
import establishmentRoutes from "./establishments.routes";
import userRoutes from "./users.routes";
import companyRoutes from "./company.routes";
import iotRoutes from "./iot.routes";

const api = Router();

// Publiques (ou avec leur propre authentification)
api.use("/auth", authRoutes);
api.use("/iot", iotRoutes);

// Protégées : session valide + contrôle d'origine (CSRF) pour les cookies
api.use(authenticate, originGuard);
api.use("/establishments", establishmentRoutes);
api.use("/users", userRoutes);
api.use("/company", companyRoutes);

export default api;
