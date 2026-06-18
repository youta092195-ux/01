const logDialog = document.querySelector("#logDialog");
const big3SetupDialog = document.querySelector("#big3SetupDialog");
const big3SetupForm = document.querySelector("#big3SetupForm");
const logForm = document.querySelector("#logForm");
const toast = document.querySelector("#toast");
const sidebar = document.querySelector(".sidebar");
const exerciseSelect = document.querySelector("#exerciseSelect");
const exerciseRecords = document.querySelector("#exerciseRecords");
const customExercise = document.querySelector("#customExercise");
const dashboardPage = document.querySelector("#dashboardPage");
const progressPage = document.querySelector("#progressPage");
const planPage = document.querySelector("#planPage");
const calendarPage = document.querySelector("#calendarPage");
const recoveryPage = document.querySelector("#recoveryPage");
const coachPage = document.querySelector("#coachPage");
const settingsPage = document.querySelector("#settingsPage");
const progressExerciseSelect = document.querySelector("#progressExerciseSelect");
const authGate = document.querySelector("#authGate");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const forgotPasswordForm = document.querySelector("#forgotPasswordForm");
const resetPasswordForm = document.querySelector("#resetPasswordForm");
const ANALYSIS_API_BASE = window.FORGE_API_BASE_URL
  || localStorage.getItem("forgeApiBaseUrl")
  || (window.location.port === "8001"
    ? `${window.location.origin}/api/v1`
    : `${window.location.protocol}//${window.location.hostname}:8001/api/v1`);
let currentUser = null;
const isCreatorPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  && window.location.hash === "#creator-preview";
let selectedBodyParts = new Set(["胸"]);
let recordSequence = 0;
let selectedPlanDay = "mon";
let selectedFrequency = 3;
let selectedSplit = "2";
let selectedDuration = 60;
let selectedPurpose = "general";
let wizardStep = 1;
let selectedVideoFolder = "bench";
let historyFormMode = null;
let activeProgressMetric = "oneRm";
let registrationStep = 1;

const videoLibrary = {
  bench: [],
  squat: [],
  deadlift: []
};

const analysisSettings = {
  profile: "general",
  applyMode: "manual",
  manualEnabled: true,
  askEveryTime: true
};

const userSettings = {
  username: "User",
  birthday: "1995-01-01",
  notifications: true,
  notifyAnalysis: true,
  notifyMenu: true,
  notifyForm: true
};

const analysisProfiles = {
  general: {
    name: "一般トレーニー",
    description: "安全で再現性の高いフォーム、適切な可動域、継続できるボリュームを重視します。",
    focus: ["フォームの安定性", "可動域と関節負担", "週間ボリュームの向上"]
  },
  bodybuilding: {
    name: "ボディビルダー・フィジーカー",
    description: "対象筋への刺激、エキセントリック局面、可動域、ボリューム蓄積を重視します。",
    focus: ["対象筋への負荷", "テンポと可動域", "筋肥大ボリューム"]
  },
  powerlifting: {
    name: "パワーリフター",
    description: "重量コントロール、SBDの効率、一般的な競技規則を想定した試技成立要件を重視します。",
    focus: ["重量コントロール", "競技動作の成立", "最大筋力の発揮"]
  },
  athlete: {
    name: "アスリート",
    description: "力の立ち上がり、神経系への刺激、最大筋力と競技動作への転移を重視します。",
    focus: ["力発揮速度", "神経系・最大筋力", "競技能力への転移"]
  }
};

const liftNames = {
  bench: "ベンチプレス",
  squat: "スクワット",
  deadlift: "デッドリフト"
};

const planDays = {
  mon: { short: "月", english: "MONDAY", time: 0, exercises: [] },
  tue: { short: "火", english: "TUESDAY", time: 0, exercises: [] },
  wed: { short: "水", english: "WEDNESDAY", time: 0, exercises: [] },
  thu: { short: "木", english: "THURSDAY", time: 0, exercises: [] },
  fri: { short: "金", english: "FRIDAY", time: 0, exercises: [] },
  sat: { short: "土", english: "SATURDAY", time: 0, exercises: [] },
  sun: { short: "日", english: "SUNDAY", time: 0, exercises: [] }
};

const progressData = {
  bench: { name: "ベンチプレス", part: "胸", max: 90, oneRm: 96.8, volume: 24680, change: "+7.6%", maxChange: "+5.0kg / 3ヶ月", goal: 100 },
  squat: { name: "スクワット", part: "脚", max: 125, oneRm: 136.5, volume: 38240, change: "+5.2%", maxChange: "+7.5kg / 3ヶ月", goal: 140 },
  deadlift: { name: "デッドリフト", part: "背中・脚", max: 155, oneRm: 169.2, volume: 28150, change: "+4.8%", maxChange: "+10.0kg / 3ヶ月", goal: 180 },
  shoulder: { name: "ショルダープレス", part: "肩", max: 47.5, oneRm: 52.1, volume: 12860, change: "+6.1%", maxChange: "+2.5kg / 3ヶ月", goal: 55 }
};

const coreExerciseKeys = {
  "ベンチプレス": "bench",
  "スクワット": "squat",
  "デッドリフト": "deadlift",
  "ショルダープレス": "shoulder"
};

function setAuthMode(mode) {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  loginForm.classList.toggle("active", mode === "login");
  registerForm.classList.toggle("active", mode === "register");
  forgotPasswordForm.classList.toggle("active", mode === "forgot");
  resetPasswordForm.classList.toggle("active", mode === "reset");
  document.querySelector("#loginError").textContent = "";
  document.querySelector("#registerError").textContent = "";
  if (mode === "register") showRegistrationStep(1);
}

function resetPerformanceForUser(user) {
  Object.keys(progressData).forEach((key) => delete progressData[key]);
  [
    ["bench", "ベンチプレス", "胸", user.bench_max],
    ["squat", "スクワット", "脚", user.squat_max],
    ["deadlift", "デッドリフト", "背中・脚", user.deadlift_max],
    ["shoulder", "ショルダープレス", "肩", null]
  ].forEach(([key, name, part, value]) => {
    const max = Number(value) || 0;
    progressData[key] = {
      name,
      part,
      max,
      oneRm: max,
      volume: 0,
      change: max ? "開始時の基準値" : "記録なし",
      maxChange: max ? "開始時点の実測1RM" : "記録なし",
      goal: max ? Math.ceil((max + 2.5) / 2.5) * 2.5 : 0,
      history: max ? [{ date: new Date().toISOString(), oneRm: max, max, volume: 0 }] : []
    };
  });
  savePerformanceData();
  localStorage.setItem("forgeBig3Initialized", "true");
}

function hideAuthGate() {
  authGate.hidden = true;
  authGate.classList.add("hidden");
  authGate.style.display = "none";
  document.body.classList.remove("auth-loading");
  document.querySelector(".app-shell").style.visibility = "visible";
  document.querySelector(".mobile-bottom-nav").style.visibility = "visible";
}

function showAuthGate(mode = "login") {
  authGate.hidden = false;
  authGate.classList.remove("hidden");
  authGate.style.removeProperty("display");
  document.body.classList.add("auth-loading");
  setAuthMode(mode);
}

function applyAuthenticatedUser(user) {
  currentUser = user;
  hideAuthGate();
  try {
    openPage("dashboard");
  } catch (error) {
    console.error("Dashboard navigation failed", error);
  }
  try {
  userSettings.birthday = user.birth_date || "";
  const previousUserId = localStorage.getItem("forgeCurrentUserId");
  const dataVersionKey = `aimusDataV1:${user.id}`;
  const isDifferentUser = previousUserId !== user.id || !localStorage.getItem(dataVersionKey);
  localStorage.setItem("forgeCurrentUserId", user.id);
  if (isDifferentUser) {
    [
      "forgePerformanceData",
      "forgeUserSettings",
      "forgeAnalysisSettings",
      "forgeExerciseCatalog",
      "forgeBig3Initialized"
    ].forEach((key) => localStorage.removeItem(key));
    resetPerformanceForUser(user);
    localStorage.setItem(dataVersionKey, "true");
  } else {
    loadPerformanceData();
  }
  document.querySelectorAll("#trainingCalendar button").forEach((button) => {
    button.classList.remove("trained", "planned", "selected");
    button.querySelector("span")?.remove();
  });
  document.querySelector("#calendarDetail").innerHTML = '<div class="empty-history-detail"><strong>まだトレーニング記録はありません</strong><p>ホームの「最初のトレーニングを記録」から始めましょう。</p></div>';
  userSettings.username = user.username;
  userSettings.notifications = user.notifications;
  analysisSettings.profile = user.purpose;
  localStorage.setItem("forgeUserSettings", JSON.stringify(userSettings));
  localStorage.setItem("forgeAnalysisSettings", JSON.stringify(analysisSettings));
  document.querySelector("#currentWeight").innerHTML = `${Number(user.weight_kg).toFixed(1)}<span>kg</span>`;
  document.querySelector("#progressWeight").innerHTML = `${Number(user.weight_kg).toFixed(1)} <em>kg</em>`;
  document.querySelector("#aiCurrentWeight").textContent = `${Number(user.weight_kg).toFixed(1)}kg`;
  document.querySelector(".profile-copy small").textContent = user.member_number || "AI×MUS MEMBER";
  document.querySelector("#settingsLoginId").value = user.login_id || "";
  document.querySelector("#settingsBirthday").value = user.birth_date || "";
  document.querySelector(".avatar").textContent = [...user.username].slice(0, 2).join("").toUpperCase();
  document.querySelector(".goal-card-title").textContent = user.goal_text || "最初の目標を設定";
  document.querySelector(".goal-card-row span:first-child").textContent = user.target_weight_kg
    ? `目標体重 ${Number(user.target_weight_kg).toFixed(1)}kg`
    : "設定画面から目標を追加";
  document.querySelector(".goal-card-row span:last-child").textContent = "START";
  document.querySelector(".goal-card .progress-track span").style.width = "0%";
  document.querySelector(".goal-card-note").textContent = `現在 ${Number(user.weight_kg).toFixed(1)}kg`;
  const today = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
  document.querySelector(".welcome .eyebrow").textContent = today;
  document.querySelector(".welcome > div > p:last-child").textContent = "今日の記録から、あなた専用のトレーニングデータを作っていきましょう。";
  refreshProgressExerciseOptions();
  renderProgressTable();
  updateProgressView();
  loadAnalysisSettings();
  loadUserSettings();
  syncBig3SettingsInputs();
  renderHomeStartState();
  } catch (error) {
    console.error("Home initialization failed", error);
    showToast("ログインしました。一部の表示を読み直しています。");
  }
}

function showRegistrationStep(step) {
  registrationStep = step;
  registerForm.querySelectorAll("[data-registration-step]").forEach((section) => {
    section.classList.toggle("active", Number(section.dataset.registrationStep) === step);
  });
  registerForm.querySelectorAll(".registration-progress i").forEach((item, index) => {
    item.classList.toggle("active", index < step);
  });
  document.querySelector("#registerError").textContent = "";
}

function validateRegistrationStepOne() {
  const fields = ["login_id", "email", "password", "password_confirm"];
  for (const name of fields) {
    const input = registerForm.elements[name];
    if (!input.value.trim() || !input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  if (registerForm.elements.password.value !== registerForm.elements.password_confirm.value) {
    document.querySelector("#registerError").textContent = "確認用パスワードが一致しません。";
    return false;
  }
  return true;
}

function renderHomeStartState() {
  if (!currentUser) return;
  const hasRecords = localStorage.getItem(`aimusHasRecords:${currentUser.id}`) === "true";
  dashboardPage.classList.add("clean-start-home");
  const start = document.querySelector("#newUserStart");
  start.classList.toggle("has-records", hasRecords);
  if (hasRecords) {
    start.querySelector("h2").textContent = "最初の記録が保存されました";
    start.querySelector("p:last-child").textContent = "進捗画面で種目ごとの最大重量、推定1RM、ボリュームを確認できます。次のトレーニングも続けて記録しましょう。";
    start.querySelector("[data-empty-action='record']").textContent = "次のトレーニングを記録";
  }
}

function validationMessage(detail) {
  const fieldNames = {
    login_id: "ID",
    password: "パスワード",
    username: "ユーザーネーム",
    birth_date: "生年月日",
    weight_kg: "体重",
    purpose: "目的",
    bench_max: "ベンチプレス",
    squat_max: "スクワット",
    deadlift_max: "デッドリフト"
  };
  if (!Array.isArray(detail)) return "入力内容を確認してください。";
  return detail.map((error) => {
    const field = fieldNames[error.loc?.at(-1)] || "入力項目";
    const message = String(error.msg || "")
      .replace("String should have at least 3 characters", "3文字以上で入力してください")
      .replace("String should have at least 8 characters", "8文字以上で入力してください")
      .replace("Input should be greater than 20", "20kgを超える値を入力してください")
      .replace("Input should be less than or equal to 400", "400kg以下で入力してください")
      .replace("Input should be greater than 0", "0より大きい値を入力してください")
      .replace("Value error, ", "");
    return `${field}: ${message || "入力内容が正しくありません"}`;
  }).join(" / ");
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${ANALYSIS_API_BASE}/auth/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    let message = "通信に失敗しました。";
    try {
      const payload = await response.json();
      message = typeof payload.detail === "string"
        ? payload.detail
        : validationMessage(payload.detail);
    } catch {
      // Use the fallback message for non-JSON errors.
    }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

async function restoreSession() {
  if (new URLSearchParams(window.location.search).get("reset_token")) {
    showAuthGate("reset");
    return;
  }
  if (isCreatorPreview) {
    applyAuthenticatedUser({
      id: "creator-preview",
      login_id: "creator",
      username: "Preview User",
      weight_kg: 74.2,
      purpose: "powerlifting",
      notifications: true,
      bench_max: 125,
      squat_max: 195,
      deadlift_max: 210
    });
    const banner = document.createElement("div");
    banner.className = "creator-preview-banner";
    banner.innerHTML = '<strong>製作者プレビュー</strong><span>認証を省略したローカル表示です</span><a href="creator.html">製作者ページへ戻る</a>';
    document.body.prepend(banner);
    return;
  }
  try {
    const user = await authRequest("me");
    applyAuthenticatedUser(user);
  } catch {
    showAuthGate("login");
  }
}

function performanceKey(exerciseName) {
  if (coreExerciseKeys[exerciseName]) return coreExerciseKeys[exerciseName];
  return `exercise_${encodeURIComponent(exerciseName).replace(/%/g, "")}`;
}

function savePerformanceData() {
  localStorage.setItem("forgePerformanceData", JSON.stringify(progressData));
}

function loadPerformanceData() {
  try {
    const saved = JSON.parse(localStorage.getItem("forgePerformanceData"));
    if (saved && typeof saved === "object") {
      Object.entries(saved).forEach(([key, data]) => {
        if (data && typeof data === "object") progressData[key] = data;
      });
    }
  } catch {
    // Keep seeded values when performance data cannot be read.
  }
}

function createPerformanceEntry(exerciseName, bodyPart) {
  const key = performanceKey(exerciseName);
  if (!progressData[key]) {
    progressData[key] = {
      name: exerciseName,
      part: bodyPart,
      max: 0,
      oneRm: 0,
      volume: 0,
      change: "記録開始",
      maxChange: "実測1RMなし",
      goal: 0,
      history: []
    };
  }
  return { key, data: progressData[key] };
}

function refreshProgressExerciseOptions(selectedKey = progressExerciseSelect.value) {
  progressExerciseSelect.innerHTML = Object.entries(progressData)
    .map(([key, data]) => `<option value="${escapeHtml(key)}">${escapeHtml(data.name)}</option>`)
    .join("");
  progressExerciseSelect.value = progressData[selectedKey] ? selectedKey : Object.keys(progressData)[0];
}

function readExerciseRecordsForProgress() {
  return [...exerciseRecords.querySelectorAll(".record-card")].map((card) => {
    const name = card.querySelector(".record-card-title strong").textContent.trim();
    const part = card.querySelector(".record-card-title small").textContent.trim();
    const sets = [...card.querySelectorAll(".set-row")].map((row) => ({
      weight: Number(row.querySelector('input[name^="weight_"]')?.value) || 0,
      reps: Number(row.querySelector('input[name^="reps_"]')?.value) || 0,
      rpe: Number(row.querySelector('input[name^="rpe_"]')?.value) || null
    })).filter((set) => set.weight > 0 && set.reps > 0);
    return { name, part, sets };
  }).filter((exercise) => exercise.sets.length);
}

function updatePerformanceFromLog() {
  const updatedNames = [];
  readExerciseRecordsForProgress().forEach((exercise) => {
    const { data } = createPerformanceEntry(exercise.name, exercise.part);
    const previousOneRm = Number(data.oneRm) || 0;
    const previousMax = Number(data.max) || 0;
    const sessionVolume = exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
    const sessionOneRm = Math.max(...exercise.sets.map((set) => (
      set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30)
    )));
    const sessionMax = Math.max(...exercise.sets.map((set) => set.weight));
    data.volume = Math.round((Number(data.volume) || 0) + sessionVolume);
    data.oneRm = Math.max(previousOneRm, sessionOneRm);
    data.max = Math.max(previousMax, sessionMax);
    if (!data.goal) data.goal = Math.ceil((data.oneRm + 2.5) / 2.5) * 2.5;
    const oneRmGain = data.oneRm - previousOneRm;
    const maxGain = data.max - previousMax;
    data.change = oneRmGain > 0 ? `+${oneRmGain.toFixed(1)}kg 今回` : "自己ベスト維持";
    data.maxChange = maxGain > 0 ? `+${maxGain.toFixed(1)}kg 今回` : data.max > 0 ? "最大重量を維持" : "記録なし";
    data.history = Array.isArray(data.history) ? data.history : [];
    data.history.push({
      date: new Date().toISOString(),
      oneRm: Number(sessionOneRm.toFixed(1)),
      max: sessionMax,
      volume: Math.round(sessionVolume)
    });
    updatedNames.push(exercise.name);
  });
  if (updatedNames.length) {
    savePerformanceData();
    refreshProgressExerciseOptions();
    renderProgressTable();
    updateProgressView();
  }
  return updatedNames;
}

function applyInitialBig3(values, resetHistory = false) {
  [
    ["bench", Number(values.benchMax)],
    ["squat", Number(values.squatMax)],
    ["deadlift", Number(values.deadliftMax)]
  ].forEach(([key, max]) => {
    if (!(max > 0)) return;
    progressData[key].max = max;
    progressData[key].oneRm = resetHistory
      ? max
      : Math.max(Number(progressData[key].oneRm) || 0, max);
    if (resetHistory) {
      progressData[key].volume = 0;
      progressData[key].history = [];
    }
    progressData[key].goal = Math.ceil((progressData[key].oneRm + 2.5) / 2.5) * 2.5;
    progressData[key].maxChange = "開始時点の実測1RM";
    progressData[key].change = "基準値";
    if (resetHistory) {
      progressData[key].history = [{
        date: new Date().toISOString(),
        oneRm: max,
        max,
        volume: 0
      }];
    }
  });
  localStorage.setItem("forgeBig3Initialized", "true");
  savePerformanceData();
  refreshProgressExerciseOptions();
  renderProgressTable();
  updateProgressView();
  syncBig3SettingsInputs();
}

function syncBig3SettingsInputs() {
  document.querySelector("#settingsBenchMax").value = progressData.bench.max || "";
  document.querySelector("#settingsSquatMax").value = progressData.squat.max || "";
  document.querySelector("#settingsDeadliftMax").value = progressData.deadlift.max || "";
}

const exercisesByPart = {
  "胸": ["ベンチプレス", "インクラインベンチプレス", "ダンベルプレス", "チェストプレス", "ダンベルフライ", "ディップス"],
  "背中": ["デッドリフト", "懸垂", "ラットプルダウン", "ベントオーバーロウ", "シーテッドロウ", "ワンハンドロウ"],
  "脚": ["スクワット", "レッグプレス", "ブルガリアンスクワット", "レッグエクステンション", "レッグカール", "カーフレイズ"],
  "腕": ["バーベルカール", "ダンベルカール", "ハンマーカール", "トライセプスプレスダウン", "スカルクラッシャー", "ナローベンチプレス"],
  "肩": ["ショルダープレス", "ミリタリープレス", "サイドレイズ", "フロントレイズ", "リアレイズ", "フェイスプル"],
  "腹筋": ["クランチ", "アブローラー", "レッグレイズ", "プランク", "ケーブルクランチ", "サイドプランク"],
  "尻": ["ヒップスラスト", "グルートブリッジ", "ルーマニアンデッドリフト", "ケーブルキックバック", "アブダクション"],
  "全身運動": ["クリーン", "スナッチ", "クリーン＆ジャーク", "ケトルベルスイング", "バーピー", "スレッドプッシュ"],
  "有酸素運動": ["ランニング", "ウォーキング", "サイクリング", "ローイング", "ステアクライマー", "水泳"]
};

function loadCustomExercises() {
  try {
    const savedCatalog = JSON.parse(localStorage.getItem("forgeExerciseCatalog"));
    if (savedCatalog && typeof savedCatalog === "object") {
      Object.keys(exercisesByPart).forEach((part) => {
        if (Array.isArray(savedCatalog[part])) {
          exercisesByPart[part] = [...new Set(savedCatalog[part].filter((name) => typeof name === "string" && name.trim()).map((name) => name.trim()))];
        }
      });
      return;
    }
    const savedExercises = JSON.parse(localStorage.getItem("forgeCustomExercises")) || {};
    Object.entries(savedExercises).forEach(([part, exercises]) => {
      if (!exercisesByPart[part] || !Array.isArray(exercises)) return;
      exercises.forEach((exercise) => {
        if (typeof exercise === "string" && exercise.trim() && !exercisesByPart[part].includes(exercise.trim())) {
          exercisesByPart[part].push(exercise.trim());
        }
      });
    });
  } catch {
    // Keep the built-in exercise list if saved data is invalid.
  }
}

function saveCustomExerciseList() {
  localStorage.setItem("forgeExerciseCatalog", JSON.stringify(exercisesByPart));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderProfileDescription() {
  const profile = analysisProfiles[analysisSettings.profile];
  document.querySelector("#profileDescription").innerHTML = `<strong>${profile.name}</strong><br>${profile.description}`;
}

function saveAnalysisSettings() {
  localStorage.setItem("forgeAnalysisSettings", JSON.stringify(analysisSettings));
  document.querySelector("#settingsSaved").textContent = "保存しました";
  window.setTimeout(() => document.querySelector("#settingsSaved").textContent = "保存済み", 1600);
}

function saveUserSettings() {
  localStorage.setItem("forgeUserSettings", JSON.stringify(userSettings));
  document.querySelector("#settingsSaved").textContent = "保存しました";
  window.setTimeout(() => document.querySelector("#settingsSaved").textContent = "保存済み", 1600);
}

function loadUserSettings() {
  try {
    Object.assign(userSettings, JSON.parse(localStorage.getItem("forgeUserSettings")) || {});
  } catch {
    // Keep defaults when saved settings cannot be read.
  }
  document.querySelector("#settingsUsername").value = userSettings.username;
  document.querySelector("#settingsBirthday").value = userSettings.birthday;
  document.querySelector("#notificationMaster").checked = userSettings.notifications;
  document.querySelector("#notifyAnalysis").checked = userSettings.notifyAnalysis;
  document.querySelector("#notifyMenu").checked = userSettings.notifyMenu;
  document.querySelector("#notifyForm").checked = userSettings.notifyForm;
  document.querySelector(".welcome h1").innerHTML = `今日も積み上げよう、<span>${escapeHtml(userSettings.username)}。</span>`;
  document.querySelector(".profile-copy strong").textContent = userSettings.username;
  updateNotificationControls();
}

function updateNotificationControls() {
  const enabled = document.querySelector("#notificationMaster").checked;
  document.querySelectorAll(".notification-child").forEach((row) => row.classList.toggle("disabled", !enabled));
  document.querySelectorAll(".notification-child input").forEach((input) => input.disabled = !enabled);
}

function loadAnalysisSettings() {
  try {
    Object.assign(analysisSettings, JSON.parse(localStorage.getItem("forgeAnalysisSettings")) || {});
  } catch {
    // Keep defaults when saved settings cannot be read.
  }
  document.querySelector("#analysisProfile").value = analysisSettings.profile;
  document.querySelector("#defaultAnalysisProfile").value = analysisSettings.profile;
  document.querySelector(`input[name="applyMode"][value="${analysisSettings.applyMode}"]`).checked = true;
  document.querySelector("#autoApplyToggle").checked = analysisSettings.applyMode === "auto";
  document.querySelector("#manualApplyEnabled").checked = analysisSettings.manualEnabled;
  document.querySelector("#askEveryAnalysis").checked = analysisSettings.askEveryTime;
  renderProfileDescription();
}

function renderVideoFolder() {
  const files = videoLibrary[selectedVideoFolder];
  document.querySelector("#videoDropTitle").textContent = `${liftNames[selectedVideoFolder]}動画を追加`;
  Object.keys(videoLibrary).forEach((key) => {
    document.querySelector(`#${key}VideoCount`).textContent = videoLibrary[key].length;
  });
  const list = document.querySelector("#videoFileList");
  if (!files.length) {
    list.innerHTML = '<div class="empty-video-folder">このフォルダにはまだ動画がありません</div>';
    return;
  }
  list.innerHTML = `
    <div class="video-batch-toolbar">
      <div><strong>${files.length}本の試技</strong><small>重量・RPEを動画ごとに入力してください</small></div>
      <button type="button" id="analyzeAllVideos">入力済みを一括解析</button>
    </div>
    ${files.map((file, index) => `
    <div class="video-file" data-video-index="${index}">
      <span class="video-thumb">▶</span>
      <div class="video-file-info"><strong>${escapeHtml(file.name)}</strong><small>${(file.size / 1024 / 1024).toFixed(1)}MB・${liftNames[selectedVideoFolder]}</small></div>
      <div class="video-attempt-inputs">
        <label>重量<span><input class="video-weight-input" type="number" min="0.5" step="0.5" value="${file.weightKg || ""}" placeholder="kg"><b>kg</b></span></label>
        <label>RPE<select class="video-rpe-input"><option value="">選択</option>${[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((value) => `<option value="${value}"${Number(file.rpe) === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>撮影角度<select class="video-angle-input"><option value="side"${file.cameraAngle === "side" ? " selected" : ""}>側面</option><option value="front_oblique"${file.cameraAngle === "front_oblique" ? " selected" : ""}>斜め前</option><option value="rear_oblique"${file.cameraAngle === "rear_oblique" ? " selected" : ""}>斜め後ろ</option></select></label>
      </div>
      <button class="analyze-video-button" type="button" data-analyze-video="${index}">この動画を解析</button>
    </div>
  `).join("")}`;
  list.querySelectorAll(".video-file").forEach((row) => {
    const index = Number(row.dataset.videoIndex);
    row.querySelector(".video-weight-input").addEventListener("input", (event) => {
      files[index].weightKg = Number(event.target.value) || null;
    });
    row.querySelector(".video-rpe-input").addEventListener("change", (event) => {
      files[index].rpe = Number(event.target.value) || null;
    });
    row.querySelector(".video-angle-input").addEventListener("change", (event) => {
      files[index].cameraAngle = event.target.value;
    });
  });
  document.querySelectorAll("[data-analyze-video]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = files[Number(button.dataset.analyzeVideo)];
      if (!validateVideoAttempt(file)) return;
      analyzeTrainingVideo(file);
    });
  });
  document.querySelector("#analyzeAllVideos").addEventListener("click", () => analyzeAllVideos(files));
}

function validateVideoAttempt(file, notify = true) {
  if (file.weightKg > 0 && file.rpe >= 1 && file.rpe <= 10) return true;
  if (notify) showToast(`${file.name}の重量とRPEを入力してください。`);
  return false;
}

async function analyzeAllVideos(files) {
  const readyFiles = files.filter((file) => validateVideoAttempt(file, false));
  if (!readyFiles.length) {
    showToast("重量とRPEを入力した動画がありません。");
    return;
  }
  const reports = [];
  for (const file of readyFiles) {
    const analysis = await analyzeTrainingVideo(file, { render: false });
    if (analysis) reports.push({ file, analysis });
  }
  if (reports.length) renderBatchAnalysisReports(reports);
}

function getAnalysisContent(lift, profileKey) {
  const profileAdvice = {
    general: {
      metrics: ["フォーム安定性|82", "可動域|88", "テンポ|76", "左右差|良好"],
      advice: ["メインセット前に軽重量で同じ軌道を2セット反復する", "反動を抑え、下ろす局面を約2秒にそろえる", "次週は良好なフォームを保ったまま総反復数を5〜10%増やす"],
      menu: "作業重量を維持し、最終セットに2回追加"
    },
    bodybuilding: {
      metrics: ["対象筋への刺激|84", "可動域|90", "エキセントリック|72", "ボリューム適性|良好"],
      advice: ["下ろす局面を2〜3秒にして対象筋の張力時間を延ばす", "ロックアウト直前で切り返し、対象筋の緊張を維持する", "補助種目を1セット追加し週間ボリュームを段階的に増やす"],
      menu: "補助種目を1セット追加、メイン種目は8〜10回へ"
    },
    powerlifting: {
      metrics: ["重量コントロール|80", "競技動作|86", "バー軌道|83", "試技評価|成功相当"],
      advice: ["開始姿勢を毎回固定し、審判コールを想定して静止する", "切り返しでバー速度を落とさず、最大努力で加速する", "試合規則の最終判定は所属団体の審判・ルールブックで確認する"],
      menu: "トップシングルをRPE 7.5で追加、バックオフ重量を2.5%調整"
    },
    athlete: {
      metrics: ["力発揮速度|78", "最大筋力刺激|85", "動作連動性|81", "疲労コスト|適正"],
      advice: ["挙上局面は最大速度を意識し、速度低下前にセットを終える", "低回数・高品質のセットで神経系への刺激を優先する", "競技練習の高強度日と下半身高負荷日を連続させない"],
      menu: "3〜5回の速度重視セットへ変更、休憩を150秒へ"
    }
  };
  const liftAdvice = {
    bench: "肩甲骨の位置を保ち、前腕が床に対して垂直になるタッチ位置を再現してください。",
    squat: "足裏3点の接地を保ち、切り返しで膝と股関節を同時に伸ばしてください。",
    deadlift: "バーを身体に近づけ、床を押す感覚で膝と股関節を連動させてください。"
  };
  return { ...profileAdvice[profileKey], liftAdvice: liftAdvice[lift] };
}

function applyAnalysisToMenu(lift, suggestion) {
  const title = liftNames[lift];
  document.querySelector("#homeWorkoutTitle").innerHTML = `${title} 改善セッション <span>・動画解析反映</span>`;
  document.querySelector("#startWorkoutButton small").textContent = suggestion;
  showToast(`${title}の解析結果をトレーニングメニューへ反映しました。`);
}

function renderAnalysisReport(file) {
  const profileKey = document.querySelector("#analysisProfile").value;
  analysisSettings.profile = profileKey;
  const profile = analysisProfiles[profileKey];
  const content = getAnalysisContent(selectedVideoFolder, profileKey);
  const result = document.querySelector("#analysisResultCard");
  result.innerHTML = `
    <div class="analysis-report-header">
      <div class="analysis-report-title"><p class="eyebrow">${profile.name.toUpperCase()} ANALYSIS</p><h2>${liftNames[selectedVideoFolder]}・解析結果</h2><span>${escapeHtml(file.name)}・目的別評価</span></div>
      <div class="analysis-score"><strong>82</strong><small>/ 100</small></div>
    </div>
    <div class="analysis-report-grid">
      <div class="analysis-metrics">${content.metrics.map((metric) => {
        const [label, value] = metric.split("|");
        return `<div class="analysis-metric"><span>${label}</span><strong>${value}</strong></div>`;
      }).join("")}</div>
      <div class="analysis-advice"><h3>${profile.focus.join("・")}</h3><ul><li>${content.liftAdvice}</li>${content.advice.map((item) => `<li>${item}</li>`).join("")}</ul></div>
    </div>
  `;
  const shouldShowManual = analysisSettings.applyMode === "manual" && analysisSettings.manualEnabled;
  if (analysisSettings.applyMode === "auto") {
    applyAnalysisToMenu(selectedVideoFolder, content.menu);
    result.insertAdjacentHTML("beforeend", `<div class="menu-reflection"><div><strong>メニューへ自動反映しました</strong><small>${content.menu}</small></div><div class="menu-reflection-actions"><button data-open-page="dashboard">ホームで確認</button></div></div>`);
  } else if (shouldShowManual && analysisSettings.askEveryTime) {
    result.insertAdjacentHTML("beforeend", `<div class="menu-reflection"><div><strong>この提案をメニューへ反映しますか？</strong><small>${content.menu}</small></div><div class="menu-reflection-actions"><button id="skipMenuReflection">今回は反映しない</button><button class="primary" id="applyMenuReflection">反映する</button></div></div>`);
    document.querySelector("#applyMenuReflection").addEventListener("click", () => applyAnalysisToMenu(selectedVideoFolder, content.menu));
    document.querySelector("#skipMenuReflection").addEventListener("click", () => showToast("解析結果のみ保存しました。"));
  } else if (shouldShowManual) {
    result.insertAdjacentHTML("beforeend", `<div class="menu-reflection"><div><strong>メニュー反映は手動です</strong><small>${content.menu}</small></div><div class="menu-reflection-actions"><button class="primary" id="applyMenuReflection">反映する</button></div></div>`);
    document.querySelector("#applyMenuReflection").addEventListener("click", () => applyAnalysisToMenu(selectedVideoFolder, content.menu));
  }
  result.querySelectorAll("[data-open-page]").forEach((button) => button.addEventListener("click", () => openPage(button.dataset.openPage)));
}

function appendAnalysisMenuReflection(result, menuSummary, lift) {
  const shouldShowManual = analysisSettings.applyMode === "manual" && analysisSettings.manualEnabled;
  if (analysisSettings.applyMode === "auto") {
    applyAnalysisToMenu(lift, menuSummary);
    result.insertAdjacentHTML("beforeend", `<div class="menu-reflection"><div><strong>メニューへ自動反映しました</strong><small>${escapeHtml(menuSummary)}</small></div><div class="menu-reflection-actions"><button data-open-page="dashboard">ホームで確認</button></div></div>`);
  } else if (shouldShowManual && analysisSettings.askEveryTime) {
    result.insertAdjacentHTML("beforeend", `<div class="menu-reflection"><div><strong>この提案をメニューへ反映しますか？</strong><small>${escapeHtml(menuSummary)}</small></div><div class="menu-reflection-actions"><button id="skipMenuReflection">今回は反映しない</button><button class="primary" id="applyMenuReflection">反映する</button></div></div>`);
    document.querySelector("#applyMenuReflection").addEventListener("click", () => applyAnalysisToMenu(lift, menuSummary));
    document.querySelector("#skipMenuReflection").addEventListener("click", () => showToast("解析結果のみ保存しました。"));
  } else if (shouldShowManual) {
    result.insertAdjacentHTML("beforeend", `<div class="menu-reflection"><div><strong>メニュー反映は手動です</strong><small>${escapeHtml(menuSummary)}</small></div><div class="menu-reflection-actions"><button class="primary" id="applyMenuReflection">反映する</button></div></div>`);
    document.querySelector("#applyMenuReflection").addEventListener("click", () => applyAnalysisToMenu(lift, menuSummary));
  }
  result.querySelectorAll("[data-open-page]").forEach((button) => button.addEventListener("click", () => openPage(button.dataset.openPage)));
}

function analysisReportMarkup(file, analysis) {
  const profile = analysisProfiles[analysis.profile];
  const metrics = analysis.metrics.map((metric) => {
    const value = typeof metric.value === "number" ? metric.value.toFixed(1) : metric.value;
    const score = metric.score == null ? 0 : Math.round(metric.score);
    return `<div class="analysis-metric">
      <div class="analysis-metric-heading"><span>${escapeHtml(metric.label)}</span><small>測定値 ${escapeHtml(String(value))}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}・評価 ${score}</small></div>
      <p>${escapeHtml(metric.interpretation || "動作データからこの項目を評価しています。")}</p>
      <strong>${escapeHtml(metric.recommendation || "現在の動きを再現しながら、安定性を高めてください。")}</strong>
    </div>`;
  }).join("");
  const ruleChecks = analysis.rule_evaluations?.length
    ? `<div class="analysis-rule-checks"><h3>IPF競技判定支援</h3><div class="rule-evaluation-list">${analysis.rule_evaluations.map((item) => {
      const labels = { pass: "基準内", warn: "要確認", review: "目視必須" };
      return `<div class="rule-evaluation ${escapeHtml(item.status)}"><span>${labels[item.status] || item.status}</span><div><strong>${escapeHtml(item.item)}</strong><small>${escapeHtml(item.evidence)}・信頼度 ${Math.round(item.confidence * 100)}%</small></div></div>`;
    }).join("")}</div>${analysis.rule_source ? `<a href="${escapeHtml(analysis.rule_source)}" target="_blank" rel="noreferrer">IPF公式競技規則を確認 ↗</a>` : ""}</div>`
    : "";
  return `
    <article class="detailed-analysis-report">
    <div class="analysis-report-header">
      <div class="analysis-report-title"><p class="eyebrow">${escapeHtml(profile.name.toUpperCase())} ANALYSIS</p><h2>${escapeHtml(liftNames[analysis.lift])}・${escapeHtml(analysis.verdict)}</h2><span>${escapeHtml(file.name)}・${analysis.context.weight_kg}kg・RPE ${analysis.context.rpe}・${escapeHtml(analysis.model_name)}・${analysis.frames_analyzed}フレーム</span></div>
      <div class="analysis-score"><strong>${Math.round(analysis.score)}</strong><small>/ 100</small></div>
    </div>
    <div class="analysis-executive-summary"><span>総合所見</span><p>${escapeHtml(analysis.executive_summary)}</p></div>
    <div class="rpe-comparison">
      <div><small>ユーザー入力</small><strong>RPE ${analysis.context.rpe}</strong><span>${analysis.context.weight_kg}kg</span></div>
      <b>→</b>
      <div class="objective"><small>動画からの客観評価</small><strong>RPE ${analysis.objective_rpe}</strong><span>信頼度 ${Math.round(analysis.rpe_confidence * 100)}%</span></div>
      <p>${analysis.rpe_difference > 0 ? `動画では申告より${analysis.rpe_difference}高く見えます。負荷設定を慎重にしてください。` : analysis.rpe_difference < 0 ? `動画では申告より${Math.abs(analysis.rpe_difference)}低く見えます。余力が残っている可能性があります。` : "申告RPEと動画推定RPEは一致しています。"}</p>
    </div>
    <div class="analysis-key-findings">
      <div class="analysis-strengths"><span>良かった点</span>${analysis.strengths.map((item) => `<strong>✓ ${escapeHtml(item)}</strong>`).join("")}</div>
      <div class="analysis-priorities"><span>最優先の修正点</span>${analysis.priorities.map((item, index) => `<strong>${index + 1}. ${escapeHtml(item)}</strong>`).join("")}</div>
    </div>
    <div class="analysis-report-grid">
      <div class="analysis-metrics"><h3>動作別の評価と修正方法</h3>${metrics}</div>
      <div class="analysis-advice"><h3>次回セットへの具体的アドバイス</h3><ul>${analysis.advice.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><div class="next-prescription"><small>メニュー反映候補</small><strong>${escapeHtml(analysis.menu_adjustment.summary)}</strong><p>${escapeHtml(analysis.menu_adjustment.rationale || "")}</p><div><span>推奨重量 <b>${analysis.menu_adjustment.target_weight_kg ?? analysis.context.weight_kg}kg</b></span><span>推奨回数 <b>${escapeHtml(analysis.menu_adjustment.target_reps || "現状維持")}</b></span></div></div></div>
    </div>
    ${ruleChecks}
    </article>
  `;
}

function renderBackendAnalysisReport(file, analysis) {
  const result = document.querySelector("#analysisResultCard");
  result.innerHTML = analysisReportMarkup(file, analysis);
  appendAnalysisMenuReflection(result, analysis.menu_adjustment.summary, analysis.lift);
}

function renderBatchAnalysisReports(reports) {
  const result = document.querySelector("#analysisResultCard");
  const scores = reports.map(({ analysis }) => analysis.score);
  const bestIndex = scores.indexOf(Math.max(...scores));
  result.innerHTML = `
    <div class="batch-analysis-summary">
      <div><p class="eyebrow">MULTI VIDEO REVIEW</p><h2>${reports.length}本の試技比較</h2><p>最高評価は${escapeHtml(reports[bestIndex].file.name)}の${Math.round(scores[bestIndex])}点です。重量とRPEの変化に対するフォーム再現性を比較してください。</p></div>
      <strong>${Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)}<small>平均点</small></strong>
    </div>
    <div class="batch-analysis-reports">${reports.map(({ file, analysis }) => analysisReportMarkup(file, analysis)).join("")}</div>
  `;
  const latest = reports[reports.length - 1].analysis;
  appendAnalysisMenuReflection(result, latest.menu_adjustment.summary, latest.lift);
}

function renderAnalysisApiError(message) {
  const result = document.querySelector("#analysisResultCard");
  result.innerHTML = `<div class="analysis-api-error"><h3>動画解析を開始できませんでした</h3><p>${escapeHtml(message)}<br>バックエンドの起動状態とモデル依存パッケージを確認してください。</p></div>`;
}

async function pollAnalysisJob(jobId) {
  const result = document.querySelector("#analysisResultCard");
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const response = await fetch(`${ANALYSIS_API_BASE}/analyses/${encodeURIComponent(jobId)}`, {
      credentials: "include"
    });
    if (!response.ok) throw new Error(`解析状況の取得に失敗しました（HTTP ${response.status}）`);
    const job = await response.json();
    result.innerHTML = `<div class="analysis-loading"><span class="analysis-spinner"></span><strong>姿勢推定モデルで解析しています</strong><progress max="100" value="${job.progress}"></progress><em>${job.progress}%・${escapeHtml(job.status)}</em><small>関節角度、左右差、可動域、競技規則を評価中...</small></div>`;
    if (job.status === "completed") return job.result;
    if (job.status === "failed") throw new Error(job.error || "動画解析に失敗しました。");
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error("解析がタイムアウトしました。");
}

async function analyzeTrainingVideo(file, options = { render: true }) {
  if (!file.rawFile) {
    if (options.render) renderAnalysisApiError("元の動画データが見つかりません。動画を選択し直してください。");
    return null;
  }
  const result = document.querySelector("#analysisResultCard");
  const lift = selectedVideoFolder;
  result.innerHTML = '<div class="analysis-loading"><span class="analysis-spinner"></span><strong>動画をアップロードしています</strong><progress max="100" value="5"></progress><small>動画は解析APIへ送信されます。</small></div>';
  result.scrollIntoView({ behavior: "smooth", block: "center" });
  const formData = new FormData();
  formData.append("video", file.rawFile, file.name);
  formData.append("lift", lift);
  formData.append("profile", document.querySelector("#analysisProfile").value);
  formData.append("user_id", userSettings.username || "local-user");
  formData.append("weight_kg", String(file.weightKg));
  formData.append("rpe", String(file.rpe));
  formData.append("camera_angle", file.cameraAngle || "side");
  formData.append("set_label", file.name);
  try {
    const response = await fetch(`${ANALYSIS_API_BASE}/analyses`, {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.detail || `アップロードに失敗しました（HTTP ${response.status}）`);
    }
    const job = await response.json();
    const analysis = await pollAnalysisJob(job.id);
    if (options.render) renderBackendAnalysisReport(file, analysis);
    return analysis;
  } catch (error) {
    if (options.render) renderAnalysisApiError(error.message || "解析APIへ接続できません。");
    else showToast(`${file.name}: ${error.message || "解析に失敗しました。"}`);
    return null;
  }
}

async function checkAnalysisApi() {
  const status = document.querySelector("#analysisBackendStatus");
  if (!status) return;
  try {
    const response = await fetch(`${ANALYSIS_API_BASE}/health`, {
      signal: AbortSignal.timeout(2500),
      credentials: "include"
    });
    if (!response.ok) throw new Error();
    status.textContent = "姿勢推定API 接続済み";
    status.className = "backend-status online";
  } catch {
    status.textContent = "解析API 未接続";
    status.className = "backend-status offline";
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function renderExerciseOptions() {
  exerciseSelect.innerHTML = [...selectedBodyParts].map((part) => `
    <optgroup label="${escapeHtml(part)}">
      ${exercisesByPart[part].map((exercise) => `<option value="${escapeHtml(exercise)}" data-part="${escapeHtml(part)}">${escapeHtml(exercise)}</option>`).join("")}
    </optgroup>
  `).join("");
}

function renderExerciseSettings() {
  const list = document.querySelector("#exerciseSettingsList");
  const filter = document.querySelector("#exerciseSettingsFilter")?.value || "all";
  if (!list) return;
  const parts = filter === "all" ? Object.keys(exercisesByPart) : [filter];
  const exercises = parts.flatMap((part) => exercisesByPart[part].map((name) => ({ part, name })));
  document.querySelector("#exerciseSettingsCount").textContent = `${exercises.length} 種目`;
  if (!exercises.length) {
    list.innerHTML = '<div class="exercise-settings-empty">この部位には種目がありません。</div>';
    return;
  }
  const partOptions = Object.keys(exercisesByPart);
  list.innerHTML = exercises.map(({ part, name }) => `
    <div class="exercise-setting-row" data-original-part="${escapeHtml(part)}" data-original-name="${escapeHtml(name)}">
      <label>種目名<input type="text" class="exercise-setting-name" value="${escapeHtml(name)}" maxlength="50"></label>
      <label>部位<select class="exercise-setting-part">
        ${partOptions.map((option) => `<option value="${escapeHtml(option)}"${option === part ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select></label>
      <button type="button" class="save-exercise-setting">変更を保存</button>
    </div>
  `).join("");
}

function saveExerciseSetting(row) {
  const originalPart = row.dataset.originalPart;
  const originalName = row.dataset.originalName;
  const newName = row.querySelector(".exercise-setting-name").value.trim();
  const newPart = row.querySelector(".exercise-setting-part").value;
  if (!newName) {
    showToast("種目名を入力してください。");
    row.querySelector(".exercise-setting-name").focus();
    return;
  }
  const duplicate = exercisesByPart[newPart].some((name) => name === newName && !(originalPart === newPart && originalName === newName));
  if (duplicate) {
    showToast(`「${newName}」は${newPart}に登録済みです。`);
    return;
  }
  const originalIndex = exercisesByPart[originalPart].indexOf(originalName);
  if (originalIndex < 0) {
    showToast("種目が見つかりません。画面を再読み込みしてください。");
    return;
  }
  exercisesByPart[originalPart].splice(originalIndex, 1);
  exercisesByPart[newPart].push(newName);
  saveCustomExerciseList();
  renderExerciseOptions();
  renderExerciseSettings();
  showToast(`「${originalName}」を「${newName}・${newPart}」へ変更しました。`);
}

function renderEmptyState() {
  if (!exerciseRecords.children.length) {
    exerciseRecords.innerHTML = '<div class="empty-records">種目を追加すると、セットの記録欄が表示されます</div>';
  }
}

function createSetRow(card, setNumber) {
  const row = document.createElement("div");
  row.className = "set-row";
  row.innerHTML = `
    <span class="set-number">${setNumber}</span>
    <label>重量 kg<input type="number" name="weight_${card.dataset.recordId}[]" min="0" step="0.5" placeholder="0"></label>
    <label>回数<input type="number" name="reps_${card.dataset.recordId}[]" min="1" step="1" placeholder="10"></label>
    <label>RPE<input type="number" name="rpe_${card.dataset.recordId}[]" min="1" max="10" step="0.5" placeholder="8"></label>
    <label>セットメモ<input type="text" name="setMemo_${card.dataset.recordId}[]" placeholder="フォームや感覚"></label>
    <button type="button" class="remove-set" aria-label="セットを削除">×</button>
  `;
  row.querySelector(".remove-set").addEventListener("click", () => {
    if (card.querySelectorAll(".set-row").length > 1) {
      row.remove();
      card.querySelectorAll(".set-number").forEach((number, index) => number.textContent = index + 1);
    }
  });
  card.querySelector(".set-list").appendChild(row);
}

function addExerciseRecord(exerciseName, bodyPart = [...selectedBodyParts][0]) {
  const empty = exerciseRecords.querySelector(".empty-records");
  if (empty) empty.remove();
  recordSequence += 1;
  const card = document.createElement("article");
  card.className = "record-card";
  card.dataset.recordId = recordSequence;
  const safeExerciseName = escapeHtml(exerciseName);
  const safeBodyPart = escapeHtml(bodyPart);
  card.innerHTML = `
    <div class="record-card-header">
      <div class="record-card-title"><strong>${safeExerciseName}</strong><small>${safeBodyPart}</small></div>
      <button type="button" class="remove-record" aria-label="${safeExerciseName}を削除">×</button>
    </div>
    <input type="hidden" name="exercise_${recordSequence}" value="${safeExerciseName}">
    <input type="hidden" name="part_${recordSequence}" value="${safeBodyPart}">
    <div class="set-list"></div>
    <button type="button" class="add-set">＋ セットを追加</button>
  `;
  card.querySelector(".remove-record").addEventListener("click", () => {
    card.remove();
    renderEmptyState();
  });
  card.querySelector(".add-set").addEventListener("click", () => {
    createSetRow(card, card.querySelectorAll(".set-row").length + 1);
  });
  exerciseRecords.appendChild(card);
  createSetRow(card, 1);
  return card;
}

function findExercisePart(exerciseName) {
  return Object.keys(exercisesByPart).find((part) => exercisesByPart[part].includes(exerciseName)) || "全身運動";
}

function parseHistoryExercise(item) {
  const load = item[1] || "";
  const weightMatch = load.match(/([\d.]+)kg/);
  const repsMatch = load.match(/×\s*(\d+)/);
  const setMatches = [...load.matchAll(/×\s*(\d+)/g)];
  const rpeMatch = (item[2] || "").match(/([\d.]+)/);
  return {
    name: item[0],
    part: item[3] || findExercisePart(item[0]),
    weight: weightMatch ? weightMatch[1] : "",
    reps: repsMatch ? repsMatch[1] : "",
    sets: setMatches[1] ? Number(setMatches[1][1]) : 1,
    rpe: rpeMatch ? rpeMatch[1] : ""
  };
}

function resetLogExerciseRecords() {
  exerciseRecords.innerHTML = "";
  recordSequence = 0;
}

function populateLogFromHistory(record, mode, day) {
  historyFormMode = { mode, sourceDay: String(day), targetDay: mode === "copy" ? "14" : String(day) };
  resetLogExerciseRecords();
  record.exercises.forEach((item) => {
    const parsed = parseHistoryExercise(item);
    selectedBodyParts.add(parsed.part);
    document.querySelector(`.body-part[data-part="${parsed.part}"]`)?.classList.add("active");
    const card = addExerciseRecord(parsed.name, parsed.part);
    for (let index = 1; index < parsed.sets; index += 1) createSetRow(card, index + 1);
    card.querySelectorAll(".set-row").forEach((row) => {
      row.querySelector('input[name^="weight_"]').value = parsed.weight;
      row.querySelector('input[name^="reps_"]').value = parsed.reps;
      row.querySelector('input[name^="rpe_"]').value = parsed.rpe;
    });
  });
  renderExerciseOptions();
  const heading = logDialog.querySelector(".dialog-header h2");
  heading.textContent = mode === "copy" ? "本日の記録としてコピー" : `6月${day}日の記録を編集`;
  let notice = logDialog.querySelector(".history-editing-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "history-editing-notice";
    logDialog.querySelector(".dialog-header").insertAdjacentElement("afterend", notice);
  }
  notice.textContent = mode === "copy"
    ? `6月${day}日の内容を本日（6月14日）へコピーしました。必要に応じて編集して保存してください。`
    : `6月${day}日の記録を編集中です。変更後に「記録を保存」を押してください。`;
  logDialog.showModal();
}

function collectHistoryExercisesFromForm() {
  return [...exerciseRecords.querySelectorAll(".record-card")].map((card) => {
    const name = card.querySelector(".record-card-title strong").textContent;
    const part = card.querySelector(".record-card-title small").textContent;
    const rows = [...card.querySelectorAll(".set-row")];
    const first = rows[0];
    const weight = first?.querySelector('input[name^="weight_"]')?.value || "0";
    const reps = first?.querySelector('input[name^="reps_"]')?.value || "0";
    const rpes = rows.map((row) => Number(row.querySelector('input[name^="rpe_"]')?.value)).filter(Number.isFinite);
    const rpe = rpes.length ? (rpes.reduce((sum, value) => sum + value, 0) / rpes.length).toFixed(1).replace(".0", "") : "-";
    return [name, `${weight}kg × ${reps} × ${rows.length}`, `RPE ${rpe}`, part];
  });
}

function resetHistoryDialogState() {
  historyFormMode = null;
  logDialog.querySelector(".history-editing-notice")?.remove();
  logDialog.querySelector(".dialog-header h2").textContent = "今日の記録";
}

function updateGoalDisplay() {
  const data = progressData[progressExerciseSelect.value];
  const target = Number(document.querySelector("#goalWeightInput").value) || data.goal;
  const difference = Math.max(0, target - data.oneRm);
  const progress = Math.min(100, (data.oneRm / target) * 100);
  document.querySelector("#goalDifference").textContent = difference > 0 ? `あと ${difference.toFixed(1)}kg` : "目標達成";
  document.querySelector("#goalProgressBar").style.width = `${progress}%`;
  document.querySelector("#goalProgressPercent").textContent = `${progress.toFixed(1)}%`;
}

function updateProgressView() {
  const data = progressData[progressExerciseSelect.value];
  document.querySelector("#maxWeightValue").innerHTML = `${data.max.toFixed(1)} <em>kg</em>`;
  document.querySelector("#maxWeightChange").textContent = data.maxChange;
  document.querySelector("#oneRmValue").innerHTML = `${data.oneRm.toFixed(1)} <em>kg</em>`;
  document.querySelector("#volumeValue").innerHTML = `${data.volume.toLocaleString()} <em>kg</em>`;
  document.querySelector("#progressChartTitle").textContent = `${data.name}の推移`;
  document.querySelector("#goalCurrentOneRm").innerHTML = `${data.oneRm.toFixed(1)} <span>kg</span>`;
  document.querySelector("#goalWeightInput").value = data.goal;
  renderPerformanceChart(data, activeProgressMetric);
  updateGoalDisplay();
}

function renderPerformanceChart(data, metric) {
  const history = Array.isArray(data.history) && data.history.length
    ? data.history.slice(-6)
    : [{ date: new Date().toISOString(), oneRm: data.oneRm, max: data.max, volume: data.volume }];
  const values = history.map((entry) => Number(entry[metric]) || 0);
  const width = 700;
  const top = 28;
  const bottom = 190;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.15, maximum * 0.05, 1);
  const low = Math.max(0, minimum - padding);
  const high = maximum + padding;
  const range = Math.max(high - low, 1);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : index * (width / (values.length - 1)),
    y: bottom - ((value - low) / range) * (bottom - top)
  }));
  const linePath = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1).x.toFixed(1)},220 L${points[0].x.toFixed(1)},220 Z`;
  document.querySelector("#progressChartLine").setAttribute("d", linePath);
  document.querySelector("#progressChartArea").setAttribute("d", areaPath);
  document.querySelector("#progressChartPoint").setAttribute("cx", points.at(-1).x);
  document.querySelector("#progressChartPoint").setAttribute("cy", points.at(-1).y);
  document.querySelector(".progress-chart-labels").innerHTML = history.map((entry) => {
    const date = new Date(entry.date);
    return `<span>${date.getMonth() + 1}/${date.getDate()}</span>`;
  }).join("");
  const axisValues = [high, high - range / 3, high - range * 2 / 3, low];
  document.querySelector(".axis-labels").innerHTML = axisValues
    .map((value) => `<span>${metric === "volume" ? Math.round(value).toLocaleString() : value.toFixed(1)}</span>`)
    .join("");
  const latest = values.at(-1);
  document.querySelector("#chartMainValue").innerHTML = `${metric === "volume" ? Math.round(latest).toLocaleString() : latest.toFixed(1)} <span>kg</span>`;
  document.querySelector("#chartDelta").textContent = metric === "oneRm"
    ? `↗ ${data.change}`
    : metric === "max"
      ? data.maxChange
      : `${Math.round(data.volume).toLocaleString()}kg 累積`;
}

function renderProgressTable() {
  document.querySelector("#progressTableBody").innerHTML = Object.entries(progressData).map(([key, data]) => `
    <tr data-progress-key="${key}">
      <td><div class="table-exercise"><strong>${data.name}</strong><small>${data.part}</small></div></td>
      <td>${data.max.toFixed(1)} kg</td>
      <td><strong>${data.oneRm.toFixed(1)} kg</strong></td>
      <td>${data.volume.toLocaleString()} kg</td>
      <td><span class="table-change">↗ ${data.change}</span></td>
      <td><span class="table-goal">${data.goal.toFixed(1)} kg →</span></td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-progress-key]").forEach((row) => {
    row.addEventListener("click", () => {
      progressExerciseSelect.value = row.dataset.progressKey;
      updateProgressView();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function allExerciseNames() {
  return [...new Set(Object.values(exercisesByPart).flat())];
}

function renderPlanDay() {
  const day = planDays[selectedPlanDay];
  document.querySelector("#editorDayEnglish").textContent = day.english;
  document.querySelector("#editorDayTitle").textContent = `${day.short}曜日のメニュー`;
  document.querySelector("#totalTrainingTime").value = day.time;
  const container = document.querySelector("#dayExercises");
  if (!day.exercises.length) {
    container.innerHTML = '<div class="day-empty"><span>＋</span><strong>種目はまだありません</strong><small>下のボタンから最初の種目を追加してください</small></div>';
  } else {
    container.innerHTML = day.exercises.map((exercise, index) => `
      <div class="menu-exercise-row" data-plan-index="${index}">
        <label>種目<select data-field="name">${allExerciseNames().map((name) => `<option value="${name}"${name === exercise.name ? " selected" : ""}>${name}</option>`).join("")}</select></label>
        <label>重量 kg<input data-field="weight" type="number" min="0" step="0.5" value="${exercise.weight}"></label>
        <label>回数<input data-field="reps" type="number" min="1" value="${exercise.reps}"></label>
        <label>RPE<input data-field="rpe" type="number" min="1" max="10" step="0.5" value="${exercise.rpe}"></label>
        <label>レスト 秒<input data-field="rest" type="number" min="0" step="15" value="${exercise.rest}"></label>
        <button class="remove-menu-exercise" type="button" aria-label="種目を削除">×</button>
      </div>
    `).join("");
  }
  document.querySelectorAll(".menu-exercise-row").forEach((row) => {
    row.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const exercise = day.exercises[Number(row.dataset.planIndex)];
        exercise[input.dataset.field] = input.dataset.field === "name" ? input.value : Number(input.value);
        updateWeekTabs();
      });
    });
    row.querySelector(".remove-menu-exercise").addEventListener("click", () => {
      day.exercises.splice(Number(row.dataset.planIndex), 1);
      renderPlanDay();
      updateWeekTabs();
    });
  });
}

function updateWeekTabs() {
  let activeDays = 0;
  document.querySelectorAll(".week-tab").forEach((tab) => {
    const day = planDays[tab.dataset.day];
    const hasWorkout = day.exercises.length > 0;
    tab.classList.toggle("has-workout", hasWorkout);
    tab.querySelector("span").textContent = hasWorkout ? `${day.exercises.length}種目・${day.time}分` : "休養日";
    if (hasWorkout) activeDays += 1;
  });
  document.querySelector("#trainingDayCount").textContent = activeDays;
}

function showWizardStep(step) {
  wizardStep = Math.max(1, Math.min(5, step));
  document.querySelectorAll(".wizard-page").forEach((page) => {
    page.classList.toggle("active", Number(page.dataset.wizardStep) === wizardStep);
  });
  document.querySelectorAll(".wizard-dot").forEach((dot, index) => {
    dot.classList.toggle("active", index + 1 === wizardStep);
    dot.classList.toggle("complete", index + 1 < wizardStep);
  });
  document.querySelector("#wizardProgressLine").style.width = `${((wizardStep - 1) / 4) * 100}%`;
  document.querySelector("#wizardBack").style.visibility = wizardStep === 1 ? "hidden" : "visible";
  document.querySelector("#wizardNext").style.display = wizardStep === 5 ? "none" : "block";
  document.querySelector("#generateAiPlan").style.display = wizardStep === 5 ? "block" : "none";
}

function roundToPlate(weight) {
  return Math.max(0, Math.round(weight / 2.5) * 2.5);
}

function getTrainingParameters() {
  const parameters = {
    general: { reps: "8–12", rpe: "7", rest: "90秒", intensity: 0.65 },
    bodybuilding: { reps: "8–12", rpe: "8", rest: "90秒", intensity: 0.7 },
    powerlifting: { reps: "3–5", rpe: "7.5", rest: "180秒", intensity: 0.78 },
    athlete: { reps: "4–6", rpe: "7", rest: "120秒", intensity: 0.72 }
  };
  return parameters[selectedPurpose];
}

function exercise(name, weight, reps, rpe, rest) {
  return { name, weight, reps, rpe, rest };
}

function getSessionTemplates() {
  const params = getTrainingParameters();
  const bodyWeight = Number(document.querySelector("#currentWeight").textContent.replace(/[^\d.]/g, "")) || 74.2;
  const bench = roundToPlate(progressData.bench.oneRm * params.intensity);
  const squat = roundToPlate(progressData.squat.oneRm * params.intensity);
  const deadlift = roundToPlate(progressData.deadlift.oneRm * params.intensity);
  const shoulder = roundToPlate(progressData.shoulder.oneRm * params.intensity);
  const accessoryReps = selectedPurpose === "powerlifting" ? "6–8" : params.reps;
  const templates = {
    upper: {
      title: "上半身",
      exercises: [
        exercise("ベンチプレス", `${bench}kg`, params.reps, params.rpe, params.rest),
        exercise("ベントオーバーロウ", `${roundToPlate(bodyWeight * 0.75)}kg`, accessoryReps, "7.5", "120秒"),
        exercise("ショルダープレス", `${shoulder}kg`, accessoryReps, "8", "90秒"),
        exercise("ラットプルダウン", `${roundToPlate(bodyWeight * 0.7)}kg`, "10–12", "8", "75秒"),
        exercise("トライセプスプレスダウン", "25kg", "12–15", "8", "60秒")
      ]
    },
    lower: {
      title: "下半身",
      exercises: [
        exercise("スクワット", `${squat}kg`, params.reps, params.rpe, params.rest),
        exercise("ルーマニアンデッドリフト", `${roundToPlate(progressData.deadlift.oneRm * 0.5)}kg`, "8–10", "7.5", "120秒"),
        exercise("ブルガリアンスクワット", "自重 + 12kg", "8 / 脚", "8", "90秒"),
        exercise("レッグカール", "35kg", "10–12", "8", "75秒"),
        exercise("カーフレイズ", "40kg", "12–15", "8", "60秒")
      ]
    },
    push: {
      title: "PUSH・胸 / 肩 / 三頭",
      exercises: [
        exercise("ベンチプレス", `${bench}kg`, params.reps, params.rpe, params.rest),
        exercise("インクラインダンベルプレス", "26kg", "8–10", "8", "90秒"),
        exercise("ショルダープレス", `${shoulder}kg`, "6–8", "8", "120秒"),
        exercise("サイドレイズ", "8kg", "12–15", "8", "60秒"),
        exercise("トライセプスプレスダウン", "25kg", "12–15", "8", "60秒")
      ]
    },
    pull: {
      title: "PULL・背中 / 二頭",
      exercises: [
        exercise("デッドリフト", `${deadlift}kg`, params.reps, params.rpe, params.rest),
        exercise("懸垂", "自重", "6–10", "8", "120秒"),
        exercise("シーテッドロウ", `${roundToPlate(bodyWeight * 0.7)}kg`, "8–12", "8", "90秒"),
        exercise("フェイスプル", "20kg", "12–15", "7", "60秒"),
        exercise("ダンベルカール", "12kg", "10–12", "8", "60秒")
      ]
    },
    legs: {
      title: "LEGS・脚 / 尻",
      exercises: [
        exercise("スクワット", `${squat}kg`, params.reps, params.rpe, params.rest),
        exercise("ルーマニアンデッドリフト", `${roundToPlate(progressData.deadlift.oneRm * 0.5)}kg`, "8–10", "8", "120秒"),
        exercise("レッグプレス", "120kg", "10–12", "8", "90秒"),
        exercise("レッグカール", "35kg", "10–12", "8", "75秒"),
        exercise("カーフレイズ", "40kg", "12–15", "8", "60秒")
      ]
    },
    full: {
      title: "全身",
      exercises: [
        exercise("スクワット", `${squat}kg`, params.reps, params.rpe, params.rest),
        exercise("ベンチプレス", `${bench}kg`, params.reps, params.rpe, params.rest),
        exercise("ラットプルダウン", `${roundToPlate(bodyWeight * 0.7)}kg`, "8–12", "8", "90秒"),
        exercise(selectedPurpose === "athlete" ? "ケトルベルスイング" : "ルーマニアンデッドリフト", selectedPurpose === "athlete" ? "20kg" : `${roundToPlate(progressData.deadlift.oneRm * 0.45)}kg`, "8–10", "7", "90秒"),
        exercise("プランク", "自重", "45秒", "7", "45秒")
      ]
    },
    chest: { title: "胸", exercises: [] },
    back: { title: "背中", exercises: [] },
    shoulders: { title: "肩", exercises: [] },
    arms: { title: "腕", exercises: [] }
  };
  templates.chest.exercises = templates.push.exercises.filter((_, index) => [0, 1, 4].includes(index)).concat([exercise("ダンベルフライ", "14kg", "12–15", "8", "60秒")]);
  templates.back.exercises = templates.pull.exercises.filter((_, index) => index !== 0).concat([exercise("ワンハンドロウ", "28kg", "8–10", "8", "90秒")]);
  templates.shoulders.exercises = [templates.push.exercises[2], templates.push.exercises[3], exercise("リアレイズ", "7kg", "12–15", "8", "60秒"), exercise("フェイスプル", "20kg", "12–15", "7", "60秒")];
  templates.arms.exercises = [exercise("バーベルカール", "25kg", "8–12", "8", "75秒"), exercise("ナローベンチプレス", `${roundToPlate(bench * 0.8)}kg`, "8–10", "8", "90秒"), exercise("ハンマーカール", "12kg", "10–12", "8", "60秒"), exercise("スカルクラッシャー", "20kg", "10–12", "8", "60秒")];
  return templates;
}

function renderExerciseDetails(items) {
  return items.map((item) => `
    <div class="generated-exercise">
      <strong>${item.name}</strong>
      <div><small>重量</small><b>${item.weight}</b></div>
      <div><small>回数</small><b>${item.reps}</b></div>
      <div><small>RPE</small><b>${item.rpe}</b></div>
      <div><small>レスト</small><b>${item.rest}</b></div>
    </div>
  `).join("");
}

function updateHomeWorkout(session, dayLabel, isToday) {
  const visibleExercises = session.exercises.slice(0, 3);
  document.querySelector("#homeWorkoutTitle").innerHTML = `${session.title} <span>・AI作成 ${isToday ? "今日" : `次回 ${dayLabel}`}</span>`;
  document.querySelector("#homeWorkoutDuration").innerHTML = `<span>◷</span> 約 ${selectedDuration}分`;
  document.querySelector("#homeExerciseList").innerHTML = visibleExercises.map((item, index) => `
    <div class="exercise-row">
      <div class="exercise-number">${String(index + 1).padStart(2, "0")}</div>
      <div class="exercise-name"><strong>${item.name}</strong><span>AI推奨メニュー</span></div>
      <div class="exercise-target"><small>重量</small><strong>${item.weight.replace("kg", "")} <em>${item.weight.includes("kg") ? "kg" : ""}</em></strong></div>
      <div class="exercise-target"><small>回数</small><strong>${item.reps}</strong></div>
      <div class="exercise-target"><small>RPE</small><strong>${item.rpe}</strong></div>
      <span class="exercise-status">${item.rest}</span>
    </div>
  `).join("") + `
    <div class="exercise-row exercise-more">
      <span>＋ ウォームアップ / クールダウン</span>
      <small>${session.exercises.length > 3 ? `ほか ${session.exercises.length - 3} 種目` : "AIプランに含まれています"}</small>
    </div>
  `;
  document.querySelector("#startWorkoutButton strong").textContent = isToday ? "今日のトレーニングを開始" : "次回メニューを確認";
  document.querySelector("#startWorkoutButton small").textContent = `${session.title}・約${selectedDuration}分`;
}

function generateAiProgram() {
  const splitNames = { full: "全身法", "2": "2分割", "3": "3分割", "5": "5分割" };
  const purposeNames = { general: "健康・ダイエット", bodybuilding: "ボディメイク", powerlifting: "パワーリフティング", athlete: "アスリート" };
  const rotations = { full: ["full"], "2": ["upper", "lower"], "3": ["push", "pull", "legs"], "5": ["chest", "back", "legs", "shoulders", "arms"] };
  const preferredDays = { 2: [1, 4], 3: [0, 2, 5], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
  const labels = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"];
  const templates = getSessionTemplates();
  const maxExercises = selectedDuration <= 30 ? 3 : selectedDuration <= 45 ? 4 : 5;
  const warmupMinutes = selectedDuration <= 45 ? 6 : 10;
  const cooldownMinutes = selectedDuration <= 45 ? 4 : 7;
  let rotationIndex = 0;
  const generatedSessions = [];
  const preference = document.querySelector("#aiPreference").value.trim();
  document.querySelector("#aiResultSummary").textContent = `週${selectedFrequency}回・1回${selectedDuration}分・${purposeNames[selectedPurpose]}・${splitNames[selectedSplit]}`;
  document.querySelector("#generatedWeek").innerHTML = preferredDays[selectedFrequency].map((dayIndex) => {
    const template = templates[rotations[selectedSplit][rotationIndex++ % rotations[selectedSplit].length]];
    const mainExercises = template.exercises.slice(0, maxExercises);
    generatedSessions.push({ dayIndex, title: template.title, exercises: mainExercises });
    return `
      <article class="generated-day">
        <div class="generated-day-header"><div><small>${labels[dayIndex]}</small><strong>${template.title}</strong></div><span>合計 約${selectedDuration}分</span></div>
        <div class="phase-block">
          <div class="phase-title"><span>1</span><strong>ウォームアップ</strong><small>約${warmupMinutes}分</small></div>
          ${renderExerciseDetails([
            exercise("軽い有酸素運動", "－", `${Math.max(3, warmupMinutes - 6)}分`, "3", "－"),
            exercise("キャット＆カウ", "自重", "8回", "3", "15秒"),
            exercise("ワールドグレイテストストレッチ", "自重", "5回 / 側", "3", "15秒"),
            exercise("バンドプルアパート", "軽負荷", "15回", "3", "30秒")
          ])}
        </div>
        <div class="phase-block">
          <div class="phase-title"><span>2</span><strong>メイントレーニング</strong><small>約${selectedDuration - warmupMinutes - cooldownMinutes}分</small></div>
          ${renderExerciseDetails(mainExercises)}
        </div>
        <div class="phase-block">
          <div class="phase-title"><span>3</span><strong>クールダウン</strong><small>約${cooldownMinutes}分</small></div>
          ${renderExerciseDetails([
            exercise("低強度ウォーク", "－", "3分", "2", "－"),
            exercise("使用部位の静的ストレッチ", "自重", `${Math.max(2, cooldownMinutes - 3)}分`, "2", "－")
          ])}
        </div>
      </article>
    `;
  }).join("");
  if (preference) {
    document.querySelector("#aiResultSummary").textContent += `・要望「${preference}」を考慮`;
  }
  const todayIndex = (new Date().getDay() + 6) % 7;
  let homeSession = generatedSessions.find((session) => session.dayIndex === todayIndex);
  let isToday = true;
  if (!homeSession) {
    isToday = false;
    homeSession = generatedSessions.find((session) => session.dayIndex > todayIndex) || generatedSessions[0];
  }
  updateHomeWorkout(homeSession, labels[homeSession.dayIndex], isToday);
  document.querySelector(".ai-wizard").style.display = "none";
  document.querySelector("#aiPlanResult").classList.add("active");
}

loadCustomExercises();
loadPerformanceData();
refreshProgressExerciseOptions();
renderExerciseOptions();
renderExerciseSettings();
renderEmptyState();
renderProgressTable();
updateProgressView();
renderPlanDay();
updateWeekTabs();
showWizardStep(1);
loadAnalysisSettings();
loadUserSettings();
renderVideoFolder();
checkAnalysisApi();
syncBig3SettingsInputs();
restoreSession();

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.closest(".password-field").querySelector("input");
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? "表示" : "隠す";
  });
});

document.querySelector("#openForgotPassword").addEventListener("click", () => {
  setAuthMode("forgot");
});

document.querySelectorAll("[data-next-registration]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextStep = Number(button.dataset.nextRegistration);
    if (registrationStep === 1 && !validateRegistrationStepOne()) return;
    showRegistrationStep(nextStep);
  });
});

document.querySelectorAll("[data-big3-none]").forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    const input = registerForm.elements[checkbox.dataset.big3None];
    input.disabled = checkbox.checked;
    input.required = !checkbox.checked;
    if (checkbox.checked) input.value = "";
  });
  const input = registerForm.elements[checkbox.dataset.big3None];
  input.required = true;
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector(".auth-submit");
  const error = document.querySelector("#loginError");
  const data = new FormData(loginForm);
  error.textContent = "";
  submit.disabled = true;
  submit.textContent = "ログイン中...";
  try {
    const user = await authRequest("login", {
      method: "POST",
      body: JSON.stringify({
        login_id: data.get("login_id"),
        password: data.get("password")
      })
    });
    applyAuthenticatedUser(user);
    loginForm.reset();
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "ログイン";
  }
});

forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = forgotPasswordForm.querySelector(".auth-submit");
  const message = document.querySelector("#forgotPasswordMessage");
  const email = new FormData(forgotPasswordForm).get("email");
  submit.disabled = true;
  message.textContent = "";
  try {
    const result = await authRequest("password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    message.classList.add("success");
    message.textContent = result.message;
  } catch (requestError) {
    message.classList.remove("success");
    message.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(resetPasswordForm);
  const message = document.querySelector("#resetPasswordMessage");
  if (data.get("password") !== data.get("password_confirm")) {
    message.textContent = "確認用パスワードが一致しません。";
    return;
  }
  const token = new URLSearchParams(window.location.search).get("reset_token");
  try {
    const result = await authRequest("password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password: data.get("password") })
    });
    message.classList.add("success");
    message.textContent = result.message;
    window.setTimeout(() => {
      history.replaceState({}, "", window.location.pathname);
      setAuthMode("login");
    }, 1400);
  } catch (requestError) {
    message.classList.remove("success");
    message.textContent = requestError.message;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = registerForm.querySelector(".auth-submit");
  const error = document.querySelector("#registerError");
  const data = new FormData(registerForm);
  error.textContent = "";
  if (data.get("password") !== data.get("password_confirm")) {
    error.textContent = "確認用パスワードが一致しません。";
    return;
  }
  const big3 = {};
  for (const field of ["bench_max", "squat_max", "deadlift_max"]) {
    const noRecord = registerForm.querySelector(`[data-big3-none="${field}"]`).checked;
    const value = Number(data.get(field));
    if (!noRecord && !(value > 0)) {
      error.textContent = "BIG3は重量を入力するか「記録なし」を選択してください。";
      return;
    }
    big3[field] = noRecord ? null : value;
  }
  submit.disabled = true;
  submit.textContent = "アカウント作成中...";
  try {
    const user = await authRequest("register", {
      method: "POST",
      body: JSON.stringify({
        login_id: data.get("login_id"),
        email: data.get("email"),
        password: data.get("password"),
        username: data.get("username"),
        birth_date: data.get("birth_date"),
        weight_kg: Number(data.get("weight_kg")),
        target_weight_kg: Number(data.get("target_weight_kg")) || null,
        goal_text: data.get("goal_text")?.trim() || null,
        purpose: data.get("purpose"),
        notifications: data.get("notifications") === "on",
        ...big3
      })
    });
    applyAuthenticatedUser(user);
    window.setTimeout(() => {
      registerForm.reset();
      showRegistrationStep(1);
    }, 0);
    showToast("会員登録が完了しました。");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "設定を保存してホームへ";
  }
});

if (new URLSearchParams(window.location.search).get("reset_token")) {
  setAuthMode("reset");
}

document.querySelector("#quickLogButton").addEventListener("click", () => {
  logDialog.showModal();
});

document.querySelector(".close-button").addEventListener("click", () => {
  resetHistoryDialogState();
  logDialog.close();
});

logDialog.addEventListener("cancel", resetHistoryDialogState);

big3SetupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(big3SetupForm);
  applyInitialBig3({
    benchMax: data.get("benchMax"),
    squatMax: data.get("squatMax"),
    deadliftMax: data.get("deadliftMax")
  }, true);
  big3SetupDialog.close();
  showToast("BIG3の開始重量を保存しました。");
});

document.querySelectorAll(".body-part").forEach((button) => {
  button.addEventListener("click", () => {
    const part = button.dataset.part;
    if (selectedBodyParts.has(part)) {
      if (selectedBodyParts.size === 1) {
        showToast("トレーニング部位を1つ以上選択してください。");
        return;
      }
      selectedBodyParts.delete(part);
      button.classList.remove("active");
    } else {
      selectedBodyParts.add(part);
      button.classList.add("active");
    }
    renderExerciseOptions();
  });
});

document.querySelector("#addExerciseButton").addEventListener("click", () => {
  const selectedOption = exerciseSelect.selectedOptions[0];
  addExerciseRecord(exerciseSelect.value, selectedOption?.dataset.part || [...selectedBodyParts][0]);
});

document.querySelector("#showCustomExercise").addEventListener("click", () => {
  customExercise.classList.add("show");
  document.querySelector("#customExercisePart").value = [...selectedBodyParts][0];
  document.querySelector("#customExerciseName").focus();
});

document.querySelector("#saveCustomExercise").addEventListener("click", () => {
  const input = document.querySelector("#customExerciseName");
  const name = input.value.trim();
  const customPart = document.querySelector("#customExercisePart").value;
  if (!name) {
    showToast("トレーニング名を入力してください。");
    input.focus();
    return;
  }
  if (!exercisesByPart[customPart].includes(name)) {
    exercisesByPart[customPart].push(name);
    saveCustomExerciseList();
  }
  selectedBodyParts.add(customPart);
  document.querySelector(`.body-part[data-part="${customPart}"]`)?.classList.add("active");
  renderExerciseOptions();
  exerciseSelect.value = name;
  addExerciseRecord(name, customPart);
  input.value = "";
  customExercise.classList.remove("show");
  showToast(`${name}を「${customPart}」の候補に追加・保存しました。`);
});

document.querySelector("#startWorkoutButton").addEventListener("click", () => {
  const workoutName = document.querySelector("#homeWorkoutTitle").childNodes[0].textContent.trim();
  const firstExercise = document.querySelector("#homeExerciseList .exercise-name strong")?.textContent || "最初の種目";
  showToast(`${workoutName} を開始しました。${firstExercise}から始めましょう。`);
  document.querySelector("#startWorkoutButton strong").textContent = "トレーニング中";
  document.querySelector("#startWorkoutButton small").textContent = `${firstExercise}・セット 1`;
});

document.querySelector("#acceptButton").addEventListener("click", (event) => {
  event.currentTarget.textContent = "採用済み";
  event.currentTarget.disabled = true;
  showToast("AIの提案を今日のメニューに反映しました。");
});

document.querySelector("#adjustButton").addEventListener("click", () => {
  showToast("調整画面は次の開発フェーズで追加予定です。");
});

logForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(logForm);
  const weight = Number(data.get("weight")).toFixed(1);
  const painParts = data.getAll("pain");
  const exerciseCount = exerciseRecords.querySelectorAll(".record-card").length;
  if (historyFormMode) {
    const targetDay = historyFormMode.targetDay;
    const sourceRecord = calendarRecords[historyFormMode.sourceDay];
    const exercises = collectHistoryExercisesFromForm();
    const parts = [...new Set(exercises.map((item) => item[3]))];
    calendarRecords[targetDay] = {
      title: historyFormMode.mode === "copy" ? `${sourceRecord.title} COPY` : sourceRecord.title,
      meta: `${parts.join(" / ")}・${historyFormMode.mode === "copy" ? "本日にコピー" : "編集済み"}`,
      exercises,
      note: historyFormMode.mode === "copy"
        ? `6月${historyFormMode.sourceDay}日の記録からコピーしました。`
        : "履歴画面から編集しました。"
    };
    updateCalendarDayButton(targetDay, calendarRecords[targetDay]);
    renderCalendarDetail(targetDay);
    historyFormMode = null;
    logDialog.querySelector(".history-editing-notice")?.remove();
    logDialog.querySelector(".dialog-header h2").textContent = "今日の記録";
  }
  document.querySelector("#currentWeight").innerHTML = `${weight}<span>kg</span>`;
  document.querySelector("#progressWeight").innerHTML = `${weight} <em>kg</em>`;
  document.querySelector("#aiCurrentWeight").textContent = `${weight}kg`;
  const updatedExercises = updatePerformanceFromLog();
  if (currentUser && updatedExercises.length) {
    localStorage.setItem(`aimusHasRecords:${currentUser.id}`, "true");
    renderHomeStartState();
  }
  logDialog.close();
  const painMessage = painParts.length ? `、痛み: ${painParts.join("・")}` : "";
  const performanceMessage = updatedExercises.length ? `、${updatedExercises.length}種目の進捗を更新` : "";
  showToast(`体重 ${weight}kg、${exerciseCount}種目を記録しました${performanceMessage}${painMessage}。`);
});

progressExerciseSelect.addEventListener("change", updateProgressView);

document.querySelector("#goalWeightInput").addEventListener("input", updateGoalDisplay);

document.querySelector("#saveGoalButton").addEventListener("click", () => {
  const data = progressData[progressExerciseSelect.value];
  data.goal = Number(document.querySelector("#goalWeightInput").value) || data.goal;
  renderProgressTable();
  updateGoalDisplay();
  showToast(`${data.name}の次の1RM目標を ${data.goal.toFixed(1)}kg に設定しました。`);
});

document.querySelectorAll(".chart-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".chart-tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    activeProgressMetric = tab.dataset.metric;
    renderPerformanceChart(progressData[progressExerciseSelect.value], activeProgressMetric);
  });
});

document.querySelectorAll("[data-menu-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-menu-mode]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector("#manualMenuPanel").classList.toggle("active", button.dataset.menuMode === "manual");
    document.querySelector("#aiMenuPanel").classList.toggle("active", button.dataset.menuMode === "ai");
  });
});

document.querySelectorAll(".week-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".week-tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    selectedPlanDay = tab.dataset.day;
    renderPlanDay();
  });
});

document.querySelector("#totalTrainingTime").addEventListener("input", (event) => {
  planDays[selectedPlanDay].time = Number(event.target.value);
  updateWeekTabs();
});

document.querySelector("#addDayExercise").addEventListener("click", () => {
  planDays[selectedPlanDay].exercises.push({ name: "ベンチプレス", weight: 0, reps: 10, rpe: 8, rest: 120 });
  renderPlanDay();
  updateWeekTabs();
});

document.querySelectorAll("[data-frequency]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-frequency]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedFrequency = Number(button.dataset.frequency);
  });
});

document.querySelectorAll("[data-split]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-split]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedSplit = button.dataset.split;
  });
});

document.querySelectorAll("[data-duration]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-duration]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedDuration = Number(button.dataset.duration);
  });
});

document.querySelectorAll("[data-purpose]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-purpose]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedPurpose = button.dataset.purpose;
  });
});

document.querySelector("#wizardNext").addEventListener("click", () => showWizardStep(wizardStep + 1));
document.querySelector("#wizardBack").addEventListener("click", () => showWizardStep(wizardStep - 1));

document.querySelectorAll("[data-wizard-nav]").forEach((button) => {
  button.addEventListener("click", () => showWizardStep(Number(button.dataset.wizardNav)));
});

document.querySelector("#generateAiPlan").addEventListener("click", () => {
  generateAiProgram();
  showToast("現在の記録をもとにAIメニューを作成しました。");
});

document.querySelector("#editAiConditions").addEventListener("click", () => {
  document.querySelector("#aiPlanResult").classList.remove("active");
  document.querySelector(".ai-wizard").style.display = "block";
  showWizardStep(1);
});

document.querySelector("#saveWeeklyPlan").addEventListener("click", () => {
  const manualMode = document.querySelector('[data-menu-mode="manual"]').classList.contains("active");
  if (manualMode) {
    const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const todayIndex = (new Date().getDay() + 6) % 7;
    const scheduled = keys
      .map((key, index) => ({ key, index, ...planDays[key] }))
      .filter((day) => day.exercises.length);
    let target = scheduled.find((day) => day.index === todayIndex);
    let isToday = true;
    if (!target && scheduled.length) {
      isToday = false;
      target = scheduled.find((day) => day.index > todayIndex) || scheduled[0];
    }
    if (target) {
      const session = {
        title: `${target.short}曜日のメニュー`,
        exercises: target.exercises.map((item) => ({
          name: item.name,
          weight: item.weight ? `${item.weight}kg` : "未設定",
          reps: item.reps || "未設定",
          rpe: item.rpe || "未設定",
          rest: item.rest ? `${item.rest}秒` : "未設定"
        }))
      };
      const previousDuration = selectedDuration;
      selectedDuration = target.time || 60;
      updateHomeWorkout(session, `${target.short}曜日`, isToday);
      selectedDuration = previousDuration;
      showToast("週間メニューを保存し、ホームへ反映しました。");
    } else {
      showToast("種目を追加してから週間メニューを保存してください。");
    }
  } else {
    showToast("AIメニューを作成するとホームへ自動反映されます。");
  }
});

function openPage(pageName) {
  const pages = {
    dashboard: dashboardPage,
    calendar: calendarPage,
    progress: progressPage,
    plan: planPage,
    recovery: recoveryPage,
    coach: coachPage,
    settings: settingsPage
  };
  document.querySelectorAll(".page-view").forEach((page) => page.classList.remove("active"));
  pages[pageName]?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((nav) => {
    nav.classList.toggle("active", nav.dataset.page === pageName);
  });
  document.querySelectorAll("[data-mobile-page]").forEach((nav) => {
    nav.classList.toggle("active", nav.dataset.mobilePage === pageName);
  });
  const activeNav = document.querySelector(`.nav-item[data-page="${pageName}"] span:last-child`);
  document.querySelector(".breadcrumb strong").textContent = activeNav?.textContent || "ホーム";
  sidebar.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    openPage(item.dataset.page);
  });
});

document.querySelectorAll("[data-open-page]").forEach((button) => {
  button.addEventListener("click", () => openPage(button.dataset.openPage));
});

document.querySelectorAll("[data-video-folder]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-video-folder]").forEach((item) => {
      item.classList.remove("active");
      const status = item.querySelector(":scope > span");
      if (status) status.textContent = "選択";
    });
    button.classList.add("active");
    const selectedStatus = button.querySelector(":scope > span");
    if (selectedStatus) selectedStatus.textContent = "選択中";
    selectedVideoFolder = button.dataset.videoFolder;
    renderVideoFolder();
  });
});

document.querySelector("#homeQuickLog")?.addEventListener("click", () => logDialog.showModal());

document.querySelector("[data-empty-action='record']")?.addEventListener("click", () => {
  logDialog.showModal();
});

document.querySelector("[data-empty-action='plan']")?.addEventListener("click", () => {
  openPage("plan");
});

document.querySelector("#homeRmShortcut")?.addEventListener("click", () => {
  document.querySelector(".rm-calculator")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelectorAll("[data-mobile-page]").forEach((button) => {
  button.addEventListener("click", () => openPage(button.dataset.mobilePage));
});

document.querySelector("[data-mobile-action='record']")?.addEventListener("click", () => {
  logDialog.showModal();
});

document.querySelector("#trainingVideoInput").addEventListener("change", (event) => {
  const files = [...event.target.files];
  videoLibrary[selectedVideoFolder].push(...files.map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type,
    rawFile: file,
    weightKg: null,
    rpe: null,
    cameraAngle: "side"
  })));
  renderVideoFolder();
  event.target.value = "";
  showToast(`${liftNames[selectedVideoFolder]}フォルダへ ${files.length} 本追加しました。`);
});

document.querySelector("#analysisProfile").addEventListener("change", (event) => {
  analysisSettings.profile = event.target.value;
  document.querySelector("#defaultAnalysisProfile").value = event.target.value;
  saveAnalysisSettings();
  renderProfileDescription();
});

document.querySelectorAll("[data-settings-target]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-settings-target]").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll("[data-settings-section]").forEach((section) => section.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`[data-settings-section="${button.dataset.settingsTarget}"]`).classList.add("active");
  });
});

document.querySelector("#exerciseSettingsFilter")?.addEventListener("change", renderExerciseSettings);

document.querySelector("#exerciseSettingsList")?.addEventListener("click", (event) => {
  const saveButton = event.target.closest(".save-exercise-setting");
  if (!saveButton) return;
  saveExerciseSetting(saveButton.closest(".exercise-setting-row"));
});

document.querySelector("#defaultAnalysisProfile").addEventListener("change", (event) => {
  analysisSettings.profile = event.target.value;
  document.querySelector("#analysisProfile").value = event.target.value;
  renderProfileDescription();
  saveAnalysisSettings();
});

document.querySelectorAll('input[name="applyMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    analysisSettings.applyMode = document.querySelector('input[name="applyMode"]:checked').value;
    document.querySelector("#autoApplyToggle").checked = analysisSettings.applyMode === "auto";
    saveAnalysisSettings();
  });
});

document.querySelector("#autoApplyToggle").addEventListener("change", (event) => {
  analysisSettings.applyMode = event.target.checked ? "auto" : "manual";
  document.querySelector(`input[name="applyMode"][value="${analysisSettings.applyMode}"]`).checked = true;
  saveAnalysisSettings();
});

document.querySelector("#manualApplyEnabled").addEventListener("change", (event) => {
  analysisSettings.manualEnabled = event.target.checked;
  saveAnalysisSettings();
});

document.querySelector("#askEveryAnalysis").addEventListener("change", (event) => {
  analysisSettings.askEveryTime = event.target.checked;
  saveAnalysisSettings();
});

document.querySelector("#saveProfileSettings").addEventListener("click", async () => {
  const username = document.querySelector("#settingsUsername").value.trim();
  const birthDate = document.querySelector("#settingsBirthday").value;
  if (!username || !birthDate) {
    showToast("ユーザーネームと生年月日を入力してください。");
    return;
  }
  try {
    const user = await authRequest("profile", {
      method: "PATCH",
      body: JSON.stringify({ username, birth_date: birthDate })
    });
    currentUser = user;
    userSettings.username = user.username;
    userSettings.birthday = user.birth_date || "";
    document.querySelector(".welcome h1").innerHTML = `今日も積み上げよう、<span>${escapeHtml(user.username)}。</span>`;
    document.querySelector(".profile-copy strong").textContent = user.username;
    applyInitialBig3({
      benchMax: document.querySelector("#settingsBenchMax").value,
      squatMax: document.querySelector("#settingsSquatMax").value,
      deadliftMax: document.querySelector("#settingsDeadliftMax").value
    });
    saveUserSettings();
    showToast("プロフィールを保存しました。");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#saveLoginId").addEventListener("click", async () => {
  const loginId = document.querySelector("#settingsLoginId").value.trim();
  const currentPassword = document.querySelector("#loginIdCurrentPassword").value;
  if (!loginId || !currentPassword) {
    showToast("新しいIDと現在のパスワードを入力してください。");
    return;
  }
  try {
    const user = await authRequest("login-id", {
      method: "PATCH",
      body: JSON.stringify({
        login_id: loginId,
        current_password: currentPassword
      })
    });
    currentUser = user;
    document.querySelector("#loginIdCurrentPassword").value = "";
    showToast(`ログインIDを ${user.login_id} に変更しました。`);
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#savePassword").addEventListener("click", async () => {
  const currentPassword = document.querySelector("#currentPassword").value;
  const newPassword = document.querySelector("#newPassword").value;
  const confirmation = document.querySelector("#newPasswordConfirm").value;
  if (newPassword !== confirmation) {
    showToast("新しいパスワードが一致しません。");
    return;
  }
  if (!currentPassword || newPassword.length < 8) {
    showToast("現在のパスワードと8文字以上の新しいパスワードを入力してください。");
    return;
  }
  try {
    await authRequest("password", {
      method: "PATCH",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });
    ["#currentPassword", "#newPassword", "#newPasswordConfirm"].forEach((selector) => {
      document.querySelector(selector).value = "";
    });
    currentUser = null;
    showAuthGate("login");
    showToast("パスワードを変更しました。新しいパスワードでログインしてください。");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  const button = document.querySelector("#logoutButton");
  button.disabled = true;
  button.textContent = "ログアウト中...";
  try {
    await authRequest("logout", { method: "POST" });
  } catch {
    // The local app should still return to the login screen if the session already expired.
  } finally {
    currentUser = null;
    showAuthGate("login");
    button.disabled = false;
    button.textContent = "ログアウト";
    showToast("ログアウトしました。");
  }
});

document.querySelector("#notificationMaster").addEventListener("change", (event) => {
  userSettings.notifications = event.target.checked;
  updateNotificationControls();
  saveUserSettings();
});

[
  ["#notifyAnalysis", "notifyAnalysis"],
  ["#notifyMenu", "notifyMenu"],
  ["#notifyForm", "notifyForm"]
].forEach(([selector, key]) => {
  document.querySelector(selector).addEventListener("change", (event) => {
    userSettings[key] = event.target.checked;
    saveUserSettings();
  });
});

function updateRmCalculator() {
  const weight = Math.max(0, Number(document.querySelector("#rmWeightInput").value) || 0);
  const reps = Math.max(1, Number(document.querySelector("#rmRepsInput").value) || 1);
  const estimatedRm = reps === 1 ? weight : weight * (1 + reps / 30);
  document.querySelector("#rmResult").innerHTML = `${estimatedRm.toFixed(1)} <span>kg</span>`;
  document.querySelector("#rmEightyResult").innerHTML = `${(estimatedRm * 0.8).toFixed(1)} <span>kg</span>`;
}

document.querySelector("#rmWeightInput").addEventListener("input", updateRmCalculator);
document.querySelector("#rmRepsInput").addEventListener("input", updateRmCalculator);
updateRmCalculator();

const calendarRecords = {};

function updateCalendarDayButton(day, record) {
  const button = [...document.querySelectorAll("#trainingCalendar button:not(.outside)")].find(
    (item) => item.querySelector("b")?.textContent === String(day)
  );
  if (!button) return;
  button.dataset.calendarDay = day;
  button.classList.remove("planned");
  button.classList.add("trained");
  let label = button.querySelector("span");
  if (!label) {
    label = document.createElement("span");
    button.appendChild(label);
  }
  label.textContent = record.title;
}

function renderCalendarDetail(day, shouldScroll = false) {
  const record = calendarRecords[day];
  if (!record) return;
  document.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.calendarDay === String(day));
  });
  const detail = document.querySelector("#calendarDetail");
  detail.innerHTML = `
    <p class="eyebrow">JUNE ${escapeHtml(String(day))}</p>
    <h2>${escapeHtml(record.title)}</h2>
    <p class="detail-meta">${escapeHtml(record.meta)}</p>
    ${record.exercises.map((item) => `<div class="history-exercise"><strong>${escapeHtml(item[0])}</strong><span>${escapeHtml(item[1])}</span><b>${escapeHtml(item[2])}</b></div>`).join("")}
    <div class="history-note"><small>メモ</small><p>${escapeHtml(record.note || "記録をもとに次回の負荷をAIが調整します。")}</p></div>
    <div class="history-actions">
      <button type="button" data-history-edit="${escapeHtml(String(day))}">記録を編集</button>
      <button type="button" class="primary" data-history-copy="${escapeHtml(String(day))}">本日にコピー</button>
    </div>
  `;
  if (shouldScroll) detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelector("#trainingCalendar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-day]");
  if (!button || !calendarRecords[button.dataset.calendarDay]) return;
  renderCalendarDetail(button.dataset.calendarDay, true);
});

document.querySelector("#calendarDetail").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-history-edit]");
  const copyButton = event.target.closest("[data-history-copy]");
  if (editButton) populateLogFromHistory(calendarRecords[editButton.dataset.historyEdit], "edit", editButton.dataset.historyEdit);
  if (copyButton) populateLogFromHistory(calendarRecords[copyButton.dataset.historyCopy], "copy", copyButton.dataset.historyCopy);
});

renderCalendarDetail("9");

document.querySelector("#openPainLog").addEventListener("click", () => logDialog.showModal());

document.querySelector(".mobile-menu").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.addEventListener("click", (event) => {
  if (window.innerWidth <= 760 && sidebar.classList.contains("open") &&
      !sidebar.contains(event.target) && !event.target.closest(".mobile-menu")) {
    sidebar.classList.remove("open");
  }
});
