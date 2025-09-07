// server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import routes from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// API routes
app.use("/api", routes);

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env['PORT'] || 8787;

app.listen(PORT, () => {
  console.log(`tx-clarity backend listening on http://localhost:${PORT}`);
});