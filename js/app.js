'use strict';
/* =====================================================================
   APP — interfaz, datos del proyecto, persistencia y orquestación
   ===================================================================== */
const APP = (() => {
  const $ = id => document.getElementById(id);
  const KEY = 'platea_fundacion_v1';
  let P, R = null, dirty = true, timer = null;
  const V = { main: 'cols', campo: 'qs', sel: -1, az: -35, el: 32, zoom: 1, panx: 0, pany: 0, cdir: 'x', T: null };

  /* ------------------------- Proyecto ------------------------- */
  function ejemplo() {
    const cols = []; let k = 1;
    for (const y of [1, 6, 11, 16]) for (const x of [1, 6, 11]) {
      const esq = x !== 6 && (y === 1 || y === 16), int = x === 6 && (y === 6 || y === 11);
      const N = esq ? 900 : int ? 2200 : 1400, b = int ? 0.5 : 0.4;
      cols.push({ id: 'C' + k++, x, y, bx: b, by: b, s: { N, Vx: 15, Vy: 10, Mx: 20, My: 15, Mz: 0 }, u: { N: 1.4 * N, Vx: 21, Vy: 14, Mx: 28, My: 21, Mz: 0 } });
    }
    return {
      proyecto: { nombre: 'Platea de fundación - Ejemplo', obra: 'Edificio de viviendas', autor: '' },
      geom: { Lx: 12, Ly: 17, h: 0.7, malla: 0.25 },
      mat: { fc: 25, fy: 420, gc: 25, rec: 0.05, nu: 0.2 },
      suelo: { sadm: 1.5, ks: 2, Es: 25, nus: 0.3, gamma: 18, phi: 28, c: 10, Df: 1.5, nf: 10, FS: 3, mu: 0.45, sinTraccion: true, wadm: 50, distLim: 500 },
      cargas: { qD: 1, qL: 2, fD: 1.2, fL: 1.6 },
      cols,
      arm: { inf: { x: { d: 16, s: 15 }, y: { d: 16, s: 15 } }, sup: { x: { d: 16, s: 20 }, y: { d: 16, s: 20 } } },
      ref: [],
      cortes: { x: 6, y: 6 }
    };
  }
  function nuevo() {
    const p = ejemplo();
    p.proyecto = { nombre: 'Nueva platea', obra: '', autor: '' };
    p.geom = { Lx: 10, Ly: 10, h: 0.5, malla: 0.25 };
    p.cols = [{ id: 'C1', x: 5, y: 5, bx: 0.4, by: 0.4, s: { N: 1000, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 }, u: { N: 1400, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 } }];
    p.arm = { inf: { x: { d: 12, s: 15 }, y: { d: 12, s: 15 } }, sup: { x: { d: 12, s: 20 }, y: { d: 12, s: 20 } } };
    p.cortes = { x: 5, y: 5 };
    return p;
  }
  function guardarLocal() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
  function cargarLocal() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function normalizar(p) {
    const d = ejemplo();
    for (const k of ['proyecto', 'geom', 'mat', 'suelo', 'cargas']) p[k] = { ...d[k], ...(p[k] || {}) };
    p.cols = p.cols || []; p.ref = p.ref || []; p.arm = p.arm || d.arm; p.cortes = p.cortes || { x: p.geom.Lx / 2, y: p.geom.Ly / 2 };
    for (const c of p.cols) { c.s = { N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0, ...(c.s || {}) }; c.u = { N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0, ...(c.u || {}) }; }
    return p;
  }
  const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
  const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

  /* ------------------------- Formularios ------------------------- */
  const FORM = {
    pGen: [
      ['Proyecto', [['proyecto.nombre', 'Nombre', '', 't'], ['proyecto.obra', 'Obra / ubicación', '', 't'], ['proyecto.autor', 'Calculista', '', 't']]],
      ['Geometría de la platea', [['geom.Lx', 'Largo Lx (dirección X)', 'm'], ['geom.Ly', 'Ancho Ly (dirección Y)', 'm'], ['geom.h', 'Espesor h', 'm'], ['geom.malla', 'Tamaño de malla de cálculo', 'm']],
        'Origen (0,0) en la esquina inferior izquierda. Malla más fina = más precisión y más tiempo (recomendado 0,20–0,40 m).'],
      ['Materiales', [['mat.fc', "Hormigón f'c", 'MPa'], ['mat.fy', 'Acero fy', 'MPa'], ['mat.gc', 'Peso unitario H°A°', 'kN/m³'], ['mat.rec', 'Recubrimiento libre', 'm'], ['mat.nu', 'Poisson del hormigón', '']]],
      ['Cargas sobre la platea', [['cargas.qD', 'Permanente adicional (contrapiso, relleno)', 'kN/m²'], ['cargas.qL', 'Sobrecarga de uso', 'kN/m²'], ['cargas.fD', 'Factor de mayoración D', ''], ['cargas.fL', 'Factor de mayoración L', '']],
        'El peso propio (γc·h) se agrega automáticamente. Combinación última: fD·D + fL·L (CIRSOC: 1,2 D + 1,6 L).']
    ],
    pSuelo: [
      ['Parámetros del estudio de suelos', [['suelo.sadm', 'Tensión admisible σadm', 'kg/cm²'], ['suelo.ks', 'Módulo de balasto ks', 'kg/cm³'], ['suelo.Es', 'Módulo elástico Es', 'MPa'], ['suelo.nus', 'Poisson del suelo νs', '']],
        'ks: rigidez del resorte por unidad de área. Valores orientativos: arena suelta 0,5–1,5; arena media 1,5–5; arena densa 5–10; arcilla media 1–3; arcilla dura 3–6 kg/cm³.'],
      ['Resistencia del suelo', [['suelo.gamma', 'Peso unitario γ', 'kN/m³'], ['suelo.phi', 'Ángulo de fricción φ', '°'], ['suelo.c', 'Cohesión c', 'kPa'], ['suelo.Df', 'Profundidad de fundación Df', 'm'], ['suelo.nf', 'Profundidad de napa freática', 'm'], ['suelo.FS', 'Factor de seguridad (portante)', ''], ['suelo.mu', 'Coef. rozamiento μ = tan δ', '']]],
      ['Límites de servicio', [['suelo.wadm', 'Asentamiento admisible', 'mm'], ['suelo.distLim', 'Distorsión angular admisible 1/…', '']]],
      ['Modelo', [['suelo.sinTraccion', 'Suelo sin tracción (permite despegue)', '', 'c']]]
    ]
  };
  function renderForm(id) {
    const el = $(id); el.innerHTML = '';
    for (const [tit, flds, help] of FORM[id]) {
      const g = document.createElement('div'); g.className = 'grp';
      g.innerHTML = `<h3>${tit}</h3><div class="bd"></div>`;
      const bd = g.querySelector('.bd');
      for (const [p, l, u, t] of flds) {
        const r = document.createElement('div'); r.className = 'fld' + (t === 't' ? ' txt' : '');
        const v = get(P, p);
        if (t === 't') r.innerHTML = `<label>${l}</label><input data-p="${p}" type="text" value="${String(v ?? '').replace(/"/g, '&quot;')}">`;
        else if (t === 'c') r.innerHTML = `<label>${l}</label><input data-p="${p}" data-c="1" type="checkbox" ${v ? 'checked' : ''}><span></span>`;
        else r.innerHTML = `<label>${l}</label><input data-p="${p}" type="number" step="any" value="${v}"><span class="u">${u}</span>`;
        bd.appendChild(r);
      }
      if (id === 'pSuelo' && tit.startsWith('Parámetros')) {
        const b = document.createElement('div');
        b.innerHTML = `<button id="bKs" style="margin-top:4px">Estimar ks desde Es (Vesic)</button> <span class="help" id="ksInfo"></span>`;
        bd.appendChild(b);
      }
      if (help) bd.insertAdjacentHTML('beforeend', `<div class="help">${help}</div>`);
      el.appendChild(g);
    }
    el.querySelectorAll('input[data-p]').forEach(inp => inp.addEventListener('input', () => {
      const p = inp.dataset.p;
      let v = inp.dataset.c ? inp.checked : inp.type === 'number' ? parseFloat(inp.value) : inp.value;
      if (inp.type === 'number' && isNaN(v)) return;
      set(P, p, v); cambio();
    }));
    if ($('bKs')) $('bKs').onclick = () => {
      const B = Math.min(P.geom.Lx, P.geom.Ly), Es = P.suelo.Es * 1000, ns = P.suelo.nus;
      const Ec = 4700 * Math.sqrt(P.mat.fc) * 1000, I = P.geom.h ** 3 / 12;
      const ks = 0.65 * Math.pow(Es * B ** 4 / (Ec * I), 1 / 12) * Es / (1 - ns * ns) / B; // kN/m³
      const v = Math.round(ks / DIS.KGCM3 * 100) / 100;
      if (confirm(`Vesic: ks = 0,65·(Es·B⁴/EcI)^(1/12)·Es/(B(1−νs²)) = ${v} kg/cm³ (B = ${B} m).\n\n¿Adoptar este valor? (Siempre preferir el valor del estudio de suelos)`)) { P.suelo.ks = v; renderForm('pSuelo'); cambio(); }
    };
  }

  function renderArm() {
    const el = $('pArm');
    const opt = d => DIS.DIAMS.map(x => `<option ${x === d ? 'selected' : ''}>${x}</option>`).join('');
    const fila = (c, d) => {
      const b = P.arm[c][d];
      return `<tr><td><span class="chip ${c}">${c === 'inf' ? 'Inferior' : 'Superior'}</span></td><td>${d.toUpperCase()}</td>
      <td>Ø <select data-a="${c}.${d}.d" style="width:58px">${opt(b.d)}</select></td>
      <td>c/ <input data-a="${c}.${d}.s" type="number" step="0.5" value="${b.s}" style="width:52px"> cm</td>
      <td><b>${DIS.asm(b.d, b.s).toFixed(2)}</b></td><td>${(DIS.dEff(P, c, d) * 100).toFixed(1)}</td></tr>`;
    };
    const asMin = 0.0018 * P.geom.h * 1e4;
    const sx = DIS.asBase(P, 'inf', 'x') + DIS.asBase(P, 'sup', 'x'), sy = DIS.asBase(P, 'inf', 'y') + DIS.asBase(P, 'sup', 'y');
    el.innerHTML = `<div class="grp"><h3>Malla base (toda la platea)</h3><div class="bd">
      <table class="t wide"><tr><th>Capa</th><th>Dir.</th><th>Diám. [mm]</th><th>Separación</th><th>As [cm²/m]</th><th>d [cm]</th></tr>
      ${fila('inf', 'x')}${fila('inf', 'y')}${fila('sup', 'x')}${fila('sup', 'y')}</table>
      <div class="help">La capa X es la exterior en cada cara. d = altura útil.</div>
      <div class="help">As mín. = 0,0018·b·h = <b>${asMin.toFixed(2)} cm²/m</b> por dirección (suma inf.+sup.): X = <b class="${sx >= asMin ? 'ok' : 'no'}">${sx.toFixed(2)}</b>, Y = <b class="${sy >= asMin ? 'ok' : 'no'}">${sy.toFixed(2)}</b>. Separación máx.: ${Math.min(2.5 * P.geom.h * 100, 25).toFixed(0)} cm.</div>
    </div></div>
    <div class="grp"><h3>Refuerzos</h3><div class="bd"><div class="help">Los refuerzos locales (por ejemplo bajo columnas) se cargan en la pestaña <b>Refuerzos</b>: ${P.ref.length} zona(s) definidas.</div>
    <button onclick="APP.tab('ref')">Ir a Refuerzos</button></div></div>
    ${R ? `<div class="grp"><h3>Resultado de flexión</h3><div class="bd"><table class="t wide"><tr><th>Capa</th><th>As nec. máx</th><th>Util. máx</th></tr>
      ${['xb', 'yb', 'xt', 'yt'].map(k => `<tr><td>${R.flex[k].capa === 'inf' ? 'Inf.' : 'Sup.'} ${R.flex[k].dir.toUpperCase()}</td><td>${R.flex[k].asMax.toFixed(2)} cm²/m</td><td class="${R.flex[k].ok ? 'ok' : 'no'}">${R.flex[k].u.toFixed(2)}</td></tr>`).join('')}</table></div></div>` : ''}`;
    el.querySelectorAll('[data-a]').forEach(inp => inp.addEventListener('change', () => {
      const [c, d, k] = inp.dataset.a.split('.');
      const v = parseFloat(inp.value); if (isNaN(v) || v <= 0) return;
      P.arm[c][d][k] = v; cambio(); renderArm();
    }));
  }

  /* ------------------------- Columnas ------------------------- */
  const CK = ['N', 'Vx', 'Vy', 'Mx', 'My', 'Mz'];
  function renderCols() {
    const t = $('tCols');
    let h = `<tr><th rowspan="2">#</th><th rowspan="2">Id</th><th rowspan="2">x [m]</th><th rowspan="2">y [m]</th><th rowspan="2">bx [m]</th><th rowspan="2">by [m]</th>
      <th colspan="6" class="gs">Cargas de SERVICIO [kN, kNm]</th><th colspan="6" class="gu">Cargas ÚLTIMAS [kN, kNm]</th><th rowspan="2"></th></tr><tr>`;
    for (const g of ['gs', 'gu']) for (const k of CK) h += `<th class="${g}">${k}</th>`;
    h += '</tr>';
    P.cols.forEach((c, i) => {
      h += `<tr data-i="${i}" class="${V.sel === i ? 'sel' : ''}"><td>${i + 1}</td><td><input class="id" data-k="id" value="${c.id}"></td>`;
      for (const k of ['x', 'y', 'bx', 'by']) h += `<td><input type="number" step="any" data-k="${k}" value="${c[k]}"></td>`;
      for (const g of ['s', 'u']) for (const k of CK) h += `<td><input type="number" step="any" data-k="${g}.${k}" value="${c[g][k]}"></td>`;
      h += `<td><button data-del="${i}" title="Eliminar">✕</button></td></tr>`;
    });
    const sum = g => CK.map(k => P.cols.reduce((a, c) => a + (+c[g][k] || 0), 0));
    h += `<tr><td colspan="6" style="text-align:right"><b>Σ</b></td>${[...sum('s'), ...sum('u')].map(v => `<td><b>${v.toFixed(0)}</b></td>`).join('')}<td></td></tr>`;
    t.innerHTML = h;
    t.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
      const i = +inp.closest('tr').dataset.i, k = inp.dataset.k, c = P.cols[i];
      if (k === 'id') c.id = inp.value;
      else { const v = parseFloat(inp.value); if (isNaN(v)) return; if (k.includes('.')) { const [g, kk] = k.split('.'); c[g][kk] = v; } else c[k] = v; }
      cambio(); renderCols();
    }));
    t.querySelectorAll('tr[data-i]').forEach(tr => tr.addEventListener('click', () => { V.sel = +tr.dataset.i; t.querySelectorAll('tr').forEach(r => r.classList.toggle('sel', r === tr)); }));
    t.querySelectorAll('[data-del]').forEach(b => b.onclick = (e) => { e.stopPropagation(); P.cols.splice(+b.dataset.del, 1); cambio(); renderCols(); });
    const fuera = P.cols.filter(c => c.x < 0 || c.y < 0 || c.x > P.geom.Lx || c.y > P.geom.Ly);
    $('cInfo').innerHTML = `${P.cols.length} columnas` + (fuera.length ? ` · <span class="no">fuera de la platea: ${fuera.map(c => c.id).join(', ')}</span>` : '');
  }
  function modal(html, onOk) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box">${html}<div class="acts"><button data-x>Cancelar</button><button class="prim" data-ok>Aceptar</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('[data-x]').onclick = () => m.remove();
    m.querySelector('[data-ok]').onclick = () => { if (onOk(m) !== false) m.remove(); };
    return m;
  }
  function grilla() {
    modal(`<h3>Generar grilla de columnas</h3>
      <div class="fld"><label>Primera columna x₀</label><input id="g_x0" type="number" value="1"><span class="u">m</span></div>
      <div class="fld"><label>Cantidad en X</label><input id="g_nx" type="number" value="3"><span class="u"></span></div>
      <div class="fld"><label>Separación en X</label><input id="g_sx" type="number" value="5"><span class="u">m</span></div>
      <div class="fld"><label>Primera columna y₀</label><input id="g_y0" type="number" value="1"><span class="u">m</span></div>
      <div class="fld"><label>Cantidad en Y</label><input id="g_ny" type="number" value="4"><span class="u"></span></div>
      <div class="fld"><label>Separación en Y</label><input id="g_sy" type="number" value="5"><span class="u">m</span></div>
      <div class="fld"><label>Sección bx × by</label><input id="g_b" type="text" value="0.40x0.40"><span class="u">m</span></div>
      <div class="fld"><label>N servicio</label><input id="g_n" type="number" value="1000"><span class="u">kN</span></div>
      <div class="fld"><label>Factor N última / N servicio</label><input id="g_f" type="number" value="1.4"><span class="u"></span></div>
      <label><input type="checkbox" id="g_rep" checked> Reemplazar columnas existentes</label>
      <label style="display:block"><input type="checkbox" id="g_aj" checked> Ajustar Lx, Ly con voladizo igual a x₀, y₀</label>`, m => {
      const g = id => parseFloat(m.querySelector('#' + id).value);
      const [bx, by] = m.querySelector('#g_b').value.toLowerCase().split(/[x×*]/).map(parseFloat);
      const nx = Math.max(1, g('g_nx') | 0), ny = Math.max(1, g('g_ny') | 0), N = g('g_n'), fa = g('g_f');
      if (m.querySelector('#g_rep').checked) P.cols = [];
      let k = P.cols.length + 1;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
        P.cols.push({ id: 'C' + k++, x: +(g('g_x0') + i * g('g_sx')).toFixed(3), y: +(g('g_y0') + j * g('g_sy')).toFixed(3), bx: bx || 0.4, by: by || bx || 0.4, s: { N, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 }, u: { N: +(N * fa).toFixed(1), Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 } });
      if (m.querySelector('#g_aj').checked) { P.geom.Lx = +(2 * g('g_x0') + (nx - 1) * g('g_sx')).toFixed(3); P.geom.Ly = +(2 * g('g_y0') + (ny - 1) * g('g_sy')).toFixed(3); renderForm('pGen'); }
      cambio(); renderCols();
    });
  }
  function pegar() {
    modal(`<h3>Pegar columnas desde Excel</h3>
      <div class="help">Copie desde Excel filas con las columnas en este orden (separadas por tabulación; decimales con punto o coma):<br>
      <b>Id, x, y, bx, by, Ns, Vxs, Vys, Mxs, Mys, Mzs, Nu, Vxu, Vyu, Mxu, Myu, Mzu</b><br>Si faltan las cargas últimas se calculan con el factor indicado en la barra (Últimas = k × servicio).</div>
      <textarea id="pt" rows="12" placeholder="C1	1	1	0.4	0.4	900	15	10	20	15	0	1260	21	14	28	21	0"></textarea>
      <label><input type="checkbox" id="prep" checked> Reemplazar columnas existentes</label>`, m => {
      const fa = parseFloat($('cFac').value) || 1.4;
      const rows = m.querySelector('#pt').value.trim().split(/\r?\n/).map(l => l.split(/\t|;/).map(s => s.trim()));
      const num = s => parseFloat(String(s ?? '').replace(',', '.'));
      const nuevos = [];
      for (const r of rows) {
        if (r.length < 6 || isNaN(num(r[1]))) continue;
        const v = r.map(num);
        const s = { N: v[5] || 0, Vx: v[6] || 0, Vy: v[7] || 0, Mx: v[8] || 0, My: v[9] || 0, Mz: v[10] || 0 };
        const u = r.length >= 12 ? { N: v[11] || 0, Vx: v[12] || 0, Vy: v[13] || 0, Mx: v[14] || 0, My: v[15] || 0, Mz: v[16] || 0 } : Object.fromEntries(CK.map(k => [k, +(s[k] * fa).toFixed(2)]));
        nuevos.push({ id: r[0] || 'C' + (nuevos.length + 1), x: v[1], y: v[2], bx: v[3] || 0.4, by: v[4] || 0.4, s, u });
      }
      if (!nuevos.length) { alert('No se reconocieron filas válidas.'); return false; }
      P.cols = m.querySelector('#prep').checked ? nuevos : P.cols.concat(nuevos);
      cambio(); renderCols();
    });
  }

  /* ------------------------- Refuerzos ------------------------- */
  function renderRef() {
    const t = $('tRef');
    const opt = (arr, v) => arr.map(x => `<option ${String(x) === String(v) ? 'selected' : ''}>${x}</option>`).join('');
    let h = `<tr><th>Id</th><th>Capa</th><th>Dir.</th><th>x₁</th><th>x₂</th><th>y₁</th><th>y₂</th><th>Ø</th><th>c/ [cm]</th><th>As [cm²/m]</th><th></th></tr>`;
    P.ref.forEach((r, i) => {
      h += `<tr data-i="${i}"><td><input class="id" data-k="id" value="${r.id}">${r.auto ? ' <span class="chip auto">auto</span>' : ''}</td>
        <td><select data-k="capa" style="width:56px">${opt(['inf', 'sup'], r.capa)}</select></td><td><select data-k="dir" style="width:44px">${opt(['x', 'y'], r.dir)}</select></td>
        ${['x1', 'x2', 'y1', 'y2'].map(k => `<td><input type="number" step="0.05" data-k="${k}" value="${r[k]}" style="width:58px"></td>`).join('')}
        <td><select data-k="d" style="width:50px">${opt(DIS.DIAMS, r.d)}</select></td><td><input type="number" step="0.5" data-k="s" value="${r.s}" style="width:48px"></td>
        <td>${DIS.asm(r.d, r.s).toFixed(2)}</td><td><button data-del="${i}">✕</button></td></tr>`;
    });
    if (!P.ref.length) h += `<tr><td colspan="11" class="help" style="padding:12px">Sin refuerzos. Use “Sugerir refuerzos automáticos” o agregue zonas manualmente.</td></tr>`;
    t.innerHTML = h;
    t.querySelectorAll('input,select').forEach(inp => inp.addEventListener('change', () => {
      const r = P.ref[+inp.closest('tr').dataset.i], k = inp.dataset.k;
      if (['id', 'capa', 'dir'].includes(k)) r[k] = inp.value; else { const v = parseFloat(inp.value); if (isNaN(v)) return; r[k] = v; }
      if (r.x1 > r.x2) [r.x1, r.x2] = [r.x2, r.x1];
      if (r.y1 > r.y2) [r.y1, r.y2] = [r.y2, r.y1];
      r.auto = false; cambio(); renderRef();
    }));
    t.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { P.ref.splice(+b.dataset.del, 1); cambio(); renderRef(); });
    dibujarRef();
  }
  const nextRefId = () => { let k = 1; while (P.ref.some(r => r.id === 'R' + k)) k++; return 'R' + k; };
  function refCol() {
    modal(`<h3>Refuerzo bajo columna</h3>
      <div class="fld"><label>Columna</label><select id="rc_c">${P.cols.map((c, i) => `<option value="${i}" ${i === V.sel ? 'selected' : ''}>${c.id} (${c.x}; ${c.y})</option>`).join('')}</select><span></span></div>
      <div class="fld"><label>Prolongación desde la cara</label><input id="rc_e" type="number" step="0.05" value="1.20"><span class="u">m</span></div>
      <div class="fld"><label>Capa</label><select id="rc_k"><option value="inf">Inferior</option><option value="sup">Superior</option></select><span></span></div>
      <div class="fld"><label>Diámetro</label><select id="rc_d">${DIS.DIAMS.map(d => `<option ${d === 12 ? 'selected' : ''}>${d}</option>`).join('')}</select><span class="u">mm</span></div>
      <div class="fld"><label>Separación</label><input id="rc_s" type="number" value="${P.arm.inf.x.s}"><span class="u">cm</span></div>
      <label><input type="checkbox" id="rc_x" checked> Dirección X</label> &nbsp; <label><input type="checkbox" id="rc_y" checked> Dirección Y</label>
      <div class="help">Crea una zona cuadrada centrada en la columna. Tip: aplicar a todas las columnas iguales con el botón “a todas”.</div>
      <label style="display:block;margin-top:6px"><input type="checkbox" id="rc_all"> Aplicar a todas las columnas</label>`, m => {
      const q = id => m.querySelector('#' + id);
      const e = parseFloat(q('rc_e').value), lst = q('rc_all').checked ? P.cols : [P.cols[+q('rc_c').value]];
      const r5 = v => Math.round(v * 100) / 100;
      for (const c of lst) for (const dir of ['x', 'y']) {
        if (!q('rc_' + dir).checked) continue;
        P.ref.push({ id: nextRefId(), capa: q('rc_k').value, dir, d: +q('rc_d').value, s: +q('rc_s').value,
          x1: r5(Math.max(P.mat.rec, c.x - c.bx / 2 - e)), x2: r5(Math.min(P.geom.Lx - P.mat.rec, c.x + c.bx / 2 + e)),
          y1: r5(Math.max(P.mat.rec, c.y - c.by / 2 - e)), y2: r5(Math.min(P.geom.Ly - P.mat.rec, c.y + c.by / 2 + e)) });
      }
      cambio(); renderRef();
    });
  }

  /* ------------------------- Cálculo ------------------------- */
  function cambio() {
    dirty = true; guardarLocal(); estado();
    if ($('auto').checked) { clearTimeout(timer); timer = setTimeout(calcular, 700); }
    else redibujar();
  }
  function calcular() {
    clearTimeout(timer);
    try {
      if (!P.cols.length) throw new Error('Cargue al menos una columna.');
      if (!(P.geom.Lx > 0 && P.geom.Ly > 0 && P.geom.h > 0 && P.geom.malla > 0)) throw new Error('Revise la geometría (valores positivos).');
      R = DIS.calcular(P); dirty = false;
    } catch (e) { R = null; dirty = true; estado(e.message); redibujar(); return; }
    estado(); renderArm(); redibujar();
  }
  function estado(err) {
    const e = $('fEst');
    if (err) { e.textContent = '⚠ ' + err; e.className = 'est no'; $('fInfo').textContent = ''; return; }
    if (!R) { e.textContent = 'Sin calcular'; e.className = 'est'; return; }
    if (dirty) { e.textContent = 'Datos modificados — recalculando…'; e.className = 'est'; return; }
    e.textContent = R.okGlobal ? '✔ La platea VERIFICA' : '✖ La platea NO VERIFICA (ver Resultados)';
    e.className = 'est ' + (R.okGlobal ? 'ok' : 'no');
    $('fInfo').textContent = `${R.m.nn} nodos · ${R.m.els.length} elementos · ${R.ms.toFixed(0)} ms · q máx ${(R.suelo.qmax / DIS.KGCM2).toFixed(2)} kg/cm² · s máx ${(R.aseg.wmax * 1000).toFixed(1)} mm`;
  }

  /* ------------------------- Vistas ------------------------- */
  function opcionesCampo() {
    const grupos = {};
    for (const [k, c] of Object.entries(VIS.CAMPOS)) (grupos[c.g || ''] = grupos[c.g || ''] || []).push([k, c]);
    let h = '';
    for (const [g, l] of Object.entries(grupos)) {
      const o = l.map(([k, c]) => `<option value="${k}">${c.t}${c.u ? ' [' + c.u + ']' : ''}</option>`).join('');
      h += g ? `<optgroup label="${g}">${o}</optgroup>` : o;
    }
    document.querySelectorAll('.selCampo').forEach(s => { s.innerHTML = h; s.value = V.campo; s.onchange = () => { V.campo = s.value; document.querySelectorAll('.selCampo').forEach(t => t.value = V.campo); redibujar(); }; });
  }
  function redibujar() {
    const t = V.main;
    if (t === 'planta') V.T = VIS.planta($('cvPlanta'), P, R, { campo: R ? V.campo : 'none', bandas: $('pBand').checked, malla: $('pMalla').checked, refs: $('pRefs').checked, punz: $('pPunz').checked, cortes: $('pCort').checked ? P.cortes : null, sel: V.sel });
    else if (t === 'axo') VIS.axo($('cvAxo'), P, R, { campo: R ? V.campo : 'none', az: V.az, el: V.el, zoom: V.zoom, panx: V.panx, pany: V.pany, exag: +$('aExag').value, malla: $('aMalla').checked, sel: V.sel, bandas: true });
    else if (t === 'cortes') { opcCortes(); VIS.cortes($('cvCorte'), P, R, { dir: V.cdir, pos: V.cdir === 'x' ? P.cortes.y : P.cortes.x }); }
    else if (t === 'ref') dibujarRef();
    else if (t === 'res') renderRes();
    else if (t === 'plan') renderPlan();
    else if (t === 'cols') renderCols();
  }
  function dibujarRef() {
    if (V.main !== 'ref') return;
    V.Tref = VIS.planta($('cvRef'), P, R, { campo: R ? $('rCampo').value : 'none', bandas: false, refs: true, cotas: false, titulo: R ? VIS.CAMPOS[$('rCampo').value].t + ' — zonas de refuerzo' : 'Zonas de refuerzo' });
  }
  function opcCortes() {
    const xs = [...new Set(P.cols.map(c => c.x))].sort((a, b) => a - b), ys = [...new Set(P.cols.map(c => c.y))].sort((a, b) => a - b);
    $('kY').value = P.cortes.y; $('kX').value = P.cortes.x;
    $('kYs').innerHTML = '<option value="">por fila de columnas…</option>' + ys.map(y => `<option value="${y}">y = ${y} (${P.cols.filter(c => c.y === y).map(c => c.id).join(', ')})</option>`).join('');
    $('kXs').innerHTML = '<option value="">por fila de columnas…</option>' + xs.map(x => `<option value="${x}">x = ${x} (${P.cols.filter(c => c.x === x).map(c => c.id).join(', ')})</option>`).join('');
  }

  const fx = (v, d = 2) => (v === undefined || isNaN(v)) ? '—' : !isFinite(v) ? '∞' : v.toFixed(d);
  const barra = r => { const c = r > 1 ? '#d0342c' : r > 0.85 ? '#f0a020' : '#2ea05a'; return `<div class="bar"><i style="width:${Math.min(100, r * 100)}%;background:${c}"></i></div>`; };
  function renderRes() {
    const el = $('vRes');
    if (!R) { el.innerHTML = '<div class="card">Sin resultados. Presione <b>Calcular</b>.</div>'; return; }
    const K = DIS.KGCM2;
    el.innerHTML = `
    <div class="banner ${R.okGlobal ? 'ok' : 'no'}">${R.okGlobal ? '✔ La platea verifica todas las condiciones' : '✖ La platea no verifica: revise los ítems en rojo'}</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Presión máx. suelo (servicio)</div><div class="v">${(R.suelo.qmax / K).toFixed(2)} <small>kg/cm²</small></div><div class="l">admisible ${P.suelo.sadm} kg/cm²</div></div>
      <div class="kpi"><div class="l">Presión media</div><div class="v">${(R.suelo.qmed / K).toFixed(2)} <small>kg/cm²</small></div><div class="l">contacto ${(R.rs.contacto * 100).toFixed(0)} % del área</div></div>
      <div class="kpi"><div class="l">Asentamiento máximo</div><div class="v">${(R.aseg.wmax * 1000).toFixed(1)} <small>mm</small></div><div class="l">distorsión 1/${R.aseg.dist.val > 0 ? Math.round(1 / R.aseg.dist.val) : '∞'}</div></div>
      <div class="kpi"><div class="l">Utilización máx. flexión</div><div class="v">${Math.max(...Object.values(R.flex).map(f => f.u)).toFixed(2)}</div><div class="l">Mu/φMn con refuerzos</div></div>
      <div class="kpi"><div class="l">Punzonado máx.</div><div class="v">${Math.max(...R.punz.map(p => p.ratio)).toFixed(2)}</div><div class="l">vu/φvc</div></div>
      <div class="kpi"><div class="l">Acero total</div><div class="v">${R.plan.total.toFixed(0)} <small>kg</small></div><div class="l">${(R.plan.total / (P.geom.Lx * P.geom.Ly * P.geom.h)).toFixed(1)} kg/m³ · H° ${(P.geom.Lx * P.geom.Ly * P.geom.h).toFixed(1)} m³</div></div>
    </div>
    <div class="card"><h3 style="margin-top:0">Resumen de verificaciones</h3>
      <table class="t wide"><tr><th style="text-align:left">Verificación</th><th>Valor</th><th>Relación</th><th></th><th>Estado</th></tr>
      ${R.resumen.map(r => `<tr><td style="text-align:left">${r.t}</td><td>${r.v}</td><td>${fx(r.r)}</td><td>${barra(r.r)}</td><td class="${r.ok ? 'ok' : 'no'}">${r.ok ? 'VERIFICA' : 'NO VERIFICA'}</td></tr>`).join('')}</table></div>
    <div class="card"><h3 style="margin-top:0">Flexión por capa (Wood-Armer, CIRSOC 201)</h3>
      <table class="t wide"><tr><th>Capa</th><th>Malla base</th><th>As base [cm²/m]</th><th>d [cm]</th><th>Mu* máx [kNm/m]</th><th>As nec. máx [cm²/m]</th><th>Util. máx</th><th>Ubicación (x; y)</th><th>Nodos que fallan</th></tr>
      ${['xb', 'yb', 'xt', 'yt'].map(k => { const f = R.flex[k]; return `<tr><td><span class="chip ${f.capa}">${f.capa === 'inf' ? 'Inferior' : 'Superior'} ${f.dir.toUpperCase()}</span></td><td>Ø${f.barra.d} c/${f.barra.s}</td><td>${f.base.toFixed(2)}</td><td>${(f.d * 100).toFixed(1)}</td><td>${f.MuR.toFixed(1)}</td><td>${fx(f.asMax)}</td><td class="${f.ok ? 'ok' : 'no'}">${f.u.toFixed(2)}</td><td>${f.x.toFixed(2)}; ${f.y.toFixed(2)}</td><td>${f.fail}</td></tr>`; }).join('')}</table>
      ${Object.values(R.flex).some(f => !f.ok) ? '<p class="help">➜ Use <b>Refuerzos → Sugerir refuerzos automáticos</b> para agregar barras donde falta armadura, o aumente la malla base.</p>' : ''}</div>
    <div class="card"><h3 style="margin-top:0">Punzonado por columna (CIRSOC 201-2005 §11.12)</h3>
      <table class="t wide"><tr><th>Col.</th><th>Tipo</th><th>Nu [kN]</th><th>d [cm]</th><th>b₀ [m]</th><th>Vu [kN]</th><th>vu [MPa]</th><th>φvc [MPa]</th><th>vu/φvc</th><th></th><th>Estado</th></tr>
      ${R.punz.map(p => `<tr><td>${p.c.id}</td><td>${p.tipo || '—'}</td><td>${p.c.u.N.toFixed(0)}</td><td>${(p.d * 100).toFixed(1)}</td><td>${fx(p.b0)}</td><td>${fx(p.Vu, 0)}</td><td>${fx(p.vu, 3)}</td><td>${fx(p.phivc, 3)}</td><td>${fx(p.ratio)}</td><td>${barra(p.ratio)}</td><td class="${p.ok ? 'ok' : 'no'}">${p.ok ? 'VERIFICA' : 'NO' + (p.hReq ? ` (h ≈ ${(p.hReq * 100).toFixed(0)} cm)` : '')}</td></tr>`).join('')}</table></div>
    <div class="card"><h3 style="margin-top:0">Columnas: asentamiento y presión bajo cada columna (servicio)</h3>
      <table class="t wide"><tr><th>Col.</th><th>x; y</th><th>N servicio [kN]</th><th>Asentamiento [mm]</th><th>Presión [kN/m²]</th><th>Presión [kg/cm²]</th></tr>
      ${P.cols.map((c, i) => `<tr><td>${c.id}</td><td>${c.x}; ${c.y}</td><td>${c.s.N}</td><td>${(R.aseg.wcol[i] * 1000).toFixed(2)}</td><td>${R.aseg.qcol[i].toFixed(1)}</td><td>${(R.aseg.qcol[i] / K).toFixed(2)}</td></tr>`).join('')}</table></div>
    <div class="card"><h3 style="margin-top:0">Suelo y modelo</h3>
      <table class="t"><tr><td style="text-align:left">Capacidad portante qult (Brinch Hansen)</td><td>${R.port.qult.toFixed(0)} kN/m² → qadm = ${(R.port.qadm / K).toFixed(2)} kg/cm² (FS ${P.suelo.FS})</td></tr>
      <tr><td style="text-align:left">Resultante de cargas (servicio)</td><td>N = ${R.suelo.Ntot.toFixed(0)} kN en (${R.suelo.xR.toFixed(2)}; ${R.suelo.yR.toFixed(2)}) · ex = ${R.suelo.ex.toFixed(3)} m, ey = ${R.suelo.ey.toFixed(3)} m</td></tr>
      <tr><td style="text-align:left">Equilibrio FEM (servicio)</td><td>Cargas ${R.rs.Ftot.toFixed(1)} kN = Reacción ${R.rs.R.toFixed(1)} kN</td></tr>
      <tr><td style="text-align:left">Longitud elástica Le = 1/λ</td><td>${R.rig.Le.toFixed(2)} m → platea ${R.rig.lmax <= R.rig.lim ? 'rígida' : 'flexible'} (luz máx ${R.rig.lmax.toFixed(2)} m vs 1,75/λ = ${R.rig.lim.toFixed(2)} m)</td></tr>
      <tr><td style="text-align:left">Deslizamiento</td><td>H = ${R.desl.H.toFixed(1)} kN · μN = ${R.desl.Rd.toFixed(0)} kN · FS = ${fx(R.desl.FS)} · Torsión Mz = ${R.desl.Mz.toFixed(1)} kNm, FS = ${fx(R.desl.FSt)}</td></tr></table></div>`;
  }
  function renderPlan() {
    const el = $('vPlan');
    const pl = DIS.planilla(P);
    const ds = Object.keys(pl.porD).sort((a, b) => a - b);
    const vol = P.geom.Lx * P.geom.Ly * P.geom.h;
    const forma = p => {
      const w = 120, hh = 26;
      if (p.pata > 0) { const up = p.capa === 'inf'; return `<svg width="${w}" height="${hh}"><polyline points="${up ? `6,4 6,20 ${w - 6},20 ${w - 6},4` : `6,22 6,6 ${w - 6},6 ${w - 6},22`}" fill="none" stroke="${p.capa === 'inf' ? '#1d6fd8' : '#d0342c'}" stroke-width="2.5"/></svg>`; }
      return `<svg width="${w}" height="${hh}"><line x1="6" y1="13" x2="${w - 6}" y2="13" stroke="${p.capa === 'inf' ? '#1d6fd8' : '#d0342c'}" stroke-width="2.5"/></svg>`;
    };
    el.innerHTML = `<div class="card"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><h3 style="margin:0;flex:1">Planilla de doblado</h3>
      <button id="bCsv">Exportar CSV (Excel)</button><button onclick="APP.dxf()">Planos DXF</button></div>
      <table class="t wide"><tr><th>Pos.</th><th style="text-align:left">Descripción</th><th>Forma</th><th>Ø [mm]</th><th>c/ [cm]</th><th>Cant.</th><th>Tramo recto [m]</th><th>Patas [m]</th><th>Empalmes</th><th>L. unitaria [m]</th><th>L. total [m]</th><th>Peso [kg]</th></tr>
      ${pl.pos.map(p => `<tr><td><b>P${p.pos}</b></td><td style="text-align:left">${p.desc}</td><td>${forma(p)}</td><td>${p.d}</td><td>${p.s}</td><td>${p.n}</td><td>${p.Lr.toFixed(2)}</td><td>${p.pata ? '2 × ' + p.pata.toFixed(2) : '—'}</td><td>${p.nEmp ? p.nEmp + ' × ' + p.lap.toFixed(2) + ' m' : '—'}</td><td>${p.Lb.toFixed(2)}</td><td>${p.Lt.toFixed(1)}</td><td>${p.kg.toFixed(1)}</td></tr>`).join('')}
      </table>
      <table class="t" style="margin-top:10px"><tr><th>Diámetro</th>${ds.map(d => `<th>Ø${d}</th>`).join('')}<th>TOTAL</th></tr>
      <tr><td>Peso [kg]</td>${ds.map(d => `<td>${pl.porD[d].toFixed(1)}</td>`).join('')}<td><b>${pl.total.toFixed(1)}</b></td></tr></table>
      <p class="help">Hormigón: ${vol.toFixed(2)} m³ · cuantía ${(pl.total / vol).toFixed(1)} kg/m³. Barras comerciales de 12 m; empalmes por yuxtaposición clase B (1,3·ld). Patas de la malla base = h − 2·rec = ${pl.pata.toFixed(2)} m. Pesos sin desperdicio.</p></div>`;
    $('bCsv').onclick = () => {
      const rows = [['Pos', 'Descripcion', 'Diam mm', 'Sep cm', 'Cant', 'Tramo recto m', 'Pata m', 'Empalmes', 'L unit m', 'L total m', 'Peso kg']]
        .concat(pl.pos.map(p => [`P${p.pos}`, p.desc, p.d, p.s, p.n, p.Lr.toFixed(2), p.pata.toFixed(2), p.nEmp, p.Lb.toFixed(2), p.Lt.toFixed(2), p.kg.toFixed(2)]));
      descargar((P.proyecto.nombre || 'platea') + ' - planilla de doblado.csv', '﻿' + rows.map(r => r.map(v => String(v).replace('.', ',')).join(';')).join('\r\n'), 'text/csv');
    };
  }

  /* ------------------------- Interacción canvas ------------------------- */
  function tooltipPlanta(cv, getT, e) {
    const tip = $('tip');
    const T = getT();
    if (!T || !R) { tip.style.display = 'none'; return; }
    const rc = cv.getBoundingClientRect();
    const [x, y] = T.inv(e.clientX - rc.left, e.clientY - rc.top);
    if (x < 0 || y < 0 || x > P.geom.Lx || y > P.geom.Ly) { tip.style.display = 'none'; return; }
    const g = f => FEM.interp(R.m, f, x, y);
    const c = VIS.CAMPOS[V.campo];
    tip.innerHTML = `<b>x = ${x.toFixed(2)} m, y = ${y.toFixed(2)} m</b><br>
      ${c && c.f ? `<b>${c.t}: ${g(c.f(R)).toFixed(2)} ${c.u}</b><br>` : ''}
      Asentamiento: ${g(R.D.wmm).toFixed(2)} mm · q: ${g(R.rs.q).toFixed(1)} kN/m²<br>
      Mx = ${g(R.ru.mx).toFixed(1)} · My = ${g(R.ru.my).toFixed(1)} · Mxy = ${g(R.ru.mxy).toFixed(1)} kNm/m<br>
      As prov. inf X/Y: ${DIS.asProv(P, x, y, 'inf', 'x').toFixed(2)} / ${DIS.asProv(P, x, y, 'inf', 'y').toFixed(2)} cm²/m<br>
      As prov. sup X/Y: ${DIS.asProv(P, x, y, 'sup', 'x').toFixed(2)} / ${DIS.asProv(P, x, y, 'sup', 'y').toFixed(2)} cm²/m`;
    tip.style.display = 'block';
    tip.style.left = Math.min(window.innerWidth - 290, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
  }
  function eventosCanvas() {
    const cp = $('cvPlanta');
    cp.addEventListener('mousemove', e => tooltipPlanta(cp, () => V.T, e));
    cp.addEventListener('mouseleave', () => $('tip').style.display = 'none');
    cp.addEventListener('click', e => {
      if (!V.T) return;
      const rc = cp.getBoundingClientRect(); const [x, y] = V.T.inv(e.clientX - rc.left, e.clientY - rc.top);
      const i = P.cols.findIndex(c => Math.abs(x - c.x) <= c.bx / 2 + 0.15 && Math.abs(y - c.y) <= c.by / 2 + 0.15);
      V.sel = i; redibujar();
    });
    const cr = $('cvRef');
    cr.addEventListener('mousemove', e => tooltipPlanta(cr, () => V.Tref, e));
    cr.addEventListener('mouseleave', () => $('tip').style.display = 'none');
    const ca = $('cvAxo'); let drag = null;
    ca.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; });
    ca.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mouseup', () => drag = null);
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) { V.panx += dx; V.pany += dy; } else { V.az -= dx * 0.4; V.el = Math.max(-5, Math.min(90, V.el + dy * 0.3)); }
      redibujar();
    });
    ca.addEventListener('wheel', e => { e.preventDefault(); V.zoom = Math.max(0.3, Math.min(6, V.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); redibujar(); }, { passive: false });
    document.querySelectorAll('#vAxo [data-v]').forEach(b => b.onclick = () => {
      const v = { iso: [-35, 32], top: [0, 90], fr: [0, 4], lat: [-90, 4] }[b.dataset.v];
      V.az = v[0]; V.el = v[1]; V.zoom = 1; V.panx = V.pany = 0; redibujar();
    });
  }

  /* ------------------------- Archivos ------------------------- */
  function descargar(nombre, contenido, tipo) {
    const b = new Blob([contenido], { type: tipo || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nombre.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function asegurarCalculo() {
    if (!R || dirty) calcular();
    if (!R) { alert('No se pudo calcular. Revise los datos.'); return false; }
    return true;
  }
  function dxf() {
    if (!asegurarCalculo()) return;
    descargar((P.proyecto.nombre || 'platea') + '.dxf', DXFX.generar(P, R, P.cortes), 'application/dxf');
  }

  /* ------------------------- Pestañas ------------------------- */
  const SEC = { cols: 'vCols', planta: 'vPlanta', axo: 'vAxo', cortes: 'vCortes', ref: 'vRef', res: 'vRes', plan: 'vPlan' };
  function tab(t) {
    V.main = t;
    document.querySelectorAll('#tabsM button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    for (const [k, id] of Object.entries(SEC)) $(id).classList.toggle('hidden', k !== t);
    if (t === 'ref') renderRef();
    redibujar();
  }

  function refrescarTodo() {
    renderForm('pGen'); renderForm('pSuelo'); renderArm(); renderCols(); renderRef();
  }

  function init() {
    P = normalizar(cargarLocal() || ejemplo());
    opcionesCampo();
    refrescarTodo();
    document.querySelectorAll('#tabsL button').forEach(b => b.onclick = () => {
      document.querySelectorAll('#tabsL button').forEach(x => x.classList.toggle('on', x === b));
      ['gen', 'suelo', 'arm'].forEach(k => $('p' + k[0].toUpperCase() + k.slice(1)).classList.toggle('hidden', k !== b.dataset.t));
    });
    document.querySelectorAll('#tabsM button').forEach(b => b.onclick = () => tab(b.dataset.t));
    $('bCalc').onclick = calcular;
    $('bEj').onclick = () => { if (confirm('¿Cargar el ejemplo? Se reemplazan los datos actuales (guárdelos antes si los necesita).')) { P = ejemplo(); R = null; refrescarTodo(); cambio(); calcular(); } };
    $('bNuevo').onclick = () => { if (confirm('¿Comenzar un proyecto nuevo? Se reemplazan los datos actuales.')) { P = nuevo(); R = null; refrescarTodo(); cambio(); calcular(); } };
    $('bGuardar').onclick = () => descargar((P.proyecto.nombre || 'platea') + '.json', JSON.stringify(P, null, 1), 'application/json');
    $('bAbrir').onclick = () => $('fAbrir').click();
    $('fAbrir').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { try { P = normalizar(JSON.parse(t)); R = null; refrescarTodo(); cambio(); calcular(); } catch (er) { alert('Archivo inválido: ' + er.message); } });
      e.target.value = '';
    };
    $('bDxf').onclick = dxf;
    $('bMem').onclick = () => { if (asegurarCalculo()) MEM.abrir(P, R, P.cortes); };
    $('bWord').onclick = memoriaWord;
    $('cAdd').onclick = () => { const k = P.cols.length + 1; P.cols.push({ id: 'C' + k, x: P.geom.Lx / 2, y: P.geom.Ly / 2, bx: 0.4, by: 0.4, s: { N: 500, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 }, u: { N: 700, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 } }); cambio(); renderCols(); };
    $('cGrid').onclick = grilla;
    $('cPaste').onclick = pegar;
    $('cFacB').onclick = () => { const f = parseFloat($('cFac').value); if (!(f > 0)) return; for (const c of P.cols) for (const k of CK) c.u[k] = +(c.s[k] * f).toFixed(2); cambio(); renderCols(); };
    $('rAdd').onclick = () => { P.ref.push({ id: nextRefId(), capa: 'inf', dir: 'x', d: 12, s: P.arm.inf.x.s, x1: 1, x2: 3, y1: 1, y2: 3 }); cambio(); renderRef(); };
    $('rCol').onclick = refCol;
    $('rAuto').onclick = () => {
      if (!asegurarCalculo()) return;
      const antes = P.ref.length;
      P.ref = DIS.sugerirRefuerzos(P, R);
      calcular(); renderRef(); guardarLocal();
      const nAuto = P.ref.filter(r => r.auto).length;
      alert(nAuto ? `Se generaron ${nAuto} zona(s) de refuerzo automáticas.\nRevise las barras y zonas en la tabla; puede editarlas libremente.` : 'La armadura actual es suficiente: no se requieren refuerzos.');
    };
    $('rDelAuto').onclick = () => { P.ref = P.ref.filter(r => !r.auto); cambio(); renderRef(); };
    $('rCampo').onchange = dibujarRef;
    ['pBand', 'pMalla', 'pRefs', 'pPunz', 'pCort', 'aMalla'].forEach(id => $(id).onchange = redibujar);
    $('aExag').oninput = redibujar;
    document.querySelectorAll('input[name=cdir]').forEach(r => r.onchange = () => { V.cdir = r.value; redibujar(); });
    $('kY').onchange = () => { P.cortes.y = Math.max(0, Math.min(P.geom.Ly, parseFloat($('kY').value) || 0)); V.cdir = 'x'; document.querySelector('input[name=cdir][value=x]').checked = true; guardarLocal(); redibujar(); };
    $('kX').onchange = () => { P.cortes.x = Math.max(0, Math.min(P.geom.Lx, parseFloat($('kX').value) || 0)); V.cdir = 'y'; document.querySelector('input[name=cdir][value=y]').checked = true; guardarLocal(); redibujar(); };
    $('kYs').onchange = () => { if ($('kYs').value !== '') { $('kY').value = $('kYs').value; $('kY').onchange(); } };
    $('kXs').onchange = () => { if ($('kXs').value !== '') { $('kX').value = $('kXs').value; $('kX').onchange(); } };
    window.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') calcular(); });
    window.addEventListener('resize', () => redibujar());
    eventosCanvas();
    calcular();
    tab('planta');
  }
  function memoriaWord() {
    if (!asegurarCalculo()) return;
    descargar((P.proyecto.nombre || 'platea') + ' - memoria de calculo.doc', MEM.word(P, R, P.cortes), 'application/msword');
  }

  document.addEventListener('DOMContentLoaded', init);
  return { tab, dxf, memoriaWord, get P() { return P; }, get R() { return R; } };
})();
