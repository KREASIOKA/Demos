// LICENSE.js - quarantine + pre-check license + 30s online polling + self-heal overlay
// CONFIG - sesuaikan bila perlu
const GITHUB_LICENSE_URL = 'https://raw.githubusercontent.com/ZAYUVALYA/ZAYUVALYA.github.io/refs/heads/main/LICENSES/LICENSE-UkFJSEFO.json';
const CLIENT_ID = 'TRAFFICSTUDIO';    // sesuai JSON kamu
const OFFLINE_GRACE_DAYS = 2;         // hari izin memakai cache bila offline
const ONLINE_CHECK_INTERVAL_MS = 30_000; // 30 detik saat online
const DOM_HEAL_INTERVAL_MS = 3_000;      // 3s cek self-heal overlay
const CACHE_KEY = 'license_cache_v2';

// ---- util ----
function nowISO(){ return (new Date()).toISOString(); }
function parseISO(s){ const d = new Date(s); return isNaN(d) ? null : d; }
function saveCache(o){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(o)); } catch(e){} }
function readCache(){ try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch(e){ return null; } }

// ---- overlay + blocking helpers ----
const OVERLAY_ID = 'license_blocker_overlay_v3';
function createOverlay(msg='Application locked. Contact vendor.') {
  let ov = document.getElementById(OVERLAY_ID);
  if (!ov) {
    ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.style.cssText = [
      'position:fixed','inset:0','display:flex','align-items:center','justify-content:center',
      'background:rgba(0,0,0,0.90)','color:#fff','z-index:2147483647','padding:20px','text-align:center',
      'font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif'
    ].join(';');
    ov.innerHTML = `<div style="max-width:800px">
      <h2 style="margin:0 0 8px">Application Locked</h2>
      <p id="${OVERLAY_ID}_msg" style="margin:0 0 10px">${String(msg)}</p>
      <p style="opacity:.85;margin:0;font-size:.9em">If you believe this is an error, contact the vendor.</p>
    </div>`;
    document.documentElement.appendChild(ov);
  } else {
    const msgEl = document.getElementById(OVERLAY_ID + '_msg');
    if (msgEl) msgEl.textContent = String(msg);
    ov.style.display = 'flex';
  }

  // best-effort disable interactive elements
  try {
    document.querySelectorAll('button, a, input, textarea, select, [role="button"]').forEach(el=>{
      try { el.setAttribute('data-license-disabled','1'); el.disabled = true; el.style.pointerEvents='none'; el.style.opacity='0.6'; } catch(e){}
    });
  } catch(e){}

  // patch network APIs to reduce app activity
  try {
    if (!window.__LICENSE_PATCHED_FETCH) {
      window.__LICENSE_ORIG_FETCH = window.fetch;
      window.fetch = () => Promise.reject(new Error('Blocked by license'));
      const X = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
      if (X && X.open) {
        window.__LICENSE_ORIG_XHR_OPEN = X.open;
        X.open = function(){ throw new Error('Blocked by license'); };
      }
      window.__LICENSE_PATCHED_FETCH = true;
    }
  } catch(e){}

  window.__LICENSE_BLOCKED = true;
}

function removeOverlay() {
  const ov = document.getElementById(OVERLAY_ID);
  if (ov) ov.remove();
  // unpatch isn't attempted here (app allowed only if we had valid license path)
  window.__LICENSE_BLOCKED = false;
}

// ---- license evaluation ----
function validatePayload(json) {
  if (!json) return { ok:false, reason:'no payload' };
  if (json.client && String(json.client) !== String(CLIENT_ID)) return { ok:false, reason:'client mismatch' };
  const status = (json.status || '').toString().toLowerCase();
  if (!status) return { ok:false, reason:'missing status' };
  return { ok:true, status, expires: json.expires, note: json.note || '', raw: json };
}

async function evaluateLicense(json){
  const v = validatePayload(json);
  if (!v.ok) {
    saveCache({ valid:false, reason:v.reason, payload: json, fetchedAt: nowISO() });
    createOverlay('License invalid: ' + v.reason);
    return false;
  }

  if (v.status === 'paid') {
    saveCache({ valid:true, payload: v.raw, fetchedAt: nowISO() });
    removeOverlay();
    window.__LICENSE_OK = true;
    return true;
  }

  if (v.status === 'pending') {
    const exp = parseISO(v.expires);
    if (!exp) {
      saveCache({ valid:false, reason:'pending-no-expiry', payload: v.raw, fetchedAt: nowISO() });
      createOverlay('License pending but missing expiry date.');
      return false;
    }
    if (exp >= new Date()) {
      saveCache({ valid:true, payload: v.raw, fetchedAt: nowISO() });
      removeOverlay();
      window.__LICENSE_OK = true;
      return true;
    } else {
      saveCache({ valid:false, reason:'expired', payload: v.raw, fetchedAt: nowISO() });
      createOverlay('License expired on ' + exp.toISOString());
      return false;
    }
  }

  // anything else -> unpaid/blocked
  saveCache({ valid:false, reason:'not paid', payload: v.raw, fetchedAt: nowISO() });
  createOverlay('Access disabled: unpaid.');
  return false;
}

// ---- fetch license remote with cache fallback ----
async function fetchRemoteLicense() {
  const url = GITHUB_LICENSE_URL + (GITHUB_LICENSE_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
  const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

async function checkLicenseWithFallback(){
  try {
    const json = await fetchRemoteLicense();
    return await evaluateLicense(json);
  } catch (err) {
    // fallback to cache
    const cached = readCache();
    if (cached && cached.valid === true) {
      const fetchedAt = parseISO(cached.fetchedAt);
      const ageDays = fetchedAt ? (Date.now() - fetchedAt.getTime()) / (1000*60*60*24) : Infinity;
      if (ageDays <= OFFLINE_GRACE_DAYS) {
        console.warn('LICENSE: using cached valid license (age days):', ageDays.toFixed(2));
        window.__LICENSE_OK = true;
        removeOverlay();
        return true;
      } else {
        createOverlay('Offline and cached license grace expired. Connect to internet.');
        return false;
      }
    } else {
      createOverlay('License check failed and no valid cache. Connect to internet.');
      return false;
    }
  }
}

// ---- quarantine mechanism: prevent subsequent scripts from executing until license ok ----
function quarantineFollowingScripts() {
  const allScripts = Array.from(document.getElementsByTagName('script'));
  const current = document.currentScript || Array.from(document.getElementsByTagName('script')).find(s=>s.src && s.src.includes('LICENSE.js'));
  const currentIndex = allScripts.indexOf(current);
  const quarantined = [];

  // quarantine scripts after currentIndex
  for (let i = currentIndex + 1; i < allScripts.length; i++) {
    const s = allScripts[i];
    // store details for later re-creation
    const entry = {
      isExternal: !!s.src,
      src: s.src || null,
      text: s.textContent || null,
      attrs: {}
    };
    // copy attributes (like async, defer) if needed
    for (let j=0; j<s.attributes.length; j++){
      const a = s.attributes[j];
      entry.attrs[a.name] = a.value;
    }
    quarantined.push({node: s, meta: entry});
    try {
      // prevent execution now by setting type to a non-JS type
      s.type = 'text/plain';
    } catch(e){}
  }

  return quarantined;
}

function releaseQuarantinedScripts(quarantined) {
  // create scripts in the same order and remove originals
  (async ()=>{
    for (const q of quarantined) {
      try {
        const orig = q.node;
        const m = q.meta;
        const newS = document.createElement('script');

        // copy attributes except type
        for (const k in m.attrs) {
          try { if (k !== 'type') newS.setAttribute(k, m.attrs[k]); } catch(e){}
        }

        if (m.isExternal && m.src) {
          newS.src = m.src;
          newS.async = false; // preserve order
          // insert before original then remove original (some browsers may keep original)
          orig.parentNode.insertBefore(newS, orig);
          // wait for load to preserve sequence for subsequent inline scripts
          await new Promise((res, rej)=>{
            newS.addEventListener('load', ()=> res());
            newS.addEventListener('error', ()=> res()); // continue on error
          });
          try { orig.remove(); } catch(e){}
        } else {
          // inline script: set text and insert
          newS.textContent = m.text || '';
          orig.parentNode.insertBefore(newS, orig);
          try { orig.remove(); } catch(e){}
          // no need to wait, inline runs immediately
        }
      } catch(e){
        console.error('Error releasing script', e);
      }
    }
  })();
}

// ---- online polling management ----
let onlineInterval = null;
function startOnlinePolling() {
  if (onlineInterval) return;
  // run immediately then every interval
  (async ()=> { await checkLicenseWithFallback(); })();
  onlineInterval = setInterval(()=> { checkLicenseWithFallback(); }, ONLINE_CHECK_INTERVAL_MS);
}
function stopOnlinePolling() {
  if (!onlineInterval) return;
  clearInterval(onlineInterval);
  onlineInterval = null;
}

// ---- self-heal overlay ----
function ensureOverlayAlive() {
  if (window.__LICENSE_BLOCKED) {
    const ov = document.getElementById(OVERLAY_ID);
    if (!ov) {
      createOverlay('Application locked (overlay restored). Contact vendor.');
    } else {
      // re-show in case display changed
      ov.style.display = 'flex';
    }
    // re-disable interactions
    try {
      document.querySelectorAll('button, a, input, textarea, select, [role="button"]').forEach(el=>{
        try { el.setAttribute('data-license-disabled','1'); el.disabled = true; el.style.pointerEvents='none'; el.style.opacity='0.6'; } catch(e){}
      });
    } catch(e){}
  }
}

// observe DOM mutations to restore overlay if removed
const domObserver = new MutationObserver((mutations)=>{
  if (window.__LICENSE_BLOCKED) {
    // quick check: overlay must exist
    const ov = document.getElementById(OVERLAY_ID);
    if (!ov) {
      setTimeout(()=> ensureOverlayAlive(), 50);
    }
  }
});
try { domObserver.observe(document.documentElement || document.body || document, { childList:true, subtree:true, attributes:true }); } catch(e){}

// ---- main bootstrap flow ----
(async function bootstrapLicenseGuard(){
  // 1) quarantine all scripts after this script to prevent execution until we decide
  const quarantined = quarantineFollowingScripts();

  // 2) perform initial license check (remote -> fallback)
  const ok = await checkLicenseWithFallback();

  if (!ok) {
    // not ok -> leave quarantined scripts not released and keep overlay
    // start online polling so it will retry periodically (when online)
    if (navigator.onLine) startOnlinePolling();
    // ensure self-heal runs periodically
    setInterval(()=> { if (window.__LICENSE_BLOCKED) ensureOverlayAlive(); }, DOM_HEAL_INTERVAL_MS);
    return; // do not release scripts
  }

  // 3) license OK -> release quarantined scripts so app can run
  try { releaseQuarantinedScripts(quarantined); } catch(e){ console.error(e); }

  // 4) start online polling: if license later becomes invalid, we will overlay + disable (best-effort)
  if (navigator.onLine) startOnlinePolling();

  // monitor online/offline to start/stop polling
  window.addEventListener('online', ()=> {
    console.info('LICENSE: back online - start polling every', ONLINE_CHECK_INTERVAL_MS, 'ms');
    startOnlinePolling();
  });
  window.addEventListener('offline', ()=> {
    console.info('LICENSE: went offline - stop online polling (will use cache grace)');
    stopOnlinePolling();
  });

  // 5) periodic self-heal to protect overlay if license becomes blocked later
  setInterval(()=> {
    if (window.__LICENSE_BLOCKED) ensureOverlayAlive();
  }, DOM_HEAL_INTERVAL_MS);

  // 6) If later a check fails while app already running, try to block as much as possible
  // We subscribe to license checks by wrapping checkLicenseWithFallback to enforce block when invalid:
  const originalCheck = checkLicenseWithFallback;
  checkLicenseWithFallback = async function(){
    const ok2 = await originalCheck();
    if (!ok2) {
      // block UI (best-effort)
      createOverlay('License invalid or expired. Application disabled.');
      // attempt to stop intervals/timeouts
      try { for(let i=1;i<2000;i++){ clearInterval(i); clearTimeout(i); } } catch(e){}
      window.__LICENSE_BLOCKED = true;
    }
    return ok2;
  };

})();
