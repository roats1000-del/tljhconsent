// 列印簽名版（print.html）邏輯
// 資訊組用：一次載入全部班級；畫面可依年級／班級／選項縮小，列印時每班獨立一頁。
// 門禁與查詢頁不同：密鑰來自網址 print.html?key=<PRINT_KEY>，伺服器端驗證（GAS 的 PRINT_KEY）。
var KEY = (new URLSearchParams(location.search)).get('key') || '';
var LAST = [];                 // 後端回傳的全部列（本地再做年級/班級/選項篩選）

function load(){
  apiCall('printData', { key: KEY.trim(), f: {} }).then(function(d){
    if (!d){ document.getElementById('summary').textContent = '讀取失敗（伺服器沒有回應）。'; return; }
    if (d.error){ document.getElementById('summary').textContent = d.error; return; }
    if (d.title){ document.getElementById('summary').textContent = d.title + (d.body ? '：' + d.body : ''); return; }
    LAST = d.rows || [];
    fillSelectors(d);
    render();
    hintBadSig();
  }).catch(function(e){
    document.getElementById('summary').textContent = '讀取失敗：' + String((e && e.message) || e);
  });
}
function fillSelectors(d){
  var gradeEl = document.getElementById('grade'), clsEl = document.getElementById('cls');
  gradeEl.innerHTML = '<option value="">全部年級</option>' + (d.grades || []).map(function(g){
    return '<option>' + esc(g) + '</option>';
  }).join('');
  clsEl.innerHTML = '<option value="">全部班級</option>' + (d.classes || []).map(function(c){
    return '<option>' + esc(c) + '</option>';
  }).join('');
}
function gradeChange(){
  var g = document.getElementById('grade').value;
  var clsEl = document.getElementById('cls');
  var all = Array.prototype.slice.call(clsEl.options).map(function(o){ return o.value; }).filter(Boolean);
  var keep = clsEl.value;
  clsEl.innerHTML = '<option value="">全部班級</option>' + all.filter(function(c){
    return !g || c.split('年')[0] === g;
  }).map(function(c){
    return '<option' + (c === keep ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
  render();
}
function decChange(){ render(); }
function render(){
  var g = document.getElementById('grade').value;
  var c = document.getElementById('cls').value;
  var dec = document.getElementById('dec').value;
  var rows = LAST.filter(function(r){
    if (g && r.cls.split('年')[0] !== g) return false;
    if (c && r.cls !== c) return false;
    if (dec && (r.decision || '未填寫') !== dec) return false;
    return true;
  });
  var done = rows.filter(function(r){ return r.decision === '同意' || r.decision === '不同意'; }).length;
  document.getElementById('summary').textContent =
    '共 ' + rows.length + ' 人（已填 ' + done + '、未填 ' + (rows.length - done) + '），每班獨立一頁列印';

  // 依班級分組（保持後端已排好的班級／座號順序）
  var byCls = {}, order = [];
  rows.forEach(function(r){
    if (!byCls[r.cls]){ byCls[r.cls] = []; order.push(r.cls); }
    byCls[r.cls].push(r);
  });
  document.getElementById('print-root').innerHTML = order.map(function(cls){
    var list = byCls[cls];
    var d = list.filter(function(r){ return r.decision === '同意' || r.decision === '不同意'; }).length;
    return '<section class="class-block"><h2>' + esc(cls) + '</h2>' +
      '<p class="cls-summary">共 ' + list.length + ' 人｜線上已簽 ' + d +
      ' 人｜待補簽 ' + (list.length - d) + ' 人</p>' +
      '<table><thead><tr><th>學號</th><th>座號</th><th>選項</th><th>家長簽名</th></tr></thead>' +
      '<tbody>' + list.map(rowHtml).join('') + '</tbody></table>' +
      '<p class="teacher-sign">導師簽名：<span class="sign-line"></span></p></section>';
  }).join('');
}
function rowHtml(r){
  var dec = r.decision || '未填寫';
  var c = r.decision === '同意' ? 'ok' : (r.decision === '不同意' ? 'no' : 'na');
  return '<tr><td>' + esc(r.id) + '</td><td class="center">' + esc(r.seat) + '</td>' +
    '<td class="' + c + '">' + esc(dec) + '</td>' +
    '<td class="center">' + sigCell(r) + '</td></tr>';
}
// 簽名圖片：資料封包已把簽名圖以 Base64 一起帶回（signB64），直接內嵌 data: URI，
// 不再發第二次 GET 請求 → 不受 Worker GET／doGet 斷線影響，一定能顯示、一定能印。
// 萬一哪一列沒帶到（讀圖失敗），放一個「✕」可點開原始 Drive 網址。
function sigCell(r){
  if (r.signB64){
    return '<span class="sigl"><img src="data:image/png;base64,' + r.signB64 + '" alt="家長簽名"></span>';
  }
  if (r.sign){
    return '<a class="sigl" href="' + esc(r.sign) + '" target="_blank" rel="noopener">✕</a>';
  }
  return '';
}
// 載入後幾秒檢查一次：有簽名圖讀不到就在最上方補一行除錯提示（重試跑完再判斷）
function hintBadSig(){
  setTimeout(function(){
    var bad = document.getElementById('print-root').querySelectorAll('.sigl.bad').length;
    if (!bad) return;
    var s = document.getElementById('summary');
    s.textContent = s.textContent.replace(/(。)?$/, '；') +
      bad + ' 張簽名圖讀不到：請確認 Cloudflare Worker 已貼上新版並按 Deploy（圖片要過 GET）、GAS 已重新部署、config.js 的 API_URL 正確。';
  }, 4000);
}
function doPrint(){
  var root = document.getElementById('print-root');
  if (!root.innerHTML){
    alert('尚無資料可列印。'); return;
  }
  waitImages(root).then(function(){
    var failed = Array.prototype.filter.call(root.querySelectorAll('.sigl img'),
      function(i){ return !i.naturalWidth; }).length;
    if (failed && !confirm(failed + ' 張簽名圖未載入（會印成空白）。確定仍要列印嗎？')) return;
    window.print();
  });
}
// 等頁面上所有簽名圖都載入（或載失敗）；再多留一點時間讓「自動重試」跑完，再統計失敗張數
function waitImages(root){
  var imgs = Array.prototype.slice.call(root.querySelectorAll('.sigl img'));
  if (!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map(function(img){
    if (img.complete) return Promise.resolve();
    return new Promise(function(res){
      img.addEventListener('load', res);
      img.addEventListener('error', res);
    });
  })).then(function(){
    return new Promise(function(res){ setTimeout(res, 1400); });
  });
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

if (!KEY.trim()){
  document.getElementById('summary').textContent = '存取被拒絕（缺少密鑰）。';
} else {
  load();
}