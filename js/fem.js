'use strict';
/* =====================================================================
   FEM — Placa gruesa (Reissner-Mindlin, elemento MITC4) sobre fundación
   elástica de Winkler (resortes sólo a compresión, opcional).
   Unidades: kN, m.   GDL por nodo: [w, βx, βy]
   w  : desplazamiento vertical (+ hacia arriba)
   βx : giro de la normal ≈ ∂w/∂x      βy : ≈ ∂w/∂y
   Momentos: M > 0  ⇒  tracción en la cara INFERIOR.
   ===================================================================== */
const FEM = (() => {
  const XI = [-1, 1, 1, -1], ET = [-1, -1, 1, 1];

  function shape(x, e) { return XI.map((xi, i) => 0.25 * (1 + xi * x) * (1 + ET[i] * e)); }
  function dshape(x, e, a, b) {
    const dx = [], dy = [];
    for (let i = 0; i < 4; i++) {
      dx.push(0.25 * XI[i] * (1 + ET[i] * e) * 2 / a);
      dy.push(0.25 * ET[i] * (1 + XI[i] * x) * 2 / b);
    }
    return [dx, dy];
  }
  function bendingB(x, e, a, b) {
    const [dx, dy] = dshape(x, e, a, b);
    const B = [new Float64Array(12), new Float64Array(12), new Float64Array(12)];
    for (let i = 0; i < 4; i++) {
      B[0][3 * i + 1] = dx[i];
      B[1][3 * i + 2] = dy[i];
      B[2][3 * i + 1] = dy[i];
      B[2][3 * i + 2] = dx[i];
    }
    return B;
  }
  function shearRow(x, e, a, b, dir) {
    const N = shape(x, e), [dx, dy] = dshape(x, e, a, b), r = new Float64Array(12);
    for (let i = 0; i < 4; i++) {
      if (dir === 0) { r[3 * i] = dx[i]; r[3 * i + 1] = -N[i]; }
      else { r[3 * i] = dy[i]; r[3 * i + 2] = -N[i]; }
    }
    return r;
  }
  // Deformaciones de corte supuestas MITC4 (puntos de atadura en medio de lados)
  function shearB(x, e, a, b) {
    const A = shearRow(0, -1, a, b, 0), C = shearRow(0, 1, a, b, 0);
    const L = shearRow(-1, 0, a, b, 1), R = shearRow(1, 0, a, b, 1);
    const gx = new Float64Array(12), gy = new Float64Array(12);
    for (let k = 0; k < 12; k++) {
      gx[k] = 0.5 * (1 - e) * A[k] + 0.5 * (1 + e) * C[k];
      gy[k] = 0.5 * (1 - x) * L[k] + 0.5 * (1 + x) * R[k];
    }
    return [gx, gy];
  }

  function plateProps(E, nu, h) {
    const D = E * h ** 3 / (12 * (1 - nu * nu));
    const S = (5 / 6) * E / (2 * (1 + nu)) * h;
    return { D, S, Db: [[D, D * nu, 0], [D * nu, D, 0], [0, 0, D * (1 - nu) / 2]] };
  }

  function elementStiffness(E, nu, h, a, b) {
    const { S, Db } = plateProps(E, nu, h);
    const K = Array.from({ length: 12 }, () => new Float64Array(12));
    const g = 1 / Math.sqrt(3), detJ = a * b / 4;
    for (const xg of [-g, g]) for (const eg of [-g, g]) {
      const B = bendingB(xg, eg, a, b);
      const DB = [0, 1, 2].map(r => {
        const row = new Float64Array(12);
        for (let k = 0; k < 12; k++) row[k] = Db[r][0] * B[0][k] + Db[r][1] * B[1][k] + Db[r][2] * B[2][k];
        return row;
      });
      const [gx, gy] = shearB(xg, eg, a, b);
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
        K[i][j] += (B[0][i] * DB[0][j] + B[1][i] * DB[1][j] + B[2][i] * DB[2][j]) * detJ
                 + S * (gx[i] * gx[j] + gy[i] * gy[j]) * detJ;
      }
    }
    return K;
  }

  /* ---------------- Malla rectangular uniforme ---------------- */
  function crearMalla(Lx, Ly, tam) {
    const nxE = Math.max(4, Math.round(Lx / tam)), nyE = Math.max(4, Math.round(Ly / tam));
    const nx = nxE + 1, ny = nyE + 1, dx = Lx / nxE, dy = Ly / nyE;
    const byX = nx <= ny;
    const id = (i, j) => byX ? j * nx + i : i * ny + j;
    const nn = nx * ny;
    const X = new Float64Array(nn), Y = new Float64Array(nn), A = new Float64Array(nn);
    const I = new Int32Array(nn), J = new Int32Array(nn);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const n = id(i, j);
      X[n] = i * dx; Y[n] = j * dy; I[n] = i; J[n] = j;
      A[n] = (i === 0 || i === nxE ? dx / 2 : dx) * (j === 0 || j === nyE ? dy / 2 : dy);
    }
    const els = [];
    for (let j = 0; j < nyE; j++) for (let i = 0; i < nxE; i++)
      els.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
    const maxdiff = (byX ? nx : ny) + 1;
    return { Lx, Ly, nxE, nyE, nx, ny, dx, dy, nn, X, Y, A, I, J, els, id, bw: 3 * maxdiff + 2 };
  }

  /* ---------------- Cholesky en banda (in place) ---------------- */
  function cholSolve(K, F, n, bw) {
    const W = bw + 1;
    for (let i = 0; i < n; i++) {
      const k0 = Math.max(0, i - bw);
      let s = K[i * W];
      for (let k = k0; k < i; k++) { const u = K[k * W + i - k]; s -= u * u; }
      if (!(s > 0)) return false;
      const dii = Math.sqrt(s);
      K[i * W] = dii;
      const jmax = Math.min(n - 1, i + bw);
      for (let j = i + 1; j <= jmax; j++) {
        let t = K[i * W + j - i];
        const kk0 = Math.max(0, j - bw);
        for (let k = kk0; k < i; k++) t -= K[k * W + i - k] * K[k * W + j - k];
        K[i * W + j - i] = t / dii;
      }
    }
    for (let i = 0; i < n; i++) {
      let s = F[i];
      for (let k = Math.max(0, i - bw); k < i; k++) s -= K[k * W + i - k] * F[k];
      F[i] = s / K[i * W];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = F[i];
      const jmax = Math.min(n - 1, i + bw);
      for (let j = i + 1; j <= jmax; j++) s -= K[i * W + j - i] * F[j];
      F[i] = s / K[i * W];
    }
    return true;
  }

  /* Nodos bajo la huella de una columna (o reparto bilineal si no hay nodos) */
  function nodosColumna(m, c) {
    const out = [], tol = 1e-6;
    const i0 = Math.max(0, Math.ceil((c.x - c.bx / 2 - tol) / m.dx)), i1 = Math.min(m.nxE, Math.floor((c.x + c.bx / 2 + tol) / m.dx));
    const j0 = Math.max(0, Math.ceil((c.y - c.by / 2 - tol) / m.dy)), j1 = Math.min(m.nyE, Math.floor((c.y + c.by / 2 + tol) / m.dy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([m.id(i, j), 1]);
    if (out.length) { out.forEach(o => o[1] = 1 / out.length); return out; }
    const i = Math.min(m.nxE - 1, Math.max(0, Math.floor(c.x / m.dx))), j = Math.min(m.nyE - 1, Math.max(0, Math.floor(c.y / m.dy)));
    const t = Math.min(1, Math.max(0, c.x / m.dx - i)), s = Math.min(1, Math.max(0, c.y / m.dy - j));
    return [[m.id(i, j), (1 - t) * (1 - s)], [m.id(i + 1, j), t * (1 - s)], [m.id(i + 1, j + 1), t * s], [m.id(i, j + 1), (1 - t) * s]];
  }

  /* ---------------- Análisis ----------------
     cfg: {E, nu, h, ks, sinTraccion}
     cargas: {p (kN/m² hacia abajo), cols:[{x,y,bx,by,N,Mx,My}]}            */
  function analizar(m, cfg, cargas) {
    const nd = 3 * m.nn, bw = m.bw, W = bw + 1;
    const Ke = elementStiffness(cfg.E, cfg.nu, cfg.h, m.dx, m.dy);
    const Kbase = new Float64Array(nd * W);
    const dofs = new Int32Array(12);
    for (const el of m.els) {
      for (let a = 0; a < 4; a++) for (let k = 0; k < 3; k++) dofs[3 * a + k] = 3 * el[a] + k;
      for (let a = 0; a < 12; a++) {
        const ga = dofs[a], Ka = Ke[a];
        for (let b = 0; b < 12; b++) { const gb = dofs[b]; if (gb >= ga) Kbase[ga * W + gb - ga] += Ka[b]; }
      }
    }
    const F = new Float64Array(nd);
    for (let n = 0; n < m.nn; n++) F[3 * n] -= cargas.p * m.A[n];
    for (const c of cargas.cols) {
      for (const [n, wgt] of nodosColumna(m, c)) {
        F[3 * n] -= c.N * wgt;
        F[3 * n + 2] += c.Mx * wgt;
        F[3 * n + 1] -= c.My * wgt;
      }
    }
    const active = new Uint8Array(m.nn).fill(1);
    let u, iter = 0;
    for (; iter < 40; iter++) {
      const K = Kbase.slice();
      for (let n = 0; n < m.nn; n++) if (active[n]) K[3 * n * W] += cfg.ks * m.A[n];
      u = F.slice();
      if (!cholSolve(K, u, nd, bw)) throw new Error('El sistema es inestable (la platea se despega del suelo o faltan apoyos). Revise cargas, ks o espesor.');
      if (!cfg.sinTraccion) break;
      let ch = 0;
      for (let n = 0; n < m.nn; n++) {
        const w = u[3 * n];
        if (active[n] && w > 1e-9) { active[n] = 0; ch++; }
        else if (!active[n] && w <= 0) { active[n] = 1; ch++; }
      }
      if (!ch) break;
    }
    // Resultados nodales
    const w = new Float64Array(m.nn), q = new Float64Array(m.nn);
    for (let n = 0; n < m.nn; n++) { w[n] = u[3 * n]; q[n] = active[n] ? -cfg.ks * w[n] : 0; }
    const { Db, S } = plateProps(cfg.E, cfg.nu, cfg.h);
    const B0 = bendingB(0, 0, m.dx, m.dy), [g0x, g0y] = shearB(0, 0, m.dx, m.dy);
    const acc = { mx: new Float64Array(m.nn), my: new Float64Array(m.nn), mxy: new Float64Array(m.nn), qx: new Float64Array(m.nn), qy: new Float64Array(m.nn) };
    const cnt = new Float64Array(m.nn);
    const ue = new Float64Array(12);
    for (const el of m.els) {
      for (let a = 0; a < 4; a++) for (let k = 0; k < 3; k++) ue[3 * a + k] = u[3 * el[a] + k];
      let k0 = 0, k1 = 0, k2 = 0, gx = 0, gy = 0;
      for (let k = 0; k < 12; k++) { k0 += B0[0][k] * ue[k]; k1 += B0[1][k] * ue[k]; k2 += B0[2][k] * ue[k]; gx += g0x[k] * ue[k]; gy += g0y[k] * ue[k]; }
      const mx = Db[0][0] * k0 + Db[0][1] * k1, my = Db[1][0] * k0 + Db[1][1] * k1, mxy = Db[2][2] * k2;
      for (const n of el) {
        acc.mx[n] += mx; acc.my[n] += my; acc.mxy[n] += mxy; acc.qx[n] += S * gx; acc.qy[n] += S * gy; cnt[n]++;
      }
    }
    for (const k in acc) for (let n = 0; n < m.nn; n++) acc[k][n] /= cnt[n];
    let R = 0, Ftot = 0;
    for (let n = 0; n < m.nn; n++) { R += q[n] * m.A[n]; Ftot -= F[3 * n]; }
    let nAct = 0; for (let n = 0; n < m.nn; n++) nAct += active[n];
    return { w, q, ...acc, active, iter: iter + 1, R, Ftot, contacto: nAct / m.nn };
  }

  /* Interpolación bilineal de un campo nodal */
  function interp(m, f, x, y) {
    const i = Math.min(m.nxE - 1, Math.max(0, Math.floor(x / m.dx))), j = Math.min(m.nyE - 1, Math.max(0, Math.floor(y / m.dy)));
    const t = Math.min(1, Math.max(0, x / m.dx - i)), s = Math.min(1, Math.max(0, y / m.dy - j));
    return (1 - t) * (1 - s) * f[m.id(i, j)] + t * (1 - s) * f[m.id(i + 1, j)] + t * s * f[m.id(i + 1, j + 1)] + (1 - t) * s * f[m.id(i, j + 1)];
  }

  return { crearMalla, analizar, interp, nodosColumna, plateProps };
})();
