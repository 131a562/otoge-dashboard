// 三个查分书签读写 otoge-sync（GitHub 私有仓库 otoge-history 的 <游戏>/<名字>.json）的代码：书签运行时从
// https://131a562.github.io/sbga-dashboard/src/sync.js 加载，三个书签共用这一份。面板自己只读，用的是 common.js 的 fetchHist。
// Worker 只转发（见 ../../otoge-sync/worker.js）：GET 返回 Contents API 的原样（base64 + sha），PUT 的请求体原样转给 Contents API。
const V = new URL(import.meta.url).search;
const { cleanAccount, legacyAccount, fmtTime } = await import('./common.js' + V);
export { cleanAccount, legacyAccount };

export const b64enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
export const b64dec = (b64) => {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

// syncUrl：Worker 的地址；game：chunithm / maimai / ongeki；
// combine(cloud, local)：云端已有记录时怎么和本机的合并（各书签自己的规则：迁移旧版本、格式不对时抛出错误等）
// 返回 { fetch, get, put, merge }：
//   fetch(名字, 后缀, init)  原样的请求（'_ping' 用来先确认连得上）
//   get(名字)               → { data, sha }，没有文件时 data = null
//   put(名字, data, sha)    → 写入成功 true，冲突（别的设备刚好也在写）false
//   merge(名字, local)      → 读云端、合并、写回，返回合并后的记录；冲突时重试 3 次
export function createSync(syncUrl, game, combine) {
  const fetchAcc = async (acc, suffix, init) => {
    let res;
    try {
      res = await fetch(syncUrl.replace(/\/+$/, '') + '/' + game + '/' + encodeURIComponent(acc) + (suffix || ''),
        Object.assign({ cache: 'no-store' }, init));
    } catch (e) {
      throw new Error('连不上同步服务');
    }
    if (res.status === 401 || res.status === 403 || res.status >= 500) {
      throw new Error('同步服务出错（HTTP ' + res.status + '），请联系书签提供者');
    }
    return res;
  };
  const get = async (acc) => {
    const res = await fetchAcc(acc);
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw new Error('读取失败 HTTP ' + res.status);
    const j = await res.json();
    let text;
    if (j.encoding === 'base64' && j.content) text = b64dec(j.content);
    else {
      // 超过 1MB 时 GitHub 不在 JSON 里返回内容，改为读取原始文件
      const raw = await fetchAcc(acc, '/raw');
      if (!raw.ok) throw new Error('读取失败 HTTP ' + raw.status);
      text = await raw.text();
    }
    try { return { data: JSON.parse(text), sha: j.sha }; } catch (e) { throw new Error('云端数据损坏'); }
  };
  const put = async (acc, data, sha) => {
    const body = { message: 'update ' + game + '/' + acc + ' ' + fmtTime(new Date()), content: b64enc(JSON.stringify(data)) };
    if (sha) body.sha = sha;
    const res = await fetchAcc(acc, '', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    if (res.status === 409 || res.status === 422) return false;
    if (!res.ok) throw new Error('写入失败 HTTP ' + res.status);
    return true;
  };
  const merge = async (acc, local) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, sha } = await get(acc);
      const merged = data ? combine(data, local) : local;
      if (data && JSON.stringify(data) === JSON.stringify(merged)) return merged;
      // 写入冲突（别的设备刚好也在写）时重新读取再合并
      if (await put(acc, merged, sha)) return merged;
    }
    throw new Error('多次写入冲突，请稍后再试');
  };
  return { fetch: fetchAcc, get, put, merge };
}
