// src/components/charts/ModelEvaluationCard.tsx
"use client";

import React, { useState } from "react";
import { BarChart3, CheckCircle2, Database, Grid } from "lucide-react";
import modelReport from "@/lib/ai/model_report.json";
import { CIRCUMPLEX_ANCHORS, EmotionLabel } from "@/lib/ai/circumplex";

export default function ModelEvaluationCard() {
  const { dataset, metrics, training_time_seconds } = modelReport;
  const labels = Object.keys(metrics.per_class) as EmotionLabel[];
  const [showConfusionMatrix, setShowConfusionMatrix] = useState(false);

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800/90 p-5 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            AI Model Evaluation (Trained on 416k Dataset)
          </h3>
          <p className="text-xs text-slate-400">
            Stratified 80/10/10 split • Held-out Test Set (
            {dataset.test_rows.toLocaleString("en-US")} samples) •{" "}
            {dataset.vocab_features.toLocaleString("en-US")} n-gram features
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Test Acc: {(metrics.test_accuracy * 100).toFixed(2)}%
          </span>
          <span className="px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
            Weighted-F1: {(metrics.test_weighted_f1 * 100).toFixed(2)}%
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 font-mono">
            Macro-F1: {(metrics.test_macro_f1 * 100).toFixed(2)}%
          </span>
          <button
            type="button"
            onClick={() => setShowConfusionMatrix((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition cursor-pointer"
          >
            <Grid className="w-3.5 h-3.5" />
            {showConfusionMatrix
              ? "Hide Confusion Matrix"
              : "6×6 Confusion Matrix"}
          </button>
        </div>
      </div>

      {/* Dataset Split Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
          <p className="text-slate-400 flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-indigo-400" /> Raw CSV Rows
          </p>
          <p className="text-base font-bold text-white font-mono mt-0.5">
            {dataset.raw_rows.toLocaleString("en-US")}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
          <p className="text-slate-400">Deduplicated</p>
          <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
            {dataset.clean_unique_rows.toLocaleString("en-US")}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
          <p className="text-slate-400">Train Split (80%)</p>
          <p className="text-base font-bold text-indigo-400 font-mono mt-0.5">
            {dataset.train_rows.toLocaleString("en-US")}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
          <p className="text-slate-400">Val + Test (10% + 10%)</p>
          <p className="text-base font-bold text-amber-300 font-mono mt-0.5">
            {dataset.validation_rows.toLocaleString("en-US")} /{" "}
            {dataset.test_rows.toLocaleString("en-US")}
          </p>
        </div>
      </div>

      {/* Per-Class Precision / Recall / F1 Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {labels.map((label) => {
          const item = metrics.per_class[label];
          const color = CIRCUMPLEX_ANCHORS[label].color;
          return (
            <div
              key={label}
              className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold capitalize text-white flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </span>
                <span className="font-mono text-slate-300">
                  F1: {(item.f1_score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(item.f1_score * 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>Prec: {(item.precision * 100).toFixed(1)}%</span>
                <span>Rec: {(item.recall * 100).toFixed(1)}%</span>
                <span>n={item.support.toLocaleString("en-US")}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional 6x6 Confusion Matrix Table */}
      {showConfusionMatrix && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto space-y-2">
          <p className="text-xs font-semibold text-slate-200">
            6×6 Held-Out Test Set Confusion Matrix (Rows = Actual, Columns =
            Predicted)
          </p>
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 px-2 text-left">Actual \ Pred</th>
                {labels.map((lbl) => (
                  <th
                    key={lbl}
                    className="py-2 px-2 text-right capitalize"
                    style={{ color: CIRCUMPLEX_ANCHORS[lbl].color }}
                  >
                    {lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.confusion_matrix.map((row, rIdx) => {
                const actualLabel = labels[rIdx];
                return (
                  <tr
                    key={actualLabel}
                    className="border-b border-slate-900/80 hover:bg-slate-900/40"
                  >
                    <td
                      className="py-1.5 px-2 font-semibold capitalize"
                      style={{ color: CIRCUMPLEX_ANCHORS[actualLabel].color }}
                    >
                      {actualLabel}
                    </td>
                    {row.map((val, cIdx) => {
                      const isDiag = rIdx === cIdx;
                      return (
                        <td
                          key={cIdx}
                          className={`py-1.5 px-2 text-right ${
                            isDiag
                              ? "text-emerald-400 font-bold bg-emerald-500/10 rounded"
                              : "text-slate-400"
                          }`}
                        >
                          {val.toLocaleString("en-US")}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-500 text-right font-mono">
        Trained &amp; evaluated in {training_time_seconds}s on{" "}
        {dataset.source_file}
      </p>
    </div>
  );
}
