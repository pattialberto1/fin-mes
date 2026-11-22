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
    ['socio', 'Vale / anticipo socio'],
    ['traspaso', 'Traspaso entre cuentas'],
    ['otro', 'Otro (no contar)'],
  ];
  const NOMBRE_CAT = Object.fromEntries(CATEGORIAS);
  const HOJA = { fijo: 'GASTOS FIJOS', extra: 'GASTOS EXTRAS', compra: 'COMPRAS', socio: 'ANTICIPO SOCIOS' };
  const RE_COMISION = /(^|\s)com(\.|\s)|comisi[oó]n|^comis |emisi[oó]n edo|cobro por procesamiento|serv mtto pos|emisi[oó]n de estado de cuenta/i;
  const CLAVE = 'finmes-v1';

  // ---------- estado ----------
  const nuevoEstado = () => ({
    mes: '', cuentasMap: {}, archivos: [], movs: [], clasif: {}, tasas: {}, reglas: [],
    // Cierre de mes
    manuales: { fijo: [], extra: [], compra: [], socio: [] }, // filas agregadas a mano (pagos en divisas/efectivo)
    ventas: {}, ajustesDivisas: [], bancosManual: {}, efectivoBs: 0, divisas: 0,
    inventario: null, invAnterior: null, socios: null, reparto: { reserva: 10000, valeDivisa: {}, banesco: {} }, tasaCierre: 0,
  });
  let E = nuevoEstado();
  try { const g = JSON.parse(localStorage.getItem(CLAVE)); if (g && g.movs) E = Object.assign(E, g); } catch (e) { /* sin almacenamiento */ }
  function completarEstado() {
    const d = nuevoEstado();
    for (const k in d) if (E[k] === undefined) E[k] = d[k];
    for (const k in d.manuales) E.manuales[k] = E.manuales[k] || [];
    E.reparto = Object.assign(d.reparto, E.reparto);
    // Inventario y socios de partida (del cierre de octubre)
    if (!E.inventario && window.INVENTARIO_BASE) {
      E.inventario = INVENTARIO_BASE.items.map((i, k) => ({ id: 'p' + k, nombre: i.nombre, unidad: i.unidad, cant: i.cant, precio: i.precio, bultos: 0, unidades: 0 }));
      E.invAnterior = { mes: INVENTARIO_BASE.mes, total: INVENTARIO_BASE.total, items: Object.fromEntries(INVENTARIO_BASE.items.map((i) => [i.nombre, { bultos: i.bultos, unidades: i.unidades }])) };
    }
    if (!E.socios) E.socios = (window.SOCIOS_BASE || []).slice();
    // Ajuste único (nov. 2026): Bancamiga, Mercantil cuenta corriente y Bancaribe son cuentas de la empresa,
    // y la cuenta de Bancaribe del PDF se identifica igual que en el Excel (primeros 13 dígitos).
    if ((E.migracion || 0) < 1) {
      const nueva = (k) => k.startsWith('bancaribe:') ? 'bancaribe:' + k.slice(10).replace(/^0+/, '').slice(0, 13) : k;
      for (const m of E.movs) m.claveCuenta = nueva(m.claveCuenta);
      const vistos = new Set();
      for (const x of E.archivos) { x.claveCuenta = nueva(x.claveCuenta); if (x.formato === 'Bancaribe (Excel)') x.numeroCuenta = ''; }
      E.archivos.sort((x, y) => String(y.numeroCuenta || '').length - String(x.numeroCuenta || '').length);
      E.archivos = E.archivos.filter((x) => { if (vistos.has(x.claveCuenta)) return false; vistos.add(x.claveCuenta); return true; });
      const mapa = {};
      for (const k in E.cuentasMap) mapa[nueva(k)] = E.cuentasMap[k];
      for (const x of E.archivos) {
        const k = x.claveCuenta;
        if (k.startsWith('bancamiga:') && !mapa[k]) mapa[k] = 'BANCA AMIGA EMPRESA';
        if ((k.startsWith('mercantil:') || k.startsWith('bancaribe:')) && /PERSONAL$/.test(mapa[k] || '')) mapa[k] = mapa[k].replace(/PERSONAL$/, 'EMPRESA');
      }
      E.cuentasMap = mapa;
      E.migracion = 1;
    }
  }
  completarEstado();
  // Reglas de fábrica: se agregan una vez por versión (si la administradora borra una, no vuelve)
  if (window.REGLAS_BASE && (E.reglasVersion || 0) < REGLAS_BASE.version) {
    const ya = new Set(E.reglas.map((r) => r.texto.toLowerCase()));
    for (const r of REGLAS_BASE.reglas) if (!ya.has(r.texto.toLowerCase())) E.reglas.push(Object.assign({ beneficiario: '', descripcion: '' }, r));
    E.reglasVersion = REGLAS_BASE.version;
    try { localStorage.setItem(CLAVE, JSON.stringify(E)); } catch (e) { /* sin almacenamiento */ }
  }
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

  // Tasas oficiales: las que trae la herramienta (tasas-bcv.js) + las importadas del Excel del BCV.
  function oficiales() { return Object.assign({}, window.TASAS_BCV || {}, E.tasasBCV || {}); }
  // Tasa oficial del día; fines de semana y feriados usan la del último día hábil anterior.
  function tasaOficial(fecha) {
    const o = oficiales();
    if (o[fecha]) return { tasa: o[fecha], fecha };
    const prev = Object.keys(o).filter((f) => f < fecha).sort().pop();
    return prev ? { tasa: o[prev], fecha: prev } : { tasa: 0, fecha: '' };
  }
  // Prioridad: tasa escrita a mano ese día > oficial del BCV > última escrita a mano
  function tasaDe(fecha) {
    if (E.tasas[fecha]) return E.tasas[fecha];
    const of = tasaOficial(fecha).tasa;
    if (of) return of;
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
        // Además del id, se compara por cuenta + fecha + monto + saldo: así no se duplican los movimientos
        // si se carga la misma cuenta en dos formatos (ej. el PDF y el Excel de Bancaribe).
        const cuentaNueva = E.cuentasMap[r.claveCuenta] || r.claveCuenta;
        const huellas = {};
        for (const m of E.movs) {
          if ((E.cuentasMap[m.claveCuenta] || m.claveCuenta) !== cuentaNueva) continue;
          const k = [m.fecha, m.debito, m.credito, m.saldo].join('|');
          huellas[k] = (huellas[k] || 0) + 1;
        }
        const vistos = {}, vistosH = {};
        let n = 0;
        for (const m of r.movimientos) {
          const base = [r.claveCuenta, m.fecha, m.referencia, m.debito, m.credito, m.saldo, m.descripcion].join('|');
          vistos[base] = (vistos[base] || 0) + 1;
          const id = base + '|' + vistos[base];
          const h = [m.fecha, m.debito, m.credito, m.saldo].join('|');
          vistosH[h] = (vistosH[h] || 0) + 1;
          if (existentes.has(id) || vistosH[h] <= (huellas[h] || 0)) { repetidos++; continue; }
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
        <td><select class="clasif ${clase}" data-id="${esc(m.id)}" title="${c.auto ? 'Clasificado automáticamente' : ''}">${opciones(CATEGORIAS, c.cat)}</select>${m.debito ? `<button class="recordar" data-recordar="${esc(m.id)}" title="Crear una regla para que los próximos pagos como este se clasifiquen solos">Recordar</button>` : ''}</td>
      </tr>`;
    });
    $('#tablaMovs').innerHTML = `<tr><th>Fecha</th><th>Cuenta</th><th>Referencia</th><th>Descripción del banco</th><th class="num">Egreso Bs</th><th class="num">Ingreso Bs</th><th>Clasificación</th></tr>` +
      filas.join('') + (lista.length > MAX ? `<tr><td colspan="7" class="peq">Mostrando ${MAX} de ${lista.length}. Use los filtros para ver el resto.</td></tr>` : '');
  }

  // ---------- filas de cada página (movimientos del banco + filas agregadas a mano) ----------
  const r2 = (n) => Math.round(n * 100) / 100;
  function items(cat) {
    const out = [];
    for (const m of E.movs) {
      const cg = categoria(m);
      if (cg.cat !== cat) continue;
      const c = E.clasif[m.id] || {}, regla = cg.regla || {};
      const bs = m.debito || m.credito;
      const tasa = c.tasa || tasaDe(m.fecha);
      out.push({
        id: m.id, origen: 'banco', fecha: m.fecha, bs, tasa, usd: tasa ? bs / tasa : 0,
        factura: c.factura || '', beneficiario: c.beneficiario || regla.beneficiario || '',
        descripcion: c.descripcion || regla.descripcion || '', descBanco: m.descripcion,
        referencia: m.referencia, banco: cuentaDe(m), receptor: c.receptor || '',
        presentacion: c.presentacion || '', precio: c.precio || 0, producto: c.producto || '', socio: c.socio || '',
      });
    }
    for (const r of (E.manuales[cat] || [])) {
      const bs = +r.bs || 0;
      const tasa = r.tasaManual || (bs && r.fecha ? tasaDe(r.fecha) : 0);
      out.push(Object.assign({}, r, { origen: 'manual', bs, tasa, usd: bs ? (tasa ? bs / tasa : 0) : (+r.usd || 0), descBanco: '' }));
    }
    out.sort((x, y) => (x.fecha || '9999') < (y.fecha || '9999') ? -1 : (x.fecha || '9999') > (y.fecha || '9999') ? 1 : 0);
    return out;
  }
  // Total de una página en Bs y $ (en Gastos fijos incluye las comisiones bancarias)
  function totales(cat) {
    let bs = 0, usd = 0;
    for (const x of items(cat)) { bs += x.bs; usd += x.usd; }
    if (cat === 'fijo') for (const x of comisionesPorCuenta()) { bs += x.bs; usd += x.tasa ? x.bs / x.tasa : 0; }
    return { bs: r2(bs), usd: r2(usd) };
  }

  // ---------- render: páginas de gastos, compras y anticipos ----------
  const BANCOS_LISTA = CUENTAS.concat(['EFECTIVO', 'DIVISAS']);
  function celda(x, campo, ancho, tipo) {
    const v = x[campo];
    const val = tipo === 'number' ? (v ? v : '') : v;
    return `<td><input type="${tipo || 'text'}" ${tipo === 'number' ? 'step="any"' : ''} data-campo="${campo}" value="${esc(val)}" style="min-width:${ancho || 80}px;width:100%"${campo === 'banco' || campo === 'receptor' ? ' list="listaBancos"' : ''}${campo === 'producto' ? ' list="listaProductos"' : ''}></td>`;
  }
  function renderCat(cat) {
    const lista = items(cat);
    const el = $('#p-' + cat);
    const tot = totales(cat);
    const sinTasa = lista.filter((x) => x.bs && !x.tasa).length;
    const esSocio = cat === 'socio', esCompra = cat === 'compra';
    const socios = E.socios || [];
    const filas = lista.map((x) => {
      const man = x.origen === 'manual';
      const fecha = man ? `<td><input type="date" data-campo="fecha" value="${esc(x.fecha)}" style="width:130px"></td>` : `<td>${fmtFecha(x.fecha)}</td>`;
      const bs = man ? celda(x, 'bs', 100, 'number') : `<td class="num">${fmt(x.bs)}</td>`;
      const usd = man && !x.bs ? `<td><input type="number" step="any" data-campo="usd" value="${x.usd || ''}" placeholder="${x.ref ? 'ref. ' + x.ref : '$'}" style="width:90px"></td>` : `<td class="num"><b>${x.usd ? fmt(x.usd) : '—'}</b></td>`;
      const tasa = `<td><input type="number" step="0.0001" data-campo="tasa" value="${(man ? x.tasaManual : (E.clasif[x.id] || {}).tasa) || ''}" placeholder="${x.tasa ? x.tasa : (x.bs ? 'falta' : '')}" style="width:90px;min-width:90px"></td>`;
      const ref = man ? celda(x, 'referencia', 80) : `<td class="peq">${esc(x.referencia)}</td>`;
      const banco = man ? celda(x, 'banco', 110) : `<td class="peq">${esc(x.banco)}</td>`;
      const desc = `<td><input type="text" data-campo="descripcion" value="${esc(x.descripcion)}" placeholder="${esc(x.descBanco)}" style="min-width:200px;width:100%"></td>`;
      const acciones = man
        ? `<td><button class="x" data-borrar-man="${esc(x.id)}" title="Borrar esta fila">✕</button></td>`
        : `<td style="white-space:nowrap"><button class="recordar" data-recordar="${esc(x.id)}" title="Crear una regla para que los próximos pagos como este se clasifiquen solos (con este beneficiario y descripción)">Recordar</button><button class="x" data-devolver="${esc(x.id)}" title="Quitar de esta página (vuelve a Extractos sin clasificar)">↩</button></td>`;
      if (esSocio) {
        return `<tr data-id="${esc(x.id)}" data-cat="${cat}">${fecha}
          <td><select data-campo="socio" class="${x.socio ? '' : 'clasif vacio'}">${opciones([['', '¿Qué socio?']].concat(socios.map((s) => [s, s])), x.socio)}</select></td>
          ${desc}${bs}${tasa}${usd}${ref}${banco}${celda(x, 'receptor', 100)}${acciones}</tr>`;
      }
      return `<tr data-id="${esc(x.id)}" data-cat="${cat}">${fecha}${celda(x, 'factura', 70)}${celda(x, 'beneficiario', 140)}${desc}${bs}${tasa}${usd}${ref}${banco}${celda(x, 'receptor', 90)}
        ${esCompra ? celda(x, 'presentacion', 90) + celda(x, 'precio', 70, 'number') + celda(x, 'producto', 150) : ''}${acciones}</tr>`;
    });
    const cab = esSocio
      ? '<th>Fecha</th><th>Socio</th><th>Descripción</th><th class="num">Bolívares</th><th>Tasa</th><th class="num">Monto $</th><th>Referencia</th><th>Banco</th><th>Banco destino</th><th></th>'
      : '<th>Fecha</th><th>Factura</th><th>Beneficiario</th><th>Descripción</th><th class="num">Bolívares</th><th>Tasa</th><th class="num">Monto $</th><th>Referencia</th><th>Banco</th><th>Banco receptor</th>' +
        (esCompra ? '<th>Presentación</th><th>Precio $</th><th>Producto del inventario</th>' : '') + '<th></th>';
    let extra = '';
    if (esSocio) {
      const porSocio = {};
      for (const x of lista) porSocio[x.socio || '(sin socio)'] = (porSocio[x.socio || '(sin socio)'] || 0) + x.bs;
      extra = `<div class="totales">${Object.keys(porSocio).map((k) => `<div>${esc(k)}<b>${fmt(porSocio[k]) || '0,00'} Bs</b></div>`).join('')}</div>`;
    }
    const ayuda = {
      fijo: 'Los gastos pagados en divisas o efectivo no salen en los bancos: agréguelos con "Agregar fila" (si no tiene Bolívares, escriba el monto directo en $).',
      extra: 'Los gastos pagados en divisas o efectivo no salen en los bancos: agréguelos con "Agregar fila".',
      compra: 'Si escribe el <b>Precio $</b> y el <b>Producto del inventario</b>, el precio de ese producto en el Inventario se actualiza solo con la última compra.',
      socio: 'Vales y anticipos entregados a los socios. Los movimientos del banco clasificados como "Vale / anticipo socio" aparecen aquí; elija a qué socio corresponde. En el Resumen se descuentan del reparto de cada socio.',
    }[cat];
    el.innerHTML = `
      <div class="totales">
        <div>Filas<b>${lista.length}</b></div>
        <div>Total Bolívares<b>${fmt(tot.bs) || '0,00'}</b></div>
        <div>Total $<b>${fmt(tot.usd) || '0,00'}</b>${cat === 'fijo' ? '<span class="peq">incluye comisiones</span>' : ''}</div>
        ${sinTasa ? `<div style="background:var(--warn-soft)">Sin tasa<b>${sinTasa}</b><span class="peq">Revise "Tasas BCV"</span></div>` : ''}
      </div>
      ${extra}
      <div class="fila-flex" style="margin-bottom:10px">
        <button class="btn primario" data-agregar="${cat}">+ Agregar fila</button>
        ${cat === 'fijo' ? '<button class="btn" id="recurrentes">+ Agregar gastos recurrentes del mes (nómina, delivery, alquiler…)</button>' : ''}
        <span class="peq">${ayuda}</span>
      </div>
      ${cat === 'fijo' ? tablaComisiones() : ''}
      <div class="tabla-wrap">${lista.length ? `<table><tr>${cab}</tr>${filas.join('')}</table>` : `<div class="vacio-msg">Todavía no hay filas. Clasifique movimientos en Extractos bancarios o use "Agregar fila".</div>`}</div>`;
  }

  // Mes de trabajo como "AAAA-MM" (del campo Mes, o de los movimientos)
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  function mesTrabajo() {
    const m = (E.mes || '').toUpperCase().match(/([A-ZÁÉÍÓÚ]+)\s+(\d{4})/);
    if (m && MESES.includes(m[1])) return m[2] + '-' + String(MESES.indexOf(m[1]) + 1).padStart(2, '0');
    if (E.movs.length) return E.movs[Math.floor(E.movs.length / 2)].fecha.slice(0, 7);
    return iso(new Date()).slice(0, 7);
  }
  function diasDelMes() {
    const [y, m] = mesTrabajo().split('-').map(Number);
    const n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => y + '-' + String(m).padStart(2, '0') + '-' + String(i + 1).padStart(2, '0'));
  }
  let nId = Date.now();
  const nuevoId = () => 'man-' + (nId++).toString(36);

  // Crea las filas de gastos recurrentes del mes según PLANTILLA_FIJOS
  function agregarRecurrentes() {
    const dias = diasDelMes(), ultimo = dias[dias.length - 1];
    const nuevas = [];
    const ddmm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
    for (const p of (window.PLANTILLA_FIJOS || [])) {
      if (p.frecuencia === 'semanal') {
        // Semanas de lunes a domingo cuyo lunes cae en el mes (la semana 26/10–01/11 ya fue en octubre)
        for (const f of dias) {
          const d = new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
          if (d.getDay() !== 1) continue;
          const fin = new Date(d); fin.setDate(d.getDate() + 6);
          const fFin = iso(fin);
          nuevas.push({ fecha: fFin > ultimo ? ultimo : fFin, descripcion: `${p.descripcion} ${ddmm(f)} al ${fmtFecha(fFin)}`, usd: p.usd || 0, ref: p.ref });
        }
      } else if (p.frecuencia === 'quincenal') {
        nuevas.push({ fecha: dias[14], descripcion: p.descripcion, usd: p.usd || 0, ref: p.ref });
        nuevas.push({ fecha: ultimo, descripcion: p.descripcion, usd: p.usd || 0, ref: p.ref });
      } else {
        nuevas.push({ fecha: ultimo, descripcion: p.descripcion + (/FIN DE MES/.test(p.descripcion) ? ' ' + (E.mes || '').toUpperCase() : ''), usd: p.usd || 0, ref: p.ref });
      }
    }
    const ya = new Set(E.manuales.fijo.map((r) => r.descripcion + '|' + r.fecha));
    let n = 0;
    for (const r of nuevas) {
      if (ya.has(r.descripcion + '|' + r.fecha)) continue;
      E.manuales.fijo.push(Object.assign({ id: nuevoId(), factura: '', beneficiario: '', bs: 0, tasaManual: 0, referencia: '', banco: 'DIVISAS', receptor: '' }, r));
      n++;
    }
    guardar(); render();
    toast(n ? `${n} gastos recurrentes agregados: complete los montos` : 'Los gastos recurrentes de este mes ya estaban agregados');
  }

  // Comisiones bancarias del mes agrupadas por cuenta (en el cierre van como una línea por banco en GASTOS FIJOS)
  function comisionesPorCuenta() {
    const tot = {};
    for (const m of E.movs) if (m.debito && categoria(m).cat === 'comision') { const k = cuentaDe(m) || 'SIN CUENTA'; tot[k] = (tot[k] || 0) + m.debito; }
    const ultima = E.movs.length ? E.movs[E.movs.length - 1].fecha : '';
    return Object.keys(tot).sort().map((k) => ({ cuenta: k, bs: Math.round(tot[k] * 100) / 100, fecha: ultima, tasa: tasaDe(ultima) }));
  }
  function tablaComisiones() {
    const l = comisionesPorCuenta();
    if (!l.length) return '';
    const tBs = l.reduce((s, x) => s + x.bs, 0), tUsd = l.reduce((s, x) => s + (x.tasa ? x.bs / x.tasa : 0), 0);
    return `<div class="panel"><h2>Comisiones bancarias del mes</h2>
      <p class="peq">Se suman solas por cuenta y salen en el Excel como "COMISIONES BANCARIAS &lt;CUENTA&gt;", igual que en el cierre. Se usa la tasa del último día.</p>
      <table><tr><th>Descripción</th><th class="num">Bolívares</th><th class="num">Tasa</th><th class="num">Monto $</th></tr>
      ${l.map((x) => `<tr><td>COMISIONES BANCARIAS ${esc(x.cuenta)}</td><td class="num">${fmt(x.bs)}</td><td class="num">${x.tasa ? x.tasa.toLocaleString('es-VE', { minimumFractionDigits: 4 }) : '—'}</td><td class="num">${x.tasa ? fmt(x.bs / x.tasa) : '—'}</td></tr>`).join('')}
      <tr><td><b>Total comisiones</b></td><td class="num"><b>${fmt(tBs)}</b></td><td></td><td class="num"><b>${fmt(tUsd) || '—'}</b></td></tr></table></div>`;
  }

  // ---------- render: tasas ----------
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function renderTasas() {
    // Todos los días del mes de trabajo, desde el día 1 hasta hoy (o el último movimiento)
    const hoy = iso(new Date());
    const base = E.movs.length ? E.movs[0].fecha : hoy;
    const ultimo = E.movs.length ? E.movs[E.movs.length - 1].fecha : hoy;
    let fin = ultimo > hoy ? ultimo : hoy;
    const finMes = iso(new Date(+base.slice(0, 4), +base.slice(5, 7), 0));
    if (fin > finMes && ultimo <= finMes) fin = finMes;
    const fechas = new Set(E.movs.map((m) => m.fecha).concat(Object.keys(E.tasas)));
    for (let d = new Date(+base.slice(0, 4), +base.slice(5, 7) - 1, 1); iso(d) <= fin; d.setDate(d.getDate() + 1)) fechas.add(iso(d));
    const o = oficiales();
    $('#tablaTasas').innerHTML = '<tr><th>Fecha</th><th>Día</th><th class="num">Oficial BCV</th><th>Corregir a mano</th><th class="num">Se usa</th></tr>' + [...fechas].sort().map((f) => {
      const of = tasaOficial(f);
      const dia = DIAS[new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)).getDay()];
      const nota = o[f] ? '' : of.tasa ? `<span class="peq"> (del ${fmtFecha(of.fecha)})</span>` : '';
      return `<tr><td>${fmtFecha(f)}</td><td class="peq">${dia}</td><td class="num">${of.tasa ? of.tasa.toLocaleString('es-VE', { minimumFractionDigits: 4 }) + nota : '<span class="sin-cuenta">falta</span>'}</td>
        <td><input type="number" step="0.0001" data-tasa="${f}" value="${E.tasas[f] || ''}" placeholder="—" style="width:110px"></td>
        <td class="num"><b>${tasaDe(f) ? tasaDe(f).toLocaleString('es-VE', { minimumFractionDigits: 4 }) : '—'}</b></td></tr>`;
    }).join('');
  }

  // ---------- render: reglas ----------
  function renderReglas() {
    $('#rCat').innerHTML = opciones(CATEGORIAS.filter(([v]) => v), 'fijo');
    if (!E.reglas.length) { $('#tablaReglas').innerHTML = '<tr><td class="peq">Todavía no hay reglas. Ejemplo: texto "SERV MTTO POS" → Comisión bancaria.</td></tr>'; return; }
    $('#tablaReglas').innerHTML = '<tr><th>Si la descripción contiene</th><th>Clasificar como</th><th>Beneficiario</th><th>Descripción</th><th class="num">Coinciden este mes</th><th></th></tr>' + E.reglas.map((r, i) => {
      const n = E.movs.filter((m) => m.debito && m.descripcion.toLowerCase().includes(r.texto.toLowerCase())).length;
      return `<tr><td><b>${esc(r.texto)}</b></td><td>${esc(NOMBRE_CAT[r.cat])}</td><td>${esc(r.beneficiario)}</td><td>${esc(r.descripcion)}</td><td class="num">${n}</td><td><button class="x" data-borrar-regla="${i}">✕</button></td></tr>`;
    }).join('');
  }

  function renderBadges() {
    const cuenta = { fijo: 0, extra: 0, compra: 0, socio: 0, pend: 0 };
    for (const m of E.movs) { const c = categoria(m).cat; if (c in cuenta) cuenta[c]++; if (!c) cuenta.pend++; }
    for (const k of ['fijo', 'extra', 'compra', 'socio']) cuenta[k] += E.manuales[k].length;
    for (const k in cuenta) { const b = $('#b-' + k); if (b) b.textContent = cuenta[k] || ''; }
    $('#b-pend').title = 'Movimientos sin clasificar';
  }

  function render() {
    $('#mes').value = E.mes;
    renderCuentas(); renderMovs(); renderBadges();
    const activa = document.querySelector('nav button.activo').dataset.p;
    if (HOJA[activa]) renderCat(activa);
    if (window.Cierre) Cierre.render(activa);
    if (activa === 'tasas') renderTasas();
    if (activa === 'reglas') renderReglas();
  }

  // ---------- botón "Recordar": crea una regla a partir de un movimiento ----------
  // Usa la cédula o el RIF si la descripción lo trae (TRFMB 0134 V024635876 LOZANO RODRIGUEZ),
  // si no, la descripción sin números (CORPOELEC REC EN LINEA 000001000019931963 -> CORPOELEC REC EN LINEA).
  const GENERICAS = /^(banesco )?pago movil|pago movil (realizado|cce)|transf(erencia)?\.? (internet|inmediata)|^nd |deposito a terceros|consumos|pago t\.?d\.?c|transf entre ctas|credito inmediato|^tdd - administracion/i;
  function recordar(id) {
    const m = E.movs.find((x) => x.id === id);
    const c = categoria(m), cl = E.clasif[id] || {};
    if (!c.cat || c.cat === 'ingreso') return toast('Primero elija la clasificación de este movimiento');
    const idDoc = m.descripcion.match(/\b[JVEGP]\d{7,10}\b/i);
    let texto = idDoc ? idDoc[0].toUpperCase() : m.descripcion.replace(/\b\d[\d\-\/.]*\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!idDoc && GENERICAS.test(texto)) {
      alert('La descripción "' + m.descripcion + '" es genérica: el banco la usa para pagos distintos (no dice a quién se pagó). Una regla con ese texto clasificaría mal otros pagos, así que este hay que clasificarlo a mano cada mes.');
      return;
    }
    texto = prompt('Los próximos egresos cuya descripción contenga este texto se clasificarán como "' + NOMBRE_CAT[c.cat] + '".\nPuede acortarlo o corregirlo:', texto);
    if (!texto || !texto.trim()) return;
    texto = texto.trim();
    const nombre = idDoc ? m.descripcion.slice(idDoc.index + idDoc[0].length).replace(/\s\d+\s*$/, '').trim() : '';
    const benef = cl.beneficiario || (c.regla || {}).beneficiario || nombre;
    const desc = cl.descripcion || (c.regla || {}).descripcion || '';
    const coinciden = E.movs.filter((x) => x.debito && x.descripcion.toLowerCase().includes(texto.toLowerCase()));
    const otros = coinciden.filter((x) => x.id !== id && !(E.clasif[x.id] && typeof E.clasif[x.id].cat === 'string'));
    const previa = E.reglas.findIndex((r) => r.texto.toLowerCase() === texto.toLowerCase());
    const regla = { texto, cat: c.cat, beneficiario: benef, descripcion: desc };
    if (previa >= 0) E.reglas[previa] = regla; else E.reglas.unshift(regla);
    guardar(); render();
    toast('Regla guardada: "' + texto + '" → ' + NOMBRE_CAT[c.cat] + (otros.length ? ' (+' + otros.length + ' movimientos este mes)' : ''));
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
    } else if (t.matches('[data-campo]') && t.closest('tr[data-cat]')) {
      const tr = t.closest('tr'), id = tr.dataset.id, cat = tr.dataset.cat, campo = t.dataset.campo;
      const numerico = ['tasa', 'bs', 'usd', 'precio'].includes(campo);
      const valor = numerico ? (parseFloat(t.value) || 0) : t.value;
      if (id.startsWith('man-')) {
        const r = E.manuales[cat].find((x) => x.id === id);
        r[campo === 'tasa' ? 'tasaManual' : campo] = valor;
      } else {
        E.clasif[id] = E.clasif[id] || { cat: categoria(E.movs.find((x) => x.id === id)).cat };
        E.clasif[id][campo] = valor;
      }
      guardar();
      if (numerico || campo === 'fecha' || campo === 'socio' || campo === 'producto') render();
    } else if (t.matches('input[data-tasa]')) {
      E.tasas[t.dataset.tasa] = parseFloat(t.value) || 0; guardar(); renderTasas();
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.agregar) {
      const cat = t.dataset.agregar;
      E.manuales[cat].push({ id: nuevoId(), fecha: '', factura: '', beneficiario: '', descripcion: '', bs: 0, usd: 0, tasaManual: 0, referencia: '', banco: '', receptor: '', socio: '' });
      guardar(); render();
      const filas = document.querySelectorAll('#p-' + cat + ' tr[data-id^="man-"]');
      const ult = [...filas].find((f) => f.dataset.id === E.manuales[cat][E.manuales[cat].length - 1].id);
      if (ult) { ult.scrollIntoView({ block: 'center' }); ult.querySelector('input').focus(); }
    } else if (t.dataset.borrarMan) {
      for (const k in E.manuales) E.manuales[k] = E.manuales[k].filter((x) => x.id !== t.dataset.borrarMan);
      guardar(); render();
    } else if (t.id === 'recurrentes') {
      agregarRecurrentes();
    } else if (t.dataset.recordar) {
      recordar(t.dataset.recordar);
    } else if (t.dataset.devolver) {
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
    E.reglas.push({ texto, cat: $('#rCat').value, beneficiario: $('#rBenef').value.trim(), descripcion: '' });
    $('#rTexto').value = ''; $('#rBenef').value = '';
    guardar(); render(); toast('Regla agregada');
  });

  $('#importarBCV').addEventListener('click', () => $('#archivoBCV').click());
  $('#archivoBCV').addEventListener('change', async (e) => {
    try {
      const t = Extractos.leerTasasBCV(await e.target.files[0].arrayBuffer());
      E.tasasBCV = Object.assign(E.tasasBCV || {}, t);
      const fs = Object.keys(t).sort();
      guardar(); render();
      toast(`${fs.length} tasas cargadas (${fmtFecha(fs[0])} al ${fmtFecha(fs[fs.length - 1])})`);
    } catch (err) { toast(err.message || 'No se pudo leer el archivo'); }
    e.target.value = '';
  });

  $('#exportar').addEventListener('click', () => Cierre.exportar());
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
      E = Object.assign(nuevoEstado(), d);
      completarEstado();
      guardar(); render(); toast('Respaldo cargado');
    } catch (err) { toast('Ese archivo no es un respaldo válido'); }
    e.target.value = '';
  });
  $('#nuevoMes').addEventListener('click', () => {
    if (!confirm('Se borrarán los movimientos, ventas, gastos, anticipos y cantidades del inventario de este mes.\nSe conservan: reglas, cuentas, socios, productos y precios del inventario, y el inventario de este mes pasa a ser el "mes anterior".\n\n¿Ya descargó el Excel o guardó un respaldo?')) return;
    if (window.Cierre) E.invAnterior = Cierre.inventarioComoAnterior();
    for (const p of E.inventario || []) { p.bultos = 0; p.unidades = 0; }
    const d = nuevoEstado();
    Object.assign(E, { movs: [], archivos: [], clasif: {}, tasas: {}, mes: '', manuales: d.manuales, ventas: {}, ajustesDivisas: [], bancosManual: {}, efectivoBs: 0, divisas: 0, tasaCierre: 0,
      reparto: { reserva: E.reparto.reserva, valeDivisa: {}, banesco: {} } });
    guardar(); render();
  });

  // Funciones que usa cierre.js (ventas, bancos, inventario, resumen y Excel)
  window.FM = {
    get E() { return E; }, guardar, render, toast, esc, fmt, fmtFecha, opciones, r2, CUENTAS, HOJA, NOMBRE_CAT,
    categoria, cuentaDe, tasaDe, items, totales, comisionesPorCuenta, mesTrabajo, diasDelMes, iso, nuevoId,
  };
  render();
})();
