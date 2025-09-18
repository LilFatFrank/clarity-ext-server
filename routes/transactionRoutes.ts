import { Router } from "express";
import { explainTransaction } from "../controllers/transactionController.js";
import { validateExplainRequest } from "../middleware/validation.js";
import { validateExtensionRequest } from "../middleware/errorHandler.js";

const router = Router();

// POST /api/transactions/explain
router.post("/explain", validateExtensionRequest, validateExplainRequest, explainTransaction);

export default router;
