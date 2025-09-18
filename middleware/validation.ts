import { Request, Response, NextFunction } from "express";

export const validateExplainRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { signature, tz } = req.body;

  if (!signature) {
    return res.status(400).json({ error: "signature is required" });
  }

  if (!tz) {
    return res.status(400).json({ error: "timezone is required" });
  }

  // Enhanced validation for signature format (Solana signatures are base58, ~88 chars)
  if (typeof signature !== "string" || signature.length < 80 || signature.length > 100) {
    return res.status(400).json({ error: "invalid signature format" });
  }
  
  // Validate base58 characters only
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(signature)) {
    return res.status(400).json({ error: "invalid signature format" });
  }

  // Basic validation for timezone (IANA timezone format)
  if (typeof tz !== "string" || !tz.includes("/")) {
    return res.status(400).json({ error: "invalid timezone format" });
  }

  return next();
};
