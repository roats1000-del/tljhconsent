// 唯一的 API 出口：前端 → Cloudflare Worker → GAS
// 全部透過 POST JSON：{ action:'submit'|'checkData'|'printData', data:… }
// 網路層失敗（連不到 Worker／預檢 CORS 被擋）會自動重試一次再回錯誤；
// 只有「請求根本沒送出去」才會重試，不會造成重複寫入。
function apiCall(action, data) {
  return invoker(action, data, true).catch(function (e) {
    return {
      title: '系統錯誤',
      body: '連不上伺服器：' + String((e && e.message) || e) +
        '（已自動重試仍失敗；請確認 config.js 的 API_URL 正確、Cloudflare Worker 已是新版並重新 Deploy）'
    };
  });
}
function invoker(action, data, first) {
  return fetch(APP.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action, data: data })
  })
  .then(function (r) { return r.json(); })
  .catch(function (e) {
    if (first) {
      return new Promise(function (res) { setTimeout(res, 600); })
        .then(function () { return invoker(action, data, false); });
    }
    throw e;
  });
}