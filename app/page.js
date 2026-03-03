"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* -----------------------------
   Small utilities
------------------------------ */

function pctWidth(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  return `${Math.max(0, Math.min(100, v))}%`;
}

function parseBoolParam(v) {
  if (v == null) return null;
  return v === "1" || v === "true";
}

function clampInt(n, min, max) {
  const v = Number.parseInt(String(n), 10);
  if (!Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, v));
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1) return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  if (v >= 0.01) return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 6 });
}

function formatPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function labelFromConfidence(c) {
  return (typeof c?.confidence === "string" ? c.confidence : c?.confidence?.label) ?? "—";
}

function confidenceToNumber(c) {
  const raw = c?.confidenceRaw;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const label = labelFromConfidence(c);
  if (label === "High") return 3;
  if (label === "Medium") return 2;
  if (label === "Low") return 1;
  return 0;
}

function liquidityToNumber(c) {
  const label = String(c?.liquidityStrength ?? "").toLowerCase();
  if (label === "high") return 3;
  if (label === "medium") return 2;
  if (label === "low") return 1;
  return 0;
}

function getValueForSort(c, key) {
  switch (key) {
    case "name":
      return String(c?.name || "");
    case "price":
      return Number((c?.current_price ?? c?.priceUsd) ?? 0);
    case "change24":
      return Number((c?.price_change_percentage_24h_in_currency ?? c?.priceChange24h) ?? 0);
    case "score":
      return Number((c?.score ?? c?.momentumScore) ?? 0);
    case "confidence":
      return confidenceToNumber(c);
    default:
      return 0;
  }
}

function sortArray(arr, key, dir) {
  const mult = dir === "asc" ? 1 : -1;
  const out = [...arr];
  out.sort((a, b) => {
    const va = getValueForSort(a, key);
    const vb = getValueForSort(b, key);
    if (typeof va === "string" || typeof vb === "string") {
      return String(va).localeCompare(String(vb)) * mult;
    }
    return (Number(va) - Number(vb)) * mult;
  });
  return out;
}

/* -----------------------------
   Local storage
------------------------------ */

const LS_WATCH = "cad2_watchlist_v1";
const LS_PREFS = "cad2_prefs_v6";

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(LS_WATCH);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveWatchlist(set) {
  try {
    localStorage.setItem(LS_WATCH, JSON.stringify([...set]));
  } catch {}
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_PREFS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrefs(p) {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify(p));
  } catch {}
}

/* -----------------------------
   UI atoms
------------------------------ */

function Badge({ tone = "neutral", children }) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  const map = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-rose-50 text-rose-700 border-rose-200",
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return <span className={`${base} ${map[tone] || map.neutral}`}>{children}</span>;
}

function Pill({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1.5 text-xs border transition",
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function FilterChip({ label, onClear, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClear}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
    >
      <span>{label}</span>
      <span className="text-slate-400">×</span>
    </button>
  );
}

function IconStar({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={filled ? "text-amber-500" : "text-slate-400"}>
      <path
        fill="currentColor"
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        opacity={filled ? 1 : 0.35}
      />
    </svg>
  );
}

function StarButton({ active, onClick }) {
  return (
    <button
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100"
      onClick={onClick}
      title={active ? "Unwatch" : "Watch"}
      type="button"
    >
      <IconStar filled={active} />
    </button>
  );
}

function CompareButtonLocked({ onClick }) {
  return (
    <button
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100"
      onClick={onClick}
      title="Premium: pinned comparison"
      type="button"
    >
      <span className="text-slate-500 text-xs font-semibold">⛔</span>
    </button>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3">
        <div className="h-6 w-16 bg-slate-100 rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-52 bg-slate-100 rounded" />
        <div className="mt-2 h-3 w-40 bg-slate-100 rounded" />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="h-4 w-20 bg-slate-100 rounded ml-auto" />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="h-4 w-16 bg-slate-100 rounded ml-auto" />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="h-4 w-12 bg-slate-100 rounded ml-auto" />
      </td>
      <td className="px-4 py-3">
        <div className="h-6 w-20 bg-slate-100 rounded-full" />
      </td>
    </tr>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-8 w-[min(900px,calc(100%-24px))] -translate-x-1/2 rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="font-semibold text-slate-900">{title}</div>
          <button className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* -----------------------------
   Explainability Snapshot UI
------------------------------ */

function KeyValue({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="text-xs text-slate-500">{k}</div>
      <div className="text-sm font-semibold text-slate-900">{v}</div>
    </div>
  );
}

function ReasonChip({ tone = "neutral", children }) {
  const map = {
    good: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-900 border-amber-200",
    bad: "bg-rose-50 text-rose-800 border-rose-200",
    neutral: "bg-slate-50 text-slate-800 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${map[tone] || map.neutral}`}>
      {children}
    </span>
  );
}

function buildExplainSnapshot(a) {
  if (!a) return { bullets: [], chips: [] };

  const score = Number(a.score ?? a.momentumScore ?? 0) || 0;
  const conf = labelFromConfidence(a);
  const liq = a.liquidityStrength ?? "—";
  const regime = a.regime ?? "—";
  const change24 = Number(a.price_change_percentage_24h_in_currency ?? a.priceChange24h);
  const vol = a.volatility;

  const chips = [];

  if (liq === "High") chips.push({ tone: "good", text: "High liquidity supports confidence" });
  else if (liq === "Medium") chips.push({ tone: "warn", text: "Moderate liquidity adds risk" });
  else if (liq === "Low") chips.push({ tone: "bad", text: "Low liquidity reduces confidence" });
  else chips.push({ tone: "neutral", text: "Liquidity unknown" });

  if (regime === "Risk-On") chips.push({ tone: "good", text: "Market regime supportive" });
  else if (regime === "Neutral") chips.push({ tone: "warn", text: "Market regime mixed" });
  else if (regime === "Risk-Off") chips.push({ tone: "bad", text: "Market regime defensive" });
  else chips.push({ tone: "neutral", text: "Regime unknown" });

  if (typeof vol === "number") {
    if (vol <= 3) chips.push({ tone: "good", text: "Lower volatility" });
    else if (vol <= 6) chips.push({ tone: "warn", text: "Moderate volatility" });
    else chips.push({ tone: "bad", text: "High volatility" });
  }

  if (Number.isFinite(change24)) {
    if (change24 >= 8) chips.push({ tone: "warn", text: "Large 24h move (check stability)" });
    if (change24 <= -8) chips.push({ tone: "warn", text: "Sharp drawdown (risk elevated)" });
  }

  const bullets = [
    `Momentum is a multi-factor score (not predictive). Current value: ${score}.`,
    `Confidence is liquidity- and volatility-adjusted: ${conf}.`,
    `Regime: ${regime}. Liquidity: ${liq}.`,
  ];

  return { bullets, chips };
}

/* -----------------------------
   Page
------------------------------ */

export default function Page() {
  const [status, setStatus] = useState({ loading: true, error: "" });
  const [assets, setAssets] = useState([]);

  const [view, setView] = useState("all"); // all | watchlist
  const [search, setSearch] = useState("");
  const [onlyHigh, setOnlyHigh] = useState(false);

  const [regimeFilter, setRegimeFilter] = useState("All"); // All | Risk-On | Neutral | Risk-Off
  const [liquidityFilter, setLiquidityFilter] = useState("Any"); // Any | Medium+ | High

  const [speculativeMode, setSpeculativeMode] = useState(false); // premium locked (visual only)

  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const [allSortKey, setAllSortKey] = useState("score"); // name | price | change24 | score | confidence
  const [allSortDir, setAllSortDir] = useState("desc");

  const [watchSort, setWatchSort] = useState("name"); // name | score | confidence
  const [watchIds, setWatchIds] = useState(new Set());

  const [selectedId, setSelectedId] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  // Shareable URL state control
  const urlHydratedRef = useRef(false);
  const lastUrlRef = useRef("");

  // URL-first hydration, then prefs
  useEffect(() => {
    setWatchIds(loadWatchlist());

    const sp = new URLSearchParams(window.location.search);

    const has = {
      view: sp.has("view"),
      q: sp.has("q"),
      high: sp.has("high"),
      regime: sp.has("regime"),
      liq: sp.has("liq"),
      sort: sp.has("sort"),
      dir: sp.has("dir"),
      page: sp.has("page"),
      ps: sp.has("ps"),
      ws: sp.has("ws"),
    };

    // URL
    if (has.view) {
      const v = sp.get("view");
      if (v === "all" || v === "watchlist") setView(v);
    }
    if (has.q) setSearch(sp.get("q") ?? "");

    if (has.high) {
      const b = parseBoolParam(sp.get("high"));
      if (typeof b === "boolean") setOnlyHigh(b);
    }

    if (has.regime) {
      const r = sp.get("regime");
      if (["All", "Risk-On", "Neutral", "Risk-Off"].includes(String(r))) setRegimeFilter(String(r));
    }

    if (has.liq) {
      const l = sp.get("liq");
      if (["Any", "Medium+", "High"].includes(String(l))) setLiquidityFilter(String(l));
    }

    if (has.sort) {
      const k = sp.get("sort");
      if (["name", "price", "change24", "score", "confidence"].includes(String(k))) setAllSortKey(String(k));
    }

    if (has.dir) {
      const d = sp.get("dir");
      if (d === "asc" || d === "desc") setAllSortDir(d);
    }

    if (has.ps) {
      const ps = clampInt(sp.get("ps"), 10, 100);
      if (ps && [10, 25, 50, 100].includes(ps)) setPageSize(ps);
    }

    if (has.page) {
      const p = clampInt(sp.get("page"), 1, 999);
      if (p) setPage(p);
    }

    if (has.ws) {
      const ws = sp.get("ws");
      if (["name", "score", "confidence"].includes(String(ws))) setWatchSort(String(ws));
    }

    // Prefs (only if URL didn't set it)
    const p = loadPrefs();
    if (!has.view && p?.view) setView(p.view);
    if (!has.high && typeof p?.onlyHigh === "boolean") setOnlyHigh(p.onlyHigh);
    if (!has.sort && p?.allSortKey) setAllSortKey(p.allSortKey);
    if (!has.dir && p?.allSortDir) setAllSortDir(p.allSortDir);
    if (!has.ws && p?.watchSort) setWatchSort(p.watchSort);
    if (!has.ps && p?.pageSize) setPageSize(p.pageSize);
    if (!has.regime && p?.regimeFilter) setRegimeFilter(p.regimeFilter);
    if (!has.liq && p?.liquidityFilter) setLiquidityFilter(p.liquidityFilter);

    urlHydratedRef.current = true;
  }, []);

  // Save prefs
  useEffect(() => {
    savePrefs({
      view,
      onlyHigh,
      allSortKey,
      allSortDir,
      watchSort,
      pageSize,
      regimeFilter,
      liquidityFilter,
    });
  }, [view, onlyHigh, allSortKey, allSortDir, watchSort, pageSize, regimeFilter, liquidityFilter]);

  // Write state -> URL (shareability)
  useEffect(() => {
    if (!urlHydratedRef.current) return;

    const sp = new URLSearchParams();

    if (view !== "all") sp.set("view", view);
    if (search.trim()) sp.set("q", search.trim());
    if (onlyHigh) sp.set("high", "1");

    if (regimeFilter !== "All") sp.set("regime", regimeFilter);
    if (liquidityFilter !== "Any") sp.set("liq", liquidityFilter);

    if (allSortKey !== "score") sp.set("sort", allSortKey);
    if (allSortDir !== "desc") sp.set("dir", allSortDir);

    if (pageSize !== 25) sp.set("ps", String(pageSize));

    if (view === "all" && page > 1) sp.set("page", String(page));
    if (view === "watchlist" && watchSort !== "name") sp.set("ws", watchSort);

    const next = sp.toString();
    const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;

    if (lastUrlRef.current !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
      lastUrlRef.current = nextUrl;
    }
  }, [view, search, onlyHigh, regimeFilter, liquidityFilter, allSortKey, allSortDir, pageSize, page, watchSort]);

  // Fetch assets
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStatus({ loading: true, error: "" });

        const url = new URL("/api/markets", window.location.origin);
        if (speculativeMode) url.searchParams.set("speculative", "true");

        const r = await fetch(url.toString(), { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || `API error (${r.status})`);

        const normalized = (j.assets || j.data || []).map((a) => ({
          ...a,
          current_price: a.current_price ?? a.priceUsd,
          price_change_percentage_24h_in_currency: a.price_change_percentage_24h_in_currency ?? a.priceChange24h,
          score: a.score ?? a.momentumScore,
        }));

        if (!cancelled) {
          setAssets(normalized);
          setStatus({ loading: false, error: "" });
        }
      } catch (e) {
        if (!cancelled) setStatus({ loading: false, error: String(e?.message || e) });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [speculativeMode]);

  function toggleWatch(id) {
    setWatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveWatchlist(next);
      return next;
    });
  }

  function toggleAllSort(key) {
    if (allSortKey === key) {
      const nextDir = allSortDir === "asc" ? "desc" : "asc";
      setAllSortDir(nextDir);
      setPage(1);
      return;
    }
    setAllSortKey(key);
    setAllSortDir(key === "name" ? "asc" : "desc");
    setPage(1);
  }

  function sortHint(key) {
    if (allSortKey !== key) return "";
    return allSortDir === "asc" ? "↑" : "↓";
  }

  function resetAllFilters() {
    setSearch("");
    setOnlyHigh(false);
    setRegimeFilter("All");
    setLiquidityFilter("Any");
    setPage(1);
  }

  function copyShareLink() {
    try {
      navigator.clipboard.writeText(window.location.href);
      alert("Shareable link copied.");
    } catch {
      alert("Unable to copy link.");
    }
  }

  function handleSpeculativeClick() {
    alert("Speculative Mode is Premium (locked). Default stays Curated Market.");
    setSpeculativeMode(false);
  }

  function handleCompareClick() {
    alert("Pinned comparison is a Premium feature (locked).");
  }

  const globallyFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = assets;

    if (q) {
      out = out.filter((c) => {
        const name = String(c.name || "").toLowerCase();
        const sym = String(c.symbol || "").toLowerCase();
        return name.includes(q) || sym.includes(q);
      });
    }

    if (onlyHigh) out = out.filter((c) => labelFromConfidence(c) === "High");
    if (regimeFilter !== "All") out = out.filter((c) => String(c.regime || "—") === regimeFilter);

    if (liquidityFilter === "High") out = out.filter((c) => liquidityToNumber(c) >= 3);
    else if (liquidityFilter === "Medium+") out = out.filter((c) => liquidityToNumber(c) >= 2);

    return out;
  }, [assets, search, onlyHigh, regimeFilter, liquidityFilter]);

  const allSorted = useMemo(() => sortArray(globallyFiltered, allSortKey, allSortDir), [
    globallyFiltered,
    allSortKey,
    allSortDir,
  ]);

  const watchlistItems = useMemo(() => {
    const items = globallyFiltered.filter((c) => watchIds.has(c.id));
    const dir = watchSort === "name" ? "asc" : "desc";
    return sortArray(items, watchSort, dir);
  }, [globallyFiltered, watchIds, watchSort]);

  const totalPages = useMemo(() => {
    if (view !== "all") return 1;
    return Math.max(1, Math.ceil(allSorted.length / pageSize));
  }, [allSorted.length, pageSize, view]);

  useEffect(() => {
    if (view === "all" && page > totalPages) setPage(1);
  }, [page, totalPages, view]);

  const paginatedAll = useMemo(() => {
    const start = (page - 1) * pageSize;
    return allSorted.slice(start, start + pageSize);
  }, [allSorted, page, pageSize]);

  const rows = view === "watchlist" ? watchlistItems : paginatedAll;

  const resultsMeta = useMemo(() => {
    return {
      totalUniverse: assets.length,
      filteredTotal: globallyFiltered.length,
      showing: rows.length,
    };
  }, [assets.length, globallyFiltered.length, rows.length]);

  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (search.trim()) {
      chips.push({
        key: "search",
        label: `Search: "${search.trim()}"`,
        onClear: () => {
          setSearch("");
          setPage(1);
        },
      });
    }
    if (onlyHigh) {
      chips.push({
        key: "onlyHigh",
        label: "Only High confidence",
        onClear: () => {
          setOnlyHigh(false);
          setPage(1);
        },
      });
    }
    if (regimeFilter !== "All") {
      chips.push({
        key: "regime",
        label: `Regime: ${regimeFilter}`,
        onClear: () => {
          setRegimeFilter("All");
          setPage(1);
        },
      });
    }
    if (liquidityFilter !== "Any") {
      chips.push({
        key: "liquidity",
        label: `Liquidity: ${liquidityFilter}`,
        onClear: () => {
          setLiquidityFilter("Any");
          setPage(1);
        },
      });
    }

    return chips;
  }, [search, onlyHigh, regimeFilter, liquidityFilter]);

  const marketStats = useMemo(() => {
    const list = globallyFiltered;
    if (!list.length) return { riskOn: 0, neutral: 0, riskOff: 0, avgScore: 0, highConfidencePct: 0 };

    const total = list.length;
    const riskOn = list.filter((a) => a.regime === "Risk-On").length;
    const neutral = list.filter((a) => a.regime === "Neutral").length;
    const riskOff = list.filter((a) => a.regime === "Risk-Off").length;

    const avgScore =
      Math.round(list.reduce((sum, a) => sum + (Number(a.score ?? a.momentumScore ?? 0) || 0), 0) / total) || 0;

    const highConfidence = list.filter((a) => labelFromConfidence(a) === "High").length;

    return {
      riskOn: Math.round((riskOn / total) * 100),
      neutral: Math.round((neutral / total) * 100),
      riskOff: Math.round((riskOff / total) * 100),
      avgScore,
      highConfidencePct: Math.round((highConfidence / total) * 100),
    };
  }, [globallyFiltered]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return assets.find((a) => a.id === selectedId) || null;
  }, [assets, selectedId]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-2xl font-semibold text-slate-900">Altcoin Momentum Dashboard</div>
            <div className="mt-1 text-sm text-slate-600">
              Calm, explainable momentum scoring. Default universe is curated for signal quality.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`rounded-xl px-3 py-2 text-sm border ${
                view === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => {
                setView("all");
                setPage(1);
              }}
              type="button"
            >
              All
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-sm border ${
                view === "watchlist"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => setView("watchlist")}
              type="button"
            >
              Watchlist
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Search assets (name or ticker)…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <button
              className={`w-full rounded-xl px-3 py-3 text-sm border ${
                onlyHigh ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => {
                setOnlyHigh((v) => !v);
                setPage(1);
              }}
              type="button"
              title="Show only High confidence assets"
            >
              Only High confidence
            </button>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm bg-white"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filters row + actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="text-xs text-slate-500 mr-1">Regime</div>
          {["All", "Risk-On", "Neutral", "Risk-Off"].map((r) => (
            <Pill
              key={r}
              active={regimeFilter === r}
              onClick={() => {
                setRegimeFilter(r);
                setPage(1);
              }}
              title={`Filter: ${r}`}
            >
              {r}
            </Pill>
          ))}

          <div className="w-px h-6 bg-slate-200 mx-2" />

          <div className="text-xs text-slate-500 mr-1">Liquidity</div>
          {["Any", "Medium+", "High"].map((l) => (
            <Pill
              key={l}
              active={liquidityFilter === l}
              onClick={() => {
                setLiquidityFilter(l);
                setPage(1);
              }}
              title={`Filter: ${l}`}
            >
              {l}
            </Pill>
          ))}

          <div className="w-px h-6 bg-slate-200 mx-2" />

          <button
            type="button"
            onClick={handleSpeculativeClick}
            className="rounded-full px-3 py-1.5 text-xs border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 inline-flex items-center gap-2"
            title="Premium: Include High-Volatility / Meme Assets (locked)"
          >
            <span className="text-slate-500">🔒</span>
            Speculative Mode (Premium)
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={copyShareLink}
              title="Copy shareable link"
            >
              Copy Link
            </button>

            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={resetAllFilters}
              title="Reset search + filters"
            >
              Reset all filters
            </button>
          </div>
        </div>

        {/* Active filters + Results count */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="text-xs text-slate-500">
            {view === "all" ? (
              <>
                Showing <span className="text-slate-900 font-semibold">{resultsMeta.showing}</span> of{" "}
                <span className="text-slate-900 font-semibold">{resultsMeta.filteredTotal}</span> (Universe{" "}
                <span className="text-slate-900 font-semibold">{resultsMeta.totalUniverse}</span>)
              </>
            ) : (
              <>
                Watchlist showing <span className="text-slate-900 font-semibold">{resultsMeta.showing}</span> of{" "}
                <span className="text-slate-900 font-semibold">{watchlistItems.length}</span>
              </>
            )}
          </div>

          {activeFilterChips.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterChips.map((c) => (
                <FilterChip key={c.key} label={c.label} onClear={c.onClear} title="Click to remove this filter" />
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No active filters</div>
          )}
        </div>

        {/* Market Regime Overview */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs text-emerald-700">Risk-On</div>
            <div className="mt-1 text-xl font-semibold text-emerald-900">{marketStats.riskOn}%</div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs text-amber-700">Neutral</div>
            <div className="mt-1 text-xl font-semibold text-amber-900">{marketStats.neutral}%</div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="text-xs text-rose-700">Risk-Off</div>
            <div className="mt-1 text-xl font-semibold text-rose-900">{marketStats.riskOff}%</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Avg Momentum</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{marketStats.avgScore}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-500">High Confidence</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{marketStats.highConfidencePct}%</div>
          </div>
        </div>

        {/* Market Breadth Bar (clickable) */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Market breadth</div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Click a segment to filter Regime</span>
              <button
                type="button"
                className="underline hover:text-slate-700"
                onClick={() => {
                  setRegimeFilter("All");
                  setPage(1);
                }}
                title="Reset regime filter"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="mt-3 h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-50">
            <div className="flex h-full w-full">
              <button
                type="button"
                className="h-full bg-emerald-400/60 hover:bg-emerald-400/80 transition"
                style={{ width: pctWidth(marketStats.riskOn) }}
                title={`Risk-On ${marketStats.riskOn}% (click to filter)`}
                onClick={() => {
                  setRegimeFilter("Risk-On");
                  setPage(1);
                }}
              />
              <button
                type="button"
                className="h-full bg-amber-400/60 hover:bg-amber-400/80 transition"
                style={{ width: pctWidth(marketStats.neutral) }}
                title={`Neutral ${marketStats.neutral}% (click to filter)`}
                onClick={() => {
                  setRegimeFilter("Neutral");
                  setPage(1);
                }}
              />
              <button
                type="button"
                className="h-full bg-rose-400/60 hover:bg-rose-400/80 transition"
                style={{ width: pctWidth(marketStats.riskOff) }}
                title={`Risk-Off ${marketStats.riskOff}% (click to filter)`}
                onClick={() => {
                  setRegimeFilter("Risk-Off");
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {/* Watchlist sort (only visible in watchlist view) */}
        {view === "watchlist" ? (
          <div className="mt-4 flex items-center justify-end">
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
              value={watchSort}
              onChange={(e) => setWatchSort(e.target.value)}
              title="Sort watchlist"
            >
              <option value="name">Sort: Name</option>
              <option value="score">Sort: Momentum</option>
              <option value="confidence">Sort: Confidence</option>
            </select>
          </div>
        ) : null}

        {/* Error */}
        {status.error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <b>Error:</b> {status.error}
          </div>
        ) : null}

        {/* Table */}
        <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Watch</th>

                <th className="px-4 py-3 text-left">
                  <button
                    className={`inline-flex items-center gap-2 hover:text-slate-900 ${view === "watchlist" ? "cursor-default" : ""}`}
                    onClick={() => {
                      if (view === "all") toggleAllSort("name");
                    }}
                    title={view === "all" ? "Sort by name" : "Watchlist sorting is controlled above"}
                    type="button"
                  >
                    Asset
                    {view === "all" ? <span className="text-xs text-slate-500">{sortHint("name")}</span> : null}
                  </button>
                </th>

                <th className="px-4 py-3 text-right">
                  <button
                    className={`inline-flex items-center gap-2 hover:text-slate-900 ${view === "watchlist" ? "cursor-default" : ""}`}
                    onClick={() => {
                      if (view === "all") toggleAllSort("price");
                    }}
                    title={view === "all" ? "Sort by price" : "Watchlist sorting is controlled above"}
                    type="button"
                  >
                    Price
                    {view === "all" ? <span className="text-xs text-slate-500">{sortHint("price")}</span> : null}
                  </button>
                </th>

                <th className="px-4 py-3 text-right">
                  <button
                    className={`inline-flex items-center gap-2 hover:text-slate-900 ${view === "watchlist" ? "cursor-default" : ""}`}
                    onClick={() => {
                      if (view === "all") toggleAllSort("change24");
                    }}
                    title={view === "all" ? "Sort by 24h change" : "Watchlist sorting is controlled above"}
                    type="button"
                  >
                    24h
                    {view === "all" ? <span className="text-xs text-slate-500">{sortHint("change24")}</span> : null}
                  </button>
                </th>

                <th className="px-4 py-3 text-right">
                  <button
                    className={`inline-flex items-center gap-2 hover:text-slate-900 ${view === "watchlist" ? "cursor-default" : ""}`}
                    onClick={() => {
                      if (view === "all") toggleAllSort("score");
                    }}
                    title={view === "all" ? "Sort by momentum score" : "Watchlist sorting is controlled above"}
                    type="button"
                  >
                    Momentum
                    {view === "all" ? <span className="text-xs text-slate-500">{sortHint("score")}</span> : null}
                  </button>
                </th>

                <th className="px-4 py-3 text-left">
                  <button
                    className={`inline-flex flex-col items-start hover:text-slate-900 ${view === "watchlist" ? "cursor-default" : ""}`}
                    onClick={() => {
                      if (view === "all") toggleAllSort("confidence");
                    }}
                    title={view === "all" ? "Sort by confidence" : "Watchlist sorting is controlled above"}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      Confidence
                      {view === "all" ? <span className="text-xs text-slate-500">{sortHint("confidence")}</span> : null}
                    </span>
                    <span className="text-[11px] font-normal text-slate-400">Liquidity-weighted</span>
                  </button>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {status.loading && view === "all" ? (
                Array.from({ length: pageSize }).map((_, i) => <SkeletonRow key={i} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-slate-600" colSpan={6}>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">No results</div>
                      <div className="text-sm text-slate-600">
                        Try a different search or loosen filters.{" "}
                        <button className="underline" type="button" onClick={resetAllFilters}>
                          Reset all filters
                        </button>
                        .
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const confidenceLabel = labelFromConfidence(c);
                  const confidenceTone =
                    confidenceLabel === "High" ? "good" : confidenceLabel === "Medium" ? "warn" : "bad";

                  const watched = watchIds.has(c.id);

                  const score = c.score ?? c.momentumScore ?? "—";
                  const price = c.current_price ?? c.priceUsd;
                  const change24h = c.price_change_percentage_24h_in_currency ?? c.priceChange24h;

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        setSelectedId(c.id);
                        setShowRaw(false);
                      }}
                      title="Click for explanation"
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <StarButton active={watched} onClick={() => toggleWatch(c.id)} />
                          <CompareButtonLocked onClick={handleCompareClick} />
                        </div>
                      </td>

                      <td className="px-4 py-3 font-medium">
                        {c.name}{" "}
                        <span className="text-slate-400 font-medium">({String(c.symbol || "").toUpperCase()})</span>
                      </td>

                      <td className="px-4 py-3 text-right">{formatMoney(price)}</td>
                      <td className="px-4 py-3 text-right">{formatPct(change24h)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{score}</td>

                      <td className="px-4 py-3">
                        <span title="Liquidity-weighted confidence. Click row for details.">
                          <Badge tone={confidenceTone}>{confidenceLabel}</Badge>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {view === "all" ? (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Page <b className="text-slate-900">{page}</b> / <b className="text-slate-900">{totalPages}</b> •{" "}
              <b className="text-slate-900">{allSorted.length}</b> results
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                type="button"
              >
                Prev
              </button>
              <button
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Explain Modal */}
      <Modal
        open={Boolean(selected)}
        title={selected ? `${selected.name} (${String(selected.symbol || "").toUpperCase()})` : "Explanation"}
        onClose={() => {
          setSelectedId(null);
          setShowRaw(false);
        }}
      >
        {!selected ? null : (() => {
          const snap = buildExplainSnapshot(selected);

          const score = selected.score ?? selected.momentumScore ?? "—";
          const conf = labelFromConfidence(selected);
          const liq = selected.liquidityStrength ?? "—";
          const reg = selected.regime ?? "—";
          const price = selected.current_price ?? selected.priceUsd;
          const change24 = selected.price_change_percentage_24h_in_currency ?? selected.priceChange24h;

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">Price</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatMoney(price)}</div>
                  <div className="mt-1 text-sm text-slate-600">{formatPct(change24)} (24h)</div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">Momentum</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{score}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">Confidence</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{conf}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Snapshot</div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {snap.chips.map((c, i) => (
                    <ReasonChip key={i} tone={c.tone}>
                      {c.text}
                    </ReasonChip>
                  ))}
                </div>

                <div className="mt-3 space-y-1">
                  {snap.bullets.map((b, i) => (
                    <div key={i} className="text-sm text-slate-700">
                      • {b}
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-200 pt-3">
                  <KeyValue k="Regime" v={reg} />
                  <KeyValue k="Liquidity" v={liq} />
                  {typeof selected.volatility === "number" ? <KeyValue k="Volatility" v={selected.volatility} /> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Advanced</div>
                  <button
                    type="button"
                    className="text-xs underline text-slate-600 hover:text-slate-900"
                    onClick={() => setShowRaw((v) => !v)}
                  >
                    {showRaw ? "Hide raw data" : "Show raw data"}
                  </button>
                </div>

                {showRaw ? (
                  <pre className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto">
                    {JSON.stringify(selected, null, 2)}
                  </pre>
                ) : (
                  <div className="mt-2 text-sm text-slate-600">
                    Raw fields are available for power users, but the snapshot is designed to keep decision-making disciplined.
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}