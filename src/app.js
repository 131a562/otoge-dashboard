import { SYNC_URL as DEFAULT_SYNC } from './config.js';
import { cleanAccount, legacyAccount, fetchHist, timeMs } from './common.js';
import { GAMES, analyze } from './games.js';

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

// ---- 时间段 ----
let days = store.get('days', 30);
const periodBtns = [...document.querySelectorAll('#period button')];
const markPeriod = () => periodBtns.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.days === days)));
periodBtns.forEach((b) => b.addEventListener('click', () => { days = +b.dataset.days; store.set('days', days); markPeriod(); render(); }));
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
const periodStart = () => (days ? Date.now() - days * DAY : -Infinity);
const periodLabel = () => (days ? days + ' 天' : '累计');
const dateText = (t) => (t ? t.slice(0, 10) : '—');
const ago = (t) => {
  if (!t) return '';
  const d = Math.floor((Date.now() - timeMs(t)) / DAY);
  return d <= 0 ? '今天' : d + ' 天前';
};

// 这段时间里 Rating 的变化：现在的值 − 时间段开始前最后一个值（没有的话用这段时间里的第一个值）
function ratingDelta(a) {
  const s = a.series;
  if (s.length < 2) return null;
  const start = periodStart();
  const before = s.filter((p) => p.ms < start).pop() || s[0];
  return s[s.length - 1].r - before.r;
}
const fmtDelta = (game, d) => {
  if (d == null) return '';
  const digits = { chunithm: 2, maimai: 0, ongeki: 3 }[game.id];
  const v = Math.round(d * 10 ** digits) / 10 ** digits;
  return `<span class="delta ${v > 0 ? 'up' : 'flat'}">${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}</span>`;
};

function cardHtml(r) {
  const { game, name } = r;
  const head = `<h3>${esc(game.label)}<span>${esc(name)}</span></h3>`;
  if (r.status === 'loading') return `${head}<div class="empty">读取中…</div>`;
  if (r.status === 'missing') return `${head}<div class="empty">云端没有「${esc(name)}」的记录。请确认名字和书签第一次同步时填的一样。</div>`;
  if (r.status === 'error') return `${head}<div class="err">读取失败：${esc(r.error)}</div>`;
  const a = r.a;
  if (!a.since) return `${head}<div class="empty">还没有记录（或是书签旧版本的记录）。运行一次书签后再来看。</div>`;
  const start = periodStart();
  const imp = a.improved(start);
  const pushed = imp.filter((x) => !x.first);
  const plays = a.plays.filter((ms) => ms >= start).length;
  const stale = a.lastRun && Date.now() - timeMs(a.lastRun) > 14 * DAY;
  return head +
    `<div class="rating num">${a.rating ? esc(a.rating.text) : '—'}${a.rating ? fmtDelta(game, ratingDelta(a)) : ''}</div>` +
    `<div class="small muted">${a.rating ? 'Rating · ' + periodLabel() + '变化' : '还没有 Rating 快照'}</div>` +
    `<dl class="kv num">` +
    (a.rating ? a.rating.sub.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') : '') +
    `<dt>开始记录</dt><dd>${dateText(a.since)}</dd>` +
    `<dt>最后一次运行书签</dt><dd class="${stale ? 'warn' : ''}">${dateText(a.lastRun)}（${ago(a.lastRun)}）</dd>` +
    `</dl>` +
    `<div class="stats num">` +
    `<div class="stat"><b>${plays}</b><span>记录到的游玩</span></div>` +
    `<div class="stat"><b>${pushed.length}</b><span>推分谱面</span></div>` +
    `<div class="stat"><b>${imp.length - pushed.length}</b><span>新打的谱面</span></div>` +
    `</div>`;
}

// 一个游戏的 Rating 走势（按天取当天最后的值，画阶梯线）
function trendSvg(game, a) {
  const start = periodStart();
  const byDay = new Map();
  a.series.forEach((p) => { const d = new Date(p.ms); byDay.set(d.toDateString(), p); });
  const daily = [...byDay.values()];
  const anchor = daily.filter((p) => p.ms < start).pop();
  const pts = (anchor ? [{ ms: start, r: anchor.r }] : []).concat(daily.filter((p) => p.ms >= start));
  if (pts.length < 2) return `<div class="small muted" style="padding:16px 0">这段时间的记录还不够画图（要有两天以上的 Rating 记录）</div>`;
  const W = 600, H = 120, L = 4, R = 4, T = 14, B = 16;
  const x0 = pts[0].ms, x1 = Math.max(Date.now(), pts[pts.length - 1].ms);
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
  const lbl = (ms) => { const t = new Date(ms); return (t.getMonth() + 1) + '/' + t.getDate(); };
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(game.label)} Rating 走势">
    ${flat ? '' : `<line x1="${L}" x2="${W - R}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="var(--line)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
    <line x1="${L}" x2="${W - R}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="var(--line)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`}
    <path d="${d}" fill="none" stroke="${game.color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
  </svg>
  <div class="row small muted num" style="justify-content:space-between"><span>${lbl(x0)}</span>
    <span>${flat ? '没有变化 · ' + esc(fmt(lo)) : '最低 ' + esc(fmt(lo)) + ' · 最高 ' + esc(fmt(hi))}</span><span>${lbl(x1)}</span></div>`;
}

function pushHtml(r) {
  const { game } = r;
  const a = r.a;
  const imp = a.improved(periodStart());
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
    (pushed.length ? listOf(pushed, 15) : `<div class="empty">${periodLabel()}内没有推分</div>`) +
    (fresh.length ? `<div class="sub-h">新打的谱面 ${fresh.length} 首</div>` + listOf(fresh, 5) : '');
}

function render() {
  $('#cards').innerHTML = results.map((r) => `<div class="panel card" style="--c:${r.game.color}">${cardHtml(r)}</div>`).join('');
  const ok = results.filter((r) => r.status === 'ok' && r.a.since);
  $('#trends').innerHTML = ok.length
    ? ok.map((r) => `<div class="trend"><div class="head"><b style="color:${r.game.color}">${esc(r.game.label)}</b>` +
      `<span class="muted num">${r.a.rating ? esc(r.a.rating.text) : ''}</span></div>${trendSvg(r.game, r.a)}</div>`).join('')
    : '<div class="small muted">没有可显示的记录</div>';
  $('#pushes').innerHTML = ok.map((r) => `<div class="panel">${pushHtml(r)}</div>`).join('');
}

const initial = currentNames();
if (GAMES.some((g) => cleanAccount(initial[g.id]))) load(initial);
