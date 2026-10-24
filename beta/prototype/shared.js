/* Shared by the front-door pages (flow-a.html, flow-b.html).
   Each page defines seq() (its screen order) and UPD (which screens need redrawing),
   then calls show(first screen). */
'use strict';
var INFL = 0.025;
var $ = function(id){ return document.getElementById(id); };
function money(n){ return 'S$' + Math.round(n).toLocaleString('en-SG'); }
function money1k(n){ return 'S$' + (Math.round(n/1000)*1000).toLocaleString('en-SG'); }
function money10(n){ return 'S$' + (Math.round(n/10)*10).toLocaleString('en-SG'); }
function approx(n){ return n >= 20000 ? money1k(n) : money(Math.round(n/100)*100); }
function pc(x, d){ return (+x).toFixed(d === undefined ? 2 : d).replace(/\.?0+$/, '') + '%'; }
function realMult(rate, yrs){ return Math.pow((1 + rate) / (1 + INFL), yrs); }

/* ===== ALL RATES LIVE HERE. Rates as of October 2026. Sources are secondary unless marked; spot-check on mas.gov.sg before launch (R55). =====
   bank   0.05%  Base rate quoted for traditional bank savings accounts (September 2026 comparison article).
   hy     1.3%   PLANNING EXAMPLE for a high-interest account with few conditions (realistic range 1.0% to 1.5%). Not sourced to one product: advertised maximums are higher but need salary credit or card spending, and sources disagree.
   ssb    2.2%   PLANNING rate for long projections: average of Savings Bond 10-year averages since 2015 (about 2.23%).
   tbill  2.0%   PLANNING rate for long projections: 6-month T-bill yields since mid-2019 average about 2.02%.
   ssb1   1.67%  FIRST-YEAR rate of the current issue (November 2026, SBNOV26). Used only for year-one gains in step 2.
   ssbNow 2.45%  10-year average of the current issue. Shown for reference only, not used in projections.
   tbillNow 1.9% 6-month T-bill cut-off yield at the 8 October 2026 auction. Shown for reference only.
   The SSB figures come from a news report of the MAS announcement of 1 October 2026; the MAS notice itself could not be opened.
   mix    6%     Placeholder for a steady mix of investments (not a forecast). */
var RATES = { bank: 0.0005, hy: 0.013, ssb1: 0.0167, ssb: 0.022, tbill: 0.020, ssbNow: 0.0245, tbillNow: 0.019, mix: 0.06 };
var HY_HIGH = 0.015;   /* top of the realistic range for a high-interest account with few conditions */
var SSB_CAP = 200000;   /* MAS: holding limit per person */
var VOL = 0.15;
var GROSS = { shares: 0.065, mix: 0.05, bonds: 0.03 };
var DIY_COST = 0.003;
var TERM_COST = 400;   /* about S$400 a year for S$500,000 of cover, age 31, non-smoker (source library, R51d; placeholder) */

/* ---------------------------- navigation ---------------------------- */
var cur = null, idx = 0;
function show(id){
  cur = id;
  Array.prototype.forEach.call(document.querySelectorAll('.screen'), function(s){ s.classList.toggle('active', s.id === id); });
  window.scrollTo(0, 0);
  var s = seq(), pos = s.indexOf(id);
  $('progress').textContent = pos >= 0 ? ('Step ' + (pos + 1) + ' of ' + s.length) : '';
  refresh();
}
function next(){ var s = seq(); if (idx < s.length - 1) { idx++; show(s[idx]); } else { toHome(); } }
function prev(){ if (idx === 0) { toHome(); return; } idx--; show(seq()[idx]); }
function go(id){ var p = seq().indexOf(id); if (p >= 0) idx = p; show(id); }
function toHome(){ window.location.href = 'index.html'; }
function refresh(){ if (UPD[cur]) UPD[cur](); }
