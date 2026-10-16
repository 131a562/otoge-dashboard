// 生成三个游戏的模拟历史记录（格式同各书签的 history.json），供 test/serve.mjs 使用
// 规则：60 天前第一次记录（起点：全曲成绩扫描 + 快照），之后每 2〜4 天去一次机厅，每次 12〜25 首，
// 其中一部分刷新纪录（NEW RECORD），书签运行时的成绩扫描把提升记下来；偶尔打一首起点时没打过的谱面
import { fmtTime } from '../src/common.js';

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const DAY = 864e5;

function simulate({ charts, maxScore, firstScore, bump, runs }) {
  const now = Date.now();
  const best = new Map(); // key → score
  const events = []; // { ms, kind: 'start'|'session', plays }
  let ms = now - 60 * DAY;
  events.push({ ms, start: true });
  charts.forEach((c, i) => { if (i < charts.length * 0.8) best.set(c.key, firstScore()); });
  const startBest = new Map(best);
  while ((ms += (2 + Math.floor(rand() * 3)) * DAY) < now - 3600e3) {
    const plays = [];
    const n = 12 + Math.floor(rand() * 14);
    let t = ms + 18 * 3600e3 - n * 4 * 60e3;
    for (let i = 0; i < n; i++) {
      t += 4 * 60e3;
      const c = rand() < 0.08 ? pick(charts) : pick(charts.slice(0, Math.floor(charts.length * 0.8)));
      const old = best.get(c.key);
      let s, nr = false;
      if (old == null) { s = firstScore(); nr = true; }
      else if (rand() < 0.3) { s = Math.min(maxScore, old + bump()); nr = s > old; }
      else s = Math.max(0, old - bump() * 2);
      if (nr) best.set(c.key, s);
      plays.push({ ms: t, c, s, nr });
    }
    events.push({ ms: t + 10 * 60e3, plays });
  }
  return runs({ events, startBest, charts });
}

// ---- CHUNITHM（chuni-b50 v3）----
export function chunithm() {
  const charts = Array.from({ length: 220 }, (_, i) => ({ key: 1000 + i + ':' + (i % 7 ? 3 : 2), n: 'チュウニ曲 ' + (i + 1), d: i % 7 ? 3 : 2 }));
  return simulate({
    charts, maxScore: 1010000,
    firstScore: () => 975000 + Math.floor(rand() * 34000),
    bump: () => 500 + Math.floor(rand() * 4000),
    runs: ({ events, startBest }) => {
      const h = { v: 3, game: 'chunithm', name: 'TESTER', since: '', resetAt: '', obs: [], snaps: [], scans: [] };
      const best = new Map(startBest);
      let r = 16.12;
      events.forEach((e) => {
        const t = fmtTime(new Date(e.ms));
        if (e.start) {
          h.since = t;
          best.forEach((s, k) => { const c = charts.find((x) => x.key === k); h.obs.push({ t, k, n: c.n, d: c.d, s, src: 'b', l: s > 1007500 ? 'FC' : '' }); });
        } else {
          e.plays.forEach((p) => {
            const o = { t: fmtTime(new Date(p.ms)), k: p.c.key, n: p.c.n, d: p.c.d, s: p.s, src: 'p' };
            if (p.nr) o.nr = 1;
            h.obs.push(o);
            if (p.nr) { best.set(p.c.key, p.s); h.obs.push({ t, k: p.c.key, n: p.c.n, d: p.c.d, s: p.s, src: 'b', l: '' }); }
          });
          r = Math.round((r + rand() * 0.03) * 100) / 100;
        }
        h.scans.push(t + '|2,3,4');
        h.snaps.push({ t, r, b30: r - 0.1, n20: r + 0.2, best: [], news: [] });
      });
      return h;
    },
  });
}

// ---- maimai DX（maimai-dx-score v2）----
export function maimai() {
  const diffs = ['EXPERT', 'MASTER', 'Re:MASTER'];
  const charts = Array.from({ length: 200 }, (_, i) => {
    const d = diffs[i % 5 ? 1 : i % 2 ? 0 : 2];
    // 第 3 首和第 4 首是同一首歌的 DX / 标准谱面（测试プレイ履歴上没认出 DX/STD 的情况）
    const title = i === 4 ? 'まいまい曲 4' : 'まいまい曲 ' + (i + 1);
    const kd = i === 4 ? 'STD' : 'DX';
    return { key: `${title}|${kd}|${d}`, n: title, kd, d, xm: 3000 + i * 3 };
  });
  return simulate({
    charts, maxScore: 1010000,
    firstScore: () => 970000 + Math.floor(rand() * 38000),
    bump: () => 300 + Math.floor(rand() * 3000),
    runs: ({ events, startBest }) => {
      const h = { v: 2, game: 'maimai', name: 'TESTER', since: '', resetAt: '', obs: [], snaps: [] };
      const best = new Map(startBest);
      let r = 15120;
      const scanObs = (t, c, a) => ({ t, k: c.key, nk: c.key, n: c.n, kd: c.kd, d: c.d, src: 'b', a, fc: '', sy: '', x: 0, xm: c.xm });
      events.forEach((e) => {
        const t = fmtTime(new Date(e.ms));
        if (e.start) {
          h.since = t;
          best.forEach((a, k) => h.obs.push(scanObs(t, charts.find((x) => x.key === k), a)));
        } else {
          e.plays.forEach((p) => {
            const kd = rand() < 0.3 ? '' : p.c.kd; // 有时没认出 DX/STD
            const o = { t: fmtTime(new Date(p.ms)), k: kd ? p.c.key : `${p.c.n}|${kd}|${p.c.d}`, nk: `${p.c.n}|${kd}|${p.c.d}`,
              n: p.c.n, kd, d: p.c.d, src: 'p', a: p.s, fc: '', sy: '', x: 0, xm: p.c.xm };
            if (p.nr) { o.nr = 1; const dr = Math.floor(rand() * 6); r += dr; o.r = r; o.dr = dr; }
            h.obs.push(o);
            if (p.nr) { best.set(p.c.key, p.s); h.obs.push(scanObs(t, p.c, p.s)); }
          });
        }
        h.snaps.push({ t, r, c: r, n15: 300, b35: 305, parts: [Math.round(r * 0.3), r - Math.round(r * 0.3)], best: [], news: [] });
      });
      return h;
    },
  });
}

// ---- オンゲキ（ongeki-score-export v4）----
export function ongeki() {
  const diffs = ['EXPERT', 'MASTER', 'LUNATIC'];
  const charts = Array.from({ length: 180 }, (_, i) => {
    const d = diffs[i % 6 ? 1 : i % 4 ? 0 : 2];
    return { key: `オンゲキ曲 ${i + 1}|${d}`, n: `オンゲキ曲 ${i + 1}`, d };
  });
  return simulate({
    charts, maxScore: 1010000,
    firstScore: () => 960000 + Math.floor(rand() * 48000),
    bump: () => 400 + Math.floor(rand() * 5000),
    runs: ({ events, startBest }) => {
      const h = { v: 4, game: 'ongeki', name: 'TESTER', since: '', obs: [], snaps: [] };
      const best = new Map(startBest);
      let r = 16.004;
      const scanObs = (t, c, s) => ({ t, k: c.key, n: c.n, d: c.d, s, l: '', fb: 0, ps: 0, pm: 0, st: 0, src: 'b' });
      events.forEach((e) => {
        const t = fmtTime(new Date(e.ms));
        if (e.start) {
          h.since = t;
          best.forEach((s, k) => h.obs.push(scanObs(t, charts.find((x) => x.key === k), s)));
        } else {
          e.plays.forEach((p) => {
            const o = { t: fmtTime(new Date(p.ms)), k: p.c.key, n: p.c.n, d: p.c.d, s: p.s, src: 'p' };
            if (p.nr) o.nr = 1;
            h.obs.push(o);
            if (p.nr) { best.set(p.c.key, p.s); h.obs.push(scanObs(t, p.c, p.s)); }
          });
          r = Math.round((r + rand() * 0.008) * 1000) / 1000;
        }
        h.snaps.push({ t, r, c: r, n10: 16.5, b50: 16.2, p: 0.95, parts: [3300, 11750, 950].map((x) => Math.round(x * r / 16)), best: [], news: [], ps: [] });
      });
      return h;
    },
  });
}
