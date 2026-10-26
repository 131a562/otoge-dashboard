// B50 图：用历史记录里最后一次 Rating 快照（snaps 的最后一条，书签最后一次运行时的 B50）画图，
// 不需要运行书签。定数、曲绘按快照里的曲目从公开的定数表查（只在打开 B50 时下载，下载过就不再下载）。
// 快照的行格式见各书签：
//   CHUNITHM  [曲目id:难度, 曲名, 分数, 单曲 Rating×100, 标记]
//   maimai    [键, 曲名, 达成率×10000, 单曲 Rating, FC/AP, 难度, DX/STD, 曲绘]
//   オンゲキ  [曲名|难度(|艺术家), 曲名, TS, 单曲 Rating×1000, 标记, FB]   P-SCORE：[键, 曲名, ☆, P-rate×100000]
const V = new URL(import.meta.url).search;
const { norm } = await import('./common.js' + V);

const num = (x) => Number(x).toLocaleString('en-US');
// table：[[下限, 评级], ...]，从高到低
const rankOf = (v, table) => (table.find(([b]) => v >= b) || [0, 'D'])[1];

// ---- 定数表 ----
const dbCache = new Map();
const loadJson = (url) => {
  if (!dbCache.has(url)) {
    dbCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch((e) => { dbCache.delete(url); throw e; }));
  }
  return dbCache.get(url);
};
const estimate = (lv) => { const n = parseFloat(lv); return n > 0 ? { c: n + (String(lv).endsWith('+') ? 0.5 : 0), est: true, lv } : null; };

const ADAPTERS = {
  chunithm: {
    dbUrl: 'https://otoge-db.net/chunithm/data/music-ex.json',
    jacket: (img) => 'https://otoge-db.net/chunithm/jacket/' + img,
    ranks: [[1009000, 'SSS+'], [1007500, 'SSS'], [1005000, 'SS+'], [1000000, 'SS'], [990000, 'S+'], [975000, 'S'],
      [950000, 'AAA'], [925000, 'AA'], [900000, 'A'], [800000, 'BBB'], [700000, 'BB'], [600000, 'B'], [500000, 'C']],
    prepare(list) { return { byId: new Map(list.map((m) => [String(m.id), m])), byTitle: new Map(list.map((m) => [m.title, m])) }; },
    sections: (s) => [['BEST 30', s.best, 'B'], ['NEW 20', s.news, 'N']],
    row(e, db) {
      const [id, d] = String(e[0]).split(':');
      const key = ['bas', 'adv', 'exp', 'mas', 'ult'][+d] || 'mas';
      const m = db && (db.byId.get(id) || db.byTitle.get(e[1]));
      const ci = parseFloat(m && m['lev_' + key + '_i']);
      return {
        title: e[1], diff: ['BAS', 'ADV', 'EXP', 'MAS', 'ULT'][+d] || '?', diffColor: ['#3fbf6f', '#f2a33a', '#e5484d', '#9a5cf0', '#3b3b3b'][+d] || '#888',
        cst: ci > 0 ? { c: ci } : m ? estimate(m['lev_' + key]) : null,
        score: num(e[2]), rank: rankOf(e[2], this.ranks),
        lamps: e[4] ? [e[4]] : [], rating: e[3] != null ? (e[3] / 100).toFixed(2) : '—',
        img: m && m.image ? this.jacket(m.image) : null,
      };
    },
  },
  maimai: {
    dbUrl: 'https://otoge-db.net/maimai/data/music-ex.json',
    jacket: (img) => 'https://otoge-db.net/maimai/jacket/' + img,
    ranks: [['SSS+', 100.5], ['SSS', 100], ['SS+', 99.5], ['SS', 99], ['S+', 98], ['S', 97], ['AAA', 94], ['AA', 90], ['A', 80],
      ['BBB', 75], ['BB', 70], ['B', 60], ['C', 50]].map(([r, a]) => [a * 10000, r]),
    prepare(list) {
      const byImg = new Map(), byTitle = new Map();
      list.forEach((m) => { if (m.image_url) byImg.set(m.image_url, m); byTitle.set(norm(m.title), m); });
      return { byImg, byTitle };
    },
    // 书签的 B50 图也是旧曲 BEST35 在上、新曲 NEW15 在下
    sections: (s) => [['BEST 35', s.best, 'B'], ['NEW 15', s.news, 'N']],
    row(e, db) {
      const [, title, ach, rating, fc, diff, kind, img] = e;
      const key = { EXPERT: 'exp', MASTER: 'mas', 'Re:MASTER': 'remas', ADVANCED: 'adv', BASIC: 'bas' }[diff] || 'mas';
      const m = db && ((img && db.byImg.get(img)) || db.byTitle.get(norm(title)));
      const pre = kind === 'DX' ? 'dx_' : '';
      const ci = parseFloat(m && m[pre + 'lev_' + key + '_i']);
      return {
        title, diff: { EXPERT: 'EXP', MASTER: 'MAS', 'Re:MASTER': 'ReM' }[diff] || diff,
        diffColor: { EXPERT: '#e5484d', MASTER: '#9a5cf0', 'Re:MASTER': '#d9b8ff' }[diff] || '#888', kind,
        cst: ci > 0 ? { c: ci } : m ? estimate(m[pre + 'lev_' + key]) : null,
        score: (ach / 10000).toFixed(4) + '%', rank: rankOf(ach, this.ranks),
        lamps: fc ? [fc] : [], rating: rating != null ? String(rating) : '—',
        img: img ? this.jacket(img) : m && m.image_url ? this.jacket(m.image_url) : null,
      };
    },
  },
  ongeki: {
    dbUrl: 'https://reiwa.f5.si/ongeki_record.json',
    jacket: (img) => 'https://reiwa.f5.si/jackets/ongeki/' + img + '.webp',
    ranks: [[1007500, 'SSS+'], [1000000, 'SSS'], [990000, 'SS'], [970000, 'S'], [940000, 'AAA'], [900000, 'AA'], [850000, 'A'],
      [800000, 'BBB'], [750000, 'BB'], [700000, 'B'], [500000, 'C']],
    prepare(list) {
      const by = new Map();
      list.forEach((m) => { const k = norm(m.title) + '|' + m.diff; if (!by.has(k)) by.set(k, []); by.get(k).push(m); });
      return by;
    },
    sections: (s) => [['BEST 50', s.best, 'B'], ['NEW 10', s.news, 'N'], ...(s.ps && s.ps.length ? [['P-SCORE 50', s.ps, 'P']] : [])],
    // 同名曲（Singularity 等）的键带艺术家：按艺术家找
    find(db, key) {
      const [title, diff, artist] = String(key).split('|');
      let c = (db && db.get(norm(title) + '|' + ({ EXPERT: 'EXP', MASTER: 'MAS', LUNATIC: 'LUN' }[diff] || diff))) || [];
      if (c.length > 1 && artist && artist !== '?') c = c.filter((m) => norm(m.artist) === norm(artist)).concat(c);
      return { m: c[0], diff };
    },
    row(e, db, sec) {
      const { m, diff } = this.find(db, e[0]);
      const base = {
        // 同名曲在曲名后面写艺术家（同推分列表）
        title: e[1] + (String(e[0]).split('|')[2] ? '（' + String(e[0]).split('|')[2] + '）' : ''), diff: { EXPERT: 'EXP', MASTER: 'MAS', LUNATIC: 'LUN' }[diff] || diff || '?',
        diffColor: { EXPERT: '#e5484d', MASTER: '#9a5cf0', LUNATIC: '#d6336c' }[diff] || '#888',
        cst: m && m.const > 0 ? { c: m.const, est: !!m.is_unknown } : null,
        img: m && m.img ? this.jacket(m.img) : null,
      };
      if (sec === 'P') return { ...base, score: '☆' + e[2], rank: '', lamps: [], rating: (e[3] / 100000).toFixed(3), ratingNote: 'P-rate' };
      return {
        ...base, score: num(e[2]), rank: rankOf(e[2], this.ranks),
        lamps: [e[4], e[5] ? 'FB' : ''].filter(Boolean), rating: e[3] != null ? (e[3] / 1000).toFixed(3) : '—',
      };
    },
  },
};

// ---- 画图 ----
const IMG = { W: 1800, PAD: 28, COLS: 5, GAP: 10, CH: 124, HEAD: 176, SEC: 46, FOOT: 44 };
IMG.CW = Math.floor((IMG.W - IMG.PAD * 2 - IMG.GAP * (IMG.COLS - 1)) / IMG.COLS);
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","PingFang SC","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
const C = {
  bg: '#16151c', card: '#24222d', line: '#3a3745', fg: '#f3f1f8', muted: '#9d99ab',
  'SSS+': '#ffd36b', SSS: '#ffc94a', 'SS+': '#f0b43c', SS: '#f0b43c', 'S+': '#e3a53a', S: '#e3a53a',
  AJC: '#ffd36b', AJ: '#ffb86b', FC: '#4fc3f7', 'AP+': '#ffd36b', AP: '#ffc94a', 'FC+': '#7fe0ff',
  'AB+': '#ffd36b', AB: '#ffb86b', FB: '#7ee08a', DX: '#ff9a3c', STD: '#4aa3ff',
};
const f = (w, px) => `${w} ${px}px ${FONT}`;
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function fit(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
// 小标签：基线 y，返回宽度
function pill(g, text, x, y, color, px = 12, ink = '#16151c') {
  g.font = f(800, px);
  const w = g.measureText(text).width + px;
  rrect(g, x, y - px - 2, w, px + 7, 4);
  g.fillStyle = color; g.fill();
  g.fillStyle = ink; g.fillText(text, x + px / 2, y + 1);
  return w;
}
const loadImg = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.crossOrigin = 'anonymous'; // 曲绘服务器允许跨域，画进 canvas 后仍能导出
  const t = setTimeout(() => resolve(null), 15000);
  img.onload = () => { clearTimeout(t); resolve(img); };
  img.onerror = () => { clearTimeout(t); resolve(null); };
  img.src = src;
});

function drawCard(g, s, label, x, y, jacket) {
  const { CW, CH } = IMG;
  rrect(g, x, y, CW, CH, 10); g.fillStyle = C.card; g.fill();
  g.save(); rrect(g, x, y, CW, CH, 10); g.clip();
  if (jacket) g.drawImage(jacket, x, y, CH, CH);
  else {
    g.fillStyle = C.line; g.fillRect(x, y, CH, CH);
    g.fillStyle = C.muted; g.font = f(700, 14); g.textAlign = 'center';
    g.fillText('NO IMAGE', x + CH / 2, y + CH / 2 + 5); g.textAlign = 'left';
  }
  g.fillStyle = s.diffColor; g.fillRect(x, y + CH - 6, CH, 6);
  g.restore();
  // 曲绘左上角：序号；左下角：DX / STD（maimai）
  g.font = f(800, 13);
  const lw = g.measureText(label).width + 12;
  rrect(g, x + 4, y + 4, lw, 20, 5); g.fillStyle = 'rgba(0,0,0,.72)'; g.fill();
  g.fillStyle = '#fff'; g.fillText(label, x + 10, y + 19);
  if (s.kind) pill(g, s.kind, x + 6, y + CH - 12, C[s.kind] || C.muted, 11, '#fff');

  const L = x + CH + 10, R = x + CW - 10, TW = R - L;
  const text = (t, tx, ty, font, color, maxW) => {
    g.font = font; g.fillStyle = color;
    const s2 = maxW != null ? fit(g, t, Math.max(0, maxW)) : t;
    if (maxW == null || maxW > 12) g.fillText(s2, tx, ty);
    return g.measureText(s2).width;
  };
  // 第 1 行：难度 · 定数（定数还没公开、按等级估算时写成「14+?」）
  const cst = s.cst ? (s.cst.est && s.cst.lv ? s.cst.lv + '?' : s.cst.c.toFixed(1) + (s.cst.est ? '?' : '')) : '?';
  pill(g, `${s.diff} ${cst}`, L, y + 20, s.diffColor, 13, s.diff === 'ReM' ? '#3b1d5e' : s.diff === 'ULT' ? '#fff' : '#16151c');
  // 第 2 行：曲名
  text(s.title, L, y + 46, f(700, 16), C.fg, TW);
  // 第 3 行：分数 + 评级
  const sw = text(s.score, L, y + 72, f(800, 18), C.fg);
  if (s.rank) text(s.rank, L + sw + 6, y + 72, f(800, 14), C[s.rank] || C.muted, R - L - sw - 6);
  // 第 4 行：FC / AJ / AP / FB 等标记
  let cx = L;
  for (const t of s.lamps) {
    g.font = f(800, 11);
    if (cx + g.measureText(t).width + 11 > R) break;
    cx += pill(g, t, cx, y + 95, C[t] || C.muted, 11) + 4;
  }
  // 第 5 行：单曲 Rating（右对齐）
  g.font = f(700, 11); g.fillStyle = C.muted; g.fillText(s.ratingNote || 'Rating', L, y + 116);
  g.font = f(800, 22); g.fillStyle = s.rating === '—' ? C.muted : C.fg;
  g.fillText(s.rating, R - g.measureText(s.rating).width, y + 117);
}

// game：games.js 的 GAMES 之一；snap：最后一次快照；name：玩家名；返回 { blob, url, missing }
export async function renderB50(game, snap, name, onStatus = () => {}) {
  const A = ADAPTERS[game.id];
  onStatus('正在读取定数表…');
  let db = null, dbError = '';
  try { db = A.prepare(await loadJson(A.dbUrl)); } catch (e) { dbError = '定数表读取失败，定数显示为「?」'; }
  const sections = A.sections(snap).map(([title, rows, prefix]) => ({
    title, prefix, rows: (rows || []).map((e) => A.row(e, db, prefix)),
  })).filter((sec) => sec.rows.length);
  if (!sections.length) throw new Error('这次快照里没有曲目列表（书签旧版本的快照）');

  onStatus('正在加载曲绘…');
  const all = sections.flatMap((sec) => sec.rows);
  const jackets = new Map();
  const queue = all.slice();
  let done = 0;
  // 最多同时加载 6 张，避免手机网络一下子发几十个请求导致超时
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const s = queue.shift();
      jackets.set(s, await loadImg(s.img));
      onStatus(`正在加载曲绘… ${++done}/${all.length}`);
    }
  }));

  const { W, PAD, COLS, GAP, CH, HEAD, SEC, FOOT, CW } = IMG;
  const rowsOf = (n) => Math.max(1, Math.ceil(n / COLS));
  const H = HEAD + sections.reduce((h, sec) => h + SEC + rowsOf(sec.rows.length) * (CH + GAP), 0) + FOOT;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = game.color; g.fillRect(0, 0, W, 6);

  // 标题：游戏 · 玩家名 / Rating / 各枠
  g.textBaseline = 'alphabetic';
  g.fillStyle = game.color; g.font = f(800, 22); g.fillText(game.label + '  B50', PAD, 50);
  // 玩家名：游戏里多是全角（Ｉｎｄｅｘ．０１），图上转成半角，不然字距很散
  g.fillStyle = C.fg; g.font = f(800, 40); g.fillText(fit(g, String(name || '').normalize('NFKC'), W / 2), PAD, 104);
  g.fillStyle = C.muted; g.font = f(600, 16);
  // 快照可能是以前的（窗口里可以选时间点），所以不写「最后一次」
  g.fillText(snap.t + ' 运行查分书签时的 B50', PAD, 140);
  // 右上：Rating 和各枠
  g.textAlign = 'right';
  g.fillStyle = C.muted; g.font = f(700, 16); g.fillText('Rating', W - PAD, 46);
  g.fillStyle = C.fg; g.font = f(800, 56); g.fillText(game.fmtRating(snap.r), W - PAD, 104);
  g.fillStyle = C.muted; g.font = f(600, 16);
  g.fillText(game.ratingSub(snap).map(([k, v]) => k + ' ' + v).join('　'), W - PAD, 140);
  g.textAlign = 'left';

  let y = HEAD;
  for (const sec of sections) {
    g.fillStyle = C.fg; g.font = f(800, 22); g.fillText(sec.title, PAD, y + 28);
    g.fillStyle = C.line; g.fillRect(PAD + g.measureText(sec.title).width + 14, y + 20, W - PAD * 2 - g.measureText(sec.title).width - 14, 2);
    y += SEC;
    sec.rows.forEach((s, i) => {
      drawCard(g, s, sec.prefix + (i + 1), PAD + (i % COLS) * (CW + GAP), y + Math.floor(i / COLS) * (CH + GAP), jackets.get(s));
    });
    y += rowsOf(sec.rows.length) * (CH + GAP);
  }
  g.fillStyle = C.muted; g.font = f(500, 14);
  g.fillText('otoge-dashboard  ·  定数 / 曲绘：' + (game.id === 'ongeki' ? 'reiwa.f5.si' : 'otoge-db') + (dbError ? '  ·  ' + dbError : '') +
    '  ·  ? = 定数未公开或未找到', PAD, H - 16);

  onStatus('正在生成图片…');
  const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('图片生成失败'))), 'image/png'));
  cv.width = cv.height = 0; // 手机上尽快释放 canvas 内存
  return { blob, url: URL.createObjectURL(blob), missing: all.filter((s) => !jackets.get(s)).length, dbError };
}
