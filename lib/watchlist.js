// lib/watchlist.js
const KEY = "altcoin_momentum_watchlist_v1";

/**
 * Returns an array of coin IDs (strings).
 */
export function loadWatchlist() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Accepts an array of coin IDs (strings).
 */
export function saveWatchlist(ids) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // ignore storage failures
  }
}
