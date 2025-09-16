import { Router } from "express";
import { explainTransaction } from "../controllers/transactionController";
import { validateExplainRequest } from "../middleware/validation";
import { validateExtensionRequest } from "../middleware/errorHandler";

const router = Router();

// POST /api/transactions/explain
router.post("/explain", validateExtensionRequest, validateExplainRequest, explainTransaction);

export default router;
