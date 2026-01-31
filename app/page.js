"use client";

import { useEffect, useState, useRef } from "react";

export default function Page() {
  const [symbols, setSymbols] = useState([]);
  const [scores, setScores] = useState({});
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const previousPrices = useRef({});
  const history = useRef({});
  const alerted = useRef({});
  const audioRef = useRef(null);

  const ALERT_SCORE_THRESHOLD = 2.5;

  // Load Coinbase USD altcoins
  async function loadCoinbaseAltcoins() {
    const res = await fetch("https://api.exchange.coinbase.com/products");
    const products = await res.json();

    const coins = products
      .filter(
        (p) =>
          p.quote_currency === "USD" &&
          p.status === "online" &&
          !["BTC", "ETH", "USDT", "USDC"].includes(p.base_currency)
      )
      .map((p) => p.base_currency);

    setSymbols([...new Set(coins)].slice(0, 150));
  }

  async function fetchPrices() {
    const res = await fetch(
      "https://api.coinbase.com/v2/exchange-rates?currency=USD"
    );
    const data = await res.json();

    const newScores = {};

    symbols.forEach((symbol) => {
      const rate = data.data.rates[symbol];
      if (!rate) return;

      const price = 1 / rate;
      const prev = previousPrices.current[symbol];
      const change = prev ? ((price - prev) / prev) * 100 : 0;

      history.current[symbol] = [
        ...(history.current[symbol] || []),
        change
      ].slice(-15);

      const h = history.current[symbol];
      const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

      const m1 = h[h.length - 1] || 0;
      const m5 = avg(h.slice(-5));
      const m15 = avg(h.slice(-15));

      const confirmation =
        (m1 > 0 ? 1 : -1) +
        (m5 > 0 ? 1 : -1) +
        (m15 > -0.2 ? 1 : -1);

      const volatility = Math.max(...h) - Math.min(...h);

      const score =
        m1 * 2 +
        m5 * 1.5 +
        m15 +
        confirmation * 0.75 -
        volatility * 0.25;

      const isAlert =
        audioReady &&
        alertsEnabled &&
        m1 > 0 &&
        m5 > 0 &&
        m15 > -0.2 &&
        score >= ALERT_SCORE_THRESHOLD;

      if (isAlert && !alerted.current[symbol]) {
        alerted.current[symbol] = true;
        audioRef.current?.play().catch(() => {});
      }

      if (!isAlert) alerted.current[symbol] = false;

      newScores[symbol] = {
        symbol,
        price,
        m1,
        m5,
        m15,
        score,
        isAlert
      };
    });

    previousPrices.current = Object.fromEntries(
      Object.entries(newScores).map(([k, v]) => [k, v.price])
    );

    setScores(newScores);
  }

  useEffect(() => {
    loadCoinbaseAltcoins();
  }, []);

  useEffect(() => {
    if (symbols.length === 0) return;
    fetchPrices();
    const i = setInterval(fetchPrices, 60000);
    return () => clearInterval(i);
  }, [symbols]);

  const ranked = Object.values(scores)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const color = (v) => (v > 0 ? "#22c55e" : "#ef4444");

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#fff", padding: 40 }}>
      <audio
        ref={audioRef}
        src="https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
        preload="auto"
      />

      <h1 style={{ fontSize: 28 }}>Top 10 Altcoins — Alert Scanner</h1>

      <p style={{ opacity: 0.6 }}>
        Multi-timeframe confirmation • updates every 60s
      </p>

      {/* USER INTERACTION GATE */}
      {!audioReady && (
        <button
          onClick={() => {
            setAudioReady(true);
            setAlertsEnabled(true);
          }}
          style={{
            marginTop: 20,
            padding: "10px 16px",
            borderRadius: 8,
            background: "#22c55e",
            color: "#052e16",
            fontWeight: "bold",
            cursor: "pointer"
          }}
        >
          🔔 Enable Sound Alerts
        </button>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 30 }}>
        {ranked.map((c, i) => (
          <div
            key={c.symbol}
            style={{
              background: c.isAlert ? "#052e16" : "#020617",
              padding: 20,
              borderRadius: 12,
              width: 280,
              borderLeft: `6px solid ${color(c.score)}`
            }}
          >
            <div style={{ opacity: 0.7 }}>Rank #{i + 1}</div>
            <div style={{ fontSize: 22, fontWeight: "bold" }}>{c.symbol}</div>
            <div>${c.price.toFixed(4)}</div>

            <div style={{ marginTop: 6 }}>
              <span style={{ color: color(c.m1) }}>1m {c.m1.toFixed(2)}%</span>{" "}
              | <span style={{ color: color(c.m5) }}>5m {c.m5.toFixed(2)}%</span>{" "}
              | <span style={{ color: color(c.m15) }}>15m {c.m15.toFixed(2)}%</span>
            </div>

            <div style={{ marginTop: 8, fontSize: 14 }}>
              Score: {c.score.toFixed(2)}
            </div>

            {c.isAlert && (
              <div
                style={{
                  marginTop: 10,
                  padding: "6px 10px",
                  background: "#22c55e",
                  color: "#052e16",
                  borderRadius: 6,
                  fontWeight: "bold",
                  fontSize: 12
                }}
              >
                🟢 Momentum Confirmed
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
