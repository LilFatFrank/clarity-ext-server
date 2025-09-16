import { Response as Tx } from "../types/response";

const asArr = <T>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : []);
const LAMPORTS_PER_SOL = 1_000_000_000;

function canonicalProgramName(src?: string): string {
    if (!src) return "Unknown";
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
        SYSTEM_PROGRAM: "System program",
        SOLANA_PROGRAM_LIBRARY: "SPL Token Program",
    };
    return map[up] ?? src;
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
    }
    topPrograms: Array<{ program: string; count: number }>;
    topProgramShare: number; // 0..1
    uniqueCounterparties: number;
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
 * - Top programs: always top 5; drops "Unknown" by default
 * - Counterparties: excludes program IDs and any address that’s a token account (ATA)
 */
export function computeWalletInsights(txs: Tx[], tz: string, opts: InsightsOpts = {}): WalletInsights {
    const { mainWallet, dropUnknownFromTop = true } = opts;

    const list = asArr(txs);
    const totalTx = list.length;

    let success = 0;
    let failed = 0;
    let feeLamports = 0;

    const typeCounts = { swap: 0, transfer: 0, other: 0 };
    const programCounts: Record<string, number> = Object.create(null);
    const hourBuckets = new Array(24).fill(0);
    const counterparties = new Set<string>();

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

    for (const tx of list) {
        const ok = !tx?.transactionError;
        if (ok) success++;
        else failed++;

        feeLamports += tx?.fee ?? 0;

        // classify type
        const t = String(tx?.type ?? "").toUpperCase();
        if (t === "SWAP") typeCounts.swap++;
        else if (t === "TRANSFER") typeCounts.transfer++;
        else typeCounts.other++;

        // count programs
        const program = canonicalProgramName(String(tx?.source ?? "Unknown"));
        programCounts[program] = (programCounts[program] ?? 0) + 1;

        // hourly activity
        const tsMs = (tx?.timestamp ? Number(tx.timestamp) : 0) * 1000;
        if (tsMs > 0) {
            const hourStr =
                new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false })
                    .formatToParts(new Date(tsMs))
                    .find(p => p.type === "hour")?.value ?? "0";
            const hour = Math.max(0, Math.min(23, Number(hourStr) || 0));
            hourBuckets[hour] += 1;
        }

        // count unique counterparties (exclude program IDs, token accounts, and optional main wallet)
        for (const n of asArr(tx?.nativeTransfers)) {
            const { fromUserAccount, toUserAccount } = n || {};
            if (fromUserAccount && !SYSVARS_OR_PROGRAMS.has(fromUserAccount) && !tokenAccounts.has(fromUserAccount) && fromUserAccount !== mainWallet)
                counterparties.add(fromUserAccount);
            if (toUserAccount && !SYSVARS_OR_PROGRAMS.has(toUserAccount) && !tokenAccounts.has(toUserAccount) && toUserAccount !== mainWallet)
                counterparties.add(toUserAccount);
        }
        for (const tkn of asArr(tx?.tokenTransfers)) {
            const { fromUserAccount, toUserAccount } = tkn || {};
            if (fromUserAccount && !SYSVARS_OR_PROGRAMS.has(fromUserAccount) && !tokenAccounts.has(fromUserAccount) && fromUserAccount !== mainWallet)
                counterparties.add(fromUserAccount);
            if (toUserAccount && !SYSVARS_OR_PROGRAMS.has(toUserAccount) && !tokenAccounts.has(toUserAccount) && toUserAccount !== mainWallet)
                counterparties.add(toUserAccount);
        }
    }

    // top programs (drop "Unknown" if requested)
    let progArr = Object.entries(programCounts)
        .filter(([, c]) => (c ?? 0) > 0)
        .sort((a, b) => b[1] - a[1]);

    if (dropUnknownFromTop) {
        const cleaned = progArr.filter(([name]) => name.toLowerCase() !== "unknown");
        if (cleaned.length) progArr = cleaned;
    }

    const topPrograms = progArr.slice(0, 5).map(([program, count]) => ({ program, count }));
    const topProgramShare = totalTx > 0 && topPrograms.length > 0 ? (topPrograms[0]?.count ?? 0) / totalTx : 0;

    // hours window auto-size
    const windowSize = totalTx >= 50 ? 6 : totalTx >= 30 ? 4 : 3;
    const roll = bestRollingWindow(hourBuckets, windowSize);

    const feeSol = feeLamports / LAMPORTS_PER_SOL;

    const swapPct = totalTx ? (typeCounts.swap / totalTx) * 100 : 0;
    const transferPct = totalTx ? (typeCounts.transfer / totalTx) * 100 : 0;
    const otherPct = totalTx ? (typeCounts.other / totalTx) * 100 : 0;

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
        uniqueCounterparties: counterparties.size,
        activeHours: {
            bestStartHour: roll.start,
            bestEndHour: roll.end,
            windowSize,
            countInWindow: roll.sum,
            label: windowLabel(roll.start, windowSize, tz),
        },
    };
}
