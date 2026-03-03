// lib/regime.js

export function classifyRegime({ score, volatility, priceChange7d }) {
  // volatility here is a simple “riskiness” proxy (0..100-ish)
  const volHigh = volatility >= 22; // tuned for crypto; adjust as needed
  const volExtreme = volatility >= 35;

  if (score >= 70 && !volExtreme) return "Risk-On";
  if (score <= 40) return "Risk-Off";

  // Additional guardrail: high vol + negative trend = risk-off bias
  if (volHigh && (priceChange7d ?? 0) < 0) return "Risk-Off";

  return "Neutral";
}