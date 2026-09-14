// 唯一的 API 出口：前端 → Cloudflare Worker → GAS
// 全部透過 POST JSON：{ action:'submit'|'checkData', data:… }
function apiCall(action, data) {
  return fetch(APP.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action, data: data })
  })
  .then(function (r) { return r.json(); })
  .catch(function (e) {
    return { title: '系統錯誤', body: '連不上伺服器：' + String((e && e.message) || e) + '（請稍後再試）' };
  });
}