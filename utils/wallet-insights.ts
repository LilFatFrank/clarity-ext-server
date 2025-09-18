import { Response as Tx } from "../types/response.js";

const asArr = <T>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : []);
const LAMPORTS_PER_SOL = 1_000_000_000;

const PID_TO_PROTOCOL: Record<string, string> = {
  // Infra (we'll hide later)
  "11111111111111111111111111111111": "System program",
  "ComputeBudget111111111111111111111111111111": "Compute Budget",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Account",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "SPL Token Program",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": "SPL Token-2022",

  // Ecosystem protocols you care about (extend as you see them)
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH": "Pump.fun",
  // "JUPyyy...": "Jupiter",
  // "orca...": "Orca",
  // "rayd...": "Raydium",
  // "drift...": "Drift",
  // "tensor...": "Tensor",
};

const HIDE_PROTOCOLS = new Set<string>([
  "System program",
  "Compute Budget",
  "Associated Token Account",
  "SPL Token Program",
  "SPL Token-2022",
  "Unknown",
]);

function canonicalSourceName(src?: string): string {
  if (!src) return "Unknown";
  const up = src.toUpperCase();
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
    SYSTEM_PROGRAM: "System program",
    SOLANA_PROGRAM_LIBRARY: "SPL Token Program",
    COMPUTE_BUDGET: "Compute Budget",
    ASSOCIATED_TOKEN_ACCOUNT: "Associated Token Account",
  };
  return map[up] ?? "Unknown";
}

function classifyProtocolForTx(tx: Tx): { name: string; pid?: string } | null {
  // 1) Prefer Helius source
  const nameFromSource = canonicalSourceName(tx?.source);
  if (!HIDE_PROTOCOLS.has(nameFromSource) && nameFromSource !== "Unknown") {
    return { name: nameFromSource };
  }

  // 2) Fallback: scan unique programIds in this tx and map to a non-infra protocol
  const seen = new Set<string>();
  for (const ix of asArr(tx?.instructions)) {
    if (!ix?.programId) continue;
    seen.add(ix.programId);
  }
  for (const pid of seen) {
    const maybe = PID_TO_PROTOCOL[pid] || "Unknown";
    if (!HIDE_PROTOCOLS.has(maybe) && maybe !== "Unknown") {
      return { name: maybe, pid };
    }
  }

  // Nothing interesting → treat as Unknown (and we’ll hide it)
  return null;
}

function explorerUrl(programId: string) {
  return `https://solscan.io/account/${programId}`;
}

const SYSVARS_OR_PROGRAMS = new Set<string>([
  "11111111111111111111111111111111", // System Program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
]);

export function bestRollingWindow(
  buckets: number[],
  width: number
): { start: number; end: number; sum: number } {
  const n = buckets.length;
  if (n === 0) return { start: 0, end: 0, sum: 0 };
  const w = Math.max(1, Math.min(width, n));
  const ext = buckets.concat(buckets);

  let sum = 0;
  for (let i = 0; i < w; i++) sum += ext[i] ?? 0;

  let bestStart = 0;
  let bestSum = sum;

  for (let s = 1; s < n; s++) {
    sum += (ext[s + w - 1] ?? 0) - (ext[s - 1] ?? 0);
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = s;
    }
  }
  return { start: bestStart, end: (bestStart + w - 1) % n, sum: bestSum };
}

function hourLabel(h: number, tz: string): string {
  const base = new Date(Date.UTC(2020, 0, 1, h, 0, 0));
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric" }).format(base);
}
function windowLabel(start: number, width: number, tz: string): string {
  const end = (start + width) % 24;
  return `${hourLabel(start, tz)}–${hourLabel(end, tz)}`;
}

export type WalletInsights = {
  totalTx: number;
  success: number;
  failed: number;
  successRate: number; // 0..1
  fee: { totalSol: number; avgSol: number };
  types: {
    swap: { count: number; pct: number };
    transfer: { count: number; pct: number };
    other: { count: number; pct: number };
  };
  topPrograms: Array<{ program: string; programId: string; url: string; count: number }>;
  topProgramShare: number; // 0..1
  uniqueCounterparties: number;
  topCounterparties: Array<{
    address: string;
    url: string;
    txs: number;
    sentTxs?: number;
    recvTxs?: number;
  }>;
  activeHours: {
    bestStartHour: number;
    bestEndHour: number;
    windowSize: number;
    countInWindow: number;
    label: string;
  };
};

type InsightsOpts = {
  /** Exclude this wallet from counterparties if you know it (the owner we’re analyzing). */
  mainWallet?: string;
  /** If true (default), drop “Unknown” from topPrograms and promote next program. */
  dropUnknownFromTop?: boolean;
};

/**
 * Build high-level wallet insights from recent txs.
 * - Rolling window size: <30 → 3h, 30–49 → 4h, ≥50 → 6h
 * - Top programs: top 5 by protocol (from source or known programId map), hides infra
 * - Counterparties: excludes program IDs and any address that’s a token account (ATA)
 */
export function computeWalletInsights(
  txs: Tx[],
  tz: string,
  opts: InsightsOpts = {}
): WalletInsights {
  const { mainWallet, dropUnknownFromTop = true } = opts;

  const list = asArr(txs);
  const totalTx = list.length;

  let success = 0;
  let failed = 0;
  let feeLamports = 0;

  const typeCounts = { swap: 0, transfer: 0, other: 0 };
  const hourBuckets = new Array(24).fill(0);

  // program counts keyed by protocol name (optionally carrying a representative programId)
  const protocolCount: Record<string, { count: number; programId?: string }> = Object.create(null);

  // counterparties map: address → { txs, sentTxs?, recvTxs? }
  const cpMap: Record<string, { txs: number; sentTxs?: number; recvTxs?: number }> = Object.create(null);

  // 1) Build a set of all token accounts seen (from tokenTransfers + accountData.tokenBalanceChanges)
  const tokenAccounts = new Set<string>();
  for (const tx of list) {
    for (const t of asArr(tx?.tokenTransfers)) {
      if (t?.fromTokenAccount) tokenAccounts.add(t.fromTokenAccount);
      if (t?.toTokenAccount) tokenAccounts.add(t.toTokenAccount);
    }
    for (const ad of asArr(tx?.accountData)) {
      for (const ch of asArr(ad?.tokenBalanceChanges)) {
        if (ch?.tokenAccount) tokenAccounts.add(ch.tokenAccount);
      }
    }
  }

  const isCounterparty = (addr?: string) =>
    !!addr &&
    !SYSVARS_OR_PROGRAMS.has(addr) &&
    !tokenAccounts.has(addr) &&
    addr !== mainWallet;

  for (const tx of list) {
    const ok = !tx?.transactionError;
    if (ok) success++; else failed++;

    feeLamports += tx?.fee ?? 0;

    // classify type
    const t = String(tx?.type ?? "").toUpperCase();
    if (t === "SWAP") typeCounts.swap++;
    else if (t === "TRANSFER") typeCounts.transfer++;
    else typeCounts.other++;

    // protocol count (source → protocol, else from programId map)
    const proto = classifyProtocolForTx(tx);
    if (proto) {
      const key = proto.name;
      if (!protocolCount[key]) {
        protocolCount[key] = { count: 0, ...(proto.pid && { programId: proto.pid }) };
      }
      protocolCount[key].count += 1;
    }

    // hourly activity (local tz provided by caller)
    const tsMs = (tx?.timestamp ? Number(tx.timestamp) : 0) * 1000;
    if (tsMs > 0) {
      const hourStr =
        new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false })
          .formatToParts(new Date(tsMs))
          .find((p) => p.type === "hour")?.value ?? "0";
      const hour = Math.max(0, Math.min(23, Number(hourStr) || 0));
      hourBuckets[hour] += 1;
    }

    // counterparties: count at most once per tx per address; track direction vs mainWallet if provided
    const seenCpInThisTx = new Set<string>();

    // Native transfers
    for (const n of asArr(tx?.nativeTransfers)) {
      const from = n?.fromUserAccount;
      const to = n?.toUserAccount;

      if (mainWallet) {
        if (from === mainWallet && isCounterparty(to)) {
          if (!seenCpInThisTx.has(to!)) {
            (cpMap[to!] ||= { txs: 0, sentTxs: 0, recvTxs: 0 }).txs++;
            seenCpInThisTx.add(to!);
          }
          cpMap[to!]!.sentTxs = (cpMap[to!]!.sentTxs ?? 0) + 1;
        } else if (to === mainWallet && isCounterparty(from)) {
          if (!seenCpInThisTx.has(from!)) {
            (cpMap[from!] ||= { txs: 0, sentTxs: 0, recvTxs: 0 }).txs++;
            seenCpInThisTx.add(from!);
          }
          cpMap[from!]!.recvTxs = (cpMap[from!]!.recvTxs ?? 0) + 1;
        }
      } else {
        if (isCounterparty(from) && !seenCpInThisTx.has(from!)) {
          (cpMap[from!] ||= { txs: 0 }).txs++;
          seenCpInThisTx.add(from!);
        }
        if (isCounterparty(to) && !seenCpInThisTx.has(to!)) {
          (cpMap[to!] ||= { txs: 0 }).txs++;
          seenCpInThisTx.add(to!);
        }
      }
    }

    // Token transfers
    for (const tt of asArr(tx?.tokenTransfers)) {
      const from = tt?.fromUserAccount;
      const to = tt?.toUserAccount;

      if (mainWallet) {
        if (from === mainWallet && isCounterparty(to)) {
          if (!seenCpInThisTx.has(to!)) {
            (cpMap[to!] ||= { txs: 0, sentTxs: 0, recvTxs: 0 }).txs++;
            seenCpInThisTx.add(to!);
          }
          cpMap[to!]!.sentTxs = (cpMap[to!]!.sentTxs ?? 0) + 1;
        } else if (to === mainWallet && isCounterparty(from)) {
          if (!seenCpInThisTx.has(from!)) {
            (cpMap[from!] ||= { txs: 0, sentTxs: 0, recvTxs: 0 }).txs++;
            seenCpInThisTx.add(from!);
          }
          cpMap[from!]!.recvTxs = (cpMap[from!]!.recvTxs ?? 0) + 1;
        }
      } else {
        if (isCounterparty(from) && !seenCpInThisTx.has(from!)) {
          (cpMap[from!] ||= { txs: 0 }).txs++;
          seenCpInThisTx.add(from!);
        }
        if (isCounterparty(to) && !seenCpInThisTx.has(to!)) {
          (cpMap[to!] ||= { txs: 0 }).txs++;
          seenCpInThisTx.add(to!);
        }
      }
    }
  }

  // Top programs (hide infra/unknown)
  let programRows = Object.entries(protocolCount)
    .map(([name, { count, programId }]) => ({
      program: name,
      programId: programId || "",
      url: programId ? explorerUrl(programId) : "",
      count,
    }))
    .filter((row) => row.count > 0 && !HIDE_PROTOCOLS.has(row.program))
    .sort((a, b) => b.count - a.count);

  if (dropUnknownFromTop) {
    const cleaned = programRows.filter((r) => r.program.toLowerCase() !== "unknown");
    if (cleaned.length) programRows = cleaned;
  }

  const topPrograms = programRows.slice(0, 5);
  const topProgramShare = totalTx > 0 && topPrograms.length > 0 ? topPrograms[0]!.count / totalTx : 0;

  // Hours window auto-size
  const windowSize = totalTx >= 50 ? 6 : totalTx >= 30 ? 4 : 3;
  const roll = bestRollingWindow(hourBuckets, windowSize);

  const feeSol = feeLamports / LAMPORTS_PER_SOL;

  const swapPct = totalTx ? (typeCounts.swap / totalTx) * 100 : 0;
  const transferPct = totalTx ? (typeCounts.transfer / totalTx) * 100 : 0;
  const otherPct = totalTx ? (typeCounts.other / totalTx) * 100 : 0;

  // Counterparties summary
  const uniqueCounterparties = Object.keys(cpMap).length;
  const topCounterparties = Object.entries(cpMap)
    .map(([address, stats]) => ({
      address,
      url: explorerUrl(address),
      txs: stats.txs,
      ...(mainWallet ? { sentTxs: stats.sentTxs ?? 0, recvTxs: stats.recvTxs ?? 0 } : {}),
    }))
    .sort((a, b) => b.txs - a.txs)
    .slice(0, 10);

  return {
    totalTx,
    success,
    failed,
    successRate: totalTx ? success / totalTx : 0,
    fee: { totalSol: feeSol, avgSol: totalTx ? feeSol / totalTx : 0 },
    types: {
      swap: { count: typeCounts.swap, pct: Number(swapPct.toFixed(2)) },
      transfer: { count: typeCounts.transfer, pct: Number(transferPct.toFixed(2)) },
      other: { count: typeCounts.other, pct: Number(otherPct.toFixed(2)) },
    },
    topPrograms,
    topProgramShare,
    uniqueCounterparties,
    topCounterparties,
    activeHours: {
      bestStartHour: roll.start,
      bestEndHour: roll.end,
      windowSize,
      countInWindow: roll.sum,
      label: windowLabel(roll.start, windowSize, tz),
    },
  };
}
