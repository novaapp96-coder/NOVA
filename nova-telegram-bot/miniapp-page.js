/**
 * NOVA — Mini App page (Phase 9 v1)
 * A single self-contained HTML page (RTL, no build step, no dependencies)
 * served by miniapp.js. Cart actions call the bot's own JSON API; checkout is
 * handed off to the chat via Telegram.WebApp.sendData — the server-side flow
 * stays the single source of truth for order creation.
 * NOTE: the inline JS deliberately avoids backticks/template literals so this
 * file can be one safe template string.
 */

const PAGE = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>NOVA — متجر</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Tahoma, sans-serif; background: #FAF7FF; color: #241C3B; }
  header { position: sticky; top: 0; z-index: 5; background: #7C5CFC; color: #fff; padding: 12px 14px;
           display: flex; align-items: center; justify-content: space-between; }
  header b { font-size: 17px; }
  .badge { background: #fff; color: #7C5CFC; border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 13px; }
  .wrap { padding: 12px; }
  .search { width: 100%; padding: 10px 12px; border: 1px solid #EDE7F8; border-radius: 12px; background: #fff;
            font-size: 14px; margin-bottom: 10px; }
  .chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; }
  .chip { white-space: nowrap; background: #fff; border: 1px solid #EDE7F8; border-radius: 999px;
          padding: 7px 12px; font-size: 13px; cursor: pointer; }
  .chip.on { background: #7C5CFC; color: #fff; border-color: #7C5CFC; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .card { background: #fff; border: 1px solid #EDE7F8; border-radius: 14px; padding: 10px; display: flex;
          flex-direction: column; gap: 6px; }
  .card img { width: 100%; height: 110px; object-fit: cover; border-radius: 10px; background: #F4EFFF; }
  .name { font-size: 13.5px; font-weight: 700; line-height: 1.3; }
  .price { font-size: 13px; color: #7C5CFC; font-weight: 800; }
  .old { color: #999; text-decoration: line-through; font-size: 11.5px; }
  .add { margin-top: auto; background: #7C5CFC; color: #fff; border: 0; border-radius: 10px; padding: 8px;
         font-size: 13px; font-weight: 700; cursor: pointer; }
  .cart { position: fixed; bottom: 0; right: 0; left: 0; background: #fff; border-top: 1px solid #EDE7F8;
          padding: 10px 12px; display: none; max-height: 46vh; overflow-y: auto; }
  .line { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0;
          border-bottom: 1px dashed #EDE7F8; font-size: 13px; }
  .qty { display: flex; gap: 6px; align-items: center; }
  .qty button { width: 26px; height: 26px; border-radius: 8px; border: 1px solid #EDE7F8; background: #fff;
                font-size: 14px; cursor: pointer; }
  .total { display: flex; justify-content: space-between; font-weight: 800; padding-top: 8px; }
  .checkout { width: 100%; margin-top: 8px; background: #1FA971; color: #fff; border: 0; border-radius: 12px;
              padding: 11px; font-size: 15px; font-weight: 800; cursor: pointer; }
  .note { text-align: center; font-size: 12px; color: #7A7290; padding: 10px 0 70px; }
</style>
</head>
<body>
<header><b>🛍️ NOVA</b><span class="badge" id="cartCount">0</span></header>
<div class="wrap">
  <input id="q" class="search" placeholder="🔎 ابحث عن منتج…" />
  <div class="chips" id="chips"></div>
  <div class="grid" id="products"></div>
  <div class="note" id="note">الدفع عند الاستلام • التوصيل 500 دج</div>
</div>
<div class="cart" id="cart">
  <div id="cartLines"></div>
  <div class="total"><span>الإجمالي</span><span id="cartTotal">0 دج</span></div>
  <button class="checkout" onclick="checkout()">✅ إتمام الطلب في المحادثة</button>
</div>
<script>
  var initData = '';
  var state = { cats: [], products: [], cart: null, catId: null, query: '' };
  function tg() { return window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null; }
  function authHeaders() { return initData ? { 'X-Telegram-Init-Data': initData } : {}; }
  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  function money(n) { return String(Math.round(Number(n) || 0)) + ' دج'; }
  async function api(path, opts) { var r = await fetch(path, opts); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }
  async function loadCatalog() {
    var q = state.query ? ('?q=' + encodeURIComponent(state.query)) : (state.catId ? ('?category_id=' + encodeURIComponent(state.catId)) : '');
    var d = await api('/api/miniapp/catalog' + q);
    state.cats = d.categories || [];
    state.products = d.products || [];
    renderChips(); renderProducts();
  }
  function renderChips() {
    var el = document.getElementById('chips');
    var h = '<div class="chip' + (state.catId ? '' : ' on') + '" onclick="pickCat(null)">الكل</div>';
    for (var i = 0; i < state.cats.length; i++) {
      var c = state.cats[i];
      var on = state.catId === c.id ? ' on' : '';
      h += '<div class="chip' + on + '" onclick="pickCat(\'' + c.id + '\')">' + esc(c.emoji || '') + ' ' + esc(c.name) + '</div>';
    }
    el.innerHTML = h;
  }
  function pickCat(id) { state.catId = id; loadCatalog(); }
  function renderProducts() {
    var el = document.getElementById('products');
    if (!state.products.length) { el.innerHTML = '<div class="note">لا توجد منتجات مطابقة.</div>'; return; }
    var h = '';
    for (var i = 0; i < state.products.length; i++) {
      var p = state.products[i];
      var img = (p.images && p.images.length) ? esc(p.images[0]) : '';
      var price = '<span class="price">' + money(p.price) + '</span>';
      if (p.old_price) price += ' <span class="old">' + money(p.old_price) + '</span>';
      var stock = (Number(p.stock) || 0) > 0 ? '' : '<div style="font-size:11.5px;color:#E2446B">نفد المخزون</div>';
      h += '<div class="card">' +
           (img ? '<img src="' + img + '" alt="" />' : '<img alt="" />') +
           '<div class="name">' + esc(p.name) + '</div>' +
           '<div>' + price + '</div>' + stock +
           '<button class="add" onclick="addCart(\'' + p.id + '\')">🛒 أضف للسلة</button>' +
           '</div>';
    }
    el.innerHTML = h;
  }
  async function loadCart() {
    if (!initData) { renderCart(); return; }
    try { state.cart = await api('/api/miniapp/cart', { headers: authHeaders() }); }
    catch (e) { state.cart = null; }
    renderCart();
  }
  function renderCart() {
    var panel = document.getElementById('cart');
    var c = state.cart;
    var n = c ? (c.count || 0) : 0;
    document.getElementById('cartCount').textContent = String(n);
    if (!c || !c.items || !c.items.length) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    var h = '';
    for (var i = 0; i < c.items.length; i++) {
      var l = c.items[i];
      h += '<div class="line"><span>' + esc(l.name) + '</span>' +
           '<span class="qty">' +
           '<button onclick="changeQty(\'' + l.item_id + '\',' + (l.quantity - 1) + ')">−</button>' +
           '<b>' + l.quantity + '</b>' +
           '<button onclick="changeQty(\'' + l.item_id + '\',' + (l.quantity + 1) + ')">+</button>' +
           '<button onclick="changeQty(\'' + l.item_id + '\',0)">🗑️</button>' +
           '</span><b>' + money(l.price * l.quantity) + '</b></div>';
    }
    h += '<div class="total"><span>الإجمالي</span><span>' + money(c.subtotal) + '</span></div>';
    h += '<div style="text-align:center;font-size:11.5px;color:#7A7290">' +
         '<span onclick="clearAll()" style="cursor:pointer">🧹 مسح السلة</span></div>';
    document.getElementById('cartLines').innerHTML = h;
    document.getElementById('cartTotal').textContent = money(c.subtotal) + ' (+' + String(Math.round(Number(c.delivery_fee) || 500)) + ' توصيل)';
  }
  async function addCart(pid) {
    if (!initData) { alert('افتح المتجر من داخل تيليجرام لاستخدام السلة'); return; }
    try {
      var r = await api('/api/miniapp/cart', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'add', product_id: pid, quantity: 1 }) });
      if (r && r.ok === false && r.reason === 'exceeds_stock') alert('الكمية المتوفرة حالياً هي ' + r.available + ' فقط.');
      await loadCart();
    } catch (e) { alert('تعذر الإضافة، حاول مجدداً'); }
  }
  async function changeQty(itemId, qty) {
    if (!initData) return;
    try { await api('/api/miniapp/cart', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'update', item_id: itemId, quantity: qty }) }); await loadCart(); }
    catch (e) {}
  }
  async function clearAll() {
    if (!initData) return;
    try { await api('/api/miniapp/cart', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'clear' }) }); await loadCart(); }
    catch (e) {}
  }
  function checkout() {
    var t = tg();
    if (!t || !t.sendData) { alert('افتح المتجر من داخل تيليجرام لإتمام الطلب'); return; }
    try { t.sendData('checkout'); } catch (e) { alert('تعذر إرسال الطلب'); }
  }
  (function init() {
    var t = tg();
    if (t) { try { t.ready(); t.expand(); } catch (e) {} initData = t.initData || ''; }
    loadCatalog(); loadCart();
    var timer = null;
    document.getElementById('q').addEventListener('input', function (e) {
      state.query = e.target.value.trim();
      clearTimeout(timer);
      timer = setTimeout(loadCatalog, 400);
    });
  })();
</script>
</body>
</html>`;

module.exports = { PAGE };
