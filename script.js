(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Shared by the hero QR reshuffle and the hero console phase cycle below,
  // so one Pause button stops everything moving in the hero at once rather
  // than leaving the QR grid still flickering while the console looks frozen.
  let heroAnimationsPaused = false;

  // ---- Mobile nav ----
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('is-open');
    });
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => navLinks.classList.remove('is-open'));
    });
  }

  // ---- Theme toggle ----
  // Dark by default on first visit, regardless of OS preference — matches
  // the CSS's own :root base (dark), which a light-OS visitor would
  // otherwise never see because of the @media (prefers-color-scheme:
  // light) override. Only an explicit toggle click (persisted) switches to
  // light; there's no third "follow the OS" state, since that would be
  // indistinguishable from this default for anyone who hasn't chosen light.
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const iconDark = document.getElementById('themeIconDark');
  const iconLight = document.getElementById('themeIconLight');
  const STORAGE_KEY = 'quorum-site-theme';

  function applyIcon(effectiveDark) {
    if (iconDark) iconDark.style.display = effectiveDark ? 'none' : 'block';
    if (iconLight) iconLight.style.display = effectiveDark ? 'block' : 'none';
  }
  function applyTheme(stored) {
    const theme = stored === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    applyIcon(theme === 'dark');
  }

  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* private mode etc. — just default to dark */ }
  applyTheme(stored);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* non-fatal — theme just won't persist across reloads */ }
      applyTheme(next);
    });
  }

  // ---- Scroll reveal ----
  // Elements start plainly visible (see styles.css's own comment on
  // .reveal vs .armed) — only once this runs do they opt into the
  // hide-then-fade-in treatment, and only for as long as it keeps working.
  const revealEls = Array.from(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && !prefersReducedMotion && revealEls.length > 0) {
    revealEls.forEach((el) => el.classList.add('armed'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => io.observe(el));
    // Safety net, not the primary mechanism: if an element somehow never
    // intersects (an unusually short viewport, a layout this wasn't
    // tested against, a future section added without checking) it still
    // ends up visible a few seconds after load rather than staying
    // armed-and-hidden indefinitely. The scroll-triggered path above is
    // expected to have already handled everything by the time this fires
    // for a visitor who's actually scrolling.
    setTimeout(() => {
      revealEls.forEach((el) => el.classList.add('is-visible'));
    }, 4000);
  }
  // No else branch needed: an element that never gets .armed (JS absent,
  // IntersectionObserver absent, or reduced motion requested) was never
  // hidden in the first place.

  // ---- Hero QR mockup: a decorative, non-functional module grid that
  // reshuffles on an interval to read as "live" and "rotating" — exactly
  // what the real registration/join QR actually does, just illustrated
  // rather than wired to a real token (there is no demo server for it to
  // point at; see the product's own LAN-only design). ----
  const qrGrid = document.getElementById('heroQr');
  const qrToken = document.getElementById('qrToken');
  // Declared here, outside the `if (qrGrid)` block below, so the hero
  // console's Replay button (further down) can also call them — a
  // block-scoped function declaration wouldn't be visible there.
  let randomizeQr = () => {};
  let randomToken = () => '';
  if (qrGrid) {
    const SIZE = 11;
    const cells = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement('i');
      qrGrid.appendChild(cell);
      cells.push(cell);
    }
    randomizeQr = function randomizeQrImpl() {
      // Corners kept solid, like real QR finder patterns, so it reads as
      // "a QR code" at a glance rather than plain static.
      cells.forEach((cell, i) => {
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        const inFinder = (x < 3 && y < 3) || (x > SIZE - 4 && y < 3) || (x < 3 && y > SIZE - 4);
        const on = inFinder ? (x === 1 || y === 1 || x === SIZE - 2 || y === SIZE - 2 || (x >= SIZE - 3 && x <= SIZE - 1 && y <= 2)) : Math.random() > 0.52;
        cell.classList.toggle('off', !on);
      });
    };
    randomizeQr();
    randomToken = function randomTokenImpl() {
      const chars = 'abcdef0123456789';
      let s = '';
      for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return `tok_${s}…e91`;
    };
    if (!prefersReducedMotion) {
      setInterval(() => {
        if (heroAnimationsPaused) return;
        randomizeQr();
        if (qrToken) qrToken.textContent = randomToken();
      }, 2600);
    }
  }

  // ---- Hero console: the top pane (QR + live counter) cycles Registration
  // → Join → (static) Quiz, exactly as the real product does; the bottom
  // pane is always a single persistent phone frame whose *view* is kept in
  // sync with whichever top phase is running — scan-to-register, then
  // scan-to-join (now prefilled, since registration already ran), then the
  // actual quiz the student answers once joined (ending on DonePage.jsx's
  // real copy: "✓ Submitted" / "Your quiz has been recorded."). The two
  // panes never swap views independently of each other — there's one
  // phaseIndex driving both — so top and bottom always agree on what's
  // supposedly happening right now.
  const joinCounter = document.getElementById('joinCounter');
  const phaseTag = document.getElementById('phaseTag');
  const phaseDesc = document.getElementById('phaseDesc');
  const counterLabel = document.getElementById('counterLabel');
  const consoleReplay = document.getElementById('consoleReplay');
  const consolePause = document.getElementById('consolePause');
  const heroScrubber = document.getElementById('heroScrubber');
  const heroScrubSegs = heroScrubber ? Array.from(heroScrubber.querySelectorAll('.scrub-seg')) : [];
  const heroPrev = document.getElementById('heroPrev');
  const heroNext = document.getElementById('heroNext');
  const miniViews = {
    scan: document.getElementById('viewScan'),
    form: document.getElementById('viewForm'),
    quiz: document.getElementById('viewQuiz'),
    done: document.getElementById('viewDone'),
  };
  const miniQr = document.getElementById('miniQr');
  const scanLabel = document.getElementById('scanLabel');
  const miniRoll = document.getElementById('miniRoll');
  const miniField2Label = document.getElementById('miniField2Label');
  const miniPin = document.getElementById('miniPin');
  const miniBtn = document.getElementById('miniBtn');
  const miniConfirm = document.getElementById('miniConfirm');
  const answerTimer = document.getElementById('answerTimer');
  const phoneQcount = document.getElementById('phoneQcount');
  const phoneProgressBar = document.getElementById('phoneProgressBar');
  const phoneQuestion = document.getElementById('phoneQuestion');
  const phoneHint = document.getElementById('phoneHint');
  const phoneOptionEls = miniViews.quiz ? Array.from(miniViews.quiz.querySelectorAll('#phoneOptions label')) : [];
  const phoneNext = document.getElementById('phoneNext');

  function setPauseUI(paused) {
    if (!consolePause) return;
    consolePause.setAttribute('aria-pressed', String(paused));
    consolePause.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
    const iconPause = consolePause.querySelector('.icon-pause');
    const iconPlay = consolePause.querySelector('.icon-play');
    const label = document.getElementById('consolePauseLabel');
    if (iconPause) iconPause.hidden = paused;
    if (iconPlay) iconPlay.hidden = !paused;
    if (label) label.textContent = paused ? 'Play' : 'Pause';
  }

  function showMiniView(name) {
    Object.keys(miniViews).forEach((key) => {
      if (miniViews[key]) miniViews[key].classList.toggle('is-active', key === name);
    });
  }

  function tapButton(el) {
    if (!el) return;
    el.classList.remove('tapped');
    void el.offsetWidth; // restart the animation if it's already run once this cycle
    el.classList.add('tapped');
  }

  if (joinCounter && !prefersReducedMotion) {
    const TOTAL = 20;
    const START = 11;
    const STEP_MS = 650;
    const HOLD_MS = 2200;
    // Matches quizConfig.js's perQuestionSeconds default (30s). The two
    // questions acted out are the last two of an 8-question quiz — Q7
    // single-select (QuestionCard.jsx's "Select one option."), Q8
    // multi-select and the final one ("Select all that apply.").
    const ANSWER_START = 30;
    const Q7 = { num: 7, options: ['A. Sydney', 'B. Canberra', 'C. Melbourne', 'D. Perth'], question: 'Which of these is the capital of Australia?', hint: 'Select one option.' };
    const Q8 = { num: 8, options: ['A. Solar', 'B. Coal', 'C. Wind', 'D. Natural gas'], question: 'Which of these are renewable energy sources?', hint: 'Select all that apply.' };
    const TOTAL_QUESTIONS = 8;

    function resetRegBottom() {
      showMiniView('scan');
      if (scanLabel) scanLabel.textContent = 'Scan to register';
      if (miniQr) miniQr.classList.remove('scanned');
    }
    function resetJoinBottom() {
      showMiniView('scan');
      if (scanLabel) scanLabel.textContent = 'Scan to join';
      if (miniQr) miniQr.classList.remove('scanned');
    }
    // Keyed by tick number (1-based, after that tick's counter increment)
    // within a counter phase — see step()'s tickNum below.
    const REG_BEATS = {
      1: () => { if (miniQr) miniQr.classList.add('scanned'); },
      2: () => {
        showMiniView('form');
        if (miniField2Label) miniField2Label.textContent = 'PIN';
        if (miniRoll) miniRoll.textContent = '2023114';
        if (miniPin) miniPin.textContent = ' ';
        if (miniBtn) miniBtn.textContent = 'Submit';
        if (miniConfirm) miniConfirm.textContent = ' ';
      },
      3: () => { if (miniPin) miniPin.textContent = '••••••'; },
      5: () => tapButton(miniBtn),
      6: () => { if (miniConfirm) miniConfirm.textContent = 'Registered ✓'; },
    };
    const JOIN_BEATS = {
      1: () => { if (miniQr) miniQr.classList.add('scanned'); },
      2: () => {
        // Join is roll_no + unique_id only (routes/join.js: "No PIN here —
        // join is roll_no + unique_id only") — a different credential from
        // registration's PIN, not a repeat of it. unique_id is the 8-char
        // code generated once at registration (auth/registration.js's
        // generateUniqueId, drawn from an alphabet with no 0/O/1/I/l) and
        // already saved on the device, so it shows prefilled, not typed.
        showMiniView('form');
        if (miniField2Label) miniField2Label.textContent = 'Unique ID';
        if (miniRoll) miniRoll.textContent = '2023114';
        if (miniPin) miniPin.textContent = 'QX7K2M9P';
        if (miniBtn) miniBtn.textContent = 'Join';
        if (miniConfirm) miniConfirm.textContent = ' ';
      },
      4: () => tapButton(miniBtn),
      5: () => { if (miniConfirm) miniConfirm.textContent = 'Joined ✓'; },
    };

    const PHASES = [
      {
        kind: 'counter',
        tag: 'Registration open', tagClass: 'tag',
        desc: 'Students scan once, ahead of time, and enter their roll number + PIN.',
        label: 'Registered',
        resetBottom: resetRegBottom,
        beats: REG_BEATS,
      },
      {
        kind: 'counter',
        tag: 'Join window open', tagClass: 'tag tag-verified',
        desc: 'Rotates every few seconds — only scannable from inside this room, right now.',
        label: 'Students joined',
        resetBottom: resetJoinBottom,
        beats: JOIN_BEATS,
      },
      { kind: 'quiz' },
    ];
    let phaseIndex = 0;
    let n = START;
    let t = ANSWER_START;
    let seqIndex = 0;
    // Tracks the one pending setTimeout at any point in the cycle, so
    // Replay can cut it off instead of leaving an orphaned timer running
    // alongside a freshly-restarted one (which would double-advance the
    // counter/timer once they both land).
    let timer = null;
    // Whatever step()/nextPhase() last asked to run next, kept even while
    // paused (when no real setTimeout is live) so Pause → Resume continues
    // the cycle instead of needing its own separate "resume from here" path.
    let pendingFn = null;

    function scheduleNext(fn, delay) {
      pendingFn = fn;
      if (!heroAnimationsPaused) timer = setTimeout(fn, delay);
    }

    function renderQuestion(q) {
      if (phoneQcount) phoneQcount.textContent = `Question ${q.num} of ${TOTAL_QUESTIONS}`;
      if (phoneProgressBar) phoneProgressBar.style.width = `${(q.num / TOTAL_QUESTIONS) * 100}%`;
      if (phoneQuestion) phoneQuestion.textContent = q.question;
      if (phoneHint) phoneHint.textContent = q.hint;
      phoneOptionEls.forEach((el, i) => {
        el.textContent = q.options[i];
        el.classList.remove('selected');
      });
      if (phoneNext) phoneNext.textContent = q.num === TOTAL_QUESTIONS ? 'Submit' : 'Next';
    }

    function tapOption(i) {
      if (phoneOptionEls[i]) phoneOptionEls[i].classList.add('selected');
    }

    // The scripted beat for the Quiz phase: a few countdown ticks on Q7,
    // tap an option, tap Next, land on Q8 with the countdown reset (a
    // fresh question gets a fresh perQuestionSeconds window — see
    // answering.js), tap two options (multi-select), tap Submit, show the
    // real DonePage.jsx copy, hold, then loop back to Registration.
    const ANSWER_SEQUENCE = [
      () => tick(),
      () => tick(),
      () => tick(),
      () => tapOption(1),
      () => tapButton(phoneNext),
      () => { renderQuestion(Q8); t = ANSWER_START; if (answerTimer) answerTimer.textContent = String(t); },
      () => tick(),
      () => tapOption(0),
      () => tapOption(2),
      () => tapButton(phoneNext),
      () => showMiniView('done'),
    ];
    const ANSWER_DELAYS = [STEP_MS, STEP_MS, STEP_MS, STEP_MS, HOLD_MS * 0.5, STEP_MS, STEP_MS, STEP_MS, STEP_MS, HOLD_MS * 0.5, HOLD_MS * 1.4];

    function tick() {
      if (t > 1) {
        t -= 1;
        if (answerTimer) answerTimer.textContent = String(t);
      }
    }

    function runAnswerStep() {
      if (seqIndex >= ANSWER_SEQUENCE.length) {
        nextPhase();
        return;
      }
      ANSWER_SEQUENCE[seqIndex]();
      scheduleNext(runAnswerStep, ANSWER_DELAYS[seqIndex]);
      seqIndex += 1;
    }

    function updateHeroScrubber() {
      heroScrubSegs.forEach((seg) => seg.classList.toggle('is-active', Number(seg.dataset.i) === phaseIndex));
    }

    function applyPhase() {
      const phase = PHASES[phaseIndex];
      updateHeroScrubber();
      if (phase.kind === 'quiz') {
        if (phaseTag) { phaseTag.textContent = 'Quiz in progress'; phaseTag.className = 'tag tag-verified'; }
        if (phaseDesc) phaseDesc.textContent = 'Every student is now answering their own shuffled question, one at a time.';
        if (counterLabel) counterLabel.textContent = 'Students joined';
        joinCounter.textContent = `${TOTAL} / ${TOTAL}`;
        showMiniView('quiz');
        t = ANSWER_START;
        if (answerTimer) answerTimer.textContent = String(t);
        renderQuestion(Q7);
        seqIndex = 0;
      } else {
        if (phaseTag) { phaseTag.textContent = phase.tag; phaseTag.className = phase.tagClass; }
        if (phaseDesc) phaseDesc.textContent = phase.desc;
        if (counterLabel) counterLabel.textContent = phase.label;
        n = START;
        joinCounter.textContent = `${n} / ${TOTAL}`;
        phase.resetBottom();
      }
    }

    function nextPhase() {
      phaseIndex = (phaseIndex + 1) % PHASES.length;
      applyPhase();
      scheduleNext(step, STEP_MS);
    }

    function step() {
      const phase = PHASES[phaseIndex];
      if (phase.kind === 'quiz') {
        runAnswerStep();
        return;
      }
      if (n < TOTAL) {
        n += 1;
        const tickNum = n - START;
        if (phase.beats[tickNum]) phase.beats[tickNum]();
        joinCounter.textContent = `${n} / ${TOTAL}`;
        scheduleNext(step, STEP_MS);
      } else {
        // Hold at full, then move to the next phase (wrapping back to
        // Registration after Quiz) and reset for it.
        scheduleNext(nextPhase, HOLD_MS);
      }
    }

    function start() {
      clearTimeout(timer);
      phaseIndex = 0;
      applyPhase();
      scheduleNext(step, STEP_MS);
    }
    start();

    // Scrubber: jump straight to a phase (segment click) or step by one
    // (arrows) — same applyPhase()/step() the auto-loop already uses, just
    // entered directly instead of waiting for the current phase to finish.
    function jumpToPhase(idx) {
      clearTimeout(timer);
      phaseIndex = ((idx % PHASES.length) + PHASES.length) % PHASES.length;
      applyPhase();
      scheduleNext(step, STEP_MS);
    }
    heroScrubSegs.forEach((seg) => {
      seg.addEventListener('click', () => jumpToPhase(Number(seg.dataset.i)));
    });
    if (heroPrev) heroPrev.addEventListener('click', () => jumpToPhase(phaseIndex - 1));
    if (heroNext) heroNext.addEventListener('click', () => jumpToPhase(phaseIndex + 1));

    if (consoleReplay) {
      consoleReplay.addEventListener('click', () => {
        heroAnimationsPaused = false;
        setPauseUI(false);
        start();
        if (qrGrid) randomizeQr();
        if (qrToken) qrToken.textContent = randomToken();
      });
    }

    if (consolePause) {
      consolePause.addEventListener('click', () => {
        heroAnimationsPaused = !heroAnimationsPaused;
        if (heroAnimationsPaused) {
          clearTimeout(timer);
        } else if (pendingFn) {
          timer = setTimeout(pendingFn, STEP_MS);
        }
        setPauseUI(heroAnimationsPaused);
      });
    }
  } else {
    // Reduced motion / no counter element: nothing is animating. Settle
    // on the scan view (the most representative static frame) and hide
    // Replay/Pause, since there's nothing for either to control.
    showMiniView('scan');
    if (consoleReplay) consoleReplay.style.display = 'none';
    if (consolePause) consolePause.style.display = 'none';
    if (heroScrubber) heroScrubber.style.display = 'none';
  }

  // ---- Teacher console demo (Feature grid section): cycles through five
  // real web-teacher pages in order -- Create Quiz, Start Quiz, Past
  // Quizzes, Student History, Class Analysis -- acting out the same two
  // questions authored here as the hero's student quiz animation answers.
  // Copy/columns throughout are taken straight from the real pages:
  // CreateQuizPage.jsx ("Create Quiz"), SessionControls.jsx/ControlPage.jsx
  // (status line, "End registration, start quiz", "End quiz now",
  // Registered/Joined/Submitted, "Flag issues"), PastSessionsPage.jsx
  // (Quiz/Class/Date/.../Registered/Joined/Submitted columns),
  // StudentHistoryPage.jsx (roll-number search, Quiz/Date/Status/Score,
  // "Integrity report -- every session"), ClassAnalysisPage.jsx (Roll No/
  // Attendance/Avg Score/Trend, the exact "Improving"/"Declining"/"Steady"
  // trend labels). A separate, independent animation loop from the hero
  // console above -- its own pause state, own timer -- since it's a
  // different section a visitor may scroll to well after (or without
  // ever) touching the hero.
  let teacherAnimationsPaused = false;
  const tcTabsEl = document.getElementById('tcTabs');
  const tcTabEls = tcTabsEl ? Array.from(tcTabsEl.querySelectorAll('.tc-tab')) : [];
  const tcPrev = document.getElementById('tcPrev');
  const tcNext = document.getElementById('tcNext');
  const tcViews = {
    create: document.getElementById('tcViewCreate'),
    start: document.getElementById('tcViewStart'),
    past: document.getElementById('tcViewPast'),
    history: document.getElementById('tcViewHistory'),
    analysis: document.getElementById('tcViewAnalysis'),
  };
  const tcStatus = document.getElementById('tcStatus');
  const tcRegistered = document.getElementById('tcRegistered');
  const tcJoined = document.getElementById('tcJoined');
  const tcSubmitted = document.getElementById('tcSubmitted');
  const tcStatRegistered = document.getElementById('tcStatRegistered');
  const tcStatJoined = document.getElementById('tcStatJoined');
  const tcStatSubmitted = document.getElementById('tcStatSubmitted');
  const tcActionBtn = document.getElementById('tcActionBtn');
  const tcFlagBtn = document.getElementById('tcFlagBtn');
  const tcFlagResult = document.getElementById('tcFlagResult');
  const tcReplay = document.getElementById('tcReplay');
  const tcPause = document.getElementById('tcPause');

  function setTcPauseUI(paused) {
    if (!tcPause) return;
    tcPause.setAttribute('aria-pressed', String(paused));
    tcPause.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
    const iconPause = tcPause.querySelector('.icon-pause');
    const iconPlay = tcPause.querySelector('.icon-play');
    const label = document.getElementById('tcPauseLabel');
    if (iconPause) iconPause.hidden = paused;
    if (iconPlay) iconPlay.hidden = !paused;
    if (label) label.textContent = paused ? 'Play' : 'Pause';
  }

  function showTcTab(name) {
    Object.keys(tcViews).forEach((key) => { if (tcViews[key]) tcViews[key].classList.toggle('is-active', key === name); });
    let activeTabEl = null;
    tcTabEls.forEach((el) => {
      const isActive = el.dataset.tab === name;
      el.classList.toggle('is-active', isActive);
      if (isActive) activeTabEl = el;
    });
    // The tab row scrolls instead of wrapping (see .tc-tabs), so the
    // active tab can end up off-screen — keep it in view by adjusting
    // only that row's own scrollLeft, never scrollIntoView(): that call
    // scrolls whichever ancestor needs it to bring the element in view,
    // which on a tab barely inside the viewport's edge was also nudging
    // the whole *page*, every ~8s on every auto-advance.
    if (activeTabEl && tcTabsEl) {
      const trackRect = tcTabsEl.getBoundingClientRect();
      const elRect = activeTabEl.getBoundingClientRect();
      if (elRect.left < trackRect.left) {
        tcTabsEl.scrollLeft -= (trackRect.left - elRect.left) + 8;
      } else if (elRect.right > trackRect.right) {
        tcTabsEl.scrollLeft += (elRect.right - trackRect.right) + 8;
      }
    }
  }

  if (tcTabsEl && !prefersReducedMotion) {
    const STEP_MS = 650;
    const HOLD_MS = 2200;
    const TAB_ORDER = ['create', 'start', 'past', 'history', 'analysis'];
    let tabIndex = 0;
    let timer = null;
    let pendingFn = null;

    function scheduleNext(fn, delay) {
      pendingFn = fn;
      if (!teacherAnimationsPaused) timer = setTimeout(fn, delay);
    }

    function advanceTab() {
      tabIndex = (tabIndex + 1) % TAB_ORDER.length;
      enterTab(TAB_ORDER[tabIndex]);
    }

    // Generic runner for the "reveal a few rows/fields in order, then
    // hold" tabs -- frames[i]/delays[i] pair up: run frames[i], then wait
    // delays[i] before the next frame, or before moving to the next tab
    // on the last one.
    function runFrames(frames, delays) {
      function step(i) {
        frames[i]();
        scheduleNext(i === frames.length - 1 ? advanceTab : () => step(i + 1), delays[i]);
      }
      step(0);
    }

    // ---- Create Quiz ----
    function enterCreateTab() {
      const q7Text = document.getElementById('tcQ7Text');
      const q8Text = document.getElementById('tcQ8Text');
      const saveResult = document.getElementById('tcSaveResult');
      if (q7Text) q7Text.textContent = ' ';
      if (q8Text) q8Text.textContent = ' ';
      if (saveResult) saveResult.textContent = ' ';
      document.querySelectorAll('#tcQ7Opts span, #tcQ8Opts span').forEach((el) => el.classList.remove('is-in', 'correct'));
      const createFrames = [
        () => { if (q7Text) q7Text.textContent = 'Which of these is the capital of Australia?'; },
        () => document.querySelectorAll('#tcQ7Opts span').forEach((el) => el.classList.add('is-in')),
        () => { const el = document.querySelector('#tcQ7Opts span[data-i="1"]'); if (el) el.classList.add('correct'); },
        () => { if (q8Text) q8Text.textContent = 'Which of these are renewable energy sources?'; },
        () => document.querySelectorAll('#tcQ8Opts span').forEach((el) => el.classList.add('is-in')),
        () => {
          const a = document.querySelector('#tcQ8Opts span[data-i="0"]');
          const c = document.querySelector('#tcQ8Opts span[data-i="2"]');
          if (a) a.classList.add('correct');
          if (c) c.classList.add('correct');
        },
        () => tapButton(document.getElementById('tcSaveBtn')),
        () => { if (saveResult) saveResult.textContent = 'Quiz saved'; },
      ];
      const createDelays = [STEP_MS, STEP_MS, STEP_MS, STEP_MS, STEP_MS, STEP_MS, STEP_MS, HOLD_MS];
      runFrames(createFrames, createDelays);
    }

    // ---- Start Quiz (ControlPage.jsx) ----
    const REG_START = 11;
    const REG_TOTAL = 20;
    const JOIN_TOTAL = 20;
    const JOIN_STEP = 2;
    let regN = REG_START;
    let joined = 0;
    let submitted = 0;

    function enterRegistering() {
      regN = REG_START;
      if (tcStatus) tcStatus.textContent = 'Registration open -- students are getting their unique ID + PIN';
      if (tcRegistered) tcRegistered.textContent = String(regN);
      if (tcStatRegistered) tcStatRegistered.classList.add('is-active');
      if (tcStatJoined) tcStatJoined.classList.remove('is-active');
      if (tcStatSubmitted) tcStatSubmitted.classList.remove('is-active');
      if (tcActionBtn) { tcActionBtn.textContent = 'End registration, start quiz'; tcActionBtn.className = 'tc-btn tc-btn-start'; }
      if (tcFlagBtn) tcFlagBtn.style.display = 'none';
      if (tcFlagResult) tcFlagResult.textContent = ' ';
    }

    function enterQuiz() {
      joined = 0;
      submitted = 0;
      if (tcStatus) tcStatus.textContent = 'Quiz active -- accepting joins';
      if (tcJoined) tcJoined.textContent = '0';
      if (tcSubmitted) tcSubmitted.textContent = '0';
      if (tcStatRegistered) tcStatRegistered.classList.remove('is-active');
      if (tcStatJoined) tcStatJoined.classList.add('is-active');
      if (tcStatSubmitted) tcStatSubmitted.classList.add('is-active');
      if (tcActionBtn) { tcActionBtn.textContent = 'End quiz now'; tcActionBtn.className = 'tc-btn tc-btn-end'; }
      if (tcFlagBtn) tcFlagBtn.style.display = '';
      if (tcFlagResult) tcFlagResult.textContent = ' ';
    }

    function registeringTick() {
      if (regN < REG_TOTAL) {
        regN += 1;
        if (tcRegistered) tcRegistered.textContent = String(regN);
        scheduleNext(registeringTick, STEP_MS);
      } else {
        scheduleNext(() => {
          tapButton(tcActionBtn);
          scheduleNext(() => { enterQuiz(); scheduleNext(quizTick, STEP_MS); }, STEP_MS);
        }, HOLD_MS);
      }
    }

    function quizTick() {
      if (joined < JOIN_TOTAL) {
        joined = Math.min(JOIN_TOTAL, joined + JOIN_STEP);
        if (tcJoined) tcJoined.textContent = String(joined);
        // Submitted trails joined by one tick, so it never looks like
        // students finish before they've even joined.
        if (joined > JOIN_STEP) {
          submitted = Math.min(JOIN_TOTAL, submitted + JOIN_STEP);
          if (tcSubmitted) tcSubmitted.textContent = String(submitted);
        }
        if (joined === 12 && tcFlagBtn) {
          scheduleNext(() => {
            tapButton(tcFlagBtn);
            if (tcFlagResult) tcFlagResult.innerHTML = '<span class="count">2 flagged</span> -- tab-switch (1), copy attempt (1)';
            scheduleNext(quizTick, STEP_MS);
          }, STEP_MS);
          return;
        }
        scheduleNext(quizTick, STEP_MS);
      } else {
        if (tcStatus) tcStatus.textContent = 'Quiz ended.';
        if (tcActionBtn) { tcActionBtn.textContent = 'Session complete'; tcActionBtn.className = 'tc-btn tc-btn-done'; }
        scheduleNext(advanceTab, HOLD_MS * 1.4);
      }
    }

    // Two sub-steps, shown one at a time (see .tc-sub in styles.css):
    // HomePage.jsx's quiz picker + "Start registration" button first
    // (a session doesn't exist yet), then ControlPage.jsx's session
    // controls once it does. Hand-rolled rather than runFrames() above,
    // since runFrames always ends by calling advanceTab() — here the
    // last step instead hands off into registeringTick()'s own chain,
    // which only reaches advanceTab() much later, at the end of the quiz.
    function showStartSub(name) {
      const home = document.getElementById('tcHome');
      const control = document.getElementById('tcControl');
      if (home) home.classList.toggle('is-active', name === 'home');
      if (control) control.classList.toggle('is-active', name === 'control');
    }

    function enterStartTab() {
      const selectVal = document.getElementById('tcQuizSelectValue');
      const startRegBtn = document.getElementById('tcStartRegBtn');
      showStartSub('home');
      if (selectVal) selectVal.textContent = 'CS301-B — Quiz 6';

      function pickQuiz() {
        if (selectVal) selectVal.textContent = 'CS301-B — Quiz 7';
        scheduleNext(tapStart, STEP_MS);
      }
      function tapStart() {
        tapButton(startRegBtn);
        scheduleNext(enterControl, STEP_MS);
      }
      function enterControl() {
        showStartSub('control');
        enterRegistering();
        scheduleNext(registeringTick, STEP_MS);
      }
      scheduleNext(pickQuiz, STEP_MS);
    }

    // ---- Past Quizzes / Student History / Class Analysis: all three are
    // "reveal rows in order, then hold" -- built on runFrames above. ----
    function rowsOf(id) { return Array.from(document.querySelectorAll('#' + id + ' .tc-row')); }

    function enterPastTab() {
      const rows = rowsOf('tcPastRows');
      rows.forEach((r) => r.classList.remove('is-in'));
      runFrames(rows.map((r) => () => r.classList.add('is-in')), rows.map(() => STEP_MS));
    }

    function enterHistoryTab() {
      const searchVal = document.getElementById('tcSearchVal');
      const integrityLine = document.getElementById('tcIntegrityLine');
      const rows = rowsOf('tcHistoryRows');
      if (searchVal) searchVal.textContent = ' ';
      if (integrityLine) integrityLine.textContent = ' ';
      rows.forEach((r) => r.classList.remove('is-in'));
      const frames = [
        () => { if (searchVal) searchVal.textContent = '2023114'; },
        ...rows.map((r) => () => r.classList.add('is-in')),
        () => { if (integrityLine) integrityLine.innerHTML = 'Integrity report -- <span class="count">0 flags</span> across 8 quizzes'; },
      ];
      const delays = frames.map(() => STEP_MS);
      delays[delays.length - 1] = HOLD_MS;
      runFrames(frames, delays);
    }

    function enterAnalysisTab() {
      const rows = rowsOf('tcAnalysisRows');
      rows.forEach((r) => r.classList.remove('is-in'));
      const delays = rows.map(() => STEP_MS);
      delays[delays.length - 1] = HOLD_MS;
      runFrames(rows.map((r) => () => r.classList.add('is-in')), delays);
    }

    function enterTab(name) {
      showTcTab(name);
      if (name === 'create') enterCreateTab();
      else if (name === 'start') enterStartTab();
      else if (name === 'past') enterPastTab();
      else if (name === 'history') enterHistoryTab();
      else if (name === 'analysis') enterAnalysisTab();
    }

    function startTeacherConsole() {
      clearTimeout(timer);
      tabIndex = 0;
      enterTab(TAB_ORDER[0]);
    }
    startTeacherConsole();

    // Scrubber: jump straight to a page (tab click) or step by one
    // (arrows) — reuses enterTab(), same as the auto-loop, just entered
    // directly instead of waiting for the current page's sequence to finish.
    function jumpToTab(idx) {
      clearTimeout(timer);
      tabIndex = ((idx % TAB_ORDER.length) + TAB_ORDER.length) % TAB_ORDER.length;
      enterTab(TAB_ORDER[tabIndex]);
    }
    tcTabEls.forEach((el) => {
      el.addEventListener('click', () => jumpToTab(TAB_ORDER.indexOf(el.dataset.tab)));
    });
    if (tcPrev) tcPrev.addEventListener('click', () => jumpToTab(tabIndex - 1));
    if (tcNext) tcNext.addEventListener('click', () => jumpToTab(tabIndex + 1));

    if (tcReplay) {
      tcReplay.addEventListener('click', () => {
        teacherAnimationsPaused = false;
        setTcPauseUI(false);
        startTeacherConsole();
      });
    }
    if (tcPause) {
      tcPause.addEventListener('click', () => {
        teacherAnimationsPaused = !teacherAnimationsPaused;
        if (teacherAnimationsPaused) {
          clearTimeout(timer);
        } else if (pendingFn) {
          timer = setTimeout(pendingFn, STEP_MS);
        }
        setTcPauseUI(teacherAnimationsPaused);
      });
    }
  } else {
    showTcTab('create');
    if (tcReplay) tcReplay.style.display = 'none';
    if (tcPause) tcPause.style.display = 'none';
    if (tcPrev) tcPrev.style.display = 'none';
    if (tcNext) tcNext.style.display = 'none';
  }


  // ---- Contact form ----
  // Posts straight to Web3Forms (api.web3forms.com) — a real third-party
  // network call on submit, which is why the footer's own claim was
  // reworded to "no trackers, no analytics" rather than "no third-party
  // scripts, ever": this is the one and only such call, and it only
  // happens if a visitor deliberately submits this form, never on page
  // load. Web3Forms looks up which inbox the access_key belongs to and
  // sends the mail from its own servers — this page never sees or needs
  // real SMTP credentials.
  const contactForm = document.getElementById('contactForm');
  const contactStatus = document.getElementById('contactStatus');
  const contactSubmit = document.getElementById('contactSubmit');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('contactName').value.trim();
      const email = document.getElementById('contactEmail').value.trim();
      const subject = document.getElementById('contactSubject').value.trim();
      const message = document.getElementById('contactMessage').value.trim();
      if (!name || !email || !subject || !message) {
        if (contactStatus) { contactStatus.textContent = 'Please fill in every field.'; contactStatus.className = 'contact-status is-error'; }
        return;
      }
      if (contactSubmit) { contactSubmit.disabled = true; contactSubmit.textContent = 'Sending…'; }
      if (contactStatus) { contactStatus.textContent = ' '; contactStatus.className = 'contact-status'; }
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(contactForm))),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'send_failed');
        contactForm.reset();
        if (contactStatus) { contactStatus.textContent = 'Message sent!'; contactStatus.className = 'contact-status is-success'; }
      } catch {
        if (contactStatus) { contactStatus.textContent = "Something went wrong — email us directly at quorumclassroom@gmail.com instead."; contactStatus.className = 'contact-status is-error'; }
      } finally {
        if (contactSubmit) { contactSubmit.disabled = false; contactSubmit.textContent = 'Send Message'; }
      }
    });
  }

  // ---- Footer year ----
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
