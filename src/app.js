// 版本号：index.html 用 src/app.js?v=N 加载这个文件，这里把同样的 ?v=N 带给其他模块。
// 手机浏览器会长时间缓存脚本，刷新也不一定重新下载；地址变了就一定会下载新的（每次上传改 index.html 里的 N）
const V = new URL(import.meta.url).search;
const [{ SYNC_URL: DEFAULT_SYNC }, { cleanAccount, legacyAccount, fetchHist, timeMs }, { GAMES, analyze }] = await Promise.all([
  import('./config.js' + V), import('./common.js' + V), import('./games.js' + V),
]);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('otoge-dash:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('otoge-dash:' + k, JSON.stringify(v)); } catch (e) { /* 无痕模式等：不记 */ } },
};
const params = new URLSearchParams(location.search);
// 本地测试时可以用 ?sync= 指到本机的模拟服务（只接受 localhost，避免被别人的链接指到别的地方）
const SYNC_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(params.get('sync') || '') ? params.get('sync') : DEFAULT_SYNC;
const DAY = 864e5;

// ---- 名字：网址参数（朋友分享的链接）优先，其次是这个浏览器记住的 ----
const form = $('#name-form');
const fromUrl = GAMES.some((g) => params.get(g.id));
const saved = store.get('names', {});
GAMES.forEach((g) => { form.elements[g.id].value = (fromUrl ? params.get(g.id) : saved[g.id]) || ''; });
// 保存和放进网址的是输入的原文；读取时才统一写法（cleanAccount），这样旧版本按全角保存的中二记录也能退回读到
const currentNames = () => Object.fromEntries(GAMES.map((g) => [g.id, form.elements[g.id].value.trim()]));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const names = currentNames();
  store.set('names', names);
  const q = new URLSearchParams(params);
  GAMES.forEach((g) => (names[g.id] ? q.set(g.id, names[g.id]) : q.delete(g.id)));
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  load(names);
});
$('#copy-link').addEventListener('click', async () => {
  const q = new URLSearchParams();
  Object.entries(currentNames()).forEach(([k, v]) => v && q.set(k, v));
  const link = location.origin + location.pathname + (q.toString() ? '?' + q : '');
  try { await navigator.clipboard.writeText(link); $('#copy-note').textContent = '已复制'; } catch (e) { prompt('复制这个链接：', link); }
});

// ---- 时间段：最近 7 / 30 / 90 天、全部，或自选（从某天到某天，两头都包含）----
let days = store.get('days', 30); // 0 = 全部，-1 = 自选
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayMs = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], m[2] - 1, +m[3]).getTime() : NaN; };
// 自选的日期：第一次点「自选」时默认是最近 30 天
let custom = store.get('custom', null);
if (!custom || !(dayMs(custom.from) <= dayMs(custom.to))) custom = { from: ymd(new Date(Date.now() - 29 * DAY)), to: ymd(new Date()) };
const periodBtns = [...document.querySelectorAll('#period button')];
const fromInput = $('#range-from'), toInput = $('#range-to');
const markPeriod = () => {
  periodBtns.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.days === days)));
  $('#custom-range').hidden = days !== -1;
  fromInput.value = custom.from;
  toInput.value = custom.to;
};
periodBtns.forEach((b) => b.addEventListener('click', () => { days = +b.dataset.days; store.set('days', days); markPeriod(); render(); }));
// 改了任意一个日期就重新统计；清空了的那个不算数（恢复原来的值）。
// 开始改到了结束之后（或结束改到了开始之前）时，另一头跟着移到同一天，不对调（对调会把刚选的日期挪走）
const onRange = (e) => {
  let from = fromInput.value || custom.from, to = toInput.value || custom.to;
  if (dayMs(from) > dayMs(to)) { if (e && e.target === toInput) from = to; else to = from; }
  custom = { from, to };
  store.set('custom', custom);
  markPeriod();
  render();
};
fromInput.addEventListener('change', onRange);
toInput.addEventListener('change', onRange);
markPeriod();

// ---- 读取 ----
let results = []; // [{ game, name, status: 'ok'|'missing'|'error', a, error }]
async function loadOne(game, input) {
  const name = cleanAccount(input);
  try {
    let r = await fetchHist(SYNC_URL, game.id, name);
    // chuni-b50 2026/10/15 的版本按原样（全角）保存名字
    const legacy = legacyAccount(input);
    if (r.missing && game.id === 'chunithm' && legacy && legacy !== name) r = await fetchHist(SYNC_URL, game.id, legacy);
    if (r.missing) return { game, name, status: 'missing' };
    return { game, name, status: 'ok', a: analyze(game, r.hist) };
  } catch (e) {
    return { game, name, status: 'error', error: e.message };
  }
}
async function load(names) {
  const list = GAMES.filter((g) => cleanAccount(names[g.id]));
  $('#board').hidden = !list.length;
  // 只玩其中一两个游戏时，其余的名字留空即可；一个都没填时提示一下
  $('#copy-note').textContent = list.length ? '' : '至少填一个游戏的名字';
  if (!list.length) return;
  results = list.map((game) => ({ game, name: cleanAccount(names[game.id]), status: 'loading' }));
  render();
  await Promise.all(list.map(async (game, i) => { results[i] = await loadOne(game, names[game.id]); render(); }));
}

// ---- 显示 ----
// 当前的时间段：start〜end（毫秒，end 为 Infinity 表示到现在）；label 用在「Rating · 30 天变化」，inText 用在「30 天内没有推分」
function period() {
  if (days === -1) {
    const s = new Date(dayMs(custom.from)), e = new Date(dayMs(custom.to));
    const thisYear = new Date().getFullYear();
    const f = (d) => (s.getFullYear() !== thisYear || e.getFullYear() !== thisYear ? d.getFullYear() + '/' : '') + (d.getMonth() + 1) + '/' + d.getDate();
    const label = custom.from === custom.to ? f(s) : f(s) + '–' + f(e);
    return { start: s.getTime(), end: e.getTime() + DAY - 1, label: label + ' ', inText: label + ' 期间' };
  }
  const label = days ? days + ' 天' : '累计';
  return { start: days ? Date.now() - days * DAY : -Infinity, end: Infinity, label, inText: label + '内' };
}
const inPeriod = (ms, P) => ms >= P.start && ms <= P.end;
const dateText = (t) => (t ? t.slice(0, 10) : '—');
const ago = (t) => {
  if (!t) return '';
  const d = Math.floor((Date.now() - timeMs(t)) / DAY);
  return d <= 0 ? '今天' : d + ' 天前';
};

// 这段时间里 Rating 的变化：时间段结束时的值 − 开始前最后一个值（开始前没有记录的话用这段时间里的第一个值）
function ratingDelta(a) {
  const s = a.series;
  if (s.length < 2) return null;
  const P = period();
  const before = s.filter((p) => p.ms < P.start).pop() || s[0];
  const after = s.filter((p) => p.ms <= P.end).pop();
  return after ? after.r - before.r : null;
}
const fmtDelta = (game, d) => {
  if (d == null) return '';
  const digits = { chunithm: 2, maimai: 0, ongeki: 3 }[game.id];
  const v = Math.round(d * 10 ** digits) / 10 ** digits;
  return `<span class="delta ${v > 0 ? 'up' : 'flat'}">${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}</span>`;
};

const fmtGap = (game, g) => (game.scale === 1 ? String(Math.round(g)) : g.toFixed(Math.log10(game.scale)));
const md = (ms) => { const t = new Date(ms); return (t.getMonth() + 1) + '/' + t.getDate(); };
const hm = (ms) => { const t = new Date(ms); return t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0'); };
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function cardHtml(r) {
  const { game, name } = r;
  const head = `<h3>${esc(game.label)}<span>${esc(name)}</span></h3>`;
  if (r.status === 'loading') return `${head}<div class="empty">读取中…</div>`;
  if (r.status === 'missing') return `${head}<div class="empty">云端没有「${esc(name)}」的记录。请确认名字和书签第一次同步时填的一样。</div>`;
  if (r.status === 'error') return `${head}<div class="err">读取失败：${esc(r.error)}</div>`;
  const a = r.a;
  if (!a.since) return `${head}<div class="empty">还没有记录（或是书签旧版本的记录）。运行一次书签后再来看。</div>`;
  const P = period();
  const imp = a.improved(P.start, P.end);
  const pushed = imp.filter((x) => !x.first);
  const plays = a.plays.filter((ms) => inPeriod(ms, P)).length;
  const stale = a.lastRun && Date.now() - timeMs(a.lastRun) > 14 * DAY;
  return head +
    `<div class="rating num">${a.rating ? esc(a.rating.text) : '—'}${a.rating ? fmtDelta(game, ratingDelta(a)) : ''}</div>` +
    `<div class="small muted">${a.rating ? 'Rating · ' + P.label + '变化' : '还没有 Rating 快照'}</div>` +
    `<dl class="kv num">` +
    (a.rating ? a.rating.sub.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') : '') +
    (a.rating && a.milestones.next ? `<dt>下一个里程碑</dt><dd>${esc(game.fmtRating(a.milestones.next.value))}（还差 ${esc(fmtGap(game, a.milestones.next.gap))}）</dd>` : '') +
    `<dt>开始记录</dt><dd>${dateText(a.since)}</dd>` +
    `<dt>最后一次运行书签</dt><dd class="${stale ? 'warn' : ''}">${dateText(a.lastRun)}（${ago(a.lastRun)}）</dd>` +
    `</dl>` +
    `<div class="stats num">` +
    `<div class="stat"><b>${plays}</b><span>记录到的游玩</span></div>` +
    `<div class="stat"><b>${pushed.length}</b><span>推分谱面</span></div>` +
    `<div class="stat"><b>${imp.length - pushed.length}</b><span>新打的谱面</span></div>` +
    `</div>` +
    (a.b50Snap ? `<button type="button" class="b50-btn" data-game="${game.id}">查看 B50 图（${a.b50Snap.t.slice(5)}）</button>` : '');
}

// 一个游戏的 Rating 走势（按天取当天最后的值，画阶梯线）
function trendSvg(game, a) {
  const P = period(), start = P.start;
  const byDay = new Map();
  a.series.forEach((p) => { const d = new Date(p.ms); byDay.set(d.toDateString(), p); });
  const daily = [...byDay.values()];
  const anchor = daily.filter((p) => p.ms < start).pop();
  const pts = (anchor ? [{ ms: start, r: anchor.r }] : []).concat(daily.filter((p) => inPeriod(p.ms, P)));
  if (pts.length < 2) return `<div class="small muted" style="padding:16px 0">这段时间的记录还不够画图（要有两天以上的 Rating 记录）</div>`;
  const W = 600, H = 120, L = 4, R = 4, T = 14, B = 16;
  // 右端：自选时到结束那天（结束那天还没过完就到现在），否则到现在
  const x0 = pts[0].ms, x1 = Math.max(Math.min(Date.now(), P.end), pts[pts.length - 1].ms);
  const lo = Math.min(...pts.map((p) => p.r)), hi = Math.max(...pts.map((p) => p.r));
  // 没有变化时线画在中间（上下范围只是为了画图撑开的，标签写实际的值）
  const flat = hi - lo < 1e-9;
  const y0 = flat ? lo - 1 : lo, y1 = flat ? hi + 1 : hi;
  const X = (ms) => L + (ms - x0) / (x1 - x0 || 1) * (W - L - R);
  const Y = (r) => T + (1 - (r - y0) / (y1 - y0)) * (H - T - B);
  let d = '';
  pts.forEach((p, i) => { d += i ? `H${X(p.ms).toFixed(1)}V${Y(p.r).toFixed(1)}` : `M${X(p.ms).toFixed(1)} ${Y(p.r).toFixed(1)}`; });
  d += `H${X(x1).toFixed(1)}`;
  const fmt = game.fmtRating;
  const lbl = md;
  // 这段时间达成的里程碑：画在当天那一级台阶上
  const reached = a.milestones.list.filter((m) => inPeriod(m.ms, P));
  const sameDay = (p, t) => new Date(p).toDateString() === new Date(t).toDateString();
  const dots = reached.map((m) => {
    const p = pts.filter((q) => q.ms <= m.ms || sameDay(q.ms, m.ms)).pop() || pts[0];
    // 图是横向拉伸的（preserveAspectRatio="none"），<circle> 在手机上会被压扁成椭圆。
    // 改用长度为 0 的线段 + 圆头：线宽按屏幕像素算（non-scaling-stroke），画出来一定是正圆
    const at = `M${X(p.ms).toFixed(1)} ${Y(Math.min(m.value, p.r)).toFixed(1)}h0`;
    return `<g><title>${esc(fmt(m.value))}（${md(m.ms)}）</title>` +
      `<path d="${at}" stroke="${game.color}" stroke-width="10" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
      `<path d="${at}" stroke="var(--card)" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke"/></g>`;
  }).join('');
  const shown = reached.slice(-6).reverse();
  const msText = reached.length
    ? `<div class="small milestones">达成里程碑 ${reached.length} 个：${shown.map((m) => `<b>${esc(fmt(m.value))}</b> <span class="muted">${md(m.ms)}</span>`).join('　')}${reached.length > shown.length ? '　…' : ''}</div>`
    : '';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(game.label)} Rating 走势">
    ${flat ? '' : `<line x1="${L}" x2="${W - R}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="var(--line)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
    <line x1="${L}" x2="${W - R}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="var(--line)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`}
    <path d="${d}" fill="none" stroke="${game.color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
    ${dots}
  </svg>
  <div class="row small muted num" style="justify-content:space-between"><span>${lbl(x0)}</span>
    <span>${flat ? '没有变化 · ' + esc(fmt(lo)) : '最低 ' + esc(fmt(lo)) + ' · 最高 ' + esc(fmt(hi))}</span><span>${lbl(x1)}</span></div>${msText}`;
}

// ---- 出勤 ----
// 把所有游戏的游玩按时间排好，相隔 3 小时以上就算下一次出勤（一次出勤里可能打了几个游戏）
const GAP = 3 * 3600e3;
function sessionsOf(ok) {
  const plays = ok.flatMap((r) => r.a.plays.map((ms) => ({ ms, r }))).sort((x, y) => x.ms - y.ms);
  const out = [];
  let cur = null;
  plays.forEach((p) => {
    if (!cur || p.ms - cur.end > GAP) { cur = { start: p.ms, end: p.ms, games: new Map() }; out.push(cur); }
    cur.end = p.ms;
    cur.games.set(p.r, (cur.games.get(p.r) || 0) + 1);
  });
  out.forEach((x, i) => { x.nextStart = out[i + 1] ? out[i + 1].start : Infinity; });
  return out;
}
// 一次出勤前后的 Rating 变化：出勤前最后一个值 → 下一次出勤之前最后一个值（出勤后没运行书签时为 null）
function sessionDelta(a, x) {
  const before = a.series.filter((p) => p.ms < x.start).pop();
  const after = a.series.filter((p) => p.ms < x.nextStart).pop();
  return before && after && after.ms >= x.start ? after.r - before.r : null;
}
function sessionHtml(x) {
  const t = new Date(x.start);
  const games = [...x.games.entries()].sort((p, q) => GAMES.indexOf(p[0].game) - GAMES.indexOf(q[0].game)).map(([r, n]) => {
    const imp = r.a.improved(x.start, x.end);
    const pushed = imp.filter((i) => !i.first).length, fresh = imp.length - pushed;
    const d = sessionDelta(r.a, x);
    return `<span class="sg"><b style="color:${r.game.color}">${esc(r.game.label)}</b> ${n} 首` +
      (pushed ? ` · 推分 ${pushed}` : '') + (fresh ? ` · 新打 ${fresh}` : '') +
      (d != null ? ` · <span class="nw">Rating ${fmtDelta(r.game, d)}</span>` : '') + `</span>`;
  });
  return `<li><div class="s-date num">${t.getMonth() + 1}/${t.getDate()} ${WEEK[t.getDay()]}` +
    ` <span class="muted small">${hm(x.start)}–${hm(x.end)}</span></div><div class="s-games small num">${games.join('')}</div></li>`;
}
function sessionsHtml(ok) {
  const P = period();
  const list = sessionsOf(ok).filter((x) => x.end >= P.start && x.start <= P.end).reverse();
  if (!list.length) return `<div class="push-head"><b>出勤记录</b></div><div class="empty">${P.inText}没有记录到游玩</div>`;
  const total = list.reduce((n, x) => n + [...x.games.values()].reduce((s, v) => s + v, 0), 0);
  const N = 10;
  return `<div class="push-head"><b>出勤记录</b><span class="small num">${list.length} 次 · 共 ${total} 首 · 平均每次 ${Math.round(total / list.length)} 首</span></div>` +
    `<ul class="list sessions">${list.slice(0, N).map(sessionHtml).join('')}</ul>` +
    (list.length > N ? `<details><summary>更早的 ${list.length - N} 次</summary><ul class="list sessions">${list.slice(N).map(sessionHtml).join('')}</ul></details>` : '');
}

// 出勤日历：最近 26 周（手机 15 周，圆点太小点不中），每天一个圆点。颜色 = 那天打的游戏（几个游戏时从圆心按首数比例分扇形），深浅 = 一共打了几首（分段见下面的 level）
const narrowMq = window.matchMedia('(max-width: 600px)');
narrowMq.addEventListener?.('change', () => render());
const dayKey = (ms) => new Date(ms).toDateString();
function calendarHtml(ok) {
  // 一次游玩都没记到时（刚开始记录），整片空格子看起来像没加载出来，改成一句说明
  if (!ok.some((r) => r.a.plays.length)) {
    return `<div class="push-head"><b>出勤日历</b></div><div class="empty">还没有记录到游玩。书签只记「上一次运行之后」的游玩：下次打完歌运行一次书签，这里就会显示出勤的日子。</div>`;
  }
  const WEEKS = narrowMq.matches ? 15 : 26;
  const days = new Map(); // dayKey → Map(game → 首数)
  ok.forEach((r) => r.a.plays.forEach((ms) => {
    const k = dayKey(ms);
    if (!days.has(k)) days.set(k, new Map());
    days.get(k).set(r.game, (days.get(k).get(r.game) || 0) + 1);
  }));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(today); first.setDate(first.getDate() - ((first.getDay() + 6) % 7) - (WEEKS - 1) * 7); // WEEKS 周前的周一
  const cells = [], months = [];
  let lastMonth = -1;
  for (let i = 0; i < WEEKS * 7; i++) {
    const t = new Date(first); t.setDate(first.getDate() + i);
    if (i % 7 === 0) {
      // 第一列是月底时，下一个月的标签马上就来，两个会挤在一起：第一列不写
      const nextWeek = new Date(t); nextWeek.setDate(t.getDate() + 14);
      const crowded = i === 0 && nextWeek.getMonth() !== t.getMonth();
      months.push(t.getMonth() !== lastMonth && !crowded ? `<span>${t.getMonth() + 1}月</span>` : '<span></span>');
      lastMonth = t.getMonth();
    }
    if (t > today) { cells.push('<i class="future"></i>'); continue; }
    const g = days.get(dayKey(t.getTime()));
    const label = `${t.getMonth() + 1}/${t.getDate()} ${WEEK[t.getDay()]}：` +
      (g ? [...g.entries()].map(([game, n]) => `${game.label} ${n} 首`).join('、') : '没有记录');
    if (!g) { cells.push(`<i title="${esc(label)}" data-label="${esc(label)}"></i>`); continue; }
    const n = [...g.values()].reduce((s, v) => s + v, 0);
    const level = n <= 15 ? 0.35 : n <= 30 ? 0.6 : n <= 45 ? 0.8 : 1;
    // 打了几个游戏时，从格子中心按首数的比例分扇形（从正上方开始顺时针，按 GAMES 的顺序）
    const parts = [...g.entries()].sort((p, q) => GAMES.indexOf(p[0]) - GAMES.indexOf(q[0]));
    let acc = 0;
    const bg = parts.length === 1 ? parts[0][0].color : 'conic-gradient(' + parts.map(([game, c]) => {
      const from = acc; acc += c / n * 360;
      return `${game.color} ${from.toFixed(1)}deg ${acc.toFixed(1)}deg`;
    }).join(', ') + ')';
    cells.push(`<i class="on" style="background:${bg};opacity:${level}" title="${esc(label)}" data-label="${esc(label)}"></i>`);
  }
  const legend = ok.map((r) => `<span><i style="background:${r.game.color}"></i>${esc(r.game.label)}</span>`).join('') +
    `<span class="muted">颜色越深打得越多（1–15 / 16–30 / 31–45 / 46 首以上）</span>`;
  return `<div class="push-head"><b>出勤日历</b><span class="small muted">最近 ${WEEKS} 周</span></div>` +
    `<div style="--weeks:${WEEKS}"><div class="cal-months">${months.join('')}</div><div class="cal">${cells.join('')}</div></div>` +
    `<div class="cal-note small muted" id="cal-note">点一格看那天打了什么</div><div class="cal-legend small">${legend}</div>`;
}

function pushHtml(r) {
  const { game } = r;
  const a = r.a;
  const P = period();
  const imp = a.improved(P.start, P.end);
  const pushed = imp.filter((x) => !x.first);
  const fresh = imp.filter((x) => x.first);
  // 各谱面提高的分数加起来没有意义，标题行只写这段时间账号 Rating 的变化（和卡片上的相同）
  const delta = ratingDelta(a);
  const li = (x) => `<li><span class="badge" style="background:${x.diffColor}">${esc(x.diff)}</span>` +
    `<span class="title" title="${esc(x.title)}">${esc(x.title)}</span>` +
    (x.first ? `<span class="num">${esc(game.fmtScore(x.to))}</span>`
      : `<span class="gain num">${esc(game.fmtGain(x.gain))}</span><span class="fromto num">${esc(game.fmtScore(x.from))} → ${esc(game.fmtScore(x.to))}</span>`) +
    `</li>`;
  const listOf = (arr, n) => `<ul class="list">${arr.slice(0, n).map(li).join('')}</ul>` +
    (arr.length > n ? `<details><summary>其余 ${arr.length - n} 首</summary><ul class="list">${arr.slice(n).map(li).join('')}</ul></details>` : '');
  return `<div class="push-head"><b style="color:${game.color}">${esc(game.label)}</b>` +
    `<span class="small num">${pushed.length} 个谱面推分${delta != null ? ' · 账号 Rating ' + fmtDelta(game, delta) : ''}</span></div>` +
    (pushed.length ? listOf(pushed, 15) : `<div class="empty">${P.inText}没有推分</div>`) +
    (fresh.length ? `<div class="sub-h">新打的谱面 ${fresh.length} 首</div>` + listOf(fresh, 5) : '');
}

function render() {
  $('#cards').innerHTML = results.map((r) => `<div class="panel card" style="--c:${r.game.color}">${cardHtml(r)}</div>`).join('');
  const ok = results.filter((r) => r.status === 'ok' && r.a.since);
  $('#calendar').innerHTML = ok.length ? calendarHtml(ok) : '<div class="small muted">没有可显示的记录</div>';
  $('#sessions').innerHTML = ok.length ? sessionsHtml(ok) : '<div class="small muted">没有可显示的记录</div>';
  $('#trends').innerHTML = ok.length
    ? ok.map((r) => `<div class="trend"><div class="head"><b style="color:${r.game.color}">${esc(r.game.label)}</b>` +
      `<span class="muted num">${r.a.rating ? esc(r.a.rating.text) : ''}</span></div>${trendSvg(r.game, r.a)}</div>`).join('')
    : '<div class="small muted">没有可显示的记录</div>';
  $('#pushes').innerHTML = ok.map((r) => `<div class="panel">${pushHtml(r)}</div>`).join('');
}

// ---- B50 图：点卡片上的按钮，用快照画图（src/b50.js），可以下载或分享 ----
// 默认用最后一个快照；窗口上方的下拉框可以换成以前的任意一个快照（书签每次运行、B50 有变化时存一个）
const viewer = $('#b50-viewer');
const snapSelect = $('#b50-snap');
let viewerUrl = null;
let viewerGame = null; // 当前窗口里是哪个游戏（results 里的一项）
const releaseImage = () => {
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; }
  $('#b50-img').removeAttribute('src');
};
const closeViewer = () => {
  viewer.hidden = true;
  document.body.classList.remove('no-scroll');
  viewerGame = null;
  releaseImage();
};
$('#b50-close').addEventListener('click', closeViewer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !viewer.hidden) closeViewer(); });
$('#cards').addEventListener('click', (e) => {
  const btn = e.target.closest('.b50-btn');
  if (!btn) return;
  const r = results.find((x) => x.game.id === btn.dataset.game);
  if (!r || !r.a || !r.a.b50Snap) return;
  closeViewer();
  viewerGame = r;
  viewer.hidden = false;
  document.body.classList.add('no-scroll');
  // 下拉框：新的在上面，「2026/10/18 20:00 · 15.55」
  const snaps = r.a.b50Snaps;
  snapSelect.innerHTML = snaps.map((s, i) => `<option value="${i}">${esc(s.t)} · ${esc(r.game.fmtRating(s.r))}` +
    `${i === snaps.length - 1 ? '（最新）' : ''}</option>`).reverse().join('');
  snapSelect.value = String(snaps.length - 1);
  snapSelect.disabled = snaps.length < 2;
  showB50(snaps.length - 1);
});
snapSelect.addEventListener('change', () => { if (viewerGame) showB50(+snapSelect.value); });

let viewerSeq = 0;
async function showB50(index) {
  const r = viewerGame;
  const snap = r.a.b50Snaps[index];
  const seq = ++viewerSeq;
  const player = r.a.playerName || r.name;
  releaseImage();
  $('#b50-title').textContent = `${r.game.label} B50`;
  $('#b50-status').textContent = '准备中…';
  $('#b50-actions').hidden = true;
  try {
    const { renderB50 } = await import('./b50.js' + V);
    const out = await renderB50(r.game, snap, player, (t) => { if (seq === viewerSeq) $('#b50-status').textContent = t; }, r.a.rawObs);
    // 生成期间换了时间点或关了窗口：这张图作废
    if (seq !== viewerSeq || viewer.hidden) { URL.revokeObjectURL(out.url); return; }
    viewerUrl = out.url;
    $('#b50-img').src = out.url;
    // 文件名带快照的日期和时刻（同一天可能有几个快照），例如 chunithm-b50-INDEX.01-20261018-2000.png
    const stamp = snap.t.replace(/\//g, '').replace(' ', '-').replace(':', '');
    const fileName = `${r.game.id}-b50-${cleanAccount(player).replace(/[^\w.-]+/g, '_') || 'player'}-${stamp}.png`;
    const dl = $('#b50-download');
    dl.href = out.url;
    dl.download = fileName;
    // 支持分享文件的浏览器（iPhone 的 Safari / Chrome、安卓 Chrome）显示「分享 / 存到相册」
    const file = new File([out.blob], fileName, { type: 'image/png' });
    const share = $('#b50-share');
    share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    share.onclick = () => navigator.share({ files: [file] }).catch(() => {});
    $('#b50-actions').hidden = false;
    $('#b50-status').textContent = [
      '手机上也可以长按图片保存。',
      out.missing ? `${out.missing} 首曲绘没加载出来（显示 NO IMAGE）。` : '',
      out.dbError || '',
    ].filter(Boolean).join(' ');
  } catch (err) {
    if (seq === viewerSeq) $('#b50-status').textContent = '生成失败：' + err.message;
  }
}

// 手机上没有悬停提示：点日历的格子在下面显示那天的内容
$('#calendar').addEventListener('click', (e) => {
  const cell = e.target.closest('.cal i[data-label]');
  if (!cell) return;
  document.querySelectorAll('.cal i.sel').forEach((x) => x.classList.remove('sel'));
  cell.classList.add('sel');
  $('#cal-note').textContent = cell.dataset.label;
});

const initial = currentNames();
if (GAMES.some((g) => cleanAccount(initial[g.id]))) load(initial);
