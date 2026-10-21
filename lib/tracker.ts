// 盤中動態追蹤（記錄器每一輪呼叫）：漲跌停鎖住／打開、同時段量能爆增
import type { Quote } from "./mis";
import type { FlowDay, FlowEvent } from "./flow";
import { volFraction } from "./misStats";

type St = { lockUp: boolean; lockDn: boolean; rvol: boolean };

export class Tracker {
  private st = new Map<string, St>();
  constructor(private day: FlowDay, private names: Map<string, string>, private avg20: Map<string, number>) {
    day.events ??= [];
    day.limits ??= {};
  }

  private push(e: FlowEvent) {
    this.day.events!.push(e);
    if (this.day.events!.length > 400) this.day.events!.splice(0, this.day.events!.length - 400);
  }

  update(quotes: Quote[], hm: string, minute: number) {
    const frac = volFraction(minute);
    const lim = this.day.limits!;
    for (const q of quotes) {
      if (!q.prev || !q.vol) continue;
      const n = this.names.get(q.c) ?? q.n;
      const s = this.st.get(q.c) ?? { lockUp: false, lockDn: false, rvol: false };
      const pct = ((q.price - q.prev) / q.prev) * 100;
      const p = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
      const atUp = q.up > 0 && q.price >= q.up, atDn = q.down > 0 && q.price <= q.down;
      const lockUp = atUp && !q.ask.length, lockDn = atDn && !q.bid.length;
      if (lockUp && !s.lockUp) {
        (lim[q.c] ??= {}).up ??= hm;
        this.push({ t: hm, c: q.c, n, k: "lockUp", msg: `${n} 漲停鎖住，委買 ${(q.bidV[0] ?? 0).toLocaleString()} 張` });
      } else if (s.lockUp && !atUp) {
        const l = (lim[q.c] ??= {}); l.upOpen = (l.upOpen ?? 0) + 1;
        this.push({ t: hm, c: q.c, n, k: "openUp", msg: `${n} 漲停打開，回落至 ${p}` });
      }
      if (lockDn && !s.lockDn) {
        (lim[q.c] ??= {}).dn ??= hm;
        this.push({ t: hm, c: q.c, n, k: "lockDn", msg: `${n} 跌停鎖住，委賣 ${(q.askV[0] ?? 0).toLocaleString()} 張` });
      } else if (s.lockDn && !atDn) {
        const l = (lim[q.c] ??= {}); l.dnOpen = (l.dnOpen ?? 0) + 1;
        this.push({ t: hm, c: q.c, n, k: "openDn", msg: `${n} 跌停打開，回升至 ${p}` });
      }
      // 同時段量能 ≥ 20 日均量 3 倍（09:15 以後才判斷，避免開盤量失真）；每檔一天一次
      const a = this.avg20.get(q.c);
      if (!s.rvol && a && a >= 200 && minute >= 555) {
        const rvol = q.vol / (a * frac);
        if (rvol >= 3) {
          s.rvol = true;
          this.push({ t: hm, c: q.c, n, k: "rvol", msg: `${n} 同時段量能達 20 日均量 ${rvol.toFixed(1)} 倍` });
        }
      }
      s.lockUp = lockUp || (s.lockUp && atUp);
      s.lockDn = lockDn || (s.lockDn && atDn);
      this.st.set(q.c, s);
    }
  }
}
