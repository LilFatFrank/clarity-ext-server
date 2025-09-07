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
