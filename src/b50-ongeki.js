// オンゲキ的 B50 图：照搬 ongeki-score-export 书签的 B50 图样式（src/ongeki-scores.js 的 drawImage / drawCard / drawPCard），
// 改书签那边的样式时这里也要跟着改。
//   左边：BEST50 + NEW10 的大卡片（每行 5 张）；右边：P-SCORE50 的小卡片（每行 2 张）；宽约 2240px
//   顶部：「O.N.G.E.K.I. Re:Fresh」+「Rating 18.146」，右上角 NEW10 / BEST50 / P-SCORE50 三个统计框
// 数据：快照（书签运行时的 BEST50 / NEW10 / P-SCORE50）+ 成绩扫描里当时的プラチナスコア（快照的行里没有）
const V = new URL(import.meta.url).search;
const { norm } = await import('./common.js' + V);
const { loadJson, loadImg, rrect, fit, FONT } = await import('./b50.js' + V);

// 定数表：先读 SBGA TOOL 每天整理的那份（格式和 reiwa.f5.si 一样，定数和书签 / SBGA TOOL 统一），读不到时退回 reiwa.f5.si
const DB_URL = ['https://131a562.github.io/sbga-tool/data/feed/ongeki_record.json', 'https://reiwa.f5.si/ongeki_record.json'];
const JACKET_URL = 'https://reiwa.f5.si/jackets/ongeki/';
const IMG = { W: 1800, PAD: 28, COLS: 5, GAP: 10, CH: 124, HEAD: 168, SEC: 44, FOOT: 40 };
IMG.CW = Math.floor((IMG.W - IMG.PAD * 2 - IMG.GAP * (IMG.COLS - 1)) / IMG.COLS);
const SIDE = { CW: 206, CH: 62, GAP: 6, COLS: 2, MARGIN: 24 };
SIDE.W = SIDE.CW * SIDE.COLS + SIDE.GAP * (SIDE.COLS - 1);
const C = {
  bg: '#16151c', card: '#24222d', line: '#3a3745', fg: '#f3f1f8', muted: '#9d99ab', accent: '#ff5aa8', plat: '#7fe0ff',
  BASIC: '#3fbf6f', ADVANCED: '#f2a33a', EXPERT: '#e5484d', MASTER: '#9a5cf0', LUNATIC: '#e8e5f0',
  'SSS+': '#ffd36b', SSS: '#ffc94a', SS: '#f0b43c', S: '#e3a53a',
  'AB+': '#ff7ab8', AB: '#ffb347', FC: '#4fc3f7', FB: '#ffe066', star: '#ffd36b',
};
const DIFF_SHORT = { BASIC: 'BAS', ADVANCED: 'ADV', EXPERT: 'EXP', MASTER: 'MAS', LUNATIC: 'LUN' };
const DIFF_DB = { EXPERT: 'EXP', MASTER: 'MAS', LUNATIC: 'LUN', ADVANCED: 'ADV', BASIC: 'BAS' };
const RANKS = [['SSS+', 1007500], ['SSS', 1000000], ['SS', 990000], ['S', 970000], ['AAA', 940000], ['AA', 900000], ['A', 850000],
  ['BBB', 800000], ['BB', 750000], ['B', 700000], ['C', 500000], ['D', 0]];
const f = (w, px) => `${w} ${px}px ${FONT}`;
const fmtPs = (v) => v.toFixed(5).replace(/(\.\d{3}\d*?)0+$/, '$1');
const sum = (a) => a.reduce((x, y) => x + y, 0);

function pill(ctx, text, x, y, color, px = 12, ink = '#16151c') {
  ctx.font = f(800, px);
  const w = ctx.measureText(text).width + px;
  rrect(ctx, x, y - px - 2, w, px + 7, 4);
  ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = ink; ctx.fillText(text, x + px / 2, y + 1);
  return w;
}
// 难度 + 定数标签。等级带 + 的写成「13⁺.8」：加号小一号、画在整数部分右上角；不带 + 的写「13.5」
function constPill(ctx, s, x, y, color, px = 12) {
  const ink = '#16151c';
  const head = `${DIFF_SHORT[s.difficulty] || ''} `;
  let intPart = '?', tail = '';
  if (s.const != null) {
    const [i, d] = s.const.toFixed(1).split('.');
    intPart = i; tail = '.' + d;
  }
  if (s.const_unknown) tail += '?';
  const big = f(800, px), small = f(800, Math.round(px * 0.75));
  ctx.font = big;
  const wHead = ctx.measureText(head + intPart).width, wTail = ctx.measureText(tail).width;
  ctx.font = small;
  const wPlus = s.plus ? ctx.measureText('+').width + 1 : 0;
  const w = wHead + wPlus + wTail + px;
  rrect(ctx, x, y - px - 2, w, px + 7, 4);
  ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = ink;
  let tx = x + px / 2;
  ctx.font = big; ctx.fillText(head + intPart, tx, y + 1); tx += wHead;
  if (s.plus) { ctx.font = small; ctx.fillText('+', tx, y + 1 - px * 0.42); tx += wPlus; }
  ctx.font = big; ctx.fillText(tail, tx, y + 1);
  return w;
}
// ☆ 用图形画，不依赖字体
function drawStars(ctx, n, right, baseline, size = 11, gap = 2) {
  const total = 5 * size + 4 * gap;
  for (let i = 0; i < 5; i++) {
    const cx = right - total + i * (size + gap) + size / 2, cy = baseline - size / 2;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? size * 0.22 : size / 2;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      ctx[k ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = i < Math.min(n, 5) ? C.star : C.line;
    ctx.fill();
  }
  return total;
}

// 大卡片（BEST50 / NEW10）
function drawCard(ctx, s, label, x, y, jacket) {
  const { CW, CH } = IMG;
  rrect(ctx, x, y, CW, CH, 10); ctx.fillStyle = C.card; ctx.fill();
  ctx.save(); rrect(ctx, x, y, CW, CH, 10); ctx.clip();
  if (jacket) ctx.drawImage(jacket, x, y, CH, CH);
  else {
    ctx.fillStyle = C.line; ctx.fillRect(x, y, CH, CH);
    ctx.fillStyle = C.muted; ctx.font = f(700, 14); ctx.textAlign = 'center';
    ctx.fillText('NO IMAGE', x + CH / 2, y + CH / 2 + 5); ctx.textAlign = 'left';
  }
  ctx.fillStyle = C[s.difficulty] || C.muted; ctx.fillRect(x, y + CH - 6, CH, 6);
  ctx.restore();
  ctx.font = f(800, 13);
  const lw = ctx.measureText(label).width + 12;
  rrect(ctx, x + 4, y + 4, lw, 20, 5); ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(label, x + 10, y + 19);

  const L = x + CH + 10, R = x + CW - 10, TW = R - L;
  ctx.textAlign = 'left';
  const text = (t, tx, ty, font, color, maxW) => {
    ctx.font = font; ctx.fillStyle = color;
    const s2 = maxW != null ? fit(ctx, t, Math.max(0, maxW)) : t;
    if (maxW == null || maxW > 12) ctx.fillText(s2, tx, ty);
    return ctx.measureText(s2).width;
  };
  const textR = (t, ty, font, color, maxW) => {
    ctx.font = font;
    const s2 = fit(ctx, t, maxW);
    const w = ctx.measureText(s2).width;
    if (maxW > 12) { ctx.fillStyle = color; ctx.fillText(s2, R - w, ty); }
    return w;
  };
  // 第 1 行：难度·定数（左）  P-SCORE枠的名次（右）
  let cx = L + constPill(ctx, s, L, y + 19, C[s.difficulty] || C.muted) + 8;
  if (s.pRank) textR(s.pRank, y + 19, f(700, 12), C.plat, R - cx);
  // 第 2 行：曲名
  text(s.title, L, y + 42, f(700, 16), C.fg, TW);
  // 第 3 行：TS + 评级（左）  P-rate（右）
  cx = L + text(s.ts.toLocaleString('en-US'), L, y + 66, f(800, 18), C.fg);
  cx += 5 + text(s.rank, cx + 5, y + 66, f(800, 14), C[s.rank] || C.muted);
  if (s.ps_rating > 0) textR(`P ${fmtPs(s.ps_rating)}`, y + 66, f(600, 12), C.plat, R - cx - 8);
  // 第 4 行：灯 / FB（左）  ☆（右）
  const starW = drawStars(ctx, s.star, R, y + 89);
  cx = L;
  for (const [t, c] of [[C[s.lamp] ? s.lamp : '', C[s.lamp]], [s.fb ? 'FB' : '', C.FB]]) {
    if (!t) continue;
    ctx.font = f(800, 11);
    if (cx + ctx.measureText(t).width + 11 > R - starW - 6) break;
    cx += pill(ctx, t, cx, y + 89, c, 11) + 4;
  }
  // 第 5 行：プラチナスコア（左）  单曲 Rating（右）
  const mainW = textR(s.rating > 0 ? s.rating.toFixed(3) : '—', y + 115, f(800, 22), s.rating > 0 ? C.accent : C.muted, TW);
  const ps = s.ps ? `PS ${s.ps.toLocaleString('en-US')}${s.pm ? '/' + s.pm.toLocaleString('en-US') : ''}` : 'PS —';
  text(ps, L, y + 114, f(600, 11), C.muted, TW - mainW - 8);
}

// 右侧栏的 P-SCORE50 小卡片（曲绘 + 名次 + 曲名 + 难度·定数 + PS 比例 + ☆ + P-rate），每行 2 张
function drawPCard(ctx, s, label, x, y, jacket) {
  const { CW, CH } = SIDE;
  rrect(ctx, x, y, CW, CH, 8); ctx.fillStyle = C.card; ctx.fill();
  ctx.save(); rrect(ctx, x, y, CW, CH, 8); ctx.clip();
  if (jacket) ctx.drawImage(jacket, x, y, CH, CH);
  else { ctx.fillStyle = C.line; ctx.fillRect(x, y, CH, CH); }
  ctx.fillStyle = C[s.difficulty] || C.muted; ctx.fillRect(x, y + CH - 4, CH, 4);
  ctx.restore();
  ctx.font = f(800, 11);
  const lw = ctx.measureText(label).width + 8;
  rrect(ctx, x + 3, y + 3, lw, 16, 4); ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(label, x + 7, y + 15);
  const L = x + CH + 8, R = x + CW - 8;
  ctx.font = f(700, 13); ctx.fillStyle = C.fg;
  ctx.fillText(fit(ctx, s.title, R - L), L, y + 18);
  const pw = constPill(ctx, s, L, y + 37, C[s.difficulty] || C.muted, 10);
  if (s.pm) {
    ctx.font = f(600, 10); ctx.fillStyle = C.muted;
    const pct = ((s.ps / s.pm) * 100).toFixed(1) + '%';
    const w = ctx.measureText(pct).width;
    if (L + pw + 6 + w <= R) ctx.fillText(pct, R - w, y + 37);
  }
  drawStars(ctx, s.star, L + 53, y + 56, 9, 2);
  ctx.font = f(800, 15); ctx.fillStyle = C.plat;
  const t = fmtPs(s.ps_rating);
  ctx.fillText(t, R - ctx.measureText(t).width, y + 57);
}

// snap：快照；obs：这个玩家的观测记录（取プラチナスコア）；返回 { blob, url, missing, dbError }
export async function renderOngeki(game, snap, name, obs, onStatus = () => {}) {
  onStatus('正在读取定数表…');
  let list = [], dbError = '';
  try { list = await loadJson(DB_URL); } catch (e) { dbError = '定数表读取失败，定数显示为「?」'; }
  const byKey = new Map();
  list.forEach((m) => { const k = norm(m.title) + '|' + m.diff; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(m); });
  // 最新版本（NEW10 的说明里写）：定数表里发布最晚的谱面所在的版本（同书签）
  const latestVersion = list.reduce((a, m) => (m.release_unix > a.t && m.version ? { t: m.release_unix, v: m.version } : a), { t: 0, v: '' }).v;
  // 谱面键「曲名|难度」，同名曲是「曲名|难度|艺术家」
  const findDb = (key) => {
    const [title, diff, artist] = String(key).split('|');
    let c = byKey.get(norm(title) + '|' + (DIFF_DB[diff] || diff)) || [];
    if (c.length > 1 && artist && artist !== '?') c = c.filter((m) => norm(m.artist) === norm(artist)).concat(c);
    return { m: c[0], diff, artist: artist && artist !== '?' ? artist : '' };
  };
  // 快照时刻的プラチナスコア：成绩扫描里这个谱面在快照之前（含）最高的一次。☆ 按书签的规则由比例算（94〜98%）
  const plat = new Map();
  (obs || []).forEach((o) => {
    if (o.src !== 'b' || !(o.pm > 0) || o.t > snap.t) return;
    const p = plat.get(o.k);
    if (!p || o.ps > p.ps) plat.set(o.k, { ps: o.ps, pm: o.pm });
  });
  const starOf = (p) => (p && p.pm > 0 ? [94, 95, 96, 97, 98].filter((t) => p.ps * 100 >= p.pm * t).length : 0);
  const psRows = snap.ps || [];
  const pRankOf = new Map(psRows.map((e, i) => [e[0], 'P' + (i + 1)]));
  const base = (key, title) => {
    const { m, diff, artist } = findDb(key);
    const p = plat.get(key);
    const c = m && m.const > 0 ? m.const : null;
    return {
      title: title + (artist ? '（' + artist + '）' : ''), difficulty: diff, const: c, const_unknown: !m ? true : !!m.is_unknown,
      plus: m ? m.level % 1 >= 0.5 : false, img: m && m.img ? JACKET_URL + m.img + '.webp' : null,
      ps: p ? p.ps : 0, pm: p ? p.pm : 0, star: starOf(p),
    };
  };
  const card = (e) => {
    const s = base(e[0], e[1]);
    const psUnits = s.const ? Math.min(s.star, 5) * Math.round(s.const * 10) ** 2 : 0;
    return {
      ...s, ts: e[2], rank: RANKS.find(([, b]) => e[2] >= b)[0], lamp: e[4] || '', fb: !!e[5],
      rating: e[3] != null ? e[3] / 1000 : 0, ps_rating: psUnits / 1e5, pRank: pRankOf.get(e[0]) || '',
    };
  };
  const best = (snap.best || []).map(card), news = (snap.news || []).map(card);
  // P-SCORE50 的行：[键, 曲名, ☆, P-rate×100000]，☆ 和 P-rate 以快照为准
  const side = psRows.map((e) => ({ ...base(e[0], e[1]), star: e[2], ps_rating: e[3] / 1e5 }));
  if (!best.length && !news.length) throw new Error('这次快照里没有曲目列表（书签旧版本的快照）');

  onStatus('正在加载曲绘…');
  const all = [...best, ...news, ...side];
  const jackets = new Map();
  const queue = all.slice();
  let done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const s = queue.shift();
      jackets.set(s, await loadImg(s.img));
      onStatus(`正在加载曲绘… ${++done}/${all.length}`);
    }
  }));

  // 统计框：大字 = 该枠对总 Rating 的贡献（快照的 parts，合计 ÷ 50 截断）；小字 = 曲数・平均・合计
  const parts = snap.parts || [0, 0, 0];
  const avg = (rows) => (rows.length ? sum(rows.map((s) => s.rating)) / rows.length : 0);
  const total = (rows) => sum(rows.map((s) => s.rating));
  const psTotal = sum(side.map((s) => s.ps_rating));
  const stats = [
    ['NEW10', `+${(parts[0] / 1000).toFixed(3)}`, `${news.length}曲 平均 ${avg(news).toFixed(3)} · 合计 ${total(news).toFixed(3)}`],
    ['BEST50', `+${(parts[1] / 1000).toFixed(3)}`, `${best.length}曲 平均 ${avg(best).toFixed(3)} · 合计 ${total(best).toFixed(3)}`],
    ['P-SCORE50', `+${(parts[2] / 1000).toFixed(3)}`, `${side.length}曲 · 合计 ${fmtPs(psTotal)}`],
  ];
  const sections = [
    { name: 'BEST50', note: `平均 ${avg(best).toFixed(3)} · 最低 ${best.length ? best[best.length - 1].rating.toFixed(3) : '—'}`, rows: best, prefix: 'B' },
    { name: 'NEW10', note: `${latestVersion ? latestVersion + ' · ' : ''}平均 ${avg(news).toFixed(3)}`, rows: news, prefix: 'N' },
  ];
  const sideSec = { name: 'P-SCORE50', note: `合计 ${fmtPs(psTotal)} · 最低 ${side.length ? fmtPs(side[side.length - 1].ps_rating) : '—'}`, rows: side };

  const { PAD, COLS, GAP, CH, HEAD, SEC, FOOT, CW } = IMG;
  const mainRight = IMG.W - PAD;
  const sideX = mainRight + SIDE.MARGIN;
  const W = sideX + SIDE.W + PAD;
  const rowsOf = (n) => Math.max(1, Math.ceil(n / COLS));
  const mainH = sections.reduce((h, sec) => h + SEC + rowsOf(sec.rows.length) * (CH + GAP), 0);
  const sideH = SEC + Math.max(1, Math.ceil(side.length / SIDE.COLS)) * (SIDE.CH + SIDE.GAP);
  const H = HEAD + Math.max(mainH, sideH) + FOOT;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  // 头部：左边标题，右边统计
  ctx.fillStyle = C.accent; ctx.font = f(800, 16); ctx.fillText('O.N.G.E.K.I. Re:Fresh', PAD, 42);
  ctx.fillStyle = C.fg; ctx.font = f(800, 52); ctx.fillText(`Rating ${game.fmtRating(snap.r)}`, PAD, 100);
  // 副标题：玩家名、快照时间、三个枠怎么加起来
  ctx.font = f(500, 15); ctx.fillStyle = C.muted;
  const who = String(name || '').normalize('NFKC');
  ctx.fillText(fit(ctx, `${who ? who + ' · ' : ''}${snap.t} 运行查分书签时的 B50 · 新曲枠 ${(parts[0] / 1000).toFixed(3)} + ベスト枠 ${(parts[1] / 1000).toFixed(3)} + P-SCORE枠 ${(parts[2] / 1000).toFixed(3)}`, 1100), PAD, 132);
  const boxW = 200, boxGap = 10;
  stats.forEach(([label, value, note], i) => {
    const bx = W - PAD - (stats.length - i) * (boxW + boxGap) + boxGap;
    rrect(ctx, bx, 26, boxW, 112, 10); ctx.fillStyle = C.card; ctx.fill();
    ctx.fillStyle = C.muted; ctx.font = f(700, 14); ctx.fillText(label, bx + 14, 52);
    ctx.fillStyle = C.fg; ctx.font = f(800, 30); ctx.fillText(fit(ctx, value, boxW - 28), bx + 14, 92);
    ctx.fillStyle = C.muted; ctx.font = f(500, 13); ctx.fillText(fit(ctx, note, boxW - 28), bx + 14, 122);
  });
  // 右侧栏 P-SCORE50
  ctx.fillStyle = C.line; ctx.fillRect(sideX, HEAD + 6, SIDE.W, 1);
  ctx.fillStyle = C.fg; ctx.font = f(800, 20); ctx.fillText(sideSec.name, sideX, HEAD + 34);
  const nw = ctx.measureText(sideSec.name).width;
  ctx.font = f(500, 13); ctx.fillStyle = C.muted;
  ctx.fillText(fit(ctx, sideSec.note, SIDE.W - nw - 10), sideX + nw + 10, HEAD + 34);
  if (!side.length) {
    ctx.font = f(500, 14); ctx.fillStyle = C.muted;
    ctx.fillText('还没有拿到☆的谱面', sideX, HEAD + SEC + 30);
    ctx.font = f(500, 12);
    ctx.fillText('プラチナスコア达到满分的 94% 才有 ☆1', sideX, HEAD + SEC + 52);
  }
  side.forEach((s, i) => {
    drawPCard(ctx, s, `P${i + 1}`, sideX + (i % SIDE.COLS) * (SIDE.CW + SIDE.GAP),
      HEAD + SEC + Math.floor(i / SIDE.COLS) * (SIDE.CH + SIDE.GAP), jackets.get(s));
  });
  // 左边各区块
  let y = HEAD;
  for (const sec of sections) {
    ctx.fillStyle = C.line; ctx.fillRect(PAD, y + 6, mainRight - PAD, 1);
    ctx.fillStyle = C.fg; ctx.font = f(800, 20); ctx.fillText(sec.name, PAD, y + 34);
    const w = ctx.measureText(sec.name).width;
    ctx.font = f(500, 15); ctx.fillStyle = C.muted; ctx.fillText(sec.note, PAD + w + 14, y + 34);
    y += SEC;
    sec.rows.forEach((s, i) => {
      drawCard(ctx, s, sec.prefix + (i + 1), PAD + (i % COLS) * (CW + GAP), y + Math.floor(i / COLS) * (CH + GAP), jackets.get(s));
    });
    y += rowsOf(sec.rows.length) * (CH + GAP);
  }
  ctx.font = f(500, 13); ctx.fillStyle = C.muted;
  ctx.fillText(fit(ctx, `${snap.t} 运行查分书签时的数据  ·  SBGA DASHBOARD  ·  估算值（仅 EXP/MAS/LUN），与游戏内会有少许出入  ·  定数・曲绘：reiwa.f5.si（定数后带 "?" 为未确定）` +
    (dbError ? '  ·  ' + dbError : ''), W - PAD * 2), PAD, H - 16);

  onStatus('正在生成图片…');
  const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('图片生成失败'))), 'image/png'));
  cv.width = cv.height = 0;
  return { blob, url: URL.createObjectURL(blob), missing: all.filter((s) => !jackets.get(s)).length, dbError };
}
