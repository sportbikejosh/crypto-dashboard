"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeConfidence, computeMomentumBreakdown } from "../lib/momentum";
import { loadWatchlist, saveWatchlist } from "../lib/watchlist";

/**
 * Dashboard (Client) -> fetches from cached server endpoint /api/markets
 * - Calm auto-refresh every 60s
 * - Manual refresh button
 * - Watchlist (localStorage)
 * - Premium alerts UI visually locked (no auth yet)
 */

const PREMIUM_LOCKED_FEATURES = [
  "7-day momentum history chart",
  "Watchlist alerts (momentum threshold)",
  "Market regime context (risk-on / risk-off)",
  "Side-by-side coin comparisons",
];

const REFRESH_INTERVAL_MS = 60_000;

function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  if (num >= 1) return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
  return "$" + num.toPrecision(3);
}

function formatPct(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
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
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm border transition ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function StarButton({ active, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-9 w-9 rounded-xl border flex items-center justify-center transition ${
        active
          ? "bg-amber-50 border-amber-200 text-amber-700"
          : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
      }`}
      aria-label={title}
    >
      <span className="text-base leading-none">{active ? "★" : "☆"}</span>
    </button>
  );
}

function Drawer({ open, onClose, coin, breakdown, confidence }) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />

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
                <div className="text-lg font-semibold text-slate-900 truncate">{coin?.name ?? "—"}</div>
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
              <span className="text-xs text-slate-500">Momentum ≠ prediction</span>
            </div>
            <p className="mt-3 text-sm text-slate-700 leading-relaxed">{confidence?.explanation ?? ""}</p>
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
                <div className="text-sm font-semibold text-slate-900">{formatPct(breakdown?.inputs?.c24)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">7d %</div>
                <div className="text-sm font-semibold text-slate-900">{formatPct(breakdown?.inputs?.c7)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">30d %</div>
                <div className="text-sm font-semibold text-slate-900">{formatPct(breakdown?.inputs?.c30)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Choppiness proxy</div>
                <div className="text-sm font-semibold text-slate-900">
                  {breakdown?.inputs?.volatilityProxy?.toFixed?.(1) ?? "—"}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              These inputs summarize momentum conditions. They are not a guarantee of outcomes.
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

function LockedAlertsPanel() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Alerts (Premium)</div>
        <span className="text-xs text-slate-400">🔒 Locked</span>
      </div>

      <p className="mt-2 text-sm text-slate-600">
        Set simple rules like “Momentum crosses above X” or “Confidence becomes High.”
      </p>

      <div className="mt-3 space-y-3 opacity-70">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-700">Momentum crosses above</div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-500">
              70
            </div>
            <div className="text-xs text-slate-400">🔒</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-700">Confidence becomes</div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-500">
              High
            </div>
            <div className="text-xs text-slate-400">🔒</div>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
        >
          Save Alerts (Premium)
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  const [coins, setCoins] = useState([]);
  const [status, setStatus] = useState({ loading: true, error: "" });

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const [selectedId, setSelectedId] = useState(null);

  const [fetchedAt, setFetchedAt] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // View: all vs watchlist
  const [view, setView] = useState("all"); // "all" | "watchlist"

  // Watchlist: stored as Set of coin ids
  const [watchIds, setWatchIds] = useState(() => new Set());

  // Prevent overlapping refresh calls
  const inFlightRef = useRef(false);

  // Load watchlist from localStorage on first mount
  useEffect(() => {
    const ids = loadWatchlist();
    setWatchIds(new Set(ids));
  }, []);

  // Persist watchlist whenever it changes
  useEffect(() => {
    saveWatchlist(Array.from(watchIds));
  }, [watchIds]);

  async function load({ showSpinner } = { showSpinner: true }) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (showSpinner) {
        setStatus({ loading: true, error: "" });
      } else {
        setIsRefreshing(true);
        setStatus((s) => ({ ...s, error: "" }));
      }

      const res = await fetch("/api/markets", { cache: "no-store" });
      if (!res.ok) throw new Error(`API error (${res.status})`);

      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];

      setCoins(data);
      setFetchedAt(json?.fetchedAt || "");
      setStatus({ loading: false, error: "" });
    } catch (e) {
      setStatus((s) => ({
        loading: false,
        error: showSpinner ? "Could not load data. Try refreshing in a moment." : s.error,
      }));
    } finally {
      setIsRefreshing(false);
      inFlightRef.current = false;
    }
  }

  // Initial load
  useEffect(() => {
    load({ showSpinner: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      load({ showSpinner: false });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleWatch(id) {
    setWatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const enriched = useMemo(() => {
    return (coins || []).map((c) => {
      const breakdown = computeMomentumBreakdown(c);
      const confidence = computeConfidence(breakdown);
      return { ...c, breakdown, score: breakdown.score, confidence };
    });
  }, [coins]);

  const watchlistCount = watchIds.size;

  const baseList = useMemo(() => {
    if (view === "watchlist") {
      return enriched.filter((c) => watchIds.has(c.id));
    }
    return enriched;
  }, [enriched, view, watchIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const sym = (c.symbol || "").toLowerCase();
      return name.includes(q) || sym.includes(q);
    });
  }, [baseList, query]);

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

  // Top 3 within current view (All or Watchlist)
  const top3 = useMemo(() => {
    const byScore = [...baseList].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return byScore.slice(0, 3);
  }, [baseList]);

  const selectedCoin = useMemo(() => {
    if (!selectedId) return null;
    return enriched.find((c) => c.id === selectedId) || null;
  }, [selectedId, enriched]);

  const selectedBreakdown = selectedCoin?.breakdown ?? null;
  const selectedConfidence = selectedCoin?.confidence ?? null;

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
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
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Altcoin Momentum Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
              Decision-support for novice → intermediate investors. Momentum summarizes recent trend conditions — it does{" "}
              <b>not</b> predict future price.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {fetchedAt ? <span>Last refreshed (server): {formatTime(fetchedAt)}</span> : null}
              {isRefreshing ? (
                <span className="text-slate-400">• Updating…</span>
              ) : (
                <span className="text-slate-400">• Auto-refresh: 60s</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                className="w-full sm:w-80 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Search coins (e.g., SOL, ARB, LINK)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <button
                type="button"
                onClick={() => load({ showSpinner: false })}
                disabled={isRefreshing || status.loading}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                title="Refresh data now"
              >
                {isRefreshing || status.loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="text-xs text-slate-500">Tip: click any row to open “Why this score?”</div>
          </div>
        </header>

        {/* Tabs */}
        <section className="mt-6 flex items-center gap-2">
          <TabButton active={view === "all"} onClick={() => setView("all")}>
            All
          </TabButton>

          <TabButton active={view === "watchlist"} onClick={() => setView("watchlist")}>
            Watchlist{" "}
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
              view === "watchlist" ? "bg-white/15" : "bg-slate-100 text-slate-700"
            }`}>
              {watchlistCount}
            </span>
          </TabButton>
        </section>

        {/* Top 3 */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Top 3 Momentum Opportunities ({view === "watchlist" ? "Watchlist" : "All"})
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">
                      {c.name}{" "}
                      <span className="text-slate-400 font-medium">({c.symbol?.toUpperCase()})</span>
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

        {/* Watchlist panel (only when view=watchlist) */}
        {view === "watchlist" ? (
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Watchlist Controls</h3>
              <Badge tone="neutral">Premium locked alerts</Badge>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">How to use Watchlist</div>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    <span>Star coins you want to monitor. Your watchlist is saved on this device.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    <span>Use Momentum + Confidence together. High confidence ≠ guaranteed gains.</span>
                  </li>
                </ul>
              </div>

              <LockedAlertsPanel />
            </div>
          </section>
        ) : null}

        {/* Table */}
        <section className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Watch</th>
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
                      <td className="px-4 py-6 text-slate-600" colSpan={8}>
                        Loading market data…
                      </td>
                    </tr>
                  )}

                  {!status.loading && status.error && (
                    <tr>
                      <td className="px-4 py-6 text-rose-700" colSpan={8}>
                        {status.error}
                      </td>
                    </tr>
                  )}

                  {!status.loading && !status.error && sorted.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-slate-600" colSpan={8}>
                        {view === "watchlist"
                          ? "Your watchlist is empty. Star a few coins from the All tab."
                          : "No matches found."}
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

                      const isWatched = watchIds.has(c.id);

                      return (
                        <tr
                          key={c.id}
                          className="cursor-pointer hover:bg-slate-50 transition"
                          onClick={() => setSelectedId(c.id)}
                          title="Click for score explanation"
                        >
                          <td className="px-4 py-3">
                            <div
                              onClick={(e) => {
                                e.stopPropagation(); // prevents opening drawer
                              }}
                            >
                              <StarButton
                                active={isWatched}
                                title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                                onClick={() => toggleWatch(c.id)}
                              />
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">
                              {c.name}{" "}
                              <span className="text-slate-400 font-medium">({c.symbol?.toUpperCase()})</span>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right">{formatMoney(c.current_price)}</td>
                          <td className="px-4 py-3 text-right">
                            {formatPct(c.price_change_percentage_24h_in_currency)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatPct(c.price_change_percentage_7d_in_currency)}
                          </td>
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
