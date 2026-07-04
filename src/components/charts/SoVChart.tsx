"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SoVDatum {
  brandId: string;
  name: string;
  isClient: boolean;
  value: number; // 0-1
}

// DESIGN_GUIDELINES §9: client brand in accent, competitors in stepped ink
// alphas, no categorical rainbow, flat canvas (no gridlines beyond --line).
const COMPETITOR_ALPHAS = ["0.7", "0.5", "0.35", "0.22"];

export function SoVChart({ data, height = 220 }: { data: SoVDatum[]; height?: number }) {
  let competitorIdx = 0;
  const colored = data.map((d) => {
    if (d.isClient) return { ...d, fill: "var(--color-accent)" };
    const alpha = COMPETITOR_ALPHAS[competitorIdx % COMPETITOR_ALPHAS.length];
    competitorIdx++;
    return { ...d, fill: `color-mix(in srgb, var(--color-ink) ${Number(alpha) * 100}%, transparent)` };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={colored} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-ink)" strokeOpacity={0.14} />
        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          fontFamily="var(--font-mono)"
          fontSize={11}
          stroke="var(--color-ink)"
          strokeOpacity={0.5}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          fontFamily="var(--font-mono)"
          fontSize={11}
          stroke="var(--color-ink)"
          strokeOpacity={0.7}
        />
        <Tooltip
          formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`}
          contentStyle={{
            background: "var(--color-paper)",
            border: "1px solid var(--color-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" radius={[0, 2, 2, 0]} isAnimationActive={false}>
          {colored.map((d) => (
            <Cell key={d.brandId} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
