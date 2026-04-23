
// ============ SUPABASE КОНФИГУРАЦИЯ ============
const SUPABASE_URL = "https://vcdwobqhbbxodjjmwyex.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjZHdvYnFoYmJ4b2Rqam13eWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNjg0MDIsImV4cCI6MjA4OTc0NDQwMn0.6V1JvPLIiEop73Dina2p9hljkWfdYWMbAizzPd1IqQ8";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ КОНФИГУРАЦИЯ ============
// В Supabase Auth создайте администратора и используйте его email и пароль.
// Хранить логин/пароль администратора в клиентском коде небезопасно.
const STORAGE_KEYS = {
  THEME: "tu_theme",
  WALLPAPER: "tu_wallpaper",
  GLASS_STRENGTH: "tu_glass_strength",
  STUDENT: "tu_student",
  GRADES: "tu_grades",
  TIMETABLES: "tu_timetables",
  PROFILES: "tu_profiles",
  REMOTE: "tu_remote",
  SCHEMA_VERSION: "tu_schema_version"
};
const SCHEMA_VERSION = 2;

// Debug-гвард: чтобы не засорять консоль в продакшене.
const DEBUG = /[?&]debug=1\b/.test(location.search) || localStorage.getItem("tu_debug") === "1";
function debug(...args) { if (DEBUG) console.log(...args); }

// Безопасные обёртки над localStorage: не роняют приложение на QuotaExceeded / JSON.parse ошибках.
function safeSetLS(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch (e) { debug("localStorage set failed:", key, e); return false; }
}
function safeGetLS(key) {
  try { return localStorage.getItem(key); }
  catch (e) { debug("localStorage get failed:", key, e); return null; }
}
function safeJSONParse(raw, fallback) {
  try { const v = JSON.parse(raw); return v ?? fallback; }
  catch (e) { debug("JSON.parse failed:", e); return fallback; }
}

// Миграция localStorage при смене схемы.
function runStorageMigrations() {
  const v = parseInt(safeGetLS(STORAGE_KEYS.SCHEMA_VERSION), 10) || 1;
  if (v === SCHEMA_VERSION) return;
  // v1 -> v2: валидировать, что timetables — объект, иначе сбросить.
  if (v < 2) {
    const raw = safeGetLS(STORAGE_KEYS.TIMETABLES);
    const parsed = safeJSONParse(raw, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      safeSetLS(STORAGE_KEYS.TIMETABLES, "{}");
    }
  }
  safeSetLS(STORAGE_KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
}

// ============ ДАННЫЕ ============
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
let PROFILES = ["ФМИ", "ИМ", "ФХ", "ЕН", "СЭ"];

function formatDateForInput(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s) {
  if (!s) return new Date();
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getMondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(12, 0, 0, 0);
  return date;
}

/** day: 1=Пн … 6=Сб */
function alignToWeekdayInSameWeek(selectedDate, weekday1to6) {
  const mon = getMondayOfWeek(selectedDate);
  const out = new Date(mon);
  out.setDate(mon.getDate() + (weekday1to6 - 1));
  return out;
}

function formatLongRussianDate(d) {
  return d.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

// Полное экранирование для вставки в innerHTML (и как текст, и как значение атрибута)
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Обратная совместимость
const escapeAttr = escapeHtml;

function isSameCalendarDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function lessonCabinetForStudent(lesson) {
  if (lesson.cabinet != null && String(lesson.cabinet).trim() !== "") return lesson.cabinet;
  const g = state.student.group;
  if (g && lesson.cabinetsByGroup && lesson.cabinetsByGroup[g] != null && String(lesson.cabinetsByGroup[g]).trim() !== "") {
    return lesson.cabinetsByGroup[g];
  }
  return "—";
}

const DEFAULT_TIMES = {
  weekday: {
    1: { start: "08:15", end: "08:55" },
    2: { start: "09:05", end: "09:45" },
    3: { start: "09:55", end: "10:35" },
    4: { start: "10:45", end: "11:25" },
    5: { start: "11:45", end: "12:25" },
    6: { start: "13:15", end: "13:55" },
    7: { start: "14:00", end: "14:40" },
    8: { start: "14:45", end: "15:25" }
  },
  saturday: {
    1: { start: "09:00", end: "09:40" },
    2: { start: "09:45", end: "10:25" },
    3: { start: "10:35", end: "11:15" },
    4: { start: "11:30", end: "12:10" },
    5: { start: "12:15", end: "12:55" },
    6: { start: "13:00", end: "13:40" },
    7: { start: "13:45", end: "14:25" },
    8: { start: "14:30", end: "15:10" }
  },
  bigBreak: { start: "12:25", end: "13:15" },
  ninthDefault: { start: "15:30", end: "16:10" }
};

// Единое состояние, разбитое по доменам:
//   student — выбранный класс/группа/профиль ученика и предпочтения просмотра
//   admin   — авторизация и контекст редактирования (дата, день недели)
//   schedule— состояние вкладки «Расписание»
//   ui      — текущий экран / вкладка
//   data    — всё, что пришло из облака/хранилища (оценки, расписание, профили, remote)
const state = {
  student: {
    class: null,
    group: "",
    profile: "",
    dayView: "today"
  },
  admin: {
    authenticated: false,
    scheduleDate: formatDateForInput(new Date()),
    selectedDay: 1
  },
  schedule: {
    selectedDay: new Date().getDay() || 1,
    viewDate: formatDateForInput(new Date())
  },
  ui: {
    currentScreen: "schedule"
  },
  data: {
    grades: [],
    timetables: {},
    profiles: [...PROFILES],
    remoteClasses: {}
  }
};

// ============ ИНИЦИАЛИЗАЦИЯ ============
// Id таймеров, чтобы можно было их отменить (hot reload / page hide).
let _dateTimer = null;
let _progressTimer = null;
window.addEventListener("beforeunload", () => {
  if (_dateTimer) clearInterval(_dateTimer);
  if (_progressTimer) clearInterval(_progressTimer);
  if (_realtimeChannel && supabase?.removeChannel) supabase.removeChannel(_realtimeChannel);
});

// A11y: кликабельные div-ы навигации должны быть доступны с клавиатуры и скринридеров.
function enhanceNavA11y() {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(el => {
    if (!el.hasAttribute("role")) el.setAttribute("role", "button");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  });
}

// ============ EVENT DELEGATION ============
// Единая точка диспетчеризации вместо inline onclick/onchange/oninput.
// Имя функции берётся из data-action / data-change / data-input, аргументы —
// из остальных data-* атрибутов конкретного элемента.
const CLICK_ACTIONS = {
  enterAsStudent: () => enterAsStudent(),
  showAdminLogin: () => showAdminLogin(),
  closeAdminLogin: () => closeAdminLogin(),
  loginAdmin: () => loginAdmin(),
  toggleTheme: () => toggleTheme(),
  saveStudentSettings: () => saveStudentSettings(),
  toggleThemeCollapsible: () => toggleThemeCollapsible(),
  clearWallpaper: () => clearWallpaper(),
  addGrade: () => addGrade(),
  resetGrades: () => resetGrades(),
  logoutAdmin: () => logoutAdmin(),
  addNewLesson: () => addNewLesson(),
  clearAllLessons: () => clearAllLessons(),
  addProfile: () => addProfile(),
  saveAdminTimetable: () => saveAdminTimetable(),
  showScreen: (el) => showScreen(el.dataset.screen),
  selectDay: (el) => selectDay(parseInt(el.dataset.day, 10)),
  selectAdminDay: (el) => selectAdminDay(parseInt(el.dataset.day, 10)),
  setTheme: (el) => setTheme(el.dataset.themeId),
  removeGrade: (el) => removeGrade(parseInt(el.dataset.idx, 10)),
  removeProfile: (el) => removeProfile(parseInt(el.dataset.idx, 10)),
  removeAdminLesson: (el) => removeAdminLesson(el)
};
const CHANGE_ACTIONS = {
  onClassChange: (el, e) => onClassChange(e),
  onAdminClassChange: (el, e) => onAdminClassChange(e),
  onAdminGroupOrProfileChange: (el, e) => onAdminGroupOrProfileChange(e),
  toggleRemoteLearning: (el, e) => toggleRemoteLearning(e),
  toggleNinthLesson: (el, e) => toggleNinthLesson(e),
  onWallpaperFile: (el, e) => onWallpaperFile(e),
  onScheduleDateChange: (el, e) => onScheduleDateChange(e),
  onAdminScheduleDateChange: (el, e) => onAdminScheduleDateChange(e)
};
const INPUT_ACTIONS = {
  onGlassStrengthInput: (el) => onGlassStrengthInput(el.value)
};

function installEventDelegation() {
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const fn = CLICK_ACTIONS[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.body.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    const fn = CHANGE_ACTIONS[el.dataset.change];
    if (fn) fn(el, e);
  });
  document.body.addEventListener("input", (e) => {
    const el = e.target.closest("[data-input]");
    if (!el) return;
    const fn = INPUT_ACTIONS[el.dataset.input];
    if (fn) fn(el, e);
  });
  // Клавиатурная доступность для элементов с data-action и role="button".
  document.body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.tagName === "BUTTON" || el.tagName === "INPUT") return;
    e.preventDefault();
    el.click();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  runStorageMigrations();
  installEventDelegation();
  enhanceNavA11y();
  loadTheme();
  await loadDataFromSupabase();
  await initAuthState();
  generateClassOptions();
  updateDateTime();
  _dateTimer = setInterval(updateDateTime, 1000);
  _progressTimer = setInterval(updateLessonProgress, 30000);
  
  // Дата просмотра расписания (сегодня / завтра из настроек)
  let base = new Date();
  if (state.student.dayView === "tomorrow") base.setDate(base.getDate() + 1);
  if (base.getDay() === 0) base.setDate(base.getDate() + 1);
  state.schedule.viewDate = formatDateForInput(base);
  const sd = document.getElementById("scheduleDateInput");
  if (sd) sd.value = state.schedule.viewDate;
  const dow = parseISODate(state.schedule.viewDate).getDay();
  state.schedule.selectedDay = dow === 0 ? 1 : dow;
  syncScheduleDayButtons();

  const todayDow = new Date().getDay();
  if (todayDow !== 0) {
    state.admin.selectedDay = todayDow;
    state.admin.scheduleDate = formatDateForInput(alignToWeekdayInSameWeek(new Date(), todayDow));
    const ad = document.getElementById("adminScheduleDateInput");
    if (ad) ad.value = state.admin.scheduleDate;
  } else {
    state.admin.selectedDay = 1;
    state.admin.scheduleDate = formatDateForInput(alignToWeekdayInSameWeek(new Date(), 1));
    const ad = document.getElementById("adminScheduleDateInput");
    if (ad) ad.value = state.admin.scheduleDate;
  }
});

// ============ ТЕМА ============
const THEME_ICONS = {
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const THEMES = [
  {
    id: "light",
    name: "Светлая",
    desc: "Классическая светлая",
    preview: { side: "linear-gradient(180deg,#ffffff,#f3f4f6)", body: "radial-gradient(circle at top, #e5e7eb 0, #f3f4f6 100%)", fg: "#111827", accent: "#2563eb", accent2: "#1d4ed8", border: "#e5e7eb", muted: "#6b7280" }
  },
  {
    id: "dark",
    name: "Тёмная",
    desc: "Тёмная с мягкой подсветкой сверху",
    preview: { side: "linear-gradient(180deg,#020617,#0b1220)", body: "radial-gradient(circle at top, #e5e7eb 0, #030712 60%)", fg: "#e5e7eb", accent: "#1e3a8a", accent2: "#1e40af", border: "#1f2933", muted: "#9ca3af" }
  },
  {
    id: "ios-glass",
    name: "iOS Стекло",
    desc: "Размытие и пастельные блики",
    preview: { side: "rgba(255,255,255,0.6)", body: "radial-gradient(60% 60% at 15% 10%, rgba(96,165,250,0.8), transparent 70%),radial-gradient(55% 55% at 90% 20%, rgba(244,114,182,0.7), transparent 70%),radial-gradient(60% 60% at 80% 90%, rgba(250,204,21,0.55), transparent 70%),linear-gradient(180deg,#eef2ff,#e0e7ff)", fg: "#0f172a", accent: "#6366f1", accent2: "#2563eb", border: "rgba(255,255,255,0.7)", muted: "#475569" }
  },
  {
    id: "ios-glass-dark",
    name: "iOS Стекло (тёмная)",
    desc: "Тёмное стекло с неоновыми бликами",
    preview: { side: "rgba(15,23,42,0.7)", body: "radial-gradient(60% 60% at 15% 10%, rgba(99,102,241,0.7), transparent 70%),radial-gradient(55% 55% at 90% 20%, rgba(168,85,247,0.6), transparent 70%),radial-gradient(60% 60% at 80% 90%, rgba(56,189,248,0.55), transparent 70%),linear-gradient(180deg,#0c0c1a,#0f172a)", fg: "#e2e8f0", accent: "#818cf8", accent2: "#6366f1", border: "rgba(148,163,184,0.3)", muted: "#94a3b8" }
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "Чистый чёрный, макс. контраст",
    preview: { side: "#050505", body: "#000000", fg: "#f5f5f5", accent: "#f5f5f5", accent2: "#a1a1aa", border: "#1f1f1f", muted: "#a3a3a3" }
  },
  {
    id: "sunset",
    name: "Закат",
    desc: "Розово-фиолетовый неон",
    preview: { side: "rgba(30,14,46,0.85)", body: "radial-gradient(60% 60% at 20% 0%, rgba(244,114,182,0.8), transparent 70%),radial-gradient(55% 55% at 100% 20%, rgba(251,146,60,0.7), transparent 70%),radial-gradient(70% 70% at 50% 100%, rgba(168,85,247,0.75), transparent 70%),linear-gradient(160deg,#1a0b2e,#3b0764)", fg: "#fdf4ff", accent: "#f472b6", accent2: "#a855f7", border: "rgba(244,114,182,0.35)", muted: "#e9d5ff" }
  },
  {
    id: "dracula",
    name: "Dracula",
    desc: "Классика: фиолетовый и розовый",
    preview: { side: "linear-gradient(180deg,#343746,#44475a)", body: "radial-gradient(circle at top,#44475a 0,#282a36 70%)", fg: "#f8f8f2", accent: "#bd93f9", accent2: "#ff79c6", border: "#44475a", muted: "#6272a4" }
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    desc: "Синий неон ночного Токио",
    preview: { side: "linear-gradient(180deg,#24283b,#292e42)", body: "radial-gradient(circle at top,#292e42 0,#1a1b26 70%)", fg: "#c0caf5", accent: "#7aa2f7", accent2: "#bb9af7", border: "#414868", muted: "#7982a9" }
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    desc: "Пастель на тёмном фоне (Mocha)",
    preview: { side: "linear-gradient(180deg,#181825,#313244)", body: "radial-gradient(circle at top,#313244 0,#1e1e2e 70%)", fg: "#cdd6f4", accent: "#cba6f7", accent2: "#f5c2e7", border: "#313244", muted: "#a6adc8" }
  },
  {
    id: "lavender",
    name: "Лаванда",
    desc: "Мягкая пастельная светлая",
    preview: { side: "linear-gradient(180deg,#ffffff,#f5f3ff)", body: "radial-gradient(circle at top,#ede9fe 0,#f5f3ff 100%)", fg: "#1e1b4b", accent: "#7c3aed", accent2: "#6d28d9", border: "#e0d4fc", muted: "#6b7280" }
  }
];

const THEME_IDS = THEMES.map(t => t.id);

function updateThemeIcon(theme) {
  const el = document.getElementById("themeIcon");
  if (el) el.innerHTML = THEME_ICONS[theme] || THEME_ICONS.light;
  const sw = document.getElementById("themeSwitch");
  if (sw) sw.classList.toggle("on", theme === "dark");
}

const GLASS_THEMES = ["ios-glass", "ios-glass-dark", "sunset"];

function loadTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  // Если пользователь ничего не выбирал — учитываем системную тёмную тему.
  const systemDark = typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches;
  const fallback = systemDark ? "dark" : "light";
  const theme = THEME_IDS.includes(saved) ? saved : fallback;
  document.body.dataset.theme = theme;
  updateThemeIcon(theme);
  renderThemePicker();
  loadWallpaper();
  loadGlassStrength();
  updateGlassSettingState();
}

function setTheme(theme) {
  if (!THEME_IDS.includes(theme)) theme = "light";
  document.body.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  updateThemeIcon(theme);
  renderThemePicker();
  // Re-apply glass strength override (theme reset CSS vars to defaults)
  applyGlassStrength(getGlassStrength());
  updateGlassSettingState();
}

// ============ ОБОИ ============
// Обои хранятся в IndexedDB (лимит сотни МБ), чтобы не упираться в 5 МБ localStorage.
// Параллельно изображение пережимается canvas'ом до 1920×1080 / JPEG q=0.82.
const WP_DB_NAME = "tu_wallpaper_db";
const WP_STORE = "wallpapers";
const WP_KEY = "current";

function openWallpaperDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WP_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(WP_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveWallpaperToDB(dataUrl) {
  try {
    const db = await openWallpaperDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(WP_STORE, "readwrite");
      tx.objectStore(WP_STORE).put(dataUrl, WP_KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch (e) { debug("IndexedDB save wallpaper failed:", e); return false; }
}
async function readWallpaperFromDB() {
  try {
    const db = await openWallpaperDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(WP_STORE, "readonly");
      const r = tx.objectStore(WP_STORE).get(WP_KEY);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  } catch (e) { debug("IndexedDB read wallpaper failed:", e); return null; }
}
async function deleteWallpaperFromDB() {
  try {
    const db = await openWallpaperDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(WP_STORE, "readwrite");
      tx.objectStore(WP_STORE).delete(WP_KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { debug(e); }
}

// Сжатие через canvas: ресайз до maxDim, JPEG q=0.82.
function compressImage(file, maxDim = 1920, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const ratio = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function loadWallpaper() {
  // Миграция: если старые обои лежат в localStorage, переносим в IndexedDB.
  const legacy = safeGetLS(STORAGE_KEYS.WALLPAPER);
  if (legacy) {
    await saveWallpaperToDB(legacy);
    try { localStorage.removeItem(STORAGE_KEYS.WALLPAPER); } catch (e) { debug(e); }
  }
  const src = await readWallpaperFromDB();
  if (src) applyWallpaperSrc(src);
  else clearWallpaperUI();
}

function applyWallpaperSrc(src) {
  const safe = src.replace(/"/g, '\\"');
  document.documentElement.style.setProperty("--wallpaper", `url("${safe}")`);
  document.body.classList.add("has-wallpaper");
  const prev = document.getElementById("wallpaperPreview");
  if (prev) prev.style.backgroundImage = `url("${safe}")`;
}

async function clearWallpaper() {
  document.documentElement.style.removeProperty("--wallpaper");
  document.body.classList.remove("has-wallpaper");
  await deleteWallpaperFromDB();
  try { localStorage.removeItem(STORAGE_KEYS.WALLPAPER); } catch (e) { debug(e); }
  clearWallpaperUI();
}

function clearWallpaperUI() {
  const prev = document.getElementById("wallpaperPreview");
  if (prev) prev.style.backgroundImage = "";
  const file = document.getElementById("wallpaperFile");
  if (file) file.value = "";
}

async function onWallpaperFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  // Лимит до сжатия — 20 МБ. После compress'а будет в разы меньше.
  if (f.size > 20 * 1024 * 1024) {
    alert("Файл слишком большой (максимум 20 МБ).");
    e.target.value = "";
    return;
  }
  try {
    const dataUrl = await compressImage(f);
    applyWallpaperSrc(dataUrl);
    const ok = await saveWallpaperToDB(dataUrl);
    if (!ok) alert("Не удалось сохранить обои — обои применены только до перезагрузки.");
  } catch (err) {
    debug(err);
    alert("Не удалось прочитать изображение.");
  }
}

// ============ СИЛА СТЕКЛА ============
function getGlassStrength() {
  const v = parseInt(localStorage.getItem(STORAGE_KEYS.GLASS_STRENGTH), 10);
  return Number.isFinite(v) ? v : 22;
}

function loadGlassStrength() {
  const v = getGlassStrength();
  const s = document.getElementById("glassStrength");
  if (s) s.value = v;
  const l = document.getElementById("glassStrengthLabel");
  if (l) l.textContent = v + "px";
  applyGlassStrength(v);
}

function applyGlassStrength(v) {
  const theme = document.body.dataset.theme || "light";
  // Инлайн-стиль на body, т.к. [data-theme="..."] селектор тоже на body
  // и перебивал бы значение, заданное на <html>.
  if (!GLASS_THEMES.includes(theme)) {
    document.body.style.removeProperty("--card-blur");
    document.body.style.removeProperty("--card-saturate");
    return;
  }
  const sat = 100 + Math.round(v * 3.6);
  document.body.style.setProperty("--card-blur", v + "px");
  document.body.style.setProperty("--card-saturate", sat + "%");
}

function onGlassStrengthInput(v) {
  const val = parseInt(v, 10);
  const l = document.getElementById("glassStrengthLabel");
  if (l) l.textContent = val + "px";
  localStorage.setItem(STORAGE_KEYS.GLASS_STRENGTH, String(val));
  applyGlassStrength(val);
}

function updateGlassSettingState() {
  const el = document.getElementById("glassSetting");
  if (!el) return;
  const theme = document.body.dataset.theme || "light";
  el.classList.toggle("disabled", !GLASS_THEMES.includes(theme));
}

// Кнопка справа сверху переключает только светлую и тёмную.
// Остальные темы выбираются в Настройках.
function toggleTheme() {
  const current = document.body.dataset.theme || "light";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
}

function toggleThemeCollapsible() {
  const el = document.getElementById("themeCollapsible");
  if (!el) return;
  const isOpen = el.classList.toggle("open");
  const header = el.querySelector(".collapsible-header");
  if (header) header.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function renderThemePicker() {
  const host = document.getElementById("themePicker");
  if (!host) return;
  const current = document.body.dataset.theme || "light";
  host.innerHTML = THEMES.map(t => {
    const p = t.preview;
    return `
      <div class="theme-option ${t.id === current ? "selected" : ""}"
           role="radio" tabindex="0"
           aria-checked="${t.id === current ? "true" : "false"}"
           data-action="setTheme" data-theme-id="${escapeHtml(t.id)}">
        <div class="theme-preview" style="background:${p.body}; color:${p.fg};">
          <div class="theme-preview-side" style="background:${p.side}; border-right:1px solid ${p.border};"></div>
          <div class="theme-preview-body">
            <div class="theme-preview-pill" style="background:${p.muted}; opacity:0.6;"></div>
            <div class="theme-preview-pill short" style="background:${p.muted}; opacity:0.35;"></div>
            <div class="theme-preview-btn" style="background:linear-gradient(135deg, ${p.accent}, ${p.accent2});"></div>
          </div>
        </div>
        <div class="theme-meta">
          <div>
            <div class="theme-name">${t.name}</div>
            <div class="theme-desc">${t.desc}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ============ НАВИГАЦИЯ ============
function enterAsStudent() {
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("appContainer").style.display = "flex";
  
  const sdi = document.getElementById("scheduleDateInput");
  if (sdi && !sdi.value) sdi.value = state.schedule.viewDate;

  if (!state.student.class) {
    showScreen("settings");
  } else {
    showScreen("schedule");
    renderTimetable();
  }
}

function showScreen(screenName) {
  if (screenName === "admin" && !state.admin.authenticated) {
    return;
  }

  // Скрыть все экраны
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(n => n.classList.remove("active"));
  
  // Показать нужный
  document.getElementById(screenName + "Screen").classList.add("active");
  document.querySelectorAll(`[data-nav="${screenName}"]`).forEach(n => n.classList.add("active"));
  
  state.ui.currentScreen = screenName;
  
  if (screenName === "schedule") {
    const sdi = document.getElementById("scheduleDateInput");
    if (sdi && !sdi.value) sdi.value = state.schedule.viewDate;
    renderTimetable();
  } else if (screenName === "admin") {
    initAdminPanel();
  }
}

// ============ ГЕНЕРАЦИЯ КЛАССОВ ============
function generateClassOptions() {
  const classes = [];
  for (let grade = 5; grade <= 11; grade++) {
    if (grade === 9) {
      classes.push("9А", "9Б", "9В");
    } else {
      classes.push(grade + "А", grade + "Б");
    }
  }
  
  const settingsSelect = document.getElementById("settingsClass");
  const adminSelect = document.getElementById("adminClassSelect");
  
  classes.forEach(c => {
    const e = escapeHtml(c);
    settingsSelect.innerHTML += `<option value="${e}">${e}</option>`;
    adminSelect.innerHTML += `<option value="${e}">${e}</option>`;
  });
  
  // Восстановить сохранённые настройки
  if (state.student.class) {
    settingsSelect.value = state.student.class;
    onClassChange();
    setTimeout(() => {
      document.getElementById("settingsMathGroup").value = state.student.group;
      document.getElementById("settingsProfile").value = state.student.profile;
      document.getElementById("settingsDayView").value = state.student.dayView;
    }, 0);
  }
}

function getGradeFromClass(className) {
  return parseInt(className.match(/\d+/)[0]);
}

function getMathGroupCountForClass(className) {
  if (!className) return 0;
  const grade = getGradeFromClass(className);
  if (grade < 7 || grade > 11) return 0;
  return grade === 9 ? 3 : 2;
}

function onClassChange() {
  const className = document.getElementById("settingsClass").value;
  const grade = getGradeFromClass(className);
  const mathGroupSelect = document.getElementById("settingsMathGroup");
  const profileSelect = document.getElementById("settingsProfile");
  
  // Группы математики
  mathGroupSelect.innerHTML = '<option value="">Без группы</option>';
  if (grade >= 7 && grade <= 11) {
    mathGroupSelect.disabled = false;
    const groups = grade === 9 ? 3 : 2;
    for (let i = 1; i <= groups; i++) {
      mathGroupSelect.innerHTML += `<option value="${i}">Группа ${i}</option>`;
    }
  } else {
    mathGroupSelect.disabled = true;
  }
  
  // Профили
  profileSelect.innerHTML = '<option value="">Без профиля</option>';
  if (grade >= 9 && grade <= 11) {
    profileSelect.disabled = false;
    state.data.profiles.forEach(p => {
      profileSelect.innerHTML += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
    });
  } else {
    profileSelect.disabled = true;
  }
}

function saveStudentSettings() {
  const className = document.getElementById("settingsClass").value;
  if (!className) {
    alert("Пожалуйста, выберите класс");
    return;
  }
  
  state.student.class = className;
  state.student.group = document.getElementById("settingsMathGroup").value;
  state.student.profile = document.getElementById("settingsProfile").value;
  state.student.dayView = document.getElementById("settingsDayView").value;
  
  let base = new Date();
  if (state.student.dayView === "tomorrow") base.setDate(base.getDate() + 1);
  if (base.getDay() === 0) base.setDate(base.getDate() + 1);
  state.schedule.viewDate = formatDateForInput(base);
  const sdi = document.getElementById("scheduleDateInput");
  if (sdi) sdi.value = state.schedule.viewDate;
  syncScheduleDayButtons();

  localStorage.setItem(STORAGE_KEYS.STUDENT, JSON.stringify({
    class: state.student.class,
    group: state.student.group,
    profile: state.student.profile,
    dayView: state.student.dayView
  }));
  
  // Показать скрытые пункты меню
  document.getElementById("calcNavItem").style.display = "flex";
  document.getElementById("settingsNavItem").style.display = "flex";
  document.getElementById("calcBottomItem").style.display = "flex";
  document.getElementById("settingsBottomItem").style.display = "flex";
  
  showScreen("schedule");
  renderTimetable();
}

// ============ РАСПИСАНИЕ ============
function syncScheduleDayButtons() {
  const d = parseISODate(state.schedule.viewDate);
  const dow = d.getDay();
  const day = dow === 0 ? 1 : dow;
  document.querySelectorAll("#daySelector .day-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i + 1 === day);
  });
}

function onScheduleDateChange(e) {
  let v = e.target.value;
  if (!v) return;
  let d = parseISODate(v);
  if (d.getDay() === 0) {
    alert("Воскресенье — выходной. Показываю понедельник.");
    d.setDate(d.getDate() + 1);
    v = formatDateForInput(d);
    e.target.value = v;
  }
  state.schedule.viewDate = v;
  const dow = parseISODate(v).getDay();
  state.schedule.selectedDay = dow === 0 ? 1 : dow;
  syncScheduleDayButtons();
  renderTimetable();
}

function selectDay(day) {
  if (day === 0) return;
  state.schedule.viewDate = formatDateForInput(alignToWeekdayInSameWeek(parseISODate(state.schedule.viewDate), day));
  state.schedule.selectedDay = day;
  const inp = document.getElementById("scheduleDateInput");
  if (inp) inp.value = state.schedule.viewDate;
  syncScheduleDayButtons();
  renderTimetable();
}

function getTargetDate() {
  const now = new Date();
  if (state.student.dayView === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  return now;
}

function renderTimetable() {
  if (!state.student.class) {
    document.getElementById("timetableGrid").innerHTML = `
      <div style="padding: 80px; text-align: center; color: var(--muted); font-size: 16px;">
        <span class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="9" x2="8" y2="9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        Выберите класс в настройках, чтобы увидеть расписание
      </div>
    `;
    return;
  }
  
  // Проверка домашнего обучения
  const isRemote = state.data.remoteClasses[state.student.class];
  const banner = document.getElementById("remoteLearningBanner");
  if (isRemote) {
    banner.classList.remove("hidden");
    document.getElementById("timetableGrid").innerHTML = "";
    return;
  } else {
    banner.classList.add("hidden");
  }
  
  const viewDate = parseISODate(state.schedule.viewDate);
  const dayOfWeek = viewDate.getDay();
  if (dayOfWeek === 0) {
    document.getElementById("scheduleTitle").textContent = "Воскресенье — выходной";
    document.getElementById("scheduleSubtitle").textContent = formatLongRussianDate(viewDate);
    document.getElementById("timetableGrid").innerHTML = `
      <div style="padding: 80px; text-align: center; color: var(--muted); font-size: 16px;">
        <span class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.7 4.7l2 2M17.3 17.3l2 2M4.7 19.3l2-2M17.3 6.7l2-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </span>
        В этот день занятий нет
      </div>
    `;
    return;
  }

  const isSaturday = dayOfWeek === 6;
  
  // Заголовок
  let title = state.student.class;
  if (state.student.group) title += ` • Матем. группа ${state.student.group}`;
  if (state.student.profile) title += ` • ${state.student.profile}`;
  
  document.getElementById("scheduleTitle").textContent = `Расписание — ${formatLongRussianDate(viewDate)}`;
  document.getElementById("scheduleSubtitle").textContent = `${WEEKDAYS[dayOfWeek]} • ${title}`;
  
  // Получить расписание
  const key = `${state.student.class}|${state.student.group}|${state.student.profile}|${dayOfWeek}`;
  const timetable = state.data.timetables[key] || { lessons: [] };
  
  // Генерация сетки
  let html = `
    <div class="lesson-row header">
      <div class="lesson-cell lesson-index">№</div>
      <div class="lesson-cell">Предмет</div>
      <div class="lesson-cell">Время</div>
      <div class="lesson-cell">Каб.</div>
      <div class="lesson-cell">Статус</div>
    </div>
  `;
  
  if (timetable.lessons.length === 0) {
    html += `
      <div class="lesson-row">
        <div class="lesson-cell" style="grid-column: 1/-1; justify-content: center; color: var(--muted); padding: 60px; font-size: 16px;">
          📭 Расписание для этого дня не заполнено администратором
        </div>
      </div>
    `;
  } else {
    const timeConfig = isSaturday ? DEFAULT_TIMES.saturday : DEFAULT_TIMES.weekday;
    
    timetable.lessons.forEach((lesson, idx) => {
      const time = lesson.time || timeConfig[lesson.number] || { start: "--:--", end: "--:--" };
      const isCurrent = isCurrentLesson(time, dayOfWeek);
      
      html += `
        <div class="lesson-row ${isCurrent ? 'active' : ''}" data-lesson="${idx}" style="${isCurrent ? 'background: var(--accent-soft);' : ''}">
          <div class="lesson-cell lesson-index">${lesson.number}</div>
          <div class="lesson-cell lesson-subject">${escapeHtml(lesson.subject)}</div>
          <div class="lesson-cell lesson-time">${escapeHtml(time.start)}–${escapeHtml(time.end)}</div>
          <div class="lesson-cell">
            <span class="lesson-cabinet">${escapeHtml(lessonCabinetForStudent(lesson))}</span>
          </div>
          <div class="lesson-cell lesson-cell--status">
            <div class="lesson-status lesson-status-card">
              <div class="status-text status--idle" id="status-${idx}">Загрузка...</div>
              <div class="progress-bar">
                <div class="progress-inner" id="progress-${idx}"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    });
  }
  
  document.getElementById("timetableGrid").innerHTML = html;
  updateLessonProgress();
}

function isCurrentLesson(time, dayOfWeek) {
  const now = new Date();
  if (!isSameCalendarDay(now, parseISODate(state.schedule.viewDate))) return false;
  if (now.getDay() !== dayOfWeek) return false;
  
  const [startH, startM] = time.start.split(":").map(Number);
  const [endH, endM] = time.end.split(":").map(Number);
  const current = now.getHours() * 60 + now.getMinutes();
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  
  return current >= start && current <= end;
}

function setLessonStatus(el, text, className) {
  if (!el) return;
  el.textContent = text;
  el.className = "status-text " + className;
}

function updateLessonProgress() {
  const now = new Date();
  const viewDate = parseISODate(state.schedule.viewDate);
  const isViewingToday = isSameCalendarDay(now, viewDate);

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const viewMidnight = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());
  const isPastDay = viewMidnight < todayMidnight;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  document.querySelectorAll("[data-lesson]").forEach(row => {
    const idx = row.dataset.lesson;
    const statusEl = document.getElementById(`status-${idx}`);
    const progressEl = document.getElementById(`progress-${idx}`);
    if (!statusEl || !progressEl) return;

    const timeText = row.querySelector(".lesson-time")?.textContent || "";
    const parts = timeText.split("–");
    const start = parts[0]?.trim();
    const end = parts[1]?.trim();
    if (!start || !end || start.includes("-") || end.includes("-")) {
      setLessonStatus(statusEl, "—", "status--idle");
      progressEl.style.width = "0%";
      return;
    }

    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    if (Number.isNaN(startH) || Number.isNaN(endH)) {
      setLessonStatus(statusEl, "—", "status--idle");
      progressEl.style.width = "0%";
      return;
    }

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const total = Math.max(1, endMinutes - startMinutes);

    if (!isViewingToday) {
      if (isPastDay) {
        setLessonStatus(statusEl, "✓ Завершён", "status--past");
        progressEl.style.width = "100%";
      } else {
        setLessonStatus(statusEl, "⏳ Урок ещё не начался", "status--future");
        progressEl.style.width = "0%";
      }
      return;
    }

    if (currentMinutes < startMinutes) {
      const minsToStart = startMinutes - currentMinutes;
      setLessonStatus(statusEl, `⏳ Начало через ${minsToStart} мин`, "status--pending");
      progressEl.style.width = "0%";
    } else if (currentMinutes > endMinutes) {
      setLessonStatus(statusEl, "✓ Завершён", "status--done");
      progressEl.style.width = "100%";
    } else {
      const passed = currentMinutes - startMinutes;
      const percent = (passed / total) * 100;
      const minsLeft = endMinutes - currentMinutes;
      setLessonStatus(statusEl, `▶ Осталось ${minsLeft} мин`, "status--live");
      progressEl.style.width = percent + "%";
    }
  });
}

function updateDateTime() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById("currentDateDisplay").textContent = now.toLocaleDateString("ru-RU", options);
  document.getElementById("currentTimeDisplay").textContent = now.toLocaleTimeString("ru-RU", {hour: '2-digit', minute:'2-digit'});
}

// ============ КАЛЬКУЛЯТОР ============
function addGrade() {
  const value = parseFloat(document.getElementById("calcGrade").value);
  const weight = parseFloat(document.getElementById("calcWeight").value);
  
  if (isNaN(value) || isNaN(weight) || value < 1 || value > 5) {
    alert("Оценка должна быть от 1 до 5");
    return;
  }
  
  state.data.grades.push({ value, weight });
  saveGrades();
  renderGrades();
}

function renderGrades() {
  const list = document.getElementById("gradesList");
  if (state.data.grades.length === 0) {
    list.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px;">Нет добавленных оценок</p>';
  } else {
    list.innerHTML = state.data.grades.map((g, i) => `
      <div class="grade-item">
        <div class="grade-info">
          <div class="grade-value">${g.value}</div>
          <div>
            <div style="font-weight: 700; font-size: 16px;">Оценка #${i + 1}</div>
            <div style="font-size: 14px; color: var(--muted);">Вес: ${g.weight}</div>
          </div>
        </div>
        <button data-action="removeGrade" data-idx="${i}" class="delete-lesson-btn">
          <span class="delete-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
        </button>
      </div>
    `).join("");
  }
  
  // Средний балл
  const totalWeight = state.data.grades.reduce((sum, g) => sum + g.weight, 0);
  const weightedSum = state.data.grades.reduce((sum, g) => sum + g.value * g.weight, 0);
  const avg = totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : "—";
  
  document.getElementById("avgGrade").textContent = avg;
  document.getElementById("gradesCount").textContent = state.data.grades.length;
}

function removeGrade(index) {
  state.data.grades.splice(index, 1);
  saveGrades();
  renderGrades();
}

function resetGrades() {
  if (confirm("Очистить все оценки?")) {
    state.data.grades = [];
    saveGrades();
    renderGrades();
  }
}

function saveGrades() {
  localStorage.setItem(STORAGE_KEYS.GRADES, JSON.stringify(state.data.grades));
}

// ============ АДМИНИСТРАТОР ============
function showAdminLogin() {
  document.getElementById("adminLoginModal").classList.add("active");
}

function closeAdminLogin() {
  document.getElementById("adminLoginModal").classList.remove("active");
  document.getElementById("adminLoginError").textContent = "";
}

async function loginAdmin() {
  const email = document.getElementById("adminLoginInput").value.trim();
  const password = document.getElementById("adminPasswordInput").value;

  if (!email || !password) {
    document.getElementById("adminLoginError").textContent = "Введите email и пароль";
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.session) {
      document.getElementById("adminLoginError").textContent = "❌ Неверный email или пароль";
      return;
    }

    state.admin.authenticated = true;
    closeAdminLogin();
    document.getElementById("startScreen").style.display = "none";
    document.getElementById("appContainer").style.display = "flex";
    showAdminNav();
    showScreen("admin");
  } catch (err) {
    document.getElementById("adminLoginError").textContent = "❌ Ошибка входа. Попробуйте позже.";
    debug("Supabase login error:", err);
  }
}

function showAdminNav() {
  document.getElementById("adminNavItem").style.display = "flex";
  document.getElementById("adminBottomItem").style.display = "flex";
}

function hideAdminNav() {
  document.getElementById("adminNavItem").style.display = "none";
  document.getElementById("adminBottomItem").style.display = "none";
}

async function logoutAdmin() {
  state.admin.authenticated = false;
  await supabase.auth.signOut();
  hideAdminNav();
  showScreen("schedule");
}

async function initAuthState() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      state.admin.authenticated = true;
      showAdminNav();
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        state.admin.authenticated = true;
        showAdminNav();
      } else {
        state.admin.authenticated = false;
        hideAdminNav();
      }
    });
  } catch (err) {
    debug("Ошибка инициализации auth-сессии:", err);
  }
}

function updateAdminEditingLabel() {
  const el = document.getElementById("adminEditingDayLabel");
  if (!el) return;
  const d = parseISODate(state.admin.scheduleDate);
  const cn = document.getElementById("adminClassSelect")?.value || "";
  const gp = document.getElementById("adminMathGroupSelect")?.value;
  const pf = document.getElementById("adminProfileSelect")?.value;
  let ctx = `Вы заполняете расписание на: <b>${WEEKDAYS[d.getDay()]}</b>, ${d.toLocaleDateString("ru-RU")}`;
  if (cn) ctx += ` • класс ${escapeAttr(cn)}`;
  if (gp) ctx += ` • матем. гр. ${escapeAttr(gp)} — кабинеты в таблице ниже для этой группы`;
  else if (getMathGroupCountForClass(cn) > 0) ctx += ` • матем.: выберите группу выше, чтобы задать кабинеты для неё`;
  if (pf) ctx += ` • профиль ${escapeAttr(pf)}`;
  el.innerHTML = ctx;
}

function onAdminScheduleDateChange(e) {
  let v = e.target.value;
  if (!v) return;
  let d = parseISODate(v);
  if (d.getDay() === 0) {
    alert("Воскресенье — выходной. Даты перенесена на понедельник.");
    d.setDate(d.getDate() + 1);
    v = formatDateForInput(d);
    e.target.value = v;
  }
  state.admin.scheduleDate = v;
  const dow = parseISODate(v).getDay();
  state.admin.selectedDay = dow === 0 ? 1 : dow;
  document.querySelectorAll("#adminScreen .day-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i + 1 === state.admin.selectedDay);
  });
  renderAdminLessons();
}

function onAdminGroupOrProfileChange() {
  renderAdminLessons();
}

function initAdminPanel() {
  renderProfilesList();
  const ad = document.getElementById("adminScheduleDateInput");
  if (ad) {
    if (!ad.value) ad.value = state.admin.scheduleDate;
    state.admin.scheduleDate = ad.value;
  }
  const adDate = parseISODate(state.admin.scheduleDate);
  state.admin.selectedDay = adDate.getDay() === 0 ? 1 : adDate.getDay();
  document.querySelectorAll("#adminScreen .day-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i + 1 === state.admin.selectedDay);
  });
  onAdminClassChange();
}

function onAdminClassChange() {
  const className = document.getElementById("adminClassSelect").value;
  const grade = className ? getGradeFromClass(className) : 0;
  
  // Группы математики
  const mathSelect = document.getElementById("adminMathGroupSelect");
  mathSelect.innerHTML = '<option value="">Без группы</option>';
  if (grade >= 7 && grade <= 11) {
    const groups = grade === 9 ? 3 : 2;
    for (let i = 1; i <= groups; i++) {
      mathSelect.innerHTML += `<option value="${i}">Группа ${i}</option>`;
    }
  }
  
  // Профили
  const profileSelect = document.getElementById("adminProfileSelect");
  profileSelect.innerHTML = '<option value="">Без профиля</option>';
  if (grade >= 9 && grade <= 11) {
    state.data.profiles.forEach(p => {
      profileSelect.innerHTML += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
    });
  }
  
  // Проверка домашнего обучения
  document.getElementById("remoteLearningCheck").checked = !!state.data.remoteClasses[className];
  
  renderAdminLessons();
}

function selectAdminDay(day) {
  if (day === 0) return;
  state.admin.selectedDay = day;
  state.admin.scheduleDate = formatDateForInput(
    alignToWeekdayInSameWeek(parseISODate(state.admin.scheduleDate), day)
  );
  const inp = document.getElementById("adminScheduleDateInput");
  if (inp) inp.value = state.admin.scheduleDate;
  document.querySelectorAll("#adminScreen .day-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i + 1 === day);
  });
  renderAdminLessons();
}

function renderAdminLessons() {
  const className = document.getElementById("adminClassSelect").value;
  const container = document.getElementById("adminLessonsEditor");
  
  if (!className) {
    container.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 60px; font-size: 16px;">Выберите класс</p>';
    return;
  }
  
  const group = document.getElementById("adminMathGroupSelect").value;
  const profile = document.getElementById("adminProfileSelect").value;
  const dView = parseISODate(state.admin.scheduleDate);
  let day = dView.getDay();
  if (day === 0) day = 1;
  state.admin.selectedDay = day;
  
  const isSaturday = day === 6;
  
  const key = `${className}|${group}|${profile}|${day}`;
  let timetable = state.data.timetables[key] || { lessons: [] };
  
  document.getElementById("bigBreakLessonCheck").checked = timetable.hasBigBreakLesson || false;
  document.getElementById("ninthLessonCheck").checked = timetable.hasNinthLesson || false;
  document.getElementById("ninthLessonTimeSettings").classList.toggle("hidden", !timetable.hasNinthLesson);
  
  if (timetable.ninthTime) {
    const [startH, startM] = timetable.ninthTime.start.split(":");
    const [endH, endM] = timetable.ninthTime.end.split(":");
    document.getElementById("ninthStartH").value = startH;
    document.getElementById("ninthStartM").value = startM;
    document.getElementById("ninthEndH").value = endH;
    document.getElementById("ninthEndM").value = endM;
  }
  
  if (timetable.lessons.length === 0) {
    const timeConfig = isSaturday ? DEFAULT_TIMES.saturday : DEFAULT_TIMES.weekday;
    for (let i = 1; i <= 8; i++) {
      timetable.lessons.push({
        number: i,
        subject: "",
        cabinet: "",
        time: timeConfig[i]
      });
    }
    state.data.timetables[key] = timetable;
  }
  
  container.innerHTML = timetable.lessons.map((lesson, idx) => `
    <div class="lesson-editor-row">
      <div style="font-weight: 800; color: var(--accent); font-size: 18px;">${lesson.number}</div>
      <input type="text" class="lesson-subj-input" placeholder="Название предмета" value="${escapeAttr(lesson.subject)}" />
      <select class="lesson-cab-single" id="lesson-cab-${idx}">
        <option value="">Каб.</option>
        ${generateCabinetOptions(lesson.cabinet)}
      </select>
      <input type="text" class="lesson-start-input" placeholder="08:00" value="${escapeAttr(lesson.time?.start || "")}" />
      <input type="text" class="lesson-end-input" placeholder="08:45" value="${escapeAttr(lesson.time?.end || "")}" />
      <button type="button" class="delete-lesson-btn" data-action="removeAdminLesson">
        <span class="delete-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
      </button>
    </div>
  `).join("");
  
  updateAdminEditingLabel();
}

function generateCabinetOptions(selected) {
  let html = "";
  for (let i = 1; i <= 23; i++) {
    html += `<option value="${i}" ${String(selected) === String(i) ? "selected" : ""}>${i}</option>`;
  }
  return html;
}

function addNewLesson() {
  const container = document.getElementById("adminLessonsEditor");
  const rows = container.querySelectorAll(".lesson-editor-row");
  const nextNum = rows.length + 1;
  
  const newRow = document.createElement("div");
  newRow.className = "lesson-editor-row";
  newRow.innerHTML = `
    <div style="font-weight: 800; color: var(--accent); font-size: 18px;">${nextNum}</div>
    <input type="text" class="lesson-subj-input" placeholder="Название предмета" />
    <select class="lesson-cab-single" id="lesson-cab-${rows.length}">
      <option value="">Каб.</option>
      ${generateCabinetOptions("")}
    </select>
    <input type="text" class="lesson-start-input" placeholder="15:30" value="15:30" />
    <input type="text" class="lesson-end-input" placeholder="16:10" value="16:10" />
    <button type="button" class="delete-lesson-btn" data-action="removeAdminLesson">
      <span class="delete-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 7h12M9 7V5h6v2M8 7v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg></span>
    </button>
  `;
  container.appendChild(newRow);
}

function removeAdminLesson(btn) {
  const row = btn.closest(".lesson-editor-row");
  if (!row) return;
  row.remove();
  document.querySelectorAll("#adminLessonsEditor .lesson-editor-row").forEach((r, i) => {
    const num = r.querySelector("div");
    if (num) num.textContent = i + 1;
  });
}

function clearAllLessons() {
  if (confirm("Удалить все уроки для этого дня?")) {
    document.getElementById("adminLessonsEditor").innerHTML = "";
  }
}

function toggleNinthLesson() {
  const checked = document.getElementById("ninthLessonCheck").checked;
  document.getElementById("ninthLessonTimeSettings").classList.toggle("hidden", !checked);
}

function toggleRemoteLearning() {
  const className = document.getElementById("adminClassSelect").value;
  if (document.getElementById("remoteLearningCheck").checked) {
    state.data.remoteClasses[className] = true;
    localStorage.setItem(STORAGE_KEYS.REMOTE, JSON.stringify(state.data.remoteClasses));
    saveRemoteClassToSupabase(className);
  } else {
    delete state.data.remoteClasses[className];
    localStorage.setItem(STORAGE_KEYS.REMOTE, JSON.stringify(state.data.remoteClasses));
    removeRemoteClassFromSupabase(className);
  }
}

function renderProfilesList() {
  const container = document.getElementById("profilesList");
  container.innerHTML = state.data.profiles.map((p, i) => `
    <span style="background: var(--accent-soft); color: var(--accent); padding: 10px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px; border: 1px solid var(--border);">
      ${escapeHtml(p)}
      <button data-action="removeProfile" data-idx="${i}" style="background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; opacity: 0.6;">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </span>
  `).join("");
}

async function addProfile() {
  const input = document.getElementById("newProfileName");
  const name = input.value.trim();
  if (!name) return;
  if (state.data.profiles.includes(name)) {
    alert("Такой профиль уже существует");
    return;
  }
  // Ждём подтверждение от Supabase, потом меняем локальное состояние и UI.
  const ok = await saveProfileToSupabase(name);
  if (!ok) {
    alert("Не удалось сохранить профиль в облаке. Попробуйте позже.");
    return;
  }
  state.data.profiles.push(name);
  safeSetLS(STORAGE_KEYS.PROFILES, JSON.stringify(state.data.profiles));
  input.value = "";
  renderProfilesList();
  onAdminClassChange();
}

async function removeProfile(idx) {
  const profileName = state.data.profiles[idx];
  if (!confirm(`Удалить профиль "${profileName}"?`)) return;
  const ok = await deleteProfileFromSupabase(profileName);
  if (!ok) {
    alert("Не удалось удалить профиль в облаке. Попробуйте позже.");
    return;
  }
  state.data.profiles.splice(idx, 1);
  safeSetLS(STORAGE_KEYS.PROFILES, JSON.stringify(state.data.profiles));
  renderProfilesList();
  onAdminClassChange();
}

async function saveAdminTimetable() {
  const className = document.getElementById("adminClassSelect").value;
  if (!className) {
    alert("Выберите класс");
    return;
  }
  
  const group = document.getElementById("adminMathGroupSelect").value;
  const profile = document.getElementById("adminProfileSelect").value;
  const dView = parseISODate(state.admin.scheduleDate);
  let day = dView.getDay();
  if (day === 0) day = 1;
  state.admin.selectedDay = day;
  
  const lessons = [];
  const rows = document.querySelectorAll("#adminLessonsEditor .lesson-editor-row");
  
  rows.forEach((row, idx) => {
    const subject = row.querySelector(".lesson-subj-input")?.value?.trim() || "";
    if (!subject) return;
    
    const cabinet = row.querySelector(".lesson-cab-single")?.value || "";
    const start = row.querySelector(".lesson-start-input")?.value?.trim() || "";
    const end = row.querySelector(".lesson-end-input")?.value?.trim() || "";
    
    lessons.push({
      number: idx + 1,
      subject,
      cabinet,
      time: { start, end }
    });
  });
  
  const key = `${className}|${group}|${profile}|${day}`;
  state.data.timetables[key] = {
    lessons,
    hasBigBreakLesson: document.getElementById("bigBreakLessonCheck").checked,
    hasNinthLesson: document.getElementById("ninthLessonCheck").checked,
    ninthTime: document.getElementById("ninthLessonCheck").checked ? {
      start: `${document.getElementById("ninthStartH").value}:${String(document.getElementById("ninthStartM").value).padStart(2, "0")}`,
      end: `${document.getElementById("ninthEndH").value}:${String(document.getElementById("ninthEndM").value).padStart(2, "0")}`
    } : null
  };
  
  localStorage.setItem(STORAGE_KEYS.TIMETABLES, JSON.stringify(state.data.timetables));
  
  await syncCurrentProfileWeekToSupabase(className, group, profile);
  
  const status = document.getElementById("adminSaveStatus");
  status.innerHTML = "✅ <b>Сохранено: этот день и вся неделя этого класса/профиля в облаке</b>";
  status.style.color = "var(--success)";
  setTimeout(() => status.innerHTML = "", 5000);
}

// ============ ЗАГРУЗКА/СОХРАНЕНИЕ ============
async function loadDataFromSupabase() {
  if (!supabase) {
    debug("Supabase не инициализирован");
    loadDataFromLocalStorage();
    return;
  }

  // Грузим все три раздела параллельно и независимо.
  // Если один упал — подтягиваем его из localStorage, остальные продолжают работать.
  const results = await Promise.allSettled([
    supabase.from('timetables').select('*'),
    supabase.from('profiles').select('*'),
    supabase.from('remote_classes').select('class_name')
  ]);

  // Расписание
  const tt = results[0];
  if (tt.status === "fulfilled" && !tt.value.error && tt.value.data) {
    tt.value.data.forEach(item => { state.data.timetables[item.key] = item.data; });
    safeSetLS(STORAGE_KEYS.TIMETABLES, JSON.stringify(state.data.timetables));
    debug("✅ Расписание загружено из Supabase");
  } else {
    debug("Ошибка загрузки расписания:", tt.reason || tt.value?.error);
    const cached = safeGetLS(STORAGE_KEYS.TIMETABLES);
    if (cached) state.data.timetables = safeJSONParse(cached, {});
  }

  // Профили
  const pr = results[1];
  if (pr.status === "fulfilled" && !pr.value.error && pr.value.data) {
    state.data.profiles = pr.value.data.map(p => p.name);
    PROFILES = state.data.profiles;
    safeSetLS(STORAGE_KEYS.PROFILES, JSON.stringify(state.data.profiles));
    debug("✅ Профили загружены из Supabase");
  } else {
    debug("Ошибка загрузки профилей:", pr.reason || pr.value?.error);
    const cached = safeGetLS(STORAGE_KEYS.PROFILES);
    if (cached) {
      state.data.profiles = safeJSONParse(cached, []);
      PROFILES = state.data.profiles;
    }
  }

  // Домашнее обучение
  const rc = results[2];
  if (rc.status === "fulfilled" && !rc.value.error && rc.value.data) {
    const remoteData = {};
    rc.value.data.forEach(item => { remoteData[item.class_name] = true; });
    state.data.remoteClasses = remoteData;
    safeSetLS(STORAGE_KEYS.REMOTE, JSON.stringify(state.data.remoteClasses));
    debug("✅ Данные домашнего обучения загружены из Supabase");
  } else {
    debug("Ошибка загрузки remote_classes:", rc.reason || rc.value?.error);
    const cached = safeGetLS(STORAGE_KEYS.REMOTE);
    if (cached) state.data.remoteClasses = safeJSONParse(cached, {});
  }

  subscribeToSupabaseChanges();
  
  // Студенческие данные из локального хранилища (они не хранятся в облаке)
  const s = safeJSONParse(safeGetLS(STORAGE_KEYS.STUDENT), null);
  if (s) {
    state.student.class = s.class;
    state.student.group = s.group;
    state.student.profile = s.profile;
    state.student.dayView = s.dayView || "today";
    document.getElementById("calcNavItem").style.display = "flex";
    document.getElementById("settingsNavItem").style.display = "flex";
    document.getElementById("calcBottomItem").style.display = "flex";
    document.getElementById("settingsBottomItem").style.display = "flex";
  }
  state.data.grades = safeJSONParse(safeGetLS(STORAGE_KEYS.GRADES), []) || [];
}

function loadDataFromLocalStorage() {
  const s = safeJSONParse(safeGetLS(STORAGE_KEYS.STUDENT), null);
  if (s) {
    state.student.class = s.class;
    state.student.group = s.group;
    state.student.profile = s.profile;
    state.student.dayView = s.dayView || "today";
    document.getElementById("calcNavItem").style.display = "flex";
    document.getElementById("settingsNavItem").style.display = "flex";
    document.getElementById("calcBottomItem").style.display = "flex";
    document.getElementById("settingsBottomItem").style.display = "flex";
  }
  state.data.grades = safeJSONParse(safeGetLS(STORAGE_KEYS.GRADES), []) || [];
  state.data.timetables = safeJSONParse(safeGetLS(STORAGE_KEYS.TIMETABLES), {}) || {};
  const profiles = safeJSONParse(safeGetLS(STORAGE_KEYS.PROFILES), null);
  if (Array.isArray(profiles)) {
    state.data.profiles = profiles;
    PROFILES = state.data.profiles;
  }
  state.data.remoteClasses = safeJSONParse(safeGetLS(STORAGE_KEYS.REMOTE), {}) || {};
}

async function saveToSupabase(key, data) {
  if (!supabase) { debug("Supabase не инициализирован"); return false; }
  
  try {
    // Проверить, существует ли уже эта запись
    const { data: existing, error: checkError } = await supabase
      .from('timetables')
      .select('id')
      .eq('key', key)
      .maybeSingle();
    
    if (existing) {
      // Обновить существующую запись
      const { error: updateError } = await supabase
        .from('timetables')
        .update({ data })
        .eq('key', key);
      
      if (updateError) throw updateError;
    } else {
      // Вставить новую запись
      const { error: insertError } = await supabase
        .from('timetables')
        .insert([{ key, data }]);
      
      if (insertError) throw insertError;
    }
    
    debug("✅ Расписание сохранено в Supabase");
    return true;
  } catch (err) {
    debug("❌ Ошибка при сохранении в Supabase:", err);
    return false;
  }
}

async function syncCurrentProfileWeekToSupabase(className, group, profile) {
  if (!supabase) return;
  for (let d = 1; d <= 6; d++) {
    const key = `${className}|${group}|${profile}|${d}`;
    if (state.data.timetables[key]) {
      await saveToSupabase(key, state.data.timetables[key]);
    }
  }
}

async function saveProfileToSupabase(name) {
  if (!supabase) { debug("Supabase не инициализирован"); return false; }
  try {
    const { error } = await supabase
      .from('profiles')
      .insert([{ name }]);
    if (error && error.code !== "23505") throw error; // 23505 = UNIQUE violation
    debug("✅ Профиль сохранён в Supabase");
    return true;
  } catch (err) {
    debug("⚠️ Ошибка сохранения профиля:", err);
    return false;
  }
}

async function deleteProfileFromSupabase(name) {
  if (!supabase) { debug("Supabase не инициализирован"); return false; }
  try {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('name', name);
    if (error) throw error;
    debug("✅ Профиль удалён из Supabase");
    return true;
  } catch (err) {
    debug("❌ Ошибка при удалении профиля:", err);
    return false;
  }
}

async function saveRemoteClassToSupabase(className) {
  if (!supabase) { debug("Supabase не инициализирован"); return false; }
  try {
    const { error } = await supabase
      .from('remote_classes')
      .insert([{ class_name: className }]);
    if (error && error.code !== "23505") throw error;
    debug("✅ Класс добавлен в список домашнего обучения");
    return true;
  } catch (err) {
    debug("⚠️ Ошибка добавления в remote_classes:", err);
    return false;
  }
}

async function removeRemoteClassFromSupabase(className) {
  if (!supabase) { debug("Supabase не инициализирован"); return false; }
  try {
    const { error } = await supabase
      .from('remote_classes')
      .delete()
      .eq('class_name', className);
    if (error) throw error;
    debug("✅ Класс удалён из списка домашнего обучения");
    return true;
  } catch (err) {
    debug("❌ Ошибка при удалении класса:", err);
    return false;
  }
}

// ============ REALTIME ============
// Подписка на обновления таблиц — второй админ увидит изменения без перезагрузки.
let _realtimeChannel = null;
function subscribeToSupabaseChanges() {
  if (!supabase || !supabase.channel) return;
  if (_realtimeChannel) {
    try { supabase.removeChannel(_realtimeChannel); } catch (e) { debug(e); }
    _realtimeChannel = null;
  }
  _realtimeChannel = supabase
    .channel('tu-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timetables' }, (payload) => {
      debug('realtime timetables:', payload);
      if (payload.eventType === 'DELETE') {
        delete state.data.timetables[payload.old?.key];
      } else if (payload.new?.key) {
        state.data.timetables[payload.new.key] = payload.new.data;
      }
      safeSetLS(STORAGE_KEYS.TIMETABLES, JSON.stringify(state.data.timetables));
      if (document.getElementById("scheduleScreen")?.classList.contains("active")) renderTimetable();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
      debug('realtime profiles changed — reloading');
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
        state.data.profiles = data.map(p => p.name);
        PROFILES = state.data.profiles;
        safeSetLS(STORAGE_KEYS.PROFILES, JSON.stringify(state.data.profiles));
        renderProfilesList?.();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'remote_classes' }, async () => {
      const { data } = await supabase.from('remote_classes').select('class_name');
      if (data) {
        const rd = {};
        data.forEach(i => { rd[i.class_name] = true; });
        state.data.remoteClasses = rd;
        safeSetLS(STORAGE_KEYS.REMOTE, JSON.stringify(state.data.remoteClasses));
        if (document.getElementById("scheduleScreen")?.classList.contains("active")) renderTimetable();
      }
    })
    .subscribe();
}

function loadData() {
  loadDataFromLocalStorage();
}

function installBrowserProtection() {
  document.addEventListener("contextmenu", event => event.preventDefault());
  document.addEventListener("keydown", event => {
    const key = event.key.toUpperCase();
    if (
      key === "F12" ||
      (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(key)) ||
      (event.ctrlKey && key === "U") ||
      (event.ctrlKey && key === "S") ||
      (event.ctrlKey && key === "F")
    ) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  });
  document.body.addEventListener("mousedown", event => {
    if (event.button === 2) event.preventDefault();
  });
}

installBrowserProtection();
