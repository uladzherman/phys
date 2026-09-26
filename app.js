(function () {
  "use strict";

  var LS_KEY = "phys-trainer-known-v1";
  var KATEX_OPTS = { throwOnError: false, displayMode: true, strict: "ignore", trust: false };

  var SECTION_TITLE = {};
  window.SECTIONS.forEach(function (s) { SECTION_TITLE[s.id] = s.title; });

  var state = {
    section: "all",
    shuffled: false,
    list: [],
    known: loadKnown()
  };

  var gridEl = document.getElementById("grid");
  var emptyEl = document.getElementById("empty");
  var chipsEl = document.getElementById("sectionChips");
  var progressFill = document.getElementById("progressFill");
  var progressLabel = document.getElementById("progressLabel");
  var shuffleBtn = document.getElementById("shuffleBtn");
  var resetBtn = document.getElementById("resetBtn");

  function loadKnown() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveKnown() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(state.known)));
    } catch (e) { /* localStorage недоступен — молча игнорируем */ }
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
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
        state.section = id;
        state.shuffled = false;
        Array.prototype.forEach.call(chipsEl.children, function (c) {
          c.classList.toggle("is-active", c.dataset.section === id);
        });
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      return btn;
    }

    frag.appendChild(makeChip("all", "Все разделы"));
    window.SECTIONS.forEach(function (s) {
      frag.appendChild(makeChip(s.id, s.title));
    });

    chipsEl.appendChild(frag);
  }

  function buildList() {
    var base = window.CARDS.map(function (c, i) {
      return { card: c, id: i };
    });
    state.list = state.section === "all"
      ? base
      : base.filter(function (x) { return x.card.s === state.section; });
    if (state.shuffled) shuffle(state.list);
    return state.list;
  }

  function renderFormula(el, latex) {
    if (window.katex) {
      try {
        window.katex.render(latex, el, KATEX_OPTS);
        return;
      } catch (e) { /* упадём в фолбэк ниже */ }
    }
    var code = document.createElement("code");
    code.textContent = latex;
    el.appendChild(code);
  }

  var INLINE_OPTS = { throwOnError: false, displayMode: false, strict: "ignore", trust: false };

  function renderMathInline(el, latex) {
    if (window.katex) {
      try {
        window.katex.render(latex, el, INLINE_OPTS);
        return;
      } catch (e) { /* фолбэк ниже */ }
    }
    el.textContent = latex;
  }

  // Рендерит строку со вставками $...$: текст — как есть, математика — через KaTeX.
  function appendRich(parent, text) {
    if (!text) return;
    var parts = String(text).split("$");
    parts.forEach(function (part, i) {
      if (i % 2 === 1) {
        var span = document.createElement("span");
        renderMathInline(span, part);
        parent.appendChild(span);
      } else if (part) {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  // Масштабирует формулу так, чтобы она целиком помещалась в карточке.
  function fitFormula(container) {
    var node = container.querySelector(".katex-display") || container.querySelector(".katex");
    if (!node) return;
    node.style.transform = "";
    node.style.transformOrigin = "center center";

    var availW = container.clientWidth;
    var availH = container.clientHeight;
    if (availW <= 0 || availH <= 0) return;

    var w = node.offsetWidth || node.scrollWidth;
    var h = node.offsetHeight || node.scrollHeight;
    if (!w || !h) return;

    var scale = Math.min(1, (availW - 6) / w, (availH - 6) / h);
    if (scale < 0.999) {
      node.style.transform = "scale(" + scale.toFixed(4) + ")";
    }
  }

  function fitAll() {
    gridEl.querySelectorAll(".formula").forEach(fitFormula);
  }

  function createCard(entry) {
    var card = entry.card;
    var id = entry.id;

    var el = document.createElement("div");
    el.className = "card" + (state.known.has(id) ? " is-known" : "");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-pressed", "false");
    el.setAttribute("aria-label", card.t);
    el.dataset.id = id;

    var inner = document.createElement("div");
    inner.className = "card__inner";

    // Лицевая сторона — описание
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

    front.appendChild(badge);
    front.appendChild(title);
    front.appendChild(hint);

    // Оборот — формула
    var back = document.createElement("div");
    back.className = "card__face card__face--back";

    var badgeBack = document.createElement("span");
    badgeBack.className = "badge";
    badgeBack.textContent = SECTION_TITLE[card.s] || "";

    var formula = document.createElement("div");
    formula.className = "formula";
    renderFormula(formula, card.f);

    var meta = document.createElement("div");
    meta.className = "card__meta";

    if (card.cond) {
      var cond = document.createElement("p");
      cond.className = "cond";
      var condLabel = document.createElement("strong");
      condLabel.textContent = "Условие. ";
      cond.appendChild(condLabel);
      appendRich(cond, card.cond);
      meta.appendChild(cond);
    }

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
        if (v.u) {
          var unit = document.createElement("span");
          unit.className = "unit";
          unit.textContent = " [" + v.u + "]";
          li.appendChild(unit);
        }
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

    var actions = document.createElement("div");
    actions.className = "card__actions";

    var knownBtn = document.createElement("button");
    knownBtn.type = "button";
    knownBtn.className = "known-btn";
    knownBtn.textContent = state.known.has(id) ? "✓ Изучено" : "Отметить изученным";
    knownBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleKnown(id, el, knownBtn);
    });

    actions.appendChild(knownBtn);

    back.appendChild(badgeBack);
    back.appendChild(formula);
    back.appendChild(meta);
    back.appendChild(actions);

    inner.appendChild(front);
    inner.appendChild(back);

    el.appendChild(inner);

    function flip() {
      var flipped = el.classList.toggle("is-flipped");
      el.setAttribute("aria-pressed", String(flipped));
    }

    el.addEventListener("click", flip);
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        flip();
      }
    });

    return el;
  }

  function toggleKnown(id, el, btn) {
    if (state.known.has(id)) {
      state.known.delete(id);
      el.classList.remove("is-known");
      if (btn) btn.textContent = "Отметить изученным";
    } else {
      state.known.add(id);
      el.classList.add("is-known");
      if (btn) btn.textContent = "✓ Изучено";
    }
    saveKnown();
    updateProgress();
  }

  function updateProgress() {
    var total = window.CARDS.length;
    var done = state.known.size;
    var pct = total ? Math.round((done / total) * 100) : 0;
    progressFill.style.width = pct + "%";
    progressLabel.textContent = done + " / " + total;
  }

  function render() {
    buildList();
    gridEl.innerHTML = "";

    if (!state.list.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    var frag = document.createDocumentFragment();
    state.list.forEach(function (entry) {
      frag.appendChild(createCard(entry));
    });
    gridEl.appendChild(frag);
    window.requestAnimationFrame(fitAll);
  }

  shuffleBtn.addEventListener("click", function () {
    state.shuffled = true;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  resetBtn.addEventListener("click", function () {
    if (!state.known.size) return;
    if (!window.confirm("Сбросить весь прогресс изучения?")) return;
    state.known.clear();
    saveKnown();
    render();
    updateProgress();
  });

  buildChips();
  render();
  updateProgress();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(fitAll, 150);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitAll);
  }
})();
