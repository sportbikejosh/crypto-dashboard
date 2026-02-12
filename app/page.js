"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeConfidence, computeMomentumBreakdown } from "../lib/momentum";
import { loadWatchlist, saveWatchlist } from "../lib/watchlist";
import { loadPreferences, resetPreferences, savePreferences } from "../lib/preferences";
import {
  Star,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Link2,
  ArrowUpDown,
  Columns2,
  Lock,
} from "lucide-react";

const REFRESH_INTERVAL_MS = 60_000;

// ---------- utils ----------
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

function clampEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clampNum(value, allowed, fallback) {
  const n = Number(value);
  return allowed.includes(n) ? n : fallback;
}

function clampPage(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function toBool(value) {
  if (value == null) return null;
  const v = String(value).toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return null;
}

async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

// ---------- UI bits ----------
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

function Chip({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-slate-100"
          aria-label="Remove filter"
          title="Remove filter"
        >
          <X className="h-3.5 w-3.5 text-slate-500" />
        </button>
      ) : null}
    </span>
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

function StarButton({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`h-9 w-9 rounded-xl border flex items-center justify-center transition ${
        active ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200 hover:bg-slate-50"
      }`}
      title={active ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
    >
      <Star className={`h-4 w-4 ${active ? "text-amber-700" : "text-slate-400"}`} fill={active ? "currentColor" : "none"} />
    </button>
  );
}

// Premium-locked compare button (visual lock, click opens modal)
function CompareButtonLocked({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="h-9 w-9 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition"
      title="Compare (Premium)"
      aria-label="Compare (Premium)"
    >
      <div className="relative">
        <Columns2 className="h-4 w-4 text-slate-500" />
        <Lock className="h-3 w-3 text-slate-500 absolute -right-2 -bottom-2" />
      </div>
    </button>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200" />
          <div className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200" />
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="h-4 bg-slate-100 rounded w-40" />
        <div className="mt-2 h-3 bg-slate-100 rounded w-24" />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="ml-auto h-4 bg-slate-100 rounded w-20" />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="ml-auto h-4 bg-slate-100 rounded w-16" />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="ml-auto h-4 bg-slate-100 rounded w-12" />
      </td>
      <td className="px-4 py-4">
        <div className="h-6 w-24 rounded-full bg-slate-100" />
      </td>
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

function Drawer({ open, onClose, coin }) {
  if (!open || !coin) return null;

  const label = coin.confidence?.label ?? "—";
  const tone = label === "High" ? "good" : label === "Medium" ? "warn" : "bad";
  const drivers = coin.breakdown?.drivers || [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl border-l border-slate-200">
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900 truncate">{coin.name}</div>
            <div className="mt-1 text-sm text-slate-500 truncate">
              {coin.symbol?.toUpperCase()} • {formatMoney(coin.current_price)} • 24h{" "}
              {formatPct(coin.price_change_percentage_24h_in_currency)}
            </div>
          </div>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto h-[calc(100%-76px)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Momentum Score</div>
              <div className="text-2xl font-semibold text-slate-900">{coin.score}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={tone}>Confidence: {label}</Badge>
              <span className="text-xs text-slate-500">Momentum ≠ prediction</span>
            </div>
            <p className="mt-3 text-sm text-slate-700 leading-relaxed">{coin.confidence?.explanation || ""}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">What’s driving this score</div>
            {drivers.length ? (
              <ul className="mt-3 space-y-2">
                {drivers.slice(0, 8).map((d, idx) => (
                  <li key={idx} className="text-sm text-slate-700 flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 text-sm text-slate-600">No breakdown available.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Notes</div>
            <div className="mt-2 text-sm text-slate-600 leading-relaxed">
              Use momentum for ranking and timing context — not as a price prediction.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PremiumModal({ open, onClose }) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">Premium Feature</div>
              <div className="mt-1 text-sm text-slate-600">
                Pinned comparison is available on the paid plan.
              </div>
            </div>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <Columns2 className="h-5 w-5" />
                Pinned Comparison
                <Badge>Premium</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                Compare two assets side-by-side with momentum drivers and confidence context — designed for calm decision-support.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  Pin up to two assets to compare
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  Side-by-side momentum + confidence explanations
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  Shareable comparison links (coming with auth)
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                (No checkout/auth yet — this is a visual lock for now.)
              </div>
              <button
                className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                onClick={onClose}
                title="Placeholder CTA (auth/checkout later)"
              >
                View pricing
              </button>
            </div>
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
  const [view, setView] = useState("all"); // all | watchlist

  const [watchIds, setWatchIds] = useState(new Set());

  const [marketLimit, setMarketLimit] = useState(250);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const [fetchedAt, setFetchedAt] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Global filter
  const [onlyHigh, setOnlyHigh] = useState(false);

  // Sorting
  const [allSortKey, setAllSortKey] = useState("score"); // score | change24 | name | price
  const [allSortDir, setAllSortDir] = useState("desc"); // asc | desc
  const [watchSort, setWatchSort] = useState("score"); // score | change24 | name | price

  // Drawer
  const [selectedId, setSelectedId] = useState(null);

  // Premium lock
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [compareTeaserVisible, setCompareTeaserVisible] = useState(false);

  // Share feedback
  const [shareStatus, setShareStatus] = useState(""); // "", "copied", "failed"

  const inFlight = useRef(false);

  // Preferences (persist)
  const [prefs, setPrefs] = useState(null);

  // Defaults for "Clear filters"
  const defaultsRef = useRef({ onlyHigh: false });

  // URL sync
  const hydratedRef = useRef(false);
  const lastUrlRef = useRef("");

  // Refs for keyboard shortcuts
  const searchRef = useRef(null);

  // --------- initial load: watchlist + prefs + URL override ----------
  useEffect(() => {
    setWatchIds(new Set(loadWatchlist()));

    const p = loadPreferences();
    setPrefs(p);

    const baseMarketLimit = clampNum(p.marketLimit, [50, 100, 250], 250);
    const basePageSize = clampNum(p.pageSize, [25, 50], 25);
    const baseOnlyHigh = !!p.watchOnlyHighDefault;

    const baseAllSortKey = clampEnum(p.allSortKey, ["score", "change24", "name", "price"], "score");
    const baseAllSortDir = clampEnum(p.allSortDir, ["asc", "desc"], "desc");
    const baseWatchSort = clampEnum(p.watchSortDefault, ["score", "change24", "name", "price"], "score");

    defaultsRef.current.onlyHigh = baseOnlyHigh;

    let urlView = null;
    let urlQ = null;
    let urlHigh = null;
    let urlLimit = null;
    let urlSize = null;
    let urlPage = null;

    let urlSort = null;
    let urlDir = null;
    let urlWsort = null;
    let urlSel = null;

    try {
      const sp = new URLSearchParams(window.location.search);
      urlView = sp.get("view");
      urlQ = sp.get("q");
      urlHigh = toBool(sp.get("high"));
      urlLimit = sp.get("limit");
      urlSize = sp.get("size");
      urlPage = sp.get("page");

      urlSort = sp.get("sort");
      urlDir = sp.get("dir");
      urlWsort = sp.get("wsort");
      urlSel = sp.get("sel");
    } catch {}

    setView(clampEnum(urlView, ["all", "watchlist"], "all"));
    setQuery(typeof urlQ === "string" ? urlQ : "");

    const nextOnlyHigh = urlHigh === null ? baseOnlyHigh : urlHigh;
    setOnlyHigh(nextOnlyHigh);

    setMarketLimit(clampNum(urlLimit, [50, 100, 250], baseMarketLimit));
    setPageSize(clampNum(urlSize, [25, 50], basePageSize));
    setPage(clampPage(urlPage, 1));

    setAllSortKey(clampEnum(urlSort, ["score", "change24", "name", "price"], baseAllSortKey));
    setAllSortDir(clampEnum(urlDir, ["asc", "desc"], baseAllSortDir));
    setWatchSort(clampEnum(urlWsort, ["score", "change24", "name", "price"], baseWatchSort));

    setSelectedId(urlSel ? String(urlSel) : null);

    hydratedRef.current = true;
  }, []);

  // --------- keyboard shortcuts ----------
  useEffect(() => {
    function onKeyDown(e) {
      const tag = (e.target?.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || e.target?.isContentEditable;

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus?.();
        return;
      }

      if (e.key === "Escape") {
        if (premiumOpen) {
          setPremiumOpen(false);
          return;
        }
        if (selectedId) {
          setSelectedId(null);
          return;
        }
        if (query) {
          setQuery("");
          setPage(1);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query, selectedId, premiumOpen]);

  // --------- persist watchlist ----------
  useEffect(() => {
    saveWatchlist(Array.from(watchIds));
  }, [watchIds]);

  // --------- persist prefs ----------
  useEffect(() => {
    if (!prefs) return;
    savePreferences(prefs);
  }, [prefs]);

  function updatePrefs(patch) {
    setPrefs((prev) => {
      const base = prev || loadPreferences();
      return { ...base, ...(patch || {}) };
    });
  }

  function doResetPreferences() {
    resetPreferences();
    const p = loadPreferences();
    setPrefs(p);

    const baseMarketLimit = clampNum(p.marketLimit, [50, 100, 250], 250);
    const basePageSize = clampNum(p.pageSize, [25, 50], 25);
    const baseOnlyHigh = !!p.watchOnlyHighDefault;

    const baseAllSortKey = clampEnum(p.allSortKey, ["score", "change24", "name", "price"], "score");
    const baseAllSortDir = clampEnum(p.allSortDir, ["asc", "desc"], "desc");
    const baseWatchSort = clampEnum(p.watchSortDefault, ["score", "change24", "name", "price"], "score");

    setMarketLimit(baseMarketLimit);
    setPageSize(basePageSize);

    setOnlyHigh(baseOnlyHigh);
    defaultsRef.current.onlyHigh = baseOnlyHigh;

    setAllSortKey(baseAllSortKey);
    setAllSortDir(baseAllSortDir);
    setWatchSort(baseWatchSort);

    setQuery("");
    setPage(1);
    setSelectedId(null);

    try {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url.toString());
      lastUrlRef.current = url.toString();
    } catch {}
  }

  function clearFilters() {
    setQuery("");
    setOnlyHigh(defaultsRef.current.onlyHigh);
    setPage(1);
  }

  // --------- data loading ----------
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketLimit]);

  useEffect(() => {
    const id = setInterval(() => load(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketLimit]);

  // --------- compute model outputs ----------
  const enriched = useMemo(() => {
    return coins.map((c) => {
      const breakdown = computeMomentumBreakdown(c);
      const confidence = computeConfidence(breakdown);
      return { ...c, breakdown, score: breakdown.score, confidence };
    });
  }, [coins]);

  const searched = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return enriched;
    return enriched.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
  }, [enriched, query]);

  const globallyFiltered = useMemo(() => {
    if (!onlyHigh) return searched;
    return searched.filter((c) => c.confidence?.label === "High");
  }, [searched, onlyHigh]);

  // Sorting helper
  function sortArray(arr, key, dir) {
    const mult = dir === "asc" ? 1 : -1;

    const get = (c) => {
      switch (key) {
        case "name":
          return String(c.name || "");
        case "price":
          return Number(c.current_price ?? 0);
        case "change24":
          return Number(c.price_change_percentage_24h_in_currency ?? 0);
        case "score":
        default:
          return Number(c.score ?? 0);
      }
    };

    const out = [...arr];
    out.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * mult;
      }
      return (va - vb) * mult;
    });
    return out;
  }

  const allSorted = useMemo(() => sortArray(globallyFiltered, allSortKey, allSortDir), [globallyFiltered, allSortKey, allSortDir]);

  const watchlistItems = useMemo(() => {
    const items = globallyFiltered.filter((c) => watchIds.has(c.id));
    const dir = watchSort === "name" ? "asc" : "desc";
    return sortArray(items, watchSort, dir);
  }, [globallyFiltered, watchIds, watchSort]);

  const paginatedAll = useMemo(() => {
    const start = (page - 1) * pageSize;
    return allSorted.slice(start, start + pageSize);
  }, [allSorted, page, pageSize]);

  const rows = view === "watchlist" ? watchlistItems : paginatedAll;

  const totalPages = useMemo(() => {
    if (view !== "all") return 1;
    return Math.max(1, Math.ceil(allSorted.length / pageSize));
  }, [allSorted.length, pageSize, view]);

  useEffect(() => {
    if (view === "all" && page > totalPages) setPage(1);
  }, [page, totalPages, view]);

  const watchSummary = useMemo(() => {
    const items = watchlistItems;
    const count = items.length;
    if (!count) return { count: 0, avg: "—", high: 0 };
    const avg = Math.round(items.reduce((sum, c) => sum + (c.score ?? 0), 0) / count);
    const high = items.filter((c) => c.confidence?.label === "High").length;
    return { count, avg, high };
  }, [watchlistItems]);

  function toggleWatch(id) {
    setWatchIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // --------- sorting UI handlers ----------
  function toggleAllSort(key) {
    if (allSortKey === key) {
      const nextDir = allSortDir === "asc" ? "desc" : "asc";
      setAllSortDir(nextDir);
      updatePrefs({ allSortDir: nextDir });
      return;
    }
    const nextDir = key === "name" ? "asc" : "desc";
    setAllSortKey(key);
    setAllSortDir(nextDir);
    updatePrefs({ allSortKey: key, allSortDir: nextDir });
    setPage(1);
  }

  function sortHint(key) {
    if (allSortKey !== key) return "";
    return allSortDir === "asc" ? " ▲" : " ▼";
  }

  // --------- Premium locked compare handler ----------
  function handleCompareClick() {
    setCompareTeaserVisible(true);
    setPremiumOpen(true);
  }

  // --------- URL sync + Share URL builder ----------
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    const sp = new URLSearchParams();

    sp.set("view", view);
    if (query.trim()) sp.set("q", query.trim());
    sp.set("high", onlyHigh ? "1" : "0");
    sp.set("limit", String(marketLimit));
    sp.set("size", String(pageSize));
    sp.set("page", String(page));

    sp.set("sort", allSortKey);
    sp.set("dir", allSortDir);
    sp.set("wsort", watchSort);

    if (selectedId) sp.set("sel", String(selectedId));

    url.search = sp.toString();
    return url.toString();
  }, [view, query, onlyHigh, marketLimit, pageSize, page, allSortKey, allSortDir, watchSort, selectedId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      if (shareUrl && shareUrl !== lastUrlRef.current) {
        window.history.replaceState({}, "", shareUrl);
        lastUrlRef.current = shareUrl;
      }
    } catch {}
  }, [shareUrl]);

  async function handleShare() {
    const ok = await copyToClipboard(shareUrl);
    setShareStatus(ok ? "copied" : "failed");
    window.clearTimeout(handleShare._t);
    handleShare._t = window.setTimeout(() => setShareStatus(""), 1600);
  }

  const hasActiveFilters = query.trim().length > 0 || onlyHigh !== defaultsRef.current.onlyHigh;

  const selectedCoin = useMemo(() => {
    if (!selectedId) return null;
    return enriched.find((c) => c.id === selectedId) || null;
  }, [selectedId, enriched]);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Crypto Momentum Dashboard</h1>
            <div className="text-xs text-slate-500 mt-1">
              {fetchedAt ? `Last updated: ${formatTime(fetchedAt)}` : ""}
              <span className="ml-2 text-slate-300">•</span>
              <span className="ml-2">
                Shortcuts: <b>/</b> search, <b>Esc</b> close/clear
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2 items-center justify-end">
              <input
                ref={searchRef}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Search..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />

              <button
                onClick={() => load(false)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50"
                title="Refresh data"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>

              <button
                onClick={handleShare}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50"
                title="Copy a shareable link with your current state"
              >
                <Link2 className="h-4 w-4" />
                Share link
              </button>

              <button
                onClick={doResetPreferences}
                className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
                title="Reset saved preferences on this device"
              >
                Reset preferences
              </button>
            </div>

            {shareStatus ? (
              <div className={`text-xs ${shareStatus === "copied" ? "text-emerald-700" : "text-rose-700"}`}>
                {shareStatus === "copied" ? "Link copied to clipboard." : "Couldn’t copy automatically — try again."}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 items-center justify-end">
              <Toggle
                checked={onlyHigh}
                onChange={(v) => {
                  setOnlyHigh(v);
                  setPage(1);
                  updatePrefs({ watchOnlyHighDefault: v });
                }}
                label="Only High confidence"
              />

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Limit</span>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700"
                  value={marketLimit}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMarketLimit(v);
                    setPage(1);
                    updatePrefs({ marketLimit: v });
                  }}
                >
                  <option value={50}>Top 50</option>
                  <option value={100}>Top 100</option>
                  <option value={250}>Top 250</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Page size</span>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700"
                  value={pageSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPageSize(v);
                    setPage(1);
                    updatePrefs({ pageSize: v });
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Watch sort</span>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700"
                  value={watchSort}
                  onChange={(e) => {
                    const v = clampEnum(e.target.value, ["score", "change24", "name", "price"], "score");
                    setWatchSort(v);
                    updatePrefs({ watchSortDefault: v });
                  }}
                >
                  <option value="score">Score</option>
                  <option value="change24">24h</option>
                  <option value="price">Price</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Filter className="h-4 w-4 text-slate-500" />
              <span className="font-medium">Filters</span>
              <span className="text-xs text-slate-500">{view === "watchlist" ? "Watchlist view" : "All assets view"}</span>
            </div>

            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Clear filters
                </button>
              ) : (
                <span className="text-xs text-slate-500">No active filters</span>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {query.trim() ? (
              <Chip
                onRemove={() => {
                  setQuery("");
                  setPage(1);
                }}
              >
                Search: <span className="font-medium">{query.trim()}</span>
              </Chip>
            ) : null}

            {onlyHigh ? (
              <Chip
                onRemove={() => {
                  setOnlyHigh(false);
                  setPage(1);
                  updatePrefs({ watchOnlyHighDefault: false });
                }}
              >
                Only High confidence
              </Chip>
            ) : null}

            <Chip>Limit: {marketLimit}</Chip>
            <Chip>Page size: {pageSize}</Chip>
            <Chip>
              All sort: {allSortKey} {allSortDir === "asc" ? "↑" : "↓"}
            </Chip>

            {compareTeaserVisible ? (
              <Chip onRemove={() => setCompareTeaserVisible(false)}>
                Compare <span className="text-slate-400">(Premium)</span>
              </Chip>
            ) : null}

            <span className="ml-auto text-xs text-slate-500">
              Showing <b>{rows.length}</b> item(s)
              {view === "all" ? (
                <>
                  {" "}
                  of <b>{allSorted.length}</b>
                </>
              ) : null}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => {
              setView("all");
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl border ${
              view === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 hover:bg-slate-50"
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setView("watchlist");
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl border ${
              view === "watchlist"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white border-slate-200 hover:bg-slate-50"
            }`}
          >
            Watchlist ({watchIds.size})
          </button>
        </div>

        {/* Watchlist Overview */}
        {view === "watchlist" ? (
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
            <StatCard title="Tracked Assets" value={watchSummary.count} />
            <StatCard title="Avg Momentum" value={watchSummary.avg} sub="0–100 scale" />
            <StatCard title="High Confidence" value={watchSummary.high} sub={onlyHigh ? "Filter: Only High" : ""} />
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
                  >
                    Momentum
                    {view === "all" ? <span className="text-xs text-slate-500">{sortHint("score")}</span> : null}
                  </button>
                </th>

                <th className="px-4 py-3 text-left">Confidence</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {status.loading && view === "all" ? (
                Array.from({ length: pageSize }).map((_, i) => <SkeletonRow key={i} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-slate-600" colSpan={6}>
                    {view === "watchlist" ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-slate-900">No watchlist results</div>
                        <div className="text-sm text-slate-600">
                          {onlyHigh ? (
                            <>
                              Your watchlist may be filtered out. Turn off <b>Only High confidence</b> to see everything.
                            </>
                          ) : (
                            <>
                              Your watchlist is empty. Go to <b>All</b> and star assets to track them.
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-slate-900">No results</div>
                        <div className="text-sm text-slate-600">
                          Try a different search. {onlyHigh ? "Or turn off Only High confidence." : ""}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const label = c.confidence?.label ?? "—";
                  const tone = label === "High" ? "good" : label === "Medium" ? "warn" : "bad";
                  const watched = watchIds.has(c.id);

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedId(c.id)}
                      title="Click for explanation"
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <StarButton active={watched} onClick={() => toggleWatch(c.id)} />
                          <CompareButtonLocked onClick={handleCompareClick} />
                        </div>
                      </td>

                      <td className="px-4 py-3 font-medium">
                        {c.name} <span className="text-slate-400 font-medium">({c.symbol.toUpperCase()})</span>
                      </td>

                      <td className="px-4 py-3 text-right">{formatMoney(c.current_price)}</td>
                      <td className="px-4 py-3 text-right">{formatPct(c.price_change_percentage_24h_in_currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{c.score}</td>
                      <td className="px-4 py-3">
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination only for All */}
          {view === "all" && !status.loading && rows.length > 0 ? (
            <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200">
              <div className="text-xs text-slate-500">
                Page {page} / {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-2 border border-slate-200 rounded-xl disabled:opacity-50 hover:bg-slate-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-2 border border-slate-200 rounded-xl disabled:opacity-50 hover:bg-slate-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Premium microcopy */}
        <div className="mt-4 text-xs text-slate-500 flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5" />
          Tip: Click table headers in <b>All</b> to sort. Click a row for explainability. <b>Compare</b> is a Premium feature.
        </div>
      </div>

      {/* Premium-locked Compare Bar teaser (appears after they try compare) */}
      {compareTeaserVisible ? (
        <div className="fixed bottom-4 left-0 right-0 z-30 px-4">
          <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-lg px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
                  <Columns2 className="h-4 w-4 text-slate-700" />
                  Compare
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                    <Lock className="h-3.5 w-3.5" />
                    Premium
                  </span>
                </span>

                <div className="ml-2 text-sm text-slate-600">
                  Pin 2 assets to compare side-by-side (locked).
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setCompareTeaserVisible(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => setPremiumOpen(true)}
                  className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                >
                  Upgrade to unlock
                </button>
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Calm decision-support: compare momentum drivers and confidence context. No predictions.
            </div>
          </div>
        </div>
      ) : null}

      <Drawer open={!!selectedId} onClose={() => setSelectedId(null)} coin={selectedCoin} />
      <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} />
    </main>
  );
}
