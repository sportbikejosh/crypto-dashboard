// lib/momentumEngine.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normPct(pct, maxAbs = 30) {
  // Map percent changes roughly into 0..100
  const x = clamp(pct, -maxAbs, maxAbs);
  return ((x + maxAbs) / (2 * maxAbs)) * 100;
}

export function computeLiquidity({ volumeUsd, marketCapUsd }) {
  const vol = Math.max(0, Number(volumeUsd) || 0);
  const mcap = Math.max(0, Number(marketCapUsd) || 0);

  const volToMcap = mcap > 0 ? vol / mcap : 0;

  // Score favors both absolute volume and turnover
  const absVolScore = clamp(Math.log10(vol + 1) * 12, 0, 60); // 0..~60
  const turnoverScore = clamp(volToMcap * 5000, 0, 40); // 0..40 (0.8% turnover ~= 40)

  const liquidityScore = clamp(absVolScore + turnoverScore, 0, 100);

  let liquidityStrength = "Low";
  if (liquidityScore >= 75) liquidityStrength = "High";
  else if (liquidityScore >= 45) liquidityStrength = "Medium";

  return { liquidityScore, liquidityStrength, volToMcap };
}

export function estimateVolatility({ priceChange24h, priceChange7d }) {
  const d1 = Math.abs(Number(priceChange24h) || 0);
  const d7 = Math.abs(Number(priceChange7d) || 0);

  // crude “riskiness” proxy; tuned for crypto behavior
  // keeps values in a human range (roughly 0..60)
  return clamp(d1 * 0.9 + (d7 / 7) * 0.6, 0, 60);
}

export function computeMomentum({
  priceChange24h,
  priceChange7d,
  volumeUsd,
  marketCapUsd,
}) {
  const { liquidityScore, liquidityStrength, volToMcap } = computeLiquidity({
    volumeUsd,
    marketCapUsd,
  });

  const volatility = estimateVolatility({ priceChange24h, priceChange7d });

  // Core components (0..100 each)
  const mom7 = normPct(Number(priceChange7d) || 0, 35);
  const mom1 = normPct(Number(priceChange24h) || 0, 18);

  // turnover signal (0..100)
  const turnoverSignal = clamp(volToMcap * 8000, 0, 100);

  // Volatility penalty (0..100): higher vol reduces score slightly
  const volPenalty = clamp(volatility * 1.8, 0, 100);

  // Weighted score
  const raw =
    mom7 * 0.42 +
    mom1 * 0.28 +
    turnoverSignal * 0.22 +
    (100 - volPenalty) * 0.08;

  const score = clamp(raw, 0, 100);

  let grade = "C";
  if (score >= 80) grade = "A";
  else if (score >= 65) grade = "B";
  else if (score >= 50) grade = "C";
  else if (score >= 35) grade = "D";
  else grade = "F";

  // Confidence: liquidity up, volatility down
  const confidenceRaw = clamp(liquidityScore * 0.65 + (100 - volPenalty) * 0.35, 0, 100);

  let confidence = "Low";
  if (confidenceRaw >= 72) confidence = "High";
  else if (confidenceRaw >= 52) confidence = "Medium";

  return {
    score: Math.round(score),
    grade,
    confidence,
    confidenceRaw: Math.round(confidenceRaw),
    volatility: Math.round(volatility * 10) / 10,

    liquidityScore: Math.round(liquidityScore),
    liquidityStrength,

    breakdown: {
      mom7: Math.round(mom7),
      mom1: Math.round(mom1),
      turnoverSignal: Math.round(turnoverSignal),
      volPenalty: Math.round(volPenalty),
    },
  };
}