export const WSOL_MINT = "So11111111111111111111111111111111111111112";

type MintMeta = {
  symbol?: string;
  name?: string;
  image?: string;
};
type MintMetaMap = Record<string, MintMeta>;

/** Collect unique mints from tokenTransfers + swap event (if present). */
export function collectMints(tx: any): string[] {
  const s = new Set<string>();
  for (const t of Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : []) {
    if (t?.mint) s.add(t.mint);
  }
  const ev = tx?.events?.swap;
  for (const o of Array.isArray(ev?.tokenOutputs) ? ev.tokenOutputs : []) {
    if (o?.mint) s.add(o.mint);
  }
  for (const i of Array.isArray(ev?.tokenInputs) ? ev.tokenInputs : []) {
    if (i?.mint) s.add(i.mint);
  }
  return [...s];
}

/** Safe getter for DAS asset metadata fields (supports common shapes). */
export function extractMintMeta(asset: any): MintMeta {
  const md = asset?.content?.metadata || {};
  const name = (md?.name || asset?.token_info?.name || "").trim() || undefined;
  const symbol = (md?.symbol || asset?.token_info?.symbol || "").trim() || undefined;

  // try common image spots; add more fallbacks if needed
  const image =
    asset?.content?.links?.image ||
    (Array.isArray(asset?.content?.files) && asset.content.files[0]?.uri) ||
    undefined;

  return { name, symbol, image };
}

/** Fetch token metadata from Helius DAS getAssetBatch for given mints. */
export async function fetchMintMetadata(mints: string[], apiKey: string): Promise<MintMetaMap> {
  const ids = Array.from(new Set(mints.filter((m) => m && m !== WSOL_MINT)));
  if (ids.length === 0) {
    // just return WSOL mapping if needed
    return { [WSOL_MINT]: { symbol: "wSOL", name: "Wrapped SOL" } };
  }

  const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const body = {
    jsonrpc: "2.0",
    id: "vizor",
    method: "getAssetBatch",
    params: { ids },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`DAS ${resp.status}: ${await resp.text()}`);
    const json = await resp.json();
    const assets = Array.isArray(json?.result) ? json.result : [];

    const out: MintMetaMap = {};
    for (const a of assets) {
      const id = a?.id || a?.mint;
      if (!id) continue;
      out[id] = extractMintMeta(a);
    }

    // Always include a friendly label for wSOL
    out[WSOL_MINT] ||= { symbol: "wSOL", name: "Wrapped SOL" };
    return out;
  } catch (e) {
    console.warn("getAssetBatch failed; continuing without token metadata", e);
    // graceful fallback; still provide wSOL
    return { [WSOL_MINT]: { symbol: "wSOL", name: "Wrapped SOL" } };
  }
}
