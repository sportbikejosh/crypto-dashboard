import { NextResponse } from "next/server";
import { applyMarketScopePolicy } from "@/lib/marketScope";
import { computeMomentum } from "@/lib/momentumEngine";
import { classifyRegime } from "@/lib/regime";

// Vercel/Next: ensure this is dynamic but cached via revalidate + CDN headers
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";

// Tune this: 30–120s is a good SaaS default.
// Lower = fresher but more rate-limit risk.
const REVALIDATE_SECONDS = 60;

function getBool(searchParams, key) {
  const v = searchParams.get(key);
  if (v === null) return null;
  return v === "1" || v === "true" || v === "yes";
}

function ok(payload, init = {}) {
  // CDN caching headers (Vercel honors s-maxage / swr at the edge)
  const res = NextResponse.json({ ok: true, ...payload }, { status: 200, ...init });
  res.headers.set(
    "Cache-Control",
    // Cache at edge for REVALIDATE_SECONDS, allow serving stale while refreshing
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

    // Premium toggle (even if you gate it in UI/auth later)
    const speculative = Boolean(getBool(searchParams, "speculative"));

    // Build upstream URL
    const url = new URL(COINGECKO_MARKETS_URL);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", "250");
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "false");
    url.searchParams.set("price_change_percentage", "24h");

    // Upstream fetch with Next revalidation caching
    const upstream = await fetch(url.toString(), {
      // Next.js caching (server-side)
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        accept: "application/json",
        "user-agent": "crypto-dashboard/1.0",
      },
    });

    const body = await safeText(upstream);

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return err(
          "CoinGecko rate limited this server (429). Try again shortly.",
          429,
          { upstreamStatus: upstream.status }
        );
      }

      if (upstream.status === 401 || upstream.status === 403) {
        return err(
          "CoinGecko denied the request (401/403). This can happen on hosted/serverless IPs.",
          upstream.status,
          { upstreamStatus: upstream.status, upstreamBodyPreview: body.slice(0, 200) }
        );
      }

      return err(`CoinGecko upstream error (${upstream.status}).`, 502, {
        upstreamStatus: upstream.status,
        upstreamBodyPreview: body.slice(0, 200),
      });
    }

    // Parse JSON safely (CoinGecko/Cloudflare can return HTML sometimes)
    let markets;
    try {
      markets = JSON.parse(body);
    } catch {
      return err("CoinGecko returned non-JSON response (likely blocked/proxied).", 502, {
        upstreamBodyPreview: body.slice(0, 200),
      });
    }

    if (!Array.isArray(markets)) {
      return err("Unexpected CoinGecko response shape (expected array).", 502, {
        upstreamBodyPreview: body.slice(0, 200),
      });
    }

    // Enforce Market Scope Policy (curated default; speculative optional)
    const scoped = applyMarketScopePolicy(markets, { speculative });

    // Normalize + compute momentum + regime (never crash whole response for one bad asset)
    const assets = scoped.map((a) => {
      let score = null;
      let confidence = null;
      let liquidityStrength = null;
      let volatility = null;

      try {
        const out = computeMomentum(a);
        score = out?.score ?? out?.momentumScore ?? null;
        confidence = out?.confidence ?? null;
        liquidityStrength = out?.liquidityStrength ?? null;
        volatility = out?.volatility ?? null;
      } catch {
        // keep nulls; still return core fields
      }

      let regime = null;
      try {
        regime = classifyRegime(a, { score, confidence, liquidityStrength, volatility }) ?? null;
      } catch {
        regime = null;
      }

      return {
        // identity
        id: a.id,
        symbol: a.symbol,
        name: a.name,

        // normalized market fields used by the UI
        current_price: a.current_price,
        price_change_percentage_24h_in_currency: a.price_change_percentage_24h_in_currency,
        market_cap: a.market_cap,
        total_volume: a.total_volume,

        // computed fields
        score,
        confidence,
        liquidityStrength,
        volatility,
        regime,
      };
    });

    // ✅ CRITICAL: wrap response in the contract your UI expects
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