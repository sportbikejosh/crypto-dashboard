// app/api/markets/route.js
import { NextResponse } from "next/server";
import { applyMarketScopePolicy } from "@/lib/marketScope";
import { computeMomentum } from "@/lib/momentumEngine";
import { classifyRegime } from "@/lib/regime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";

// Cache tuning (SaaS-friendly)
const REVALIDATE_SECONDS = 60;

function getBool(searchParams, key) {
  const v = searchParams.get(key);
  if (v === null) return null;
  return v === "1" || v === "true" || v === "yes";
}

function ok(payload) {
  const res = NextResponse.json({ ok: true, ...payload }, { status: 200 });
  // Edge/CDN caching to reduce CoinGecko calls
  res.headers.set(
    "Cache-Control",
    `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 5}`
  );
  return res;
}

function err(message, status = 500, extra = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // Premium toggle (even if gated in UI/auth)
    const speculative = Boolean(getBool(searchParams, "speculative"));

    // Build CoinGecko URL
    const url = new URL(COINGECKO_MARKETS_URL);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", "250");
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "false");
    // IMPORTANT: request both 24h and 7d so the engine has real inputs
    url.searchParams.set("price_change_percentage", "24h,7d");

    // Fetch with Next revalidation caching
    const upstream = await fetch(url.toString(), {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        accept: "application/json",
        "user-agent": "crypto-dashboard/1.0",
      },
      cache: "no-store",
    });

    const body = await safeText(upstream);

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return err("CoinGecko rate limited this server (429). Try again shortly.", 429, {
          upstreamStatus: upstream.status,
        });
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return err("CoinGecko denied the request (401/403).", upstream.status, {
          upstreamStatus: upstream.status,
          upstreamBodyPreview: body.slice(0, 200),
        });
      }
      return err(`CoinGecko upstream error (${upstream.status}).`, 502, {
        upstreamStatus: upstream.status,
        upstreamBodyPreview: body.slice(0, 200),
      });
    }

    let markets;
    try {
      markets = JSON.parse(body);
    } catch {
      return err("CoinGecko returned non-JSON response.", 502, {
        upstreamBodyPreview: body.slice(0, 200),
      });
    }

    if (!Array.isArray(markets)) {
      return err("Unexpected CoinGecko response shape (expected array).", 502, {
        upstreamBodyPreview: body.slice(0, 200),
      });
    }

    // Enforce market scope policy (curated default, speculative optional)
    const scoped = applyMarketScopePolicy(markets, { speculative });

    // Normalize + compute momentum + regime
    const assets = scoped.map((a) => {
      // Normalize CoinGecko -> engine expectations
      const change24h =
        Number(a.price_change_percentage_24h_in_currency ?? a.price_change_percentage_24h ?? 0) || 0;
      const change7d =
        Number(a.price_change_percentage_7d_in_currency ?? a.price_change_percentage_7d ?? 0) || 0;

      const normalized = {
        ...a,

        // Engine expects these names
        volumeUsd: Number(a.total_volume ?? 0) || 0,
        marketCapUsd: Number(a.market_cap ?? 0) || 0,
        change24h,
        change7d,

        // Keep canonical CoinGecko fields too
        total_volume: a.total_volume,
        market_cap: a.market_cap,
        price_change_percentage_24h_in_currency: a.price_change_percentage_24h_in_currency,
        price_change_percentage_7d_in_currency: a.price_change_percentage_7d_in_currency,
      };

      let out = null;
      try {
        out = computeMomentum(normalized);
      } catch {
        out = null;
      }

      let regime = null;
      try {
        regime = classifyRegime(normalized, out || {}) ?? null;
      } catch {
        regime = null;
      }

      return {
        id: a.id,
        symbol: a.symbol,
        name: a.name,

        current_price: a.current_price,
        price_change_percentage_24h_in_currency: a.price_change_percentage_24h_in_currency,

        market_cap: a.market_cap,
        total_volume: a.total_volume,

        // computed
        score: out?.score ?? out?.momentumScore ?? null,
        confidence: out?.confidence ?? null,
        liquidityStrength: out?.liquidityStrength ?? null,
        volatility: out?.volatility ?? null,
        regime,

        // (optional) keep these for future explainability/debug
        change24h,
        change7d,
      };
    });

    return ok({
      assets,
      meta: {
        speculative,
        upstreamCount: markets.length,
        returnedCount: assets.length,
        cacheSeconds: REVALIDATE_SECONDS,
      },
    });
  } catch (e) {
    return err(String(e?.message || e), 500);
  }
}