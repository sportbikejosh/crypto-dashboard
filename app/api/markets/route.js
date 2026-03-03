import { NextResponse } from "next/server";
import { applyMarketScopePolicy } from "@/lib/marketScope";
import { computeMomentum } from "@/lib/momentumEngine";
import { classifyRegime } from "@/lib/regime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";

function getBool(searchParams, key) {
  const v = searchParams.get(key);
  if (v === null) return null;
  return v === "1" || v === "true" || v === "yes";
}

function jsonOk(payload, init = { status: 200 }) {
  // payload should already include assets/meta/etc
  return NextResponse.json({ ok: true, ...payload }, init);
}

function jsonErr(message, status = 500, extra = {}) {
  return NextResponse.json({ ok: false, error: String(message), ...extra }, { status });
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // Premium toggle (you can still gate this in UI/auth)
    const speculative = Boolean(getBool(searchParams, "speculative"));

    // CoinGecko markets call
    const url = new URL(COINGECKO_MARKETS_URL);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", "250");
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "false");
    url.searchParams.set("price_change_percentage", "24h");

    const upstream = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "crypto-dashboard/1.0",
      },
    });

    const rawText = await safeReadText(upstream);

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return jsonErr("Upstream rate limit (CoinGecko 429). Please retry in a minute.", 429, {
          upstreamStatus: upstream.status,
        });
      }

      if (upstream.status === 401 || upstream.status === 403) {
        return jsonErr(
          "Upstream access denied (CoinGecko). Check hosting/network or API key requirements.",
          upstream.status,
          { upstreamStatus: upstream.status, upstreamBodyPreview: rawText.slice(0, 200) }
        );
      }

      return jsonErr(`Upstream error (${upstream.status}).`, 502, {
        upstreamStatus: upstream.status,
        upstreamBodyPreview: rawText.slice(0, 200),
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return jsonErr("Upstream returned non-JSON response.", 502, {
        upstreamStatus: upstream.status,
        upstreamBodyPreview: rawText.slice(0, 200),
      });
    }

    if (!Array.isArray(data)) {
      return jsonErr("Upstream JSON shape unexpected (expected array).", 502, {
        upstreamStatus: upstream.status,
        upstreamBodyPreview: rawText.slice(0, 200),
      });
    }

    // Enforce market scope policy (curated default; speculative optional)
    const scoped = applyMarketScopePolicy(data, { speculative });

    // Compute momentum + regime
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
        // keep nulls
      }

      let regime = null;
      try {
        regime = classifyRegime(a, { score, confidence, liquidityStrength, volatility }) ?? null;
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
        score,
        confidence,
        liquidityStrength,
        volatility,
        regime,
      };
    });

    return jsonOk(
      {
        assets,
        meta: {
          speculative,
          upstreamStatus: upstream.status,
          upstreamCount: data.length,
          returnedCount: assets.length,
        },
      },
      { status: 200 }
    );
  } catch (e) {
    return jsonErr(e?.message || e, 500);
  }
}