// 模拟的水鱼查分器 / 落雪查分器（国服导入的本地测试用），由 test/serve.mjs 挂在 5181 的 /df 和 /lx 下面：
//   面板加 ?cnapi=http://localhost:5181 就会改用这里（src/cn.js）
//   水鱼 Import-Token：df-test    落雪 X-User-Token：lx-test（其他值返回 400 / 401，测试 Token 错误的提示）
// 数据：水鱼 maimai 用水鱼公开的测试成绩（player/test_data），中二随机生成；落雪按它真实的曲目表随机生成。
// 曲目数据（music_data / song/list）第一次请求时从真的水鱼 / 落雪下载（需要联网）。
// /__cnbump：模拟又打了一次（约 3% 的谱面分数提高、Rating 上涨），之后再导入就能看到推分
let seed = 11;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const realFetch = globalThis.fetch;
const cache = new Map();
const getReal = (url) => {
  if (!cache.has(url)) cache.set(url, realFetch(url).then((r) => r.json()));
  return cache.get(url);
};
const DF = 'https://www.diving-fish.com/api';
const LX = 'https://maimai.lxns.net/api/v0';
let bump = 0;

// 每个谱面一个固定的「基础分」，bump 次数越多，部分谱面越高
const bumped = (key, base, step, max) => {
  let v = base;
  for (let i = 1; i <= bump; i++) {
    let h = 0;
    for (const ch of key + '#' + i) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    if (h % 100 < 3) v = Math.min(max, v + step);
  }
  return v;
};

async function dfMaimai() {
  const data = JSON.parse(JSON.stringify(await getReal(DF + '/maimaidxprober/player/test_data')));
  data.records.forEach((r) => {
    const a = bumped(r.song_id + ':' + r.level_index, Math.round(r.achievements * 10000), 4000, 1010000);
    if (a !== Math.round(r.achievements * 10000)) { r.ra += 2; r.achievements = a / 10000; }
  });
  data.rating += bump * 3;
  return data;
}
async function dfChuni() {
  const music = await getReal(DF + '/chunithmprober/music_data');
  const best = [];
  music.filter((m) => m.id < 8000).slice(0, 400).forEach((m, i) => {
    if (i % 3) return;
    const li = 3;
    if (!(m.ds[li] > 0)) return;
    const score = bumped(m.id + ':' + li, 970000 + Math.floor(rand() * 39000), 3000, 1010000);
    best.push({ cid: m.cids[li], mid: m.id, ds: m.ds[li], fc: score > 1007000 ? 'alljustice' : score > 1000000 ? 'fullcombo' : '', level: m.level[li],
      level_index: li, level_label: 'Master', ra: Math.max(0, m.ds[li] + (score - 1000000) / 10000), score, title: m.title });
  });
  return { username: 'DFTESTER', nickname: 'DF测试', rating: 15.2 + bump * 0.02, records: { best, r10: [] } };
}
async function lxMaimai() {
  const list = await getReal(LX + '/maimai/song/list?notes=true');
  const scores = [];
  list.songs.slice(0, 600).forEach((s, i) => {
    if (i % 4) return;
    for (const type of ['standard', 'dx']) {
      const d = (s.difficulties[type] || [])[3];
      if (!d) continue;
      const a = bumped(s.id + type, 970000 + Math.floor(rand() * 38000), 3000, 1010000);
      const f = a >= 1005000 ? 22.4 : a >= 1000000 ? 21.6 : a >= 995000 ? 21.1 : a >= 990000 ? 20.8 : a >= 980000 ? 20.3 : 20.0;
      scores.push({ id: s.id, song_name: s.title, level: d.level, level_index: 3, achievements: a / 10000, fc: a > 1004000 ? 'fcp' : a > 1000000 ? 'fc' : null,
        fs: a > 1006000 ? 'fsp' : null, dx_score: Math.floor((d.notes?.total || 500) * 3 * (0.85 + rand() * 0.1)), dx_rating: Math.floor(d.level_value * Math.min(a, 1005000) / 1e6 * f),
        rate: 'sss', type });
    }
  });
  return scores;
}
async function lxChuni() {
  const list = await getReal(LX + '/chunithm/song/list');
  const scores = [];
  list.songs.slice(0, 500).forEach((s, i) => {
    if (i % 4) return;
    const d = (s.difficulties || [])[3];
    if (!d || !(d.level_value > 0)) return;
    const score = bumped(s.id + ':3', 975000 + Math.floor(rand() * 34000), 3000, 1010000);
    scores.push({ id: s.id, song_name: s.title, level: d.level, level_index: 3, score, rating: Math.max(0, d.level_value + (score - 1000000) / 10000),
      full_combo: score > 1009000 ? 'alljusticecritical' : score > 1007000 ? 'alljustice' : score > 1000000 ? 'fullcombo' : null, rank: 'ss' });
  });
  return scores;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'import-token,x-user-token,content-type', 'access-control-allow-methods': 'GET, OPTIONS' };
const json = (res, status, obj) => res.writeHead(status, { ...CORS, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(obj));

// 处理了返回 true
export async function handleCn(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (p === '/__cnbump') { bump++; res.writeHead(200, CORS).end('cn bump = ' + bump); return true; }
  if (!p.startsWith('/df/') && !p.startsWith('/lx/')) return false;
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS).end(); return true; }
  try {
    if (p.startsWith('/df/')) {
      const rest = p.slice(3);
      if (rest === '/maimaidxprober/music_data' || rest === '/chunithmprober/music_data' || rest === '/chunithmprober/latest_version') {
        return json(res, 200, await getReal(DF + rest)), true;
      }
      if (req.headers['import-token'] !== 'df-test') return json(res, 400, { message: '导入token有误' }), true;
      if (rest === '/maimaidxprober/player/records') return json(res, 200, await dfMaimai()), true;
      if (rest === '/chunithmprober/player/records') return json(res, 200, await dfChuni()), true;
      return json(res, 404, { message: 'not found' }), true;
    }
    const rest = p.slice(3) + url.search;
    if (rest.startsWith('/maimai/song/list') || rest.startsWith('/chunithm/song/list')) return json(res, 200, await getReal(LX + rest)), true;
    if (req.headers['x-user-token'] !== 'lx-test') return json(res, 401, { success: false, code: 401, message: 'unauthorized' }), true;
    const ok = (data) => json(res, 200, { success: true, code: 200, data });
    if (rest === '/user/maimai/player') return ok({ name: 'ＬＸテスト', rating: 15800 + bump * 4 }), true;
    if (rest === '/user/chunithm/player') return ok({ name: 'ＬＸテスト', rating: 15.9 + bump * 0.02 }), true;
    if (rest === '/user/maimai/player/scores') return ok(await lxMaimai()), true;
    if (rest === '/user/chunithm/player/scores') return ok(await lxChuni()), true;
    return json(res, 404, { success: false, code: 404, message: 'not found' }), true;
  } catch (e) {
    json(res, 502, { message: 'mock: 下载真实曲目数据失败 ' + e.message });
    return true;
  }
}
