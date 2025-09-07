import { Router } from "express";
import transactionRoutes from "./transactionRoutes";

const router = Router();

// Mount routes
router.use("/transactions", transactionRoutes);

export default router;
