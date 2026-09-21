// 列印簽名版（print.html）邏輯
// 資訊組用：一次列出全部班級；可依年級／班級／選項縮小；列印時每班獨立一頁。
// 門禁：密鑰來自網址 print.html?key=<PRINT_KEY>，伺服器端驗證（GAS 的 PRINT_KEY）。
//
// 效能策略（500 人整校列印不會卡死）：
//   ① 先送「meta」→ 只回表單資料（班級/座號/學號/選項＋簽名網址），不碰任何圖，立刻把整張表畫出來。
//   ② 再依「班級」逐班撈圖（一次一班，一班約 30 張圖、幾百 KB），逐班填充＋進度顯示。
//      GAS 不會一口氣做 500 次 Drive 讀取而逼近 6 分鐘執行上限；回應也小於 1MB／批。
//   ③ 同一張圖 GAS 端有 CacheService 快取，重複列印幾乎秒開。

var KEY = (new URLSearchParams(location.search)).get('key') || '';

var LAST = [];            // 後端回傳的表單資料（預留 sign 網址，圖片另外分批撈）
var INFO = {};            // 學號 → 該列資料（含 name），供紙本選取清單與紙本表單使用
var IMG = {};             // 學號 → 簽名圖 signB64（批次載入後填充）
var imgPending = false;   // 是否仍有批次在撈圖
var imgTotal = 0, imgDone = 0;
var batch = 0;            // 批次代號：換篩選會開新批，舊批的 fetch 回傳一律作廢
var tried = {};           // 班級 → 連續撈不到圖的次數（最多重試到 2 次就放手顯示 ✕）
var lastImgErr = '';      // 最近一次撈圖失敗的實際原因（顯示在 summary，方便除錯）

function load(){
  apiCall('printData', { key: KEY.trim(), f: {} }).then(function(d){
    if (!d){ document.getElementById('summary').textContent = '讀取失敗（伺服器沒有回應）。'; return; }
    if (d.error){ document.getElementById('summary').textContent = d.error; return; }
    if (d.title){ document.getElementById('summary').textContent = d.title + (d.body ? '：' + d.body : ''); return; }
    LAST = d.rows || [];
    INFO = {};
    LAST.forEach(function(r){ if (r.id) INFO[r.id] = r; });
    fillSelectors(d);
    startBatch();         // 先啟動撈圖（內部 set imgPending 並 render），首次就不會先閃 ✕
  }).catch(function(e){
    document.getElementById('summary').textContent = '讀取失敗：' + String((e && e.message) || e);
  });
}
function fillSelectors(d){
  var gradeEl = document.getElementById('grade'), clsEl = document.getElementById('cls');
  gradeEl.innerHTML = '<option value="">全部年級</option>' + (d.grades || []).slice().sort(function(a,b){
    var rank = { '七':1, '八':2, '九':3 };
    return (rank[a] || 99) - (rank[b] || 99);
  }).map(function(g){
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
  startBatch();
}
function clsChange(){ startBatch(); }
function decChange(){ render(); }

// 目前篩選下的列（年級＋班級＋選項全部就地篩，像舊版一樣）
function currentRows(){
  var g = document.getElementById('grade').value;
  var c = document.getElementById('cls').value;
  var dec = document.getElementById('dec').value;
  return LAST.filter(function(r){
    if (g && r.cls.split('年')[0] !== g) return false;
    if (c && r.cls !== c) return false;
    if (dec && !matchDec(r.decision, dec)) return false;
    return true;
  });
}

// 這張表目前「有簽名網址但 IMG 還沒到手」的班級清單（最多重試到 2 次就放手）
function needsImages(){
  var g = document.getElementById('grade').value;
  var c = document.getElementById('cls').value;
  var order = [], seen = {};
  LAST.forEach(function(r){
    if (g && r.cls.split('年')[0] !== g) return;
    if (c && r.cls !== c) return;
    if (!r.sign || r.paper || IMG[r.id]) return;      // 未簽／紙本列／已有圖的不用撈
    if (!seen[r.cls]){ seen[r.cls] = 1; order.push(r.cls); }
  });
  return order;
}

// 啟動一批批次（不重疊：有新批次進來 → 舊批次代號作廢，fetch 回來直接略過）
// 結束後自動「接手」：使用者中途換年級/班級、或某班失敗要重試，都會再啟一輪
function startBatch(){
  if (imgPending) return;                 // 已有批次在跑（結束後會呼叫 resume() 重進）
  var g = document.getElementById('grade').value;
  var order = needsImages().filter(function(c){ return (tried[c] || 0) < 2; });
  if (!order.length){ imgPending = false; render(); return; }
  var my = ++batch;
  imgTotal = order.length; imgDone = 0; imgPending = true;
  render();
  var idx = 0;
  function step(){
    if (my !== batch) return;               // 被新一批取代 → 退休
    if (idx >= order.length){
      imgPending = false;
      render();
      resume();                             // 接手「中途換篩選」或「撈失敗要重試」的殘班
      return;
    }
    var cls = order[idx++];
    apiCall('printData', { key: KEY.trim(), f: { img:true, grade: g, cls: cls } }).then(function(d){
      if (my !== batch) return;             // 退休了，不碰 IMG
      var allGood = false;
      if (d && !d.error && d.rows){
        var missing = 0;
        d.rows.forEach(function(r){
          if (r.paper) return;             // 紙本列沒有簽名圖，不視為失敗
          if (r.signB64){ IMG[r.id] = r.signB64; }
          else if (r.sign){ delete IMG[r.id]; missing++; }
        });
        allGood = missing === 0;           // 有簽名卻沒圖 → 記為失敗，下一輪再試
      }
      // 記住失敗原因：cors/連線錯誤(d.body)或線端錯誤(d.error)
      if (!allGood){
        lastImgErr = (d && (d.error || d.title)) ? String(d.error || d.body) : '無回應';
        tried[cls] = (tried[cls] || 0) + 1;
      } else {
        tried[cls] = 0;
      }
      imgDone++;
      render();
      step();
    });
  }
  step();                                   // 逐班順序（一次一班，避免並行拖垮冷啟動／觸發 CF 防護）
}
function resume(){ startBatch(); }
// 全滅之後的手動補救：清空失敗計數重新抓（全班級）＋清掉尚未填好的殘留
function retryImages(){
  tried = {};
  startBatch();
}

function render(){
  var rows = currentRows();
  var done = rows.filter(function(r){ return !!r.decision; }).length;
  var missing = rows.filter(function(r){ return r.sign && !r.paper && !IMG[r.id]; }).length;
  var prog = imgPending ? '｜簽名圖載入中…（' + imgDone + '/' + imgTotal + ' 班）' :
             (missing ? '｜簽名圖載入失敗 ' + missing + ' 張' : (imgTotal ? '｜簽名圖已全部載入' : ''));
  var msg = '共 ' + rows.length + ' 人（已填 ' + done + '、未填 ' + (rows.length - done) + '），每班獨立一頁列印' + prog;
  var el = document.getElementById('summary');
  if (missing && !imgPending){
    el.innerHTML = msg + ' <button onclick="retryImages()">重試載入圖片</button>' +
      (lastImgErr ? ' <span class="err">（失敗原因：' + esc(lastImgErr) + '）</span>' : '');
  } else {
    el.textContent = msg;
  }

  var byCls = {}, order = [];
  rows.forEach(function(r){
    if (!byCls[r.cls]){ byCls[r.cls] = []; order.push(r.cls); }
    byCls[r.cls].push(r);
  });
  document.getElementById('print-root').innerHTML = order.map(function(cls){
    var list = byCls[cls];
    var d = list.filter(function(r){ return !!r.decision; }).length;
    return '<section class="class-block"><h2>' + esc(cls) + '</h2>' +
      '<p class="cls-summary">共 ' + list.length + ' 人｜線上已簽 ' + d +
      ' 人｜待補簽 ' + (list.length - d) + ' 人</p>' +
      classTables(list) +
      '<div class="teacher-footer"><p class="security-note">⚠ 資安提醒：本頁含個資，請勿對外公開或轉傳。</p>' +
      '<p class="teacher-sign">導師簽名：<span class="sign-line"></span></p></div></section>';
  }).join('');
  renderSel();   // 每次畫面刷新同步重建「紙本選取清單」（保留已勾選的學生）
}
// 一班的表格切成「左右兩欄並排」（各約一半），30 人能在兩面 A4 內完整呈現
function classTables(list){
  var half = Math.ceil(list.length / 2);
  var left = list.slice(0, half);
  var right = list.slice(half);
  return '<div class="cols">' +
    '<table>' + tblHead() + '<tbody>' + left.map(rowHtml).join('') + '</tbody></table>' +
    (right.length ? '<table>' + tblHead() + '<tbody>' + right.map(rowHtml).join('') + '</tbody></table>' : '') +
    '</div>';
}
function tblHead(){
  // 固定欄寬：表頭先宣告四欄比例，影像插入後欄寬不再被內容擠動
  return '<colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>' +
    '<thead><tr><th>學號</th><th>座號</th><th>選項</th><th>家長簽名</th></tr></thead>';
}
function rowHtml(r){
  var dec = r.decision || '未填寫';
  var c = decClass(r.decision);
  return '<tr><td>' + esc(r.id) + '</td><td class="center">' + esc(r.seat) + '</td>' +
    '<td class="' + c + '">' + esc(dec) + '</td>' +
    '<td class="center">' + sigCell(r) + '</td></tr>';
}
// 簽名圖片：用分批撈回的 IMG 填充（data: URI 內嵌，能看到就一定能印）。
// 尚未撈到 → 輕量空白佔位（維持版型）；撈失敗 → ✕（點開原始 Drive 網址）。
function sigCell(r){
  if (r.paper){
    return r.sign
      ? '<a class="sigl paper" href="' + esc(r.sign) + '" target="_blank" rel="noopener">紙本</a>'
      : '<span class="sigl paper">紙本</span>';
  }
  if (IMG[r.id]){
    return '<span class="sigl"><img src="data:image/png;base64,' + IMG[r.id] + '" alt="家長簽名"></span>';
  }
  if (r.sign && imgPending) return '<span class="sigl pending"></span>';
  if (r.sign){
    return '<a class="sigl" href="' + esc(r.sign) + '" target="_blank" rel="noopener">✕</a>';
  }
  return '';
}
function doPrint(){
  var root = document.getElementById('print-root');
  if (!root.innerHTML){ alert('尚無資料可列印。'); return; }
  whenImagesDone().then(function(){
    // 撈圖結束後再統計「有簽名卻沒有圖」的列（印出來會是空白；紙本列不算）
    var failed = LAST.filter(function(r){ return r.sign && !r.paper && !IMG[r.id]; }).length;
    if (failed && !confirm(failed + ' 位家長簽名圖未載入（會印成空白）。確定仍要列印嗎？')) return;
    waitImages(root).then(function(){
      var broken = Array.prototype.filter.call(root.querySelectorAll('.sigl img'),
        function(i){ return !i.naturalWidth; }).length;
      if (broken && !confirm(broken + ' 張簽名圖未載入（會印成空白）。確定仍要列印嗎？')) return;
      window.print();
    });
  });
}
// 等所有班級的簽名批次都跑完
function whenImagesDone(){
  return new Promise(function(res){
    if (!imgPending) return res();
    var iv = setInterval(function(){
      if (!imgPending){ clearInterval(iv); res(); }
    }, 250);
  });
}
// 等頁面上所有簽名圖都載入（data URI 幾乎立即完成，這裡是保險）
function waitImages(root){
  var imgs = Array.prototype.slice.call(root.querySelectorAll('.sigl img'));
  if (!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map(function(img){
    if (img.complete) return Promise.resolve();
    return new Promise(function(res){
      img.addEventListener('load', res);
      img.addEventListener('error', res);
    });
  }));
}
// ---------- 工具區：紙本掃描同步（doSync）＋簽署用紙本選取／列印 ----------
// paper 列的簽名欄是「紙本」超連結（可點開掃描檔），不走簽名圖批次；
// 因此 needsImages 與失敗統計會自動排除 paper 列（見上方）。
function doSync(){
  var el = document.getElementById('syncResult');
  if (!el) return;
  el.innerHTML = '同步中…';
  apiCall('syncScans', { key: KEY.trim() }).then(function(d){
    if (!d){ el.textContent = '同步失敗（伺服器沒有回應）。'; return; }
    if (d.error){ el.textContent = d.error; return; }
    if (d.title){ el.textContent = d.title + (d.body ? '：' + d.body : ''); return; }
    var parts = ['成功 ' + d.ok + ' 筆', '失敗 ' + d.fail + ' 筆'];
    if (d.conflict) parts.push('需行政處理 ' + d.conflict + ' 筆');
    var html = esc(parts.join('、'));
    if ((d.fails || []).length) html += '<span class="err">' + esc(d.fails.join('；')) + '</span>';
    if ((d.conflicts || []).length) html += '<span class="err">衝突學號：' + esc(d.conflicts.join('、')) + '</span>';
    el.innerHTML = html;
    load();   // 重整資料＋班級表＋紙本選取清單
  }).catch(function(e){
    el.textContent = '同步失敗：' + String((e && e.message) || e);
  });
}

// 依目前篩選（年級＋班級＋選項）重建紙本選取清單，並保留已勾選狀態
function renderSel(){
  var el = document.getElementById('selStudents');
  if (!el) return;
  var keep = {};
  Array.prototype.forEach.call(el.querySelectorAll('input:checked'),
    function(c){ keep[c.getAttribute('data-id')] = 1; });
  var rows = currentRows().filter(function(r){ return INFO[r.id]; });
  var byCls = {}, order = [];
  rows.forEach(function(r){
    if (!byCls[r.cls]){ byCls[r.cls] = []; order.push(r.cls); }
    byCls[r.cls].push(r);
  });
  el.innerHTML = order.map(function(cls){
    return '<div class="sel-cls"><b>' + esc(cls) + '</b></div>' +
      byCls[cls].map(function(r){
        var dec = r.decision || '未填寫';
        var sc = decClass(r.decision);
        var checked = keep[r.id] ? ' checked' : '';
        return '<label class="sel-item' + (checked ? ' checked' : '') + '">' +
          '<input type="checkbox" data-id="' + esc(r.id) + '"' + checked + ' onchange="updCount()"> ' +
          esc(r.id) + ' ' + esc(INFO[r.id].name || '') +
          ' <span class="' + sc + '">' + esc(dec) + '</span>' +
          (r.paper ? ' <span class="badge-paper">紙本</span>' : '') +
          '</label>';
      }).join('');
  }).join('');
  updCount();
}
function updCount(){
  var boxes = document.querySelectorAll('#selStudents input[type=checkbox]:checked');
  var cnt = document.getElementById('selCount');
  if (cnt) cnt.textContent = String(boxes.length);
  Array.prototype.forEach.call(document.querySelectorAll('#selStudents .sel-item'),
    function(l){ l.className = l.className.replace(/ checked/g, ''); });
  Array.prototype.forEach.call(boxes, function(c){
    var l = c.closest('label'); if (l) l.className += ' checked';
  });
}
function selAll(){
  Array.prototype.forEach.call(document.querySelectorAll('#selStudents input[type=checkbox]'),
    function(c){ c.checked = true; });
  updCount();
}
function selUnsigned(){
  Array.prototype.forEach.call(document.querySelectorAll('#selStudents input[type=checkbox]'),
    function(c){
      var r = INFO[c.getAttribute('data-id')] || {};
      c.checked = !r.decision;
    });
  updCount();
}
function selClear(){
  Array.prototype.forEach.call(document.querySelectorAll('#selStudents input[type=checkbox]'),
    function(c){ c.checked = false; });
  updCount();
}
// 把勾選學生套印成 A4 直式簽署用紙本（一位一張），印完自動還原螢幕
function doPaperPrint(){
  var ids = [];
  Array.prototype.forEach.call(document.querySelectorAll('#selStudents input[type=checkbox]:checked'),
    function(c){ ids.push(c.getAttribute('data-id')); });
  if (!ids.length){ alert('請先勾選學生，再列印簽署用紙本。'); return; }
  var now = new Date();
  var ds = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日';
  var forms = ids.map(function(id){
    var r = INFO[id] || {};
    return '<section class="paper-form">' +
      '<h2>' + esc(APP.SCHOOL) + ' 學生肖像權使用同意書</h2>' +
      '<p class="pf-id">學號：' + esc(r.id) + '　　學生姓名：' + esc(r.name || '') +
      '　　與學生關係：<span class="pf-blank"></span>（請簽署人自填）</p>' +
      '<div class="consent">' + esc(CONSENT_TEXT) + '</div>' +
      '<p class="pf-check"><span class="ck">□</span> 本人已詳閱並了解上述同意書內容</p>' +
      '<p class="pf-choice">本人與學生選擇：&nbsp;&nbsp;<span class="ck">□</span> 同意&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="ck">□</span> 不同意</p>' +
      '<div class="pf-sign"><p>簽署人簽名：<span class="pf-blank"></span></p></div>' +
      '<p class="pf-date">製表日期：' + esc(ds) + '</p>' +
      '</section>';
  }).join('');
  document.getElementById('paper-root').innerHTML = forms;
  document.body.classList.add('paper');
  window.print();
}
window.onafterprint = function(){
  document.body.classList.remove('paper');
  document.getElementById('paper-root').innerHTML = '';
  updCount();
};
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

if (!KEY.trim()){
  document.getElementById('summary').textContent = '存取被拒絕（缺少密鑰）。';
} else {
  load();
}