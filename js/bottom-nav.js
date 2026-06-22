/* ============================================================
 * Bottom Navigation Bar — Standalone Module
 * ============================================================
 * Self-contained logic for Mobile Bottom Tab Bar (≤1024px).
 * Wrapped in IIFE — private state, public API via window.*
 *
 * --- DEPENDENCIES ON app.js (globals read) ---
 *   - goHome()       — navigates to home view
 *   - goCat(catId)   — navigates to category
 *   - setMobTag(tag) — applies tag filter (Hot/New/Promo)
 *   - toggleCart()   — opens/closes cart panel
 *   - cart           — cart items array
 *   - liffProfile    — LINE login profile (optional)
 *   - curTag         — current active filter tag
 *
 * --- PUBLIC API (window.*) ---
 *   bottomTabClick(tab)          — onclick handler from HTML
 *   updateBottomTabActive()      — sync active tab to current state
 *   updateBottomTabCartBadge()   — refresh cart count badge
 *   showAccountModal()           — open Account modal
 *   closeAccountModal()          — close Account modal
 *   updateIndicatorPosition()    — reposition indicator + cutout
 *   _clearTabOverride()          — close all modals + reset override
 *   _closeCartPanel()            — close cart panel (idempotent)
 *   _closeAccountModal()         — close account modal (idempotent)
 *
 * --- DOM REQUIREMENTS ---
 *   nav.bottom-tab-bar > svg.bar-bg > path
 *                     > button.tab-item × 5 (data-tab="home|products|trend|cart|account")
 *                     > span.indicator
 *   #cartPanel, #overlay, #accountModalOverlay, #bottomTabCartBadge
 *   #accountVipInput, #accountVipStatus, #accountUserName,
 *   #accountUserStatus, #accountProfileArea, #accountCartInfo
 *
 * --- LINKED LOGIC (Group D Navigation Contract) ---
 *   app.js's updateSidebarActive() calls:
 *     _clearTabOverride() + updateBottomTabActive()
 *   Cart change events should call:
 *     updateBottomTabCartBadge() + updateBottomTabActive()
 *
 * --- GEOMETRY CONSTANTS (must match bottom-nav.css) ---
 *   bar height: 70px, corner radius: 16px
 *   cutout mouth: 104px, depth: 45px
 *   indicator: 58×58, icon lift: -26px
 * ============================================================ */

(function(){
  'use strict';

  // ============================================================
  // SECTION 1: Private State
  // ============================================================
  var _bottomTabOverride = null;     // 'cart' | 'account' | null — for modal tabs
  var _barPathCurrentX = null;       // current SVG cutout center X (animated)
  var _barPathRaf = null;            // requestAnimationFrame ID for path animation

  // ============================================================
  // SECTION 2: Panel Close Helpers (idempotent — safe to call anytime)
  // ============================================================
  function _closeCartPanel(){
    var cp = document.getElementById('cartPanel');
    if(cp && cp.classList.contains('open')){
      cp.classList.remove('open');
      var ov = document.getElementById('overlay');
      if(ov) ov.classList.remove('show');
    }
  }
  function _closeAccountModal(){
    var am = document.getElementById('accountModalOverlay');
    if(am && am.style.display !== 'none') am.style.display = 'none';
  }
  function _clearTabOverride(){
    // Reset override + close BOTH panels (handles stacked cart+account case)
    _bottomTabOverride = null;
    _closeCartPanel();
    _closeAccountModal();
  }

  // ============================================================
  // SECTION 3: SVG Path Generator — seamless cutout
  // ============================================================
  // Geometry: 104x65 cutout fitting 58px circle indicator (settled at top:0 — flush with bar top)
  // Bezier control points from validated SVG mockup
  function _buildBarPathD(activeX, barW, barH){
    var corner = 16;
    var halfMouth = 52;                                              // half of 104
    var s1 = { end:[-37.348, 23.3871], cp1:[-43.8, 0],    cp2:[-40.85, 10.6889] };  // mouth → intermediate
    var s2 = { end:[0, 65],            cp1:[-32.2, 42.0189], cp2:[-25.87, 65] };  // intermediate → bottom
    // Clamp so cutout never crosses bar corners
    var cx = Math.max(halfMouth + corner, Math.min(barW - halfMouth - corner, activeX));
    return [
      'M ' + corner + ' 0',
      'H ' + (cx - halfMouth),
      'C ' + (cx + s1.cp1[0]) + ' ' + s1.cp1[1] + ' ' + (cx + s1.cp2[0]) + ' ' + s1.cp2[1] + ' ' + (cx + s1.end[0]) + ' ' + s1.end[1],
      'C ' + (cx + s2.cp1[0]) + ' ' + s2.cp1[1] + ' ' + (cx + s2.cp2[0]) + ' ' + s2.cp2[1] + ' ' + (cx + s2.end[0]) + ' ' + s2.end[1],
      'C ' + (cx - s2.cp2[0]) + ' ' + s2.cp2[1] + ' ' + (cx - s2.cp1[0]) + ' ' + s2.cp1[1] + ' ' + (cx - s1.end[0]) + ' ' + s1.end[1],
      'C ' + (cx - s1.cp2[0]) + ' ' + s1.cp2[1] + ' ' + (cx - s1.cp1[0]) + ' ' + s1.cp1[1] + ' ' + (cx + halfMouth) + ' 0',
      'H ' + (barW - corner),
      'Q ' + barW + ' 0 ' + barW + ' ' + corner,
      'V ' + (barH - corner),
      'Q ' + barW + ' ' + barH + ' ' + (barW - corner) + ' ' + barH,
      'H ' + corner,
      'Q 0 ' + barH + ' 0 ' + (barH - corner),
      'V ' + corner,
      'Q 0 0 ' + corner + ' 0',
      'Z'
    ].join(' ');
  }

  function _drawBarPath(activeX){
    var bar = document.querySelector('.bottom-tab-bar');
    if(!bar) return;
    var svg = bar.querySelector('.bar-bg');
    if(!svg) return;
    var path = svg.querySelector('path');
    if(!path) return;
    var r = bar.getBoundingClientRect();
    var w = r.width, h = r.height;
    if(w < 50) return;     // not yet laid out
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    path.setAttribute('d', _buildBarPathD(activeX, w, h));
  }

  // rAF interpolation — animates cutout smoothly between tabs
  function _animateBarPath(targetX){
    if(_barPathCurrentX === null){
      _barPathCurrentX = targetX;
      _drawBarPath(targetX);
      return;
    }
    if(Math.abs(_barPathCurrentX - targetX) < 0.5) return;
    var startX = _barPathCurrentX;
    var startT = performance.now();
    var dur = 500;
    if(_barPathRaf) cancelAnimationFrame(_barPathRaf);
    function step(now){
      var t = Math.min(1, (now - startT) / dur);
      var eased = 1 - Math.pow(1 - t, 3);          // ease-out-cubic
      _barPathCurrentX = startX + (targetX - startX) * eased;
      _drawBarPath(_barPathCurrentX);
      if(t < 1) _barPathRaf = requestAnimationFrame(step);
      else _barPathRaf = null;
    }
    _barPathRaf = requestAnimationFrame(step);
  }

  // ============================================================
  // SECTION 4: Indicator Positioning (sync cutout + circle + icon)
  // ============================================================
  function updateIndicatorPosition(){
    var bar = document.querySelector('.bottom-tab-bar');
    if(!bar) return;
    var activeTab = bar.querySelector('.tab-item.active');
    var indicator = bar.querySelector('.indicator');
    if(!activeTab || !indicator) return;
    var barRect = bar.getBoundingClientRect();
    var tabRect = activeTab.getBoundingClientRect();
    var tabCenter = tabRect.left - barRect.left + tabRect.width / 2;
    // Compute clamped X — same constraints as _buildBarPathD
    var corner = 16, halfMouth = 52, barW = barRect.width;
    var clampedX = Math.max(halfMouth + corner, Math.min(barW - halfMouth - corner, tabCenter));
    // Indicator follows cutout (not tab) — keeps them synced at edge tabs
    var indicatorWidth = indicator.offsetWidth || 58;
    indicator.style.left = (clampedX - indicatorWidth / 2) + 'px';
    // Shift active icon to align with indicator (bridges gap when tabCenter !== clampedX)
    var shift = clampedX - tabCenter;
    bar.querySelectorAll('.tab-bubble').forEach(function(b){ b.style.setProperty('--bubble-shift-x','0px'); });
    var activeBubble = activeTab.querySelector('.tab-bubble');
    if(activeBubble) activeBubble.style.setProperty('--bubble-shift-x', shift + 'px');
    // SVG cutout follows via rAF
    _animateBarPath(clampedX);
  }

  // ============================================================
  // SECTION 5: Tab Click Handler
  // ============================================================
  function bottomTabClick(tab){
    var api = window.AppAPI;  // (Group J) — Pub/Sub: avoid direct app.js coupling
    if(tab === 'home'){
      _clearTabOverride();
      if(api) api.goHome();
    } else if(tab === 'products'){
      _clearTabOverride();
      if(api) api.goCat('all');
    } else if(tab === 'trend'){
      _clearTabOverride();
      if(api) api.setMobTag('Hot');
    } else if(tab === 'cart'){
      _closeAccountModal();                                       // prevent stacking
      _bottomTabOverride = 'cart';
      if(api) api.toggleCart();
      // Cart might toggle (open/close) — verify after
      setTimeout(function(){
        var cp = document.getElementById('cartPanel');
        if(!cp || !cp.classList.contains('open')) _bottomTabOverride = null;
        updateBottomTabActive();
      }, 50);
    } else if(tab === 'account'){
      _closeCartPanel();                                          // prevent stacking
      _bottomTabOverride = 'account';
      showAccountModal();
    }
    updateBottomTabActive();
  }

  // ============================================================
  // SECTION 6: Active State Manager
  // ============================================================
  function updateBottomTabActive(){
    var bar = document.querySelector('.bottom-tab-bar');
    if(!bar) return;
    var tabs = bar.querySelectorAll('.tab-item');
    if(!tabs.length) return;
    var active = '';
    // Modal override takes priority (cart/account)
    if(_bottomTabOverride === 'cart'){
      var cp = document.getElementById('cartPanel');
      if(cp && cp.classList.contains('open')) active = 'cart';
      else _bottomTabOverride = null;
    } else if(_bottomTabOverride === 'account'){
      var am = document.getElementById('accountModalOverlay');
      if(am && am.style.display === 'flex') active = 'account';
      else _bottomTabOverride = null;
    }
    // Default — derive from view state
    if(!active){
      var homeEl = document.getElementById('home');
      var isHome = homeEl && homeEl.style.display !== 'none';
      if(isHome) {
        active = 'home';
      } else {
        var ct = window.AppAPI ? window.AppAPI.getCurTag() : '';
        if(ct === 'Hot' || ct === 'New' || ct === 'Promo') active = 'trend';
        else active = 'products';
      }
    }
    tabs.forEach(function(t){ t.classList.toggle('active', t.dataset.tab === active); });
    // Reposition indicator + cutout (next frame so layout settles)
    requestAnimationFrame(updateIndicatorPosition);
  }

  function updateBottomTabCartBadge(){
    var badge = document.getElementById('bottomTabCartBadge');
    if(!badge) return;
    // (Group J) อ่าน cart ผ่าน AppAPI — ตัด direct coupling
    var cartArr = (window.AppAPI && window.AppAPI.getCart) ? window.AppAPI.getCart() : [];
    if(!Array.isArray(cartArr)) cartArr = [];
    // นับตาม SKU (cart.length) ไม่ใช่ qty sum
    var count = cartArr.length;
    if(count > 0){
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ============================================================
  // SECTION 7: Account Modal (with VIP Member + LIFF info)
  // ============================================================
  function showAccountModal(){
    var api = window.AppAPI;  // (Group J) Pub/Sub
    // Sync VIP input from localStorage (key อ่านผ่าน API — Single Source of Truth)
    var vipEl = document.getElementById('accountVipInput');
    var vipKey = (api && api.getVipLsKey) ? api.getVipLsKey() : 'priao_vip_member';
    if(vipEl){
      try { vipEl.value = localStorage.getItem(vipKey) || vipEl.value || ''; } catch(e){}
    }
    // Update LIFF profile info if logged in
    var prof = api && api.getLiffProfile ? api.getLiffProfile() : null;
    if(prof){
      var nameEl = document.getElementById('accountUserName');
      var statusEl = document.getElementById('accountUserStatus');
      var profileArea = document.getElementById('accountProfileArea');
      if(nameEl) nameEl.textContent = prof.displayName || 'ผู้ใช้งาน';
      if(statusEl) statusEl.textContent = '✓ Login ผ่าน LINE แล้ว';
      if(profileArea && prof.pictureUrl){
        var avatar = profileArea.querySelector('div');
        if(avatar){
          avatar.innerHTML = '<img src="' + prof.pictureUrl + '" style="width:60px;height:60px;border-radius:50%;object-fit:cover" alt="">';
          avatar.style.background = 'transparent';
        }
      }
    }
    // Update cart summary
    var cartInfoEl = document.getElementById('accountCartInfo');
    var cartArr = api && api.getCart ? api.getCart() : [];
    if(cartInfoEl){
      if(cartArr && cartArr.length > 0){
        var totalQty = cartArr.reduce(function(s,c){ return s+(c.qty||0); }, 0);
        cartInfoEl.textContent = cartArr.length + ' รายการ · ' + totalQty + ' ชิ้น';
      } else {
        cartInfoEl.textContent = 'ตรวจรายการสินค้าก่อนสั่ง';
      }
    }
    var m = document.getElementById('accountModalOverlay');
    if(m) m.style.display = 'flex';
  }

  function closeAccountModal(){
    var m = document.getElementById('accountModalOverlay');
    if(m) m.style.display = 'none';
    _bottomTabOverride = null;
    updateBottomTabActive();
  }

  // ============================================================
  // SECTION 8: VIP Member localStorage Sync (Account Modal input)
  // ============================================================
  function _initAccountVip(){
    var acctVipEl = document.getElementById('accountVipInput');
    if(!acctVipEl) return;
    // (Group J) อ่าน VIP_LS_KEY ผ่าน AppAPI — Single Source of Truth
    function _vipKey(){ return (window.AppAPI && window.AppAPI.getVipLsKey) ? window.AppAPI.getVipLsKey() : 'priao_vip_member'; }
    // Load saved value
    try { acctVipEl.value = localStorage.getItem(_vipKey()) || ''; } catch(e){}
    // Auto-save on change
    acctVipEl.addEventListener('input', function(){
      try { localStorage.setItem(_vipKey(), (acctVipEl.value || '').trim()); } catch(e){}
      var status = document.getElementById('accountVipStatus');
      if(status){
        status.textContent = '✓ บันทึกแล้ว';
        status.style.color = '#06c755';
        clearTimeout(acctVipEl._statusTimer);
        acctVipEl._statusTimer = setTimeout(function(){
          status.textContent = 'ระบบจำให้อัตโนมัติ — ไม่ต้องกรอกซ้ำครั้งหน้า';
          status.style.color = '#6B7280';
        }, 1500);
      }
    });
    // Prevent Enter from triggering buttons
    acctVipEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); acctVipEl.blur(); }
    });
  }

  // ============================================================
  // SECTION 9: Event Listeners (incl. AppAPI Pub/Sub — Group J)
  // ============================================================
  // Subscribe to app state changes — auto-refresh UI
  document.addEventListener('app:cart-change', function(){
    updateBottomTabCartBadge();
  });
  document.addEventListener('app:nav-change', function(){
    updateBottomTabActive();
  });
  document.addEventListener('app:liff-ready', function(){
    // Refresh profile area next time account modal opens
    // (showAccountModal reads fresh value via AppAPI.getLiffProfile each call)
  });

  // Resize — redraw bar path + reposition indicator
  window.addEventListener('resize', function(){
    if(_barPathCurrentX !== null){
      var bar = document.querySelector('.bottom-tab-bar');
      if(bar){
        var activeTab = bar.querySelector('.tab-item.active');
        if(activeTab){
          var barRect = bar.getBoundingClientRect();
          var tabRect = activeTab.getBoundingClientRect();
          _barPathCurrentX = tabRect.left - barRect.left + tabRect.width / 2;
        }
      }
      _drawBarPath(_barPathCurrentX);
    }
    updateIndicatorPosition();
  });

  // DOM-ready init for VIP input
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _initAccountVip);
  } else {
    _initAccountVip();
  }

  // ============================================================
  // SECTION 10: Public API — expose to global scope (window.*)
  // ============================================================
  window.bottomTabClick           = bottomTabClick;
  window.updateBottomTabActive    = updateBottomTabActive;
  window.updateBottomTabCartBadge = updateBottomTabCartBadge;
  window.showAccountModal         = showAccountModal;
  window.closeAccountModal        = closeAccountModal;
  window.updateIndicatorPosition  = updateIndicatorPosition;
  window._clearTabOverride        = _clearTabOverride;
  window._closeCartPanel          = _closeCartPanel;
  window._closeAccountModal       = _closeAccountModal;
})();
