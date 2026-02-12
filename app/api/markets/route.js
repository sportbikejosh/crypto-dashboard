// app/api/markets/route.js

export const revalidate = 60; // Next.js caches this route for 60 seconds (server-side)

const BASE_URL = "https://api.coingecko.com/api/v3/coins/markets";

function buildUrl(perPage) {
  const url = new URL(BASE_URL);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", "1");
  url.searchParams.set("sparkline", "false");
  url.searchParams.set("price_change_percentage", "24h,7d,30d");
  return url.toString();
}

function clampPerPage(raw) {
  const n = Number(raw);
  if (n === 50 || n === 100 || n === 250) return n;
  return 100; // default
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const perPage = clampPerPage(searchParams.get("per_page"));

    const COINGECKO_URL = buildUrl(perPage);

    const res = await fetch(COINGECKO_URL, {
      // This tells Next to cache/revalidate the upstream fetch as well
      next: { revalidate: 60 },
      headers: {
        accept: "application/json",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: `CoinGecko error (${res.status})`,
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json",
            // short cache to avoid hammering even on errors
            "cache-control": "public, s-maxage=15, stale-while-revalidate=60",
          },
        }
      );
    }

    const data = await res.json();

    return new Response(JSON.stringify({ data, fetchedAt: new Date().toISOString(), perPage }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        // Cache at the edge/CDN if deployed (Vercel), and allow SWR behavior
        "cache-control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Failed to reach CoinGecko",
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      }
    );
  }
}
