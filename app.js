// ── State ──────────────────────────────────────────────────────────────────
const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

function loadState() {
  return {
    goals:      JSON.parse(localStorage.getItem('ft_goals'))      || { ...DEFAULT_GOALS },
    foodLog:    JSON.parse(localStorage.getItem('ft_foodLog'))    || {},   // { "YYYY-MM-DD": [{name,calories,protein,carbs,fat,meal,unit,amount}] }
    workoutLog: JSON.parse(localStorage.getItem('ft_workoutLog')) || {},   // { "YYYY-MM-DD": [{id, type, exercises:[{name, sets:[{weight,reps}]}]}] }
  };
}

function save() {
  localStorage.setItem('ft_goals',      JSON.stringify(state.goals));
  localStorage.setItem('ft_foodLog',    JSON.stringify(state.foodLog));
  localStorage.setItem('ft_workoutLog', JSON.stringify(state.workoutLog));
}

let state = loadState();
let currentPage = 'nutrition';
let pendingMeal = 'breakfast';
let html5QrCode = null;

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch',     label: 'Lunch',     icon: '☀️' },
  { key: 'dinner',    label: 'Dinner',    icon: '🌙' },
  { key: 'snacks',    label: 'Snacks',    icon: '🍪' },
];

// Common workout session types — user can also type a custom one
const WORKOUT_TYPES = ['Push', 'Pull', 'Legs', 'Back', 'Chest', 'Shoulders', 'Arms', 'Core', 'Full Body', 'Cardio'];

// ── Migration ──────────────────────────────────────────────────────────────
function migrate() {
  let changed = false;

  // Old foodLog entries: add meal/unit/amount defaults
  Object.values(state.foodLog).forEach(dayFoods => {
    dayFoods.forEach(f => {
      if (!f.meal) { f.meal = 'snacks'; changed = true; }
      if (!f.unit) { f.unit = 'g'; changed = true; }
      if (f.amount === undefined) { f.amount = 100; changed = true; }
    });
  });

  // Old workouts format: { "date": [{name, sets}] } -> migrate to workoutLog sessions
  const oldWorkouts = JSON.parse(localStorage.getItem('ft_workouts'));
  if (oldWorkouts && Object.keys(oldWorkouts).length) {
    Object.entries(oldWorkouts).forEach(([date, exercises]) => {
      if (exercises && exercises.length) {
        if (!state.workoutLog[date]) state.workoutLog[date] = [];
        state.workoutLog[date].push({
          id: 'sess_' + Math.random().toString(36).slice(2),
          type: 'Workout',
          exercises: exercises,
        });
        changed = true;
      }
    });
    localStorage.removeItem('ft_workouts');
  }

  if (changed) save();
}
migrate();

// ── Helpers ────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function fmt(n) { return Math.round(n); }
function todayFoods() { return state.foodLog[today()] || []; }
function todaySessions() { return state.workoutLog[today()] || []; }
function uid() { return 's_' + Date.now() + Math.random().toString(36).slice(2, 7); }

function totals(foods) {
  return foods.reduce((acc, f) => ({
    calories: acc.calories + (f.calories || 0),
    protein:  acc.protein  + (f.protein  || 0),
    carbs:    acc.carbs    + (f.carbs    || 0),
    fat:      acc.fat      + (f.fat      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function pct(val, goal) { return Math.min(1, goal > 0 ? val / goal : 0); }

function unitLabel(unit) {
  if (unit === 'g') return 'g';
  if (unit === 'ml') return 'ml';
  if (unit === 'serving') return 'serving(s)';
  return unit;
}

// ── Router ─────────────────────────────────────────────────────────────────
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  const content = document.getElementById('page-content');
  if (page === 'nutrition') content.innerHTML = renderNutrition();
  if (page === 'workout')   content.innerHTML = renderWorkout();
  if (page === 'progress')  content.innerHTML = renderProgress();
  if (page === 'settings')  content.innerHTML = renderSettings();
  attachListeners(page);
}

// ── Nutrition Page ─────────────────────────────────────────────────────────
function renderNutrition() {
  const foods = todayFoods();
  const t = totals(foods);
  const g = state.goals;
  const calPct = pct(t.calories, g.calories);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = circ * calPct;
  const over = t.calories > g.calories;

  const mealSections = MEALS.map(m => {
    const mealFoods = foods.filter(f => f.meal === m.key);
    const mt = totals(mealFoods);
    const items = mealFoods.length
      ? mealFoods.map(f => {
          const trueIdx = foods.indexOf(f);
          const amountStr = f.amount ? `${f.amount}${f.unit === 'serving' ? ' serving' + (f.amount != 1 ? 's' : '') : unitLabel(f.unit)}` : '';
          return `
          <div class="food-item">
            <div>
              <div class="food-name">${f.name}${amountStr ? ` <span class="food-amt">(${amountStr})</span>` : ''}</div>
              <div class="food-macros">P: ${fmt(f.protein)}g &nbsp;C: ${fmt(f.carbs)}g &nbsp;F: ${fmt(f.fat)}g</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="food-cals">${fmt(f.calories)}</span>
              <button class="food-del" data-idx="${trueIdx}">✕</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="empty-msg">Nothing logged</div>';

    return `
      <div class="card meal-card">
        <div class="meal-header">
          <span class="meal-title">${m.icon} ${m.label}</span>
          <span class="meal-cal">${fmt(mt.calories)} kcal</span>
        </div>
        ${items}
        <button class="btn btn-ghost btn-sm add-meal-food" data-meal="${m.key}">+ Add to ${m.label}</button>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title">Today's Calories</div>
      <div class="ring-container">
        <svg class="ring-svg" width="140" height="140" viewBox="0 0 140 140">
          <circle class="ring-track" cx="70" cy="70" r="${r}" />
          <circle class="ring-fill ${over ? 'over' : ''}" cx="70" cy="70" r="${r}"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${circ - dash}" />
        </svg>
        <div class="ring-center">
          <span class="ring-cal" style="color:${over ? 'var(--red)' : 'var(--teal)'}">${fmt(t.calories)}</span>
          <span class="ring-label">of ${fmt(g.calories)} kcal</span>
        </div>
      </div>
      <div class="macro-row">
        ${macroBlock('protein', 'Protein', t.protein, g.protein, 'g')}
        ${macroBlock('carbs',   'Carbs',   t.carbs,   g.carbs,   'g')}
        ${macroBlock('fat',     'Fat',     t.fat,     g.fat,     'g')}
      </div>
    </div>

    ${mealSections}
  `;
}

function macroBlock(cls, label, val, goal, unit) {
  const p = pct(val, goal) * 100;
  return `
    <div class="macro-pill ${cls}">
      <div class="mp-val">${fmt(val)}${unit}</div>
      <div class="mp-lbl">${label}</div>
      <div class="mp-bar-bg"><div class="mp-bar" style="width:${p}%"></div></div>
    </div>`;
}

// ── Workout Page (Diary) ───────────────────────────────────────────────────
function renderWorkout() {
  const sessions = todaySessions();

  const sessionsHtml = sessions.length
    ? sessions.map(sess => renderSession(sess)).join('')
    : '<div class="empty-msg">No workout logged today yet.</div>';

  return `
    <div class="card">
      <div class="card-title">Today's Workout</div>
      ${sessionsHtml}
      <button class="btn" id="open-add-session">+ Start a Session (e.g. Back Day)</button>
    </div>

    <button class="btn btn-ghost" id="open-workout-history">📖 View Workout History</button>
  `;
}

function renderSession(sess) {
  const exHtml = sess.exercises.length
    ? sess.exercises.map((ex, ei) => `
      <div class="workout-exercise" data-sess="${sess.id}" data-ei="${ei}">
        <div class="exercise-header">
          <span class="exercise-name">${ex.name}</span>
          <button class="btn btn-ghost btn-sm del-exercise" data-sess="${sess.id}" data-ei="${ei}">Remove</button>
        </div>
        ${ex.sets.map((s, si) => `
          <div class="set-row">
            <span class="set-num">${si + 1}</span>
            <input class="set-val" type="number" inputmode="decimal" placeholder="kg" value="${s.weight}" data-sess="${sess.id}" data-ei="${ei}" data-si="${si}" data-field="weight" />
            <span class="set-x">×</span>
            <input class="set-val" type="number" inputmode="numeric" placeholder="reps" value="${s.reps}" data-sess="${sess.id}" data-ei="${ei}" data-si="${si}" data-field="reps" />
            <button class="set-del" data-sess="${sess.id}" data-ei="${ei}" data-si="${si}">✕</button>
          </div>`).join('')}
        <button class="add-set-btn" data-sess="${sess.id}" data-ei="${ei}">+ Add Set</button>
      </div>`).join('')
    : '<div class="empty-msg">No exercises yet — add one below.</div>';

  return `
    <div class="session-block">
      <div class="session-header">
        <span class="session-type">🏋️ ${sess.type}</span>
        <button class="btn btn-danger btn-sm del-session" data-sess="${sess.id}">Delete Session</button>
      </div>
      ${exHtml}
      <button class="btn btn-ghost btn-sm add-exercise-to-session" data-sess="${sess.id}">+ Add Exercise</button>
    </div>`;
}

// ── Workout History ────────────────────────────────────────────────────────
function renderWorkoutHistory(filterType) {
  // Gather all sessions across all dates, newest first
  const allSessions = [];
  Object.entries(state.workoutLog).sort((a, b) => b[0].localeCompare(a[0])).forEach(([date, sessions]) => {
    sessions.forEach(s => allSessions.push({ date, ...s }));
  });

  const types = [...new Set(allSessions.map(s => s.type))];

  const filtered = filterType ? allSessions.filter(s => s.type === filterType) : allSessions;

  const filterChips = types.length ? `
    <div class="filter-chips">
      <button class="chip ${!filterType ? 'active' : ''}" data-filter="">All</button>
      ${types.map(t => `<button class="chip ${filterType === t ? 'active' : ''}" data-filter="${t}">${t}</button>`).join('')}
    </div>` : '';

  const list = filtered.length
    ? filtered.map(s => {
        const label = s.date === today() ? 'Today' : s.date;
        const exSummary = s.exercises.map(ex => {
          const bestSet = ex.sets.filter(st => st.weight && st.reps).slice(-1)[0];
          const setStr = bestSet ? `${bestSet.weight}kg × ${bestSet.reps}` : `${ex.sets.length} set${ex.sets.length !== 1 ? 's' : ''}`;
          return `${ex.name}: ${setStr}`;
        }).join(' · ');
        return `
          <div class="history-session">
            <div class="history-session-head">
              <span class="history-type">${s.type}</span>
              <span class="history-date">${label}</span>
            </div>
            <div class="history-exercises">${exSummary || 'No exercises logged'}</div>
          </div>`;
      }).join('')
    : '<div class="empty-msg">No sessions logged yet for this filter.</div>';

  return `
    <div class="modal-title">Workout History</div>
    ${filterChips}
    <div class="history-list">${list}</div>
    <button class="btn btn-ghost" id="close-history" style="margin-top:14px">Close</button>
  `;
}

// ── Progress Page ──────────────────────────────────────────────────────────
function renderProgress() {
  const days = Object.keys(state.foodLog).sort().reverse().slice(0, 14);
  const chartDays = [...days].reverse();
  const maxCal = Math.max(...chartDays.map(d => totals(state.foodLog[d] || []).calories), 1);

  const bars = chartDays.map(d => {
    const cal = totals(state.foodLog[d] || []).calories;
    const h = Math.max(2, (cal / maxCal) * 90);
    const label = d.slice(5);
    return `
      <div class="chart-bar-col">
        <div class="chart-bar" style="height:${h}px" title="${cal} kcal"></div>
        <span class="chart-lbl">${label}</span>
      </div>`;
  }).join('');

  const histHtml = days.map(d => {
    const foods = state.foodLog[d] || [];
    const t = totals(foods);
    const label = d === today() ? 'Today' : d;
    return `
      <div class="progress-day">
        <div class="progress-day-date">${label}</div>
        <div class="progress-day-cal">${fmt(t.calories)} kcal</div>
        <div class="progress-day-macros">P: ${fmt(t.protein)}g · C: ${fmt(t.carbs)}g · F: ${fmt(t.fat)}g</div>
      </div>`;
  }).join('') || '<div class="empty-msg">No history yet — start logging!</div>';

  const workoutDays = Object.keys(state.workoutLog).sort().reverse().slice(0, 7);
  const workoutHist = workoutDays.map(d => {
    const sessions = state.workoutLog[d];
    const label = d === today() ? 'Today' : d;
    return `
      <div class="progress-day" style="border-color:var(--blue)">
        <div class="progress-day-date">${label}</div>
        <div class="progress-day-cal" style="color:var(--blue)">${sessions.map(s => s.type).join(', ')}</div>
        <div class="progress-day-macros">${sessions.reduce((n, s) => n + s.exercises.length, 0)} exercise(s) total</div>
      </div>`;
  }).join('') || '<div class="empty-msg">No workout history yet.</div>';

  return `
    <div class="card">
      <div class="card-title">Calories — Last 14 Days</div>
      ${chartDays.length ? `<div class="chart-wrap"><div class="chart-bars">${bars}</div></div>` : '<div class="empty-msg">No data yet.</div>'}
    </div>
    <div class="progress-section-title">Nutrition History</div>
    ${histHtml}
    <div class="progress-section-title">Workout History</div>
    ${workoutHist}
  `;
}

// ── Settings Page ──────────────────────────────────────────────────────────
function renderSettings() {
  const g = state.goals;
  return `
    <div class="card">
      <div class="card-title">Daily Goals</div>
      <div class="field"><label>Calorie Goal (kcal)</label>
        <input type="number" inputmode="numeric" id="s-calories" value="${g.calories}" /></div>
      <div class="field-row">
        <div class="field"><label>Protein (g)</label>
          <input type="number" inputmode="numeric" id="s-protein" value="${g.protein}" /></div>
        <div class="field"><label>Carbs (g)</label>
          <input type="number" inputmode="numeric" id="s-carbs" value="${g.carbs}" /></div>
        <div class="field"><label>Fat (g)</label>
          <input type="number" inputmode="numeric" id="s-fat" value="${g.fat}" /></div>
      </div>
      <button class="btn" id="save-goals">Save Goals</button>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title">Data</div>
      <div class="setting-row">
        <div><div class="setting-label">Clear Today's Food Log</div><div class="setting-sub">Remove all food entries for today</div></div>
        <button class="btn btn-danger btn-sm" id="clear-today-food">Clear</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Clear Today's Workout</div><div class="setting-sub">Remove all sessions for today</div></div>
        <button class="btn btn-danger btn-sm" id="clear-today-workout">Clear</button>
      </div>
    </div>
  `;
}

// ── Add Food Modal (Search + Barcode + Manual, with units) ─────────────────
function showAddFoodModal(meal) {
  pendingMeal = meal || 'snacks';
  const mealInfo = MEALS.find(m => m.key === pendingMeal);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">Add Food — ${mealInfo.icon} ${mealInfo.label}</div>

      <div class="tab-switch">
        <button class="tab-btn active" data-tab="search">🔍 Search</button>
        <button class="tab-btn" data-tab="barcode">📷 Barcode</button>
        <button class="tab-btn" data-tab="manual">✏️ Manual</button>
      </div>

      <!-- Search tab -->
      <div id="tab-search">
        <div class="search-row">
          <input type="text" id="food-search-input" placeholder="Search food..." autocomplete="off" />
          <button class="btn btn-sm" id="food-search-btn">Go</button>
        </div>
        <div id="search-status" class="search-status"></div>
        <div id="search-results"></div>
      </div>

      <!-- Barcode tab -->
      <div id="tab-barcode" style="display:none">
        <div id="barcode-reader"></div>
        <div id="barcode-status" class="search-status">Tap "Start Scanning" to use your camera.</div>
        <button class="btn btn-sm" id="start-scan-btn">Start Scanning</button>
        <div id="barcode-results"></div>
      </div>

      <!-- Manual tab -->
      <div id="tab-manual" style="display:none">
        <div class="field"><label>Food Name</label><input type="text" id="f-name" placeholder="e.g. Chicken Breast" /></div>
        <div class="field-row">
          <div class="field"><label>Amount</label><input type="number" inputmode="decimal" id="f-amount" placeholder="100" value="100" /></div>
          <div class="field"><label>Unit</label>
            <select id="f-unit">
              <option value="g">grams (g)</option>
              <option value="ml">millilitres (ml)</option>
              <option value="serving">serving(s)</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Calories</label><input type="number" inputmode="numeric" id="f-cal" placeholder="0" /></div>
          <div class="field"><label>Protein (g)</label><input type="number" inputmode="decimal" id="f-pro" placeholder="0" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Carbs (g)</label><input type="number" inputmode="decimal" id="f-carb" placeholder="0" /></div>
          <div class="field"><label>Fat (g)</label><input type="number" inputmode="decimal" id="f-fat" placeholder="0" /></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="manual-cancel">Cancel</button>
          <button class="btn" id="manual-save">Add Food</button>
        </div>
      </div>

      <button class="btn btn-ghost" id="search-cancel" style="margin-top:12px">Cancel</button>
    </div>`;

  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // stop camera if leaving barcode tab
      if (btn.dataset.tab !== 'barcode') stopBarcodeScanner();
      overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-search').style.display  = tab === 'search'  ? '' : 'none';
      document.getElementById('tab-barcode').style.display = tab === 'barcode' ? '' : 'none';
      document.getElementById('tab-manual').style.display  = tab === 'manual'  ? '' : 'none';
      if (tab === 'search') document.getElementById('food-search-input').focus();
      if (tab === 'manual') document.getElementById('f-name').focus();
    });
  });

  // Close
  overlay.addEventListener('click', e => { if (e.target === overlay) { stopBarcodeScanner(); overlay.remove(); } });
  document.getElementById('search-cancel').addEventListener('click', () => { stopBarcodeScanner(); overlay.remove(); });
  document.getElementById('manual-cancel').addEventListener('click', () => { stopBarcodeScanner(); overlay.remove(); });

  // ── Text Search ──
  const searchInput = document.getElementById('food-search-input');
  const searchBtn   = document.getElementById('food-search-btn');
  const statusEl    = document.getElementById('search-status');
  const resultsEl   = document.getElementById('search-results');
  searchInput.focus();

  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    statusEl.textContent = 'Searching…';
    resultsEl.innerHTML = '';
    searchBtn.disabled = true;
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,nutriments,brands,serving_size`;
      const res  = await fetch(url);
      const data = await res.json();
      renderFoodResults(data.products, resultsEl, statusEl);
    } catch (err) {
      statusEl.textContent = 'Search failed — check your connection or use manual entry.';
    }
    searchBtn.disabled = false;
  }
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // ── Barcode Scan ──
  document.getElementById('start-scan-btn').addEventListener('click', () => startBarcodeScanner(overlay));

  // ── Manual save ──
  document.getElementById('manual-save').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) return;
    addFoodEntry({
      name,
      amount:   parseFloat(document.getElementById('f-amount').value) || 100,
      unit:     document.getElementById('f-unit').value,
      calories: parseFloat(document.getElementById('f-cal').value)  || 0,
      protein:  parseFloat(document.getElementById('f-pro').value)  || 0,
      carbs:    parseFloat(document.getElementById('f-carb').value) || 0,
      fat:      parseFloat(document.getElementById('f-fat').value)  || 0,
    });
    overlay.remove();
  });
}

function renderFoodResults(products, resultsEl, statusEl) {
  const filtered = (products || []).filter(p =>
    p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] != null
  );

  if (!filtered.length) {
    statusEl.textContent = 'No results found. Try manual entry.';
    resultsEl.innerHTML = '';
    return;
  }

  statusEl.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''} found`;
  resultsEl.innerHTML = filtered.map((p, i) => {
    const n    = p.nutriments;
    const cal  = Math.round(n['energy-kcal_100g']  || 0);
    const pro  = Math.round(n['proteins_100g']     || 0);
    const carb = Math.round(n['carbohydrates_100g']|| 0);
    const fat  = Math.round(n['fat_100g']          || 0);
    const brand = p.brands ? `<span class="result-brand">${p.brands.split(',')[0]}</span>` : '';
    return `
      <div class="search-result" data-idx="${i}">
        <div class="result-name">${p.product_name} ${brand}</div>
        <div class="result-macros">${cal} kcal · P ${pro}g · C ${carb}g · F ${fat}g <span class="result-per">per 100g</span></div>
        <div class="result-serving-row">
          <input class="serving-input" type="number" inputmode="numeric" value="100" min="1" data-idx="${i}" />
          <select class="serving-unit" data-idx="${i}">
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="serving">serving</option>
          </select>
          <button class="btn btn-sm result-add-btn" data-idx="${i}"
            data-name="${p.product_name.replace(/"/g,'&quot;')}"
            data-cal="${cal}" data-pro="${pro}" data-carb="${carb}" data-fat="${fat}">Add</button>
        </div>
      </div>`;
  }).join('');

  resultsEl.querySelectorAll('.result-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx     = btn.dataset.idx;
      const amount  = parseFloat(resultsEl.querySelector(`.serving-input[data-idx="${idx}"]`).value) || 100;
      const unit    = resultsEl.querySelector(`.serving-unit[data-idx="${idx}"]`).value;
      // ratio is per-100(g/ml); "serving" unit just uses the raw per-100 values as-is times amount/1
      const ratio   = unit === 'serving' ? amount : (amount / 100);
      addFoodEntry({
        name:     btn.dataset.name,
        amount, unit,
        calories: parseFloat(btn.dataset.cal)  * ratio,
        protein:  parseFloat(btn.dataset.pro)  * ratio,
        carbs:    parseFloat(btn.dataset.carb) * ratio,
        fat:      parseFloat(btn.dataset.fat)  * ratio,
      });
      document.querySelector('.modal-overlay')?.remove();
    });
  });
}

// ── Barcode Scanner ────────────────────────────────────────────────────────
function startBarcodeScanner(overlay) {
  const statusEl = document.getElementById('barcode-status');
  const resultsEl = document.getElementById('barcode-results');
  if (typeof Html5Qrcode === 'undefined') {
    statusEl.textContent = 'Camera library failed to load — check your connection.';
    return;
  }
  statusEl.textContent = 'Starting camera…';
  html5QrCode = new Html5Qrcode("barcode-reader");

  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    async (decodedText) => {
      statusEl.textContent = `Found barcode: ${decodedText} — looking up…`;
      stopBarcodeScanner();
      await lookupBarcode(decodedText, statusEl, resultsEl);
    },
    () => { /* ignore per-frame scan failures */ }
  ).catch(err => {
    statusEl.textContent = 'Could not access camera. Check permissions in Settings.';
  });
}

function stopBarcodeScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
    html5QrCode = null;
  }
}

async function lookupBarcode(barcode, statusEl, resultsEl) {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      statusEl.textContent = 'Product not found in database. Try search or manual entry.';
      return;
    }
    const p = data.product;
    const n = p.nutriments || {};
    if (n['energy-kcal_100g'] == null) {
      statusEl.textContent = 'Product found but missing nutrition data. Try manual entry.';
      return;
    }
    statusEl.textContent = 'Product found!';
    renderFoodResults([{
      product_name: p.product_name || 'Unknown product',
      brands: p.brands,
      nutriments: n,
    }], resultsEl, { textContent: '' }); // reuse render logic, dummy status holder
  } catch (err) {
    statusEl.textContent = 'Lookup failed — check your connection.';
  }
}

function addFoodEntry(entry) {
  entry.meal = pendingMeal || 'snacks';
  if (!state.foodLog[today()]) state.foodLog[today()] = [];
  state.foodLog[today()].push(entry);
  save();
  navigate('nutrition');
}

// ── Workout Session Modals ─────────────────────────────────────────────────
function showAddSessionModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">Start Workout Session</div>
      <div class="field"><label>Session Type</label>
        <input type="text" id="sess-type" placeholder="e.g. Back Day" list="workout-types" />
        <datalist id="workout-types">
          ${WORKOUT_TYPES.map(t => `<option value="${t}">`).join('')}
        </datalist>
      </div>
      <div class="quick-types">
        ${WORKOUT_TYPES.map(t => `<button class="chip quick-type-btn" data-type="${t}">${t}</button>`).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn" id="modal-save-sess">Start</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = document.getElementById('sess-type');
  input.focus();

  overlay.querySelectorAll('.quick-type-btn').forEach(btn => {
    btn.addEventListener('click', () => { input.value = btn.dataset.type; });
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('modal-save-sess').addEventListener('click', () => {
    const type = input.value.trim();
    if (!type) return;
    if (!state.workoutLog[today()]) state.workoutLog[today()] = [];
    state.workoutLog[today()].push({ id: uid(), type, exercises: [] });
    save();
    overlay.remove();
    navigate('workout');
  });
}

function showAddExerciseModal(sessId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">Add Exercise</div>
      <div class="field"><label>Exercise Name</label><input type="text" id="e-name" placeholder="e.g. Bench Press" /></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn" id="modal-save-ex">Add</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('e-name').focus();

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('modal-save-ex').addEventListener('click', () => {
    const name = document.getElementById('e-name').value.trim();
    if (!name) return;
    const sess = state.workoutLog[today()].find(s => s.id === sessId);
    sess.exercises.push({ name, sets: [{ weight: '', reps: '' }] });
    save();
    overlay.remove();
    navigate('workout');
  });
}

function showWorkoutHistoryModal(filterType) {
  const existing = document.getElementById('history-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'history-overlay';
  overlay.innerHTML = `<div class="modal-sheet">${renderWorkoutHistory(filterType)}</div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('close-history').addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => showWorkoutHistoryModal(chip.dataset.filter || null));
  });
}

// ── Event Listeners ────────────────────────────────────────────────────────
function attachListeners(page) {
  if (page === 'nutrition') {
    document.querySelectorAll('.add-meal-food').forEach(btn => {
      btn.addEventListener('click', () => showAddFoodModal(btn.dataset.meal));
    });
    document.querySelectorAll('.food-del').forEach(btn => {
      btn.addEventListener('click', () => {
        state.foodLog[today()].splice(parseInt(btn.dataset.idx), 1);
        save(); navigate('nutrition');
      });
    });
  }

  if (page === 'workout') {
    document.getElementById('open-add-session')?.addEventListener('click', showAddSessionModal);
    document.getElementById('open-workout-history')?.addEventListener('click', () => showWorkoutHistoryModal(null));

    document.querySelectorAll('.del-session').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this session?')) return;
        const arr = state.workoutLog[today()];
        const idx = arr.findIndex(s => s.id === btn.dataset.sess);
        arr.splice(idx, 1);
        save(); navigate('workout');
      });
    });

    document.querySelectorAll('.add-exercise-to-session').forEach(btn => {
      btn.addEventListener('click', () => showAddExerciseModal(btn.dataset.sess));
    });

    document.querySelectorAll('.del-exercise').forEach(btn => {
      btn.addEventListener('click', () => {
        const sess = state.workoutLog[today()].find(s => s.id === btn.dataset.sess);
        sess.exercises.splice(parseInt(btn.dataset.ei), 1);
        save(); navigate('workout');
      });
    });

    document.querySelectorAll('.add-set-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sess = state.workoutLog[today()].find(s => s.id === btn.dataset.sess);
        sess.exercises[parseInt(btn.dataset.ei)].sets.push({ weight: '', reps: '' });
        save(); navigate('workout');
      });
    });

    document.querySelectorAll('.set-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const sess = state.workoutLog[today()].find(s => s.id === btn.dataset.sess);
        const sets = sess.exercises[parseInt(btn.dataset.ei)].sets;
        if (sets.length <= 1) return;
        sets.splice(parseInt(btn.dataset.si), 1);
        save(); navigate('workout');
      });
    });

    document.querySelectorAll('.set-val').forEach(input => {
      input.addEventListener('change', () => {
        const sess = state.workoutLog[today()].find(s => s.id === input.dataset.sess);
        const ei = parseInt(input.dataset.ei), si = parseInt(input.dataset.si);
        sess.exercises[ei].sets[si][input.dataset.field] = input.value;
        save();
      });
    });
  }

  if (page === 'settings') {
    document.getElementById('save-goals')?.addEventListener('click', () => {
      state.goals = {
        calories: parseInt(document.getElementById('s-calories').value) || 2000,
        protein:  parseInt(document.getElementById('s-protein').value)  || 150,
        carbs:    parseInt(document.getElementById('s-carbs').value)    || 200,
        fat:      parseInt(document.getElementById('s-fat').value)      || 65,
      };
      save(); navigate('nutrition');
    });
    document.getElementById('clear-today-food')?.addEventListener('click', () => {
      if (!confirm('Clear all food entries for today?')) return;
      state.foodLog[today()] = [];
      save(); navigate('settings');
    });
    document.getElementById('clear-today-workout')?.addEventListener('click', () => {
      if (!confirm('Clear today\'s workout sessions?')) return;
      state.workoutLog[today()] = [];
      save(); navigate('settings');
    });
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  navigate('nutrition');
});
