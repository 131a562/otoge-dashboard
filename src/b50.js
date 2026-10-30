// B50 图：用历史记录里的 Rating 快照（书签运行时记下的 B50）画图，不需要运行书签。
// 三个游戏各自照搬原书签的 B50 图样式，分别写在 b50-chunithm.js / b50-maimai.js / b50-ongeki.js；
// 这里只放共用的小工具（定数表、曲绘的读取，画图的辅助函数）和按游戏分派。
// 定数、曲绘按快照里的曲目从公开的定数表查（只在打开 B50 图时下载，下载过就不再下载）。
// 快照的行格式见各书签：
//   CHUNITHM  [曲目id:难度, 曲名, 分数, 单曲 Rating×100, 标记]
//   maimai    [键, 曲名, 达成率×10000, 单曲 Rating, FC/AP, 难度, DX/STD, 曲绘]
//   オンゲキ  [曲名|难度(|艺术家), 曲名, TS, 单曲 Rating×1000, 标记, FB]   P-SCORE：[键, 曲名, ☆, P-rate×100000]
const V = new URL(import.meta.url).search;

// ---- 定数表 ----
// 传一个地址数组时按顺序试，第一个读得到的为准（SBGA TOOL 整理的定数表 → 原来的来源）
const dbCache = new Map();
const fetchJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then((j) => { if (!Array.isArray(j) || j.length < 100) throw new Error('内容不对'); return j; });
export const loadJson = (urls) => {
  const key = [].concat(urls).join(' ');
  if (!dbCache.has(key)) {
    const p = [].concat(urls).reduce((acc, url) => acc.catch(() => fetchJson(url)), Promise.reject(new Error('没有地址')));
    dbCache.set(key, p.catch((e) => { dbCache.delete(key); throw e; }));
  }
  return dbCache.get(key);
};

// ---- 画图的辅助函数 ----
export const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","PingFang SC","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
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
// 曲绘：otoge-db / reiwa.f5.si 允许跨域，画进 canvas 后仍能导出；15 秒没加载完就当没有（显示 NO IMAGE）
export const loadImg = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const t = setTimeout(() => resolve(null), 15000);
  img.onload = () => { clearTimeout(t); resolve(img); };
  img.onerror = () => { clearTimeout(t); resolve(null); };
  img.src = src;
});

// game：games.js 的 GAMES 之一；snap：快照；name：玩家名；obs：观测记录（maimai 取 FS/FDX、DX 分，音击取プラチナスコア）
// 返回 { blob, url, missing（没加载出来的曲绘数）, dbError }
export async function renderB50(game, snap, name, onStatus = () => {}, obs = []) {
  if (game.id === 'chunithm') return (await import('./b50-chunithm.js' + V)).renderChunithm(game, snap, name, onStatus);
  if (game.id === 'maimai') return (await import('./b50-maimai.js' + V)).renderMaimai(game, snap, name, obs, onStatus);
  return (await import('./b50-ongeki.js' + V)).renderOngeki(game, snap, name, obs, onStatus);
}
