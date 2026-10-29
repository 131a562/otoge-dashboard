// 国服成绩导入：从水鱼查分器（diving-fish）或落雪查分器（LXNS）读取完整成绩，换算成书签的历史记录格式，
// 和云端已有的记录合并后写回 otoge-sync 的 maimai-cn / chunithm-cn 文件夹（只有这两个文件夹允许面板写入）。
// 每导入一次就像书签运行一次：有变化的成绩记成一条「成绩扫描」观测（src 'b'），再记一个 Rating 快照（含 B50）。
// 水鱼 / 落雪只有每个谱面的最好成绩，没有游玩记录，所以国服没有出勤、游玩次数；推分的时间是导入的时间。
// Token 只在浏览器里直接发给水鱼 / 落雪，不经过 otoge-sync。
//
// 记录格式（和书签相同，games.js 的统计、B50 图都能直接用；行的末尾多了国服的定数和曲目 ID）：
//   maimai-cn   v2  obs {t, k:'曲名|DX/STD|难度', nk, n, kd, d, src:'b', a:达成率×10000, fc, sy, x:DX 分, xm:DX 分满分}
//                   snaps {t, r, c, n15, b35, parts:[NEW15 合计, BEST35 合计], ver:最新版本名, src,
//                          best/news:[[k, 曲名, a, 单曲 rating, fc, 难度, DX/STD, '', 定数, 曲目 ID]]}
//   chunithm-cn v3  obs {t, k:'曲目ID:难度', n, d:0〜4, s, src:'b', l:'FC'|'AJ'|'AJC'|''}；scans 每次导入记一条（全难度）
//                   snaps {t, r, b30, n20, ver, src, best/news:[[k, 曲名, 分数, 单曲 Rating×100, 标记, 定数, 曲目 ID]]}
const V = new URL(import.meta.url).search;
const { fmtTime, cleanAccount, norm } = await import('./common.js' + V);

// 本地测试可以用 ?cnapi=http://localhost:xxxx 指到模拟的水鱼 / 落雪（只接受 localhost）
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cnapi') : null; // Node 测试时没有 location
const LOCAL = q && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q) ? q.replace(/\/+$/, '') : '';
const DF = LOCAL ? LOCAL + '/df' : 'https://www.diving-fish.com/api';
const LX = LOCAL ? LOCAL + '/lx' : 'https://maimai.lxns.net/api/v0';

export const SOURCES = {
  df: { label: '水鱼', tokenHelp: '水鱼查分器 → 编辑个人资料 → 成绩导入 Token（生成后复制）' },
  lx: { label: '落雪', tokenHelp: '落雪查分器 → 账号详情 → 个人 API 密钥（生成后复制）' },
};
export const LX_JACKET = { maimai: (id) => `https://assets2.lxns.net/maimai/jacket/${id % 10000}.png`, chunithm: (id) => `https://assets2.lxns.net/chunithm/jacket/${id}.png` };

const MAI_DIFFS = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];
const FC = { fc: 'FC', fcp: 'FC+', ap: 'AP', app: 'AP+' };
const FS = { sync: 'SYNC', fs: 'FS', fsp: 'FS+', fsd: 'FDX', fsdp: 'FDX+' };
const CHU_LAMP = { fullcombo: 'FC', alljustice: 'AJ', alljusticecritical: 'AJC' };
const FC_RANK = { '': 0, FC: 1, 'FC+': 2, AP: 3, 'AP+': 4 };
const SYNC_RANK = { '': 0, SYNC: 1, FS: 2, 'FS+': 3, FDX: 4, 'FDX+': 5 };
const CHU_RANK = { '': 0, FC: 1, AJ: 2, AJC: 3 };

const cache = new Map();
const getJson = async (url, headers = {}) => {
  let res;
  try { res = await fetch(url, { headers, cache: 'no-store' }); } catch (e) { throw new Error('连不上 ' + new URL(url).host); }
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* 不是 JSON */ }
  if (!res.ok) {
    const msg = (j && (j.message || j.msg)) || '';
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error(`Token 无效或没有权限（HTTP ${res.status}${msg ? '：' + msg : ''}）`);
    throw new Error(`HTTP ${res.status}${msg ? '：' + msg : ''}`);
  }
  if (j == null) throw new Error('返回的不是 JSON');
  return j;
};
// 公开的曲目数据（不带 Token），一次会话里只下载一次
const getPublic = (url) => {
  if (!cache.has(url)) cache.set(url, getJson(url).catch((e) => { cache.delete(url); throw e; }));
  return cache.get(url);
};
const lx = async (path, token) => {
  const j = await getJson(LX + path, { 'X-User-Token': token });
  if (j && j.success === false) throw new Error(j.message || '落雪返回失败');
  return j && 'data' in j ? j.data : j;
};

// ---- 读取：返回 { player: {name, rating}, records: [...], ver }（records 已统一成下面的格式）----
//   maimai   {id, title, kind:'DX'|'STD', d:'MASTER'…, a, fc, sy, x, xm, ds, ra, isNew}
//   chunithm {id, title, d:0〜4, s, l, ds, ra, isNew}
async function readDivingFish(game, token) {
  const H = { 'Import-Token': token };
  if (game === 'maimai') {
    const [data, music] = await Promise.all([
      getJson(DF + '/maimaidxprober/player/records', H), getPublic(DF + '/maimaidxprober/music_data'),
    ]);
    const byId = new Map(music.map((m) => [String(m.id), m]));
    // 宴谱（宴会場，曲目 ID 10 万以上）不导入：不算 Rating，日服书签也不记
    const isUtage = (r, m) => r.song_id >= 100000 || (m && m.basic_info && m.basic_info.genre === '宴会場') || /^\[.\]/.test(r.title);
    const records = (data.records || []).filter((r) => !isUtage(r, byId.get(String(r.song_id)))).map((r) => {
      const m = byId.get(String(r.song_id));
      const notes = m && m.charts && m.charts[r.level_index] && m.charts[r.level_index].notes;
      return {
        id: +r.song_id, title: r.title, kind: r.type === 'SD' ? 'STD' : 'DX', d: MAI_DIFFS[r.level_index],
        a: Math.round(r.achievements * 10000), fc: FC[r.fc] || '', sy: FS[r.fs] || '', x: r.dxScore || 0,
        xm: notes ? notes.reduce((s, n) => s + n, 0) * 3 : 0, ds: r.ds, ra: r.ra, isNew: !!(m && m.basic_info && m.basic_info.is_new),
      };
    }).filter((r) => r.d);
    const latest = music.filter((m) => m.basic_info && m.basic_info.is_new).map((m) => m.basic_info.from)[0] || '';
    return { player: { name: data.nickname || data.username || '', rating: data.rating }, records, ver: latest };
  }
  const [data, music, latest] = await Promise.all([
    getJson(DF + '/chunithmprober/player/records', H), getPublic(DF + '/chunithmprober/music_data'),
    getPublic(DF + '/chunithmprober/latest_version'),
  ]);
  const newVers = new Set(latest.version || []);
  const byId = new Map(music.map((m) => [String(m.id), m]));
  const records = ((data.records && data.records.best) || []).filter((r) => r.level_index <= 4).map((r) => {
    const m = byId.get(String(r.mid));
    return {
      id: +r.mid, title: r.title, d: r.level_index, s: r.score, l: CHU_LAMP[r.fc] || '', ds: r.ds, ra: r.ra,
      isNew: !!(m && m.basic_info && newVers.has(m.basic_info.from)),
    };
  });
  return { player: { name: data.nickname || data.username || '', rating: data.rating }, records, ver: (latest.version || []).slice(-1)[0] || '' };
}

async function readLxns(game, token) {
  if (game === 'maimai') {
    const [player, scores, list] = await Promise.all([
      lx('/user/maimai/player', token), lx('/user/maimai/player/scores', token), getPublic(LX + '/maimai/song/list?notes=true'),
    ]);
    // 新曲：谱面所在版本是最新版本（落雪的现版本 Best 15）
    const vers = (list.versions || []).slice().sort((x, y) => x.version - y.version);
    const latest = vers[vers.length - 1] || { version: Infinity, title: '' };
    const songs = new Map((list.songs || []).map((s) => [s.id, s]));
    const records = (scores || []).filter((r) => r.type === 'standard' || r.type === 'dx').map((r) => {
      const s = songs.get(r.id);
      const c = s && s.difficulties && (s.difficulties[r.type] || []).find((x) => x.difficulty === r.level_index);
      const ver = (c && c.version) || (s && s.version) || 0;
      return {
        id: r.id, title: r.song_name || (s && s.title) || '', kind: r.type === 'dx' ? 'DX' : 'STD', d: MAI_DIFFS[r.level_index],
        a: Math.round(r.achievements * 10000), fc: FC[r.fc] || '', sy: FS[r.fs] || '', x: r.dx_score || 0,
        xm: c && c.notes && c.notes.total ? c.notes.total * 3 : 0, ds: c ? c.level_value : 0, ra: Math.floor(r.dx_rating || 0),
        isNew: Math.floor(ver / 100) >= Math.floor(latest.version / 100),
      };
    }).filter((r) => r.d && r.title);
    return { player: { name: player.name || '', rating: player.rating }, records, ver: latest.title };
  }
  const [player, scores, list] = await Promise.all([
    lx('/user/chunithm/player', token), lx('/user/chunithm/player/scores', token), getPublic(LX + '/chunithm/song/list'),
  ]);
  // 新曲：最新的两个版本（和水鱼 latest_version 给的一样，当前版本 + 上一个版本）
  const vers = (list.versions || []).slice().sort((x, y) => x.version - y.version);
  const newFrom = vers.length >= 2 ? vers[vers.length - 2].version : (vers[0] || { version: Infinity }).version;
  const songs = new Map((list.songs || []).map((s) => [s.id, s]));
  const records = (scores || []).filter((r) => r.level_index <= 4).map((r) => {
    const s = songs.get(r.id);
    const c = s && (s.difficulties || []).find((x) => x.difficulty === r.level_index);
    const ver = (c && c.version) || (s && s.version) || 0;
    return {
      id: r.id, title: r.song_name || (s && s.title) || '', d: r.level_index, s: r.score, l: CHU_LAMP[r.full_combo] || '',
      ds: c ? c.level_value : 0, ra: r.rating || 0, isNew: ver >= newFrom,
    };
  }).filter((r) => r.title);
  return { player: { name: player.name || '', rating: player.rating }, records, ver: (vers[vers.length - 1] || {}).title || '' };
}

export const readSource = (source, game, token) => (source === 'lx' ? readLxns(game, token) : readDivingFish(game, token));

// ---- 换算成历史记录并合并 ----
const emptyHist = (game) => (game === 'maimai'
  ? { v: 2, game: 'maimai-cn', name: '', since: '', resetAt: '', obs: [], snaps: [] }
  : { v: 3, game: 'chunithm-cn', name: '', since: '', resetAt: '', obs: [], snaps: [], scans: [] });
const maiKey = (r) => `${norm(r.title)}|${r.kind}|${r.d}`;
const chuKey = (r) => `${r.id}:${r.d}`;

// 历史里每个谱面现在的最好成绩
function bestState(game, hist) {
  const st = new Map();
  for (const o of hist.obs) {
    const p = st.get(o.k) || {};
    if (game === 'maimai') {
      st.set(o.k, {
        a: Math.max(p.a ?? -1, o.a ?? -1), x: Math.max(p.x || 0, o.x || 0),
        fc: (FC_RANK[o.fc] || 0) > (FC_RANK[p.fc] || 0) ? o.fc : p.fc || '',
        sy: (SYNC_RANK[o.sy] || 0) > (SYNC_RANK[p.sy] || 0) ? o.sy : p.sy || '',
      });
    } else {
      st.set(o.k, { s: Math.max(p.s ?? -1, o.s ?? -1), l: (CHU_RANK[o.l] || 0) > (CHU_RANK[p.l] || 0) ? o.l : p.l || '' });
    }
  }
  return st;
}

// 把这次读到的成绩并入历史（就地修改 hist），返回 { added, improved, fresh, snapAdded }
export function applyImport(game, hist, data, sourceLabel, t = fmtTime(new Date())) {
  if (!hist.since) hist.since = t;
  if (data.player.name) hist.name = data.player.name;
  hist.source = sourceLabel;
  const st = bestState(game, hist);
  let improved = 0, fresh = 0;
  for (const r of data.records) {
    if (game === 'maimai') {
      const k = maiKey(r);
      const o = { t, k, nk: k, n: r.title, kd: r.kind, d: r.d, src: 'b', a: r.a, fc: r.fc, sy: r.sy, x: r.x, xm: r.xm };
      const p = st.get(k);
      if (!p) { hist.obs.push(o); fresh++; continue; }
      if (o.a > p.a || o.x > p.x || (FC_RANK[o.fc] || 0) > (FC_RANK[p.fc] || 0) || (SYNC_RANK[o.sy] || 0) > (SYNC_RANK[p.sy] || 0)) { hist.obs.push(o); improved++; }
    } else {
      const k = chuKey(r);
      const o = { t, k, n: r.title, d: r.d, s: r.s, src: 'b', l: r.l };
      const p = st.get(k);
      if (!p) { hist.obs.push(o); fresh++; continue; }
      if (o.s > p.s || (CHU_RANK[o.l] || 0) > (CHU_RANK[p.l] || 0)) { hist.obs.push(o); improved++; }
    }
  }
  // 中二：每次导入都是全部难度的完整成绩，记一条完整扫描。之后才第一次出现的谱面就是新打的（games.js 的 isNewChart）
  if (game === 'chunithm') {
    hist.scans = hist.scans || [];
    if (!hist.scans.some((x) => x.startsWith(t + '|'))) hist.scans.push(t + '|0,1,2,3,4');
  }
  // Rating 快照：B50 按单曲 rating 排（maimai 旧曲 35 + 新曲 15，中二旧曲 30 + 新曲 20）
  const byRa = (x, y) => y.ra - x.ra;
  const pick = (isNew, n) => data.records.filter((r) => !!r.isNew === isNew && r.ra > 0).sort(byRa).slice(0, n);
  let snap;
  if (game === 'maimai') {
    const best = pick(false, 35), news = pick(true, 15);
    const row = (r) => [maiKey(r), r.title, r.a, r.ra, r.fc, r.d, r.kind, '', r.ds, r.id];
    const sum = (l) => l.reduce((s, r) => s + r.ra, 0);
    const c = sum(best) + sum(news);
    snap = {
      t, r: data.player.rating || c, c, n15: news.length ? Math.round(sum(news) / news.length * 100) / 100 : 0,
      b35: best.length ? Math.round(sum(best) / best.length * 100) / 100 : 0, parts: [sum(news), sum(best)],
      ver: data.ver, src: sourceLabel, best: best.map(row), news: news.map(row),
    };
  } else {
    const best = pick(false, 30), news = pick(true, 20);
    const row = (r) => [chuKey(r), r.title, r.s, Math.floor(r.ra * 100 + 1e-6), r.l, r.ds, r.id];
    const avg = (l) => (l.length ? Math.round(l.reduce((s, r) => s + r.ra, 0) / l.length * 10000) / 10000 : 0);
    const calc = Math.floor([...best, ...news].reduce((s, r) => s + r.ra, 0) / 50 * 100) / 100;
    snap = { t, r: data.player.rating ? Math.floor(data.player.rating * 100 + 1e-6) / 100 : calc, b30: avg(best), n20: avg(news),
      ver: data.ver, src: sourceLabel, best: best.map(row), news: news.map(row) };
  }
  // 和上一个快照完全一样、又在同一天，就不重复记（同书签）
  const last = hist.snaps[hist.snaps.length - 1];
  const same = last && last.r === snap.r && JSON.stringify([last.best, last.news]) === JSON.stringify([snap.best, snap.news]);
  const snapAdded = !(same && last.t.slice(0, 10) === t.slice(0, 10));
  if (snapAdded) hist.snaps.push(snap);
  hist.obs.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
  return { fresh, improved, snapAdded, rating: snap.r, records: data.records.length };
}

// ---- 云端读写（经由 otoge-sync；Contents API 的格式：GET 拿 sha 和 base64 内容，PUT 带上 sha）----
const b64enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64dec = (b64) => {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};
async function cloudGet(syncUrl, folder, name) {
  const base = syncUrl.replace(/\/+$/, '') + '/' + folder + '/' + encodeURIComponent(name);
  let res;
  try { res = await fetch(base, { cache: 'no-store' }); } catch (e) { throw new Error('连不上同步服务'); }
  if (res.status === 404) return { hist: null, sha: undefined };
  if (!res.ok) throw new Error('同步服务返回 HTTP ' + res.status);
  const j = await res.json();
  let text;
  if (j.encoding === 'base64' && j.content) text = b64dec(j.content);
  else { // 超过 1MB 时 Contents API 不返回内容，改读原始文件
    const raw = await fetch(base + '/raw', { cache: 'no-store' });
    if (!raw.ok) throw new Error('同步服务返回 HTTP ' + raw.status);
    text = await raw.text();
  }
  let hist;
  try { hist = JSON.parse(text); } catch (e) { hist = null; }
  if (!hist || !Array.isArray(hist.obs)) throw new Error('云端文件不是历史记录的格式，没有改动云端');
  hist.snaps = hist.snaps || [];
  return { hist, sha: j.sha };
}
async function cloudPut(syncUrl, folder, name, hist, sha) {
  let res;
  try {
    res = await fetch(syncUrl.replace(/\/+$/, '') + '/' + folder + '/' + encodeURIComponent(name), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `import ${folder}/${name} from ${hist.source || 'cn'}`, content: b64enc(JSON.stringify(hist)), ...(sha ? { sha } : {}) }),
    });
  } catch (e) { throw new Error('连不上同步服务'); }
  return res.status;
}

// 导入一个游戏：读水鱼 / 落雪 → 读云端 → 合并 → 写回（写入冲突时重新读取再合并，最多 3 次）
// name：同步名字（为空时用水鱼 / 落雪上的玩家名）。返回 { name, fresh, improved, snapAdded, rating, records } 或 { empty: true }
export async function importGame({ syncUrl, source, game, token, name, onStatus = () => {} }) {
  const label = SOURCES[source].label;
  onStatus(`正在从${label}读取${game === 'maimai' ? '舞萌' : '中二'}成绩…`);
  const data = await readSource(source, game, token);
  if (!data.records.length) return { empty: true, player: data.player };
  const acc = cleanAccount(name || data.player.name);
  if (!acc) throw new Error('需要填同步名字');
  const folder = game + '-cn';
  for (let attempt = 0; attempt < 3; attempt++) {
    onStatus(`正在合并云端记录（${folder}/${acc}）…`);
    const { hist: cur, sha } = await cloudGet(syncUrl, folder, acc);
    const hist = cur || emptyHist(game);
    const sum = applyImport(game, hist, data, label);
    const status = await cloudPut(syncUrl, folder, acc, hist, sha);
    if (status === 200 || status === 201) return { name: acc, ...sum };
    if (status !== 409 && status !== 422) throw new Error('写入同步服务失败（HTTP ' + status + '）');
  }
  throw new Error('写入冲突，请稍后再试');
}
