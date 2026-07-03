"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";

export interface AttributeRadarDatum {
  attribute: string;
  rate: number; // 0-1
}

export function AttributeRadar({ data }: { data: AttributeRadarDatum[] }) {
  const formatted = data.map((d) => ({ ...d, pct: Math.round(d.rate * 100) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={formatted} margin={{ top: 8, bottom: 8 }}>
        <PolarGrid stroke="var(--color-ink)" strokeOpacity={0.14} />
        <PolarAngleAxis
          dataKey="attribute"
          fontFamily="var(--font-mono)"
          fontSize={10}
          stroke="var(--color-ink)"
          tick={{ fill: "var(--color-ink)", fillOpacity: 0.7 }}
        />
        <Radar
          dataKey="pct"
          stroke="var(--color-accent)"
          fill="var(--color-accent)"
          fillOpacity={0.25}
          isAnimationActive={false}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
