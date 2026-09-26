(function () {
  "use strict";

  var LS = {
    known: "phys-trainer-known-v1",
    srs: "phys-trainer-srs-v1",
    stats: "phys-trainer-stats-v1"
  };
  var KATEX_DISPLAY = { throwOnError: false, displayMode: true, strict: "ignore", trust: false };
  var KATEX_INLINE = { throwOnError: false, displayMode: false, strict: "ignore", trust: false };
  var DAY = 86400000;

  var SECTION_TITLE = {};
  window.SECTIONS.forEach(function (s) { SECTION_TITLE[s.id] = s.title; });

  function load(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* недоступно */ }
  }
  function byId(id) { return document.getElementById(id); }

  var state = {
    mode: "cards",
    section: "all",
    shuffled: false,
    list: [],
    known: new Set(load(LS.known, [])),
    srs: load(LS.srs, {}),
    stats: load(LS.stats, { unitOk: 0, unitBad: 0, exprOk: 0, exprBad: 0 }),
    unit: { current: null, asked: 0 },
    expr: { order: [], pos: 0, shown: 0 },
    review: { queue: [] }
  };

  /* ---------- Рендер математики ---------- */
  function renderFormula(node, latex) {
    node.innerHTML = "";
    if (window.katex) {
      try { window.katex.render(latex, node, KATEX_DISPLAY); return; } catch (e) { /* фолбэк */ }
    }
    var code = document.createElement("code");
    code.textContent = latex;
    node.appendChild(code);
  }
  function renderMathInline(node, latex) {
    node.innerHTML = "";
    if (window.katex) {
      try { window.katex.render(latex, node, KATEX_INLINE); return; } catch (e) { /* фолбэк */ }
    }
    node.textContent = latex;
  }
  function appendRich(parent, text) {
    if (!text) return;
    String(text).split("$").forEach(function (part, i) {
      if (i % 2 === 1) {
        var span = document.createElement("span");
        renderMathInline(span, part);
        parent.appendChild(span);
      } else if (part) {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  /* ---------- Авто-масштаб формулы под карточку ---------- */
  function fitFormula(container) {
    var node = container.querySelector(".katex-display") || container.querySelector(".katex");
    if (!node) return;
    node.style.transform = "";
    node.style.transformOrigin = "center center";
    var availW = container.clientWidth, availH = container.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    var w = node.offsetWidth || node.scrollWidth, h = node.offsetHeight || node.scrollHeight;
    if (!w || !h) return;
    var scale = Math.min(1, (availW - 6) / w, (availH - 6) / h);
    if (scale < 0.999) node.style.transform = "scale(" + scale.toFixed(4) + ")";
  }
  function fitAllWithin(root) {
    root.querySelectorAll(".formula").forEach(fitFormula);
  }

  /* ---------- Карточка ---------- */
  function createCard(entry, opts) {
    opts = opts || {};
    var card = entry.card, id = entry.id;
    var forms = window.FORMS && window.FORMS[card.t];

    var root = document.createElement("div");
    root.className = "card" + (state.known.has(id) ? " is-known" : "");
    root.tabIndex = 0;
    root.setAttribute("role", "button");
    root.setAttribute("aria-pressed", "false");
    root.setAttribute("aria-label", card.t);
    root.dataset.id = id;

    var inner = document.createElement("div");
    inner.className = "card__inner";

    // лицо — описание
    var front = document.createElement("div");
    front.className = "card__face card__face--front";
    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = SECTION_TITLE[card.s] || "";
    var title = document.createElement("p");
    title.className = "card__title";
    title.textContent = card.t;
    var hint = document.createElement("span");
    hint.className = "card__hint";
    hint.textContent = "Нажмите, чтобы увидеть формулу";
    front.appendChild(badge); front.appendChild(title); front.appendChild(hint);

    // оборот — формула
    var back = document.createElement("div");
    back.className = "card__face card__face--back";
    var badgeBack = document.createElement("span");
    badgeBack.className = "badge";
    badgeBack.textContent = SECTION_TITLE[card.s] || "";

    var formula = document.createElement("div");
    formula.className = "formula";
    var formMode = forms ? "vec" : null;
    renderFormula(formula, forms ? forms.vec : card.f);

    var actions = document.createElement("div");
    actions.className = "card__actions";

    if (forms) {
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "form-toggle";
      toggle.textContent = "В проекциях";
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        formMode = formMode === "vec" ? "proj" : "vec";
        renderFormula(formula, forms[formMode]);
        toggle.textContent = formMode === "vec" ? "В проекциях" : "Векторная форма";
        fitFormula(formula);
      });
      actions.appendChild(toggle);
    }

    var meta = document.createElement("div");
    meta.className = "card__meta";
    if (card.vars && card.vars.length) {
      var list = document.createElement("ul");
      list.className = "vars";
      card.vars.forEach(function (v) {
        var li = document.createElement("li");
        var sym = document.createElement("span");
        sym.className = "sym";
        renderMathInline(sym, v.s);
        li.appendChild(sym);
        li.appendChild(document.createTextNode(" — " + v.n));
        list.appendChild(li);
      });
      meta.appendChild(list);
    }
    if (card.n) {
      var note = document.createElement("p");
      note.className = "card__note";
      appendRich(note, card.n);
      meta.appendChild(note);
    }

    if (!opts.review) {
      var knownBtn = document.createElement("button");
      knownBtn.type = "button";
      knownBtn.className = "known-btn";
      knownBtn.textContent = state.known.has(id) ? "✓ Изучено" : "Отметить изученным";
      knownBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleKnown(id, root, knownBtn);
      });
      actions.appendChild(knownBtn);
    }

    back.appendChild(badgeBack);
    back.appendChild(formula);
    back.appendChild(meta);
    back.appendChild(actions);

    inner.appendChild(front);
    inner.appendChild(back);
    root.appendChild(inner);

    function flip() {
      var flipped = root.classList.toggle("is-flipped");
      root.setAttribute("aria-pressed", String(flipped));
      if (flipped) fitFormula(formula);
    }
    root.addEventListener("click", flip);
    root.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); flip(); }
    });

    return root;
  }

  function toggleKnown(id, root, btn) {
    if (state.known.has(id)) {
      state.known.delete(id); root.classList.remove("is-known");
      if (btn) btn.textContent = "Отметить изученным";
    } else {
      state.known.add(id); root.classList.add("is-known");
      if (btn) btn.textContent = "✓ Изучено";
    }
    save(LS.known, Array.from(state.known));
    updateProgress();
  }

  function updateProgress() {
    var total = window.CARDS.length, done = state.known.size;
    var pct = total ? Math.round((done / total) * 100) : 0;
    byId("progressFill").style.width = pct + "%";
    byId("progressLabel").textContent = done + " / " + total;
  }

  /* ---------- Режим «Карточки» ---------- */
  var gridEl = byId("grid"), emptyEl = byId("empty"), chipsEl = byId("sectionChips");

  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function buildChips() {
    var frag = document.createDocumentFragment();
    function makeChip(id, title) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.section === id ? " is-active" : "");
      btn.textContent = title;
      btn.dataset.section = id;
      btn.addEventListener("click", function () {
        state.section = id; state.shuffled = false;
        chipsEl.querySelectorAll(".chip").forEach(function (c) {
          c.classList.toggle("is-active", c.dataset.section === id);
        });
        renderBrowse();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      return btn;
    }
    frag.appendChild(makeChip("all", "Все разделы"));
    window.SECTIONS.forEach(function (s) { frag.appendChild(makeChip(s.id, s.title)); });
    chipsEl.appendChild(frag);
  }

  function renderBrowse() {
    var base = window.CARDS.map(function (c, i) { return { card: c, id: i }; });
    state.list = state.section === "all" ? base : base.filter(function (x) { return x.card.s === state.section; });
    if (state.shuffled) shuffleArr(state.list);

    gridEl.innerHTML = "";
    if (!state.list.length) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;
    var frag = document.createDocumentFragment();
    state.list.forEach(function (entry) { frag.appendChild(createCard(entry)); });
    gridEl.appendChild(frag);
    window.requestAnimationFrame(function () { fitAllWithin(gridEl); });
  }

  /* ---------- Режим «Единицы» ---------- */
  var unitPool = [];
  window.CARDS.forEach(function (c, i) {
    (c.vars || []).forEach(function (v) {
      if (v.u !== undefined) unitPool.push({ cardId: i, section: c.s, sym: v.s, name: v.n, unit: v.u });
    });
  });

  function normUnit(s) {
    return String(s).toLowerCase()
      .replace(/\s+/g, "")
      .replace(/\\cdot/g, "·")
      .replace(/[·⋅*]/g, "·")
      .replace(/\^/g, "")
      .replace(/²/g, "2").replace(/³/g, "3")
      .replace(/[сc]/g, "c");
  }
  function unitMatches(guess, unit) {
    var g = normUnit(guess);
    if (unit === "—") return ["", "-", "—", "–", "нет", "безразм", "безразмерная", "безразмерно", "1"].indexOf(g) !== -1;
    return g === normUnit(unit);
  }

  function unitNewQuestion() {
    var next;
    do { next = unitPool[Math.floor(Math.random() * unitPool.length)]; }
    while (unitPool.length > 1 && state.unit.current && next.sym === state.unit.current.sym && next.name === state.unit.current.name);
    state.unit.current = next;
    state.unit.asked++;

    renderMathInline(byId("unitSymbol"), next.sym);
    byId("unitName").textContent = next.name;
    byId("unitInput").value = "";
    byId("unitFeedback").textContent = "";
    byId("unitFeedback").className = "feedback";
    unitMeta();
    byId("unitInput").focus();
  }
  function unitMeta() {
    var s = state.stats;
    byId("unitMeta").textContent = "Вопрос " + state.unit.asked + " · Верно " + s.unitOk + " · Ошибок " + s.unitBad;
  }
  function unitCheck() {
    var cur = state.unit.current; if (!cur) return;
    var fb = byId("unitFeedback");
    if (unitMatches(byId("unitInput").value, cur.unit)) {
      state.stats.unitOk++;
      fb.textContent = "Верно: [" + cur.unit + "]";
      fb.className = "feedback feedback--ok";
      save(LS.stats, state.stats); unitMeta();
    } else {
      state.stats.unitBad++;
      fb.textContent = "Неверно. Попробуйте ещё раз.";
      fb.className = "feedback feedback--bad";
      save(LS.stats, state.stats); unitMeta();
    }
  }
  function unitShow() {
    var cur = state.unit.current; if (!cur) return;
    var fb = byId("unitFeedback");
    fb.textContent = "Ответ: [" + cur.unit + "]";
    fb.className = "feedback feedback--info";
  }

  /* ---------- Режим «Выражения» ---------- */
  function exprNewOrder() {
    state.expr.order = shuffleArr(window.TASKS.map(function (_, i) { return i; }));
    state.expr.pos = 0;
  }
  function exprRender() {
    if (!state.expr.order.length) exprNewOrder();
    var task = window.TASKS[state.expr.order[state.expr.pos % state.expr.order.length]];
    var taskEl = byId("exprTask");
    taskEl.innerHTML = "";
    appendRich(taskEl, task.q);

    var ansEl = byId("exprAnswer");
    ansEl.hidden = true;
    ansEl.innerHTML = "";
    byId("exprShow").textContent = "Показать ответ";
    exprMeta();
  }
  function exprMeta() {
    var s = state.stats;
    byId("exprMeta").textContent = "Задача " + (state.expr.pos + 1) + " из " + window.TASKS.length +
      " · Верно " + s.exprOk + " · Ошибок " + s.exprBad;
  }
  function exprReveal() {
    var task = window.TASKS[state.expr.order[state.expr.pos % state.expr.order.length]];
    var ansEl = byId("exprAnswer");
    if (ansEl.hidden) {
      renderFormula(ansEl, task.a);
      ansEl.hidden = false;
      byId("exprShow").textContent = "Скрыть ответ";
    } else {
      ansEl.hidden = true;
      byId("exprShow").textContent = "Показать ответ";
    }
  }
  function exprGrade(ok) {
    if (ok) state.stats.exprOk++; else state.stats.exprBad++;
    save(LS.stats, state.stats);
    exprMeta();
  }
  function exprNext() {
    state.expr.pos++;
    if (state.expr.pos >= state.expr.order.length) exprNewOrder();
    exprRender();
  }

  /* ---------- Режим «Повторение» (SRS, SM-2 lite) ---------- */
  function dueEntries() {
    var now = Date.now();
    return window.CARDS.map(function (c, i) { return { card: c, id: i }; })
      .filter(function (e) {
        var st = state.srs[e.id];
        return !st || st.due <= now;
      })
      .sort(function (a, b) {
        var da = state.srs[a.id] ? state.srs[a.id].due : 0;
        var db = state.srs[b.id] ? state.srs[b.id].due : 0;
        return da - db;
      });
  }
  function dueCount() {
    var now = Date.now();
    return window.CARDS.reduce(function (n, c, i) {
      var st = state.srs[i];
      return n + (!st || st.due <= now ? 1 : 0);
    }, 0);
  }
  function updateDueBadge() { byId("dueCount").textContent = dueCount(); }

  function schedule(id, grade) {
    var st = state.srs[id] || { ease: 2.5, interval: 0, reps: 0, due: 0 };
    var ease = st.ease, interval = st.interval, reps = st.reps;
    if (grade === "hard") {
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.max(1, Math.round((interval || 1) * 1.2));
    } else if (grade === "good") {
      reps += 1;
      interval = reps === 1 ? 1 : (reps === 2 ? 6 : Math.round((interval || 1) * ease));
    } else { // easy
      ease += 0.15; reps += 1;
      interval = reps <= 1 ? 4 : Math.round((interval || 1) * ease * 1.3);
    }
    state.srs[id] = { ease: ease, interval: interval, reps: reps, due: Date.now() + interval * DAY };
    save(LS.srs, state.srs);
  }

  function renderReview() {
    var slot = byId("reviewSlot"), grades = byId("reviewGrades"), done = byId("reviewDone");
    state.review.queue = dueEntries();

    if (!state.review.queue.length) {
      slot.innerHTML = "";
      grades.hidden = true;
      done.hidden = false;
      byId("reviewMeta").textContent = "Все карточки на сегодня повторены.";
      return;
    }
    done.hidden = true;
    grades.hidden = false;
    slot.innerHTML = "";
    var entry = state.review.queue[0];
    slot.appendChild(createCard(entry, { review: true }));
    window.requestAnimationFrame(function () { fitAllWithin(slot); });
    byId("reviewMeta").textContent = "К повторению: " + state.review.queue.length +
      " · всего в расписании: " + Object.keys(state.srs).length;
  }
  function reviewGrade(grade) {
    var entry = state.review.queue[0];
    if (!entry) return;
    schedule(entry.id, grade);
    updateDueBadge();
    renderReview();
  }

  /* ---------- Переключение режимов ---------- */
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.mode === mode);
    });
    byId("viewCards").hidden = mode !== "cards";
    byId("viewUnits").hidden = mode !== "units";
    byId("viewExpr").hidden = mode !== "expr";
    byId("viewReview").hidden = mode !== "review";
    byId("progress").style.display = mode === "cards" ? "" : "none";

    if (mode === "cards") renderBrowse();
    else if (mode === "units") { if (!state.unit.current) unitNewQuestion(); unitMeta(); }
    else if (mode === "expr") { if (!state.expr.order.length) { exprNewOrder(); } exprRender(); }
    else if (mode === "review") renderReview();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Инициализация ---------- */
  function init() {
    buildChips();
    renderBrowse();
    updateProgress();
    updateDueBadge();

    byId("tabs").addEventListener("click", function (e) {
      var tab = e.target.closest(".tab");
      if (tab) setMode(tab.dataset.mode);
    });

    byId("shuffleBtn").addEventListener("click", function () {
      state.shuffled = true; renderBrowse();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    byId("resetBtn").addEventListener("click", function () {
      if (!state.known.size) return;
      if (!window.confirm("Сбросить прогресс изучения карточек?")) return;
      state.known.clear(); save(LS.known, []);
      renderBrowse(); updateProgress();
    });

    byId("unitCheck").addEventListener("click", unitCheck);
    byId("unitNext").addEventListener("click", unitNewQuestion);
    byId("unitShow").addEventListener("click", unitShow);
    byId("unitInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); unitCheck(); }
    });

    byId("exprShow").addEventListener("click", exprReveal);
    byId("exprRight").addEventListener("click", function () { exprGrade(true); });
    byId("exprWrong").addEventListener("click", function () { exprGrade(false); });
    byId("exprNext").addEventListener("click", exprNext);

    byId("reviewGrades").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-grade]");
      if (btn) reviewGrade(btn.dataset.grade);
    });
    byId("reviewReset").addEventListener("click", function () {
      if (!Object.keys(state.srs).length) return;
      if (!window.confirm("Сбросить расписание повторений?")) return;
      state.srs = {}; save(LS.srs, state.srs);
      updateDueBadge(); renderReview();
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        fitAllWithin(document);
      }, 150);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { fitAllWithin(document); });
    }
  }

  init();
})();
