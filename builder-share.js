/* Versioned, lossless native roster links. No catalog data or host is embedded. */
window.BuilderShare = (() => {
  const MAX_BYTES = 1024 * 1024, MAX_CODE = 256 * 1024;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});

  function checkRecord(record) {
    const army = record?.army || record;
    if (!army || typeof army !== 'object' || !Array.isArray(army.units) ||
        !Number.isSafeInteger(Number(army.armyId)) || Number(army.armyId) <= 0)
      throw Error('分享内容不是有效军表。');
    if (record.army && typeof record.name !== 'string') throw Error('军表名称格式不正确。');
    if (army.units.length > 500 || army.units.some(u => !u || !Array.isArray(u.upgrades) || u.upgrades.length > 100))
      throw Error('分享军表的单位或升级数量超出范围。');
    return record;
  }

  async function collect(stream) {
    const reader = stream.getReader(), chunks = [];
    let length = 0;
    try {
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_BYTES) {
          await reader.cancel();
          throw Error('分享内容过大，请使用 JSON 文件导入。');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
    return bytes;
  }

  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  function parse(bytes) {
    if (bytes.length > MAX_BYTES) throw Error('分享内容过大，请使用 JSON 文件导入。');
    try {return checkRecord(JSON.parse(decoder.decode(bytes)));}
    catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) throw Error('分享内容损坏或不是有效 JSON。');
      throw error;
    }
  }
  async function inflate(bytes, format) {
    if (typeof DecompressionStream === 'undefined')
      throw Error('此浏览器不支持解压分享链接，请更新浏览器，或使用 JSON 导入。');
    return collect(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)));
  }

  async function encode(record) {
    checkRecord(record);
    const bytes = encoder.encode(JSON.stringify(record));
    if (bytes.length > MAX_BYTES) throw Error('军表过大，请使用 JSON 文件导出。');
    if (typeof CompressionStream === 'undefined')
      throw Error('此浏览器不支持生成压缩链接，请更新浏览器，或使用 JSON 导出。');
    const compressed = await collect(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')));
    const code = '1.' + toBase64(compressed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (code.length > MAX_CODE) throw Error('军表过大，请使用 JSON 文件导出。');
    return code;
  }
  async function decode(code) {
    if (typeof code !== 'string' || code.length > MAX_CODE) throw Error('分享代码过长。');
    if (!code.startsWith('1.')) throw Error('无法识别分享版本，请更新页面后重试。');
    const encoded = code.slice(2);
    if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1)
      throw Error('分享代码不完整或已损坏。');
    return parse(await inflate(fromBase64(encoded.replace(/-/g, '+').replace(/_/g, '/')), 'deflate'));
  }

  // Keep old ?roster=z:<base64> links readable, including raw '+' characters.
  function request(href) {
    const url = new URL(href);
    if (url.hash.startsWith('#share/')) return {code:url.hash.slice(7), legacy:false};
    if (url.searchParams.has('share')) return {code:url.searchParams.get('share'), legacy:false};
    const legacy = url.search.slice(1).match(/(?:^|&)roster=([^&]*)/);
    return legacy ? {code:legacy[1], legacy:true} : null;
  }
  async function readRequest(value) {
    if (!value.legacy) return decode(value.code);
    if (value.code.length > MAX_CODE) throw Error('分享代码过长。');
    const raw = decodeURIComponent(value.code);
    if (raw.startsWith('z:')) return parse(await inflate(fromBase64(raw.slice(2)), 'deflate-raw'));
    return parse(encoder.encode(raw.replace(/^j:/, '')));
  }
  function link(href, code) {
    const url = new URL(href);
    url.search = '';
    url.hash = 'share/' + code;
    return url.href;
  }
  function route(href, hash) {
    const url = new URL(href);
    url.searchParams.delete('roster');
    url.searchParams.delete('share');
    url.hash = hash;
    return url.pathname + url.search + url.hash;
  }
  const rosterRoute = record => '#faction/' + encodeURIComponent(record.factionId) + '/army/' + encodeURIComponent(record.id);
  function navigation(hash) {
    let match = hash.match(/^#faction\/(\d+)\/army\/([^/]+)$/) || hash.match(/^#army\/([^/]+)$/);
    if (match) return {id:decodeURIComponent(match.at(-1))};
    match = hash.match(/^#faction\/(\d+)$/);
    return match ? {factionId:Number(match[1])} : {};
  }
  return {encode, decode, request, readRequest, link, route, rosterRoute, navigation};
})();
