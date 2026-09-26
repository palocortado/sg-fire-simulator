let fireChart;
let incomeStreamCount = 0;
let milestoneCount = 0;
let isLoading = true;
const APP_VERSION = "6.0"; // Updated to bypass old V5 save conflicts

// --- Contextual Slider Coaching Engine ---
function updateContexts() {
    try {
        let retAge = getVal('inp-retireAge');
        let ctxRet = document.getElementById('ctx-retireAge');
        if(ctxRet) {
            if(retAge < 40) ctxRet.innerText = "Extreme early retirement. Requires massive savings rate.";
            else if(retAge < 55) ctxRet.innerText = "Aggressive FIRE. Capital must last 40+ years.";
            else if(retAge <= 65) ctxRet.innerText = "Standard early retirement horizon.";
            else ctxRet.innerText = "Traditional retirement. High success probability.";
        }

        let infl = getVal('inp-inflation');
        let ctxInfl = document.getElementById('ctx-inflation');
        if(ctxInfl) {
            if(infl < 2.0) ctxInfl.innerText = "Highly optimistic. Historically rare over 30 years.";
            else if(infl <= 3.5) ctxInfl.innerText = "Balanced. Aligns with historical global averages.";
            else ctxInfl.innerText = "Pessimistic. Modeling heavy stagflation environments.";
        }

        let gRet = getVal('inp-usdRet');
        let ctxGret = document.getElementById('ctx-usdRet');
        if(ctxGret) {
            if(gRet < 5.0) ctxGret.innerText = "Highly conservative. Assumes near-zero real growth.";
            else if(gRet <= 7.5) ctxGret.innerText = "Balanced. Bakes in a healthy margin of safety.";
            else ctxGret.innerText = "Aggressive. Relies heavily on sustained bull markets.";
        }

        let sRet = getVal('inp-sgdRet');
        let ctxSret = document.getElementById('ctx-sgdRet');
        if(ctxSret) {
            if(sRet < 3.0) ctxSret.innerText = "Conservative. Treating SG equities like bonds.";
            else if(sRet <= 5.0) ctxSret.innerText = "Balanced. Aligns with historical STI yields.";
            else ctxSret.innerText = "Aggressive for a mature, dividend-focused market.";
        }

        let swr = getVal('inp-swrMultiple');
        let ctxSwr = document.getElementById('ctx-swrMultiple');
        if(ctxSwr) {
            if(swr < 25) ctxSwr.innerText = "Aggressive (>4% SWR). High risk of depletion.";
            else if(swr <= 33) ctxSwr.innerText = "Standard FIRE (3% - 4% SWR). Generally safe.";
            else ctxSwr.innerText = "Highly Conservative (<3% SWR). Institutional safety.";
        }
    } catch(e) {}
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
    try {
        let inputs = {
            mode: document.querySelector('input[name="mode"]:checked') ? document.querySelector('input[name="mode"]:checked').value : 'simple',
            
            currentAge: getVal('inp-currentAge'),
            retireAge: getVal('inp-retireAge'),
            inflation: getVal('inp-inflation'),
            inflVol: getVal('inp-inflVol'),
            inflateContribs: document.getElementById('inp-inflateContribs') ? document.getElementById('inp-inflateContribs').checked : false,
            
            hasGlobal: document.getElementById('toggle-global') ? document.getElementById('toggle-global').checked : true,
            usdStart: getVal('inp-usdStart'),
            usdContrib: getVal('inp-usdContrib'),
            usdRet: getVal('inp-usdRet'),
            usdVol: getVal('inp-usdVol'),
            fx: getVal('inp-fx'),
            fxDrift: getVal('inp-fxDrift'),
            fxVol: getVal('inp-fxVol'),

            hasSG: document.getElementById('toggle-sg') ? document.getElementById('toggle-sg').checked : false,
            sgdStart: getVal('inp-sgdStart'),
            sgdContrib: getVal('inp-sgdContrib'),
            sgdRet: getVal('inp-sgdRet'),
            sgdVol: getVal('inp-sgdVol'),

            hasCash: document.getElementById('toggle-cash') ? document.getElementById('toggle-cash').checked : true,
            cashStart: getVal('inp-cashStart'),
            cashYield: getVal('inp-cashYield'),

            hasSA: document.getElementById('toggle-sa') ? document.getElementById('toggle-sa').checked : false,
            saStart: getVal('inp-saStart'),
            saContrib: getVal('inp-saContrib'),

            hasMortgage: document.getElementById('toggle-mortgage') ? document.getElementById('toggle-mortgage').checked : false,
            hasMortgagePartner: document.getElementById('toggle-mortgage-partner') ? document.getElementById('toggle-mortgage-partner').checked : false,
            isHdb: document.getElementById('loan-hdb') ? document.getElementById('loan-hdb').checked : false,
            isBank: document.getElementById('loan-bank') ? document.getElementById('loan-bank').checked : false,
            mortgageSimple: getVal('inp-mortgageSimple'),
            mortgagePrincipal: getVal('inp-mortgagePrincipal'),
            loanYrs: getVal('inp-loanYrs'),
            mortgageRate: getVal('inp-mortgageRate'),
            mortgageVol: getVal('inp-mortgageVol'),
            mortgageShare: getVal('inp-mortgageShare'),
            
            isMaxOA: document.getElementById('inp-maxOA') ? document.getElementById('inp-maxOA').checked : true,
            customOACap: getVal('inp-customOACap'),
            oaStart: getVal('inp-oaStart'),
            oaContrib: getVal('inp-oaContrib'),

            hasExpensePartner: document.getElementById('toggle-expense-partner') ? document.getElementById('toggle-expense-partner').checked : false,
            expenses: getVal('inp-expenses'),
            expenseShare: getVal('inp-expenseShare'),
            showFireCurve: document.getElementById('inp-showFireCurve') ? document.getElementById('inp-showFireCurve').checked : false,
            swrOverride: document.getElementById('inp-swrOverride') ? document.getElementById('inp-swrOverride').checked : false,
            swrMultiple: getVal('inp-swrMultiple'),

            isMC: document.getElementById('inp-mcToggle') ? document.getElementById('inp-mcToggle').checked : false,
            mcRuns: getVal('inp-mcRuns'),
            isBlackSwan: document.getElementById('inp-blackSwan') ? document.getElementById('inp-blackSwan').checked : false,

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
    } catch(e) {
        return { inputs: {} };
    }
}

function loadState(state) {
    if (!state || !state.inputs) return;
    try {
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

        if (p.inflateContribs !== undefined && document.getElementById('inp-inflateContribs')) document.getElementById('inp-inflateContribs').checked = p.inflateContribs;
        if (p.isMaxOA !== undefined && document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = p.isMaxOA;
        if (p.hasMortgagePartner !== undefined && document.getElementById('toggle-mortgage-partner')) document.getElementById('toggle-mortgage-partner').checked = p.hasMortgagePartner;
        if (p.hasExpensePartner !== undefined && document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = p.hasExpensePartner;
        if (p.isBlackSwan !== undefined && document.getElementById('inp-blackSwan')) document.getElementById('inp-blackSwan').checked = p.isBlackSwan;
        if (p.isMC !== undefined && document.getElementById('inp-mcToggle')) document.getElementById('inp-mcToggle').checked = p.isMC;
        if (p.isHdb !== undefined && document.getElementById('loan-hdb')) document.getElementById('loan-hdb').checked = p.isHdb;
        if (p.isBank !== undefined && document.getElementById('loan-bank')) document.getElementById('loan-bank').checked = p.isBank;
        if (p.swrOverride !== undefined && document.getElementById('inp-swrOverride')) document.getElementById('inp-swrOverride').checked = p.swrOverride;
        if (p.showFireCurve !== undefined && document.getElementById('inp-showFireCurve')) document.getElementById('inp-showFireCurve').checked = p.showFireCurve;

        if(document.getElementById('income-streams-container')) {
            document.getElementById('income-streams-container').innerHTML = '';
            if (p.incomeStreams && Array.isArray(p.incomeStreams)) {
                p.incomeStreams.forEach(st => addIncomeStream(st.name, st.amt, st.start, st.end));
            }
        }

        if(document.getElementById('milestones-container')) {
            document.getElementById('milestones-container').innerHTML = '';
            if (p.milestones && Array.isArray(p.milestones)) {
                p.milestones.forEach(m => addMilestone(m.name, m.amt, m.age));
            }
        }

        if (p.swrMultiple === undefined) setVal('inp-swrMultiple', 25);

        toggleMortgagePartner();
        toggleExpensePartner();
        toggleCustomOA();
        toggleSwrOverride();
        calcLiveMortgage();
    } catch(e) {}
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
    try {
        const checkbox = document.getElementById(`toggle-${asset}`);
        const panel = document.getElementById(`asset-${asset}`) || document.getElementById(`${asset}-panel`);
        if(checkbox && panel) {
            panel.style.display = checkbox.checked ? 'block' : 'none';
        }
    } catch(e) {}
    if(!isLoading) runSim();
}

function toggleMortgagePartner() {
    try {
        const el = document.getElementById('toggle-mortgage-partner');
        const panel = document.getElementById('mortgage-partner-panel');
        if(el && panel) {
            panel.style.display = el.checked ? 'block' : 'none';
            if (!el.checked) setVal('inp-mortgageShare', 100);
        }
    } catch(e) {}
}

function toggleExpensePartner() {
    try {
        const el = document.getElementById('toggle-expense-partner');
        const panel = document.getElementById('expense-partner-panel');
        if(el && panel) {
            panel.style.display = el.checked ? 'block' : 'none';
            if (!el.checked) setVal('inp-expenseShare', 100);
        }
    } catch(e) {}
}

function toggleSwrOverride() {
    try {
        const el = document.getElementById('inp-swrOverride');
        if(el) {
            let mult = document.getElementById('inp-swrMultiple');
            let slide = document.getElementById('slide-swrMultiple');
            if(mult) mult.disabled = !el.checked;
            if(slide) slide.disabled = !el.checked;
        }
    } catch(e) {}
}

function toggleCustomOA() {
    try {
        const el = document.getElementById('inp-maxOA');
        const cap = document.getElementById('custom-oa-cap');
        if(el && cap) {
            cap.style.display = el.checked ? 'none' : 'block';
            if (!el.checked) {
                let sharePartner = document.getElementById('toggle-mortgage-partner');
                let share = (sharePartner && sharePartner.checked) ? getVal('inp-mortgageShare') : 100;
                let p = getVal('inp-mortgagePrincipal');
                let y = getVal('inp-loanYrs');
                let r = getVal('inp-mortgageRate') / 100;
                let totalPmt = calcPmt(p, r, y);
                let personalPmt = totalPmt * (share / 100);
                setVal('inp-customOACap', Math.round(personalPmt) || 0);
            }
        }
    } catch(e) {}
    if(!isLoading) runSim();
}

function clearAllInputs() {
    try {
        document.querySelectorAll('input[type="text"]').forEach(el => setVal(el.id, ''));
        
        if(document.getElementById('toggle-global')) document.getElementById('toggle-global').checked = true; toggleAsset('global');
        if(document.getElementById('toggle-sg')) document.getElementById('toggle-sg').checked = false; toggleAsset('sg');
        if(document.getElementById('toggle-cash')) document.getElementById('toggle-cash').checked = true; toggleAsset('cash');
        if(document.getElementById('toggle-sa')) document.getElementById('toggle-sa').checked = false; toggleAsset('sa'); 
        if(document.getElementById('toggle-mortgage')) document.getElementById('toggle-mortgage').checked = false; toggleAsset('mortgage');
        
        if(document.getElementById('toggle-mortgage-partner')) document.getElementById('toggle-mortgage-partner').checked = false; toggleMortgagePartner();
        if(document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = false; toggleExpensePartner();
        
        if(document.getElementById('inp-showFireCurve')) document.getElementById('inp-showFireCurve').checked = false;
        if(document.getElementById('inp-swrOverride')) document.getElementById('inp-swrOverride').checked = false; toggleSwrOverride();
        
        if(document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = true; toggleCustomOA();
        if(document.getElementById('inp-inflateContribs')) document.getElementById('inp-inflateContribs').checked = false;
        
        if(document.body.className.includes('advanced-mode')) {
             if(document.getElementById('inp-blackSwan')) document.getElementById('inp-blackSwan').checked = false;
             if(document.getElementById('inp-mcToggle')) document.getElementById('inp-mcToggle').checked = false;
        }
        
        if(document.getElementById('income-streams-container')) document.getElementById('income-streams-container').innerHTML = '';
        if(document.getElementById('milestones-container')) document.getElementById('milestones-container').innerHTML = '';
        if(document.getElementById('mortgage-readout-box')) document.getElementById('mortgage-readout-box').style.display = 'none';
        if(document.getElementById('diagnostic-panel')) document.getElementById('diagnostic-panel').style.display = 'none';
        
        setVal('inp-inflation', 3.0); 
        setVal('inp-usdRet', 7.0); 
        setVal('inp-sgdRet', 4.0); 
        setVal('inp-fx', 1.35);
        setVal('inp-fxDrift', 0.0);
        setVal('inp-cashYield', 1.5);
        setVal('inp-mortgageRate', 2.6);
        setVal('inp-mortgageShare', 100);
        setVal('inp-expenseShare', 100);
        setVal('inp-swrMultiple', 25);

        if(document.getElementById('loan-hdb') && document.getElementById('loan-hdb').checked) {
            if(document.getElementById('slide-mortgageRate')) document.getElementById('slide-mortgageRate').disabled = true;
        }

        localStorage.removeItem('fireSimState_v5');
    } catch(e) {}
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
    try {
        let isAdvanced = document.body.className.includes('advanced-mode');
        let tMort = document.getElementById('toggle-mortgage');
        let hasMortgage = tMort ? tMort.checked : false;
        let pmtBox = document.getElementById('mortgage-readout-box');
        
        if(pmtBox) {
            if(!hasMortgage || !isAdvanced) {
                pmtBox.style.display = 'none';
                return;
            } else {
                pmtBox.style.display = 'block';
            }
        }

        let loanHdb = document.getElementById('loan-hdb');
        let isHdb = loanHdb ? loanHdb.checked : false;
        let rateInput = document.getElementById('inp-mortgageRate');
        let rateSlider = document.getElementById('slide-mortgageRate');
        let ttText = document.getElementById('tt-text-mortgageRate');

        if(isHdb) {
            setVal('inp-mortgageRate', 2.6);
            if(rateInput) rateInput.disabled = true;
            if(rateSlider) rateSlider.disabled = true;
            if(ttText) ttText.innerText = "HDB rate is pegged at 0.1% above the prevailing CPF OA interest rate.";
        } else {
            if(rateInput) rateInput.disabled = false;
            if(rateSlider) rateSlider.disabled = false;
            if(getVal('inp-mortgageRate') === 2.6) setVal('inp-mortgageRate', 1.8);
            if(ttText) ttText.innerText = "Defaulted to 1.8%, reflecting the ~20-year historical average of the 3-Month SIBOR/SORA.";
        }

        let p = getVal('inp-mortgagePrincipal');
        let y = getVal('inp-loanYrs');
        let r = getVal('inp-mortgageRate') / 100;
        
        let totalPmt = calcPmt(p, r, y);
        let mortPartner = document.getElementById('toggle-mortgage-partner');
        let share = (mortPartner && mortPartner.checked) ? getVal('inp-mortgageShare') : 100;
        let personalPmt = totalPmt * (share / 100);

        if(document.getElementById('disp-calc-pmt-total')) document.getElementById('disp-calc-pmt-total').innerText = 'Total Monthly Installment: $' + Math.round(totalPmt).toLocaleString();
        if(document.getElementById('disp-calc-pmt-personal')) document.getElementById('disp-calc-pmt-personal').innerText = `Your Personal Liability (${share}%): $` + Math.round(personalPmt).toLocaleString();
    } catch(e) {}
}

function addIncomeStream(name = '', amt = '', start = 60, end = 95) {
    if(!document.getElementById('income-streams-container')) return;
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
    if(!document.getElementById('milestones-container')) return;
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

// --- New V6 Archetypes Engine ---
function loadProfile(type) {
    isLoading = true;
    
    document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (type === 'young_starter') {
        setVal('inp-currentAge', 28); setVal('inp-retireAge', 55); setVal('inp-expenses', 3500);
        if(document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = false;
        setVal('inp-invStart', 10000); setVal('inp-invContrib', 500); setVal('inp-invRet', 5.0); 
        setVal('inp-cashStart', 20000); setVal('inp-cashContrib', 1000);
        if(document.getElementById('toggle-mortgage')) document.getElementById('toggle-mortgage').checked = false;
        if(document.getElementById('toggle-sa')) document.getElementById('toggle-sa').checked = false;
    } 
    else if (type === 'hdb_couple' || type === 'median') {
        setVal('inp-currentAge', 30); setVal('inp-retireAge', 55); setVal('inp-expenses', 5000);
        if(document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = true; 
        setVal('inp-expenseShare', 50);
        setVal('inp-invStart', 30000); setVal('inp-invContrib', 1000); setVal('inp-invRet', 4.5); 
        setVal('inp-cashStart', 40000); setVal('inp-cashContrib', 1000);
        if(document.getElementById('toggle-mortgage')) document.getElementById('toggle-mortgage').checked = true;
        setVal('inp-mortgagePrincipal', 420000); setVal('inp-loanYrs', 23); setVal('inp-mortgageRate', 2.6); setVal('inp-mortgageShare', 50);
        if(document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = true; 
        setVal('inp-oaStart', 20000); setVal('inp-oaContrib', 1400);
        if(document.getElementById('toggle-sa')) document.getElementById('toggle-sa').checked = false;
    } 
    else if (type === 'growing_family') {
        setVal('inp-currentAge', 35); setVal('inp-retireAge', 60); setVal('inp-expenses', 8500);
        if(document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = true; 
        setVal('inp-expenseShare', 50);
        setVal('inp-invStart', 120000); setVal('inp-invContrib', 1500); setVal('inp-invRet', 4.5); 
        setVal('inp-cashStart', 80000); setVal('inp-cashContrib', 700);
        if(document.getElementById('toggle-mortgage')) document.getElementById('toggle-mortgage').checked = true;
        setVal('inp-mortgagePrincipal', 1100000); setVal('inp-loanYrs', 24); setVal('inp-mortgageRate', 2.8); setVal('inp-mortgageShare', 50);
        if(document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = true; 
        setVal('inp-oaStart', 35000); setVal('inp-oaContrib', 1500);
        if(document.getElementById('toggle-sa')) document.getElementById('toggle-sa').checked = false;
    } 
    else if (type === 'pragmatic_saver' || type === 'conservative') {
        setVal('inp-currentAge', 42); setVal('inp-retireAge', 60); setVal('inp-expenses', 2800);
        if(document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = false;
        setVal('inp-invStart', 20000); setVal('inp-invContrib', 0); setVal('inp-invRet', 4.0); 
        setVal('inp-cashStart', 60000); setVal('inp-cashContrib', 2500);
        if(document.getElementById('toggle-mortgage')) document.getElementById('toggle-mortgage').checked = true;
        setVal('inp-mortgagePrincipal', 120000); setVal('inp-loanYrs', 10); setVal('inp-mortgageRate', 2.6); setVal('inp-mortgageShare', 100);
        if(document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = true; 
        setVal('inp-oaStart', 30000); setVal('inp-oaContrib', 1200);
        if(document.getElementById('toggle-sa')) document.getElementById('toggle-sa').checked = true; 
        setVal('inp-saStart', 140000); setVal('inp-saContrib', 500);
    } 
    else if (type === 'self_employed') {
        setVal('inp-currentAge', 36); setVal('inp-retireAge', 58); setVal('inp-expenses', 3200);
        if(document.getElementById('toggle-expense-partner')) document.getElementById('toggle-expense-partner').checked = false;
        setVal('inp-invStart', 70000); setVal('inp-invContrib', 1000); setVal('inp-invRet', 5.0); 
        setVal('inp-cashStart', 75000); setVal('inp-cashContrib', 8000);
        if(document.getElementById('toggle-mortgage')) document.getElementById('toggle-mortgage').checked = true;
        setVal('inp-mortgagePrincipal', 320000); setVal('inp-loanYrs', 23); setVal('inp-mortgageRate', 2.6); setVal('inp-mortgageShare', 50);
        if(document.getElementById('inp-maxOA')) document.getElementById('inp-maxOA').checked = true; 
        setVal('inp-oaStart', 30000); setVal('inp-oaContrib', 0);
        if(document.getElementById('toggle-sa')) document.getElementById('toggle-sa').checked = false;
    }
    
    let tp = document.getElementById('toggle-expense-partner');
    if(tp) document.getElementById('expense-partner-panel').style.display = tp.checked ? 'block' : 'none';
    let tm = document.getElementById('toggle-mortgage');
    if(tm) document.getElementById('mortgage-panel').style.display = tm.checked ? 'block' : 'none';

    calcLiveMortgage();
    isLoading = false;
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
    if(banner) {
        if(document.getElementById('preset-banner-text')) document.getElementById('preset-banner-text').innerText = msg;
        banner.style.display = 'flex';
    }
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
          hasCash, cashStart, cashContrib, cashYield, 
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
    let currentCashContrib = hasCash ? cashContrib : 0;
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
                currentCashContrib *= (1 + actualInfl);
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
            currentTotalMortgage = calcPmt(remPrincipal, actualMortgageRate, mortgageEndAge - age);
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
                        if (solvent) { solvent = false; depletionAge = age; }
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
                cashRes += currentCashContrib;
                
                if (isMortgageActive && currentTotalMortgage > 0) {
                    let interestPayment = remPrincipal * (actualMortgageRate / 12);
                    remPrincipal = Math.max(0, remPrincipal - (currentTotalMortgage - interestPayment));

                    let targetOaPay = currentPersonalMortgage;
                    if (!isMaxOA) targetOaPay = Math.min(customOACap, currentPersonalMortgage);
                    
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
                    let interestPayment = remPrincipal * (actualMortgageRate / 12);
                    remPrincipal = Math.max(0, remPrincipal - (currentTotalMortgage - interestPayment));

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
                        if (solvent) { solvent = false; depletionAge = age; }
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
    if(!resultsDiv) return;
    
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

// Safely update DOM text
function updateDOM(id, val, isHTML=false) {
    let el = document.getElementById(id);
    if (el) {
        if (isHTML) el.innerHTML = val;
        else el.innerText = val;
    }
}

function runSim() {
    if (isLoading) return;
    updateContexts(); 

    const isAdvanced = document.body.className.includes('advanced-mode');
    
    // SAFE CHECKS: Allows new UI without crashing math engine
    const toggleGlobal = document.getElementById('toggle-global');
    const toggleSG = document.getElementById('toggle-sg');
    const toggleCash = document.getElementById('toggle-cash');
    const toggleSA = document.getElementById('toggle-sa');
    const toggleMortgage = document.getElementById('toggle-mortgage');
    const inpBlackSwan = document.getElementById('inp-blackSwan');
    const toggleMortgagePartner = document.getElementById('toggle-mortgage-partner');
    const toggleExpensePartner = document.getElementById('toggle-expense-partner');
    const inpMaxOA = document.getElementById('inp-maxOA');
    const inpInflateContribs = document.getElementById('inp-inflateContribs');
    const inpShowFireCurve = document.getElementById('inp-showFireCurve');
    const inpSwrOverride = document.getElementById('inp-swrOverride');
    
    const hasGlobal = toggleGlobal ? toggleGlobal.checked : true;
    const hasSG = toggleSG ? toggleSG.checked : false;
    const hasCash = toggleCash ? toggleCash.checked : true;
    const hasSA = toggleSA ? toggleSA.checked : false;
    const hasMortgage = toggleMortgage ? toggleMortgage.checked : false;
    const isBlackSwan = (isAdvanced && inpBlackSwan) ? inpBlackSwan.checked : false;
    const hasMortPartner = toggleMortgagePartner ? toggleMortgagePartner.checked : false;
    const hasExpPartner = toggleExpensePartner ? toggleExpensePartner.checked : false;
    
    const inputs = {
        isAdvanced: isAdvanced,
        isBlackSwan: isBlackSwan,
        currentAge: getVal('inp-currentAge') || 30,
        retireAge: getVal('inp-retireAge') || 55,
        inflation: (getVal('inp-inflation') || 3.0) / 100,
        inflVol: isAdvanced ? getVal('inp-inflVol') / 100 : 0,
        inflateContribs: inpInflateContribs ? inpInflateContribs.checked : false,
        fx: 1.0, 
        fxDrift: isAdvanced ? getVal('inp-fxDrift') / 100 : 0,
        fxVol: isAdvanced ? getVal('inp-fxVol') / 100 : 0,
        hasGlobal: true, 
        usdStart: getVal('inp-invStart'),
        usdContrib: getVal('inp-invContrib'),
        usdRet: (getVal('inp-invRet') || 4.5) / 100,
        usdVol: isAdvanced ? getVal('inp-usdVol') / 100 : 0,
        hasSG: false, 
        sgdStart: 0,
        sgdContrib: 0,
        sgdRet: (getVal('inp-sgdRet') || 4.0) / 100,
        sgdVol: isAdvanced ? getVal('inp-sgdVol') / 100 : 0,
        hasCash: hasCash,
        cashStart: getVal('inp-cashStart'),
        cashContrib: getVal('inp-cashContrib') || 0,
        cashYield: (getVal('inp-cashYield') || 1.5) / 100,
        hasSA: hasSA,
        saStart: getVal('inp-saStart'),
        saContrib: getVal('inp-saContrib'),
        hasMortgage: hasMortgage,
        simpleMortgage: getVal('inp-mortgageSimple'),
        mortgagePrincipal: getVal('inp-mortgagePrincipal'),
        mortgageRate: (getVal('inp-mortgageRate') || 2.6) / 100,
        mortgageVol: isAdvanced ? getVal('inp-mortgageVol') / 100 : 0,
        loanYrs: getVal('inp-loanYrs') || 25,
        mortgageShare: document.getElementById('inp-mortgageShare') ? getVal('inp-mortgageShare') : 100,
        isMaxOA: inpMaxOA ? inpMaxOA.checked : true,
        customOACap: getVal('inp-customOACap') || 0,
        oaStart: getVal('inp-oaStart') || 0,
        oaContrib: getVal('inp-oaContrib') || 0,
        expenses: getVal('inp-expenses') || 3000,
        expenseShare: hasExpPartner ? getVal('inp-expenseShare') : 100,
        showFireCurve: inpShowFireCurve ? inpShowFireCurve.checked : false,
        swrOverride: (isAdvanced && inpSwrOverride) ? inpSwrOverride.checked : false,
        swrMultiple: isAdvanced ? (getVal('inp-swrMultiple') || 25) : 25,
        incomeStreams: [],
        milestones: []
    };

    let effectiveExpenses = inputs.expenses * (inputs.expenseShare / 100);
    updateDOM('expense-share-readout', 'The simulator will draw down: $' + Math.round(effectiveExpenses).toLocaleString() + '/mo');

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
    updateDOM('swr-readout', `Calculated Multiple: ${calcMultiple.toFixed(1)}x (Based on your ${(realRet*100).toFixed(1)}% Real Return over ${duration} years)`);

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
            let r = inputs.mortgageRate / 12;
            let pmt = calcPmt(inputs.mortgagePrincipal, inputs.mortgageRate, inputs.loanYrs);
            remPrincipal = r === 0 ? pmt * (mYrs * 12) : (pmt / r) * (1 - Math.pow(1+r, -(mYrs * 12)));
        }
        
        let personalRemPrincipal = remPrincipal * (inputs.mortgageShare / 100);
        let target = (effExpMonthly * 12 * targetMultiple) + personalRemPrincipal;
        
        if (age === inputs.retireAge) targetAtRetirement = target;
        fireCurveData.push(target);
    }

    let sysWarnings = new Set();
    if (inputs.inflation >= Math.max(inputs.usdRet, inputs.sgdRet) && (inputs.hasGlobal || inputs.hasSG)) sysWarnings.add("Inflation exceeds expected portfolio returns. Real growth is negative.");

    let mcToggle = document.getElementById('inp-mcToggle');
    const isMC = mcToggle ? mcToggle.checked && isAdvanced : false;
    
    let labels = [];
    let datasets = [];
    let finalWarnings = Array.from(sysWarnings);

    updateDOM('val-targetAge', inputs.retireAge > 0 ? 'Age ' + inputs.retireAge : '--');
    updateDOM('val-heroExp', '$' + Math.round(effectiveExpenses).toLocaleString());
    updateDOM('val-fireNumber', '$' + (targetAtRetirement / 1000000).toFixed(2) + 'M');
    updateDOM('val-fireAge', inputs.retireAge);
    
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

            updateDOM('val-peak', '$' + (res.peakNW / 1000000).toFixed(2) + 'M');

            // Live Mortgage Display Update
            if (inputs.hasMortgage) {
                let pmt = calcPmt(inputs.mortgagePrincipal, inputs.mortgageRate, inputs.loanYrs);
                let personalPmt = pmt * (inputs.mortgageShare / 100);
                
                let disp = document.getElementById('disp-monthlyMortgage');
                if (disp) disp.innerText = `$${Math.round(pmt).toLocaleString()}`;

                let dispPersonal = document.getElementById('disp-personalMortgage');
                if (dispPersonal) dispPersonal.innerText = `$${Math.round(personalPmt).toLocaleString()}`;
            }
            if (inputs.hasMortgage) {
                let pmt = calcPmt(inputs.mortgagePrincipal, inputs.mortgageRate, inputs.loanYrs);
                let disp = document.getElementById('disp-monthlyMortgage');
                if (disp) disp.innerText = `$${Math.round(pmt).toLocaleString()}`;
            }

            let cardStatus = document.getElementById('hero-status') || document.getElementById('card-status');
            
            if (res.solvent) {
                let finalBal = res.pathData[res.pathData.length-1].val;
                
                updateDOM('val-statusText', "✅ Fully Funded to Age 95");
                updateDOM('status-main', "✅ Fully Funded to Age 95");
                updateDOM('val-statusSub', `Projected surplus: $${(finalBal/1000000).toFixed(2)}M`);
                updateDOM('status-sub', `Projected surplus: $${(finalBal/1000000).toFixed(2)}M`);
                if(cardStatus) cardStatus.className = 'hero-card success';
                
                if(document.getElementById('diagnostic-panel')) document.getElementById('diagnostic-panel').style.display = 'none';
                if(document.getElementById('diag-panel')) document.getElementById('diag-panel').style.display = 'none';
                if(document.getElementById('autosolver-results')) document.getElementById('autosolver-results').style.display = 'none';
            } else {
                if (res.depletionAge >= 85) {
                    updateDOM('val-statusText', "🐢 Almost There");
                    updateDOM('status-main', "🐢 Almost There");
                    updateDOM('val-statusSub', `Funds deplete at age ${res.depletionAge}.`);
                    updateDOM('status-sub', `Funds deplete at age ${res.depletionAge}. A small tweak will get you to 95.`);
                    if(cardStatus) cardStatus.className = 'hero-card warning';
                } else {
                    updateDOM('val-statusText', "⚠️ Adjustments Needed");
                    updateDOM('status-main', "⚠️ Adjustments Needed");
                    updateDOM('val-statusSub', `Funds deplete at age ${res.depletionAge}.`);
                    updateDOM('status-sub', `Funds deplete at age ${res.depletionAge}. Try investing a bit more or retiring later.`);
                    if(cardStatus) cardStatus.className = 'hero-card danger';
                }
                
                if(document.getElementById('diagnostic-panel')) document.getElementById('diagnostic-panel').style.display = 'block';
                if(document.getElementById('diag-panel')) document.getElementById('diag-panel').style.display = 'block';
                if(document.getElementById('autosolver-results')) document.getElementById('autosolver-results').style.display = 'none';
                
                let diagMsg = `Your portfolio crashed at Age ${res.depletionAge}.`;
                if (res.depletionAge <= inputs.retireAge) {
                    diagMsg = `Your portfolio crashed at Age ${res.depletionAge} before you even retired. Your living costs and debt completely overwhelmed your income.`;
                } else if (inputs.hasMortgage && res.depletionAge <= (inputs.currentAge + inputs.loanYrs)) {
                    diagMsg = `Your portfolio crashed at Age ${res.depletionAge}. Your investments could not sustain the aggressive double-drain of both your living expenses and your monthly mortgage payments in early retirement.`;
                } else {
                    diagMsg = `Your portfolio survived until Age ${res.depletionAge}. Over a long ${res.depletionAge - inputs.retireAge}-year retirement, inflation slowly eroded your purchasing power, and your capital eventually ran dry.`;
                }
                updateDOM('diag-message', diagMsg);
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

            updateDOM('val-peak', '$' + (medianPeak / 1000000).toFixed(2) + 'M');
            if(document.getElementById('diagnostic-panel')) document.getElementById('diagnostic-panel').style.display = 'none';
            if(document.getElementById('diag-panel')) document.getElementById('diag-panel').style.display = 'none';

            let winRate = ((successes / runs) * 100).toFixed(1);
            let cardStatus = document.getElementById('hero-status') || document.getElementById('card-status');
            
            updateDOM('val-statusSub', `${runs} Monte Carlo sims`);
            updateDOM('status-sub', `${runs} Monte Carlo sims`);
            
            if (winRate >= 90) {
                updateDOM('val-statusText', `✅ ${winRate}% Success`);
                updateDOM('status-main', `✅ ${winRate}% Success`);
                if(cardStatus) cardStatus.className = 'hero-card success';
            } else if (winRate >= 70) {
                updateDOM('val-statusText', `⚠️ ${winRate}% Success`);
                updateDOM('status-main', `⚠️ ${winRate}% Success`);
                if(cardStatus) cardStatus.className = 'hero-card warning';
            } else {
                updateDOM('val-statusText', `🛑 ${winRate}% Success`);
                updateDOM('status-main', `🛑 ${winRate}% Success`);
                if(cardStatus) cardStatus.className = 'hero-card danger';
            }
        }
    } else {
        updateDOM('val-peak', "$0");
        updateDOM('val-statusText', "Awaiting Data");
        updateDOM('status-main', "Awaiting Data");
        updateDOM('val-statusSub', "Enter age to begin");
        updateDOM('status-sub', "Enter age to begin");
        
        let cardStatus = document.getElementById('hero-status') || document.getElementById('card-status');
        if(cardStatus) cardStatus.className = 'hero-card';
        if(document.getElementById('diagnostic-panel')) document.getElementById('diagnostic-panel').style.display = 'none';
        if(document.getElementById('diag-panel')) document.getElementById('diag-panel').style.display = 'none';
    }
    
    let wHtml = finalWarnings.map(w => `<div class="warning-alert">${w}</div>`).join('');
    updateDOM('warningsBox', wHtml, true);

    renderChart(labels, datasets, inputs);
    try {
        localStorage.setItem('fireSimState', JSON.stringify(getState()));
    } catch(e) {}
}

// --- V5 Chart Event Flags ---
function renderChart(labels, datasets, inputs) {
    let canvas = document.getElementById('fireChart');
    if(!canvas) return; // Prevent crash if canvas isn't loaded yet
    const ctx = canvas.getContext('2d');
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
    } catch(e) {}
}
isLoading = false;

// --- Smart Estimators (Mortgage & CPF) ---
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
        let r = rate / 12;
        let n = origTenure * 12;
        let monthsPaid = yearsPaid * 12;
        let pmt = calcPmt(origLoan, rate, origTenure);
        
        let remPrincipal = 0;
        if (r === 0) remPrincipal = origLoan - (pmt * monthsPaid);
        else remPrincipal = (pmt / r) * (1 - Math.pow(1+r, -(n - monthsPaid)));
        
        setVal('inp-mortgagePrincipal', Math.max(0, Math.round(remPrincipal)));
        setVal('inp-loanYrs', Math.max(0, origTenure - yearsPaid));
        toggleMortgageCalc();
        runSim();
    }
}

function toggleOACalc() {
    let pnl = document.getElementById('oa-calc-panel');
    if(pnl) pnl.style.display = pnl.style.display === 'none' ? 'block' : 'none';
}

function runOAEstimate() {
    let salary = getVal('est-salary');
    let age = getVal('inp-currentAge') || 35;
    let cappedSalary = Math.min(salary, 8000); // 2026 CPF Ordinary Wage Ceiling
    
    // CPF OA Allocation Rates by Age
    let oaRate = 0.23; 
    if (age > 35 && age <= 45) oaRate = 0.21;
    else if (age > 45 && age <= 50) oaRate = 0.19;
    else if (age > 50 && age <= 55) oaRate = 0.15;
    else if (age > 55 && age <= 60) oaRate = 0.12;
    else if (age > 60) oaRate = 0.035;

    let estimatedOA = Math.round(cappedSalary * oaRate);
    if(document.getElementById('oa-est-result')) {
        document.getElementById('oa-est-result').innerText = salary > 0 ? `Estimated OA Inflow: $${estimatedOA}/mo` : '';
    }
    return estimatedOA;
}

function applyOAEstimate() {
    let est = runOAEstimate();
    if(est > 0) {
        setVal('inp-oaContrib', est);
        toggleOACalc();
        runSim();
    }
}

// --- Progressive Wizard Controller ---
function unlockPersonas() {
    let sec = document.getElementById('persona-section');
    if(sec) {
        sec.classList.remove('wizard-lock');
        sec.classList.add('wizard-unlock');
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function selectPersona(type) {
    loadProfile(type);
    let planner = document.getElementById('planner-split');
    if(planner) {
        planner.classList.remove('wizard-lock');
        planner.classList.add('wizard-unlock');
        planner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function executeSimulation() {
    runSim();
}