/* =============================================================================
   Financial Independence Simulator for Singapore — engine.js
   Version: V6 staging, Batch 3 
   
   Batch 3 scope (roadmap R1–R6): 
   - R1 Finish Line checkbox moved to the chart header 
   - R2 Global return note/tooltip follow the SGD/USD toggle 
   - R3 Tooltips kept inside the window; bottom sheet on small screens 
   - R4 CPF estimator fills OA and SA (2026 allocation rates); fixes above 60 
   - R5 Calculate and coaching buttons scroll to the result card - R6 CPF tooltip mentions the S$8,000 Ordinary Wage ceiling 
   -----------------------------------------------------------------------------

   -----------------------------------------------------------------------------
   Batch 2 scope (on top of Batch 1):
     - Personal inputs start blank with placeholder examples; assumptions are
       pre-filled and marked; "Required" tags; essentials gate before results
     - Personas demoted to optional, clearly labelled example plans
     - Future / Today's Dollars chart toggle (roadmap item 2)
     - Finish Line toggle moved to Advanced and renamed (roadmap item 3)
     - Label suffixes "(Today's SGD)" / "(Nominal %)" (roadmap item 1)
     - Cash buffer guardrail warnings (roadmap item 5)
     - CPF SA available in both modes; home loan toggle off by default
   Batch 1 scope:
     - Single DEFAULTS object; blank-vs-zero input handling
     - Simple mode: one SGD portfolio. Advanced mode: Global + Singapore buckets
     - Reversible Simple <-> Advanced switching
     - Global Investments currency toggle (SGD / USD) for value, contributions, return
     - Contributions grow with inflation + "real contribution growth" (Advanced)
     - CPF liquidity gate: OA + SA locked until 55, then pooled into liquid wealth
     - Day 1 chart anchor (snapshot taken before each year's compounding)
     - calcLiveMortgage() removed; mortgage readout moved into runSim()
     - en-US number formatting throughout
     - Monte Carlo, Auto-Solver and Presets archived (commented) at end of file
   ============================================================================= */

let fireChart;
let incomeStreamCount = 0;
let milestoneCount = 0;
let isLoading = true;

const APP_VERSION = "6.0-batch3";
const STORAGE_KEY = 'fireSimState_v6';
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
    mortgageShare: 50,        // % (only used when partner toggle is on)

    // CPF
    oaRate: 2.5,              // statutory floor, %
    saRate: 4.0,              // statutory floor, %
    cpfUnlockAge: 55
});

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
    'inp-mortgageShare': DEFAULTS.mortgageShare
};

// Fields reset to their default by "Clear" (assumptions). All other fields are blanked.
const ASSUMPTION_FIELDS = ['inp-expenseShare', 'inp-inflation', 'inp-realContribGrowth',
    'inp-invRet', 'inp-globalRet', 'inp-fxRate', 'inp-fxDrift', 'inp-sgRet', 'inp-cashYield', 'inp-mortgageRate', 'inp-mortgageShare'];

const PERSISTED_TOGGLES = ['toggle-expense-partner', 'toggle-mortgage', 'toggle-mortgage-partner', 'inp-maxOA', 'toggle-sa', 'inp-showFireCurve'];

// Mode-switch memory (enables reversible Simple <-> Advanced)
let modeState = {
    advInitialized: false,   // has the Advanced split ever been created?
    simpleAtSwitch: null     // Simple values written when last leaving Advanced: {start, contrib, ret}
};
let globalCcyState = DEFAULTS.globalCcy;
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
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
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
function syncPanels() {
    const show = (panelId, on) => { const p = document.getElementById(panelId); if (p) p.style.display = on ? 'block' : 'none'; };
    show('expense-partner-panel', isChecked('toggle-expense-partner'));
    show('mortgage-panel', isChecked('toggle-mortgage'));
    show('mortgage-partner-panel', isChecked('toggle-mortgage-partner'));
    show('sa-panel', isChecked('toggle-sa'));
}

function toggleMortgagePartner() { syncPanels(); }
function toggleExpensePartner() { syncPanels(); }

// -----------------------------------------------------------------------------
// Mode handling (Simple / Advanced) — reversible
// -----------------------------------------------------------------------------
function getMode() {
    if (document.body.classList.contains('advanced-mode')) return 'advanced';
    if (document.body.classList.contains('expert-mode')) return 'expert';
    return 'simple';
}

function applyModeClass(mode) {
    document.body.classList.remove('simple-mode', 'advanced-mode', 'expert-mode');
    document.body.classList.add(mode + '-mode');
    const r = document.getElementById('mode-' + mode);
    if (r) r.checked = true;
}

function setMode(mode) {
    const prev = getMode();
    if (prev === mode) return;
    if (prev === 'simple' && mode === 'advanced') onEnterAdvanced();
    if (prev === 'advanced' && mode === 'simple') onEnterSimple();
    applyModeClass(mode);
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
function onEnterSimple() {
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
    showNotice(`Combined into a single portfolio at a <strong>${round2(ret * 100)}%</strong> blended return${globalCcyState === 'USD' ? ' (USD holdings converted to SGD)' : ''}. Your separate Advanced inputs are saved and will return when you switch back.`);
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
            amt: row.querySelector('.ms-amt').value,
            age: row.querySelector('.ms-age').value
        });
    });
    return {
        version: APP_VERSION,
        last_saved: new Date().toISOString(),
        mode: getMode(),
        globalCcy: globalCcyState,
        chartView: getChartView(),
        exampleState: exampleState,
        modeState: modeState,
        fields, toggles, incomeStreams, milestones
    };
}

function loadState(state) {
    if (!state) return;
    try {
        if (state.fields) {
            // --- V6 format ---
            Object.entries(state.fields).forEach(([id, v]) => {
                const el = document.getElementById(id);
                if (el) el.value = v;
            });
            Object.entries(state.toggles || {}).forEach(([id, v]) => setChecked(id, v));
            setGlobalCcyState(state.globalCcy === 'USD' ? 'USD' : 'SGD');
            modeState = Object.assign({ advInitialized: false, simpleAtSwitch: null }, state.modeState || {});
            setChartView(state.chartView === 'future' ? 'future' : 'today');
            setExampleState(state.exampleState && PERSONAS[state.exampleState] ? state.exampleState : null);
            applyModeClass(state.mode === 'advanced' ? 'advanced' : 'simple');
            const sc = document.getElementById('income-streams-container');
            if (sc) { sc.innerHTML = ''; (state.incomeStreams || []).forEach(st => addIncomeStream(st.name, st.amt, st.start, st.end, st.fixed)); }
            const mc = document.getElementById('milestones-container');
            if (mc) { mc.innerHTML = ''; (state.milestones || []).forEach(m => addMilestone(m.name, m.amt, m.age)); }
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
            applyModeClass('simple');
        }
        syncPanels();
    } catch (e) { console.warn('loadState failed', e); }
}

function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getState())); } catch (e) {}
}

function exportPlan() {
    const state = getState();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const anchor = document.createElement('a');
    anchor.setAttribute("href", dataStr);
    anchor.setAttribute("download", "fire-plan-v" + APP_VERSION + ".json");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

function importPlan(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const state = JSON.parse(e.target.result);
            isLoading = true;
            loadState(state);
            isLoading = false;
            runSim();
        } catch (err) {
            isLoading = false;
            alert("Invalid save file.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

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
        ['toggle-expense-partner', 'toggle-mortgage', 'toggle-mortgage-partner', 'toggle-sa', 'inp-showFireCurve'].forEach(id => setChecked(id, false));
        setChecked('inp-maxOA', true);
        setGlobalCcyState('SGD');
        modeState = { advInitialized: false, simpleAtSwitch: null };
        if (getMode() === 'advanced') onEnterAdvanced();
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

// Replaces V5 calcLiveMortgage(): display only, no input gatekeeping
function updateMortgageReadout(inp) {
    const m = inp.mortgage;
    const pmt = m.has ? calcPmt(m.principal, m.rate, m.years) : 0;
    const personal = pmt * m.share;
    updateDOM('disp-monthlyMortgage', money(pmt));
    updateDOM('disp-personalMortgage', money(personal));

    const splitDisp = document.getElementById('disp-mortgage-split');
    if (!splitDisp) return;
    if (m.has && personal > 0) {
        const allowedOA = m.payWithOA ? personal : Math.min(m.customOACap, personal);
        const oaCovers = Math.min(inp.cpf.oaContrib, allowedOA);
        const cashTopup = Math.max(0, personal - oaCovers);
        splitDisp.style.display = 'block';
        splitDisp.innerHTML = `Your CPF OA covers <strong>${money(oaCovers)}</strong> of your monthly installment. You are topping up <strong>${money(cashTopup)}</strong> in cash each month (make sure this ${money(cashTopup)} is excluded from your monthly investments and cash savings).`;
    } else {
        splitDisp.style.display = 'none';
    }
}

// -----------------------------------------------------------------------------
// Custom cash flows (UI activated in a later batch — item 6)
// -----------------------------------------------------------------------------
function addIncomeStream(name = '', amount = '', start = 60, end = 100, fixed = false) {
    const c = document.getElementById('income-streams-container');
    if (!c) return;
    const id = incomeStreamCount++;
    c.insertAdjacentHTML('beforeend', `
        <div class="list-stream income-stream" id="stream-${id}">
            <input type="text" class="is-name" placeholder="Name" value="${escapeHtml(name)}">
            <input type="text" class="num-format is-amt" id="inp-str-${id}" placeholder="0" value="${escapeHtml(amount)}" onblur="runSim()">
            <input type="number" class="is-start" value="${escapeHtml(start)}" onchange="runSim()">
            <input type="number" class="is-end" value="${escapeHtml(end)}" onchange="runSim()">
            <label class="is-fixed-label"><input type="checkbox" class="is-fixed" ${fixed ? 'checked' : ''} onchange="runSim()"> Fixed amount</label>
            <button class="btn-remove" onclick="document.getElementById('stream-${id}').remove(); runSim();">X</button>
        </div>`);
}

function addMilestone(name = '', amount = '', age = 60) {
    const c = document.getElementById('milestones-container');
    if (!c) return;
    const id = milestoneCount++;
    c.insertAdjacentHTML('beforeend', `
        <div class="milestone-stream" id="milestone-${id}">
            <input type="text" class="ms-name" placeholder="Description" value="${escapeHtml(name)}">
            <input type="text" class="num-format ms-amt" id="inp-ms-${id}" placeholder="0" value="${escapeHtml(amount)}" onblur="runSim()">
            <input type="number" class="ms-age" value="${escapeHtml(age)}" onchange="runSim()">
            <button class="btn-remove" onclick="document.getElementById('milestone-${id}').remove(); runSim();">X</button>
        </div>`);
}

function readIncomeStreams() {
    const out = [];
    document.querySelectorAll('.income-stream').forEach(row => {
        const a = parseFloat(String(row.querySelector('.is-amt').value).replace(/,/g, ''));
        if (!Number.isFinite(a)) return;
        out.push({
            amt: a,
            start: parseFloat(row.querySelector('.is-start').value) || 0,
            end: parseFloat(row.querySelector('.is-end').value) || 0,
            fixed: row.querySelector('.is-fixed') ? row.querySelector('.is-fixed').checked : false
        });
    });
    return out;
}

function readMilestones() {
    const out = [];
    document.querySelectorAll('.milestone-stream').forEach(row => {
        const a = parseFloat(String(row.querySelector('.ms-amt').value).replace(/,/g, ''));
        if (!Number.isFinite(a)) return;
        out.push({ amt: a, age: parseFloat(row.querySelector('.ms-age').value) || 0 });
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
            'inp-oaStart': 25000, 'inp-oaContrib': 1100 },
        toggles: { 'toggle-expense-partner': false, 'toggle-mortgage': false, 'toggle-mortgage-partner': false, 'toggle-sa': false }
    },
    hdb_couple: {
        fields: { 'inp-currentAge': 30, 'inp-retireAge': 55, 'inp-expenses': 5000, 'inp-expenseShare': 50,
            'inp-invStart': 30000, 'inp-invContrib': 1000, 'inp-invRet': 4.5,
            'inp-cashStart': 40000, 'inp-cashContrib': 1000,
            'inp-mortgagePrincipal': 420000, 'inp-loanYrs': 23, 'inp-mortgageRate': 2.6, 'inp-mortgageShare': 50,
            'inp-oaStart': 20000, 'inp-oaContrib': 1400 },
        toggles: { 'toggle-expense-partner': true, 'toggle-mortgage': true, 'toggle-mortgage-partner': true, 'inp-maxOA': true, 'toggle-sa': false }
    },
    growing_family: {
        fields: { 'inp-currentAge': 35, 'inp-retireAge': 60, 'inp-expenses': 8500, 'inp-expenseShare': 50,
            'inp-invStart': 120000, 'inp-invContrib': 1500, 'inp-invRet': 4.5,
            'inp-cashStart': 80000, 'inp-cashContrib': 700,
            'inp-mortgagePrincipal': 1100000, 'inp-loanYrs': 24, 'inp-mortgageRate': 2.8, 'inp-mortgageShare': 50,
            'inp-oaStart': 35000, 'inp-oaContrib': 1500 },
        toggles: { 'toggle-expense-partner': true, 'toggle-mortgage': true, 'toggle-mortgage-partner': true, 'inp-maxOA': true, 'toggle-sa': false }
    },
    pragmatic_saver: {
        fields: { 'inp-currentAge': 42, 'inp-retireAge': 60, 'inp-expenses': 2800,
            'inp-invStart': 20000, 'inp-invContrib': 0, 'inp-invRet': 4.0,
            'inp-cashStart': 60000, 'inp-cashContrib': 2500,
            'inp-mortgagePrincipal': 120000, 'inp-loanYrs': 10, 'inp-mortgageRate': 2.6, 'inp-mortgageShare': 100,
            'inp-oaStart': 30000, 'inp-oaContrib': 1200,
            'inp-saStart': 140000, 'inp-saContrib': 500 },
        toggles: { 'toggle-expense-partner': false, 'toggle-mortgage': true, 'toggle-mortgage-partner': false, 'inp-maxOA': true, 'toggle-sa': true }
    },
    self_employed: {
        fields: { 'inp-currentAge': 36, 'inp-retireAge': 58, 'inp-expenses': 3200,
            'inp-invStart': 70000, 'inp-invContrib': 1000, 'inp-invRet': 5.0,
            'inp-cashStart': 75000, 'inp-cashContrib': 8000,
            'inp-mortgagePrincipal': 320000, 'inp-loanYrs': 23, 'inp-mortgageRate': 2.6, 'inp-mortgageShare': 50,
            'inp-oaStart': 30000, 'inp-oaContrib': 0 },
        toggles: { 'toggle-expense-partner': false, 'toggle-mortgage': true, 'toggle-mortgage-partner': false, 'inp-maxOA': true, 'toggle-sa': false }
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

        cpf: {
            oaStart: amt('inp-oaStart'),
            oaContrib: amt('inp-oaContrib'),
            hasSA: isChecked('toggle-sa'),
            saStart: amt('inp-saStart'),
            saContrib: amt('inp-saContrib'),
            oaRate: DEFAULTS.oaRate / 100,
            saRate: DEFAULTS.saRate / 100,
            unlockAge: DEFAULTS.cpfUnlockAge
        },

        mortgage: {
            has: isChecked('toggle-mortgage'),
            principal: amt('inp-mortgagePrincipal'),
            rate: rateOr('inp-mortgageRate', DEFAULTS.mortgageRate) / 100,
            years: amt('inp-loanYrs'),
            share: (mortgagePartner ? rateOr('inp-mortgageShare', DEFAULTS.mortgageShare) : 100) / 100,
            payWithOA: isChecked('inp-maxOA', true),
            customOACap: amt('inp-customOACap')
        },

        incomeStreams: adv ? readIncomeStreams() : [],
        milestones: adv ? readMilestones() : [],
        currentExpenses: adv ? readNum('inp-currentExpenses') : null,
        showFireCurve: adv && isChecked('inp-showFireCurve'),
        chartView: getChartView()
    };
}

// -----------------------------------------------------------------------------
// Core simulation (deterministic). All outputs in nominal SGD.
//   - Snapshot is taken at the START of each age (Day 1 anchor), before
//     milestones and the 12 months of compounding.
//   - CPF OA + SA are locked (excluded from liquid wealth, not drawable for
//     spending) until cpf.unlockAge; then they join the liquid pool and keep
//     earning their statutory rates. OA can pay the mortgage at any age.
//   - Global bucket is held in its own currency; converted at `fx`, which
//     drifts yearly in USD mode.
//   - Contributions grow yearly by (1 + inflation) x (1 + realContribGrowth).
// -----------------------------------------------------------------------------
function simulatePath(inp) {
    const g = inp.glob, s = inp.sg, c = inp.cash, cpf = inp.cpf, m = inp.mortgage;
    const currentAge = inp.currentAge, retireAge = inp.retireAge;

    let glob = g.start, sg = s.start, cash = c.start;
    let oa = cpf.oaStart, sa = cpf.hasSA ? cpf.saStart : 0;
    let fx = g.isUSD ? g.fx : 1;
    let priceIdx = 1, contribIdx = 1;
    let cpfUnlocked = currentAge >= cpf.unlockAge;

    let remPrincipal = m.has ? m.principal : 0;
    const mortgageEndAge = currentAge + (m.has ? m.years : 0);

    const path = [];
    let solvent = true, depletionAge = null, peakLiquid = 0, totalShortfall = 0;

    const liquidOf = () => cash + sg + glob * fx + (cpfUnlocked ? oa + sa : 0);
    const lockedOf = () => (cpfUnlocked ? 0 : oa + sa);
    const flagDepletion = age => { if (solvent) { solvent = false; depletionAge = age; } };

    // Proportional withdrawal across all liquid buckets. Returns any unpaid amount.
    const withdraw = amount => {
        const total = liquidOf();
        if (total <= 0) return amount;
        const take = Math.min(amount, total);
        const keep = 1 - take / total;
        cash *= keep; sg *= keep; glob *= keep;
        if (cpfUnlocked) { oa *= keep; sa *= keep; }
        return amount - take;
    };

    for (let age = currentAge; age <= 100; age++) {
        if (age > currentAge) {
            priceIdx *= (1 + inp.inflation);
            contribIdx *= (1 + inp.inflation) * (1 + inp.realContribGrowth);
            if (g.isUSD) fx *= (1 + g.fxDrift);
        }
        if (!cpfUnlocked && age >= cpf.unlockAge) cpfUnlocked = true;

        const isWorking = age < retireAge;
        const mortgageActive = m.has && age < mortgageEndAge && remPrincipal > 0.5;
        const phase = isWorking ? 1 : (mortgageActive ? 2 : 3);

        // Day 1 anchor: record before anything happens this year
        const liquidNow = liquidOf();
        path.push({ age, liquid: Math.max(0, liquidNow), locked: lockedOf(), phase });
        if (liquidNow > peakLiquid) peakLiquid = liquidNow;
        if (age === 100) break;

        // Milestones (today's SGD, inflation-indexed) at the start of the year
        inp.milestones.forEach(ms => {
            if (ms.age !== age) return;
            const v = ms.amt * priceIdx;
            if (v > 0) cash += v;
            else if (v < 0) {
                const unpaid = withdraw(-v);
                if (unpaid > 0.5) { flagDepletion(age); totalShortfall += unpaid; }
            }
        });

        const monthlyPmt = mortgageActive ? calcPmt(remPrincipal, m.rate, mortgageEndAge - age) : 0;
        const personalPmt = monthlyPmt * m.share;
        const monthlySpend = isWorking ? 0 : inp.expenses * priceIdx * (inp.expenseShare / 100);
        let monthlyIncome = 0;
        inp.incomeStreams.forEach(st => {
            if (age >= st.start && age <= st.end) monthlyIncome += st.amt * (st.fixed ? 1 : priceIdx);
        });

        for (let mo = 1; mo <= 12; mo++) {
            glob *= 1 + g.ret / 12;
            sg *= 1 + s.ret / 12;
            cash *= 1 + c.yield / 12;
            oa *= 1 + cpf.oaRate / 12;
            sa *= 1 + cpf.saRate / 12;

            if (isWorking) {
                glob += g.contrib * contribIdx;   // in the Global bucket's own currency
                sg += s.contrib * contribIdx;
                cash += c.contrib * contribIdx;
                oa += cpf.oaContrib * contribIdx;
                if (cpf.hasSA) sa += cpf.saContrib * contribIdx;
            }

            let need = monthlySpend;
            if (monthlyPmt > 0 && remPrincipal > 0) {
                const interest = remPrincipal * m.rate / 12;
                remPrincipal = Math.max(0, remPrincipal - (monthlyPmt - interest));
                const oaTarget = (isWorking && !m.payWithOA) ? Math.min(m.customOACap, personalPmt) : personalPmt;
                const fromOA = Math.min(Math.max(0, oa), oaTarget);
                oa -= fromOA;
                // While working, any cash top-up comes out of salary (excluded from the savings inputs).
                // In retirement, it is drawn from liquid wealth.
                if (!isWorking) need += personalPmt - fromOA;
            }

            const net = need - monthlyIncome;
            if (net < 0) cash += -net;
            else if (net > 0) {
                const unpaid = withdraw(net);
                if (unpaid > 0.5) { flagDepletion(age); totalShortfall += unpaid; }
            }
        }
    }

    const recoveredAfterUnlock = depletionAge !== null && depletionAge < cpf.unlockAge &&
        path.some(p => p.age >= cpf.unlockAge && p.liquid > 1);

    return { path, solvent, depletionAge, peakLiquid, totalShortfall, recoveredAfterUnlock };
}

// SGD-equivalent return of the Global bucket
function sgdReturnOfGlobal(g) { return g.isUSD ? (1 + g.ret) * (1 + g.fxDrift) - 1 : g.ret; }

// -----------------------------------------------------------------------------
// Finish line (interim V5 method — replaced by the simulation-derived
// finish line, Option C, in the SWR batch)
// -----------------------------------------------------------------------------
function buildFinishLine(inp) {
    const gSGD = inp.glob.start * (inp.glob.isUSD ? inp.glob.fx : 1);
    const parts = [
        [gSGD, sgdReturnOfGlobal(inp.glob)],
        [inp.sg.start, inp.sg.ret],
        [inp.cash.start, inp.cash.yield],
        [inp.cpf.oaStart, inp.cpf.oaRate],
        [inp.cpf.hasSA ? inp.cpf.saStart : 0, inp.cpf.saRate]
    ];
    const total = parts.reduce((a, p) => a + p[0], 0);
    const nomRet = total > 0 ? parts.reduce((a, p) => a + p[0] * p[1], 0) / total : sgdReturnOfGlobal(inp.glob);
    const realRet = (1 + nomRet) / (1 + inp.inflation) - 1;
    const duration = Math.max(1, 100 - inp.retireAge);
    const multiple = Math.abs(realRet) < 0.0001 ? duration : (1 - Math.pow(1 + realRet, -duration)) / realRet;

    const curve = [];
    let targetAtRetirement = 0;
    const m = inp.mortgage;
    const pmt = m.has ? calcPmt(m.principal, m.rate, m.years) : 0;
    for (let age = inp.currentAge; age <= 100; age++) {
        const yrs = age - inp.currentAge;
        const annualSpend = inp.expenses * Math.pow(1 + inp.inflation, yrs) * (inp.expenseShare / 100) * 12;
        let remPrincipal = 0;
        if (m.has && age < inp.currentAge + m.years) {
            const n = (inp.currentAge + m.years - age) * 12;
            const r = m.rate / 12;
            remPrincipal = r === 0 ? pmt * n : (pmt / r) * (1 - Math.pow(1 + r, -n));
        }
        const target = annualSpend * multiple + remPrincipal * m.share;
        if (age === inp.retireAge) targetAtRetirement = target;
        curve.push(target);
    }
    return { curve, targetAtRetirement, multiple, realRet, duration };
}

// -----------------------------------------------------------------------------
// Input warnings (multiple conditions per field; first match wins)
// -----------------------------------------------------------------------------
const WARN_TEXT = {
    globalUSD: 'Aggressive. Developed-market equities returned about 8.5% a year in USD from 1900 to 2025, and MSCI World about 6.2% a year in SGD since 2001. The past 10 years (~13%) were exceptional. US stocks alone averaged about 10% since 1928. This input is nominal; the engine adjusts for inflation.',
    globalSGD: 'Aggressive. MSCI World returned about 6.2% a year in SGD since 2001, and developed-market equities about 8.5% a year in USD since 1900. The past 10 years (~13% in USD) were exceptional. This input is nominal; the engine adjusts for inflation.',
    sg: 'Aggressive. The STI returned about 8.4% a year from 2002 to mid-2026, boosted by strong 2024–25 gains, and about 6.4% a year from 2010 to 2025.',
    inflationLow: "Note: Highly optimistic. Singapore's average headline inflation was 1.72% over the last 10 years, 2.14% over the last 20 years, and 1.68% over the past 30 years.",
    cashHigh: 'Note: Most bank savings accounts that offer high yields cap the maximum balance that earns this interest rate.',
    cashLow: 'Note: You should consider switching from a basic savings account to a high-yield savings account to protect your cash from inflation.',
    mortHigh: 'Note: This is unusually high for Singapore. HDB concessionary loans are fixed at 2.6%. Bank loans are pegged to SORA, which peaked above 3.7% in 2023; packages in 2026 are around 1.4%–1.9%.',
    mortLow: 'Note: This is highly optimistic. Bank rates in Singapore rarely drop below about 1.35%, and the HDB rate sits at 2.6%.',
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
    setWarn('inp-mortgageRate', [[gt('inp-mortgageRate', 4.5), WARN_TEXT.mortHigh], [lt('inp-mortgageRate', 1.3) && v('inp-mortgageRate') > 0, WARN_TEXT.mortLow]]);
    setWarn('inp-retireAge', [[lt('inp-retireAge', 40) && v('inp-retireAge') > 0, WARN_TEXT.retireEarly]]);

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

function getChartView() {
    const r = document.querySelector('input[name="chartView"]:checked');
    return r ? r.value : 'today';
}
function setChartView(v) {
    document.querySelectorAll('input[name="chartView"]').forEach(r => { r.checked = (r.value === v); });
}

function runSim() {
    if (isLoading) return;

    const inp = collectInputs();
    checkInputWarnings(inp);
    updateMortgageReadout(inp);

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
        const panel = document.getElementById('coaching-panel'); if (panel) panel.style.display = 'none';
        renderChart([], [], null);
        saveState();
        return;
    }

    const res = simulatePath(inp);
    const fl = buildFinishLine(inp);
    const labels = res.path.map(p => p.age);

    // Today's Dollars: divide each point by cumulative inflation since today (roadmap item 2)
    const today = inp.chartView === 'today';
    const defl = i => today ? Math.pow(1 + inp.inflation, i) : 1;
    const adj = (val, i) => (val === null || val === undefined) ? null : val / defl(i);

    // Phase-segmented liquid wealth lines
    const p1 = [], p2 = [], p3 = [];
    res.path.forEach((pt, i) => {
        const val = adj(pt.liquid, i);
        p1.push(pt.phase === 1 ? val : null);
        p2.push(pt.phase === 2 ? val : null);
        p3.push(pt.phase === 3 ? val : null);
        if (i > 0) {
            const prev = res.path[i - 1].phase;
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

    // Locked CPF (separate dashed line until unlock)
    const lockedData = res.path.map((p, i) => (p.locked > 0 ? adj(p.locked, i) : null));
    const hasLocked = lockedData.some(v => v !== null);
    if (hasLocked) {
        datasets.push({ label: 'CPF (locked until 55)', data: lockedData, borderColor: '#64748b', borderDash: [6, 4], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 2, pointStyle: 'line' });
    }
    if (inp.showFireCurve) {
        datasets.push({ label: 'Financial Freedom Target (The Finish Line)', data: fl.curve.map(adj), borderColor: '#ef4444', borderDash: [2, 4], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5, pointStyle: 'line' });
    }

    // Status card
    if (res.solvent) {
        const finalBal = res.path[res.path.length - 1].liquid;
        const pvBal = finalBal / Math.pow(1 + inp.inflation, 100 - inp.currentAge);
        setStatus('success', '✅ Financial Independence Secured to Age 100',
            `Est. remaining wealth at 100: ${moneyM(finalBal)} (worth ~${moneyM(pvBal)} in today's dollars)`);
    } else if (res.recoveredAfterUnlock) {
        const gap = DEFAULTS.cpfUnlockAge - res.depletionAge;
        setStatus('danger', '⚠️ Adjustments Needed',
            `Your cash and investments run out at age ${res.depletionAge}, ${gap} year${gap === 1 ? '' : 's'} before your CPF unlocks at 55. You need enough outside CPF to bridge that gap.`);
    } else if (res.depletionAge >= 90) {
        setStatus('warning', '🐢 Almost There', `Funds deplete at age ${res.depletionAge}. A small tweak will get you to 100.`);
    } else {
        setStatus('danger', '⚠️ Adjustments Needed', `Funds deplete at age ${res.depletionAge}. Try investing a bit more or delaying financial freedom.`);
    }

    // Simple mode: disclose hidden assumptions under the result
    if (assumptionsLine) {
        if (inp.mode === 'simple') {
            assumptionsLine.innerText = `Assumes ${DEFAULTS.inflation}% inflation, ${DEFAULTS.cashYield}% cash yield and CPF floor rates (OA ${DEFAULTS.oaRate}%, SA ${DEFAULTS.saRate}%). Change these in Advanced.`;
            assumptionsLine.style.display = 'block';
        } else {
            assumptionsLine.style.display = 'none';
        }
    }

    // Coaching is switched off while an example plan is showing
    if (exampleState) {
        const panel = document.getElementById('coaching-panel'); if (panel) panel.style.display = 'none';
    } else {
        generateCoaching(inp, res.solvent);
    }
    renderChart(labels, datasets, inp, hasLocked);
    saveState();
}

// -----------------------------------------------------------------------------
// Chart
// -----------------------------------------------------------------------------
function renderChart(labels, datasets, inp, hasLocked = false) {
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
        if (hasLocked && inp.currentAge < DEFAULTS.cpfUnlockAge) {
            ann.lineCPF = {
                type: 'line', xMin: idx(DEFAULTS.cpfUnlockAge), xMax: idx(DEFAULTS.cpfUnlockAge),
                borderColor: 'rgba(100, 116, 139, 0.4)', borderWidth: 1,
                label: { display: true, content: '🔓 CPF unlocks', position: 'end', backgroundColor: 'transparent', color: '#475569', font: { size: 12 } }
            };
        }
        if (inp.mortgage.has && inp.mortgage.years > 0) {
            const endAge = inp.currentAge + inp.mortgage.years;
            if (endAge <= 100) {
                ann.lineMortgage = {
                    type: 'line', xMin: idx(endAge), xMax: idx(endAge),
                    borderColor: 'rgba(245, 158, 11, 0.3)', borderWidth: 1,
                    label: { display: true, content: '🏠 Mortgage Free', position: 'end', backgroundColor: 'transparent', color: '#f59e0b', font: { size: 12 }, yAdjust: 20 }
                };
            }
        }
        (inp.milestones || []).forEach((ms, i) => {
            if (ms.age >= inp.currentAge && ms.age <= 100) {
                ann['milestone_' + i] = {
                    type: 'line', xMin: idx(ms.age), xMax: idx(ms.age),
                    borderColor: 'rgba(100, 116, 139, 0.3)', borderWidth: 1, borderDash: [2, 2],
                    label: { display: true, content: ms.amt < 0 ? '✈️' : '💰', position: 'end', backgroundColor: 'transparent', font: { size: 14 }, yAdjust: 40 + i * 15 }
                };
            }
        });
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

function applyOAEstimate() {
    const est = runOAEstimate();
    if (!est) return;
    setVal('inp-oaContrib', est.oa);
    if (est.sa > 0) {
        setChecked('toggle-sa', true);
        syncPanels();
        setVal('inp-saContrib', est.sa);
    }
    toggleOACalc();
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
    runSim();
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
function coachCard(cls, id, val, text, pill) {
    return `<div class="coach-card ${cls}" onclick="applyTweak('${id}', ${val})">
                <div class="coach-text">${text}</div>
                <div class="coach-btn-pill">${pill}</div>
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

    let html = "<div style='margin-bottom: 1rem; font-size: 0.85rem; color: #475569;'><em>Click any button below to update your inputs. You can combine multiple tweaks to reach your goal.</em></div>";

    if (isSolvent) {
        if (note) note.style.display = 'none';
        if (title) { title.innerText = '💡 Optimization Opportunities'; title.style.color = '#047857'; }
        const nextAge = inp.retireAge - 1;
        if (nextAge > inp.currentAge) {
            html += coachCard('safe', 'inp-retireAge', nextAge, `🎉 <strong>Claim Freedom Earlier:</strong> Pull your financial freedom age forward by 1 year to Age ${nextAge}`, '-1 Year ➔');
        }
        const nextExp = Math.round((inp.expenses * 1.05) / 50) * 50;
        html += coachCard('safe', 'inp-expenses', nextExp, `🍷 <strong>Upgrade Lifestyle:</strong> Increase your target monthly retirement household living expenses by 5% to ${money(nextExp)}/mo`, '+5% ➔');
        if (currRet > 3.0) {
            const nextRet = round2(currRet - 0.5);
            html += coachCard('safe', retId, nextRet, `🛡️ <strong>De-Risk Portfolio:</strong> Increase your margin of safety by lowering expected returns${retCcy} to ${nextRet}%`, '-0.5% ➔');
        }
    } else {
        if (note) note.style.display = 'block';
        if (title) { title.innerText = '🔧 How to achieve Financial Independence'; title.style.color = '#1e3a8a'; }
        const nextInv = invCurr < 500 ? 500 : Math.round((invCurr * 1.1) / 50) * 50;
        html += coachCard('danger', invId, nextInv, `📈 <strong>Supercharge Investments:</strong> Increase monthly investments${invBucket} to ${invCcyPrefix}${fmt(nextInv)}/mo`, '+10% ➔');
        const currCash = inp.cash.contrib;
        const nextCash = currCash < 500 ? 500 : Math.round((currCash * 1.1) / 50) * 50;
        html += coachCard('danger', 'inp-cashContrib', nextCash, `🏦 <strong>Build Cash Buffer:</strong> Increase monthly cash savings to ${money(nextCash)}/mo`, '+10% ➔');
        const nextExp = Math.round((inp.expenses * 0.95) / 50) * 50;
        html += coachCard('danger', 'inp-expenses', nextExp, `📉 <strong>Trim the Fat:</strong> Reduce target monthly retirement household living expenses by 5% to ${money(nextExp)}/mo`, '-5% ➔');
        if (currRet < retCap) {
            const nextRet = round2(currRet + 0.5);
            html += coachCard('danger', retId, nextRet, `🚀 <strong>Optimize Yields:</strong> Change your mix of investments to yield a 0.5% higher return${retCcy} (Target: ${nextRet}%)`, '+0.5% ➔');
        }
        const nextAge = inp.retireAge + 1;
        html += coachCard('danger', 'inp-retireAge', nextAge, `⏳ <strong>Extend Horizon:</strong> Delay financial freedom by 1 year to Age ${nextAge}`, '+1 Year ➔');
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
    runSim();
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
    document.querySelectorAll('.num-format').forEach(el => {
        el.addEventListener('blur', function () {
            const n = readNum(this.id);
            if (n !== null) setVal(this.id, n, false);
            runSim();
        });
        el.addEventListener('focus', function () { this.value = this.value.replace(/,/g, ''); });
    });

    let loaded = false;
    try {
        const v6 = localStorage.getItem(STORAGE_KEY);
        if (v6) { loadState(JSON.parse(v6)); loaded = true; }
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
}

if (typeof document !== 'undefined') {
    initApp();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { simulatePath, calcPmt, buildFinishLine, DEFAULTS };
}


/* =============================================================================
   EXPERT MODE ARCHIVE — Monte Carlo (INACTIVE)
   -----------------------------------------------------------------------------
   Retained from V5 for reference when Expert mode is built. Nothing below runs.
   Re-integration notes:
     1. Inputs needed (no HTML exists yet): inp-inflVol, inp-usdVol (Global),
        inp-sgdVol (Singapore), inp-fxVol (USD mode only), inp-mortgageVol,
        inp-mcRuns, inp-mcToggle, inp-blackSwan (fat-tailed t-distribution).
     2. simulatePath(): at the top of each year, perturb the annual rates as in
        the "Per-year perturbation" block, then use the perturbed values in place
        of inp.inflation / g.ret / s.ret / g.fxDrift / m.rate for that year.
        fxVol applies only when the Global bucket is in USD.
     3. runSim(): if Expert + MC enabled, replace the single deterministic run with
        the "MC branch" below (percentile bands + success rate status).
     4. Monte Carlo uses the path[].liquid values from the V6 simulatePath().

   ---- Random number generators ----
   function randn_bm() {
       let u = 0, v = 0;
       while (u === 0) u = Math.random();
       while (v === 0) v = Math.random();
       return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
   }
   function rand_t5_scaled() {
       let z = randn_bm();
       let v = Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2);
       let t = z / Math.sqrt(v / 5);
       return t * Math.sqrt(3 / 5);   // scale Student-t(5) to unit variance
   }
   function getRand(isBlackSwan) { return isBlackSwan ? rand_t5_scaled() : randn_bm(); }

   ---- Per-year perturbation (V5 simulatePath, top of the yearly loop) ----
   let actualInfl = inflation, actualUsdRet = usdRet, actualSgdRet = sgdRet,
       actualFxDrift = fxDrift, actualMortgageRate = mortgageRate;
   if (isMonteCarlo) {
       actualInfl = inflation + (getRand(isBlackSwan) * inflVol);
       actualUsdRet = usdRet + (getRand(isBlackSwan) * usdVol);
       actualSgdRet = sgdRet + (getRand(isBlackSwan) * sgdVol);
       actualFxDrift = fxDrift + (getRand(isBlackSwan) * fxVol);
       actualMortgageRate = Math.max(0, mortgageRate + (getRand(isBlackSwan) * mortgageVol));
   }

   ---- MC branch (V5 runSim) ----
   let runs = getVal('inp-mcRuns') || 100;
   let results = [], successes = 0, medianPeak = 0;
   for (let i = 0; i < runs; i++) {
       let res = simulatePath(inputs, true);
       results.push(res.pathData.map(d => d.val));       // V6: res.path.map(d => d.liquid)
       if (res.solvent) successes++;
       medianPeak += res.peakNW;                          // V6: res.peakLiquid
   }
   medianPeak = medianPeak / runs;
   let p10 = [], p50 = [], p90 = [];
   for (let y = 0; y < labels.length; y++) {
       let yearVals = results.map(r => r[y]).sort((a, b) => a - b);
       p10.push(yearVals[Math.floor(runs * 0.1)]);
       p50.push(yearVals[Math.floor(runs * 0.5)]);
       p90.push(yearVals[Math.floor(runs * 0.9)]);
   }
   datasets = [
       { label: '90th Percentile (Optimistic)', data: p90, borderColor: '#10b981', borderDash: [5,5], fill: false, tension: 0.2, pointRadius: 0, pointStyle: 'line' },
       { label: 'Median Outcome', data: p50, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.2, borderWidth: 3, pointStyle: 'rect' },
       { label: '10th Percentile (Pessimistic)', data: p10, borderColor: '#f59e0b', borderDash: [5,5], fill: '-1', backgroundColor: 'rgba(245, 158, 11, 0.05)', tension: 0.2, pointRadius: 0, pointStyle: 'line' }
   ];
   // (Finish-line dataset appended here when enabled, as in deterministic mode.)
   let winRate = ((successes / runs) * 100).toFixed(1);
   // Status: >= 90% success (success), >= 70% (warning), else (danger);
   // status-main: `${icon} ${winRate}% Success`, status-sub: `${runs} Monte Carlo sims`.

   ---- Persisted state fields (V5) ----
   inflVol, usdVol, sgdVol, fxVol, mortgageVol, mcRuns, isMC, isBlackSwan
   ============================================================================= */


/* =============================================================================
   ARCHIVE — V5 Auto-Solver (INACTIVE; superseded by the Coaching Engine)
   -----------------------------------------------------------------------------
   Brute-force search for a single input change that makes the plan solvent.
   Could be revived to power "one-click fix" coaching cards. Needs updating to
   V6 input structure (inp.glob.contrib, inp.retireAge, inp.expenses).

   function runAutoSolver() {
       let baseInputs = getState().inputs;
       let resultsDiv = document.getElementById('autosolver-results');
       if (!resultsDiv) return;
       resultsDiv.style.display = 'block';
       resultsDiv.innerHTML = '<div style="font-size:0.85rem; color:#d97706;">Calculating solutions...</div>';
       setTimeout(() => {
           let options = [];
           // 1. Increase monthly contributions in steps of 100 until solvent
           let test1 = JSON.parse(JSON.stringify(baseInputs));
           let originalContrib = test1.usdContrib;
           for (let c = originalContrib + 100; c <= 20000; c += 100) {
               test1.usdContrib = c;
               if (simulatePath(test1, false).solvent) {
                   options.push({ text: `📈 Invest an extra $${(c - originalContrib).toLocaleString('en-US')}/mo globally`, action: () => { setVal('inp-usdContrib', c); runSim(); } });
                   break;
               }
           }
           // 2. Delay retirement age one year at a time until solvent (max 80)
           let test2 = JSON.parse(JSON.stringify(baseInputs));
           let originalRet = test2.retireAge;
           for (let a = originalRet + 1; a <= 80; a += 1) {
               test2.retireAge = a;
               if (simulatePath(test2, false).solvent) {
                   options.push({ text: `⏳ Delay retirement by ${a - originalRet} years (Retire at ${a})`, action: () => { setVal('inp-retireAge', a); runSim(); } });
                   break;
               }
           }
           // 3. Cut expenses in steps of 100 until solvent (min 500)
           let test3 = JSON.parse(JSON.stringify(baseInputs));
           let originalExp = test3.expenses;
           for (let e = originalExp - 100; e >= 500; e -= 100) {
               test3.expenses = e;
               if (simulatePath(test3, false).solvent) {
                   options.push({ text: `📉 Cut target household spending by $${(originalExp - e).toLocaleString('en-US')}/mo`, action: () => { setVal('inp-expenses', e); runSim(); } });
                   break;
               }
           }
           // Render options as clickable rows (window['solveOption' + i] = opt.action)
       }, 50);
   }
   ============================================================================= */


/* =============================================================================
   ARCHIVE — V5 Return Presets (INACTIVE)
   -----------------------------------------------------------------------------
   One-click assumption sets. Candidate for Advanced mode. Values are V5's and
   should be re-based on the V6 defaults review before reuse.

   function applyPreset(type) {
       let msg = "";
       if (type === 'highly-conservative') {
           setVal('inp-usdRet', 5.0); setVal('inp-sgdRet', 2.5); setVal('inp-inflation', 3.5);
           msg = "Applied Highly Conservative: Global 5.0%, SG 2.5%, Inflation 3.5%";
       } else if (type === 'somewhat-conservative') {
           setVal('inp-usdRet', 6.0); setVal('inp-sgdRet', 3.5); setVal('inp-inflation', 3.0);
           msg = "Applied Somewhat Conservative: Global 6.0%, SG 3.5%, Inflation 3.0%";
       } else if (type === 'balanced') {
           setVal('inp-usdRet', 7.0); setVal('inp-sgdRet', 5.0); setVal('inp-inflation', 2.5);
           msg = "Applied Balanced: Global 7.0%, SG 5.0%, Inflation 2.5%";
       }
       // Displayed in #preset-banner / #preset-banner-text, then runSim().
   }
   ============================================================================= */
