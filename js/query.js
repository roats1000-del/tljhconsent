// 導師查詢頁邏輯（query.html）
// 密鑰來自網址：query.html?key=<QUERY_KEY>。密鑰只留在網址與請求裡，伺服器端驗證，不進任何程式碼檔案。
var KEY = (new URLSearchParams(location.search)).get('key') || '';

function api(f, cb){
  apiCall('checkData', { key: KEY.trim(), f: f }).then(function(d){
    if (!d){ document.getElementById('summary').textContent = '讀取失敗（伺服器沒有回應）。'; return; }
    if (d.error){ document.getElementById('summary').textContent = d.error; return; }
    if (d.title){ document.getElementById('summary').textContent = d.title + (d.body ? '：' + d.body : ''); return; }
    applyData(d); render(document.getElementById('tbody')._rows);
  }).catch(function(e){
    document.getElementById('summary').textContent = '讀取失敗：' + String((e && e.message) || e);
  });
}
function refresh(keepCls){
  var g = document.getElementById('grade').value;
  var c = keepCls ? document.getElementById('cls').value : '';
  api({ grade: g, cls: c });
}
function gradeChange(){ refresh(false); }
function doQuery(){ refresh(true); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function applyData(d){
  var gradeEl = document.getElementById('grade'), clsEl = document.getElementById('cls');
  var pg = gradeEl.value, pc = clsEl.value;
  gradeEl.innerHTML = '<option value="">全部年級</option>' + (d.grades || []).slice().sort(function(a,b){
    var rank = { '七':1, '八':2, '九':3 };
    return (rank[a] || 99) - (rank[b] || 99);
  }).map(function(g){
    return '<option' + (g===pg ? ' selected' : '') + '>' + esc(g) + '</option>';
  }).join('');
  clsEl.innerHTML = '<option value="">全部班級</option>' + (d.classes || []).slice().sort(function(a,b){
    var r = gradeRankOf(a) - gradeRankOf(b);
    return r || String(a).localeCompare(String(b), 'zh-Hant');
  }).map(function(c){
    return '<option' + (c===pc ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
  document.getElementById('tbody')._rows = sortRows(d.rows || []);   // 存供搜尋框即時過濾
}
// 年級固定順序（七→八→九→其他）；班級內再照班名、座號排
function gradeRankOf(cls){
  var g = String(cls || '').split('年')[0];
  var rank = { '七':1, '八':2, '九':3 };
  return (g in rank) ? rank[g] : 99;
}
function sortRows(rows){
  return rows.slice().sort(function(a,b){
    var r = gradeRankOf(a.cls) - gradeRankOf(b.cls);
    if (r) return r;
    r = String(a.cls || '').localeCompare(String(b.cls || ''), 'zh-Hant');
    if (r) return r;
    return String(a.seat || '').localeCompare(String(b.seat || ''), 'zh-Hant', {numeric:true});
  });
}
// 搜尋：多個學號以空格分隔；任一個 token 命中該生學號（前綴也行）即列出，可一次列出多人
function filterRows(rows, q){
  var tokens = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return rows;
  return rows.filter(function(r){
    return tokens.some(function(t){ return (r.id || '').indexOf(t) >= 0; });
  });
}
function render(rows){
  rows = filterRows(rows || [], document.getElementById('q').value);
  var dec = document.getElementById('dec').value;                 // 選項篩選：同意（含部分/條件）、不同意、未填寫
  if (dec){
    rows = rows.filter(function(r){ return matchDec(r.decision, dec); });
  }
  var done = rows.filter(function(r){ return !!r.decision; }).length;
  document.getElementById('summary').textContent =
    '共 ' + rows.length + ' 人（已填 ' + done + '、未填 ' + (rows.length-done) + '），依班級、座號排序';
  document.getElementById('tbody').innerHTML = rows.map(function(r){
    var dec = r.decision || '未填寫';
    var c = decClass(r.decision);
    return '<tr><td>' + esc(r.cls) + '</td><td class="center">' + esc(r.seat) +
      '</td><td>' + esc(r.name || '') + '</td><td>' + esc(r.id) + '</td><td class="' + c + '">' + esc(dec) +
      (r.paper ? ' <span class="badge-paper">紙本</span>' : '') + '</td></tr>';
  }).join('');
}

if (!KEY.trim()){
  document.getElementById('summary').textContent = '存取被拒絕（缺少密鑰）。';
} else {
  refresh();
}