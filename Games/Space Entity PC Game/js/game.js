/* =====================================================================
   SPACE ENTITY — game logic
   ===================================================================== */
(function () {
  "use strict";
 
  /* ---------- Config ---------- */
  const GAMEPLAY_LINKS = [
    "https://my.galacean.com/6aeccd51-f5ff-4fd3-a4e6-a5fd3de5f325",
    "https://my.galacean.com/916e6c66-7dc3-47e2-9d54-80c6237b7909",
    "https://my.galacean.com/41da96ea-b75d-402c-b641-12354e29544c",
    "https://my.galacean.com/b090a29b-380f-455a-aea1-bb3f93325b93"
  ];
  const MISSION_TITLES = [
    "Mission 1 — Planetary Settlement",
    "Mission 2 — The Alien Complex",
    "Mission 3 — Hull Repairs",
    "Mission 4 — Last Stand"
  ];
  // 5400 seconds = 90 minutes of play required per mission.
  // Override for testing via ?seconds=N in the URL.
  const params = new URLSearchParams(location.search);
  const MISSION_SECONDS = parseInt(params.get("seconds"), 10) || 5400;
 
  const USERS_KEY = "spaceEntity_users";
  const SESSION_KEY = "spaceEntity_session";
 
  /* ---------- DOM ---------- */
  const $ = (sel) => document.querySelector(sel);
  const pages = {
    page1: $("#page1"),
    page2: $("#page2"),
    page3: $("#page3")
  };
 
  /* =================================================================
     PAGE NAVIGATION (links to change pages on all pages)
     ================================================================= */
  function showPage(id) {
    Object.values(pages).forEach((p) => p.classList.remove("active"));
    if (pages[id]) pages[id].classList.add("active");
    window.scrollTo(0, 0);
 
    // Side effects when entering a page
    if (id === "page2") onEnterPage2();
    if (id === "page3") renderMissions();
  }
 
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(el.getAttribute("data-page"));
    });
  });
  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => showPage(el.getAttribute("data-goto")));
  });
 
  /* =================================================================
     AUTH — Game ID sign up / sign in / save progress
     ================================================================= */
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
 
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }
  function setSession(id) { localStorage.setItem(SESSION_KEY, JSON.stringify(id)); }
 
  function defaultProgress() {
    return { completed: [false, false, false, false], unlockedUpTo: 0 };
  }
 
  function authMsg(text, ok) {
    const el = $("#authMsg");
    el.textContent = text;
    el.className = "auth-msg " + (ok ? "ok" : "err");
  }
 
  function refreshAccountStatus() {
    const sess = getSession();
    const el = $("#accountStatus");
    if (sess) {
      const users = loadUsers();
      const prog = (users[sess] && users[sess].progress) || defaultProgress();
      const done = prog.completed.filter(Boolean).length;
      el.textContent = "👤 " + sess + " · " + done + "/4 saved";
    } else {
      el.textContent = "Not signed in";
    }
  }
 
  $("#signupBtn").addEventListener("click", () => {
    const id = $("#signupId").value.trim();
    const pass = $("#signupPass").value;
    if (!id || !pass) return authMsg("Game ID and password are required.", false);
    const users = loadUsers();
    if (users[id]) return authMsg("That Game ID already exists. Try signing in.", false);
    users[id] = { password: pass, progress: defaultProgress() };
    saveUsers(users);
    setSession(id);
    authMsg("Account created and signed in as " + id + ". Progress will be saved.", true);
    refreshAccountStatus();
  });
 
  $("#signinBtn").addEventListener("click", () => {
    const id = $("#signinId").value.trim();
    const pass = $("#signinPass").value;
    const users = loadUsers();
    if (!users[id]) return authMsg("No account found with that Game ID.", false);
    if (users[id].password !== pass) return authMsg("Incorrect password.", false);
    setSession(id);
    authMsg("Welcome back, " + id + "!", true);
    refreshAccountStatus();
  });
 
  $("#signoutBtn").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    authMsg("Signed out.", true);
    refreshAccountStatus();
  });
 
  // Persist progress for the current Game ID
  function saveProgress(progress) {
    const sess = getSession();
    if (!sess) return;
    const users = loadUsers();
    if (!users[sess]) users[sess] = { password: "", progress: defaultProgress() };
    users[sess].progress = progress;
    saveUsers(users);
    refreshAccountStatus();
  }
 
  function loadProgress() {
    const sess = getSession();
    if (!sess) return defaultProgress();
    const users = loadUsers();
    return (users[sess] && users[sess].progress) || defaultProgress();
  }
 
  /* =================================================================
     PAGE 2 — Intro video (fullscreen + cropped 800x600)
     ================================================================= */
  const video = $("#introVideo");
 
  function onEnterPage2() {
    // Auto-play (muted to satisfy autoplay policies)
    video.play().catch(() => {});
  }
  $("#playVideoBtn").addEventListener("click", () => {
    if (video.paused) { video.play(); $("#playVideoBtn").textContent = "⏸ Pause"; }
    else { video.pause(); $("#playVideoBtn").textContent = "▶ Play"; }
  });
  $("#muteVideoBtn").addEventListener("click", () => {
    video.muted = !video.muted;
    $("#muteVideoBtn").textContent = video.muted ? "🔇 Unmute" : "🔊 Mute";
  });
  $("#fsVideoBtn").addEventListener("click", () => {
    const crop = $("#videoCrop");
    if (!document.fullscreenElement) {
      (crop.requestFullscreen || crop.webkitRequestFullscreen || function(){}).call(crop);
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });
 
  /* =================================================================
     PAGE 3 — Gameplay missions
     ================================================================= */
  let progress = defaultProgress();
  let activeIndex = -1;
  let elapsed = 0;          // seconds counted for the active mission
  let timerId = null;
 
  function renderMissions() {
    progress = loadProgress();
    const list = $("#missionList");
    list.innerHTML =
      '<p class="mission-intro">Select a mission. Each mission must be played for <b>' +
      MISSION_SECONDS + ' seconds</b> before the next unlocks.</p>';
 
    GAMEPLAY_LINKS.forEach((link, i) => {
      const locked = i > progress.unlockedUpTo;
      const done = progress.completed[i];
      const card = document.createElement("div");
      card.className = "mission-card" + (locked ? " locked" : "") + (done ? " done" : "");
      card.innerHTML =
        '<div class="m-info"><b>' + MISSION_TITLES[i] + '</b>' +
        '<small>' + link + '</small></div>' +
        '<div class="m-status">' + (done ? "✓ Completed" : locked ? "🔒 Locked" : "▶ Available") + '</div>';
      if (!locked) {
        card.style.cursor = "pointer";
        card.addEventListener("click", () => launchMission(i));
      }
      list.appendChild(card);
    });
 
    // Show the stage only if a mission is active
    if (activeIndex < 0) {
      $("#gameStage").classList.add("hidden");
      $("#missionList").classList.remove("hidden");
    }
  }
 
  function launchMission(i) {
    progress = loadProgress();
    activeIndex = i;
    elapsed = 0;
 
    $("#missionList").classList.add("hidden");
    $("#gameStage").classList.remove("hidden");
    $("#stageTitle").textContent = MISSION_TITLES[i];
    $("#nextGameplayBtn").classList.add("hidden");
    $("#returnStartBtn").classList.add("hidden");
 
    const frame = $("#gameFrame");
    frame.src = GAMEPLAY_LINKS[i];
    $("#openNewTab").href = GAMEPLAY_LINKS[i];
 
    startTimer();
  }
 
  function startTimer() {
    stopTimer();
    updateTimerDisplay();
    timerId = setInterval(() => {
      elapsed++;
      updateTimerDisplay();
      if (elapsed >= MISSION_SECONDS) {
        stopTimer();
        onMissionComplete();
      }
    }, 1000);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
 
  function updateTimerDisplay() {
    const s = Math.max(0, MISSION_SECONDS - elapsed);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    $("#stageTimer").textContent = h + ":" + m + ":" + sec + " left";
  }
 
  function onMissionComplete() {
    // Mark complete and unlock next
    progress.completed[activeIndex] = true;
    if (activeIndex + 1 > progress.unlockedUpTo) {
      progress.unlockedUpTo = Math.min(3, activeIndex + 1);
    }
    saveProgress(progress);
 
    // Reveal the appropriate continuation link
    if (activeIndex < 3) {
      $("#nextGameplayBtn").classList.remove("hidden");
    } else {
      // After the 4th gameplay, offer return to start page
      $("#returnStartBtn").classList.remove("hidden");
    }
  }
 
  $("#nextGameplayBtn").addEventListener("click", () => {
    showSavedAnimation(() => {
      const next = activeIndex + 1;
      activeIndex = -1;
      launchMission(next);
    });
  });
 
  $("#returnStartBtn").addEventListener("click", () => {
    showSavedAnimation(() => {
      activeIndex = -1;
      stopTimer();
      showPage("page1");
    });
  });
 
  $("#backToMissions").addEventListener("click", () => {
    stopTimer();
    activeIndex = -1;
    renderMissions();
  });
 
  /* =================================================================
     GAME SAVED ANIMATION
     ================================================================= */
  function showSavedAnimation(done) {
    const ov = $("#savedOverlay");
    ov.classList.remove("hidden", "show-check");
    // force reflow so the spinner restarts
    void ov.offsetWidth;
    setTimeout(() => ov.classList.add("show-check"), 700);
    setTimeout(() => {
      ov.classList.add("hidden");
      if (typeof done === "function") done();
    }, 1900);
  }
 
  /* =================================================================
     EXIT
     ================================================================= */
  $("#exitBtn").addEventListener("click", () => {
    // save current progress before exit
    if (activeIndex >= 0) saveProgress(progress);
    $("#exitOverlay").classList.remove("hidden");
  });
  $("#exitCancelBtn").addEventListener("click", () => {
    $("#exitOverlay").classList.add("hidden");
  });
  $("#exitConfirmBtn").addEventListener("click", () => {
    $("#exitOverlay").classList.add("hidden");
    // Attempt to close the window; otherwise show a goodbye message
    const closed = window.close();
    if (!closed) {
      document.body.innerHTML =
        '<div style="height:100vh;display:flex;align-items:center;justify-content:center;' +
        'flex-direction:column;color:#9fe;font-family:sans-serif;text-align:center">' +
        '<h1>SPACE ENTITY</h1><p>Thank you for playing. You may close this tab.</p></div>';
    }
  });
 
  /* ---------- Init ---------- */
  refreshAccountStatus();
  showPage("page1");
})();