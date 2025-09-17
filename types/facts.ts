export interface Facts {
  program?: string; // human name
  walletCount?: number;
  tokenTransferCount?: number;
  ata?: { created: boolean; closed: boolean; createdCount?: number; closedCount?: number };

  // totals
  nativeTotalSol?: number; // total native lamports moved → SOL
  commonPerRecipientSol?: number; // ATA funding heuristic

  // fees
  feeSol?: number;

  // airdrop pattern (uniform sends)
  airdrop?: {
    mint: string;
    perRecipient?: number; // already decimalized
    recipientCount: number;
    total: number; // sum of per-recipient if uniform, else sum of sends
  };

  // swap netting (user-centric)
  swap?: {
    program?: string;
    inputSol?: number; // user SOL/wSOL spent
    inputTokens?: { mint: string; amount: number }[];
    outputTokens?: { mint: string; amount: number }[];
    view?: "trader" | "ambient";
    routeOutputs?: { mint: string; amount: number }[];
    routeSol?: number;
  };

  participants?: {
    recipients?: number;
    totalWallets?: number;
  };

  // per-mint deltas w.r.t feePayer (decimalized)
  byMint?: Record<string, { sent: number; recv: number; decimals?: number }>;
}
