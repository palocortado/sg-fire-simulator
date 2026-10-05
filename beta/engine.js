/* =============================================================================
   Financial Independence Simulator for Singapore — engine.js
    Version: V6 staging, Batch 7
    -----------------------------------------------------------------------------
    Batch 7 (roadmap R19, R20, R21, R25, R26, R27, R28, R29):
        - R25 Save format 2: format number, step-by-step conversion of older
          saves, untouched assumptions follow new defaults, import messages,
          separate browser memory for the beta page, dated export file names
        - R26 Export inputs / Upload inputs / Start Over (with confirmation)
          moved into the inputs column
        - R29 Copy share link: the plan is packed into the link itself
        - R27 Monte Carlo default 500 simulations
        - R19 Verified figures; mortgage history relabelled as 3-month SORA
        - R20 Register of dated figures; "Figures as of" in the footer
        - R21 Example plans get SA balances and inflows consistent with OA
        - R28 Footer disclaimer and "How this works"
    Batch 6 (roadmap R15):
        - Expert mode unlocked: everything in Advanced plus Monte Carlo (Step 6)
        - Random yearly returns (lognormal, your return = median), inflation,
        USD/SGD and bank mortgage rates; Global/Singapore correlation 0.7;
        optional fat tails; fixed seed so results only change with inputs
        - Success rate, 10th/50th/90th percentile wealth band on the chart
   Batch 5 (roadmap R8, R11, R13, R14, R16, R22; R12 unchanged by design):
     - R14 CPF realism at 55: Retirement Account up to your Full Retirement Sum
       (or Basic with a property pledge), excess + S$5,000 withdrawable,
       CPF LIFE monthly income from your payout age (Standard or Escalating)
     - R8  Simulation-based finish line; earliest "stop working" age in both modes;
           safe withdrawal rate readout and override (Advanced)
     - R13 Years without enough money are shaded on the chart
     - R16 Cautious / Balanced / Optimistic assumption presets (Advanced)
     - R22 Property downgrade as a one-off event, with CPF refund
     - R11 What-if comparison: Compare on coaching cards; custom what-ifs (Advanced)
   Batch 4 (R7, R9, R10, R23, R24): custom cash flows; HDB/bank loan with two-stage
     rate; CPF questions; Simple by default; CPF layout and OA+SA estimator
   Batch 3 (R1–R6): finish line placement; currency-aware notes; tooltips;
     CPF estimator; auto-scroll; wage-ceiling note
   Batch 2: blank personal inputs with placeholders; marked assumptions; essentials
     gate; example plans; Today's Dollars; labels; cash buffer warnings
   Batch 1: DEFAULTS; blank-vs-zero; Simple/Advanced buckets; SGD/USD; contribution
     growth; CPF lock until 55; Day 1 chart anchor; en-US formatting; archives
   ============================================================================= */
let fireChart;
let incomeStreamCount = 0;
let milestoneCount = 0;
let isLoading = true;

const APP_VERSION = "6.0-batch7";
const SAVE_FORMAT = 2;            // R25: bump when the save layout changes, and add a step to migrateState()
const FIGURES_AS_OF = 'Oct 2026'; // R20: shown in the footer; update at the yearly refresh

// R25: the beta page keeps its own browser memory so testing can't overwrite the live plan
const IS_BETA = typeof location !== 'undefined' && /[/]beta([/]|$)/i.test(location.pathname);
const MAIN_STORAGE_KEY = 'fireSimState_v6';
const STORAGE_KEY = IS_BETA ? 'fireSimState_v6_beta' : MAIN_STORAGE_KEY;
const LEGACY_STORAGE_KEYS = ['fireSimState', 'fireSimState_v5'];

// -----------------------------------------------------------------------------
// DEFAULTS — single source of truth for all default values
// (HTML value="" attributes mirror these; FIELD_DEFAULTS is applied on first load)
// -----------------------------------------------------------------------------
// Personal inputs (ages, balances, contributions, expenses, mortgage) have NO
// defaults: they start blank with placeholder examples in the HTML.
const DEFAULTS = Object.freeze({
    expenseShare: 50,         // % (only used when partner toggle is on)

    // Simple-mode single portfolio (SGD)
    invRet: 5.0,              // nominal %

    // Advanced: Global Investments
    globalCcy: 'SGD',
    globalRetSGD: 6.5,        // nominal %, SGD terms (MSCI World ~6.2% p.a. in SGD since 2001)
    globalRetUSD: 7.0,        // nominal %, USD terms
    fxRate: 1.28,             // SGD per 1 USD (spot ~1.279 on 2 Oct 2026)
    fxDrift: -0.5,            // % per year (negative = SGD strengthens)

    // Advanced: Singapore Investments
    sgRet: 6.0,               // nominal %

    // Cash
    cashYield: 1.5,           // nominal %

    // Macro (Advanced)
    inflation: 2.5,           // %
    realContribGrowth: 0,     // % per year above inflation

    // Housing
    mortgageRate: 2.6,        // % (HDB concessionary = CPF OA rate + 0.1%)
    mortgageRateBank: 2.5,    // % starting value when switching to a bank loan
    mortgageRateLong: 2.5,    // % long-run bank rate after lock-in (10-yr avg to Q2 2026 ~2.5%)
    lockYrs: 2,               // years left on the current bank package
    mortgageShare: 50,        // % (only used when partner toggle is on)

    // CPF
    oaRate: 2.5,              // statutory floor, %
    saRate: 4.0,              // statutory floor, % (SA and Retirement Account)
    cpfUnlockAge: 55,
    frs2026: 220400,          // Full Retirement Sum for members turning 55 in 2026
    frsGrowth: 3.5,           // % a year (2026 -> 2027 announced increase)
    lifeAge: 65,              // CPF LIFE payout start age (65–70)
    lifePlan: 'standard',     // 'standard' or 'escalating'

    // Safe withdrawal rate override (Advanced)
    swrRate: 3.5,             // %

    // Monte Carlo (Expert, R15)
    mcRuns: 500,
    volGlobal: 15,            // % a year, global equity index
    volSg: 17,                // % a year, single-country index
    volInfl: 1.8,             // percentage points a year
    volFx: 5,                 // % a year (estimate; R19)
    volMort: 1.0              // percentage points a year, bank loans after lock-in
});


// -----------------------------------------------------------------------------
// R20: DATED FIGURES REGISTER. Review every October and update FIGURES_AS_OF.
// Format: figure, value, source, where it appears (E = engine.js, H = index.html).
//   Singapore inflation averages, 1.72% / 2.14% / 1.68% (10/20/30 yrs to 2025),
//     SingStat CPI, H inflation tooltip and note, E WARN_TEXT.inflationLow
//   MSCI World return in USD, ~7.5%/yr Dec 2000 to Aug 2026 (7.53%), MSCI,
//     H Global return tooltip and note, E WARN_TEXT.globalUSD / globalSGD
//   MSCI World return in SGD, ~6.2%/yr since 2001, derived from the USD return
//     and USD/SGD moving from ~1.73 to ~1.28 (check gives ~6.3%), same places,
//     E DEFAULTS.globalRetSGD
//   MSCI World 10-year return in USD, ~13%/yr (13.37% to Sep 2026), MSCI, E WARN_TEXT
//   MSCI World volatility, ~14.9% over 10 yrs, MSCI, H volGlobal, E DEFAULTS.volGlobal
//   SPDR STI ETF return, ~8.6%/yr Apr 2002 to Jul 2026, SSGA factsheet; ~7%/yr over
//     10 yrs to Sep 2026, fund data, H Singapore return tooltip and note, E WARN_TEXT.sg
//   STI volatility, 17%, ESTIMATE (not yet verified), H volSg, E DEFAULTS.volSg
//   Inflation volatility, 1.8 pts, std dev of annual CPI 1986-2025 (IMF / World Bank),
//     H volInfl, E DEFAULTS.volInfl
//   USD/SGD spot, 1.28 on 2 Oct 2026, H fxRate tooltip and note, E DEFAULTS.fxRate
//   USD/SGD volatility, 5%, ESTIMATE (not yet verified), H volFx, E DEFAULTS.volFx
//   3-month SORA averages, 3.2% / 2.5% / 2.0% / 2.0% (5/10/15/20 yrs to Q2 2026),
//     range 1.0%-4.7%, MAS via Global Property Guide, H both mortgage tooltips
//     and notes, E WARN_TEXT.mortHigh / mortLow / longLow, E DEFAULTS.mortgageRateLong
//   Bank spread over SORA, ~0.2-0.3 pts (Sep 2026 packages), PropertyNet.SG, H mortgage tooltips
//   Mortgage rate volatility, 1.0 pt, ESTIMATE from the SORA history, H volMort, E DEFAULTS.volMort
//   HDB concessionary rate, 2.6%, HDB, E DEFAULTS.mortgageRate, H mortgage tooltips
//   CPF Full Retirement Sum, S$220,400 (2026) and S$228,200 (2027), CPF Board,
//     E DEFAULTS.frs2026 / frsGrowth, H CPF tooltips
//   CPF LIFE Standard Plan payouts, ~S$1,780/mo from 65 and ~S$2,380 from 70 for the
//     2026 FRS, CPF Board, E CPF_LIFE_RATE_65 / CPF_LIFE_DEFER_PER_YR, H CPF tooltips
//   CPF contribution and allocation rates (2026) and S$8,000 Ordinary Wage ceiling,
//     CPF Board, E CPF_RATE_BANDS / CPF_OW_CEILING, H CPF tooltip
//   CPF floor interest rates, OA 2.5% and SA/RA 4%, CPF Board, E DEFAULTS.oaRate / saRate
//   US stocks ~10%/yr since 1928 (Damodaran, NYU Stern) and developed markets ~8.5%/yr
//     since 1900 (UBS Global Investment Returns Yearbook, not re-checked), E WARN_TEXT
// -----------------------------------------------------------------------------

// Field ID -> starting value. '' = blank (personal input, shows a placeholder example).
const FIELD_DEFAULTS = {
    'inp-currentAge': '',
    'inp-retireAge': '',
    'inp-expenses': '',
    'inp-expenseShare': DEFAULTS.expenseShare,
    'inp-inflation': DEFAULTS.inflation,
    'inp-realContribGrowth': DEFAULTS.realContribGrowth,
    'inp-invStart': '',
    'inp-invContrib': '',
    'inp-invRet': DEFAULTS.invRet,
    'inp-globalStart': '',
    'inp-globalContrib': '',
    'inp-globalRet': DEFAULTS.globalRetSGD,
    'inp-fxRate': DEFAULTS.fxRate,
    'inp-fxDrift': DEFAULTS.fxDrift,
    'inp-sgStart': '',
    'inp-sgContrib': '',
    'inp-sgRet': DEFAULTS.sgRet,
    'inp-cashStart': '',
    'inp-cashContrib': '',
    'inp-cashYield': DEFAULTS.cashYield,
    'inp-currentExpenses': '',
    'inp-oaStart': '',
    'inp-oaContrib': '',
    'inp-saStart': '',
    'inp-saContrib': '',
    'inp-mortgagePrincipal': '',
    'inp-loanYrs': '',
    'inp-mortgageRate': DEFAULTS.mortgageRate,
    'inp-mortgageRateLong': DEFAULTS.mortgageRateLong,
    'inp-lockYrs': DEFAULTS.lockYrs,
    'inp-mortgageShare': DEFAULTS.mortgageShare,
    'inp-frsGrowth': DEFAULTS.frsGrowth,
    'inp-lifeAge': DEFAULTS.lifeAge,
    'inp-lifePlan': DEFAULTS.lifePlan,
    'inp-swrRate': DEFAULTS.swrRate,
    'inp-mcRuns': DEFAULTS.mcRuns,
    'inp-volGlobal': DEFAULTS.volGlobal,
    'inp-volSg': DEFAULTS.volSg,
    'inp-volInfl': DEFAULTS.volInfl,
    'inp-volFx': DEFAULTS.volFx,
    'inp-volMort': DEFAULTS.volMort
};

// Fields reset to their default by "Clear" (assumptions). All other fields are blanked.
const ASSUMPTION_FIELDS = ['inp-expenseShare', 'inp-inflation', 'inp-realContribGrowth',
    'inp-invRet', 'inp-globalRet', 'inp-fxRate', 'inp-fxDrift', 'inp-sgRet', 'inp-cashYield', 'inp-mortgageRate', 'inp-mortgageShare',
    'inp-mortgageRateLong', 'inp-lockYrs', 'inp-frsGrowth', 'inp-lifeAge', 'inp-lifePlan', 'inp-swrRate',
    'inp-mcRuns', 'inp-volGlobal', 'inp-volSg', 'inp-volInfl', 'inp-volFx', 'inp-volMort'];

const PERSISTED_TOGGLES = ['toggle-expense-partner', 'toggle-mortgage', 'toggle-mortgage-partner', 'inp-maxOA', 'inp-showFireCurve',
    'toggle-ownhome', 'inp-pledge', 'inp-swrOverride', 'inp-blackSwan'];

// Yes/No and HDB/Bank choices (radio groups) and their defaults
const CHOICE_DEFAULTS = { cpfHas: 'yes', cpfContrib: 'yes', loanType: 'hdb' };

// Mode-switch memory (enables reversible Simple <-> Advanced)
let modeState = {
    advInitialized: false,   // has the Advanced split ever been created?
    simpleAtSwitch: null     // Simple values written when last leaving Advanced: {start, contrib, ret}
};
let globalCcyState = DEFAULTS.globalCcy;
let touchedAssumptions = new Set();   // R25: assumption fields the user has edited
let exampleState = null;      // persona key while an example plan is loaded, else null
let showMissing = false;      // set after the user first clicks Calculate: outline missing essentials

// -----------------------------------------------------------------------------
// Formatting & input utilities
// -----------------------------------------------------------------------------
const fmt = (n, maxDp = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: maxDp });
const money = n => '$' + fmt(Math.round(n));
const moneyM = n => '$' + (n / 1000000).toFixed(2) + 'M';
const round2 = n => Math.round(n * 100) / 100;

function escapeHtml(s) {
    const map = { '\u0026': '&' + 'amp;', '\u003c': '&' + 'lt;', '\u003e': '&' + 'gt;', '\u0022': '&' + 'quot;', '\u0027': '&' + '#39;' };
    return String(s).replace(/[\u0026\u003c\u003e\u0022\u0027]/g, ch => map[ch]);
} 

// Returns null for blank / invalid; otherwise the number (0 is a valid input).
function readNum(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const s = String(el.value).replace(/,/g, '').trim();
    if (s === '') return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}
// Money amounts: blank = 0
function amt(id) { const n = readNum(id); return n === null ? 0 : n; }
// Rates / assumptions: blank = default, 0 stays 0
function rateOr(id, def) { const n = readNum(id); return n === null ? def : n; }
// Legacy alias (used by estimators)
function getVal(id) { return amt(id); }

function isChecked(id, fallback = false) {
    const el = document.getElementById(id);
    return el ? el.checked : fallback;
}
function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

function setVal(id, val, flash = true) {
    const el = document.getElementById(id);
    if (!el) return;
    if (val === '' || val === null || val === undefined) { el.value = ''; return; }
    if (el.classList.contains('num-format')) el.value = fmt(Math.round(val));
    else el.value = val;
    if (flash) {
        el.classList.remove('highlight-pulse');
        void el.offsetWidth; // restart animation
        el.classList.add('highlight-pulse');
    }
}

function updateDOM(id, val, isHTML = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isHTML) el.innerHTML = val; else el.innerText = val;
}

let noticeTimer = null;
function showNotice(msg) {
    const el = document.getElementById('mode-notice');
    if (!el) return;
    el.innerHTML = msg;
    el.style.display = 'block';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { el.style.display = 'none'; }, 9000);
}

// -----------------------------------------------------------------------------
// Panel visibility
// -----------------------------------------------------------------------------
function getRadio(name, fallback) {
    const r = document.querySelector(`input[name="${name}"]:checked`);
    return r ? r.value : fallback;
}
function setRadio(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = (r.value === value); });
}
function getChoices() {
    return {
        cpfHas: getRadio('cpfHas', CHOICE_DEFAULTS.cpfHas),
        cpfContrib: getRadio('cpfContrib', CHOICE_DEFAULTS.cpfContrib),
        loanType: getRadio('loanType', CHOICE_DEFAULTS.loanType)
    };
}
function setChoices(c) {
    const v = Object.assign({}, CHOICE_DEFAULTS, c || {});
    setRadio('cpfHas', v.cpfHas);
    setRadio('cpfContrib', v.cpfContrib);
    setRadio('loanType', v.loanType);
}

function syncPanels() {
    const show = (panelId, on) => { const p = document.getElementById(panelId); if (p) p.style.display = on ? 'block' : 'none'; };
    show('expense-partner-panel', isChecked('toggle-expense-partner'));
    show('mortgage-panel', isChecked('toggle-mortgage'));
    show('mortgage-partner-panel', isChecked('toggle-mortgage-partner'));
    show('ownhome-row', !isChecked('toggle-mortgage'));

    // R10: CPF questions drive what is shown
    const ch = getChoices();
    const hasCpf = ch.cpfHas === 'yes';
    document.body.classList.toggle('no-cpf', !hasCpf);
    document.body.classList.toggle('no-cpf-contrib', hasCpf && ch.cpfContrib === 'no');

    // R9: HDB loans need CPF (citizens only); without CPF the loan is a bank loan
    const hdbLabel = document.getElementById('lbl-loan-hdb');
    const hdbRadio = document.querySelector('input[name="loanType"][value="hdb"]');
    if (hdbRadio) hdbRadio.disabled = !hasCpf;
    if (hdbLabel) hdbLabel.classList.toggle('disabled', !hasCpf);
    if (!hasCpf && ch.loanType === 'hdb') { setRadio('loanType', 'bank'); swapLoanRateDefault('bank'); }
    document.body.classList.toggle('bank-loan-active', getMode() !== 'simple' && getRadio('loanType', 'hdb') === 'bank');
    // R14: property pledge option only for home owners
    document.body.classList.toggle('owns-home', isChecked('toggle-mortgage') || isChecked('toggle-ownhome'));
}

function toggleMortgagePartner() { syncPanels(); }
function toggleExpensePartner() { syncPanels(); }

function onCpfChoice() {
    syncPanels();
    runSim();
}

// If the rate is still at the other loan type's starting value, move it to this type's starting value
function swapLoanRateDefault(type) {
    const r = readNum('inp-mortgageRate');
    if (type === 'bank' && (r === null || r === DEFAULTS.mortgageRate)) setVal('inp-mortgageRate', DEFAULTS.mortgageRateBank.toFixed(1), false);
    if (type === 'hdb' && (r === null || r === DEFAULTS.mortgageRateBank)) setVal('inp-mortgageRate', DEFAULTS.mortgageRate.toFixed(1), false);
}

function onLoanTypeChange(type) {
    swapLoanRateDefault(type);
    syncPanels();
    runSim();
}

// -----------------------------------------------------------------------------
// Mode handling (Simple / Advanced) — reversible
// -----------------------------------------------------------------------------
function getMode() {
    if (document.body.classList.contains('expert-mode')) return 'expert';
    if (document.body.classList.contains('advanced-mode')) return 'advanced';
    return 'simple';
}

function applyModeClass(mode) {
    document.body.classList.remove('simple-mode', 'advanced-mode', 'expert-mode');
    document.body.classList.add(mode + '-mode');
    // R15: Expert shows everything in Advanced as well
    if (mode === 'expert') document.body.classList.add('advanced-mode');
    const r = document.getElementById('mode-' + mode);
    if (r) r.checked = true;
    document.body.classList.toggle('bank-loan-active', mode !== 'simple' && getRadio('loanType', 'hdb') === 'bank');
}

// R23: has the user changed anything that only exists in Advanced mode?
function advancedInUse() {
    const differs = (id, def) => { const v = readNum(id); return v !== null && Math.abs(v - def) > 1e-9; };
    if (differs('inp-inflation', DEFAULTS.inflation)) return true;
    if (differs('inp-realContribGrowth', DEFAULTS.realContribGrowth)) return true;
    if (differs('inp-cashYield', DEFAULTS.cashYield)) return true;
    if (globalCcyState === 'USD') return true;
    const gR = rateOr('inp-globalRet', DEFAULTS.globalRetSGD), sR = rateOr('inp-sgRet', DEFAULTS.sgRet);
    if (Math.abs(gR - sR) > 0.005) return true;
    if (readNum('inp-currentExpenses') !== null) return true;
    if (isChecked('toggle-mortgage') && getRadio('loanType', 'hdb') === 'bank') return true;
    if (isChecked('inp-showFireCurve')) return true;
    if (readIncomeStreams().length || readMilestones().length) return true;
    if (differs('inp-frsGrowth', DEFAULTS.frsGrowth) || differs('inp-lifeAge', DEFAULTS.lifeAge)) return true;
    const plan = document.getElementById('inp-lifePlan');
    if (plan && plan.value !== DEFAULTS.lifePlan) return true;
    if (isChecked('inp-pledge') || isChecked('inp-swrOverride') || isChecked('toggle-ownhome')) return true;
    return false;
}


function setMode(mode) {
    const prev = getMode();
    if (prev === mode) return;
    if (prev === 'simple') onEnterAdvanced();     // into Advanced or Expert
    if (mode === 'simple') onEnterSimple();       // out of Advanced or Expert
    scenarios = [];
    applyModeClass(mode);
    syncPanels();
    if (mode === 'expert') showNotice('Expert mode runs your plan many times with random market returns and shows how often it lasts to 100. Adjust the volatility settings in <strong>Step 6</strong>.');
    if (!isLoading) runSim();
}

function readSimplePortfolio() {
    return { start: amt('inp-invStart'), contrib: amt('inp-invContrib'), ret: rateOr('inp-invRet', DEFAULTS.invRet) };
}

function globalDefaultRet(ccy) { return ccy === 'USD' ? DEFAULTS.globalRetUSD : DEFAULTS.globalRetSGD; }

// Advanced portfolio expressed in SGD (returns as decimals)
function advancedPortfolioInSGD() {
    const isUSD = globalCcyState === 'USD';
    const fx = isUSD ? rateOr('inp-fxRate', DEFAULTS.fxRate) : 1;
    const drift = isUSD ? rateOr('inp-fxDrift', DEFAULTS.fxDrift) / 100 : 0;
    const gR = rateOr('inp-globalRet', globalDefaultRet(globalCcyState)) / 100;
    return {
        gStart: amt('inp-globalStart') * fx,
        gContrib: amt('inp-globalContrib') * fx,
        gRet: isUSD ? (1 + gR) * (1 + drift) - 1 : gR,
        sStart: amt('inp-sgStart'),
        sContrib: amt('inp-sgContrib'),
        sRet: rateOr('inp-sgRet', DEFAULTS.sgRet) / 100,
        fx
    };
}

// Simple -> Advanced
function onEnterAdvanced() {
    const cur = readSimplePortfolio();

    // First time (or after persona / clear): split 50/50, same return in both, Global in SGD
    if (!modeState.advInitialized) {
        setGlobalCcyState('SGD');
        const startBlank = readNum('inp-invStart') === null;
        const contribBlank = readNum('inp-invContrib') === null;
        setVal('inp-globalStart', startBlank ? '' : cur.start / 2, false);
        setVal('inp-sgStart', startBlank ? '' : cur.start / 2, false);
        setVal('inp-globalContrib', contribBlank ? '' : cur.contrib / 2, false);
        setVal('inp-sgContrib', contribBlank ? '' : cur.contrib / 2, false);
        setVal('inp-globalRet', cur.ret, false);
        setVal('inp-sgRet', cur.ret, false);
        modeState.advInitialized = true;
        modeState.simpleAtSwitch = null;
        showNotice('Your portfolio has been split evenly between <strong>Global</strong> and <strong>Singapore Investments</strong>, using the same return for both. Adjust each one to match your actual holdings.');
        return;
    }

    // Returning: restore saved Advanced inputs; scale only if Simple values were edited
    const old = modeState.simpleAtSwitch;
    if (!old) return;
    const changedStart = Math.abs(cur.start - old.start) > 0.5;
    const changedContrib = Math.abs(cur.contrib - old.contrib) > 0.5;
    const deltaRet = cur.ret - old.ret;
    const changedRet = Math.abs(deltaRet) > 0.005;
    if (!changedStart && !changedContrib && !changedRet) {
        showNotice('Your separate Global and Singapore inputs have been restored.');
        return;
    }

    const a = advancedPortfolioInSGD();
    const scalePair = (gId, sId, gSGD, sSGD, newTotal) => {
        const total = gSGD + sSGD;
        if (total > 0) {
            const f = newTotal / total;
            setVal(gId, amt(gId) * f, false);
            setVal(sId, amt(sId) * f, false);
        } else {
            setVal(gId, (newTotal / 2) / a.fx, false);
            setVal(sId, newTotal / 2, false);
        }
    };
    if (changedStart) scalePair('inp-globalStart', 'inp-sgStart', a.gStart, a.sStart, cur.start);
    if (changedContrib) scalePair('inp-globalContrib', 'inp-sgContrib', a.gContrib, a.sContrib, cur.contrib);
    if (changedRet) {
        setVal('inp-globalRet', round2(rateOr('inp-globalRet', globalDefaultRet(globalCcyState)) + deltaRet), false);
        setVal('inp-sgRet', round2(rateOr('inp-sgRet', DEFAULTS.sgRet) + deltaRet), false);
    }
    showNotice('Your Advanced split was kept and scaled to your new totals' + (changedRet ? `; both returns were shifted by ${deltaRet > 0 ? '+' : ''}${round2(deltaRet)} percentage points` : '') + '.');
}

// Advanced -> Simple
function onEnterSimple(quiet) {
    const a = advancedPortfolioInSGD();
    const start = a.gStart + a.sStart;
    const contrib = a.gContrib + a.sContrib;
    let ret;
    if (start > 0) ret = (a.gStart * a.gRet + a.sStart * a.sRet) / start;
    else if (contrib > 0) ret = (a.gContrib * a.gRet + a.sContrib * a.sRet) / contrib;
    else ret = (a.gRet + a.sRet) / 2;

    const startsBlank = readNum('inp-globalStart') === null && readNum('inp-sgStart') === null;
    const contribsBlank = readNum('inp-globalContrib') === null && readNum('inp-sgContrib') === null;
    setVal('inp-invStart', startsBlank ? '' : start, false);
    setVal('inp-invContrib', contribsBlank ? '' : contrib, false);
    setVal('inp-invRet', round2(ret * 100), false);

    // Store exactly what Simple now displays, so edits can be detected on return
    modeState.simpleAtSwitch = readSimplePortfolio();
    if (!quiet) showNotice(`Combined into a single portfolio at a <strong>${round2(ret * 100)}%</strong> blended return${globalCcyState === 'USD' ? ' (USD holdings converted to SGD)' : ''}. Your separate Advanced inputs are saved and will return when you switch back.`);
}

// -----------------------------------------------------------------------------
// Global Investments currency toggle (SGD / USD) — whole section
// -----------------------------------------------------------------------------
function setGlobalCcyState(ccy) {
    globalCcyState = ccy;
    document.querySelectorAll('input[name="globalCcy"]').forEach(r => { r.checked = (r.value === ccy); });
    document.querySelectorAll('.ccy-label').forEach(el => { el.innerText = ccy; });
    document.body.classList.toggle('global-usd', ccy === 'USD');
}

function switchGlobalCcy(next) {
    const prev = globalCcyState;
    if (prev === next) return;
    const fx = rateOr('inp-fxRate', DEFAULTS.fxRate);
    const drift = rateOr('inp-fxDrift', DEFAULTS.fxDrift) / 100;
    const s = readNum('inp-globalStart');
    const c = readNum('inp-globalContrib');
    const r = rateOr('inp-globalRet', globalDefaultRet(prev)) / 100;
    let newR;
    if (next === 'USD') {
        if (s !== null) setVal('inp-globalStart', s / fx);
        if (c !== null) setVal('inp-globalContrib', c / fx);
        newR = (1 + r) / (1 + drift) - 1;
    } else {
        if (s !== null) setVal('inp-globalStart', s * fx);
        if (c !== null) setVal('inp-globalContrib', c * fx);
        newR = (1 + r) * (1 + drift) - 1;
    }
    setVal('inp-globalRet', round2(newR * 100));
    setGlobalCcyState(next);
    showNotice(`Converted to <strong>${next}</strong> at ${fx} SGD per USD. Return adjusted for ${drift * 100}%/yr expected currency drift: ${round2(r * 100)}% (${prev}) → ${round2(newR * 100)}% (${next}).`);
    if (!isLoading) runSim();
}

// -----------------------------------------------------------------------------
// State management (save / load / export / import)
// -----------------------------------------------------------------------------
function getState() {
    const fields = {};
    Object.keys(FIELD_DEFAULTS).forEach(id => {
        const el = document.getElementById(id);
        if (el) fields[id] = el.value;
    });
    const toggles = {};
    PERSISTED_TOGGLES.forEach(id => {
        const el = document.getElementById(id);
        if (el) toggles[id] = el.checked;
    });
    const incomeStreams = [];
    document.querySelectorAll('.income-stream').forEach(row => {
        incomeStreams.push({
            name: row.querySelector('.is-name').value,
            amt: row.querySelector('.is-amt').value,
            start: row.querySelector('.is-start').value,
            end: row.querySelector('.is-end').value,
            fixed: row.querySelector('.is-fixed') ? row.querySelector('.is-fixed').checked : false
        });
    });
    const milestones = [];
    document.querySelectorAll('.milestone-stream').forEach(row => {
        milestones.push({
            name: row.querySelector('.ms-name').value,
            type: row.querySelector('.ms-type') ? row.querySelector('.ms-type').value : 'windfall',
            amt: row.querySelector('.ms-amt').value,
            age: row.querySelector('.ms-age').value,
            sale: row.querySelector('.ms-sale') ? row.querySelector('.ms-sale').value : '',
            newHome: row.querySelector('.ms-newhome') ? row.querySelector('.ms-newhome').value : '',
            cpfUsed: row.querySelector('.ms-cpfused') ? row.querySelector('.ms-cpfused').value : ''
        });
    });
    return {
        format: SAVE_FORMAT,
        version: APP_VERSION,
        last_saved: new Date().toISOString(),
        touched: chosenAssumptions(),
        mode: getMode(),
        globalCcy: globalCcyState,
        chartView: getChartView(),
        exampleState: exampleState,
        modeState: modeState,
        choices: getChoices(),
        fields, toggles, incomeStreams, milestones
    };
}

function loadState(state) {
    if (!state) return;
    try {
        if (state.fields) {
            // --- V6 format (format 1 = Batches 1-6, format 2 = Batch 7 onwards) ---
            migrateState(state);
            const chosen = new Set(state.touched || []);
            // Start from defaults, so settings missing from older saves get today's defaults
            applyFieldDefaults();
            ['toggle-expense-partner', 'toggle-mortgage', 'toggle-mortgage-partner', 'inp-showFireCurve', 'toggle-ownhome', 'inp-pledge', 'inp-swrOverride', 'inp-blackSwan'].forEach(id => setChecked(id, false));
            setChecked('inp-maxOA', true);
            Object.entries(state.fields).forEach(([id, v]) => {
                const el = document.getElementById(id);
                if (!el) return;
                // R25: assumptions the user never changed follow the current defaults
                if (ASSUMPTION_FIELDS.includes(id) && !chosen.has(id)) return;
                el.value = v;
            });
            touchedAssumptions = new Set(ASSUMPTION_FIELDS.filter(id => chosen.has(id)));
            Object.entries(state.toggles || {}).forEach(([id, v]) => setChecked(id, v));
            // Batch 1–3 saves: SA was only counted when its checkbox was ticked
            if (state.toggles && state.toggles['toggle-sa'] === false) {
                setVal('inp-saStart', '', false);
                setVal('inp-saContrib', '', false);
            }
            setChoices(state.choices);
            setGlobalCcyState(state.globalCcy === 'USD' ? 'USD' : 'SGD');
            modeState = Object.assign({ advInitialized: false, simpleAtSwitch: null }, state.modeState || {});
            setChartView(state.chartView === 'future' ? 'future' : 'today');
            setExampleState(state.exampleState && PERSONAS[state.exampleState] ? state.exampleState : null);
            applyModeClass((state.mode === 'advanced' || state.mode === 'expert') ? state.mode : 'simple');
            const sc = document.getElementById('income-streams-container');
            if (sc) { sc.innerHTML = ''; (state.incomeStreams || []).forEach(st => addIncomeStream(st.name, st.amt, st.start, st.end, st.fixed)); }
            const mc = document.getElementById('milestones-container');
            if (mc) { mc.innerHTML = ''; (state.milestones || []).forEach(m => addMilestone(m.name, m.amt, m.age, m.type, m)); }
        } else if (state.inputs) {
            // --- Legacy V5 format: migrate user-editable fields only ---
            const p = state.inputs;
            const map = {
                currentAge: 'inp-currentAge', retireAge: 'inp-retireAge', expenses: 'inp-expenses', expenseShare: 'inp-expenseShare',
                cashStart: 'inp-cashStart', mortgagePrincipal: 'inp-mortgagePrincipal', loanYrs: 'inp-loanYrs',
                mortgageRate: 'inp-mortgageRate', mortgageShare: 'inp-mortgageShare', oaStart: 'inp-oaStart', oaContrib: 'inp-oaContrib'
            };
            Object.entries(map).forEach(([k, id]) => { if (p[k] !== undefined && p[k] !== null) setVal(id, p[k], false); });
            const tmap = { hasMortgage: 'toggle-mortgage', hasMortgagePartner: 'toggle-mortgage-partner', hasExpensePartner: 'toggle-expense-partner', isMaxOA: 'inp-maxOA', showFireCurve: 'inp-showFireCurve' };
            Object.entries(tmap).forEach(([k, id]) => { if (p[k] !== undefined) setChecked(id, p[k]); });
            setChoices(null);
            applyModeClass('simple');
        }
        syncPanels();
    } catch (e) { console.warn('loadState failed', e); }
}

function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getState())); } catch (e) {}
}

// R25: is this assumption different from its default value?
function differsFromDefault(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    const d = FIELD_DEFAULTS[id];
    if (typeof d === 'number') { const v = readNum(id); return v !== null && Math.abs(v - d) > 1e-9; }
    return String(el.value) !== String(d);
}

// R25: assumptions the user chose (edited, or different from the default). Saved with the plan.
function chosenAssumptions() {
    return ASSUMPTION_FIELDS.filter(id => touchedAssumptions.has(id) || differsFromDefault(id));
}

// R25: bring an older save up to the current format, one step at a time.
// To change the save layout in future: raise SAVE_FORMAT and add a step here.
function migrateState(state) {
    let f = state.format || (state.fields ? 1 : 0);
    if (f === 1) {
        // Saved before Batch 7: there's no record of which assumptions were changed, so keep them all
        state.touched = ASSUMPTION_FIELDS.slice();
        f = 2;
    }
    state.format = Math.max(f, state.format || 0);
    return state;
}

// R25: read a saved plan (from a file or a link). Returns null if it isn't one.
function readPlanFile(text) {
    let state;
    try { state = JSON.parse(text); } catch (e) { return null; }
    if (!state || typeof state !== 'object' || !(state.fields || state.inputs)) return null;
    return state;
}

let planNoticeTimer = null;
function showPlanNotice(msg, isError) {
    const el = document.getElementById('plan-notice');
    if (!el) { if (isError) window.alert(msg); return; }
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.style.display = 'block';
    clearTimeout(planNoticeTimer);
    planNoticeTimer = setTimeout(() => { el.style.display = 'none'; }, 20000);
}

// R25: load a saved plan and say what happened
function applyLoadedPlan(state, label, fromLink) {
    const fileFormat = state.format || (state.fields ? 1 : 0);
    const missing = (state.fields && !fromLink) ? Object.keys(FIELD_DEFAULTS).filter(id => !(id in state.fields)).length : 0;
    scenarios = [];
    isLoading = true;
    loadState(state);
    isLoading = false;
    unlockSection('inputs-section');
    unlockSection('chart-section');
    const parts = [label + ' loaded' + (state.version ? ' (saved with version ' + state.version + ').' : '.')];
    if (fileFormat > SAVE_FORMAT) {
        parts.push('It was saved by a newer version of this tool, so some settings may not load. Refresh the page to get the latest version.');
    } else if (fileFormat === 0) {
        parts.push('It came from the original version of this tool, so only your main inputs were carried over. Please check the rest.');
    } else {
        if (fileFormat < SAVE_FORMAT) parts.push('Your assumptions were kept exactly as saved.');
        if (missing > 0) parts.push(missing + (missing === 1 ? ' setting added since then starts' : ' settings added since then start') + ' at the default value.');
    }
    runSimNow();
    showPlanNotice(parts.join(' '), false);
    scrollToEl(document.getElementById('inputs-section'));
}

// R25: export file named with today's date
function exportPlan() {
    const state = getState();
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const name = 'sg-fire-inputs-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
    const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const anchor = document.createElement('a');
    anchor.setAttribute("href", dataStr);
    anchor.setAttribute("download", name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    showPlanNotice('Exported to ' + name + '. Keep it somewhere safe; use Upload inputs to load it again on any device.', false);
}

function importPlan(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const state = readPlanFile(e.target.result);
        if (!state) window.alert("That file couldn't be read. Choose a .json file you exported from this tool.");
        else applyLoadedPlan(state, 'Your inputs were', false);
    };
    reader.readAsText(file);
    event.target.value = '';
}

// R29: pack a plan into a link (no server involved; the part after # never leaves the browser)
function encodePlan(state) {
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
}

// Returns a plan, null (no plan in the link) or 'bad' (a plan link that couldn't be read)
function readPlanFromLink() {
    const h = (typeof location !== 'undefined' && location.hash) || '';
    if (h.indexOf('#plan=') !== 0) return null;
    try {
        let s = h.slice(6).split('-').join('+').split('_').join('/');
        while (s.length % 4) s += '=';
        const bin = atob(s);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return readPlanFile(new TextDecoder().decode(bytes)) || 'bad';
    } catch (e) { return 'bad'; }
}

window.copyShareLink = function () {
    if (exampleState) { showPlanNotice('This is an example plan. Start your own plan before sharing.', true); return; }
    const st = getState();
    delete st.last_saved;
    Object.keys(st.fields).forEach(id => { if (st.fields[id] === '') delete st.fields[id]; });
    const url = location.href.split('#')[0] + '#plan=' + encodePlan(st);
    const done = () => showPlanNotice('Link copied. Anyone you send it to can open your plan and see your numbers.', false);
    const manual = () => window.prompt('Copy this link:', url);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, manual);
    else manual();
};

// R26: Start Over asks first (example plans clear without asking)
window.confirmStartOver = function () {
    if (!exampleState && !window.confirm("Start over? This clears all your inputs in this browser and can't be undone. Use Export inputs first if you want to keep them.")) return;
    clearAllInputs();
    showPlanNotice('All inputs cleared.', false);
};

function setFieldDefault(id) {
    const v = FIELD_DEFAULTS[id];
    const el = document.getElementById(id);
    // Show decimal assumptions as "5.0", not "5"
    if (el && typeof v === 'number' && Number.isInteger(v) && el.step && el.step.indexOf('.') !== -1 && v !== 0) {
        setVal(id, v.toFixed(1), false);
    } else setVal(id, v, false);
}
function applyFieldDefaults() {
    Object.keys(FIELD_DEFAULTS).forEach(setFieldDefault);
}

function clearAllInputs() {
    try {
        Object.keys(FIELD_DEFAULTS).forEach(id => {
            if (ASSUMPTION_FIELDS.includes(id)) setFieldDefault(id);
            else setVal(id, '', false);
        });
        ['toggle-expense-partner', 'toggle-mortgage', 'toggle-mortgage-partner', 'inp-showFireCurve', 'toggle-ownhome', 'inp-pledge', 'inp-swrOverride', 'inp-blackSwan'].forEach(id => setChecked(id, false));
        scenarios = [];
        const rows = document.getElementById('scen-custom-rows'); if (rows) rows.innerHTML = '';
        setChecked('inp-maxOA', true);
        setChoices(null);
        setGlobalCcyState('SGD');
        modeState = { advInitialized: false, simpleAtSwitch: null };
        touchedAssumptions = new Set();
        if (getMode() !== 'simple') onEnterAdvanced();

        setExampleState(null);
        showMissing = false;
        document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
        const sc = document.getElementById('income-streams-container'); if (sc) sc.innerHTML = '';
        const mc = document.getElementById('milestones-container'); if (mc) mc.innerHTML = '';
        syncPanels();
        localStorage.removeItem(STORAGE_KEY);
        LEGACY_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    runSim();
}

// -----------------------------------------------------------------------------
// Mortgage maths
// -----------------------------------------------------------------------------
function calcPmt(principal, ratePerYear, yearsRemaining) {
    if (yearsRemaining <= 0 || principal <= 0) return 0;
    const r = ratePerYear / 12;
    const n = yearsRemaining * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Display only: today's installment and how it's paid
function updateMortgageReadout(inp) {
    const m = inp.mortgage;
    const pmt = m.has ? calcPmt(m.principal, m.rate, m.years) : 0;
    const personal = pmt * m.share;
    updateDOM('disp-monthlyMortgage', money(pmt));
    updateDOM('disp-personalMortgage', money(personal));

    const splitDisp = document.getElementById('disp-mortgage-split');
    if (!splitDisp) return;
    if (!(m.has && personal > 0)) { splitDisp.style.display = 'none'; return; }
    const excl = '(make sure this is excluded from your monthly investments and cash savings)';
    let html;
    if (!inp.cpf.has) {
        html = `You pay your <strong>${money(personal)}</strong> monthly installment in cash ${excl}.`;
    } else if (!m.payWithOA) {
        html = `You've chosen to pay your <strong>${money(personal)}</strong> monthly installment in cash ${excl}.`;
    } else if (!inp.cpf.contributing) {
        const months = Math.floor(inp.cpf.oaStart / personal);
        html = months >= 1
            ? `Your OA balance covers about <strong>${months} month${months === 1 ? '' : 's'}</strong> of your ${money(personal)} installment. After that you pay it in cash ${excl}.`
            : `Your OA balance won't cover your ${money(personal)} installment, so you pay it in cash ${excl}.`;
    } else {
        const oaCovers = Math.min(inp.cpf.oaContrib, personal);
        const cashTopup = Math.max(0, personal - oaCovers);
        html = `Your CPF OA covers <strong>${money(oaCovers)}</strong> of your monthly installment. You are topping up <strong>${money(cashTopup)}</strong> in cash each month (make sure this ${money(cashTopup)} is excluded from your monthly investments and cash savings).`;
    }
    if (m.twoStage) html += ` From year ${Math.round(m.lockYrs) + 1}, the engine reprices your loan at your long-run rate.`;
    splitDisp.style.display = 'block';
    splitDisp.innerHTML = html;
}

// -----------------------------------------------------------------------------
// Custom cash flows (R7, Advanced mode)
// -----------------------------------------------------------------------------
function removeCfRow(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    runSim();
}

function addIncomeStream(name = '', amount = '', start = '', end = '', fixed = false) {
    const c = document.getElementById('income-streams-container');
    if (!c) return;
    const id = incomeStreamCount++;
    const n = parseFloat(String(amount).replace(/,/g, ''));
    const shown = Number.isFinite(n) ? fmt(n) : '';
    c.insertAdjacentHTML('beforeend', `
        <div class="cf-row cf-row-income income-stream" id="stream-${id}">
            <input type="text" class="is-name" placeholder="e.g. Rental income" value="${escapeHtml(name)}" onchange="runSim()" aria-label="Name">
            <input type="text" class="num-format is-amt" placeholder="e.g. 1,500" value="${escapeHtml(shown)}" aria-label="Monthly amount (Today's SGD)">
            <input type="number" class="is-start" placeholder="Now" value="${escapeHtml(start)}" oninput="runSim()" aria-label="From age">
            <input type="number" class="is-end" placeholder="100" value="${escapeHtml(end)}" oninput="runSim()" aria-label="To age">
            <label class="cf-fixed" title="Tick if the amount won't rise with inflation"><input type="checkbox" class="is-fixed" ${fixed ? 'checked' : ''} onchange="runSim()"> Fixed</label>
            <button type="button" class="btn-remove" onclick="removeCfRow('stream-${id}')" aria-label="Remove">✕</button>
        </div>`);
}

// type: 'windfall', 'expense' or 'downgrade' (R22). Older saves stored expenses as negative amounts.
function addMilestone(name = '', amount = '', age = '', type = '', extra = {}) {
    const c = document.getElementById('milestones-container');
    if (!c) return;
    const id = milestoneCount++;
    const n = parseFloat(String(amount).replace(/,/g, ''));
    if (!type) type = (Number.isFinite(n) && n < 0) ? 'expense' : 'windfall';
    const shown = Number.isFinite(n) ? fmt(Math.abs(n)) : '';
    const ex = k => { const v = parseFloat(String((extra && extra[k]) || '').replace(/,/g, '')); return Number.isFinite(v) ? fmt(v) : ''; };
    c.insertAdjacentHTML('beforeend', `
        <div class="cf-row cf-row-milestone milestone-stream ${type === 'downgrade' ? 'is-dg' : ''}" id="milestone-${id}">
            <input type="text" class="ms-name" placeholder="e.g. Inheritance" value="${escapeHtml(name)}" onchange="runSim()" aria-label="Description">
            <select class="ms-type" onchange="onMsTypeChange(this)" aria-label="Type">
                <option value="windfall" ${type === 'windfall' ? 'selected' : ''}>Windfall</option>
                <option value="expense" ${type === 'expense' ? 'selected' : ''}>Expense</option>
                <option value="downgrade" ${type === 'downgrade' ? 'selected' : ''}>Downgrade</option>
            </select>
            <input type="text" class="num-format ms-amt" placeholder="e.g. 50,000" value="${escapeHtml(shown)}" aria-label="Amount (Today's SGD)">
            <input type="number" class="ms-age" placeholder="Age" value="${escapeHtml(age)}" oninput="runSim()" aria-label="Age">
            <button type="button" class="btn-remove" onclick="removeCfRow('milestone-${id}')" aria-label="Remove">✕</button>
            <div class="ms-dg">
                <label>Sale price (Today's SGD)<input type="text" class="num-format ms-sale" placeholder="e.g. 900,000" value="${ex('sale')}"></label>
                <label>New home cost (Today's SGD)<input type="text" class="num-format ms-newhome" placeholder="e.g. 450,000" value="${ex('newHome')}"></label>
                <label>CPF used + interest (as of today)<input type="text" class="num-format ms-cpfused" placeholder="e.g. 150,000" value="${ex('cpfUsed')}"></label>
                <div class="ms-dg-note">If you co-own, enter your share of the sale price and new home. The engine repays your share of the loan, refunds the CPF you used (plus 2.5% a year) to your CPF, deducts 3% selling and buying costs, and saves the rest the way you already save. The new home is assumed bought without a loan.</div>
            </div>
        </div>`);
}

window.onMsTypeChange = function (sel) {
    const row = sel.closest('.milestone-stream');
    if (row) row.classList.toggle('is-dg', sel.value === 'downgrade');
    runSim();
};

// Blank "from" = from now; blank "to" = age 100. Rows without an amount are ignored.
function readIncomeStreams() {
    const out = [];
    document.querySelectorAll('.income-stream').forEach(row => {
        const a = parseFloat(String(row.querySelector('.is-amt').value).replace(/,/g, ''));
        if (!Number.isFinite(a) || a === 0) return;
        const s = parseFloat(row.querySelector('.is-start').value);
        const e = parseFloat(row.querySelector('.is-end').value);
        out.push({
            amt: a,
            start: Number.isFinite(s) ? s : 0,
            end: Number.isFinite(e) ? e : 100,
            fixed: row.querySelector('.is-fixed') ? row.querySelector('.is-fixed').checked : false
        });
    });
    return out;
}

// Returns events: windfalls positive, expenses negative, downgrades with their own fields.
// Rows without the needed amounts or an age are ignored.
function readMilestones() {
    const out = [];
    const num = (row, cls) => { const el = row.querySelector(cls); const v = el ? parseFloat(String(el.value).replace(/,/g, '')) : NaN; return Number.isFinite(v) ? v : null; };
    document.querySelectorAll('.milestone-stream').forEach(row => {
        const age = parseFloat(row.querySelector('.ms-age').value);
        if (!Number.isFinite(age)) return;
        const type = row.querySelector('.ms-type') ? row.querySelector('.ms-type').value : 'windfall';
        if (type === 'downgrade') {
            const sale = num(row, '.ms-sale');
            if (!sale) return;
            out.push({ type, age, amt: 0, sale, newHome: num(row, '.ms-newhome') || 0, cpfUsed: num(row, '.ms-cpfused') || 0 });
            return;
        }
        const a = num(row, '.ms-amt');
        if (!a) return;
        out.push({ type, amt: type === 'expense' ? -Math.abs(a) : Math.abs(a), age });
    });
    return out;
}

// -----------------------------------------------------------------------------
// Personas
// -----------------------------------------------------------------------------
const PERSONAS = {
    young_starter: {
        fields: { 'inp-currentAge': 28, 'inp-retireAge': 55, 'inp-expenses': 3500,
            'inp-invStart': 10000, 'inp-invContrib': 500, 'inp-invRet': 5.0,
            'inp-cashStart': 20000, 'inp-cashContrib': 1000,
            'inp-oaStart': 25000, 'inp-oaContrib': 1100,
            'inp-saStart': 7000, 'inp-saContrib': 290 },
        toggles: { 'toggle-expense-partner': false, 'toggle-mortgage': false, 'toggle-mortgage-partner': false },
        choices: { cpfHas: 'yes', cpfContrib: 'yes' }
    },
    hdb_couple: {
        fields: { 'inp-currentAge': 30, 'inp-retireAge': 55, 'inp-expenses': 5000, 'inp-expenseShare': 50,
            'inp-invStart': 30000, 'inp-invContrib': 1000, 'inp-invRet': 4.5,
            'inp-cashStart': 40000, 'inp-cashContrib': 1000,
            'inp-mortgagePrincipal': 420000, 'inp-loanYrs': 23, 'inp-mortgageRate': 2.6, 'inp-mortgageShare': 50,
            'inp-oaStart': 20000, 'inp-oaContrib': 1400,
            'inp-saStart': 25000, 'inp-saContrib': 365 },
        toggles: { 'toggle-expense-partner': true, 'toggle-mortgage': true, 'toggle-mortgage-partner': true, 'inp-maxOA': true },
        choices: { cpfHas: 'yes', cpfContrib: 'yes', loanType: 'hdb' }
    },
    growing_family: {
        fields: { 'inp-currentAge': 35, 'inp-retireAge': 60, 'inp-expenses': 8500, 'inp-expenseShare': 50,
            'inp-invStart': 120000, 'inp-invContrib': 1500, 'inp-invRet': 4.5,
            'inp-cashStart': 80000, 'inp-cashContrib': 700,
            'inp-mortgagePrincipal': 1100000, 'inp-loanYrs': 24, 'inp-mortgageRate': 2.8, 'inp-mortgageShare': 50,
            'inp-oaStart': 35000, 'inp-oaContrib': 1500,
            'inp-saStart': 60000, 'inp-saContrib': 390 },
        toggles: { 'toggle-expense-partner': true, 'toggle-mortgage': true, 'toggle-mortgage-partner': true, 'inp-maxOA': true },
        choices: { cpfHas: 'yes', cpfContrib: 'yes', loanType: 'bank' }
    },
    pragmatic_saver: {
        fields: { 'inp-currentAge': 42, 'inp-retireAge': 60, 'inp-expenses': 2800,
            'inp-invStart': 20000, 'inp-invContrib': 0, 'inp-invRet': 4.0,
            'inp-cashStart': 60000, 'inp-cashContrib': 2500,
            'inp-mortgagePrincipal': 120000, 'inp-loanYrs': 10, 'inp-mortgageRate': 2.6, 'inp-mortgageShare': 100,
            'inp-oaStart': 30000, 'inp-oaContrib': 1200,
            'inp-saStart': 140000, 'inp-saContrib': 400 },
        toggles: { 'toggle-expense-partner': false, 'toggle-mortgage': true, 'toggle-mortgage-partner': false, 'inp-maxOA': true },
        choices: { cpfHas: 'yes', cpfContrib: 'yes', loanType: 'hdb' }
    },
    self_employed: {
        fields: { 'inp-currentAge': 36, 'inp-retireAge': 58, 'inp-expenses': 3200,
            'inp-invStart': 70000, 'inp-invContrib': 1000, 'inp-invRet': 5.0,
            'inp-cashStart': 75000, 'inp-cashContrib': 8000,
            'inp-mortgagePrincipal': 320000, 'inp-loanYrs': 23, 'inp-mortgageRate': 2.6, 'inp-mortgageShare': 50,
            'inp-oaStart': 30000, 'inp-saStart': 35000 },
        toggles: { 'toggle-expense-partner': false, 'toggle-mortgage': true, 'toggle-mortgage-partner': false, 'inp-maxOA': true },
        choices: { cpfHas: 'yes', cpfContrib: 'no', loanType: 'hdb' }
    }
};
PERSONAS.median = PERSONAS.hdb_couple;
PERSONAS.conservative = PERSONAS.pragmatic_saver;

const PERSONA_NAMES = {
    young_starter: '🌱 Young Starter',
    hdb_couple: '🏢 Newly married, new home-owner',
    growing_family: '🏠 High-income, growing family',
    pragmatic_saver: '🛡️ Pragmatic Saver',
    self_employed: '💼 Solo and Self-Employed',
    median: '🏢 Newly married, new home-owner',
    conservative: '🛡️ Pragmatic Saver'
};

// Example-plan mode: banner on, coaching off, status labelled "Example"
function setExampleState(type) {
    exampleState = type;
    const banner = document.getElementById('example-banner');
    if (banner) banner.style.display = type ? 'flex' : 'none';
    updateDOM('example-name', type ? (PERSONA_NAMES[type] || type) : '');
    document.body.classList.toggle('example-mode', !!type);
    if (!type) document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
}

window.loadProfile = function (type) {
    const persona = PERSONAS[type];
    if (!persona) return;
    isLoading = true;

    document.querySelectorAll('.persona-card').forEach(c => {
        const oc = c.getAttribute('onclick') || '';
        c.classList.toggle('active', oc.includes(`'${type}'`));
    });

    // Start from defaults so nothing carries over from a previous persona
    applyFieldDefaults();
    setChecked('inp-maxOA', true);
    setGlobalCcyState('SGD');
    Object.entries(persona.fields).forEach(([id, v]) => setVal(id, v, false));
    Object.entries(persona.toggles).forEach(([id, v]) => setChecked(id, v));
    setChoices(persona.choices);
    syncPanels();

    // Advanced split is re-derived from the new persona
    modeState = { advInitialized: false, simpleAtSwitch: null };
    if (getMode() === 'advanced') onEnterAdvanced();

    isLoading = false;
};

// -----------------------------------------------------------------------------
// Input collection
// -----------------------------------------------------------------------------
function collectInputs() {
    const mode = getMode();
    const adv = mode !== 'simple';
    const isUSD = adv && globalCcyState === 'USD';
    const mortgagePartner = isChecked('toggle-mortgage-partner');
    const expensePartner = isChecked('toggle-expense-partner');

    return {
        mode,
        isAdvanced: adv,
        currentAge: readNum('inp-currentAge'),
        retireAge: readNum('inp-retireAge'),
        expenses: readNum('inp-expenses'),
        expenseShare: expensePartner ? rateOr('inp-expenseShare', DEFAULTS.expenseShare) : 100,

        // Advanced-only assumptions fall back to defaults in Simple (no leakage from hidden fields)
        inflation: (adv ? rateOr('inp-inflation', DEFAULTS.inflation) : DEFAULTS.inflation) / 100,
        realContribGrowth: (adv ? rateOr('inp-realContribGrowth', DEFAULTS.realContribGrowth) : 0) / 100,

        glob: adv ? {
            start: amt('inp-globalStart'),
            contrib: amt('inp-globalContrib'),
            ret: rateOr('inp-globalRet', globalDefaultRet(globalCcyState)) / 100,
            isUSD,
            fx: isUSD ? rateOr('inp-fxRate', DEFAULTS.fxRate) : 1,
            fxDrift: isUSD ? rateOr('inp-fxDrift', DEFAULTS.fxDrift) / 100 : 0,
            ccy: globalCcyState
        } : {
            start: amt('inp-invStart'),
            contrib: amt('inp-invContrib'),
            ret: rateOr('inp-invRet', DEFAULTS.invRet) / 100,
            isUSD: false, fx: 1, fxDrift: 0, ccy: 'SGD'
        },
        sg: adv ? {
            start: amt('inp-sgStart'),
            contrib: amt('inp-sgContrib'),
            ret: rateOr('inp-sgRet', DEFAULTS.sgRet) / 100
        } : { start: 0, contrib: 0, ret: 0 },

        cash: {
            start: amt('inp-cashStart'),
            contrib: amt('inp-cashContrib'),
            yield: (adv ? rateOr('inp-cashYield', DEFAULTS.cashYield) : DEFAULTS.cashYield) / 100
        },

        cpf: (() => {
            const ch = getChoices();
            const has = ch.cpfHas === 'yes';
            const contributing = has && ch.cpfContrib === 'yes';
            return {
                has, contributing,
                oaStart: has ? amt('inp-oaStart') : 0,
                oaContrib: contributing ? amt('inp-oaContrib') : 0,
                hasSA: has,
                saStart: has ? amt('inp-saStart') : 0,
                saContrib: contributing ? amt('inp-saContrib') : 0,
                oaRate: DEFAULTS.oaRate / 100,
                saRate: DEFAULTS.saRate / 100,
                unlockAge: DEFAULTS.cpfUnlockAge,
                frsGrowth: (adv ? rateOr('inp-frsGrowth', DEFAULTS.frsGrowth) : DEFAULTS.frsGrowth) / 100,
                lifeAge: adv ? Math.min(70, Math.max(65, Math.round(rateOr('inp-lifeAge', DEFAULTS.lifeAge)))) : DEFAULTS.lifeAge,
                lifePlan: adv && document.getElementById('inp-lifePlan') ? document.getElementById('inp-lifePlan').value : DEFAULTS.lifePlan,
                pledge: adv && isChecked('inp-pledge') && (isChecked('toggle-mortgage') || isChecked('toggle-ownhome'))
            };
        })(),

        mortgage: (() => {
            const ch = getChoices();
            const loanType = (ch.cpfHas === 'no') ? 'bank' : ch.loanType;
            const twoStage = adv && loanType === 'bank';
            return {
                has: isChecked('toggle-mortgage'),
                principal: amt('inp-mortgagePrincipal'),
                rate: rateOr('inp-mortgageRate', DEFAULTS.mortgageRate) / 100,
                years: amt('inp-loanYrs'),
                share: (mortgagePartner ? rateOr('inp-mortgageShare', DEFAULTS.mortgageShare) : 100) / 100,
                payWithOA: ch.cpfHas === 'yes' && isChecked('inp-maxOA', true),
                customOACap: 0,
                loanType,
                twoStage,
                rateLong: twoStage ? rateOr('inp-mortgageRateLong', DEFAULTS.mortgageRateLong) / 100 : null,
                lockYrs: twoStage ? Math.max(0, rateOr('inp-lockYrs', DEFAULTS.lockYrs)) : Infinity
            };
        })(),

        incomeStreams: adv ? readIncomeStreams() : [],
        milestones: adv ? readMilestones() : [],
        currentExpenses: adv ? readNum('inp-currentExpenses') : null,
        showFireCurve: adv && isChecked('inp-showFireCurve'),
        swr: { override: adv && isChecked('inp-swrOverride'), rate: rateOr('inp-swrRate', DEFAULTS.swrRate) / 100 },
        mc: {
            runs: Math.max(100, Math.min(5000, Math.round(rateOr('inp-mcRuns', DEFAULTS.mcRuns)))),
            volGlobal: Math.max(0, rateOr('inp-volGlobal', DEFAULTS.volGlobal)) / 100,
            volSg: Math.max(0, rateOr('inp-volSg', DEFAULTS.volSg)) / 100,
            volInfl: Math.max(0, rateOr('inp-volInfl', DEFAULTS.volInfl)) / 100,
            volFx: Math.max(0, rateOr('inp-volFx', DEFAULTS.volFx)) / 100,
            volMort: Math.max(0, rateOr('inp-volMort', DEFAULTS.volMort)) / 100,
            blackSwan: isChecked('inp-blackSwan')
        },
        chartView: getChartView()
    };
}

// -----------------------------------------------------------------------------
// Core simulation (deterministic). All outputs in nominal SGD.
//   - Snapshot is taken at the START of each age (Day 1 anchor), before
//     one-off events and the 12 months of compounding.
//   - CPF (R14): OA + SA are locked until 55. At 55, SA then OA move into a
//     Retirement Account (RA) up to your Full Retirement Sum (or the Basic
//     Retirement Sum with a property pledge). Anything above that, plus up to
//     S$5,000, becomes withdrawable (held in OA, counted as liquid). The RA stays
//     locked, earns 4%, and becomes a CPF LIFE monthly income at your payout age.
//   - OA can pay the mortgage at any age.
//   - Global bucket is held in its own currency; converted at `fx`, which
//     drifts yearly in USD mode.
//   - Contributions grow yearly by (1 + inflation) x (1 + realContribGrowth).
//   - Can restart from a saved state (used by the finish line and SWR search).
// -----------------------------------------------------------------------------
const CPF_LIFE_RATE_65 = 1780 / 330100;   // CPF Board table: S$330,100 in RA at 65 -> ~S$1,780/mo (Standard Plan)
const CPF_LIFE_DEFER_PER_YR = 0.019;      // payout per RA dollar rises ~1.9%/yr of deferral (table: S$2,380 at 70)
const CPF_ESCALATING_START = 0.80;        // Escalating Plan starts ~20% lower ...
const CPF_ESCALATING_GROWTH = 0.02;       // ... and rises 2% a year
const CPF_MIN_WITHDRAWAL = 5000;          // withdrawable at 55 even if the retirement sum isn't met
const DOWNGRADE_COSTS = 0.03;             // selling + buying costs, % of sale price

function cpfTargets(inp) {
    // Retirement sums are fixed in the year you turn 55: S$220,400 FRS for the 2026 cohort, grown yearly
    const frs = DEFAULTS.frs2026 * Math.pow(1 + inp.cpf.frsGrowth, DEFAULTS.cpfUnlockAge - inp.currentAge);
    return { frs, brs: frs / 2, target: inp.cpf.pledge ? frs / 2 : frs };
}

function cpfLifeMonthly(raBalance, inp) {
    const defer = Math.max(0, inp.cpf.lifeAge - 65);
    let p = raBalance * CPF_LIFE_RATE_65 * (1 + CPF_LIFE_DEFER_PER_YR * defer);
    if (inp.cpf.lifePlan === 'escalating') p *= CPF_ESCALATING_START;
    return p;
}

function simulatePath(inp, opts = {}) {
    const g = inp.glob, s = inp.sg, c = inp.cash, cpf = inp.cpf, m = inp.mortgage;
    const currentAge = inp.currentAge;
    const startAge = opts.startAge !== undefined ? opts.startAge : currentAge;
    const retireAge = opts.retireAge !== undefined ? opts.retireAge : inp.retireAge;
    const record = opts.record !== false;
    const recordStates = !!opts.recordStates;
    const stopOnFail = !!opts.stopOnFail;
    const T = cpfTargets(inp);
    const mortgageEndAge = currentAge + (m.has ? m.years : 0);

    const st = opts.state ? Object.assign({}, opts.state) : {
        glob: g.start, sg: s.start, cash: c.start,
        oa: cpf.oaStart, sa: cpf.hasSA ? cpf.saStart : 0, ra: 0,
        rem: m.has ? m.principal : 0,
        at55: false, lifeOn: false, lifePay: 0, lifeStart: 0
    };

    const path = [], states = [];
    let solvent = true, depletionAge = null, peakLiquid = 0, totalShortfall = 0;
    let fx = 1;

    const liquidOf = () => st.cash + st.sg + st.glob * fx + (st.at55 ? st.oa : 0);
    const lockedOf = () => (st.at55 ? st.ra : st.oa + st.sa);
    const flagDepletion = age => { if (solvent) { solvent = false; depletionAge = age; } };

    // Proportional withdrawal across all liquid buckets. Returns any unpaid amount.
    const withdraw = amount => {
        const total = liquidOf();
        if (total <= 0) return amount;
        const take = Math.min(amount, total);
        const keep = 1 - take / total;
        st.cash *= keep; st.sg *= keep; st.glob *= keep;
        if (st.at55) st.oa *= keep;
        return amount - take;
    };

    // CPF at 55: SA first, then OA, into the RA up to the target; the rest is withdrawable
    const doCpf55 = () => {
        const total = st.sa + st.oa;
        // Full (or Basic, with a pledge) sum met: everything above it is available.
        // Not met: up to S$5,000 is still available.
        const released = total >= T.target ? total - T.target : Math.min(total, CPF_MIN_WITHDRAWAL);
        st.ra += total - released;
        st.oa = released;
        st.sa = 0;
        st.at55 = true;
    };

    // Money into CPF after 55 (e.g. a downgrade refund): RA up to the target, the rest withdrawable
    const toCpf = amt => {
        if (!st.at55) { st.oa += amt; return; }
        const room = st.lifeOn ? 0 : Math.max(0, T.target - st.ra);
        const toRA = Math.min(room, amt);
        st.ra += toRA;
        st.oa += amt - toRA;
    };

    // R15: yearly rates come from Monte Carlo draws (opts.shocks) or are fixed
    const sh = opts.shocks || null;
    const nY = Math.max(1, 101 - currentAge);
    const priceArr = new Array(nY), contribArr = new Array(nY), fxArr = new Array(nY);
    priceArr[0] = 1; contribArr[0] = 1; fxArr[0] = g.isUSD ? g.fx : 1;
    for (let k = 1; k < nY; k++) {
        const inf = sh ? sh.infl[k - 1] : inp.inflation;
        priceArr[k] = priceArr[k - 1] * (1 + inf);
        contribArr[k] = contribArr[k - 1] * (1 + inf) * (1 + inp.realContribGrowth);
        fxArr[k] = g.isUSD ? fxArr[k - 1] * (1 + (sh ? sh.fx[k - 1] : g.fxDrift)) : 1;
    }

    for (let age = startAge; age <= 100; age++) {
        const yrs = age - currentAge;
        const priceIdx = priceArr[yrs];
        const contribIdx = contribArr[yrs];
        fx = fxArr[yrs];
        const gMonthly = sh ? sh.g[yrs] : 1 + g.ret / 12;
        const sMonthly = sh ? sh.s[yrs] : 1 + s.ret / 12;

        if (cpf.has && !st.at55 && age >= DEFAULTS.cpfUnlockAge) doCpf55();
        if (cpf.has && st.at55 && !st.lifeOn && age >= cpf.lifeAge && st.ra > 0) {
            st.lifePay = cpfLifeMonthly(st.ra, inp);
            st.lifeStart = age;
            st.lifeOn = true;
            st.ra = 0;
        }

        const isWorking = age < retireAge;
        const mortgageActive = m.has && age < mortgageEndAge && st.rem > 0.5;
        const phase = isWorking ? 1 : (mortgageActive ? 2 : 3);
        const lifeNow = st.lifeOn ? st.lifePay * (inp.cpf.lifePlan === 'escalating' ? Math.pow(1 + CPF_ESCALATING_GROWTH, age - st.lifeStart) : 1) : 0;

        // Day 1 anchor: record before anything happens this year
        const liquidNow = liquidOf();
        if (recordStates) states.push(Object.assign({}, st));
        if (record) {
            path.push({ age, liquid: Math.max(0, liquidNow), locked: lockedOf(), phase, rem: st.rem, lifePay: lifeNow, short: 0, pidx: priceIdx });
            if (liquidNow > peakLiquid) peakLiquid = liquidNow;
        }
        if (age === 100) break;
        let yearShort = 0;

        // R7: money coming in is saved the way you already save (split by monthly contributions)
        const depositSplit = amountSGD => {
            const wG = g.contrib * fx, wS = s.contrib, wC = c.contrib;
            const tot = wG + wS + wC;
            if (tot <= 0) { st.cash += amountSGD; return; }
            st.glob += (amountSGD * wG / tot) / fx;
            st.sg += amountSGD * wS / tot;
            st.cash += amountSGD * wC / tot;
        };
        const payOut = amount => {
            const unpaid = withdraw(amount);
            if (unpaid > 0.5) { flagDepletion(age); totalShortfall += unpaid; yearShort += unpaid; }
        };

        // One-off events at the start of the year (today's SGD, inflation-indexed)
        inp.milestones.forEach(ms => {
            if (ms.age !== age) return;
            if (ms.type === 'downgrade') {
                // R22: sell, repay your share of the loan, refund CPF used (+2.5%/yr), buy the new home outright
                const sale = ms.sale * priceIdx;
                const newHome = ms.newHome * priceIdx;
                const costs = DOWNGRADE_COSTS * sale;
                const loan = m.has ? st.rem * m.share : 0;
                if (m.has) st.rem = 0;
                const refund = cpf.has ? Math.min(ms.cpfUsed * Math.pow(1 + cpf.oaRate, yrs), Math.max(0, sale - loan)) : 0;
                if (refund > 0) toCpf(refund);
                const net = sale - costs - loan - refund - newHome;
                if (net > 0) depositSplit(net); else if (net < 0) payOut(-net);
                return;
            }
            const v = ms.amt * priceIdx;
            if (v > 0) depositSplit(v);
            else if (v < 0) payOut(-v);
        });

        // R9: bank loans in Advanced mode reprice to the long-run rate after the lock-in period
        const mortActiveNow = m.has && age < mortgageEndAge && st.rem > 0.5;
        const yearRate = (m.twoStage && yrs >= m.lockYrs) ? (sh ? Math.max(0, m.rateLong + sh.mort[yrs]) : m.rateLong) : m.rate;
        const monthlyPmt = mortActiveNow ? calcPmt(st.rem, yearRate, mortgageEndAge - age) : 0;
        const personalPmt = monthlyPmt * m.share;
        const monthlySpend = isWorking ? 0 : inp.expenses * priceIdx * (inp.expenseShare / 100);
        let monthlyIncome = lifeNow;
        inp.incomeStreams.forEach(sm => {
            if (age >= sm.start && age <= sm.end) monthlyIncome += sm.amt * (sm.fixed ? 1 : priceIdx);
        });

        for (let mo = 1; mo <= 12; mo++) {
            st.glob *= gMonthly;
            st.sg *= sMonthly;
            st.cash *= 1 + c.yield / 12;
            st.oa *= 1 + cpf.oaRate / 12;
            st.sa *= 1 + cpf.saRate / 12;
            st.ra *= 1 + cpf.saRate / 12;

            if (isWorking) {
                st.glob += g.contrib * contribIdx;   // in the Global bucket's own currency
                st.sg += s.contrib * contribIdx;
                st.cash += c.contrib * contribIdx;
                if (!st.at55) {
                    st.oa += cpf.oaContrib * contribIdx;
                    if (cpf.hasSA) st.sa += cpf.saContrib * contribIdx;
                } else {
                    st.oa += cpf.oaContrib * contribIdx;
                    if (cpf.hasSA) toCpf(cpf.saContrib * contribIdx);   // SA share now goes to the RA until the target is met
                }
            }

            let need = monthlySpend;
            if (monthlyPmt > 0 && st.rem > 0) {
                const interest = st.rem * yearRate / 12;
                st.rem = Math.max(0, st.rem - (monthlyPmt - interest));
                const oaTarget = (isWorking && !m.payWithOA) ? Math.min(m.customOACap, personalPmt) : personalPmt;
                const fromOA = Math.min(Math.max(0, st.oa), oaTarget);
                st.oa -= fromOA;
                // While working, any cash top-up comes out of salary (excluded from the savings inputs).
                // In retirement, it is drawn from liquid wealth.
                if (!isWorking) need += personalPmt - fromOA;
            }

            const net = need - monthlyIncome;
            if (net < 0) depositSplit(-net);
            else if (net > 0) payOut(net);
        }
        if (record && yearShort > 0) path[path.length - 1].short = yearShort;
        if (stopOnFail && !solvent) break;
    }

    // Ran out before 55 but CPF covers spending from 55 onwards (a bridging gap, not a lifelong shortfall)
    const recoveredAfterUnlock = depletionAge !== null && depletionAge < DEFAULTS.cpfUnlockAge &&
        path.length > 0 && path[path.length - 1].age === 100 &&
        path.filter(p => p.age >= DEFAULTS.cpfUnlockAge).every(p => p.short === 0);
    const lifeEntry = path.find(p => p.lifePay > 0);

    return { path, states, solvent, depletionAge, peakLiquid, totalShortfall, recoveredAfterUnlock,
             cpfLifeMonthly: lifeEntry ? lifeEntry.lifePay : 0, cpfLifeAge: lifeEntry ? lifeEntry.age : null, targets: T };
}

// SGD-equivalent return of the Global bucket
function sgdReturnOfGlobal(g) { return g.isUSD ? (1 + g.ret) * (1 + g.fxDrift) - 1 : g.ret; }

// -----------------------------------------------------------------------------
// R8: Earliest age you could stop working and still last to 100
// -----------------------------------------------------------------------------
const FREEDOM_SEARCH_MAX_AGE = 85;
function earliestFreedomAge(inp) {
    for (let a = inp.currentAge; a <= FREEDOM_SEARCH_MAX_AGE; a++) {
        if (simulatePath(inp, { retireAge: a, record: false, stopOnFail: true }).solvent) return a;
    }
    return null;
}

// -----------------------------------------------------------------------------
// R8: Finish line (Option C). Smallest liquid wealth at `age` that lasts to 100
// if you stop working at that age, keeping your projected asset mix, CPF and
// remaining mortgage at that age. Locked CPF is not scaled.
// -----------------------------------------------------------------------------
function requiredCapitalAt(inp, states, age, hint) {
    const idx = age - inp.currentAge;
    const st0 = states[idx];
    if (!st0) return null;
    const g = inp.glob;
    const fx = g.isUSD ? g.fx * Math.pow(1 + g.fxDrift, idx) : 1;
    const parts = { cash: st0.cash, sg: st0.sg, glob: st0.glob * fx, oa: st0.at55 ? st0.oa : 0 };
    const L0 = parts.cash + parts.sg + parts.glob + parts.oa;
    const w = L0 > 1
        ? { cash: parts.cash / L0, sg: parts.sg / L0, glob: parts.glob / L0, oa: parts.oa / L0 }
        : { cash: 0, sg: 0, glob: 1, oa: 0 };
    const test = L => {
        const st = Object.assign({}, st0, {
            cash: w.cash * L, sg: w.sg * L, glob: (w.glob * L) / fx,
            oa: st0.at55 ? w.oa * L : st0.oa
        });
        return simulatePath(inp, { startAge: age, retireAge: age, state: st, record: false, stopOnFail: true }).solvent;
    };
    if (test(0)) return 0;
    const annualSpend = inp.expenses * inp.expenseShare / 100 * 12 * Math.pow(1 + inp.inflation, idx);
    let lo = 0, hi = (hint && hint > 0) ? hint * 1.05 : Math.max(100000, annualSpend * 40 + st0.rem);
    if (hint && hint > 0) {
        if (!test(hi)) { lo = hi; hi *= 1.5; }
        else if (test(hint * 0.95)) hi = hint * 0.95;
        else lo = hint * 0.95;
    }
    let guard = 0;
    while (!test(hi) && guard < 25) { lo = hi; hi *= 2; guard++; }
    if (guard >= 25) return null;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (test(mid)) hi = mid; else lo = mid;
        if (hi - lo < Math.max(500, hi * 0.004)) break;
    }
    return hi;
}

function annualSpendAt(inp, age) {
    return inp.expenses * inp.expenseShare / 100 * 12 * Math.pow(1 + inp.inflation, age - inp.currentAge);
}

function buildFinishLine(inp, base) {
    const curve = [];
    let prev = null;
    for (let age = inp.currentAge; age <= 100; age++) {
        let req = requiredCapitalAt(inp, base.states, age, prev);
        prev = req;
        if (req !== null && inp.swr.override && inp.swr.rate > 0) {
            const st = base.states[age - inp.currentAge];
            const remShare = st ? st.rem * inp.mortgage.share : 0;
            req = Math.max(req, annualSpendAt(inp, age) / inp.swr.rate + remShare);
        }
        curve.push(req);
    }
    return curve;
}

// -----------------------------------------------------------------------------
// R15: Monte Carlo (Expert mode)
//   - Fixed seed: the same random sequence every run, so results only change
//     when inputs change.
//   - Investment growth is lognormal with your expected return as the median
//     year, so the median path lines up with the fixed-return projection.
//   - Global and Singapore returns are correlated (0.7). Optional fat tails use
//     a Student-t(5) scaled to the same volatility.
// -----------------------------------------------------------------------------
const MC_SEED = 20261003;
const MC_CORR = 0.7;

function mulberry32(seed) {
    let a = seed;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeNormal(rand) {
    let spare = null;
    return function () {
        if (spare !== null) { const v = spare; spare = null; return v; }
        let u = rand();
        while (u === 0) u = rand();
        const v = rand();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
    };
}

function makeShocks(inp, normal, years) {
    const mc = inp.mc;
    const fatTail = () => {
        const z = normal();
        let c = 0;
        for (let i = 0; i < 5; i++) { const x = normal(); c += x * x; }
        return (z / Math.sqrt(c / 5)) * Math.sqrt(3 / 5);
    };
    const eq = mc.blackSwan ? fatTail : normal;
    const gMu = 12 * Math.log(1 + inp.glob.ret / 12);
    const sMu = 12 * Math.log(1 + inp.sg.ret / 12);
    const fxMu = Math.log(1 + inp.glob.fxDrift);
    const rho2 = Math.sqrt(1 - MC_CORR * MC_CORR);
    const sh = { g: [], s: [], infl: [], fx: [], mort: [] };
    for (let k = 0; k < years; k++) {
        const z1 = eq();
        const z2 = MC_CORR * z1 + rho2 * eq();
        sh.g.push(Math.exp((gMu + mc.volGlobal * z1) / 12));
        sh.s.push(Math.exp((sMu + mc.volSg * z2) / 12));
        sh.infl.push(inp.inflation + mc.volInfl * normal());
        sh.fx.push(Math.exp(fxMu + mc.volFx * normal()) - 1);
        sh.mort.push(mc.volMort * normal());
    }
    return sh;
}

function runMonteCarlo(inp) {
    const n = inp.mc.runs;
    const normal = makeNormal(mulberry32(MC_SEED));
    const years = 101 - inp.currentAge;
    const nom = Array.from({ length: years }, () => new Float64Array(n));
    const real = Array.from({ length: years }, () => new Float64Array(n));
    const depl = new Float64Array(n);
    let ok = 0;
    for (let r = 0; r < n; r++) {
        const res = simulatePath(inp, { shocks: makeShocks(inp, normal, years) });
        if (res.solvent) ok++;
        depl[r] = res.solvent ? 101 : res.depletionAge;
        res.path.forEach((p, i) => { nom[i][r] = p.liquid; real[i][r] = p.liquid / p.pidx; });
    }
    const q = (arr, p) => { const s = arr.slice().sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const bands = set => ({ p10: set.map(a => q(a, 0.1)), p50: set.map(a => q(a, 0.5)), p90: set.map(a => q(a, 0.9)) });
    return { n, success: ok / n, deplP10: q(depl, 0.1), nom: bands(nom), real: bands(real) };
}

// R8: the withdrawal rate your plan supports at your target financial freedom age
function computeSwr(inp, base) {
    const R = inp.retireAge;
    if (R < inp.currentAge || R >= 100) return null;
    const required = requiredCapitalAt(inp, base.states, R);
    const annualSpend = annualSpendAt(inp, R);
    return { age: R, years: 100 - R, required, annualSpend, rate: (required && required > 0) ? annualSpend / required : null };
}

// -----------------------------------------------------------------------------
// Input warnings (multiple conditions per field; first match wins)
// -----------------------------------------------------------------------------
const WARN_TEXT = {
    globalUSD: 'Aggressive. Developed-market equities returned about 8.5% a year in USD from 1900 to 2025, and MSCI World about 6.2% a year in SGD since 2001. The past 10 years (~13%) were exceptional. US stocks alone averaged about 10% since 1928. This input is nominal; the engine adjusts for inflation.',
    globalSGD: 'Aggressive. MSCI World returned about 6.2% a year in SGD since 2001, and developed-market equities about 8.5% a year in USD since 1900. The past 10 years (~13% in USD) were exceptional. This input is nominal; the engine adjusts for inflation.',
    sg: 'Aggressive. The SPDR STI ETF returned about 8.6% a year from its April 2002 launch to July 2026, helped by strong recent years, and STI ETFs returned about 7% a year over the 10 years to 
    inflationLow: "Note: Highly optimistic. Singapore's average headline inflation was 1.72% over the last 10 years, 2.14% over the last 20 years, and 1.68% over the past 30 years.",
    cashHigh: 'Note: Most bank savings accounts that offer high yields cap the maximum balance that earns this interest rate.',
    cashLow: 'Note: You should consider switching from a basic savings account to a high-yield savings account to protect your cash from inflation.',
    mortHigh: 'Note: This is high for Singapore. 3-month SORA, the benchmark bank loans are priced from, peaked at about 4.7% in late 2023 and averaged 2.0%–3.2% over the 5 to 20 years to Q2 2026. HDB concessionary loans are 2.6%.',
    mortLow: "Note: This is optimistic. 3-month SORA hasn't been below about 1.0% in the 20 years to Q2 2026 (the low, about 1.04%, was around 2012–2014), and bank loans add a spread on top.",
    longLow: 'Note: Optimistic for a long-run rate. 3-month SORA averaged about 2.0% over the 15 and 20 years to Q2 2026 and 2.5% over the last 10, before any bank spread.',
    swrHigh: 'Above the widely cited ~4% guideline for a 30-year retirement. A run of poor market returns early in retirement could drain your savings faster than this projection shows.',
    swrLow: 'Very conservative. You may be planning to work years longer than you need to.',
    lifeAge: 'CPF LIFE payouts can start between 65 and 70. The engine uses the nearest allowed age.',
    retireEarly: 'Note: Extreme early financial freedom requires massive savings rates and exposes your capital to 50+ years of sequence-of-returns risk.'
};

function checkInputWarnings(inp) {
    const setWarn = (id, rules) => {
        const inputEl = document.getElementById(id);
        if (!inputEl) return;
        let warnEl = document.getElementById(id + '-warn');
        if (!warnEl) {
            warnEl = document.createElement('div');
            warnEl.id = id + '-warn';
            warnEl.className = 'input-warning-text';
            inputEl.parentNode.appendChild(warnEl);
        }
        const hit = rules.find(r => r[0]);
        if (hit) { warnEl.innerHTML = '<i>' + hit[1] + '</i>'; warnEl.style.display = 'block'; }
        else warnEl.style.display = 'none';
    };
    const v = id => readNum(id);
    const gt = (id, x) => v(id) !== null && v(id) > x;
    const lt = (id, x) => v(id) !== null && v(id) < x;

    setWarn('inp-invRet', [[gt('inp-invRet', 8.0), WARN_TEXT.globalSGD]]);
    setWarn('inp-globalRet', globalCcyState === 'USD'
        ? [[gt('inp-globalRet', 8.5), WARN_TEXT.globalUSD]]
        : [[gt('inp-globalRet', 8.0), WARN_TEXT.globalSGD]]);
    setWarn('inp-sgRet', [[gt('inp-sgRet', 8.0), WARN_TEXT.sg]]);
    setWarn('inp-inflation', [[lt('inp-inflation', 1.5), WARN_TEXT.inflationLow]]);
    setWarn('inp-cashYield', [[gt('inp-cashYield', 2.0), WARN_TEXT.cashHigh], [lt('inp-cashYield', 0.5) && v('inp-cashYield') > 0, WARN_TEXT.cashLow]]);
    setWarn('inp-mortgageRate', [[gt('inp-mortgageRate', 5.0), WARN_TEXT.mortHigh], [lt('inp-mortgageRate', 1.0) && v('inp-mortgageRate') > 0, WARN_TEXT.mortLow]]);
    setWarn('inp-mortgageRateLong', [[gt('inp-mortgageRateLong', 5.0), WARN_TEXT.mortHigh], [lt('inp-mortgageRateLong', 1.5), WARN_TEXT.longLow]]);
    setWarn('inp-retireAge', [[lt('inp-retireAge', 40) && v('inp-retireAge') > 0, WARN_TEXT.retireEarly]]);
    // R8: SWR override thresholds (only when the override is on)
    const ovr = isChecked('inp-swrOverride');
    setWarn('inp-swrRate', [
        [ovr && gt('inp-swrRate', 4.5), WARN_TEXT.swrHigh],
        [ovr && lt('inp-swrRate', 2.5) && v('inp-swrRate') > 0, WARN_TEXT.swrLow]
    ]);
    setWarn('inp-lifeAge', [[(lt('inp-lifeAge', 65) || gt('inp-lifeAge', 70)), WARN_TEXT.lifeAge]]);

    // Cash buffer guardrails (roadmap item 5): only while still working, only once cash is entered
    const buf = cashBufferMonths(inp);
    setWarn('inp-cashStart', buf ? [
        [buf.months < 3, `Liquidity risk: your cash covers about ${buf.months.toFixed(1)} months of ${buf.basisText}. Aim for 3–6 months so a job loss or emergency doesn't force you to sell investments at a bad time.`],
        [buf.months > 12, `Inflation drag: your cash covers about ${Math.round(buf.months)} months of ${buf.basisText}. Beyond about 12 months, extra cash usually loses ground to inflation. Consider investing some of it, unless you're self-employed or saving for a near-term purchase such as a home.`]
    ] : []);
}

// Months of expenses (+ personal mortgage installment) covered by current cash.
// Uses "Current Monthly Household Expenses" (Advanced) if entered, else target retirement expenses.
function cashBufferMonths(inp) {
    const cash = readNum('inp-cashStart');
    if (cash === null) return null;
    if (inp.currentAge !== null && inp.retireAge !== null && inp.currentAge >= inp.retireAge) return null;
    const useCurrent = inp.currentExpenses !== null && inp.currentExpenses !== undefined;
    const living = useCurrent ? inp.currentExpenses : inp.expenses;
    if (living === null || living === undefined) return null;
    const m = inp.mortgage;
    const pmt = (m.has && m.principal > 0 && m.years > 0) ? calcPmt(m.principal, m.rate, m.years) * m.share : 0;
    const basis = living * (inp.expenseShare / 100) + pmt;
    if (basis <= 0) return null;
    const what = useCurrent ? 'your current expenses' : 'your target retirement expenses';
    const basisText = `${money(basis)}/mo (${what}${pmt > 0 ? ' plus your mortgage installment' : ''})`;
    return { months: cash / basis, basisText };
}

// -----------------------------------------------------------------------------
// Essentials gate & Required tags
// -----------------------------------------------------------------------------
function fundsEntered(mode) {
    const inv = mode === 'simple'
        ? readNum('inp-invStart') !== null
        : (readNum('inp-globalStart') !== null || readNum('inp-sgStart') !== null);
    return inv || readNum('inp-cashStart') !== null;
}

// Returns the list of essentials with their status
function getEssentials(inp) {
    const list = [
        { key: 'currentAge', label: 'your current age', ok: inp.currentAge !== null && inp.currentAge >= 16 && inp.currentAge < 100, fields: ['inp-currentAge'] },
        { key: 'retireAge', label: 'your target financial freedom age', ok: inp.retireAge !== null && inp.retireAge > 0 && inp.retireAge <= 100, fields: ['inp-retireAge'] },
        { key: 'expenses', label: 'your target monthly retirement expenses', ok: inp.expenses !== null, fields: ['inp-expenses'] },
        { key: 'funds', label: 'your investments or cash (0 is fine)', ok: fundsEntered(inp.mode),
          fields: inp.mode === 'simple' ? ['inp-invStart', 'inp-cashStart'] : ['inp-globalStart', 'inp-sgStart', 'inp-cashStart'] }
    ];
    if (inp.mortgage.has) {
        list.push({ key: 'principal', label: 'your outstanding loan principal', ok: readNum('inp-mortgagePrincipal') !== null, fields: ['inp-mortgagePrincipal'] });
        list.push({ key: 'loanYrs', label: 'your loan years remaining', ok: readNum('inp-loanYrs') !== null && readNum('inp-loanYrs') > 0, fields: ['inp-loanYrs'] });
    }
    return list;
}

function updateRequiredUI(essentials) {
    const okByKey = {};
    essentials.forEach(e => { okByKey[e.key] = e.ok; });
    document.querySelectorAll('.req-tag[data-req]').forEach(tag => {
        const k = tag.getAttribute('data-req');
        tag.classList.toggle('filled', okByKey[k] === true);
    });
    // Amber outline on missing essentials (only after the user has tried to calculate)
    document.querySelectorAll('.field-missing').forEach(el => el.classList.remove('field-missing'));
    if (showMissing) {
        essentials.filter(e => !e.ok).forEach(e => e.fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('field-missing');
        }));
    }
}

// -----------------------------------------------------------------------------
// Main controller
// -----------------------------------------------------------------------------
function setStatus(cls, main, sub) {
    const card = document.getElementById('card-status');
    if (card) card.className = 'hero-card' + (cls ? ' ' + cls : '');
    const prefix = exampleState ? 'Example plan · ' : '';
    updateDOM('status-main', main ? prefix + main : main);
    updateDOM('status-sub', sub);
}

function setLine(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    if (text) { el.innerText = text; el.style.display = 'block'; }
    else el.style.display = 'none';
}

function getChartView() {
    const r = document.querySelector('input[name="chartView"]:checked');
    return r ? r.value : 'today';
}
function setChartView(v) {
    document.querySelectorAll('input[name="chartView"]').forEach(r => { r.checked = (r.value === v); });
}

// Heavier work (finish line, what-ifs) waits until typing pauses
let simTimer = null;
function runSim() {
    if (isLoading) return;
    clearTimeout(simTimer);
    const heavy = getMode() === 'expert' || (getMode() !== 'simple' && isChecked('inp-showFireCurve')) || scenarios.length > 0;
    if (heavy) simTimer = setTimeout(runSimNow, 120);
    else runSimNow();
}

function freedomLine(inp, age) {
    if (age === null) return `🏁 Even working until ${FREEDOM_SEARCH_MAX_AGE} isn't enough at your current pace. Try the tweaks below.`;
    if (age < inp.retireAge) { const d = inp.retireAge - age; return `🏁 You could stop working at age ${age}, ${d} year${d === 1 ? '' : 's'} before your target.`; }
    if (age === inp.retireAge) return `🏁 You'll have enough to stop working at age ${age}, right on target.`;
    return `🏁 At your current pace, you'll have enough to stop working at age ${age}.`;
}

function runSimNow() {
    if (isLoading) return;
    clearTimeout(simTimer);

    const inp = collectInputs();
    checkInputWarnings(inp);
    updateMortgageReadout(inp);
    detectPreset();

    const essentials = getEssentials(inp);
    updateRequiredUI(essentials);
    const assumptionsLine = document.getElementById('status-assumptions');

    const missing = essentials.filter(e => !e.ok);
    if (missing.length) {
        const done = essentials.length - missing.length;
        const card = document.getElementById('card-status');
        if (card) card.className = 'hero-card';
        updateDOM('status-main', `⏳ ${done} of ${essentials.length} essentials entered`);
        updateDOM('status-sub', 'Still needed: ' + missing.map(e => e.label).join('; ') + '.');
        if (assumptionsLine) assumptionsLine.style.display = 'none';
        setLine('status-fi', ''); setLine('status-cpf', '');
        const panel = document.getElementById('coaching-panel'); if (panel) panel.style.display = 'none';
        renderScenarioPanel([]);
        updateSwrUI(inp, null);
        renderChart([], [], null);
        saveState();
        return;
    }

    const base = simulatePath(inp, { recordStates: true });
    const freedomAge = earliestFreedomAge(inp);
    const labels = base.path.map(p => p.age);

    // Today's Dollars: divide each point by cumulative inflation since today (roadmap item 2)
    const today = inp.chartView === 'today';
    const defl = i => today ? Math.pow(1 + inp.inflation, i) : 1;
    const adj = (val, i) => (val === null || val === undefined) ? null : val / defl(i);

    // Phase-segmented liquid wealth lines
    const p1 = [], p2 = [], p3 = [];
    base.path.forEach((pt, i) => {
        const val = adj(pt.liquid, i);
        p1.push(pt.phase === 1 ? val : null);
        p2.push(pt.phase === 2 ? val : null);
        p3.push(pt.phase === 3 ? val : null);
        if (i > 0) {
            const prev = base.path[i - 1].phase;
            if (pt.phase === 2 && prev === 1) p1[i] = val;
            if (pt.phase === 3 && prev === 2) p2[i] = val;
            if (pt.phase === 3 && prev === 1) p1[i] = val;
        }
    });

    const datasets = [
        { label: 'Accumulation Phase', data: p1, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.2, spanGaps: true, pointStyle: 'rect' },
        { label: 'Mortgage Drawdown', data: p2, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.2, spanGaps: true, pointStyle: 'rect' },
        { label: 'Debt-Free Retirement', data: p3, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.2, spanGaps: true, pointStyle: 'rect' }
    ];

    // Locked CPF: OA + SA before 55, then the Retirement Account until CPF LIFE starts
    const lockedData = base.path.map((p, i) => (p.locked > 0.5 ? adj(p.locked, i) : null));
    const hasLocked = lockedData.some(v => v !== null);
    if (hasLocked) {
        datasets.push({ label: 'CPF (locked: OA/SA, then Retirement Account)', data: lockedData, borderColor: '#64748b', borderDash: [6, 4], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 2, pointStyle: 'line' });
    }

    // R8: simulation-based finish line
    if (inp.showFireCurve) {
        const curve = buildFinishLine(inp, base);
        datasets.push({ label: 'Financial Freedom Target (The Finish Line)', data: curve.map(adj), borderColor: '#ef4444', borderDash: [2, 4], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5, pointStyle: 'line' });
    }

    // R11: what-if lines
    const scenResults = computeScenarios(inp, base, freedomAge);
    scenResults.slice(1).forEach((r, k) => {
        datasets.push({ label: 'What-if: ' + r.label, data: r.path.map((p, i) => adj(p.liquid, i)), borderColor: SCEN_COLORS[k], borderDash: [8, 5], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 2.5, pointStyle: 'line' });
    });

    // R15: Expert mode replaces the wealth lines with Monte Carlo percentile bands
    const mc = inp.mode === 'expert' ? runMonteCarlo(inp) : null;
    if (mc) {
        const P = today ? mc.real : mc.nom;
        const fixedLine = base.path.map((p, i) => adj(p.liquid, i));
        datasets.splice(0, 3,
            { label: '90th percentile (good luck)', data: P.p90, borderColor: '#10b981', borderDash: [5, 5], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5, pointStyle: 'line' },
            { label: '10th percentile (bad luck)', data: P.p10, borderColor: '#f59e0b', borderDash: [5, 5], fill: '-1', backgroundColor: 'rgba(37, 99, 235, 0.10)', tension: 0.2, pointRadius: 0, borderWidth: 1.5, pointStyle: 'line' },
            { label: 'Median outcome', data: P.p50, borderColor: '#2563eb', fill: false, tension: 0.2, pointRadius: 0, borderWidth: 3, pointStyle: 'line' },
            { label: 'Fixed-return projection', data: fixedLine, borderColor: '#94a3b8', borderDash: [2, 3], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5, pointStyle: 'line' }
        );
    }

    // Status card
    if (mc) {
        const pct = Math.round(mc.success * 1000) / 10;
        const cls = pct >= 90 ? 'success' : (pct >= 70 ? 'warning' : 'danger');
        const icon = pct >= 90 ? '✅' : (pct >= 70 ? '🐢' : '⚠️');
        const bad = mc.deplP10 > 100
            ? 'Even in the worst 10% of simulations, your money lasts to 100.'
            : `In the worst 10% of simulations, money runs out by age ${mc.deplP10}.`;
        setStatus(cls, `${icon} ${pct}% of ${fmt(mc.n)} simulations last to 100`,
            `Median wealth at 100: ${moneyM(mc.real.p50[mc.real.p50.length - 1])} in today's dollars. ${bad}`);
    } else if (base.solvent) {
        const finalBal = base.path[base.path.length - 1].liquid;
        const pvBal = finalBal / Math.pow(1 + inp.inflation, 100 - inp.currentAge);
        setStatus('success', '✅ Financial Independence Secured to Age 100',
            `Est. remaining wealth at 100: ${moneyM(finalBal)} (worth ~${moneyM(pvBal)} in today's dollars)`);
    } else if (base.recoveredAfterUnlock) {
        const gap = DEFAULTS.cpfUnlockAge - base.depletionAge;
        setStatus('danger', '⚠️ Adjustments Needed',
            `Your cash and investments run out at age ${base.depletionAge}, ${gap} year${gap === 1 ? '' : 's'} before your CPF becomes available at 55. You need enough outside CPF to bridge that gap.`);
    } else if (base.depletionAge >= 90) {
        setStatus('warning', '🐢 Almost There', `Funds deplete at age ${base.depletionAge}. A small tweak will get you to 100.`);
    } else {
        setStatus('danger', '⚠️ Adjustments Needed', `Funds deplete at age ${base.depletionAge}. Try investing a bit more or delaying financial freedom.`);
    }
    setLine('status-fi', freedomLine(inp, freedomAge));
    if (inp.cpf.has && base.cpfLifeMonthly > 0) {
        const pv = base.cpfLifeMonthly / Math.pow(1 + inp.inflation, base.cpfLifeAge - inp.currentAge);
        const esc = inp.cpf.lifePlan === 'escalating' ? ', rising 2% a year' : '';
        setLine('status-cpf', `🧓 CPF LIFE pays about ${money(base.cpfLifeMonthly)}/month from age ${base.cpfLifeAge}${esc} (about ${money(pv)} in today's dollars).`);
    } else setLine('status-cpf', '');

    // Simple mode: disclose hidden assumptions under the result
    if (assumptionsLine) {
        if (inp.mode === 'simple') {
            const cpfTxt = inp.cpf.has ? `, CPF floor rates (OA ${DEFAULTS.oaRate}%, SA/RA ${DEFAULTS.saRate}%) and CPF LIFE Standard Plan from 65` : '';
            assumptionsLine.innerText = `Assumes ${DEFAULTS.inflation}% inflation, ${DEFAULTS.cashYield}% cash yield${cpfTxt}. Change these in Advanced.`;
            assumptionsLine.style.display = 'block';
        } else if (inp.mode === 'expert') {
            assumptionsLine.innerText = `Based on ${fmt(inp.mc.runs)} simulations with random yearly returns${inp.mc.blackSwan ? ' (fat tails on)' : ''}. The shaded band runs from the 10th to the 90th percentile of wealth at each age; the grey dotted line is the fixed-return projection. Coaching, the finish line, the "stop working" age and what-ifs use the fixed-return projection.`;
            assumptionsLine.style.display = 'block';
        } else {
            assumptionsLine.style.display = 'none';
        }
    }

    updateSwrUI(inp, inp.isAdvanced ? computeSwr(inp, base) : null);

    // Coaching and what-ifs are switched off while an example plan is showing
    if (exampleState) {
        const panel = document.getElementById('coaching-panel'); if (panel) panel.style.display = 'none';
        renderScenarioPanel([]);
    } else {
        generateCoaching(inp, base.solvent);
        renderScenarioPanel(scenResults);
    }
    renderChart(labels, datasets, inp, hasLocked, base);
    saveState();
}

// -----------------------------------------------------------------------------
// R8: Safe withdrawal rate display
// -----------------------------------------------------------------------------
function updateSwrUI(inp, info) {
    const inpRate = document.getElementById('inp-swrRate');
    if (inpRate) inpRate.disabled = !isChecked('inp-swrOverride');
    if (!info) { updateDOM('swr-readout', '—'); updateDOM('swr-note', inp && inp.isAdvanced ? '' : ''); return; }
    if (info.required === 0) {
        updateDOM('swr-readout', 'Not needed');
        updateDOM('swr-note', `Your CPF LIFE payouts and income streams cover your spending from age ${info.age}, so no invested savings are needed at that point.`);
        return;
    }
    if (info.required === null || info.rate === null) {
        updateDOM('swr-readout', 'Not reachable');
        updateDOM('swr-note', 'No amount of savings at that age keeps the plan going to 100. Check your one-off expenses and income streams.');
        return;
    }
    const pct = info.rate * 100;
    updateDOM('swr-readout', pct.toFixed(2) + '%');
    let note = `First-year spending of ${money(info.annualSpend)} ÷ ${money(info.required)} needed at age ${info.age} (future dollars). `;
    if (pct > 4) {
        const why = [`your money only needs to last ${info.years} years`];
        if (inp.cpf.has) why.push('CPF LIFE income from ' + inp.cpf.lifeAge + ' covers part of your spending');
        if (inp.incomeStreams.length) why.push('your income streams help');
        note += 'Higher than the 4% rule of thumb because ' + why.join(', and ') + '.';
    } else if (pct < 3) {
        note += `Lower than the 4% rule of thumb because your money needs to last ${info.years} years${info.age < DEFAULTS.cpfUnlockAge ? ' and you have to bridge the years before CPF is available' : ''}.`;
    } else note += 'In line with common 3–4% guidelines.';
    updateDOM('swr-note', note);
}

// -----------------------------------------------------------------------------
// R16: Assumption presets (Advanced)
// -----------------------------------------------------------------------------
const PRESETS = {
    cautious:   { label: 'Cautious',   inflation: 3.0, globalRetSGD: 5.0, globalRetUSD: 5.5, sgRet: 4.5, cashYield: 1.0, mortgageRateLong: 3.0 },
    balanced:   { label: 'Balanced',   inflation: 2.5, globalRetSGD: 6.5, globalRetUSD: 7.0, sgRet: 6.0, cashYield: 1.5, mortgageRateLong: 2.5 },
    optimistic: { label: 'Optimistic', inflation: 2.0, globalRetSGD: 7.5, globalRetUSD: 8.0, sgRet: 7.0, cashYield: 2.0, mortgageRateLong: 2.0 }
};

function presetChanges(name) {
    const p = PRESETS[name];
    return [
        { id: 'inp-inflation', val: p.inflation },
        { id: 'inp-globalRet', val: globalCcyState === 'USD' ? p.globalRetUSD : p.globalRetSGD },
        { id: 'inp-sgRet', val: p.sgRet },
        { id: 'inp-cashYield', val: p.cashYield },
        { id: 'inp-mortgageRateLong', val: p.mortgageRateLong }
    ];
}

window.applyPreset = function (name) {
    if (!PRESETS[name]) return;
    presetChanges(name).forEach(ch => setVal(ch.id, ch.val.toFixed(1)));
    runSim();
};

function detectPreset() {
    let match = null;
    Object.keys(PRESETS).forEach(name => {
        const ok = presetChanges(name).every(ch => {
            const v = readNum(ch.id);
            return v !== null && Math.abs(v - ch.val) < 0.001;
        });
        if (ok) match = name;
    });
    setRadio('preset', match || '__none');
    const custom = document.getElementById('preset-custom');
    if (custom) custom.style.display = match ? 'none' : 'inline-block';
}

// -----------------------------------------------------------------------------
// R11: What-if scenarios (previews only; not saved; cleared when your plan changes)
// -----------------------------------------------------------------------------
const SCEN_COLORS = ['#7c3aed', '#db2777'];
let scenarios = [];          // [{ label, changes: [{ id, val }] }]
let scenarioSig = null;      // signature of your plan when the what-ifs were made

const SCEN_FIELDS = {
    'inp-retireAge':      { label: 'Financial freedom age', set: (i, v) => { i.retireAge = v; } },
    'inp-expenses':       { label: 'Retirement expenses /mo', set: (i, v) => { i.expenses = v; } },
    'inp-invContrib':     { label: 'Monthly investments', set: (i, v) => { i.glob.contrib = v; } },
    'inp-globalContrib':  { label: 'Global investments /mo', set: (i, v) => { i.glob.contrib = v; } },
    'inp-sgContrib':      { label: 'Singapore investments /mo', set: (i, v) => { i.sg.contrib = v; } },
    'inp-cashContrib':    { label: 'Cash savings /mo', set: (i, v) => { i.cash.contrib = v; } },
    'inp-invRet':         { label: 'Portfolio return %', set: (i, v) => { i.glob.ret = v / 100; } },
    'inp-globalRet':      { label: 'Global return %', set: (i, v) => { i.glob.ret = v / 100; } },
    'inp-sgRet':          { label: 'Singapore return %', set: (i, v) => { i.sg.ret = v / 100; } },
    'inp-inflation':      { label: 'Inflation %', set: (i, v) => { i.inflation = v / 100; } },
    'inp-cashYield':      { label: 'Cash yield %', set: (i, v) => { i.cash.yield = v / 100; } },
    'inp-mortgageRateLong': { label: 'Long-run mortgage rate %', set: (i, v) => { if (i.mortgage.twoStage) i.mortgage.rateLong = v / 100; } }
};

function planSignature(inp) {
    const copy = Object.assign({}, inp, { chartView: null, showFireCurve: null, swr: null });
    return JSON.stringify(copy);
}

function scenarioInputs(inp, changes) {
    const i = structuredClone(inp);
    changes.forEach(ch => { const f = SCEN_FIELDS[ch.id]; if (f) f.set(i, ch.val); });
    return i;
}

function summarise(label, inp, res, freedomAge) {
    const i65 = 65 - inp.currentAge;
    const at65 = (i65 >= 0 && res.path[i65]) ? res.path[i65].liquid / Math.pow(1 + inp.inflation, i65) : null;
    return { label, path: res.path, freedomAge, wealth65: at65, lastsTo: res.solvent ? '100+' : String(res.depletionAge) };
}

function computeScenarios(inp, base, freedomAge) {
    if (!scenarios.length) return [];
    if (planSignature(inp) !== scenarioSig) { scenarios = []; return []; }
    const out = [summarise('Your plan', inp, base, freedomAge)];
    scenarios.forEach(sc => {
        const si = scenarioInputs(inp, sc.changes);
        const r = simulatePath(si);
        out.push(summarise(sc.label, si, r, earliestFreedomAge(si)));
    });
    return out;
}

function addScenario(label, changes) {
    const inp = collectInputs();
    const max = inp.isAdvanced ? 2 : 1;
    scenarios.push({ label, changes });
    while (scenarios.length > max) scenarios.shift();
    scenarioSig = planSignature(inp);
    runSimNow();
    scrollToResult();
}

window.compareTweak = function (id, val, label) {
    addScenario(label, [{ id, val }]);
};

window.applyScenario = function (k) {
    const sc = scenarios[k];
    if (!sc) return;
    sc.changes.forEach(ch => {
        const el = document.getElementById(ch.id);
        const decimals = el && el.step && el.step.indexOf('.') !== -1;
        setVal(ch.id, decimals ? Number(ch.val).toFixed(1) : ch.val);
    });
    scenarios = [];
    runSimNow();
    scrollToResult();
};

window.removeScenario = function (k) {
    scenarios.splice(k, 1);
    runSimNow();
};

function renderScenarioPanel(results) {
    const panel = document.getElementById('scenario-panel');
    const body = document.getElementById('scen-body');
    if (!panel || !body) return;
    if (!results.length) { panel.style.display = 'none'; body.innerHTML = ''; return; }
    const cell = v => v === null || v === undefined ? '—' : v;
    body.innerHTML = results.map((r, k) => {
        const name = k === 0 ? '<strong>Your plan</strong>' : `<span class="scen-swatch" style="background:${SCEN_COLORS[k - 1]}"></span>${escapeHtml(r.label)}`;
        const actions = k === 0 ? '' : `<button type="button" class="btn-scen-apply" onclick="applyScenario(${k - 1})">Apply</button><button type="button" class="btn-scen-remove" onclick="removeScenario(${k - 1})" aria-label="Remove">✕</button>`;
        return `<tr><td>${name}</td><td>${cell(r.freedomAge === null ? 'Not by ' + FREEDOM_SEARCH_MAX_AGE : r.freedomAge)}</td><td>${r.wealth65 === null ? '—' : moneyM(r.wealth65)}</td><td>${r.lastsTo}</td><td class="scen-actions">${actions}</td></tr>`;
    }).join('');
    panel.style.display = 'block';
}

// Custom what-if builder (Advanced)
const BUILDER_FIELDS = ['inp-retireAge', 'inp-expenses', 'inp-globalContrib', 'inp-sgContrib', 'inp-cashContrib', 'inp-globalRet', 'inp-sgRet', 'inp-inflation'];

window.addBuilderRow = function () {
    const box = document.getElementById('scen-custom-rows');
    if (!box || box.children.length >= 3) return;
    const opts = BUILDER_FIELDS.map(id => `<option value="${id}">${SCEN_FIELDS[id].label}</option>`).join('');
    box.insertAdjacentHTML('beforeend', `
        <div class="scen-row">
            <select class="scen-field" onchange="prefillBuilder(this)">${opts}</select>
            <input type="number" class="scen-val" step="any">
            <button type="button" class="btn-remove" onclick="this.parentNode.remove()" aria-label="Remove">✕</button>
        </div>`);
    prefillBuilder(box.lastElementChild.querySelector('.scen-field'));
};

window.prefillBuilder = function (sel) {
    const v = readNum(sel.value);
    const input = sel.parentNode.querySelector('.scen-val');
    if (input) input.value = v === null ? '' : v;
};

window.showCustomScenario = function () {
    const rows = document.querySelectorAll('#scen-custom-rows .scen-row');
    const changes = [];
    rows.forEach(r => {
        const id = r.querySelector('.scen-field').value;
        const v = parseFloat(r.querySelector('.scen-val').value);
        if (Number.isFinite(v)) changes.push({ id, val: v });
    });
    if (!changes.length) return;
    const label = changes.map(ch => `${SCEN_FIELDS[ch.id].label} ${ch.id.includes('Contrib') || ch.id === 'inp-expenses' ? fmt(ch.val) : ch.val}`).join(', ');
    addScenario(label, changes);
};

window.quickScenario = function (kind) {
    if (kind === 'fees') {
        const cur = rateOr('inp-globalRet', globalDefaultRet(globalCcyState));
        addScenario('Lower fees (+1.3% return)', [{ id: 'inp-globalRet', val: round2(cur + 1.3) }]);
    } else if (PRESETS[kind]) {
        addScenario(PRESETS[kind].label + ' assumptions', presetChanges(kind));
    }
};

// -----------------------------------------------------------------------------
// Chart
// -----------------------------------------------------------------------------
function renderChart(labels, datasets, inp, hasLocked = false, base = null) {
    const canvas = document.getElementById('fireChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (fireChart) fireChart.destroy();

    const ann = {};
    if (inp && labels.length) {
        const idx = age => age - inp.currentAge;
        if (inp.retireAge > inp.currentAge && inp.retireAge <= 100) {
            ann.lineRetire = {
                type: 'line', xMin: idx(inp.retireAge), xMax: idx(inp.retireAge),
                borderColor: '#7c3aed', borderDash: [5, 5], borderWidth: 2,
                label: { display: true, content: 'Financial Freedom Age', position: 'start', backgroundColor: '#7c3aed', color: '#fff', font: { size: 11 } }
            };
        }
        if (inp.cpf.has && inp.currentAge < DEFAULTS.cpfUnlockAge) {
            ann.lineCPF = {
                type: 'line', xMin: idx(DEFAULTS.cpfUnlockAge), xMax: idx(DEFAULTS.cpfUnlockAge),
                borderColor: 'rgba(100, 116, 139, 0.4)', borderWidth: 1,
                label: { display: true, content: '🔓 CPF at 55', position: 'end', backgroundColor: 'transparent', color: '#475569', font: { size: 12 } }
            };
        }
        if (base && base.cpfLifeAge && base.cpfLifeAge > inp.currentAge) {
            ann.lineLife = {
                type: 'line', xMin: idx(base.cpfLifeAge), xMax: idx(base.cpfLifeAge),
                borderColor: 'rgba(22, 163, 74, 0.35)', borderWidth: 1,
                label: { display: true, content: '🧓 CPF LIFE', position: 'end', backgroundColor: 'transparent', color: '#15803d', font: { size: 12 }, yAdjust: 40 }
            };
        }
        // Mortgage free: first age the loan balance reaches zero (allows for a downgrade sale)
        if (base && inp.mortgage.has) {
            const k = base.path.findIndex((p, i) => i > 0 && p.rem <= 0.5 && base.path[i - 1].rem > 0.5);
            if (k > 0) {
                ann.lineMortgage = {
                    type: 'line', xMin: k, xMax: k,
                    borderColor: 'rgba(245, 158, 11, 0.3)', borderWidth: 1,
                    label: { display: true, content: '🏠 Mortgage Free', position: 'end', backgroundColor: 'transparent', color: '#f59e0b', font: { size: 12 }, yAdjust: 20 }
                };
            }
        }
        (inp.milestones || []).forEach((ms, i) => {
            if (ms.age >= inp.currentAge && ms.age <= 100) {
                const icon = ms.type === 'downgrade' ? '🏡' : (ms.amt < 0 ? '💸' : '💰');
                ann['milestone_' + i] = {
                    type: 'line', xMin: idx(ms.age), xMax: idx(ms.age),
                    borderColor: 'rgba(100, 116, 139, 0.3)', borderWidth: 1, borderDash: [2, 2],
                    label: { display: true, content: icon, position: 'end', backgroundColor: 'transparent', font: { size: 14 }, yAdjust: 60 + i * 15 }
                };
            }
        });
        // R13: shade the years when there isn't enough money to cover spending (fixed projection only)
        if (base && inp.mode !== 'expert') {
            let k = 0, n = 0;
            while (k < base.path.length) {
                if (base.path[k].short > 0) {
                    let e = k;
                    while (e + 1 < base.path.length && base.path[e + 1].short > 0) e++;
                    const endAge = base.path[e].age + 1;
                    const untilCpf = endAge === DEFAULTS.cpfUnlockAge;
                    ann['gap_' + n++] = {
                        type: 'box', xMin: k - 0.5, xMax: Math.min(e + 0.5, base.path.length - 1),
                        backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.4)', borderWidth: 1,
                        label: { display: true, content: untilCpf ? 'No money to live on until CPF unlocks' : 'Not enough money to cover spending', position: 'start', color: '#b91c1c', font: { size: 11 } }
                    };
                    k = e + 1;
                } else k++;
            }
        }
    }

    fireChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { title: { display: true, text: (inp && inp.chartView === 'future') ? "Wealth (Future SGD)" : "Wealth (Today's SGD)" }, ticks: { callback: v => '$' + (v / 1000000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M' } }
            },
            plugins: {
                legend: { labels: { usePointStyle: true, boxWidth: 15 } },
                tooltip: {
                    filter: item => item.raw !== null && item.raw !== undefined,
                    callbacks: {
                        title: items => items.length ? 'Age ' + items[0].label : '',
                        label: c => c.dataset.label + ': $' + Math.round(c.raw).toLocaleString('en-US')
                    }
                },
                annotation: { annotations: ann }
            }
        }
    });
}

// -----------------------------------------------------------------------------
// Smart estimators (Mortgage & CPF)
// -----------------------------------------------------------------------------
function toggleMortgageCalc() {
    const pnl = document.getElementById('mortgage-calc-panel');
    if (pnl) pnl.style.display = pnl.style.display === 'none' ? 'block' : 'none';
}

function applyMortgageEstimate() {
    const origLoan = amt('est-origLoan');
    const origTenure = amt('est-origTenure');
    const yearsPaid = amt('est-yearsPaid');
    const rate = rateOr('inp-mortgageRate', DEFAULTS.mortgageRate) / 100;
    if (origLoan > 0 && origTenure > 0 && yearsPaid >= 0) {
        const r = rate / 12;
        const n = origTenure * 12;
        const monthsPaid = yearsPaid * 12;
        const pmt = calcPmt(origLoan, rate, origTenure);
        const rem = r === 0 ? origLoan - pmt * monthsPaid : (pmt / r) * (1 - Math.pow(1 + r, -(n - monthsPaid)));
        setVal('inp-mortgagePrincipal', Math.max(0, Math.round(rem)));
        setVal('inp-loanYrs', Math.max(0, origTenure - yearsPaid));
        toggleMortgageCalc();
        runSim();
    }
}

function toggleOACalc() {
    const pnl = document.getElementById('oa-calc-panel');
    if (pnl) pnl.style.display = pnl.style.display === 'none' ? 'block' : 'none';
}

// CPF contribution and allocation rates from 1 Jan 2026 (Singapore Citizens and 3rd-year+ PRs).
// total = employer + employee rate on wages up to the Ordinary Wage ceiling;
// oa/sa = share of that contribution allocated to each account (CPF Board allocation table).
// From 55 the SA is closed; that share goes to the Retirement Account, which this tool treats as OA-equivalent later.
const CPF_OW_CEILING = 8000;
const CPF_RATE_BANDS = [
    { maxAge: 35,       total: 0.37,  oa: 0.6217, sa: 0.1621 },
    { maxAge: 45,       total: 0.37,  oa: 0.5677, sa: 0.1891 },
    { maxAge: 50,       total: 0.37,  oa: 0.5136, sa: 0.2162 },
    { maxAge: 55,       total: 0.37,  oa: 0.4055, sa: 0.3108 },
    { maxAge: 60,       total: 0.34,  oa: 0.3530, sa: 0 },
    { maxAge: 65,       total: 0.25,  oa: 0.1400, sa: 0 },
    { maxAge: 70,       total: 0.165, oa: 0.0607, sa: 0 },
    { maxAge: Infinity, total: 0.125, oa: 0.0800, sa: 0 }
];

// Returns { oa, sa } monthly estimates, or null if not computable
function runOAEstimate() {
    const salary = amt('est-salary');
    const age = readNum('inp-currentAge');
    if (salary <= 0) { updateDOM('oa-est-result', ''); return null; }
    if (age === null) {
        updateDOM('oa-est-result', 'Enter your current age in Step 1 first; CPF allocation rates depend on age.');
        return null;
    }
    const band = CPF_RATE_BANDS.find(b => age <= b.maxAge);
    const wage = Math.min(salary, CPF_OW_CEILING);
    const contrib = wage * band.total;
    const oa = Math.round(contrib * band.oa);
    const sa = Math.round(contrib * band.sa);
    let msg = `Estimated OA inflow: <strong>${money(oa)}/mo</strong>`;
    msg += age <= 55 ? ` · SA inflow: <strong>${money(sa)}/mo</strong>` : ' · SA: closed from 55 (that share goes to your Retirement Account)';
    if (salary > CPF_OW_CEILING) msg += `<br>Only the first ${money(CPF_OW_CEILING)} of salary attracts CPF.`;
    msg += '<br><span style="opacity:0.8">Uses 2026 rates for citizens and 3rd-year+ PRs. PRs in their first two years contribute less.</span>';
    updateDOM('oa-est-result', msg, true);
    return { oa, sa };
}

// Fills OA and SA inflows. If you've already entered an OA inflow that differs from the
// estimate by more than 10%, your figure is kept unless you choose to replace it.
// Link built from parts so chat/markdown tools can't mangle the tag when this file is copied
const OA_LINK = '<' + 'a href="#" onclick="applyOAEstimate(true); return false;">Use the estimate for OA too<' + '/a>';

function applyOAEstimate(replaceOA) {
    const est = runOAEstimate();
    if (!est) return;
    const cur = readNum('inp-oaContrib');
    const differs = cur !== null && est.oa > 0 && Math.abs(cur - est.oa) / est.oa > 0.10;
    setVal('inp-saContrib', est.sa);
    if (!differs || replaceOA) {
        setVal('inp-oaContrib', est.oa);
        const pnl = document.getElementById('oa-calc-panel');
        if (pnl) pnl.style.display = 'none';
    } else {
        updateDOM('oa-est-result', `SA inflow set to <strong>${money(est.sa)}/mo</strong>. We kept your OA inflow of <strong>${money(cur)}/mo</strong> (estimate: ${money(est.oa)}/mo). ${OA_LINK}`, true);
    }
    runSim();
}

// -----------------------------------------------------------------------------
// Progressive wizard controller
// -----------------------------------------------------------------------------
function unlockSection(id) {
    const sec = document.getElementById(id);
    if (sec) { sec.classList.remove('wizard-lock'); sec.classList.add('wizard-unlock'); }
    return sec;
}
function scrollToEl(el) {
    if (el) setTimeout(() => { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }, 50);
}

// "Let's go": straight to the inputs
window.startPlan = function () {
    const sec = unlockSection('inputs-section');
    scrollToEl(sec);
};

// "See an example plan": reveal the optional example picker
window.toggleExamplePicker = function () {
    const sec = document.getElementById('persona-section');
    if (!sec) return;
    const show = sec.style.display === 'none';
    sec.style.display = show ? 'block' : 'none';
    if (show) scrollToEl(sec);
};

window.loadExample = function (type) {
    if (!PERSONAS[type]) return;
    applyModeClass('simple');
    window.loadProfile(type);
    setExampleState(type);
    showMissing = false;
    unlockSection('inputs-section');
    unlockSection('chart-section');
    runSim();
    scrollToEl(document.getElementById('planner-split'));
};

// Exit example: wipe the example's numbers and start from blank
window.startOwnPlan = function () {
    clearAllInputs();
    const picker = document.getElementById('persona-section');
    if (picker) picker.style.display = 'none';
    const sec = unlockSection('inputs-section');
    scrollToEl(sec);
    const age = document.getElementById('inp-currentAge');
    if (age) setTimeout(() => { try { age.focus({ preventScroll: true }); } catch (e) {} }, 400);
};

// Backward compatibility
window.unlockPersonas = window.toggleExamplePicker;
window.selectPersona = window.loadExample;

// R5: scroll so the result card sits just below the top of the window (and below the example banner)
function scrollToResult() {
    const card = document.getElementById('card-status');
    if (!card) return;
    const banner = document.getElementById('example-banner');
    const offset = (banner && banner.style.display !== 'none' ? banner.offsetHeight : 0) + 16;
    setTimeout(() => {
        const y = card.getBoundingClientRect().top + window.pageYOffset - offset;
        try { window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
    }, 60);
}

window.executeSimulation = function () {
    showMissing = true;
    runSimNow();
    unlockSection('chart-section');
    // If essentials are missing, take the user to the first one; otherwise to the result
    const first = document.querySelector('.field-missing');
    if (first) {
        try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus({ preventScroll: true }); } catch (e) {}
    } else {
        scrollToResult();
    }
};

// -----------------------------------------------------------------------------
// Coaching engine
// -----------------------------------------------------------------------------
// R11: each card applies on click; "Compare" previews it as a what-if instead
function coachCard(cls, id, val, text, pill, cmp) {
    const label = String(cmp || pill).replace(/['"<>]/g, '');
    return `<div class="coach-card ${cls}" onclick="applyTweak('${id}', ${val})">
                <div class="coach-text">${text}</div>
                <div class="coach-actions">
                    <button type="button" class="coach-compare" onclick="event.stopPropagation(); compareTweak('${id}', ${val}, '${label}')">Compare</button>
                    <div class="coach-btn-pill">${pill}</div>
                </div>
            </div>`;
}

window.generateCoaching = function (inp, isSolvent) {
    const panel = document.getElementById('coaching-panel');
    const optsDiv = document.getElementById('coach-options');
    const note = document.getElementById('coach-note');
    const title = document.getElementById('coach-title');
    if (!panel || !optsDiv) return;
    panel.style.display = 'block';

    // Investment & return targets depend on mode
    const adv = inp.isAdvanced;
    const gSGD = inp.glob.start * (inp.glob.isUSD ? inp.glob.fx : 1);
    const useGlobal = !adv || gSGD >= inp.sg.start;
    const invId = !adv ? 'inp-invContrib' : (useGlobal ? 'inp-globalContrib' : 'inp-sgContrib');
    const invCurr = !adv ? inp.glob.contrib : (useGlobal ? inp.glob.contrib : inp.sg.contrib);
    const invCcyPrefix = (adv && useGlobal && inp.glob.isUSD) ? 'US$' : '$';
    const invBucket = !adv ? '' : (useGlobal ? ' (Global Investments)' : ' (Singapore Investments)');
    const retId = adv ? 'inp-globalRet' : 'inp-invRet';
    const retCcy = adv ? ` (${inp.glob.ccy})` : '';
    const retCap = (adv && inp.glob.isUSD) ? 8.5 : 8.0;
    const currRet = inp.glob.ret * 100;

    let html = "<div style='margin-bottom: 1rem; font-size: 0.85rem; color: #475569;'><em>Click a suggestion to apply it, or <strong>Compare</strong> to preview it on the chart first. You can combine several tweaks.</em></div>";

    if (isSolvent) {
        if (note) note.style.display = 'none';
        if (title) { title.innerText = '💡 Optimization Opportunities'; title.style.color = '#047857'; }
        const nextAge = inp.retireAge - 1;
        if (nextAge > inp.currentAge) {
            html += coachCard('safe', 'inp-retireAge', nextAge, `🎉 <strong>Claim Freedom Earlier:</strong> Pull your financial freedom age forward by 1 year to Age ${nextAge}`, '-1 Year ➔', `Stop working at ${nextAge}`);
        }
        const nextExp = Math.round((inp.expenses * 1.05) / 50) * 50;
        html += coachCard('safe', 'inp-expenses', nextExp, `🍷 <strong>Upgrade Lifestyle:</strong> Increase your target monthly retirement household living expenses by 5% to ${money(nextExp)}/mo`, '+5% ➔', `Spend ${money(nextExp)}/mo`);
        if (currRet > 3.0) {
            const nextRet = round2(currRet - 0.5);
            html += coachCard('safe', retId, nextRet, `🛡️ <strong>De-Risk Portfolio:</strong> Increase your margin of safety by lowering expected returns${retCcy} to ${nextRet}%`, '-0.5% ➔', `Return ${nextRet}%`);
        }
    } else {
        if (note) note.style.display = 'block';
        if (title) { title.innerText = '🔧 How to achieve Financial Independence'; title.style.color = '#1e3a8a'; }
        const nextInv = invCurr < 500 ? 500 : Math.round((invCurr * 1.1) / 50) * 50;
        html += coachCard('danger', invId, nextInv, `📈 <strong>Supercharge Investments:</strong> Increase monthly investments${invBucket} to ${invCcyPrefix}${fmt(nextInv)}/mo`, '+10% ➔', `Invest ${invCcyPrefix}${fmt(nextInv)}/mo`);
        const currCash = inp.cash.contrib;
        const nextCash = currCash < 500 ? 500 : Math.round((currCash * 1.1) / 50) * 50;
        html += coachCard('danger', 'inp-cashContrib', nextCash, `🏦 <strong>Build Cash Buffer:</strong> Increase monthly cash savings to ${money(nextCash)}/mo`, '+10% ➔', `Save ${money(nextCash)}/mo cash`);
        const nextExp = Math.round((inp.expenses * 0.95) / 50) * 50;
        html += coachCard('danger', 'inp-expenses', nextExp, `📉 <strong>Trim the Fat:</strong> Reduce target monthly retirement household living expenses by 5% to ${money(nextExp)}/mo`, '-5% ➔', `Spend ${money(nextExp)}/mo`);
        if (currRet < retCap) {
            const nextRet = round2(currRet + 0.5);
            html += coachCard('danger', retId, nextRet, `🚀 <strong>Optimize Yields:</strong> Change your mix of investments to yield a 0.5% higher return${retCcy} (Target: ${nextRet}%)`, '+0.5% ➔', `Return ${nextRet}%`);
        }
        const nextAge = inp.retireAge + 1;
        html += coachCard('danger', 'inp-retireAge', nextAge, `⏳ <strong>Extend Horizon:</strong> Delay financial freedom by 1 year to Age ${nextAge}`, '+1 Year ➔', `Stop working at ${nextAge}`);
    }
    optsDiv.innerHTML = html;
};

window.applyTweak = function (id, val) {
    setVal(id, val);
    const chartSec = document.getElementById('chart-section');
    if (chartSec && chartSec.classList.contains('wizard-lock')) {
        chartSec.classList.remove('wizard-lock');
        chartSec.classList.add('wizard-unlock');
    }
    scenarios = [];
    runSimNow();
    scrollToResult();
};

// -----------------------------------------------------------------------------
// R3: Tooltips — one floating bubble, kept inside the window.
// Desktop: shows on hover. Touch / click: toggles. Small screens: bottom sheet.
// The inline .tooltip-text elements remain in the HTML as the content source.
// -----------------------------------------------------------------------------
let ttFloat = null, ttOwner = null, ttPinned = false;

function ttEnsure() {
    if (ttFloat) return ttFloat;
    ttFloat = document.createElement('div');
    ttFloat.id = 'tt-float';
    ttFloat.setAttribute('role', 'tooltip');
    document.body.appendChild(ttFloat);
    ttFloat.addEventListener('click', e => {
        if (e.target.classList.contains('tt-close')) hideTooltip(true);
    });
    return ttFloat;
}

function showTooltip(container, pinned) {
    const src = container.querySelector('.tooltip-text');
    const icon = container.querySelector('.info-icon') || container;
    if (!src) return;
    const tt = ttEnsure();
    tt.innerHTML = '<button type="button" class="tt-close" aria-label="Close">×</button>' + src.innerHTML;
    ttOwner = container;
    ttPinned = !!pinned;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    if (vw <= 640) {
        tt.className = 'visible sheet';
        tt.style.left = ''; tt.style.top = '';
        return;
    }
    tt.className = 'visible';
    const r = icon.getBoundingClientRect();
    const w = tt.offsetWidth, h = tt.offsetHeight, m = 8;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(m, Math.min(left, vw - w - m));
    let top = r.top - h - m;                       // prefer above the icon
    if (top < m) top = Math.min(r.bottom + m, vh - h - m); // otherwise below
    tt.style.left = left + 'px';
    tt.style.top = Math.max(m, top) + 'px';
}

function hideTooltip(force) {
    if (!ttFloat) return;
    if (ttPinned && !force) return;
    ttFloat.className = '';
    ttOwner = null;
    ttPinned = false;
}

function initTooltips() {
    const canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    if (canHover) {
        document.addEventListener('mouseover', e => {
            const c = e.target.closest && e.target.closest('.tooltip-container');
            if (c && c !== ttOwner && !ttPinned) showTooltip(c, false);
        });
        document.addEventListener('mouseout', e => {
            const c = e.target.closest && e.target.closest('.tooltip-container');
            if (c && !c.contains(e.relatedTarget)) hideTooltip(false);
        });
    }
    // Click / tap: pin open (and stop the click toggling a checkbox inside the same label)
    document.addEventListener('click', e => {
        const c = e.target.closest && e.target.closest('.tooltip-container');
        if (c) {
            e.preventDefault();
            e.stopPropagation();
            if (ttOwner === c && ttPinned) hideTooltip(true);
            else showTooltip(c, true);
            return;
        }
        if (ttFloat && !ttFloat.contains(e.target)) hideTooltip(true);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTooltip(true); });
    window.addEventListener('scroll', () => { if (!ttPinned) hideTooltip(false); else if (ttOwner && document.documentElement.clientWidth > 640) showTooltip(ttOwner, true); }, { passive: true });
    window.addEventListener('resize', () => hideTooltip(true));
}

// -----------------------------------------------------------------------------
// Initialisation
// -----------------------------------------------------------------------------
function initApp() {
    initTooltips();
    // Thousands separators on all money fields, including rows added later (R7)
    document.addEventListener('focusin', e => {
        const t = e.target;
        if (t && t.classList && t.classList.contains('num-format')) t.value = t.value.replace(/,/g, '');
    });
    document.addEventListener('focusout', e => {
        const t = e.target;
        if (!(t && t.classList && t.classList.contains('num-format'))) return;
        const s = String(t.value).replace(/,/g, '').trim();
        const n = parseFloat(s);
        if (s !== '' && Number.isFinite(n)) t.value = fmt(Math.round(n));
        runSim();
    });

    // R25: remember which assumptions the user edits (typing or choosing)
    const markTouched = e => { if (e.isTrusted && e.target && ASSUMPTION_FIELDS.includes(e.target.id)) touchedAssumptions.add(e.target.id); };
    document.addEventListener('input', markTouched, true);
    document.addEventListener('change', markTouched, true);

    // R28 / R20: footer details
    updateDOM('app-version', APP_VERSION);
    updateDOM('figures-as-of', FIGURES_AS_OF);

    let loaded = false;
    try {
        let saved = localStorage.getItem(STORAGE_KEY);
        // R25: the first time the beta page opens, start from a copy of the live plan
        if (!saved && IS_BETA) saved = localStorage.getItem(MAIN_STORAGE_KEY);
        if (saved) {
            loadState(JSON.parse(saved));
            loaded = true;
            // R23: reopen in Advanced only if it was last used AND something Advanced-only was changed
            if (getMode() === 'advanced' && !advancedInUse()) {
                onEnterSimple(true);
                applyModeClass('simple');
                syncPanels();
            }
        }
        else {
            for (const k of LEGACY_STORAGE_KEYS) {
                const legacy = localStorage.getItem(k);
                if (legacy) { applyFieldDefaults(); loadState(JSON.parse(legacy)); loaded = true; break; }
            }
            LEGACY_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
        }
    } catch (e) {}

    if (!loaded) {
        applyFieldDefaults();
        applyModeClass('simple');
        setGlobalCcyState('SGD');
        syncPanels();
    }
    isLoading = false;
    runSim();

    // R29: open a plan from a share link, then tidy the address bar
    const fromLink = readPlanFromLink();
    if (fromLink) {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
        if (fromLink === 'bad') window.alert("This share link couldn't be read. It may have been cut off when it was copied.");
        else if (window.confirm('Open the plan from this link? It will replace the inputs saved in this browser.')) applyLoadedPlan(fromLink, 'The shared plan was', true);
    }
}

if (typeof document !== 'undefined') {
    initApp();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { simulatePath, calcPmt, buildFinishLine, earliestFreedomAge, requiredCapitalAt, computeSwr, cpfTargets, DEFAULTS };
}