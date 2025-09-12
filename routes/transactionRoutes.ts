import { Router } from "express";
import { explainTransaction } from "../controllers/transactionController";
import { validateExplainRequest, validateExtensionRequest } from "../middleware/validation";

const router = Router();

// POST /api/transactions/explain
router.post("/explain", validateExtensionRequest, validateExplainRequest, explainTransaction);

export default router;
