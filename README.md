# Financial Independence Simulator for Singapore Residents

An institutional-grade, client-side Financial Independence, Retire Early (FIRE) simulator built specifically for the macroeconomic realities of Singapore. 

Standard FIRE calculators (like the 4% rule) fail to account for Singapore's unique financial ecosystem—ignoring the compounding power of CPF, the drag of HDB/Bank mortgages, and the precise mechanics of sequence-of-returns risk. This simulator bridges that gap, offering both a simplified interface for beginners and a robust Monte Carlo stress-testing engine for advanced planners.

## ✨ Key Features

### 🏦 Localized Singapore Mechanics
* **CPF Special Account (SA) Engine:** Compounds independently at the statutory 4.0% floor. Modeled as illiquid during the accumulation phase and automatically unlocks at Age 55 to fund retirement drawdowns.
* **Mortgage & Housing Logic:** Choose between HDB Concessionary loans (pegged to CPF OA) or floating Bank Loans. Automatically calculates amortized payments, personal liability shares, and monthly CPF Ordinary Account (OA) sweeps.
* **Expected Currency Trend:** Allows users to model the MAS's historical policy of strengthening the SGD against the USD to offset inflation, applying a real purchasing power drag on global (USD-domiciled) equity portfolios.

### 📈 Institutional-Grade Math
* **Dynamic "Escape Velocity" Curve:** Replaces the blunt 25x rule. The engine dynamically calculates your required Safe Withdrawal Rate (SWR) multiple based on your *exact* blended real return and retirement duration, plotting a moving "Financial Finish Line" that accounts for both inflation and declining mortgage principal.
* **Monte Carlo Stress Testing:** Runs hundreds of randomized, parallel lifetimes to calculate success probabilities against Sequence of Returns Risk (SORR). Includes a "Black Swan" toggle that introduces fat-tailed distributions to simulate devastating, historically rare market crashes.
* **Milestone Capital Events:** Accurately models the "Retirement Smile" by allowing users to program one-off heavy expenses (e.g., world travel, home renovations) or windfalls (e.g., inheritances, downsizing) on specific future birthdays.

### 🎓 V5 Educational Engine
Built to teach, not just calculate:
* **Diagnostic Reporting:** If a plan fails, the engine analyzes the timeline and outputs a plain-English explanation of exactly *why* it crashed (e.g., "Your investments could not sustain the aggressive double-drain of living expenses and your monthly mortgage in early retirement.").
* **The Auto-Solver:** A background recursive loop that calculates the exact minimum adjustments needed to rescue a failed plan—offering users 1-click options to increase investments, delay retirement, or cut expenses.
* **Lifestyle Archetypes:** Beginners can instantly load curated personas (e.g., Coast FIRE, DINK Upgraders, Conservative Family) to see how different lifestyle choices play out in the data.

## 🛠️ Architecture & Tech Stack

This project is entirely client-side and requires no backend, database, or build pipeline. It is intentionally built as a lightweight, lightning-fast vanilla application to ensure long-term maintainability.

* **HTML5 / CSS3 / Vanilla JavaScript**
* **Chart.js & Chart.js Annotations Plugin** (Pulled via CDN)
* **Local State Management:** Automatically scoops UI inputs and saves state to the browser's `localStorage`. Includes a JSON vault system to export and import `.json` backups of financial plans.

**File Structure:**
* `index.html` — The structural DOM shell and UI layout.
* `styles.css` — The design system, responsive grids, and color synchronization logic.
* `engine.js` — The core mathematical brain, Monte Carlo loops, state management, and Chart.js rendering.

## 🚀 Installation & Usage

Because there are no dependencies or Node modules to install, running the simulator locally takes seconds:

1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/sg-fire-simulator.git](https://github.com/yourusername/sg-fire-simulator.git)
