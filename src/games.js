// 三个游戏的历史记录（otoge-history 里的 <游戏>/<名字>.json）→ 面板要显示的数据
// 记录格式见各书签工程的 README「历史记录」：obs = 观测记录（src 'b' 成绩扫描 / 'p' プレイ履歴），snaps = Rating 快照
// 面板只看「这段时间里哪些谱面的最佳分数提高了、提高了多少」，不做书签那样逐次的推分判定和账号 Rating 推算
import { norm, timeMs, lastRunOf } from './common.js';

const num = (x) => x.toLocaleString('en-US');
const fmtAch = (a) => (a / 10000).toFixed(4) + '%';

// 谱面的统一键：中二的 k 是「曲目 id:难度」，プレイ履歴里对应不到 id 时是「n:曲名:难度」，所以统一按「曲名|难度」
const titleKey = (o) => norm(o.n) + '|' + o.d;

// maimai：同一首歌的 DX / 标准谱面要分开。成绩扫描记录一定有 DX/STD；プレイ履歴里可能没认出，
// 这时按「曲名 + 难度」在成绩扫描里找，只有一种谱面时归到它，否则用 DX 分满分、曲绘区分（同书签的 resolveChart）
function maimaiKey(obs) {
  const kinds = new Map(); // 曲名|难度 → Map(DX/STD → {xm, j})
  obs.forEach((o) => {
    if (o.src !== 'b' || !o.kd) return;
    const a = titleKey(o);
    if (!kinds.has(a)) kinds.set(a, new Map());
    kinds.get(a).set(o.kd, { xm: o.xm, j: o.j });
  });
  return (o) => {
    const a = titleKey(o);
    let kd = o.kd;
    const c = kinds.get(a);
    if (!kd && c) {
      let list = [...c.entries()];
      if (list.length > 1 && o.xm) list = list.filter(([, v]) => v.xm === o.xm).length ? list.filter(([, v]) => v.xm === o.xm) : list;
      if (list.length > 1 && o.j) list = list.filter(([, v]) => v.j === o.j).length ? list.filter(([, v]) => v.j === o.j) : list;
      if (list.length === 1) kd = list[0][0];
    }
    return { key: a + '|' + (kd || '?'), kind: kd || '' };
  };
}

export const GAMES = [
  {
    id: 'chunithm', label: 'CHUNITHM', color: '#e0a800',
    // v3 以前（没有起点）的记录：把第一次成绩扫描的时间当作起点（同 chuni-b50 的 migrateHist）
    normalize: (h) => {
      if (h.v >= 3) return h;
      const since = h.obs.filter((o) => o.src === 'b').map((o) => o.t).sort()[0] || h.snaps.map((s) => s.t).sort()[0] || '';
      return { ...h, since };
    },
    keyOf: () => (o) => ({ key: titleKey(o), kind: '' }),
    // 起点那次不一定读了全曲成绩（只读 B50 时只有 50 首），所以「第一次出现」不等于「新打的」。
    // 同书签的 derive：之前已经有覆盖这个难度的完整全曲扫描（hist.scans）、而那次里没有它，才算新打的；
    // プレイ履歴里对应不到曲目 id 的（k 以 n: 开头）不算
    isNewChart: (hist) => {
      const full = (hist.scans || []).map((x) => { const [t, ds] = x.split('|'); return { t, ds: (ds || '').split(',').map(Number) }; });
      return (o) => !String(o.k).startsWith('n:') && full.some((f) => f.t < o.t && f.ds.includes(o.d));
    },
    diffName: (d) => ['BAS', 'ADV', 'EXP', 'MAS', 'ULT'][d] || '?',
    diffColor: (d) => ['#22bb5b', '#e8a10a', '#e3374c', '#9b3fd6', '#555'][d] || '#888',
    score: (o) => o.s, fmtScore: num, fmtGain: (g) => '+' + num(g),
    fmtRating: (r) => Number(r).toFixed(2),
    ratingSub: (s) => [['BEST 30 平均', s.b30 ? s.b30.toFixed(4) : '—'], ['NEW 20 平均', s.n20 ? s.n20.toFixed(4) : '—']],
  },
  {
    id: 'maimai', label: 'maimai DX', color: '#2ea8dc',
    // v1（没有起点）的记录书签会整份丢弃重新开始，这里也不显示
    normalize: (h) => (h.v === 2 ? h : { ...h, since: '', obs: [], snaps: [] }),
    keyOf: maimaiKey,
    diffName: (d) => ({ EXPERT: 'EXP', MASTER: 'MAS', 'Re:MASTER': 'ReM' }[d] || d),
    diffColor: (d) => ({ EXPERT: '#e3374c', MASTER: '#9b3fd6', 'Re:MASTER': '#c17be0' }[d] || '#888'),
    score: (o) => o.a, fmtScore: fmtAch, fmtGain: (g) => '+' + (g / 10000).toFixed(4) + '%',
    fmtRating: (r) => String(r),
    ratingSub: (s) => [['BEST35 合计', s.parts ? String(s.parts[1]) : '—'], ['NEW15 合计', s.parts ? String(s.parts[0]) : '—']],
    // 游玩详情里游戏记录的「游玩后的 DX Rating」和「游玩前 = 游玩后 − 变动」也画进走势（同书签）
    extraSeries: (obs) => obs.filter((o) => o.src === 'p' && o.r > 0).flatMap((o) => {
      const ms = timeMs(o.t);
      return o.dr != null ? [{ ms: ms - 1, r: o.r - o.dr }, { ms, r: o.r }] : [{ ms, r: o.r }];
    }),
  },
  {
    id: 'ongeki', label: 'オンゲキ', color: '#e0508f',
    // v4 以前的记录书签会整份丢弃，这里也不显示
    normalize: (h) => (h.v === 4 ? h : { ...h, since: '', obs: [], snaps: [] }),
    keyOf: () => (o) => ({ key: titleKey(o), kind: '' }),
    diffName: (d) => ({ EXPERT: 'EXP', MASTER: 'MAS', LUNATIC: 'LUN' }[d] || d),
    diffColor: (d) => ({ EXPERT: '#e3374c', MASTER: '#9b3fd6', LUNATIC: '#d6336c' }[d] || '#888'),
    score: (o) => o.s, fmtScore: num, fmtGain: (g) => '+' + num(g),
    fmtRating: (r) => Number(r).toFixed(3),
    ratingSub: (s) => {
      const p = (i) => (s.parts ? (s.parts[i] / 1000).toFixed(3) : '—');
      return [['新曲枠', p(0)], ['ベスト枠', p(1)], ['P-SCORE枠', p(2)]];
    },
  },
];

// 一份历史记录 → { since, lastRun, rating, series, plays, chartCount, improved(startMs) }
export function analyze(game, raw) {
  const hist = game.normalize({ ...raw, obs: raw.obs || [], snaps: raw.snaps || [] });
  const since = hist.since || '';
  const obs = hist.obs.filter((o) => o.t >= since && game.score(o) >= 0).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const snaps = hist.snaps.filter((s) => s.t >= since);
  const sinceMs = since ? timeMs(since) : -Infinity;

  // 每个谱面的观测（时间、分数），按时间排好。fresh = 第一次出现时是新打的谱面
  // （maimai / オンゲキ 的起点一定是全曲扫描，所以起点之后才出现的就是新打的；中二见上面的 isNewChart）
  const keyOf = game.keyOf(obs);
  const isNew = game.isNewChart ? game.isNewChart(hist) : (o) => !!since && o.t > since;
  const charts = new Map();
  obs.forEach((o) => {
    const { key, kind } = keyOf(o);
    if (!charts.has(key)) charts.set(key, { title: norm(o.n), d: o.d, kind, pts: [], fresh: isNew(o) });
    charts.get(key).pts.push({ ms: timeMs(o.t), v: game.score(o) });
  });

  // startMs 之后最佳分数提高了的谱面。起点（第一次记录）之前不知道成绩，所以比较的基准最早是起点那次的成绩扫描；
  // 基准里没有、而且是新打的谱面 = 这段时间里第一次打的（first），单独列出；
  // 不是新打的（以前就打过，只是起点那次没读到）以第一次读到的成绩为基准
  const improved = (startMs) => {
    const cut = Math.max(startMs, sinceMs + 1);
    const out = [];
    charts.forEach((c) => {
      let before = null, after = null, at = 0;
      c.pts.forEach((p) => {
        if (p.ms < cut) before = before == null ? p.v : Math.max(before, p.v);
        if (after == null || p.v > after) { after = p.v; at = p.ms; }
      });
      if (before == null && !c.fresh) before = c.pts[0].v;
      if (after == null || (before != null && after <= before)) return;
      out.push({
        title: c.title, diff: game.diffName(c.d) + (c.kind ? ' ' + c.kind : ''), diffColor: game.diffColor(c.d),
        from: before, to: after, gain: before == null ? 0 : after - before, first: before == null, at,
      });
    });
    return out.sort((a, b) => b.gain - a.gain || b.at - a.at);
  };

  const last = snaps[snaps.length - 1];
  const series = snaps.filter((s) => s.r > 0).map((s) => ({ ms: timeMs(s.t), r: +s.r }))
    .concat(game.extraSeries ? game.extraSeries(obs) : []).sort((a, b) => a.ms - b.ms);
  return {
    since,
    lastRun: lastRunOf({ obs, snaps }),
    rating: last && last.r > 0 ? { value: +last.r, text: game.fmtRating(last.r), sub: game.ratingSub(last) } : null,
    series,
    plays: obs.filter((o) => o.src === 'p').map((o) => timeMs(o.t)),
    chartCount: charts.size,
    improved,
  };
}
