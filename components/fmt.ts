export const cls = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "flat");
export const sign = (v: number) => (v > 0 ? "+" : "");
export const pct = (v: number) => `${sign(v)}${v.toFixed(2)}%`;
export const price = (v: number) => (v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v >= 100 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2));
export const num = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const yi = (v: number, d = 2) => `${sign(v)}${v.toFixed(d)} 億`;
export const hm = (ms: number) => new Date(ms + 8 * 3600e3).toISOString().slice(11, 16);
