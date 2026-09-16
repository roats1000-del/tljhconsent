// 簽名頁邏輯（index.html）
document.getElementById('schoolName').textContent = APP.SCHOOL;

var cv = document.getElementById('sig');
var ctx = cv.getContext('2d');
var drawing = false, touched = false;

function fit(){
  cv.width = cv.clientWidth * 2;
  cv.height = 160 * 2;
  ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111';
}
fit();
window.addEventListener('resize', fit);

function pos(e){
  var r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * cv.width / r.width,
           y: (e.clientY - r.top) * cv.height / r.height };
}
cv.addEventListener('pointerdown', function(e){
  drawing = true; touched = true;
  ctx.beginPath(); ctx.moveTo(pos(e).x, pos(e).y);
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', function(e){
  if (!drawing) return;
  ctx.lineTo(pos(e).x, pos(e).y); ctx.stroke();
});
['pointerup','pointercancel'].forEach(function(ev){
  cv.addEventListener(ev, function(){ drawing = false; });
});
function clearSig(){ touched = false; ctx.clearRect(0,0,cv.width,cv.height); }

// 是否有實際筆跡：掃描畫布像素，任一像素不透明（alpha>0）即視為已簽名。
// 比「是否有碰過畫布」可靠：resize 會自動清空畫布、只點一下沒畫、clearSig 後，
// 這些情況畫布都是全透明，等同空白簽名，送出時一律擋下重新簽。
function hasInk(){
  var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  for (var i = 3; i < d.length; i += 4){
    if (d[i]) return true;
  }
  return false;
}

// QR 選用：網址帶 ?src=學號 時自動帶入學號並鎖定（姓名仍須手填，防學號枚舉洩漏）
(function(){
  var q = (new URLSearchParams(location.search)).get('src') || '';
  if (q){
    var el = document.getElementById('sid');
    el.value = q.trim();
    el.readOnly = true;
  }
})();

function beforeSubmit(ev){
  ev.preventDefault();
  var err = document.getElementById('err'); err.textContent = '';
  var sid    = document.getElementById('sid').value.trim();
  var name   = document.getElementById('name').value.trim();
  var rel    = document.getElementById('rel').value;
  var signer = document.getElementById('signer').value.trim();

  if (!sid){ err.textContent = '請輸入學生學號。'; return; }
  if (!name){ err.textContent = '請輸入學生姓名。'; return; }
  if (!rel){ err.textContent = '請選擇與學生關係。'; return; }
  if (!document.getElementById('read').checked){ err.textContent = '請先勾選「本人已詳閱並了解上述同意書內容」。'; return; }
  var v = document.querySelector('input[name=choice]:checked');
  if (!v){ err.textContent = '請選擇「同意」或「不同意」。'; return; }
  if (!signer){ err.textContent = '請輸入簽署人姓名。'; return; }
  if (!hasInk()){ err.textContent = '請在簽名框內親筆簽名。'; return; }

  var p = {
    sid:    sid,
    name:   name,
    rel:    rel,
    choice: v.value,
    signer: signer,
    sig:    cv.toDataURL('image/png'),
    hp:     document.getElementById('hp').value   // Honeypot：連同送出，後端偵測即丟棄
  };

  var btn = document.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = '送出中…';

  apiCall('submit', p).then(showResult).catch(function(e){
    showResult({ title: '系統錯誤', body: String((e && e.message) || e) });
  });
}

function showResult(r){
  r = r || {};
  // 若後端/代理只回了 {error}（沒有 title），一律視為系統錯誤，避免誤顯示「送出成功」
  if (r.error && !r.title) { r.title = '系統錯誤'; r.body = r.body || r.error; }
  document.getElementById('formWrap').style.display = 'none';
  var box = document.getElementById('result');
  box.style.display = 'block';
  box.scrollIntoView();
  var cls = /未自動生效|異常|系統|已截止|存取/.test(r.title || '') ? 'bad' : 'ok';
  var html = '<div class="' + cls + '">' + esc(r.title || '送出成功') + '</div>' +
             '<div class="msg">' + esc(r.body || '').replace(/\n/g,'<br>') + '</div>';
  // 送出成功＝正式回條，不再返回；其餘保留「返回重新填寫」
  if ((r.title || '') !== '送出成功')
    html += '<button type="button" class="btn" onclick="goBack()">← 返回重新填寫</button>';
  box.innerHTML = html;
}
function goBack(){
  document.getElementById('result').style.display = 'none';
  document.getElementById('formWrap').style.display = '';
  var btn = document.querySelector('button[type=submit]');
  btn.disabled = false; btn.textContent = '送出';
  window.scrollTo(0,0);
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }