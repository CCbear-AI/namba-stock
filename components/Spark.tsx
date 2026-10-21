"use client";
// 小走勢圖（SVG）；base 有給就畫一條虛線（例如昨收），顏色依最後一點跟 base 比
export default function Spark({ data, base, w = 90, h = 26, color }: { data: number[]; base?: number; w?: number; h?: number; color?: string }) {
  if (!data || data.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const ref = base ?? data[0];
  const lo = Math.min(...data, ref), hi = Math.max(...data, ref);
  const y = (v: number) => (hi > lo ? h - 2 - ((v - lo) / (hi - lo)) * (h - 4) : h / 2);
  const x = (i: number) => (i / (data.length - 1)) * (w - 4);
  const last = data[data.length - 1];
  const col = color ?? (last > ref ? "var(--up)" : last < ref ? "var(--down)" : "var(--flat)");
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={w} height={h} aria-hidden="true" className="overflow-visible">
      <line x1={0} x2={w - 4} y1={y(ref)} y2={y(ref)} stroke="#3a3f47" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={col} strokeWidth={1.3} />
      <circle cx={x(data.length - 1)} cy={y(last)} r={2.2} fill={col} />
    </svg>
  );
}
