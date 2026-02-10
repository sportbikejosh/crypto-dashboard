"use client";

import { useEffect, useState } from "react";

const COINS = [
  { symbol: "SOL", id: "solana", momentum: 82 },
  { symbol: "AVAX", id: "avalanche-2", momentum: 74 },
  { symbol: "MATIC", id: "matic-network", momentum: 61 },
  { symbol: "ADA", id: "cardano", momentum: 48 },
  { symbol: "DOT", id: "polkadot", momentum: 42 }
];

function confidenceInfo(momentum) {
  if (momentum >= 75)
    return {
      label: "High",
      color: "text-green-400",
      tooltip: "Strong momentum, volume support, and trend confirmation"
    };
  if (momentum >= 55)
    return {
      label: "Medium",
      color: "text-yellow-400",
      tooltip: "Moderate momentum, trend forming but not confirmed"
    };
  return {
    label: "Low",
    color: "text-red-400",
    tooltip: "Weak momentum or trend deterioration"
  };
}

export default function Dashboard() {
  const [sortBy, setSortBy] = useState("momentum");
  const [search, setSearch] = useState("");
  const [data, setData] = useState([]);

  useEffect(() => {
    async function fetchPrices() {
      try {
        const ids = COINS.map(c => c.id).join(",");
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
        );
        const prices = await res.json();

        let merged = COINS.map(coin => ({
          ...coin,
          price: prices[coin.id]?.usd ?? 0,
          change24h: prices[coin.id]?.usd_24h_change ?? 0
        }));

        merged = merged.filter(coin =>
          coin.symbol.toLowerCase().includes(search.toLowerCase())
        );

        if (sortBy === "momentum") {
          merged.sort((a, b) => b.momentum - a.momentum);
        }
        if (sortBy === "change") {
          merged.sort((a, b) => b.change24h - a.change24h);
        }
        if (sortBy === "confidence") {
          merged.sort((a, b) => b.momentum - a.momentum);
        }

        setData(merged);
      } catch (e) {
        console.error("Price fetch failed", e);
      }
    }

    fetchPrices();
  }, [sortBy, search]);

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">
        Crypto Altcoin Momentum Dashboard
      </h1>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search coin"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 px-3 py-2 rounded w-40"
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-gray-800 px-3 py-2 rounded"
        >
          <option value="momentum">Momentum</option>
          <option value="change">24h Change</option>
          <option value="confidence">Confidence</option>
        </select>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-700 text-left">
            <th className="py-2">Rank</th>
            <th>Coin</th>
            <th>Price</th>
            <th>24h %</th>
            <th>Momentum</th>
            <th>Trend</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {data.map((coin, index) => {
            const confidence = confidenceInfo(coin.momentum);
            const isTop = index < 3;

            return (
              <tr
                key={coin.symbol}
                className={`border-b border-gray-800 ${
                  isTop ? "bg-gray-800/60" : ""
                }`}
              >
                <td className="py-2 font-semibold">
                  {isTop ? `🔥 ${index + 1}` : index + 1}
                </td>
                <td>{coin.symbol}</td>
                <td>${coin.price.toFixed(2)}</td>
                <td className={coin.change24h >= 0 ? "text-green-400" : "text-red-400"}>
                  {coin.change24h.toFixed(2)}%
                </td>
                <td>{coin.momentum}</td>
                <td className="text-sm text-gray-400">
                  {isTop ? "🔒 Premium" : "—"}
                </td>
                <td
                  className={`${confidence.color} cursor-help`}
                  title={confidence.tooltip}
                >
                  {confidence.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
