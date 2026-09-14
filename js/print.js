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
      '<table><thead><tr><th>座號</th><th>學號</th><th>選項</th><th>簽名圖片</th><th>驗證狀態</th><th>備註</th></tr></thead>' +
      '<tbody>' + list.map(rowHtml).join('') + '</tbody></table></section>';
  }).join('');
}
function rowHtml(r){
  var dec = r.decision || '未填寫';
  var c = r.decision === '同意' ? 'ok' : (r.decision === '不同意' ? 'no' : 'na');
  return '<tr><td class="center">' + esc(r.seat) + '</td><td>' + esc(r.id) + '</td>' +
    '<td class="' + c + '">' + esc(dec) + '</td>' +
    '<td class="center">' + sigCell(r) + '</td>' +
    '<td>' + esc(r.verify || '—') + '</td><td>' + esc(r.note || '') + '</td></tr>';
}
// 簽名圖片：改走自己的代理（GET ?file=<id>&key=<密鑰> → GAS 出圖），不登入 Drive 也能看、能印；
// 圖載不出來就退化成文字連結，點開原始網址還是能看
function sigCell(r){
  if (!r.sign) return '';
  return '<a class="sigl" href="' + esc(r.sign) + '" target="_blank" rel="noopener">' +
    '<img src="' + esc(proxyImg(r.sign)) + '" alt="開啟簽名影像" ' +
    'onerror="this.insertAdjacentHTML(\'afterend\', \'<span>檢視</span>\');this.remove()">' +
    '</a>';
}
// Drive 網址 → 自己代理的出圖網址（ff.id 或 /file/d/ID 兩種常見格式都吃）
function proxyImg(url){
  var m = String(url).match(/[?&]id=([A-Za-z0-9_-]+)/) || String(url).match(/\/d\/([A-Za-z0-9_-]+)/);
  var fb = String(APP.API_URL || '').replace(/\/+$/, '');
  if (m && fb) return fb + '?file=' + encodeURIComponent(m[1]) + '&key=' + encodeURIComponent(KEY.trim());
  return url;
}
function doPrint(){
  if (!document.getElementById('print-root').innerHTML){
    alert('尚無資料可列印。'); return;
  }
  window.print();
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

if (!KEY.trim()){
  document.getElementById('summary').textContent = '存取被拒絕（缺少密鑰）。';
} else {
  load();
}