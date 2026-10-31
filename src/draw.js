// 三个游戏的图片样式（draw-chunithm.js / draw-maimai.js / draw-ongeki.js）共用的画图小工具。
// 这几个文件不依赖面板的其他部分，三个书签运行时也从这里加载（见各 draw-*.js 开头）
export function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function fit(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
