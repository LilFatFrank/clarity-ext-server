import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error(`Error ${statusCode}: ${message}`, err.stack);

  res.status(statusCode).json({
    error: message,
    ...(process.env['NODE_ENV'] === "development" && { stack: err.stack }),
  });
};

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    error: `Route ${req.originalUrl} not found`,
  });
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
