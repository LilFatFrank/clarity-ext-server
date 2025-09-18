import { Router } from "express";
import transactionRoutes from "./transactionRoutes.js";
import walletRoutes from "./walletRoutes.js";

const router = Router();

// Mount routes
router.use("/transactions", transactionRoutes);
router.use("/wallets", walletRoutes);

export default router;
