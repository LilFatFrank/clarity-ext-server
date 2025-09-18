// server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { securityHeaders, securityLogger } from "./middleware/security.js";

const app = express();

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Security middleware (order matters!)
app.use(securityHeaders);
app.use(securityLogger);
app.use(rateLimiter);

// CORS and body parsing
app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow Chrome extension origins
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    
    // Block all other origins in production
    callback(new Error('Not allowed by CORS'));
  },
  credentials: false // Don't send cookies with extension requests
}));
app.use(express.json({ limit: "1mb" }));

// Extension request logging
app.use((req, _res, next) => {
  const origin = req.get('origin');
  
  // Log extension requests for monitoring
  if (!origin || origin.startsWith('chrome-extension://')) {
    console.log(`Extension request from: ${origin || 'no-origin'} - ${req.method} ${req.path}`);
  }
  
  next();
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// API routes
app.use("/api", routes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// For Vercel serverless, export the app instead of listening
export default app;

// For local development, still listen on a port
if (process.env['NODE_ENV'] !== 'production') {
  const PORT = process.env['PORT'] || 8787;
  app.listen(PORT, () => {
    console.log(`[vizor] backend listening on http://localhost:${PORT}`);
  });
}