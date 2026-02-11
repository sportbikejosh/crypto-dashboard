"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeConfidence, computeMomentumBreakdown } from "../lib/momentum";
import { loadWatchlist, saveWatchlist } from "../lib/watchlist";
import { Star, RefreshCw } from "lucide-react";

/**
 * Premium-feel improvements (calm UI)
 * - Watchlist summary cards
 * - Watchlist quick sort controls
 * - Only High confidence toggle
 * - Signal Quality legend + small tooltip
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

function SegButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm transition ${
        active ? "bg-white text-slate-900" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
      aria-pressed={checked}
    >
      <span
        className={`inline-flex h-5 w-9 items-center rounded-full border transition ${
          checked ? "bg-slate-900 border-slate-900 justify-end" : "bg-slate-100 border-slate-200 justify-start"
        }`}
      >
        <span className="h-4 w-4 rounded-full bg-white shadow" />
      </span>
      <span>{label}</span>
    </button>
  );
}

function StarButton({ active, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`group h-9 w-9 rounded-xl border flex items-center justify-center transition
        focus:outline-none focus:ring-2 focus:ring-slate-200
        ${active ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200 hover:bg-slate-50"}
      `}
      aria-label={title}
    >
      <Star
        className={`h-4 w-4 transition-transform duration-150 group-hover:scale-110
          ${active ? "text-amber-700" : "text-slate-400"}
        `}
        strokeWidth={2}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}

function StatCard({ title, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function SignalLegend({ onWhy }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Signal Quality</div>
          <div className="mt-1 text-sm text-slate-600">
            Confidence summarizes how clean the momentum signal looks (not a prediction).
          </div>
        </div>
        <button
          type="button"
          onClick={onWhy}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          title="Why confidence matters"
        >
          Why it matters
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="good">High: aligned signals</Badge>
        <Badge tone="warn">Medium: mixed</Badge>
        <Badge tone="bad">Low: noisy</Badge>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Tip: “Only High confidence” reduces noise for newer investors.
      </div>
    </div>
  );
}

function WhyPanel({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Why confidence matters</div>
          <div className="mt-1 text-sm text-slate-700 leading-relaxed">
            Momentum can look strong for lots of reasons — some “clean,” some choppy. Confidence helps you separate:
            <ul className="mt-2 space-y-1">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                <span>
                  <b>High:</b> short-term and 7-day signals agree (clearer conditions)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                <span>
                  <b>Medium:</b> some momentum, but mixed signals (consider smaller sizing)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                <span>
                  <b>Low:</b> weak or inconsistent signals (harder to rely on)
                </span>
              </li>
            </ul>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            This is decision-support, not a forecast. Always pair with your own risk management.
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
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
                  confidence?.label === "High" ? "good" : confidence?.label === "Medium" ? "warn" : "bad"
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

      <p className="mt-2 text-sm text-slate-600">Set rules like “Momentum crosses above X” or “Confidence becomes High.”</p>

      <div className="mt-3 space-y-3 opacity-70">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-700">Momentum crosses above</div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-500">70</div>
            <div className="text-xs text-slate-400">🔒</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-700">Confidence becomes</div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-500">High</div>
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

  const [view, setView] = useState("all"); // "all" | "watchlist"

  const [watchIds, setWatchIds] = useState(() => new Set());

  const [watchSort, setWatchSort] = useState("score"); // score | change24 | change7 | name
  const [watchOnlyHigh, setWatchOnlyHigh] = useState(false);

  const [whyOpen, setWhyOpen] = useState(false);

  const inFlightRef = useRef(false);

  useEffect(() => {
    const ids = loadWatchlist();
    setWatchIds(new Set(ids));
  }, []);

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

  useEffect(() => {
    load({ showSpinner: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => load({ showSpinner: false }), REFRESH_INTERVAL_MS);
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
  const watchlistItems = useMemo(() => enriched.filter((c) => watchIds.has(c.id)), [enriched, watchIds]);

  const watchlistSummary = useMemo(() => {
    const items = watchlistItems;
    const count = items.length;

    if (!count) {
      return { count: 0, avgScore: "—", high: 0, medium: 0, low: 0, topScore: null, best24: null, worst24: null };
    }

    const scores = items.map((c) => Number(c.score ?? 0));
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / count);

    const high = items.filter((c) => c.confidence?.label === "High").length;
    const medium = items.filter((c) => c.confidence?.label === "Medium").length;
    const low = items.filter((c) => c.confidence?.label === "Low").length;

    const topScore = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] || null;

    const best24 =
      [...items].sort(
        (a, b) =>
          Number(b.price_change_percentage_24h_in_currency ?? 0) -
          Number(a.price_change_percentage_24h_in_currency ?? 0)
      )[0] || null;

    const worst24 =
      [...items].sort(
        (a, b) =>
          Number(a.price_change_percentage_24h_in_currency ?? 0) -
          Number(b.price_change_percentage_24h_in_currency ?? 0)
      )[0] || null;

    return { count, avgScore: String(avg), high, medium, low, topScore, best24, worst24 };
  }, [watchlistItems]);

  const baseList = useMemo(() => {
    if (view === "watchlist") {
      let items = watchlistItems;

      if (watchOnlyHigh) items = items.filter((c) => c.confidence?.label === "High");

      const sorted = [...items];
      sorted.sort((a, b) => {
        const mult = -1; // descending
        switch (watchSort) {
          case "change24":
            return (
              (Number(a.price_change_percentage_24h_in_currency ?? 0) -
                Number(b.price_change_percentage_24h_in_currency ?? 0)) * mult
            );
          case "change7":
            return (
              (Number(a.price_change_percentage_7d_in_currency ?? 0) -
                Number(b.price_change_percentage_7d_in_currency ?? 0)) * mult
            );
          case "name":
            return String(a.name || "").localeCompare(String(b.name || "")); // asc
          case "score":
          default:
            return (Number(a.score ?? 0) - Number(b.score ?? 0)) * mult;
        }
      });

      return sorted;
    }

    return enriched;
  }, [enriched, view, watchlistItems, watchOnlyHigh, watchSort]);

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
    if (view === "watchlist") return filtered;

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
  }, [filtered, sortKey, sortDir, view]);

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
              {isRefreshing ? <span className="text-slate-400">• Updating…</span> : <span className="text-slate-400">• Auto-refresh: 60s</span>}
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

        <section className="mt-6 flex items-center gap-2">
          <TabButton active={view === "all"} onClick={() => setView("all")}>
            All
          </TabButton>

          <TabButton active={view === "watchlist"} onClick={() => setView("watchlist")}>
            Watchlist{" "}
            <span
              className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                view === "watchlist" ? "bg-white/15" : "bg-slate-100 text-slate-700"
              }`}
            >
              {watchlistCount}
            </span>
          </TabButton>
        </section>

        {view === "watchlist" ? (
          <section className="mt-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Watchlist Overview</div>
                <div className="mt-1 text-sm text-slate-600">Calm summary of your tracked coins (saved on this device).</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1 flex items-center">
                  <SegButton active={watchSort === "score"} onClick={() => setWatchSort("score")}>
                    Sort: Score
                  </SegButton>
                  <SegButton active={watchSort === "change24"} onClick={() => setWatchSort("change24")}>
                    24h
                  </SegButton>
                  <SegButton active={watchSort === "change7"} onClick={() => setWatchSort("change7")}>
                    7d
                  </SegButton>
                  <SegButton active={watchSort === "name"} onClick={() => setWatchSort("name")}>
                    Name
                  </SegButton>
                </div>

                <Toggle checked={watchOnlyHigh} onChange={setWatchOnlyHigh} label="Only High confidence" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Tracked coins" value={watchlistSummary.count} sub="Watchlist items" />
              <StatCard title="Avg Momentum" value={watchlistSummary.avgScore} sub="0–100" />
              <StatCard
                title="High confidence"
                value={watchlistSummary.high}
                sub={`Medium ${watchlistSummary.medium} • Low ${watchlistSummary.low}`}
              />
              <StatCard
                title="Top score"
                value={watchlistSummary.topScore ? `${watchlistSummary.topScore.name}` : "—"}
                sub={watchlistSummary.topScore ? `Score ${watchlistSummary.topScore.score}` : ""}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Today’s movement (Watchlist)</div>
                  <Badge tone="neutral">Decision-support</Badge>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">Best 24h</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {watchlistSummary.best24 ? watchlistSummary.best24.name : "—"}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {watchlistSummary.best24 ? formatPct(watchlistSummary.best24.price_change_percentage_24h_in_currency) : ""}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">Worst 24h</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {watchlistSummary.worst24 ? watchlistSummary.worst24.name : "—"}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {watchlistSummary.worst24 ? formatPct(watchlistSummary.worst24.price_change_percentage_24h_in_currency) : ""}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Tip: “Only High confidence” is a quick way to reduce noise.
                </p>
              </div>

              <LockedAlertsPanel />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <SignalLegend onWhy={() => setWhyOpen((v) => !v)} />
              <WhyPanel open={whyOpen} onClose={() => setWhyOpen(false)} />
            </div>
          </section>
        ) : null}

        <section className="mt-7">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Top 3 Momentum Opportunities ({view === "watchlist" ? "Watchlist" : "All"})
            </h2>
            <span className="text-xs text-slate-500">Not investment advice</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {top3.map((c) => {
              const tone = c.confidence?.label === "High" ? "good" : c.confidence?.label === "Medium" ? "warn" : "bad";
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="text-left rounded-2xl border border-slate-200 p-4 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">
                      {c.name} <span className="text-slate-400 font-medium">({c.symbol?.toUpperCase()})</span>
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
                  <div className="mt-2 text-xs text-slate-500 line-clamp-2">{c.breakdown?.drivers?.[0] ?? ""}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Watch</th>
                    <th className="px-4 py-3 text-left font-semibold">
                      <button onClick={() => toggleSort("name")} className="hover:text-slate-900">
                        Coin{view === "watchlist" ? "" : sortHint("name")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("price")} className="hover:text-slate-900">
                        Price{view === "watchlist" ? "" : sortHint("price")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("change24")} className="hover:text-slate-900">
                        24h %{view === "watchlist" ? "" : sortHint("change24")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("change7")} className="hover:text-slate-900">
                        7d %{view === "watchlist" ? "" : sortHint("change7")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("score")} className="hover:text-slate-900">
                        Momentum{view === "watchlist" ? "" : sortHint("score")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Confidence</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button onClick={() => toggleSort("marketcap")} className="hover:text-slate-900">
                        Market Cap{view === "watchlist" ? "" : sortHint("marketcap")}
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
                      <td className="px-4 py-8 text-slate-600" colSpan={8}>
                        {view === "watchlist" ? (
                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-slate-900">Your watchlist is empty</div>
                            <div className="text-sm text-slate-600">
                              Go to the <b>All</b> tab and star a few coins to track them here.
                            </div>
                          </div>
                        ) : (
                          "No matches found."
                        )}
                      </td>
                    </tr>
                  )}

                  {!status.loading &&
                    !status.error &&
                    sorted.map((c) => {
                      const confidenceTone =
                        c.confidence?.label === "High" ? "good" : c.confidence?.label === "Medium" ? "warn" : "bad";
                      const isWatched = watchIds.has(c.id);

                      return (
                        <tr
                          key={c.id}
                          className="cursor-pointer hover:bg-slate-50 transition"
                          onClick={() => setSelectedId(c.id)}
                          title="Click for score explanation"
                        >
                          <td className="px-4 py-3">
                            <div onClick={(e) => e.stopPropagation()}>
                              <StarButton
                                active={isWatched}
                                title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                                onClick={() => toggleWatch(c.id)}
                              />
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">
                              {c.name} <span className="text-slate-400 font-medium">({c.symbol?.toUpperCase()})</span>
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

      <Drawer open={!!selectedId} onClose={() => setSelectedId(null)} coin={selectedCoin} breakdown={selectedBreakdown} confidence={selectedConfidence} />
    </main>
  );
}
