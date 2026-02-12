"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeConfidence, computeMomentumBreakdown } from "../lib/momentum";
import { loadWatchlist, saveWatchlist } from "../lib/watchlist";
import { loadPreferences, resetPreferences, savePreferences } from "../lib/preferences";
import { Star, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

const REFRESH_INTERVAL_MS = 60_000;

function formatMoney(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1) return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  return "$" + Number(n).toPrecision(3);
}

function formatPct(n) {
  if (!n && n !== 0) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(2)}%`;
}

function Badge({ children, tone = "neutral" }) {
  const map = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    bad: "bg-rose-50 text-rose-700 border-rose-200",
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

function StarButton({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`h-9 w-9 rounded-xl border flex items-center justify-center transition ${
        active ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200 hover:bg-slate-50"
      }`}
    >
      <Star
        className={`h-4 w-4 ${active ? "text-amber-700" : "text-slate-400"}`}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-4 bg-slate-100 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

function StatCard({ title, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function Page() {
  const [coins, setCoins] = useState([]);
  const [status, setStatus] = useState({ loading: true, error: "" });
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [watchIds, setWatchIds] = useState(new Set());
  const [marketLimit, setMarketLimit] = useState(250);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [fetchedAt, setFetchedAt] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const inFlight = useRef(false);

  useEffect(() => {
    setWatchIds(new Set(loadWatchlist()));
    const prefs = loadPreferences();
    setMarketLimit(prefs.marketLimit);
    setPageSize(prefs.pageSize);
  }, []);

  useEffect(() => {
    saveWatchlist(Array.from(watchIds));
  }, [watchIds]);

  async function load(showSpinner = true) {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      if (showSpinner) setStatus({ loading: true, error: "" });
      else setIsRefreshing(true);

      const res = await fetch(`/api/markets?per_page=${marketLimit}`);
      const json = await res.json();

      setCoins(json.data || []);
      setFetchedAt(json.fetchedAt);
      setStatus({ loading: false, error: "" });
    } catch {
      setStatus({ loading: false, error: "Failed to load data." });
    } finally {
      setIsRefreshing(false);
      inFlight.current = false;
    }
  }

  useEffect(() => {
    load(true);
  }, [marketLimit]);

  useEffect(() => {
    const id = setInterval(() => load(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [marketLimit]);

  const enriched = useMemo(() => {
    return coins.map((c) => {
      const breakdown = computeMomentumBreakdown(c);
      const confidence = computeConfidence(breakdown);
      return { ...c, breakdown, score: breakdown.score, confidence };
    });
  }, [coins]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return enriched.filter(
      (c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
    );
  }, [enriched, query]);

  const watchlistItems = useMemo(
    () => filtered.filter((c) => watchIds.has(c.id)),
    [filtered, watchIds]
  );

  const paginated =
    view === "watchlist"
      ? watchlistItems
      : filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalPages = Math.ceil(filtered.length / pageSize);

  const watchSummary = {
    count: watchlistItems.length,
    avg:
      watchlistItems.length > 0
        ? Math.round(
            watchlistItems.reduce((sum, c) => sum + c.score, 0) / watchlistItems.length
          )
        : "—",
    high: watchlistItems.filter((c) => c.confidence.label === "High").length,
  };

  function toggleWatch(id) {
    setWatchIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-semibold">Crypto Momentum Dashboard</h1>
            <div className="text-xs text-slate-500 mt-1">
              {fetchedAt ? `Last updated: ${new Date(fetchedAt).toLocaleString()}` : ""}
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <input
              className="border rounded-xl px-3 py-2 text-sm"
              placeholder="Search..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <button
              onClick={() => load(false)}
              className="border rounded-xl px-3 py-2 text-sm flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setView("all")}
            className={`px-4 py-2 rounded-xl border ${
              view === "all" ? "bg-slate-900 text-white" : "bg-white"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setView("watchlist")}
            className={`px-4 py-2 rounded-xl border ${
              view === "watchlist" ? "bg-slate-900 text-white" : "bg-white"
            }`}
          >
            Watchlist ({watchIds.size})
          </button>
        </div>

        {/* Watchlist Overview */}
        {view === "watchlist" && (
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
            <StatCard title="Tracked Assets" value={watchSummary.count} />
            <StatCard title="Avg Momentum" value={watchSummary.avg} sub="0–100 scale" />
            <StatCard title="High Confidence" value={watchSummary.high} />
          </div>
        )}

        {/* Table */}
        <div className="mt-6 border rounded-2xl overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Watch</th>
                <th className="px-4 py-3 text-left">Asset</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">24h</th>
                <th className="px-4 py-3 text-right">Momentum</th>
                <th className="px-4 py-3 text-left">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {status.loading
                ? Array.from({ length: pageSize }).map((_, i) => <SkeletonRow key={i} />)
                : paginated.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <StarButton
                          active={watchIds.has(c.id)}
                          onClick={() => toggleWatch(c.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {c.name} ({c.symbol.toUpperCase()})
                      </td>
                      <td className="px-4 py-3 text-right">{formatMoney(c.current_price)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatPct(c.price_change_percentage_24h_in_currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{c.score}</td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            c.confidence.label === "High"
                              ? "good"
                              : c.confidence.label === "Medium"
                              ? "warn"
                              : "bad"
                          }
                        >
                          {c.confidence.label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {/* Pagination only for All */}
          {view === "all" && !status.loading && (
            <div className="flex justify-between items-center px-4 py-3 border-t">
              <div className="text-xs text-slate-500">
                Page {page} / {totalPages || 1}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-2 border rounded-xl disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-2 border rounded-xl disabled:opacity-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Empty Watchlist */}
        {view === "watchlist" && watchlistItems.length === 0 && (
          <div className="mt-6 text-center text-slate-500">
            Your watchlist is empty. Go to <b>All</b> and star assets to track them.
          </div>
        )}
      </div>
    </main>
  );
}
