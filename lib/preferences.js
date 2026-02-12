// lib/preferences.js
const KEY = "crypto_momentum_preferences_v1";

const DEFAULTS = {
  onboardingDismissed: false,
  defaultView: "all", // "all" | "watchlist"
  hideTop3: false,

  watchOnlyHighDefault: false,
  watchSortDefault: "score", // "score" | "change24" | "change7" | "name"

  // NEW: performance + paging
  marketLimit: 250, // 50 | 100 | 250
  pageSize: 25, // 25 | 50
};

export function loadPreferences() {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function resetPreferences() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
