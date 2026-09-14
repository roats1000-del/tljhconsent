// ★ 前端唯一的設定檔：部署時改「API_URL」就好（其他是顯示文字，可依學校改）
var APP = {
  // 改成你的 Cloudflare Worker 網址，例如 'https://consent-form-proxy.你的子網域.workers.dev'
  API_URL: 'https://tljhconsent.roats1000.workers.dev/',

  // 顯示用（不參與驗證；真正的校名/活動是 GAS 後台的 ACTIVITY 常數）
  SCHOOL:   '大林國中',
  ACTIVITY: '入學'
};
