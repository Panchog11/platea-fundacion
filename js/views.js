'use strict';
/* =====================================================================
   VISTAS — Planta (mapas de colores), Axonométrica 3D y Cortes
   Dibujado con Canvas 2D (sin librerías externas, funciona sin internet)
   ===================================================================== */
const VIS = (() => {
  const CAMPOS = {
    none: { t: 'Sin mapa de colores' },
    wmm: { t: 'Asentamiento (servicio)', u: 'mm', g: 'Suelo', f: R => R.D.wmm },
    qs: { t: 'Presión en el suelo (servicio)', u: 'kN/m²', g: 'Suelo', f: R => R.rs.q },
    qu: { t: 'Presión en el suelo (última)', u: 'kN/m²', g: 'Suelo', f: R => R.ru.q },
    mx: { t: 'Mx — momento dir. X (último)', u: 'kNm/m', g: 'Esfuerzos', f: R => R.ru.mx },
    my: { t: 'My — momento dir. Y (último)', u: 'kNm/m', g: 'Esfuerzos', f: R => R.ru.my },
    mxy: { t: 'Mxy — momento torsor (último)', u: 'kNm/m', g: 'Esfuerzos', f: R => R.ru.mxy },
    qx: { t: 'Qx — corte (último)', u: 'kN/m', g: 'Esfuerzos', f: R => R.ru.qx },
    qy: { t: 'Qy — corte (último)', u: 'kN/m', g: 'Esfuerzos', f: R => R.ru.qy },
    mxb: { t: 'Mx* inferior (Wood-Armer)', u: 'kNm/m', g: 'Diseño', f: R => R.D.mxb },
    myb: { t: 'My* inferior (Wood-Armer)', u: 'kNm/m', g: 'Diseño', f: R => R.D.myb },
    mxt: { t: 'Mx* superior (Wood-Armer)', u: 'kNm/m', g: 'Diseño', f: R => R.D.mxt },
    myt: { t: 'My* superior (Wood-Armer)', u: 'kNm/m', g: 'Diseño', f: R => R.D.myt },
    asxb: { t: 'As requerida inferior X', u: 'cm²/m', g: 'Armadura', f: R => R.D.asxb },
    asyb: { t: 'As requerida inferior Y', u: 'cm²/m', g: 'Armadura', f: R => R.D.asyb },
    asxt: { t: 'As requerida superior X', u: 'cm²/m', g: 'Armadura', f: R => R.D.asxt },
    asyt: { t: 'As requerida superior Y', u: 'cm²/m', g: 'Armadura', f: R => R.D.asyt },
    pxb: { t: 'As provista inferior X', u: 'cm²/m', g: 'Armadura', f: R => R.D.pxb },
    pyb: { t: 'As provista inferior Y', u: 'cm²/m', g: 'Armadura', f: R => R.D.pyb },
    pxt: { t: 'As provista superior X', u: 'cm²/m', g: 'Armadura', f: R => R.D.pxt },
    pyt: { t: 'As provista superior Y', u: 'cm²/m', g: 'Armadura', f: R => R.D.pyt },
    umax: { t: 'Utilización a flexión (máx.)', u: '', g: 'Verificación', util: true, f: R => R.D.umax },
    uxb: { t: 'Utilización inferior X', u: '', g: 'Verificación', util: true, f: R => R.D.uxb },
    uyb: { t: 'Utilización inferior Y', u: '', g: 'Verificación', util: true, f: R => R.D.uyb },
    uxt: { t: 'Utilización superior X', u: '', g: 'Verificación', util: true, f: R => R.D.uxt },
    uyt: { t: 'Utilización superior Y', u: '', g: 'Verificación', util: true, f: R => R.D.uyt }
  };
  const COL = { inf: '#1d6fd8', sup: '#d0342c', col: '#37474f', ok: '#1b9e4b', bad: '#d0342c' };

  function turbo(t) {
    t = Math.min(1, Math.max(0, t));
    const r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))));
    const g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))));
    const b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))));
    return [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))));
  }
  function utilColor(u) {
    if (isNaN(u)) return [190, 190, 190];
    const st = [[0, [46, 160, 90]], [0.6, [140, 200, 80]], [0.85, [245, 205, 60]], [1.0, [245, 140, 40]], [1.0001, [215, 40, 40]], [1.5, [140, 0, 30]]];
    if (u >= 1.5) return st[5][1];
    for (let i = 0; i < st.length - 1; i++) if (u <= st[i + 1][0]) {
      const t = (u - st[i][0]) / (st[i + 1][0] - st[i][0] || 1);
      return st[i][1].map((v, k) => Math.round(v + t * (st[i + 1][1][k] - v)));
    }
    return st[5][1];
  }
  function rango(f, util) {
    if (util) return [0, 1.5];
    let a = Infinity, b = -Infinity;
    for (const v of f) if (!isNaN(v)) { if (v < a) a = v; if (v > b) b = v; }
    if (!isFinite(a)) return [0, 1];
    if (b - a < 1e-9) { a -= 1; b += 1; }
    return [a, b];
  }
  function colorDe(v, lo, hi, util, bandas) {
    if (util) return utilColor(v);
    if (isNaN(v)) return [190, 190, 190];
    let t = (v - lo) / (hi - lo);
    if (bandas) t = (Math.min(11, Math.floor(t * 12)) + 0.5) / 12;
    return turbo(t);
  }
  const fmt = (v, d = 1) => (v === undefined || isNaN(v)) ? '—' : (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(d));

  function prep(cv, w, h) {
    const dpr = w ? 1 : (window.devicePixelRatio || 1);
    const W = w || cv.clientWidth, H = h || cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }

  function leyenda(ctx, x, y, h, lo, hi, campo, bandas) {
    const util = campo.util;
    const w = 16;
    for (let i = 0; i < h; i++) {
      const t = 1 - i / h;
      const c = util ? utilColor(t * 1.5) : colorDe(lo + t * (hi - lo), lo, hi, false, bandas);
      ctx.fillStyle = `rgb(${c})`; ctx.fillRect(x, y + i, w, 1.5);
    }
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = '#222'; ctx.font = '11px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const v = hi - i * (hi - lo) / n, yy = y + i * h / n;
      ctx.fillRect(x + w, yy, 4, 1);
      ctx.fillText(util ? v.toFixed(2) : fmt(v, Math.abs(hi - lo) < 10 ? 2 : 1), x + w + 6, yy);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 11px Arial';
    ctx.fillText(campo.u || (util ? 'Mu/φMn' : ''), x - 2, y - 8);
  }

  function cota(ctx, x1, y1, x2, y2, txt, off, vertical) {
    ctx.save();
    ctx.strokeStyle = '#666'; ctx.fillStyle = '#333'; ctx.lineWidth = 1; ctx.font = '11px Arial';
    if (!vertical) {
      const y = y1 + off;
      ctx.beginPath(); ctx.moveTo(x1, y1 + Math.sign(off) * 3); ctx.lineTo(x1, y + Math.sign(off) * 4); ctx.moveTo(x2, y2 + Math.sign(off) * 3); ctx.lineTo(x2, y + Math.sign(off) * 4);
      ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      for (const xx of [x1, x2]) { ctx.beginPath(); ctx.moveTo(xx - 3, y + 3); ctx.lineTo(xx + 3, y - 3); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.fillText(txt, (x1 + x2) / 2, y - 3);
    } else {
      const x = x1 + off;
      ctx.beginPath(); ctx.moveTo(x1 + Math.sign(off) * 3, y1); ctx.lineTo(x + Math.sign(off) * 4, y1); ctx.moveTo(x2 + Math.sign(off) * 3, y2); ctx.lineTo(x + Math.sign(off) * 4, y2);
      ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
      for (const yy of [y1, y2]) { ctx.beginPath(); ctx.moveTo(x - 3, yy + 3); ctx.lineTo(x + 3, yy - 3); ctx.stroke(); }
      ctx.translate(x - 3, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(txt, 0, 0);
    }
    ctx.restore();
  }
  const uniq = (arr) => [...new Set(arr.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);

  /* ============================ PLANTA ============================ */
  function planta(cv, P, R, o = {}) {
    const { ctx, W, H } = prep(cv, o.w, o.h);
    const { Lx, Ly } = P.geom;
    const campo = CAMPOS[o.campo || 'none'] || CAMPOS.none;
    const conMapa = R && campo.f;
    const ml = 70, mr = conMapa ? 95 : 30, mt = 34, mb = 64;
    const sc = Math.min((W - ml - mr) / Lx, (H - mt - mb) / Ly);
    const ox = ml + ((W - ml - mr) - Lx * sc) / 2, oy = mt + ((H - mt - mb) - Ly * sc) / 2 + Ly * sc;
    const X = x => ox + x * sc, Y = y => oy - y * sc;
    const T = { X, Y, sc, ox, oy, inv: (px, py) => [(px - ox) / sc, (oy - py) / sc] };

    let lo = 0, hi = 1, f = null;
    if (conMapa) {
      f = campo.f(R);
      [lo, hi] = rango(f, campo.util);
      const pw = Math.max(1, Math.round(Lx * sc)), ph = Math.max(1, Math.round(Ly * sc));
      const off = document.createElement('canvas'); off.width = pw; off.height = ph;
      const oc = off.getContext('2d'), img = oc.createImageData(pw, ph);
      for (let py = 0; py < ph; py++) {
        const y = Ly * (1 - (py + 0.5) / ph);
        for (let px = 0; px < pw; px++) {
          const x = Lx * (px + 0.5) / pw;
          const v = FEM.interp(R.m, f, x, y);
          const c = colorDe(v, lo, hi, campo.util, o.bandas);
          const k = 4 * (py * pw + px);
          img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      ctx.drawImage(off, X(0), Y(Ly), Lx * sc, Ly * sc);
    } else {
      ctx.fillStyle = '#e9eef2'; ctx.fillRect(X(0), Y(Ly), Lx * sc, Ly * sc);
    }
    // malla
    if (R && o.malla) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5; ctx.beginPath();
      for (let i = 0; i <= R.m.nxE; i++) { ctx.moveTo(X(i * R.m.dx), Y(0)); ctx.lineTo(X(i * R.m.dx), Y(Ly)); }
      for (let j = 0; j <= R.m.nyE; j++) { ctx.moveTo(X(0), Y(j * R.m.dy)); ctx.lineTo(X(Lx), Y(j * R.m.dy)); }
      ctx.stroke();
    }
    // ejes de columnas
    const xs = uniq(P.cols.map(c => c.x)), ys = uniq(P.cols.map(c => c.y));
    ctx.save(); ctx.setLineDash([8, 3, 2, 3]); ctx.strokeStyle = 'rgba(80,80,80,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (const x of xs) { ctx.moveTo(X(x), Y(Ly) - 14); ctx.lineTo(X(x), Y(0) + 14); }
    for (const y of ys) { ctx.moveTo(X(0) - 14, Y(y)); ctx.lineTo(X(Lx) + 14, Y(y)); }
    ctx.stroke(); ctx.restore();
    // refuerzos
    if (o.refs !== false) for (const r of P.ref) {
      if (o.capa && o.capa !== r.capa) continue;
      const c = COL[r.capa];
      ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.setLineDash(r.capa === 'sup' ? [6, 3] : []);
      ctx.fillStyle = r.capa === 'inf' ? 'rgba(29,111,216,0.08)' : 'rgba(208,52,44,0.08)';
      ctx.fillRect(X(r.x1), Y(r.y2), (r.x2 - r.x1) * sc, (r.y2 - r.y1) * sc);
      ctx.strokeRect(X(r.x1), Y(r.y2), (r.x2 - r.x1) * sc, (r.y2 - r.y1) * sc);
      ctx.setLineDash([]); ctx.lineWidth = 2.2; ctx.beginPath();
      const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
      if (r.dir === 'x') { ctx.moveTo(X(r.x1) + 3, Y(cy)); ctx.lineTo(X(r.x2) - 3, Y(cy)); }
      else { ctx.moveTo(X(cx), Y(r.y1) - 3); ctx.lineTo(X(cx), Y(r.y2) + 3); }
      ctx.stroke();
      ctx.font = 'bold 10px Arial'; ctx.fillStyle = c; ctx.textAlign = 'center';
      const lbl = `${r.id}: Ø${r.d} c/${r.s}`;
      if (r.dir === 'x') ctx.fillText(lbl, X(cx), Y(cy) - 4);
      else { ctx.save(); ctx.translate(X(cx) - 4, Y(cy)); ctx.rotate(-Math.PI / 2); ctx.fillText(lbl, 0, 0); ctx.restore(); }
      ctx.restore();
    }
    // perímetros de punzonado
    if (R && o.punz) {
      for (const p of R.punz) {
        if (!p.segs) continue;
        ctx.strokeStyle = p.ok ? COL.ok : COL.bad; ctx.lineWidth = 1.5; ctx.setLineDash([4, 2]); ctx.beginPath();
        for (const g of p.segs) { ctx.moveTo(X(g.ax), Y(g.ay)); ctx.lineTo(X(g.bx), Y(g.by)); }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // contorno
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.strokeRect(X(0), Y(Ly), Lx * sc, Ly * sc);
    // columnas
    P.cols.forEach((c, i) => {
      const sel = o.sel === i;
      ctx.fillStyle = sel ? '#ff9800' : COL.col;
      ctx.fillRect(X(c.x - c.bx / 2), Y(c.y + c.by / 2), c.bx * sc, c.by * sc);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(X(c.x - c.bx / 2), Y(c.y + c.by / 2), c.bx * sc, c.by * sc);
      ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left';
      const tx = X(c.x + c.bx / 2) + 3, ty = Y(c.y + c.by / 2) - 2;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(c.id, tx, ty);
      ctx.fillStyle = '#111'; ctx.fillText(c.id, tx, ty);
      if (R && o.punz) {
        const p = R.punz[i];
        if (p) { ctx.font = '10px Arial'; ctx.strokeText(p.ratio.toFixed(2), tx, ty + 12); ctx.fillStyle = p.ok ? COL.ok : COL.bad; ctx.fillText(p.ratio.toFixed(2), tx, ty + 12); }
      }
    });
    // cortes
    if (o.cortes) {
      ctx.save(); ctx.strokeStyle = '#6a1b9a'; ctx.fillStyle = '#6a1b9a'; ctx.lineWidth = 1.6; ctx.setLineDash([12, 4, 3, 4]);
      ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
      const cy = o.cortes.y, cx = o.cortes.x;
      ctx.beginPath(); ctx.moveTo(X(0) - 22, Y(cy)); ctx.lineTo(X(Lx) + 22, Y(cy)); ctx.moveTo(X(cx), Y(0) + 22); ctx.lineTo(X(cx), Y(Ly) - 22); ctx.stroke();
      ctx.fillText('A', X(0) - 30, Y(cy) + 4); ctx.fillText('A', X(Lx) + 30, Y(cy) + 4);
      ctx.fillText('B', X(cx), Y(0) + 36); ctx.fillText('B', X(cx), Y(Ly) - 26);
      ctx.restore();
    }
    // cotas
    if (o.cotas !== false) {
      const cx = [0, ...xs.filter(x => x > 0.01 && x < Lx - 0.01), Lx];
      for (let i = 0; i < cx.length - 1; i++) cota(ctx, X(cx[i]), Y(0), X(cx[i + 1]), Y(0), (cx[i + 1] - cx[i]).toFixed(2), 22);
      cota(ctx, X(0), Y(0), X(Lx), Y(0), `Lx = ${Lx.toFixed(2)} m`, 44);
      const cyy = [0, ...ys.filter(y => y > 0.01 && y < Ly - 0.01), Ly];
      for (let i = 0; i < cyy.length - 1; i++) cota(ctx, X(0), Y(cyy[i]), X(0), Y(cyy[i + 1]), (cyy[i + 1] - cyy[i]).toFixed(2), -22, true);
      cota(ctx, X(0), Y(0), X(0), Y(Ly), `Ly = ${Ly.toFixed(2)} m`, -46, true);
    }
    // extremos
    if (conMapa && !campo.util) {
      let imx = -1, imn = -1;
      for (let n = 0; n < f.length; n++) { if (isNaN(f[n])) continue; if (imx < 0 || f[n] > f[imx]) imx = n; if (imn < 0 || f[n] < f[imn]) imn = n; }
      for (const [n, s] of [[imx, 'máx'], [imn, 'mín']]) {
        if (n < 0) continue;
        const px = X(R.m.X[n]), py = Y(R.m.Y[n]);
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill();
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left';
        const t = `${s} ${fmt(f[n], 2)}`;
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(t, px + 6, py - 5); ctx.fillText(t, px + 6, py - 5);
      }
    }
    if (conMapa) leyenda(ctx, W - mr + 18, mt + 10, Math.min(300, H - mt - mb - 20), lo, hi, campo, o.bandas);
    // título
    ctx.fillStyle = '#111'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'left';
    ctx.fillText(o.titulo || (conMapa ? campo.t + (campo.u ? ` [${campo.u}]` : '') : 'Planta'), 10, 18);
    // norte / ejes
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath();
    const ax = 18, ay = H - 18; ctx.moveTo(ax, ay); ctx.lineTo(ax + 28, ay); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 28); ctx.stroke();
    ctx.font = '11px Arial'; ctx.fillStyle = '#333'; ctx.fillText('X', ax + 31, ay + 4); ctx.fillText('Y', ax - 3, ay - 32);
    return T;
  }

  /* ========================= AXONOMÉTRICA ========================= */
  function axo(cv, P, R, o = {}) {
    const { ctx, W, H } = prep(cv, o.w, o.h);
    const { Lx, Ly, h } = P.geom;
    const az = (o.az ?? -35) * Math.PI / 180, el = (o.el ?? 32) * Math.PI / 180;
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const scale = (o.zoom || 1) * Math.min(W, H) / (1.35 * Math.max(Lx, Ly));
    const cx = W / 2 + (o.panx || 0), cy = H / 2 + (o.pany || 0) + 20;
    const pr = (x, y, z) => {
      const px = x - Lx / 2, py = y - Ly / 2;
      const x1 = px * ca - py * sa, y1 = px * sa + py * ca;
      return [cx + x1 * scale, cy - (y1 * se + z * ce) * scale, y1 * ce - z * se];
    };
    const campo = CAMPOS[o.campo || 'none'] || CAMPOS.none;
    let f = null, lo = 0, hi = 1;
    if (R && campo.f) { f = campo.f(R); [lo, hi] = rango(f, campo.util); }
    const polys = [];
    const light = [0.35, 0.45, 0.82];
    const shade = (pts, base) => {
      const ux = pts[1][0] - pts[0][0], uy = pts[1][1] - pts[0][1], uz = pts[1][2] - pts[0][2];
      const vx = pts[3][0] - pts[0][0], vy = pts[3][1] - pts[0][1], vz = pts[3][2] - pts[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1;
      const d = Math.abs((nx * light[0] + ny * light[1] + nz * light[2]) / nl);
      const k = 0.62 + 0.38 * d;
      return `rgb(${base.map(v => Math.round(v * k))})`;
    };
    let ex = 0;
    if (R) {
      let wm = 0; for (const w of R.rs.w) wm = Math.max(wm, Math.abs(w));
      ex = wm > 0 ? (o.exag ?? 1) * 0.05 * Math.max(Lx, Ly) / wm : 0;
    }
    if (R) {
      const m = R.m, Z = n => R.rs.w[n] * ex;
      for (const el4 of m.els) {
        const pts = el4.map(n => [m.X[n], m.Y[n], Z(n)]);
        let base = [176, 190, 197];
        if (f) { let v = 0, c = 0; for (const n of el4) if (!isNaN(f[n])) { v += f[n]; c++; } base = colorDe(c ? v / c : NaN, lo, hi, campo.util, o.bandas); }
        polys.push({ p: pts.map(q => pr(...q)), col: shade(pts, base), stroke: o.malla });
      }
      // faldón (espesor)
      const edge = [];
      for (let i = 0; i < m.nxE; i++) { edge.push([m.id(i, 0), m.id(i + 1, 0)]); edge.push([m.id(i + 1, m.nyE), m.id(i, m.nyE)]); }
      for (let j = 0; j < m.nyE; j++) { edge.push([m.id(m.nxE, j), m.id(m.nxE, j + 1)]); edge.push([m.id(0, j + 1), m.id(0, j)]); }
      for (const [a, b] of edge) {
        const pts = [[m.X[a], m.Y[a], Z(a)], [m.X[b], m.Y[b], Z(b)], [m.X[b], m.Y[b], Z(b) - h], [m.X[a], m.Y[a], Z(a) - h]];
        polys.push({ p: pts.map(q => pr(...q)), col: shade(pts, [150, 156, 160]) });
      }
    } else {
      const pts = [[0, 0, 0], [Lx, 0, 0], [Lx, Ly, 0], [0, Ly, 0]];
      polys.push({ p: pts.map(q => pr(...q)), col: '#cfd8dc' });
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        const s = [pts[a], pts[b], [...pts[b].slice(0, 2), -h], [...pts[a].slice(0, 2), -h]];
        polys.push({ p: s.map(q => pr(...q)), col: '#9aa3a8' });
      }
    }
    polys.forEach(q => q.d = q.p.reduce((s, v) => s + v[2], 0) / q.p.length);
    polys.sort((a, b) => b.d - a.d);
    for (const q of polys) {
      ctx.beginPath(); ctx.moveTo(q.p[0][0], q.p[0][1]);
      for (let i = 1; i < q.p.length; i++) ctx.lineTo(q.p[i][0], q.p[i][1]);
      ctx.closePath(); ctx.fillStyle = q.col; ctx.fill();
      ctx.strokeStyle = q.stroke ? 'rgba(0,0,0,0.18)' : q.col; ctx.lineWidth = q.stroke ? 0.5 : 0.6; ctx.stroke();
    }
    // columnas
    const Hc = Math.max(0.8, 0.08 * Math.max(Lx, Ly));
    const cols = P.cols.map((c, i) => {
      const z0 = R ? FEM.interp(R.m, R.rs.w, c.x, c.y) * ex : 0;
      const x0 = c.x - c.bx / 2, x1 = c.x + c.bx / 2, y0 = c.y - c.by / 2, y1 = c.y + c.by / 2, z1 = z0 + Hc;
      const faces = [
        [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
        [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]],
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
      ].map(fc => ({ p: fc.map(q => pr(...q)), col: shade(fc, o.sel === i ? [255, 152, 0] : [120, 130, 140]) }));
      faces.forEach(q => q.d = q.p.reduce((s, v) => s + v[2], 0) / 4);
      faces.sort((a, b) => b.d - a.d);
      return { c, faces, d: pr(c.x, c.y, z0)[2], top: pr(c.x, c.y, z1) };
    }).sort((a, b) => b.d - a.d);
    for (const k of cols) {
      for (const q of k.faces) {
        ctx.beginPath(); ctx.moveTo(q.p[0][0], q.p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q.p[i][0], q.p[i][1]);
        ctx.closePath(); ctx.fillStyle = q.col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.7; ctx.stroke();
      }
      ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
      ctx.strokeText(k.c.id, k.top[0], k.top[1] - 6); ctx.fillStyle = '#111'; ctx.fillText(k.c.id, k.top[0], k.top[1] - 6);
    }
    // triedro
    const L = Math.max(Lx, Ly) * 0.12, t0 = -0.08 * Math.max(Lx, Ly), o0 = pr(t0, t0, 0);
    const ax = [[pr(t0 + L, t0, 0), 'X', '#c62828'], [pr(t0, t0 + L, 0), 'Y', '#2e7d32'], [pr(t0, t0, L), 'Z', '#1565c0']];
    ctx.lineWidth = 2;
    for (const [p, t, c] of ax) { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(o0[0], o0[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.fillStyle = c; ctx.font = 'bold 12px Arial'; ctx.fillText(t, p[0] + (p[0] - o0[0]) * 0.15, p[1] + (p[1] - o0[1]) * 0.15); }
    if (f) leyenda(ctx, W - 80, 44, Math.min(280, H - 100), lo, hi, campo, o.bandas);
    ctx.fillStyle = '#111'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'left';
    ctx.fillText(o.titulo || ('Axonométrica — ' + (f ? campo.t : 'deformada (servicio)')), 10, 18);
    if (R) { ctx.font = '11px Arial'; ctx.fillStyle = '#555'; ctx.fillText(`Deformada exagerada ×${ex.toFixed(0)} · asentamiento máx. ${(R.aseg.wmax * 1000).toFixed(1)} mm`, 10, 34); }
  }

  /* ============================ CORTES ============================ */
  function grafico(ctx, box, xs, series, o) {
    const { x, y, w, h } = box;
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const v of s.v) if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (const l of (o.hlines || [])) { lo = Math.min(lo, l.v); hi = Math.max(hi, l.v); }
    if (o.cero !== false) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) hi = lo + 1;
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const L = xs[xs.length - 1];
    const X = v => x + v / L * w;
    const Y = v => o.invertir ? y + (v - lo) / (hi - lo) * h : y + h - (v - lo) / (hi - lo) * h;
    ctx.save();
    ctx.fillStyle = '#fafbfc'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    // grilla
    const step = niceStep((hi - lo) / 5);
    ctx.font = '10px Arial'; ctx.fillStyle = '#666'; ctx.textAlign = 'right';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      ctx.strokeStyle = Math.abs(v) < 1e-9 ? '#888' : '#eee'; ctx.beginPath(); ctx.moveTo(x, Y(v)); ctx.lineTo(x + w, Y(v)); ctx.stroke();
      ctx.fillText(fmt(v, step < 1 ? 2 : 0), x - 4, Y(v) + 3);
    }
    for (const cl of (o.cols || [])) {
      ctx.strokeStyle = 'rgba(55,71,79,0.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(cl.s), y); ctx.lineTo(X(cl.s), y + h); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const l of (o.hlines || [])) {
      ctx.strokeStyle = l.color; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, Y(l.v)); ctx.lineTo(x + w, Y(l.v)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = l.color; ctx.textAlign = 'right'; ctx.font = 'bold 10px Arial'; ctx.fillText(l.label, x + w - 4, Y(l.v) - 3);
    }
    for (const s of series) {
      if (s.fill) {
        ctx.beginPath(); ctx.moveTo(X(xs[0]), Y(0));
        xs.forEach((v, i) => ctx.lineTo(X(v), Y(isFinite(s.v[i]) ? s.v[i] : 0)));
        ctx.lineTo(X(xs[xs.length - 1]), Y(0)); ctx.closePath(); ctx.fillStyle = s.fill; ctx.fill();
      }
      ctx.strokeStyle = s.color; ctx.lineWidth = s.lw || 1.8; ctx.setLineDash(s.dash || []);
      ctx.beginPath(); let st = false;
      xs.forEach((v, i) => { const val = s.v[i]; if (!isFinite(val)) { st = false; return; } if (!st) { ctx.moveTo(X(v), Y(val)); st = true; } else ctx.lineTo(X(v), Y(val)); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    // título y leyenda
    ctx.fillStyle = '#111'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'left'; ctx.fillText(o.titulo, x, y - 6);
    let lx = x + ctx.measureText(o.titulo).width + 16;
    ctx.font = '11px Arial';
    for (const s of series) {
      if (!s.label) continue;
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash || []); ctx.beginPath(); ctx.moveTo(lx, y - 10); ctx.lineTo(lx + 18, y - 10); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#333'; ctx.fillText(s.label, lx + 22, y - 6); lx += ctx.measureText(s.label).width + 40;
    }
    // extremos
    if (o.marcarExt !== false) for (const s of series.filter(s => s.ext)) {
      let im = 0; s.v.forEach((v, i) => { if (Math.abs(v) > Math.abs(s.v[im])) im = i; });
      ctx.fillStyle = s.color; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
      ctx.fillText(fmt(s.v[im], 1), X(xs[im]), Y(s.v[im]) + (o.invertir ? (s.v[im] >= 0 ? 12 : -5) : (s.v[im] >= 0 ? -5 : 12)));
    }
    ctx.restore();
    return { X, Y };
  }
  function niceStep(r) { const p = Math.pow(10, Math.floor(Math.log10(r || 1))); const n = r / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; }

  function datosCorte(P, R, dir, pos, N = 400) {
    const L = dir === 'x' ? P.geom.Lx : P.geom.Ly;
    const xs = [], pt = [];
    for (let i = 0; i <= N; i++) { const s = L * i / N; xs.push(s); pt.push(dir === 'x' ? [s, pos] : [pos, s]); }
    const g = f => pt.map(([x, y]) => FEM.interp(R.m, f, x, y));
    const k = dir === 'x' ? 'x' : 'y';
    const d = { xs, pt, L };
    d.q = g(R.rs.q); d.qu = g(R.ru.q); d.w = g(R.D.wmm);
    d.M = g(R.ru['m' + k]); d.Mb = g(R.D['m' + k + 'b']); d.Mt = g(R.D['m' + k + 't']);
    d.V = g(R.ru['q' + k]);
    d.capB = pt.map(([x, y]) => DIS.phiMn(DIS.asProv(P, x, y, 'inf', k), R.dd[k + 'b'], P.mat.fc, P.mat.fy));
    d.capT = pt.map(([x, y]) => -DIS.phiMn(DIS.asProv(P, x, y, 'sup', k), R.dd[k + 't'], P.mat.fc, P.mat.fy));
    return d;
  }

  function seccion(ctx, box, P, dir, pos, o = {}) {
    const { x, y, w, h: bh } = box;
    const { h, Lx, Ly } = P.geom, r = P.mat.rec;
    const L = dir === 'x' ? Lx : Ly, k = dir, kp = dir === 'x' ? 'y' : 'x';
    const sx = w / L;
    const top = y + Math.max(92, bh * 0.42);
    const tpx = Math.max(30, Math.min(bh - (top - y) - 30, 110)), vs = tpx / h, bot = top + tpx;
    const hc = Math.min(52, top - y - 38);
    const X = s => x + s * sx, Z = z => bot - z * vs;
    ctx.save();
    // columnas cortadas o vistas
    const cols = P.cols.filter(c => Math.abs((dir === 'x' ? c.y : c.x) - pos) <= (dir === 'x' ? c.by : c.bx) / 2 + 1e-6);
    const colsV = P.cols.filter(c => !cols.includes(c) && Math.abs((dir === 'x' ? c.y : c.x) - pos) < 3);
    for (const c of colsV) { const s = dir === 'x' ? c.x : c.y, b = dir === 'x' ? c.bx : c.by; ctx.strokeStyle = '#aaa'; ctx.setLineDash([4, 3]); ctx.strokeRect(X(s - b / 2), top - hc, b * sx, hc); ctx.setLineDash([]); }
    for (const c of cols) {
      const s = dir === 'x' ? c.x : c.y, b = dir === 'x' ? c.bx : c.by;
      ctx.fillStyle = '#cfd8dc'; ctx.fillRect(X(s - b / 2), top - hc, b * sx, hc);
      ctx.strokeStyle = '#37474f'; ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(X(s - b / 2), top); ctx.lineTo(X(s - b / 2), top - hc); ctx.moveTo(X(s + b / 2), top); ctx.lineTo(X(s + b / 2), top - hc); ctx.stroke();
      ctx.beginPath(); const xm = X(s), yy = top - hc; ctx.moveTo(X(s - b / 2) - 4, yy); ctx.lineTo(xm - 4, yy); ctx.lineTo(xm, yy - 6); ctx.lineTo(xm + 2, yy + 6); ctx.lineTo(xm + 6, yy); ctx.lineTo(X(s + b / 2) + 4, yy); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.fillText(c.id, X(s), top - hc - 8);
    }
    // hormigón
    ctx.fillStyle = '#eceff1'; ctx.fillRect(X(0), Z(h), L * sx, tpx);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6; ctx.strokeRect(X(0), Z(h), L * sx, tpx);
    // hormigón de limpieza + suelo
    ctx.fillStyle = '#d7ccc8'; ctx.fillRect(X(0) - 10, bot, L * sx + 20, 6);
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 1;
    for (let xx = X(0) - 10; xx < X(L) + 10; xx += 9) { ctx.beginPath(); ctx.moveTo(xx, bot + 14); ctx.lineTo(xx + 7, bot + 7); ctx.stroke(); }
    const a = P.arm;
    const lvl = {
      inf: { [k]: dir === 'x' ? r + a.inf.x.d / 2000 : r + a.inf.x.d / 1000 + a.inf.y.d / 2000, [kp]: dir === 'x' ? r + a.inf.x.d / 1000 + a.inf.y.d / 2000 : r + a.inf.x.d / 2000 },
      sup: { [k]: dir === 'x' ? h - r - a.sup.x.d / 2000 : h - r - a.sup.x.d / 1000 - a.sup.y.d / 2000, [kp]: dir === 'x' ? h - r - a.sup.x.d / 1000 - a.sup.y.d / 2000 : h - r - a.sup.x.d / 2000 }
    };
    const pata = h - 2 * r;
    for (const capa of ['inf', 'sup']) {
      const c = COL[capa];
      const zb = lvl[capa][k];
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath();
      const zEnd = capa === 'inf' ? zb + pata * 0.92 : zb - pata * 0.92;
      ctx.moveTo(X(r), Z(zEnd)); ctx.lineTo(X(r), Z(zb)); ctx.lineTo(X(L - r), Z(zb)); ctx.lineTo(X(L - r), Z(zEnd)); ctx.stroke();
      // barras perpendiculares (puntos)
      const b = a[capa][kp], zp = lvl[capa][kp];
      ctx.fillStyle = c;
      const sp = b.s / 100;
      for (let s = r; s <= L - r + 1e-6; s += sp) { ctx.beginPath(); ctx.arc(X(s), Z(zp), 2, 0, 7); ctx.fill(); }
      // refuerzos que corta la sección
      let off = 0;
      for (const z of P.ref.filter(z => z.capa === capa)) {
        const cover = dir === 'x' ? (pos >= z.y1 - 1e-6 && pos <= z.y2 + 1e-6) : (pos >= z.x1 - 1e-6 && pos <= z.x2 + 1e-6);
        if (!cover) continue;
        if (z.dir === k) {
          off += 1;
          const zz = capa === 'inf' ? zb + off * 0.025 * h / 0.6 * 1.3 : zb - off * 0.025 * h / 0.6 * 1.3;
          const s1 = dir === 'x' ? z.x1 : z.y1, s2 = dir === 'x' ? z.x2 : z.y2;
          ctx.strokeStyle = capa === 'inf' ? '#0b4fa8' : '#9b1c16'; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.moveTo(X(s1), Z(zz)); ctx.lineTo(X(s2), Z(zz)); ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
          ctx.fillText(`${z.id} Ø${z.d}c/${z.s}`, X((s1 + s2) / 2), capa === 'inf' ? bot + 26 : Z(h) - 4 - (off - 1) * 11);
        } else {
          const s1 = dir === 'x' ? z.x1 : z.y1, s2 = dir === 'x' ? z.x2 : z.y2;
          ctx.fillStyle = capa === 'inf' ? '#0b4fa8' : '#9b1c16';
          for (let s = s1; s <= s2 + 1e-6; s += z.s / 100) { ctx.beginPath(); ctx.arc(X(s), Z(zp + (capa === 'inf' ? 1 : -1) * 0.03 * h / 0.6), 2.4, 0, 7); ctx.fill(); }
        }
      }
    }
    ctx.fillStyle = '#111'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'left';
    ctx.fillText(o.titulo || `Corte ${dir === 'x' ? 'A-A' : 'B-B'} (${dir === 'x' ? 'y' : 'x'} = ${pos.toFixed(2)} m)`, x, y + 12);
    ctx.font = '10px Arial'; ctx.fillStyle = '#666';
    ctx.fillText(`Escala vertical exagerada ×${(vs / sx).toFixed(1)} · h = ${(h * 100).toFixed(0)} cm · rec = ${(r * 100).toFixed(1)} cm`, x, y + 26);
    const txtArm = capa => `${capa === 'inf' ? 'Inf.' : 'Sup.'} ${k.toUpperCase()}: Ø${a[capa][k].d} c/${a[capa][k].s}   ${kp.toUpperCase()}: Ø${a[capa][kp].d} c/${a[capa][kp].s}`;
    ctx.fillStyle = COL.sup; ctx.textAlign = 'right'; ctx.fillText(txtArm('sup'), x + w, y + 12);
    ctx.fillStyle = COL.inf; ctx.fillText(txtArm('inf'), x + w, y + 26);
    ctx.restore();
  }

  function cortes(cv, P, R, o = {}) {
    const dir = o.dir || 'x', pos = o.pos ?? (dir === 'x' ? P.geom.Ly / 2 : P.geom.Lx / 2);
    const { ctx, W, H } = prep(cv, o.w, o.h);
    const ml = 60, mr = 24, w = W - ml - mr;
    const L = dir === 'x' ? P.geom.Lx : P.geom.Ly;
    const colsIn = P.cols.filter(c => Math.abs((dir === 'x' ? c.y : c.x) - pos) <= (dir === 'x' ? c.by : c.bx) / 2 + 1e-6).map(c => ({ s: dir === 'x' ? c.x : c.y, id: c.id }));
    const hs = [0.25, 0.17, 0.14, 0.26, 0.18].map(f => f * (H - 30));
    let y = 8;
    seccion(ctx, { x: ml, y, w, h: hs[0] }, P, dir, pos);
    y += hs[0] + 18;
    if (!R) { ctx.fillStyle = '#666'; ctx.font = '13px Arial'; ctx.fillText('Calcule la platea para ver los diagramas.', ml, y + 30); return; }
    const d = datosCorte(P, R, dir, pos);
    const k = dir === 'x' ? 'x' : 'y';
    const gap = 26;
    grafico(ctx, { x: ml, y: y + gap, w, h: hs[1] - gap }, d.xs, [
      { v: d.q, color: '#6d4c41', fill: 'rgba(141,110,99,0.25)', label: 'q servicio', ext: true },
      { v: d.qu, color: '#a1887f', dash: [5, 3], label: 'q última' }
    ], { titulo: 'Presión en el suelo [kN/m²]', invertir: true, hlines: [{ v: R.suelo.sadm, label: `σadm = ${R.suelo.sadm.toFixed(0)}`, color: '#d0342c' }], cols: colsIn });
    y += hs[1];
    grafico(ctx, { x: ml, y: y + gap, w, h: hs[2] - gap }, d.xs, [{ v: d.w.map(v => -v), color: '#1565c0', label: 'w (asentamiento, servicio)', ext: true }], { titulo: 'Asentamiento [mm]', cols: colsIn, cero: true });
    y += hs[2];
    grafico(ctx, { x: ml, y: y + gap, w, h: hs[3] - gap }, d.xs, [
      { v: d.capB, color: COL.inf, dash: [6, 3], lw: 1.4, label: 'φMn inferior' },
      { v: d.capT, color: COL.sup, dash: [6, 3], lw: 1.4, label: 'φMn superior' },
      { v: d.M, color: '#777', lw: 1, label: `M${k} FEM` },
      { v: d.Mb, color: COL.inf, fill: 'rgba(29,111,216,0.15)', label: `M${k}* inf.`, ext: true },
      { v: d.Mt, color: COL.sup, fill: 'rgba(208,52,44,0.15)', label: `M${k}* sup.`, ext: true }
    ], { titulo: `Momentos de diseño M${k} [kNm/m] (+ tracción inferior, dibujado hacia abajo)`, invertir: true, cols: colsIn });
    y += hs[3];
    grafico(ctx, { x: ml, y: y + gap, w, h: hs[4] - gap }, d.xs, [{ v: d.V, color: '#2e7d32', fill: 'rgba(46,125,50,0.12)', label: `Q${k} último`, ext: true }],
      { titulo: `Corte Q${k} [kN/m]`, cols: colsIn, hlines: [{ v: R.corte.phiVc, label: 'φVc', color: '#d0342c' }, { v: -R.corte.phiVc, label: '-φVc', color: '#d0342c' }] });
    // eje de abscisas común
    ctx.fillStyle = '#444'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
    const st = niceStep(L / 10);
    for (let s = 0; s <= L + 1e-9; s += st) ctx.fillText(s.toFixed(st < 1 ? 1 : 0), ml + s / L * w, H - 6);
    ctx.textAlign = 'right'; ctx.fillText(dir === 'x' ? 'x [m]' : 'y [m]', W - 4, H - 6);
    for (const c of colsIn) { ctx.fillStyle = '#37474f'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.fillText(c.id, ml + c.s / L * w, H - 18); }
  }

  return { CAMPOS, planta, axo, cortes, seccion, datosCorte, turbo, utilColor, fmt, COL };
})();
