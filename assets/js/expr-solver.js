/*
 * Мини-решатель формул для режима «Выражения».
 * Разбирает LaTeX-подмножество из data/cards.js, выражает переменную и
 * проверяет результат численной подстановкой. Нерешаемое пропускается.
 */
(function (global) {
  "use strict";

  var GREEK = {
    alpha: ["alpha", "\\alpha"], beta: ["beta", "\\beta"], gamma: ["gamma", "\\gamma"],
    delta: ["delta", "\\delta"], epsilon: ["epsilon", "\\epsilon"], varepsilon: ["epsilon", "\\varepsilon"],
    mu: ["mu", "\\mu"], rho: ["rho", "\\rho"], nu: ["nu", "\\nu"], omega: ["omega", "\\omega"],
    varphi: ["phi", "\\varphi"], phi: ["phi", "\\phi"], lambda: ["lambda", "\\lambda"],
    pi: ["pi", "\\pi"], tau: ["tau", "\\tau"], sigma: ["sigma", "\\sigma"], eta: ["eta", "\\eta"],
    theta: ["theta", "\\theta"], gamma_: ["gamma", "\\gamma"]
  };
  var GREEK_UPPER = { Phi: ["Phi", "\\Phi"], Delta: null };
  var NO_TARGET = { pi: 1, e: 1 };

  var CYR = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y",
    "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
    "х":"h","ц":"c","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"
  };
  function translit(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      out += (CYR[c] !== undefined ? CYR[c] : c);
    }
    return out.replace(/[^A-Za-z0-9]/g, "");
  }

  /* ---------------- Парсер ---------------- */
  function Parser(src) { this.s = src; this.i = 0; this.names = {}; this.bad = false; }

  Parser.prototype.ws = function () {
    var s = this.s;
    for (;;) {
      var c = s[this.i];
      if (c === undefined) return;
      if (/\s/.test(c) || c === "~") { this.i++; continue; }
      if (c === "\\") {
        var m = /^\\([A-Za-z]+|.)/.exec(s.slice(this.i));
        var cmd = m ? m[1] : "";
        if (cmd === "!" || cmd === "," || cmd === ";" || cmd === ":" || cmd === " " ||
            cmd === "quad" || cmd === "qquad" || cmd === "left" || cmd === "right" || cmd === "mspace") {
          this.i += m[0].length; continue;
        }
      }
      return;
    }
  };

  Parser.prototype.fail = function () { this.bad = true; return null; };

  Parser.prototype.group = function () {
    this.ws();
    if (this.s[this.i] === "{") {
      this.i++;
      var e = this.expr();
      this.ws();
      if (this.s[this.i] === "}") this.i++;
      return e;
    }
    return this.atom();
  };

  Parser.prototype.rawGroup = function () {
    this.ws();
    if (this.s[this.i] !== "{") {
      var c = this.s[this.i++];
      return c === undefined ? "" : c;
    }
    this.i++;
    var depth = 1, out = "";
    while (this.i < this.s.length && depth > 0) {
      var c2 = this.s[this.i++];
      if (c2 === "{") depth++;
      else if (c2 === "}") { depth--; if (!depth) break; }
      if (depth > 0) out += c2;
    }
    return out;
  };

  function subsToName(raw) {
    var t = raw;
    t = t.replace(/\\text\{([^}]*)\}/g, function (_, x) { return translit(x); });
    t = t.replace(/\\mathrm\{([^}]*)\}/g, "$1");
    t = t.replace(/\\Delta/g, "d").replace(/\\max/g, "max").replace(/\\min/g, "min");
    t = t.replace(/\\([A-Za-z]+)/g, function (_, c) { return GREEK[c] ? GREEK[c][0] : c; });
    return translit(t);
  }
  function subsToDisplay(raw) {
    var t = raw.trim();
    t = t.replace(/\\text\{([^}]*)\}/g, "\\text{$1}");
    return t;
  }

  Parser.prototype.subscript = function () {
    this.ws();
    if (this.s[this.i] !== "_") return null;
    this.i++;
    var raw = this.rawGroup();
    var name = subsToName(raw), disp = subsToDisplay(raw);
    if (!name) return null;
    return { name: name, disp: disp };
  };

  Parser.prototype.exponent = function (base) {
    this.ws();
    if (this.s[this.i] !== "^") return base;
    this.i++;
    var e = this.group();
    return { k: "pow", a: base, b: e };
  };

  Parser.prototype.number = function () {
    var m = /^[0-9]+(?:\.[0-9]+)?/.exec(this.s.slice(this.i));
    this.i += m[0].length;
    return { k: "num", v: parseFloat(m[0]) };
  };

  Parser.prototype.atom = function () {
    this.ws();
    var s = this.s, c = s[this.i];
    if (c === undefined) return this.fail();
    if (c === "-") { this.i++; return { k: "neg", a: this.atom() }; }
    if (c === "+") { this.i++; return this.atom(); }
    if (c === "(") { this.i++; var e = this.expr(); this.ws(); if (s[this.i] === ")") this.i++; return e; }
    if (c === "|") return this.fail();
    if (/[0-9]/.test(c)) return this.number();
    if (c === "{") {
      var inner = this.group();
      this.ws();
      if (s[this.i] === "^" || s[this.i] === "_") return this.fail();
      return inner;
    }
    if (c === "\\") return this.commandAtom();
    if (/[A-Za-z]/.test(c)) {
      this.i++;
      var name = c, disp = c;
      var sub = this.subscript();
      if (sub) { name += sub.name; disp += "_{" + sub.disp + "}"; }
      if (this.names[name] === undefined) this.names[name] = disp;
      return this.exponent({ k: "id", name: name });
    }
    return this.fail();
  };

  Parser.prototype.commandAtom = function () {
    var m = /^\\([A-Za-z]+)/.exec(this.s.slice(this.i));
    if (!m) return this.fail();
    var cmd = m[1];
    this.i += m[0].length;

    if (GREEK[cmd]) {
      var nm = GREEK[cmd][0];
      if (this.names[nm] === undefined) this.names[nm] = GREEK[cmd][1];
      return this.exponent({ k: "id", name: nm });
    }
    if (cmd === "Phi") { if (this.names.Phi === undefined) this.names.Phi = "\\Phi"; return this.exponent({ k: "id", name: "Phi" }); }
    if (cmd === "Delta") {
      this.ws();
      var nx = this.s[this.i];
      if (!/[A-Za-z]/.test(nx || "")) return this.fail();
      this.i++;
      var nm2 = "d" + nx, disp2 = "\\Delta " + nx;
      var sub2 = this.subscript();
      if (sub2) { nm2 += sub2.name; disp2 += "_{" + sub2.disp + "}"; }
      if (this.names[nm2] === undefined) this.names[nm2] = disp2;
      return this.exponent({ k: "id", name: nm2 });
    }
    if (cmd === "vec") {
      var g = this.group();
      return g;
    }
    if (cmd === "mathcal") {
      var letter = (this.s[this.i] === "{") ? this.rawGroup() : this.s[this.i++];
      var nm3 = letter, disp3 = "\\mathcal{" + letter + "}";
      if (this.names[nm3] === undefined) this.names[nm3] = disp3;
      return this.exponent({ k: "id", name: nm3 });
    }
    if (cmd === "sqrt") {
      var inner = this.group();
      return this.exponent({ k: "sqrt", a: inner });
    }
    if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
      var a = this.group(), b = this.group();
      return this.exponent({ k: "div", a: a, b: b });
    }
    if (cmd === "sin" || cmd === "cos") {
      this.ws();
      if (this.s[this.i] !== "(") return this.fail();
      this.i++;
      var arg = this.expr();
      this.ws();
      if (this.s[this.i] === ")") this.i++;
      return this.exponent({ k: "fn", name: cmd, a: arg });
    }
    return this.fail();
  };

  Parser.prototype.power = function () {
    var a = this.atom();
    if (!a) return a;
    return a;
  };

  Parser.prototype.term = function () {
    var node = this.power();
    for (;;) {
      this.ws();
      var c = this.s[this.i];
      if (c === "*" || c === "/") {
        this.i++;
        var r = this.power();
        node = { k: c === "*" ? "mul" : "div", a: node, b: r };
        continue;
      }
      if (c === "\\") {
        var m = /^\\([A-Za-z]+)/.exec(this.s.slice(this.i));
        if (m && (m[1] === "cdot" || m[1] === "times" || m[1] === "ast")) {
          this.i += m[0].length;
          node = { k: "mul", a: node, b: this.power() };
          continue;
        }
      }
      if (this.startsAtom()) { node = { k: "mul", a: node, b: this.power() }; continue; }
      return node;
    }
  };

  Parser.prototype.startsAtom = function () {
    this.ws();
    var c = this.s[this.i];
    if (c === undefined) return false;
    if (/[0-9A-Za-z]/.test(c)) return true;
    if (c === "(" || c === "{") return true;
    if (c === "\\") {
      var m = /^\\([A-Za-z]+)/.exec(this.s.slice(this.i));
      if (!m) return false;
      var cmd = m[1];
      return !!GREEK[cmd] || cmd === "Delta" || cmd === "vec" || cmd === "mathcal" ||
        cmd === "sqrt" || cmd === "frac" || cmd === "dfrac" || cmd === "sin" || cmd === "cos" ||
        cmd === "Phi";
    }
    return false;
  };

  Parser.prototype.expr = function () {
    var node = this.term();
    for (;;) {
      this.ws();
      var c = this.s[this.i];
      if (c === "+" || c === "-") {
        this.i++;
        var r = this.term();
        node = { k: c === "+" ? "add" : "sub", a: node, b: r };
        continue;
      }
      return node;
    }
  };

  Parser.prototype.equation = function () {
    var left = this.expr();
    this.ws();
    if (this.s[this.i] !== "=") return null;
    this.i++;
    var right = this.expr();
    this.ws();
    if (this.i < this.s.length && !/^\s*$/.test(this.s.slice(this.i)) && this.s[this.i] !== "}") return null;
    if (this.bad || !left || !right) return null;
    return { k: "eq", a: left, b: right };
  };

  /* ---------------- Обход и утилиты ---------------- */
  function collect(node, set) {
    if (!node) return set;
    if (node.k === "id") set[node.name] = 1;
    else if (node.k === "eq" || node.k === "add" || node.k === "sub" || node.k === "mul" || node.k === "div" || node.k === "pow") {
      collect(node.a, set); collect(node.b, set);
    } else if (node.k === "neg" || node.k === "sqrt" || node.k === "fn") collect(node.a, set);
    return set;
  }
  function countVar(node, name) {
    if (!node) return 0;
    if (node.k === "id") return node.name === name ? 1 : 0;
    if (node.k === "num") return 0;
    if (node.k === "eq" || node.k === "add" || node.k === "sub" || node.k === "mul" || node.k === "div" || node.k === "pow") {
      return countVar(node.a, name) + countVar(node.b, name);
    }
    if (node.k === "neg") return countVar(node.a, name);
    return 0;
  }
  function isNum(node, v) { return node && node.k === "num" && (v === undefined || Math.abs(node.v - v) < 1e-12); }

  function hasFn(node) {
    if (!node) return false;
    if (node.k === "fn") return true;
    if (node.k === "eq" || node.k === "add" || node.k === "sub" || node.k === "mul" || node.k === "div" || node.k === "pow") {
      return hasFn(node.a) || hasFn(node.b);
    }
    if (node.k === "neg" || node.k === "sqrt") return hasFn(node.a);
    return false;
  }

  /* ---------------- Решение ---------------- */
  function clone(n) {
    if (n === null || typeof n !== "object") return n;
    if (Array.isArray(n)) return n.map(clone);
    var o = {};
    for (var k in n) if (Object.prototype.hasOwnProperty.call(n, k)) o[k] = clone(n[k]);
    return o;
  }

  // e = rhs  =>  выражение переменной x
  function solveE(e, x, rhs) {
    if (countVar(e, x) === 0) return null;
    if (e.k === "id") return e.name === x ? rhs : null;

    if (e.k === "neg") return solveE(e.a, x, { k: "neg", a: rhs });

    if (e.k === "add" || e.k === "sub") {
      var inA = countVar(e.a, x) > 0, inB = countVar(e.b, x) > 0;
      if (inA && inB) return null;
      if (inA) {
        var m1 = { k: e.k === "add" ? "sub" : "add", a: rhs, b: clone(e.b) };
        return solveE(e.a, x, m1);
      }
      var m2 = e.k === "add" ? { k: "sub", a: rhs, b: clone(e.a) } : { k: "sub", a: clone(e.a), b: rhs };
      return solveE(e.b, x, m2);
    }

    if (e.k === "mul") {
      var aIn = countVar(e.a, x) > 0, bIn = countVar(e.b, x) > 0;
      if (aIn && bIn) return null;
      if (aIn) return solveE(e.a, x, { k: "div", a: rhs, b: clone(e.b) });
      return solveE(e.b, x, { k: "div", a: rhs, b: clone(e.a) });
    }

    if (e.k === "div") {
      var aIn2 = countVar(e.a, x) > 0, bIn2 = countVar(e.b, x) > 0;
      if (aIn2 && bIn2) return null;
      if (aIn2) return solveE(e.a, x, { k: "mul", a: rhs, b: clone(e.b) });
      return solveE(e.b, x, { k: "div", a: clone(e.a), b: rhs });
    }

    if (e.k === "sqrt") {
      if (countVar(e.a, x) === 0) return null;
      return solveE(e.a, x, { k: "pow", a: rhs, b: { k: "num", v: 2 } });
    }

    if (e.k === "pow") {
      if (countVar(e.b, x) > 0) return null;
      if (!isNum(e.b)) return null;
      var n = Math.round(e.b.v);
      if (Math.abs(e.b.v - n) > 1e-9 || n === 0) return null;
      var inv = (n === 2)
        ? { k: "sqrt", a: rhs }
        : { k: "pow", a: rhs, b: { k: "div", a: { k: "num", v: 1 }, b: { k: "num", v: n } } };
      return solveE(e.a, x, inv);
    }

    return null;
  }

  /* ---------------- Упрощение ---------------- */
  function simplify(n) {
    if (!n) return n;
    var a, b;
    switch (n.k) {
      case "num": case "id": return n;
      case "neg":
        a = simplify(n.a);
        if (isNum(a, 0)) return { k: "num", v: 0 };
        if (a.k === "neg") return a.a;
        if (a.k === "num") return { k: "num", v: -a.v };
        return { k: "neg", a: a };
      case "add": case "sub":
        a = simplify(n.a); b = simplify(n.b);
        if (isNum(a, 0)) return n.k === "add" ? b : { k: "neg", a: b };
        if (isNum(b, 0)) return a;
        if (a.k === "num" && b.k === "num") return { k: "num", v: n.k === "add" ? a.v + b.v : a.v - b.v };
        return { k: n.k, a: a, b: b };
      case "mul":
        a = simplify(n.a); b = simplify(n.b);
        if (isNum(a, 0) || isNum(b, 0)) return { k: "num", v: 0 };
        if (isNum(a, 1)) return b;
        if (isNum(b, 1)) return a;
        if (a.k === "num" && b.k === "num") return { k: "num", v: a.v * b.v };
        return { k: "mul", a: a, b: b };
      case "div":
        a = simplify(n.a); b = simplify(n.b);
        if (isNum(a, 0)) return { k: "num", v: 0 };
        if (isNum(b, 1)) return a;
        if (a.k === "num" && b.k === "num" && Math.abs(b.v) > 1e-12) {
          var q = a.v / b.v;
          if (Math.abs(q - Math.round(q)) < 1e-9) return { k: "num", v: Math.round(q) };
        }
        return { k: "div", a: a, b: b };
      case "pow":
        a = simplify(n.a); b = simplify(n.b);
        if (isNum(b, 1)) return a;
        if (isNum(b, 0)) return { k: "num", v: 1 };
        if (a.k === "num" && b.k === "num" && Math.abs(b.v - Math.round(b.v)) < 1e-9) {
          return { k: "num", v: Math.pow(a.v, Math.round(b.v)) };
        }
        return { k: "pow", a: a, b: b };
      case "sqrt":
        a = simplify(n.a);
        if (a.k === "num" && a.v >= 0) {
          var r = Math.sqrt(a.v);
          if (Math.abs(r - Math.round(r)) < 1e-9) return { k: "num", v: Math.round(r) };
        }
        return { k: "sqrt", a: a };
      case "fn":
        return { k: "fn", name: n.name, a: simplify(n.a) };
      default:
        return n;
    }
  }

  /* ---------------- Упрощение и рендер ---------------- */
  function flatten(node, num, den, neg) {
    if (!node) return;
    if (node.k === "neg") { flatten(node.a, num, den, !neg); return; }
    if (node.k === "mul") { flatten(node.a, num, den, neg); flatten(node.b, num, den, neg); return; }
    if (node.k === "div") {
      if (neg) { flatten(node.a, den, num, false); flatten(node.b, num, den, false); }
      else { flatten(node.a, num, den, false); flatten(node.b, den, num, false); }
      return;
    }
    if (node.k === "pow" && isNum(node.b) && node.b.v < 0) {
      var pos = { k: "pow", a: node.a, b: { k: "num", v: -node.b.v } };
      if (neg) den.push(pos); else num.push(pos);
      return;
    }
    var f = neg ? { k: "neg", a: node } : node;
    num.push(f);
  }

  function render(node) {
    if (!node) return "";
    if (node.k === "num") {
      var v = node.v;
      if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
      return String(parseFloat(v.toFixed(6)));
    }
    if (node.k === "id") return node.disp || node.name;
    if (node.k === "neg") {
      var inner = render(node.a);
      return "-" + ((node.a.k === "add" || node.a.k === "sub") ? "(" + inner + ")" : inner);
    }
    if (node.k === "add") return render(node.a) + " + " + render(node.b);
    if (node.k === "sub") return render(node.a) + " - " + render(node.b);
    if (node.k === "mul") {
      var parts = [];
      (function walk(x) {
        if (x && x.k === "mul") { walk(x.a); walk(x.b); }
        else if (x) parts.push(x);
      })(node);
      return parts.map(function (p) {
        var s = render(p);
        return (p.k === "add" || p.k === "sub") ? "(" + s + ")" : s;
      }).join(" \\cdot ");
    }
    if (node.k === "div") {
      return "\\dfrac{" + render(node.a) + "}{" + render(node.b) + "}";
    }
    if (node.k === "pow") {
      var base = render(node.a);
      if (node.a.k === "add" || node.a.k === "sub" || node.a.k === "mul" || node.a.k === "div") base = "(" + base + ")";
      var ex = node.b.k === "num" ? render(node.b) : "{" + render(node.b) + "}";
      return base + "^{" + ex + "}";
    }
    if (node.k === "sqrt") return "\\sqrt{" + render(node.a) + "}";
    if (node.k === "fn") return "\\" + node.name + "\\left(" + render(node.a) + "\\right)";
    return "";
  }

  // Красивый рендер: числитель/знаменатель и положительные степени
  function renderMul(list) {
    var rest = [], coef = 1;
    list.forEach(function (x) {
      if (x.k === "num") coef *= x.v;
      else rest.push(x);
    });
    var items = [];
    if (Math.abs(coef - 1) > 1e-12) items.push({ node: { k: "num", v: coef }, s: render({ k: "num", v: coef }) });
    rest.forEach(function (x) { items.push({ node: x, s: render(x) }); });
    if (!items.length) return "1";
    var multi = items.length > 1;
    return items.map(function (it) {
      var s = it.s;
      if (multi && (it.node.k === "add" || it.node.k === "sub")) s = "(" + s + ")";
      return s;
    }).join(" \\cdot ");
  }

  function factorKey(n) {
    if (!n) return null;
    if (n.k === "id") return "id:" + n.name;
    if (n.k === "pow") return "pow:" + render(n.a) + "^" + render(n.b);
    return null;
  }
  function gcd(a, b) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { var t = a % b; a = b; b = t; } return a || 1; }

  // Сокращение одинаковых множителей и общих числовых коэффициентов
  function cancelFactors(num, den) {
    var n = num.slice(), d = den.slice();
    for (var i = 0; i < n.length; i++) {
      var key = factorKey(n[i]);
      if (!key) continue;
      for (var j = 0; j < d.length; j++) {
        if (factorKey(d[j]) === key) { n.splice(i, 1); d.splice(j, 1); i--; break; }
      }
    }
    var cn = 1, cd = 1;
    n = n.filter(function (x) { if (x.k === "num") { cn *= x.v; return false; } return true; });
    d = d.filter(function (x) { if (x.k === "num") { cd *= x.v; return false; } return true; });
    if (Math.abs(cd) > 1e-12 && Math.abs(cn) > 1e-12 &&
        Math.abs(cn - Math.round(cn)) < 1e-9 && Math.abs(cd - Math.round(cd)) < 1e-9) {
      var g = gcd(cn, cd);
      if (g > 1) { cn /= g; cd /= g; }
    }
    if (Math.abs(cn - 1) > 1e-12) n.unshift({ k: "num", v: cn });
    if (Math.abs(cd - 1) > 1e-12) d.unshift({ k: "num", v: cd });
    return { num: n, den: d };
  }

  function renderAnswer(node) {
    var num = [], den = [];
    flatten(node, num, den, false);
    var r = cancelFactors(num, den);
    var numStr = renderMul(r.num), denStr = renderMul(r.den);
    if (!r.den.length) return numStr;
    return "\\dfrac{" + numStr + "}{" + denStr + "}";
  }

  /* ---------------- Численное вычисление ---------------- */
  function evalAst(node, env) {
    switch (node.k) {
      case "num": return node.v;
      case "id": return env[node.name];
      case "neg": return -evalAst(node.a, env);
      case "add": return evalAst(node.a, env) + evalAst(node.b, env);
      case "sub": return evalAst(node.a, env) - evalAst(node.b, env);
      case "mul": return evalAst(node.a, env) * evalAst(node.b, env);
      case "div": return evalAst(node.a, env) / evalAst(node.b, env);
      case "pow": return Math.pow(evalAst(node.a, env), evalAst(node.b, env));
      case "sqrt": return Math.sqrt(evalAst(node.a, env));
      case "fn": return node.name === "sin" ? Math.sin(evalAst(node.a, env)) : Math.cos(evalAst(node.a, env));
      default: return NaN;
    }
  }

  function randomEnv(names, seedOffset) {
    var env = {};
    names.forEach(function (n, i) {
      env[n] = 0.6 + (((i * 37 + seedOffset * 13) % 17) / 17) * 4;
    });
    return env;
  }

  function close(a, b) {
    if (!isFinite(a) || !isFinite(b)) return false;
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  }

  function verify(names, target, eq, answer) {
    for (var t = 1; t <= 24; t++) {
      var env = randomEnv(names, t);
      delete env[target];
      var got = evalAst(answer, env);
      if (!isFinite(got)) return false;
      env[target] = got;
      var l = evalAst(eq.a, env), r = evalAst(eq.b, env);
      if (!isFinite(l) || !isFinite(r)) return false;
      if (Math.abs(l - r) > 1e-6 * Math.max(1, Math.abs(l), Math.abs(r))) return false;
    }
    return true;
  }

  function differsFromTarget(names, target, answer, cand) {
    var sawDiff = false;
    for (var t = 1; t <= 16; t++) {
      var env = randomEnv(names, t + 50);
      var a = evalAst(answer, env), b = evalAst(cand, env);
      if (!isFinite(a) || !isFinite(b)) continue;
      if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))) sawDiff = true;
      else return false; // совпало хотя бы раз — считаем идентичным
    }
    return sawDiff;
  }

  function variesWithEnv(names, expr) {
    var vals = [];
    for (var t = 1; t <= 8; t++) {
      var v = evalAst(expr, randomEnv(names, t + 90));
      if (isFinite(v)) vals.push(v);
    }
    if (vals.length < 4) return true;
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    return (mx - mn) > 1e-6 * Math.max(1, Math.abs(mx));
  }

  /* ---------------- Дистракторы ---------------- */
  function mapIds(node, fn) {
    if (!node) return node;
    if (node.k === "id") return fn(node);
    if (node.k === "num") return node;
    var o = { k: node.k };
    if (node.k === "eq" || node.k === "add" || node.k === "sub" || node.k === "mul" || node.k === "div" || node.k === "pow") {
      o.a = mapIds(node.a, fn); o.b = mapIds(node.b, fn);
    } else if (node.k === "neg" || node.k === "sqrt" || node.k === "fn") {
      o.a = mapIds(node.a, fn); o.name = node.name;
    }
    return o;
  }

  function candidates(answer, names, target, idList) {
    var out = [];
    function push(n) { if (n) out.push(n); }

    // 1) типичные ошибки: переворот дроби, смена знака, потеря степени/корня, подмена переменной
    (function walk(n) {
      if (!n) return;
      if (n.k === "div") push({ k: "div", a: clone(n.b), b: clone(n.a) });
      if (n.k === "add" || n.k === "sub") push({ k: n.k === "add" ? "sub" : "add", a: clone(n.a), b: clone(n.b) });
      if (n.k === "pow" && isNum(n.b) && n.b.v > 1) push({ k: "pow", a: clone(n.a), b: { k: "num", v: n.b.v - 1 } });
      if (n.k === "sqrt") push(clone(n.a));
      if (n.k === "id" && n.name !== target) {
        var from = n.name;
        idList.forEach(function (nm) {
          if (nm === from) return;
          if (countVar(answer, nm) > 0) return; // не дублируем уже имеющуюся величину
          push(mapIds(clone(answer), function (x) {
            return x.name === from ? { k: "id", name: nm, disp: null } : x;
          }));
        });
      }
      walk(n.a);
      walk(n.b);
    })(answer);

    // 2) «забыли разделить» — умножаем на величину из знаменателя
    var numList = [], denList = [];
    flatten(answer, numList, denList, false);
    var denIds = collect(denList.length ? { k: "mul", a: denList[0], b: denList[denList.length - 1] } : null, {});
    Object.keys(denIds).forEach(function (nm) {
      push({ k: "mul", a: clone(answer), b: { k: "id", name: nm, disp: null } });
    });

    // 3) грубая подмена коэффициента (последний резерв)
    push({ k: "mul", a: clone(answer), b: { k: "num", v: 2 } });
    push({ k: "div", a: clone(answer), b: { k: "num", v: 2 } });
    return out;
  }

  /* ---------------- Сборка заданий ---------------- */
  function parseFormula(latex) {
    if (/\\sum|\\pm|\\approx|\\langle|\\rangle|\\to|\\big|\\%|\\begin|\\int|\\infty/.test(latex)) return null;
    var p = new Parser(latex);
    var eq = p.equation();
    if (!eq || p.bad) return null;
    var names = {};
    collect(eq.a, names); collect(eq.b, names);
    return { eq: eq, names: Object.keys(names), disp: p.names };
  }

  function buildTaskFor(card, parsed, target) {
    var disp = parsed.disp[target] || target;
    var lhs = clone(parsed.eq.a), rhs = clone(parsed.eq.b);
    // переносим всё в левую часть: L - R = 0
    var e = { k: "sub", a: lhs, b: rhs };
    var answer = simplify(solveE(e, target, { k: "num", v: 0 }));
    if (!answer) return null;
    if (countVar(answer, target) > 0) return null;
    if (hasFn(answer)) return null;

    var targetAst = { k: "id", name: target, disp: disp };
    if (!verify(parsed.names, target, parsed.eq, answer)) return null;

    // имена для отображения в ответе
    answer = withDisplay(answer, parsed.disp);

    var ids = parsed.names.filter(function (n) { return n !== target && !NO_TARGET[n]; });
    var cands = candidates(answer, parsed.names, target, ids);
    // предпочитаем варианты, близкие по записи к ответу (правдоподобные ошибки)
    var answerStr = renderAnswer(answer);
    var seen = {};
    seen[answerStr] = 1;
    cands = cands.map(function (c) {
      var s = withDisplay(simplify(c), parsed.disp);
      return { c: s, key: render(s) };
    }).filter(function (o) {
      return !seen[o.key] && variesWithEnv(parsed.names, o.c);
    }).sort(function (p, q) {
      return Math.abs(p.key.length - answerStr.length) - Math.abs(q.key.length - answerStr.length);
    });

    var wrong = [];
    for (var i = 0; i < cands.length && wrong.length < 3; i++) {
      if (seen[cands[i].key]) continue;
      if (!differsFromTarget(parsed.names, target, answer, cands[i].c)) continue;
      seen[cands[i].key] = 1;
      wrong.push(cands[i].c);
    }
    if (wrong.length < 3) return null;

    var verb = "Выразите $" + disp + "$ из $" + card.f + "$";
    return {
      q: verb,
      a: renderAnswer(answer),
      wrong: wrong.map(renderAnswer),
      auto: true,
      section: card.s
    };
  }

  function withDisplay(node, disp) {
    if (!node) return node;
    if (node.k === "id") {
      var nm = node.name;
      return { k: "id", name: nm, disp: disp[nm] || node.disp || nm };
    }
    if (node.k === "num") return node;
    var o = { k: node.k };
    if (node.k === "eq" || node.k === "add" || node.k === "sub" || node.k === "mul" || node.k === "div" || node.k === "pow") {
      o.a = withDisplay(node.a, disp); o.b = withDisplay(node.b, disp);
    } else if (node.k === "neg" || node.k === "sqrt" || node.k === "fn") {
      o.a = withDisplay(node.a, disp); o.name = node.name;
    }
    return o;
  }

  function isIsolated(eq, target) {
    return (eq.a.k === "id" && eq.a.name === target) || (eq.b.k === "id" && eq.b.name === target);
  }

  function buildTasks(cards) {
    var tasks = [], stats = { cards: 0, skipped: 0, solved: 0 };
    cards.forEach(function (card) {
      var parsed = parseFormula(card.f);
      if (!parsed || parsed.names.length < 2) { stats.skipped++; return; }
      var made = 0;
      parsed.names.forEach(function (target) {
        if (NO_TARGET[target]) return;
        if (countVar(parsed.eq.a, target) + countVar(parsed.eq.b, target) === 0) return;
        if (isIsolated(parsed.eq, target)) return; // величина уже выражена — задача тривиальна
        var t = buildTaskFor(card, parsed, target);
        if (t) { tasks.push(t); made++; }
      });
      if (made) { stats.cards++; stats.solved += made; } else stats.skipped++;
    });
    return { tasks: tasks, stats: stats };
  }

  global.ExprSolver = {
    buildTasks: buildTasks,
    _internals: {
      parseFormula: parseFormula, solveE: solveE, verify: verify, countVar: countVar,
      renderAnswer: renderAnswer, buildTaskFor: buildTaskFor, candidates: candidates,
      withDisplay: withDisplay, differsFromTarget: differsFromTarget
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
