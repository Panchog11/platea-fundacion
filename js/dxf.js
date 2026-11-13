'use strict';
/* =====================================================================
   EXPORTACIÓN DXF (AutoCAD R12, ASCII) — unidades: metros
   Planta general, armadura inferior, armadura superior, cortes A-A y B-B,
   planilla de doblado y rótulo.  El DXF se abre en AutoCAD y se guarda
   como DWG (Guardar como…) o se publica a DWF.
   ===================================================================== */
const DXFX = (() => {
  const CL = { CONTORNO: 7, COLUMNAS: 4, EJES: 9, COTAS: 3, TEXTOS: 7, ARM_INF: 5, ARM_SUP: 1, REF_INF: 150, REF_SUP: 10, CORTES: 6, PLANILLA: 7, HORMIGON: 8, ROTULO: 7, SUELO: 33 };
  const ascii = s => String(s).replace(/Ø/g, '%%c').replace(/[²]/g, '2').replace(/[³]/g, '3').replace(/[·]/g, '.').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');

  class Doc {
    constructor() { this.o = []; }
    g(c, v) { this.o.push(c, typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : v); }
    line(x1, y1, x2, y2, L) { this.g(0, 'LINE'); this.g(8, L); this.g(62, CL[L] || 7); this.g(10, x1); this.g(20, y1); this.g(30, 0.0); this.g(11, x2); this.g(21, y2); this.g(31, 0.0); }
    pl(pts, L, closed) { for (let i = 0; i < pts.length - 1; i++) this.line(...pts[i], ...pts[i + 1], L); if (closed) this.line(...pts[pts.length - 1], ...pts[0], L); }
    rect(x1, y1, x2, y2, L) { this.pl([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], L, true); }
    circle(x, y, r, L) { this.g(0, 'CIRCLE'); this.g(8, L); this.g(62, CL[L] || 7); this.g(10, x); this.g(20, y); this.g(30, 0.0); this.g(40, r); }
    dot(x, y, r, L) { this.circle(x, y, r, L); for (let k = 0.3; k < 1; k += 0.35) this.circle(x, y, r * k, L); }
    text(x, y, h, s, L = 'TEXTOS', al = 'l', rot = 0) {
      this.g(0, 'TEXT'); this.g(8, L); this.g(62, CL[L] || 7); this.g(10, x); this.g(20, y); this.g(30, 0.0); this.g(40, h); this.g(1, ascii(s));
      if (rot) this.g(50, rot);
      const ha = { l: 0, c: 1, r: 2 }[al] || 0;
      if (ha) { this.g(72, ha); this.g(11, x); this.g(21, y); this.g(31, 0.0); }
    }
    dashed(x1, y1, x2, y2, L, d = 0.4, g = 0.15) {
      const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      for (let s = 0; s < len; s += d + g) { const e = Math.min(len, s + d); this.line(x1 + ux * s, y1 + uy * s, x1 + ux * e, y1 + uy * e, L); }
    }
    dimH(x1, x2, y, off, txt, th) {
      const yy = y + off, t = th * 0.5;
      this.line(x1, y, x1, yy + Math.sign(off) * t, 'COTAS'); this.line(x2, y, x2, yy + Math.sign(off) * t, 'COTAS');
      this.line(x1, yy, x2, yy, 'COTAS');
      this.line(x1 - t, yy - t, x1 + t, yy + t, 'COTAS'); this.line(x2 - t, yy - t, x2 + t, yy + t, 'COTAS');
      this.text((x1 + x2) / 2, yy + th * 0.4, th, txt, 'COTAS', 'c');
    }
    dimV(x, y1, y2, off, txt, th) {
      const xx = x + off, t = th * 0.5;
      this.line(x, y1, xx + Math.sign(off) * t, y1, 'COTAS'); this.line(x, y2, xx + Math.sign(off) * t, y2, 'COTAS');
      this.line(xx, y1, xx, y2, 'COTAS');
      this.line(xx - t, y1 - t, xx + t, y1 + t, 'COTAS'); this.line(xx - t, y2 - t, xx + t, y2 + t, 'COTAS');
      this.text(xx - th * 0.4, (y1 + y2) / 2, th, txt, 'COTAS', 'c', 90);
    }
    toString() {
      return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...this.o, '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
    }
  }

  const uniq = arr => [...new Set(arr.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);

  function contornoYColumnas(D, P, ox, oy, th, conIds = true) {
    const { Lx, Ly } = P.geom;
    D.rect(ox, oy, ox + Lx, oy + Ly, 'CONTORNO');
    for (const c of P.cols) {
      D.rect(ox + c.x - c.bx / 2, oy + c.y - c.by / 2, ox + c.x + c.bx / 2, oy + c.y + c.by / 2, 'COLUMNAS');
      D.line(ox + c.x - c.bx / 2, oy + c.y - c.by / 2, ox + c.x + c.bx / 2, oy + c.y + c.by / 2, 'COLUMNAS');
      D.line(ox + c.x - c.bx / 2, oy + c.y + c.by / 2, ox + c.x + c.bx / 2, oy + c.y - c.by / 2, 'COLUMNAS');
      if (conIds) D.text(ox + c.x + c.bx / 2 + th * 0.3, oy + c.y + c.by / 2 + th * 0.3, th, `${c.id} (${(c.bx * 100).toFixed(0)}x${(c.by * 100).toFixed(0)})`, 'COLUMNAS');
    }
  }
  function ejesYCotas(D, P, ox, oy, th) {
    const { Lx, Ly } = P.geom;
    const xs = uniq(P.cols.map(c => c.x)), ys = uniq(P.cols.map(c => c.y));
    const e = 1.2;
    xs.forEach((x, i) => { D.dashed(ox + x, oy - e, ox + x, oy + Ly + e, 'EJES'); D.circle(ox + x, oy + Ly + e + th * 1.2, th * 1.2, 'EJES'); D.text(ox + x, oy + Ly + e + th * 0.7, th, String(i + 1), 'EJES', 'c'); });
    ys.forEach((y, i) => { D.dashed(ox - e, oy + y, ox + Lx + e, oy + y, 'EJES'); D.circle(ox - e - th * 1.2, oy + y, th * 1.2, 'EJES'); D.text(ox - e - th * 1.2, oy + y - th * 0.5, th, String.fromCharCode(65 + i), 'EJES', 'c'); });
    const cx = [0, ...xs.filter(x => x > 0.01 && x < Lx - 0.01), Lx];
    for (let i = 0; i < cx.length - 1; i++) D.dimH(ox + cx[i], ox + cx[i + 1], oy, -1.6 * th - 0.6, (cx[i + 1] - cx[i]).toFixed(2), th * 0.8);
    D.dimH(ox, ox + Lx, oy, -3.6 * th - 0.9, Lx.toFixed(2), th * 0.8);
    const cy = [0, ...ys.filter(y => y > 0.01 && y < Ly - 0.01), Ly];
    for (let i = 0; i < cy.length - 1; i++) D.dimV(ox + Lx, oy + cy[i], oy + cy[i + 1], 1.6 * th + 0.6, (cy[i + 1] - cy[i]).toFixed(2), th * 0.8);
    D.dimV(ox + Lx, oy, oy + Ly, 3.6 * th + 0.9, Ly.toFixed(2), th * 0.8);
  }

  // Barra representativa + línea de reparto
  function barraPlanta(D, ox, oy, b, th, L, pataSimb, yRep, xRep) {
    const t = th * 0.6;
    if (b.dir === 'x') {
      const y = oy + yRep;
      D.line(ox + b.x1, y, ox + b.x2, y, L);
      if (pataSimb) { D.line(ox + b.x1, y, ox + b.x1 + t, y + t, L); D.line(ox + b.x2, y, ox + b.x2 - t, y + t, L); }
      const x = ox + xRep;
      D.line(x, oy + b.y1, x, oy + b.y2, L);
      D.line(x - t, oy + b.y1 - t, x + t, oy + b.y1 + t, L); D.line(x - t, oy + b.y2 - t, x + t, oy + b.y2 + t, L);
      D.circle(x, y, t * 0.6, L);
      D.text(ox + (b.x1 + b.x2) / 2, y + th * 0.4, th, `P${b.pos} - ${b.n} %%c${b.d} c/${b.s} L=${b.Lb.toFixed(2)}`, L, 'c');
    } else {
      const x = ox + xRep;
      D.line(x, oy + b.y1, x, oy + b.y2, L);
      if (pataSimb) { D.line(x, oy + b.y1, x + t, oy + b.y1 + t, L); D.line(x, oy + b.y2, x + t, oy + b.y2 - t, L); }
      const y = oy + yRep;
      D.line(ox + b.x1, y, ox + b.x2, y, L);
      D.line(ox + b.x1 - t, y - t, ox + b.x1 + t, y + t, L); D.line(ox + b.x2 - t, y - t, ox + b.x2 + t, y + t, L);
      D.circle(x, y, t * 0.6, L);
      D.text(x - th * 0.4, oy + (b.y1 + b.y2) / 2, th, `P${b.pos} - ${b.n} %%c${b.d} c/${b.s} L=${b.Lb.toFixed(2)}`, L, 'c', 90);
    }
  }

  function plantaArmadura(D, P, plan, capa, ox, oy, th) {
    const { Lx, Ly } = P.geom;
    contornoYColumnas(D, P, ox, oy, th * 0.8, false);
    const Lb = capa === 'inf' ? 'ARM_INF' : 'ARM_SUP', Lr = capa === 'inf' ? 'REF_INF' : 'REF_SUP';
    const pos = plan.pos.filter(p => p.capa === capa);
    for (const p of pos.filter(p => !p.ref)) barraPlanta(D, ox, oy, p, th, Lb, true, p.dir === 'x' ? Ly * 0.42 : Ly * 0.25, p.dir === 'x' ? Lx * 0.12 : Lx * 0.58);
    for (const p of pos.filter(p => p.ref)) {
      const z = P.ref.find(r => r.id === p.ref);
      D.rect(ox + z.x1, oy + z.y1, ox + z.x2, oy + z.y2, Lr);
      const ym = (p.y1 + p.y2) / 2, xm = (p.x1 + p.x2) / 2;
      barraPlanta(D, ox, oy, p, th * 0.75, Lr, false, p.dir === 'x' ? ym : ym + (p.y2 - p.y1) * 0.25, p.dir === 'x' ? xm + (p.x2 - p.x1) * 0.25 : xm);
    }
    D.text(ox, oy + Ly + th * 2.5, th * 1.6, `ARMADURA ${capa === 'inf' ? 'INFERIOR' : 'SUPERIOR'}`, 'TEXTOS');
    D.text(ox, oy + Ly + th * 0.9, th * 0.9, `Malla base: X %%c${P.arm[capa].x.d} c/${P.arm[capa].x.s} - Y %%c${P.arm[capa].y.d} c/${P.arm[capa].y.s} (capa X ${capa === 'inf' ? 'inferior' : 'superior'} exterior)`, 'TEXTOS');
  }

  function corte(D, P, R, plan, dir, pos, ox, oy, th) {
    const { h, Lx, Ly } = P.geom, r = P.mat.rec, L = dir === 'x' ? Lx : Ly, k = dir, kp = dir === 'x' ? 'y' : 'x';
    const a = P.arm, pata = h - 2 * r;
    D.rect(ox, oy, ox + L, oy + h, 'HORMIGON');
    D.line(ox - 0.3, oy - 0.05, ox + L + 0.3, oy - 0.05, 'SUELO');
    for (let s = -0.3; s < L + 0.3; s += 0.25) D.line(ox + s, oy - 0.05, ox + s + 0.15, oy - 0.2, 'SUELO');
    const cols = P.cols.filter(c => Math.abs((dir === 'x' ? c.y : c.x) - pos) <= (dir === 'x' ? c.by : c.bx) / 2 + 1e-6);
    for (const c of cols) {
      const s = dir === 'x' ? c.x : c.y, b = dir === 'x' ? c.bx : c.by;
      D.line(ox + s - b / 2, oy + h, ox + s - b / 2, oy + h + 1, 'COLUMNAS'); D.line(ox + s + b / 2, oy + h, ox + s + b / 2, oy + h + 1, 'COLUMNAS');
      D.pl([[ox + s - b / 2 - 0.1, oy + h + 1], [ox + s - 0.05, oy + h + 1], [ox + s, oy + h + 1.1], [ox + s + 0.03, oy + h + 0.9], [ox + s + 0.08, oy + h + 1], [ox + s + b / 2 + 0.1, oy + h + 1]], 'COLUMNAS');
      D.text(ox + s, oy + h + 1.25, th, c.id, 'COLUMNAS', 'c');
    }
    const zk = { inf: dir === 'x' ? r + a.inf.x.d / 2000 : r + a.inf.x.d / 1000 + a.inf.y.d / 2000, sup: dir === 'x' ? h - r - a.sup.x.d / 2000 : h - r - a.sup.x.d / 1000 - a.sup.y.d / 2000 };
    const zp = { inf: dir === 'x' ? r + a.inf.x.d / 1000 + a.inf.y.d / 2000 : r + a.inf.x.d / 2000, sup: dir === 'x' ? h - r - a.sup.x.d / 1000 - a.sup.y.d / 2000 : h - r - a.sup.x.d / 2000 };
    for (const capa of ['inf', 'sup']) {
      const Lb = capa === 'inf' ? 'ARM_INF' : 'ARM_SUP', Lr = capa === 'inf' ? 'REF_INF' : 'REF_SUP';
      const zb = zk[capa], sg = capa === 'inf' ? 1 : -1;
      D.pl([[ox + r, oy + zb + sg * pata * 0.9], [ox + r, oy + zb], [ox + L - r, oy + zb], [ox + L - r, oy + zb + sg * pata * 0.9]], Lb);
      const pb = plan.pos.find(p => !p.ref && p.capa === capa && p.dir === k);
      D.text(ox + L * 0.3, oy + (capa === 'inf' ? -0.55 : h + 0.25), th * 0.8, `P${pb.pos} %%c${pb.d} c/${pb.s}`, Lb, 'c');
      const bpp = a[capa][kp], rd = Math.max(0.008, bpp.d / 2000);
      for (let s = r; s <= L - r + 1e-6; s += bpp.s / 100) D.dot(ox + s, oy + zp[capa], rd, Lb);
      const pp = plan.pos.find(p => !p.ref && p.capa === capa && p.dir === kp);
      D.text(ox + L * 0.7, oy + (capa === 'inf' ? -0.55 : h + 0.25), th * 0.8, `P${pp.pos} %%c${pp.d} c/${pp.s}`, Lb, 'c');
      let off = 0;
      for (const p of plan.pos.filter(p => p.ref && p.capa === capa)) {
        const cover = dir === 'x' ? pos >= p.y1 - 1e-6 && pos <= p.y2 + 1e-6 : pos >= p.x1 - 1e-6 && pos <= p.x2 + 1e-6;
        if (!cover) continue;
        const s1 = dir === 'x' ? p.x1 : p.y1, s2 = dir === 'x' ? p.x2 : p.y2;
        if (p.dir === k) {
          off++;
          const z = zb + sg * (off * 0.035);
          D.line(ox + s1, oy + z, ox + s2, oy + z, Lr);
          D.text(ox + (s1 + s2) / 2, oy + (capa === 'inf' ? -0.55 - off * th * 1.1 : h + 0.25 + off * th * 1.1), th * 0.75, `P${p.pos} %%c${p.d} c/${p.s} L=${p.Lb.toFixed(2)}`, Lr, 'c');
        } else {
          for (let s = s1; s <= s2 + 1e-6; s += p.s / 100) D.dot(ox + s, oy + zp[capa] + sg * 0.035, Math.max(0.008, p.d / 2000), Lr);
        }
      }
    }
    D.dimV(ox, oy, oy + h, -0.5, (h * 100).toFixed(0), th * 0.7);
    D.dimH(ox, ox + L, oy, -1.0 - th * 2, L.toFixed(2), th * 0.8);
    const nom = dir === 'x' ? 'A-A' : 'B-B';
    D.text(ox, oy + h + 1.8, th * 1.6, `CORTE ${nom}  (${dir === 'x' ? 'y' : 'x'} = ${pos.toFixed(2)} m)`, 'TEXTOS');
  }

  function planilla(D, P, plan, ox, oy, th) {
    // columnas: POS | Ø | FORMA | CANT | L unit | L total | PESO
    const cw = [1.4, 1.2, 6.0, 1.6, 2.0, 2.4, 2.2], rh = 1.2, tw = cw.reduce((a, b) => a + b, 0);
    const xs = [0]; cw.forEach(w => xs.push(xs[xs.length - 1] + w));
    const ht = 0.28;
    D.text(ox, oy + 0.6, 0.5, 'PLANILLA DE DOBLADO DE ARMADURAS', 'PLANILLA');
    const head = ['POS', 'DIAM', 'FORMA (m)', 'CANT.', 'L. UNIT (m)', 'L. TOTAL (m)', 'PESO (kg)'];
    let y = oy;
    const fila = (cells, alto) => {
      D.rect(ox, y - alto, ox + tw, y, 'PLANILLA');
      for (let i = 1; i < xs.length - 1; i++) D.line(ox + xs[i], y, ox + xs[i], y - alto, 'PLANILLA');
      cells.forEach((c, i) => { if (c !== null && c !== undefined) D.text(ox + (xs[i] + xs[i + 1]) / 2, y - alto / 2 - ht / 2, ht, c, 'PLANILLA', 'c'); });
      y -= alto;
    };
    fila(head, rh);
    for (const p of plan.pos) {
      const y0 = y;
      fila([`P${p.pos}`, `%%c${p.d}`, null, String(p.n), p.Lb.toFixed(2), p.Lt.toFixed(1), p.kg.toFixed(1)], rh * 1.4);
      // forma
      const fx0 = ox + xs[2] + 0.6, fx1 = ox + xs[3] - 0.6, fyb = y0 - rh * 1.4 * 0.7, leg = rh * 1.4 * 0.42;
      const Lyr = p.capa === 'inf' ? 'ARM_INF' : 'ARM_SUP';
      if (p.pata > 0) {
        const sg = p.capa === 'inf' ? 1 : -1, yb = p.capa === 'inf' ? fyb : fyb + leg;
        D.pl([[fx0, yb + sg * leg], [fx0, yb], [fx1, yb], [fx1, yb + sg * leg]], Lyr);
        D.text((fx0 + fx1) / 2, yb + (p.capa === 'inf' ? 0.08 : -0.36), 0.22, (p.Lr + (p.nEmp ? p.nEmp * p.lap : 0)).toFixed(2), 'PLANILLA', 'c');
        D.text(fx0 - 0.08, yb + sg * leg / 2 - 0.1, 0.2, p.pata.toFixed(2), 'PLANILLA', 'r');
      } else {
        D.line(fx0, fyb + leg / 2, fx1, fyb + leg / 2, Lyr);
        D.text((fx0 + fx1) / 2, fyb + leg / 2 + 0.08, 0.22, (p.Lr + p.nEmp * p.lap).toFixed(2), 'PLANILLA', 'c');
      }
      if (p.nEmp) D.text((fx0 + fx1) / 2, y0 - 0.32, 0.18, `incl. ${p.nEmp} empalme(s) Le=${p.lap.toFixed(2)}`, 'PLANILLA', 'c');
    }
    y -= 0.3;
    for (const d of Object.keys(plan.porD).sort((a, b) => a - b)) {
      D.text(ox + xs[4], y - 0.4, ht, `Total %%c${d}:`, 'PLANILLA', 'l');
      D.text(ox + tw - 0.2, y - 0.4, ht, `${plan.porD[d].toFixed(1)} kg`, 'PLANILLA', 'r');
      y -= 0.55;
    }
    D.line(ox + xs[4], y - 0.1, ox + tw, y - 0.1, 'PLANILLA');
    D.text(ox + xs[4], y - 0.6, ht * 1.2, 'PESO TOTAL:', 'PLANILLA', 'l');
    D.text(ox + tw - 0.2, y - 0.6, ht * 1.2, `${plan.total.toFixed(1)} kg`, 'PLANILLA', 'r');
    return { y: y - 1, w: tw };
  }

  function rotulo(D, P, R, ox, oy, w) {
    const h = 5.2;
    D.rect(ox, oy - h, ox + w, oy, 'ROTULO');
    D.line(ox, oy - 1.4, ox + w, oy - 1.4, 'ROTULO');
    D.text(ox + 0.3, oy - 0.95, 0.5, P.proyecto.nombre || 'PLATEA DE FUNDACION', 'ROTULO');
    const L = [
      `Obra: ${P.proyecto.obra || '-'}`,
      `Calculista: ${P.proyecto.autor || '-'}     Fecha: ${new Date().toLocaleDateString('es-AR')}`,
      `Hormigon f'c = ${P.mat.fc} MPa  -  Acero fy = ${P.mat.fy} MPa  -  Recubrimiento ${(P.mat.rec * 100).toFixed(1)} cm`,
      `Platea ${P.geom.Lx.toFixed(2)} x ${P.geom.Ly.toFixed(2)} m  -  espesor h = ${(P.geom.h * 100).toFixed(0)} cm  -  sadm = ${P.suelo.sadm} kg/cm2`,
      `Unidades: metros. Diametros en mm. Separaciones en cm.  Norma: CIRSOC 201-2005`,
      `Estado del calculo: ${R ? (R.okGlobal ? 'VERIFICA' : 'NO VERIFICA - ver memoria') : 'sin calcular'}`
    ];
    L.forEach((t, i) => D.text(ox + 0.3, oy - 2.0 - i * 0.55, 0.28, t, 'ROTULO'));
  }

  function generar(P, R, cortes) {
    const D = new Doc();
    const { Lx, Ly, h } = P.geom;
    const th = Math.max(0.15, Math.max(Lx, Ly) / 90);
    const plan = DIS.planilla(P);
    const G = Math.max(6, Math.max(Lx, Ly) * 0.35);
    // 1) Planta general
    contornoYColumnas(D, P, 0, 0, th);
    ejesYCotas(D, P, 0, 0, th);
    const cy = cortes?.y ?? Ly / 2, cx = cortes?.x ?? Lx / 2;
    D.line(-2, cy, Lx + 2, cy, 'CORTES'); D.text(-2.4, cy - th / 2, th * 1.4, 'A', 'CORTES', 'c'); D.text(Lx + 2.4, cy - th / 2, th * 1.4, 'A', 'CORTES', 'c');
    D.line(cx, -2.6, cx, Ly + 2.6, 'CORTES'); D.text(cx, -3.2, th * 1.4, 'B', 'CORTES', 'c'); D.text(cx, Ly + 2.9, th * 1.4, 'B', 'CORTES', 'c');
    D.text(0, Ly + 3.6, th * 1.6, 'PLANTA GENERAL DE FUNDACION', 'TEXTOS');
    D.text(0, Ly + 2.9, th * 0.9, `Platea de H.A. e = ${(h * 100).toFixed(0)} cm`, 'TEXTOS');
    // 2) y 3) Armaduras
    const x2 = Lx + G, x3 = 2 * (Lx + G);
    plantaArmadura(D, P, plan, 'inf', x2, 0, th);
    plantaArmadura(D, P, plan, 'sup', x3, 0, th);
    // 4) Cortes
    corte(D, P, R, plan, 'x', cy, 0, -G - 2, th);
    corte(D, P, R, plan, 'y', cx, 0, -2 * G - 4, th);
    // 5) Planilla + rótulo
    const px = 3 * (Lx + G);
    const r = planilla(D, P, plan, px, Ly, 0.3);
    rotulo(D, P, R, px, r.y - 0.5, r.w);
    return D.toString();
  }

  return { generar };
})();
