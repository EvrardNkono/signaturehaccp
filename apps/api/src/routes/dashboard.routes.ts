import { Router } from "express";
import { getEst } from "../middleware/auth";
import { buildDashboard } from "../services/dashboardService";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  res.json(await buildDashboard(getEst(req)));
});

export default router;
