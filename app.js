const WARMUP_SECONDS = 15 * 60;
const STORAGE_KEY = "run-companion-state-v1";
const SOUND_KEY = "run-companion-sound-v1";

const phases = [
  {
    type: "warmup",
    label: "快走热身",
    target: WARMUP_SECONDS,
    unit: "time",
    coach: "肩膀放松，先把身体叫醒。",
    cue: "warmup_start",
    speech: "出发啦。先快走十五分钟去公园。肩膀放松，我们慢慢来。",
  },
];

for (let round = 1; round <= 5; round += 1) {
  phases.push({
    type: "run",
    label: `第 ${round} 组 · 跑`,
    target: 400,
    unit: "distance",
    round,
    coach: "步子放轻，保持你能控制的速度。",
    cue: `run_${round}`,
    speech: `第${round}组开始，跑四百米。不要冲，找到舒服稳定的节奏。`,
  });
  phases.push({
    type: "walk",
    label: `第 ${round} 组 · 走`,
    target: 200,
    unit: "distance",
    round,
    coach: "很好，继续走动，让呼吸慢下来。",
    cue: `walk_${round}`,
    speech: `第${round}组跑完了。现在走两百米，慢慢把呼吸找回来。`,
  });
}

phases.push({
  type: "cooldown",
  label: "慢走回家",
  target: null,
  unit: "open",
  coach: "今天的训练完成了。慢慢走回家吧。",
  cue: "cooldown_start",
  speech: "五组全部完成。你做到了。现在慢慢走回家，好好放松。",
});

const els = {
  setupScreen: document.querySelector("#setupScreen"),
  workoutScreen: document.querySelector("#workoutScreen"),
  finishScreen: document.querySelector("#finishScreen"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  nextButton: document.querySelector("#nextButton"),
  resetButton: document.querySelector("#resetButton"),
  againButton: document.querySelector("#againButton"),
  soundButton: document.querySelector("#soundButton"),
  soundToggle: document.querySelector("#soundToggle"),
  voiceStatus: document.querySelector("#voiceStatus"),
  gpsDot: document.querySelector("#gpsDot"),
  gpsStatus: document.querySelector("#gpsStatus"),
  roundStatus: document.querySelector("#roundStatus"),
  progressCard: document.querySelector("#progressCard"),
  phaseLabel: document.querySelector("#phaseLabel"),
  metricValue: document.querySelector("#metricValue"),
  metricUnit: document.querySelector("#metricUnit"),
  progressFill: document.querySelector("#progressFill"),
  coachLine: document.querySelector("#coachLine"),
  totalDistance: document.querySelector("#totalDistance"),
  elapsedTime: document.querySelector("#elapsedTime"),
  completedRounds: document.querySelector("#completedRounds"),
  finishDistance: document.querySelector("#finishDistance"),
  finishTime: document.querySelector("#finishTime"),
  cuePlayer: document.querySelector("#cuePlayer"),
  toast: document.querySelector("#toast"),
};

let state = freshState();
let geoWatchId = null;
let wakeLock = null;
let voicePack = null;
let toastTimer = null;

function freshState() {
  return {
    status: "idle",
    phaseIndex: 0,
    phaseElapsedMs: 0,
    totalElapsedMs: 0,
    activeSince: null,
    phaseDistance: 0,
    totalDistance: 0,
    completedRounds: 0,
    announced: [],
    lastPosition: null,
    gps: {
      status: "waiting",
      accuracy: null,
    },
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Number.isInteger(stored.phaseIndex) || !phases[stored.phaseIndex]) {
      return;
    }

    state = { ...freshState(), ...stored, gps: { ...freshState().gps, ...stored.gps } };
    state.lastPosition = null;
    if (state.status === "active") {
      state.status = "paused";
      state.activeSince = null;
      showToast("上次训练已恢复在暂停状态，准备好再继续。");
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  if (state.status === "idle" || state.status === "finished") {
    return;
  }
  const snapshot = {
    ...state,
    phaseElapsedMs: currentPhaseElapsedMs(),
    totalElapsedMs: currentTotalElapsedMs(),
    activeSince: state.status === "active" ? Date.now() : null,
    lastPosition: null,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function setSoundEnabled(enabled) {
  localStorage.setItem(SOUND_KEY, enabled ? "true" : "false");
  els.soundToggle.checked = enabled;
  els.soundButton.classList.toggle("is-muted", !enabled);
  els.soundButton.setAttribute("aria-label", enabled ? "关闭语音" : "打开语音");
  if (!enabled) {
    window.speechSynthesis?.cancel();
    els.cuePlayer.pause();
  }
}

function isSoundEnabled() {
  return localStorage.getItem(SOUND_KEY) !== "false";
}

async function loadVoicePack() {
  try {
    const response = await fetch("./audio/voice-pack.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("No custom voice pack");
    }
    const pack = await response.json();
    if (!pack?.cues || typeof pack.cues !== "object") {
      throw new Error("Invalid custom voice pack");
    }
    voicePack = pack;
    els.voiceStatus.textContent = pack.name || "使用 ElevenLabs 自定义语音";
  } catch {
    voicePack = null;
    els.voiceStatus.textContent = "使用手机自带中文语音";
  }
}

async function speakCue(cueId, fallbackText) {
  if (!isSoundEnabled()) {
    return;
  }

  const customFile = voicePack?.cues?.[cueId];
  if (customFile) {
    try {
      window.speechSynthesis?.cancel();
      els.cuePlayer.pause();
      els.cuePlayer.src = new URL(customFile, window.location.href).href;
      els.cuePlayer.currentTime = 0;
      await els.cuePlayer.play();
      return;
    } catch {
      showToast("自定义语音暂时无法播放，已换用手机语音。");
    }
  }

  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(fallbackText);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice =
    voices.find((voice) => voice.lang.toLowerCase() === "zh-cn") ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ||
    null;
  utterance.lang = "zh-CN";
  utterance.rate = 0.94;
  utterance.pitch = 1.02;
  window.speechSynthesis.speak(utterance);
}

function showScreen(name) {
  els.setupScreen.classList.toggle("hidden", name !== "setup");
  els.workoutScreen.classList.toggle("hidden", name !== "workout");
  els.finishScreen.classList.toggle("hidden", name !== "finish");
}

function startWorkout() {
  state = freshState();
  state.status = "active";
  state.activeSince = Date.now();
  localStorage.removeItem(STORAGE_KEY);
  showScreen("workout");
  speakCue(phases[0].cue, phases[0].speech);
  requestWakeLock();
  startGeolocation();
  saveState();
  render();
}

function pauseWorkout() {
  if (state.status === "active") {
    settleActiveTime();
    state.status = "paused";
    state.activeSince = null;
    state.lastPosition = null;
    stopGeolocation();
    releaseWakeLock();
    speakCue("paused", "已经暂停。慢慢来，准备好了再继续。");
  } else if (state.status === "paused") {
    state.status = "active";
    state.activeSince = Date.now();
    startGeolocation();
    requestWakeLock();
    speakCue("resumed", "继续啦。按自己的节奏来。");
  }
  saveState();
  render();
}

function settleActiveTime() {
  if (state.status !== "active" || !state.activeSince) {
    return;
  }
  const delta = Math.max(0, Date.now() - state.activeSince);
  state.phaseElapsedMs += delta;
  state.totalElapsedMs += delta;
  state.activeSince = Date.now();
}

function currentPhaseElapsedMs() {
  if (state.status !== "active" || !state.activeSince) {
    return state.phaseElapsedMs;
  }
  return state.phaseElapsedMs + Math.max(0, Date.now() - state.activeSince);
}

function currentTotalElapsedMs() {
  if (state.status !== "active" || !state.activeSince) {
    return state.totalElapsedMs;
  }
  return state.totalElapsedMs + Math.max(0, Date.now() - state.activeSince);
}

function advancePhase() {
  if (state.status !== "active" && state.status !== "paused") {
    return;
  }

  if (state.status === "active") {
    settleActiveTime();
  }

  const oldPhase = phases[state.phaseIndex];
  if (oldPhase.type === "walk") {
    state.completedRounds = Math.max(state.completedRounds, oldPhase.round);
  }

  if (oldPhase.type === "cooldown") {
    finishWorkout();
    return;
  }

  state.phaseIndex += 1;
  state.phaseElapsedMs = 0;
  state.phaseDistance = 0;
  state.lastPosition = null;
  state.announced = [];
  if (state.status === "active") {
    state.activeSince = Date.now();
  }

  const newPhase = phases[state.phaseIndex];
  speakCue(newPhase.cue, newPhase.speech);
  saveState();
  render();
}

function finishWorkout() {
  if (state.status === "active") {
    settleActiveTime();
  }
  state.status = "finished";
  state.activeSince = null;
  stopGeolocation();
  releaseWakeLock();
  localStorage.removeItem(STORAGE_KEY);
  speakCue("finished", "到家啦。今天的训练完成。你真的很棒，现在好好休息。");
  render();
}

function resetWorkout() {
  const confirmed = window.confirm("确定结束并清空这次训练吗？");
  if (!confirmed) {
    return;
  }
  stopGeolocation();
  releaseWakeLock();
  window.speechSynthesis?.cancel();
  els.cuePlayer.pause();
  localStorage.removeItem(STORAGE_KEY);
  state = freshState();
  render();
}

function checkMilestones() {
  if (state.status !== "active") {
    return;
  }

  const phase = phases[state.phaseIndex];
  if (phase.type === "warmup") {
    const elapsedSeconds = currentPhaseElapsedMs() / 1000;
    announceOnce(
      "warmup_halfway",
      elapsedSeconds >= WARMUP_SECONDS / 2,
      "已经走一半啦。身体是不是慢慢暖起来了？保持轻快。",
    );
    announceOnce(
      "warmup_one_minute",
      elapsedSeconds >= WARMUP_SECONDS - 60,
      "还有一分钟到公园。看看周围，准备开始第一组。",
    );
    if (elapsedSeconds >= WARMUP_SECONDS) {
      advancePhase();
    }
    return;
  }

  if (phase.unit === "distance") {
    const halfwayCue = phase.type === "run" ? "run_halfway" : "walk_halfway";
    const lastCue = phase.type === "run" ? "run_last_50" : "walk_last_50";
    const halfwayText =
      phase.type === "run"
        ? "这一段过半了。很好，稳住这个节奏。"
        : "走过一半了。深呼吸，让心跳慢慢下来。";
    const lastText =
      phase.type === "run"
        ? "还剩五十米。保持动作，不需要冲刺。"
        : "还剩五十米，准备开始下一段。";

    announceOnce(halfwayCue, state.phaseDistance >= phase.target / 2, halfwayText);
    announceOnce(lastCue, state.phaseDistance >= phase.target - 50, lastText);
    if (state.phaseDistance >= phase.target) {
      advancePhase();
    }
  }
}

function announceOnce(id, condition, text) {
  if (!condition || state.announced.includes(id)) {
    return;
  }
  state.announced.push(id);
  speakCue(id, text);
  saveState();
}

function startGeolocation() {
  if (!("geolocation" in navigator) || geoWatchId !== null) {
    if (!("geolocation" in navigator)) {
      state.gps.status = "unsupported";
      renderGps();
    }
    return;
  }

  state.gps.status = "waiting";
  renderGps();
  geoWatchId = navigator.geolocation.watchPosition(
    handlePosition,
    handlePositionError,
    {
      enableHighAccuracy: true,
      maximumAge: 1500,
      timeout: 15000,
    },
  );
}

function stopGeolocation() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  state.lastPosition = null;
}

function handlePosition(position) {
  const point = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp || Date.now(),
  };

  state.gps.status = point.accuracy <= 35 ? "good" : "weak";
  state.gps.accuracy = Math.round(point.accuracy);

  const phase = phases[state.phaseIndex];
  if (state.status !== "active") {
    state.lastPosition = point;
    renderGps();
    return;
  }

  if (!state.lastPosition) {
    state.lastPosition = point;
    renderGps();
    return;
  }

  const previous = state.lastPosition;
  state.lastPosition = point;

  if (point.accuracy > 65 || previous.accuracy > 65) {
    renderGps();
    return;
  }

  const step = haversineMeters(previous, point);
  const seconds = Math.max(0.5, (point.timestamp - previous.timestamp) / 1000);
  const noiseFloor = Math.max(2, Math.min(point.accuracy, previous.accuracy) * 0.12);
  const plausibleMaximum = Math.max(28, seconds * 8.5);

  if (step < noiseFloor || step > plausibleMaximum) {
    renderGps();
    return;
  }

  state.totalDistance += step;
  if (phase.unit === "distance") {
    state.phaseDistance += step;
    checkMilestones();
  }
  saveState();
  render();
}

function handlePositionError(error) {
  state.lastPosition = null;
  if (error.code === error.PERMISSION_DENIED) {
    state.gps.status = "denied";
    stopGeolocation();
    showToast("定位没有开启。你仍然可以用“完成本段”手动陪跑。");
  } else if (error.code === error.TIMEOUT) {
    state.gps.status = "weak";
  } else {
    state.gps.status = "error";
  }
  renderGps();
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") {
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) {
    return;
  }
  try {
    await wakeLock.release();
  } catch {
    // The browser may have already released it when the page was hidden.
  }
  wakeLock = null;
}

function render() {
  if (state.status === "idle") {
    showScreen("setup");
    return;
  }

  if (state.status === "finished") {
    showScreen("finish");
    els.finishDistance.textContent = (state.totalDistance / 1000).toFixed(2);
    els.finishTime.textContent = formatClock(Math.floor(state.totalElapsedMs / 1000));
    return;
  }

  showScreen("workout");
  const phase = phases[state.phaseIndex];
  els.phaseLabel.textContent = phase.label;
  els.coachLine.textContent =
    state.status === "paused" ? "已经暂停。准备好了，我们再继续。" : phase.coach;
  els.progressCard.className = `progress-card phase-${phase.type}`;
  els.pauseButton.textContent = state.status === "paused" ? "继续" : "暂停";

  if (phase.type === "warmup") {
    const elapsed = currentPhaseElapsedMs() / 1000;
    const remaining = Math.max(0, Math.ceil(WARMUP_SECONDS - elapsed));
    els.metricValue.textContent = formatClock(remaining);
    els.metricUnit.textContent = "剩余";
    els.progressFill.style.width = `${Math.min(100, (elapsed / WARMUP_SECONDS) * 100)}%`;
    els.nextButton.textContent = "我已到公园";
  } else if (phase.unit === "distance") {
    const remaining = Math.max(0, Math.ceil(phase.target - state.phaseDistance));
    els.metricValue.textContent = String(remaining);
    els.metricUnit.textContent = "米";
    els.progressFill.style.width = `${Math.min(100, (state.phaseDistance / phase.target) * 100)}%`;
    els.nextButton.textContent = "手动完成本段";
  } else {
    els.metricValue.textContent = "回家";
    els.metricUnit.textContent = "";
    els.progressFill.style.width = "100%";
    els.nextButton.textContent = "我到家了";
  }

  els.totalDistance.textContent = (state.totalDistance / 1000).toFixed(2);
  els.elapsedTime.textContent = formatClock(Math.floor(currentTotalElapsedMs() / 1000));
  els.completedRounds.textContent = `${state.completedRounds} / 5`;
  els.roundStatus.textContent =
    phase.type === "warmup"
      ? "热身"
      : phase.type === "cooldown"
        ? "放松"
        : `第 ${phase.round} / 5 组`;
  renderGps();
}

function renderGps() {
  const messages = {
    waiting: "正在寻找 GPS",
    good: `GPS 良好${state.gps.accuracy ? ` · ±${state.gps.accuracy}米` : ""}`,
    weak: `GPS 较弱${state.gps.accuracy ? ` · ±${state.gps.accuracy}米` : ""}`,
    denied: "定位未开启 · 可手动",
    unsupported: "此浏览器不支持定位",
    error: "暂时无法定位 · 可手动",
  };
  els.gpsStatus.textContent = messages[state.gps.status] || messages.waiting;
  els.gpsDot.classList.toggle("is-good", state.gps.status === "good");
  els.gpsDot.classList.toggle(
    "is-bad",
    ["denied", "unsupported", "error"].includes(state.gps.status),
  );
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 3500);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // The app still works online if service worker registration is unavailable.
      });
    });
  }
}

els.startButton.addEventListener("click", startWorkout);
els.pauseButton.addEventListener("click", pauseWorkout);
els.nextButton.addEventListener("click", advancePhase);
els.resetButton.addEventListener("click", resetWorkout);
els.againButton.addEventListener("click", () => {
  state = freshState();
  render();
});
els.soundToggle.addEventListener("change", (event) => {
  setSoundEnabled(event.target.checked);
});
els.soundButton.addEventListener("click", () => {
  setSoundEnabled(!isSoundEnabled());
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.status === "active") {
    requestWakeLock();
    checkMilestones();
    render();
  }
});

window.addEventListener("beforeunload", () => {
  if (state.status === "active") {
    settleActiveTime();
  }
  saveState();
});

setInterval(() => {
  if (state.status !== "active") {
    return;
  }
  checkMilestones();
  render();
  saveState();
}, 1000);

setSoundEnabled(isSoundEnabled());
loadState();
loadVoicePack();
registerServiceWorker();
render();
