// 共用繪圖：把「同意書整頁」畫成一張 A4 JPEG，供兩處使用——
//   ① print.html「回填簽署書影像」批次補建舊線上紀錄（renderConsentImage）
//   ② 線上送出時，隨簽名一起把整頁圖送到後端存 JPG（app.js 送出前呼叫）
// 產出即 JPEG（A4@150dpi），直接存成總表 N 欄的「簽署書影像」；中文以圖片呈現，不需嵌入字型。
function wrapLines(g, text, maxW){
  var lines = [];
  var paras = String(text || '').split('\n');
  for (var p = 0; p < paras.length; p++){
    var seg = paras[p];
    if (!seg){ lines.push(''); continue; }
    var cur = '';
    for (var i = 0; i < seg.length; i++){
      var c = seg.charAt(i);
      if (g.measureText(cur + c).width > maxW && cur){ lines.push(cur); cur = c; }
      else cur += c;
    }
    lines.push(cur);
  }
  return lines;
}

function renderConsentImage(o){
  o = o || {};
  return new Promise(function(resolve){
    var W = 1240, H = 1754, MX = 84;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111111'; g.textBaseline = 'top';

    g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
    g.fillText(String(o.school || '') + ' 學生肖像權使用同意書', W / 2, 64);

    g.font = '26px sans-serif'; g.textAlign = 'left';
    var info = '學號：' + String(o.sid || '') + '　　' +
               '學生姓名：' + String(o.name || '') + '　　' +
               '與學生關係：' + String(o.rel || '');
    g.fillText(info, MX, 132);

    var y = 216;
    var boxW = W - MX * 2;
    g.font = '23px sans-serif';
    var lines = wrapLines(g, String(o.consent || CONSENT_TEXT), boxW - 48);
    var lh = 36;
    var boxH = lines.length * lh + 44;
    g.strokeStyle = '#666666'; g.lineWidth = 2;
    g.strokeRect(MX, y, boxW, boxH);
    g.fillStyle = '#111111'; g.textAlign = 'left';
    for (var lx = 0; lx < lines.length; lx++)
      g.fillText(lines[lx], MX + 24, y + 24 + lx * lh);
    y += boxH + 40;

    g.font = '26px sans-serif';
    g.fillText('☑　本人已詳閱並了解上述同意書內容', MX, y);
    y += 56;

    var choice = String(o.decision || '');
    g.fillText('本人與學生選擇：', MX, y);
    var sel = (choice === '不同意') ? '不同意' : '同意';
    g.fillStyle = '#1a7f37'; g.font = 'bold 30px sans-serif';
    g.fillText((sel === '同意' ? '☑' : '□') + '　同意', MX, y + 30);
    g.fillText((sel === '不同意' ? '☑' : '□') + '　不同意', MX + 420, y + 30);
    g.fillStyle = '#111111'; g.font = '26px sans-serif';
    y += 118;

    var sigTop = y, sigH = 300;
    g.strokeStyle = '#999999'; g.lineWidth = 1;
    g.strokeRect(MX, sigTop, boxW, sigH);
    g.textAlign = 'left';
    g.fillText('簽署人姓名：' + String(o.signer || ''), MX + 24, sigTop + 24);
    g.textAlign = 'center';
    g.fillText('（親筆簽名）', W / 2, sigTop + 220);

    var sigB64 = String(o.sigB64 || '');
    var finish = function(img){
      if (img){
        var maxW = boxW - 100, maxH = 170;
        var r = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
        var dw = img.naturalWidth * r, dh = img.naturalHeight * r;
        g.drawImage(img, W / 2 - dw / 2, sigTop + 60 + (maxH - dh) / 2, dw, dh);
      }
      g.textAlign = 'left';
      g.font = '22px sans-serif';
      g.fillText('送出時間：' + String(o.timeText || ''), MX, H - 150);
      resolve({ dataUrl: cv.toDataURL('image/jpeg', 0.88), w: W, h: H });
    };
    if (!sigB64){ finish(null); return; }
    var im = new Image();
    im.onload = function(){ finish(im); };
    im.onerror = function(){ finish(null); };
    im.src = 'data:image/png;base64,' + sigB64;
  });
}