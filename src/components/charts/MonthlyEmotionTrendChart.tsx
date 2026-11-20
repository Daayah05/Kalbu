// src/components/charts/MonthlyEmotionTrendChart.tsx
"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import { Activity, TrendingUp } from "lucide-react";
import { MonthlyEmotionSummary } from "@/lib/ai/circumplex";

interface MonthlyEmotionTrendChartProps {
  summary: MonthlyEmotionSummary;
}

export default function MonthlyEmotionTrendChart({
  summary,
}: MonthlyEmotionTrendChartProps) {
  const { dailySeries, meanValence, meanArousal, emotionalVolatility } =
    summary;

  const burnoutStatus =
    emotionalVolatility > 0.65
      ? { label: "High Affect Volatility", color: "text-amber-400" }
      : meanValence < -0.25
      ? { label: "Fatigue / Stress Alert", color: "text-rose-400" }
      : { label: "Balanced Trajectory", color: "text-emerald-400" };

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800/90 p-5 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            Monthly Emotion Trajectory
          </h3>
          <p className="text-xs text-slate-400">
            Daily average Valence &amp; Arousal scores across your encrypted
            entries
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400">Mean Valence: </span>
            <span className="font-mono font-semibold text-indigo-400">
              {meanValence >= 0 ? `+${meanValence}` : meanValence}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400">Volatility Index: </span>
            <span className={`font-mono font-semibold ${burnoutStatus.color}`}>
              {emotionalVolatility} ({burnoutStatus.label})
            </span>
          </div>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={dailySeries}
            margin={{ top: 10, right: 20, bottom: 5, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ead9c8" />
            <XAxis
              dataKey="displayDate"
              stroke="#b89882"
              tick={{ fontSize: 11, fill: "#7d584e" }}
            />
            <YAxis
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
              stroke="#b89882"
              tick={{ fontSize: 11, fill: "#7d584e" }}
            />
            <ReferenceLine y={0} stroke="#cfa993" strokeDasharray="4 4" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-xl bg-slate-950/95 border border-slate-800 p-3 shadow-xl text-xs text-slate-200 space-y-1">
                    <p className="font-semibold text-white">
                      {d.displayDate} ({d.entryCount}{" "}
                      {d.entryCount === 1 ? "entry" : "entries"})
                    </p>
                    <p className="text-slate-400">
                      Dominant Mood:{" "}
                      <span className="capitalize text-indigo-300 font-medium">
                        {d.dominantEmotion}
                      </span>
                    </p>
                    <p className="font-mono text-[11px] text-indigo-400">
                      Avg Valence: {d.avgValence}
                    </p>
                    <p className="font-mono text-[11px] text-emerald-400">
                      Avg Arousal: {d.avgArousal}
                    </p>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Line
              type="monotone"
              dataKey="avgValence"
              name="Valence (Pleasantness)"
              stroke="#c24646"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#c24646" }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="avgArousal"
              name="Arousal (Energy)"
              stroke="#3b7a57"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#3b7a57" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 px-4 py-2.5 rounded-xl border border-slate-800/80">
        <span className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          Monthly Centroid: Valence {meanValence} • Arousal {meanArousal}
        </span>
        <span>
          {dailySeries.length} active journaling days recorded this month
        </span>
      </div>
    </div>
  );
}
