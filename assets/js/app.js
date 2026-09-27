(function () {
  "use strict";

  var LS = {
    known: "phys-trainer-known-v2",
    srs: "phys-trainer-srs-v2",
    stats: "phys-trainer-stats-v1"
  };
  // Старые ключи (прогресс хранился по индексам карточек и ломался при изменении набора).
  var LS_OLD = ["phys-trainer-known-v1", "phys-trainer-srs-v1"];
  var KATEX_DISPLAY = { throwOnError: false, displayMode: true, strict: "ignore", trust: false };
  var KATEX_INLINE = { throwOnError: false, displayMode: false, strict: "ignore", trust: false };
  var DAY = 86400000;

  var SECTION_TITLE = {};
  window.SECTIONS.forEach(function (s) { SECTION_TITLE[s.id] = s.title; });

  // Стабильный ID карточки (не зависит от порядка и дробления карточек).
  function cardId(card) { return card.s + "::" + card.t; }
  var CARD_ENTRIES = window.CARDS.map(function (c) { return { card: c, id: cardId(c) }; });

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
    stats: load(LS.stats, { unitOk: 0, unitBad: 0, formulaOk: 0, formulaBad: 0, exprOk: 0, exprBad: 0 }),
    unit: { current: null, asked: 0 },
    formula: { order: [], pos: 0, pool: null },
    expr: { order: [], pos: 0, pool: null },
    review: { queue: [] }
  };
  // Восстанавливаем недостающие счётчики после добавления режима «Формулы».
  if (state.stats.formulaOk === undefined) state.stats.formulaOk = 0;
  if (state.stats.formulaBad === undefined) state.stats.formulaBad = 0;

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
        li.appendChild(document.createTextNode(" — "));
        appendRich(li, v.n);
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
    var base = CARD_ENTRIES.slice();
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

  /* ---------- Общее для тестов: варианты и их подгонка ---------- */
  function buildChoices(correctText, poolValues, count) {
    var others = poolValues.filter(function (v) { return v !== correctText; });
    shuffleArr(others);
    var out = [{ ok: true, text: correctText }];
    others.slice(0, count).forEach(function (v) { out.push({ ok: false, text: v }); });
    return shuffleArr(out);
  }

  function renderOptions(box, choices, decorate, onPick) {
    box.innerHTML = "";
    choices.forEach(function (choice) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      if (choice.ok) btn.dataset.correct = "1";
      decorate(btn, choice);
      btn.addEventListener("click", function () { onPick(btn, choice); });
      box.appendChild(btn);
    });
  }

  function renderTextOptions(box, choices, onPick) {
    renderOptions(box, choices, function (btn, c) { btn.textContent = c.text; }, onPick);
  }

  function renderMathOptions(box, choices, onPick) {
    renderOptions(box, choices, function (btn, c) {
      var span = document.createElement("span");
      renderMathInline(span, c.text);
      btn.appendChild(span);
    }, onPick);
    window.requestAnimationFrame(function () { fitOptions(box); });
  }

  // Уменьшает длинные формулы в вариантах, чтобы они влезали в кнопку.
  function fitOptions(box) {
    box.querySelectorAll(".option").forEach(function (btn) {
      var node = btn.querySelector(".katex");
      if (!node) return;
      node.style.transform = "";
      node.style.transformOrigin = "center center";
      var availW = btn.clientWidth - 14;
      var availH = btn.clientHeight - 14;
      if (availW <= 0 || availH <= 0) return;
      var w = node.offsetWidth, h = node.offsetHeight;
      if (!w || !h) return;
      var scale = Math.min(1, availW / w, availH / h);
      if (scale < 0.999) node.style.transform = "scale(" + scale.toFixed(4) + ")";
    });
  }

  function answerOption(box, btn, ok, feedbackEl, okText, badText) {
    box.querySelectorAll(".option").forEach(function (b) {
      b.disabled = true;
      if (b.dataset.correct) b.classList.add("is-correct");
    });
    if (!ok) btn.classList.add("is-wrong");
    feedbackEl.textContent = ok ? okText : badText;
    feedbackEl.className = "feedback " + (ok ? "feedback--ok" : "feedback--bad");
  }

  /* ---------- Режим «Единицы» ---------- */
  var unitPool = [];
  window.CARDS.forEach(function (c) {
    (c.vars || []).forEach(function (v) {
      if (v.u !== undefined) unitPool.push({ section: c.s, sym: v.s, name: v.n, unit: v.u });
    });
  });
  var unitAll = unitPool.map(function (v) { return v.unit; })
    .filter(function (u, i, arr) { return arr.indexOf(u) === i; });

  function unitNewQuestion() {
    var next;
    do { next = unitPool[Math.floor(Math.random() * unitPool.length)]; }
    while (unitPool.length > 1 && state.unit.current && next.sym === state.unit.current.sym && next.name === state.unit.current.name);
    state.unit.current = next;
    state.unit.asked++;
    state.unit.answered = false;

    renderMathInline(byId("unitSymbol"), next.sym);
    byId("unitName").textContent = next.name;
    byId("unitFeedback").textContent = "";
    byId("unitFeedback").className = "feedback";
    unitMeta();

    renderTextOptions(byId("unitOptions"), buildChoices(next.unit, unitAll, 3), function (btn, c) {
      unitAnswer(btn, c.ok, next.unit);
    });
  }
  function unitMeta() {
    var s = state.stats;
    byId("unitMeta").textContent = "Вопрос " + state.unit.asked + " · Верно " + s.unitOk + " · Ошибок " + s.unitBad;
    byId("unitReset").disabled = (s.unitOk + s.unitBad) === 0;
  }
  function unitAnswer(btn, ok, correctUnit) {
    if (state.unit.answered) return;
    state.unit.answered = true;
    if (ok) { state.stats.unitOk++; } else { state.stats.unitBad++; }
    save(LS.stats, state.stats);
    answerOption(byId("unitOptions"), btn, ok, byId("unitFeedback"), "Верно!",
      "Неверно. Правильный ответ: [" + correctUnit + "]");
    unitMeta();
  }

  /* ---------- Режим «Формулы» ---------- */
  function formulaNewOrder() {
    state.formula.pool = CARD_ENTRIES;
    state.formula.order = shuffleArr(state.formula.pool.map(function (_, i) { return i; }));
    state.formula.pos = 0;
  }
  // Три дистрактора — другие формулы того же раздела.
  function formulaDistractors(answer, section) {
    var same = window.CARDS.filter(function (c) { return c.s === section && c.f !== answer; });
    shuffleArr(same);
    var res = [];
    for (var i = 0; i < same.length && res.length < 3; i++) {
      if (res.indexOf(same[i].f) === -1) res.push(same[i].f);
    }
    return res;
  }
  function formulaRender() {
    if (!state.formula.order.length) formulaNewOrder();
    var entry = state.formula.pool[state.formula.order[state.formula.pos % state.formula.order.length]];
    state.formula.answered = false;

    byId("formulaSection").textContent = SECTION_TITLE[entry.card.s] || "";
    byId("formulaName").textContent = entry.card.t;
    byId("formulaFeedback").textContent = "";
    byId("formulaFeedback").className = "feedback";
    formulaMeta();

    renderMathOptions(byId("formulaOptions"),
      buildChoices(entry.card.f, formulaDistractors(entry.card.f, entry.card.s), 3),
      function (btn, c) { formulaAnswer(btn, c.ok); });
  }
  function formulaMeta() {
    var s = state.stats, total = window.CARDS.length;
    byId("formulaMeta").textContent = "Задача " + (state.formula.pos + 1) + " из " + total +
      " · Верно " + s.formulaOk + " · Ошибок " + s.formulaBad;
    byId("formulaReset").disabled = (s.formulaOk + s.formulaBad) === 0;
  }
  function formulaAnswer(btn, ok) {
    if (state.formula.answered) return;
    state.formula.answered = true;
    if (ok) { state.stats.formulaOk++; } else { state.stats.formulaBad++; }
    save(LS.stats, state.stats);
    answerOption(byId("formulaOptions"), btn, ok, byId("formulaFeedback"), "Верно!",
      "Неверно — верный вариант выделен.");
    formulaMeta();
  }
  function formulaNext() {
    state.formula.pos++;
    if (state.formula.pos >= state.formula.order.length) formulaNewOrder();
    formulaRender();
  }

  /* ---------- Режим «Выражения» ---------- */
  function exprNewOrder() {
    // Ручные задачи + авто-задачи по всем карточкам (кроме тех, где выразить нельзя).
    var auto = (window.ExprSolver && window.ExprSolver.buildTasks)
      ? window.ExprSolver.buildTasks(window.CARDS).tasks
      : [];
    var all = window.TASKS.concat(auto);
    var seen = {}, pool = [];
    all.forEach(function (t) {
      if (!t || !t.q || seen[t.q]) return;
      seen[t.q] = 1;
      pool.push(t);
    });
    state.expr.pool = pool;
    state.expr.order = shuffleArr(pool.map(function (_, i) { return i; }));
    state.expr.pos = 0;
  }
  function exprRender() {
    if (!state.expr.order.length) exprNewOrder();
    var task = state.expr.pool[state.expr.order[state.expr.pos % state.expr.order.length]];
    state.expr.answered = false;

    // «Выразите $t$ из $v = v_0 + at$» → заголовок «Выразите $t$», тело — формула.
    var q = String(task.q);
    var parts = q.split(" из ");
    var head = parts.length === 2 ? parts[0] : q;
    var body = parts.length === 2 ? parts[1] : "";

    var headEl = byId("exprPrompt");
    headEl.innerHTML = "";
    appendRich(headEl, head);
    var bodyEl = byId("exprBody");
    bodyEl.innerHTML = "";
    appendRich(bodyEl, body);
    bodyEl.hidden = !body;

    byId("exprFeedback").textContent = "";
    byId("exprFeedback").className = "feedback";
    exprMeta();

    renderMathOptions(byId("exprOptions"),
      shuffleArr([{ ok: true, text: task.a }].concat(task.wrong.map(function (w) { return { ok: false, text: w }; }))),
      function (btn, c) { exprAnswer(btn, c.ok); });
  }
  function exprMeta() {
    var s = state.stats, total = state.expr.pool ? state.expr.pool.length : window.TASKS.length;
    byId("exprMeta").textContent = "Задача " + (state.expr.pos + 1) + " из " + total +
      " · Верно " + s.exprOk + " · Ошибок " + s.exprBad;
    byId("exprReset").disabled = (s.exprOk + s.exprBad) === 0;
  }
  function exprAnswer(btn, ok) {
    if (state.expr.answered) return;
    state.expr.answered = true;
    if (ok) { state.stats.exprOk++; } else { state.stats.exprBad++; }
    save(LS.stats, state.stats);
    answerOption(byId("exprOptions"), btn, ok, byId("exprFeedback"), "Верно!",
      "Неверно — верный вариант выделен.");
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
    return CARD_ENTRIES
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
    return CARD_ENTRIES.reduce(function (n, e) {
      var st = state.srs[e.id];
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
    byId("reviewReset").disabled = Object.keys(state.srs).length === 0;

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
    byId("viewFormulas").hidden = mode !== "formulas";
    byId("viewExpr").hidden = mode !== "expr";
    byId("viewReview").hidden = mode !== "review";
    byId("progress").style.display = mode === "cards" ? "" : "none";

    if (mode === "cards") renderBrowse();
    else if (mode === "units") { if (!state.unit.current) unitNewQuestion(); unitMeta(); }
    else if (mode === "formulas") { if (!state.formula.order.length) formulaNewOrder(); formulaRender(); }
    else if (mode === "expr") { if (!state.expr.order.length) exprNewOrder(); exprRender(); }
    else if (mode === "review") renderReview();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Инициализация ---------- */
  function init() {
    LS_OLD.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* недоступно */ } });
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

    byId("unitNext").addEventListener("click", unitNewQuestion);
    byId("unitReset").addEventListener("click", function () {
      if ((state.stats.unitOk + state.stats.unitBad) === 0) return;
      if (!window.confirm("Сбросить прогресс в режиме «Единицы»?")) return;
      state.stats.unitOk = 0;
      state.stats.unitBad = 0;
      state.unit.asked = 0;
      save(LS.stats, state.stats);
      unitNewQuestion();
    });

    byId("formulaNext").addEventListener("click", formulaNext);
    byId("formulaReset").addEventListener("click", function () {
      if ((state.stats.formulaOk + state.stats.formulaBad) === 0) return;
      if (!window.confirm("Сбросить прогресс в режиме «Формулы»?")) return;
      state.stats.formulaOk = 0;
      state.stats.formulaBad = 0;
      save(LS.stats, state.stats);
      formulaNewOrder();
      formulaRender();
    });

    byId("exprNext").addEventListener("click", exprNext);
    byId("exprReset").addEventListener("click", function () {
      if ((state.stats.exprOk + state.stats.exprBad) === 0) return;
      if (!window.confirm("Сбросить прогресс в режиме «Выражения»?")) return;
      state.stats.exprOk = 0;
      state.stats.exprBad = 0;
      save(LS.stats, state.stats);
      exprNewOrder();
      exprRender();
    });

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
        if (state.mode === "formulas") fitOptions(byId("formulaOptions"));
        if (state.mode === "expr") fitOptions(byId("exprOptions"));
      }, 150);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { fitAllWithin(document); });
    }
  }

  init();
})();
