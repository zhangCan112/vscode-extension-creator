// 通用 webview 预览批注层：叠在实机预览活页上，点哪钉哪，批注实时落盘（配合 annot-server.mjs）。
// 引入本文件与 annot-layer.css（在预览 bundle 之后），然后：
//   initAnnotLayer({
//     endpoint: "http://127.0.0.1:6177",
//     storageKey: "my-annot-pins",
//     adapter: mpgCytoscapeAdapter(function () { return window.__myCy; }, "cy"), // 非图页面省略
//     getContext: function () { return { view: "总览" }; },
//     extraButtons: [{ label: "主题", onClick: function () {} }]
//   });
// 适配器契约（全部可选，缺省退化为页面锚定）：
//   ready() -> bool；token() -> 图实例（用于重建后重绑）
//   container -> 画布 DOM；toModel(rx,ry)/toRendered(m) -> 坐标互转（画布内相对坐标）
//   describeAt(rx,ry) -> { kind, desc } 命中描述；snapshot() -> 视口 PNG dataURL
(function () {
  "use strict";

  function distToSeg(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    var t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    var x = a.x + t * dx, y = a.y + t * dy;
    return Math.hypot(p.x - x, p.y - y);
  }

  // 内置 cytoscape 适配器：core 没有 renderedToModel/modelToRendered，
  // 换算公式 rendered = model × zoom + pan；node.boundingBox() 默认模型坐标，直接做命中测试。
  function mpgCytoscapeAdapter(getCy, containerId) {
    return {
      container: document.getElementById(containerId),
      ready: function () { var c = getCy(); return !!(c && typeof c.zoom === "function" && !c.destroyed()); },
      token: function () { return getCy(); },
      toModel: function (rx, ry) {
        var c = getCy(), z = c.zoom(), p = c.pan();
        return { x: (rx - p.x) / z, y: (ry - p.y) / z };
      },
      toRendered: function (m) {
        var c = getCy(), z = c.zoom(), p = c.pan();
        return { x: m.x * z + p.x, y: m.y * z + p.y };
      },
      describeAt: function (rx, ry) {
        var c = getCy();
        var m = this.toModel(rx, ry);
        var th = 12 / c.zoom();
        var hit = null;
        c.nodes().forEach(function (n) {
          var b = n.boundingBox({ includeLabels: false });
          if (m.x >= b.x1 - th && m.x <= b.x2 + th && m.y >= b.y1 - th && m.y <= b.y2 + th) { hit = n; }
        });
        if (hit) { return { kind: "node", desc: hit.id() }; }
        var best = null, bestD = th;
        c.edges().forEach(function (e) {
          var pts = [];
          try { pts = e.points() || []; } catch (err) { pts = []; }
          if (!pts.length) { pts = [e.source().position(), e.target().position()]; }
          for (var i = 0; i < pts.length - 1; i++) {
            var d = distToSeg(m, pts[i], pts[i + 1]);
            if (d < bestD) { bestD = d; best = e; }
          }
        });
        if (best) { return { kind: "edge", desc: best.source().id() + "→" + best.target().id() + " " + (best.data("type") || "") }; }
        return { kind: "canvas", desc: "画布空白处" };
      },
      snapshot: function () {
        try { return getCy().png({ full: false }); } catch (e) { return null; }
      }
    };
  }

  function domDescribe(cx, cy) {
    var el = document.elementFromPoint(cx, cy);
    if (!el) { return { kind: "dom", desc: "页面空白" }; }
    var tag = el.tagName.toLowerCase();
    var id = el.id ? "#" + el.id : "";
    var cls = "";
    if (typeof el.className === "string" && el.className.trim()) {
      cls = "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    }
    var txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    return { kind: "dom", desc: tag + id + cls + (txt ? " 「" + txt + "」" : "") };
  }

  function initAnnotLayer(opts) {
    var EP = opts.endpoint;
    var LS = opts.storageKey || "annot-pins";
    var adapter = opts.adapter || null;
    var getContext = opts.getContext || function () { return {}; };
    var mode = false;
    var pins = loadPins();
    var down = null;
    var boundToken = null;
    var editing = null;
    var clearArmed = 0;

    function loadPins() { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { return []; } }
    function slim() { return pins.map(function (p) { return { id: p.id, note: p.note, anchor: p.anchor, ctx: p.ctx, target: p.target, shot: p.shot }; }); }
    function saveLS() { localStorage.setItem(LS, JSON.stringify(slim())); }
    function dot(ok) {
      var d = document.getElementById("pdot");
      if (d) { d.className = "pdot " + (ok ? "ok" : "bad"); d.title = ok ? "已连接批注收集服务" : "未连接收集服务（仍存本地）"; }
    }
    function sync(op, pin) {
      try {
        fetch(EP + "/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ op: op }, pin)) })
          .then(function () { dot(true); }, function () { dot(false); });
      } catch (e) { dot(false); }
    }

    // —— 工具条 ——
    var bar = document.createElement("div");
    bar.className = "pctl";
    function mkB(text, fn) { var b = document.createElement("button"); b.type = "button"; b.textContent = text; b.addEventListener("click", fn); return b; }
    var dotEl = document.createElement("span"); dotEl.id = "pdot"; dotEl.className = "pdot";
    var bMode = mkB("批注模式", function () {
      mode = !mode;
      bMode.classList.toggle("on", mode);
      bMode.textContent = mode ? "批注模式·点击画面落针" : "批注模式";
      if (mode) { closePop(); }
    });
    var bList = mkB("列表", function () {
      var show = list.style.display === "none";
      list.style.display = show ? "block" : "none";
      if (show) { renderList(true); }
    });
    var bExport = mkB("导出", function () {
      var text = JSON.stringify(slim(), null, 1);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          bExport.textContent = "已复制";
          setTimeout(function () { bExport.textContent = "导出"; }, 1200);
        }, function () {});
      }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = "annotations.json";
      a.click();
    });
    var bClear = mkB("清空", function () {
      if (Date.now() - clearArmed > 3000) {
        clearArmed = Date.now();
        bClear.textContent = "再点确认";
        setTimeout(function () { bClear.textContent = "清空"; }, 3000);
        return;
      }
      pins = [];
      saveLS();
      renderAll();
      try { fetch(EP + "/all", { method: "DELETE" }); } catch (e) {}
      bClear.textContent = "清空";
    });
    bar.append(bMode, bList, bExport, bClear);
    (opts.extraButtons || []).forEach(function (eb) { bar.appendChild(mkB(eb.label, function () { eb.onClick(); setTimeout(refreshPins, 300); })); });
    bar.appendChild(dotEl);
    document.body.appendChild(bar);

    // —— 针脚层 ——
    var layer = document.createElement("div");
    layer.className = "player";
    document.body.appendChild(layer);

    function mkPinEl(p) {
      var el = document.createElement("div");
      el.className = "ppin";
      el.textContent = String(p.id);
      el.title = (p.target && p.target.desc ? "[" + p.target.desc + "] " : "") + (p.note || "");
      var x = document.createElement("span");
      x.className = "ppin-x";
      x.textContent = "×";
      x.addEventListener("click", function (ev) { ev.stopPropagation(); removePin(p.id); });
      el.appendChild(x);
      el.addEventListener("click", function (ev) { ev.stopPropagation(); openPop(p, null); });
      return el;
    }
    function renderAll() {
      layer.textContent = "";
      pins.forEach(function (p) { p.el = mkPinEl(p); layer.appendChild(p.el); });
      placeAll();
      renderList();
    }
    function placeAll() { placePage(); placeCy(); }
    function placePage() {
      pins.forEach(function (p) {
        if (p.anchor.t === "page" && p.el) { p.el.style.left = p.anchor.x + "px"; p.el.style.top = p.anchor.y + "px"; }
      });
    }
    function placeCy() {
      if (!adapter || !adapter.ready()) { return; }
      var rect = adapter.container.getBoundingClientRect();
      pins.forEach(function (p) {
        if (p.anchor.t !== "cy" || !p.el) { return; }
        var r = adapter.toRendered({ x: p.anchor.x, y: p.anchor.y });
        p.el.style.left = (rect.left + r.x) + "px";
        p.el.style.top = (rect.top + r.y) + "px";
      });
    }
    function bindGraph() {
      if (!adapter || !adapter.ready()) { return; }
      var tok = adapter.token();
      if (tok === boundToken) { return; }
      boundToken = tok;
      var raf = 0;
      var upd = function () { if (!raf) { raf = requestAnimationFrame(function () { raf = 0; placeCy(); }); } };
      tok.on("pan zoom resize", upd);
      setTimeout(placeCy, 100);
    }
    function refreshPins() { bindGraph(); placeAll(); }

    // —— 弹窗 ——
    var pop = document.createElement("div");
    pop.className = "ppop";
    pop.style.display = "none";
    var ctxLine = document.createElement("div");
    ctxLine.className = "ppop-ctx";
    var tgtLine = document.createElement("div");
    tgtLine.className = "ppop-ctx";
    tgtLine.style.color = "#ef6c00";
    var ta = document.createElement("textarea");
    ta.rows = 3;
    ta.placeholder = "意见写这里（自动附带命中对象与视图上下文）";
    var row = document.createElement("div");
    row.className = "ppop-row";
    var bCancel = mkB("取消", closePop);
    var bSave = mkB("保存", function () {
      if (!editing) { return; }
      var v = ta.value.trim();
      if (!v) { removePin(editing.id); closePop(); return; }
      var isNew = !editing.note;
      editing.note = v;
      editing.ctx = getContext();
      saveLS();
      var payload = { id: editing.id, note: editing.note, anchor: editing.anchor, ctx: editing.ctx, target: editing.target, shotData: editing.shotData || null };
      if (isNew) { sync("add", payload); } else { sync("del", { id: editing.id }); setTimeout(function () { sync("add", payload); }, 120); }
      renderAll();
      closePop();
    });
    bSave.className = "primary";
    row.append(bCancel, bSave);
    pop.append(ctxLine, tgtLine, ta, row);
    document.body.appendChild(pop);

    function openPop(p, pt) {
      editing = p;
      ta.value = p ? p.note : "";
      var c = getContext();
      ctxLine.textContent = [JSON.stringify(c).slice(1, -1)].join(" ").slice(0, 90);
      tgtLine.textContent = p && p.target ? "命中: " + p.target.desc : "";
      pop.style.display = "block";
      var x = 240, y = 160;
      if (pt) {
        x = Math.min(pt.x + 12, window.innerWidth - 280);
        y = Math.min(pt.y + 12, window.innerHeight - 160);
      } else if (p && p.el) {
        var r = p.el.getBoundingClientRect();
        x = Math.min(r.right + 8, window.innerWidth - 280);
        y = Math.min(r.top, window.innerHeight - 160);
      }
      pop.style.left = x + "px";
      pop.style.top = Math.max(8, y) + "px";
      ta.focus();
    }
    function closePop() {
      pop.style.display = "none";
      if (editing && !editing.note) { pins = pins.filter(function (q) { return q !== editing; }); saveLS(); renderAll(); }
      editing = null;
    }
    ta.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { bSave.click(); } });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && pop.style.display === "block") { closePop(); } });

    function addPin(cx, cy) {
      var id = pins.reduce(function (m, p) { return Math.max(m, p.id); }, 0) + 1;
      var anchor, target, shotData = null;
      var inGraph = false;
      if (adapter && adapter.ready()) {
        // 只有命中真正的画布元素才算图内点击；图例/信息栏等覆盖层按页面锚定
        var el = document.elementFromPoint(cx, cy);
        var onCanvas = el && el.tagName === "CANVAS" && adapter.container.contains(el);
        var rect = adapter.container.getBoundingClientRect();
        if (onCanvas && cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          inGraph = true;
          var m = adapter.toModel(cx - rect.left, cy - rect.top);
          anchor = { t: "cy", x: +m.x.toFixed(2), y: +m.y.toFixed(2) };
          target = adapter.describeAt(cx - rect.left, cy - rect.top);
          shotData = adapter.snapshot();
        }
      }
      if (!inGraph) {
        anchor = { t: "page", x: cx, y: cy };
        target = domDescribe(cx, cy);
      }
      var p = { id: id, note: "", anchor: anchor, ctx: getContext(), target: target, shotData: shotData };
      pins.push(p);
      saveLS();
      renderAll();
      openPop(p, { x: cx, y: cy });
    }
    function removePin(id) {
      pins = pins.filter(function (q) { return q.id !== id; });
      saveLS();
      sync("del", { id: id });
      renderAll();
      if (editing && editing.id === id) { editing = null; closePop(); }
    }

    // —— 批注模式手势拦截：必须在 pointerdown（capture）掐断。
    // 图库的 tap/拖拽由 mousedown/mouseup 合成，若拦 click 则图库先完成聚焦/重排，
    // 批注层拿到的坐标已失效（真实踩坑）。覆盖层/自身 UI 放行；残余 click 一并吞掉。
    var pinArmed = false;
    var ownUi = function (t) { return !!(t && t.closest && t.closest(".pctl,.ppop,.ppin,.plist")); };
    document.addEventListener("pointerdown", function (ev) {
      down = { x: ev.clientX, y: ev.clientY };
      if (!mode || ownUi(ev.target)) { return; }
      pinArmed = true;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
    document.addEventListener("pointerup", function (ev) {
      if (!pinArmed) { return; }
      pinArmed = false;
      if (ownUi(ev.target)) { return; }
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) { return; }
      ev.stopPropagation();
      ev.preventDefault();
      addPin(ev.clientX, ev.clientY);
    }, true);
    document.addEventListener("click", function (ev) {
      if (mode && !ownUi(ev.target)) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    }, true);

    // —— 列表 ——
    var list = document.createElement("div");
    list.className = "plist";
    list.style.display = "none";
    document.body.appendChild(list);
    function renderList(force) {
      if (!force && list.style.display === "none") { return; }
      list.textContent = "";
      if (!pins.length) { list.textContent = "暂无批注"; return; }
      pins.forEach(function (p) {
        var it = document.createElement("div");
        it.className = "plist-item";
        var n = document.createElement("span");
        n.className = "n";
        n.textContent = "#" + p.id;
        var t = document.createElement("span");
        t.textContent = p.note;
        var c = document.createElement("span");
        c.className = "c";
        c.textContent = (p.target && p.target.desc ? p.target.desc : "") + (p.anchor.t === "cy" ? " · 画布锚定" : " · 页面锚定");
        it.append(n, t, c);
        it.addEventListener("click", function () {
          if (p.el) { p.el.classList.add("flash"); setTimeout(function () { if (p.el) { p.el.classList.remove("flash"); } }, 900); }
        });
        list.appendChild(it);
      });
    }

    window.addEventListener("resize", placeAll);
    setInterval(bindGraph, 400);
    renderAll();

    // 服务器探针 + 双向补同步
    (function () {
      fetch(EP + "/list").then(function (r) { return r.json(); }).then(function (srv) {
        dot(true);
        var have = new Map(pins.map(function (p) { return [p.id, p]; }));
        srv.forEach(function (s) { if (!have.has(s.id)) { pins.push({ id: s.id, note: s.note, anchor: s.anchor, ctx: s.ctx, target: s.target, shot: s.shot }); } });
        var srvIds = new Set(srv.map(function (s) { return s.id; }));
        pins.forEach(function (p) { if (!srvIds.has(p.id) && p.note) { sync("add", { id: p.id, note: p.note, anchor: p.anchor, ctx: p.ctx, target: p.target }); } });
        saveLS();
        renderAll();
      }, function () { dot(false); });
    })();
  }

  window.initAnnotLayer = initAnnotLayer;
  window.mpgCytoscapeAdapter = mpgCytoscapeAdapter;
})();
