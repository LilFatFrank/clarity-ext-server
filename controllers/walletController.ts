// src/controllers/wallet.ts
import { Request, Response } from "express";
import { computeWalletInsights } from "../utils/wallet-insights";

// NOTE: Helius "enhanced transactions by address" endpoint.
// If your key is set, this should work out of the box.
async function fetchRecentAddressTxs(address: string, limit: number, apiKey: string) {
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=${limit}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`Helius ${resp.status}: ${msg}`);
  }
  const json = await resp.json();
  // Helius returns an array of enhanced txs
  if (!Array.isArray(json)) throw new Error("Unexpected Helius response shape");
  return json;
}

export async function getWalletInsights(req: Request, res: Response) {
  try {
    const { address, tz, limit } = req.body || {};
    if (!address) return res.status(400).json({ error: "address required" });
    if (!tz) return res.status(400).json({ error: "timezone required" });

    const n = Math.min(Math.max(Number(limit || 100), 1), 100);
    const apiKey = process.env["HELIUS_API_KEY"];
    if (!apiKey) return res.status(500).json({ error: "HELIUS_API_KEY missing" });

    const txs = await fetchRecentAddressTxs(address, n, apiKey);
    const insights = computeWalletInsights(txs, tz, { mainWallet: address });
    return res.json({ address, tz, insights });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
