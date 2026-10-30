// CHUNITHM 的 B50 图：照搬 chuni-b50 书签的 B50 图样式（src/b50.js 的 newCanvas / header / stat / sectionTitle / drawB50 / card），
// 改书签那边的样式时这里也要跟着改。
//   深蓝紫渐变背景 + 细斜线；左上「CHUNITHM  RATING  BEST 50」+ 玩家名；右上 RATING（金色大字）、NEW 20 AVG、BEST 30 AVG
//   卡片：半透明底 + 难度颜色描边，曲绘、序号 #1、曲名、难度·定数徽章、评级、AJ/FC、分数、单曲 Rating；宽 1592px
// 数据：快照（书签运行时的 BEST 30 / NEW 20：[曲目id:难度, 曲名, 分数, 单曲 Rating×100, 标记]）
const V = new URL(import.meta.url).search;
const { loadJson, loadImg, FONT } = await import('./b50.js' + V);

// 定数表：先读 SBGA TOOL 每天整理的那份（格式和 otoge-db 一样，定数和书签 / SBGA TOOL 统一），读不到时退回 otoge-db
const DB_URL = ['https://131a562.github.io/sbga-tool/data/feed/chunithm-music-ex.json', 'https://otoge-db.net/chunithm/data/music-ex.json'];
const JACKET_URL = 'https://otoge-db.net/chunithm/jacket/';
const DIFFS = [
  { key: 'bas', short: 'BAS', color: '#22bb5b' },
  { key: 'adv', short: 'ADV', color: '#e8a10a' },
  { key: 'exp', short: 'EXP', color: '#e3374c' },
  { key: 'mas', short: 'MAS', color: '#9b3fd6' },
  { key: 'ult', short: 'ULT', color: '#1a1a1a' },
];
const COLS = 5, CW = 296, CH = 112, GAP = 12, PAD = 32;
const W = PAD * 2 + COLS * CW + (COLS - 1) * GAP;
const rows = (n) => Math.ceil(n / COLS);
const floor2 = (x) => (Math.floor(x * 100 + 1e-6) / 100).toFixed(2);
const scoreRank = (s) => [
  [1009000, 'SSS+'], [1007500, 'SSS'], [1005000, 'SS+'], [1000000, 'SS'], [990000, 'S+'], [975000, 'S'],
  [950000, 'AAA'], [925000, 'AA'], [900000, 'A'], [800000, 'BBB'], [700000, 'BB'], [600000, 'B'], [500000, 'C'],
].find(([b]) => s >= b)?.[1] || 'D';

function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
function newCanvas(h) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = h;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, h);
  bg.addColorStop(0, '#141a33'); bg.addColorStop(0.55, '#1d1438'); bg.addColorStop(1, '#0d2230');
  g.fillStyle = bg; g.fillRect(0, 0, W, h);
  g.globalAlpha = 0.06; g.strokeStyle = '#fff'; g.lineWidth = 1;
  for (let x = -h; x < W; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); }
  g.globalAlpha = 1;
  g.textBaseline = 'alphabetic';
  return { cv, g };
}
function header(g, kicker, name) {
  g.fillStyle = '#ffffff99'; g.font = '600 20px ' + FONT;
  g.fillText(kicker, PAD, PAD + 22);
  g.fillStyle = '#fff'; g.font = 'bold 48px ' + FONT;
  g.fillText(fit(g, name, 620), PAD, PAD + 82);
}
function stat(g, label, val, x, color, big) {
  g.textAlign = 'right';
  g.fillStyle = '#ffffff99'; g.font = '600 16px ' + FONT;
  g.fillText(label, x, PAD + 30);
  g.fillStyle = color; g.font = 'bold ' + (big ? 56 : 36) + 'px ' + FONT;
  g.fillText(val, x, PAD + (big ? 88 : 80));
  g.textAlign = 'left';
}
function sectionTitle(g, label, y, color) {
  g.fillStyle = color; g.fillRect(PAD, y + 12, 6, 28);
  g.fillStyle = '#fff'; g.font = 'bold 26px ' + FONT;
  g.fillText(label, PAD + 16, y + 36);
}
function card(g, s, label, x, y) {
  const w = CW, h = CH;
  const d = DIFFS[s.diff] || DIFFS[3];
  round(g, x, y, w, h, 10);
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = d.key === 'ult' ? '#e8e8e8' : d.color; g.stroke();
  // 曲绘
  const J = h - 16, jx = x + 8, jy = y + 8;
  g.save(); round(g, jx, jy, J, J, 6); g.clip();
  if (s.img) g.drawImage(s.img, jx, jy, J, J);
  else { g.fillStyle = '#ffffff1a'; g.fillRect(jx, jy, J, J); g.fillStyle = '#ffffff55'; g.font = '12px ' + FONT; g.fillText('NO IMAGE', jx + 18, jy + J / 2 + 4); }
  g.restore();
  // 序号
  g.font = 'bold 13px ' + FONT;
  const lw = Math.max(34, g.measureText(label).width + 10);
  g.fillStyle = 'rgba(0,0,0,.7)'; round(g, jx, jy, lw, 20, 5); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.fillText(label, jx + lw / 2, jy + 15); g.textAlign = 'left';

  const tx = jx + J + 10, tw = x + w - tx - 10;
  g.fillStyle = '#fff'; g.font = 'bold 16px ' + FONT;
  g.fillText(fit(g, s.title, tw), tx, y + 28);
  // 难度 + 定数徽章
  const badge = d.short + ' ' + (s.constant ? s.constant.toFixed(1) : '?') + (s.estimated ? '*' : '');
  g.font = 'bold 13px ' + FONT;
  const bw = g.measureText(badge).width + 14;
  round(g, tx, y + 38, bw, 20, 4);
  g.fillStyle = d.color; g.fill();
  if (d.key === 'ult') { g.strokeStyle = '#e33'; g.lineWidth = 1.5; g.stroke(); }
  g.fillStyle = '#fff'; g.fillText(badge, tx + 7, y + 53);
  const rk = scoreRank(s.score);
  g.fillStyle = rk.startsWith('SSS') ? '#ffd65a' : rk.startsWith('SS') ? '#ffe9a8' : '#ddd';
  g.font = 'bold 15px ' + FONT;
  g.fillText(rk, tx + bw + 8, y + 54);
  if (s.lamp) {
    const rw = g.measureText(rk).width;
    g.fillStyle = s.lamp === 'FC' ? '#7ee0ff' : '#ffb86b';
    g.font = 'bold 13px ' + FONT;
    g.fillText(s.lamp, tx + bw + 8 + rw + 8, y + 54);
  }
  g.fillStyle = '#fff'; g.font = 'bold 22px ' + FONT;
  g.fillText(s.score.toLocaleString('en-US'), tx, y + h - 16);
  g.textAlign = 'right';
  g.fillStyle = '#ffd65a'; g.font = 'bold 20px ' + FONT;
  g.fillText(floor2(s.rating), x + w - 10, y + h - 16);
  g.textAlign = 'left';
}

export async function renderChunithm(game, snap, name, onStatus = () => {}) {
  onStatus('正在读取定数表…');
  let list = [], dbError = '';
  try { list = await loadJson(DB_URL); } catch (e) { dbError = '  ·  定数表读取失败'; }
  const byId = new Map(list.map((m) => [String(m.id), m]));
  const byTitle = new Map(list.map((m) => [m.title, m]));
  // 快照的一行 → 书签 card() 用的数据。定数未公开时按等级估算（14+ → 14.5，图上加 *），同书签的 enrich
  const toSong = (e) => {
    const [id, d] = String(e[0]).split(':');
    const diff = +d;
    const key = (DIFFS[diff] || DIFFS[3]).key;
    const m = byId.get(id) || byTitle.get(e[1]);
    let c = m ? parseFloat(m['lev_' + key + '_i']) : NaN, estimated = false;
    if (!(c > 0) && m && m['lev_' + key]) { const lv = m['lev_' + key]; c = parseFloat(lv) + (lv.endsWith('+') ? 0.5 : 0); estimated = true; }
    return {
      title: e[1], diff, score: e[2], lamp: e[4] || '', rating: e[3] != null ? e[3] / 100 : 0,
      constant: c > 0 ? c : 0, estimated, jacket: m && m.image ? JACKET_URL + m.image : null,
    };
  };
  const best = (snap.best || []).map(toSong), news = (snap.news || []).map(toSong);
  if (!best.length && !news.length) throw new Error('这次快照里没有曲目列表（书签旧版本的快照）');

  onStatus('正在加载曲绘…');
  const all = [...best, ...news];
  const queue = all.slice();
  let done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const s = queue.shift();
      s.img = await loadImg(s.jacket);
      onStatus(`正在加载曲绘… ${++done}/${all.length}`);
    }
  }));

  // drawB50
  const HEAD = 190, SEC = 56, FOOT = 50;
  const H = HEAD + SEC + rows(best.length) * (CH + GAP) + SEC + rows(news.length) * (CH + GAP) + FOOT;
  const { cv, g } = newCanvas(H);
  const sum = (l) => l.reduce((a, s) => a + s.rating, 0);
  const bAvg = best.length ? sum(best) / best.length : 0;
  const nAvg = news.length ? sum(news) / news.length : 0;
  const total = (sum(best) + sum(news)) / 50;
  // 玩家名：书签用 CHUNITHM-NET 上的原样（全角）
  header(g, 'CHUNITHM  RATING  BEST 50', String(name || ''));
  const rx = W - PAD;
  stat(g, 'RATING', snap.r ? Number(snap.r).toFixed(2) : floor2(total), rx, '#ffd65a', true);
  stat(g, 'NEW 20 AVG', floor2(nAvg), rx - 260, '#7ee0ff');
  stat(g, 'BEST 30 AVG', floor2(bAvg), rx - 460, '#c9a2ff');
  g.fillStyle = '#ffffff80'; g.font = '14px ' + FONT; g.textAlign = 'right';
  g.fillText('计算值 (B30+N20)/50 = ' + floor2(total) + '　·　单曲最高 ' + floor2(Math.max(0, ...all.map((s) => s.rating))), rx, PAD + 122);
  g.textAlign = 'left';
  g.fillStyle = '#ffffff33'; g.fillRect(PAD, HEAD - 22, W - PAD * 2, 2);

  let y = HEAD;
  const section = (label, list2, color) => {
    sectionTitle(g, label, y, color);
    y += SEC;
    list2.forEach((s, i) => card(g, s, '#' + (i + 1), PAD + (i % COLS) * (CW + GAP), y + Math.floor(i / COLS) * (CH + GAP)));
    y += rows(list2.length) * (CH + GAP);
  };
  section('BEST 30', best, '#c9a2ff');
  section('NEW 20', news, '#7ee0ff');
  // 页脚：书签写生成日期，这里写快照的时间（可能是以前的快照）
  g.fillStyle = '#ffffff66'; g.font = '13px ' + FONT;
  g.fillText(snap.t + ' 运行查分书签时的 B50  ·  SBGA DASHBOARD  ·  data: CHUNITHM-NET / otoge-db  ·  * = 定数未公開（推定）' + dbError, PAD, H - 20);

  onStatus('正在生成图片…');
  const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('图片生成失败'))), 'image/png'));
  cv.width = cv.height = 0;
  return { blob, url: URL.createObjectURL(blob), missing: all.filter((s) => !s.img).length, dbError: dbError ? '定数表读取失败，定数显示为「?」' : '' };
}
