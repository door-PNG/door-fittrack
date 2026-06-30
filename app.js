// ── State ──────────────────────────────────────────────────────────────────
const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

function loadState() {
  return {
    goals:    JSON.parse(localStorage.getItem('ft_goals'))    || { ...DEFAULT_GOALS },
    foodLog:  JSON.parse(localStorage.getItem('ft_foodLog'))  || {},
    workouts: JSON.parse(localStorage.getItem('ft_workouts')) || {},
  };
}

function save() {
  localStorage.setItem('ft_goals',    JSON.stringify(state.goals));
  localStorage.setItem('ft_foodLog',  JSON.stringify(state.foodLog));
  localStorage.setItem('ft_workouts', JSON.stringify(state.workouts));
}

let state = loadState();
let currentPage = 'nutrition';
let pendingMeal = 'breakfast'; // which meal the Add Food modal is adding to

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch',     label: 'Lunch',     icon: '☀️' },
  { key: 'dinner',    label: 'Dinner',    icon: '🌙' },
  { key: 'snacks',    label: 'Snacks',    icon: '🍪' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function fmt(n) { return Math.round(n); }
function todayFoods() { return state.foodLog[today()] || []; }
function todayWorkouts() { return state.workouts[today()] || []; }

// Migrate old entries (no meal field) to "snacks" so nothing is lost
function migrateFoodLog() {
  let changed = false;
  Object.values(state.foodLog).forEach(dayFoods => {
    dayFoods.forEach(f => {
      if (!f.meal) { f.meal = 'snacks'; changed = true; }
    });
  });
  if (changed) save();
}
migrateFoodLog();

function totals(foods) {
  return foods.reduce((acc, f) => ({
    calories: acc.calories + (f.calories || 0),
    protein:  acc.protein  + (f.protein  || 0),
    carbs:    acc.carbs    + (f.carbs    || 0),
    fat:      acc.fat      + (f.fat      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function pct(val, goal) { return Math.min(1, goal > 0 ? val / goal : 0); }

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
      ? mealFoods.map((f, i) => {
          // find true index in full foods array for delete
          const trueIdx = foods.indexOf(f);
          return `
          <div class="food-item">
            <div>
              <div class="food-name">${f.name}</div>
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

// ── Workout Page ───────────────────────────────────────────────────────────
function renderWorkout() {
  const exercises = todayWorkouts();
  const exHtml = exercises.length
    ? exercises.map((ex, ei) => `
      <div class="workout-exercise" data-ei="${ei}">
        <div class="exercise-header">
          <span class="exercise-name">${ex.name}</span>
          <button class="btn btn-ghost btn-sm del-exercise" data-ei="${ei}">Remove</button>
        </div>
        ${ex.sets.map((s, si) => `
          <div class="set-row">
            <span class="set-num">${si + 1}</span>
            <input class="set-val" type="number" inputmode="decimal" placeholder="kg" value="${s.weight}" data-ei="${ei}" data-si="${si}" data-field="weight" />
            <span class="set-x">×</span>
            <input class="set-val" type="number" inputmode="numeric" placeholder="reps" value="${s.reps}" data-ei="${ei}" data-si="${si}" data-field="reps" />
            <button class="set-del" data-ei="${ei}" data-si="${si}">✕</button>
          </div>`).join('')}
        <button class="add-set-btn" data-ei="${ei}">+ Add Set</button>
      </div>`).join('')
    : '<div class="empty-msg">No exercises yet — add your first!</div>';

  return `
    <div class="card">
      <div class="card-title">Today's Workout</div>
      ${exHtml}
    </div>
    <button class="btn" id="open-add-exercise">+ Add Exercise</button>
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

  const workoutDays = Object.keys(state.workouts).sort().reverse().slice(0, 7);
  const workoutHist = workoutDays.map(d => {
    const exs = state.workouts[d];
    const label = d === today() ? 'Today' : d;
    return `
      <div class="progress-day" style="border-color:var(--blue)">
        <div class="progress-day-date">${label}</div>
        <div class="progress-day-cal" style="color:var(--blue)">${exs.length} exercise${exs.length !== 1 ? 's' : ''}</div>
        <div class="progress-day-macros">${exs.map(e => e.name).join(', ')}</div>
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
        <div><div class="setting-label">Clear Today's Workout</div><div class="setting-sub">Remove all exercises for today</div></div>
        <button class="btn btn-danger btn-sm" id="clear-today-workout">Clear</button>
      </div>
    </div>
  `;
}

// ── Add Food Modal (Search + Manual) ──────────────────────────────────────
function showAddFoodModal(meal) {
  pendingMeal = meal || 'snacks';
  const mealInfo = MEALS.find(m => m.key === pendingMeal);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">Add Food — ${mealInfo.icon} ${mealInfo.label}</div>

      <!-- Tab switcher -->
      <div class="tab-switch">
        <button class="tab-btn active" data-tab="search">🔍 Search</button>
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

      <!-- Manual tab -->
      <div id="tab-manual" style="display:none">
        <div class="field"><label>Food Name</label><input type="text" id="f-name" placeholder="e.g. Chicken Breast" /></div>
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
      overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-search').style.display = tab === 'search' ? '' : 'none';
      document.getElementById('tab-manual').style.display  = tab === 'manual' ? '' : 'none';
      if (tab === 'search') document.getElementById('food-search-input').focus();
      if (tab === 'manual') document.getElementById('f-name').focus();
    });
  });

  // Close
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('search-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('manual-cancel').addEventListener('click', () => overlay.remove());

  // Search
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
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,nutriments,brands`;
      const res  = await fetch(url);
      const data = await res.json();
      const products = (data.products || []).filter(p =>
        p.product_name &&
        p.nutriments &&
        p.nutriments['energy-kcal_100g'] != null
      );

      if (!products.length) {
        statusEl.textContent = 'No results found. Try manual entry.';
      } else {
        statusEl.textContent = `${products.length} result${products.length !== 1 ? 's' : ''} found`;
        resultsEl.innerHTML = products.map((p, i) => {
          const n   = p.nutriments;
          const cal = Math.round(n['energy-kcal_100g'] || 0);
          const pro = Math.round(n['proteins_100g']    || 0);
          const carb= Math.round(n['carbohydrates_100g']|| 0);
          const fat = Math.round(n['fat_100g']          || 0);
          const brand = p.brands ? `<span class="result-brand">${p.brands.split(',')[0]}</span>` : '';
          return `
            <div class="search-result" data-idx="${i}">
              <div class="result-name">${p.product_name} ${brand}</div>
              <div class="result-macros">${cal} kcal · P ${pro}g · C ${carb}g · F ${fat}g <span class="result-per">per 100g</span></div>
              <div class="result-serving-row">
                <label>Serving size (g)</label>
                <input class="serving-input" type="number" inputmode="numeric" value="100" min="1" data-idx="${i}" />
                <button class="btn btn-sm result-add-btn" data-idx="${i}"
                  data-name="${p.product_name.replace(/"/g,'&quot;')}"
                  data-cal="${cal}" data-pro="${pro}" data-carb="${carb}" data-fat="${fat}">Add</button>
              </div>
            </div>`;
        }).join('');

        // Add buttons
        resultsEl.querySelectorAll('.result-add-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx     = btn.dataset.idx;
            const serving = parseFloat(resultsEl.querySelector(`.serving-input[data-idx="${idx}"]`).value) || 100;
            const ratio   = serving / 100;
            addFoodEntry({
              name:     btn.dataset.name + ` (${serving}g)`,
              calories: parseFloat(btn.dataset.cal)  * ratio,
              protein:  parseFloat(btn.dataset.pro)  * ratio,
              carbs:    parseFloat(btn.dataset.carb) * ratio,
              fat:      parseFloat(btn.dataset.fat)  * ratio,
            });
            overlay.remove();
          });
        });
      }
    } catch (err) {
      statusEl.textContent = 'Search failed — check your connection or use manual entry.';
    }

    searchBtn.disabled = false;
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // Manual save
  document.getElementById('manual-save').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) return;
    addFoodEntry({
      name,
      calories: parseFloat(document.getElementById('f-cal').value)  || 0,
      protein:  parseFloat(document.getElementById('f-pro').value)  || 0,
      carbs:    parseFloat(document.getElementById('f-carb').value) || 0,
      fat:      parseFloat(document.getElementById('f-fat').value)  || 0,
    });
    overlay.remove();
  });
}

function addFoodEntry(entry) {
  entry.meal = pendingMeal || 'snacks';
  if (!state.foodLog[today()]) state.foodLog[today()] = [];
  state.foodLog[today()].push(entry);
  save();
  navigate('nutrition');
}

// ── Add Exercise Modal ─────────────────────────────────────────────────────
function showAddExerciseModal() {
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
    if (!state.workouts[today()]) state.workouts[today()] = [];
    state.workouts[today()].push({ name, sets: [{ weight: '', reps: '' }] });
    save();
    overlay.remove();
    navigate('workout');
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
    document.getElementById('open-add-exercise')?.addEventListener('click', showAddExerciseModal);
    document.querySelectorAll('.del-exercise').forEach(btn => {
      btn.addEventListener('click', () => {
        state.workouts[today()].splice(parseInt(btn.dataset.ei), 1);
        save(); navigate('workout');
      });
    });
    document.querySelectorAll('.add-set-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.workouts[today()][parseInt(btn.dataset.ei)].sets.push({ weight: '', reps: '' });
        save(); navigate('workout');
      });
    });
    document.querySelectorAll('.set-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const ei = parseInt(btn.dataset.ei), si = parseInt(btn.dataset.si);
        const sets = state.workouts[today()][ei].sets;
        if (sets.length <= 1) return;
        sets.splice(si, 1);
        save(); navigate('workout');
      });
    });
    document.querySelectorAll('.set-val').forEach(input => {
      input.addEventListener('change', () => {
        const ei = parseInt(input.dataset.ei), si = parseInt(input.dataset.si);
        state.workouts[today()][ei].sets[si][input.dataset.field] = input.value;
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
      if (!confirm('Clear today\'s workout?')) return;
      state.workouts[today()] = [];
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
