let fireChart;
let incomeStreamCount = 0;
let milestoneCount = 0;
let isLoading = true;
const APP_VERSION = "5.0";

// --- Contextual Slider Coaching Engine ---
function updateContexts() {
    let retAge = getVal('inp-retireAge');
    let ctxRet = document.getElementById('ctx-retireAge');
    if(retAge < 40) ctxRet.innerText = "Extreme early retirement. Requires massive savings rate.";
    else if(retAge < 55) ctxRet.innerText = "Aggressive FIRE. Capital must last 40+ years.";
    else if(retAge <= 65) ctxRet.innerText = "Standard early retirement horizon.";
    else ctxRet.innerText = "Traditional retirement. High success probability.";

    let infl = getVal('inp-inflation');
    let ctxInfl = document.getElementById('ctx-inflation');
    if(infl < 2.0) ctxInfl.innerText = "Highly optimistic. Historically rare over 30 years.";
    else if(infl <= 3.5) ctxInfl.innerText = "Balanced. Aligns with historical global averages.";
    else ctxInfl.innerText = "Pessimistic. Modeling heavy stagflation environments.";

    let gRet = getVal('inp-usdRet');
    let ctxGret = document.getElementById('ctx-usdRet');
    if(gRet < 5.0) ctxGret.innerText = "Highly conservative. Assumes near-zero real growth.";
    else if(gRet <= 7.5) ctxGret.innerText = "Balanced. Bakes in a healthy margin of safety.";
    else ctxGret.innerText = "Aggressive. Relies heavily on sustained bull markets.";

    let sRet = getVal('inp-sgdRet');
    let ctxSret = document.getElementById('ctx-sgdRet');
    if(sRet < 3.0) ctxSret.innerText = "Conservative. Treating SG equities like bonds.";
    else if(sRet <= 5.0) ctxSret.innerText = "Balanced. Aligns with historical STI yields.";
    else ctxSret.innerText = "Aggressive for a mature, dividend-focused market.";

    let swr = getVal('inp-swrMultiple');
    let ctxSwr = document.getElementById('ctx-swrMultiple');
    if(swr < 25) ctxSwr.innerText = "Aggressive (>4% SWR). High risk of depletion.";
    else if(swr <= 33) ctxSwr.innerText = "Standard FIRE (3% - 4% SWR). Generally safe.";
    else ctxSwr.innerText = "Highly Conservative (<3% SWR). Institutional safety.";
}

// --- Mobile Tooltips (Tap Outside to Close) ---
document.addEventListener('click', function(e) {
    document.querySelectorAll('.tt-container').forEach(el => el.classList.remove('active'));
    if (e.target.classList.contains('tt-icon')) {
        e.preventDefault();
        e.stopPropagation();
        e.target.parentElement.classList.toggle('active');
    }
});

// --- UI & Formatting Utilities ---
function getVal(id) {
    let el = document.getElementById(id);
    if (!el) return 0;
    return parseFloat(el.value.replace(/,/g, '')) || 0;
}

function setVal(id, val) {
    let el = document.getElementById(id);
    if (!el) return;
    if (val === '') {
        el.value = '';
        let slider = document.getElementById('slide-' + id.replace('inp-', ''));
        if (slider) slider.value = 0;
        return;
    }
    if (Math.abs(val) >= 1000 || el.placeholder === "0" || el.id.includes("Start") || el.id.includes("Contrib") || el.id.includes("Principal") || el.id.includes("expenses") || el.id.includes("mortgageSimple")) {
        el.value = Math.round(val).toLocaleString('en-US');
    } else {
        el.value = val;
    }
    
    let slider = document.getElementById('slide-' + id.replace('inp-', ''));
    if (slider) slider.value = parseFloat(val);
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

document.querySelectorAll('.sync-input').forEach(input => {
    input.addEventListener('input', function() {
        let slider = document.getElementById(this.getAttribute('data-slider'));
        if(slider) slider.value = getVal(this.id);
    });
});

document.querySelectorAll('.sync-slider').forEach(slider => {
    slider.addEventListener('input', function() {
        let input = document.getElementById(this.getAttribute('data-input'));
        if(input) { 
            setVal(input.id, this.value); 
            if (input.id === 'inp-mortgageShare') calcLiveMortgage();
            runSim(); 
        }
    });
});

// --- State Management (Scooper & Loader) ---
function getState() {
    let inputs = {
        mode: document.querySelector('input[name="mode"]:checked').value,
        
        currentAge: getVal('inp-currentAge'),
        retireAge: getVal('inp-retireAge'),
        inflation: getVal('inp-inflation'),
        inflVol: getVal('inp-inflVol'),
        inflateContribs: document.getElementById('inp-inflateContribs').checked,
        
        hasGlobal: document.getElementById('toggle-global').checked,
        usdStart: getVal('inp-usdStart'),
        usdContrib: getVal('inp-usdContrib'),
        usdRet: getVal('inp-usdRet'),
        usdVol: getVal('inp-usdVol'),
        fx: getVal('inp-fx'),
        fxDrift: getVal('inp-fxDrift'),
        fxVol: getVal('inp-fxVol'),

        hasSG: document.getElementById('toggle-sg').checked,
        sgdStart: getVal('inp-sgdStart'),
        sgdContrib: getVal('inp-sgdContrib'),
        sgdRet: getVal('inp-sgdRet'),
        sgdVol: getVal('inp-sgdVol'),

        hasCash: document.getElementById('toggle-cash').checked,
        cashStart: getVal('inp-cashStart'),
        cashYield: getVal('inp-cashYield'),

        hasSA: document.getElementById('toggle-sa').checked,
        saStart: getVal('inp-saStart'),
        saContrib: getVal('inp-saContrib'),

        hasMortgage: document.getElementById('toggle-mortgage').checked,
        hasMortgagePartner: document.getElementById('toggle-mortgage-partner').checked,
        isHdb: document.getElementById('loan-hdb').checked,
        isBank: document.getElementById('loan-bank').checked,
        mortgageSimple: getVal('inp-mortgageSimple'),
        mortgagePrincipal: getVal('inp-mortgagePrincipal'),
        loanYrs: getVal('inp-loanYrs'),
        mortgageRate: getVal('inp-mortgageRate'),
        mortgageVol: getVal('inp-mortgageVol'),
        mortgageShare: getVal('inp-mortgageShare'),
        
        isMaxOA: document.getElementById('inp-maxOA').checked,
        customOACap: getVal('inp-customOACap'),
        oaStart: getVal('inp-oaStart'),
        oaContrib: getVal('inp-oaContrib'),

        hasExpensePartner: document.getElementById('toggle-expense-partner').checked,
        expenses: getVal('inp-expenses'),
        expenseShare: getVal('inp-expenseShare'),
        showFireCurve: document.getElementById('inp-showFireCurve').checked,
        swrOverride: document.getElementById('inp-swrOverride').checked,
        swrMultiple: getVal('inp-swrMultiple'),

        isMC: document.getElementById('inp-mcToggle').checked,
        mcRuns: getVal('inp-mcRuns'),
        isBlackSwan: document.getElementById('inp-blackSwan').checked,

        incomeStreams: [],
        milestones: []
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

    return {
        version: APP_VERSION,
        last_saved: new Date().toISOString(),
        inputs: inputs
    };
}

function loadState(state) {
    if (!state || !state.inputs) return;
    let p = state.inputs;
    
    if (p.mode) {
        let r = document.getElementById('mode-' + p.mode);
        if (r) { r.checked = true; setMode(p.mode); }
    }

    const fields = ['currentAge', 'retireAge', 'inflation', 'inflVol', 'usdStart', 'usdContrib', 'usdRet', 'usdVol', 'fx', 'fxDrift', 'fxVol', 'sgdStart', 'sgdContrib', 'sgdRet', 'sgdVol', 'cashStart', 'cashYield', 'saStart', 'saContrib', 'mortgageSimple', 'mortgagePrincipal', 'loanYrs', 'mortgageRate', 'mortgageVol', 'mortgageShare', 'oaContrib', 'oaStart', 'customOACap', 'expenses', 'expenseShare', 'swrMultiple', 'mcRuns'];
    fields.forEach(f => {
        if (p[f] !== undefined) setVal('inp-' + f, p[f]);
    });

    const toggles = ['global', 'sg', 'cash', 'sa', 'mortgage'];
    toggles.forEach(t => {
        let el = document.getElementById('toggle-' + t);
        let key = 'has' + t.charAt(0).toUpperCase() + t.slice(1);
        if (p[key] !== undefined && el) {
            el.checked = p[key];
            toggleAsset(t);
        }
    });

    if (p.inflateContribs !== undefined) document.getElementById('inp-inflateContribs').checked = p.inflateContribs;
    if (p.isMaxOA !== undefined) document.getElementById('inp-maxOA').checked = p.isMaxOA;
    if (p.hasMortgagePartner !== undefined) document.getElementById('toggle-mortgage-partner').checked = p.hasMortgagePartner;
    if (p.hasExpensePartner !== undefined) document.getElementById('toggle-expense-partner').checked = p.hasExpensePartner;
    if (p.isBlackSwan !== undefined) document.getElementById('inp-blackSwan').checked = p.isBlackSwan;
    if (p.isMC !== undefined) document.getElementById('inp-mcToggle').checked = p.isMC;
    if (p.isHdb !== undefined) document.getElementById('loan-hdb').checked = p.isHdb;
    if (p.isBank !== undefined) document.getElementById('loan-bank').checked = p.isBank;
    if (p.swrOverride !== undefined) document.getElementById('inp-swrOverride').checked = p.swrOverride;
    if (p.showFireCurve !== undefined) document.getElementById('inp-showFireCurve').checked = p.showFireCurve;

    document.getElementById('income-streams-container').innerHTML = '';
    if (p.incomeStreams && Array.isArray(p.incomeStreams)) {
        p.incomeStreams.forEach(st => addIncomeStream(st.name, st.amt, st.start, st.end));
    }

    document.getElementById('milestones-container').innerHTML = '';
    if (p.milestones && Array.isArray(p.milestones)) {
        p.milestones.forEach(m => addMilestone(m.name, m.amt, m.age));
    }

    if (p.swrMultiple === undefined) setVal('inp-swrMultiple', 25);

    toggleMortgagePartner();
    toggleExpensePartner();
    toggleCustomOA();
    toggleSwrOverride();
    calcLiveMortgage();
}

// --- Export / Import ---
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
            isLoading = true;
            loadState(state);
            isLoading = false;
            runSim();
        } catch (err) {
            alert("Invalid save file.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- Logic Toggles ---
function setMode(mode) {
    document.body.className = mode + '-mode';
    calcLiveMortgage();
    if(!isLoading) runSim();
}

function toggleAsset(asset) {
    const isChecked = document.getElementById(`toggle-${asset}`).checked;
    document.getElementById(`asset-${asset}`).style.display = isChecked ? 'block' : 'none';
    if(!isLoading) runSim();
}

function toggleMortgagePartner() {
    const isChecked = document.getElementById('toggle-mortgage-partner').checked;
    document.getElementById('mortgage-partner-panel').style.display = isChecked ? 'block' : 'none';
    if (!isChecked) setVal('inp-mortgageShare', 100);
}

function toggleExpensePartner() {
    const isChecked = document.getElementById('toggle-expense-partner').checked;
    document.getElementById('expense-partner-panel').style.display = isChecked ? 'block' : 'none';
    if (!isChecked) setVal('inp-expenseShare', 100);
}

function toggleSwrOverride() {
    const isChecked = document.getElementById('inp-swrOverride').checked;
    document.getElementById('inp-swrMultiple').disabled = !isChecked;
    document.getElementById('slide-swrMultiple').disabled = !isChecked;
}

function toggleCustomOA() {
    const isMax = document.getElementById('inp-maxOA').checked;
    document.getElementById('custom-oa-cap').style.display = isMax ? 'none' : 'block';
    if (!isMax) {
        let share = document.getElementById('toggle-mortgage-partner').checked ? getVal('inp-mortgageShare') : 100;
        let p = getVal('inp-mortgagePrincipal');
        let y = getVal('inp-loanYrs');
        let r = getVal('inp-mortgageRate') / 100;
        let totalPmt = calcPmt(p, r, y);
        let personalPmt = totalPmt * (share / 100);
        setVal('inp-customOACap', Math.round(personalPmt) || 0);
    }
    if(!isLoading) runSim();
}

function clearAllInputs() {
    document.querySelectorAll('input[type="text"]').forEach(el => setVal(el.id, ''));
    
    document.getElementById('toggle-global').checked = true; toggleAsset('global');
    document.getElementById('toggle-sg').checked = false; toggleAsset('sg');
    document.getElementById('toggle-cash').checked = true; toggleAsset('cash');
    
    document.getElementById('toggle-sa').checked = false; toggleAsset('sa'); 
    document.getElementById('toggle-mortgage').checked = false; toggleAsset('mortgage');
    
    document.getElementById('toggle-mortgage-partner').checked = false; toggleMortgagePartner();
    document.getElementById('toggle-expense-partner').checked = false; toggleExpensePartner();
    
    document.getElementById('inp-showFireCurve').checked = true;
    document.getElementById('inp-swrOverride').checked = false; toggleSwrOverride();
    
    document.getElementById('inp-maxOA').checked = true; toggleCustomOA();
    document.getElementById('inp-inflateContribs').checked = false;
    
    if(document.body.className.includes('advanced-mode')) {
         document.getElementById('inp-blackSwan').checked = false;
         document.getElementById('inp-mcToggle').checked = false;
    }
    
    document.getElementById('income-streams-container').innerHTML = '';
    document.getElementById('milestones-container').innerHTML = '';
    document.getElementById('mortgage-readout-box').style.display = 'none';
    document.getElementById('diagnostic-panel').style.display = 'none';
    
    setVal('inp-inflation', 3.0); 
    setVal('inp-usdRet', 7.0); 
    setVal('inp-sgdRet', 4.0); 
    setVal('inp-fx', 1.35);
    setVal('inp-fxDrift', 0.0);
    setVal('inp-cashYield', 0.05);
    setVal('inp-mortgageRate', 2.6);
    setVal('inp-mortgageShare', 100);
    setVal('inp-expenseShare', 100);
    setVal('inp-swrMultiple', 25);

    if(document.getElementById('loan-hdb').checked) {
        document.getElementById('slide-mortgageRate').disabled = true;
    }

    localStorage.removeItem('fireSimState');
    runSim();
}

// --- Mortgage Engine ---
function calcPmt(principal, ratePerYear, yearsRemaining) {
    if (yearsRemaining <= 0 || principal <= 0) return 0;
    let r = ratePerYear / 12;
    let n = yearsRemaining * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);
}

function calcLiveMortgage() {
    let isAdvanced = document.body.className.includes('advanced-mode');
    let hasMortgage = document.getElementById('toggle-mortgage').checked;
    let pmtBox = document.getElementById('mortgage-readout-box');
    
    if(!hasMortgage || !isAdvanced) {
        pmtBox.style.display = 'none';
        return;
    } else {
        pmtBox.style.display = 'block';
    }

    let isHdb = document.getElementById('loan-hdb').checked;
    let rateInput = document.getElementById('inp-mortgageRate');
    let rateSlider = document.getElementById('slide-mortgageRate');
    let ttText = document.getElementById('tt-text-mortgageRate');

    if(isHdb) {
        setVal('inp-mortgageRate', 2.6);
        rateInput.disabled = true;
        rateSlider.disabled = true;
        ttText.innerText = "HDB rate is pegged at 0.1% above the prevailing CPF OA interest rate.";
    } else {
        rateInput.disabled = false;
        rateSlider.disabled = false;
        if(getVal('inp-mortgageRate') === 2.6) setVal('inp-mortgageRate', 1.8);
        ttText.innerText = "Defaulted to 1.8%, reflecting the ~20-year historical average of the 3-Month SIBOR/SORA.";
    }

    let p = getVal('inp-mortgagePrincipal');
    let y = getVal('inp-loanYrs');
    let r = getVal('inp-mortgageRate') / 100;
    
    let totalPmt = calcPmt(p, r, y);
    let share = document.getElementById('toggle-mortgage-partner').checked ? getVal('inp-mortgageShare') : 100;
    let personalPmt = totalPmt * (share / 100);

    document.getElementById('disp-calc-pmt-total').innerText = 'Total Monthly Installment: $' + Math.round(totalPmt).toLocaleString();
    document.getElementById('disp-calc-pmt-personal').innerText = `Your Personal Liability (${share}%): $` + Math.round(personalPmt).toLocaleString();
}

function addIncomeStream(name = '', amt = '', start = 60, end = 95) {
    const id = incomeStreamCount++;
    const html = `
        <div class="list-stream income-stream" id="stream-${id}">
            <input type="text" class="is-name" placeholder="Name" value="${name}">
            <input type="text" class="num-format is-amt" id="inp-str-${id}" placeholder="0" value="${amt}" onblur="runSim()">
            <input type="number" class="is-start" value="${start}" onchange="runSim()">
            <input type="number" class="is-end" value="${end}" onchange="runSim()">
            <button class="btn-remove" onclick="document.getElementById('stream-${id}').remove(); runSim();">X</button>
        </div>
    `;
    document.getElementById('income-streams-container').insertAdjacentHTML('beforeend', html);
}

function addMilestone(name = '', amt = '', age = 60) {
    const id = milestoneCount++;
    const html = `
        <div class="milestone-stream" id="milestone-${id}">
            <input type="text" class="ms-name" placeholder="Description" value="${name}">
            <input type="text" class="num-format ms-amt" id="inp-ms-${id}" placeholder="0" value="${amt}" onblur="runSim()">
            <input type="number" class="ms-age" value="${age}" onchange="runSim()">
            <button class="btn-remove" onclick="document.getElementById('milestone-${id}').remove(); runSim();">X</button>
        </div>
    `;
    document.getElementById('milestones-container').insertAdjacentHTML('beforeend', html);
}

// --- V5 Archetypes Engine ---
function loadProfile(type) {
    isLoading = true;
    clearAllInputs();
    document.getElementById('profile-select').value = ""; 
    
    if (type === 'median') {
        setVal('inp-currentAge', 35); setVal('inp-retireAge', 60); setVal('inp-inflation', 3.0); 
        document.getElementById('toggle-global').checked = true; toggleAsset('global');
        setVal('inp-usdStart', 20000); setVal('inp-usdContrib', 1000); setVal('inp-usdRet', 7.0); 
        document.getElementById('toggle-sg').checked = true; toggleAsset('sg');
        setVal('inp-sgdStart', 20000); setVal('inp-sgdContrib', 500); setVal('inp-sgdRet', 4.0); 
        document.getElementById('toggle-cash').checked = true; toggleAsset('cash');
        setVal('inp-cashStart', 40000);
        document.getElementById('toggle-mortgage').checked = true; toggleAsset('mortgage');
        document.getElementById('loan-hdb').checked = true;
        setVal('inp-mortgageSimple', 1872); setVal('inp-mortgagePrincipal', 350000); setVal('inp-loanYrs', 20);
        document.getElementById('inp-maxOA').checked = true; toggleCustomOA();
        setVal('inp-oaStart', 25000); setVal('inp-oaContrib', 1872); 
        setVal('inp-expenses', 2500);
    } 
    else if (type === 'coast') {
        setVal('inp-currentAge', 28); setVal('inp-retireAge', 45); setVal('inp-inflation', 3.0); 
        document.getElementById('toggle-global').checked = true; toggleAsset('global');
        setVal('inp-usdStart', 150000); setVal('inp-usdContrib', 2500); setVal('inp-usdRet', 8.0); 
        document.getElementById('toggle-cash').checked = true; toggleAsset('cash');
        setVal('inp-cashStart', 60000);
        setVal('inp-expenses', 3000);
    }
    else if (type === 'dink') {
        setVal('inp-currentAge', 32); setVal('inp-retireAge', 55); setVal('inp-inflation', 3.5); 
        document.getElementById('toggle-global').checked = true; toggleAsset('global');
        setVal('inp-usdStart', 80000); setVal('inp-usdContrib', 3000); setVal('inp-usdRet', 7.5); 
        document.getElementById('toggle-cash').checked = true; toggleAsset('cash');
        setVal('inp-cashStart', 100000);
        document.getElementById('toggle-mortgage').checked = true; toggleAsset('mortgage');
        document.getElementById('toggle-mortgage-partner').checked = true; toggleMortgagePartner();
        document.getElementById('loan-bank').checked = true;
        setVal('inp-mortgageSimple', 4500); setVal('inp-mortgagePrincipal', 1200000); setVal('inp-loanYrs', 25); setVal('inp-mortgageShare', 50);
        setVal('inp-oaContrib', 1200); 
        document.getElementById('toggle-expense-partner').checked = true; toggleExpensePartner();
        setVal('inp-expenses', 8000); setVal('inp-expenseShare', 50);
    }
    else if (type === 'conservative') {
        setVal('inp-currentAge', 42); setVal('inp-retireAge', 65); setVal('inp-inflation', 2.5); 
        document.getElementById('toggle-sg').checked = true; toggleAsset('sg');
        setVal('inp-sgdStart', 100000); setVal('inp-sgdContrib', 800); setVal('inp-sgdRet', 5.0); 
        document.getElementById('toggle-cash').checked = true; toggleAsset('cash');
        setVal('inp-cashStart', 50000); setVal('inp-cashYield', 1.5);
        document.getElementById('toggle-sa').checked = true; toggleAsset('sa');
        setVal('inp-saStart', 120000); setVal('inp-saContrib', 400);
        document.getElementById('toggle-mortgage').checked = true; toggleAsset('mortgage');
        document.getElementById('loan-hdb').checked = true;
        setVal('inp-mortgageSimple', 1200); setVal('inp-mortgagePrincipal', 200000); setVal('inp-loanYrs', 15);
        setVal('inp-oaStart', 40000); setVal('inp-oaContrib', 1000); 
        setVal('inp-expenses', 4000);
        
        document.getElementById('mode-advanced').checked = true;
        setMode('advanced');
    }
    
    calcLiveMortgage();
    isLoading = false;
    runSim();
}

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
    const banner = document.getElementById('preset-banner');
    document.getElementById('preset-banner-text').innerText = msg;
    banner.style.display = 'flex';
    runSim();
}

// --- Monte Carlo Math Engine ---
function randn_bm() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function rand_t5_scaled() {
    let z = randn_bm();
    let v = Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2) + Math.pow(randn_bm(), 2);
    let t = z / Math.sqrt(v / 5);
    return t * Math.sqrt(3/5); 
}

function getRand(isBlackSwan) {
    return isBlackSwan ? rand_t5_scaled() : randn_bm();
}

// --- Core Simulation Logic ---
function simulatePath(inputs, isMonteCarlo) {
    let { currentAge, retireAge, inflation, inflVol, inflateContribs, 
          fx, fxDrift, fxVol,
          hasGlobal, usdStart, usdContrib, usdRet, usdVol,
          hasSG, sgdStart, sgdContrib, sgdRet, sgdVol,
          hasCash, cashStart, cashYield, 
          hasSA, saStart, saContrib,
          hasMortgage, simpleMortgage, mortgagePrincipal, mortgageRate, mortgageVol, mortgageShare, isMaxOA, customOACap, loanYrs, oaStart, oaContrib,
          expenses, expenseShare, incomeStreams, milestones, isAdvanced, isBlackSwan } = inputs;
    
    let usdPort = hasGlobal ? usdStart : 0;
    let sgdPort = hasSG ? sgdStart : 0;
    let cashRes = hasCash ? cashStart : 0;
    let saBal = hasSA ? saStart : 0;
    let oaBal = oaStart;
    
    let mortgageEndAge = currentAge + loanYrs;
    let currentUsdContrib = hasGlobal ? usdContrib : 0;
    let currentSgdContrib = hasSG ? sgdContrib : 0;
    let currentOaContrib = oaContrib; 
    let currentSaContrib = hasSA ? saContrib : 0;
    let currentExpenses = expenses;
    let currentFx = fx;
    
    let remPrincipal = mortgagePrincipal;

    let pathData = [];
    let phaseMap = [];
    let solvent = true;
    let depletionAge = null;
    let warnings = new Set();
    let peakNW = 0;

    for (let age = currentAge; age <= 95; age++) {
        
        let actualInfl = inflation;
        let actualUsdRet = usdRet;
        let actualSgdRet = sgdRet;
        let actualFxDrift = fxDrift;
        let actualMortgageRate = mortgageRate;

        if (isMonteCarlo) {
            actualInfl = inflation + (getRand(isBlackSwan) * inflVol);
            actualUsdRet = usdRet + (getRand(isBlackSwan) * usdVol);
            actualSgdRet = sgdRet + (getRand(isBlackSwan) * sgdVol);
            actualFxDrift = fxDrift + (getRand(isBlackSwan) * fxVol);
            actualMortgageRate = Math.max(0, mortgageRate + (getRand(isBlackSwan) * mortgageVol)); 
        }

        if (age > currentAge) {
            currentExpenses *= (1 + actualInfl);
            currentFx *= (1 + actualFxDrift);
            if (inflateContribs) {
                currentUsdContrib *= (1 + actualInfl);
                currentSgdContrib *= (1 + actualInfl);
                if (isAdvanced) {
                    currentOaContrib *= (1 + actualInfl);
                    currentSaContrib *= (1 + actualInfl);
                }
            }
        }

        let isWorking = age < retireAge;
        let isMortgageActive = age < mortgageEndAge && hasMortgage;
        
        let currentTotalMortgage = 0;
        let currentPersonalMortgage = 0;
        
        if (isMortgageActive) {
            if (isAdvanced) {
                currentTotalMortgage = calcPmt(remPrincipal, actualMortgageRate, mortgageEndAge - age);
            } else {
                currentTotalMortgage = simpleMortgage;
            }
            currentPersonalMortgage = currentTotalMortgage * (mortgageShare / 100);
        }

        // Process Milestone Events at start of year
        milestones.forEach(m => {
            if (age === m.age) {
                if (m.amt > 0) { // Windfall
                    cashRes += m.amt;
                } else if (m.amt < 0) { // Expense
                    let draw = Math.abs(m.amt);
                    let liquid = cashRes + sgdPort + (usdPort * currentFx);
                    if (liquid >= draw) {
                        let cRatio = cashRes / liquid;
                        let sRatio = sgdPort / liquid;
                        let uRatio = (usdPort * currentFx) / liquid;
                        cashRes -= draw * cRatio;
                        sgdPort -= draw * sRatio;
                        usdPort -= (draw * uRatio) / currentFx;
                    } else {
                        cashRes = 0; sgdPort = 0; usdPort = 0;
                    }
                }
            }
        });

        for (let m = 1; m <= 12; m++) {
            usdPort *= (1 + (actualUsdRet / 12));
            sgdPort *= (1 + (actualSgdRet / 12));
            cashRes *= (1 + (cashYield / 12));
            saBal *= (1 + (0.04 / 12)); // Statutory 4% floor
            oaBal *= (1 + (0.025 / 12));

            let mortgageShortfall = 0;

            if (isWorking) {
                oaBal += currentOaContrib;
                saBal += currentSaContrib;
                
                if (isMortgageActive && currentTotalMortgage > 0) {
                    if (isAdvanced) {
                        let interestPayment = remPrincipal * (actualMortgageRate / 12);
                        remPrincipal = Math.max(0, remPrincipal - (currentTotalMortgage - interestPayment));
                    }

                    let targetOaPay = currentPersonalMortgage;
                    
                    if (!isAdvanced) {
                        oaBal += currentPersonalMortgage; 
                    } else if (!isMaxOA) {
                        targetOaPay = Math.min(customOACap, currentPersonalMortgage);
                    }
                    
                    if (oaBal >= targetOaPay) {
                        oaBal -= targetOaPay;
                        mortgageShortfall = currentPersonalMortgage - targetOaPay;
                    } else {
                        mortgageShortfall = currentPersonalMortgage - oaBal;
                        oaBal = 0;
                    }
                }

                let totalContribSGD = currentSgdContrib + (currentUsdContrib * currentFx);
                
                if (mortgageShortfall > totalContribSGD) {
                    let excessShortfall = mortgageShortfall - totalContribSGD;
                    cashRes -= excessShortfall;
                    if (totalContribSGD > 0 && isAdvanced) warnings.add("Mortgage completely consumed monthly investments. Dipping into cash reserves.");
                } else if (totalContribSGD > 0) {
                    let effectiveContribSGD = totalContribSGD - mortgageShortfall;
                    let usdRatio = (currentUsdContrib * currentFx) / totalContribSGD;
                    let sgdRatio = currentSgdContrib / totalContribSGD;
                    
                    usdPort += (effectiveContribSGD * usdRatio) / currentFx;
                    sgdPort += (effectiveContribSGD * sgdRatio);
                }
            } else {
                // Retired
                let grossSpending = currentExpenses * (expenseShare / 100);
                
                if (isMortgageActive && currentTotalMortgage > 0) {
                    if (isAdvanced) {
                        let interestPayment = remPrincipal * (actualMortgageRate / 12);
                        remPrincipal = Math.max(0, remPrincipal - (currentTotalMortgage - interestPayment));
                    }

                    if (oaBal >= currentPersonalMortgage) {
                        oaBal -= currentPersonalMortgage;
                    } else {
                        grossSpending += (currentPersonalMortgage - oaBal);
                        oaBal = 0;
                    }
                }

                let retirementIncome = 0;
                incomeStreams.forEach(st => {
                    if (age >= st.start && age <= st.end) retirementIncome += st.amt;
                });

                let netWithdrawal = Math.max(0, grossSpending - retirementIncome);

                if (netWithdrawal > 0) {
                    let includeSA = age >= 55;
                    let totalLiquidSGD = cashRes + sgdPort + (usdPort * currentFx) + (includeSA ? saBal : 0);
                    
                    if (totalLiquidSGD >= netWithdrawal) {
                        let cashRatio = cashRes / totalLiquidSGD;
                        let sgdRatio = sgdPort / totalLiquidSGD;
                        let usdRatio = (usdPort * currentFx) / totalLiquidSGD;
                        let saRatio = includeSA ? (saBal / totalLiquidSGD) : 0;

                        cashRes -= netWithdrawal * cashRatio;
                        sgdPort -= netWithdrawal * sgdRatio;
                        usdPort -= (netWithdrawal * usdRatio) / currentFx;
                        if (includeSA) saBal -= netWithdrawal * saRatio;
                    } else {
                        cashRes = 0; sgdPort = 0; usdPort = 0; if (includeSA) saBal = 0;
                    }
                }
            }
            
            let totalLiquid = cashRes + sgdPort + (usdPort * currentFx) + saBal;
            if (totalLiquid > peakNW) peakNW = totalLiquid;
            
            if (totalLiquid < 0 && solvent) {
                solvent = false;
                depletionAge = age;
            }
            if (!solvent) { cashRes = 0; sgdPort = 0; usdPort = 0; saBal = 0; }
        }

        let phase = 1;
        if (!isWorking && isMortgageActive) phase = 2; 
        if (!isWorking && !isMortgageActive) phase = 3;

        let totalLiquidSGD = cashRes + sgdPort + (usdPort * currentFx) + saBal;
        pathData.push({ age, val: totalLiquidSGD });
        phaseMap.push(phase);
    }

    return { pathData, phaseMap, solvent, depletionAge, peakNW, warnings: Array.from(warnings) };
}

// --- V5 Auto-Solver Engine ---
function runAutoSolver() {
    let baseInputs = getState().inputs;
    let resultsDiv = document.getElementById('autosolver-results');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div style="font-size:0.85rem; color:#d97706;">Calculating solutions...</div>';

    setTimeout(() => {
        let options = [];

        // 1. Solve by adjusting Monthly Contributions (USD)
        let test1 = JSON.parse(JSON.stringify(baseInputs));
        let originalContrib = test1.usdContrib;
        for (let c = originalContrib + 100; c <= 20000; c += 100) {
            test1.usdContrib = c;
            let r = simulatePath(test1, false);
            if (r.solvent) {
                options.push({ text: `📈 Invest an extra $${(c - originalContrib).toLocaleString()}/mo globally`, action: () => { setVal('inp-usdContrib', c); runSim(); } });
                break;
            }
        }

        // 2. Solve by delaying Retirement Age
        let test2 = JSON.parse(JSON.stringify(baseInputs));
        let originalRet = test2.retireAge;
        for (let a = originalRet + 1; a <= 80; a += 1) {
            test2.retireAge = a;
            let r = simulatePath(test2, false);
            if (r.solvent) {
                options.push({ text: `⏳ Delay retirement by ${a - originalRet} years (Retire at ${a})`, action: () => { setVal('inp-retireAge', a); runSim(); } });
                break;
            }
        }

        // 3. Solve by cutting Expenses
        let test3 = JSON.parse(JSON.stringify(baseInputs));
        let originalExp = test3.expenses;
        for (let e = originalExp - 100; e >= 500; e -= 100) {
            test3.expenses = e;
            let r = simulatePath(test3, false);
            if (r.solvent) {
                options.push({ text: `📉 Cut target household spending by $${(originalExp - e).toLocaleString()}/mo`, action: () => { setVal('inp-expenses', e); runSim(); } });
                break;
            }
        }

        let html = '<div style="font-size:0.85rem; margin-bottom:0.5rem; color:#92400e;">To fix your plan, do <strong>one</strong> of the following:</div>';
        if (options.length === 0) {
            html = '<div style="font-size:0.85rem; color:#dc2626;">We could not find a simple mathematical fix. You may need a severe combination of cutting expenses and delaying retirement.</div>';
        } else {
            options.forEach((opt, index) => {
                window[`solveOption${index}`] = opt.action;
                html += `
                    <div class="solver-option" onclick="window['solveOption${index}']()">
                        <span class="solver-opt-text">${opt.text}</span>
                        <span class="solver-opt-btn">Apply</span>
                    </div>
                `;
            });
        }
        resultsDiv.innerHTML = html;
    }, 50); 
}

function runSim() {
    if (isLoading) return;
    updateContexts(); 

    const isAdvanced = document.body.className.includes('advanced-mode');
    const hasGlobal = document.getElementById('toggle-global').checked;
    const hasSG = document.getElementById('toggle-sg').checked;
    const hasCash = document.getElementById('toggle-cash').checked;
    const hasSA = document.getElementById('toggle-sa').checked;
    const hasMortgage = document.getElementById('toggle-mortgage').checked;
    const isBlackSwan = isAdvanced ? document.getElementById('inp-blackSwan').checked : false;
    
    const hasMortgagePartner = document.getElementById('toggle-mortgage-partner').checked;
    const hasExpensePartner = document.getElementById('toggle-expense-partner').checked;

    const inputs = {
        isAdvanced: isAdvanced,
        isBlackSwan: isBlackSwan,
        currentAge: getVal('inp-currentAge'),
        retireAge: getVal('inp-retireAge'),
        inflation: getVal('inp-inflation') / 100,
        inflVol: isAdvanced ? getVal('inp-inflVol') / 100 : 0,
        inflateContribs: document.getElementById('inp-inflateContribs').checked,
        fx: getVal('inp-fx') || 1.35,
        fxDrift: isAdvanced ? getVal('inp-fxDrift') / 100 : 0,
        fxVol: isAdvanced ? getVal('inp-fxVol') / 100 : 0,
        hasGlobal: hasGlobal,
        usdStart: getVal('inp-usdStart'),
        usdContrib: getVal('inp-usdContrib'),
        usdRet: getVal('inp-usdRet') / 100,
        usdVol: isAdvanced ? getVal('inp-usdVol') / 100 : 0,
        hasSG: hasSG,
        sgdStart: getVal('inp-sgdStart'),
        sgdContrib: getVal('inp-sgdContrib'),
        sgdRet: getVal('inp-sgdRet') / 100,
        sgdVol: isAdvanced ? getVal('inp-sgdVol') / 100 : 0,
        hasCash: hasCash,
        cashStart: getVal('inp-cashStart'),
        cashYield: getVal('inp-cashYield') / 100,
        hasSA: hasSA,
        saStart: getVal('inp-saStart'),
        saContrib: getVal('inp-saContrib'),
        hasMortgage: hasMortgage,
        simpleMortgage: getVal('inp-mortgageSimple'),
        mortgagePrincipal: getVal('inp-mortgagePrincipal'),
        mortgageRate: getVal('inp-mortgageRate') / 100,
        mortgageVol: isAdvanced ? getVal('inp-mortgageVol') / 100 : 0,
        loanYrs: getVal('inp-loanYrs'),
        mortgageShare: hasMortgagePartner ? getVal('inp-mortgageShare') : 100,
        isMaxOA: isAdvanced ? document.getElementById('inp-maxOA').checked : true,
        customOACap: isAdvanced ? getVal('inp-customOACap') : 0,
        oaStart: isAdvanced ? getVal('inp-oaStart') : 0,
        oaContrib: isAdvanced ? getVal('inp-oaContrib') : 0,
        expenses: getVal('inp-expenses'),
        expenseShare: hasExpensePartner ? getVal('inp-expenseShare') : 100,
        showFireCurve: document.getElementById('inp-showFireCurve').checked,
        swrOverride: isAdvanced ? document.getElementById('inp-swrOverride').checked : false,
        swrMultiple: isAdvanced ? (getVal('inp-swrMultiple') || 25) : 25,
        incomeStreams: [],
        milestones: []
    };

    let effectiveExpenses = inputs.expenses * (inputs.expenseShare / 100);
    document.getElementById('expense-share-readout').innerText = 'The simulator will draw down: $' + Math.round(effectiveExpenses).toLocaleString() + '/mo';

    if(isAdvanced) {
        document.querySelectorAll('.income-stream').forEach(row => {
            inputs.incomeStreams.push({
                amt: getVal(row.querySelector('.is-amt').id) || parseFloat(row.querySelector('.is-amt').value.replace(/,/g, '')) || 0,
                start: parseFloat(row.querySelector('.is-start').value) || 0,
                end: parseFloat(row.querySelector('.is-end').value) || 0
            });
        });
        document.querySelectorAll('.milestone-stream').forEach(row => {
            inputs.milestones.push({
                amt: getVal(row.querySelector('.ms-amt').id) || parseFloat(row.querySelector('.ms-amt').value.replace(/,/g, '')) || 0,
                age: parseFloat(row.querySelector('.ms-age').value) || 0
            });
        });
    }

    // --- Dynamic SWR Engine ---
    let totalBal = (inputs.hasGlobal ? inputs.usdStart * inputs.fx : 0) + 
                   (inputs.hasSG ? inputs.sgdStart : 0) + 
                   (inputs.hasCash ? inputs.cashStart : 0) + 
                   (inputs.hasSA ? inputs.saStart : 0);
    
    let nomRet = 0;
    if (totalBal > 0) {
        nomRet = (((inputs.hasGlobal ? inputs.usdStart * inputs.fx : 0) / totalBal) * inputs.usdRet + ((inputs.hasSG ? inputs.sgdStart : 0) / totalBal) * inputs.sgdRet + ((inputs.hasCash ? inputs.cashStart : 0) / totalBal) * inputs.cashYield + ((inputs.hasSA ? inputs.saStart : 0) / totalBal) * 0.04);
    } else {
        nomRet = inputs.usdRet;
    }

    let realRet = (1 + nomRet) / (1 + inputs.inflation) - 1;
    let duration = Math.max(1, 95 - inputs.retireAge);
    let calcMultiple = 0;
    if (Math.abs(realRet) < 0.0001) calcMultiple = duration;
    else calcMultiple = (1 - Math.pow(1 + realRet, -duration)) / realRet;
    
    let targetMultiple = inputs.swrOverride ? inputs.swrMultiple : calcMultiple;
    document.getElementById('swr-readout').innerText = `Calculated Multiple: ${calcMultiple.toFixed(1)}x (Based on your ${(realRet*100).toFixed(1)}% Real Return over ${duration} years)`;

    // --- Generate Escape Velocity Curve ---
    let fireCurveData = [];
    let targetAtRetirement = 0;

    for (let age = inputs.currentAge; age <= 95; age++) {
        let yrs = Math.max(0, age - inputs.currentAge);
        let infExp = inputs.expenses * Math.pow(1 + inputs.inflation, yrs);
        let effExpMonthly = infExp * (inputs.expenseShare / 100);
        
        let remPrincipal = 0;
        if (inputs.hasMortgage && age < inputs.currentAge + inputs.loanYrs) {
            let mYrs = (inputs.currentAge + inputs.loanYrs) - age;
            if (inputs.isAdvanced) {
                let r = inputs.mortgageRate / 12;
                let pmt = calcPmt(inputs.mortgagePrincipal, inputs.mortgageRate, inputs.loanYrs);
                remPrincipal = r === 0 ? pmt * (mYrs * 12) : (pmt / r) * (1 - Math.pow(1+r, -(mYrs * 12)));
            } else {
                remPrincipal = (inputs.simpleMortgage) * (mYrs * 12); 
            }
        }
        
        let personalRemPrincipal = remPrincipal * (inputs.mortgageShare / 100);
        let target = (effExpMonthly * 12 * targetMultiple) + personalRemPrincipal;
        
        if (age === inputs.retireAge) targetAtRetirement = target;
        fireCurveData.push(target);
    }

    let sysWarnings = new Set();
    if (inputs.inflation >= Math.max(inputs.usdRet, inputs.sgdRet) && (inputs.hasGlobal || inputs.hasSG)) sysWarnings.add("Inflation exceeds expected portfolio returns. Real growth is negative.");

    const isMC = document.getElementById('inp-mcToggle').checked && isAdvanced;
    
    let labels = [];
    let datasets = [];
    let finalWarnings = Array.from(sysWarnings);
    
    let elTargetAge = document.getElementById('val-targetAge');
    let elHeroExp = document.getElementById('val-heroExp');
    let elFireNumber = document.getElementById('val-fireNumber');
    let elFireAge = document.getElementById('val-fireAge');
    let elPeak = document.getElementById('val-peak');
    let elStatus = document.getElementById('val-statusText');
    let elStatusSub = document.getElementById('val-statusSub');
    let cardStatus = document.getElementById('hero-status');
    let diagPanel = document.getElementById('diagnostic-panel');

    elTargetAge.innerText = inputs.retireAge > 0 ? 'Age ' + inputs.retireAge : '--';
    elHeroExp.innerText = '$' + Math.round(effectiveExpenses).toLocaleString();
    elFireNumber.innerText = '$' + (targetAtRetirement / 1000000).toFixed(2) + 'M';
    elFireAge.innerText = inputs.retireAge;
    
    if (inputs.currentAge > 0) {
        for(let i=inputs.currentAge; i<=95; i++) labels.push(i);

        if (!isMC) {
            let res = simulatePath(inputs, false);
            let p1 = [], p2 = [], p3 = [];
            
            for(let i=0; i<res.pathData.length; i++) {
                let phase = res.phaseMap[i];
                let val = res.pathData[i].val;
                
                p1.push(phase === 1 ? val : null);
                p2.push(phase === 2 ? val : null);
                p3.push(phase === 3 ? val : null);

                if(i > 0) {
                    if(phase === 2 && res.phaseMap[i-1] === 1) p1[i] = val;
                    if(phase === 3 && res.phaseMap[i-1] === 2) p2[i] = val;
                    if(phase === 3 && res.phaseMap[i-1] === 1) p1[i] = val;
                }
            }
            
            datasets = [
                { label: 'Accumulation Phase', data: p1, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.2, spanGaps: true, pointStyle: 'rect' },
                { label: 'Mortgage Drawdown', data: p2, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.2, spanGaps: true, pointStyle: 'rect' },
                { label: 'Debt-Free Retirement', data: p3, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.2, spanGaps: true, pointStyle: 'rect' }
            ];

            if (inputs.showFireCurve) {
                datasets.push({ label: 'FIRE Requirement (Finish Line)', data: fireCurveData, borderColor: '#ef4444', borderDash: [2, 4], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5, pointStyle: 'line' });
            }
                        
            res.warnings.forEach(w => finalWarnings.push(w));

            elPeak.innerText = '$' + (res.peakNW / 1000000).toFixed(2) + 'M';

            if (res.solvent) {
                elStatus.innerText = "✅ Safe to Age 95";
                elStatusSub.innerText = `Ending bal: $${(res.pathData[res.pathData.length-1].val/1000000).toFixed(2)}M`;
                cardStatus.className = 'hero-card success';
                diagPanel.style.display = 'none';
                document.getElementById('autosolver-results').style.display = 'none';
            } else {
                elStatus.innerText = "⚠️ Shortfall";
                elStatusSub.innerText = `Depletes at Age ${res.depletionAge}`;
                cardStatus.className = 'hero-card danger';
                
                diagPanel.style.display = 'block';
                document.getElementById('autosolver-results').style.display = 'none';
                let diagMsg = document.getElementById('diag-message');
                
                if (res.depletionAge <= inputs.retireAge) {
                    diagMsg.innerText = `Your portfolio crashed at Age ${res.depletionAge} before you even retired. Your living costs and debt completely overwhelmed your income.`;
                } else if (inputs.hasMortgage && res.depletionAge <= (inputs.currentAge + inputs.loanYrs)) {
                    diagMsg.innerText = `Your portfolio crashed at Age ${res.depletionAge}. Your investments could not sustain the aggressive double-drain of both your living expenses and your monthly mortgage payments in early retirement.`;
                } else {
                    diagMsg.innerText = `Your portfolio survived until Age ${res.depletionAge}. Over a long ${res.depletionAge - inputs.retireAge}-year retirement, inflation slowly eroded your purchasing power, and your capital eventually ran dry.`;
                }
            }

        } else {
            let runs = getVal('inp-mcRuns') || 100;
            let results = [];
            let successes = 0;
            let medianPeak = 0;
            
            for(let i=0; i<runs; i++) {
                let res = simulatePath(inputs, true);
                results.push(res.pathData.map(d => d.val));
                if (res.solvent) successes++;
                medianPeak += res.peakNW;
                if (i===0) res.warnings.forEach(w => finalWarnings.push(w));
            }
            medianPeak = medianPeak / runs;

            let p10 = [], p50 = [], p90 = [];
            for(let y=0; y<labels.length; y++) {
                let yearVals = results.map(r => r[y]).sort((a,b) => a-b);
                p10.push(yearVals[Math.floor(runs * 0.1)]);
                p50.push(yearVals[Math.floor(runs * 0.5)]);
                p90.push(yearVals[Math.floor(runs * 0.9)]);
            }

            datasets = [
                { label: '90th Percentile (Optimistic)', data: p90, borderColor: '#10b981', borderDash: [5,5], fill: false, tension: 0.2, pointRadius: 0, pointStyle: 'line' },
                { label: 'Median Outcome', data: p50, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.2, borderWidth: 3, pointStyle: 'rect' },
                { label: '10th Percentile (Pessimistic)', data: p10, borderColor: '#f59e0b', borderDash: [5,5], fill: '-1', backgroundColor: 'rgba(245, 158, 11, 0.05)', tension: 0.2, pointRadius: 0, pointStyle: 'line' }
            ];

            if (inputs.showFireCurve) {
                datasets.push({ label: 'FIRE Requirement (Finish Line)', data: fireCurveData, borderColor: '#ef4444', borderDash: [2, 4], fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5, pointStyle: 'line' });
            }

            elPeak.innerText = '$' + (medianPeak / 1000000).toFixed(2) + 'M';
            diagPanel.style.display = 'none';

            let winRate = ((successes / runs) * 100).toFixed(1);
            elStatusSub.innerText = `${runs} Monte Carlo sims`;
            if (winRate >= 90) {
                elStatus.innerText = `✅ ${winRate}% Success`;
                cardStatus.className = 'hero-card success';
            } else if (winRate >= 70) {
                elStatus.innerText = `⚠️ ${winRate}% Success`;
                cardStatus.className = 'hero-card warning';
            } else {
                elStatus.innerText = `🛑 ${winRate}% Success`;
                cardStatus.className = 'hero-card danger';
            }
        }
    } else {
        elPeak.innerText = "$0";
        elStatus.innerText = "Awaiting Data";
        elStatusSub.innerText = "Enter age to begin";
        cardStatus.className = 'hero-card';
        document.getElementById('diagnostic-panel').style.display = 'none';
    }
    
    let wHtml = finalWarnings.map(w => `<div class="warning-alert">${w}</div>`).join('');
    document.getElementById('warningsBox').innerHTML = wHtml;

    renderChart(labels, datasets, inputs);
    localStorage.setItem('fireSimState', JSON.stringify(getState()));
}

// --- V5 Chart Event Flags ---
function renderChart(labels, datasets, inputs) {
    const ctx = document.getElementById('fireChart').getContext('2d');
    if (fireChart) fireChart.destroy();
    
    let chartAnnotations = {};
    
    if (inputs && inputs.currentAge > 0) {
        if (inputs.retireAge > inputs.currentAge && inputs.retireAge <= 95) {
            let retireIndex = inputs.retireAge - inputs.currentAge;
            if (retireIndex >= 0 && retireIndex < labels.length) {
                chartAnnotations.lineRetire = {
                    type: 'line', xMin: retireIndex, xMax: retireIndex,
                    borderColor: '#7c3aed', borderDash: [5, 5], borderWidth: 2,
                    label: { display: true, content: 'Retirement Age', position: 'start', backgroundColor: '#7c3aed', color: '#fff', font: {size: 11} }
                };
            }
        }

        if (inputs.isAdvanced && inputs.hasSA && inputs.currentAge <= 55) {
            let idx55 = 55 - inputs.currentAge;
            if (idx55 >= 0 && idx55 < labels.length) {
                chartAnnotations.lineSA = {
                    type: 'line', xMin: idx55, xMax: idx55,
                    borderColor: 'rgba(16, 185, 129, 0.3)', borderWidth: 1,
                    label: { display: true, content: '🎂 SA Unlocks', position: 'end', backgroundColor: 'transparent', color: '#10b981', font: {size: 12} }
                };
            }
        }

        if (inputs.hasMortgage) {
            let mortgageEndAge = inputs.currentAge + inputs.loanYrs;
            if (mortgageEndAge <= 95) {
                let mIdx = mortgageEndAge - inputs.currentAge;
                if (mIdx >= 0 && mIdx < labels.length) {
                    chartAnnotations.lineMortgage = {
                        type: 'line', xMin: mIdx, xMax: mIdx,
                        borderColor: 'rgba(245, 158, 11, 0.3)', borderWidth: 1,
                        label: { display: true, content: '🏠 Mortgage Free', position: 'end', backgroundColor: 'transparent', color: '#f59e0b', font: {size: 12}, yAdjust: 20 }
                    };
                }
            }
        }

        if (inputs.isAdvanced && inputs.milestones) {
            inputs.milestones.forEach((m, i) => {
                if (m.age >= inputs.currentAge && m.age <= 95) {
                    let msIdx = m.age - inputs.currentAge;
                    if (msIdx >= 0 && msIdx < labels.length) {
                        let isExpense = m.amt < 0;
                        chartAnnotations[`milestone_${i}`] = {
                            type: 'line', xMin: msIdx, xMax: msIdx,
                            borderColor: 'rgba(100, 116, 139, 0.3)', borderWidth: 1, borderDash: [2, 2],
                            label: { display: true, content: isExpense ? '✈️' : '💰', position: 'end', backgroundColor: 'transparent', font: {size: 14}, yAdjust: 40 + (i*15) }
                        };
                    }
                }
            });
        }
    }

    fireChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { title: { display: true, text: 'Portfolio Value (SGD)' }, ticks: { callback: v => '$' + (v / 1000000).toFixed(1) + 'M' } }
            },
            plugins: { 
                legend: { labels: { usePointStyle: true, boxWidth: 15 } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': $' + Math.round(c.raw).toLocaleString() } },
                annotation: { annotations: chartAnnotations }
            }
        }
    });
}

// --- Initialization on Load ---
let savedState = localStorage.getItem('fireSimState');
if (savedState) {
    try {
        loadState(JSON.parse(savedState));
    } catch(e) {
        console.error("Failed to parse saved state", e);
    }
}
isLoading = false;
runSim();
