let fireChart;
let isLoading = true;
const APP_VERSION = "6.0";

// --- 5 Relatable Persona Definitions ---
const PERSONAS = {
    young_starter: {
        currentAge: 28,
        expenses: 2500,
        expensePartner: false,
        expenseShare: 100,
        usdStart: 35000,
        usdContrib: 1500,
        cashStart: 25000,
        hasMortgage: false,
        mortgagePrincipal: 0,
        loanYrs: 25,
        mortgageRate: 2.6,
        isHdb: true,
        mortgagePartner: false,
        mortgageShare: 100,
        isMaxOA: true,
        oaStart: 10000,
        oaContrib: 800,
        hasSA: false,
        saStart: 0,
        saContrib: 0,
        summary: "As a Young Starter, living lean with no property debt allows high monthly investments to compound aggressively."
    },
    hdb_couple: {
        currentAge: 32,
        expenses: 5000,
        expensePartner: true,
        expenseShare: 50,
        usdStart: 40000,
        usdContrib: 1000,
        cashStart: 40000,
        hasMortgage: true,
        mortgagePrincipal: 380000,
        loanYrs: 22,
        mortgageRate: 2.6,
        isHdb: true,
        mortgagePartner: true,
        mortgageShare: 50,
        isMaxOA: true,
        oaStart: 20000,
        oaContrib: 1400,
        hasSA: false,
        saStart: 0,
        saContrib: 0,
        summary: "As a First-Time HDB Couple, utilizing CPF OA to pay the mortgage shields your cash flow for consistent monthly investing."
    },
    growing_family: {
        currentAge: 38,
        expenses: 8500,
        expensePartner: true,
        expenseShare: 50,
        usdStart: 120000,
        usdContrib: 2200,
        cashStart: 80000,
        hasMortgage: true,
        mortgagePrincipal: 1100000,
        loanYrs: 25,
        mortgageRate: 2.8,
        isHdb: false,
        mortgagePartner: true,
        mortgageShare: 50,
        isMaxOA: true,
        oaStart: 35000,
        oaContrib: 1500,
        hasSA: false,
        saStart: 0,
        saContrib: 0,
        summary: "As a Growing Family, managing a private bank loan alongside family commitments requires a higher sustained savings rate."
    },
    pragmatic_saver: {
        currentAge: 42,
        expenses: 2400,
        expensePartner: false,
        expenseShare: 100,
        usdStart: 20000,
        usdContrib: 300,
        cashStart: 60000,
        hasMortgage: true,
        mortgagePrincipal: 120000,
        loanYrs: 10,
        mortgageRate: 2.6,
        isHdb: true,
        mortgagePartner: false,
        mortgageShare: 100,
        isMaxOA: true,
        oaStart: 30000,
        oaContrib: 1200,
        hasSA: true,
        saStart: 140000,
        saContrib: 500,
        summary: "As a Pragmatic Saver, maximizing the guaranteed 4.0% CPF SA floor builds a stable, low-stress foundation for retirement."
    },
    self_employed: {
        currentAge: 34,
        expenses: 3200,
        expensePartner: false,
        expenseShare: 100,
        usdStart: 70000,
        usdContrib: 1200,
        cashStart: 75000,
        hasMortgage: false,
        mortgagePrincipal: 0,
        loanYrs: 25,
        mortgageRate: 2.6,
        isHdb: true,
        mortgagePartner: false,
        mortgageShare: 100,
        isMaxOA: false,
        oaStart: 5000,
        oaContrib: 0,
        hasSA: false,
        saStart: 0,
        saContrib: 0,
        summary: "Without mandatory employer CPF matching, maintaining a substantial cash cushion ensures resilience through uneven earnings."
    }
};

let activePersonaKey = "hdb_couple";

// --- Number Helpers ---
function getVal(id) {
    let el = document.getElementById(id);
    if (!el) return 0;
    return parseFloat(el.value.replace(/,/g, '')) || 0;
}

function setVal(id, val) {
    let el = document.getElementById(id);
    if (!el) return;
    if (val === '') { el.value = ''; return; }
    if (Math.abs(val) >= 1000 || el.id.includes("Start") || el.id.includes("Contrib") || el.id.includes("Principal") || el.id.includes("expenses") || el.id.includes("oa")) {
        el.value = Math.round(val).toLocaleString('en-US');
    } else {
        el.value = val;
    }
    let slider = document.getElementById('slide-' + id.replace('inp-', ''));
    if (slider) slider.value = parseFloat(val);
}

// --- Sync Inputs with Sliders ---
document.querySelectorAll('.sync-input').forEach(input => {
    input.addEventListener('input', function() {
        let slider = document.getElementById(this.getAttribute('data-slider'));
        if (slider) slider.value = getVal(this.id);
        runSim();
    });
});

document.querySelectorAll('.sync-slider').forEach(slider => {
    slider.addEventListener('input', function() {
        let input = document.getElementById(this.getAttribute('data-input'));
        if (input) {
            setVal(input.id, this.value);
            runSim();
        }
    });
});

document.querySelectorAll('.num-format').forEach(el => {
    el.addEventListener('blur', function() {
        if (this.value === '') { runSim(); return; }
        let val = parseFloat(this.value.replace(/,/g, ''));
        if (!isNaN(val)) setVal(this.id, val);
        runSim();
    });
    el.addEventListener('focus', function() {
        this.value = this.value.replace(/,/g, '');
    });
});

// --- Mortgage Calculation Helper ---
function calcPmt(principal, ratePerYear, yearsRemaining) {
    if (yearsRemaining <= 0 || principal <= 0) return 0;
    let r = ratePerYear / 12;
    let n = yearsRemaining * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// --- Toggles ---
function setMode(mode) {
    document.body.className = mode + '-mode';
    runSim();
}

function selectPersona(key) {
    activePersonaKey = key;
    document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
    let activeCard = document.getElementById('card-' + key);
    if (activeCard) activeCard.classList.add('active');

    let p = PERSONAS[key];
    if (!p) return;

    isLoading = true;
    setVal('inp-currentAge', p.currentAge);
    setVal('inp-expenses', p.expenses);
    document.getElementById('toggle-expense-partner').checked = p.expensePartner;
    document.getElementById('inp-expenseShare').value = p.expenseShare;
    document.getElementById('disp-expenseShare').innerText = p.expenseShare;
    toggleExpensePartner();

    setVal('inp-usdStart', p.usdStart);
    setVal('inp-usdContrib', p.usdContrib);
    setVal('inp-cashStart', p.cashStart);

    document.getElementById('toggle-mortgage').checked = p.hasMortgage;
    toggleMortgageSection();

    if (p.isHdb) {
        document.getElementById('loan-hdb').checked = true;
    } else {
        document.getElementById('loan-bank').checked = true;
    }
    toggleLoanType();

    setVal('inp-mortgagePrincipal', p.mortgagePrincipal);
    setVal('inp-loanYrs', p.loanYrs);
    setVal('inp-mortgageRate', p.mortgageRate);

    document.getElementById('toggle-mortgage-partner').checked = p.mortgagePartner;
    document.getElementById('inp-mortgageShare').value = p.mortgageShare;
    document.getElementById('disp-mortgageShare').innerText = p.mortgageShare;
    toggleMortgagePartner();

    document.getElementById('inp-maxOA').checked = p.isMaxOA;
    setVal('inp-oaStart', p.oaStart);
    setVal('inp-oaContrib', p.oaContrib);

    document.getElementById('toggle-sa').checked = p.hasSA;
    setVal('inp-saStart', p.saStart);
    setVal('inp-saContrib', p.saContrib);
    toggleSaSection();

    isLoading = false;
    runSim();
}

function toggleExpensePartner() {
    let isChecked = document.getElementById('toggle-expense-partner').checked;
    document.getElementById('expense-partner-panel').style.display = isChecked ? 'block' : 'none';
}

function toggleMortgageSection() {
    let isChecked = document.getElementById('toggle-mortgage').checked;
    document.getElementById('mortgage-inputs-panel').style.display = isChecked ? 'block' : 'none';
}

function toggleLoanType() {
    let isHdb = document.getElementById('loan-hdb').checked;
    let rateInput = document.getElementById('inp-mortgageRate');
    if (isHdb) {
        setVal('inp-mortgageRate', 2.6);
        rateInput.disabled = true;
    } else {
        rateInput.disabled = false;
        if (getVal('inp-mortgageRate') === 2.6) setVal('inp-mortgageRate', 2.8);
    }
}

function toggleMortgagePartner() {
    let isChecked = document.getElementById('toggle-mortgage-partner').checked;
    document.getElementById('mortgage-partner-panel').style.display = isChecked ? 'block' : 'none';
}

function toggleSaSection() {
    let isChecked = document.getElementById('toggle-sa').checked;
    document.getElementById('sa-panel').style.display = isChecked ? 'block' : 'none';
}

function toggleManualRetireAge() {
    let isChecked = document.getElementById('inp-manualOverride').checked;
    document.getElementById('manual-retire-panel').style.display = isChecked ? 'block' : 'none';
}

function clearAllInputs() {
    setVal('inp-currentAge', 30);
    setVal('inp-expenses', 3000);
    setVal('inp-usdStart', 10000);
    setVal('inp-usdContrib', 500);
    setVal('inp-cashStart', 10000);
    document.getElementById('toggle-mortgage').checked = false;
    toggleMortgageSection();
    document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
    activePersonaKey = null;
    runSim();
}

// --- Path Simulation Engine ---
function simulatePath(inputs, targetRetireAge) {
    let {
        currentAge, inflation, fx,
        usdStart, usdContrib, usdRet,
        cashStart, cashYield,
        hasSA, saStart, saContrib,
        hasMortgage, mortgagePrincipal, mortgageRate, loanYrs, mortgageShare,
        isMaxOA, oaStart, oaContrib,
        expenses, expenseShare
    } = inputs;

    let usdPort = usdStart;
    let cashRes = cashStart;
    let saBal = hasSA ? saStart : 0;
    let oaBal = oaStart;
    let remPrincipal = hasMortgage ? mortgagePrincipal : 0;
    let mortgageEndAge = currentAge + loanYrs;

    let pathData = [];
    let solvent = true;
    let depletionAge = null;
    let peakNW = 0;

    let currentExpenses = expenses;
    let currentUsdContrib = usdContrib;
    let currentOaContrib = oaContrib;
    let currentSaContrib = hasSA ? saContrib : 0;

    for (let age = currentAge; age <= 95; age++) {
        if (age > currentAge) {
            currentExpenses *= (1 + inflation);
        }

        let isWorking = age < targetRetireAge;
        let isMortgageActive = hasMortgage && (age < mortgageEndAge) && remPrincipal > 0;

        let monthlyMortgageTotal = 0;
        let monthlyMortgagePersonal = 0;

        if (isMortgageActive) {
            monthlyMortgageTotal = calcPmt(remPrincipal, mortgageRate, mortgageEndAge - age);
            monthlyMortgagePersonal = monthlyMortgageTotal * (mortgageShare / 100);
        }

        for (let m = 1; m <= 12; m++) {
            usdPort *= (1 + (usdRet / 12));
            cashRes *= (1 + (cashYield / 12));
            saBal *= (1 + (0.04 / 12));
            oaBal *= (1 + (0.025 / 12));

            let mortgageShortfall = 0;

            if (isWorking) {
                oaBal += currentOaContrib;
                saBal += currentSaContrib;

                if (isMortgageActive && monthlyMortgagePersonal > 0) {
                    let interest = remPrincipal * (mortgageRate / 12);
                    remPrincipal = Math.max(0, remPrincipal - (monthlyMortgageTotal - interest));

                    if (isMaxOA) {
                        if (oaBal >= monthlyMortgagePersonal) {
                            oaBal -= monthlyMortgagePersonal;
                        } else {
                            mortgageShortfall = monthlyMortgagePersonal - oaBal;
                            oaBal = 0;
                        }
                    } else {
                        mortgageShortfall = monthlyMortgagePersonal;
                    }
                }

                let monthlyContribSGD = currentUsdContrib * fx;
                if (mortgageShortfall > monthlyContribSGD) {
                    cashRes -= (mortgageShortfall - monthlyContribSGD);
                } else {
                    let netInvestSGD = monthlyContribSGD - mortgageShortfall;
                    usdPort += netInvestSGD / fx;
                }
            } else {
                // Retirement drawdown
                let personalSpending = currentExpenses * (expenseShare / 100);

                if (isMortgageActive && monthlyMortgagePersonal > 0) {
                    let interest = remPrincipal * (mortgageRate / 12);
                    remPrincipal = Math.max(0, remPrincipal - (monthlyMortgageTotal - interest));

                    if (oaBal >= monthlyMortgagePersonal) {
                        oaBal -= monthlyMortgagePersonal;
                    } else {
                        personalSpending += (monthlyMortgagePersonal - oaBal);
                        oaBal = 0;
                    }
                }

                let includeSA = age >= 55;
                let liquidSGD = cashRes + (usdPort * fx) + (includeSA ? saBal : 0);

                if (liquidSGD >= personalSpending) {
                    let cashRatio = cashRes / liquidSGD;
                    let usdRatio = (usdPort * fx) / liquidSGD;
                    let saRatio = includeSA ? (saBal / liquidSGD) : 0;

                    cashRes -= personalSpending * cashRatio;
                    usdPort -= (personalSpending * usdRatio) / fx;
                    if (includeSA) saBal -= personalSpending * saRatio;
                } else {
                    cashRes = 0;
                    usdPort = 0;
                    if (includeSA) saBal = 0;
                }
            }

            let totalLiquidSGD = cashRes + (usdPort * fx) + saBal;
            if (totalLiquidSGD > peakNW) peakNW = totalLiquidSGD;

            if (totalLiquidSGD <= 0 && solvent) {
                solvent = false;
                depletionAge = age;
            }
            if (!solvent) { cashRes = 0; usdPort = 0; saBal = 0; }
        }

        let totalLiquidAtYearEnd = cashRes + (usdPort * fx) + saBal;
        pathData.push({ age, val: Math.max(0, totalLiquidAtYearEnd) });
    }

    return { pathData, solvent, depletionAge, peakNW, finalBalance: pathData[pathData.length - 1].val };
}

// --- Reverse-Solver (Find Earliest Sustainable Retirement Age) ---
function findEarliestRetirementAge(inputs) {
    for (let testAge = inputs.currentAge; testAge <= 85; testAge++) {
        let sim = simulatePath(inputs, testAge);
        if (sim.solvent && sim.finalBalance >= 50000) {
            return testAge;
        }
    }
    return null;
}

// --- Main Simulation Coordinator ---
function runSim() {
    if (isLoading) return;

    let isManual = document.getElementById('inp-manualOverride').checked;
    let manualRetireAge = getVal('inp-targetRetireAge');

    let inputs = {
        currentAge: getVal('inp-currentAge') || 30,
        inflation: (getVal('inp-inflation') || 3.0) / 100,
        fx: getVal('inp-fx') || 1.35,
        usdStart: getVal('inp-usdStart'),
        usdContrib: getVal('inp-usdContrib'),
        usdRet: (getVal('inp-usdRet') || 7.0) / 100,
        cashStart: getVal('inp-cashStart'),
        cashYield: (getVal('inp-cashYield') || 1.5) / 100,
        hasSA: document.getElementById('toggle-sa').checked,
        saStart: getVal('inp-saStart'),
        saContrib: getVal('inp-saContrib'),
        hasMortgage: document.getElementById('toggle-mortgage').checked,
        mortgagePrincipal: getVal('inp-mortgagePrincipal'),
        mortgageRate: (getVal('inp-mortgageRate') || 2.6) / 100,
        loanYrs: getVal('inp-loanYrs') || 25,
        mortgageShare: document.getElementById('toggle-mortgage-partner').checked ? getVal('inp-mortgageShare') : 100,
        isMaxOA: document.getElementById('inp-maxOA').checked,
        oaStart: getVal('inp-oaStart'),
        oaContrib: getVal('inp-oaContrib'),
        expenses: getVal('inp-expenses') || 3000,
        expenseShare: document.getElementById('toggle-expense-partner').checked ? getVal('inp-expenseShare') : 100
    };

    let resolvedRetireAge = manualRetireAge;
    let autoSolvedAge = findEarliestRetirementAge(inputs);

    if (!isManual) {
        resolvedRetireAge = autoSolvedAge ? autoSolvedAge : 75;
    }

    let activeSim = simulatePath(inputs, resolvedRetireAge);

    // Update Headline Answer Banner
    let ansTitle = document.getElementById('ans-title');
    let ansAge = document.getElementById('ans-age');
    let ansSummary = document.getElementById('ans-summary');
    let banner = document.getElementById('answer-banner');

    if (autoSolvedAge) {
        ansTitle.innerText = isManual ? `Testing Retirement at Age ${resolvedRetireAge}:` : `Earliest Feasible Retirement Age:`;
        ansAge.innerText = `Age ${autoSolvedAge}`;
        banner.className = "answer-banner";

        let personaText = activePersonaKey && PERSONAS[activePersonaKey] ? PERSONAS[activePersonaKey].summary + " " : "";
        if (isManual) {
            if (activeSim.solvent) {
                ansSummary.innerText = `${personaText}Your portfolio safely sustains your living costs to Age 95 with an ending cushion of $${(activeSim.finalBalance / 1000000).toFixed(2)}M.`;
            } else {
                banner.className = "answer-banner warning-state";
                ansSummary.innerText = `At Age ${resolvedRetireAge}, your money depletes prematurely at Age ${activeSim.depletionAge}. Your earliest safe retirement age is Age ${autoSolvedAge}.`;
            }
        } else {
            ansSummary.innerText = `${personaText}With your current investment rate, your capital achieves self-sustaining escape velocity at Age ${autoSolvedAge}.`;
        }
    } else {
        ansTitle.innerText = "Retirement Outlook:";
        ansAge.innerText = "Action Required";
        banner.className = "answer-banner warning-state";
        ansSummary.innerText = "Under current assumptions, your portfolio faces a shortfall prior to Age 95. Consider increasing monthly investments, extending your working horizon, or trimming monthly expenses.";
    }

    // Update Quick Metric Badges
    document.getElementById('pill-retireAge').innerText = autoSolvedAge ? `Age ${autoSolvedAge}` : 'N/A';
    document.getElementById('pill-peak').innerText = `$${(activeSim.peakNW / 1000000).toFixed(2)}M`;
    document.getElementById('pill-endingBal').innerText = `$${(activeSim.finalBalance / 1000000).toFixed(2)}M`;

    // Dynamic Finish Line Curve
    let labels = [];
    let curveData = [];
    let fireCurveData = [];
    let showFireCurve = document.getElementById('inp-showFireCurve').checked;

    let targetDuration = Math.max(1, 95 - resolvedRetireAge);
    let realReturn = (1 + inputs.usdRet) / (1 + inputs.inflation) - 1;
    let multiple = Math.abs(realReturn) < 0.001 ? targetDuration : (1 - Math.pow(1 + realReturn, -targetDuration)) / realReturn;

    for (let i = 0; i < activeSim.pathData.length; i++) {
        let age = activeSim.pathData[i].age;
        labels.push(age);
        curveData.push(activeSim.pathData[i].val);

        if (showFireCurve) {
            let yrs = age - inputs.currentAge;
            let inflatedYearlyExp = (inputs.expenses * Math.pow(1 + inputs.inflation, yrs) * 12) * (inputs.expenseShare / 100);
            fireCurveData.push(inflatedYearlyExp * multiple);
        }
    }

    renderChart(labels, curveData, fireCurveData, inputs, resolvedRetireAge);
    localStorage.setItem('fireSimState', JSON.stringify(inputs));
}

// --- Chart Rendering Engine ---
function renderChart(labels, portfolioData, fireCurveData, inputs, retireAge) {
    const ctx = document.getElementById('fireChart').getContext('2d');
    if (fireChart) fireChart.destroy();

    let retireIdx = retireAge - inputs.currentAge;
    let annotations = {};

    if (retireIdx >= 0 && retireIdx < labels.length) {
        annotations.retireLine = {
            type: 'line',
            xMin: retireIdx,
            xMax: retireIdx,
            borderColor: '#8b5cf6',
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
                display: true,
                content: `Retire: Age ${retireAge}`,
                position: 'start',
                backgroundColor: '#8b5cf6',
                color: '#fff',
                font: { size: 10, weight: 'bold' }
            }
        };
    }

    let datasets = [
        {
            label: 'Total Liquid Portfolio (SGD)',
            data: portfolioData,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 2.5
        }
    ];

    if (fireCurveData.length > 0) {
        datasets.push({
            label: 'Benchmark Target Line',
            data: fireCurveData,
            borderColor: '#ef4444',
            borderDash: [3, 4],
            pointRadius: 0,
            fill: false,
            borderWidth: 1.5
        });
    }

    fireChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    title: { display: true, text: 'Portfolio Value (SGD)' },
                    ticks: { callback: v => '$' + (v / 1000000).toFixed(1) + 'M' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': $' + Math.round(c.raw).toLocaleString() } },
                annotation: { annotations: annotations }
            }
        }
    });
}

// --- Import / Export Handlers ---
function exportPlan() {
    let data = localStorage.getItem('fireSimState');
    let blob = new Blob([data], { type: "application/json" });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `singapore-fire-plan.json`;
    a.click();
}

function importPlan(event) {
    let file = event.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        try {
            let loaded = JSON.parse(e.target.result);
            Object.keys(loaded).forEach(k => {
                let el = document.getElementById('inp-' + k);
                if (el) setVal(el.id, loaded[k]);
            });
            runSim();
        } catch(err) {
            alert("Invalid save file format.");
        }
    };
    reader.readAsText(file);
}

// --- Initialization ---
isLoading = false;
selectPersona('hdb_couple');
