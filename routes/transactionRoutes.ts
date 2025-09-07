import { Router } from "express";
import { explainTransaction } from "../controllers/transactionController";
import { validateExplainRequest } from "../middleware/validation";

const router = Router();

// POST /api/transactions/explain
router.post("/explain", validateExplainRequest, explainTransaction);

export default router;
