import { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";

export const validateWalletRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { address, tz } = req.body;

  if (!address) {
    return res.status(400).json({ error: "address is required" });
  }

  if (!tz) {
    return res.status(400).json({ error: "timezone is required" });
  }

  // Enhanced validation for Solana address format
  if (typeof address !== "string") {
    return res.status(400).json({ error: "invalid address format" });
  }
  
  // Validate Solana address format (base58, 32-44 chars)
  if (new PublicKey(address).toBase58() !== address) {
    return res.status(400).json({ error: "invalid address length" });
  }
  
  // Validate base58 characters only
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return res.status(400).json({ error: "invalid address format" });
  }

  // Basic validation for timezone (IANA timezone format)
  if (typeof tz !== "string" || !tz.includes("/")) {
    return res.status(400).json({ error: "invalid timezone format" });
  }

  return next();
};
