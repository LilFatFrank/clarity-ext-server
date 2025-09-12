// server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import routes from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();

// Middleware
// For browser extensions, we need to be more permissive but still secure
app.use(cors({ 
  origin: process.env['NODE_ENV'] === 'production' 
    ? false // Extensions bypass CORS anyway, so we can be restrictive
    : true, // Allow all in development
  credentials: false // Don't send cookies with extension requests
}));
app.use(express.json({ limit: "1mb" }));

// Security headers for extension communication
app.use((req, res, next) => {
  // Allow extension requests (they'll have no origin or chrome-extension:// origin)
  const origin = req.get('origin');
  
  // Log extension requests for monitoring
  if (!origin || origin.startsWith('chrome-extension://')) {
    console.log(`Extension request from: ${origin || 'no-origin'} - ${req.method} ${req.path}`);
  }
  
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Debug endpoint to check environment variables
app.get("/debug", (_req, res) => {
  res.json({
    nodeEnv: process.env['NODE_ENV'],
    hasOpenAI: !!process.env['OPENAI_API_KEY'],
    hasHelius: !!process.env['HELIUS_API_KEY'],
    timestamp: new Date().toISOString()
  });
});

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