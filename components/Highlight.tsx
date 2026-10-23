// 盤後重點文字上色：漲／買超／增加跟後面的數字標紅，跌／賣超／減少標綠，
// 帶正負號的數字依正負上色，其他數字只加粗，讓重點一眼看得出來
const UP_WORDS = ["收漲", "上漲", "大漲", "漲停", "漲", "買超", "增加", "走高", "反彈", "買盤"];
const DOWN_WORDS = ["收跌", "下跌", "大跌", "重挫", "跌停", "跌", "賣超", "減少", "走低", "承壓", "賣壓"];
const NUM = String.raw`[+\-−]?\d[\d,]*(?:\.\d+)?(?:%|億|萬|點|口|張|元|檔|天)?`;
// 「漲跌」是名詞（漲跌家數、漲跌幅）、10/22 是日期、P/C 是比率名稱，放最前面讓它整段跳過不上色
const RE = new RegExp(`(漲跌|\\d{1,2}/\\d{1,2}|P/C)|(${[...UP_WORDS, ...DOWN_WORDS].sort((a, b) => b.length - a.length).join("|")})(${NUM})?|(${NUM})`, "g");

export default function Highlight({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const [all, noun, word, wordNum, num] = m;
    if (m.index > last) out.push(text.slice(last, m.index));
    last = m.index + all.length;
    if (noun) { out.push(noun); continue; }
    if (word) {
      out.push(<span key={m.index} className={`${UP_WORDS.includes(word) ? "up" : "down"} font-semibold`}>{word}{wordNum}</span>);
      continue;
    }
    const sign = /^[\-−]/.test(num) ? "down" : num.startsWith("+") ? "up" : "";
    out.push(<span key={m.index} className={`${sign} font-semibold`}>{num}</span>);
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
