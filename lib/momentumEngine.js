// lib/momentumEngine.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normPct(pct, maxAbs = 30) {
  const x = clamp(pct, -maxAbs, maxAbs);
  return ((x + maxAbs) / (2 * maxAbs)) * 100;
}

export function computeLiquidity({ volumeUsd, marketCapUsd }) {
  const vol = Math.max(0, Number(volumeUsd) || 0);
  const mcap = Math.max(0, Number(marketCapUsd) || 0);

  const volToMcap = mcap > 0 ? vol / mcap : 0;

  const absVolScore = clamp(Math.log10(vol + 1) * 12, 0, 60);
  const turnoverScore = clamp(volToMcap * 5000, 0, 40);

  const liquidityScore = clamp(absVolScore + turnoverScore, 0, 100);

  let liquidityStrength = "Low";
  if (liquidityScore > 70) liquidityStrength = "High";
  else if (liquidityScore > 40) liquidityStrength = "Medium";

  return { liquidityScore, liquidityStrength };
}

export function computeMomentum(asset) {
  const change24 = Number(asset.change24h ?? 0);
  const change7 = Number(asset.change7d ?? 0);

  const { liquidityScore, liquidityStrength } = computeLiquidity(asset);

  const momentum24 = normPct(change24);
  const momentum7 = normPct(change7);

  // Weighted momentum
  const momentumScore = momentum24 * 0.4 + momentum7 * 0.6;

  // Liquidity weighting (small influence)
  const score = clamp(momentumScore * 0.85 + liquidityScore * 0.15, 0, 100);

  let confidence = { label: "Low" };

  if (liquidityStrength === "High" && score > 55) {
    confidence = { label: "High" };
  } else if (liquidityStrength !== "Low") {
    confidence = { label: "Medium" };
  }

  return {
    score: Math.round(score),
    confidence,
    liquidityStrength,
    volatility: Math.abs(change24)
  };
}