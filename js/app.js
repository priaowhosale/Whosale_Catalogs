
'use strict';
let RAW_DATA = {}; // populated by loadCatalogData() before init() runs
















const CAT_NAMES={C01:'เครื่องสำอาง',C02:'ผลิตภัณฑ์ดูแลผิวหน้า',C03:'ผลิตภัณฑ์ดูแลผิวกาย',
  C04:'ผลิตภัณฑ์ดูแลเส้นผม',C05:'น้ำหอม',C06:'อุปกรณ์เพื่อความงาม',
  C07:'อาหารเสริม',C08:'คอนซูเมอร์',C09:'แฟชั่น&ไลฟ์สไตล์'};
const CAT_EMOJI={C01:'💄',C02:'🧴',C03:'🛁',C04:'💆',C05:'🌸',C06:'🛍️',C07:'💊',C08:'🛒',C09:'👜'};
const PER_PAGE=40;
const CART_LS_KEY='priao_cart_v1';
const CART_LS_TTL_MS=24*60*60*1000; // 24 ชม. — ตะกร้าเก่ากว่านี้จะถือว่าหมดอายุ
let allProducts=[],filtered=[],cart=[];

// ============================================================
// Cart Persistence (localStorage)
// แก้ปัญหา: ลูกค้าสลับ LINE chat กลับมา cart หายเป็น 0
// ============================================================
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
let curCat='all',curSub='all',curTag='all';
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
function brandLogoTag(brand){
  if(!brand)return '';
  const url=(BRAND_LOGOS&&BRAND_LOGOS[brand])||'';
  if(url){
    return '<img class="brand-logo" src="'+url+'" alt="">'
  }
  return '<span class="brand-logo-fallback" style="background:'+brandColor(brand)+'">'+brandInitials(brand)+'</span>';
}


function goTag(tag){
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  curCat='all';curSub='all';curTag=tag;curSearch='';curPage=1;
  const si=document.getElementById('catSearch');if(si)si.value='';
  applyFilter();updateSidebarActive();updateMobActive();
  const backBtnBar=document.getElementById('backBtnBar');
  if(b){if(navHistory.length>0)b.classList.add('show');else b.classList.remove('show');}
  const tagLabel=tag==='Hot'?'🔥 สินค้าขายดี':'✨ สินค้าใหม่';
  updateActiveCatBar('all',tagLabel,tag==='Hot'?'🔥':'✨');
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
      // promo fields (index 11-13 — optional, default empty)
      const promoTypeRaw = String(raw[11] || '').toLowerCase().trim();
      const promoType = ['sale','bundle','flash'].indexOf(promoTypeRaw) >= 0 ? promoTypeRaw : '';
      const p={
        code:String(raw[0]),name:raw[1]||'',
        cat:cat+' '+(CAT_NAMES[cat]||''),catId:cat,
        subCat:raw[2]||'',status:'',tag:raw[3]||'',
        stdPrice:Number(raw[4])||0,retailPrice:0,
        packQty:Number(raw[8])||1,baseUnit:raw[9]||'',
        stock:Number(raw[5])||0,imageUrl:raw[6]||'',
        brand:raw[7]||'',excelOrder:Number(raw[10])||0,
        // promo (optional fields 11-13)
        promoType: promoType,
        promoLabel: String(raw[12] || ''),
        originalPrice: Number(raw[13]) || 0,
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

  buildSidebar();buildMobCats();applyFilter();
  if(cart.length>0)renderCart(); // re-render cart sidebar ให้แสดงของที่ restore

  // กัน Enter ใน memberInput → ไม่ trigger Send button โดยไม่ตั้งใจ
  const memInpEl = document.getElementById('memberInput');
  if(memInpEl){
    memInpEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){
        e.preventDefault();
        e.stopPropagation();
        memInpEl.blur(); // unfocus → ไม่ trigger button ถัดไป
      }
    });
  }

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
}

function updateActiveCatBar(catId,label,icon){
  const bar=document.getElementById('activeCatBar');
  const lbl=document.getElementById('activeCatLabel');
  const ico=document.getElementById('activeCatIcon');
  if(!bar)return;
  if(catId&&catId!=='all'){
    if(ico)ico.textContent=(icon?icon+' ':'');
    if(lbl)lbl.textContent='กำลังดู: '+label;
    bar.classList.add('show');
  } else {bar.classList.remove('show');}
}
function _pushHistory(){navHistory.push({cat:curCat,sub:curSub,tag:curTag,search:curSearch,page:curPage,scrollY:window.scrollY||window.pageYOffset||0});}
function goBack(){
  if(!navHistory.length){goHome();return;}
  const p=navHistory.pop();
  curCat=p.cat;curSub=p.sub;curTag=p.tag;curSearch=p.search;curPage=p.page;
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value=curSearch;
  applyFilter();updateSidebarActive();updateMobActive();
  const backBtnBar=document.getElementById('backBtnBar');
  if(b){if(navHistory.length>0)b.classList.add('show');else b.classList.remove('show');}
  updateActiveCatBar(curCat,CAT_NAMES[curCat]||curSearch,CAT_EMOJI[curCat]||'🏷️');
  const _sy=p.scrollY||0;setTimeout(()=>window.scrollTo({top:_sy,behavior:'instant'}),80);
}
function goHome(){
  navHistory=[];
  const hb=document.getElementById('backBtnBar');if(hb)hb.classList.remove('show');
  updateActiveCatBar('all','','');
  document.getElementById('catalog').style.display='none';
  document.getElementById('home').style.display='';
  window.scrollTo(0,0);
}
function goCat(catId){
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  curCat=catId;curSub='all';curTag='all';curSearch='';curPage=1;
  const si=document.getElementById('catSearch');if(si)si.value='';
  applyFilter();updateSidebarActive();updateMobActive();
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
  updateActiveCatBar(catId,CAT_NAMES[catId],CAT_EMOJI[catId]);
}
function goB(brand){
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  curCat='all';curSub='all';curTag='all';curSearch=brand;curPage=1;
  const si=document.getElementById('catSearch');if(si)si.value=brand;
  applyFilter();updateSidebarActive();updateMobActive();
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
  updateActiveCatBar('brand',brand,'🏷️');
}
function doSearch(){
  const q=(document.getElementById('homeSearch').value||'').trim();
  if(!q)return;
  _pushHistory();
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  curCat='all';curSub='all';curTag='all';curSearch=q;curPage=1;
  const si=document.getElementById('catSearch');if(si)si.value=q;
  applyFilter();updateActiveCatBar('search','ค้นหา: '+q,'🔍');
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
}
function setMobTag(tag){
  curTag=tag;curCat='all';curSub='all';curPage=1;
  document.getElementById('home').style.display='none';
  document.getElementById('catalog').style.display='';
  const si=document.getElementById('catSearch');if(si)si.value='';
  curSearch='';
  applyFilter();
  const backBtnBar=document.getElementById('backBtnBar');if(backBtnBar)backBtnBar.classList.add('show');
  const label=tag==='Hot'?'🔥 สินค้าขายดี':'✨ สินค้าใหม่';
  updateActiveCatBar('filter',label,'');
  document.querySelectorAll('.mob-cat-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.mob-tag-btn').forEach(b=>{
    if((tag==='Hot'&&b.textContent.includes('ขายดี'))||(tag==='New'&&b.textContent.includes('ใหม่')))b.classList.add('active');
  });
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
  const haystack = (p.name+' '+p.code+' '+(p.brand||'')+' '+(p.subCat||'')).toLowerCase();
  return words.every(function(w){
    // exact include
    if(haystack.includes(w)) return true;
    // prefix match ใน tokens
    if(!SEARCH_TOKENS) return false; return SEARCH_TOKENS.some(function(t){ return t.startsWith(w) && haystack.includes(t); });
  });
}

function applyFilter(){
  const q=normalizeQ(curSearch);
  const words=q?q.split(' ').filter(function(w){return w.length>0;}):[];
  filtered=allProducts.filter(function(p){
    if(curCat!=='all'&&!q&&p.catId!==curCat)return false;
    if(curSub!=='all'&&p.subCat!==curSub)return false;
    if(curTag==='Hot'&&p.tag!=='สินค้าขายดี')return false;
    if(curTag==='New'&&p.tag!=='สินค้าใหม่')return false;
    if(words.length>0){if(!matchProduct(p,words))return false;}
    return true;
  });
  filtered.sort((a,b)=>(a.excelOrder||0)-(b.excelOrder||0));
  renderResultCnt();renderSubcats();renderProducts();renderPagination();
}

function buildSidebar(){
  const sb=document.getElementById('sidebar');if(!sb)return;
  let h='<div class="sb-hdr">กรองสินค้า</div>';
  h+='<button class="sb-btn active" onclick="setTag(\'all\')">ทั้งหมด</button>';
  h+='<button class="sb-btn" onclick="setTag(\'Hot\')">🔥 สินค้าขายดี</button>';
  h+='<button class="sb-btn" onclick="setTag(\'New\')">✨ สินค้าใหม่</button>';
  h+='<div class="sb-divider"></div>';
  h+='<div class="sb-hdr">หมวดหมู่</div>';
  h+='<button class="sb-btn" onclick="goCat(\'all\')">🗂 ทั้งหมด</button>';
  for(const [k,v] of Object.entries(RAW_DATA)){
    h+='<button class="sb-btn" onclick="goCat(\''+k+'\')">'+(CAT_EMOJI[k]||'')+' '+(CAT_NAMES[k]||k)+' ('+v.length+')</button>';
  }
  sb.innerHTML=h;
}
function buildMobCats(){
  const mb=document.getElementById('mobCats');if(!mb)return;
  let h='<button class="mob-cat-btn active" onclick="setMobTag(\'all\')">ทั้งหมด</button>';
  h+='<button class="mob-cat-btn mob-tag-btn" onclick="setMobTag(\'Hot\')">🔥 ขายดี</button>';
  h+='<button class="mob-cat-btn mob-tag-btn" onclick="setMobTag(\'New\')">✨ ใหม่</button>';
  h+='<span style="width:1px;background:var(--border);align-self:stretch;margin:4px 2px"></span>';
  for(const k of Object.keys(RAW_DATA)){
    h+='<button class="mob-cat-btn" onclick="goCat(\''+k+'\')">'+(CAT_EMOJI[k]||'')+' '+(CAT_NAMES[k]||k)+'</button>';
  }
  mb.innerHTML=h;
}
function updateSidebarActive(){document.querySelectorAll('#sidebar .sb-btn').forEach(b=>b.classList.remove('active'));}
function updateMobActive(){document.querySelectorAll('#mobCats .mob-cat-btn').forEach(b=>b.classList.remove('active'));}
function setTag(tag){curTag=tag;curPage=1;applyFilter();}
function setSub(sub){
  curSub=sub;curPage=1;
  document.querySelectorAll('.sub-btn').forEach(b=>b.classList.toggle('active',b.dataset.val===sub));
  applyFilter();
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
  if(curCat==='all'||curSearch){bar.innerHTML='';return;}
  const subs=subcatMap[curCat]||[];
  if(!subs.length){bar.innerHTML='';return;}
  let h='<button class="sub-btn '+(curSub==='all'?'active':'')+'" data-val="all" onclick="setSub(\'all\')">ทั้งหมด</button>';
  for(const s of subs){
    h+='<button class="sub-btn '+(curSub===s?'active':'')+'" data-val="'+s+'" onclick="setSub(\''+s.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')">'+s+'</button>';
  }
  bar.innerHTML=h;
}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function badge(p){
  if(p.tag==='สินค้าใหม่')return '<span class="badge-new">✨ ใหม่</span>';
  if(p.tag==='สินค้าขายดี')return '<span class="badge-hot">🔥 ขายดี</span>';
  return '';
}
function imgTag(p){
  if(p.imageUrl)return '<img src="'+p.imageUrl+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
  return '<div class="p-img-ph">🧴</div>';
}
function priceRow(p){
  const ws=p.stdPrice>0?p.stdPrice.toLocaleString('th-TH')+' บาท':'-';
  return '<span class="p-price">'+ws+'</span>';
}
function packInfo(p){return p.baseUnit||'';}
function stockInfo(p){
  if(p.stock>0)return '<span class="stock-in">✓ '+p.stock+'</span>';
  return '<span class="stock-empty">สินค้าหมดชั่วคราว</span>';
}
function cardBtn(p){
  const item=cart.find(c=>c.code===p.code);
  const isOOS=p.tag==='สินค้าหมดชั่วคราว'||p.stock===0;
  if(item&&item.qty>0){
    return '<div id="cbtn-'+p.code+'" class="qty-ctrl">'
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
        +'<span class="p-code">#'+p.code+'</span>'
        +'<div class="p-name">'+esc(p.name)+'</div>'
        +'<div class="p-brand">'+esc(p.brand)+'</div>'
        +'<div class="p-price-row">'+priceRow(p)+(badge(p)?'<span class="p-badge-inline">'+badge(p)+'</span>':'')+'</div>'
        +'<div class="p-stock-row">'+(packInfo(p)?'<span style="font-size:.65rem;color:#4B5563;font-weight:600">'+packInfo(p)+'</span>':'<span></span>')+stockInfo(p)+'</div>'
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
        +'<span class="p-code">#'+p.code+'</span>'
        +'<div class="p-list-name">'+esc(p.name)+'</div>'
        +'<div class="p-brand">'+esc(p.brand)+'</div>'
        +'<div class="p-price-row">'+priceRow(p)+(badge(p)?'<span class="p-badge-inline">'+badge(p)+'</span>':'')+'</div>'
        +'<div style="display:flex;gap:8px">'+stockInfo(p)+'</div>'
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
  pg.innerHTML=h;
}
function goPage(n){curPage=n;renderProducts();renderPagination();document.getElementById('mainContent').scrollTop=0;}

function addCartN(code){
  const inp=document.getElementById('qin-'+code);
  const n=Math.max(1,Math.min(999,parseInt(inp?inp.value:1)||1));
  const p=allProducts.find(x=>x.code===code);if(!p)return;
  const idx=cart.findIndex(c=>c.code===code);
  if(idx>=0)cart[idx].qty+=n;
  else cart.push({code:p.code,name:p.name,price:p.stdPrice,packQty:p.packQty,baseUnit:p.baseUnit,qty:n});
  renderCart();updateCardBtn(code);
}
function addCartQty(code){
  const inp=document.getElementById('qi-'+code);
  const qty=inp?Math.max(1,parseInt(inp.value)||1):1;
  const p=allProducts.find(x=>x.code===code);if(!p)return;
  const idx=cart.findIndex(c=>c.code===code);
  if(idx>=0)cart[idx].qty+=qty;
  else cart.push({code:p.code,name:p.name,price:p.stdPrice,packQty:p.packQty,baseUnit:p.baseUnit,qty:qty});
  renderCart();updateCardBtn(code);
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
    el.outerHTML='<div id="cbtn-'+code+'" class="qty-ctrl">'
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
  cart=cart.filter(c=>c.code!==code);renderCart();
  const el=document.getElementById('cbtn-'+code);
  if(el){el.className='add-btn';el.innerHTML='+ เพิ่มลงตะกร้า';el.onclick=function(){addCart(code);};}
}
function changeQty(code,delta){
  const idx=cart.findIndex(c=>c.code===code);if(idx<0)return;
  cart[idx].qty=Math.max(1,cart[idx].qty+delta);renderCart();
}
function renderCart(){
  saveCart(); // persist cart ทุกครั้งที่มี render — ป้องกัน cart หายตอนสลับแอป
  const cnt=cart.reduce((s,c)=>s+c.qty,0);
  document.getElementById('cartCnt').textContent=cnt;
  const fab=document.getElementById('cartFabCnt');
  const fabLabel=document.getElementById('cartFabLabel');
  const fabBtn=document.getElementById('cartFab');
  if(fab){
    fab.textContent=cnt;
    fab.style.display=cnt>0?'flex':'none';
    if(fabLabel)fabLabel.style.display=cnt>0?'none':'inline';
    if(fabBtn&&cnt>0){fabBtn.classList.remove('pop');void fabBtn.offsetWidth;fabBtn.classList.add('pop');}
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
      const origPrice = prod ? (prod.originalPrice || 0) : 0;
      // out-of-stock = preorder (สำคัญสุด)
      const isOutOfStock = prod && (prod.tag === 'สินค้าหมดชั่วคราว' || prod.stock <= 0);
      const hasStrike = !isOutOfStock && origPrice > c.price && origPrice > 0;
      const themeMap = {
        sale:     { c1:'#F59E0B', bg:'#FFFAEB', emoji:'🔥', txt:'SALE — ลดพิเศษ' },
        bundle:   { c1:'#2080BE', bg:'#F0F7FF', emoji:'🎁', txt:'โปรโมชั่น' },
        flash:    { c1:'#DC2626', bg:'#FEF2F2', emoji:'⚡', txt:'FLASH SALE' },
        preorder: { c1:'#6B7280', bg:'#F3F4F6', emoji:'📦', txt:'สั่งจอง — สินค้าหมดชั่วคราว (รอสั่ง)' }
      };
      const effectiveType = isOutOfStock ? 'preorder' : pType;
      const theme = themeMap[effectiveType] || null;
      const ribbonText = effectiveType === 'preorder'
        ? '📦 สั่งจอง — สินค้าหมดชั่วคราว (รอสั่ง)'
        : (pLabel || (theme ? theme.emoji+' '+theme.txt : ''));

      if(theme){
        // PROMO CART ITEM
        h += '<div class="cart-item" style="padding:0 !important;border:1.5px solid '+theme.c1+';background:'+theme.bg+';border-radius:8px;overflow:hidden">'
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
          + (hasStrike ? '<span style="text-decoration:line-through;color:#999;font-weight:400;font-size:.72rem">'+origPrice.toLocaleString('th-TH')+'</span> ' : '')
          + (c.price*c.qty).toLocaleString('th-TH')+' บาท</span>'
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
          +'<span style="flex:1;text-align:right;font-weight:700;color:var(--acc);font-size:.85rem">'+(c.price*c.qty).toLocaleString('th-TH')+' บาท</span>'
          +'<button onclick="removeCart(\''+c.code+'\')" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:.95rem">✕</button>'
          +'</div></div></div>';
      }
    }
    items.innerHTML=h;
  }
  const total=cart.reduce((s,c)=>s+(c.price*c.qty),0);
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
function closeCart(){document.getElementById('cartPanel').classList.remove('open');document.getElementById('overlay').classList.remove('show');}

// ============================================================
// LIFF INTEGRATION — เปรียว VIP Catalog
// ============================================================
// 1. ใส่ LIFF ID ของคุณตรงนี้ (ได้จาก LINE Developers Console)
const LIFF_ID = '2010211018-V4JAFUOl'; // Priao VIP Catalog
const LINE_OA_URL = 'https://lin.ee/mDhRNMT'; // LINE OA ของเปรียว

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
      // แสดง user badge บน header
      const badge = document.getElementById('pcUserBadge');
      const avatar = document.getElementById('pcUserAvatar');
      const name = document.getElementById('pcUserName');
      if(badge && liffProfile){
        badge.style.display = 'flex';
        if(liffProfile.pictureUrl) avatar.src = liffProfile.pictureUrl;
        name.textContent = liffProfile.displayName || 'VIP';
        const memInput = document.getElementById('memberInput');
        if(memInput && !memInput.value) memInput.value = liffProfile.displayName || '';
      }
    } else if(liffInClient){
      liff.login();
    }
  } catch(err){
    console.error('[LIFF] init failed:', err);
    window.__lastErrors && window.__lastErrors.push({
      type:'liff-init',
      msg:'liff.init failed: '+(err && err.message ? err.message : String(err)),
      time:new Date().toLocaleTimeString()
    });
  }
}

// สร้าง Order ID อัตโนมัติ: PR + YYMMDD + HHmm + random 2 หลัก
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

function getTimestampTH(){
  const d = new Date();
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const yy = d.getFullYear() + 543; // พ.ศ.
  const pad = n => String(n).padStart(2,'0');
  return d.getDate()+' '+months[d.getMonth()]+' '+String(yy).slice(-2)+' · '+pad(d.getHours())+':'+pad(d.getMinutes());
}

// Helper: ทำให้ image URL ปลอดภัย (HTTPS + fallback ถ้าไม่มี)
function safeImageUrl(url){
  if(!url) return 'https://placehold.co/100x100/2080be/ffffff?text=Priao';
  // force HTTPS
  let u = url.replace(/^http:\/\//i, 'https://');
  // ถ้าไม่ใช่ valid HTTPS URL → ใช้ placeholder
  if(!/^https:\/\//i.test(u)) return 'https://placehold.co/100x100/2080be/ffffff?text=Priao';
  return u;
}

// เฉพาะ SKU (barcode ล้วน 1 บรรทัด/SKU ไม่มี # ไม่มีจำนวน)
function buildSkuText(cartItems){
  return cartItems.map(c => String(c.code || '')).join('\n');
}

// รายการ + Order ID (ไม่มีคำนวณยอด, SKU ไม่มี #)
function buildListText(orderId, customerName, cartItems, nameMax){
  const trim = (s) => {
    s = String(s || '');
    if(!nameMax || s.length <= nameMax) return s;
    return s.substring(0, nameMax - 1) + '…';
  };
  const lines = ['Order ID:'+String(orderId || '')];
  if(customerName) lines.push('ลูกค้า:'+String(customerName));
  lines.push('');
  cartItems.forEach(function(c, i){
    lines.push((i+1)+'. '+trim(c.name));
    lines.push('   '+String(c.code || '')+' × '+c.qty);
  });
  return lines.join('\n');
}


// สร้าง Flex Message bubble — มี 2 ปุ่ม copy ใน footer
// opts (optional): {chunkIdx, totalChunks, isLast, grandTotal, totalItems}
function buildFlexBubble(orderId, timestamp, customerName, cartItems, total, opts){
  opts = opts || {};
  const isMultiChunk = (opts.totalChunks || 1) > 1;
  const itemContents = [];

  // สีตามประเภทโปร: sale=ส้ม, bundle=ฟ้า, flash=แดง, preorder=เทา
  const PROMO_THEME = {
    sale:     { c1:'#F59E0B', bg:'#FFFAEB', txt:'#7C5E00', emoji:'🔥' },
    bundle:   { c1:'#2080BE', bg:'#F0F7FF', txt:'#0C447C', emoji:'🎁' },
    flash:    { c1:'#DC2626', bg:'#FEF2F2', txt:'#7F1D1D', emoji:'⚡' },
    preorder: { c1:'#6B7280', bg:'#F3F4F6', txt:'#374151', emoji:'📦' }
  };

  // แยก items เป็น 2 กลุ่ม: พร้อมส่ง vs สั่งจอง (สินค้าหมด)
  const regularItems = [];
  const preorderItems = [];
  cartItems.forEach(function(c){
    const p = allProducts.find(x => x.code === c.code);
    const isOOS = p && (p.tag === 'สินค้าหมดชั่วคราว' || p.stock <= 0);
    if(isOOS) preorderItems.push(c);
    else regularItems.push(c);
  });

  // ฟังก์ชันช่วย render items array (เรียกซ้ำได้)
  function renderItemsToContents(items, startIdx, sectionLabel){
    if(items.length === 0) return;
    // Section header — ไม่ใส่ในกลุ่มแรกถ้าไม่มีอีกกลุ่ม
    if(sectionLabel){
      itemContents.push({
        type:'box', layout:'vertical', margin: itemContents.length > 0 ? 'lg' : 'none',
        backgroundColor: sectionLabel.bg, paddingAll:'sm', cornerRadius:'md',
        contents:[
          {type:'text', text: sectionLabel.text, color: sectionLabel.color, size:'xs', weight:'bold'}
        ]
      });
    }
    const renderMode = opts.mode || 'A';
    items.forEach(function(c, i){
      const idx = startIdx + i;
      // HYBRID: first HYBRID_A_COUNT items in this chunk = visual A, rest = compact B
      const useCompact = (renderMode === 'B') ||
                         (renderMode === 'HYBRID' && i >= HYBRID_A_COUNT);
      if(useCompact){
        _renderItemCompact(c, idx, items.length > 1 && i > 0);
      } else {
        _renderSingleItem(c, idx, items.length > 1 && i > 0);
      }
    });
  }

  // ฟังก์ชันสำหรับ render 1 item แบบ compact (Format B — รูปเล็ก + ribbon)
  function _renderItemCompact(c, idx, addSeparator){
    const product = allProducts.find(p => p.code === c.code);
    const imgUrl = safeImageUrl(product ? product.imageUrl : null);
    const lineTotal = c.price * c.qty;
    const isOutOfStock = product && (product.tag === 'สินค้าหมดชั่วคราว' || product.stock <= 0);
    const promoType = isOutOfStock ? 'preorder' : (product ? (product.promoType || '') : '');
    const theme = PROMO_THEME[promoType] || null;

    if(addSeparator){
      itemContents.push({type:'separator', margin:'xs', color:'#F5F5F5'});
    }

    const rowContents = [];
    // mini image 24x24
    if(imgUrl){
      rowContents.push({
        type:'image', url: imgUrl,
        size:'xxs', flex:1, aspectRatio:'1:1', aspectMode:'cover'
      });
    } else {
      rowContents.push({type:'filler', flex:1});
    }
    // text part — name + qty×price
    const textBox = {
      type:'box', layout:'vertical', flex:8, spacing:'none',
      contents:[
        {type:'text', text: (idx+1)+'. '+(c.name || ''),
         size:'xxs', color:'#0a1628', weight:'regular', wrap:true, maxLines:1},
        {type:'box', layout:'baseline', spacing:'sm', contents:[
          {type:'text', text:'฿'+c.price+' × '+c.qty,
           size:'xxs', color:'#888888', flex:3},
          {type:'text', text: lineTotal.toLocaleString('th-TH')+'฿',
           size:'xxs', color:'#0065a8', weight:'bold', flex:2, align:'end'}
        ]}
      ]
    };
    rowContents.push(textBox);
    // mini ribbon
    if(theme){
      rowContents.push({
        type:'text', text: theme.emoji,
        size:'xxs', flex:1, align:'center', color: theme.txt
      });
    } else {
      rowContents.push({type:'filler', flex:1});
    }

    itemContents.push({
      type:'box', layout:'horizontal', spacing:'sm', paddingAll:'xs',
      contents: rowContents
    });
  }

  // ฟังก์ชันสำหรับ render 1 item (logic เดิม)
  function _renderSingleItem(c, idx, addSeparator){
    const product = allProducts.find(p => p.code === c.code);
    const imgUrl = safeImageUrl(product ? product.imageUrl : null);
    const lineTotal = c.price * c.qty;
    // out-of-stock = preorder (สำคัญสุด ตัดสินใจซื้อ ลูกค้าต้องรู้)
    const isOutOfStock = product && (product.tag === 'สินค้าหมดชั่วคราว' || product.stock <= 0);
    const promoType = isOutOfStock ? 'preorder' : (product ? (product.promoType || '') : '');
    const theme = PROMO_THEME[promoType] || null;
    const origPrice = (!isOutOfStock && product) ? (product.originalPrice || 0) : 0;
    const hasStrike = origPrice > c.price && origPrice > 0;
    const discPct = hasStrike ? Math.round((origPrice - c.price) / origPrice * 100) : 0;

    if(addSeparator){
      itemContents.push({type:'separator', margin:'md', color:'#EEEEEE'});
    }

    // ============= PROMO ITEM =============
    if(theme){
      const ribbonText = promoType === 'preorder'
        ? '📦 สั่งจอง — สินค้าหมดชั่วคราว (รอสั่ง)'
        : ((product.promoLabel || '').trim()
          || (promoType==='sale'  ? theme.emoji+' SALE — ลดพิเศษ'
            : promoType==='bundle'? theme.emoji+' โปรโมชั่น'
            : theme.emoji+' FLASH SALE'));

      // body contents inside promo card
      const bodyContents = [
        {type:'text', text:(idx+1)+'. '+String(c.name||'-'),
         weight:'bold', size:'sm', color:'#0A1628', wrap:true, maxLines:2},
        {type:'text', text:'#'+String(c.code||''), size:'xs', color:'#2080BE', weight:'bold'}
      ];

      // ราคา×จำนวน = รวม (แยก element ให้ qty เด่น)
      const priceRowContents = [];
      if(hasStrike){
        priceRowContents.push({type:'text', text:origPrice.toLocaleString('th-TH'),
          size:'xs', color:'#6B7280', decoration:'line-through', flex:0});
        priceRowContents.push({type:'text', text:'→', size:'xs', color:'#6B7280', flex:0});
      }
      priceRowContents.push({type:'text', text:c.price.toLocaleString('th-TH'),
        size:'sm', color:'#0A1628', weight:'bold', flex:0});
      priceRowContents.push({type:'text', text:'×', size:'sm', color:'#6B7280', flex:0});
      priceRowContents.push({type:'text', text:String(c.qty), size:'md',
        color:theme.c1, weight:'bold', flex:0});
      priceRowContents.push({type:'text', text:'= '+lineTotal.toLocaleString('th-TH'),
        size:'md', color:theme.c1, weight:'bold', flex:1, align:'end'});

      bodyContents.push({type:'box', layout:'baseline', margin:'sm', spacing:'xs', contents: priceRowContents});

      itemContents.push({
        type:'box', layout:'vertical', margin:'md',
        borderColor: theme.c1, borderWidth: '1.5px', cornerRadius:'md',
        contents:[
          // Ribbon
          {
            type:'box', layout:'vertical',
            backgroundColor: theme.c1, paddingAll:'6px', paddingStart:'12px', paddingEnd:'12px',
            contents:[
              {type:'text', text: ribbonText, color:'#FFFFFF', size:'xs', weight:'bold'}
            ]
          },
          // Content
          {
            type:'box', layout:'horizontal', spacing:'md',
            backgroundColor: theme.bg, paddingAll:'md',
            contents:[
              {type:'image', url: imgUrl, size:'xs', aspectRatio:'1:1', aspectMode:'cover', flex:0},
              {type:'box', layout:'vertical', flex:1, spacing:'xs', contents: bodyContents}
            ]
          }
        ]
      });

      // Add discount badge below image area? — LINE Flex doesn't support absolute positioning.
      // Use prefix on ribbon if % calculable
      if(discPct > 0){
        // append "-XX%" to ribbon text — done above? Let me update ribbon to include it
        // Actually, simpler: append directly via altText
      }
      return;
    }

    // ============= REGULAR ITEM =============
    itemContents.push({
      type:'box', layout:'horizontal', spacing:'md',
      margin: idx === 0 ? 'none' : 'md',
      contents:[
        {type:'image', url: imgUrl, size:'xs', aspectRatio:'1:1', aspectMode:'cover', flex:0},
        {type:'box', layout:'vertical', flex:1, spacing:'xs',
          contents:[
            {type:'text', text:(idx+1)+'. '+String(c.name||'-'),
             weight:'bold', size:'sm', color:'#0A1628', wrap:true, maxLines:2},
            {type:'text', text:'#'+String(c.code||''), size:'xs', color:'#2080BE', weight:'bold'},
            {
              type:'box', layout:'baseline', spacing:'xs', margin:'sm',
              contents:[
                {type:'text', text:c.price.toLocaleString('th-TH'), size:'sm',
                 color:'#0A1628', weight:'bold', flex:0},
                {type:'text', text:'×', size:'sm', color:'#6B7280', flex:0},
                {type:'text', text:String(c.qty), size:'md',
                 color:'#2080BE', weight:'bold', flex:0},
                {type:'text', text:'= '+lineTotal.toLocaleString('th-TH'),
                 size:'md', color:'#2080BE', weight:'bold', flex:1, align:'end'}
              ]
            }
          ]
        }
      ]
    });
  } // end _renderSingleItem

  // เรียก render ทั้ง 2 sections
  const hasMulti = regularItems.length > 0 && preorderItems.length > 0;
  if(regularItems.length > 0){
    renderItemsToContents(regularItems, 0, hasMulti ? {
      text: '🟦 พร้อมส่ง ('+regularItems.length+' รายการ)',
      bg: '#E6F1FB', color: '#0C447C'
    } : null);
  }
  if(preorderItems.length > 0){
    renderItemsToContents(preorderItems, regularItems.length, {
      text: '📦 สั่งจอง — รอสินค้า ('+preorderItems.length+' รายการ)',
      bg: '#F3F4F6', color: '#374151'
    });
    // Notice box ใต้ section สั่งจอง — wording อบอุ่น ไม่ผูกเวลา
    itemContents.push({
      type:'box', layout:'vertical', margin:'md',
      backgroundColor:'#FFF8E6', paddingAll:'md', cornerRadius:'md',
      borderColor:'#FAC775', borderWidth:'1px',
      contents:[
        {type:'text', text:'💌 ขอบคุณสำหรับการสั่งจองค่ะ',
         size:'xs', weight:'bold', color:'#7C5E00', wrap:true},
        {type:'text', text:'น้องเซลล์จะรีบเช็คสต๊อกและแจ้งรอบส่งกลับให้นะคะ ✨',
         size:'xs', color:'#633806', wrap:true, margin:'xs'}
      ]
    });
  }

  itemContents.push({type:'separator', margin:'lg', color:'#0A1628'});
  const totalQty = cartItems.reduce((s, c) => s + (c.qty || 0), 0);
  // คำนวณยอดประหยัด
  const totalSavings = cartItems.reduce(function(s, c){
    const prod = allProducts.find(function(p){ return p.code === c.code; });
    if(prod && prod.originalPrice && prod.originalPrice > c.price){
      return s + (prod.originalPrice - c.price) * c.qty;
    }
    return s;
  }, 0);

  // Subtotal row — แสดง "ยอดส่วนนี้" สำหรับ chunk ที่ไม่ใช่อันสุดท้าย
  const subtotalLabel = isMultiChunk
    ? 'ยอดส่วนนี้ ('+cartItems.length+' รายการ · '+totalQty+' ชิ้น)'
    : 'ยอดรวม ('+cartItems.length+' รายการ · '+totalQty+' ชิ้น)';
  const totalRowContents = [
    {type:'text', text: subtotalLabel, size:'xs', weight:'bold', color:'#0A1628', flex:3, wrap:true},
    {type:'text', text: total.toLocaleString('th-TH')+' บาท', size:'lg', weight:'bold', color:'#0A1628', align:'end', flex:2}
  ];
  itemContents.push({type:'box', layout:'horizontal', margin:'md', contents: totalRowContents});

  if(totalSavings > 0){
    itemContents.push({
      type:'text', margin:'xs', align:'end',
      text:'✓ ประหยัด '+totalSavings.toLocaleString('th-TH')+' บาท',
      size:'xs', color:'#06c755', weight:'bold'
    });
  }

  // Grand total — เฉพาะ card สุดท้าย (isLast) เมื่อมีหลาย chunk
  if(isMultiChunk && opts.isLast && opts.grandTotal){
    itemContents.push({type:'separator', margin:'md', color:'#2080BE'});
    itemContents.push({
      type:'box', layout:'horizontal', margin:'sm',
      backgroundColor:'#E6F1FB', paddingAll:'sm', cornerRadius:'md',
      contents:[
        {type:'text', text:'🎯 ยอดรวมทั้งบิล ('+(opts.totalItems||cartItems.length)+' รายการ)',
         size:'xs', weight:'bold', color:'#0065a8', flex:3, wrap:true},
        {type:'text', text: opts.grandTotal.toLocaleString('th-TH')+' บาท',
         size:'lg', weight:'bold', color:'#0065a8', align:'end', flex:2}
      ]
    });
  }

  const headerContents = [
    {type:'text', text:'เปรียว คอสเมติกส์', color:'#FFFFFF', size:'md', weight:'bold'},
    {type:'text', text:'VIP Order #'+orderId, color:'#FFFFFF', size:'sm', margin:'sm'},
    {type:'text', text: timestamp, color:'#B5D4F4', size:'xs'}
  ];
  if(customerName){
    headerContents.push({type:'text', text:'ลูกค้า: '+String(customerName), color:'#FFFFFF', size:'sm', margin:'sm', wrap:true});
  }
  // Multi-chunk header: แสดง "ตะกร้า X/Y · N รายการ"
  if(isMultiChunk){
    headerContents.push({
      type:'box', layout:'horizontal', margin:'sm', spacing:'sm',
      backgroundColor:'#FFFFFF26', cornerRadius:'md', paddingAll:'xs',
      contents:[
        {type:'text', text:'🛒 ตะกร้า '+opts.chunkIdx+'/'+opts.totalChunks,
         color:'#FFFFFF', size:'xs', weight:'bold', flex:3},
        {type:'text', text: cartItems.length+' รายการ',
         color:'#E6F1FB', size:'xs', align:'end', flex:2}
      ]
    });
  }

  return {
    type:'bubble',
    size:'mega',
    header:{
      type:'box',
      layout:'vertical',
      backgroundColor:'#2080BE',
      paddingAll:'md',
      contents: headerContents
    },
    body:{
      type:'box',
      layout:'vertical',
      paddingAll:'md',
      contents: itemContents
    },
    footer:{
      type:'box',
      layout:'vertical',
      paddingAll:'md',
      spacing:'sm',
      contents:[
        {type:'text', text:'รอน้อง Salesman แจ้งยอดชำระสักครู่ค่ะ',
         size:'xs', color:'#888888', align:'center', wrap:true, margin:'none'},
        {type:'text', text:'💻 PC: ลากคลุม #SKU แล้วกด Ctrl+C เพื่อคัดลอก',
         size:'xxs', color:'#aaaaaa', align:'center', wrap:true, margin:'xs'}
      ]
    }
  };
}

// Smart Adaptive Format + Batch sending — รองรับ 50 → 500+ SKU/บิล
// LINE Flex JSON limit = 50KB/message · liff.sendMessages = 5 msgs/call
const FLEX_BATCH_SIZE = 5;          // LIFF cap per call
const HYBRID_A_COUNT = 15;          // ใน Hybrid mode: 15 รายการแรก/card = Format A (รักษา 50KB cap)

function decideFlexStrategy(totalItems){
  // Returns {mode, perCard}
  //   ค่าระวัง 50% margin จาก 50KB cap (เจอ INVALID_MESSAGE จริงที่ 70/card HYBRID)
  //   mode 'A':      Visual + ribbon (~900B/item) → 25/card
  //   mode 'HYBRID': 15 visual + 35 compact = 50/card
  //   mode 'B':      Compact + small img (~400B/item) → 80/card
  if(totalItems <= 25)   return { mode: 'A',      perCard: 25 };
  if(totalItems <= 100)  return { mode: 'HYBRID', perCard: 50 };
  if(totalItems <= 400)  return { mode: 'B',      perCard: 80 };
  return { mode: 'B', perCard: 80, warn: true };
}

// Flex อย่างเดียว (ไม่มี text duplicate) — adaptive split ตาม strategy
// ============================================================
// buildOrderMessages — Format C (SKU-first plain text)
// PC: drag-select + Ctrl+C · Mobile: long-press → คัดลอก
// LINE limit: 5000 chars/message · 5 messages/call
// ============================================================
const TEXT_MSG_LIMIT = 4500;  // safety margin under LINE 5000 cap

function buildOrderMessages(orderId, timestamp, customerName, cartItems, total){
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
    if(prod && prod.originalPrice && prod.originalPrice > c.price){
      return s + (prod.originalPrice - c.price) * c.qty;
    }
    return s;
  }, 0);

  // Format 2 บรรทัด/item:
  //   1. NIVEA Cream 50ml
  //      8851001 ×2 = 240 (🔥 SALE — ลด 30% · เดิม 60)
  function fmtLine(c, idx){
    const prod = allProducts.find(function(p){ return p.code === c.code; });
    const lineTotal = c.price * c.qty;
    let promoTag = '';
    if(prod && prod.promoType){
      const parts = [];
      // ใช้ promoLabel ที่มีทั้ง emoji + คำอธิบาย เช่น "🔥 SALE — ลด 30%"
      const label = (prod.promoLabel || '').trim();
      if(label) parts.push(label);
      // แสดงราคาเดิมถ้ามี (เพื่อเปรียบเทียบ)
      const orig = prod.originalPrice || 0;
      if(orig > c.price && orig > 0){
        parts.push('เดิม ' + orig.toLocaleString('th-TH'));
      }
      if(parts.length > 0) promoTag = ' (' + parts.join(' · ') + ')';
    }
    // 2-line format: ลำดับ + ชื่อสินค้า (โปร) → SKU ×qty = total
    return idx + '. ' + (c.name || '') + '\n   ' + c.code + ' ×' + c.qty + ' = ' + lineTotal.toLocaleString('th-TH') + promoTag;
  }

  // สร้าง lines ทั้งหมด
  const lines = [];
  lines.push('🛒 #' + orderId);
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
      ? '🛒 #' + orderId + ' (ต่อ ' + (idx + 1) + '/' + totalParts + ')\n' + text
      : text;
    console.log('[Text] msg', (idx+1)+'/'+totalParts, '·', finalText.length, 'chars');
    return { type: 'text', text: finalText };
  });

  console.log('[Text] TOTAL', messages.length, 'message(s) ·', cartItems.length, 'items');
  return messages;
}

// แสดง success modal
function showSuccessModal(orderId){
  const mo = document.createElement('div');
  mo.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  mo.innerHTML =
    '<div style="background:#fff;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.3);animation:slideUp .4s ease">'
    +'<div style="width:72px;height:72px;background:#e8f8ee;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:38px;color:#06c755">✓</div>'
    +'<div style="font-size:1.2rem;font-weight:800;color:#0a1628;margin-bottom:8px">ส่งออเดอร์สำเร็จ!</div>'
    +'<div style="font-size:.85rem;color:#666;margin-bottom:4px">เลขออเดอร์: <strong style="color:#2080be">#'+orderId+'</strong></div>'
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
async function quickSendPC(orderId, timestamp, customerName, fullText, total){
  const itemCount = cart.length;
  const totalQty = cart.reduce(function(s,c){ return s + (c.qty || 0); }, 0);

  // 1. Confirm popup
  const ok = confirm(
    'ส่งออเดอร์ #' + orderId + ' ?\n\n' +
    itemCount + ' รายการ · ' + totalQty + ' ชิ้น\n' +
    'ยอดรวม: ' + total.toLocaleString('th-TH') + ' บาท\n\n' +
    '✓ ตกลง = คัดลอกออเดอร์เข้า clipboard\n' +
    '✗ ยกเลิก = กลับไปแก้\n\n' +
    '(ต่อจากนั้น: เปิด LINE PC → แชตเปรียว → Ctrl+V → Enter)'
  );
  if(!ok) return false;

  // 2. Auto-copy + store for retry
  window._lastOrderText = fullText;
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

  // 3. Clear cart + close cart sidebar
  cart = [];
  clearCartStorage();
  resetAllCardButtons();
  renderCart();
  closeCart();

  // 4. Show toast — clipboard พร้อมแล้ว ให้ user สลับไป LINE PC เอง (ไม่เปิด URL)
  showQuickSendToast(orderId, itemCount, total, copyOk);
  return true;
}

function showQuickSendToast(orderId, count, total, copyOk){
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
    + '<div style="font-weight:800;font-size:1rem;margin-bottom:8px">✓ #' + orderId + ' พร้อมส่ง</div>'
    + '<div style="font-size:.8rem;line-height:1.7;opacity:.95;margin-bottom:10px">'
      + count + ' รายการ · ' + total.toLocaleString('th-TH') + ' บาท<br>'
      + '<strong>' + copyStatus + '</strong>'
    + '</div>'
    + '<div style="background:rgba(255,255,255,.18);padding:10px 12px;border-radius:8px;font-size:.8rem;line-height:1.7">'
      + '<strong>วิธีส่ง:</strong><br>'
      + '1. สลับไป <strong>LINE PC</strong> ที่เปิดอยู่<br>'
      + '2. เปิดแชต <strong>เปรียว คอสเมติกส์</strong><br>'
      + '3. กด <strong>Ctrl+V → Enter</strong>'
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

function showFallbackModal(orderId, timestamp, text, shortText){
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
    +'<div style="font-weight:800;font-size:1.05rem;color:#2080be;margin-bottom:4px">สรุปออเดอร์ #'+orderId+'</div>'
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
            var pOrig = prod.originalPrice || 0;
            if(pOrig > c.price && pOrig > 0) pp.push('เดิม ' + pOrig.toLocaleString('th-TH'));
            if(pp.length > 0){
              var pColor = prod.promoType === 'sale' ? {bg:'#FFFAEB',fg:'#7C5E00',bd:'#F59E0B'}
                          : prod.promoType === 'bundle' ? {bg:'#F0F7FF',fg:'#0C447C',bd:'#2080BE'}
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
            + '<div style="display:flex;justify-content:space-between;font-size:.72rem"><span style="color:#888">'+c.price.toLocaleString('th-TH')+' × '+c.qty+'</span><span style="color:#2080be;font-weight:700">'+(c.price*c.qty).toLocaleString('th-TH')+' ฿</span></div>'
            + promoBadge
            + '</div>'
            + '</div>';
        });
        var totalQty = cart.reduce(function(s,c){ return s + (c.qty||0); }, 0);
        var total = cart.reduce(function(s,c){ return s + (c.price*c.qty); }, 0);
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
    const m = document.getElementById('lineModalOverlay');
    if(m && m.style.display === 'flex'){ m.style.display = 'none'; }
    const ml = document.getElementById('lineLoadingOverlay');
    if(ml && ml.style.display === 'flex'){ ml.style.display = 'none'; }
    const mn = document.getElementById('lineNoAppOverlay');
    if(mn && mn.style.display === 'flex'){ mn.style.display = 'none'; }
  }
});
window.openLineModal = openLineModal;
window.closeLineModal = closeLineModal;
// === LINE PC App Opening (with Loading Spinner) ===
function openLinePCWithLoading(){
  showLineLoading();
  // Trigger line:// protocol via anchor click (most reliable)
  const a = document.createElement('a');
  a.href = 'line://ti/p/%40evp5054h';
  a.target = '_blank';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){
    try{ if(a.parentNode) a.parentNode.removeChild(a); }catch(e){}
  }, 200);
  // รอ 5 วินาที ให้ LINE Desktop เปิดจนเสร็จ — แล้วค่อย hide loading
  // (manual close ใช้ได้ตลอด ถ้า user ไม่อยากรอ)
  setTimeout(hideLineLoading, 5000);
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
    sendBtn.innerHTML = '⏳ กำลังส่ง...';
    sendBtn.style.opacity = '0.7';
  }

  // Generate order metadata
  const orderId = genOrderId();
  const timestamp = getTimestampTH();
  const memberInput = document.getElementById('memberInput');
  const memberFromInput = memberInput ? (memberInput.value || '').trim() : '';
  const customerName = (liffProfile && liffProfile.displayName) || memberFromInput || '';
  const total = cart.reduce((s,c) => s + (c.price * c.qty), 0);

  // เตรียม text — fullText สำหรับ modal display + clipboard (Format C เต็ม)
  // shortText สำหรับ QR URL (compact เพื่อไม่ให้ URL ยาวเกิน LINE share limit)
  const messagesForText = buildOrderMessages(orderId, timestamp, customerName, cart, total);
  const fullText = messagesForText.map(function(m){ return m.text; }).join('\n\n');

  // Compact version สำหรับ QR (~25 chars/item)
  const qrLines = ['📋 #' + orderId];
  if(customerName) qrLines.push('👤 ' + customerName);
  cart.forEach(function(c, i){
    qrLines.push((i+1) + '. ' + c.code + ' ×' + c.qty + ' = ' + (c.price*c.qty).toLocaleString('th-TH'));
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
      const messages = buildOrderMessages(orderId, timestamp, customerName, cart, total);
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
      showSuccessModal(orderId);
      window._sendingInProgress = false;
      return;

    } catch(sendErr){
      // Flex ส่งไม่สำเร็จ → fallback ไปใช้ modal ให้ copy เอง
      console.error('[LIFF] Send failed:', sendErr);
      window.__lastErrors && window.__lastErrors.push({
        type:'send-fail',
        msg:'Send failed: '+(sendErr && sendErr.message ? sendErr.message : String(sendErr)),
        time:new Date().toLocaleTimeString()
      });
      restoreBtn();
      const errMsg = (sendErr && sendErr.message) ? sendErr.message : String(sendErr);
      alert('❌ ส่งออเดอร์ผ่าน LIFF ไม่สำเร็จ\n\nError: '+errMsg+'\n\nจะใช้วิธี copy+paste แทน');
      // PC → Quick Send (skip modal) · Mobile → Modal with QR
      const isMobileUA_e = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if(!isMobileUA_e){
        await quickSendPC(orderId, timestamp, customerName, fullText, total);
      } else {
        showFallbackModal(orderId, timestamp, fullText, shortText);
      }
      window._sendingInProgress = false;
      return;
    }
  }

  // Fallback: เปิดผ่าน browser ปกติ / desktop
  restoreBtn();
  // PC → Quick Send (skip modal) · Mobile → Modal with QR
  const isMobileUA_f = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if(!isMobileUA_f){
    await quickSendPC(orderId, timestamp, customerName, fullText, total);
  } else {
    showFallbackModal(orderId, timestamp, fullText, shortText);
  }
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
window.addEventListener('error', function(e){
  window.__lastErrors.push({
    type:'error',
    msg: e.message,
    src: e.filename + ':' + e.lineno + ':' + e.colno,
    time: new Date().toLocaleTimeString()
  });
});
window.addEventListener('unhandledrejection', function(e){
  window.__lastErrors.push({
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
  info.push('buildFlexBubble: ' + typeof buildFlexBubble);
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
