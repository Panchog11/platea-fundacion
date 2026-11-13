'use strict';
/* =====================================================================
   DISEÑO — CIRSOC 201-2005 (base ACI 318) y verificaciones geotécnicas
   Unidades internas: kN, m, MPa (hormigón/acero), cm²/m (armaduras)
   ===================================================================== */
const DIS = (() => {
  const DIAMS = [6, 8, 10, 12, 16, 20, 25, 32];
  const KGCM2 = 98.0665;     // 1 kg/cm² = 98.0665 kN/m²
  const KGCM3 = 9806.65;     // 1 kg/cm³ = 9806.65 kN/m³
  const PHI_F = 0.9, PHI_V = 0.75;

  const area = d => Math.PI * d * d / 400;            // cm² de una barra (d en mm)
  const asm = (d, s) => area(d) * 100 / s;            // cm²/m  (s en cm)
  const kgm = d => 0.00617 * d * d;                   // kg/m
  const capaTxt = c => c === 'inf' ? 'inferior' : 'superior';

  function dEff(P, capa, dir) {
    const a = P.arm[capa], h = P.geom.h, r = P.mat.rec;
    return dir === 'x' ? h - r - a.x.d / 2000 : h - r - a.x.d / 1000 - a.y.d / 2000;
  }
  function asReq(Mu, d, fc, fy) {
    if (Mu <= 1e-9) return 0;
    const Rn = Mu / 1000 / (PHI_F * d * d);
    const t = 1 - 2 * Rn / (0.85 * fc);
    if (t < 0) return Infinity;
    return 0.85 * fc / fy * (1 - Math.sqrt(t)) * d * 1e4;
  }
  function phiMn(As, d, fc, fy) {
    const A = As / 1e4, a = A * fy / (0.85 * fc);
    return PHI_F * A * fy * (d - a / 2) * 1000;
  }
  function woodArmer(mx, my, mxy) {
    const a = Math.abs(mxy);
    let xb = mx + a, yb = my + a;
    if (xb < 0) { xb = 0; yb = my + a * a / Math.abs(mx); }
    else if (yb < 0) { yb = 0; xb = mx + a * a / Math.abs(my); }
    let xt = mx - a, yt = my - a;
    if (xt > 0) { xt = 0; yt = my - a * a / Math.abs(mx); }
    else if (yt > 0) { yt = 0; xt = mx - a * a / Math.abs(my); }
    return { xb: Math.max(0, xb), yb: Math.max(0, yb), xt: Math.min(0, xt), yt: Math.min(0, yt) };
  }
  function asBase(P, capa, dir) { const b = P.arm[capa][dir]; return asm(b.d, b.s); }
  function asProv(P, x, y, capa, dir, sinAuto) {
    let A = asBase(P, capa, dir);
    for (const r of P.ref) {
      if (r.capa !== capa || r.dir !== dir || (sinAuto && r.auto)) continue;
      // una zona que llega al recubrimiento se considera hasta el borde
      const e = P.mat.rec + 1e-6, Lx = P.geom.Lx, Ly = P.geom.Ly;
      const x1 = r.x1 <= e ? -1 : r.x1, x2 = r.x2 >= Lx - e ? Lx + 1 : r.x2;
      const y1 = r.y1 <= e ? -1 : r.y1, y2 = r.y2 >= Ly - e ? Ly + 1 : r.y2;
      if (x >= x1 - 1e-6 && x <= x2 + 1e-6 && y >= y1 - 1e-6 && y <= y2 + 1e-6) A += asm(r.d, r.s);
    }
    return A;
  }
  // Longitud de anclaje recta (CIRSOC 201-2005 12.2.2, simplificada), m
  function ld(db, fc, fy, sup) {
    const psiT = sup ? 1.3 : 1.0;
    const k = db <= 16 ? 12 / 25 : 3 / 5;
    return Math.max(0.30, k * fy * psiT / Math.sqrt(fc) * db / 1000);
  }

  /* --------------- Capacidad de carga (Brinch Hansen / Vesic) --------------- */
  function portante(P) {
    const s = P.suelo, B = Math.min(P.geom.Lx, P.geom.Ly), L = Math.max(P.geom.Lx, P.geom.Ly);
    const ph = s.phi * Math.PI / 180, t = Math.tan(ph);
    const Nq = Math.exp(Math.PI * t) * Math.tan(Math.PI / 4 + ph / 2) ** 2;
    const Nc = ph > 1e-6 ? (Nq - 1) / t : 5.14;
    const Ng = 2 * (Nq + 1) * t;
    const sc = 1 + (B / L) * (Nq / Nc), sq = 1 + (B / L) * t, sg = Math.max(0.6, 1 - 0.4 * B / L);
    const k = s.Df / B <= 1 ? s.Df / B : Math.atan(s.Df / B);
    const dc = 1 + 0.4 * k, dq = 1 + 2 * t * (1 - Math.sin(ph)) ** 2 * k, dg = 1;
    const gw = 9.81;
    const q = s.nf < s.Df ? s.gamma * s.nf + (s.gamma - gw) * (s.Df - s.nf) : s.gamma * s.Df;
    const gEf = s.nf <= s.Df ? s.gamma - gw : (s.nf >= s.Df + B ? s.gamma : (s.gamma - gw) + gw * (s.nf - s.Df) / B);
    const t1 = s.c * Nc * sc * dc, t2 = q * Nq * sq * dq, t3 = 0.5 * gEf * B * Ng * sg * dg;
    const qult = t1 + t2 + t3;
    return { B, L, Nq, Nc, Ng, sc, sq, sg, dc, dq, dg, q, gEf, t1, t2, t3, qult, qadm: qult / s.FS };
  }

  /* --------------- Punzonado (CIRSOC 201-2005 11.12) --------------- */
  function punzonado(P, m, ru, pU, c, dOver) {
    const d = dOver ?? (dEff(P, 'inf', 'x') + dEff(P, 'inf', 'y')) / 2;
    const { Lx, Ly } = P.geom, fc = P.mat.fc;
    const fL = c.x - c.bx / 2, fR = Lx - (c.x + c.bx / 2), fB = c.y - c.by / 2, fT = Ly - (c.y + c.by / 2);
    const oL = fL <= d, oR = fR <= d, oB = fB <= d, oT = fT <= d;
    const x0 = oL ? 0 : c.x - c.bx / 2 - d / 2, x1 = oR ? Lx : c.x + c.bx / 2 + d / 2;
    const y0 = oB ? 0 : c.y - c.by / 2 - d / 2, y1 = oT ? Ly : c.y + c.by / 2 + d / 2;
    const segs = [];
    if (!oB) segs.push({ ax: x0, ay: y0, bx: x1, by: y0, hz: true });
    if (!oT) segs.push({ ax: x0, ay: y1, bx: x1, by: y1, hz: true });
    if (!oL) segs.push({ ax: x0, ay: y0, bx: x0, by: y1, hz: false });
    if (!oR) segs.push({ ax: x1, ay: y0, bx: x1, by: y1, hz: false });
    const lados = segs.length;
    let b0 = 0, sx = 0, sy = 0;
    for (const g of segs) { g.L = Math.hypot(g.bx - g.ax, g.by - g.ay); g.mx = (g.ax + g.bx) / 2; g.my = (g.ay + g.by) / 2; b0 += g.L; sx += g.L * g.mx; sy += g.L * g.my; }
    if (b0 <= 0) return { c, d, lados: 0, ok: false, ratio: Infinity, b0: 0, nota: 'Sin perímetro crítico' };
    const xg = sx / b0, yg = sy / b0;
    let Jx = 0, Jy = 0;
    for (const g of segs) {
      if (g.hz) { Jx += g.L * d * (g.my - yg) ** 2; Jy += d * g.L ** 3 / 12 + g.L * d ** 3 / 12 + g.L * d * (g.mx - xg) ** 2; }
      else { Jy += g.L * d * (g.mx - xg) ** 2; Jx += d * g.L ** 3 / 12 + g.L * d ** 3 / 12 + g.L * d * (g.my - yg) ** 2; }
    }
    const A0 = (x1 - x0) * (y1 - y0);
    let qs = 0; const ns = 6;
    for (let i = 0; i < ns; i++) for (let j = 0; j < ns; j++)
      qs += FEM.interp(m, ru.q, x0 + (i + 0.5) * (x1 - x0) / ns, y0 + (j + 0.5) * (y1 - y0) / ns);
    const qavg = qs / (ns * ns);
    const Vu = c.u.N + pU * A0 - qavg * A0;
    const Mxt = c.u.Mx - Vu * (c.y - yg), Myt = c.u.My + Vu * (c.x - xg);
    const gvx = 1 - 1 / (1 + (2 / 3) * Math.sqrt((y1 - y0) / (x1 - x0)));
    const gvy = 1 - 1 / (1 + (2 / 3) * Math.sqrt((x1 - x0) / (y1 - y0)));
    let vmax = 0;
    for (const g of segs) for (const [px, py] of [[g.ax, g.ay], [g.bx, g.by]]) {
      const v = Vu / (b0 * d) + (Jx > 0 ? gvx * Math.abs(Mxt) * Math.abs(py - yg) / Jx : 0) + (Jy > 0 ? gvy * Math.abs(Myt) * Math.abs(px - xg) / Jy : 0);
      vmax = Math.max(vmax, v);
    }
    const vd = Vu / (b0 * d) / 1000, vu = vmax / 1000;
    const beta = Math.max(c.bx, c.by) / Math.min(c.bx, c.by);
    const as = lados >= 4 ? 40 : lados === 3 ? 30 : 20;
    const sf = Math.sqrt(fc);
    const vc1 = (1 + 2 / beta) * sf / 6, vc2 = (as * d / b0 + 2) * sf / 12, vc3 = sf / 3;
    const vc = Math.min(vc1, vc2, vc3), phivc = PHI_V * vc;
    const ratio = vu / phivc;
    const tipo = lados >= 4 ? 'Interior' : lados === 3 ? 'Borde' : 'Esquina';
    return { c, d, x0, x1, y0, y1, segs, lados, tipo, b0, xg, yg, Jx, Jy, A0, qavg, Vu, Mxt, Myt, gvx, gvy, vd, vu, beta, as, vc1, vc2, vc3, vc, phivc, ratio, ok: ratio <= 1 };
  }

  /* --------------- Planilla de doblado --------------- */
  function planilla(P) {
    const { Lx, Ly, h } = P.geom, r = P.mat.rec, fc = P.mat.fc, fy = P.mat.fy;
    const pata = Math.max(0, h - 2 * r);
    const out = [];
    const add = (o) => {
      const n = Math.max(1, Math.floor(o.reparto / (o.s / 100) + 1e-6) + 1);
      const lap = 1.3 * ld(o.d, fc, fy, o.capa === 'sup');
      let L = o.Lr + (o.patas ? 2 * pata : 0), nEmp = 0;
      if (L > 12) nEmp = Math.ceil((L - 12) / (12 - lap));
      const Lb = L + nEmp * lap;
      out.push({ ...o, pos: out.length + 1, n, pata: o.patas ? pata : 0, lap, nEmp, Lb, Lt: n * Lb, kg: n * Lb * kgm(o.d) });
    };
    for (const capa of ['inf', 'sup']) for (const dir of ['x', 'y']) {
      const b = P.arm[capa][dir];
      add({ desc: `Malla ${capaTxt(capa)} dir. ${dir.toUpperCase()}`, capa, dir, d: b.d, s: b.s, Lr: (dir === 'x' ? Lx : Ly) - 2 * r, reparto: (dir === 'x' ? Ly : Lx) - 2 * r, patas: true, x1: r, x2: Lx - r, y1: r, y2: Ly - r });
    }
    for (const z of P.ref) {
      const x1 = Math.max(z.x1, r), x2 = Math.min(z.x2, Lx - r), y1 = Math.max(z.y1, r), y2 = Math.min(z.y2, Ly - r);
      if (x2 <= x1 || y2 <= y1) continue;
      add({ desc: `Refuerzo ${z.id} ${capaTxt(z.capa)} dir. ${z.dir.toUpperCase()}`, capa: z.capa, dir: z.dir, d: z.d, s: z.s, Lr: z.dir === 'x' ? x2 - x1 : y2 - y1, reparto: z.dir === 'x' ? y2 - y1 : x2 - x1, patas: false, ref: z.id, x1, x2, y1, y2 });
    }
    const porD = {};
    for (const p of out) porD[p.d] = (porD[p.d] || 0) + p.kg;
    return { pos: out, pata, porD, total: out.reduce((s, p) => s + p.kg, 0) };
  }

  /* --------------- Cálculo completo --------------- */
  function calcular(P) {
    const t0 = performance.now();
    const { Lx, Ly, h } = P.geom, fc = P.mat.fc, fy = P.mat.fy, gc = P.mat.gc;
    const m = FEM.crearMalla(Lx, Ly, P.geom.malla);
    if (m.nn > 16000) throw new Error(`Malla demasiado fina (${m.nn} nodos). Aumente el tamaño de malla.`);
    const E = 4700 * Math.sqrt(fc) * 1000;
    const ks = P.suelo.ks * KGCM3, sadm = P.suelo.sadm * KGCM2;
    const cfg = { E, nu: P.mat.nu, h, ks, sinTraccion: !!P.suelo.sinTraccion };
    const pD = gc * h + P.cargas.qD, pS = pD + P.cargas.qL;
    const pU = P.cargas.fD * pD + P.cargas.fL * P.cargas.qL;
    const colsS = P.cols.map(c => ({ x: c.x, y: c.y, bx: c.bx, by: c.by, N: c.s.N, Mx: c.s.Mx, My: c.s.My }));
    const colsU = P.cols.map(c => ({ x: c.x, y: c.y, bx: c.bx, by: c.by, N: c.u.N, Mx: c.u.Mx, My: c.u.My }));
    const rs = FEM.analizar(m, cfg, { p: pS, cols: colsS });
    const ru = FEM.analizar(m, cfg, { p: pU, cols: colsU });

    // ---- Flexión: Wood-Armer + armadura requerida / provista en cada nodo
    const nn = m.nn, F = () => new Float64Array(nn);
    const dd = { xb: dEff(P, 'inf', 'x'), yb: dEff(P, 'inf', 'y'), xt: dEff(P, 'sup', 'x'), yt: dEff(P, 'sup', 'y') };
    const D = { mxb: F(), myb: F(), mxt: F(), myt: F(), asxb: F(), asyb: F(), asxt: F(), asyt: F(), pxb: F(), pyb: F(), pxt: F(), pyt: F(), uxb: F(), uyb: F(), uxt: F(), uyt: F(), umax: F(), wmm: F() };
    const key = { xb: ['inf', 'x'], yb: ['inf', 'y'], xt: ['sup', 'x'], yt: ['sup', 'y'] };
    // Nodos estrictamente dentro de la sección de una columna: se diseña a cara de columna
    const inCol = new Uint8Array(nn);
    for (let n = 0; n < nn; n++) for (const c of P.cols)
      if (Math.abs(m.X[n] - c.x) < c.bx / 2 - 1e-6 && Math.abs(m.Y[n] - c.y) < c.by / 2 - 1e-6) { inCol[n] = 1; break; }
    for (let n = 0; n < nn; n++) {
      const wa = woodArmer(ru.mx[n], ru.my[n], ru.mxy[n]);
      D.mxb[n] = wa.xb; D.myb[n] = wa.yb; D.mxt[n] = wa.xt; D.myt[n] = wa.yt;
      let um = 0;
      for (const k of ['xb', 'yb', 'xt', 'yt']) {
        const Mu = Math.abs(D['m' + k][n]);
        D['as' + k][n] = asReq(Mu, dd[k], fc, fy);
        const Ap = asProv(P, m.X[n], m.Y[n], key[k][0], key[k][1]);
        D['p' + k][n] = Ap;
        const u = Mu / phiMn(Ap, dd[k], fc, fy);
        D['u' + k][n] = u; um = Math.max(um, u);
      }
      D.umax[n] = um;
      D.wmm[n] = -rs.w[n] * 1000;
      if (inCol[n]) for (const k of ['xb', 'yb', 'xt', 'yt', 'max']) { D['u' + k][n] = NaN; if (k !== 'max') D['as' + k][n] = NaN; }
    }
    const flex = {};
    for (const k of ['xb', 'yb', 'xt', 'yt']) {
      let im = 0, ir = 0, fail = 0;
      for (let n = 0; n < nn; n++) {
        if (inCol[n]) continue;
        if (inCol[im] || D['u' + k][n] > D['u' + k][im]) im = n;
        if (inCol[ir]) ir = n;
        if (D['as' + k][n] > D['as' + k][ir]) ir = n;
        if (D['u' + k][n] > 1.0001) fail++;
      }
      const [capa, dir] = key[k], b = P.arm[capa][dir];
      flex[k] = { capa, dir, d: dd[k], base: asBase(P, capa, dir), barra: b, Mu: Math.abs(D['m' + k][im]), x: m.X[im], y: m.Y[im], u: D['u' + k][im], Ap: D['p' + k][im], phiMn: phiMn(D['p' + k][im], dd[k], fc, fy), asMax: D['as' + k][ir], xr: m.X[ir], yr: m.Y[ir], MuR: Math.abs(D['m' + k][ir]), fail, ok: fail === 0 };
    }
    const asMin = 0.0018 * h * 1e4;
    const smax = Math.min(2.5 * h * 100, 25);
    const minOk = { x: flex.xb.base + flex.xt.base >= asMin - 1e-9, y: flex.yb.base + flex.yt.base >= asMin - 1e-9 };
    const sepOk = ['inf', 'sup'].every(c => ['x', 'y'].every(d => P.arm[c][d].s <= smax + 1e-9));
    // Cuantía balanceada (control por tracción): c/d ≤ 0.375
    const beta1 = fc <= 30 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 30) / 7);

    // ---- Corte en una dirección (fuera de zonas de punzonado)
    const dmed = (dd.xb + dd.yb) / 2;
    const phiVc = PHI_V * Math.sqrt(fc) / 6 * dmed * 1000;
    let vMax = 0, vI = 0;
    for (let n = 0; n < nn; n++) {
      let cerca = false;
      for (const c of P.cols) {
        const ex = Math.max(0, Math.abs(m.X[n] - c.x) - c.bx / 2), ey = Math.max(0, Math.abs(m.Y[n] - c.y) - c.by / 2);
        if (Math.hypot(ex, ey) < 2 * dmed) { cerca = true; break; }
      }
      if (cerca) continue;
      const v = Math.max(Math.abs(ru.qx[n]), Math.abs(ru.qy[n]));
      if (v > vMax) { vMax = v; vI = n; }
    }
    const corte = { Vu: vMax, x: m.X[vI], y: m.Y[vI], d: dmed, phiVc, ratio: vMax / phiVc, ok: vMax <= phiVc };

    // ---- Punzonado
    const punz = P.cols.map(c => {
      const r = punzonado(P, m, ru, pU, c);
      if (!r.ok && r.b0 > 0) {
        for (let hh = Math.ceil(h * 20) / 20 + 0.05; hh <= h + 2.0001; hh += 0.05) {
          const rr = punzonado(P, m, ru, pU, c, r.d + (hh - h));
          if (rr.ok) { r.hReq = hh; break; }
        }
      }
      return r;
    });

    // ---- Suelo
    let qmax = 0, iq = 0, wmin = 0, iw = 0;
    for (let n = 0; n < nn; n++) {
      if (rs.q[n] > qmax) { qmax = rs.q[n]; iq = n; }
      if (rs.w[n] < wmin) { wmin = rs.w[n]; iw = n; }
    }
    const Atot = Lx * Ly;
    const NcolS = P.cols.reduce((s, c) => s + c.s.N, 0);
    const Ntot = NcolS + pS * Atot;
    const xR = (P.cols.reduce((s, c) => s + c.s.N * c.x + c.s.My, 0) + pS * Atot * Lx / 2) / Ntot;
    const yR = (P.cols.reduce((s, c) => s + c.s.N * c.y - c.s.Mx, 0) + pS * Atot * Ly / 2) / Ntot;
    const ex = xR - Lx / 2, ey = yR - Ly / 2;
    const qmed = Ntot / Atot;
    const qRig = qmed * (1 + 6 * Math.abs(ex) / Lx + 6 * Math.abs(ey) / Ly);
    const port = portante(P);
    const suelo = { sadm, qmax, x: m.X[iq], y: m.Y[iq], qmed, qRig, Ntot, NcolS, pS, pU, pD, ex, ey, xR, yR, nucleo: Math.abs(ex) <= Lx / 6 && Math.abs(ey) <= Ly / 6, ok: qmax <= sadm * 1.0001, contacto: rs.contacto, okPort: sadm <= port.qadm * 1.0001, ks };

    // ---- Asentamientos y distorsiones
    const wcol = P.cols.map(c => -FEM.nodosColumna(m, c).reduce((s, [n, g]) => s + g * rs.w[n], 0));
    const qcol = P.cols.map(c => FEM.nodosColumna(m, c).reduce((s, [n, g]) => s + g * rs.q[n], 0));
    let dist = { val: 0, a: -1, b: -1, L: 0, dw: 0 };
    for (let i = 0; i < P.cols.length; i++) {
      const di = P.cols.map((c, j) => j === i ? Infinity : Math.hypot(c.x - P.cols[i].x, c.y - P.cols[i].y));
      const dmin = Math.min(...di);
      for (let j = 0; j < P.cols.length; j++) {
        if (j === i || di[j] > 1.6 * dmin) continue;
        const v = Math.abs(wcol[i] - wcol[j]) / di[j];
        if (v > dist.val) dist = { val: v, a: i, b: j, L: di[j], dw: Math.abs(wcol[i] - wcol[j]) };
      }
    }
    const aseg = { wmax: -wmin, x: m.X[iw], y: m.Y[iw], wcol, qcol, dist, okW: -wmin * 1000 <= P.suelo.wadm, okD: dist.val <= 1 / P.suelo.distLim };

    // ---- Deslizamiento y torsión en planta
    const Hx = P.cols.reduce((s, c) => s + c.s.Vx, 0), Hy = P.cols.reduce((s, c) => s + c.s.Vy, 0), H = Math.hypot(Hx, Hy);
    const Mz = P.cols.reduce((s, c) => s + c.s.Mz + (c.x - Lx / 2) * c.s.Vy - (c.y - Ly / 2) * c.s.Vx, 0);
    let rm = 0, an = 0;
    for (let n = 0; n < nn; n++) { rm += Math.hypot(m.X[n] - Lx / 2, m.Y[n] - Ly / 2) * m.A[n]; an += m.A[n]; }
    rm /= an;
    const mu = P.suelo.mu, Rd = mu * Ntot, Rt = mu * Ntot * rm;
    const desl = { Hx, Hy, H, Rd, FS: H > 0 ? Rd / H : Infinity, Mz, rm, Rt, FSt: Math.abs(Mz) > 0 ? Rt / Math.abs(Mz) : Infinity };
    desl.ok = desl.FS >= 1.5 && desl.FSt >= 1.5;

    // ---- Rigidez relativa (longitud elástica)
    const { D: Dp } = FEM.plateProps(E, P.mat.nu, h);
    const lam = Math.pow(ks / (4 * Dp), 0.25);
    let lmax = 0;
    // luz entre columnas vecinas alineadas (la mayor de ellas)
    for (const a of P.cols) {
      let lx = Infinity, ly = Infinity;
      for (const b of P.cols) {
        if (b === a) continue;
        if (Math.abs(a.y - b.y) < 0.05 && Math.abs(a.x - b.x) > 0.05) lx = Math.min(lx, Math.abs(a.x - b.x));
        if (Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) > 0.05) ly = Math.min(ly, Math.abs(a.y - b.y));
      }
      for (const l of [lx, ly]) if (isFinite(l)) lmax = Math.max(lmax, l);
    }
    const rig = { D: Dp, lam, Le: 1 / lam, lim: 1.75 / lam, lmax };

    const plan = planilla(P);
    const okFlex = Object.values(flex).every(f => f.ok);
    const resumen = [
      { t: 'Tensión en el suelo (servicio)', v: `${(qmax / KGCM2).toFixed(2)} kg/cm² ≤ ${P.suelo.sadm.toFixed(2)} kg/cm²`, r: qmax / sadm, ok: suelo.ok },
      { t: 'Capacidad portante (Brinch Hansen)', v: `σadm = ${P.suelo.sadm.toFixed(2)} ≤ qult/FS = ${(port.qadm / KGCM2).toFixed(2)} kg/cm²`, r: sadm / port.qadm, ok: suelo.okPort },
      { t: 'Asentamiento máximo', v: `${(aseg.wmax * 1000).toFixed(1)} mm ≤ ${P.suelo.wadm} mm`, r: aseg.wmax * 1000 / P.suelo.wadm, ok: aseg.okW },
      { t: 'Distorsión angular entre columnas', v: dist.a >= 0 ? `1/${dist.val > 0 ? Math.round(1 / dist.val) : '∞'} ≤ 1/${P.suelo.distLim}` : '—', r: dist.val * P.suelo.distLim, ok: aseg.okD },
      { t: 'Deslizamiento / torsión en planta', v: `FS = ${isFinite(desl.FS) ? desl.FS.toFixed(2) : '∞'} / ${isFinite(desl.FSt) ? desl.FSt.toFixed(2) : '∞'} ≥ 1.5`, r: 1.5 / Math.min(desl.FS, desl.FSt), ok: desl.ok },
      { t: 'Flexión (armadura provista)', v: `util. máx = ${Math.max(...Object.values(flex).map(f => f.u)).toFixed(2)}`, r: Math.max(...Object.values(flex).map(f => f.u)), ok: okFlex },
      { t: 'Armadura mínima 0.0018·b·h', v: `X: ${(flex.xb.base + flex.xt.base).toFixed(2)} / Y: ${(flex.yb.base + flex.yt.base).toFixed(2)} ≥ ${asMin.toFixed(2)} cm²/m`, r: asMin / Math.min(flex.xb.base + flex.xt.base, flex.yb.base + flex.yt.base), ok: minOk.x && minOk.y },
      { t: 'Separación máxima de barras', v: `s ≤ ${smax.toFixed(0)} cm`, r: Math.max(...['inf', 'sup'].flatMap(c => ['x', 'y'].map(d => P.arm[c][d].s))) / smax, ok: sepOk },
      { t: 'Corte en una dirección', v: `Vu = ${corte.Vu.toFixed(0)} ≤ φVc = ${corte.phiVc.toFixed(0)} kN/m`, r: corte.ratio, ok: corte.ok },
      { t: 'Punzonado', v: `${punz.filter(p => p.ok).length}/${punz.length} columnas verifican`, r: Math.max(0, ...punz.map(p => p.ratio)), ok: punz.every(p => p.ok) }
    ];
    return { m, rs, ru, D, inCol, dd, flex, asMin, smax, minOk, sepOk, beta1, corte, punz, suelo, port, aseg, desl, rig, plan, resumen, E, cfg, okGlobal: resumen.every(r => r.ok), ms: performance.now() - t0 };
  }

  /* --------------- Sugerencia automática de refuerzos --------------- */
  function sugerirRefuerzos(P, R) {
    const m = R.m, fc = P.mat.fc, fy = P.mat.fy;
    const manual = P.ref.filter(r => !r.auto);
    const Pm = { ...P, ref: manual };
    const nuevos = [];
    let k = 1;
    const usados = new Set(P.ref.map(r => r.id));
    const nid = () => { while (usados.has('A' + k)) k++; usados.add('A' + k); return 'A' + k; };
    const r5 = v => Math.round(v * 20) / 20;
    for (const kk of ['xb', 'yb', 'xt', 'yt']) {
      const capa = kk[1] === 'b' ? 'inf' : 'sup', dir = kk[0];
      const need = new Float64Array(m.nn);
      const flag = new Uint8Array(m.nn);
      for (let n = 0; n < m.nn; n++) {
        const req = R.D['as' + kk][n];
        const prov = asProv(Pm, m.X[n], m.Y[n], capa, dir);
        if (req > prov * 1.0001) { flag[n] = 1; need[n] = req - prov; }
      }
      const seen = new Uint8Array(m.nn);
      for (let s = 0; s < m.nn; s++) {
        if (!flag[s] || seen[s]) continue;
        const st = [s]; seen[s] = 1;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, nmax = 0;
        while (st.length) {
          const n = st.pop();
          x0 = Math.min(x0, m.X[n]); x1 = Math.max(x1, m.X[n]); y0 = Math.min(y0, m.Y[n]); y1 = Math.max(y1, m.Y[n]);
          nmax = Math.max(nmax, need[n]);
          const i = m.I[n], j = m.J[n];
          for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
            if (a < 0 || b < 0 || a > m.nxE || b > m.nyE) continue;
            const q = m.id(a, b);
            if (flag[q] && !seen[q]) { seen[q] = 1; st.push(q); }
          }
        }
        const base = P.arm[capa][dir];
        let el = null;
        for (const s2 of [base.s, base.s / 2]) {
          for (const d of DIAMS) if (d >= 8 && asm(d, s2) >= nmax) { el = { d, s: s2 }; break; }
          if (el) break;
        }
        if (!el) el = { d: 25, s: base.s / 2 };
        const L = ld(el.d, fc, fy, capa === 'sup');
        const ex = dir === 'x' ? L + m.dx : m.dx + base.s / 100, ey = dir === 'y' ? L + m.dy : m.dy + base.s / 100;
        const r = P.mat.rec;
        nuevos.push({
          id: nid(), auto: true, capa, dir, d: el.d, s: el.s,
          x1: r5(Math.max(r, x0 - ex)), x2: r5(Math.min(P.geom.Lx - r, x1 + ex)),
          y1: r5(Math.max(r, y0 - ey)), y2: r5(Math.min(P.geom.Ly - r, y1 + ey))
        });
      }
    }
    // Unir zonas superpuestas (misma capa y dirección) adoptando la barra más fuerte
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (let i = 0; i < nuevos.length && !cambio; i++) for (let j = i + 1; j < nuevos.length; j++) {
        const a = nuevos[i], b = nuevos[j], g = 0.30;
        if (a.capa !== b.capa || a.dir !== b.dir) continue;
        if (a.x1 > b.x2 + g || b.x1 > a.x2 + g || a.y1 > b.y2 + g || b.y1 > a.y2 + g) continue;
        const f = asm(a.d, a.s) >= asm(b.d, b.s) ? a : b;
        Object.assign(a, { d: f.d, s: f.s, x1: Math.min(a.x1, b.x1), x2: Math.max(a.x2, b.x2), y1: Math.min(a.y1, b.y1), y2: Math.max(a.y2, b.y2) });
        nuevos.splice(j, 1); cambio = true; break;
      }
    }
    nuevos.forEach((z, i) => z.id = 'A' + (i + 1));
    return manual.concat(nuevos);
  }

  return { DIAMS, KGCM2, KGCM3, PHI_F, PHI_V, area, asm, kgm, dEff, asReq, phiMn, woodArmer, asProv, asBase, ld, portante, punzonado, planilla, calcular, sugerirRefuerzos, capaTxt };
})();
