// Squarified treemap：把一組數值切成長寬比接近正方形的矩形
export type Rect = { x: number; y: number; w: number; h: number };

export function squarify<T>(items: { v: number; d: T }[], box: Rect): (Rect & { d: T })[] {
  const list = items.filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  const total = list.reduce((s, i) => s + i.v, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  const out: (Rect & { d: T })[] = [];
  let { x, y, w, h } = box;
  let row: { v: number; d: T }[] = [];

  const worst = (r: { v: number }[], side: number) => {
    const s = r.reduce((a, i) => a + i.v * scale, 0);
    const mx = Math.max(...r.map((i) => i.v * scale)), mn = Math.min(...r.map((i) => i.v * scale));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const layout = (r: { v: number; d: T }[]) => {
    const s = r.reduce((a, i) => a + i.v * scale, 0);
    if (w >= h) {
      const cw = s / h; let cy = y;
      for (const i of r) { const ch = (i.v * scale) / cw; out.push({ x, y: cy, w: cw, h: ch, d: i.d }); cy += ch; }
      x += cw; w -= cw;
    } else {
      const ch = s / w; let cx = x;
      for (const i of r) { const cw = (i.v * scale) / ch; out.push({ x: cx, y, w: cw, h: ch, d: i.d }); cx += cw; }
      y += ch; h -= ch;
    }
  };
  for (const it of list) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it);
    else { layout(row); row = [it]; }
  }
  if (row.length) layout(row);
  return out;
}
