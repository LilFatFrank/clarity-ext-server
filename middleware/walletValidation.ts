import { Request, Response, NextFunction } from "express";

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

  // Basic validation for signature format (Solana signatures are base58, ~88 chars)
  if (typeof address !== "string") {
    return res.status(400).json({ error: "invalid address format" });
  }

  // Basic validation for timezone (IANA timezone format)
  if (typeof tz !== "string" || !tz.includes("/")) {
    return res.status(400).json({ error: "invalid timezone format" });
  }

  return next();
};
