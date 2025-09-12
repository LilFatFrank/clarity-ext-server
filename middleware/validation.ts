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

  // Basic validation for signature format (Solana signatures are base58, ~88 chars)
  if (typeof signature !== "string" || signature.length < 80 || signature.length > 100) {
    return res.status(400).json({ error: "invalid signature format" });
  }

  // Basic validation for timezone (IANA timezone format)
  if (typeof tz !== "string" || !tz.includes("/")) {
    return res.status(400).json({ error: "invalid timezone format" });
  }

  return next();
};

// Extension authentication middleware
export const validateExtensionRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const origin = req.get('origin');
  const extensionId = req.get('X-Extension-ID');
  
  // Check if request is from an extension
  const isExtension = !origin || 
    origin.startsWith('chrome-extension://');
  
  if (isExtension) {
    // Optional: Validate extension ID if you want to whitelist specific extensions
    if (process.env['ALLOWED_EXTENSION_IDS']) {
      const allowedIds = process.env['ALLOWED_EXTENSION_IDS'].split(',');
      if (extensionId && !allowedIds.includes(extensionId)) {
        return res.status(403).json({ error: "Extension not authorized" });
      }
    }
    
    // Log extension requests for monitoring
    console.log(`Extension request: ${extensionId || 'unknown'} - ${req.method} ${req.path}`);
  }
  
  return next();
};
