let fireChart;
let incomeStreamCount = 0;
let milestoneCount = 0;
let isLoading = true;
const APP_VERSION = "6.0";

// --- Formatter & UI ---
function getVal(id) {
    let el = document.getElementById(id);
    if (!el) return 0;
    return parseFloat(el.value.replace(/,/g, '')) || 0;
}

function setVal(id, val) {
    let el = document.getElementById(id);
    if (!el) return;
    if (val === '') { el.value = ''; return; }
    if (Math.abs(val) >= 1000 || el.placeholder === "0" || el.id.includes("Start") || el.id.includes("Contrib") || el.id.includes("Principal") || el.id.includes("expenses") || el.id.includes("mortgageSimple")) {
        el.value = Math.round(val).toLocaleString('en-US');
    } else {
        el.value = val;
    }
    el.classList.remove('highlight-pulse');
    void el.offsetWidth;
    el.classList.add('highlight-pulse');
}

document.querySelectorAll('.num-format').forEach(el => {
    el.addEventListener('blur', function() {
        if(this.value === '') { runSim(); return; }
        let val = parseFloat(this.value.replace(/,/g, ''));
        if(!isNaN(val)) setVal(this.id, val);
        runSim();
    });
    el.addEventListener('focus', function() {
        this.value = this.value.replace(/,/g, '');
    });
});

function updateDOM(id, val, isHTML=false) {
    let el = document.getElementById(id);
    if (el) {
        if (isHTML) el.innerHTML = val;
        else el.innerText = val;
    }
}

// --- State Management ---
function getState() {
    try {
        let inputs = {
            mode: document.querySelector('input[name="mode"]:checked') ? document.querySelector('input[name="mode"]:checked').value : 'simple',
            pvToggle: document.querySelector('input[name="pvToggle"]:checked') ? document.querySelector('input[name="pvToggle"]:checked').value : 'fv',
            currentAge: getVal('inp-currentAge'),
            retireAge: getVal('inp-retireAge'),
            inflation: getVal('inp-inflation'),
            fx: getVal('inp-fx'),
            usdStart: getVal('inp-invStart'),
            usdContrib: getVal('inp-invContrib'),
            usdRet: getVal('inp-invRet'),
            hasSG: document.getElementById('toggle-sg') ? document.getElementById('toggle-sg').checked : false,
            sgdStart: getVal('inp-sgdStart'),
            sgdContrib: getVal('inp-sgdContrib'),
            sgdRet: getVal('inp-sgdRet'),
            cashStart: getVal('inp-cashStart'),
            cashContrib: getVal('inp-cashContrib'),
            cashYield: getVal('inp-cashYield'),
            hasSA: document.getElementById('toggle-sa') ? document.getElementById('toggle-sa').checked : false,
            saStart: getVal('inp-saStart'),
            saContrib: getVal('inp-saContrib'),
            hasMortgage: document.getElementById('toggle-mortgage') ? document.getElementById('toggle-mortgage').checked : false,
            hasMortgagePartner: document.getElementById('toggle-mortgage-partner') ? document.getElementById('toggle-mortgage-partner').checked : false,
            mortgagePrincipal: getVal('inp-mortgagePrincipal'),
            loanYrs: getVal('inp-loanYrs'),
            mortgageRate: getVal('inp-mortgageRate'),
            mortgageShare: getVal('inp-mortgageShare'),
            isMaxOA: document.getElementById('inp-maxOA') ? document.getElementById('inp-maxOA').checked : true,
            oaStart: getVal('inp-oaStart'),
            oaContrib: getVal('inp-oaContrib'),
            hasExpensePartner: document.getElementById('toggle-expense-partner') ? document.getElementById('toggle-expense-partner').checked : false,
            expenses: getVal('inp-expenses'),
            expenseShare: getVal('inp-expenseShare'),
            showFireCurve: document.getElementById('inp-showFireCurve') ? document.getElementById('inp-showFireCurve').checked : false,
            swrOverride: document.getElementById('inp-swrOverride') ? document.getElementById('inp-swrOverride').checked : false,
            swrCustom: getVal('inp-swrCustom'),
            incomeStreams: [], milestones: []
        };
        document.querySelectorAll('.income-stream').forEach(row => {
            inputs.incomeStreams.push({
                name: row.querySelector('.is-name').value,
                amt: getVal(row.querySelector('.is-amt').id) || parseFloat(row.querySelector('.is-amt').value.replace(/,/g, '')) || 0,
                start: parseFloat(row.querySelector('.is-start').value) || 0,
                end: parseFloat(row.querySelector('.is-end').value) || 0
            });
        });
        document.querySelectorAll('.milestone-stream').forEach(row => {
            inputs.milestones.push({
                name: row.querySelector('.ms-name').value,
                amt: getVal(row.querySelector('.ms-amt').id) || parseFloat(row.querySelector('.ms-amt').value.replace(/,/g, '')) || 0,
                age: parseFloat(row.querySelector('.ms-age').value) || 0
            });
        });
        return { version: APP_VERSION, last_saved: new Date().toISOString(), inputs: inputs };
    } catch(e) { return { inputs: {} }; }
}

function loadState(state) {
    if (!state || !state.inputs) return;
    try {
        let p = state.inputs;
        if (p.mode) {
            let r = document.querySelector(`input[name="mode"][value="${p.mode}"]`);
            if (r) { r.checked = true; setMode(p.mode); }
        }
        if (p.pvToggle) {
            let pv = document.querySelector(`input[name="pvToggle"][value="${p.pvToggle}"]`);
            if (pv) pv.checked = true;
        }
        const fields = ['currentAge', 'retireAge', 'inflation', 'fx', 'usdStart', 'usdContrib', 'usdRet', 'sgdStart', 'sgdContrib', 'sgdRet', 'cashStart', 'cashContrib', 'cashYield', 'saStart', 'saContrib', 'mortgagePrincipal', 'loanYrs', 'mortgageRate', 'mortgageShare', 'oaContrib', 'oaStart', 'expenses', 'expenseShare', 'swrCustom'];
        fields.forEach(f => { if (p[f] !== undefined) setVal('inp-' + f, p[f]); });

        const toggles = ['sg', 'sa', 'mortgage'];
        toggles.forEach(t => {
            let el = document.getElementById('toggle-' + t);
            let key = 'has' + (t === 'sg' ? 'SG' : t === 'sa' ? 'SA' : 'Mortgage');
            if (p[key] !== undefined && el) {
                el.checked = p[key];
                toggleAsset(t);
            }
        });

        if (p.isMaxOA !== undefined && document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = p.isMaxOA;
        if (p.hasMortgagePartner !== undefined && document.getElementById('toggle-mortgage-partner')) document.getElementById('toggle-mortgage-partner').checked = p.hasMortgagePartner;
        if (p.hasExpensePartner !== undefined && document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = p.hasExpensePartner;
        if (p.swrOverride !== undefined && document.getElementById('inp-swrOverride')) document.getElementById('inp-swrOverride').checked = p.swrOverride;
        if (p.showFireCurve !== undefined && document.getElementById('inp-showFireCurve')) document.getElementById('inp-showFireCurve').checked = p.showFireCurve;

        if(document.getElementById('income-streams-container')) {
            document.getElementById('income-streams-container').innerHTML = '';
            if (p.incomeStreams) p.incomeStreams.forEach(st => addIncomeStream(st.name, st.amt, st.start, st.end));
        }
        if(document.getElementById('milestones-container')) {
            document.getElementById('milestones-container').innerHTML = '';
            if (p.milestones) p.milestones.forEach(m => addMilestone(m.name, m.amt, m.age));
        }
        toggleMortgagePartner();
        toggleExpensePartner();
        toggleSwrOverride();
        calcLiveMortgage();
    } catch(e) {}
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
    reader.onload = function(e) {
        try {
            const state = JSON.parse(e.target.result);
            isLoading = true; loadState(state); isLoading = false; runSim();
        } catch (err) { alert("Invalid save file."); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function setMode(mode) {
    document.body.className = mode + '-mode';
    calcLiveMortgage();
    if(!isLoading) runSim();
}

function toggleAsset(asset) {
    const checkbox = document.getElementById(`toggle-${asset}`);
    const panel = document.getElementById(`asset-${asset}`);
    if(checkbox && panel) panel.style.display = checkbox.checked ? 'block' : 'none';
}

function toggleMortgagePartner() {
    const el = document.getElementById('toggle-mortgage-partner');
    const panel = document.getElementById('mortgage-partner-panel');
    if(el && panel) {
        panel.style.display = el.checked ? 'block' : 'none';
        if (!el.checked) setVal('inp-mortgageShare', 100);
    }
}

function toggleExpensePartner() {
    const el = document.getElementById('toggle-expense-partner');
    const panel = document.getElementById('expense-partner-panel');
    if(el && panel) {
        panel.style.display = el.checked ? 'block' : 'none';
        if (!el.checked) setVal('inp-expenseShare', 100);
    }
}

function toggleSwrOverride() {
    const el = document.getElementById('inp-swrOverride');
    const custom = document.getElementById('inp-swrCustom');
    if(el && custom) custom.disabled = !el.checked;
}

function clearAllInputs() {
    document.querySelectorAll('input[type="text"]').forEach(el => setVal(el.id, ''));
    
    if(document.getElementById('toggle-sg')) document.getElementById('toggle-sg').checked = false; toggleAsset('sg');
    if(document.getElementById('toggle-sa')) document.getElementById('toggle-sa').checked = false; toggleAsset('sa'); 
    if(document.getElementById('toggle-mortgage')) document.getElementById('toggle-mortgage').checked = false; document.getElementById('mortgage-panel').style.display = 'none';
    
    if(document.getElementById('toggle-mortgage-partner')) document.getElementById('toggle-mortgage-partner').checked = false; toggleMortgagePartner();
    if(document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = false; toggleExpensePartner();
    
    if(document.getElementById('inp-showFireCurve')) document.getElementById('inp-showFireCurve').checked = false;
    if(document.getElementById('inp-swrOverride')) document.getElementById('inp-swrOverride').checked = false; toggleSwrOverride();
    if(document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = true;
    
    if(document.getElementById('income-streams-container')) document.getElementById('income-streams-container').innerHTML = '';
    if(document.getElementById('milestones-container')) document.getElementById('milestones-container').innerHTML = '';
    
    setVal('inp-inflation', 3.0); setVal('inp-usdRet', 7.0); setVal('inp-sgdRet', 4.0); setVal('inp-fx', 1.35);
    setVal('inp-cashYield', 1.5); setVal('inp-mortgageRate', 2.6); setVal('inp-mortgageShare', 100);
    setVal('inp-expenseShare', 100); setVal('inp-swrCustom', 4.0);

    localStorage.removeItem('fireSimState');
    runSim();
}

function calcPmt(principal, ratePerYear, yearsRemaining) {
    if (yearsRemaining <= 0 || principal <= 0) return 0;
    let r = ratePerYear / 12;
    let n = yearsRemaining * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);
}

function calcLiveMortgage() {
    let tMort = document.getElementById('toggle-mortgage');
    let hasMortgage = tMort ? tMort.checked : false;

    let p = getVal('inp-mortgagePrincipal');
    let y = getVal('inp-loanYrs');
    let r = getVal('inp-mortgageRate') / 100;
    
    let totalPmt = calcPmt(p, r, y);
    let mortPartner = document.getElementById('toggle-mortgage-partner');
    let share = (mortPartner && mortPartner.checked) ? getVal('inp-mortgageShare') : 100;
    let personalPmt = totalPmt * (share / 100);

    if(document.getElementById('disp-monthlyMortgage')) document.getElementById('disp-monthlyMortgage').innerText = '$' + Math.round(totalPmt).toLocaleString();
    if(document.getElementById('disp-personalMortgage')) document.getElementById('disp-personalMortgage').innerText = '$' + Math.round(personalPmt).toLocaleString();

    let splitDisp = document.getElementById('disp-mortgage-split');
    if(splitDisp) {
        if (personalPmt > 0 && hasMortgage) {
            let oaContrib = getVal('inp-oaContrib');
            let isMaxOa = document.getElementById('inp-maxOA') ? document.getElementById('inp-maxOA').checked : true;
            let allowedOa = isMaxOa ? personalPmt : 0; 
            let oaCovers = Math.min(oaContrib, allowedOa);
            let cashTopup = Math.max(0, personalPmt - oaCovers);
            
            splitDisp.style.display = 'block';
            splitDisp.innerHTML = `Your CPF OA covers <strong>$${Math.round(oaCovers).toLocaleString()}</strong> of your installment. You are topping up <strong>$${Math.round(cashTopup).toLocaleString()}</strong> in cash monthly (ensure this $${Math.round(cashTopup).toLocaleString()} is excluded from your investments).`;
        } else {
            splitDisp.style.display = 'none';
        }
    }
}

function addIncomeStream(name = '', amt = '', start = 60, end = 100) {
    if(!document.getElementById('income-streams-container')) return;
    const id = incomeStreamCount++;
    const html = `<div class="list-stream income-stream" id="stream-${id}" style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
            <input type="text" class="is-name" placeholder="Name" value="${name}" style="flex:2;">
            <input type="text" class="num-format is-amt" id="inp-str-${id}" placeholder="$ Amount" value="${amt}" onblur="runSim()" style="flex:2;">
            <input type="number" class="is-start" placeholder="Start Age" value="${start}" onchange="runSim()" style="flex:1;">
            <input type="number" class="is-end" placeholder="End Age" value="${end}" onchange="runSim()" style="flex:1;">
            <button class="btn-remove" onclick="document.getElementById('stream-${id}').remove(); runSim();" style="padding:0.25rem 0.5rem;">X</button>
        </div>`;
    document.getElementById('income-streams-container').insertAdjacentHTML('beforeend', html);
}

function addMilestone(name = '', amt = '', age = 60) {
    if(!document.getElementById('milestones-container')) return;
    const id = milestoneCount++;
    const html = `<div class="milestone-stream" id="milestone-${id}" style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
            <input type="text" class="ms-name" placeholder="Description" value="${name}" style="flex:2;">
            <input type="text" class="num-format ms-amt" id="inp-ms-${id}" placeholder="$ Amount (+/-)" value="${amt}" onblur="runSim()" style="flex:2;">
            <input type="number" class="ms-age" placeholder="Age" value="${age}" onchange="runSim()" style="flex:1;">
            <button class="btn-remove" onclick="document.getElementById('milestone-${id}').remove(); runSim();" style="padding:0.25rem 0.5rem;">X</button>
        </div>`;
    document.getElementById('milestones-container').insertAdjacentHTML('beforeend', html);
}

// --- Warning Framework ---
function checkInputWarnings() {
    const setWarn = (id, condition, text) => {
        let inputEl = document.getElementById(id);
        if (!inputEl) return;
        let warnEl = document.getElementById(id + '-warn');
        if (!warnEl) {
            warnEl = document.createElement('div');
            warnEl.id = id + '-warn';
            warnEl.className = 'input-warning-text';
            inputEl.parentNode.appendChild(warnEl);
        }
        if (condition) { warnEl.innerHTML = text; warnEl.style.display = 'block'; }
        else { warnEl.style.display = 'none'; }
    };

    setWarn('inp-invRet', getVal('inp-invRet') > 8.5, '<i>Warning: Highly aggressive. For context, over the last 20 years, the MSCI World Index averaged 8.2% annually, while the US-heavy S&P 500 averaged 11.8% over the last 30 years. (Note: This input is nominal; the engine will subtract your inflation input to calculate real growth).</i>');
    let inf = getVal('inp-inflation');
    setWarn('inp-inflation', inf < 1.5, '<i>Note: Highly optimistic. Singapore\'s average headline inflation was 1.72% over the last 10 years, 2.14% over the last 20 years, and 1.68% over the past 30 years.</i>');
    setWarn('inp-inflation', inf > 5.0, '<i>Warning: You are modeling severe long-term stagflation. Historically, inflation rates this high do not sustain over a 40-year horizon.</i>');
    
    let cashYield = getVal('inp-cashYield');
    setWarn('inp-cashYield', cashYield > 2.0, '<i>Note: Most bank savings accounts that offer high yields cap the maximum balance that earns this interest rate.</i>');
    
    let mortRate = getVal('inp-mortgageRate');
    setWarn('inp-mortgageRate', mortRate > 3.5, '<i>Note: This is unusually high for Singapore. As of 2026, bank loan rates range between 1.35% and 1.8%, and the HDB concessionary rate is fixed at 2.6%.</i>');
    setWarn('inp-mortgageRate', mortRate < 1.3 && mortRate > 0, '<i>Note: This is highly optimistic. Bank rates in Singapore rarely drop below 1.35%, and the HDB rate sits at 2.6%.</i>');
    
    let retAge = getVal('inp-retireAge');
    setWarn('inp-retireAge', retAge < 40 && retAge > 0, '<i>Note: Extreme early financial freedom requires massive savings rates and exposes your capital to sequence-of-returns risk.</i>');

    // Cash Buffer Warning
    let exp = getVal('inp-expenses') * (getVal('inp-expenseShare') / 100 || 1);
    let pmt = calcPmt(getVal('inp-mortgagePrincipal'), getVal('inp-mortgageRate')/100, getVal('inp-loanYrs')) * (getVal('inp-mortgageShare') / 100 || 1);
    let monthlyBurn = exp + pmt;
    let cash = getVal('inp-cashStart');
    setWarn('inp-cashStart', monthlyBurn > 0 && cash < (monthlyBurn * 3), '<i>⚠️ Caution: Your liquid cash is less than 3 months of living expenses. A market downturn or job loss could force you to sell investments at a loss.</i>');
    setWarn('inp-cashStart', monthlyBurn > 0 && cash > (monthlyBurn * 12), '<i>⚠️ Caution: You are holding over 12 months of living expenses in cash. While safe, heavy "cash drag" means inflation is actively eroding your purchasing power over the long term.</i>');

    // SWR Warning
    let swr = getVal('inp-swrCustom');
    let isOverride = document.getElementById('inp-swrOverride') ? document.getElementById('inp-swrOverride').checked : false;
    setWarn('inp-swrCustom', isOverride && swr > 4.5, '<i>⚠️ Highly aggressive. Most historical simulations fail at withdrawal rates above 4.5% over a 30+ year horizon. You risk depleting your portfolio prematurely.</i>');
    setWarn('inp-swrCustom', isOverride && swr < 2.5 && swr > 0, '<i>⚠️ Extremely conservative. While very safe, a withdrawal rate this low means you may be over-saving and unnecessarily delaying your financial freedom.</i>');
}

// --- Core Sim & Profile Loading ---
window.loadProfile = function(type) {
    isLoading = true;
    let cards = document.querySelectorAll('.persona-card');
    cards.forEach(c => c.classList.remove('active'));
    cards.forEach(c => { if (c.getAttribute('onclick') && c.getAttribute('onclick').includes(type)) c.classList.add('active'); });

    if (type === 'young_starter') {
        setVal('inp-currentAge', 28); setVal('inp-retireAge', 55); setVal('inp-expenses', 3500);
        setVal('inp-invStart', 10000); setVal('inp-invContrib', 500); setVal('inp-invRet', 7.0); 
        setVal('inp-cashStart', 20000); setVal('inp-cashContrib', 1000);
        document.getElementById('toggle-expense-partner').checked = false;
        document.getElementById('toggle-mortgage').checked = false;
        document.getElementById('toggle-sa').checked = false; document.getElementById('toggle-sg').checked = false;
    } 
    else if (type === 'hdb_couple') {
        setVal('inp-currentAge', 30); setVal('inp-retireAge', 55); setVal('inp-expenses', 5000); setVal('inp-expenseShare', 50);
        setVal('inp-invStart', 30000); setVal('inp-invContrib', 1000); setVal('inp-invRet', 7.0); 
        setVal('inp-cashStart', 40000); setVal('inp-cashContrib', 1000);
        setVal('inp-mortgagePrincipal', 420000); setVal('inp-loanYrs', 23); setVal('inp-mortgageRate', 2.6); setVal('inp-mortgageShare', 50);
        setVal('inp-oaStart', 20000); setVal('inp-oaContrib', 1400);
        document.getElementById('toggle-expense-partner').checked = true; 
        document.getElementById('toggle-mortgage').checked = true; document.getElementById('toggle-mortgage-partner').checked = true;
    } 
    else if (type === 'growing_family') {
        setVal('inp-currentAge', 35); setVal('inp-retireAge', 60); setVal('inp-expenses', 8500); setVal('inp-expenseShare', 50);
        setVal('inp-invStart', 120000); setVal('inp-invContrib', 1500); setVal('inp-invRet', 7.0); 
        setVal('inp-cashStart', 80000); setVal('inp-cashContrib', 700);
        setVal('inp-mortgagePrincipal', 1100000); setVal('inp-loanYrs', 24); setVal('inp-mortgageRate', 1.8); setVal('inp-mortgageShare', 50);
        setVal('inp-oaStart', 35000); setVal('inp-oaContrib', 1500);
        document.getElementById('toggle-expense-partner').checked = true; 
        document.getElementById('toggle-mortgage').checked = true; document.getElementById('toggle-mortgage-partner').checked = true;
    } 
    else if (type === 'pragmatic_saver') {
        setVal('inp-currentAge', 42); setVal('inp-retireAge', 60); setVal('inp-expenses', 2800);
        setVal('inp-invStart', 20000); setVal('inp-invContrib', 0); setVal('inp-invRet', 6.0); 
        setVal('inp-cashStart', 60000); setVal('inp-cashContrib', 2500);
        setVal('inp-mortgagePrincipal', 120000); setVal('inp-loanYrs', 10); setVal('inp-mortgageRate', 2.6); setVal('inp-mortgageShare', 100);
        setVal('inp-oaStart', 30000); setVal('inp-oaContrib', 1200); setVal('inp-saStart', 140000); setVal('inp-saContrib', 500);
        document.getElementById('toggle-expense-partner').checked = false;
        document.getElementById('toggle-mortgage').checked = true; document.getElementById('toggle-mortgage-partner').checked = false;
        document.getElementById('toggle-sa').checked = true; toggleAsset('sa');
    } 
    else if (type === 'self_employed') {
        setVal('inp-currentAge', 36); setVal('inp-retireAge', 58); setVal('inp-expenses', 3200);
        setVal('inp-invStart', 70000); setVal('inp-invContrib', 1000); setVal('inp-invRet', 7.0); 
        setVal('inp-cashStart', 75000); setVal('inp-cashContrib', 8000);
        setVal('inp-mortgagePrincipal', 320000); setVal('inp-loanYrs', 23); setVal('inp-mortgageRate', 2.6); setVal('inp-mortgageShare', 50);
        setVal('inp-oaStart', 30000); setVal('inp-oaContrib', 0);
        document.getElementById('toggle-expense-partner').checked = false;
        document.getElementById('toggle-mortgage').checked = true; document.getElementById('toggle-mortgage-partner').checked = false;
    }
    
    toggleExpensePartner();
    if(document.getElementById('toggle-mortgage')) document.getElementById('mortgage-panel').style.display = document.getElementById('toggle-mortgage').checked ? 'block' : 'none';
    calcLiveMortgage();
    isLoading = false;
};

window.unlockPersonas = function() {
    let sec = document.getElementById('persona-section');
    if (sec) {
        sec.classList.remove('wizard-lock');
        sec.classList.add('wizard-unlock');
        setTimeout(() => { try { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {} }, 50);
    }
};

window.selectPersona = function(type) {
    window.loadProfile(type);
    let inputsSec = document.getElementById('inputs-section');
    if (inputsSec) {
        inputsSec.classList.remove('wizard-lock');
        inputsSec.classList.add('wizard-unlock');
        setTimeout(() => { try { inputsSec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {} }, 50);
    }
};

window.executeSimulation = function() {
    runSim();
    let chartSec = document.getElementById('chart-section');
    if (chartSec) {
        chartSec.classList.remove('wizard-lock');
        chartSec.classList.add('wizard-unlock');
    }
};

function simulatePath(inputs) {
    let { currentAge, retireAge, inflation, fx, 
          usdStart, usdContrib, usdRet, sgdStart, sgdContrib, sgdRet,
          cashStart, cashContrib, cashYield, saStart, saContrib,
          hasMortgage, mortgagePrincipal, mortgageRate, mortgageShare, isMaxOA, loanYrs, oaStart, oaContrib,
          expenses, expenseShare, incomeStreams, milestones, isAdvanced } = inputs;
    
    let usdPort = usdStart;
    let sgdPort = sgdStart;
    let cashRes = cashStart;
    let saBal = saStart;
    let oaBal = oaStart;
    
    let mortgageEndAge = currentAge + loanYrs;
    let currentUsdContrib = usdContrib;
    let currentSgdContrib = sgdContrib;
    let currentCashContrib = cashContrib;
    let currentOaContrib = oaContrib; 
    let currentSaContrib = saContrib;
    let currentExpenses = expenses;
    let remPrincipal = mortgagePrincipal;

    let pathData = [];
    let solvent = true;
    let depletionAge = null;
    let peakNW = 0;

    for (let age = currentAge; age <= 100; age++) {
        if (age > currentAge) {
            currentExpenses *= (1 + inflation);
        }

        let isWorking = age < retireAge;
        let isMortgageActive = age < mortgageEndAge && hasMortgage;
        let currentTotalMortgage = 0;
        let currentPersonalMortgage = 0;
        
        if (isMortgageActive) {
            currentTotalMortgage = calcPmt(remPrincipal, mortgageRate, mortgageEndAge - age);
            currentPersonalMortgage = currentTotalMortgage * (mortgageShare / 100);
        }

        // Process Milestones
        milestones.forEach(m => {
            if (age === m.age) {
                if (m.amt > 0) cashRes += m.amt;
                else {
                    let draw = Math.abs(m.amt);
                    let liquid = cashRes + sgdPort + (usdPort * fx);
                    if (liquid >= draw) {
                        let cRatio = cashRes / liquid; let sRatio = sgdPort / liquid; let uRatio = (usdPort * fx) / liquid;
                        cashRes -= draw * cRatio; sgdPort -= draw * sRatio; usdPort -= (draw * uRatio) / fx;
                    } else {
                        cashRes = 0; sgdPort = 0; usdPort = 0;
                        if (solvent) { solvent = false; depletionAge = age; }
                    }
                }
            }
        });

        // The Age 55 CPF Liquidity Gate
        if (age === 55) {
            cashRes += (oaBal + saBal);
            oaBal = 0;
            saBal = 0;
        }

        for (let m = 1; m <= 12; m++) {
            usdPort *= (1 + (usdRet / 12));
            sgdPort *= (1 + (sgdRet / 12));
            cashRes *= (1 + (cashYield / 12));
            saBal *= (1 + (0.04 / 12));
            oaBal *= (1 + (0.025 / 12));

            if (isWorking) {
                if (age < 55) { oaBal += currentOaContrib; saBal += currentSaContrib; }
                cashRes += currentCashContrib;
                
                if (isMortgageActive && currentTotalMortgage > 0) {
                    let interestPayment = remPrincipal * (mortgageRate / 12);
                    remPrincipal = Math.max(0, remPrincipal - (currentTotalMortgage - interestPayment));

                    let targetOaPay = isMaxOA ? currentPersonalMortgage : 0;
                    if (oaBal >= targetOaPay) {
                        oaBal -= targetOaPay;
                    } else {
                        oaBal = 0; // Remainder paid by unlisted daily expenses
                    }
                }

                usdPort += currentUsdContrib / fx;
                sgdPort += currentSgdContrib;
            } else {
                // Retired
                let grossSpending = currentExpenses * (expenseShare / 100);
                
                if (isMortgageActive && currentTotalMortgage > 0) {
                    let interestPayment = remPrincipal * (mortgageRate / 12);
                    remPrincipal = Math.max(0, remPrincipal - (currentTotalMortgage - interestPayment));

                    if (oaBal >= currentPersonalMortgage) {
                        oaBal -= currentPersonalMortgage;
                    } else {
                        grossSpending += (currentPersonalMortgage - oaBal);
                        oaBal = 0;
                    }
                }

                let retirementIncome = 0;
                incomeStreams.forEach(st => { if (age >= st.start && age <= st.end) retirementIncome += st.amt; });

                let netWithdrawal = Math.max(0, grossSpending - retirementIncome);

                if (netWithdrawal > 0) {
                    let totalLiquidSGD = cashRes + sgdPort + (usdPort * fx);
                    
                    if (totalLiquidSGD >= netWithdrawal) {
                        let cashRatio = cashRes / totalLiquidSGD;
                        let sgdRatio = sgdPort / totalLiquidSGD;
                        let usdRatio = (usdPort * fx) / totalLiquidSGD;

                        cashRes -= netWithdrawal * cashRatio;
                        sgdPort -= netWithdrawal * sgdRatio;
                        usdPort -= (netWithdrawal * usdRatio) / fx;
                    } else {
                        cashRes = 0; sgdPort = 0; usdPort = 0;
                        if (solvent) { solvent = false; depletionAge = age; }
                    }
                }
            }
            
            let totalLiquid = cashRes + sgdPort + (usdPort * fx) + (age < 55 ? 0 : (saBal + oaBal)); // Unlocked tracking
            if (totalLiquid > peakNW) peakNW = totalLiquid;
            if (totalLiquid < 0 && solvent) { solvent = false; depletionAge = age; }
            if (!solvent) { cashRes = 0; sgdPort = 0; usdPort = 0; saBal = 0; }
        }

        let totalLiquidSGD = cashRes + sgdPort + (usdPort * fx) + saBal + oaBal;
        pathData.push({ age, val: totalLiquidSGD });
    }
    return { pathData, solvent, depletionAge, peakNW };
}

function runSim() {
    if (isLoading) return;
    checkInputWarnings(); 
        
    const isAdvanced = document.body.className.includes('advanced-mode');
    const inputs = getState().inputs;
    inputs.isAdvanced = isAdvanced;

    let effectiveExpenses = inputs.expenses * (inputs.expenseShare / 100);

    // --- Dynamic SWR Engine ---
    let totalBal = (inputs.usdStart * inputs.fx) + (inputs.hasSG ? inputs.sgdStart : 0) + inputs.cashStart + (inputs.hasSA ? inputs.saStart : 0);
    
    let nomRet = inputs.usdRet;
    if (totalBal > 0) {
        nomRet = (((inputs.usdStart * inputs.fx) / totalBal) * inputs.usdRet + ((inputs.hasSG ? inputs.sgdStart : 0) / totalBal) * inputs.sgdRet + (inputs.cashStart / totalBal) * inputs.cashYield + ((inputs.hasSA ? inputs.saStart : 0) / totalBal) * 0.04);
    }
    nomRet = nomRet / 100;
    
    let realRet = (1 + nomRet) / (1 + (inputs.inflation/100)) - 1;
    let duration = Math.max(1, 100 - inputs.retireAge);
    let calcMultiple = 0;
    if (Math.abs(realRet) < 0.0001) calcMultiple = duration;
    else calcMultiple = (1 - Math.pow(1 + realRet, -duration)) / realRet;
    
    let dynSwrPercent = (1 / calcMultiple) * 100;
    updateDOM('swr-live-readout', `Engine Calculated SWR: ${dynSwrPercent.toFixed(1)}% (Requires ~${calcMultiple.toFixed(1)}x your annual expenses)`);

    let targetMultiple = inputs.swrOverride ? (100 / inputs.swrCustom) : calcMultiple;

    // --- Generate Target Curve ---
    let fireCurveData = [];
    let targetAtRetirement = 0;

    for (let age = inputs.currentAge; age <= 100; age++) {
        let yrs = Math.max(0, age - inputs.currentAge);
        let infExp = inputs.expenses * Math.pow(1 + (inputs.inflation/100), yrs);
        let effExpMonthly = infExp * (inputs.expenseShare / 100);
        
        let remPrincipal = 0;
        if (inputs.hasMortgage && age < inputs.currentAge + inputs.loanYrs) {
            let mYrs = (inputs.currentAge + inputs.loanYrs) - age;
            let r = (inputs.mortgageRate/100) / 12;
            let pmt = calcPmt(inputs.mortgagePrincipal, inputs.mortgageRate/100, inputs.loanYrs);
            remPrincipal = r === 0 ? pmt * (mYrs * 12) : (pmt / r) * (1 - Math.pow(1+r, -(mYrs * 12)));
        }
        
        let personalRemPrincipal = remPrincipal * (inputs.mortgageShare / 100);
        let target = (effExpMonthly * 12 * targetMultiple) + personalRemPrincipal;
        
        if (age === inputs.retireAge) targetAtRetirement = target;
        fireCurveData.push(target);
    }

    let labels = [];
    for(let i=inputs.currentAge; i<=100; i++) labels.push(i);

    // Transform Data for Simulation
    let simInputs = JSON.parse(JSON.stringify(inputs));
    simInputs.inflation /= 100; simInputs.usdRet /= 100; simInputs.sgdRet /= 100; simInputs.cashYield /= 100; simInputs.mortgageRate /= 100;
    
    let res = simulatePath(simInputs);
    
    // PV vs FV Transformation
    let p1 = [];
    for(let i=0; i<res.pathData.length; i++) {
        let val = res.pathData[i].val;
        if (inputs.pvToggle === 'pv') {
            val = val / Math.pow(1 + simInputs.inflation, i);
            fireCurveData[i] = fireCurveData[i] / Math.pow(1 + simInputs.inflation, i);
        }
        p1.push(val);
    }

    let datasets = [
        { label: inputs.pvToggle === 'pv' ? "Net Worth (Today's SGD)" : "Net Worth (Future SGD)", data: p1, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.2, pointStyle: 'rect' }
    ];

    if (inputs.showFireCurve && inputs.isAdvanced) {
        datasets.push({ label: 'Financial Freedom Target', data: fireCurveData, borderColor: '#ef4444', borderDash: [2, 4], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5 });
    }

    // Live Mortgage
    if (inputs.hasMortgage) calcLiveMortgage();

    let cardStatus = document.getElementById('card-status');
    if (res.solvent) {
        let finalBal = res.pathData[res.pathData.length-1].val;
        let pvBal = finalBal / Math.pow(1 + simInputs.inflation, 100 - inputs.currentAge);
        
        updateDOM('status-main', "✅ Financial Independence Secured to Age 100");
        updateDOM('status-sub', `Est. remaining wealth to bequeath: $${(finalBal/1000000).toFixed(2)}M (Worth ~$${(pvBal/1000000).toFixed(2)}M in today's dollars)`);
        if(cardStatus) cardStatus.className = 'hero-card success';
    } else {
        if (res.depletionAge >= 90) {
            updateDOM('status-main', "🐢 Almost There");
            updateDOM('status-sub', `Funds deplete at age ${res.depletionAge}. A small tweak will get you to 100.`);
            if(cardStatus) cardStatus.className = 'hero-card warning';
        } else {
            updateDOM('status-main', "⚠️ Adjustments Needed");
            updateDOM('status-sub', `Funds deplete at age ${res.depletionAge}. Try investing a bit more or delaying financial freedom.`);
            if(cardStatus) cardStatus.className = 'hero-card danger';
        }
    }

    generateCoaching(inputs, res.solvent);
    renderChart(labels, datasets, inputs);
    try { localStorage.setItem('fireSimState', JSON.stringify(getState())); } catch(e) {}
}

window.generateCoaching = function(baseInputs, isSolvent) {
    let panel = document.getElementById('coaching-panel');
    let optsDiv = document.getElementById('coach-options');
    if (!panel || !optsDiv) return;
    
    panel.style.display = 'block';
    setTimeout(() => {
        let html = "<div style='margin-bottom: 1rem; font-size: 0.85rem; color: #475569;'><em>Click any button below to update your inputs.</em></div>";
        
        if (isSolvent) {
            document.getElementById('coach-title').innerText = '💡 Optimization Opportunities';
            document.getElementById('coach-title').style.color = '#047857';
            
            let nextAge = baseInputs.retireAge - 1;
            if (nextAge > baseInputs.currentAge) {
                html += `<div class="coach-card safe" onclick="applyTweak('inp-retireAge', ${nextAge})"><div class="coach-text">🎉 <strong>Claim Freedom Earlier:</strong> Pull your financial freedom age forward by 1 year to Age ${nextAge}</div><div class="coach-btn-pill">-1 Year ➔</div></div>`;
            }
            
            let nextExp = Math.round((baseInputs.expenses * 1.05) / 50) * 50;
            html += `<div class="coach-card safe" onclick="applyTweak('inp-expenses', ${nextExp})"><div class="coach-text">🍷 <strong>Upgrade Lifestyle:</strong> Increase your target monthly expenses by 5% to $${nextExp.toLocaleString()}/mo</div><div class="coach-btn-pill">+5% ➔</div></div>`;
        } else {
            document.getElementById('coach-title').innerText = '🔧 How to achieve Financial Independence';
            document.getElementById('coach-title').style.color = '#1e3a8a';
            
            let currInv = baseInputs.usdContrib;
            let nextInv = currInv < 500 ? 500 : Math.round((currInv * 1.1) / 50) * 50;
            html += `<div class="coach-card danger" onclick="applyTweak('inp-invContrib', ${nextInv})"><div class="coach-text">📈 <strong>Supercharge Investments:</strong> Increase monthly investments by 10% to $${nextInv.toLocaleString()}/mo</div><div class="coach-btn-pill">+10% ➔</div></div>`;

            let currCash = baseInputs.cashContrib;
            let nextCash = currCash < 500 ? 500 : Math.round((currCash * 1.1) / 50) * 50;
            html += `<div class="coach-card danger" onclick="applyTweak('inp-cashContrib', ${nextCash})"><div class="coach-text">🏦 <strong>Build Cash Buffer:</strong> Increase monthly cash savings by 10% to $${nextCash.toLocaleString()}/mo</div><div class="coach-btn-pill">+10% ➔</div></div>`;
                     
            let nextExp = Math.round((baseInputs.expenses * 0.95) / 50) * 50;
            html += `<div class="coach-card danger" onclick="applyTweak('inp-expenses', ${nextExp})"><div class="coach-text">📉 <strong>Trim the Fat:</strong> Reduce target monthly expenses by 5% to $${nextExp.toLocaleString()}/mo</div><div class="coach-btn-pill">-5% ➔</div></div>`;

            let nextAge = baseInputs.retireAge + 1;
            html += `<div class="coach-card danger" onclick="applyTweak('inp-retireAge', ${nextAge})"><div class="coach-text">⏳ <strong>Extend Horizon:</strong> Delay financial freedom by 1 year to Age ${nextAge}</div><div class="coach-btn-pill">+1 Year ➔</div></div>`;
        }
        optsDiv.innerHTML = html;
    }, 50);
};

window.applyTweak = function(id, val) {
    if(typeof setVal === 'function') {
        setVal(id, val);
        runSim();
        let chartSec = document.getElementById('chart-section');
        if (chartSec) chartSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

function renderChart(labels, datasets, inputs) {
    let canvas = document.getElementById('fireChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if (fireChart) fireChart.destroy();
    
    let chartAnnotations = {};
    if (inputs.retireAge > inputs.currentAge && inputs.retireAge <= 100) {
        let retireIndex = inputs.retireAge - inputs.currentAge;
        if (retireIndex >= 0 && retireIndex < labels.length) {
            chartAnnotations.lineRetire = {
                type: 'line', xMin: retireIndex, xMax: retireIndex,
                borderColor: '#7c3aed', borderDash: [5, 5], borderWidth: 2,
                label: { display: true, content: 'Freedom Age', position: 'start', backgroundColor: '#7c3aed', color: '#fff', font: {size: 11} }
            };
        }
    }
    
    // Show Age 55 CPF Unlock Line
    if (inputs.currentAge <= 55) {
        let idx55 = 55 - inputs.currentAge;
        if (idx55 >= 0 && idx55 < labels.length) {
            chartAnnotations.lineSA = {
                type: 'line', xMin: idx55, xMax: idx55,
                borderColor: 'rgba(16, 185, 129, 0.4)', borderDash: [3, 3], borderWidth: 2,
                label: { display: true, content: 'CPF Unlocked (Age 55)', position: 'end', backgroundColor: 'transparent', color: '#10b981', font: {size: 11}, yAdjust: 10 }
            };
        }
    }

    fireChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: { y: { ticks: { callback: v => '$' + (v / 1000000).toFixed(1) + 'M' } } },
            plugins: { annotation: { annotations: chartAnnotations } }
        }
    });
}

function toggleMortgageCalc() {
    let pnl = document.getElementById('mortgage-calc-panel');
    if(pnl) pnl.style.display = pnl.style.display === 'none' ? 'block' : 'none';
}

function applyMortgageEstimate() {
    let origLoan = getVal('est-origLoan');
    let origTenure = getVal('est-origTenure');
    let yearsPaid = getVal('est-yearsPaid');
    let rate = getVal('inp-mortgageRate') / 100;
    if (origLoan > 0 && origTenure > 0 && yearsPaid >= 0) {
        let r = rate / 12; let n = origTenure * 12; let monthsPaid = yearsPaid * 12;
        let pmt = calcPmt(origLoan, rate, origTenure);
        let remPrincipal = r === 0 ? origLoan - (pmt * monthsPaid) : (pmt / r) * (1 - Math.pow(1+r, -(n - monthsPaid)));
        setVal('inp-mortgagePrincipal', Math.max(0, Math.round(remPrincipal)));
        setVal('inp-loanYrs', Math.max(0, origTenure - yearsPaid));
        toggleMortgageCalc(); runSim();
    }
}

function toggleOACalc() {
    let pnl = document.getElementById('oa-calc-panel');
    if(pnl) pnl.style.display = pnl.style.display === 'none' ? 'block' : 'none';
}

function applyOAEstimate() {
    let salary = getVal('est-salary');
    let age = getVal('inp-currentAge') || 35;
    let cappedSalary = Math.min(salary, 8000);
    let oaRate = age > 60 ? 0.035 : age > 55 ? 0.12 : age > 50 ? 0.15 : age > 45 ? 0.19 : age > 35 ? 0.21 : 0.23;
    setVal('inp-oaContrib', Math.round(cappedSalary * oaRate));
    toggleOACalc(); runSim();
}

let savedState = localStorage.getItem('fireSimState');
if (savedState) { try { loadState(JSON.parse(savedState)); } catch(e) {} }
isLoading = false;