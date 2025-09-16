import { Router } from "express";
import transactionRoutes from "./transactionRoutes";
import walletRoutes from "./walletRoutes";

const router = Router();

// Mount routes
router.use("/transactions", transactionRoutes);
router.use("/wallets", walletRoutes);

export default router;
