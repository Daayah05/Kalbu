// src/components/charts/CircumplexScatterChart.tsx
"use client";

import React from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  CIRCUMPLEX_ANCHORS,
  EmotionRecordItem,
} from "@/lib/ai/circumplex";

interface CircumplexScatterChartProps {
  records: EmotionRecordItem[];
}

export default function CircumplexScatterChart({
  records,
}: CircumplexScatterChartProps) {
  const data = records.map((r) => ({
    id: r.id,
    title: r.title || "Journal Reflection",
    valence: r.valence,
    arousal: r.arousal,
    emotion: r.primary_emotion,
    quadrant: r.quadrant,
    confidence: Math.round(r.confidence * 100),
    date: new Date(r.recorded_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800/90 p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            Russell&apos;s Circumplex Model of Affect (2D Space)
          </h3>
          <p className="text-xs text-slate-400">
            Valence (Unpleasant → Pleasant) vs. Arousal (Calm → Activated)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {Object.entries(CIRCUMPLEX_ANCHORS).map(([emotion, meta]) => (
            <span
              key={emotion}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300 capitalize"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              {emotion}
            </span>
          ))}
        </div>
      </div>

      {/* Quadrant Corner Labels */}
      <div className="relative h-80 w-full">
        <div className="pointer-events-none absolute inset-4 z-10 flex flex-col justify-between text-[10px] font-medium uppercase tracking-wider text-slate-500">
          <div className="flex justify-between">
            <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/70 text-rose-400/80">
              Q2: High-Energy Unpleasant (Stressed / Anxious)
            </span>
            <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/70 text-amber-300/80">
              Q1: High-Energy Pleasant (Alert / Joyful)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/70 text-sky-400/80">
              Q3: Low-Energy Unpleasant (Sad / Burned Out)
            </span>
            <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/70 text-emerald-400/80">
              Q4: Low-Energy Pleasant (Calm / Serene)
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ead9c8" />
            <XAxis
              type="number"
              dataKey="valence"
              name="Valence"
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
              stroke="#b89882"
              tick={{ fontSize: 11, fill: "#7d584e" }}
              label={{
                value: "Valence (Displeasure → Pleasure)",
                position: "insideBottom",
                offset: -10,
                fill: "#7d584e",
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="arousal"
              name="Arousal"
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
              stroke="#b89882"
              tick={{ fontSize: 11, fill: "#7d584e" }}
              label={{
                value: "Arousal (Activation)",
                angle: -90,
                position: "insideLeft",
                fill: "#7d584e",
                fontSize: 11,
              }}
            />
            <ZAxis type="number" dataKey="confidence" range={[80, 220]} />
            <ReferenceLine x={0} stroke="#cfa993" strokeWidth={1.5} />
            <ReferenceLine y={0} stroke="#cfa993" strokeWidth={1.5} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const pt = payload[0].payload;
                return (
                  <div className="rounded-xl bg-slate-950/95 border border-slate-800 p-3 shadow-xl text-xs text-slate-200 space-y-1">
                    <p className="font-semibold text-white">{pt.title}</p>
                    <p className="text-slate-400">
                      {pt.date} •{" "}
                      <span className="capitalize text-indigo-300 font-medium">
                        {pt.emotion} ({pt.confidence}%)
                      </span>
                    </p>
                    <p className="font-mono text-[11px] text-slate-300">
                      Valence: {pt.valence} | Arousal: {pt.arousal}
                    </p>
                    <p className="text-[11px] text-slate-400">{pt.quadrant}</p>
                  </div>
                );
              }}
            />
            <Scatter name="Entries" data={data}>
              {data.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={CIRCUMPLEX_ANCHORS[entry.emotion].color}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
