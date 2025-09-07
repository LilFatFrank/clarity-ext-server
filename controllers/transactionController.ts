import { Request, Response } from "express";
import OpenAI from "openai";
import { computeFacts } from "../utils/facts";
import { collectMints } from "../utils/mints";
import { fetchMintMetadata } from "../utils/mints";
import { formatWhenFromSeconds, coerceModelOutput } from "../utils/helpers";

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY']! });

export async function explainTransaction(req: Request, res: Response) {
    try {
      const { signature, tz } = req.body || {};
      if (!signature) return res.status(400).json({ error: "signature required" });
      if (!tz) return res.status(400).json({ error: "timezone required" });

      // 1) Helius Enhanced Tx
      const heliusUrl = `https://api.helius.xyz/v0/transactions?api-key=${process.env['HELIUS_API_KEY']}`;
      const hResp = await fetch(heliusUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: [signature] }),
      });
      if (!hResp.ok) {
        const msg = await hResp.text();
        return res.status(502).json({ error: `Helius ${hResp.status}: ${msg}` });
      }
      const heliusJson = await hResp.json();
      if (!Array.isArray(heliusJson) || heliusJson.length === 0) {
        return res.status(404).json({ error: "No transaction found" });
      }
      const tx = heliusJson[0];

      // 2) when
      const tsSec = (tx?.timestamp ?? tx?.blockTime ?? tx?.parsed?.timestamp) ?? Math.floor(Date.now() / 1000);
      const when = formatWhenFromSeconds(tsSec, tz);

      // 3) facts (ground truth numbers)
      const facts = computeFacts(tx);

      const mints = collectMints(tx);
      const mintsMeta = await fetchMintMetadata(mints, process.env['HELIUS_API_KEY']!);

      // 4) prompts
      const SYSTEM = `
You are a Solana transaction explainer for normies.

OUTPUT CONTRACT
- Respond with a single JSON object ONLY, no prose or extra text.
- Fields:
  - "explainer": string  // 1–2 short sentences, plain English
  - "keypoints": string[]  // 2–4 concise factual bullet points
  - "when": string  // use the provided "when" exactly as-is
- If a field's data is unavailable (except "when"), OMIT that field. Never invent.

FACTS PRECEDENCE
- You are given an object called "facts". Use the numbers from "facts" EXACTLY as provided; do NOT recompute them from "tx".
- If a number is missing from "facts", you may compute it from "tx" strictly by the conversion rules below. If unsure, omit.

STYLE & PRIVACY
- Simple, non-technical language. No emojis. No advice. No speculation or guesses.
- Prefer program/protocol NAMES over addresses (e.g., "Jupiter", "Drift", "Tensor", "Pump.fun").
- Do NOT display full addresses. If unavoidable, redact: abcd…wxyz.
- Always state the exact number of wallets when derivable (e.g., "to 5 wallets", "between two wallets"). If not derivable, omit.
- Avoid raw mint addresses. If unavoidable, redact to abcd…wxyz.

CONVERSIONS & FORMATTING
- SOL: lamports ÷ 1e9. SPL tokens: divide raw by 10^[decimals] only if decimals are provided.
- Never scale by 1e6 for SOL.
- Trim insignificant zeros. Show small fees with up to 6 decimals.
- Do not output USD or PnL unless explicitly present.

CLASSIFICATION
- If tx.type === "SWAP" OR events.swap exists OR facts.swap exists OR facts.program ∈ {"Jupiter","Orca","Raydium","Pump.fun"}, describe it as a "swap" (not a "transfer").
- Only call it a "transfer" when there is no swap signal and only native SOL moved.
- Mention the received tokens and sent tokens if available.

REQUIRED CONTENT (when available)
- If facts.program exists, explicitly say "on {facts.program}" or "via {facts.program}".
- Always include the exact fee from facts.feeSol (≤ 6 decimals).
- If facts.walletCount exists, include "Involved {facts.walletCount} wallets overall".
- If facts.swap exists:
  • Use trader-centric amounts: input = what the fee payer sent, output = what the fee payer received.  
  • Never recompute; echo values from facts/byMint/swap exactly.
- If facts.ata.created is true, add: "Created a new associated token account".
- If facts.ata.closed is true, add: "Closed a temporary token account".

TOKEN NAMING
- You are given "mintsMeta", a map from mint → { symbol?, name? }.
- When referring to a token, prefer symbol (e.g., "USDC"); if missing, use name; if neither, say "an unknown token" without inventing.
- For the SOL wrapped mint (So111…1112), use "wSOL" or "Wrapped SOL". For native SOL, say "SOL".
- Do not guess ticker symbols. Use only what is in "mintsMeta".

PROGRAM NAMING (HUMANIZED)
- Use human-readable names when source/program fields indicate them:
  JUPITER→Jupiter, ORCA→Orca, RAYDIUM→Raydium, DRIFT→Drift, TENSOR→Tensor,
  MAGIC_EDEN→Magic Eden, PUMPFUN/PUMP_FUN→Pump.fun, METAPLEX→Metaplex,
  ATokenGPv…→Associated Token Account (token account creation), Tokenkeg…→SPL Token Program,
  System program→native SOL transfer, ComputeBudget…→Compute budget
- Never echo raw internal labels like "program_transfer" or "instruction_0".

EVENT INTERPRETATION
- Use only facts present. Focus on the main action(s) in 1–2 sentences.
- If facts.ata.created, you may include a keypoint like "Created a new associated token account".
- If facts.ata.closed, you may include "Closed a temporary token account".
- If facts.ata.createdCount > 0, say "Created {count} associated token account(s)".
- If both recipient count and total wallets are known, prefer: "to N wallets" and "M wallets interacted overall".
- Keypoints are short factual fragments (counts, fees, program names, per-recipient drops).

STRICTNESS
- Never alter numbers, symbols, or names.
- Never output anything other than the JSON object.
- If nothing recognizable, return minimal JSON with a cautious explainer and any certain facts (e.g., fee, when).
`.trim();

      const USER = `
Summarize this Solana transaction. Use the provided "when" verbatim.
Avoid addresses (redact if unavoidable). Prefer program names. State exact wallet counts if derivable.
`.trim();

      // 5) OpenAI
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: USER },
              // Pass data. If your SDK doesn't support typed parts, send a single string with
              // plain JSON (not escaped). Otherwise prefer the structured part as below:
              { type: "text", text: JSON.stringify({ tx, when, facts, mintsMeta }) },
            ],
          },
        ],
      });

      console.log(JSON.parse(ai.choices?.[0]?.message?.content || "{}"));

      const raw = ai.choices?.[0]?.message?.content?.trim() || "{}";
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = { explainer: raw, when }; }

      // 6) guard shape
      const safe = coerceModelOutput(parsed, when);
      return res.json(safe);
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e?.message || "server error" });
    }
}
