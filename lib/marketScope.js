// lib/marketScope.js

export const MARKET_SCOPE_POLICY = {
  // Default = Curated Market
  defaultMaxRank: 250, // adjust to 300 if you want
  min24hVolumeUSD: 2_000_000,
  minMarketCapUSD: 25_000_000,
  minVolToMcapRatio: 0.0025, // 0.25% daily turnover baseline
  excludeStablecoins: true,

  // Premium toggle flips this
  allowSpeculativeMode: false,
};

const STABLE_SYMBOLS = new Set([
  "usdt",
  "usdc",
  "dai",
  "busd",
  "tusd",
  "usdp",
  "fdusd",
  "frax",
  "lusd",
  "ust",
  "ustc",
  "susd",
  "usde",
  "crvusd",
]);

function isStablecoinLike(asset) {
  const sym = (asset.symbol || "").toLowerCase();
  const name = (asset.name || "").toLowerCase();

  if (STABLE_SYMBOLS.has(sym)) return true;
  if (name.includes("usd") && (name.includes("stable") || name.includes("tether") || name.includes("coin"))) {
    return true;
  }
  // Heuristic: if symbol ends with "usd" and is known stable-ish.
  if (sym.endsWith("usd") && sym.length <= 6) return true;
  return false;
}

export function applyMarketScopePolicy(rawAssets, policy = MARKET_SCOPE_POLICY) {
  const maxRank = policy.allowSpeculativeMode ? Math.max(policy.defaultMaxRank, 500) : policy.defaultMaxRank;

  return rawAssets
    .filter((a) => {
      const rank = a.market_cap_rank ?? Number.POSITIVE_INFINITY;
      const vol = a.total_volume ?? 0;
      const mcap = a.market_cap ?? 0;

      if (rank > maxRank) return false;

      if (policy.excludeStablecoins && !policy.allowSpeculativeMode) {
        if (isStablecoinLike(a)) return false;
      }

      // obvious dead / junk guardrails
      if (!Number.isFinite(mcap) || mcap <= 0) return false;
      if (!Number.isFinite(vol) || vol <= 0) return false;
      if (mcap < policy.minMarketCapUSD && !policy.allowSpeculativeMode) return false;
      if (vol < policy.min24hVolumeUSD && !policy.allowSpeculativeMode) return false;

      const volToMcap = mcap > 0 ? vol / mcap : 0;
      if (volToMcap < policy.minVolToMcapRatio && !policy.allowSpeculativeMode) return false;

      return true;
    })
    .slice(0, maxRank); // keep deterministic size
}