import { Router } from "express";
import { validateExtensionRequest } from "../middleware/errorHandler";
import { validateWalletRequest } from "../middleware/walletValidation";
import { getWalletInsights } from "../controllers/walletController";

const router = Router();

// POST /api/wallets/insights
router.post("/insights", validateExtensionRequest, validateWalletRequest, getWalletInsights);

export default router;
