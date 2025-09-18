import { Router } from "express";
import { validateExtensionRequest } from "../middleware/errorHandler.js";
import { validateWalletRequest } from "../middleware/walletValidation.js";
import { getWalletInsights } from "../controllers/walletController.js";

const router = Router();

// POST /api/wallets/insights
router.post("/insights", validateExtensionRequest, validateWalletRequest, getWalletInsights);

export default router;
