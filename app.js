(function () {
  'use strict';

  // ---------- configuración ----------
  const CUENTAS = ['BANESCO EMPRESA', 'BANESCO PERSONAL', 'BANCARIBE EMPRESA', 'BANCARIBE PERSONAL', 'MERCANTIL EMPRESA', 'MERCANTIL PERSONAL', 'BANCA AMIGA EMPRESA', 'BANCA AMIGA PERSONAL', 'VENEZUELA EMPRESA'];
  const CATEGORIAS = [
    ['', '— Elegir —'],
    ['fijo', 'Gasto fijo'],
    ['extra', 'Gasto extra'],
    ['compra', 'Compra'],
    ['ingreso', 'Ingreso / venta'],
    ['comision', 'Comisión bancaria'],
    ['socio', 'Aporte / vale socio'],
    ['traspaso', 'Traspaso entre cuentas'],
    ['otro', 'Otro (no contar)'],
  ];
  const NOMBRE_CAT = Object.fromEntries(CATEGORIAS);
  const HOJA = { fijo: 'GASTOS FIJOS', extra: 'GASTOS EXTRAS', compra: 'COMPRAS' };
  const RE_COMISION = /(^|\s)com(\.|\s)|comisi[oó]n|^comis |emisi[oó]n edo|cobro por procesamiento|serv mtto pos|emisi[oó]n de estado de cuenta/i;
  const CLAVE = 'finmes-v1';

  // ---------- estado ----------
  let E = {
    mes: '', cuentasMap: {}, archivos: [], movs: [], clasif: {}, tasas: {}, reglas: [],
  };
  try { const g = JSON.parse(localStorage.getItem(CLAVE)); if (g && g.movs) E = Object.assign(E, g); } catch (e) { /* sin almacenamiento */ }
  let guardarPend = null;
  function guardar() {
    clearTimeout(guardarPend);
    guardarPend = setTimeout(() => { try { localStorage.setItem(CLAVE, JSON.stringify(E)); } catch (e) { toast('No se pudo guardar en el navegador. Use "Guardar respaldo".'); } }, 150);
  }

  // ---------- utilidades ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => n ? n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  const fmtFecha = (f) => f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : '';
  const opciones = (lista, sel) => lista.map(([v, t]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(t)}</option>`).join('');
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('ver'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('ver'), 2200); }

  const archivoDe = (clave) => E.archivos.find((a) => a.claveCuenta === clave);
  function cuentaDe(m) { return E.cuentasMap[m.claveCuenta] || ''; }

  // Categoría efectiva: manual > regla del usuario > comisión > ingreso
  function categoria(m) {
    const c = E.clasif[m.id];
    if (c && typeof c.cat === 'string') return { cat: c.cat, auto: false };
    const d = m.descripcion.toLowerCase();
    if (m.debito) {
      for (const r of E.reglas) if (r.texto && d.includes(r.texto.toLowerCase())) return { cat: r.cat, auto: true, regla: r };
    }
    if (RE_COMISION.test(m.descripcion) || comisionesPar().has(m.id)) return { cat: 'comision', auto: true };
    if (m.credito) return { cat: 'ingreso', auto: true };
    return { cat: '', auto: false };
  }

  // Banesco y otros cobran la comisión como otro débito con la misma referencia y descripción
  // (ej. "Banesco Pago Movil" -8.070,00 y luego -24,21, o +23.327,06 recibido y -349,91).
  // Un débito de hasta 2% del monto principal con la misma referencia se toma como comisión.
  let cacheComis = { n: -1, set: new Set() };
  function comisionesPar() {
    if (cacheComis.n === E.movs.length) return cacheComis.set;
    const grupos = {};
    for (const m of E.movs) if (m.referencia) (grupos[m.claveCuenta + '|' + m.referencia] ||= []).push(m);
    const set = new Set();
    for (const g of Object.values(grupos)) {
      if (g.length < 2) continue;
      const max = Math.max(...g.map((m) => m.debito || m.credito));
      for (const m of g) if (m.debito && m.debito <= max * 0.02) set.add(m.id);
    }
    cacheComis = { n: E.movs.length, set };
    return set;
  }

  function tasaDe(fecha) {
    if (E.tasas[fecha]) return E.tasas[fecha];
    const prev = Object.keys(E.tasas).filter((f) => f < fecha && E.tasas[f]).sort().pop();
    return prev ? E.tasas[prev] : 0;
  }

  // ---------- carga de archivos ----------
  async function cargar(files) {
    const avisos = [];
    let nuevos = 0, repetidos = 0;
    const existentes = new Set(E.movs.map((m) => m.id));
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const r = await Extractos.leerArchivo(file.name, buf);
        if (r.aviso) avisos.push(`<b>${esc(file.name)}:</b> ${esc(r.aviso)}`);
        if (!(r.claveCuenta in E.cuentasMap) && r.cuentaSugerida) E.cuentasMap[r.claveCuenta] = r.cuentaSugerida;
        const vistos = {};
        let n = 0;
        for (const m of r.movimientos) {
          const base = [r.claveCuenta, m.fecha, m.referencia, m.debito, m.credito, m.saldo, m.descripcion].join('|');
          vistos[base] = (vistos[base] || 0) + 1;
          const id = base + '|' + vistos[base];
          if (existentes.has(id)) { repetidos++; continue; }
          existentes.add(id);
          E.movs.push(Object.assign({ id, claveCuenta: r.claveCuenta, archivo: file.name }, m));
          n++;
        }
        nuevos += n;
        const prev = E.archivos.find((a) => a.claveCuenta === r.claveCuenta);
        if (prev) { prev.nombre = file.name; prev.formato = r.formato; prev.numeroCuenta = r.numeroCuenta || prev.numeroCuenta; }
        else E.archivos.push({ claveCuenta: r.claveCuenta, nombre: file.name, formato: r.formato, numeroCuenta: r.numeroCuenta || '' });
      } catch (err) {
        console.error(err);
        avisos.push(`<b>${esc(file.name)}:</b> ${esc(err.message)}`);
      }
    }
    if (!E.mes && E.movs.length) {
      const cuenta = {};
      for (const m of E.movs) cuenta[m.fecha.slice(0, 7)] = (cuenta[m.fecha.slice(0, 7)] || 0) + 1;
      const [y, mm] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][0].split('-');
      E.mes = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'][+mm - 1] + ' ' + y;
    }
    E.movs.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
    $('#avisos').innerHTML = avisos.map((a) => `<div class="aviso">${a}</div>`).join('');
    toast(`${nuevos} movimientos nuevos` + (repetidos ? `, ${repetidos} repetidos ignorados` : ''));
    guardar();
    render();
  }

  // ---------- render: cuentas ----------
  function renderCuentas() {
    if (!E.archivos.length) { $('#tablaCuentas').innerHTML = ''; return; }
    const filas = E.archivos.map((a) => {
      const ms = E.movs.filter((m) => m.claveCuenta === a.claveCuenta);
      const eg = ms.reduce((s, m) => s + m.debito, 0), ig = ms.reduce((s, m) => s + m.credito, 0);
      const pend = ms.filter((m) => !categoria(m).cat).length;
      const sel = E.cuentasMap[a.claveCuenta] || '';
      return `<tr>
        <td><select data-clave="${esc(a.claveCuenta)}" class="selCuenta ${sel ? '' : 'clasif vacio'}">${opciones([['', '¿Qué cuenta es?']].concat(CUENTAS.map((c) => [c, c])), sel)}</select></td>
        <td class="peq">${esc(a.nombre)}<br>${esc(a.formato)}${a.numeroCuenta ? ' · ' + esc(a.numeroCuenta) : ''}</td>
        <td class="num">${ms.length} mov.</td>
        <td class="num" style="color:var(--red)">${eg ? '−' + fmt(eg) : ''}</td>
        <td class="num" style="color:var(--ok)">${ig ? '+' + fmt(ig) : ''}</td>
        <td class="num">${!ms.length ? '' : pend ? `<span class="sin-cuenta">${pend} sin clasificar</span>` : '✓'}</td>
        <td><button class="x" data-quitar="${esc(a.claveCuenta)}" title="Quitar esta cuenta y sus movimientos">✕</button></td>
      </tr>`;
    });
    $('#tablaCuentas').innerHTML = `<tr><th>Cuenta</th><th>Archivo</th><th class="num">Movimientos</th><th class="num">Egresos Bs</th><th class="num">Ingresos Bs</th><th class="num">Estado</th><th></th></tr>` + filas.join('');
    const fc = $('#fCuenta'), v = fc.value;
    fc.innerHTML = '<option value="">Todas las cuentas</option>' + E.archivos.map((a) => `<option value="${esc(a.claveCuenta)}">${esc(E.cuentasMap[a.claveCuenta] || a.nombre)}</option>`).join('');
    fc.value = v;
  }

  // ---------- render: extractos ----------
  const F = { tipo: 'egreso', estado: 'todos' };
  function renderMovs() {
    const cuenta = $('#fCuenta').value, txt = $('#fTexto').value.trim().toLowerCase(), comis = $('#fComisiones').checked;
    const lista = E.movs.filter((m) => {
      if (F.tipo === 'egreso' && !m.debito) return false;
      if (F.tipo === 'ingreso' && !m.credito) return false;
      if (cuenta && m.claveCuenta !== cuenta) return false;
      const c = categoria(m);
      if (F.estado === 'pendiente' && c.cat) return false;
      if (!comis && c.cat === 'comision' && c.auto) return false;
      if (txt) {
        const h = (m.descripcion + ' ' + m.referencia + ' ' + fmt(m.debito) + ' ' + fmt(m.credito) + ' ' + (E.clasif[m.id] && E.clasif[m.id].beneficiario || '')).toLowerCase();
        if (!h.includes(txt)) return false;
      }
      return true;
    });
    $('#conteo').textContent = `${lista.length} movimientos`;
    if (!E.movs.length) { $('#tablaMovs').innerHTML = '<tr><td class="vacio-msg">Todavía no hay extractos cargados.</td></tr>'; return; }
    const MAX = 1500;
    const filas = lista.slice(0, MAX).map((m) => {
      const c = categoria(m);
      const clase = c.cat ? 'c-' + c.cat + (c.auto ? ' auto' : '') : 'vacio';
      const cta = cuentaDe(m);
      return `<tr class="${m.debito ? 'egreso' : 'ingreso'}">
        <td>${fmtFecha(m.fecha)}</td>
        <td class="peq">${cta ? esc(cta) : '<span class="sin-cuenta">¿cuenta?</span>'}</td>
        <td class="peq">${esc(m.referencia)}</td>
        <td class="desc">${esc(m.descripcion)}</td>
        <td class="num monto-e">${m.debito ? fmt(m.debito) : ''}</td>
        <td class="num monto-i">${m.credito ? fmt(m.credito) : ''}</td>
        <td><select class="clasif ${clase}" data-id="${esc(m.id)}" title="${c.auto ? 'Clasificado automáticamente' : ''}">${opciones(CATEGORIAS, c.cat)}</select></td>
      </tr>`;
    });
    $('#tablaMovs').innerHTML = `<tr><th>Fecha</th><th>Cuenta</th><th>Referencia</th><th>Descripción del banco</th><th class="num">Egreso Bs</th><th class="num">Ingreso Bs</th><th>Clasificación</th></tr>` +
      filas.join('') + (lista.length > MAX ? `<tr><td colspan="7" class="peq">Mostrando ${MAX} de ${lista.length}. Use los filtros para ver el resto.</td></tr>` : '');
  }

  // ---------- render: páginas de gastos ----------
  function filasCat(cat) { return E.movs.filter((m) => categoria(m).cat === cat); }

  function renderCat(cat) {
    const lista = filasCat(cat);
    const el = $('#p-' + cat);
    let totBs = 0, totUsd = 0, sinTasa = 0;
    const filas = lista.map((m) => {
      const c = E.clasif[m.id] || {};
      const bs = m.debito || m.credito;
      const t = c.tasa || tasaDe(m.fecha);
      const usd = t ? bs / t : 0;
      totBs += bs; totUsd += usd; if (!t) sinTasa++;
      return `<tr data-id="${esc(m.id)}">
        <td>${fmtFecha(m.fecha)}</td>
        <td><input type="text" data-campo="factura" value="${esc(c.factura)}" style="min-width:70px"></td>
        <td><input type="text" data-campo="beneficiario" value="${esc(c.beneficiario || (categoria(m).regla || {}).beneficiario || '')}"></td>
        <td><input type="text" data-campo="descripcion" value="${esc(c.descripcion)}" placeholder="${esc(m.descripcion)}" style="min-width:200px"></td>
        <td class="num">${fmt(bs)}</td>
        <td><input type="number" step="0.0001" data-campo="tasa" value="${c.tasa || ''}" placeholder="${t ? t : 'falta'}" style="width:90px;min-width:90px"></td>
        <td class="num"><b>${usd ? fmt(usd) : '—'}</b></td>
        <td class="peq">${esc(m.referencia)}</td>
        <td class="peq">${esc(cuentaDe(m))}</td>
        <td><input type="text" data-campo="receptor" value="${esc(c.receptor)}" style="min-width:90px"></td>
        <td><button class="x" data-devolver="${esc(m.id)}" title="Quitar de esta página (vuelve a Extractos sin clasificar)">↩</button></td>
      </tr>`;
    });
    el.innerHTML = `
      <div class="totales">
        <div>Movimientos<b>${lista.length}</b></div>
        <div>Total Bolívares<b>${fmt(totBs) || '0,00'}</b></div>
        <div>Total $<b>${fmt(totUsd) || '0,00'}</b></div>
        ${sinTasa ? `<div style="background:var(--warn-soft)">Sin tasa<b>${sinTasa}</b><span class="peq">Cargue las tasas en "Tasas BCV"</span></div>` : ''}
      </div>
      <div class="tabla-wrap">${lista.length ? `<table>
        <tr><th>Fecha</th><th>Factura</th><th>Beneficiario</th><th>Descripción</th><th class="num">Bolívares</th><th>Tasa</th><th class="num">Monto $</th><th>Referencia</th><th>Banco</th><th>Banco receptor</th><th></th></tr>
        ${filas.join('')}</table>` : `<div class="vacio-msg">No hay movimientos clasificados como "${esc(NOMBRE_CAT[cat])}". Clasifíquelos en la página Extractos bancarios.</div>`}
      </div>`;
  }

  // ---------- render: tasas ----------
  function renderTasas() {
    const fechas = [...new Set(E.movs.map((m) => m.fecha).concat(Object.keys(E.tasas)))].sort();
    if (!fechas.length) { $('#tablaTasas').innerHTML = '<tr><td class="vacio-msg">Cargue extractos primero.</td></tr>'; return; }
    $('#tablaTasas').innerHTML = '<tr><th>Fecha</th><th>Tasa Bs/$</th><th class="peq">Se usará</th></tr>' + fechas.map((f) =>
      `<tr><td>${fmtFecha(f)}</td><td><input type="number" step="0.0001" data-tasa="${f}" value="${E.tasas[f] || ''}"></td><td class="peq">${E.tasas[f] ? '' : (tasaDe(f) ? tasaDe(f) + ' (día anterior)' : 'sin tasa')}</td></tr>`).join('');
  }

  // ---------- render: reglas ----------
  function renderReglas() {
    $('#rCat').innerHTML = opciones(CATEGORIAS.filter(([v]) => v), 'fijo');
    if (!E.reglas.length) { $('#tablaReglas').innerHTML = '<tr><td class="peq">Todavía no hay reglas. Ejemplo: texto "SERV MTTO POS" → Comisión bancaria.</td></tr>'; return; }
    $('#tablaReglas').innerHTML = '<tr><th>Si la descripción contiene</th><th>Clasificar como</th><th>Beneficiario</th><th>Coinciden</th><th></th></tr>' + E.reglas.map((r, i) => {
      const n = E.movs.filter((m) => m.debito && m.descripcion.toLowerCase().includes(r.texto.toLowerCase())).length;
      return `<tr><td><b>${esc(r.texto)}</b></td><td>${esc(NOMBRE_CAT[r.cat])}</td><td>${esc(r.beneficiario)}</td><td class="num">${n}</td><td><button class="x" data-borrar-regla="${i}">✕</button></td></tr>`;
    }).join('');
  }

  function renderBadges() {
    const cuenta = { fijo: 0, extra: 0, compra: 0, pend: 0 };
    for (const m of E.movs) { const c = categoria(m).cat; if (c in cuenta) cuenta[c]++; if (!c) cuenta.pend++; }
    for (const k in cuenta) $('#b-' + k).textContent = cuenta[k] || '';
    $('#b-pend').title = 'Movimientos sin clasificar';
  }

  function render() {
    $('#mes').value = E.mes;
    renderCuentas(); renderMovs(); renderBadges();
    const activa = document.querySelector('nav button.activo').dataset.p;
    if (HOJA[activa]) renderCat(activa);
    if (activa === 'tasas') renderTasas();
    if (activa === 'reglas') renderReglas();
  }

  // ---------- exportar a Excel ----------
  function exportar() {
    if (!E.movs.length) return toast('No hay movimientos para exportar.');
    const wb = XLSX.utils.book_new();
    const titulo = 'FIN DE MES ' + (E.mes || '').toUpperCase();

    // Hoja con todos los movimientos
    const todos = [[titulo], ['EXTRACTOS BANCARIOS'], [], ['FECHA', 'BANCO', 'REFERENCIA', 'DESCRIPCION BANCO', 'EGRESO Bs', 'INGRESO Bs', 'SALDO', 'CLASIFICACION', 'BENEFICIARIO', 'DESCRIPCION']];
    for (const m of E.movs) {
      const c = E.clasif[m.id] || {};
      todos.push([fechaExcel(m.fecha), cuentaDe(m), m.referencia, m.descripcion, m.debito || null, m.credito || null, m.saldo || null, NOMBRE_CAT[categoria(m).cat] === '— Elegir —' ? 'SIN CLASIFICAR' : NOMBRE_CAT[categoria(m).cat].toUpperCase(), c.beneficiario || '', c.descripcion || '']);
    }
    const wsT = XLSX.utils.aoa_to_sheet(todos);
    formato(wsT, todos.length, { A: 'dd/mm/yyyy', E: '#,##0.00', F: '#,##0.00', G: '#,##0.00' });
    wsT['!cols'] = [12, 22, 16, 45, 14, 14, 16, 22, 28, 35].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, wsT, 'EXTRACTOS');

    // Una hoja por categoría con las mismas columnas del cierre de mes
    for (const cat of ['fijo', 'extra', 'compra']) {
      const filas = [[titulo], [HOJA[cat]], [], ['FECHA', 'FACTURA', 'BENEFICIARIO', 'DESCRIPCION', 'BOLIVARES', 'TASA', 'MONTO', 'REFERENCIA ', 'BANCO', 'BANCO RECEPTOR']];
      const lista = filasCat(cat);
      lista.forEach((m, i) => {
        const c = E.clasif[m.id] || {};
        const r = i + 5;
        const t = c.tasa || tasaDe(m.fecha) || null;
        filas.push([fechaExcel(m.fecha), c.factura || '', c.beneficiario || (categoria(m).regla || {}).beneficiario || '', c.descripcion || m.descripcion, m.debito || m.credito, t, t ? { f: `+E${r}/F${r}` } : null, m.referencia, cuentaDe(m), c.receptor || '']);
      });
      const fin = lista.length + 4;
      filas.push([], ['', '', '', 'TOTAL', { f: `SUM(E5:E${fin})` }, '', { f: `SUM(G5:G${fin})` }]);
      const ws = XLSX.utils.aoa_to_sheet(filas);
      formato(ws, filas.length, { A: 'dd/mm/yyyy', E: '#,##0.00', F: '#,##0.0000', G: '#,##0.00' });
      ws['!cols'] = [12, 10, 28, 40, 14, 10, 12, 16, 20, 18].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, HOJA[cat]);
    }
    XLSX.writeFile(wb, 'EXTRACTOS ' + (E.mes || 'MES').toUpperCase() + '.xlsx');
  }
  function fechaExcel(f) { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); }
  function formato(ws, n, cols) {
    for (const c in cols) for (let r = 5; r <= n; r++) { const cel = ws[c + r]; if (cel && (cel.t === 'n' || cel.t === 'd' || cel.f)) cel.z = cols[c]; }
  }

  // ---------- eventos ----------
  const zona = $('#zona'), inp = $('#archivos');
  zona.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => { cargar([...inp.files]); inp.value = ''; });
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('encima'); cargar([...e.dataTransfer.files]); });

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('activo', x === b));
    document.querySelectorAll('.pagina').forEach((p) => p.classList.toggle('activa', p.id === 'p-' + b.dataset.p));
    render();
  });

  function chips(id, clave) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      F[clave] = b.dataset.v;
      $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
      renderMovs();
    });
  }
  chips('#fTipo', 'tipo'); chips('#fEstado', 'estado');
  $('#fCuenta').addEventListener('change', renderMovs);
  $('#fComisiones').addEventListener('change', renderMovs);
  let tTxt; $('#fTexto').addEventListener('input', () => { clearTimeout(tTxt); tTxt = setTimeout(renderMovs, 200); });
  $('#mes').addEventListener('input', (e) => { E.mes = e.target.value; guardar(); });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('select.clasif[data-id]')) {
      const id = t.dataset.id;
      E.clasif[id] = Object.assign(E.clasif[id] || {}, { cat: t.value });
      guardar();
      if (HOJA[t.value]) toast('Enviado a ' + NOMBRE_CAT[t.value] + ' ✓');
      // Actualizar solo lo necesario para no perder la posición
      const m = E.movs.find((x) => x.id === id);
      const c = categoria(m);
      t.className = 'clasif ' + (c.cat ? 'c-' + c.cat + (c.auto ? ' auto' : '') : 'vacio');
      if (F.estado === 'pendiente' && c.cat) t.closest('tr').remove();
      renderBadges(); renderCuentas();
    } else if (t.matches('select.selCuenta')) {
      E.cuentasMap[t.dataset.clave] = t.value; guardar(); render();
    } else if (t.matches('input[data-campo]')) {
      const id = t.closest('tr').dataset.id, campo = t.dataset.campo;
      E.clasif[id] = E.clasif[id] || { cat: categoria(E.movs.find((x) => x.id === id)).cat };
      E.clasif[id][campo] = campo === 'tasa' ? (parseFloat(t.value) || 0) : t.value;
      guardar();
      if (campo === 'tasa') render();
    } else if (t.matches('input[data-tasa]')) {
      E.tasas[t.dataset.tasa] = parseFloat(t.value) || 0; guardar(); renderTasas();
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.devolver) {
      const id = t.dataset.devolver; E.clasif[id] = Object.assign(E.clasif[id] || {}, { cat: '' });
      guardar(); render(); toast('Devuelto a Extractos');
    } else if (t.dataset.quitar) {
      const clave = t.dataset.quitar;
      if (!confirm('¿Quitar esta cuenta y todos sus movimientos?')) return;
      const ids = new Set(E.movs.filter((m) => m.claveCuenta === clave).map((m) => m.id));
      E.movs = E.movs.filter((m) => !ids.has(m.id));
      ids.forEach((id) => delete E.clasif[id]);
      E.archivos = E.archivos.filter((a) => a.claveCuenta !== clave);
      guardar(); render();
    } else if (t.dataset.borrarRegla !== undefined) {
      E.reglas.splice(+t.dataset.borrarRegla, 1); guardar(); render();
    }
  });

  $('#rAgregar').addEventListener('click', () => {
    const texto = $('#rTexto').value.trim();
    if (!texto) return toast('Escriba el texto de la regla');
    E.reglas.push({ texto, cat: $('#rCat').value, beneficiario: $('#rBenef').value.trim() });
    $('#rTexto').value = ''; $('#rBenef').value = '';
    guardar(); render(); toast('Regla agregada');
  });

  $('#exportar').addEventListener('click', exportar);
  $('#respaldo').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(E)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'respaldo fin de mes ' + (E.mes || '') + '.json'; a.click();
  });
  $('#restaurar').addEventListener('click', () => $('#archivoRespaldo').click());
  $('#archivoRespaldo').addEventListener('change', async (e) => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!d.movs) throw new Error();
      E = Object.assign({ mes: '', cuentasMap: {}, archivos: [], movs: [], clasif: {}, tasas: {}, reglas: [] }, d);
      guardar(); render(); toast('Respaldo cargado');
    } catch (err) { toast('Ese archivo no es un respaldo válido'); }
    e.target.value = '';
  });
  $('#nuevoMes').addEventListener('click', () => {
    if (!confirm('Se borrarán los movimientos, clasificaciones y tasas de este mes (se conservan las reglas y las cuentas). ¿Ya descargó el Excel o guardó un respaldo?')) return;
    E.movs = []; E.archivos = []; E.clasif = {}; E.tasas = {}; E.mes = '';
    guardar(); render();
  });

  render();
})();
