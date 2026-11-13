'use strict';
/* =====================================================================
   MEMORIA DE CÁLCULO — HTML con letra Arial (imprimible a PDF) y
   exportación a Word (.doc, formato MHTML con imágenes embebidas)
   ===================================================================== */
const MEM = (() => {
  const f = (v, d = 2) => (v === undefined || v === null || isNaN(v)) ? '—' : (!isFinite(v) ? '∞' : Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const ok = b => b ? '<span class="ok">VERIFICA</span>' : '<span class="no">NO VERIFICA</span>';
  const K2 = 98.0665;

  function imagenes(P, R, cortes) {
    const mk = (fn, w, h, o) => { const cv = document.createElement('canvas'); fn(cv, P, R, { w, h, ...o }); return cv.toDataURL('image/png'); };
    const pl = (campo, titulo, extra = {}) => mk(VIS.planta, 880, 640, { campo, titulo, bandas: true, cortes: null, ...extra });
    return {
      planta: mk(VIS.planta, 880, 640, { campo: 'none', titulo: 'Planta general — columnas, refuerzos y cortes', cortes, punz: false }),
      axo: mk(VIS.axo, 880, 600, { campo: 'qs', titulo: 'Axonométrica — deformada y presión en el suelo (servicio)' }),
      qs: pl('qs', 'Presión en el suelo — servicio [kN/m²]'),
      w: pl('wmm', 'Asentamientos — servicio [mm]'),
      mx: pl('mx', 'Momento Mx último [kNm/m] (+ tracción inferior)'),
      my: pl('my', 'Momento My último [kNm/m] (+ tracción inferior)'),
      umax: pl('umax', 'Utilización a flexión Mu/φMn (con refuerzos)', { refs: true }),
      punz: pl('none', 'Perímetros críticos de punzonado (verde: verifica / rojo: no verifica)', { punz: true }),
      corteA: mk(VIS.cortes, 900, 900, { dir: 'x', pos: cortes.y }),
      corteB: mk(VIS.cortes, 900, 900, { dir: 'y', pos: cortes.x })
    };
  }

  function html(P, R, img, paraWord) {
    const s = P.suelo, g = P.geom, mt = P.mat, c = P.cargas;
    const Ec = 4700 * Math.sqrt(mt.fc);
    const fl = R.flex, su = R.suelo, po = R.port, as = R.aseg, de = R.desl, rg = R.rig;
    const im = (k, cap) => `<div class="fig"><img src="${paraWord ? `file:///C:/memoria/${k}.png` : img[k]}" ${paraWord ? 'width="620"' : ''}><div class="cap">${cap}</div></div>`;
    const NS = P.cols.reduce((a, c) => a + c.s.N, 0), NU = P.cols.reduce((a, c) => a + c.u.N, 0);
    const A = g.Lx * g.Ly;
    // Caso más desfavorable de flexión
    const kf = Object.keys(fl).reduce((a, b) => fl[b].u > fl[a].u ? b : a);
    const F = fl[kf];
    const Rn = F.Mu / 1000 / (0.9 * F.d ** 2), rho = 0.85 * mt.fc / mt.fy * (1 - Math.sqrt(Math.max(0, 1 - 2 * Rn / (0.85 * mt.fc))));
    const aPr = F.Ap / 1e4 * mt.fy / (0.85 * mt.fc);
    const nomK = { xb: 'inferior dirección X', yb: 'inferior dirección Y', xt: 'superior dirección X', yt: 'superior dirección Y' };
    // Columna crítica a punzonado
    const pc = R.punz.reduce((a, b) => (b.ratio > a.ratio ? b : a), R.punz[0]);
    const dmed = (R.dd.xb + R.dd.yb) / 2;
    const plan = R.plan;
    const vol = A * g.h;
    const tabla = (cab, filas, cls = '') => `<table class="${cls}"><tr>${cab.map(h => `<th>${h}</th>`).join('')}</tr>${filas.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</table>`;

    return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Memoria de cálculo — ${P.proyecto.nombre || 'Platea'}</title>
<style>
@page{size:A4;margin:2cm 1.8cm}
body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#111;line-height:1.45;max-width:820px;margin:0 auto;padding:16px}
h1{font-size:18pt;margin:0 0 4px} h2{font-size:13pt;margin:22px 0 6px;border-bottom:2px solid #1d3557;padding-bottom:3px;color:#1d3557;page-break-after:avoid}
h3{font-size:11pt;margin:14px 0 4px;color:#1d3557}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:9.5pt;page-break-inside:auto}
th,td{border:1px solid #9aa5b1;padding:3px 5px;text-align:center} th{background:#e8eef5}
td.l,th.l{text-align:left}
.f{background:#f4f7fa;border-left:3px solid #1d3557;padding:6px 10px;margin:6px 0;font-family:Arial,Helvetica,sans-serif}
.ok{color:#137a3a;font-weight:bold}.no{color:#c0251c;font-weight:bold}
.fig{text-align:center;margin:10px 0;page-break-inside:avoid} .fig img{max-width:100%;border:1px solid #ccc}
.cap{font-size:9pt;color:#444;margin-top:3px}
.port{border:2px solid #1d3557;padding:14px;margin-bottom:14px}
.nota{font-size:9pt;color:#444}
.tb{display:flex;gap:8px;position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd;margin-bottom:10px}
.tb button{font-family:Arial;padding:6px 12px;border:1px solid #1d3557;background:#1d3557;color:#fff;border-radius:4px;cursor:pointer}
@media print{.tb{display:none} body{max-width:none;padding:0}}
</style></head><body>
${paraWord ? '' : `<div class="tb"><button onclick="window.print()">Imprimir / Guardar PDF</button><button onclick="window.opener&&window.opener.APP&&window.opener.APP.memoriaWord()">Descargar Word (.doc)</button></div>`}
<div class="port">
<h1>MEMORIA DE CÁLCULO — PLATEA DE FUNDACIÓN</h1>
<b>Proyecto:</b> ${P.proyecto.nombre || '—'}<br><b>Obra / ubicación:</b> ${P.proyecto.obra || '—'}<br>
<b>Calculista:</b> ${P.proyecto.autor || '—'}<br><b>Fecha:</b> ${new Date().toLocaleDateString('es-AR')}<br>
<b>Reglamentos:</b> CIRSOC 201-2005 (hormigón armado), criterios geotécnicos usuales (Brinch Hansen / Vesic, Winkler).<br>
<b>Resultado global:</b> ${ok(R.okGlobal)}
</div>

<h2>1. Objeto y descripción</h2>
<p>Se verifica una platea de fundación de hormigón armado de planta rectangular <b>${f(g.Lx)} m × ${f(g.Ly)} m</b> y espesor constante <b>h = ${f(g.h * 100, 0)} cm</b>, que recibe <b>${P.cols.length} columnas</b>. La platea apoya directamente sobre el suelo a una profundidad de fundación D<sub>f</sub> = ${f(s.Df)} m.</p>
<p>Se verifican: (a) tensiones en el suelo, (b) capacidad portante, (c) asentamientos y distorsiones, (d) deslizamiento, (e) flexión con armadura inferior y superior más refuerzos locales, (f) corte en una dirección y (g) punzonado en cada columna.</p>
${im('planta', 'Figura 1 — Planta general con columnas, zonas de refuerzo (azul: inferior, rojo: superior) y líneas de corte.')}

<h2>2. Materiales</h2>
${tabla(['Material', 'Parámetro', 'Valor'], [
      ['Hormigón', "Resistencia especificada f'c", `${f(mt.fc, 0)} MPa`],
      ['Hormigón', "Módulo de elasticidad E<sub>c</sub> = 4700·√f'c", `${f(Ec, 0)} MPa`],
      ['Hormigón', 'Coeficiente de Poisson ν', f(mt.nu)],
      ['Hormigón', 'Peso unitario γ<sub>c</sub>', `${f(mt.gc, 1)} kN/m³`],
      ['Acero', 'Tensión de fluencia f<sub>y</sub>', `${f(mt.fy, 0)} MPa`],
      ['Armaduras', 'Recubrimiento libre', `${f(mt.rec * 100, 1)} cm`]
    ])}

<h2>3. Geometría y alturas útiles</h2>
<p>La altura útil <i>d</i> es la distancia desde la fibra comprimida al baricentro de cada capa de barras. La capa en dirección X es la exterior (más cercana a la cara) y la capa Y se apoya sobre ella:</p>
<div class="f">d<sub>X</sub> = h − rec − Ø<sub>X</sub>/2 &nbsp;&nbsp;&nbsp;&nbsp; d<sub>Y</sub> = h − rec − Ø<sub>X</sub> − Ø<sub>Y</sub>/2</div>
${tabla(['Capa', 'Dirección', 'Barra base', 'd [cm]', 'As base [cm²/m]'], ['xb', 'yb', 'xt', 'yt'].map(k => [fl[k].capa === 'inf' ? 'Inferior' : 'Superior', fl[k].dir.toUpperCase(), `Ø${fl[k].barra.d} c/${fl[k].barra.s} cm`, f(fl[k].d * 100, 1), f(fl[k].base)]))}
<p class="nota">Área por metro de una malla: A<sub>s</sub> = (π·Ø²/4) · (100/s) [cm²/m], con Ø en cm y s en cm.</p>

<h2>4. Datos del suelo</h2>
${tabla(['Parámetro', 'Símbolo', 'Valor'], [
      ['Tensión admisible (estudio de suelos)', 'σ<sub>adm</sub>', `${f(s.sadm)} kg/cm² = ${f(s.sadm * K2, 1)} kN/m²`],
      ['Módulo de balasto (Winkler)', 'k<sub>s</sub>', `${f(s.ks, 2)} kg/cm³ = ${f(su.ks, 0)} kN/m³`],
      ['Módulo de elasticidad del suelo', 'E<sub>s</sub>', `${f(s.Es, 1)} MPa`],
      ['Coef. de Poisson del suelo', 'ν<sub>s</sub>', f(s.nus)],
      ['Peso unitario', 'γ', `${f(s.gamma, 1)} kN/m³`],
      ['Ángulo de fricción interna', 'φ', `${f(s.phi, 1)}°`],
      ['Cohesión', 'c', `${f(s.c, 1)} kPa`],
      ['Profundidad de fundación', 'D<sub>f</sub>', `${f(s.Df)} m`],
      ['Profundidad de la napa freática', 'z<sub>w</sub>', `${f(s.nf)} m`],
      ['Coef. de rozamiento suelo-platea', 'μ = tan δ', f(s.mu)],
      ['Asentamiento admisible', 's<sub>adm</sub>', `${f(s.wadm, 0)} mm`],
      ['Distorsión angular admisible', 'δ/L', `1/${s.distLim}`],
      ['Resortes sólo a compresión (despegue)', '—', s.sinTraccion ? 'Sí' : 'No']
    ])}

<h2>5. Cargas</h2>
<h3>5.1 Cargas de columnas</h3>
<p>Convención: N positiva hacia abajo (compresión); V<sub>x</sub>, V<sub>y</sub> fuerzas horizontales; M<sub>x</sub> momento alrededor del eje X, M<sub>y</sub> alrededor del eje Y, M<sub>z</sub> torsor alrededor del eje vertical (regla de la mano derecha). Unidades kN y kNm.</p>
${tabla(['Col.', 'x [m]', 'y [m]', 'b<sub>x</sub>×b<sub>y</sub> [cm]', 'N<sub>s</sub>', 'V<sub>x,s</sub>', 'V<sub>y,s</sub>', 'M<sub>x,s</sub>', 'M<sub>y,s</sub>', 'M<sub>z,s</sub>', 'N<sub>u</sub>', 'V<sub>x,u</sub>', 'V<sub>y,u</sub>', 'M<sub>x,u</sub>', 'M<sub>y,u</sub>', 'M<sub>z,u</sub>'],
      P.cols.map(c => [c.id, f(c.x), f(c.y), `${f(c.bx * 100, 0)}×${f(c.by * 100, 0)}`, f(c.s.N, 0), f(c.s.Vx, 0), f(c.s.Vy, 0), f(c.s.Mx, 0), f(c.s.My, 0), f(c.s.Mz, 0), f(c.u.N, 0), f(c.u.Vx, 0), f(c.u.Vy, 0), f(c.u.Mx, 0), f(c.u.My, 0), f(c.u.Mz, 0)]))}
<p>Σ N<sub>servicio</sub> = <b>${f(NS, 0)} kN</b> &nbsp;&nbsp; Σ N<sub>última</sub> = <b>${f(NU, 0)} kN</b></p>
<h3>5.2 Cargas superficiales sobre la platea</h3>
<div class="f">Peso propio: g<sub>pp</sub> = γ<sub>c</sub>·h = ${f(mt.gc, 1)} × ${f(g.h)} = ${f(mt.gc * g.h)} kN/m²<br>
Permanente adicional: g<sub>ad</sub> = ${f(c.qD)} kN/m² &nbsp;&nbsp; Sobrecarga de uso: q<sub>L</sub> = ${f(c.qL)} kN/m²<br>
<b>Servicio:</b> p<sub>s</sub> = g<sub>pp</sub> + g<sub>ad</sub> + q<sub>L</sub> = <b>${f(su.pS)} kN/m²</b><br>
<b>Última:</b> p<sub>u</sub> = ${f(c.fD, 2)}·(g<sub>pp</sub> + g<sub>ad</sub>) + ${f(c.fL, 2)}·q<sub>L</sub> = <b>${f(su.pU)} kN/m²</b></div>
<p>Las cargas de servicio se usan para verificar el suelo (tensiones, asentamientos, deslizamiento). Las cargas últimas (mayoradas) se usan para dimensionar el hormigón armado (flexión, corte y punzonado).</p>

<h2>6. Modelo de cálculo</h2>
<p>La platea se modela como una <b>placa gruesa (teoría de Reissner-Mindlin)</b> apoyada sobre una <b>fundación elástica de Winkler</b>: el suelo se representa con resortes verticales independientes cuya rigidez por unidad de área es el módulo de balasto k<sub>s</sub>. La ecuación de equilibrio (forma clásica) es:</p>
<div class="f">D · ∇⁴w + k<sub>s</sub> · w = q(x,y) &nbsp;&nbsp;&nbsp; con &nbsp; D = E<sub>c</sub>·h³ / [12·(1 − ν²)]</div>
<div class="f">D = ${f(Ec, 0)} MPa × (${f(g.h)} m)³ / [12 × (1 − ${f(mt.nu)}²)] = <b>${f(rg.D / 1000, 1)} MNm</b> (= ${f(rg.D, 0)} kNm)</div>
<p>La placa se discretiza por el <b>Método de los Elementos Finitos</b> con ${R.m.nxE} × ${R.m.nyE} = ${R.m.els.length} elementos cuadriláteros MITC4 de ${f(R.m.dx)} m × ${f(R.m.dy)} m (${R.m.nn} nodos, 3 grados de libertad por nodo: descenso w y giros β<sub>x</sub>, β<sub>y</sub>). Cada nodo tiene un resorte k<sub>n</sub> = k<sub>s</sub>·A<sub>trib</sub>. Las cargas de columnas se reparten entre los nodos ubicados bajo la sección de cada columna; los momentos M<sub>x</sub>, M<sub>y</sub> se aplican como pares nodales.</p>
${s.sinTraccion ? `<p>Como el suelo no puede tomar tracciones, se realiza un cálculo <b>iterativo</b>: los resortes de nodos que tienden a levantarse se desactivan y se recalcula hasta que no hay cambios (servicio: ${R.rs.iter} iteraciones, contacto ${f(R.rs.contacto * 100, 1)} % del área; última: ${R.ru.iter} iteraciones).</p>` : ''}
<p><b>Control de equilibrio (servicio):</b> carga total aplicada = ${f(R.rs.Ftot, 1)} kN; reacción total del suelo = ${f(R.rs.R, 1)} kN (diferencia ${f(Math.abs(R.rs.R - R.rs.Ftot) / R.rs.Ftot * 100, 3)} %).</p>
<h3>6.1 Rigidez relativa de la platea</h3>
<div class="f">λ = [k<sub>s</sub> / (4·D)]<sup>1/4</sup> = [${f(su.ks, 0)} / (4 × ${f(rg.D, 0)})]<sup>1/4</sup> = ${f(rg.lam, 4)} 1/m &nbsp;&nbsp; → &nbsp;&nbsp; longitud elástica L<sub>e</sub> = 1/λ = ${f(rg.Le)} m</div>
<p>Criterio (ACI 336.2R): si la luz entre columnas es menor que 1,75/λ = ${f(rg.lim)} m la platea se comporta como <b>rígida</b>; si no, como <b>flexible</b>. Luz máxima entre columnas alineadas: ${f(rg.lmax)} m → comportamiento <b>${rg.lmax <= rg.lim ? 'rígido' : 'flexible'}</b>. ${rg.lmax <= rg.lim ? 'Las presiones se aproximan a una distribución lineal.' : 'Las presiones se concentran bajo las columnas, por eso es necesario el modelo de placa sobre resortes.'}</p>
${im('axo', 'Figura 2 — Vista axonométrica de la deformada (exagerada) con presiones en el suelo.')}

<h2>7. Verificación de tensiones en el suelo</h2>
<p>La presión de contacto en cada punto resulta de la ley de Winkler:</p>
<div class="f">q = k<sub>s</sub> · w &nbsp;&nbsp; (w = asentamiento en ese punto)</div>
<p><b>Control global (platea rígida):</b> resultante de cargas de servicio N = ${f(su.Ntot, 0)} kN, ubicada en x<sub>R</sub> = ${f(su.xR)} m, y<sub>R</sub> = ${f(su.yR)} m. Excentricidades e<sub>x</sub> = ${f(su.ex, 3)} m, e<sub>y</sub> = ${f(su.ey, 3)} m (${su.nucleo ? 'dentro' : 'FUERA'} del núcleo central L/6).</p>
<div class="f">q<sub>med</sub> = N / A = ${f(su.Ntot, 0)} / ${f(A, 2)} = ${f(su.qmed, 1)} kN/m² = ${f(su.qmed / K2)} kg/cm²<br>
q<sub>máx,rígida</sub> = (N/A)·(1 + 6e<sub>x</sub>/L<sub>x</sub> + 6e<sub>y</sub>/L<sub>y</sub>) = ${f(su.qRig, 1)} kN/m² = ${f(su.qRig / K2)} kg/cm²</div>
<p><b>Resultado del modelo de elementos finitos:</b></p>
<div class="f">q<sub>máx</sub> = ${f(su.qmax, 1)} kN/m² = <b>${f(su.qmax / K2)} kg/cm²</b> (en x = ${f(su.x)} m, y = ${f(su.y)} m) &nbsp; ≤ &nbsp; σ<sub>adm</sub> = ${f(s.sadm)} kg/cm² &nbsp;→&nbsp; ${ok(su.ok)}</div>
<p class="nota">La presión comparada es la presión bruta de contacto (incluye peso propio de la platea y rellenos).</p>
${im('qs', 'Figura 3 — Presión de contacto en el suelo, cargas de servicio [kN/m²].')}

<h2>8. Capacidad portante (verificación de σ<sub>adm</sub>)</h2>
<p>Se controla que la tensión admisible adoptada no supere la capacidad de carga del suelo dividida por el factor de seguridad, con la fórmula general de Brinch Hansen / Vesic (B = ${f(po.B)} m, L = ${f(po.L)} m):</p>
<div class="f">q<sub>ult</sub> = c·N<sub>c</sub>·s<sub>c</sub>·d<sub>c</sub> + q·N<sub>q</sub>·s<sub>q</sub>·d<sub>q</sub> + ½·γ'·B·N<sub>γ</sub>·s<sub>γ</sub>·d<sub>γ</sub></div>
<div class="f">N<sub>q</sub> = e<sup>π·tanφ</sup>·tan²(45°+φ/2) = ${f(po.Nq)} &nbsp;&nbsp; N<sub>c</sub> = (N<sub>q</sub>−1)·cotφ = ${f(po.Nc)} &nbsp;&nbsp; N<sub>γ</sub> = 2·(N<sub>q</sub>+1)·tanφ = ${f(po.Ng)}<br>
Forma: s<sub>c</sub> = 1 + (B/L)(N<sub>q</sub>/N<sub>c</sub>) = ${f(po.sc, 3)}; &nbsp; s<sub>q</sub> = 1 + (B/L)·tanφ = ${f(po.sq, 3)}; &nbsp; s<sub>γ</sub> = 1 − 0,4·B/L = ${f(po.sg, 3)}<br>
Profundidad: d<sub>c</sub> = 1 + 0,4·D<sub>f</sub>/B = ${f(po.dc, 3)}; &nbsp; d<sub>q</sub> = 1 + 2·tanφ·(1−senφ)²·D<sub>f</sub>/B = ${f(po.dq, 3)}; &nbsp; d<sub>γ</sub> = 1<br>
Sobrecarga a nivel de fundación q = ${f(po.q, 1)} kN/m²; peso unitario efectivo γ' = ${f(po.gEf, 2)} kN/m³<br>
q<sub>ult</sub> = ${f(po.t1, 0)} + ${f(po.t2, 0)} + ${f(po.t3, 0)} = <b>${f(po.qult, 0)} kN/m²</b><br>
q<sub>adm</sub> = q<sub>ult</sub> / FS = ${f(po.qult, 0)} / ${f(s.FS, 1)} = <b>${f(po.qadm, 0)} kN/m² = ${f(po.qadm / K2)} kg/cm²</b> &nbsp; ≥ &nbsp; σ<sub>adm</sub> = ${f(s.sadm)} kg/cm² → ${ok(su.okPort)}</div>

<h2>9. Asentamientos y distorsiones angulares</h2>
<div class="f">Asentamiento máximo (servicio): s<sub>máx</sub> = ${f(as.wmax * 1000, 1)} mm ≤ s<sub>adm</sub> = ${f(s.wadm, 0)} mm → ${ok(as.okW)}</div>
<p>La distorsión angular entre columnas vecinas i, j es β = |s<sub>i</sub> − s<sub>j</sub>| / L<sub>ij</sub>.</p>
<div class="f">${as.dist.a >= 0 ? `Máxima: entre ${P.cols[as.dist.a].id} y ${P.cols[as.dist.b].id}: β = ${f(as.dist.dw * 1000, 2)} mm / ${f(as.dist.L * 1000, 0)} mm = 1/${as.dist.val > 0 ? Math.round(1 / as.dist.val) : '∞'}` : 'Sin pares de columnas.'} ≤ 1/${s.distLim} → ${ok(as.okD)}</div>
${tabla(['Columna', 'Asentamiento [mm]', 'Presión bajo columna [kN/m²]', 'Presión [kg/cm²]'], P.cols.map((c, i) => [c.id, f(as.wcol[i] * 1000, 2), f(as.qcol[i], 1), f(as.qcol[i] / K2)]))}
${im('w', 'Figura 4 — Asentamientos de la platea, cargas de servicio [mm].')}

<h2>10. Deslizamiento y giro en planta</h2>
<div class="f">Fuerza horizontal: H = √(ΣV<sub>x</sub>² + ΣV<sub>y</sub>²) = √(${f(de.Hx, 1)}² + ${f(de.Hy, 1)}²) = ${f(de.H, 1)} kN<br>
Resistencia por rozamiento: R = μ·N = ${f(s.mu)} × ${f(su.Ntot, 0)} = ${f(de.Rd, 0)} kN &nbsp;→&nbsp; FS = R/H = <b>${f(de.FS)}</b> ≥ 1,5<br>
Torsor total respecto al centro: M<sub>z</sub> = ΣM<sub>z</sub> + Σ(x·V<sub>y</sub> − y·V<sub>x</sub>) = ${f(de.Mz, 1)} kNm<br>
Resistencia al giro: M<sub>R</sub> = μ·N·r<sub>m</sub> = ${f(s.mu)} × ${f(su.Ntot, 0)} × ${f(de.rm)} = ${f(de.Rt, 0)} kNm &nbsp;→&nbsp; FS = <b>${f(de.FSt)}</b> ≥ 1,5 &nbsp;&nbsp; ${ok(de.ok)}</div>
<p class="nota">r<sub>m</sub> = distancia media de los puntos de la platea a su centro. El empuje pasivo lateral se desprecia (a favor de la seguridad).</p>

<h2>11. Diseño a flexión</h2>
<h3>11.1 Momentos de diseño (Wood-Armer)</h3>
<p>En una placa existen momentos flectores M<sub>x</sub>, M<sub>y</sub> y un momento torsor M<sub>xy</sub>. Como las barras se colocan sólo en direcciones X e Y, el torsor se incorpora con las fórmulas de <b>Wood-Armer</b>:</p>
<div class="f"><b>Armadura inferior</b> (M &gt; 0, tracción abajo): M<sub>x</sub>* = M<sub>x</sub> + |M<sub>xy</sub>| ; &nbsp; M<sub>y</sub>* = M<sub>y</sub> + |M<sub>xy</sub>|<br>
&nbsp;&nbsp;&nbsp;si M<sub>x</sub>* &lt; 0 → M<sub>x</sub>* = 0 y M<sub>y</sub>* = M<sub>y</sub> + M<sub>xy</sub>²/|M<sub>x</sub>| (análogo si M<sub>y</sub>* &lt; 0)<br>
<b>Armadura superior</b> (M &lt; 0, tracción arriba): M<sub>x</sub>* = M<sub>x</sub> − |M<sub>xy</sub>| ; &nbsp; M<sub>y</sub>* = M<sub>y</sub> − |M<sub>xy</sub>|<br>
&nbsp;&nbsp;&nbsp;si M<sub>x</sub>* &gt; 0 → M<sub>x</sub>* = 0 y M<sub>y</sub>* = M<sub>y</sub> − M<sub>xy</sub>²/|M<sub>x</sub>| (análogo si M<sub>y</sub>* &gt; 0)</div>
<p class="nota">Bajo las columnas se diseña con los momentos a cara de columna (los nodos interiores a la sección de la columna se excluyen de la verificación, donde la columna aporta rigidez y la placa no puede fisurarse libremente).</p>
${im('mx', 'Figura 5 — Momento M<sub>x</sub> último [kNm/m].')}
${im('my', 'Figura 6 — Momento M<sub>y</sub> último [kNm/m].')}
<h3>11.2 Armadura necesaria y momento resistente</h3>
<p>Para una faja de ancho b = 1 m (CIRSOC 201-2005, cap. 10, sección controlada por tracción, φ = 0,90):</p>
<div class="f">R<sub>n</sub> = M<sub>u</sub> / (φ·b·d²) &nbsp;&nbsp;&nbsp; ρ = (0,85·f'c/f<sub>y</sub>)·[1 − √(1 − 2·R<sub>n</sub>/(0,85·f'c))] &nbsp;&nbsp;&nbsp; A<sub>s,nec</sub> = ρ·b·d<br>
a = A<sub>s</sub>·f<sub>y</sub> / (0,85·f'c·b) &nbsp;&nbsp;&nbsp; φM<sub>n</sub> = φ·A<sub>s</sub>·f<sub>y</sub>·(d − a/2) &nbsp;&nbsp;&nbsp; Verificación: M<sub>u</sub> ≤ φM<sub>n</sub></div>
<div class="f">Armadura mínima (CIRSOC 201, 7.12): A<sub>s,mín</sub> = 0,0018·b·h = 0,0018 × 100 × ${f(g.h * 100, 0)} = <b>${f(R.asMin)} cm²/m</b> por dirección (suma de ambas caras)<br>
Dirección X: ${f(fl.xb.base)} + ${f(fl.xt.base)} = ${f(fl.xb.base + fl.xt.base)} cm²/m → ${ok(R.minOk.x)} &nbsp;&nbsp; Dirección Y: ${f(fl.yb.base)} + ${f(fl.yt.base)} = ${f(fl.yb.base + fl.yt.base)} cm²/m → ${ok(R.minOk.y)}<br>
Separación máxima: s ≤ mín(2,5·h ; 25 cm) = ${f(R.smax, 0)} cm → ${ok(R.sepOk)}</div>
<h3>11.3 Ejemplo numérico (punto más solicitado: capa ${nomK[kf]})</h3>
<div class="f">Ubicación: x = ${f(F.x)} m, y = ${f(F.y)} m. &nbsp; M<sub>u</sub>* = <b>${f(F.Mu, 1)} kNm/m</b>, d = ${f(F.d * 100, 1)} cm<br>
R<sub>n</sub> = ${f(F.Mu, 1)}×10⁻³ / (0,90 × 1,00 × ${f(F.d, 3)}²) = ${f(Rn, 3)} MPa<br>
ρ = (0,85 × ${mt.fc} / ${mt.fy}) × [1 − √(1 − 2 × ${f(Rn, 3)} / (0,85 × ${mt.fc}))] = ${f(rho, 5)}<br>
A<sub>s,nec</sub> = ${f(rho, 5)} × 100 × ${f(F.d * 100, 1)} = <b>${f(rho * F.d * 1e4)} cm²/m</b><br>
A<sub>s,prov</sub> (malla + refuerzos) = ${f(F.Ap)} cm²/m &nbsp;→&nbsp; a = ${f(aPr * 100, 2)} cm &nbsp;→&nbsp; φM<sub>n</sub> = ${f(F.phiMn, 1)} kNm/m<br>
Utilización M<sub>u</sub>/φM<sub>n</sub> = <b>${f(F.u)}</b> → ${ok(F.u <= 1.0001)}</div>
<h3>11.4 Resumen por capa</h3>
${tabla(['Capa', 'Malla base', 'As base [cm²/m]', 'Mu* máx [kNm/m]', 'As nec. máx [cm²/m]', 'Utilización máx', 'Nodos que no verifican', 'Estado'],
      ['xb', 'yb', 'xt', 'yt'].map(k => [nomK[k], `Ø${fl[k].barra.d} c/${fl[k].barra.s}`, f(fl[k].base), f(fl[k].MuR, 1), f(fl[k].asMax), f(fl[k].u), fl[k].fail, ok(fl[k].ok)]))}
${im('umax', 'Figura 7 — Utilización a flexión con la armadura provista (verde &lt; 0,85; amarillo/naranja ≤ 1; rojo &gt; 1).')}
<h3>11.5 Refuerzos adoptados</h3>
${P.ref.length ? tabla(['Id', 'Capa', 'Dir.', 'Barras', 'As adicional [cm²/m]', 'x₁–x₂ [m]', 'y₁–y₂ [m]', 'Origen'], P.ref.map(r => [r.id, r.capa === 'inf' ? 'Inferior' : 'Superior', r.dir.toUpperCase(), `Ø${r.d} c/${r.s}`, f(DIS.asm(r.d, r.s)), `${f(r.x1)} – ${f(r.x2)}`, `${f(r.y1)} – ${f(r.y2)}`, r.auto ? 'Automático' : 'Usuario'])) : '<p>No se adoptaron refuerzos adicionales.</p>'}
<p class="nota">Las barras de refuerzo se ubican en la misma capa que la malla base (intercaladas). Las zonas automáticas se prolongan una longitud de anclaje l<sub>d</sub> más allá de la zona que lo requiere.</p>

<h2>12. Corte en una dirección (acción de viga)</h2>
<div class="f">φV<sub>c</sub> = φ·(√f'c / 6)·b·d = 0,75 × (√${mt.fc} / 6) × 1,00 × ${f(R.corte.d, 3)} × 1000 = <b>${f(R.corte.phiVc, 1)} kN/m</b><br>
V<sub>u,máx</sub> = ${f(R.corte.Vu, 1)} kN/m (en x = ${f(R.corte.x)}, y = ${f(R.corte.y)} m) → ${ok(R.corte.ok)}</div>
<p class="nota">Se excluyen las zonas a menos de 2·d de las caras de las columnas, donde el corte corresponde a la acción en dos direcciones y se verifica como punzonado (capítulo 13).</p>

<h2>13. Punzonado (CIRSOC 201-2005, art. 11.12)</h2>
<p>Se considera una sección crítica a d/2 de las caras de la columna (d = ${f(dmed * 100, 1)} cm, promedio de las capas inferiores). Si una cara está a menos de d del borde de la platea, el perímetro se abre hacia el borde (columnas de borde o esquina).</p>
<div class="f">Corte último neto: V<sub>u</sub> = N<sub>u</sub> + p<sub>u</sub>·A<sub>0</sub> − q<sub>u,med</sub>·A<sub>0</sub> &nbsp; (A<sub>0</sub> = área encerrada por el perímetro crítico)<br>
Tensión máxima con transferencia de momento: v<sub>u</sub> = V<sub>u</sub>/(b<sub>0</sub>·d) + γ<sub>vx</sub>·M<sub>ux</sub>·c<sub>y</sub>/J<sub>x</sub> + γ<sub>vy</sub>·M<sub>uy</sub>·c<sub>x</sub>/J<sub>y</sub><br>
γ<sub>v</sub> = 1 − 1 / [1 + (2/3)·√(b<sub>1</sub>/b<sub>2</sub>)]<br>
Resistencia: v<sub>c</sub> = mín { (1 + 2/β)·√f'c/6 ; (α<sub>s</sub>·d/b<sub>0</sub> + 2)·√f'c/12 ; √f'c/3 } &nbsp;&nbsp; con α<sub>s</sub> = 40 interior, 30 borde, 20 esquina<br>
Verificación: v<sub>u</sub> ≤ φ·v<sub>c</sub> &nbsp; (φ = 0,75)</div>
${tabla(['Col.', 'Tipo', 'b₀ [m]', 'A₀ [m²]', 'Nu [kN]', 'q<sub>u,med</sub> [kN/m²]', 'Vu [kN]', 'vu [MPa]', 'φvc [MPa]', 'vu/φvc', 'Estado'],
      R.punz.map(p => [p.c.id, p.tipo || '—', f(p.b0), f(p.A0), f(p.c.u.N, 0), f(p.qavg, 1), f(p.Vu, 0), f(p.vu, 3), f(p.phivc, 3), f(p.ratio), ok(p.ok) + (p.hReq ? `<br><small>h nec. ≈ ${f(p.hReq * 100, 0)} cm</small>` : '')]))}
${pc ? `<h3>13.1 Ejemplo numérico — columna más solicitada ${pc.c.id} (${pc.tipo})</h3>
<div class="f">Columna ${f(pc.c.bx * 100, 0)} × ${f(pc.c.by * 100, 0)} cm; d = ${f(pc.d, 3)} m<br>
Perímetro crítico: b<sub>0</sub> = ${f(pc.b0, 3)} m (${pc.lados} lados); &nbsp; A<sub>0</sub> = ${f(pc.A0, 3)} m²<br>
V<sub>u</sub> = ${f(pc.c.u.N, 1)} + ${f(R.suelo.pU, 2)} × ${f(pc.A0, 3)} − ${f(pc.qavg, 1)} × ${f(pc.A0, 3)} = <b>${f(pc.Vu, 1)} kN</b><br>
v<sub>u,directo</sub> = V<sub>u</sub>/(b<sub>0</sub>·d) = ${f(pc.Vu, 1)} / (${f(pc.b0, 3)} × ${f(pc.d, 3)}) / 1000 = ${f(pc.vd, 3)} MPa<br>
Momentos transferidos (respecto al baricentro del perímetro): M<sub>ux</sub> = ${f(pc.Mxt, 1)} kNm; M<sub>uy</sub> = ${f(pc.Myt, 1)} kNm; γ<sub>vx</sub> = ${f(pc.gvx, 3)}; γ<sub>vy</sub> = ${f(pc.gvy, 3)}<br>
J<sub>x</sub> = ${f(pc.Jx, 4)} m⁴; J<sub>y</sub> = ${f(pc.Jy, 4)} m⁴ &nbsp;→&nbsp; v<sub>u,máx</sub> = <b>${f(pc.vu, 3)} MPa</b><br>
β = ${f(pc.beta, 2)}; α<sub>s</sub> = ${pc.as}: &nbsp; v<sub>c1</sub> = ${f(pc.vc1, 3)}; v<sub>c2</sub> = ${f(pc.vc2, 3)}; v<sub>c3</sub> = ${f(pc.vc3, 3)} MPa → v<sub>c</sub> = ${f(pc.vc, 3)} MPa<br>
φ·v<sub>c</sub> = 0,75 × ${f(pc.vc, 3)} = <b>${f(pc.phivc, 3)} MPa</b> &nbsp;→&nbsp; v<sub>u</sub>/φv<sub>c</sub> = <b>${f(pc.ratio)}</b> → ${ok(pc.ok)}</div>` : ''}
${im('punz', 'Figura 8 — Perímetros críticos de punzonado y relación v<sub>u</sub>/φv<sub>c</sub> de cada columna.')}

<h2>14. Cortes</h2>
${im('corteA', 'Figura 9 — Corte A-A: armaduras, presiones, asentamientos, momentos de diseño vs. capacidad y corte.')}
${im('corteB', 'Figura 10 — Corte B-B.')}

<h2>15. Planilla de doblado</h2>
<p>Longitud de anclaje (CIRSOC 201-2005, 12.2.2): l<sub>d</sub> = (12·f<sub>y</sub>·ψ<sub>t</sub>/(25·√f'c))·d<sub>b</sub> para Ø ≤ 16 mm y (3·f<sub>y</sub>·ψ<sub>t</sub>/(5·√f'c))·d<sub>b</sub> para Ø &gt; 16 mm; ψ<sub>t</sub> = 1,3 para barras superiores. Empalmes por yuxtaposición clase B: L<sub>e</sub> = 1,3·l<sub>d</sub>. Barras comerciales de 12 m. Las mallas base llevan patas de ${f(plan.pata * 100, 0)} cm (h − 2·rec) en ambos extremos.</p>
${tabla(['Pos.', 'Descripción', 'Ø [mm]', 'c/ [cm]', 'Cant.', 'Patas [m]', 'Empalmes', 'L. unit. [m]', 'L. total [m]', 'Peso [kg]'],
      plan.pos.map(p => [`P${p.pos}`, `<span style="text-align:left">${p.desc}</span>`, p.d, p.s, p.n, p.pata ? `2 × ${f(p.pata)}` : '—', p.nEmp ? `${p.nEmp} × ${f(p.lap)}` : '—', f(p.Lb), f(p.Lt, 1), f(p.kg, 1)]))}
${tabla(['Diámetro', ...Object.keys(plan.porD).sort((a, b) => a - b).map(d => 'Ø' + d), 'TOTAL'], [['Peso [kg]', ...Object.keys(plan.porD).sort((a, b) => a - b).map(d => f(plan.porD[d], 1)), `<b>${f(plan.total, 1)}</b>`]])}
<p>Volumen de hormigón: ${f(vol, 2)} m³ &nbsp;—&nbsp; Cuantía de acero: <b>${f(plan.total / vol, 1)} kg/m³</b></p>

<h2>16. Resumen final</h2>
${tabla(['Verificación', 'Resultado', 'Relación', 'Estado'], R.resumen.map(r => [`<span style="text-align:left">${r.t}</span>`, r.v, f(r.r), ok(r.ok)]))}
<div class="f" style="font-size:11pt">
<b>Platea:</b> ${f(g.Lx)} × ${f(g.Ly)} m, espesor <b>${f(g.h * 100, 0)} cm</b>, hormigón f'c = ${mt.fc} MPa, acero f<sub>y</sub> = ${mt.fy} MPa.<br>
<b>Armadura inferior:</b> X Ø${P.arm.inf.x.d} c/${P.arm.inf.x.s} cm — Y Ø${P.arm.inf.y.d} c/${P.arm.inf.y.s} cm${P.ref.some(r => r.capa === 'inf') ? ' + refuerzos ' + P.ref.filter(r => r.capa === 'inf').map(r => r.id).join(', ') : ''}.<br>
<b>Armadura superior:</b> X Ø${P.arm.sup.x.d} c/${P.arm.sup.x.s} cm — Y Ø${P.arm.sup.y.d} c/${P.arm.sup.y.s} cm${P.ref.some(r => r.capa === 'sup') ? ' + refuerzos ' + P.ref.filter(r => r.capa === 'sup').map(r => r.id).join(', ') : ''}.<br>
<b>Presión máxima en el suelo:</b> ${f(su.qmax / K2)} kg/cm² (admisible ${f(s.sadm)} kg/cm²). <b>Asentamiento máximo:</b> ${f(as.wmax * 1000, 1)} mm.<br>
<b>Acero total:</b> ${f(plan.total, 0)} kg (${f(plan.total / vol, 1)} kg/m³). <b>Hormigón:</b> ${f(vol, 2)} m³.<br><br>
<b>CONCLUSIÓN:</b> ${R.okGlobal ? '<span class="ok">La platea VERIFICA todas las condiciones analizadas.</span>' : '<span class="no">La platea NO VERIFICA alguna de las condiciones: revisar los ítems marcados en rojo (aumentar espesor, armadura o refuerzos, o revisar los datos del suelo).</span>'}
</div>
<p class="nota">Memoria generada automáticamente. Los resultados dependen de los datos ingresados (en especial del módulo de balasto k<sub>s</sub> y la tensión admisible, que deben surgir del estudio de suelos). El profesional responsable debe revisar los datos, hipótesis y resultados.</p>
</body></html>`;
  }

  function abrir(P, R, cortes) {
    const img = imagenes(P, R, cortes);
    const w = window.open('', '_blank');
    if (!w) { alert('El navegador bloqueó la ventana emergente. Permita ventanas emergentes para ver la memoria.'); return; }
    w.document.open(); w.document.write(html(P, R, img, false)); w.document.close();
  }

  function word(P, R, cortes) {
    const img = imagenes(P, R, cortes);
    const b = '----=_NextPart_PLATEA_' + Date.now();
    let out = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${b}"; type="text/html"\r\n\r\n`;
    const h = html(P, R, img, true);
    out += `--${b}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/memoria/memoria.htm\r\n\r\n`;
    out += b64(h) + '\r\n';
    for (const k in img) {
      out += `--${b}\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/memoria/${k}.png\r\n\r\n`;
      out += img[k].split(',')[1].replace(/.{76}/g, '$&\r\n') + '\r\n';
    }
    out += `--${b}--\r\n`;
    return out;
  }
  function b64(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/.{76}/g, '$&\r\n');
  }

  return { abrir, word, html, imagenes };
})();
