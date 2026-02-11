// app/api/markets/route.js

export const revalidate = 60; // Next.js caches this route for 60 seconds (server-side)

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h,7d,30d";

export async function GET() {
  try {
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

    return new Response(JSON.stringify({ data, fetchedAt: new Date().toISOString() }), {
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
