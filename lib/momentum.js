/**
 * Momentum scoring utilities
 * Decision-support (not prediction)
 * Explainability-first composite score.
 */

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function formatPct(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export function computeMomentumBreakdown(coin) {
  const c24 = Number(coin.price_change_percentage_24h_in_currency ?? 0);
  const c7 = Number(coin.price_change_percentage_7d_in_currency ?? 0);
  const c30 = Number(coin.price_change_percentage_30d_in_currency ?? 0);

  const volatilityProxy = Math.abs(c24 - c7);

  const n24 = clamp(c24, -20, 20);
  const n7 = clamp(c7, -30, 30);
  const n30 = clamp(c30, -50, 50);

  const raw =
    0.45 * n7 +
    0.35 * n24 +
    0.20 * (n30 / 1.5);

  const penalty = clamp(volatilityProxy, 0, 40) * 0.25;

  const scaled = 50 + raw * 1.2 - penalty;
  const score = Math.round(clamp(scaled, 0, 100));

  const drivers = [];
  const trendAligned = (c24 >= 0 && c7 >= 0) || (c24 <= 0 && c7 <= 0);

  if (c7 >= 5) drivers.push(`Strong 7-day trend (${formatPct(c7)}) is supporting momentum.`);
  else if (c7 <= -5) drivers.push(`Weak 7-day trend (${formatPct(c7)}) is dragging momentum.`);
  else drivers.push(`7-day trend is mild (${formatPct(c7)}), so momentum is less decisive.`);

  if (c24 >= 3) drivers.push(`Recent 24h move is positive (${formatPct(c24)}) and adds short-term strength.`);
  else if (c24 <= -3) drivers.push(`Recent 24h move is negative (${formatPct(c24)}) and adds short-term pressure.`);
  else drivers.push(`24h move is small (${formatPct(c24)}), so the short-term signal is muted.`);

  if (Math.abs(c30) >= 15) {
    const direction = c30 >= 0 ? "uptrend" : "downtrend";
    drivers.push(`30-day ${direction} (${formatPct(c30)}) provides broader context.`);
  } else {
    drivers.push(`30-day change is modest (${formatPct(c30)}), suggesting a steadier backdrop.`);
  }

  if (volatilityProxy >= 15) {
    drivers.push(
      `Signals are choppy (24h vs 7d differs by ~${volatilityProxy.toFixed(1)} pts), which reduces confidence.`
    );
  } else {
    drivers.push(`Signals are fairly consistent (24h vs 7d gap ~${volatilityProxy.toFixed(1)} pts).`);
  }

  if (trendAligned) drivers.push("Short-term and 7-day signals point in the same direction (better signal quality).");
  else drivers.push("Short-term and 7-day signals conflict (treat as a lower-quality setup).");

  const whatWouldChange = [];
  if (c7 < 5) whatWouldChange.push("A stronger 7-day trend would raise momentum.");
  if (c24 < 3) whatWouldChange.push("A clean positive 24h move would improve the short-term signal.");
  if (volatilityProxy > 12) whatWouldChange.push("Less choppiness between short-term and 7-day moves would raise confidence.");
  if (c30 < 0) whatWouldChange.push("A stabilizing 30-day trend would reduce longer-term drag.");

  return {
    score,
    inputs: { c24, c7, c30, volatilityProxy },
    drivers,
    whatWouldChange: whatWouldChange.length
      ? whatWouldChange
      : ["Momentum is already supported by multiple aligned signals."],
  };
}

export function computeConfidence(breakdown) {
  const { score, inputs } = breakdown;
  const { c24, c7, volatilityProxy } = inputs;

  const aligned = (c24 >= 0 && c7 >= 0) || (c24 <= 0 && c7 <= 0);

  if (score >= 70 && aligned && volatilityProxy <= 12) {
    return {
      label: "High",
      explanation:
        "Signals are strong and mostly aligned. This does not predict returns — it indicates cleaner momentum conditions.",
    };
  }

  if (score >= 55 && (aligned || volatilityProxy <= 18)) {
    return {
      label: "Medium",
      explanation:
        "Momentum is present, but the signal quality is mixed (mild conflict or choppiness). Consider smaller position sizing or waiting for confirmation.",
    };
  }

  return {
    label: "Low",
    explanation:
      "Momentum is weak or inconsistent. This is not a forecast — it suggests the current setup is noisier and harder to rely on.",
  };
}
