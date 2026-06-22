
/* ============================================================
 * Priao VIP Catalog — Main App
 * IIFE-wrapped for encapsulation (Group K — Module G post-Pattern A)
 * Public API: window.AppAPI + explicit window.* exports at bottom
 * ============================================================ */
(function(){
'use strict';
let RAW_DATA = {}; // populated by loadCatalogData() before init() runs
// === Suggested Retail Price Overlay (data/suggested_retail.json) ===
// Source: ERP ISCode → Price_Prod.Shop (ราคาแนะนำขายต่อให้ผู้บริโภคปลายทาง)
// Loaded separately from main JSON, merged into product.suggestedRetail after init
let SUGGESTED_RETAIL_MAP = {}; // { barcode: price } — populated by loadSuggestedRetail()
// === FGStore Stock Overlay (data/stock_fg.json) ===
// Source: ERP priao_stock_level_quicksight where store='FGStore'
// = "คงเหลือ(FG-Store)" column in ERP "ProductStock & Price" report
let STOCK_FG_MAP = {}; // { barcode: qty_onstock } — populated by loadCatalogData()

// ============================================================
// 📚 window.* — Shared Cross-File State + Public API
// ============================================================
// **State flags (cross-frame):**
//   window.__catalogModeObserverInstalled — guard ป้องกัน observer ติดตั้งซ้ำ
//   window._sendingInProgress             — lock ป้องกัน sendOrder ซ้ำ (race condition guard)
//
// **Order backup chain (5-layer):**
//   window._lastOrderText  — full order text (clipboard restore)
//   window._lastOrderInfo  — order metadata {orderId, total, itemCount, ...}
//
// **Debug + error tracking:**
//   window.__lastErrors    — capped array of last N errors (cap = ERROR_LOG_CAP = 50)
//
// **Public function exports (called from HTML onclick / external scripts):**
//   window._applyHashRoute — URL hash router (called on hashchange)
//   window._updateHash     — push current state to URL hash
//   ...(see "window.* = ..." exports at bottom of file)
//
// **Rules:**
//   1. ห้าม assign window.* แบบไม่ผ่าน mediator function (state mutation invisible)
//   2. Private state ใช้ prefix `_` (single underscore) สำหรับ shared, `__` สำหรับ true private
//   3. ทุก array-typed state ต้องมี cap (กัน memory leak)
// ============================================================


// ============================================================
// SECTION: ICON & COLOR CONFIGURATION
// ============================================================
// 📌 อยากเปลี่ยน icon ในหมวด/สี? แก้ตรงนี้ที่เดียว!
//   1. ICON_COLORS    — color tokens (ใช้ใน CSS + class variant)
//   2. SVG_STORAGE    — refs to !@Don't Push/Storage_SVG/*.svg (minified)
//   3. FILTER_CONFIG  — Hot/New/Promo/All/Home
//   4. CATEGORY_CONFIG — C01-C09 (single source of truth)
//   5. Backward-compat shortcuts (CAT_NAMES/EMOJI/SVG/FILTER_SVG)
//   6. Helper functions
//
// ★ เพิ่ม icon ใหม่:
//   1. วาง .svg ใน Storage_SVG/
//   2. เพิ่ม entry ใน SVG_STORAGE ด้านล่าง
//   3. ใส่ใน FILTER_CONFIG หรือ CATEGORY_CONFIG ตามต้องการ
// ============================================================

// ── 1. Color tokens ──
const ICON_COLORS = {
  primary: '#25a9e0',   // Priao Blue (default)
  hot:     '#ef4444',   // ขายดี — red
  new:     '#a855f7',   // ใหม่ — purple
  promo:   '#f59e0b',   // โปรโมชั่น — amber
  active:  '#ffffff'    // active state — white
};

// ── 2. SVG Storage references (minified from Storage_SVG/*.svg) ──
const SVG_STORAGE = {
  home:             '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/></svg>',
  flame:            '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"/></svg>',
  sparkles:         '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"/></svg>',
  tag:              '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.859 6h-2.834a2.025 2.025 0 0 0 -2.025 2.025v2.834c0 .537 .213 1.052 .593 1.432l6.116 6.116a2.025 2.025 0 0 0 2.864 0l2.834 -2.834a2.025 2.025 0 0 0 0 -2.864l-6.117 -6.116a2.025 2.025 0 0 0 -1.431 -.593z"/><path d="M17.5 4.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/></svg>',
  table_properties: '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M21 9H3"/><path d="M21 15H3"/></svg>',
  palette:          '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/></svg>',
  mood_smile_beam:  '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 0 -18a9 9 0 0 1 0 18"/><path d="M10 10c-.5 -1 -2.5 -1 -3 0"/><path d="M17 10c-.5 -1 -2.5 -1 -3 0"/><path d="M14.5 15a3.5 3.5 0 0 1 -5 0"/></svg>',
  man:              '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15 8c1.628 0 3.2 .787 4.707 2.293a1 1 0 0 1 -1.414 1.414c-.848 -.848 -1.662 -1.369 -2.444 -1.587l-.849 5.944v4.936a1 1 0 0 1 -2 0v-4h-2v4a1 1 0 0 1 -2 0v-4.929l-.85 -5.951c-.781 .218 -1.595 .739 -2.443 1.587a1 1 0 1 1 -1.414 -1.414c1.506 -1.506 3.08 -2.293 4.707 -2.293z"/><path d="M12 1a3 3 0 1 1 -3 3l.005 -.176a3 3 0 0 1 2.995 -2.824"/></svg>',
  woman:            '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16v5"/><path d="M14 16v5"/><path d="M8 16h8l-2 -7h-4l-2 7"/><path d="M5 11c1.667 -1.333 3.333 -2 5 -2"/><path d="M19 11c-1.667 -1.333 -3.333 -2 -5 -2"/><path d="M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/></svg>',
  spray:            '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2l0 -7"/><path d="M6 10v-4a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4"/><path d="M15 7h.01"/><path d="M18 9h.01"/><path d="M18 5h.01"/><path d="M21 3h.01"/><path d="M21 7h.01"/><path d="M21 11h.01"/><path d="M10 7h1"/></svg>',
  scissors:         '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M3 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M8.6 8.6l10.4 10.4"/><path d="M8.6 15.4l10.4 -10.4"/></svg>',
  pill:             '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l8 -8a4.94 4.94 0 0 1 7 7l-8 8a4.94 4.94 0 0 1 -7 -7"/><path d="M8.5 8.5l7 7"/></svg>',
  paper_bag:        '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v1.82a5 5 0 0 0 .528 2.236l.944 1.888a5 5 0 0 1 .528 2.236v5.82a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-5.82a5 5 0 0 1 .528 -2.236l1.472 -2.944v-3a2 2 0 0 1 2 -2"/><path d="M12 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M6 21a2 2 0 0 0 2 -2v-5.82a5 5 0 0 0 -.528 -2.236l-1.472 -2.944"/><path d="M11 7h2"/></svg>',
  shirt:            '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l6 2v5h-3v8a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-8h-3v-5l6 -2a3 3 0 0 0 6 0"/></svg>',
  menu:             '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></svg>',
  search:           '<svg class="cat-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/></svg>'
};

// ── 3. Filter config (Hot/New/Promo/All/Home) ──
const FILTER_CONFIG = {
  home:  { svg: SVG_STORAGE.home,             color: ICON_COLORS.primary },
  hot:   { svg: SVG_STORAGE.flame,            color: ICON_COLORS.hot     },
  new:   { svg: SVG_STORAGE.sparkles,         color: ICON_COLORS.new     },
  promo: { svg: SVG_STORAGE.tag,              color: ICON_COLORS.promo   },
  all:    { svg: SVG_STORAGE.table_properties, color: ICON_COLORS.primary },
  search: { svg: SVG_STORAGE.search,           color: ICON_COLORS.primary },
  brand:  { svg: SVG_STORAGE.tag,              color: ICON_COLORS.primary }
};

// ── 4. Category config (C01-C09 single source of truth) ──
const CATEGORY_CONFIG = {
  C01: { name: 'เครื่องสำอาง',           emoji: '💄', svg: SVG_STORAGE.palette,         color: ICON_COLORS.primary },
  C02: { name: 'ผลิตภัณฑ์ดูแลผิวหน้า',    emoji: '🧴', svg: SVG_STORAGE.mood_smile_beam, color: ICON_COLORS.primary },
  C03: { name: 'ผลิตภัณฑ์ดูแลผิวกาย',     emoji: '🛁', svg: SVG_STORAGE.man,             color: ICON_COLORS.primary },
  C04: { name: 'ผลิตภัณฑ์ดูแลเส้นผม',     emoji: '💆', svg: SVG_STORAGE.woman,           color: ICON_COLORS.primary },
  C05: { name: 'น้ำหอม',                emoji: '🌸', svg: SVG_STORAGE.spray,           color: ICON_COLORS.primary },
  C06: { name: 'อุปกรณ์เพื่อความงาม',     emoji: '🛍️', svg: SVG_STORAGE.scissors,        color: ICON_COLORS.primary },
  C07: { name: 'อาหารเสริม',            emoji: '💊', svg: SVG_STORAGE.pill,            color: ICON_COLORS.primary },
  C08: { name: 'คอนซูเมอร์',            emoji: '🛒', svg: SVG_STORAGE.paper_bag,       color: ICON_COLORS.primary },
  C09: { name: 'แฟชั่น&ไลฟ์สไตล์',       emoji: '👜', svg: SVG_STORAGE.shirt,           color: ICON_COLORS.primary }
};

// ── 5. Backward-compat shortcuts (อย่าลบ — ใช้ใน code เดิม) ──
const CAT_NAMES = Object.fromEntries(Object.entries(CATEGORY_CONFIG).map(function(e){return [e[0], e[1].name];}));
const CAT_EMOJI = Object.fromEntries(Object.entries(CATEGORY_CONFIG).map(function(e){return [e[0], e[1].emoji];}));
const CAT_SVG   = Object.fromEntries(Object.entries(CATEGORY_CONFIG).map(function(e){return [e[0], e[1].svg];}));
const FILTER_SVG = Object.fromEntries(Object.entries(FILTER_CONFIG).map(function(e){return [e[0], e[1].svg];}));

// ── 6. Helper functions ──
// ============================================================
// END ICON & COLOR CONFIGURATION
// ============================================================

const PER_PAGE=40;
const CART_LS_KEY='priao_cart_v1';
const CART_LS_TTL_MS=24*60*60*1000; // 24 ชม. — ตะกร้าเก่ากว่านี้จะถือว่าหมดอายุ
const VIP_LS_KEY='priao_vip_member'; // localStorage key สำหรับ VIP member name (Group E SoT)
let allProducts=[],filtered=[],cart=[];

// ============================================================
// Cart Persistence (localStorage)
// แก้ปัญหา: ลูกค้าสลับ LINE chat กลับมา cart หายเป็น 0
// ============================================================
/**
 * Get the effective unit price for a cart item, considering promo + threshold.
 *
 * @param {Object} cartItem - cart entry {code, name, price, qty, ...}
 * @returns {number} - actual price per unit user pays
 *
 * Rules:
 *   - Flash promo (min=1): ALWAYS use promoPrice (any qty)
 *   - Step price (min=6): use promoPrice IFF cart qty >= minQty (else stdPrice)
 *   - No promo: use stored c.price (= stdPrice)
 */
function effectiveUnitPrice(cartItem){
  if(!cartItem) return 0;
  const prod = (typeof allProducts !== 'undefined')
    ? allProducts.find(function(p){ return p.code === cartItem.code; })
    : null;
  if(!prod || !prod.promoType || !prod.promoPrice) return cartItem.price;
  const minQty = prod.promoMinQty || 0;
  // Flash (min=1) or qty meets threshold → use promoPrice
  if(minQty > 0 && cartItem.qty >= minQty) return prod.promoPrice;
  return cartItem.price;
}

/** Effective subtotal for cart item (qty × effective unit price) */
function effectiveSubtotal(cartItem){
  return (cartItem.qty || 0) * effectiveUnitPrice(cartItem);
}

function saveCart(){
  try{
    const payload={ts:Date.now(),items:cart};
    localStorage.setItem(CART_LS_KEY,JSON.stringify(payload));
  }catch(e){
    // localStorage full หรือ disabled → silent fail (ไม่ break workflow)
    console.warn('[saveCart] failed:',e);
  }
}
function loadCart(){
  try{
    const raw=localStorage.getItem(CART_LS_KEY);
    if(!raw)return [];
    const payload=JSON.parse(raw);
    // ตรวจ format + อายุ
    if(!payload||!Array.isArray(payload.items))return [];
    if(Date.now()-(payload.ts||0)>CART_LS_TTL_MS){
      localStorage.removeItem(CART_LS_KEY); // expire เก่าแล้ว
      return [];
    }
    return payload.items;
  }catch(e){
    console.warn('[loadCart] failed:',e);
    return [];
  }
}
function clearCartStorage(){
  try{ localStorage.removeItem(CART_LS_KEY); }catch(e){}
}
let curCat='all',curSub='all',curTag='all',curPromoType='all';
let curSearch='',curPage=1,viewMode='grid';
let subcatMap={},navHistory=[];

const BRAND_LOGOS = {
  "BHAESAJ เภสัช": "assets/brands/BHAESAJ.png",
  "CERAVE เซราวี": "assets/brands/CERAVE.png",
  "CLEARNOSE เคลียร์โนส": "assets/brands/CLEARNOSE.png",
  "JANUA แจนยัวร์": "assets/brands/JANUA.png",
  "OLAY โอเลย์": "assets/brands/OLAY.png",
  "RATCHA รัชชา": "assets/brands/RATCHA.png",
  "REXONA เรโซนา": "assets/brands/REXONA.png",
  "SMOOTHE สมูทอี": "assets/brands/SMOOTHE.png",
  "TAOYEABLOK เต่าเหยียบโลก": "assets/brands/TAOYEABLOK.png",
  "THECHARMINGGARDEN เดอะชาร์มมิ่งการ์เด้น": "assets/brands/THECHARMINGGARDEN.png"
};

function brandColor(name){
  const colors=['#2080be','#e05c8a','#5c8ae0','#e08020','#20a860',
    '#9b59b6','#e74c3c','#16a085','#d35400','#2c3e50'];
  let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))%colors.length;
  return colors[Math.abs(h)];
}
function brandInitials(name){
  const en=name.match(/^[A-Z0-9&]+/);
  return en?en[0].substring(0,2):name.substring(0,2).toUpperCase();
}
function goTag(tag){
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value='';
  const backBtnBar=document.getElementById('backBtnBar');
  if(backBtnBar){if(navHistory.length>0)backBtnBar.classList.add('show');else backBtnBar.classList.remove('show');}
  const tagLabels = {Hot:'สินค้าขายดี', New:'สินค้าใหม่', Promo:'สินค้าโปรโมชั่น'};
  const tagIcons = {Hot:FILTER_SVG.hot, New:FILTER_SVG.new, Promo:FILTER_SVG.promo};
  const tagLabel = tagLabels[tag] || tag;
  updateActiveCatBar('all', tagLabel, tagIcons[tag] || '');
  setNavState({cat:'all', sub:'all', tag:tag, search:'', page:1});
}

function init(){
  const sub=document.getElementById('loadingSub');
  if(sub)sub.textContent='กำลัง parse ข้อมูล '+Object.values(RAW_DATA).reduce((s,v)=>s+v.length,0).toLocaleString('th-TH')+' รายการ...';
  const products=[];const smap={};
  for(const [cat,arr] of Object.entries(RAW_DATA)){
    smap[cat]=new Set();
    for(const raw of arr){
      if(!raw[0])continue;
      if(!raw[4]||raw[4]<=0)continue;
      // Promo fields (cols 11-14 — optional, only when raw.length > 11)
      // NEW SCHEMA 2026-06-19:
      //   raw[11] = promo_type: "step_price" | "flash" | ""
      //   raw[12] = promo_label: trimmed ribbon text
      //   raw[13] = promo_price: ราคาพิเศษเมื่อเข้าเงื่อนไข
      //   raw[14] = promo_min_qty: 6 (step_price) | 1 (flash)
      const promoTypeRaw = String(raw[11] || '').toLowerCase().trim().replace(/\s+/g,'_');
      const promoType = ['step_price','flash'].indexOf(promoTypeRaw) >= 0 ? promoTypeRaw : '';
      const _barcode = String(raw[0]);
      // If ERP overlay has stock=0 → mark as OOS regardless of Excel tag
      const _erpStock = STOCK_FG_MAP[_barcode];
      const _hasErpStock = (_erpStock !== undefined);
      const _isOOS = _hasErpStock ? (Number(_erpStock) <= 0) : false;
      const _excelTag = raw[3] || '';
      const _finalTag = _isOOS ? 'สินค้าหมดชั่วคราว' : _excelTag;
      const p={
        code:_barcode,name:raw[1]||'',
        cat:cat+' '+(CAT_NAMES[cat]||''),catId:cat,
        subCat:raw[2]||'',status:'',tag:_finalTag,
        stdPrice:Number(raw[4])||0,retailPrice:0,
        packQty:Number(raw[8])||1,baseUnit:raw[9]||'',
        stock:(STOCK_FG_MAP[_barcode] !== undefined ? Number(STOCK_FG_MAP[_barcode]) : Number(raw[5]))||0,imageUrl:raw[6]||'',
        brand:raw[7]||'',excelOrder:Number(raw[10])||0,
        // promo (cols 11-14) — empty/0 when no promo
        promoType: promoType,
        promoLabel: String(raw[12] || '').trim(),
        promoPrice: Number(raw[13]) || 0,
        promoMinQty: Number(raw[14]) || 0,
        // suggested retail (overlay from ERP Price_Prod.Shop)
        suggestedRetail: Number(SUGGESTED_RETAIL_MAP[_barcode]) || 0,
      };
      products.push(p);
      if(p.subCat)smap[cat].add(p.subCat);
    }
  }
  allProducts=products;
  for(const k of Object.keys(smap))
    subcatMap[k]=[...smap[k]].sort((a,b)=>a.localeCompare(b,'th'));

  // Restore cart จาก localStorage — กรอง item ที่ไม่อยู่ใน catalog แล้ว
  const savedCart=loadCart();
  if(savedCart.length>0){
    const validCodes=new Set(allProducts.map(p=>p.code));
    cart=savedCart.filter(c=>c&&c.code&&validCodes.has(c.code));
    const dropped=savedCart.length-cart.length;
    if(dropped>0)console.log('[cart restore] drop '+dropped+' item(s) ที่ไม่มีใน catalog แล้ว');
    if(cart.length>0)console.log('[cart restore] โหลด '+cart.length+' รายการกลับมา');
    // resync ปุ่ม "ใส่ตะกร้า" ของรายการที่อยู่ใน cart — เรียก renderCart() จะ update
  }

  buildSidebar();buildMobCats();applyFilter();updateQtabCounts();
  if(cart.length>0)renderCart(); // re-render cart sidebar ให้แสดงของที่ restore

  // VIP input init → ย้ายไป js/bottom-nav.js (auto-init on DOMContentLoaded)

  // LINE FAB → เปิด Mini Modal ของเรา (QR + Browser link + Copy)
  const lineFabEl = document.getElementById('lineFab');
  if(lineFabEl){
    lineFabEl.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      openLineModal();
    });
  }
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('home').style.display='';
  // Restore state from URL hash (F5/direct link support)
  _applyHashRoute();
  // Listen for browser back/forward navigation
  window.addEventListener('hashchange', _applyHashRoute);
  // Initialize bottom tab state (Mobile/Tablet)
  if(typeof updateBottomTabActive === 'function') updateBottomTabActive();
  if(typeof updateBottomTabCartBadge === 'function') updateBottomTabCartBadge();
  // Initial indicator position (after layout)
  if(typeof updateIndicatorPosition === 'function'){
    setTimeout(updateIndicatorPosition, 100);
  }
}

function updateActiveCatBar(catId,label,icon){
  // icon = SVG string (preferred) or emoji string (legacy fallback)
  const bar=document.getElementById('activeCatBar');
  const lbl=document.getElementById('activeCatLabel');
  const ico=document.getElementById('activeCatIcon');
  if(!bar)return;
  if(catId&&catId!=='all'){
    if(ico){
      if(icon && icon.indexOf('<svg') >= 0){
        ico.innerHTML = '<span class="active-cat-icon">'+icon+'</span>';
      } else {
        ico.textContent = (icon ? icon + ' ' : '');
      }
    }
    if(lbl)lbl.textContent='กำลังดู: '+label;
    bar.classList.add('show');
  } else {bar.classList.remove('show');}
}
// === URL Hash Routing ===
function _updateHash(){
  const params = [];
  if(curCat && curCat !== 'all') params.push('cat=' + encodeURIComponent(curCat));
  if(curSub && curSub !== 'all') params.push('sub=' + encodeURIComponent(curSub));
  if(curTag && curTag !== 'all') params.push('tag=' + encodeURIComponent(curTag));
  if(curSearch) params.push('search=' + encodeURIComponent(curSearch));
  if(curPage > 1) params.push('page=' + curPage);
  const hashStr = params.join('&');
  const newUrl = hashStr ? '#' + hashStr : (window.location.pathname + window.location.search);
  try{ history.replaceState(null, '', newUrl); }catch(e){}
}
function _readHash(){
  const hash = (window.location.hash || '').replace(/^#/, '');
  if(!hash) return null;
  const st = { cat:'all', sub:'all', tag:'all', search:'', page:1 };
  hash.split('&').forEach(function(p){
    const eq = p.indexOf('=');
    if(eq < 0) return;
    const k = p.substring(0, eq);
    const v = decodeURIComponent(p.substring(eq + 1).replace(/\+/g, ' '));
    if(k === 'cat') st.cat = v;
    else if(k === 'sub') st.sub = v;
    else if(k === 'tag') st.tag = v;
    else if(k === 'search') st.search = v;
    else if(k === 'page') st.page = parseInt(v) || 1;
  });
  // Empty state = home
  if(st.cat === 'all' && st.tag === 'all' && !st.search) return null;
  return st;
}
function _applyHashRoute(){
  const st = _readHash();
  if(!st){
    // No hash → ensure home view
    const homeEl = document.getElementById('home');
    const catEl = document.getElementById('catalog');
    if(homeEl && homeEl.style.display === 'none'){
      navHistory = [];
      const hb = document.getElementById('backBtnBar'); if(hb) hb.classList.remove('show');
      updateActiveCatBar('all', '', '');
      if(catEl) catEl.style.display = 'none';
      homeEl.style.display = '';
      window.scrollTo(0, 0);
    }
    return;
  }
  // Has hash → switch to catalog view + apply state
  document.getElementById('home').style.display = 'none';
  document.getElementById('catalog').style.display = '';
  curCat = st.cat; curSub = st.sub; curTag = st.tag; curSearch = st.search; curPage = st.page;
  const si = document.getElementById('catSearch'); if(si) si.value = st.search;
  applyFilter();
  if(typeof updateSidebarActive === 'function') updateSidebarActive();
  if(typeof updateMobActive === 'function') updateMobActive();
  const backBtnBar = document.getElementById('backBtnBar');
  if(backBtnBar) backBtnBar.classList.add('show');
  if(st.cat !== 'all'){
    updateActiveCatBar(st.cat, CAT_NAMES[st.cat] || '', CAT_SVG[st.cat] || '');
  } else if(st.tag !== 'all'){
    const label = st.tag === 'Hot' ? 'สินค้าขายดี' : (st.tag === 'New' ? 'สินค้าใหม่' : st.tag);
    updateActiveCatBar('filter', label, '');
  } else if(st.search){
    updateActiveCatBar('search', 'ค้นหา: ' + st.search, FILTER_SVG.search);
  }
  _scrollTop(); // F5 → start from top of new page
}
window._updateHash = _updateHash;
window._applyHashRoute = _applyHashRoute;

// === Scroll Helper (Linked Logic Group D — Navigation) ===
// ทุก navigation function ที่เปลี่ยนหมวด/แท็ก/ค้นหา ต้องเรียก _scrollTop() ที่ท้าย
// ยกเว้น: goBack (restore scrollY จาก history), goHome (มี window.scrollTo เอง)
// _closeCartPanel / _closeAccountModal / _clearTabOverride → ย้ายไป js/bottom-nav.js
/**
 * Centralized nav state mutation — enforces Group D contract.
 * Sets state vars + runs standard update chain (applyFilter → updateSidebar 
 * → updateMob → _scrollTop → _updateHash).
 * @param {Object} updates  - { cat?, sub?, tag?, search?, page? }
 * @param {Object} [options] - { skipFilter?, skipScroll?, skipHash? }
 */
function setNavState(updates, options){
  updates = updates || {};
  options = options || {};
  if(updates.cat       !== undefined) curCat       = updates.cat;
  if(updates.sub       !== undefined) curSub       = updates.sub;
  if(updates.tag       !== undefined){
    curTag = updates.tag;
    // Auto-reset promoType เมื่อออกจาก Promo (เว้นแต่มีการตั้ง promoType ใหม่พร้อมกัน)
    if(updates.tag !== 'Promo' && updates.promoType === undefined){
      curPromoType = 'all';
    } else if(updates.tag === 'Promo' && updates.promoType === undefined){
      curPromoType = 'all'; // คลิก "โปรโมชั่น" จากภายนอก → reset เป็น "ทั้งหมด"
    }
  }
  if(updates.promoType !== undefined) curPromoType = updates.promoType;
  if(updates.search    !== undefined) curSearch    = updates.search;
  if(updates.page      !== undefined) curPage      = updates.page;
  if(!options.skipFilter) applyFilter();
  if(typeof updateSidebarActive === 'function') updateSidebarActive();
  if(typeof updateMobActive     === 'function') updateMobActive();
  if(!options.skipScroll) _scrollTop();
  if(!options.skipHash)   _updateHash();

  _emit('nav-change', { cat: curCat, sub: curSub, tag: curTag, search: curSearch, page: curPage });
}

function _scrollTop(){
  const mc = document.getElementById('mainContent');
  if(mc) mc.scrollTop = 0;
  try{ window.scrollTo(0, 0); }catch(e){}
}

function _pushHistory(){
  // ใช้ mainContent.scrollTop เป็นหลัก (body locked อยู่ภายใต้ catalog-mode)
  const mc = document.getElementById('mainContent');
  const scrollY = mc ? mc.scrollTop : (window.scrollY || window.pageYOffset || 0);
  navHistory.push({cat:curCat,sub:curSub,tag:curTag,search:curSearch,page:curPage,scrollY:scrollY});
}
function goBack(){
  if(!navHistory.length){goHome();return;}
  const p=navHistory.pop();
  curCat=p.cat;curSub=p.sub;curTag=p.tag;curSearch=p.search;curPage=p.page;
  _updateHash();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value=curSearch;
  applyFilter();updateSidebarActive();updateMobActive();
  const backBtnBar=document.getElementById('backBtnBar');
  if(backBtnBar){if(navHistory.length>0)backBtnBar.classList.add('show');else backBtnBar.classList.remove('show');}
  updateActiveCatBar(curCat,CAT_NAMES[curCat]||curSearch,CAT_SVG[curCat]||FILTER_SVG.brand);
  const _sy=p.scrollY||0;
  setTimeout(function(){
    // ใช้ mainContent.scrollTop (body locked ใน catalog-mode)
    const mc=document.getElementById('mainContent');
    if(mc) mc.scrollTop=_sy;
    else try{ window.scrollTo({top:_sy,behavior:'instant'}); }catch(e){}
  }, 80);
}
function goHome(){
  navHistory=[];
  // Clear any modal/panel override first (cart, account)
  if(typeof _clearTabOverride === 'function') _clearTabOverride();
  // Reset filter state (so trend/products doesn't think we're filtering)
  curCat = 'all'; curSub = 'all'; curTag = 'all'; curPromoType = 'all'; curSearch = ''; curPage = 1;
  const hb=document.getElementById('backBtnBar');if(hb)hb.classList.remove('show');
  updateActiveCatBar('all','','');
  document.getElementById('catalog').style.display='none';
  document.getElementById('home').style.display='';
  window.scrollTo(0,0);
  try{ history.replaceState(null,'',window.location.pathname+window.location.search); }catch(e){}
  // Group D: sync active highlights (sidebar/chip/bottom-tab)
  if(typeof updateSidebarActive === 'function') updateSidebarActive();
  if(typeof updateMobActive === 'function') updateMobActive();
  if(typeof updateBottomTabActive === 'function') updateBottomTabActive(); // explicit double-call for safety
}
function goCat(catId){
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value='';
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
  updateActiveCatBar(catId,CAT_NAMES[catId],CAT_SVG[catId]);
  setNavState({cat:catId, sub:'all', tag:'all', search:'', page:1});
}
function goB(brand){
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value=brand;
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
  updateActiveCatBar('brand',brand,FILTER_SVG.brand);
  setNavState({cat:'all', sub:'all', tag:'all', search:brand, page:1});
}
function doSearch(){
  const q=(document.getElementById('homeSearch').value||'').trim();
  if(!q)return;
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value=q;
  updateActiveCatBar('search','ค้นหา: '+q,FILTER_SVG.search);
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
  setNavState({cat:'all', sub:'all', tag:'all', search:q, page:1});
}
function setMobTag(tag){
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value='';
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
  const tagLabels = {Hot:'สินค้าขายดี', New:'สินค้าใหม่', Promo:'สินค้าโปรโมชั่น'};
  const tagIcons = {Hot:FILTER_SVG.hot, New:FILTER_SVG.new, Promo:FILTER_SVG.promo};
  const label = tagLabels[tag] || tag;
  updateActiveCatBar('filter', label, tagIcons[tag]||'');
  document.querySelectorAll('.mob-cat-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.mob-tag-btn').forEach(b=>{
    if((tag==='Hot'&&b.textContent.includes('ขายดี'))||(tag==='New'&&b.textContent.includes('ใหม่'))||(tag==='Promo'&&b.textContent.includes('โปรโมชั่น')))b.classList.add('active');
  });
  setNavState({cat:'all', sub:'all', tag:tag, search:'', page:1});
}


// === Search Tokens (จากชื่อสินค้าจริง) ===
// SEARCH_TOKENS — lazy-loaded from data/search-tokens.json
// (ลด initial bundle size 22KB เพราะส่วนใหญ่ user ไม่ search)
let SEARCH_TOKENS = null;  // null = not loaded yet
let _searchTokensPromise = null;

function ensureSearchTokens(){
  if(SEARCH_TOKENS) return Promise.resolve(SEARCH_TOKENS);
  if(_searchTokensPromise) return _searchTokensPromise;
  _searchTokensPromise = fetch('data/search-tokens.json')
    .then(r => r.json())
    .then(tokens => { SEARCH_TOKENS = tokens; return tokens; })
    .catch(e => { console.warn('search tokens load failed:', e); SEARCH_TOKENS = []; return []; });
  return _searchTokensPromise;
}

function normalizeQ(s){
  return s.toLowerCase().replace(/[\s\-\/\(\)&+,\.#]+/g,' ').trim();
}

function matchProduct(p, words){
  // 2-tier matching:
  //   Tier 1: substring match — ทำงานทันที ไม่ต้องรอ tokens
  //   Tier 2: prefix match ผ่าน SEARCH_TOKENS — ต้องรอ lazy-load (ดู applyFilter)
  //           ใช้สำหรับ Thai compound word เช่น "สีย้อม" → match "สีย้อมผม"
  const haystack = (p.name+' '+p.code+' '+(p.brand||'')+' '+(p.subCat||'')).toLowerCase();
  return words.every(function(w){
    // Tier 1: exact include (always available)
    if(haystack.includes(w)) return true;
    // Tier 2: prefix match via SEARCH_TOKENS (lazy-loaded — see applyFilter)
    if(!SEARCH_TOKENS) return false;
    return SEARCH_TOKENS.some(function(t){ return t.startsWith(w) && haystack.includes(t); });
  });
}

function applyFilter(){
  const q=normalizeQ(curSearch);
  const words=q?q.split(' ').filter(function(w){return w.length>0;}):[];

  // Lazy-load search tokens on first search (idempotent — returns cached promise)
  // เมื่อโหลดเสร็จ → re-apply ถ้า user ยังค้นหาคำเดิม (race-safe)
  if(words.length > 0 && !SEARCH_TOKENS){
    const _searchAtCall = curSearch;
    ensureSearchTokens().then(function(){
      // Re-render เฉพาะกรณีที่ user ยังค้นหาคำเดิม (กัน stale callback)
      if(curSearch === _searchAtCall){
        applyFilter(); // recursion ปลอดภัย — SEARCH_TOKENS โหลดแล้ว guard ข้างบนจะ skip
      }
    });
  }

  filtered=allProducts.filter(function(p){
    if(curCat!=='all'&&!q&&p.catId!==curCat)return false;
    if(curSub!=='all'&&p.subCat!==curSub)return false;
    if(curTag==='Hot'&&p.tag!=='สินค้าขายดี')return false;
    if(curTag==='New'&&p.tag!=='สินค้าใหม่')return false;
    if(curTag==='Promo'){
      if(!p.promoType) return false;                                          // ต้องมี promo type
      if(curPromoType !== 'all' && p.promoType !== curPromoType) return false; // sub-filter (flash/step_price/...)
    }
    if(words.length>0){if(!matchProduct(p,words))return false;}
    return true;
  });
  filtered.sort((a,b)=>(a.excelOrder||0)-(b.excelOrder||0));
  renderResultCnt();renderSubcats();renderProducts();renderPagination();
}

function updateQtabCounts(){
  if(typeof allProducts === 'undefined') return;
  const hotCount = allProducts.filter(function(p){ return p.tag==='สินค้าขายดี'; }).length;
  const newCount = allProducts.filter(function(p){ return p.tag==='สินค้าใหม่'; }).length;
  const promoCount = allProducts.filter(function(p){ return p.promoType; }).length;
  const fmt = function(n){ return n.toLocaleString('th-TH') + ' รายการ'; };
  const setSub = function(id, count){
    const el = document.getElementById(id);
    if(el) el.textContent = fmt(count);
  };
  setSub('qtabHotCount', hotCount);
  setSub('qtabNewCount', newCount);
  setSub('qtabPromoCount', promoCount);
}
function buildSidebar(){
  const sb=document.getElementById('sidebar');if(!sb)return;
  // ใช้ SVG จาก ICON CONFIG แทน emoji
  const I = function(svg, variant){
    return '<span class="sb-icon '+(variant||'')+'">'+svg+'</span>';
  };
  let h='<div class="sb-hdr">กรองสินค้า</div>';
  h+='<button class="sb-btn" data-tag="all" onclick="setTag(\'all\')">'+I(FILTER_SVG.all)+' ทั้งหมด</button>';
  h+='<button class="sb-btn" data-tag="Hot" onclick="setTag(\'Hot\')">'+I(FILTER_SVG.hot,'sb-icon-hot')+' สินค้าขายดี</button>';
  h+='<button class="sb-btn" data-tag="New" onclick="setTag(\'New\')">'+I(FILTER_SVG.new,'sb-icon-new')+' สินค้าใหม่</button>';
  h+='<button class="sb-btn" data-tag="Promo" onclick="setTag(\'Promo\')">'+I(FILTER_SVG.promo,'sb-icon-promo')+' โปรโมชั่น</button>';
  // Promo sub-items — แสดงเฉพาะตอน curTag === 'Promo'
  // Auto-hide types ที่ไม่มีสินค้า (เช่น flash หมดอายุ → ลบ promo จากสินค้า → sub item หายไปเอง)
  if(curTag === 'Promo'){
    const promoCounts = countPromoTypes();
    for(const [pkey, pconf] of Object.entries(PROMO_TYPES)){
      const cnt = promoCounts[pkey] || 0;
      if(cnt === 0) continue; // auto-hide
      h+='<button class="sb-btn sb-sub-btn" data-promo-type="'+pkey+'" onclick="setPromoType(\''+pkey+'\')">'
        +'<span class="sb-sub-icon" style="color:'+pconf.color+'">'+pconf.icon+'</span> '
        +pconf.label
        +' <span class="sb-sub-count">('+cnt+')</span>'
        +'</button>';
    }
  }
  h+='<div class="sb-divider"></div>';
  h+='<div class="sb-hdr">หมวดหมู่</div>';
  h+='<button class="sb-btn" data-cat="all" onclick="goCat(\'all\')">'+I(FILTER_SVG.all)+' ทั้งหมด</button>';
  for(const [k,v] of Object.entries(RAW_DATA)){
    h+='<button class="sb-btn" data-cat="'+k+'" onclick="goCat(\''+k+'\')">'+I(CAT_SVG[k]||'')+' '+(CAT_NAMES[k]||k)+' ('+v.length+')</button>';
  }
  sb.innerHTML=h;
}
function buildMobCats(){
  const mb=document.getElementById('mobCats');if(!mb)return;
  // ใช้ SVG จาก ICON CONFIG (FILTER_SVG + CAT_SVG) แทน emoji
  const I = function(svg, variant){
    return '<span class="chip-icon '+(variant||'')+'">'+svg+'</span>';
  };
  let h='<button class="mob-cat-btn" data-tag="all" onclick="setMobTag(\'all\')">'+I(FILTER_SVG.all)+' ทั้งหมด</button>';
  h+='<button class="mob-cat-btn mob-tag-btn" data-tag="Hot" onclick="setMobTag(\'Hot\')">'+I(FILTER_SVG.hot,'chip-icon-hot')+' ขายดี</button>';
  h+='<button class="mob-cat-btn mob-tag-btn" data-tag="New" onclick="setMobTag(\'New\')">'+I(FILTER_SVG.new,'chip-icon-new')+' ใหม่</button>';
  h+='<button class="mob-cat-btn mob-tag-btn" data-tag="Promo" onclick="setMobTag(\'Promo\')">'+I(FILTER_SVG.promo,'chip-icon-promo')+' โปรโมชั่น</button>';
  h+='<span style="width:1px;background:var(--border);align-self:stretch;margin:4px 2px"></span>';
  for(const k of Object.keys(RAW_DATA)){
    h+='<button class="mob-cat-btn" data-cat="'+k+'" onclick="goCat(\''+k+'\')">'+I(CAT_SVG[k]||'')+' '+(CAT_NAMES[k]||k)+'</button>';
  }
  mb.innerHTML=h;
}
function updateSidebarActive(){
  // Clear cart/account override on any navigation
  if(typeof _clearTabOverride === 'function') _clearTabOverride();
  // Also sync bottom tab (Group D2 paired)
  if(typeof updateBottomTabActive === 'function') updateBottomTabActive();
  // Re-render sidebar เฉพาะตอน sub-items presence ต้องเปลี่ยน
  // (เลี่ยง re-render ทุก navigation → ไม่ให้ animation slideIn ซ้ำ + ลด DOM churn)
  const sb = document.getElementById('sidebar');
  if(sb && typeof buildSidebar === 'function'){
    const hasSubItems = sb.querySelector('.sb-sub-btn') !== null;
    const shouldHaveSubItems = curTag === 'Promo';
    if(hasSubItems !== shouldHaveSubItems){
      buildSidebar();
    }
  }
  const btns = document.querySelectorAll('#sidebar .sb-btn');
  btns.forEach(function(b){
    let isActive = false;
    const dc = b.dataset.cat, dt = b.dataset.tag, dp = b.dataset.promoType;
    if(dp){
      // Promo sub-item: active เฉพาะตอน curPromoType ตรง
      isActive = (curTag === 'Promo' && curPromoType === dp);
    } else if(curCat !== 'all'){
      isActive = (dc === curCat); // ตรงกับหมวดที่เลือก
    } else if(curTag !== 'all'){
      isActive = (dt === curTag); // ตรงกับ tag (Hot/New/Promo)
    } else if(!curSearch){
      isActive = (dt === 'all'); // ทั้งหมด (default state)
    }
    b.classList.toggle('active', isActive);
  });
}
function updateMobActive(){
  const btns = document.querySelectorAll('#mobCats .mob-cat-btn');
  btns.forEach(function(b){
    let isActive = false;
    const dc = b.dataset.cat, dt = b.dataset.tag;
    if(curCat !== 'all'){
      isActive = (dc === curCat);
    } else if(curTag !== 'all'){
      isActive = (dt === curTag);
    } else if(!curSearch){
      isActive = (dt === 'all');
    }
    b.classList.toggle('active', isActive);
  });
}
function setTag(tag){ setNavState({tag:tag, page:1}); }
function setPromoType(type){
  setNavState({tag:'Promo', promoType:type, page:1});
}
window.setPromoType = setPromoType;
function setSub(sub){
  document.querySelectorAll('.sub-btn,.sub-dd-item').forEach(b=>b.classList.toggle('active',b.dataset.val===sub));
  // Auto-close mobile dropdown after selection
  const bar=document.getElementById('subcatBar');
  if(bar && bar.classList.contains('show-mobile-dropdown')){
    bar.classList.remove('show-mobile-dropdown');
    const trigger=bar.querySelector('.sub-mobile-trigger');
    if(trigger) trigger.setAttribute('aria-expanded','false');
    document.removeEventListener('click', _closeSubDropdownOutside);
  }
  setNavState({sub:sub, page:1});
}
function setView(v){
  viewMode=v;
  document.getElementById('vGrid').classList.toggle('active',v==='grid');
  document.getElementById('vList').classList.toggle('active',v==='list');
  renderProducts();
}

function renderResultCnt(){const el=document.getElementById('resultCnt');if(el)el.textContent='แสดง '+filtered.length.toLocaleString('th-TH')+' รายการ';}
function renderSubcats(){
  const bar=document.getElementById('subcatBar');if(!bar)return;
  if(curCat==='all'||curSearch){bar.innerHTML='';bar.classList.remove('show-mobile-dropdown');return;}
  const subs=subcatMap[curCat]||[];
  if(!subs.length){bar.innerHTML='';bar.classList.remove('show-mobile-dropdown');return;}

  function esc(s){ return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

  // 1. "ทั้งหมด" chip (always visible)
  let h='<button class="sub-btn '+(curSub==='all'?'active':'')+'" data-val="all" onclick="setSub(\'all\')">ทั้งหมด</button>';

  // 2. Mobile dropdown — trigger + floating menu (Pattern B)
  const triggerLabel = (curSub && curSub !== 'all') ? curSub : 'เลือกหมวดย่อย';
  h+='<div class="sub-dd-anchor">';
  h+='  <button class="sub-mobile-trigger" type="button" onclick="event.stopPropagation();toggleSubDropdown()" aria-haspopup="listbox" aria-expanded="false">';
  h+='    <span class="sub-mobile-label">'+triggerLabel+'</span>';
  h+='    <svg class="sub-mobile-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  h+='  </button>';
  h+='  <div class="sub-dd-menu" role="listbox">';
  // "ทั้งหมด" item (active when curSub === 'all')
  h+='    <button class="sub-dd-item '+(curSub==='all'?'active':'')+'" role="option" data-val="all" onclick="event.stopPropagation();setSub(\'all\')"><svg class="sub-dd-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="sub-dd-text">ทั้งหมด</span></button>';
  // Each subcategory item
  for(const s of subs){
    const isActive = (curSub === s);
    h+='    <button class="sub-dd-item '+(isActive?'active':'')+'" role="option" data-val="'+s+'" onclick="event.stopPropagation();setSub(\''+esc(s)+'\')"><svg class="sub-dd-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="sub-dd-text">'+s+'</span></button>';
  }
  h+='  </div>';
  h+='</div>';

  // 3. Desktop chip wrap (hidden on mobile)
  h+='<div class="sub-chips-wrap">';
  for(const s of subs){
    h+='<button class="sub-btn '+(curSub===s?'active':'')+'" data-val="'+s+'" onclick="setSub(\''+esc(s)+'\')">'+s+'</button>';
  }
  h+='</div>';

  bar.innerHTML=h;
}

/** Toggle the mobile subcategory dropdown (Pattern B — Floating menu) */
function toggleSubDropdown(){
  const bar=document.getElementById('subcatBar');
  if(!bar) return;
  const isOpen=bar.classList.toggle('show-mobile-dropdown');
  const trigger=bar.querySelector('.sub-mobile-trigger');
  if(trigger) trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  // Outside-click listener (lazy attach when open)
  if(isOpen){
    // Defer attach to next tick — skip current click event
    setTimeout(function(){ document.addEventListener('click', _closeSubDropdownOutside); }, 0);
    // Also close on scroll (UX improvement)
    document.getElementById('mainContent')?.addEventListener('scroll', _closeSubDropdownOnScroll, {passive:true, once:true});
  } else {
    document.removeEventListener('click', _closeSubDropdownOutside);
    document.getElementById('mainContent')?.removeEventListener('scroll', _closeSubDropdownOnScroll);
  }
}

/** Outside-click handler — close dropdown if click outside subcat-bar */
function _closeSubDropdownOutside(e){
  const bar=document.getElementById('subcatBar');
  if(!bar) return;
  if(bar.contains(e.target)) return; // click inside — keep open
  bar.classList.remove('show-mobile-dropdown');
  const trigger=bar.querySelector('.sub-mobile-trigger');
  if(trigger) trigger.setAttribute('aria-expanded','false');
  document.removeEventListener('click', _closeSubDropdownOutside);
}

/** Scroll-handler — close dropdown when user scrolls catalog */
function _closeSubDropdownOnScroll(){
  const bar=document.getElementById('subcatBar');
  if(bar && bar.classList.contains('show-mobile-dropdown')){
    bar.classList.remove('show-mobile-dropdown');
    const trigger=bar.querySelector('.sub-mobile-trigger');
    if(trigger) trigger.setAttribute('aria-expanded','false');
    document.removeEventListener('click', _closeSubDropdownOutside);
  }
}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function badge(p){
  if(p.tag==='สินค้าใหม่')return '<span class="badge-new">✨ ใหม่</span>';
  if(p.tag==='สินค้าขายดี')return '<span class="badge-hot">🔥 ขายดี</span>';
  return '';
}
// Inline "6+" icon (from assets/icons/age-6.svg) — uses currentColor → adapts to ribbon color
const ICON_AGE6 = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="p-ribbon-icon" aria-hidden="true"><path d="M21 0C20.4477 0 20 0.447715 20 1V2H19C18.4477 2 18 2.44772 18 3C18 3.55228 18.4477 4 19 4H20V5C20 5.55228 20.4477 6 21 6C21.5523 6 22 5.55228 22 5V4H23C23.5523 4 24 3.55228 24 3C24 2.44772 23.5523 2 23 2L22 2V1C22 0.447715 21.5523 0 21 0Z"/><path d="M22.4669 8.6169C22.297 8.09138 21.7016 7.85776 21.1936 8.07463C20.6857 8.29149 20.4525 8.87941 20.6116 9.40826C21.113 11.074 21.1224 12.8572 20.6271 14.5397C20.0373 16.5433 18.7684 18.2792 17.0383 19.4493C15.3082 20.6195 13.2248 21.1509 11.1455 20.9525C9.06632 20.754 7.12102 19.8381 5.6435 18.3618C4.16598 16.8855 3.24839 14.9409 3.04823 12.8619C2.84806 10.7828 3.3778 8.69891 4.54651 6.96784C5.71523 5.23677 7.45005 3.96647 9.45321 3.37498C11.1353 2.8783 12.9185 2.88626 14.5846 3.38623C15.1136 3.54496 15.7013 3.31122 15.9178 2.80311C16.1342 2.29501 15.9001 1.69979 15.3745 1.53036C13.276 0.853957 11.0142 0.821568 8.88489 1.4503C6.43473 2.17379 4.31278 3.72755 2.88327 5.84491C1.45375 7.96227 0.805798 10.5112 1.05063 13.0542C1.29547 15.5972 2.41781 17.9757 4.22504 19.7814C6.03227 21.5871 8.41167 22.7075 10.9549 22.9502C13.4981 23.193 16.0464 22.5429 18.1626 21.1117C20.2788 19.6804 21.8308 17.5572 22.5523 15.1064C23.1792 12.9766 23.145 10.7148 22.4669 8.6169Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M9 9C9 7.89543 9.89543 7 11 7H14C14.5523 7 15 7.44772 15 8C15 8.55229 14.5523 9 14 9H11.2C11.0895 9 11 9.08954 11 9.2V10.8C11 10.9105 11.0895 11 11.2 11H13C14.1046 11 15 11.8954 15 13V15C15 16.1046 14.1046 17 13 17H11C9.89543 17 9 16.1046 9 15V9ZM11 14C11 14.5523 11.4477 15 12 15C12.5523 15 13 14.5523 13 14C13 13.4477 12.5523 13 12 13C11.4477 13 11 13.4477 11 14Z"/></svg>';

// === Promo Type Registry ===
// เพิ่ม promo type ใหม่ที่นี่ → sub-menu จะ render อัตโนมัติ
// ถ้า data ไม่มีสินค้า type นั้นแล้ว → sub item ถูกซ่อนอัตโนมัติ
// (auto-hide จาก countPromoTypes() — promo หมดอายุ = ลบสินค้า/promoType ออก = sub-item หายไปเอง)
const PROMO_TYPES = {
  flash: {
    label: 'FLASH SALE',
    icon:  '<span class="sb-promo-emoji">⚡</span>',  // emoji matches ribbon
    color: '#DC2626'
  },
  step_price: {
    label: 'ซื้อ 6 หน่วยขึ้นไป ราคาพิเศษ',
    icon:  ICON_AGE6,                                 // SVG matches ribbon
    color: '#0EA5E9'
  }
  // Future:
  // bundle: { label: 'แพ็คคู่/ชุดประหยัด', icon: '...', color: '#10B981' },
  // sale:   { label: 'ลดราคา',           icon: '...', color: '#F97316' },
};

// นับจำนวนสินค้าต่อ promo type โดยใช้ filter หมวด/sub ปัจจุบัน
// → ตัวเลขที่แสดงใน sub-menu ตรงกับจำนวนที่ user จะเห็นจริงเมื่อคลิก (context-aware)
// → auto-hide sub-item ถ้า count = 0 (เช่น flash หมดอายุ หรือ ไม่มี flash ในหมวดนี้)
function countPromoTypes(){
  const counts = {};
  if(typeof allProducts === 'undefined' || !Array.isArray(allProducts)) return counts;
  for(let i = 0; i < allProducts.length; i++){
    const p = allProducts[i];
    if(!p.promoType) continue;
    // เคารพ filter หมวด/sub ปัจจุบัน → count ตรงกับ result ที่จะแสดง
    if(curCat !== 'all' && p.catId !== curCat) continue;
    if(curSub !== 'all' && p.subCat !== curSub) continue;
    counts[p.promoType] = (counts[p.promoType] || 0) + 1;
  }
  return counts;
}
function imgTag(p){
  // Promo ribbon overlay on image — flash gets red ribbon, step_price gets blue chip
  let ribbon = '';
  if(p.promoType === 'flash'){
    ribbon = '<span class="p-ribbon p-ribbon-flash">⚡ FLASH SALE</span>';
  } else if(p.promoType === 'step_price'){
    ribbon = '<span class="p-ribbon p-ribbon-step">'+ICON_AGE6+'ซื้อ '+(p.promoMinQty||6)+' หน่วย+</span>';
  }
  // No image → ghost text "No Picture" จางๆ (ใช้ window.handleImgError ถ้า img โหลดไม่ได้)
  if(p.imageUrl){
    return ribbon+'<img src="'+p.imageUrl+'" alt="" loading="lazy" onerror="handleImgError(this)">';
  }
  return ribbon+'<div class="p-img-ph">No Picture</div>';
}
// Global handler — เรียกจาก <img onerror="..."> เพื่อ swap img ที่โหลดไม่ได้
// เป็น "No Picture" placeholder (เลี่ยงปัญหา quote escaping ใน HTML attribute)
window.handleImgError = function(img){
  if(!img || !img.parentNode) return;
  const ph = document.createElement('div');
  ph.className = 'p-img-ph';
  ph.textContent = 'No Picture';
  img.parentNode.replaceChild(ph, img);
};
function priceRow(p){
  // Flash: show ~~stdPrice~~ promoPrice (immediate discount, qty>=1)
  if(p.promoType === 'flash' && p.promoPrice > 0){
    return '<span class="p-price p-price-promo">'+p.promoPrice.toLocaleString('th-TH')+' บาท</span>'
         + '<span class="p-price-strike">'+p.stdPrice.toLocaleString('th-TH')+'</span>';
  }
  const ws=p.stdPrice>0?p.stdPrice.toLocaleString('th-TH')+' บาท':'-';
  return '<span class="p-price">'+ws+'</span>';
}
function promoHintHTML(p){
  // Step price: show hint "ซื้อ 6 หน่วยขึ้นไป ลดเหลือ 222"
  if(p.promoType === 'step_price' && p.promoPrice > 0 && p.promoMinQty > 0){
    return '<span class="p-promo-hint" title="ราคาพิเศษเมื่อสั่ง '+p.promoMinQty+' ชิ้นขึ้นไป">ซื้อ '+p.promoMinQty+' หน่วยขึ้นไป ลดเหลือ '+p.promoPrice.toLocaleString('th-TH')+'</span>';
  }
  return '';
}
// ── Unit & Suggested Retail helpers ──
function unitSuffix(p){
  // แสดง "×N" ติดท้ายชื่อสินค้า (ไม่มีชื่อหน่วย — เช่น "×1", "×3")
  const n = Number(p.packQty || 1);
  if(!n) return '';
  return ' ×' + n;
}
function suggestRetailHTML(p){
  // Source: ERP ISCode Price_Prod.Shop (ราคาแนะนำขายต่อให้ผู้บริโภคปลายทาง)
  // Loaded from data/suggested_retail.json overlay (separate from Excel)
  const sr = Number(p.suggestedRetail || 0);
  if(sr <= 0) return '';
  return '<span class="p-suggest" title="ราคาแนะนำขายต่อให้ผู้บริโภคปลายทาง (จาก ERP Price_Prod.Shop)">แนะนำขาย '+sr.toLocaleString('th-TH')+'</span>';
}
function stockInfo(p){
  if(p.stock>0)return '<span class="stock-in">✓ '+p.stock+'</span>';
  return '<span class="stock-empty">สินค้าหมดชั่วคราว</span>';
}
function cardBtn(p){
  const item=cart.find(c=>c.code===p.code);
  const isOOS=p.tag==='สินค้าหมดชั่วคราว'||p.stock===0;
  if(item&&item.qty>0){
    const qtyCls = isOOS ? 'qty-ctrl preorder' : 'qty-ctrl'; // sync กับ updateCardBtn — แดงถ้า OOS
    return '<div id="cbtn-'+p.code+'" class="'+qtyCls+'">'
      +'<button onclick="removeCardItem(\''+p.code+'\')">−</button>'
      +'<input id="qi-'+p.code+'" type="number" value="'+item.qty+'" min="1" max="999"'
      +' onchange="setCartQty(\''+p.code+'\',this.value)"  onclick="event.stopPropagation()">'
      +'<button onclick="addCart(\''+p.code+'\')">+</button>'
      +'</div>';
  }
  if(isOOS){
    return '<button id="cbtn-'+p.code+'" class="preorder-btn" style="width:100%;padding:5px 0" onclick="addCart(\''+p.code+'\')">'+'🛒 สั่งจอง</button>';
  }
  return '<button id="cbtn-'+p.code+'" class="add-btn" style="width:100%;padding:5px 0;margin-bottom:0" onclick="addCart(\''+p.code+'\')">'+'+ ใส่ตะกร้า</button>';
}
function renderProducts(){
  const area=document.getElementById('prodArea');if(!area)return;
  const start=(curPage-1)*PER_PAGE;
  const page=filtered.slice(start,start+PER_PAGE);
  if(!page.length){area.innerHTML='<div class="no-result"><h3>ไม่พบสินค้า</h3><p>ลองค้นหาคำอื่น</p></div>';return;}
  if(viewMode==='grid'){
    let html='<div class="prod-grid">';
    for(const p of page){
      html+='<div class="p-card">'
        +'<div class="p-img">'+imgTag(p)+'</div>'
        +'<div class="p-body">'
        +'<div class="p-meta-row">'
        +  '<span class="p-code">#'+p.code+'</span>'
        +  (p.brand?'<span class="p-brand-inline">'+esc(p.brand)+'</span>':'')
        +'</div>'
        +'<div class="p-name">'+esc(p.name)+'<span class="p-unit-suffix">'+esc(unitSuffix(p))+'</span></div>'
        +'<div class="p-price-row">'+priceRow(p)+(badge(p)?'<span class="p-badge-inline">'+badge(p)+'</span>':'')+'</div>'
        +(promoHintHTML(p)?'<div class="p-promo-row">'+promoHintHTML(p)+'</div>':'')
        +'<div class="p-stock-row">'+(suggestRetailHTML(p)||'<span></span>')+stockInfo(p)+'</div>'
        +cardBtn(p)
        +'</div></div>';
    }
    area.innerHTML=html+'</div>';
  } else {
    let html='<div class="prod-list">';
    for(const p of page){
      html+='<div class="p-list-card">'
        +'<div class="p-list-img">'+imgTag(p)+'</div>'
        +'<div class="p-list-body">'
        +'<div class="p-meta-row">'
        +  '<span class="p-code">#'+p.code+'</span>'
        +  (p.brand?'<span class="p-brand-inline">'+esc(p.brand)+'</span>':'')
        +'</div>'
        +'<div class="p-list-name">'+esc(p.name)+'<span class="p-unit-suffix">'+esc(unitSuffix(p))+'</span></div>'
        +'<div class="p-price-row">'+priceRow(p)+(badge(p)?'<span class="p-badge-inline">'+badge(p)+'</span>':'')+'</div>'
        +(promoHintHTML(p)?'<div class="p-promo-row">'+promoHintHTML(p)+'</div>':'')
        +'<div style="display:flex;gap:8px;align-items:center">'+(suggestRetailHTML(p)||'')+stockInfo(p)+'</div>'
        +'</div>'
        +'<button class="add-btn" style="width:auto;padding:6px 10px" onclick="addCart(\''+p.code+'\')">+</button>'
        +'</div>';
    }
    area.innerHTML=html+'</div>';
  }
}
function renderPagination(){
  const pg=document.getElementById('pagination');if(!pg)return;
  const total=Math.ceil(filtered.length/PER_PAGE);
  if(total<=1){pg.innerHTML='';return;}
  let h='';
  const s=Math.max(1,curPage-3),e=Math.min(total,curPage+3);
  if(curPage>1)h+='<button class="pg-btn" onclick="goPage('+(curPage-1)+')">‹</button>';
  if(s>1)h+='<button class="pg-btn" onclick="goPage(1)">1</button><span style="padding:4px">…</span>';
  for(let i=s;i<=e;i++)h+='<button class="pg-btn'+(i===curPage?' active':'')+'" onclick="goPage('+i+')">'+i+'</button>';
  if(e<total)h+='<span style="padding:4px">…</span><button class="pg-btn" onclick="goPage('+total+')">'+total+'</button>';
  if(curPage<total)h+='<button class="pg-btn" onclick="goPage('+(curPage+1)+')">›</button>';
  // Page jump input — กรอกเลขหน้าเพื่อกระโดดเร็ว (validate + error tooltip)
  h+='<span class="pg-jump"><input class="pg-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="ใส่เลขหน้าที่จะไป" maxlength="6" aria-label="กรอกเลขหน้าเพื่อข้ามไป" onkeydown="if(event.key===&quot;Enter&quot;){event.preventDefault();pgJump(this)}"><button class="pg-btn pg-go" onclick="pgJump(this.previousElementSibling)" aria-label="ไปยังหน้าที่กรอก">ไป</button><span class="pg-error" id="pgError"></span></span>';
  pg.innerHTML=h;
}

// Page jump — validate input then goPage; show inline error tooltip
function pgJump(inp){
  if(!inp) inp = document.querySelector('.pg-input');
  if(!inp) return;
  const errEl = document.getElementById('pgError');
  const total = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const val = (inp.value || '').trim();
  function showErr(msg){
    inp.classList.remove('error');
    void inp.offsetWidth; // restart shake animation
    inp.classList.add('error');
    if(errEl){
      errEl.textContent = msg;
      errEl.classList.add('show');
      clearTimeout(errEl._timer);
      errEl._timer = setTimeout(function(){
        errEl.classList.remove('show');
        inp.classList.remove('error');
      }, 2500);
    }
    inp.focus();
    inp.select();
  }
  if(!val){ showErr('กรุณากรอกหมายเลขหน้า'); return; }
  if(!/^\d+$/.test(val)){ showErr('กรอกเป็นตัวเลขเท่านั้น'); return; }
  const n = parseInt(val, 10);
  if(n < 1 || n > total){ showErr('หน้า ' + n + ' ไม่มี (มีถึง ' + total + ')'); return; }
  if(n === curPage){ showErr('อยู่ที่หน้า ' + n + ' แล้ว'); return; }
  // Valid — clear input + jump
  inp.value = '';
  if(errEl){ errEl.classList.remove('show'); }
  inp.classList.remove('error');
  goPage(n);
}
window.pgJump = pgJump;
function goPage(n){
  // Bounds guard — กัน URL hash หรือ external call ใส่ page เกิน
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  n = Math.max(1, Math.min(totalPages, parseInt(n,10) || 1));
  curPage = n;
  renderProducts(); renderPagination();
  const mc = document.getElementById('mainContent');
  if(mc) mc.scrollTop = 0;
  _updateHash();
}
function setCartQty(code,val){
  const qty=Math.max(1,Math.min(999,parseInt(val)||1));
  const idx=cart.findIndex(c=>c.code===code);
  if(idx<0)return;
  cart[idx].qty=qty;
  // sync input value (ป้องกัน out-of-range)
  const inp=document.getElementById('qi-'+code);
  if(inp)inp.value=qty;
  renderCart();updateCardBtn(code);
}
function addCart(code){
  const p=allProducts.find(x=>x.code===code);if(!p)return;
  const isOOS = p.tag === 'สินค้าหมดชั่วคราว' || p.stock <= 0;
  const inCart = cart.findIndex(c=>c.code===code) >= 0;

  // ถ้าเป็นสินค้าหมด และยังไม่อยู่ในตะกร้า → แสดง confirm modal
  if(isOOS && !inCart){
    showPreorderConfirm(p, function(){ doAddCart(code); });
    return;
  }
  doAddCart(code);
}

function doAddCart(code){
  const p=allProducts.find(x=>x.code===code);if(!p)return;
  const idx=cart.findIndex(c=>c.code===code);
  if(idx>=0)cart[idx].qty++;
  else cart.push({code:p.code,name:p.name,price:p.stdPrice,packQty:p.packQty,baseUnit:p.baseUnit,qty:1});
  renderCart();updateCardBtn(code);
}

// Confirm modal สำหรับสินค้าหมด (VIP/care wording)
function showPreorderConfirm(product, onConfirm){
  const mo = document.createElement('div');
  mo.style.cssText = 'position:fixed;inset:0;background:rgba(10,22,40,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;animation:fadeIn .2s ease';

  const imgUrl = product.imageUrl || '';
  mo.innerHTML =
    '<div style="background:#fff;border-radius:18px;padding:24px 22px;max-width:340px;width:100%;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.4);animation:slideUp .3s ease">'
    + '<div style="width:60px;height:60px;background:#F3F4F6;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:30px">📦</div>'
    + '<div style="font-size:1.05rem;font-weight:800;color:#0a1628;margin-bottom:8px">หมดชั่วคราว</div>'
    + '<div style="font-size:.85rem;color:#06c755;font-weight:700;margin-bottom:14px">ขอบคุณที่สนใจค่ะ ✨</div>'
    + (imgUrl ? '<img src="'+imgUrl+'" style="width:90px;height:90px;border-radius:8px;object-fit:cover;background:#f4f8fc;margin-bottom:10px;border:1px solid #b8d9f0">' : '')
    + '<div style="font-size:.78rem;font-weight:600;color:#0a1628;line-height:1.4;margin-bottom:6px">'+esc(product.name||'')+'</div>'
    + '<div style="font-size:.7rem;color:#6B7280;margin-bottom:14px">#'+esc(product.code||'')+'</div>'
    + '<div style="background:#f4f8fc;border-radius:10px;padding:12px;margin-bottom:18px;font-size:.78rem;color:#0a1628;line-height:1.6">น้อง Sales จะติดต่อกลับเร็วที่สุดเพื่อแจ้งเวลาสินค้าและยืนยันสั่งจองให้ค่ะ</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button id="pc-cancel" style="flex:1;padding:11px;background:#fff;color:#6B7280;border:1.5px solid #D1D5DB;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:.85rem">ยกเลิกค่ะ</button>'
    + '<button id="pc-confirm" style="flex:1;padding:11px;background:linear-gradient(135deg,#25a9e0,#0065a8);color:#fff;border:none;border-radius:8px;font-weight:800;cursor:pointer;font-family:inherit;font-size:.85rem">ยืนยันสั่งจอง</button>'
    + '</div>'
    + '</div>'
    + '<style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>';

  document.body.appendChild(mo);

  const cancelBtn = document.getElementById('pc-cancel');
  const confirmBtn = document.getElementById('pc-confirm');

  // Cleanup function — remove modal + keyboard listener
  const cleanup = function(){
    if(mo.parentNode) document.body.removeChild(mo);
    document.removeEventListener('keydown', keyHandler);
  };

  // Keyboard handler: Enter = ยืนยัน, ESC = ยกเลิก
  const keyHandler = function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      if(typeof onConfirm === 'function') onConfirm();
    } else if(e.key === 'Escape'){
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  };
  document.addEventListener('keydown', keyHandler);

  cancelBtn.onclick = cleanup;
  confirmBtn.onclick = function(){
    cleanup();
    if(typeof onConfirm === 'function') onConfirm();
  };

  // คลิกพื้นหลังก็ยกเลิก
  mo.addEventListener('click', function(e){
    if(e.target === mo) cleanup();
  });

  // Auto-focus confirm button — Enter จะกด confirm + visual cue
  setTimeout(function(){ try{ confirmBtn.focus(); }catch(e){} }, 50);
}
function removeCardItem(code){
  const idx=cart.findIndex(c=>c.code===code);if(idx<0)return;
  cart[idx].qty=Math.max(0,cart[idx].qty-1);
  if(cart[idx].qty===0)cart.splice(idx,1);
  renderCart();updateCardBtn(code);
}
function updateCardBtn(code){
  const el=document.getElementById('cbtn-'+code);if(!el)return;
  const p=allProducts.find(x=>x.code===code);
  const item=cart.find(c=>c.code===code);
  const isOOS=p&&(p.tag==='สินค้าหมดชั่วคราว'||p.stock===0);
  if(item&&item.qty>0){
    const qtyCls = isOOS ? 'qty-ctrl preorder' : 'qty-ctrl'; // แดงถ้า OOS (สั่งจอง)
    el.outerHTML='<div id="cbtn-'+code+'" class="'+qtyCls+'">'
      +'<button onclick="removeCardItem(\''+code+'\')">−</button>'
      +'<input id="qi-'+code+'" type="number" value="'+item.qty+'" min="1" max="999"'
      +' onchange="setCartQty(\''+code+'\',this.value)"  onclick="event.stopPropagation()">'
      +'<button onclick="addCart(\''+code+'\')">+</button>'
      +'</div>';
  } else if(isOOS){
    el.outerHTML='<button id="cbtn-'+code+'" class="preorder-btn" style="width:100%;padding:5px 0" onclick="addCart(\''+code+'\')">'+'🛒 สั่งจอง</button>';
  } else {
    el.outerHTML='<button id="cbtn-'+code+'" class="add-btn" style="width:100%;padding:5px 0;margin-bottom:0" onclick="addCart(\''+code+'\')">'+'+ ใส่ตะกร้า</button>';
  }
}
function removeCart(code){
  cart=cart.filter(c=>c.code!==code);
  renderCart();
  updateCardBtn(code); // ใช้ helper ที่เช็ค stock จริง → ถูกต้องตาม state
}
function changeQty(code,delta){
  const idx=cart.findIndex(c=>c.code===code);if(idx<0)return;
  cart[idx].qty=Math.max(1,cart[idx].qty+delta);
  renderCart();
  updateCardBtn(code); // sync ปุ่ม card บน catalog
}
function renderCart(){
  _emit('cart-change', { count: cart.length, totalQty: cart.reduce(function(s,c){return s+(c.qty||0);},0) });
  saveCart(); // persist cart ทุกครั้งที่มี render — ป้องกัน cart หายตอนสลับแอป
  if(typeof updateBottomTabCartBadge === 'function') updateBottomTabCartBadge();
  // Badges นับตาม SKU (cart.length) ไม่ใช่ qty sum
  const skuCount = cart.length;
  // Header cart badge — hide when 0 (เหมือน FAB)
  const cartCntEl=document.getElementById('cartCnt');
  if(cartCntEl){
    cartCntEl.textContent=skuCount;
    cartCntEl.style.display=skuCount>0?'flex':'none';
  }
  const fab=document.getElementById('cartFabCnt');
  const fabLabel=document.getElementById('cartFabLabel');
  const fabBtn=document.getElementById('cartFab');
  if(fab){
    fab.textContent=skuCount;
    fab.style.display=skuCount>0?'flex':'none';
    if(fabLabel)fabLabel.style.display=skuCount>0?'none':'inline';
    if(fabBtn&&skuCount>0){fabBtn.classList.remove('pop');void fabBtn.offsetWidth;fabBtn.classList.add('pop');}
  }
  // Show/hide ปุ่มล้างตะกร้า
  const clearBtn = document.getElementById('cartClearBtn');
  if(clearBtn) clearBtn.style.display = cart.length > 0 ? 'inline-block' : 'none';

  const items=document.getElementById('cartItems');
  if(!cart.length){items.innerHTML='<p style="text-align:center;color:#aaa;margin-top:24px">ยังไม่มีสินค้า</p>';}
  else{
    let h='';
    for(const c of cart){
      const prod = allProducts.find(p => p.code === c.code);
      const imgUrl = (prod && prod.imageUrl) ? prod.imageUrl : '';
      const pType = prod ? (prod.promoType || '') : '';
      const pLabel = prod ? (prod.promoLabel || '') : '';
      const pPromoPrice = prod ? (prod.promoPrice || 0) : 0;
      const pMinQty = prod ? (prod.promoMinQty || 0) : 0;
      // out-of-stock = preorder (สำคัญสุด)
      const isOutOfStock = prod && (prod.tag === 'สินค้าหมดชั่วคราว' || prod.stock <= 0);
      // promo applied = qty meets threshold AND has promoPrice (smaller than stdPrice)
      const promoApplied = !isOutOfStock && pPromoPrice > 0 && pMinQty > 0 && c.qty >= pMinQty;
      // strike-through stdPrice when promo applied
      const hasStrike = promoApplied && pPromoPrice < c.price;
      const themeMap = {
        step_price: { c1:'#2080BE', bg:'#F0F7FF', emoji:'🏷', txt:'ซื้อ 6+ ราคาพิเศษ' },
        flash:      { c1:'#DC2626', bg:'#FEF2F2', emoji:'⚡', txt:'FLASH SALE' },
        preorder:   { c1:'#6B7280', bg:'#F3F4F6', emoji:'📦', txt:'สั่งจอง — สินค้าหมดชั่วคราว (รอสั่ง)' }
      };
      const effectiveType = isOutOfStock ? 'preorder' : pType;
      const theme = themeMap[effectiveType] || null;
      const ribbonText = effectiveType === 'preorder'
        ? '📦 สั่งจอง — สินค้าหมดชั่วคราว (รอสั่ง)'
        : (pLabel || (theme ? theme.emoji+' '+theme.txt : ''));

      if(theme){
        // === Promo Activated Banner (เมื่อ qty ≥ threshold, ราคา promo applied) ===
        // คำนวณส่วนลด → แสดง premium banner เด่นๆ ให้รู้ว่าได้ราคาพิเศษ
        let activatedBanner = '';
        if(promoApplied && pPromoPrice > 0 && c.price > pPromoPrice){
          const savedPerUnit = c.price - pPromoPrice;
          const totalSaved = savedPerUnit * c.qty;
          activatedBanner = '<div class="promo-activated-banner">'
            + '<span class="promo-activated-icon">✨</span>'
            + '<span class="promo-activated-text">ราคาพิเศษ! ลด '+totalSaved.toLocaleString('th-TH')+' บาท</span>'
            + '<span class="promo-activated-shimmer"></span>'
            + '</div>';
        } else if(prod && prod.promoMinQty > 0 && c.qty < prod.promoMinQty){
          // Hint: ยังไม่ครบ threshold — แนะนำให้เพิ่ม
          const remaining = prod.promoMinQty - c.qty;
          activatedBanner = '<div class="promo-hint-banner">'
            + '<span style="opacity:.7">💡 เพิ่มอีก '+remaining+' ชิ้น = ราคาพิเศษ '+pPromoPrice.toLocaleString('th-TH')+' บาท</span>'
            + '</div>';
        }
        // PROMO CART ITEM
        h += '<div class="cart-item promo-item' + (promoApplied ? ' promo-active' : '') + '" data-promo="'+pType+'" style="padding:0 !important;border:1.5px solid '+theme.c1+';background:'+theme.bg+';border-radius:8px;overflow:hidden">'
          + activatedBanner
          + '<div style="background:'+theme.c1+';color:#fff;font-size:.7rem;font-weight:800;padding:3px 10px">'+esc(ribbonText)+'</div>'
          + '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px">'
          + (imgUrl
              ? '<img src="'+imgUrl+'" alt="" loading="lazy" onerror="this.style.display=\'none\'" style="width:52px;height:52px;border-radius:6px;object-fit:cover;background:#fff;flex-shrink:0;border:1px solid var(--border)">'
              : '<div style="width:52px;height:52px;border-radius:6px;background:#fff;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:'+theme.c1+';font-weight:800;font-size:.85rem">?</div>')
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:.8rem;font-weight:700;margin-bottom:4px;line-height:1.35">'+esc(c.name)+'</div>'
          + '<div style="font-size:.7rem;color:#4B5563"><span class="sku-copy" onclick="copySkuFromCart(event,\''+c.code+'\')" title="แตะเพื่อคัดลอก SKU">#'+c.code+'</span>'+(c.baseUnit?' · '+c.baseUnit:'')+'</div>'
          + '<div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">'
          + '<button onclick="changeQty(\''+c.code+'\',-1)" style="border:1px solid var(--border);border-radius:4px;width:24px;height:24px;cursor:pointer;background:#fff">−</button>'
          + '<span style="font-weight:700;min-width:18px;text-align:center">'+c.qty+'</span>'
          + '<button onclick="changeQty(\''+c.code+'\',1)" style="border:1px solid var(--border);border-radius:4px;width:24px;height:24px;cursor:pointer;background:#fff">+</button>'
          + '<span style="flex:1;text-align:right;font-weight:700;color:'+theme.c1+';font-size:.85rem">'
          + (promoApplied && c.price > pPromoPrice ? '<span style="text-decoration:line-through;color:#999;font-weight:400;font-size:.7rem">'+(c.price*c.qty).toLocaleString('th-TH')+'</span> ' : '')
          + effectiveSubtotal(c).toLocaleString('th-TH')+' บาท</span>'
          + '<button onclick="removeCart(\''+c.code+'\')" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:.95rem">✕</button>'
          + '</div></div></div></div>';
      } else {
        // REGULAR CART ITEM (เดิม)
        h+='<div class="cart-item" style="display:flex;gap:10px;align-items:flex-start">'
          +(imgUrl
              ? '<img src="'+imgUrl+'" alt="" loading="lazy" onerror="this.style.display=\'none\'" style="width:52px;height:52px;border-radius:6px;object-fit:cover;background:#f4f8fc;flex-shrink:0;border:1px solid var(--border)">'
              : '<div style="width:52px;height:52px;border-radius:6px;background:linear-gradient(135deg,#dceeff,var(--border));flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--acc);font-weight:800;font-size:.85rem">?</div>')
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:.8rem;font-weight:700;margin-bottom:4px;line-height:1.35">'+esc(c.name)+'</div>'
          +'<div style="font-size:.7rem;color:#4B5563">#'+c.code+(c.baseUnit?' · '+c.baseUnit:'')+'</div>'
          +'<div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">'
          +'<button onclick="changeQty(\''+c.code+'\',-1)" style="border:1px solid var(--border);border-radius:4px;width:24px;height:24px;cursor:pointer">−</button>'
          +'<span style="font-weight:700;min-width:18px;text-align:center">'+c.qty+'</span>'
          +'<button onclick="changeQty(\''+c.code+'\',1)" style="border:1px solid var(--border);border-radius:4px;width:24px;height:24px;cursor:pointer">+</button>'
          +'<span style="flex:1;text-align:right;font-weight:700;color:var(--acc);font-size:.85rem">'+effectiveSubtotal(c).toLocaleString('th-TH')+' บาท</span>'
          +'<button onclick="removeCart(\''+c.code+'\')" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:.95rem">✕</button>'
          +'</div></div></div>';
      }
    }
    items.innerHTML=h;
  }
  const total=cart.reduce((s,c)=>s+effectiveSubtotal(c),0);
  const totalQtyCart=cart.reduce((s,c)=>s+(c.qty||0),0);
  document.getElementById('cartTotal').textContent = cart.length
    ? (cart.length + ' รายการ · ' + totalQtyCart + ' ชิ้น · รวม ' + total.toLocaleString('th-TH') + ' บาท')
    : 'รวม: 0 บาท';
}
function clearCart(){
  if(!cart.length) return;
  const cnt = cart.reduce((s,c) => s + c.qty, 0);
  if(!confirm('ล้างสินค้าทั้งหมดในตะกร้า ('+cart.length+' รายการ · '+cnt+' ชิ้น)?\nสินค้าจะถูกลบทั้งหมด ไม่สามารถย้อนกลับได้')) return;
  cart = [];
  clearCartStorage();
  resetAllCardButtons(); // ใช้ updateCardBtn ที่ดูสถานะ stock จริง
  renderCart();
}

// Reset ปุ่ม card บนทุก ItemCard บนหน้า — ใช้ updateCardBtn() ที่ดู stock
function resetAllCardButtons(){
  document.querySelectorAll('[id^="cbtn-"]').forEach(function(btn){
    const code = btn.id.replace('cbtn-', '');
    updateCardBtn(code); // เลือก preorder-btn (หมด) / add-btn (มี) / qty-ctrl (อยู่ใน cart) อัตโนมัติ
  });
}


// SKU click-to-copy (web cart sidebar) — robust + log
window.copySkuFromCart = function(ev, code){
  console.log('[copySkuFromCart] clicked, code:', code);
  if(ev && ev.stopPropagation) ev.stopPropagation();
  if(ev && ev.preventDefault) ev.preventDefault();
  const clean = String(code || '').replace(/\s+/g, '').trim();
  if(!clean){ console.warn('[copySkuFromCart] empty code, abort'); return; }

  // visual feedback function
  const target = ev && ev.target;
  const showOk = function(){
    if(!target) return;
    const origText = target.textContent;
    const origColor = target.style.color;
    target.style.color = '#06c755';
    target.style.fontWeight = '700';
    target.textContent = '✓ คัดลอก '+clean;
    setTimeout(function(){
      target.style.color = origColor;
      target.style.fontWeight = '';
      target.textContent = origText;
    }, 1500);
  };

  // execCommand fallback (works in most webviews)
  const execFallback = function(){
    try{
      const ta = document.createElement('textarea');
      ta.value = clean;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none;padding:0;margin:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      ta.setSelectionRange(0, clean.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      console.log('[copySkuFromCart] execCommand result:', ok);
      return ok;
    } catch(e){
      console.error('[copySkuFromCart] execCommand error:', e);
      return false;
    }
  };

  // Try modern clipboard API
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(clean).then(function(){
      console.log('[copySkuFromCart] clipboard.writeText OK');
      showOk();
    }).catch(function(err){
      console.warn('[copySkuFromCart] clipboard.writeText failed:', err, '— fallback to execCommand');
      if(execFallback()){ showOk(); }
      else { alert('คัดลอก SKU: '+clean+'\n(เครื่องไม่รองรับ auto-copy ให้ก๊อปด้วยมือ)'); }
    });
  } else {
    if(execFallback()){ showOk(); }
    else { alert('คัดลอก SKU: '+clean); }
  }
};

function toggleCart(){document.getElementById('cartPanel').classList.toggle('open');document.getElementById('overlay').classList.toggle('show');}
function closeCart(){document.getElementById('cartPanel').classList.remove('open');document.getElementById('overlay').classList.remove('show');if(typeof _bottomTabOverride !== 'undefined'){_bottomTabOverride = null; if(typeof updateBottomTabActive === 'function') updateBottomTabActive();}}

// ============================================================
// LIFF INTEGRATION — เปรียว VIP Catalog
// ============================================================
// 1. ใส่ LIFF ID ของคุณตรงนี้ (ได้จาก LINE Developers Console)
const LIFF_ID = '2010211018-V4JAFUOl'; // Priao VIP Catalog
const LINE_OA_URL = 'https://lin.ee/mDhRNMT'; // LINE OA ของเปรียว (Add Friend short URL)
// Sync LINE FAB href จาก const ตอน DOM ready (single source of truth)
(function syncLineFabHref(){
  function apply(){
    const fab = document.getElementById('lineFab');
    if(fab && fab.tagName === 'A') fab.href = LINE_OA_URL;
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
const LINE_OA_ID = 'evp5054h';                              // LINE OA Basic ID (จาก page.line.me/<id>)
const LINE_OA_DEEPLINK = 'line://ti/p/%40' + LINE_OA_ID;    // PC App deep link (Windows/Mac)
const ORDER_BACKUP_KEY = 'priao_last_order_backup';         // localStorage key สำหรับ order backup

// ==== Timing constants (เก็บไว้ที่เดียว — แก้ง่าย) ====
const LIFF_SEND_TIMEOUT_MS = 15000;   // timeout ของ liff.sendMessages
const COPY_BTN_RESET_MS = 1500;       // ปุ่มคัดลอกกลับเป็น default
const SMART_HEADER_DEBOUNCE_MS = 50;  // resize header debounce
const SMART_HEADER_INIT_MS = 500;     // initial check หลัง LIFF init
const SMART_HEADER_RECHECK_MS = 1500; // recheck หลังการเปลี่ยนแปลง
// ============================================================

let liffProfile = null;
let liffReady = false;
let liffInClient = false;

async function initLiff(){
  // ถ้ายังไม่ตั้งค่า LIFF_ID ข้ามไป (โหมด standalone web)
  if(!LIFF_ID || LIFF_ID === 'YOUR_LIFF_ID_HERE'){
    console.warn('[LIFF] LIFF_ID ยังไม่ได้ตั้งค่า — ทำงานในโหมด standalone');
    return;
  }
  // รอให้ LIFF SDK โหลด (retry สูงสุด 10 ครั้ง = 5 วินาที)
  let retries = 0;
  while(typeof liff === 'undefined' && retries < 10){
    console.log('[LIFF] waiting for SDK to load... attempt', retries+1);
    await new Promise(r => setTimeout(r, 500));
    retries++;
  }
  if(typeof liff === 'undefined'){
    console.error('[LIFF] SDK failed to load after 5 seconds');
    return;
  }
  try{
    await liff.init({liffId: LIFF_ID});
    liffReady = true;
    liffInClient = liff.isInClient();
    if(liff.isLoggedIn()){
      liffProfile = await liff.getProfile();
      _emit('liff-ready', { profile: liffProfile });
      // แสดง user badge บน header
      const badge = document.getElementById('pcUserBadge');
      const avatar = document.getElementById('pcUserAvatar');
      const name = document.getElementById('pcUserName');
      if(badge && liffProfile){
        badge.style.display = 'flex';
        if(liffProfile.pictureUrl) avatar.src = liffProfile.pictureUrl;
        name.textContent = liffProfile.displayName || 'VIP';
        // LIFF login เสร็จ — fill account VIP input ถ้ายังว่าง (ไม่เขียนทับ localStorage)
        const acctVip = document.getElementById('accountVipInput');
        if(acctVip && !acctVip.value){
          const saved = (function(){ try { return localStorage.getItem(VIP_LS_KEY) || ''; } catch(e){ return ''; } })();
          if(!saved){
            acctVip.value = liffProfile.displayName || '';
            try { localStorage.setItem(VIP_LS_KEY, acctVip.value); } catch(e){}
          }
        }
      }
    } else if(liffInClient){
      liff.login();
    }
  } catch(err){
    console.error('[LIFF] init failed:', err);
    _logError({
      type:'liff-init',
      msg:'liff.init failed: '+(err && err.message ? err.message : String(err)),
      time:new Date().toLocaleTimeString()
    });
  }
}

// สร้าง Order ID อัตโนมัติ: PR + YYMMDD + HHmm + random 2 หลัก
// (ใช้เป็น internal tracking ID ใน history — ไม่ได้แสดงให้ลูกค้าเห็นโดยตรง)
function genOrderId(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(-2);
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const rand = pad(Math.floor(Math.random()*100));
  return 'PR'+yy+mm+dd+hh+mi+rand;
}

// สร้าง Order Title แบบอ่านง่าย (ใช้แสดงในแชท/modal)
// รูปแบบ: "📋 ออเดอร์ขายส่ง DD-MM-YYYY+543/HH.MMน." (พ.ศ. ไทย)
// ตัวอย่าง: "📋 ออเดอร์ขายส่ง 22-06-2569/14.40น."
function genOrderTitle(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth()+1);
  const yyyy = d.getFullYear() + 543; // ค.ศ. → พ.ศ.
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return '📋 ออเดอร์ขายส่ง '+dd+'-'+mm+'-'+yyyy+'/'+hh+'.'+mi+'น.';
}

function getTimestampTH(){
  const d = new Date();
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const yy = d.getFullYear() + 543; // พ.ศ.
  const pad = n => String(n).padStart(2,'0');
  return d.getDate()+' '+months[d.getMonth()]+' '+String(yy).slice(-2)+' · '+pad(d.getHours())+':'+pad(d.getMinutes());
}

// Helper: ทำให้ image URL ปลอดภัย (HTTPS + fallback ถ้าไม่มี)
// เฉพาะ SKU (barcode ล้วน 1 บรรทัด/SKU ไม่มี # ไม่มีจำนวน)
// (buildSkuText + buildListText removed — dead since Format C migration)


// LIFF Batch Sending — text format (Format C)
// liff.sendMessages cap = 5 messages per call
const FLEX_BATCH_SIZE = 5;          // LIFF cap per call (used in sendOrder)

// ============================================================
// buildOrderMessages — Format C (SKU-first plain text)
// PC: drag-select + Ctrl+C · Mobile: long-press → คัดลอก
// LINE limit: 5000 chars/message · 5 messages/call
// ============================================================
const TEXT_MSG_LIMIT = 4500;  // safety margin under LINE 5000 cap

function buildOrderMessages(orderId, orderTitle, timestamp, customerName, cartItems, total){
  // แยกสินค้าพร้อมส่ง vs สั่งจอง (สินค้าหมด)
  const regularItems = [];
  const preorderItems = [];
  cartItems.forEach(function(c){
    const p = allProducts.find(function(x){ return x.code === c.code; });
    const isOOS = p && (p.tag === 'สินค้าหมดชั่วคราว' || p.stock <= 0);
    if(isOOS) preorderItems.push(c);
    else regularItems.push(c);
  });

  const totalQty = cartItems.reduce(function(s, c){ return s + (c.qty || 0); }, 0);
  const totalSavings = cartItems.reduce(function(s, c){
    const prod = allProducts.find(function(p){ return p.code === c.code; });
    // Promo applied savings: qty meets threshold → (stdPrice - promoPrice) × qty
    if(prod && prod.promoPrice && prod.promoMinQty && c.qty >= prod.promoMinQty){
      const savePerUnit = (prod.stdPrice || c.price) - prod.promoPrice;
      if(savePerUnit > 0) return s + savePerUnit * c.qty;
    }
    return s;
  }, 0);

  // Format 2 บรรทัด/item:
  //   1. NIVEA Cream 50ml
  //      8851001 ×2 = 240 (🔥 SALE — ลด 30% · เดิม 60)
  function fmtLine(c, idx){
    const prod = allProducts.find(function(p){ return p.code === c.code; });
    const lineTotal = effectiveSubtotal(c);
    let promoTag = '';
    if(prod && prod.promoType){
      const parts = [];
      // promoLabel เช่น "🏷 ซื้อ 6+ ราคาพิเศษ" หรือ "⚡ FLASH SALE"
      const label = (prod.promoLabel || '').trim();
      if(label) parts.push(label);
      // แสดง promoPrice + threshold สำหรับ context (เช่น "ราคาพิเศษ 222")
      const pp = prod.promoPrice || 0;
      if(pp > 0 && prod.promoMinQty && c.qty >= prod.promoMinQty){
        parts.push('ลดเหลือ ' + pp.toLocaleString('th-TH') + '/ชิ้น');
      } else if(pp > 0 && prod.promoMinQty){
        parts.push('ซื้อ ' + prod.promoMinQty + '+ ได้ราคา ' + pp.toLocaleString('th-TH'));
      }
      if(parts.length > 0) promoTag = ' (' + parts.join(' · ') + ')';
    }
    // 2-line format: ลำดับ + ชื่อสินค้า (โปร) → SKU ×qty = total
    return idx + '. ' + (c.name || '') + '\n   ' + c.code + ' ×' + c.qty + ' = ' + lineTotal.toLocaleString('th-TH') + promoTag;
  }

  // สร้าง lines ทั้งหมด
  const lines = [];
  lines.push(orderTitle || ('🛒 #' + orderId));
  lines.push('ลูกค้า: ' + (customerName || '-') + ' · ' + cartItems.length + ' รายการ · ' + totalQty + ' ชิ้น');
  lines.push(timestamp);
  lines.push('');

  if(regularItems.length > 0){
    lines.push('━ พร้อมส่ง (' + regularItems.length + ' รายการ) ━');
    regularItems.forEach(function(c, i){ lines.push(fmtLine(c, i + 1)); });
    lines.push('');
  }

  if(preorderItems.length > 0){
    lines.push('━ 📦 รอสินค้า (' + preorderItems.length + ' รายการ) ━');
    preorderItems.forEach(function(c, i){ lines.push(fmtLine(c, regularItems.length + i + 1)); });
    lines.push('');
    lines.push('💌 น้องเซลล์จะรีบเช็คสต๊อกและแจ้งรอบส่งกลับให้นะคะ');
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━');
  lines.push('💰 ยอดรวม: ' + total.toLocaleString('th-TH') + ' บาท');
  if(totalSavings > 0){
    lines.push('✓ ประหยัด: ' + totalSavings.toLocaleString('th-TH') + ' บาท');
  }

  // Split lines เป็น chunks ขนาด ≤ TEXT_MSG_LIMIT chars
  const chunks = [];
  let currentLines = [];
  let currentSize = 0;
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    const lineSize = line.length + 1; // +1 newline
    if(currentSize + lineSize > TEXT_MSG_LIMIT && currentLines.length > 0){
      chunks.push(currentLines.join('\n'));
      currentLines = [];
      currentSize = 0;
    }
    currentLines.push(line);
    currentSize += lineSize;
  }
  if(currentLines.length > 0) chunks.push(currentLines.join('\n'));

  // ใส่ continuation header ถ้ามีหลาย message
  const totalParts = chunks.length;
  const messages = chunks.map(function(text, idx){
    const finalText = (totalParts > 1 && idx > 0)
      ? (orderTitle || ('🛒 #' + orderId)) + ' (ต่อ ' + (idx + 1) + '/' + totalParts + ')\n' + text
      : text;
    console.log('[Text] msg', (idx+1)+'/'+totalParts, '·', finalText.length, 'chars');
    return { type: 'text', text: finalText };
  });

  console.log('[Text] TOTAL', messages.length, 'message(s) ·', cartItems.length, 'items');
  return messages;
}

// แสดง success modal
function showSuccessModal(orderId, orderTitle){
  const titleDisplay = orderTitle || ('#' + orderId);
  const mo = document.createElement('div');
  mo.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  mo.innerHTML =
    '<div style="background:#fff;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.3);animation:slideUp .4s ease">'
    +'<div style="width:72px;height:72px;background:#e8f8ee;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:38px;color:#06c755">✓</div>'
    +'<div style="font-size:1.2rem;font-weight:800;color:#0a1628;margin-bottom:8px">ส่งออเดอร์สำเร็จ!</div>'
    +'<div style="font-size:.85rem;color:#2080be;margin-bottom:4px;font-weight:700">'+titleDisplay+'</div>'
    +'<div style="font-size:.78rem;color:#888;line-height:1.6;margin-bottom:20px">รอน้อง Salesman แจ้งยอดชำระสักครู่ค่ะ</div>'
    +'<button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:12px;background:#2080be;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.9rem;font-family:inherit">ปิดหน้านี้</button>'
    +'</div>'
    +'<style>@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}</style>';
  document.body.appendChild(mo);
}

// แสดง fallback modal (สำหรับ browser ปกติ / desktop)
// เปิด modal ใหญ่แสดง QR ขนาด full ให้สแกนง่าย
function openQrZoom(qrSrc){
  const z = document.createElement('div');
  z.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;cursor:zoom-out';
  z.innerHTML =
    '<div style="background:#fff;padding:18px;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.5)">'
    +'<img src="'+qrSrc+'" alt="QR ใหญ่" style="display:block;width:min(85vw,500px);height:min(85vw,500px);max-width:500px;max-height:500px">'
    +'</div>'
    +'<div style="color:#fff;font-size:.95rem;margin-top:18px;font-weight:700;text-align:center;line-height:1.6">📲 เปิดกล้อง LINE ในมือถือ<br>เล็งให้เต็มกรอบ QR แล้วรอสักครู่</div>'
    +'<button style="margin-top:16px;padding:10px 24px;background:#fff;color:#0a1628;border:none;border-radius:24px;font-weight:700;cursor:pointer;font-family:inherit;font-size:.9rem">ปิด (หรือแตะที่ไหนก็ได้)</button>';
  z.onclick = function(){ document.body.removeChild(z); };
  document.body.appendChild(z);
}

// ============================================================
// Quick Send for PC — skip modal, do confirm + auto-copy + open LINE OA
// ============================================================
async function quickSendPC(orderId, orderTitle, timestamp, customerName, fullText, total){
  const itemCount = cart.length;
  const totalQty = cart.reduce(function(s,c){ return s + (c.qty || 0); }, 0);

  // 1. Show non-blocking preparing toast (auto-dismiss 3s) — replaces native confirm()
  showPreparingBanner(orderId, orderTitle, itemCount, total);

  // 2. Auto-copy + store for retry (+ localStorage backup)
  window._lastOrderText = fullText;
  window._lastOrderInfo = { orderId: orderId, orderTitle: orderTitle, total: total, itemCount: itemCount, customerName: customerName, fullText: fullText, ts: Date.now() };
  try{ localStorage.setItem(ORDER_BACKUP_KEY, JSON.stringify(window._lastOrderInfo)); }catch(e){}
  let copyOk = false;
  if(navigator.clipboard && navigator.clipboard.writeText){
    try{ await navigator.clipboard.writeText(fullText); copyOk = true; }
    catch(e){ console.warn('[quickSendPC] clipboard failed:', e); }
  }
  if(!copyOk){
    // execCommand fallback
    try{
      const ta = document.createElement('textarea');
      ta.value = fullText;
      ta.setAttribute('readonly','');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      copyOk = document.execCommand('copy');
      document.body.removeChild(ta);
    }catch(e){ console.warn('[quickSendPC] execCommand failed:', e); }
  }

  // 2.5. Auto-open LINE PC App chat → ลูกค้าแค่ Ctrl+V → Enter
  try{
    const lineA = document.createElement('a');
    lineA.href = LINE_OA_DEEPLINK;
    lineA.target = '_blank';
    lineA.style.display = 'none';
    document.body.appendChild(lineA);
    lineA.click();
    setTimeout(function(){
      try{ if(lineA.parentNode) lineA.parentNode.removeChild(lineA); }catch(e){}
    }, 200);
  }catch(e){ console.warn('[quickSendPC] line:// trigger failed:', e); }

  // 3. Show toast (immediate feedback)
  showQuickSendToast(orderId, orderTitle, itemCount, total, copyOk);

  // 4. Background detection — ถ้า LINE ไม่เปิดใน 8s → auto show Help Modal
  // (set up FIRST — start counting from t=0 when LINE was triggered)
  let _detected = false;
  let _safetyTimer = null;
  function _cleanup(){
    window.removeEventListener('blur', _onBlur);
    document.removeEventListener('visibilitychange', _onVis);
    if(_safetyTimer){ clearTimeout(_safetyTimer); _safetyTimer = null; }
  }
  function _markDetected(){
    if(_detected) return;
    _detected = true;
    _cleanup();
  }
  function _onBlur(){ _markDetected(); }
  function _onVis(){ if(document.hidden){ _markDetected(); } }
  window.addEventListener('blur', _onBlur);
  document.addEventListener('visibilitychange', _onVis);
  _safetyTimer = setTimeout(function(){
    _cleanup();
    if(!_detected){
      // LINE ไม่เปิดในเวลาที่ควรจะเป็น → แสดง Help Modal
      showOrderHelp();
    }
  }, 8000);

  // 5. Clear cart + close — wait 2s ให้ user เห็น loading state + banner ก่อน
  // ใช้ await Promise → sendOrder's await waits 2s before unlocking _sendingInProgress
  // ป้องกัน race condition: user คลิก "ส่ง" ซ้ำใน 2s window ที่ cart ยังมี items
  await new Promise(function(resolve){
    setTimeout(function(){
      cart = [];
      clearCartStorage();
      resetAllCardButtons();
      renderCart();
      closeCart();
      resolve();
    }, 2000);
  });

  return true;
}

// === Order Help Modal Functions ===
function showOrderHelp(){
  // Load from localStorage if memory cleared
  if(!window._lastOrderInfo){
    try{
      const stored = localStorage.getItem(ORDER_BACKUP_KEY);
      if(stored){
        const data = JSON.parse(stored);
        // Expire after 24h
        if(data && (Date.now() - (data.ts||0)) < 86400000){
          window._lastOrderInfo = data;
          window._lastOrderText = data.fullText;
        }
      }
    }catch(e){}
  }
  // Populate order info display
  const infoEl = document.getElementById('helpOrderInfo');
  if(infoEl){
    if(window._lastOrderInfo){
      const i = window._lastOrderInfo;
      infoEl.textContent = (i.orderTitle || ('#' + (i.orderId||'?'))) + ' · ' + (i.itemCount||0) + ' รายการ · ' + (i.total||0).toLocaleString('th-TH') + ' บาท';
    } else {
      infoEl.textContent = '(ไม่พบข้อมูลออเดอร์ล่าสุด)';
    }
  }
  // Auto-attempt copy ในกรณี clipboard ถูกแทนที่แล้ว
  if(window._lastOrderText && navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(window._lastOrderText).catch(function(){});
  }
  const m = document.getElementById('orderHelpOverlay');
  if(m){ m.style.display = 'flex'; }
}
function copyOrderTextDirect(){
  const btn = document.getElementById('helpCopyBtn');
  const txt = window._lastOrderText || '';
  if(!txt){ alert('ไม่พบข้อความออเดอร์'); return; }
  const onOk = function(){
    if(btn){
      const old = btn.innerHTML;
      btn.innerHTML = '✓ คัดลอกแล้ว!';
      btn.style.background = '#10b981';
      setTimeout(function(){
        btn.innerHTML = old;
        btn.style.background = '';
      }, 1800);
    }
  };
  function execFallback(){
    try{
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly','');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if(ok) onOk(); else alert('คัดลอกไม่ได้ · กรุณาเลือก+Ctrl+C เอง\n\n' + txt);
    } catch(e){ alert(txt); }
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(onOk).catch(execFallback);
  } else {
    execFallback();
  }
}
window.copyOrderTextDirect = copyOrderTextDirect;
function closeOrderHelp(){
  const m = document.getElementById('orderHelpOverlay');
  if(m){ m.style.display = 'none'; }
}
function retryOpenLinePC(){
  try{
    const a = document.createElement('a');
    a.href = LINE_OA_DEEPLINK;
    a.target = '_blank';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ try{ a.parentNode && a.parentNode.removeChild(a); }catch(e){} }, 200);
  }catch(e){ console.warn('retry line:// failed:', e); }
}
function showOrderTextModal(){
  const m = document.getElementById('orderTextOverlay');
  const ta = document.getElementById('orderTextArea');
  if(ta){ ta.value = window._lastOrderText || '(ไม่มีข้อความออเดอร์ล่าสุด)'; }
  if(m){ m.style.display = 'flex'; }
  // Close Help modal underneath
  closeOrderHelp();
  // Auto-select textarea
  setTimeout(function(){ if(ta){ ta.focus(); ta.select(); } }, 100);
}
function closeOrderTextModal(){
  const m = document.getElementById('orderTextOverlay');
  if(m){ m.style.display = 'none'; }
}
function copyOrderTextNow(){
  const btn = document.getElementById('orderTextCopyBtn');
  const txt = window._lastOrderText || '';
  if(!txt) return;
  const onOk = function(){
    if(btn){
      const old = btn.textContent;
      btn.textContent = '✓ คัดลอกแล้ว!';
      setTimeout(function(){ btn.textContent = old; }, 1500);
    }
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(onOk).catch(function(){
      const ta = document.getElementById('orderTextArea');
      if(ta){ ta.focus(); ta.select(); document.execCommand('copy'); onOk(); }
    });
  } else {
    const ta = document.getElementById('orderTextArea');
    if(ta){ ta.focus(); ta.select(); document.execCommand('copy'); onOk(); }
  }
}
window.showOrderHelp = showOrderHelp;
window.closeOrderHelp = closeOrderHelp;
window.retryOpenLinePC = retryOpenLinePC;
window.showOrderTextModal = showOrderTextModal;
window.closeOrderTextModal = closeOrderTextModal;
window.copyOrderTextNow = copyOrderTextNow;

// ─── Preparing banner (non-blocking toast 3s) — แสดงตอนเริ่มส่งออเดอร์ PC ───
function showPreparingBanner(orderId, orderTitle, itemCount, total){
  // Inject keyframes once
  if(!document.getElementById('prep-anim')){
    const s = document.createElement('style');
    s.id = 'prep-anim';
    s.textContent = '@keyframes prepSlideDown{from{transform:translate(-50%,-120%);opacity:0}to{transform:translate(-50%,0);opacity:1}}@keyframes prepSlideUp{from{transform:translate(-50%,0);opacity:1}to{transform:translate(-50%,-120%);opacity:0}}';
    document.head.appendChild(s);
  }
  // Remove existing banner if any
  const existing = document.getElementById('prep-banner');
  if(existing) existing.remove();
  // Build banner
  const b = document.createElement('div');
  b.id = 'prep-banner';
  b.style.cssText = 'position:fixed;top:20px;left:50%;transform:translate(-50%,0);background:#fff;color:#0a1628;border:1.5px solid #25a9e0;border-radius:12px;padding:14px 22px;box-shadow:0 8px 28px rgba(37,169,224,.35);z-index:10000;font-family:inherit;animation:prepSlideDown .35s ease;min-width:300px;max-width:90vw';
  b.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px">' +
      '<div style="width:30px;height:30px;border-radius:50%;background:#25a9e0;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>' +
      '<div style="flex:1;min-width:0;line-height:1.4">' +
        '<div style="font-size:.85rem;font-weight:600;color:#0a1628">กำลังเตรียม ' + (orderTitle || ('ออเดอร์ #' + orderId)) + '</div>' +
        '<div style="font-size:.72rem;color:#6B7280;margin-top:2px">' + itemCount.toLocaleString('th-TH') + ' รายการ • ' + total.toLocaleString('th-TH') + ' บาท</div>' +
        '<div style="font-size:.68rem;color:#0f6e56;margin-top:4px;font-weight:600">คัดลอกแล้ว — เปิด LINE → Ctrl+V → Enter</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(b);
  // Auto-dismiss after 5s with slide-up animation
  setTimeout(function(){
    b.style.animation = 'prepSlideUp .35s ease forwards';
    setTimeout(function(){ if(b.parentNode) b.remove(); }, 400);
  }, 5000);
}

function showQuickSendToast(orderId, orderTitle, count, total, copyOk){
  // Remove existing toast if any
  const existing = document.getElementById('quick-send-toast');
  if(existing) existing.remove();

  // Inject animation CSS once
  if(!document.getElementById('quick-send-toast-style')){
    const s = document.createElement('style');
    s.id = 'quick-send-toast-style';
    s.textContent = '@keyframes qsSlideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes qsSlideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(120%);opacity:0}}';
    document.head.appendChild(s);
  }

  const t = document.createElement('div');
  t.id = 'quick-send-toast';
  t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#06c755,#0fa54a);color:#fff;padding:18px 22px;border-radius:14px;box-shadow:0 8px 28px rgba(6,199,85,.45);z-index:10000;max-width:380px;animation:qsSlideIn .3s ease;font-family:inherit';

  const copyStatus = copyOk
    ? '✓ ออเดอร์อยู่ใน clipboard แล้ว'
    : '⚠ คัดลอกอัตโนมัติไม่สำเร็จ';

  t.innerHTML = ''
    + '<div style="font-weight:800;font-size:1rem;margin-bottom:8px">✓ ' + (orderTitle || ('#' + orderId)) + ' พร้อมส่ง</div>'
    + '<div style="font-size:.8rem;line-height:1.7;opacity:.95;margin-bottom:10px">'
      + count + ' รายการ · ' + total.toLocaleString('th-TH') + ' บาท<br>'
      + '<strong>' + copyStatus + '</strong>'
    + '</div>'
    + '<div style="background:rgba(255,255,255,.18);padding:10px 12px;border-radius:8px;font-size:.8rem;line-height:1.7">'
      + '<strong>📲 LINE PC กำลังเปิดแชตเปรียว...</strong><br>'
      + '1. รอ LINE Desktop เปิดเสร็จ<br>'
      + '2. กด <strong>Ctrl+V → Enter</strong>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px">'
      + '<button id="qsRetryCopy" style="flex:1;background:rgba(255,255,255,.22);color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;font-size:.75rem;font-weight:700;font-family:inherit">📋 คัดลอกอีกครั้ง</button>'
      + '<button id="qsDismiss" style="flex:1;background:rgba(255,255,255,.12);color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;font-size:.75rem;font-weight:700;font-family:inherit">ปิด</button>'
    + '</div>';

  document.body.appendChild(t);

  // Retry copy button
  const retryBtn = document.getElementById('qsRetryCopy');
  if(retryBtn && window._lastOrderText){
    retryBtn.onclick = function(ev){
      ev.stopPropagation();
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(window._lastOrderText).then(function(){
          retryBtn.textContent = '✓ คัดลอกแล้ว!';
          setTimeout(function(){ retryBtn.textContent = '📋 คัดลอกอีกครั้ง'; }, 1500);
        }).catch(function(){ alert(window._lastOrderText); });
      } else { alert(window._lastOrderText); }
    };
  }

  // Dismiss button
  const dismissBtn = document.getElementById('qsDismiss');
  if(dismissBtn){
    dismissBtn.onclick = function(){
      t.style.animation = 'qsSlideOut .25s ease forwards';
      setTimeout(function(){ t.remove(); }, 280);
    };
  }

  // Auto-dismiss after 12 sec (longer — user needs time to switch + paste)
  setTimeout(function(){
    if(document.getElementById('quick-send-toast')){
      t.style.animation = 'qsSlideOut .3s ease forwards';
      setTimeout(function(){ t.remove(); }, 350);
    }
  }, 12000);
}

function showFallbackModal(orderId, orderTitle, timestamp, text, shortText){
  // shortText: optional compact version for QR URL (fits LINE share URL ~1000 char limit)
  // text: full version for clipboard + modal display
  shortText = shortText || text;
  // auto copy
  if(navigator.clipboard) navigator.clipboard.writeText(text).catch(function(){});

  const mo = document.createElement('div');
  mo.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  // ใช้ line.me/R/msg/text/ → เปิด LINE share dialog พร้อม text pre-fill
  // shortText (compact) สำหรับ URL — กัน URL ยาวเกิน LINE share limit ~2000 chars
  const lineShareUrl = 'https://line.me/R/msg/text/?'+encodeURIComponent(shortText);
  const QR_URL_LIMIT = 2000;  // QR-encodable limit (line.me typically truncates beyond this)
  const qrFeasible = lineShareUrl.length <= QR_URL_LIMIT;
  // QR: ใช้ ECC=L + margin=4 เพื่อลด density (สแกนง่ายขึ้นด้วยกล้องคุณภาพต่ำ)
  const qrBase = 'https://api.qrserver.com/v1/create-qr-code/?ecc=L&margin=4&data='+encodeURIComponent(lineShareUrl);
  const qrUrl  = qrBase + '&size=240x240';   // default ใน modal
  const qrBig  = qrBase + '&size=600x600';   // ใหญ่สำหรับคลิกขยาย

  mo.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:24px;max-width:460px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.3)">'
    +'<div style="font-weight:800;font-size:1.05rem;color:#2080be;margin-bottom:4px">'+(orderTitle || ('สรุปออเดอร์ #'+orderId))+'</div>'
    +'<div style="font-size:.75rem;color:#888;margin-bottom:14px">'+timestamp+'</div>'
    +'<div style="background:#e8f8ee;border:1px solid #06c755;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.82rem;color:#07a248;font-weight:700;text-align:center">✓ คัดลอกออเดอร์แล้ว</div>'
    +'<div style="border:1px solid #e0eaf3;border-radius:10px;margin:0 0 14px;max-height:280px;overflow-y:auto">'
    + (function(){
        var rows = '';
        cart.forEach(function(c, i){
          var prod = allProducts.find(function(p){ return p.code === c.code; });
          var img = (prod && prod.imageUrl) ? prod.imageUrl : '';
          var promoBadge = '';
          if(prod && prod.promoType){
            var pp = [];
            var pLabel = (prod.promoLabel || '').trim();
            if(pLabel) pp.push(pLabel);
            var pPP = prod.promoPrice || 0;
            if(pPP > 0 && prod.promoMinQty && c.qty >= prod.promoMinQty){
              pp.push('ลดเหลือ ' + pPP.toLocaleString('th-TH') + '/ชิ้น');
            } else if(pPP > 0 && prod.promoMinQty){
              pp.push('ซื้อ ' + prod.promoMinQty + '+ ได้ ' + pPP.toLocaleString('th-TH'));
            }
            if(pp.length > 0){
              var pColor = prod.promoType === 'step_price' ? {bg:'#F0F7FF',fg:'#0C447C',bd:'#2080BE'}
                          : prod.promoType === 'flash' ? {bg:'#FEF2F2',fg:'#7F1D1D',bd:'#DC2626'}
                          : {bg:'#f4f8fc',fg:'#666',bd:'#b8d9f0'};
              promoBadge = '<div style="margin-top:4px;display:inline-block;font-size:.65rem;background:'+pColor.bg+';color:'+pColor.fg+';border:1px solid '+pColor.bd+';padding:2px 8px;border-radius:6px;font-weight:700">'+pp.join(' · ').replace(/</g,'&lt;')+'</div>';
            }
          }
          rows += '<div style="display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid #f0f4f8;align-items:flex-start">'
            + (img
                ? '<img src="'+img+'" alt="" loading="lazy" onerror="this.style.display=\'none\'" style="width:48px;height:48px;border-radius:6px;object-fit:cover;background:#f4f8fc;flex-shrink:0;border:1px solid #e6f1fb">'
                : '<div style="width:48px;height:48px;border-radius:6px;background:linear-gradient(135deg,#dceeff,#b8d9f0);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#2080be;font-weight:800;font-size:1rem">'+(i+1)+'</div>')
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:.78rem;font-weight:600;color:#0a1628;line-height:1.35;margin-bottom:2px">'+(i+1)+'. '+String(c.name||'').replace(/</g,'&lt;')+'</div>'
            + '<div style="font-size:.68rem;color:#999;margin-bottom:2px">#'+String(c.code||'')+'</div>'
            + '<div style="display:flex;justify-content:space-between;font-size:.72rem"><span style="color:#888">'+effectiveUnitPrice(c).toLocaleString('th-TH')+' × '+c.qty+'</span><span style="color:#2080be;font-weight:700">'+effectiveSubtotal(c).toLocaleString('th-TH')+' ฿</span></div>'
            + promoBadge
            + '</div>'
            + '</div>';
        });
        var totalQty = cart.reduce(function(s,c){ return s + (c.qty||0); }, 0);
        var total = cart.reduce(function(s,c){ return s + effectiveSubtotal(c); }, 0);
        return rows
          + '<div style="display:flex;justify-content:space-between;padding:12px 14px;background:#f4f8fc;font-weight:800"><span style="color:#0a1628;font-size:.8rem">ยอดรวม ('+cart.length+' รายการ · '+totalQty+' ชิ้น)</span><span style="color:#0a1628;font-size:1rem">'+total.toLocaleString('th-TH')+' บาท</span></div>';
      })()
    +'</div>'
    +'<details style="margin:0 0 14px"><summary style="cursor:pointer;font-size:.72rem;color:#4e9ecf;padding:4px 0">📋 ดูข้อความ raw (สำหรับ copy)</summary><pre style="white-space:pre-wrap;font-size:.7rem;background:#f5f7fa;border-radius:8px;padding:10px;margin:8px 0 0;font-family:inherit;line-height:1.6;max-height:160px;overflow-y:auto">'+text.replace(/</g,'&lt;')+'</pre></details>'
    +(isMobile
      ? '<div style="display:flex;flex-direction:column;gap:8px">'
        +'<button id="fbLineBtn" style="width:100%;padding:12px;background:#06c755;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.9rem;font-family:inherit">📲 ส่งออเดอร์ไป LINE (pre-fill text)</button>'
        +'<button id="fbCopyBtn" style="width:100%;padding:10px;background:#2080be;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.82rem;font-family:inherit">คัดลอกอีกครั้ง</button>'
        +'<button id="fbCloseBtn" style="width:100%;padding:10px;background:#eee;color:#555;border:none;border-radius:10px;cursor:pointer;font-size:.82rem;font-family:inherit">ปิด</button>'
        +'</div>'
      : '<div style="background:linear-gradient(135deg,#e8f8ee,#d4f3df);border:2px solid #06c755;padding:18px;border-radius:12px;margin-bottom:14px">'
          +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span style="font-size:1.4rem">✓</span><strong style="color:#06c755;font-size:.95rem">ออเดอร์อยู่ใน clipboard แล้ว</strong></div>'
          +'<div style="background:#fff;border-radius:10px;padding:12px;font-size:.85rem;color:#0a1628;line-height:1.8">'
            +'<strong style="color:#2080be">วิธีส่งใน 3 ขั้นตอน:</strong><br>'
            +'1. กดปุ่ม <strong>📤 เปิดแชต LINE OA</strong> ด้านล่าง<br>'
            +'2. กด <strong>Ctrl+V</strong> ในช่องพิมพ์<br>'
            +'3. กด <strong>Enter</strong> ส่งเลย'
          +'</div>'
        +'</div>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
        +'<button id="fbLineBtn" style="flex:2;padding:14px;background:#06c755;color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;font-size:.95rem;font-family:inherit;min-width:200px">📤 เปิดแชต LINE OA</button>'
        +'<button id="fbCopyBtn" style="flex:1;padding:14px;background:#2080be;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.85rem;font-family:inherit;min-width:130px">📋 คัดลอกอีกครั้ง</button>'
        +'<button id="fbCloseBtn" style="padding:14px 18px;background:#eee;color:#555;border:none;border-radius:10px;cursor:pointer;font-size:.85rem;font-family:inherit">ปิด</button>'
        +'</div>'
        +(qrFeasible
          ? '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:.75rem;color:#888;padding:6px 0">📲 หรือใช้ Mobile ส่งแทน (QR) ▾</summary><div style="display:flex;gap:14px;align-items:center;background:#f4f8fc;padding:12px;border-radius:8px;margin-top:8px"><img id="qrImgEl" src="'+qrUrl+'" alt="QR" style="width:120px;height:120px;border-radius:6px;background:#fff;cursor:zoom-in;border:2px solid #e6f1fb" onclick="openQrZoom(\''+qrBig+'\')" onerror="this.style.display=\'none\'"><div style="flex:1;font-size:.75rem;color:#666;line-height:1.5">สแกนด้วยกล้อง LINE ในมือถือ<br>→ เลือกแชท → text pre-fill</div></div></details>'
          : '<div style="margin-top:10px;font-size:.72rem;color:#999;text-align:center">ออเดอร์ใหญ่ — QR ใช้ไม่ได้ ใช้ Copy + Paste แทน</div>'))
    +'</div>';
  document.body.appendChild(mo);

  document.getElementById('fbLineBtn').onclick = function(){
    // Mobile: ใช้ lineShareUrl (pre-fill ผ่าน share dialog)
    // Desktop: ใช้ LINE_OA_URL ตรง (user paste เอง — เร็วกว่า)
    const targetUrl = isMobile ? lineShareUrl : (typeof LINE_OA_URL !== 'undefined' ? LINE_OA_URL : lineShareUrl);
    window.open(targetUrl, '_blank');
  };
  document.getElementById('fbCopyBtn').onclick = function(){
    navigator.clipboard.writeText(text).then(function(){
      const b = document.getElementById('fbCopyBtn');
      b.textContent = 'คัดลอกแล้ว!';
      setTimeout(function(){ b.textContent = 'คัดลอกอีกครั้ง'; }, COPY_BTN_RESET_MS);
    }).catch(function(){ alert(text); });
  };
  document.getElementById('fbCloseBtn').onclick = function(){ document.body.removeChild(mo); };
}

// === Search Autocomplete Dropdown ===
// === Debounce for search input (P1+P2 fix) ===
let _catSearchTimer = null;
let _searchSugTimer = null;
function onCatSearchInput(input){
  // Debounce both applyFilter and suggestions
  clearTimeout(_catSearchTimer);
  _catSearchTimer = setTimeout(function(){
    // ใช้ setNavState — skip scroll เพราะ user กำลังพิมพ์อยู่ ไม่ควรกระชากขึ้นบนสุด
    setNavState({search: input.value.trim(), page: 1}, {skipScroll: true});
  }, 200);
  // Suggestions debounced separately (faster)
  clearTimeout(_searchSugTimer);
  _searchSugTimer = setTimeout(function(){
    showSearchSuggestions(input, 'catSearchDropdown');
  }, 120);
}
function onHomeSearchInput(input){
  clearTimeout(_searchSugTimer);
  _searchSugTimer = setTimeout(function(){
    showSearchSuggestions(input, 'homeSearchDropdown');
  }, 120);
}
window.onCatSearchInput = onCatSearchInput;
window.onHomeSearchInput = onHomeSearchInput;

function showSearchSuggestions(input, dropdownId){
  const q = (input.value || '').trim();
  const dropdown = document.getElementById(dropdownId);
  if(!dropdown) return;
  if(!q){ dropdown.classList.remove('show'); return; }
  const qLower = q.toLowerCase();
  const html = [];

  // 1. Match categories (CAT_NAMES + CAT_EMOJI)
  const matchedCats = [];
  if(typeof CAT_NAMES !== 'undefined'){
    for(const k in CAT_NAMES){
      const name = CAT_NAMES[k] || '';
      if(name.toLowerCase().includes(qLower)){
        matchedCats.push({id:k, name:name, emoji:(typeof CAT_EMOJI!=='undefined'?CAT_EMOJI[k]:'')||'📂'});
      }
    }
  }
  if(matchedCats.length){
    html.push('<div class="sug-section"><div class="sug-section-hdr">หมวดหมู่</div>');
    matchedCats.slice(0,3).forEach(function(c){
      const safeCatId = String(c.id||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      html.push('<div class="sug-item" onmousedown="event.preventDefault()" onclick="selectSug(\'cat\',\''+safeCatId+'\')"><span class="sug-icon">'+c.emoji+'</span><span class="sug-text">'+esc(c.name)+'</span></div>');
    });
    html.push('</div>');
  }

  // 2. Match brands (distinct from allProducts)
  const brandSet = new Set();
  if(typeof allProducts !== 'undefined'){
    for(let i=0;i<allProducts.length;i++){
      const b = allProducts[i].brand;
      if(b && b.toLowerCase().includes(qLower)) brandSet.add(b);
      if(brandSet.size >= 8) break;
    }
  }
  const brands = Array.from(brandSet).slice(0, 5);
  if(brands.length){
    html.push('<div class="sug-section"><div class="sug-section-hdr">แบรนด์</div>');
    brands.forEach(function(b){
      const safe = b.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      html.push('<div class="sug-item" onmousedown="event.preventDefault()" onclick="selectSug(\'brand\',\''+safe+'\')"><span class="sug-icon">🏷️</span><span class="sug-text">'+esc(b)+'</span></div>');
    });
    html.push('</div>');
  }

  // 3. Match subcategories
  const subcatSet = new Set();
  if(typeof subcatMap !== 'undefined'){
    for(const cat in subcatMap){
      const arr = subcatMap[cat] || [];
      for(let i=0;i<arr.length;i++){
        if(arr[i].toLowerCase().includes(qLower)) subcatSet.add(arr[i]);
      }
    }
  }
  const subcats = Array.from(subcatSet).slice(0, 5);
  if(subcats.length){
    html.push('<div class="sug-section"><div class="sug-section-hdr">หมวดย่อย</div>');
    subcats.forEach(function(s){
      const safe = s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      html.push('<div class="sug-item" onmousedown="event.preventDefault()" onclick="selectSug(\'subcat\',\''+safe+'\')"><span class="sug-icon">📁</span><span class="sug-text">'+esc(s)+'</span></div>');
    });
    html.push('</div>');
  }

  // 4. Match products (top 5 by name)
  const matchedProducts = [];
  if(typeof allProducts !== 'undefined'){
    for(let i=0;i<allProducts.length && matchedProducts.length<5;i++){
      const p = allProducts[i];
      if((p.name||'').toLowerCase().includes(qLower) || (p.code||'').includes(q)){
        matchedProducts.push(p);
      }
    }
  }
  if(matchedProducts.length){
    html.push('<div class="sug-section"><div class="sug-section-hdr">สินค้า</div>');
    matchedProducts.forEach(function(p){
      const shortName = p.name.length > 38 ? p.name.substring(0,38)+'…' : p.name;
      const safeCode = String(p.code||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      html.push('<div class="sug-item" onmousedown="event.preventDefault()" onclick="selectSug(\'product\',\''+safeCode+'\')"><span class="sug-icon">📦</span><span class="sug-text">'+esc(shortName)+'</span><span class="sug-meta">'+p.stdPrice+' ฿</span></div>');
    });
    html.push('</div>');
  }

  // 5. Empty state
  if(!html.length){
    html.push('<div class="sug-empty">');
    html.push('ไม่พบคำที่ตรงกับ <strong>"'+esc(q)+'"</strong>');
    html.push('<small>ลองค้นหาด้วยคำสั้นกว่า หรือใช้คำพ้องอื่น</small>');
    html.push('<div class="sug-hint">💡 ลองเปิดเมนู ☰ เพื่อดูหมวดหมู่ทั้งหมด</div>');
    html.push('</div>');
  }

  dropdown.innerHTML = html.join('');
  dropdown.classList.add('show');
}

function selectSug(type, value){
  closeSearchDropdowns();
  if(type === 'cat'){
    goCat(value);
  } else if(type === 'brand'){
    goB(value);
  } else if(type === 'subcat'){
    // Find which category this subcat belongs to
    let foundCat = null;
    if(typeof subcatMap !== 'undefined'){
      for(const cat in subcatMap){
        if((subcatMap[cat]||[]).indexOf(value) >= 0){ foundCat = cat; break; }
      }
    }
    if(foundCat){
      goCat(foundCat);
      setTimeout(function(){ if(typeof setSub === 'function') setSub(value); }, 80);
    }
  } else if(type === 'product'){
    // Navigate to catalog filtered by product code
    const p = (typeof allProducts !== 'undefined') ? allProducts.find(function(x){return x.code===value;}) : null;
    if(!p) return;
    if(typeof _pushHistory === 'function') _pushHistory();
    document.getElementById('home').style.display='none';
    document.getElementById('catalog').style.display='';
    const si = document.getElementById('catSearch'); if(si) si.value = value;
    const backBtnBar = document.getElementById('backBtnBar');
    if(backBtnBar) backBtnBar.classList.add('show');
    if(typeof updateActiveCatBar === 'function') updateActiveCatBar('search', 'ค้นหา: '+value, FILTER_SVG.search);
    setNavState({cat:'all', sub:'all', tag:'all', search:value, page:1});
  }
}

function closeSearchDropdowns(){
  const dds = document.querySelectorAll('.search-dropdown');
  for(let i=0;i<dds.length;i++) dds[i].classList.remove('show');
}

// Close dropdown on outside click
document.addEventListener('click', function(e){
  if(!e.target.closest('.search-bar-wrap') && !e.target.closest('.pc-search-wrap')){
    closeSearchDropdowns();
  }
});

window.showSearchSuggestions = showSearchSuggestions;
window.selectSug = selectSug;
window.closeSearchDropdowns = closeSearchDropdowns;

// === Bottom Tab Bar (Mobile/Tablet) ===
// ============================================================
// Bottom Navigation Bar logic → js/bottom-nav.js
//   Functions accessible via window.*:
//     bottomTabClick, updateBottomTabActive, updateBottomTabCartBadge,
//     showAccountModal, closeAccountModal, updateIndicatorPosition,
//     _clearTabOverride, _closeCartPanel, _closeAccountModal
//   Group D contract preserved: updateSidebarActive() still calls
//   _clearTabOverride() + updateBottomTabActive() via global typeof check
// ============================================================

// === Mobile Side Drawer (Hamburger Menu) ===
// NOTE: เคารพ body.catalog-mode lock (Group I) — เก็บ overflow เดิมไว้ก่อน set
// ไม่ overwrite class-based lock — ใช้ data attribute เก็บ previous value
function openMobDrawer(){
  buildMobDrawer();
  document.getElementById('mobDrawerOverlay').classList.add('show');
  document.getElementById('mobDrawer').classList.add('show');
  // ถ้า body อยู่ใน catalog-mode อยู่แล้ว → overflow:hidden อยู่แล้ว, ไม่ต้องแตะ
  // ถ้า home page → ต้อง lock ตอนเปิด drawer
  if(!document.body.classList.contains('catalog-mode')){
    document.body.dataset.drawerLocked = '1';
    document.body.style.overflow = 'hidden';
  }
}
function closeMobDrawer(){
  document.getElementById('mobDrawerOverlay').classList.remove('show');
  document.getElementById('mobDrawer').classList.remove('show');
  // Restore overflow เฉพาะกรณีที่ open() เป็นคน lock เอง
  if(document.body.dataset.drawerLocked === '1'){
    document.body.style.overflow = '';
    delete document.body.dataset.drawerLocked;
  }
}
function buildMobDrawer(){
  const body = document.getElementById('mobDrawerBody');
  if(!body || typeof RAW_DATA === 'undefined') return;
  const isHome = document.getElementById('home') && document.getElementById('home').style.display !== 'none';
  let h = '';
  // Filters section
  h += '<div class="mob-drawer-hdr-section">กรอง</div>';
  h += '<button class="mob-drawer-btn '+(isHome?'active':'')+'" onclick="goHomeFromDrawer()"><span class="drawer-icon">'+FILTER_SVG.home+'</span> หน้าหลัก</button>';
  h += '<button class="mob-drawer-btn '+(curTag==='Hot'?'active':'')+'" onclick="closeMobDrawer();setMobTag(\'Hot\')"><span class="drawer-icon drawer-icon-hot">'+FILTER_SVG.hot+'</span> สินค้าขายดี</button>';
  h += '<button class="mob-drawer-btn '+(curTag==='New'?'active':'')+'" onclick="closeMobDrawer();setMobTag(\'New\')"><span class="drawer-icon drawer-icon-new">'+FILTER_SVG.new+'</span> สินค้าใหม่</button>';
  h += '<button class="mob-drawer-btn '+(curTag==='Promo' && curPromoType==='all' ? 'active':(curTag==='Promo'?'parent-active':''))+'" onclick="expandMobPromo()"><span class="drawer-icon drawer-icon-promo">'+FILTER_SVG.promo+'</span> สินค้าโปรโมชั่น <span class="mob-drawer-chevron">'+(curTag==='Promo'?'▾':'▸')+'</span></button>';
  // Promo sub-items — แสดงเฉพาะตอน curTag === 'Promo' (auto-hide types ที่ไม่มีสินค้า)
  if(curTag === 'Promo'){
    const promoCounts = countPromoTypes();
    for(const [pkey, pconf] of Object.entries(PROMO_TYPES)){
      const cnt = promoCounts[pkey] || 0;
      if(cnt === 0) continue;
      const subActive = (curPromoType === pkey) ? 'active' : '';
      h += '<button class="mob-drawer-btn mob-drawer-sub '+subActive+'" data-promo-type="'+pkey+'" onclick="closeMobDrawer();setPromoType(\''+pkey+'\')">'
         + '<span class="drawer-icon drawer-sub-icon" style="color:'+pconf.color+'">'+pconf.icon+'</span> '
         + pconf.label
         + ' <span class="cnt">('+cnt.toLocaleString()+')</span>'
         + '</button>';
    }
  }
  h += '<div class="mob-drawer-divider"></div>';
  // Categories section
  h += '<div class="mob-drawer-hdr-section">หมวดหมู่</div>';
  h += '<button class="mob-drawer-btn '+(!isHome && curCat==='all' && curTag==='all' && !curSearch ?'active':'')+'" onclick="closeMobDrawer();goCat(\'all\')"><span class="drawer-icon">'+FILTER_SVG.all+'</span> ดูทั้งหมด</button>';
  for(const k of Object.keys(RAW_DATA)){
    const active = (!isHome && curCat===k) ? 'active' : '';
    const iconSvg = (typeof CAT_SVG !== 'undefined' && CAT_SVG[k]) ? CAT_SVG[k] : '';
    const name = (typeof CAT_NAMES !== 'undefined' && CAT_NAMES[k]) ? CAT_NAMES[k] : k;
    const count = (RAW_DATA[k] && RAW_DATA[k].length) ? RAW_DATA[k].length : 0;
    h += '<button class="mob-drawer-btn '+active+'" onclick="closeMobDrawer();goCat(\''+k+'\')"><span class="drawer-icon">'+iconSvg+'</span> '+name+' <span class="cnt">('+count.toLocaleString()+')</span></button>';
  }
  body.innerHTML = h;
}
function goHomeFromDrawer(){
  closeMobDrawer();
  goHome();
}
// คลิก "สินค้าโปรโมชั่น" ใน mobile drawer → ใช้ filter Promo (all)
// ไม่ปิด drawer เพื่อให้ user เห็น sub-items ที่แตกออกมา
function expandMobPromo(){
  setMobTag('Promo');   // sets state + shows catalog + applies filter
  buildMobDrawer();     // re-render to show sub-items
}
window.openMobDrawer = openMobDrawer;
window.closeMobDrawer = closeMobDrawer;
window.goHomeFromDrawer = goHomeFromDrawer;
window.expandMobPromo = expandMobPromo;

// === LINE Modal Helpers ===
function openLineModal(){
  const m = document.getElementById('lineModalOverlay');
  if(m){ m.style.display = 'flex'; }
}
function closeLineModal(){
  const m = document.getElementById('lineModalOverlay');
  if(m){ m.style.display = 'none'; }
}
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    // Close search dropdowns first
    const openDropdown = document.querySelector('.search-dropdown.show');
    if(openDropdown){ closeSearchDropdowns(); return; }
    // Then mobile drawer
    const drawer = document.getElementById('mobDrawer');
    if(drawer && drawer.classList.contains('show')){ closeMobDrawer(); return; }
    const ids = ['lineModalOverlay','lineLoadingOverlay','lineNoAppOverlay','orderHelpOverlay','orderTextOverlay','accountModalOverlay'];
    for(let i=0;i<ids.length;i++){
      const el = document.getElementById(ids[i]);
      if(el && el.style.display === 'flex'){ el.style.display = 'none'; }
    }
  }
});
window.openLineModal = openLineModal;
window.closeLineModal = closeLineModal;
// === LINE PC App Opening (with Loading Spinner) ===
function openLinePCWithLoading(){
  showLineLoading();
  // Trigger line:// protocol via anchor click
  const a = document.createElement('a');
  a.href = LINE_OA_DEEPLINK;
  a.target = '_blank';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){
    try{ if(a.parentNode) a.parentNode.removeChild(a); }catch(e){}
  }, 200);

  // Smart detection: รอจน LINE PC เปิดจริงๆ (blur หรือ visibility change)
  // ตรวจเจอแล้ว → รอ 2s ให้ LINE โหลด chat เสร็จ → ค่อยปิด spinner
  let detected = false;
  let safetyTimer = null;

  function cleanup(){
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisChange);
    if(safetyTimer){ clearTimeout(safetyTimer); safetyTimer = null; }
  }
  function onAppDetected(){
    if(detected) return;
    detected = true;
    cleanup();
    // รอ 2 วิเพิ่ม ให้ LINE Desktop เปิด chat เสร็จสมบูรณ์
    setTimeout(hideLineLoading, 2000);
  }
  function onBlur(){ onAppDetected(); }
  function onVisChange(){ if(document.hidden){ onAppDetected(); } }

  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisChange);

  // Safety timeout: ถ้าไม่ตรวจเจออะไรใน 10 วิ → ปิด spinner anyway
  safetyTimer = setTimeout(function(){
    cleanup();
    hideLineLoading();
  }, 10000);
}
function showLineLoading(){
  const m = document.getElementById('lineLoadingOverlay');
  if(m){ m.style.display = 'flex'; }
}
function hideLineLoading(){
  const m = document.getElementById('lineLoadingOverlay');
  if(m){ m.style.display = 'none'; }
}
window.openLinePCWithLoading = openLinePCWithLoading;
window.showLineLoading = showLineLoading;
window.hideLineLoading = hideLineLoading;

// === LINE Install Helper (manual trigger only) ===
function showLineNoApp(){
  const m = document.getElementById('lineNoAppOverlay');
  if(m){ m.style.display = 'flex'; }
}
function closeLineNoApp(){
  const m = document.getElementById('lineNoAppOverlay');
  if(m){ m.style.display = 'none'; }
}
window.showLineNoApp = showLineNoApp;
window.closeLineNoApp = closeLineNoApp;

// Tiered size warnings (text mode, plain text auto-split)
const ORDER_SOFT_WARN  = 1000;   // ⚠ Warning "แนะนำแยกบิล"
const ORDER_HARD_CAP   = 2000;   // ❌ Block "ต้องแบ่งบิล"

async function sendOrder(){
  if(!cart.length) return;
  // ป้องกันการกดซ้ำ (double-click / Enter spam)
  if(window._sendingInProgress) return;
  window._sendingInProgress = true;

  // ====== Tiered size guard ======
  const itemCount = cart.length;
  const totalQtyCheck = cart.reduce(function(s, c){ return s + (c.qty || 0); }, 0);

  // 1. Hard cap — block entirely (≥ 2,000)
  if(itemCount >= ORDER_HARD_CAP){
    alert(
      '❌ เกินขีดจำกัดต่อบิล\n\n' +
      'ออเดอร์นี้มี ' + itemCount.toLocaleString('th-TH') + ' รายการ\n' +
      'สูงสุดต่อบิล: ' + (ORDER_HARD_CAP - 1).toLocaleString('th-TH') + ' รายการ\n\n' +
      'กรุณาแบ่งสินค้าเป็นบิลย่อยค่ะ'
    );
    window._sendingInProgress = false;
    return;
  }

  // 2. Soft warning — suggest split (1,000-1,999)
  if(itemCount >= ORDER_SOFT_WARN){
    const ok = confirm(
      '⚠ ออเดอร์ใหญ่มาก!\n\n' +
      itemCount.toLocaleString('th-TH') + ' รายการ · ' + totalQtyCheck.toLocaleString('th-TH') + ' ชิ้น\n\n' +
      '💡 แนะนำแยกบิลเพื่อความสะดวก\n' +
      '   (เซลล์จัดการง่ายกว่า)\n\n' +
      'ต้องการส่งทั้งหมดทีเดียวเลยไหม?\n' +
      '   ✓ ตกลง = ส่งทั้งหมด\n' +
      '   ✗ ยกเลิก = กลับไปแก้ไข'
    );
    if(!ok){ window._sendingInProgress = false; return; }
  }
  // < 1,000 → ส่งเงียบๆ ตามปกติ

  // Find send button to show loading state
  const sendBtn = document.querySelector('.cart-send');
  const origBtnText = sendBtn ? sendBtn.innerHTML : '';
  if(sendBtn){
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> กำลังส่ง<span class="btn-dots" aria-hidden="true"></span>';
    sendBtn.style.opacity = '0.85';
  }

  // Generate order metadata
  const orderId = genOrderId();             // internal tracking (PR + YYMMDD + HHmm + rand)
  const orderTitle = genOrderTitle();       // human-friendly "📋 ออเดอร์ขายส่ง 22-06-2569/14.40น."
  const timestamp = getTimestampTH();
  // อ่าน VIP จาก Account input (priority 1) แล้ว fallback localStorage (priority 2)
  const acctVip = document.getElementById('accountVipInput');
  const liveVip = acctVip ? (acctVip.value || '').trim() : '';
  const savedVip = (function(){ try { return (localStorage.getItem(VIP_LS_KEY) || '').trim(); } catch(e){ return ''; } })();
  const memberFromInput = liveVip || savedVip;
  const customerName = (liffProfile && liffProfile.displayName) || memberFromInput || '';
  const total = cart.reduce((s,c) => s + effectiveSubtotal(c), 0);

  // เตรียม text — fullText สำหรับ modal display + clipboard (Format C เต็ม)
  // shortText สำหรับ QR URL (compact เพื่อไม่ให้ URL ยาวเกิน LINE share limit)
  const messagesForText = buildOrderMessages(orderId, orderTitle, timestamp, customerName, cart, total);
  const fullText = messagesForText.map(function(m){ return m.text; }).join('\n\n');

  // Compact version สำหรับ QR (~25 chars/item)
  const qrLines = [orderTitle];
  if(customerName) qrLines.push('👤 ' + customerName);
  cart.forEach(function(c, i){
    qrLines.push((i+1) + '. ' + c.code + ' ×' + c.qty + ' = ' + effectiveSubtotal(c).toLocaleString('th-TH'));
  });
  qrLines.push('💰 รวม ' + total.toLocaleString('th-TH') + ' บาท');
  const shortText = qrLines.join('\n');

  // Restore button
  const restoreBtn = () => {
    if(sendBtn){
      sendBtn.disabled = false;
      sendBtn.innerHTML = origBtnText;
      sendBtn.style.opacity = '';
    }
  };

  // Debug info
  const dbg = {
    liffReady: liffReady,
    liffInClient: liffInClient,
    hasProfile: !!liffProfile,
    sendMessagesFn: (typeof liff !== 'undefined' && typeof liff.sendMessages === 'function')
  };
  console.log('[sendOrder] context:', dbg);

  // เช็คว่าอยู่ใน LIFF browser หรือไม่
  if(liffReady && liffInClient && typeof liff !== 'undefined' && typeof liff.sendMessages === 'function'){

    // ส่ง Flex card — auto split + batch (5/call) สำหรับ cart ใหญ่
    try{
      const messages = buildOrderMessages(orderId, orderTitle, timestamp, customerName, cart, total);
      console.log('[LIFF] Sending', messages.length, 'flex card(s) total size:', JSON.stringify(messages).length, 'bytes');

      // Batch sending: LIFF อนุญาต 5 messages ต่อ 1 call → ส่งหลายรอบถ้าจำเป็น
      for(let bi = 0; bi < messages.length; bi += FLEX_BATCH_SIZE){
        const batch = messages.slice(bi, bi + FLEX_BATCH_SIZE);
        console.log('[LIFF] Batch', Math.floor(bi/FLEX_BATCH_SIZE)+1, '— sending', batch.length, 'card(s)');
        const p = liff.sendMessages(batch);
        const t = new Promise(function(_, reject){
          setTimeout(function(){ reject(new Error('sendMessages timeout 15s')); }, LIFF_SEND_TIMEOUT_MS);
        });
        await Promise.race([p, t]);
        // หาก batch ถัดไปยังมี → รอ 400ms เพื่อลด rate-limit risk
        if(bi + FLEX_BATCH_SIZE < messages.length){
          await new Promise(function(r){ setTimeout(r, 400); });
        }
      }
      console.log('[LIFF] All flex sent OK ✓');

      cart = [];
      clearCartStorage(); // ลบ cart ที่บันทึกไว้หลังส่งสำเร็จ
      resetAllCardButtons(); // reset ปุ่ม [-N+] กลับเป็น "+ ใส่ตะกร้า" / "🛒 สั่งจอง" ตาม stock
      renderCart();
      closeCart();
      restoreBtn();
      showSuccessModal(orderId, orderTitle);
      window._sendingInProgress = false;
      return;

    } catch(sendErr){
      // Flex ส่งไม่สำเร็จ → fallback ไปใช้ modal ให้ copy เอง
      console.error('[LIFF] Send failed:', sendErr);
      _logError({
        type:'send-fail',
        msg:'Send failed: '+(sendErr && sendErr.message ? sendErr.message : String(sendErr)),
        time:new Date().toLocaleTimeString()
      });
      const errMsg = (sendErr && sendErr.message) ? sendErr.message : String(sendErr);
      alert('❌ ส่งออเดอร์ผ่าน LIFF ไม่สำเร็จ\n\nError: '+errMsg+'\n\nจะใช้วิธี copy+paste แทน');
      // PC → Quick Send (skip modal) · Mobile → Modal with QR
      const isMobileUA_e = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if(!isMobileUA_e){
        await quickSendPC(orderId, orderTitle, timestamp, customerName, fullText, total);
      } else {
        showFallbackModal(orderId, orderTitle, timestamp, fullText, shortText);
      }
      restoreBtn();
      window._sendingInProgress = false;
      return;
    }
  }

  // Fallback: เปิดผ่าน browser ปกติ / desktop
  // PC → Quick Send (skip modal) · Mobile → Modal with QR
  const isMobileUA_f = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if(!isMobileUA_f){
    await quickSendPC(orderId, orderTitle, timestamp, customerName, fullText, total);
  } else {
    showFallbackModal(orderId, orderTitle, timestamp, fullText, shortText);
  }
  // Restore button AFTER quickSendPC done (user เห็น loading state จริงๆ ระหว่างทำงาน)
  restoreBtn();
  window._sendingInProgress = false;
}
// ============================================================
// SMART HEADER AUTO-RESIZE
// ตรวจสอบความกว้าง header แบบ real-time แล้วปรับ element อัตโนมัติ
// ทำงาน 3 step:
//   1) ถ้าล้น → ย่อ user badge ก่อน
//   2) ยังล้น → ซ่อน home-btn label
//   3) ยังล้น → ซ่อน user badge ทั้งก้อน (ยังเห็น avatar)
// ============================================================
function initSmartHeader(){
  const hdr = document.querySelector('.pc-hdr');
  if(!hdr || typeof ResizeObserver === 'undefined') return;

  let timer = null;
  const checkOverflow = () => {
    const badge = document.getElementById('pcUserBadge');
    const badgeName = document.getElementById('pcUserName');
    const homeLabel = hdr.querySelector('.home-btn-label');
    if(!badge) return;

    // reset ก่อนเช็ค
    if(badgeName) badgeName.style.display = '';
    if(homeLabel) homeLabel.style.display = '';
    badge.style.display = liffProfile ? 'flex' : 'none';

    // ถ้า scroll width > client width = ล้น
    requestAnimationFrame(() => {
      // Step 1: ซ่อนชื่อใน badge ก่อน (เหลือแต่ avatar)
      if(hdr.scrollWidth > hdr.clientWidth + 2 && badgeName){
        badgeName.style.display = 'none';
      }
      // Step 2: ซ่อน label home-btn
      requestAnimationFrame(() => {
        if(hdr.scrollWidth > hdr.clientWidth + 2 && homeLabel){
          homeLabel.style.display = 'none';
        }
        // Step 3: ซ่อน badge ทั้งหมด
        requestAnimationFrame(() => {
          if(hdr.scrollWidth > hdr.clientWidth + 2 && badge){
            badge.style.display = 'none';
          }
        });
      });
    });
  };

  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(checkOverflow, SMART_HEADER_DEBOUNCE_MS);
  });
  ro.observe(hdr);
  // เรียกครั้งแรกหลัง LIFF init เสร็จ
  setTimeout(checkOverflow, SMART_HEADER_INIT_MS);
  setTimeout(checkOverflow, SMART_HEADER_RECHECK_MS);
}

// ============================================================
// GLOBAL ERROR HANDLER + DEBUG TOOLS
// ============================================================
window.__lastErrors = [];
const ERROR_LOG_CAP = 50; // ป้องกัน memory leak — เก็บแค่ 50 error ล่าสุด

/** Cap-enforcing push helper — ลด array ลงเมื่อเกิน ERROR_LOG_CAP */
function _logError(entry){
  window.__lastErrors.push(entry);
  // Trim oldest entries if over cap
  while(window.__lastErrors.length > ERROR_LOG_CAP){
    window.__lastErrors.shift();
  }
}

window.addEventListener('error', function(e){
  _logError({
    type:'error',
    msg: e.message,
    src: e.filename + ':' + e.lineno + ':' + e.colno,
    time: new Date().toLocaleTimeString()
  });
});
window.addEventListener('unhandledrejection', function(e){
  _logError({
    type:'promise',
    msg: (e.reason && e.reason.message) ? e.reason.message : String(e.reason),
    time: new Date().toLocaleTimeString()
  });
});

// Safe wrapper for sendOrder — catch ทุก error ที่อาจเกิด
window.sendOrderSafe = async function(){
  try {
    if(typeof sendOrder !== 'function'){
      alert('❌ ฟังก์ชัน sendOrder ยังไม่พร้อม\n\nกรุณารอสักครู่หรือ refresh หน้า');
      return;
    }
    await sendOrder();
  } catch(err){
    const msg = (err && err.message) ? err.message : String(err);
    const stack = (err && err.stack) ? err.stack.split('\n').slice(0,3).join('\n') : '';
    alert('❌ เกิดข้อผิดพลาด:\n\n' + msg + '\n\n' + stack);
    console.error('[sendOrderSafe]', err);
  }
};

// Debug info — แสดงสถานะระบบทั้งหมด
window.showDebugInfo = function(){
  const info = [];
  info.push('=== Priao LIFF Debug Info ===');
  info.push('Time: ' + new Date().toLocaleString('th-TH'));
  info.push('UA: ' + (navigator.userAgent || '').substring(0, 80));
  info.push('');
  info.push('--- LIFF Status ---');
  info.push('LIFF SDK loaded: ' + (typeof liff !== 'undefined' ? 'YES' : 'NO'));
  info.push('liffReady: ' + (typeof liffReady !== 'undefined' ? liffReady : 'undef'));
  info.push('liffInClient: ' + (typeof liffInClient !== 'undefined' ? liffInClient : 'undef'));
  if(typeof liff !== 'undefined'){
    try {
      info.push('isInClient: ' + liff.isInClient());
      info.push('isLoggedIn: ' + liff.isLoggedIn());
      info.push('sendMessages available: ' + (typeof liff.sendMessages === 'function' ? 'YES' : 'NO'));
    } catch(e){}
  }
  info.push('');
  info.push('--- Functions ---');
  info.push('sendOrder: ' + typeof sendOrder);
  info.push('buildOrderMessages: ' + typeof buildOrderMessages);
  info.push('cart items: ' + (typeof cart !== 'undefined' ? cart.length : 'undefined'));
  info.push('');
  if(window.__lastErrors && window.__lastErrors.length){
    info.push('--- Recent errors ---');
    window.__lastErrors.slice(-5).forEach(function(e){
      info.push('[' + e.time + '] ' + e.type + ': ' + e.msg);
    });
  }
  alert(info.join('\n'));
};

async function loadCatalogData() {
  const idx = await fetch('data/index.json').then(r => r.json());
  await Promise.all(idx.categories.map(async cat => {
    RAW_DATA[cat] = await fetch('data/' + cat + '.json').then(r => r.json());
  }));
  // Load suggested_retail overlay (non-blocking — fallback to empty map if missing)
  try {
    const overlay = await fetch('data/suggested_retail.json?v=20260622-0708').then(r => r.ok ? r.json() : null);
    if(overlay && overlay.data && typeof overlay.data === 'object'){
      SUGGESTED_RETAIL_MAP = overlay.data;
      console.log('[boot] suggested_retail overlay:', Object.keys(SUGGESTED_RETAIL_MAP).length, 'entries');
    }
  } catch(e){
    console.warn('[boot] suggested_retail overlay not loaded:', e.message);
  }
  // Load FGStore stock overlay (NEW — overrides Excel stock values from ERP)
  try {
    const stockOverlay = await fetch('data/stock_fg.json?v=20260622-0708').then(r => r.ok ? r.json() : null);
    if(stockOverlay && stockOverlay.data && typeof stockOverlay.data === 'object'){
      STOCK_FG_MAP = stockOverlay.data;
      console.log('[boot] stock_fg overlay:', Object.keys(STOCK_FG_MAP).length, 'entries');
    }
  } catch(e){
    console.warn('[boot] stock_fg overlay not loaded:', e.message);
  }
}
window.addEventListener('DOMContentLoaded', async function () {
  console.log('[boot] DOMContentLoaded fired');
  try {
    initLiff();
    console.log('[boot] initLiff() ok');
  } catch(e){ console.error('[boot] initLiff failed:', e); }
  try {
    initSmartHeader();
    console.log('[boot] initSmartHeader() ok');
  } catch(e){ console.error('[boot] initSmartHeader failed:', e); }
  try {
    console.log('[boot] loading catalog data...');
    await loadCatalogData();
    console.log('[boot] catalog data loaded, RAW_DATA keys:', Object.keys(RAW_DATA));
  } catch(e){
    console.error('[boot] loadCatalogData failed:', e);
    // แสดง error บนหน้า loading แทนค้าง
    const sub = document.getElementById('loadingSub');
    if(sub) sub.textContent = 'โหลดข้อมูลไม่สำเร็จ — กรุณา refresh';
    return;
  }
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      try {
        init();
        console.log('[boot] init() ok ✓');
      } catch(e){
        console.error('[boot] init() FAILED:', e);
        const sub = document.getElementById('loadingSub');
        if(sub) sub.textContent = 'เริ่มระบบไม่สำเร็จ: ' + (e.message || e);
        // ลอง hide loading + แสดง home อย่างน้อย
        try {
          document.getElementById('loading').classList.add('hidden');
          document.getElementById('home').style.display='';
        } catch(_){}
      }
    });
  });
});

/* ============================================================
 * window.AppAPI — Centralized Public API Surface (Group J — Pub/Sub)
 * ============================================================
 *
 * **Purpose:**
 *   Single entry point for cross-file communication. ตัด tight coupling
 *   ระหว่าง bottom-nav.js ↔ app.js (ก่อนหน้านี้ bottom-nav อ่าน cart/liffProfile/curTag
 *   ตรงๆ จาก global scope → impossible to IIFE-wrap).
 *
 * **API Design:**
 *   - Getters return fresh value ทุกครั้ง (กัน stale reference)
 *   - Action functions delegate to internal implementations
 *   - State mutations dispatch CustomEvents ผ่าน document — bottom-nav listens
 *
 * **Events emitted:**
 *   - `app:cart-change`  → fired โดย renderCart() (= every cart mutation)
 *   - `app:nav-change`   → fired โดย setNavState() (= every navigation)
 *   - `app:liff-ready`   → fired หลัง liffProfile loaded
 *
 * **Consumers:**
 *   - js/bottom-nav.js (cart badge, tab active, profile display)
 * ============================================================ */
window.AppAPI = {
  // ── State Getters (fresh value every call) ──
  getCart()        { return cart; },
  getLiffProfile() { return liffProfile; },
  getCurTag()      { return curTag; },
  getCurCat()      { return curCat; },
  getVipLsKey()    { return VIP_LS_KEY; },

  // ── Actions (delegate to internal functions) ──
  goHome()       { if(typeof goHome     === 'function') goHome(); },
  goCat(catId)   { if(typeof goCat      === 'function') goCat(catId); },
  setMobTag(tag) { if(typeof setMobTag  === 'function') setMobTag(tag); },
  toggleCart()   { if(typeof toggleCart === 'function') toggleCart(); },
};

/** Dispatch CustomEvent ผ่าน document — bottom-nav.js listens */
function _emit(event, detail){
  try{
    document.dispatchEvent(new CustomEvent('app:' + event, { detail: detail || {} }));
  } catch(e){ /* IE polyfill needed if support old browser */ }
}


// ============================================================
// 📤 Public API — window.* exports (HTML inline handlers + bottom-nav AppAPI)
// ============================================================
// Required exposure for HTML onclick handlers (after IIFE wrap, function declarations
// are local to IIFE scope — must be explicitly exposed to global for inline handlers)
window.addCart        = addCart;
window.applyFilter    = applyFilter;
window.changeQty      = changeQty;
window.clearCart      = clearCart;
window.closeCart      = closeCart;
window.doSearch       = doSearch;
window.goB            = goB;
window.goBack         = goBack;
window.goCat          = goCat;
window.goHome         = goHome;
window.goPage         = goPage;
window.goTag          = goTag;
window.openQrZoom     = openQrZoom;
window.removeCardItem = removeCardItem;
window.removeCart     = removeCart;
window.setMobTag      = setMobTag;
window.setSub         = setSub;
window.setTag         = setTag;
window.setView        = setView;
window.toggleCart     = toggleCart;
window.toggleSubDropdown = toggleSubDropdown;

})(); // ─── end Main IIFE ───

/* === Double-scroll fix: sync body.catalog-mode with #catalog visibility === */
(function(){
  if(window.__catalogModeObserverInstalled) return;
  window.__catalogModeObserverInstalled = true;
  function _initCatalogObserver(){
    const cat = document.getElementById('catalog');
    const home = document.getElementById('home');
    if(!cat || !home) { setTimeout(_initCatalogObserver, 100); return; }
    const sync = () => {
      const isCatalog = cat.style.display !== 'none' && getComputedStyle(cat).display !== 'none';
      document.body.classList.toggle('catalog-mode', isCatalog);
      document.documentElement.classList.toggle('catalog-mode-html', isCatalog);
    };
    new MutationObserver(sync).observe(cat, {attributes:true, attributeFilter:['style']});
    new MutationObserver(sync).observe(home, {attributes:true, attributeFilter:['style']});
    sync(); // initial
  }
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initCatalogObserver);
  } else {
    _initCatalogObserver();
  }
})();
