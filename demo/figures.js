/* yourClass.online — проигрыватель интерактивных чертежей.
   Рисует на JSXGraph (demo/vendor), стиль — figures.css.
   Чертёж задаётся описанием (JSON-совместимый объект) и монтируется так:
     YCFig.mount(document.getElementById('fig'), spec)
   Типы описаний:
     solid — многогранник: поворот вокруг вертикальной оси, невидимые линии пунктиром, шаги построения;
     plot  — график функции и прямая y = параметр, точки пересечения и их число. */
(function () {
  'use strict';
  var JXG = window.JXG;
  JXG.Options.text.cssDefaultStyle = '';
  JXG.Options.text.highlightCssDefaultStyle = '';

  var DEG = Math.PI / 180, uid = 0, figures = [];

  /* ---------- общее ---------- */

  function palette(el) {
    var cs = getComputedStyle(el), g = function (n) { return cs.getPropertyValue(n).trim(); };
    return {
      surface: g('--ycf-surface'), ink: g('--ycf-ink'), muted: g('--ycf-muted'), grid: g('--ycf-grid'),
      main: g('--ycf-main'), done: g('--ycf-done'), nw: g('--ycf-new'), nwText: g('--ycf-new-text'),
      fill: g('--ycf-fill'), fillOpacity: parseFloat(g('--ycf-fill-opacity')) || 0.15,
      w: parseFloat(g('--ycf-line-w')) || 2, thin: parseFloat(g('--ycf-thin-w')) || 1.25
    };
  }

  // 2.5 → «2,5», −1 → «−1» (запятая и типографский минус, как в PDF)
  function fmt(x, digits) {
    return String(+x.toFixed(digits == null ? 2 : digits)).replace('.', ',').replace('-', '−');
  }
  function decimals(step) { var s = String(step), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  // A1 → A₁
  function sub(name) { return name.replace(/\d+/g, function (d) { return d.replace(/\d/g, function (c) { return String.fromCharCode(0x2080 + +c); }); }); }

  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function range(o) {
    var row = h('div', 'ycf-row'), lab = h('label', null, o.label), inp = h('input'), out = h('output');
    inp.type = 'range'; inp.min = o.min; inp.max = o.max; inp.step = o.step; inp.value = o.value;
    inp.id = 'ycf-r' + (++uid); lab.htmlFor = inp.id;
    out.innerHTML = o.format(o.value);
    inp.addEventListener('input', function () { var v = +inp.value; out.innerHTML = o.format(v); o.onInput(v); });
    row.append(lab, inp, out);
    return { row: row, input: inp, set: function (v) { inp.value = v; out.innerHTML = o.format(v); } };
  }

  function button(text, title, onClick) {
    var b = h('button', 'ycf-btn', text);
    b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  function makeBoard(box, bbox, interactive) {
    box.innerHTML = '';
    return JXG.JSXGraph.initBoard(box.id, {
      boundingbox: bbox, keepAspectRatio: true, axis: false, grid: false,
      showCopyright: false, showNavigation: false, showInfobox: false,
      pan: { enabled: false }, zoom: { enabled: false, wheel: false }, browserPan: true,
      registerEvents: !!interactive, resize: { enabled: false }
    });
  }

  // Фигура: доска + перестройка при смене темы и размера
  function Figure(fig, wide, build) {
    var box = h('div', 'ycf-board' + (wide ? ' wide' : ''));
    box.id = 'ycf-' + (++uid);
    fig.classList.add('ycf');
    fig.appendChild(box);
    var self = { box: box, board: null, lastW: 0 };
    self.rebuild = function () {
      if (self.board) JXG.JSXGraph.freeBoard(self.board);
      self.lastW = box.clientWidth;
      self.board = build(box, palette(fig));
    };
    if (window.ResizeObserver) {
      var pending = false;
      new ResizeObserver(function () {
        if (pending || Math.abs(box.clientWidth - self.lastW) < 1) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; self.rebuild(); });
      }).observe(box);
    }
    figures.push(self);
    return self;
  }

  function onTheme() { figures.forEach(function (f) { f.rebuild(); }); }
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------- векторы ---------- */

  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vmul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function lerp(a, b, t) { return vadd(a, vmul(vsub(b, a), t)); }
  function centroid(ps) { var c = [0, 0, 0]; ps.forEach(function (p) { c = vadd(c, p); }); return vmul(c, 1 / ps.length); }
  // точка пересечения прямых ab и cd (середина общего перпендикуляра — на случай погрешности)
  function meet(a, b, c, d) {
    var u = vsub(b, a), v = vsub(d, c), w = vsub(a, c);
    var A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w), den = A * C - B * B;
    var s = (B * E - C * D) / den, t = (A * E - B * D) / den;
    return vmul(vadd(vadd(a, vmul(u, s)), vadd(c, vmul(v, t))), 0.5);
  }

  /* ---------- solid: многогранник ---------- */

  var SOLID_LAYERS = [ // порядок = порядок отрисовки (снизу вверх)
    ['fill-done', function (p) { return { strokeWidth: 0, fillColor: p.fill, fillOpacity: p.fillOpacity }; }],
    ['fill-new', function (p) { return { strokeWidth: 0, fillColor: p.nw, fillOpacity: p.fillOpacity * 1.4 }; }],
    ['edge-h', function (p) { return { strokeColor: p.muted, strokeWidth: p.w * 0.75, dash: 2 }; }],
    ['aux-done-h', function (p) { return { strokeColor: p.muted, strokeWidth: p.thin, dash: 1 }; }],
    ['aux-done', function (p) { return { strokeColor: p.muted, strokeWidth: p.thin }; }],
    ['aux-new-h', function (p) { return { strokeColor: p.nw, strokeWidth: p.thin, dash: 1 }; }],
    ['aux-new', function (p) { return { strokeColor: p.nw, strokeWidth: p.thin }; }],
    ['edge', function (p) { return { strokeColor: p.ink, strokeWidth: p.w }; }],
    ['cut-done-h', function (p) { return { strokeColor: p.done, strokeWidth: p.w * 0.75, dash: 2 }; }],
    ['cut-new-h', function (p) { return { strokeColor: p.nw, strokeWidth: p.w * 0.75, dash: 2 }; }],
    ['cut-done', function (p) { return { strokeColor: p.done, strokeWidth: p.w }; }],
    ['cut-new', function (p) { return { strokeColor: p.nw, strokeWidth: p.w }; }]
  ];

  function solid(fig, spec) {
    // --- геометрия (не зависит от вида) ---
    var V = {}, defs = spec.points || {};
    Object.keys(spec.vertices).forEach(function (k) { V[k] = spec.vertices[k].slice(); });
    var c = centroid(Object.keys(spec.vertices).map(function (k) { return V[k]; }));
    Object.keys(defs).forEach(function (k) {
      var d = defs[k];
      if (d.at) V[k] = d.at.slice();
      else if (d.on) V[k] = lerp(V[d.on[0]], V[d.on[1]], d.on[2]);
      else if (d.mid) V[k] = centroid(d.mid.map(function (n) { return V[n]; }));
      else if (d.meet) V[k] = meet(V[d.meet[0][0]], V[d.meet[0][1]], V[d.meet[1][0]], V[d.meet[1][1]]);
    });
    var R = 0;
    Object.keys(V).forEach(function (k) { R = Math.max(R, Math.hypot.apply(null, vsub(V[k], c))); });
    var EPS = 1e-7 * R;

    var faces = spec.faces.map(function (f) {
      var p = f.map(function (k) { return V[k]; });
      var n = cross(vsub(p[1], p[0]), vsub(p[2], p[0]));
      if (dot(n, vsub(centroid(p), c)) < 0) n = vmul(n, -1);
      n = vmul(n, 1 / Math.hypot(n[0], n[1], n[2]));
      return { n: n, d: dot(n, p[0]) };
    });
    var edges = [], seen = {};
    spec.faces.forEach(function (f, i) {
      f.forEach(function (a, j) {
        var b = f[(j + 1) % f.length], key = a < b ? a + '|' + b : b + '|' + a;
        if (!seen[key]) { seen[key] = { a: a, b: b, faces: [] }; edges.push(seen[key]); }
        seen[key].faces.push(i);
      });
    });

    // элементы построения: шаг 0 — показаны всегда, шаги 1…N — по ползунку
    var steps = spec.steps || [], items = [];
    (spec.show || []).forEach(function (it) { items.push(Object.assign({ step: 0 }, it)); });
    steps.forEach(function (s, i) { s.items.forEach(function (it) { items.push(Object.assign({ step: i + 1 }, it)); }); });

    // --- состояние ---
    var st = { az: (spec.view && spec.view.azimuth != null ? spec.view.azimuth : 30) * DEG,
      el: (spec.view && spec.view.elevation != null ? spec.view.elevation : 20) * DEG,
      k: steps.length ? (spec.startStep || 1) : 0 };

    // --- вид: поворот вокруг вертикали (ось z), затем наклон к зрителю; параллельная проекция ---
    function proj(p) {
      var q = vsub(p, c), cf = Math.cos(st.az), sf = Math.sin(st.az);
      var x1 = q[0] * cf - q[1] * sf, y1 = q[0] * sf + q[1] * cf;
      return [x1, q[2] * Math.cos(st.el) + y1 * Math.sin(st.el)];
    }
    function viewer() { // единичный вектор «к зрителю» в мировых координатах
      var ct = Math.cos(st.el);
      return [-ct * Math.sin(st.az), -ct * Math.cos(st.az), Math.sin(st.el)];
    }
    // точка скрыта, если луч от неё к зрителю проходит внутри тела (выпуклое — пересечение полупространств)
    function hiddenAt(p, w) {
      var t0 = 0, t1 = Infinity;
      for (var i = 0; i < faces.length; i++) {
        var f = faces[i], den = dot(f.n, w), num = f.d - dot(f.n, p);
        if (Math.abs(den) < 1e-12) { if (num < -EPS) return false; continue; }
        var t = num / den;
        if (den > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
        if (t1 - t0 <= EPS) return false;
      }
      return t1 - t0 > EPS;
    }
    // отрезок → куски «видно / не видно»
    function pieces(a, b, w) {
      var N = 48, H = function (t) { return hiddenAt(lerp(a, b, t), w); }, s = [], out = [], start = 0;
      for (var i = 0; i < N; i++) s.push(H((i + 0.5) / N));
      for (i = 1; i <= N; i++) {
        if (i < N && s[i] === s[i - 1]) continue;
        var tb = 1;
        if (i < N) {
          var lo = (i - 0.5) / N, hi = (i + 0.5) / N;
          for (var r = 0; r < 24; r++) { var m = (lo + hi) / 2; if (H(m) === s[i - 1]) lo = m; else hi = m; }
          tb = (lo + hi) / 2;
        }
        out.push({ a: lerp(a, b, start), b: lerp(a, b, tb), hidden: s[i - 1] });
        start = tb;
      }
      return out;
    }

    var board, layers, marks, pal;

    function build(box, p) {
      pal = p;
      var m = R * (spec.margin || 1.18);
      board = makeBoard(box, [-m, m, m, -m], false);
      layers = {};
      SOLID_LAYERS.forEach(function (L) {
        var data = { xs: [], ys: [] };
        var curve = board.create('curve', [[0], [0]], Object.assign(
          { highlight: false, fixed: true, fillColor: 'none', lineCap: 'round' }, L[1](pal)));
        curve.updateDataArray = function () { this.dataX = data.xs; this.dataY = data.ys; };
        layers[L[0]] = data;
      });
      // подписи вершин и точки построения
      marks = [];
      var labelled = (spec.labels === false ? [] : Object.keys(spec.vertices)).map(function (n) { return { name: n, vertex: true }; });
      Object.keys(defs).forEach(function (n) { labelled.push({ name: n, vertex: false }); });
      labelled.forEach(function (mk) {
        var off = function () { return labelOffset(mk.name); };
        if (!mk.vertex) {
          mk.pt = board.create('point', [function () { return proj(V[mk.name])[0]; }, function () { return proj(V[mk.name])[1]; }],
            { name: '', withLabel: false, fixed: true, highlight: false, size: 3, strokeWidth: 0, fillColor: pal.ink, strokeColor: pal.ink });
        }
        mk.txt = board.create('text', [
          function () { return proj(V[mk.name])[0] + off()[0]; },
          function () { return proj(V[mk.name])[1] + off()[1]; },
          sub(mk.name)], {
          fixed: true, highlight: false, anchorX: 'middle', anchorY: 'middle',
          cssClass: 'JXGtext ycf-lab', highlightCssClass: 'JXGtext ycf-lab', strokeColor: pal.ink, fontSize: 18
        });
        mk.shown = true; mk.color = pal.ink;
        marks.push(mk);
      });
      render();
      return board;
    }

    // подпись отводим от центра тела; у точки на ребре — перпендикулярно ребру, наружу
    function labelOffset(name) {
      var px = 15 / board.unitX, s = proj(V[name]), d = s.slice(), def = defs[name];
      if (def && def.on) {
        var a = proj(V[def.on[0]]), b = proj(V[def.on[1]]), e = [b[0] - a[0], b[1] - a[1]];
        d = [-e[1], e[0]];
        if (d[0] * s[0] + d[1] * s[1] < 0) d = [-d[0], -d[1]];
      }
      if (def && def.label) d = def.label;
      var L = Math.hypot(d[0], d[1]);
      if (L < 1e-9) return [px, px];
      return [d[0] / L * px, d[1] / L * px];
    }

    function render() {
      if (!board) return;
      Object.keys(layers).forEach(function (k) { layers[k].xs = []; layers[k].ys = []; });
      function push(key, a, b) {
        var L = layers[key], pa = proj(a), pb = proj(b);
        L.xs.push(pa[0], pb[0], NaN); L.ys.push(pa[1], pb[1], NaN);
      }
      var w = viewer(), vis = faces.map(function (f) { return dot(f.n, w) > 1e-9; });
      edges.forEach(function (e) {
        var hid = !e.faces.some(function (i) { return vis[i]; });
        push(hid ? 'edge-h' : 'edge', V[e.a], V[e.b]);
      });
      var state = {};
      items.forEach(function (it) {
        if (it.step > st.k) return;
        var s = it.step === st.k && st.k > 0 ? 'new' : 'done';
        if (it.poly) {
          var L = layers['fill-' + s];
          it.poly.forEach(function (n) { var q = proj(V[n]); L.xs.push(q[0]); L.ys.push(q[1]); });
          var q0 = proj(V[it.poly[0]]); L.xs.push(q0[0], NaN); L.ys.push(q0[1], NaN);
        }
        var ends = it.seg || it.aux;
        if (ends) {
          var role = it.seg ? 'cut' : 'aux';
          pieces(V[ends[0]], V[ends[1]], w).forEach(function (pc) { push(role + '-' + s + (pc.hidden ? '-h' : ''), pc.a, pc.b); });
        }
        if (it.point) state[it.point] = s;
      });
      marks.forEach(function (mk) {
        var shown = mk.vertex || !!state[mk.name], isNew = state[mk.name] === 'new';
        var col = isNew ? pal.nw : pal.ink;
        if (shown !== mk.shown) {
          mk.txt.setAttribute({ visible: shown }); if (mk.pt) mk.pt.setAttribute({ visible: shown });
          mk.shown = shown;
        }
        if (shown && col !== mk.color) {
          mk.txt.setAttribute({ strokeColor: isNew ? pal.nwText : pal.ink });
          if (mk.pt) mk.pt.setAttribute({ fillColor: col, strokeColor: col });
          mk.color = col;
        }
      });
      board.update();
    }

    // --- управление ---
    var F = Figure(fig, false, build);
    var ctl = h('div', 'ycf-ctl'), cap = null;
    if (spec.rotate !== false) {
      ctl.appendChild(range({
        label: 'Поворот', min: 0, max: 360, step: 1, value: Math.round(st.az / DEG),
        format: function (v) { return v + '°'; },
        onInput: function (v) { st.az = v * DEG; render(); }
      }).row);
    }
    if (steps.length) {
      var N = steps.length, rs, prev, next;
      var go = function (k) {
        st.k = Math.max(1, Math.min(N, k));
        rs.set(st.k); prev.disabled = st.k === 1; next.disabled = st.k === N;
        cap.innerHTML = '<b>Шаг ' + st.k + '.</b> ' + steps[st.k - 1].caption;
        render();
      };
      rs = range({ label: 'Шаг', min: 1, max: N, step: 1, value: st.k,
        format: function (v) { return v + ' из ' + N; }, onInput: function (v) { go(v); } });
      prev = button('‹', 'Предыдущий шаг', function () { go(st.k - 1); });
      next = button('›', 'Следующий шаг', function () { go(st.k + 1); });
      var rowStep = h('div', 'ycf-step');
      rs.row.style.flex = '1';
      rowStep.append(prev, rs.row, next);
      ctl.appendChild(rowStep);
      cap = h('div', 'ycf-cap'); cap.setAttribute('aria-live', 'polite');
      fig.append(ctl, cap);
      F.rebuild();
      go(st.k);
    } else {
      fig.appendChild(ctl);
      if (spec.caption) { cap = h('div', 'ycf-cap', spec.caption); fig.appendChild(cap); }
      F.rebuild();
    }
    return { state: st, render: render };
  }

  /* ---------- plot: график и прямая y = параметр ---------- */

  function findRoots(g, a, b) {
    var N = 2000, hh = (b - a) / N, xs = [], gs = [], res = [], i;
    for (i = 0; i <= N; i++) { xs.push(a + i * hh); gs.push(g(xs[i])); }
    for (i = 0; i <= N; i++) {
      if (gs[i] === 0) res.push(xs[i]);
      else if (i < N && gs[i] * gs[i + 1] < 0) {
        var lo = xs[i], hi = xs[i + 1], glo = gs[i];
        for (var r = 0; r < 60; r++) { var m = (lo + hi) / 2, gm = g(m); if (gm * glo > 0) { lo = m; glo = gm; } else hi = m; }
        res.push((lo + hi) / 2);
      }
    }
    // касания: локальный минимум |g| без смены знака
    for (i = 1; i < N; i++) {
      var A = Math.abs(gs[i - 1]), B = Math.abs(gs[i]), C = Math.abs(gs[i + 1]);
      if (B <= A && B <= C && gs[i - 1] * gs[i] > 0 && gs[i] * gs[i + 1] > 0) {
        var l = xs[i - 1], u = xs[i + 1], K = (Math.sqrt(5) - 1) / 2;
        for (r = 0; r < 80; r++) {
          var x1 = u - K * (u - l), x2 = l + K * (u - l);
          if (Math.abs(g(x1)) < Math.abs(g(x2))) u = x2; else l = x1;
        }
        var x = (l + u) / 2;
        if (Math.abs(g(x)) < 1e-9) res.push(x);
      }
    }
    res.sort(function (p, q) { return p - q; });
    return res.filter(function (x, j) { return j === 0 || x - res[j - 1] > 1e-6; });
  }

  function noteFor(notes, a) {
    for (var i = 0; i < (notes || []).length; i++) {
      var w = notes[i].when, m;
      if ((m = /^=\s*(-?[\d.]+)$/.exec(w)) && a === +m[1]) return notes[i].text;
      if ((m = /^<\s*(-?[\d.]+)$/.exec(w)) && a < +m[1]) return notes[i].text;
      if ((m = /^>\s*(-?[\d.]+)$/.exec(w)) && a > +m[1]) return notes[i].text;
      if ((m = /^(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/.exec(w)) && a > +m[1] && a < +m[2]) return notes[i].text;
    }
    return '';
  }

  function plot(fig, spec) {
    var P = spec.param, dg = decimals(P.step), st = { a: P.value, roots: [] };
    var bb, board, pal, fns = [], cap, slider;

    function build(box, p) {
      pal = p;
      board = makeBoard(box, spec.bbox, true);
      bb = board.getBoundingBox(); // фактическая рамка (подогнана под пропорции доски)
      var tick = function (anchorX, anchorY, offset) {
        return { insertTicks: false, ticksDistance: 1, minorTicks: 0, majorHeight: -1, drawZero: false,
          strokeColor: pal.grid, strokeOpacity: 1, strokeWidth: 1, useUnicodeMinus: true,
          label: { fontSize: 13, cssClass: 'JXGtext ycf-tick', highlightCssClass: 'JXGtext ycf-tick', strokeColor: pal.muted,
            anchorX: anchorX, anchorY: anchorY, offset: offset, highlight: false } };
      };
      var axis = { strokeColor: pal.muted, strokeWidth: 1.25, highlight: false, fixed: true, withLabel: false,
        firstArrow: false, lastArrow: { type: 2, size: 7 } };
      board.create('axis', [[0, 0], [1, 0]], Object.assign({ ticks: tick('middle', 'top', [0, -6]) }, axis));
      board.create('axis', [[0, 0], [0, 1]], Object.assign({ ticks: tick('right', 'middle', [-6, 0]) }, axis));
      var txt = { fontSize: 18, fixed: true, highlight: false, cssClass: 'JXGtext ycf-lab', highlightCssClass: 'JXGtext ycf-lab', strokeColor: pal.muted };
      board.create('text', [bb[2] - 0.12, 0, 'x'], Object.assign({ anchorX: 'right', anchorY: 'bottom' }, txt));
      board.create('text', [0, bb[1] - 0.1, 'y'], Object.assign({ anchorX: 'left', anchorY: 'top' }, txt));
      board.create('text', [0, 0, '0'], Object.assign({}, txt, { anchorX: 'right', anchorY: 'top', cssClass: 'JXGtext ycf-tick', highlightCssClass: 'JXGtext ycf-tick', fontSize: 13 }));
      var px = 1 / board.unitX;

      fns = spec.curves.map(function (cv) {
        var f = board.jc.snippet(cv.fn, true, 'x', false);
        board.create('functiongraph', [f, bb[0], bb[2]], { strokeColor: pal.main, strokeWidth: pal.w, highlight: false, fixed: true });
        if (cv.label) board.create('text', [cv.at[0], cv.at[1], cv.label], {
          fixed: true, highlight: false, anchorX: 'left', anchorY: 'middle', fontSize: 18, cssClass: 'JXGtext ycf-formula', highlightCssClass: 'JXGtext ycf-formula', strokeColor: pal.done });
        return f;
      });

      // прямая y = a, капли к оси Ox, точки пересечения
      var drops = { xs: [], ys: [] };
      var dc = board.create('curve', [[0], [0]], { strokeColor: pal.nw, strokeWidth: pal.thin, dash: 2, highlight: false, fixed: true });
      dc.updateDataArray = function () { this.dataX = drops.xs; this.dataY = drops.ys; };
      board.create('functiongraph', [function () { return st.a; }, bb[0], bb[2]], { strokeColor: pal.nw, strokeWidth: pal.w, highlight: false, fixed: true });
      board.create('text', [bb[0] + 12 * px, function () { return st.a + 14 * px; }, P.lineLabel || ('y = ' + P.name)], {
        fixed: true, highlight: false, anchorX: 'left', anchorY: 'bottom', fontSize: 18, cssClass: 'JXGtext ycf-formula', highlightCssClass: 'JXGtext ycf-formula', strokeColor: pal.nwText });
      var pts = [];
      for (var i = 0; i < 8; i++) (function (j) {
        pts.push(board.create('point', [function () { return st.roots[j] || 0; }, function () { return st.a; }], {
          name: '', withLabel: false, fixed: true, highlight: false, size: 4, fillColor: pal.nw, strokeColor: pal.surface, strokeWidth: 2, visible: false }));
      })(i);

      // «ручка» прямой у правого края — тянется пальцем
      var x0 = bb[2] - 22 * px;
      var rail = board.create('segment', [[x0, P.min], [x0, P.max]], { visible: false, fixed: true });
      var handle = board.create('glider', [x0, st.a, rail], {
        name: '', withLabel: false, size: 9, fillColor: pal.surface, strokeColor: pal.nw, strokeWidth: 3,
        highlightFillColor: pal.surface, highlightStrokeColor: pal.nw, showInfobox: false });
      handle.on('drag', function () {
        var v = +(Math.round(handle.Y() / P.step) * P.step).toFixed(dg);
        if (v !== st.a) { slider.set(v); setA(v); }
      });
      handle.on('up', function () { handle.moveTo([x0, st.a]); });

      board.ycf = { pts: pts, drops: drops, handle: handle, x0: x0 };
      update();
      return board;
    }

    function update() {
      if (!board) return;
      var roots = [];
      fns.forEach(function (f) { roots = roots.concat(findRoots(function (x) { return f(x) - st.a; }, bb[0], bb[2])); });
      st.roots = roots;
      var y = board.ycf;
      y.pts.forEach(function (p, i) { var on = i < roots.length; if (p.visProp.visible !== on) p.setAttribute({ visible: on }); });
      y.drops.xs = []; y.drops.ys = [];
      if (st.a !== 0) roots.forEach(function (r) { y.drops.xs.push(r, r, NaN); y.drops.ys.push(st.a, 0, NaN); });
      if (!y.handle.isDraggingNow && Math.abs(y.handle.Y() - st.a) > 1e-9) y.handle.moveTo([y.x0, st.a]);
      board.update();
      var n = roots.length, hit = spec.target != null && n === spec.target;
      cap.className = 'ycf-cap' + (hit ? ' hit' : '');
      cap.innerHTML = '<span class="m"><i>' + P.name + '</i> = ' + fmt(st.a, dg) + '</span>: решений — <b>' + n + '</b>. ' + noteFor(spec.notes, st.a);
    }

    function setA(v) { st.a = v; update(); }

    var F = Figure(fig, false, build);
    var ctl = h('div', 'ycf-ctl');
    slider = range({ label: '<i style="font:italic 19px var(--ycf-font)">' + P.name + '</i>', min: P.min, max: P.max, step: P.step, value: P.value,
      format: function (v) { return fmt(v, dg); }, onInput: setA });
    ctl.appendChild(slider.row);
    cap = h('div', 'ycf-cap'); cap.setAttribute('aria-live', 'polite');
    fig.append(ctl, cap);
    F.rebuild();
    return { state: st };
  }

  window.YCFig = {
    mount: function (el, spec) {
      if (spec.type === 'solid') return solid(el, spec);
      if (spec.type === 'plot') return plot(el, spec);
      throw new Error('YCFig: неизвестный тип ' + spec.type);
    },
    version: '0.1'
  };
})();
