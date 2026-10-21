# ChargeFlow: EV Charging Queue and Power Allocation Manager
Repo Reboot I.FEST'26 · Problem Statement 02 · Renewable Energy Intelligence

Schedules EVs and splits limited station power so that cars reach their target before departure, **never exceeding the station limit**. Compared live against first-come-first-served (FCFS) on identical input.

**Run:** open `index.html` in a browser (no install, no backend). **Test:** `node test.js`. **Host:** enable GitHub Pages on this repo.

## How it works
1. **Rank the queue.** `slack = time to departure − energy needed ÷ max rate`. Infeasible requests (slack < 0) rank last and are flagged; urgent ones (slack ≤ 1 h) go first; the rest are shortest-job-first.
2. **Allocate power** in rank order, each vehicle up to `min(vehicle max, point rating)`, until the station limit is used up. Reduced vehicles show *Power-reduced* with the reason.
3. **Simulate** in 1-minute steps (08:00–20:00) with a configurable power drop; the engine replans every minute, so joins, early leaves and capacity changes are handled.
4. **Report** wait, utilization, energy, peak kW, % completed before departure, vehicles served, and cap violations, for ChargeFlow vs FCFS. All values come from the simulation.

## Verification (`node test.js`)
Cap never exceeded (both schedulers, 50 scenarios × 720 min), no over-delivery of energy, invalid requests rejected, and ChargeFlow beats FCFS on mean on-time completion.

## Honest limits
Simulated data only; constant charging efficiency; constant power within a minute; non-preemptive point assignment. A scheduling tool, not certified electrical protection. ChargeFlow does not reduce average waiting time; it defers jobs that cannot reach target anyway.

## Not included (future work)
Charger-failure event, cost/tariff and solar awareness, multi-station, weighted-priority and EDF selectable modes, alerts to drivers.
