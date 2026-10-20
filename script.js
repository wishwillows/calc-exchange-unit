'use strict';
/* ============================================================
   HITUNG. — Kalkulator · Kurs Real-time · Konverter Unit · Tema
   ============================================================ */

const $  = s => document.querySelector(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const fmtID = (n, d = 9) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(n);

function fmtSmart(v){
  const a = Math.abs(v);
  const d = a !== 0 && a < 1 ? 6 : a < 100 ? 4 : 2;
  return fmtID(v, d);
}

function tween(el, from, to, fmt, dur = 480){
  if (REDUCED || !isFinite(from) || !isFinite(to)){ el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function step(t){
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}
function copyText(txt){
  (navigator.clipboard?.writeText(txt) || Promise.reject())
    .then(() => toast('Tersalin ✓'))
    .catch(() => toast('Gagal menyalin'));
}

/* ============================================================
   1) TEMA TERANG / GELAP
   ============================================================ */
const rootEl = document.documentElement;
const metaTheme = document.querySelector('meta[name="theme-color"]');

function storedTheme(){ try{ return localStorage.getItem('hitung-theme'); }catch{ return null; } }
function saveTheme(t){ try{ localStorage.setItem('hitung-theme', t); }catch{} }
function setTheme(t, animate = true){
  if (animate && !REDUCED){
    rootEl.classList.add('theming');
    setTimeout(() => rootEl.classList.remove('theming'), 520);
  }
  rootEl.setAttribute('data-theme', t);
  saveTheme(t);
  metaTheme?.setAttribute('content', t === 'dark' ? '#0b0e18' : '#e9effc');
  requestAnimationFrame(syncHeight);
}
setTheme(storedTheme() ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false);
$('#themeBtn').addEventListener('click', () =>
  setTheme(rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!storedTheme()) setTheme(e.matches ? 'dark' : 'light');
});

/* ============================================================
   2) JAM & NAVIGASI PANEL
   ============================================================ */
function tickClock(){
  $('#clock').textContent =
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
tickClock(); setInterval(tickClock, 1000);

const tabs   = [...document.querySelectorAll('.seg-tab')];
const panels = [...document.querySelectorAll('.panel')];
const panelsBox = $('#panels');
const thumb  = $('#segThumb');
let activeIdx = 0;

function syncHeight(){
  panelsBox.style.height = panels[activeIdx].offsetHeight + 'px';
}
function setPanel(i){
  activeIdx = i;
  thumb.style.transform = `translateX(${i * 100}%)`;
  tabs.forEach((t, k) => {
    t.classList.toggle('is-on', k === i);
    t.setAttribute('aria-selected', k === i);
  });
  panels.forEach((p, k) => {
    p.classList.toggle('is-active', k === i);
    p.classList.toggle('is-left',  k < i);
    p.classList.toggle('is-right', k > i);
  });
  syncHeight();
}
tabs.forEach(t => t.addEventListener('click', () => setPanel(+t.dataset.panel)));

if ('ResizeObserver' in window){
  panels.forEach(p => new ResizeObserver(() => {
    if (p === panels[activeIdx]) syncHeight();
  }).observe(p));
}
window.addEventListener('resize', syncHeight);
document.fonts?.ready.then(syncHeight);
window.addEventListener('load', syncHeight);

/* ============================================================
   3) KALKULATOR  (perbaikan: operand tersimpan saat operator ditekan)
   ============================================================ */
const calc = { entry: '0', prev: null, op: null, fresh: true,
               lastOp: null, lastB: null, err: false };

const valEl   = $('#calcValue');
const trailEl = $('#calcTrail');

const apply = (a, op, b) =>
  op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;

function fmtEntry(entry){
  if (calc.err || entry === 'Error') return 'Tak terdefinisi';
  const neg = entry.startsWith('-');
  let s = neg ? entry.slice(1) : entry;
  let [int, frac] = s.split('.');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const out = frac !== undefined ? int + ',' + frac : int;
  return (neg ? '−' : '') + out;
}

function renderCalc(){
  const txt = fmtEntry(calc.entry);
  valEl.textContent = txt;
  valEl.classList.remove('pop'); void valEl.offsetWidth; valEl.classList.add('pop');
  valEl.classList.toggle('sz-m', txt.length > 9  && txt.length <= 13);
  valEl.classList.toggle('sz-s', txt.length > 13);

  document.querySelectorAll('.key--op').forEach(b =>
    b.classList.toggle('is-sel',
      b.dataset.key === calc.op && calc.fresh && calc.op !== null));
}

function calcDigit(d){
  if (calc.err) calcClear(false);
  if (calc.fresh){ calc.entry = d; calc.fresh = false; }
  else if (calc.entry.replace('-', '').replace('.', '').length < 12){
    calc.entry = calc.entry === '0' ? d : calc.entry + d;
  }
  trailEl.innerHTML = '&nbsp;';
  renderCalc();
}
function calcDot(){
  if (calc.err) calcClear(false);
  if (calc.fresh){ calc.entry = '0.'; calc.fresh = false; }
  else if (!calc.entry.includes('.')) calc.entry += '.';
  renderCalc();
}

/* INTI PERBAIKAN:
   - Rantai operasi: evaluasi dulu, hasil jadi `prev`.
   - Selain itu (operator pertama / ganti operator / setelah `=`):
     nilai layar SEKARANG wajib disimpan ke `prev`.
   Sebelumnya cabang ini hanya jalan saat `fresh`, sehingga "9 ×"
   membiarkan prev = null → tampil "0 ×" dan hasil 0.            */
function calcOp(op){
  if (calc.err) return;
  const cur = parseFloat(calc.entry);
  if (calc.op !== null && !calc.fresh){
    const r = apply(calc.prev, calc.op, cur);
    if (!isFinite(r)){
      calc.err = true; calc.entry = 'Error';
      calc.op = null; calc.prev = null; calc.fresh = true;
      trailEl.innerHTML = '&nbsp;'; renderCalc(); return;
    }
    calc.entry = String(r);
    calc.prev  = r;
  } else {
    calc.prev = cur;           /* ← selalu tangkap operand terkini */
  }
  calc.op = op; calc.fresh = true;
  trailEl.textContent = `${fmtSmart(calc.prev)} ${op}`;
  renderCalc();
}

function calcEquals(){
  if (calc.err) return;
  if (calc.op !== null){
    const b = parseFloat(calc.entry);
    const r = apply(calc.prev, calc.op, b);
    trailEl.textContent = `${fmtSmart(calc.prev)} ${calc.op} ${fmtSmart(b)} =`;
    calc.lastOp = calc.op; calc.lastB = b;
    if (!isFinite(r)){ calc.err = true; calc.entry = 'Error'; }
    else calc.entry = String(r);
    calc.prev = null; calc.op = null; calc.fresh = true;
  } else if (calc.lastOp !== null){
    const a = parseFloat(calc.entry);
    const r = apply(a, calc.lastOp, calc.lastB);
    trailEl.textContent = `${fmtSmart(a)} ${calc.lastOp} ${fmtSmart(calc.lastB)} =`;
    if (!isFinite(r)){ calc.err = true; calc.entry = 'Error'; }
    else calc.entry = String(r);
    calc.fresh = true;
  }
  renderCalc();
}
function calcPercent(){
  if (calc.err) return;
  calc.entry = String(parseFloat(calc.entry) / 100);
  calc.fresh = false; renderCalc();
}
function calcNeg(){
  if (calc.err || calc.entry === '0') return;
  calc.entry = calc.entry.startsWith('-') ? calc.entry.slice(1) : '-' + calc.entry;
  renderCalc();
}
function calcBack(){
  if (calc.err){ calcClear(false); return; }
  if (calc.fresh) return;
  calc.entry = calc.entry.length > 1 ? calc.entry.slice(0, -1) : '0';
  if (calc.entry === '-') calc.entry = '0';
  renderCalc();
}
function calcClear(render = true){
  Object.assign(calc, { entry:'0', prev:null, op:null,
    fresh:true, lastOp:null, lastB:null, err:false });
  trailEl.innerHTML = '&nbsp;';
  if (render) renderCalc();
}

function handleKey(k){
  if (/^\d$/.test(k))            calcDigit(k);
  else if (k === ',')            calcDot();
  else if ('+−×÷'.includes(k) && k.length === 1) calcOp(k);
  else if (k === '=')            calcEquals();
  else if (k === 'ac')           calcClear();
  else if (k === 'pct')          calcPercent();
  else if (k === 'neg')          calcNeg();
  else if (k === 'back')         calcBack();
}

$('#calcGrid').addEventListener('click', e => {
  const btn = e.target.closest('.key'); if (!btn) return;
  handleKey(btn.dataset.key);
});
$('.calc-back').addEventListener('click', () => handleKey('back'));

const KEYMAP = { '*':'×', '/':'÷', '-':'−', '+':'+', 'Enter':'=', '=':'=',
                 'Backspace':'back', 'Escape':'ac', '%':'pct', '.':',', ',':',' };
document.addEventListener('keydown', e => {
  if (activeIdx !== 0) return;
  if (/^[0-9]$/.test(e.key)) handleKey(e.key);
  else if (KEYMAP[e.key]) { if (e.key === '/') e.preventDefault(); handleKey(KEYMAP[e.key]); }
  else return;
  const mapped = e.key === 'Enter' ? '=' : e.key === 'Backspace' ? 'back' :
                 e.key === 'Escape' ? 'ac' : (KEYMAP[e.key] || e.key);
  const btn = document.querySelector(`.key[data-key="${mapped}"]`);
  if (btn){ btn.classList.add('is-lit'); setTimeout(() => btn.classList.remove('is-lit'), 130); }
});

renderCalc();

/* ============================================================
   4) KURS REAL-TIME
   Sumber utama : Coinbase spot (bergerak intraday, CORS terbuka)
   Cadangan     : Frankfurter / ECB (referensi harian)
   Cadangan 2   : tabel statis offline
   Refresh      : tiap 60 detik + grafik riwayat 6 minggu
   ============================================================ */
const CURRENCIES = [
  { code:'IDR', flag:'🇮🇩', name:'Rupiah Indonesia' },
  { code:'USD', flag:'🇺🇸', name:'Dolar AS' },
  { code:'EUR', flag:'🇪🇺', name:'Euro' },
  { code:'GBP', flag:'🇬🇧', name:'Pound Sterling' },
  { code:'JPY', flag:'🇯🇵', name:'Yen Jepang' },
  { code:'SGD', flag:'🇸', name:'Dolar Singapura' },
  { code:'MYR', flag:'🇲🇾', name:'Ringgit Malaysia' },
  { code:'THB', flag:'🇹🇭', name:'Baht Thailand' },
  { code:'AUD', flag:'🇦🇺', name:'Dolar Australia' },
  { code:'CNY', flag:'🇨', name:'Yuan Tiongkok' },
  { code:'KRW', flag:'🇰🇷', name:'Won Korea' },
  { code:'INR', flag:'🇮🇳', name:'Rupee India' },
  { code:'CAD', flag:'🇨🇦', name:'Dolar Kanada' },
  { code:'CHF', flag:'🇨🇭', name:'Franc Swiss' },
  { code:'HKD', flag:'🇭🇰', name:'Dolar HK' },
  { code:'BRL', flag:'🇧🇷', name:'Real Brasil' },
];
const SYM = CURRENCIES.map(c => c.code).filter(c => c !== 'USD').join(',');

let rates = { USD:1, IDR:16300, EUR:.92, GBP:.79, JPY:155, SGD:1.35, MYR:4.7,
              THB:36.5, AUD:1.52, CNY:7.24, KRW:1380, INR:83.5, CAD:1.36,
              CHF:.88, HKD:7.8, BRL:5.4 };
let source = 'offline', lastUpdate = null, nextIn = 60;
let curShown = 0, curRaw = '';
let series = null, seriesAt = 0;

const RING_C = 56.55;

function parseAmount(str){
  let s = (str || '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const d = s.lastIndexOf(','), p = s.lastIndexOf('.');
  const sep = Math.max(d, p);
  let out = s;
  if (sep > -1){
    const frac = s.slice(sep + 1);
    if (s.charAt(sep) === '.' && /^\d{3}$/.test(frac) && d === -1)
      out = s.replace(/\./g, '');
    else
      out = s.slice(0, sep).replace(/[.,]/g, '') + '.' + frac.replace(/[.,]/g, '');
  } else out = s.replace(/[.,]/g, '');
  const n = parseFloat(out);
  return isFinite(n) ? n : 0;
}

async function fetchRates(){
  let ok = false;

  /* 1) Coinbase spot — benar-benar bergerak intraday */
  try{
    const res = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD');
    if (!res.ok) throw 0;
    const j = await res.json();
    const r = { USD: 1 };
    for (const c of CURRENCIES){
      const v = parseFloat(j?.data?.rates?.[c.code]);
      if (isFinite(v) && v > 0) r[c.code] = v;
      else if (rates[c.code])  r[c.code] = rates[c.code];
    }
    if (!r.IDR || !r.EUR) throw 0;
    rates = r; source = 'coinbase'; ok = true;
  }catch{}

  /* 2) Frankfurter / ECB — referensi harian */
  if (!ok){
    try{
      const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${SYM}`);
      if (!res.ok) throw 0;
      const data = await res.json();
      rates = { USD: 1, ...data.rates };
      source = 'ecb'; ok = true;
    }catch{}
  }

  if (!ok) source = 'offline';
  lastUpdate = new Date();
  nextIn = 60;

  const dot = $('#liveDot'), label = $('#liveLabel');
  if (source === 'coinbase'){
    dot.classList.add('on');
    label.textContent = 'Kurs langsung · Coinbase spot';
  } else if (source === 'ecb'){
    dot.classList.add('on');
    label.textContent = 'Kurs referensi · ECB (perbaruan harian)';
  } else {
    dot.classList.remove('on');
    label.textContent = 'Mode perkiraan (offline)';
  }
  $('#curUpdated').textContent = source === 'offline' ? '' :
    'Diperbarui ' + lastUpdate.toLocaleTimeString('id-ID',
      { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  renderCurrency(true);

  /* kartu berdenyut sebagai tanda refresh berlangsung */
  if (ok && !REDUCED){
    const card = $('#curCard');
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
  }

  /* riwayat grafik: muat sekali, segarkan tiap jam */
  if (Date.now() - seriesAt > 3600e3) fetchSeries();
}

/* Riwayat ±6 minggu untuk sparkline & perubahan harian */
async function fetchSeries(){
  const now = Date.now();
  const end = new Date(now), start = new Date(now - 45 * 86400e3);
  const iso = d => d.toISOString().slice(0, 10);
  try{
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${iso(start)}..${iso(end)}?base=USD`);
    if (!res.ok) throw 0;
    const j = await res.json();
    if (j?.rates){ series = j.rates; seriesAt = now; }
  }catch{}
  renderChart();
}

function renderChart(){
  const row = $('#chartRow');
  const f = $('#curFrom').value, t = $('#curTo').value;
  if (!series){ row.hidden = true; return; }
  const dates = Object.keys(series).sort();
  const vals = [];
  for (const d of dates){
    const r = series[d];
    if (r && isFinite(r[f]) && isFinite(r[t]) && r[f] > 0) vals.push(r[t] / r[f]);
  }
  if (vals.length < 2){ row.hidden = true; return; }
  row.hidden = false;

  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const pts = vals.map((v, i) => [
    i / (vals.length - 1) * 100,
    27 - ((v - min) / span) * 24
  ]);
  const line = pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  $('#sparkLine').setAttribute('points', line);
  $('#sparkArea').setAttribute('d',
    `M${pts[0][0].toFixed(2)},30 L${line.split(' ').join(' L')} L${pts[pts.length-1][0].toFixed(2)},30 Z`);
  $('#sparkDot').style.top = (pts[pts.length-1][1] / 30 * 100) + '%';

  const last = vals[vals.length-1], prev = vals[vals.length-2];
  const pct = (last / prev - 1) * 100;
  const up = pct >= 0;
  row.style.setProperty('--trend', up ? '#2fce6f' : '#ff5d5d');
  $('#deltaBadge').textContent =
    `${up ? '▲' : '▼'} ${fmtID(Math.abs(pct), 2)}% · 1 hari`;
  syncHeight();
}

function renderCurrency(instant = false){
  const amt = parseAmount($('#curAmount').value);
  const f = $('#curFrom').value, t = $('#curTo').value;
  const rf = rates[f], rt = rates[t];
  if (!rf || !rt) return;

  const val = amt * rt / rf;
  const numEl = $('#curResult');
  if (instant) numEl.textContent = fmtSmart(val);
  else {
    tween(numEl, curShown, val, fmtSmart);
    numEl.classList.remove('pop'); void numEl.offsetWidth; numEl.classList.add('pop');
  }
  curShown = val; curRaw = String(val);

  const cur = CURRENCIES.find(c => c.code === t);
  $('#curFlag').textContent = cur.flag;
  $('#curSub').textContent  =
    `1 ${f} = ${fmtSmart(rt / rf)} ${t} · ${cur.name}`;
  syncHeight();
}

for (const sel of [$('#curFrom'), $('#curTo')]){
  sel.innerHTML = CURRENCIES.map(c =>
    `<option value="${c.code}">${c.flag} ${c.code} · ${c.name}</option>`).join('');
}
$('#curFrom').value = 'USD';
$('#curTo').value   = 'IDR';

let amtTimer;
$('#curAmount').addEventListener('input', () => {
  clearTimeout(amtTimer);
  amtTimer = setTimeout(() => renderCurrency(), 260);
});
$('#curAmount').addEventListener('blur', () => {
  const n = parseAmount($('#curAmount').value);
  if (n) $('#curAmount').value = fmtID(n, 2);
  renderCurrency();
});
$('#curFrom').addEventListener('change', () => { renderCurrency(); renderChart(); });
$('#curTo').addEventListener('change',   () => { renderCurrency(); renderChart(); });

let curRot = 0;
$('#curSwap').addEventListener('click', () => {
  curRot += 180;
  $('#curSwap svg').style.transform = `rotate(${curRot}deg)`;
  const a = $('#curFrom').value;
  $('#curFrom').value = $('#curTo').value;
  $('#curTo').value = a;
  renderCurrency(); renderChart();
});

$('#curPresets').addEventListener('click', e => {
  const b = e.target.closest('[data-amt]'); if (!b) return;
  $('#curAmount').value = fmtID(+b.dataset.amt, 0);
  renderCurrency();
});

$('#curCard').addEventListener('click', () => copyText(curRaw));

setInterval(() => {
  nextIn = Math.max(0, nextIn - 1);
  $('#ringFg').style.strokeDashoffset = RING_C * (1 - nextIn / 60);
  $('#ringNum').textContent = nextIn;
}, 1000);

fetchRates();
setInterval(fetchRates, 60000);   /* ← pembaruan per menit */
renderCurrency(true);

/* ============================================================
   5) KONVERTER UNIT
   ============================================================ */
const CATS = [
  { id:'panjang', icon:'📏', label:'Panjang', def:['m','km'], units:{
    mm:{l:'Milimeter (mm)', f:.001}, cm:{l:'Sentimeter (cm)', f:.01},
    m:{l:'Meter (m)', f:1}, km:{l:'Kilometer (km)', f:1000},
    in:{l:'Inci (in)', f:.0254}, ft:{l:'Kaki (ft)', f:.3048},
    yd:{l:'Yard (yd)', f:.9144}, mi:{l:'Mil (mi)', f:1609.344 } } },

  { id:'berat', icon:'⚖️', label:'Berat', def:['kg','lb'], units:{
    mg:{l:'Miligram (mg)', f:1e-6}, g:{l:'Gram (g)', f:.001},
    ons:{l:'Ons (100 g)', f:.1}, kg:{l:'Kilogram (kg)', f:1},
    kw:{l:'Kuintal', f:100}, ton:{l:'Ton', f:1000},
    lb:{l:'Pon (lb)', f:.45359237}, oz:{l:'Ons (oz)', f:.028349523 } } },

  { id:'suhu', icon:'🌡️', label:'Suhu', def:['c','f'], units:{
    c:{l:'Celsius (°C)',    toB:v=>v+273.15,          fromB:v=>v-273.15},
    f:{l:'Fahrenheit (°F)', toB:v=>(v-32)*5/9+273.15, fromB:v=>(v-273.15)*9/5+32},
    k:{l:'Kelvin (K)',      toB:v=>v,                 fromB:v=>v},
    r:{l:'Reamur (°R)',     toB:v=>v*1.25+273.15,     fromB:v=>(v-273.15)*.8 } } },

  { id:'luas', icon:'🗺️', label:'Luas', def:['m2','ha'], units:{
    cm2:{l:'Sentimeter²', f:1e-4}, m2:{l:'Meter² (m²)', f:1},
    are:{l:'Are', f:100}, ha:{l:'Hektar (ha)', f:1e4},
    km2:{l:'Kilometer² (km²)', f:1e6}, ft2:{l:'Kaki² (ft²)', f:.09290304},
    ac:{l:'Acre', f:4046.8564 } } },

  { id:'volume', icon:'🧪', label:'Volume', def:['l','gal'], units:{
    ml:{l:'Mililiter (mL)', f:.001}, l:{l:'Liter (L)', f:1},
    m3:{l:'Meter³ (m³)', f:1000}, sdt:{l:'Sendok teh', f:.005},
    sdm:{l:'Sendok makan', f:.015}, cup:{l:'Cangkir (cup)', f:.24},
    floz:{l:'Fluid ounce', f:.0295735}, gal:{l:'Galon AS', f:3.785411784 } } },

  { id:'kecepatan', icon:'🚀', label:'Kecepatan', def:['kmh','ms'], units:{
    kmh:{l:'km/jam', f:1/3.6}, ms:{l:'m/detik', f:1},
    mph:{l:'Mil/jam (mph)', f:.44704}, kn:{l:'Knot', f:.514444 } } },

  { id:'waktu', icon:'⏱️', label:'Waktu', def:['jam','mnt'], units:{
    dtk:{l:'Detik', f:1}, mnt:{l:'Menit', f:60}, jam:{l:'Jam', f:3600},
    hari:{l:'Hari', f:86400}, mgg:{l:'Minggu', f:604800},
    bln:{l:'Bulan (30 hari)', f:2592000}, thn:{l:'Tahun (365 hari)', f:31536000 } } },

  { id:'data', icon:'💾', label:'Data', def:['gb','mb'], units:{
    bit:{l:'Bit', f:1/8}, b:{l:'Byte (B)', f:1}, kb:{l:'Kilobyte (KB)', f:1e3},
    mb:{l:'Megabyte (MB)', f:1e6}, gb:{l:'Gigabyte (GB)', f:1e9},
    tb:{l:'Terabyte (TB)', f:1e12 } } },
];

const catMemory = {};
let catIdx = 0, unitShown = 0, unitRaw = '';

function convert(cat, v, from, to){
  const u = cat.units;
  if (u[from].toB) return u[to].fromB(u[from].toB(v));
  return v * u[from].f / u[to].f;
}

function buildChips(){
  $('#catChips').innerHTML = CATS.map((c, i) =>
    `<button class="chip ${i === 0 ? 'is-on' : ''}" data-cat="${i}">
       ${c.icon} ${c.label}</button>`).join('');
}
function fillUnitSelects(){
  const cat = CATS[catIdx];
  const opts = Object.entries(cat.units)
    .map(([k, u]) => `<option value="${k}">${u.l}</option>`).join('');
  $('#unitFrom').innerHTML = opts;
  $('#unitTo').innerHTML = opts;
  const mem = catMemory[cat.id] || { f: cat.def[0], t: cat.def[1] };
  $('#unitFrom').value = mem.f;
  $('#unitTo').value = mem.t;
  $('#unitIcon').textContent = cat.icon;
}
function renderUnit(){
  const cat = CATS[catIdx];
  const f = $('#unitFrom').value, t = $('#unitTo').value;
  catMemory[cat.id] = { f, t };
  const amt = parseAmount($('#unitAmount').value);
  const val = convert(cat, amt, f, t);
  const numEl = $('#unitResult');
  tween(numEl, unitShown, val, fmtSmart);
  numEl.classList.remove('pop'); void numEl.offsetWidth; numEl.classList.add('pop');
  unitShown = val; unitRaw = String(val);
  $('#unitNote').textContent =
    `1 ${cat.units[f].l} = ${fmtSmart(convert(cat, 1, f, t))} ${cat.units[t].l}`;
  syncHeight();
}

buildChips(); fillUnitSelects(); renderUnit();

$('#catChips').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  catIdx = +b.dataset.cat;
  document.querySelectorAll('#catChips .chip')
    .forEach(c => c.classList.toggle('is-on', c === b));
  fillUnitSelects(); renderUnit();
});

let uTimer;
$('#unitAmount').addEventListener('input', () => {
  clearTimeout(uTimer); uTimer = setTimeout(renderUnit, 260);
});
$('#unitFrom').addEventListener('change', renderUnit);
$('#unitTo').addEventListener('change', renderUnit);

let unitRot = 0;
$('#unitSwap').addEventListener('click', () => {
  unitRot += 180;
  $('#unitSwap svg').style.transform = `rotate(${unitRot}deg)`;
  const a = $('#unitFrom').value;
  $('#unitFrom').value = $('#unitTo').value;
  $('#unitTo').value = a;
  renderUnit();
});

$('#unitCard').addEventListener('click', () => copyText(unitRaw));

/* ============================================================
   6) PARALLAX ORNAMEN (desktop)
   ============================================================ */
if (!REDUCED && matchMedia('(pointer:fine)').matches){
  const decos = [...document.querySelectorAll('.deco, .orb')];
  let mx = 0, my = 0, raf = null;
  addEventListener('pointermove', e => {
    mx = e.clientX / innerWidth - .5;
    my = e.clientY / innerHeight - .5;
    if (!raf) raf = requestAnimationFrame(() => {
      decos.forEach((d, i) => {
        const f = 10 + (i % 4) * 8;
        d.style.translate = `${mx * f}px ${my * f}px`;
      });
      raf = null;
    });
  });
}

syncHeight();
