"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Crypto Altcoin Momentum Dashboard (MVP + Explainability Drawer)
 * - Decision-support (not prediction)
 * - Explainability > raw data
 * - Calm, professional UI
 *
 * Data: CoinGecko /coins/markets (price + 24h/7d/30d %)
 */

const COINGECKO_MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h,7d,30d";

const PREMIUM_LOCKED_FEATURES = [
  "7-day momentum history chart",
  "Watchlist alerts (momentum threshold)",
  "Market regime context (risk-on / risk-off)",
  "Side-by-side coin comparisons",
];

function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  if (num >= 1) return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
  // For tiny prices (e.g., $0.0000123)
  return "$" + num.toPrecision(3);
}

function formatPct(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Momentum score: explainable composite, NOT a prediction.
 * Uses:
 * - 24h change (fast signal)
 * - 7d change (trend confirmation)
 * - 30d change (trend stability)
 * - volatility penalty (too spiky = lower confidence)
 */
function computeMomentumBreakdown(coin) {
  const c24 = Number(coin.price_change_percentage_24h_in_currency ?? 0);
  const c7 = Number(coin.price_change_percentage_7d_in_currency ?? 0);
  const c30 = Number(coin.price_change_percentage_30d_in_currency ?? 0);

  // Volatility proxy: big gap between 24h and 7d implies choppiness
  const volatilityProxy = Math.abs(c24 - c7);

  // Normalize contributions (simple, explainable clamps)
  const n24 = clamp(c24, -20, 20);
  const n7 = clamp(c7, -30, 30);
  const n30 = clamp(c30, -50, 50);

  // Weights (tunable): heavier on 7d, then 24h, then 30d.
  const raw =
    0.45 * n7 +
    0.35 * n24 +
    0.20 * (n30 / 1.5); // soften 30d so it doesn’t dominate

  // Penalty for “spikiness”
  const penalty = clamp(volatilityProxy, 0, 40) * 0.25;

  // Final score (0–100)
  // Center raw around 50, scale, then apply penalty.
  const scaled = 50 + raw * 1.2 - penalty;
  const score = Math.round(clamp(scaled, 0, 100));

  // Build drivers (plain English)
  const drivers = [];

  // Trend alignment
  const trendAligned =
    (c24 >= 0 && c7 >= 0) || (c24 <= 0 && c7 <= 0);

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

  // Choppiness / volatility proxy
  if (volatilityProxy >= 15) {
    drivers.push(
      `Signals are choppy (24h vs 7d differs by ~${volatilityProxy.toFixed(1)} pts), which reduces confidence.`
    );
  } else {
    drivers.push(`Signals are fairly consistent (24h vs 7d gap ~${volatilityProxy.toFixed(1)} pts).`);
  }

  if (trendAligned) {
    drivers.push("Short-term and 7-day signals point in the same direction (better signal quality).");
  } else {
    drivers.push("Short-term and 7-day signals conflict (treat as a lower-quality setup).");
  }

  // “What would change this score?”
  const whatWouldChange = [];
  if (c7 < 5) whatWouldChange.push("A stronger 7-day trend would raise momentum.");
  if (c24 < 3) whatWouldChange.push("A clean positive 24h move would improve the short-term signal.");
  if (volatilityProxy > 12) whatWouldChange.push("Less choppiness between short-term and 7-day moves would raise confidence.");
  if (c30 < 0) whatWouldChange.push("A stabilizing 30-day trend would reduce longer-term drag.");

  return {
    score,
    inputs: { c24, c7, c30, volatilityProxy },
    drivers,
    whatWouldChange: whatWouldChange.length ? whatWouldChange : ["Momentum is already supported by multiple aligned signals."],
  };
}

/**
 * Confidence labels:
 * - High: score high AND signals aligned AND not too choppy
 * - Medium: decent score but mild conflict or mild choppiness
 * - Low: low score or high conflict/choppiness
 */
function computeConfidence(breakdown) {
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

function Badge({ children, tone = "neutral" }) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "bad"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

function Drawer({ open, onClose, coin, breakdown, confidence }) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl border-l border-slate-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600">
                {coin?.symbol?.toUpperCase()?.slice(0, 4) ?? "—"}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 truncate">
                  {coin?.name ?? "—"}
                </div>
                <div className="text-sm text-slate-500 truncate">
                  {coin?.symbol?.toUpperCase() ?? "—"} • {formatMoney(coin?.current_price)}
                </div>
              </div>
            </div>
          </div>

          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto h-[calc(100%-72px)]">
          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">Momentum Score</div>
              <div className="text-2xl font-semibold text-slate-900">{breakdown?.score ?? "—"}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge
                tone={
                  confidence?.label === "High"
                    ? "good"
                    : confidence?.label === "Medium"
                    ? "warn"
                    : "bad"
                }
              >
                Confidence: {confidence?.label ?? "—"}
              </Badge>
              <span className="text-xs text-slate-500">
                Momentum ≠ prediction
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-700 leading-relaxed">
              {confidence?.explanation ?? ""}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">What’s driving this score</div>
            <ul className="mt-3 space-y-2">
              {(breakdown?.drivers ?? []).slice(0, 6).map((d, idx) => (
                <li key={idx} className="text-sm text-slate-700 flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">Inputs (for transparency)</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">24h %</div>
                <div className="text-sm font-semibold text-slate-900">
                  {formatPct(breakdown?.inputs?.c24)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">7d %</div>
                <div className="text-sm font-semibold text-slate-900">
                  {formatPct(breakdown?.inputs?.c7)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">30d %</div>
                <div className="text-sm font-semibold text-slate-900">
                  {formatPct(breakdown?.inputs?.c30)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Choppiness proxy</div>
                <div className="text-sm font-semibold text-slate-900">
                  {breakdown?.inputs?.volatilityProxy?.toFixed?.(1) ?? "—"}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              These inputs are used to summarize momentum conditions. They are not a guarantee of outcomes.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">What would change this</div>
            <ul className="mt-3 space-y-2">
              {(breakdown?.whatWouldChange ?? []).slice(0, 4).map((d, idx) => (
                <li key={idx} className="text-sm text-slate-700 flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <div className="text-sm font-semibold text-slate-900">Reminder</div>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">
              This dashboard supports decisions by summarizing momentum conditions. It does <b>not</b> predict prices.
              Use it as one input alongside your own research and risk management.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  const [coins, setCoins] = useState([]);
  const [status, setStatus] = useState({ loading: true, error: "" });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("score"); // score | name | price | change24 | change7 | marketcap
  const [sortDir, setSortDir] = useState("desc"); // asc | desc

  // Drawer state
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus({ loading: true, error: "" });
        const res = await fetch(COINGECKO_MARKETS_URL, { cache: "no-store" });

        if (!res.ok) {
          throw new Error(`CoinGecko error (${res.status})`);
        }

        const data = await res.json();
        if (cancelled) return;

        setCoins(Array.isArray(data) ? data : []);
        setStatus({ loading: false, error: "" });
      } catch (e) {
        if (cancelled) return;
        setStatus({
          loading: false,
          error:
            "Could not load data. CoinGecko may be rate limiting requests. Try refreshing in a moment.",
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Enrich coins with score + confidence + breakdown
  const enriched = useMemo(() => {
    return (coins || []).map((c) => {
      const breakdown = computeMomentumBreakdown(c);
      const confidence = computeConfidence(breakdown);
      return { ...c, breakdown, score: breakdown.score, confidence };
    });
  }, [coins]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const sym = (c.symbol || "").toLowerCase();
      return name.includes(q) || sym.includes(q);
    });
  }, [enriched, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];

    function getVal(c) {
      switch (sortKey) {
        case "name":
          return c.name || "";
        case "price":
          return Number(c.current_price ?? 0);
        case "change24":
          return Number(c.price_change_percentage_24h_in_currency ?? 0);
        case "change7":
          return Number(c.price_change_percentage_7d_in_currency ?? 0);
        case "marketcap":
          return Number(c.market_cap ?? 0);
        case "score":
        default:
          return Number(c.score ?? 0);
      }
    }

    arr.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);

      if (typeof va === "string" || typeof vb === "string") {
        const cmp = String(va).localeCompare(String(vb));
        return sortDir === "asc" ? cmp : -cmp;
      }

      const cmp = va - vb;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return arr;
  }, [filtered, sortKey, sortDir]);

  const top3 = useMemo(() => {
    const byScore = [...enriched].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return byScore.slice(0, 3);
  }, [enriched]);

  const selectedCoin = useMemo(() => {
    if (!selectedId) return null;
    return enriched.find((c) => c.id === selectedId) || null;
  }, [selectedId, enriched]);

  const selectedBreakdown = selectedCoin?.breakdown ?? null;
  const selectedConfidence = selectedCoin?.confidence ?? null;

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortHint = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Altcoin Momentum Dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
              Decision-support for novice → intermediate investors. Momentum summarizes recent trend conditions — it does{" "}
              <b>not</b> predict future price.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <input
                className="w-full sm:w-80 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Search coins (e.g., SOL, ARB, LINK)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="text-xs text-slate-500">
              Tip: click any row to open “Why this score?”
            </div>
          </div>
        </header>

        {/* Top 3 */}
        <section className="mt-7">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Top 3 Momentum Opportunities (signal summary)
            </h2>
            <span className="text-xs text-slate-500">Not investment advice</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {top3.map((c) => {
              const tone =
                c.confidence?.label === "High"
                  ? "good"
                  : c.confidence?.label === "Medium"
                  ? "warn"
                  : "bad";

              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="text-left rounded-2xl border border-slate-200 p-4 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold truncate">
                      {c.name}{" "}
                      <span className="text-slate-400 font-medium">
                        ({c.symbol?.toUpperCase()})
                      </span>
                    </div>
                    <Badge tone={tone}>{c.confidence?.label ?? "—"} confidence</Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Score: <span className="font-semibold text-slate-900">{c.score}</span>
                    <span className="mx-2 text-slate-300">•</span>
                    24h: <span className="font-medium">{formatPct(c.price_change_percentage_24h_in_currency)}</span>
                    <span className="mx-2 text-slate-300">•</span>
                    7d: <span className="font-medium">{formatPct(c.price_change_percentage_7d_in_currency)}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 line-clamp-2">
                    {c.breakdown?.drivers?.[0] ?? ""}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Table */}
        <section className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      <button onClick={() => toggleSort("name")} className="hover:text-slate-900">
                        Coin{sortHint("name")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("price")} className="hover:text-slate-900">
                        Price{sortHint("price")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("change24")} className="hover:text-slate-900">
                        24h %{sortHint("change24")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("change7")} className="hover:text-slate-900">
                        7d %{sortHint("change7")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("score")} className="hover:text-slate-900">
                        Momentum{sortHint("score")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Confidence</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("marketcap")} className="hover:text-slate-900">
                        Market Cap{sortHint("marketcap")}
                      </button>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {status.loading && (
                    <tr>
                      <td className="px-4 py-6 text-slate-600" colSpan={7}>
                        Loading market data…
                      </td>
                    </tr>
                  )}

                  {!status.loading && status.error && (
                    <tr>
                      <td className="px-4 py-6 text-rose-700" colSpan={7}>
                        {status.error}
                      </td>
                    </tr>
                  )}

                  {!status.loading && !status.error && sorted.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-slate-600" colSpan={7}>
                        No matches found.
                      </td>
                    </tr>
                  )}

                  {!status.loading &&
                    !status.error &&
                    sorted.map((c) => {
                      const confidenceTone =
                        c.confidence?.label === "High"
                          ? "good"
                          : c.confidence?.label === "Medium"
                          ? "warn"
                          : "bad";

                      const isTop3 = top3.some((t) => t.id === c.id);

                      return (
                        <tr
                          key={c.id}
                          className={`cursor-pointer hover:bg-slate-50 transition ${
                            isTop3 ? "bg-emerald-50/30" : ""
                          }`}
                          onClick={() => setSelectedId(c.id)}
                          title="Click for score explanation"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">
                              {c.name}{" "}
                              <span className="text-slate-400 font-medium">
                                ({c.symbol?.toUpperCase()})
                              </span>
                              {isTop3 ? (
                                <span className="ml-2 align-middle">
                                  <Badge tone="good">Top 3</Badge>
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">{formatMoney(c.current_price)}</td>
                          <td className="px-4 py-3 text-right">{formatPct(c.price_change_percentage_24h_in_currency)}</td>
                          <td className="px-4 py-3 text-right">{formatPct(c.price_change_percentage_7d_in_currency)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{c.score}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Badge tone={confidenceTone}>{c.confidence?.label ?? "—"}</Badge>
                              <span className="text-xs text-slate-500 hidden sm:inline">
                                {c.confidence?.label === "High"
                                  ? "cleaner signal"
                                  : c.confidence?.label === "Medium"
                                  ? "mixed"
                                  : "noisy"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {c.market_cap ? "$" + Number(c.market_cap).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Premium locked section */}
        <section className="mt-8">
          <div className="rounded-2xl border border-slate-200 p-5 bg-slate-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Premium (locked)</h3>
              <Badge tone="neutral">Coming soon</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              These features will be available in the paid version. Shown here to communicate product direction (no sign-in yet).
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PREMIUM_LOCKED_FEATURES.map((f) => (
                <div
                  key={f}
                  className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between opacity-80"
                >
                  <div className="text-sm text-slate-700">{f}</div>
                  <span className="text-xs text-slate-400">🔒</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Explainability Drawer */}
      <Drawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        coin={selectedCoin}
        breakdown={selectedBreakdown}
        confidence={selectedConfidence}
      />
    </main>
  );
}
