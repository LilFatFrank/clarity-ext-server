import { Facts } from "../types/facts.js";
import { WSOL_MINT } from "./mints.js";

// ---------- helpers ----------
export function formatWhenFromSeconds(epochSeconds: number, tz: string) {
  const date = new Date(epochSeconds * 1000);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {} as Record<string, string>);
  return `${parts["month"]} ${parts["day"]}, ${parts["year"]} ${parts["hour"]}:${parts["minute"]}`;
}

export function coerceModelOutput(raw: any, fallbackWhen?: string) {
  const out: any = {};
  if (raw && typeof raw.explainer === "string") out.explainer = raw.explainer;
  if (raw && Array.isArray(raw.keypoints))
    out.keypoints = raw.keypoints.slice(0, 4).map(String);
  out.when = raw && typeof raw.when === "string" ? raw.when : fallbackWhen;
  return out;
}

export function jupTerminalBuyUrl(quoteMint: string) {
  // SOL -> token
  return `https://terminal.jup.ag/swap/SOL-${quoteMint}`;
}
export function jupTerminalSellUrl(baseMint: string) {
  // token -> SOL
  return `https://terminal.jup.ag/swap/${baseMint}-SOL`;
}

/**
 * Pick exactly ONE primary mint from facts.byMint (fee-payer centric).
 *
 * Rules:
 * - If any non-stable, non-wSOL token participated (sent/recv) → pick the most active one.
 * - Else, if only stables participated (with/without SOL) → pick the most active stable.
 * - Else → undefined (no CTA).
 *
 * “Most active” = highest (sent + recv).
 */
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLES = new Set([USDC_MINT, USDT_MINT]);

export const isStable = (m?: string) => !!m && STABLES.has(m);
export const isBuyable = (m?: string) => !!m && m !== WSOL_MINT;

export function pickPrimaryMintOne(facts: Facts): string | undefined {
  // 1) Swap outputs (prefer non-stable)
  const fromSwapOutputs =
    rankMints(
      (facts?.swap?.outputTokens ?? []).map((t) => ({
        mint: t.mint,
        score: Number(t.amount || 0),
      })),
      /*allowStables*/ false
    ) ||
    rankMints(
      (facts?.swap?.outputTokens ?? []).map((t) => ({
        mint: t.mint,
        score: Number(t.amount || 0),
      })),
      /*allowStables*/ true
    );
  if (fromSwapOutputs) return fromSwapOutputs;

  // 2) Swap inputs (prefer non-stable)
  const fromSwapInputs =
    rankMints(
      (facts?.swap?.inputTokens ?? []).map((t) => ({
        mint: t.mint,
        score: Number(t.amount || 0),
      })),
      /*allowStables*/ false
    ) ||
    rankMints(
      (facts?.swap?.inputTokens ?? []).map((t) => ({
        mint: t.mint,
        score: Number(t.amount || 0),
      })),
      /*allowStables*/ true
    );

  if (fromSwapInputs) return fromSwapInputs;

  // 3) byMint fallback (sent+recv per mint)
  const byMint = facts?.byMint || {};
  const pairs = Object.entries(byMint).map(([mint, agg]: [string, any]) => ({
    mint,
    score: Number(agg?.sent || 0) + Number(agg?.recv || 0),
  }));

  const fromByMint =
    rankMints(pairs, /*allowStables*/ false) ||
    rankMints(pairs, /*allowStables*/ true);
  return fromByMint ?? undefined;
}

/** Rank helper: returns top mint by score, filtering wSOL and (optionally) stables. */
function rankMints(
  items: { mint: string; score: number }[],
  allowStables: boolean
): string | undefined {
  const pool = items
    .filter((i) => isBuyable(i.mint) && i.score > 0)
    .filter((i) => (allowStables ? true : !isStable(i.mint)));

  if (pool.length === 0) return undefined;
  pool.sort((a, b) => b.score - a.score);
  return pool[0]?.mint;
}

/** True if there was any SPL token movement (excludes pure native SOL tx). */
export const hasSwapOrMint = (tx: any) =>
  String(tx?.type || "").toUpperCase() === "SWAP" ||
  !!tx?.events?.swap ||
  (Array.isArray(tx?.tokenTransfers) &&
    tx.tokenTransfers.some((t: any) => Number(t?.tokenAmount || 0) > 0));
