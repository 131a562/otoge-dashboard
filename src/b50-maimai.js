// maimai DX 的 B50 图：照搬 maimai-dx-score 书签的 B50 图样式（src/maimai-scores.js 的 drawImage / drawCard / constPill / drawStars），
// 改书签那边的样式时这里也要跟着改。
//   顶部：「maimai でらっくす <最新版本>  ·  玩家名」+「DX Rating 16257」，右上 BEST35 / NEW15 两个统计框
//   卡片（每行 5 张）：曲绘、B1/N1、DX/STD、难度·定数（13⁺.8）、版本、曲名、达成率 + 评级、FC/AP、FS/FDX、DX 星、DX 分、单曲 rating
// 数据：快照（[键, 曲名, 达成率×10000, 单曲 rating, FC/AP, 难度, DX/STD, 曲绘]）+ 成绩扫描里当时的 FS/FDX、DX 分（快照的行里没有）
const V = new URL(import.meta.url).search;
const { norm } = await import('./common.js' + V);
const { loadJson, loadImg, rrect, fit, FONT } = await import('./b50.js' + V);

// 定数表：先读 SBGA TOOL 每天整理的那份（格式和 otoge-db 一样，定数和书签 / SBGA TOOL 统一），读不到时退回 otoge-db
const DB_URL = ['https://131a562.github.io/sbga-tool/data/feed/maimai-music-ex.json', 'https://otoge-db.net/maimai/data/music-ex.json'];
const JACKET_URL = 'https://otoge-db.net/maimai/jacket/';
const IMG = { W: 1800, PAD: 28, COLS: 5, GAP: 10, CH: 124, HEAD: 168, SEC: 44, FOOT: 40 };
IMG.CW = Math.floor((IMG.W - IMG.PAD * 2 - IMG.GAP * (IMG.COLS - 1)) / IMG.COLS);
const C = {
  bg: '#16151c', card: '#24222d', line: '#3a3745', fg: '#f3f1f8', muted: '#9d99ab', accent: '#ff5aa8', plat: '#7fe0ff',
  BASIC: '#3fbf6f', ADVANCED: '#f2a33a', EXPERT: '#e5484d', MASTER: '#9a5cf0', 'Re:MASTER': '#e3c8ff',
  'SSS+': '#ffd36b', SSS: '#ffc94a', 'SS+': '#f0b43c', SS: '#f0b43c', 'S+': '#e3a53a', S: '#e3a53a',
  'AP+': '#ffd36b', AP: '#ffc94a', 'FC+': '#7fe0ff', FC: '#4fc3f7',
  'FDX+': '#ff9a5a', FDX: '#ffb347', 'FS+': '#7ee08a', FS: '#5ccf6c', SYNC: '#9d99ab',
  DX: '#ff9a3c', STD: '#4aa3ff', star: ['#3a3745', '#5ccf6c', '#5ccf6c', '#ffb347', '#ffb347', '#ffd36b'],
};
const DIFFS = { BASIC: ['BAS', 'bas'], ADVANCED: ['ADV', 'adv'], EXPERT: ['EXP', 'exp'], MASTER: ['MAS', 'mas'], 'Re:MASTER': ['ReM', 'remas'] };
const RANKS = [['SSS+', 100.5], ['SSS', 100], ['SS+', 99.5], ['SS', 99], ['S+', 98], ['S', 97],
  ['AAA', 94], ['AA', 90], ['A', 80], ['BBB', 75], ['BB', 70], ['B', 60], ['C', 50], ['D', 0]];
const SYNC_RANK = { '': 0, SYNC: 1, FS: 2, 'FS+': 3, FDX: 4, 'FDX+': 5 };
// 版本序号与 maimai DX NET「バージョン別」的 version 参数一致（0 = maimai）；otoge-db 的 version 是 5 位代码（同书签）
const VERSIONS = [
  [10000, 'maimai'], [11000, 'maimai PLUS'], [12000, 'GreeN'], [13000, 'GreeN PLUS'],
  [14000, 'ORANGE'], [15000, 'ORANGE PLUS'], [16000, 'PiNK'], [17000, 'PiNK PLUS'],
  [18000, 'MURASAKi'], [18500, 'MURASAKi PLUS'], [19000, 'MiLK'], [19500, 'MiLK PLUS'],
  [19900, 'FiNALE'], [20000, 'でらっくす'], [20500, 'でらっくす PLUS'], [21000, 'Splash'],
  [21500, 'Splash PLUS'], [22000, 'UNiVERSE'], [22500, 'UNiVERSE PLUS'], [23000, 'FESTiVAL'],
  [23500, 'FESTiVAL PLUS'], [24000, 'BUDDiES'], [24500, 'BUDDiES PLUS'], [25000, 'PRiSM'],
  [25500, 'PRiSM PLUS'], [26000, 'CiRCLE'], [26500, 'CiRCLE PLUS'], [27000, 'MAGiCAL'],
];
const versionIndexOf = (code) => {
  const c = +code || 0;
  if (!c) return -1;
  const last = VERSIONS[VERSIONS.length - 1][0];
  if (c >= last + 500) return VERSIONS.length - 1 + Math.floor((c - last) / 500);
  let i = VERSIONS.length - 1;
  while (i > 0 && VERSIONS[i][0] > c) i--;
  return i;
};
const versionName = (v) => (v >= 0 ? (VERSIONS[v] || [])[1] || `Ver.${v}` : '');
const dxStarOf = (p, max) => (max > 0 ? [0.85, 0.9, 0.93, 0.95, 0.97].filter((t) => p >= max * t).length : 0);
const f = (w, px) => `${w} ${px}px ${FONT}`;

// 定数的显示：13.8 → 13⁺.8（x.6 以上为「+」，等级读得到时以等级为准）
const constParts = (s) => {
  if (s.const == null) return null;
  const i = Math.floor(s.const + 1e-9);
  const plus = s.level ? s.level.endsWith('+') : s.const - i >= 0.6 - 1e-9;
  return { int: String(i), plus, dec: s.const_unknown ? '.?' : '.' + Math.round((s.const - i) * 10) };
};
function pill(ctx, text, x, y, color, px = 12, ink = '#16151c') {
  ctx.font = f(800, px);
  const w = ctx.measureText(text).width + px;
  rrect(ctx, x, y - px - 2, w, px + 7, 4);
  ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = ink; ctx.fillText(text, x + px / 2, y + 1);
  return w;
}
// 难度·定数标签：「MAS 13⁺.8」，+ 用小字号画在右上角
function constPill(ctx, s, x, y, px = 13) {
  const p = constParts(s);
  const parts = p
    ? [[`${s.diffShort} ${p.int}`, px, 0], [p.plus ? '+' : '', px - 2, -px * 0.42], [p.dec, px, 0]]
    : [[`${s.diffShort} ?`, px, 0]];
  let w = px;
  for (const [t, size] of parts) { ctx.font = f(800, size); w += ctx.measureText(t).width; }
  rrect(ctx, x, y - px - 3, w, px + 9, 4);
  ctx.fillStyle = C[s.difficulty] || C.muted; ctx.fill();
  ctx.fillStyle = s.difficulty === 'Re:MASTER' ? '#3b1d5e' : '#16151c';
  let cx = x + px / 2;
  for (const [t, size, dy] of parts) { ctx.font = f(800, size); ctx.fillText(t, cx, y + 1 + dy); cx += ctx.measureText(t).width; }
  return w;
}
// DX 分的星（✦）用图形画；颜色随星数变化（1-2 绿 / 3-4 橙 / 5 金）
function drawStars(ctx, n, right, baseline, size = 12, gap = 2) {
  const total = 5 * size + 4 * gap;
  for (let i = 0; i < 5; i++) {
    const cx = right - total + i * (size + gap) + size / 2, cy = baseline - size / 2;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const r = k % 2 ? size * 0.2 : size / 2;
      const a = -Math.PI / 2 + (k * Math.PI) / 4;
      ctx[k ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = i < n ? C.star[n] : C.line;
    ctx.fill();
  }
  return total;
}

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
  // 曲绘左上角：序号；左下角：DX / STD
  ctx.font = f(800, 13);
  const lw = ctx.measureText(label).width + 12;
  rrect(ctx, x + 4, y + 4, lw, 20, 5); ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(label, x + 10, y + 19);
  if (s.kind) pill(ctx, s.kind, x + 6, y + CH - 12, C[s.kind], 11, '#fff');

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
  // 第 1 行：难度·定数（左）  版本（右）
  let cx = L + constPill(ctx, s, L, y + 20) + 8;
  if (s.version) textR(s.version, y + 20, f(600, 12), C.muted, R - cx);
  // 第 2 行：曲名
  text(s.title, L, y + 45, f(700, 16), C.fg, TW);
  // 第 3 行：达成率 + 评级
  cx = L + text(`${s.achievement.toFixed(4)}%`, L, y + 71, f(800, 18), C.fg);
  text(s.rank, cx + 5, y + 71, f(800, 14), C[s.rank] || C.muted, R - cx - 5);
  // 第 4 行：FC/AP、FS/FDX（左）  DX 星（右，没有 DX 分时不画）
  const starW = s.dx_max ? drawStars(ctx, s.dx_star, R, y + 93) : 0;
  cx = L;
  for (const t of [s.fc, s.sync === 'SYNC' ? '' : s.sync]) {
    if (!t) continue;
    ctx.font = f(800, 11);
    if (cx + ctx.measureText(t).width + 11 > R - starW - 6) break;
    cx += pill(ctx, t, cx, y + 93, C[t] || C.muted, 11) + 4;
  }
  // 第 5 行：DX 分 / 满分（左）  单曲 rating（右）
  const ratingW = textR(s.rating > 0 ? String(s.rating) : '—', y + 117, f(800, 22), s.rating > 0 ? C.accent : C.muted, TW);
  if (s.dx_max) {
    cx = L + text('DX ', L, y + 116, f(700, 11), C.muted);
    text(`${s.dx_score.toLocaleString('en-US')} / ${s.dx_max.toLocaleString('en-US')}`, cx, y + 116, f(700, 13), C.plat, R - cx - ratingW - 8);
  }
}

// obs：观测记录（取 FS/FDX、DX 分）
export async function renderMaimai(game, snap, name, obs, onStatus = () => {}) {
  onStatus('正在读取定数表…');
  let list = [], dbError = '';
  try { list = await loadJson(DB_URL); } catch (e) { dbError = '定数表读取失败，定数显示为「?」'; }
  const byImg = new Map(), byTitle = new Map();
  list.forEach((m) => {
    if (m.catcode === '宴会場' || m.lev_utage) return;
    if (m.image_url) byImg.set(m.image_url, m);
    if (!byTitle.has(norm(m.title))) byTitle.set(norm(m.title), m);
  });
  // 最新版本（标题里写、NEW15 的范围）：同书签，CiRCLE（序号 25）以后新曲枠是当前版本 + 上一个版本
  const latestVersion = Math.max(VERSIONS.length - 1, ...list.map((m) => versionIndexOf(m.version)));
  const newVersions = latestVersion >= 25 ? [latestVersion, latestVersion - 1] : [latestVersion];
  // 快照时刻的 FS/FDX、DX 分：这个谱面在快照之前（含）的最好记录。成绩扫描和プレイ履歴都算：
  // 起点之后新打的歌，プレイ履歴先记下了成绩，之后的扫描没有变化就不再存，只有プレイ履歴里有
  const extra = new Map();
  (obs || []).forEach((o) => {
    if ((o.src !== 'b' && o.src !== 'p') || o.t > snap.t) return;
    const p = extra.get(o.k) || { sy: '', x: 0, xm: 0 };
    if ((SYNC_RANK[o.sy] || 0) > (SYNC_RANK[p.sy] || 0)) p.sy = o.sy;
    if (o.x > p.x) { p.x = o.x; p.xm = o.xm || p.xm; }
    extra.set(o.k, p);
  });
  const toSong = (e) => {
    const [key, title, ach, rating, fc, diff, kind, img] = e;
    const [short, dk] = DIFFS[diff] || ['?', 'mas'];
    const m = (img && byImg.get(img)) || byTitle.get(norm(title));
    const pre = kind === 'DX' ? 'dx_' : '';
    const level = (m && m[pre + 'lev_' + dk]) || '';
    const ci = parseFloat(m && m[pre + 'lev_' + dk + '_i']);
    const est = parseFloat(level) + (level.endsWith('+') ? 0.6 : 0);
    const x = extra.get(key) || { sy: '', x: 0, xm: 0 };
    const a = ach / 10000;
    return {
      title, difficulty: diff, diffShort: short, kind, level,
      const: ci > 0 ? ci : est > 0 ? est : null, const_unknown: !(ci > 0),
      version: m ? versionName(versionIndexOf(m.version)) : '',
      achievement: a, rank: RANKS.find(([, b]) => a >= b)[0], fc: fc || '', sync: x.sy,
      dx_score: x.x, dx_max: x.xm, dx_star: dxStarOf(x.x, x.xm), rating: rating || 0,
      img: img ? JACKET_URL + img : m && m.image_url ? JACKET_URL + m.image_url : null,
    };
  };
  const old35 = (snap.best || []).map(toSong), new15 = (snap.news || []).map(toSong);
  if (!old35.length && !new15.length) throw new Error('这次快照里没有曲目列表（书签旧版本的快照）');

  onStatus('正在加载曲绘…');
  const all = [...old35, ...new15];
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

  const sumR = (arr) => arr.reduce((a, s) => a + s.rating, 0);
  const parts = snap.parts || [sumR(new15), sumR(old35)];
  const calc = snap.c != null ? snap.c : parts[0] + parts[1];
  const diffR = snap.r - calc;
  const maxMin = (arr) => {
    const r = arr.map((s) => s.rating);
    return r.length ? `最高 ${Math.max(...r)} · 最低 ${Math.min(...r)}` : '—';
  };
  const title = `DX Rating ${snap.r || calc}`;
  const subtitle = `游戏内 Rating（maimai DX NET）· 按定数计算 ${calc}${diffR === 0 ? '（一致）' : `（差 ${diffR > 0 ? '+' : ''}${diffR}）`} · ${snap.t} 运行查分书签时的 B50`;
  const stats = [
    ['BEST35', `${parts[1]}`, `${old35.length}曲 · ${maxMin(old35)}`],
    ['NEW15', `${parts[0]}`, `${new15.length}曲 · ${maxMin(new15)}`],
  ];
  // 旧曲（BEST35）在上，新曲（NEW15）在下；角标是所在枠的序号（B1〜B35 / N1〜N15）
  const sections = [
    { name: 'BEST35', note: `合计 ${parts[1]}`, rows: old35, prefix: 'B' },
    { name: 'NEW15', note: `${newVersions.map(versionName).join(' / ')} · 合计 ${parts[0]}`, rows: new15, prefix: 'N' },
  ];

  const { W, PAD, COLS, GAP, CH, HEAD, SEC, FOOT, CW } = IMG;
  const rowsOf = (n) => Math.max(1, Math.ceil(n / COLS));
  const H = HEAD + sections.reduce((h, sec) => h + SEC + rowsOf(sec.rows.length) * (CH + GAP), 0) + FOOT;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  // 头部：左边标题，右边统计
  ctx.fillStyle = C.accent; ctx.font = f(800, 16);
  ctx.fillText(fit(ctx, `maimai でらっくす ${versionName(latestVersion)}${name ? '  ·  ' + name : ''}`, 700), PAD, 42);
  ctx.fillStyle = C.fg; ctx.font = f(800, 52); ctx.fillText(fit(ctx, title, 760), PAD, 100);
  ctx.font = f(500, 15); ctx.fillStyle = C.muted; ctx.fillText(fit(ctx, subtitle, 1250), PAD, 132);
  const boxW = 220, boxGap = 10;
  stats.forEach(([label, value, note], i) => {
    const bx = W - PAD - (stats.length - i) * (boxW + boxGap) + boxGap;
    rrect(ctx, bx, 26, boxW, 112, 10); ctx.fillStyle = C.card; ctx.fill();
    ctx.fillStyle = C.muted; ctx.font = f(700, 14); ctx.fillText(label, bx + 14, 52);
    ctx.fillStyle = C.fg; ctx.font = f(800, 30); ctx.fillText(fit(ctx, value, boxW - 28), bx + 14, 92);
    ctx.fillStyle = C.muted; ctx.font = f(500, 13); ctx.fillText(fit(ctx, note, boxW - 28), bx + 14, 122);
  });
  let y = HEAD;
  for (const sec of sections) {
    ctx.fillStyle = C.line; ctx.fillRect(PAD, y + 6, W - PAD * 2, 1);
    ctx.fillStyle = C.fg; ctx.font = f(800, 20); ctx.fillText(sec.name, PAD, y + 34);
    const nw = ctx.measureText(sec.name).width;
    ctx.font = f(500, 15); ctx.fillStyle = C.muted; ctx.fillText(sec.note, PAD + nw + 14, y + 34);
    y += SEC;
    sec.rows.forEach((s, i) => {
      drawCard(ctx, s, sec.prefix + (i + 1), PAD + (i % COLS) * (CW + GAP), y + Math.floor(i / COLS) * (CH + GAP), jackets.get(s));
    });
    y += rowsOf(sec.rows.length) * (CH + GAP);
  }
  ctx.font = f(500, 13); ctx.fillStyle = C.muted;
  ctx.fillText(fit(ctx, `${snap.t} 运行查分书签时的数据  ·  SBGA DASHBOARD  ·  成绩：maimai DX NET  ·  定数・曲绘：otoge-db（定数为 ".?" 的还未公开）  ·  AP/AP+ 单曲 rating +1` +
    (dbError ? '  ·  ' + dbError : ''), W - PAD * 2), PAD, H - 16);

  onStatus('正在生成图片…');
  const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('图片生成失败'))), 'image/png'));
  cv.width = cv.height = 0;
  return { blob, url: URL.createObjectURL(blob), missing: all.filter((s) => !jackets.get(s)).length, dbError };
}
