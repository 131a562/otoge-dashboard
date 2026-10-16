// 三个游戏共用的小工具。浏览器和 Node（test/ 生成模拟数据）都能用，不依赖 DOM

export const pad2 = (n) => String(n).padStart(2, '0');
export const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
export const byTime = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
// 历史记录里的时间是「YYYY/MM/DD HH:MM」（日本时间，书签运行时的本地时间）
export const timeMs = (t) => {
  const m = String(t).match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
};
export const fmtTime = (d) => d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
export const dayOf = (t) => String(t).slice(0, 10);

// 同步名字的统一写法（和三个书签的 cleanAccount 相同）：全角英数字转半角、英文字母转大写
export const cleanAccount = (s) => String(s || '').normalize('NFKC').replace(/[a-z]/g, (c) => c.toUpperCase()).trim()
  .replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').replace(/^\.+/, '').slice(0, 40);
// chuni-b50 2026/10/15 的版本按原样保存名字（多为全角），读不到时再试一次
export const legacyAccount = (s) => String(s || '').trim().replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, '_')
  .replace(/\s+/g, ' ').replace(/^\.+/, '').slice(0, 40);

// 「上一次查询」= 历史里最后一个快照 / 成绩扫描的时间（和书签的定义相同）
export const lastRunOf = (hist) => [
  ...(hist.snaps || []).map((s) => s.t),
  ...(hist.obs || []).filter((o) => o.src === 'b').map((o) => o.t),
].sort().pop() || '';

// 放入一个值；超出 cap 时挤掉最低的一首（可能就是它自己）。三个书签推算账号 Rating 影响时用的同一个做法
export const putCapped = (m, k, v, cap) => {
  const was = m.has(k);
  if (!was || v > m.get(k)) m.set(k, v);
  if (m.size > cap) {
    let low = null, lowV = Infinity;
    m.forEach((x, kk) => { if (x < lowV || (x === lowV && kk === k)) { low = kk; lowV = x; } });
    m.delete(low);
  }
  return { entered: !was && m.has(k), inFrame: m.has(k) };
};

// 读取 otoge-sync 上的 <游戏>/<名字>.json（/raw：超过 1MB 的文件 Contents API 不返回内容）
// 返回 { hist } / { missing: true }；连不上、服务出错时抛出异常
export async function fetchHist(syncUrl, game, name) {
  const url = syncUrl.replace(/\/+$/, '') + '/' + game + '/' + encodeURIComponent(name) + '/raw';
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); } catch (e) { throw new Error('连不上同步服务'); }
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error('同步服务返回 HTTP ' + res.status);
  let hist;
  try { hist = JSON.parse(await res.text()); } catch (e) { throw new Error('云端文件不是历史记录的格式'); }
  if (!hist || !Array.isArray(hist.obs)) throw new Error('云端文件不是历史记录的格式');
  hist.snaps = hist.snaps || [];
  return { hist };
}
