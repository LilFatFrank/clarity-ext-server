// ---- types you already have ----
// import { Response, Source, Type } from "./types"; // adjust path as needed

import { Facts } from "../types/facts";
import { Response } from "../types/response";
import { Source } from "../types/sources";
import { Type } from "../types/types";
import { WSOL_MINT } from "./mints";

// ---- helpers ---------------------------------------------------------------
const asArr = <T>(x: T[] | undefined | null): T[] =>
  Array.isArray(x) ? x : [];

const SYSVARS_OR_PROGRAMS = new Set([
  "11111111111111111111111111111111", // System
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
]);

const LAMPORTS_PER_SOL = 1_000_000_000;
const lamportsToSol = (n: number | string | undefined) =>
  (typeof n === "number" ? n : Number(n || 0)) / LAMPORTS_PER_SOL;

function canonicalProgramName(src?: Source | string) {
  if (!src) return undefined;
  const up = String(src).toUpperCase();
  const map: Record<string, string> = {
    JUPITER: "Jupiter",
    ORCA: "Orca",
    RAYDIUM: "Raydium",
    DRIFT: "Drift",
    TENSOR: "Tensor",
    MAGIC_EDEN: "Magic Eden",
    MAGICEDEN: "Magic Eden",
    PUMPFUN: "Pump.fun",
    PUMP_FUN: "Pump.fun",
    PUMP_AMM: "Pump.fun",
    METAPLEX: "Metaplex",
    SOLANA_PROGRAM_LIBRARY: "SPL Token Program",
    SYSTEM_PROGRAM: "System program",
  };
  return map[up] ?? String(src);
}

function isSolMint(mint?: string) {
  return mint === "So11111111111111111111111111111111111111112";
}

function countWallets(tx: Response): number {
  const s = new Set<string>();
  const fp = tx.feePayer;
  if (fp) s.add(fp);

  // collect all token account pubkeys so we can exclude them from native “wallets”
  const tokenAccounts = new Set<string>();
  for (const t of asArr(tx.tokenTransfers)) {
    if (t?.fromUserAccount) s.add(t.fromUserAccount);
    if (t?.toUserAccount) s.add(t.toUserAccount);
    if (t?.fromTokenAccount) tokenAccounts.add(t.fromTokenAccount);
    if (t?.toTokenAccount) tokenAccounts.add(t.toTokenAccount);
  }

  for (const n of asArr(tx.nativeTransfers)) {
    const from = n?.fromUserAccount;
    const to = n?.toUserAccount;
    if (from && !tokenAccounts.has(from) && !SYSVARS_OR_PROGRAMS.has(from))
      s.add(from);
    if (to && !tokenAccounts.has(to) && !SYSVARS_OR_PROGRAMS.has(to)) s.add(to);
  }
  return s.size;
}

function detectAtaHints(tx: Response) {
  let created = false,
    closed = false;

  const scan = (ix: any) => {
    const pid = ix?.programId || "";
    if (pid === "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") created = true;
    if (
      pid === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
      ix?.data === "A"
    )
      closed = true;
  };

  for (const ix of asArr(tx.instructions)) {
    scan(ix);
    for (const inner of asArr(ix.innerInstructions)) scan(inner);
  }
  return { created, closed };
}

/** Compute ground-truth numerics; model must echo these verbatim. */
export function computeFacts(tx: Response): Facts {
  const facts: Facts = {};
  const programName = canonicalProgramName(tx.source);
  if (programName) facts.program = programName;

  const ata = detectAtaHints(tx);
  if (ata.created || ata.closed) facts.ata = ata;
  const fp = tx.feePayer;

  const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

  const instrs = Array.isArray((tx as any).instructions)
    ? (tx as any).instructions
    : [];
  facts.ata = {
    createdCount: instrs.filter((i: any) => i?.programId === ATA_PROGRAM)
      .length,
    created: instrs.some((i: any) => i?.programId === ATA_PROGRAM),
    // Common ATA close refund is 2_039_280 lamports; credit often returns to the fee payer.
    closed: asArr(tx.nativeTransfers).some(
      (nt: any) => nt?.amount === 2_039_280 && nt?.toUserAccount === tx.feePayer
    ),
    closedCount: asArr(tx.nativeTransfers).filter(
      (nt: any) => nt?.amount === 2_039_280 && nt?.toUserAccount === tx.feePayer
    ).length,
  };

  // Optional but helpful default for wording:
  if (facts.swap && !(facts as any).swap.view)
    (facts as any).swap.view = "trader";

  // counts
  facts.walletCount = countWallets(tx);
  const tts = asArr(tx.tokenTransfers);
  facts.tokenTransferCount = tts.length;

  // native totals (all lamports moved in tx, including PDAs)
  let nativeTotalLamports = 0;
  const freq: Record<number, number> = {};
  for (const n of asArr(tx.nativeTransfers)) {
    nativeTotalLamports += n?.amount || 0;
    if (typeof n?.amount === "number") {
      freq[n.amount] = (freq[n.amount] || 0) + 1;
    }
  }
  facts.nativeTotalSol = nativeTotalLamports / LAMPORTS_PER_SOL;

  // ATA-funding heuristic: the most frequent native amount
  let commonAmt = 0,
    commonCnt = 0;
  for (const [k, c] of Object.entries(freq)) {
    const amt = Number(k);
    if (c > commonCnt) {
      commonCnt = c;
      commonAmt = amt;
    }
  }
  if (commonAmt > 0) facts.commonPerRecipientSol = commonAmt / LAMPORTS_PER_SOL;

  // fee
  facts.feeSol = (tx.fee || 0) / LAMPORTS_PER_SOL;

  // per-mint deltas relative to feePayer (already decimalized in tokenTransfers)
  const byMint: NonNullable<Facts["byMint"]> = {};
  for (const t of tts) {
    if (!t?.mint) continue;
    byMint[t.mint] ||= { sent: 0, recv: 0 };
    const amt = Number(t.tokenAmount || 0);
    if (fp && t?.fromUserAccount === fp) byMint[t.mint]!.sent += amt;
    if (fp && t?.toUserAccount === fp) byMint[t.mint]!.recv += amt;
  }
  facts.byMint = byMint;

  // ---- replace BOTH of your swap blocks with this single block ----
if (tx.type === Type.SWAP || tx.events?.swap) {
  // Did the fee payer actually move any SPL (non-wSOL)?
  const fpHasSpl = Object.entries(facts.byMint || {}).some(
    ([mint, v]: any) => mint !== WSOL_MINT && ((v.sent || 0) + (v.recv || 0)) > 0
  );

  // Participants (context)
  facts.participants = {
    recipients: facts.airdrop?.recipientCount ?? 0,
    totalWallets: facts.walletCount ?? 0,
  };

  if (!fpHasSpl) {
    // AMBIENT: fee payer only paid native/ATA; tokens moved between other wallets
    const routeTotals: Record<string, number> = {};
    for (const t of Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : []) {
      if (!t?.mint) continue;
      const amt = Number(t.tokenAmount || 0);
      if (!amt) continue;
      routeTotals[t.mint] = (routeTotals[t.mint] || 0) + amt;
    }

    const routeOutputs = Object.entries(routeTotals)
      .filter(([mint]) => mint !== WSOL_MINT)
      .map(([mint, amount]) => ({ mint, amount: Number(amount) }));

    facts.swap = {
      inputTokens: [],
      outputTokens: [],
      view: "ambient" as const,
      routeOutputs,
      routeSol: Number(routeTotals[WSOL_MINT] || 0),
      ...(facts.program ? { program: facts.program } : {}),
    };
  } else {
    // TRADER: fee payer actually swapped
    const out: NonNullable<Facts["swap"]> = { inputTokens: [], outputTokens: [] };
    if (facts.program) out.program = facts.program;
    (out as any).view = "trader";

    // Build net deltas for fee payer (recv - sent)
    const netByMint: Record<string, number> = {};
    for (const [mint, agg] of Object.entries(facts.byMint || {})) {
      const net = (agg.recv || 0) - (agg.sent || 0);
      const eps = mint === WSOL_MINT ? 1e-9 : 1e-6; // ignore routing dust
      if (Math.abs(net) > eps) netByMint[mint] = net;
    }

    for (const [mint, net] of Object.entries(netByMint)) {
      if (mint === WSOL_MINT) {
        if (net < 0) out.inputSol = (out.inputSol ?? 0) + Math.abs(net);
        else if (net > 0) (out as any).outputSol = ((out as any).outputSol ?? 0) + net;
      } else if (net > 0) {
        out.outputTokens!.push({ mint, amount: net });
      } else {
        out.inputTokens!.push({ mint, amount: Math.abs(net) });
      }
    }

    // Prefer exact native lamports input from events.swap if present
    const ev = tx.events?.swap;
    const nativeInSol = (typeof ev?.nativeInput?.amount === "number"
      ? ev.nativeInput.amount
      : Number(ev?.nativeInput?.amount || 0)) / 1_000_000_000;
    if (nativeInSol > 0) out.inputSol = (out.inputSol ?? 0) + nativeInSol;

    facts.swap = out;
  }

  // set a context flag once here
  (facts as any).context = {
    ...(facts as any).context,
    feePayerOnlyNative: !fpHasSpl,
  };
}


  // airdrop / multisend: uniform sends from feePayer, single mint, >1 recipients
  if (tx.type === Type.TRANSFER && tts.length > 1 && fp) {
    let sameMint = true;
    let mint0: string | undefined;
    const recipients = new Set<string>();
    const amountFreq: Record<string, number> = {};
    let totalSent = 0;

    for (const t of tts) {
      if (t.fromUserAccount !== fp) {
        sameMint = false;
        break;
      }
      if (!mint0) mint0 = t.mint;
      if (t.mint !== mint0) {
        sameMint = false;
        break;
      }
      recipients.add(t.toUserAccount);
      const amt = Number(t.tokenAmount || 0);
      totalSent += amt;
      amountFreq[String(amt)] = (amountFreq[String(amt)] || 0) + 1;
    }

    if (sameMint && mint0 && recipients.size > 1) {
      let dominant: number | undefined,
        domCnt = 0;
      for (const [k, c] of Object.entries(amountFreq)) {
        const v = Number(k);
        if (c > domCnt) {
          domCnt = c;
          dominant = v;
        }
      }
      facts.airdrop = {
        mint: mint0,
        recipientCount: recipients.size,
        total: totalSent,
      };
      if (dominant !== undefined) facts.airdrop.perRecipient = dominant;
    }
  }

  // swap: prefer events.swap; fallback to byMint + SOL/wSOL deltas
  if (tx.type === Type.SWAP || tx.events?.swap) {
  const out: NonNullable<Facts["swap"]> = { inputTokens: [], outputTokens: [] };
  if (facts.program) out.program = facts.program;
  (out as any).view = "trader";

  // 1) Build net deltas from byMint (recv - sent) for the fee payer.
  const netByMint: Record<string, number> = {};
  for (const [mint, agg] of Object.entries(facts.byMint || {})) {
    const net = (agg.recv || 0) - (agg.sent || 0);
    // Ignore tiny routing dust (helius decimals: 1e-6 for SPL, 1e-9 for SOL)
    const eps = isSolMint(mint) ? 1e-9 : 1e-6;
    if (Math.abs(net) > eps) netByMint[mint] = net;
  }

  // 2) Classify: net<0 => input; net>0 => output. Treat wSOL as SOL.
  for (const [mint, net] of Object.entries(netByMint)) {
    if (isSolMint(mint)) {
      if (net < 0) out.inputSol = (out.inputSol ?? 0) + Math.abs(net);
      else if (net > 0) (out as any).outputSol = ((out as any).outputSol ?? 0) + net;
      continue;
    }
    if (net > 0) out.outputTokens!.push({ mint, amount: net });
    else out.inputTokens!.push({ mint, amount: Math.abs(net) });
  }

  // 3) If events.swap has exact native lamports input, prefer adding it.
  const ev = tx.events?.swap;
  const nativeInSol = lamportsToSol(ev?.nativeInput?.amount);
  if (nativeInSol > 0) out.inputSol = (out.inputSol ?? 0) + nativeInSol;

  // Participants (optional context)
  facts.participants = {
    recipients: facts.airdrop?.recipientCount ?? 0,
    totalWallets: facts.walletCount ?? 0,
  };

  facts.swap = out;
}

  return facts;
}
