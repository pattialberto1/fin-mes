/* Cierre de mes: Ventas, Bancos y efectivo, Inventario, Resumen y el Excel completo.
 * Usa las funciones de app.js a través de window.FM.
 */
(function () {
  'use strict';
  const FM = window.FM;
  const { esc, fmt, fmtFecha, r2 } = FM;
  const $ = (s) => document.querySelector(s);
  const E = () => FM.E;
  const n = (v) => +v || 0;
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const diaSemana = (f) => DIAS[new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)).getDay()];
  const fmt4 = (v) => v ? v.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—';
  const pct = (v) => isFinite(v) && v ? (v * 100).toLocaleString('es-VE', { maximumFractionDigits: 1 }) + ' %' : '—';
  const signo = (v) => (v < 0 ? 'color:var(--red)' : 'color:var(--ok)');

  // =====================================================================
  // CÁLCULOS
  // =====================================================================
  function tasaCierre() {
    if (E().tasaCierre) return E().tasaCierre;
    const dias = FM.diasDelMes();
    return FM.tasaDe(dias[dias.length - 1]);
  }

  // Saldo final de un extracto: el movimiento cuyo saldo no es el "saldo anterior" de ningún otro.
  function saldoFinal(ms) {
    const previos = new Set(ms.map((m) => Math.round((m.saldo - m.credito + m.debito) * 100)));
    const finales = ms.filter((m) => !previos.has(Math.round(m.saldo * 100)));
    const lista = (finales.length ? finales : ms).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    const ult = lista[lista.length - 1];
    return { saldo: r2(ult.saldo), fecha: ult.fecha };
  }
  // Una misma línea del cierre (ej. BANCA AMIGA EMPRESA) puede tener varias cuentas: se suman sus saldos.
  function saldoExtracto(cuenta) {
    const porClave = {};
    for (const m of E().movs) if (FM.cuentaDe(m) === cuenta) (porClave[m.claveCuenta] = porClave[m.claveCuenta] || []).push(m);
    const claves = Object.keys(porClave);
    if (!claves.length) return null;
    const detalle = claves.map((k) => {
      const a = E().archivos.find((x) => x.claveCuenta === k) || {};
      return Object.assign({ numero: a.numeroCuenta ? '…' + String(a.numeroCuenta).slice(-4) : '' }, saldoFinal(porClave[k]));
    });
    return { saldo: r2(detalle.reduce((s, d) => s + d.saldo, 0)), fecha: detalle.map((d) => d.fecha).sort().pop(), detalle };
  }
  function saldoCuenta(cuenta) {
    const man = E().bancosManual[cuenta];
    if (man !== undefined && man !== '' && man !== null) return n(man);
    const s = saldoExtracto(cuenta);
    return s ? s.saldo : 0;
  }

  // Ventas del día según los bancos (en $), separando punto de venta, pago móvil y biopago.
  const RE_PDV = /liquidaci[oó]n a comercio|^tdd -|^tdc -|^tdb |^tmd |^tdc |^tt |punto de venta|\bpos\b/i;
  const RE_PM = /pago ?m[oó]vil|p2p|p2c|transferencia inmediata recibida|trf cr inm/i;
  const RE_BIO = /biopago/i;
  function ventasBanco() {
    const out = {};
    for (const m of E().movs) {
      if (!m.credito || FM.categoria(m).cat !== 'ingreso') continue;
      const tipo = RE_BIO.test(m.descripcion) ? 'bio' : RE_PDV.test(m.descripcion) ? 'pdv' : RE_PM.test(m.descripcion) ? 'pm' : '';
      if (!tipo) continue;
      const t = FM.tasaDe(m.fecha);
      if (!t) continue;
      const d = (out[m.fecha] = out[m.fecha] || { pdv: 0, pm: 0, bio: 0 });
      d[tipo] += m.credito / t;
    }
    return out;
  }
  const COLS_VENTA = [['pdv', 'Punto de venta'], ['pm', 'Pago móvil'], ['efbs', 'Bolívares efectivo'], ['bio', 'Biopago'], ['div', 'Divisas']];
  function totalDia(v) { return v ? COLS_VENTA.reduce((s, [k]) => s + n(v[k]), 0) : 0; }

  // Gastos pagados en divisas/efectivo: filas agregadas a mano sin Bolívares
  function gastosEnDivisas() {
    let t = 0;
    for (const cat of ['fijo', 'extra', 'compra']) for (const x of FM.items(cat)) if (x.origen === 'manual' && !x.bs) t += x.usd;
    return r2(t);
  }

  // Inventario
  function compraMasReciente(nombre) {
    const k = nombre.trim().toLowerCase();
    let mejor = null;
    for (const x of FM.items('compra')) {
      if (!x.producto || !n(x.precio) || x.producto.trim().toLowerCase() !== k) continue;
      if (!mejor || (x.fecha || '') >= (mejor.fecha || '')) mejor = x;
    }
    return mejor;
  }
  function filaInv(p) {
    const c = compraMasReciente(p.nombre);
    const precio = c ? n(c.precio) : n(p.precio);
    const cant = n(p.cant) || 1;
    const unit = precio / cant;
    const mb = n(p.bultos) * precio, mu = n(p.unidades) * unit;
    return { precio, unit, mb, mu, total: mb + mu, compra: c };
  }
  function totalInventario() { return r2((E().inventario || []).reduce((s, p) => s + filaInv(p).total, 0)); }
  function inventarioComoAnterior() {
    return { mes: E().mes, total: totalInventario(), items: Object.fromEntries((E().inventario || []).map((p) => [p.nombre, { bultos: n(p.bultos), unidades: n(p.unidades) }])) };
  }

  function calcular() {
    const e = E();
    const tasa = tasaCierre();
    const dias = FM.diasDelMes();
    const ventasCol = Object.fromEntries(COLS_VENTA.map(([k]) => [k, 0]));
    let ventas = 0, sistema = 0;
    for (const f of dias) { const v = e.ventas[f]; if (!v) continue; for (const [k] of COLS_VENTA) ventasCol[k] += n(v[k]); ventas += totalDia(v); sistema += n(v.sistema); }
    const compras = FM.totales('compra'), extras = FM.totales('extra'), fijos = FM.totales('fijo'), vales = FM.totales('socio');
    const bancosBs = r2(FM.CUENTAS.reduce((s, c) => s + saldoCuenta(c), 0));
    const efectivoBs = n(e.efectivoBs), divisas = n(e.divisas);
    const usd = (bs) => (tasa ? bs / tasa : 0);
    const disponible = usd(bancosBs) + usd(efectivoBs) + divisas + usd(vales.bs);
    const gastos = compras.usd + extras.usd + fijos.usd;
    const debeQuedar = ventas - gastos;
    const invActual = totalInventario(), invAnterior = n((e.invAnterior || {}).total);
    // Reparto entre socios
    const socios = e.socios || [];
    const ns = socios.length || 1;
    const valesSocio = {};
    for (const x of FM.items('socio')) if (x.socio) valesSocio[x.socio] = (valesSocio[x.socio] || 0) + x.bs;
    const bsCU = (bancosBs + efectivoBs + vales.bs) / ns;
    const divCU = (divisas - n(e.reparto.reserva)) / ns;
    const reparto = socios.map((s) => {
      const vale = valesSocio[s] || 0, vd = n(e.reparto.valeDivisa[s]), bz = n(e.reparto.banesco[s]);
      return { socio: s, bsCU, vale, recibirBs: bsCU - vale, divCU, valeDiv: vd, fisicas: divCU - vd, banesco: bz, totalDiv: divCU - vd + bz };
    });
    const divVentas = ventasCol.div;
    const ajustes = (e.ajustesDivisas || []).reduce((s, a) => s + n(a.monto), 0);
    const gDiv = gastosEnDivisas();
    return {
      tasa, dias, ventasCol, ventas, sistema, compras, extras, fijos, vales, bancosBs, efectivoBs, divisas,
      efectivoBsUsd: usd(efectivoBs), bancosUsd: usd(bancosBs), valesUsd: usd(vales.bs),
      disponible, gastos, debeQuedar, diferencia: debeQuedar - disponible,
      bruta: disponible + extras.usd + fijos.usd, neta: disponible + extras.usd,
      invActual, invAnterior, invVariacion: invActual - invAnterior,
      socios, reparto, valesSocio,
      divVentas, ajustes, gDiv, divEsperadas: divVentas + ajustes - gDiv,
    };
  }

  // =====================================================================
  // PÁGINAS
  // =====================================================================
  function renderVentas() {
    const e = E(), c = calcular(), vb = ventasBanco();
    const filas = c.dias.map((f) => {
      const v = e.ventas[f] || {};
      const t = totalDia(v), b = vb[f];
      const bTot = b ? b.pdv + b.pm + b.bio : 0;
      return `<tr data-dia="${f}"><td>${fmtFecha(f)}</td><td class="peq">${diaSemana(f)}</td>
        ${COLS_VENTA.map(([k]) => `<td><input type="number" step="any" data-venta="${k}" value="${v[k] || ''}" style="width:95px"></td>`).join('')}
        <td class="num"><b>${fmt(t)}</b></td>
        <td><input type="number" step="any" data-venta="sistema" value="${v.sistema || ''}" style="width:95px"></td>
        <td class="num" style="${v.sistema ? signo(t - n(v.sistema)) : ''}">${v.sistema ? fmt(t - n(v.sistema)) || '0,00' : ''}</td>
        <td class="num peq" title="${b ? `Punto de venta ${fmt(b.pdv)} · Pago móvil ${fmt(b.pm)} · Biopago ${fmt(b.bio)}` : ''}">${fmt(bTot)}</td></tr>`;
    });
    $('#p-ventas').innerHTML = `
      <div class="totales">
        <div>Total ventas $<b>${fmt(c.ventas) || '0,00'}</b></div>
        <div>Total sistema $<b>${fmt(c.sistema) || '0,00'}</b></div>
        <div>Diferencia<b style="${signo(c.ventas - c.sistema)}">${fmt(c.ventas - c.sistema) || '0,00'}</b></div>
        ${COLS_VENTA.map(([k, t]) => `<div>${t}<b>${fmt(c.ventasCol[k]) || '0,00'}</b></div>`).join('')}
      </div>
      <div class="fila-flex" style="margin-bottom:10px">
        <button class="btn primario" id="llenarVentas">Llenar desde los bancos</button>
        <span class="peq">Montos en <b>dólares</b>. El botón llena Punto de venta, Pago móvil y Biopago con lo que entró a los bancos ese día (Bs ÷ tasa del día), solo en las casillas vacías. Ojo: el banco abona el punto de venta al día siguiente. La columna "Según bancos" es de referencia.</span>
      </div>
      <div class="tabla-wrap"><table>
        <tr><th>Fecha</th><th>Día</th>${COLS_VENTA.map(([, t]) => `<th>${t}</th>`).join('')}<th class="num">Total ventas</th><th>Total sistema</th><th class="num">Diferencia</th><th class="num">Según bancos</th></tr>
        ${filas.join('')}
      </table></div>
      <div class="panel" style="margin-top:14px;max-width:720px">
        <h2>Control de divisas</h2>
        <table>
          <tr><td>Divisas de las ventas</td><td class="num">${fmt(c.divVentas) || '0,00'}</td><td></td></tr>
          ${(e.ajustesDivisas || []).map((a, i) => `<tr><td><input type="text" data-ajuste="${i}" data-k="concepto" value="${esc(a.concepto)}" placeholder="Concepto (ej. COMPRA DIVISA, CUADRE MES ANTERIOR)" style="width:100%"></td>
            <td><input type="number" step="any" data-ajuste="${i}" data-k="monto" value="${a.monto || ''}" style="width:110px"></td><td><button class="x" data-borrar-ajuste="${i}">✕</button></td></tr>`).join('')}
          <tr><td colspan="3"><button class="btn" id="agregarAjuste">+ Agregar entrada o salida de divisas</button></td></tr>
          <tr><td>Gastos pagados en divisas (filas sin Bolívares en Gastos y Compras)</td><td class="num">−${fmt(c.gDiv) || '0,00'}</td><td></td></tr>
          <tr><td><b>Divisas que deberían quedar</b></td><td class="num"><b>${fmt(c.divEsperadas) || '0,00'}</b></td><td></td></tr>
          <tr><td>Divisas contadas (pestaña Bancos y efectivo)</td><td class="num">${fmt(c.divisas) || '0,00'}</td><td></td></tr>
          <tr><td><b>Diferencia</b></td><td class="num"><b style="${signo(c.divisas - c.divEsperadas)}">${fmt(c.divisas - c.divEsperadas) || '0,00'}</b></td><td></td></tr>
        </table>
      </div>`;
  }

  function llenarVentas() {
    const e = E(), vb = ventasBanco();
    let k = 0;
    for (const f of FM.diasDelMes()) {
      const b = vb[f]; if (!b) continue;
      const v = (e.ventas[f] = e.ventas[f] || {});
      for (const c of ['pdv', 'pm', 'bio']) if (!n(v[c]) && b[c]) { v[c] = r2(b[c]); k++; }
    }
    FM.guardar(); FM.render();
    FM.toast(k ? `${k} casillas llenadas desde los bancos` : 'No había casillas vacías con datos de los bancos');
  }

  function renderBancos() {
    const e = E(), c = calcular();
    const filas = FM.CUENTAS.map((cta) => {
      const s = saldoExtracto(cta), man = e.bancosManual[cta];
      return `<tr><td>${esc(cta)}</td>
        <td class="num">${s ? (s.detalle.length > 1 ? s.detalle.map((d) => `<span class="peq">${esc(d.numero)} ${fmt(d.saldo)} (${fmtFecha(d.fecha)})</span><br>`).join('') + fmt(s.saldo) : fmt(s.saldo) + `<span class="peq"> (${fmtFecha(s.fecha)})</span>`) : '<span class="peq">sin extracto</span>'}</td>
        <td><input type="number" step="any" data-banco="${esc(cta)}" value="${man !== undefined && man !== '' && man !== null ? man : ''}" placeholder="${s ? 'usa el del extracto' : '0'}" style="width:160px"></td>
        <td class="num"><b>${fmt(saldoCuenta(cta)) || '0,00'}</b></td></tr>`;
    });
    $('#p-bancos').innerHTML = `
      <div class="panel" style="max-width:860px">
        <h2>Bancos (saldo al cierre, en Bolívares)</h2>
        <p class="peq">El saldo se toma solo del último movimiento de cada extracto (si una línea tiene varias cuentas, se suman). Si el extracto no llega hasta el último día del mes o falta una cuenta, escriba el saldo a mano.</p>
        <table><tr><th>Cuenta</th><th class="num">Según extracto</th><th>Escribir a mano</th><th class="num">Saldo usado</th></tr>${filas.join('')}
          <tr><td><b>TOTAL BANCOS</b></td><td></td><td></td><td class="num"><b>${fmt(c.bancosBs) || '0,00'}</b></td></tr></table>
      </div>
      <div class="panel" style="max-width:860px">
        <h2>Efectivo y tasa de cierre</h2>
        <table>
          <tr><td>Efectivo en Bolívares</td><td><input type="number" step="any" id="efectivoBs" value="${e.efectivoBs || ''}" style="width:160px"></td><td class="peq">= ${fmt(c.efectivoBsUsd) || '0,00'} $</td></tr>
          <tr><td>Divisas en efectivo ($)</td><td><input type="number" step="any" id="divisas" value="${e.divisas || ''}" style="width:160px"></td><td class="peq">Según el control de divisas deberían ser ${fmt(c.divEsperadas) || '0,00'} $</td></tr>
          <tr><td>Tasa de cierre (Bs/$)</td><td><input type="number" step="0.0001" id="tasaCierre" value="${e.tasaCierre || ''}" placeholder="${fmt4(FM.tasaDe(c.dias[c.dias.length - 1]))}" style="width:160px"></td><td class="peq">Por defecto, la tasa BCV del último día del mes. Se usa para pasar a $ bancos, efectivo y vales.</td></tr>
          <tr><td><b>Bolívares (bancos + efectivo)</b></td><td class="num"><b>${fmt(c.bancosBs + c.efectivoBs) || '0,00'}</b></td><td class="peq">= ${fmt(c.bancosUsd + c.efectivoBsUsd) || '0,00'} $</td></tr>
        </table>
      </div>`;
  }

  const FI = { texto: '', existencia: false };
  function renderInventario() {
    const e = E();
    const ant = (e.invAnterior || { items: {} });
    const total = totalInventario();
    const lista = (e.inventario || []).filter((p) => (!FI.texto || p.nombre.toLowerCase().includes(FI.texto)) && (!FI.existencia || n(p.bultos) || n(p.unidades)));
    const filas = lista.map((p) => {
      const f = filaInv(p), a = ant.items[p.nombre];
      return `<tr data-prod="${esc(p.id)}">
        <td><input type="text" data-p="nombre" value="${esc(p.nombre)}" style="min-width:220px;width:100%"></td>
        <td><input type="text" data-p="unidad" value="${esc(p.unidad)}" style="width:80px"></td>
        <td><input type="number" step="any" data-p="cant" value="${p.cant || ''}" style="width:70px"></td>
        <td>${f.compra ? `<span class="num" title="Precio de la compra del ${fmtFecha(f.compra.fecha)}"><b>${fmt(f.precio)}</b> <span class="peq">compra ${fmtFecha(f.compra.fecha)}</span></span>` : `<input type="number" step="any" data-p="precio" value="${p.precio || ''}" style="width:85px">`}</td>
        <td class="num peq">${fmt(f.unit)}</td>
        <td><input type="number" step="any" data-p="bultos" value="${p.bultos || ''}" style="width:75px"></td>
        <td><input type="number" step="any" data-p="unidades" value="${p.unidades || ''}" style="width:75px"></td>
        <td class="num">${fmt(f.mb)}</td><td class="num">${fmt(f.mu)}</td><td class="num"><b>${fmt(f.total)}</b></td>
        <td class="num peq">${a ? (n(a.bultos) || '') + (n(a.unidades) ? ' + ' + n(a.unidades) + ' u' : '') : ''}</td>
        <td><button class="x" data-borrar-prod="${esc(p.id)}" title="Quitar producto">✕</button></td></tr>`;
    });
    $('#p-inventario').innerHTML = `
      <div class="totales">
        <div>Inventario ${esc(e.mes || 'del mes')} $<b>${fmt(total) || '0,00'}</b></div>
        <div>Inventario anterior (${esc(ant.mes || '')}) $<b>${fmt(n(ant.total)) || '0,00'}</b></div>
        <div>Variación<b style="${signo(total - n(ant.total))}">${fmt(total - n(ant.total)) || '0,00'}</b></div>
        <div>Productos<b>${(e.inventario || []).length}</b></div>
      </div>
      <div class="fila-flex" style="margin-bottom:10px">
        <input type="text" id="invBuscar" placeholder="Buscar producto…" value="${esc(FI.texto)}" style="min-width:220px">
        <label class="peq"><input type="checkbox" id="invExistencia" ${FI.existencia ? 'checked' : ''}> Solo con existencia</label>
        <button class="btn" id="invAgregar">+ Agregar producto</button>
        <button class="btn" id="invCopiar">Copiar cantidades del mes anterior</button>
        <span class="peq">Precios en $. Cuente la mercancía y escriba los bultos y las unidades sueltas. Si un producto tiene una compra este mes con "Producto del inventario" y "Precio $", se usa ese precio.</span>
      </div>
      <div class="tabla-wrap"><table>
        <tr><th>Producto</th><th>Unidad</th><th>Unid. por paquete</th><th>Precio por paca $</th><th class="num">Precio unidad</th><th>Inventario bultos</th><th>Inventario unidades</th><th class="num">Monto bultos</th><th class="num">Monto unidades</th><th class="num">Total</th><th class="num">Mes anterior</th><th></th></tr>
        ${filas.join('')}
      </table></div>`;
  }

  function renderResumen() {
    const e = E(), c = calcular();
    const fila = (t, bs, usd, extra) => `<tr><td>${t}</td><td class="num">${bs === null ? '' : fmt(bs) || '0,00'}</td><td class="num">${usd === null ? '' : fmt(usd) || '0,00'}</td><td class="peq">${extra || ''}</td></tr>`;
    $('#p-resumen').innerHTML = `
      <div class="totales">
        <div>Ventas $<b>${fmt(c.ventas) || '0,00'}</b></div>
        <div>Gastos y compras $<b>${fmt(c.gastos) || '0,00'}</b></div>
        <div>Ganancia bruta $<b>${fmt(c.bruta) || '0,00'}</b><span class="peq">${pct(c.bruta / c.ventas)} de las ventas</span></div>
        <div>Ganancia neta $<b>${fmt(c.neta) || '0,00'}</b><span class="peq">${pct(c.neta / c.ventas)} de las ventas</span></div>
        <div>Tasa de cierre<b>${fmt4(c.tasa)}</b></div>
      </div>
      <div class="fila-flex" style="align-items:flex-start;gap:14px">
        <div class="panel" style="flex:1;min-width:380px">
          <h2>Resumen ${esc(e.mes)}</h2>
          <table><tr><th></th><th class="num">Bs.</th><th class="num">$</th><th></th></tr>
            ${fila('<b>VENTAS</b>', null, c.ventas, 'pestaña Ventas')}
            ${fila('COMPRAS', c.compras.bs, c.compras.usd)}
            ${fila('GASTOS EXTRAS', c.extras.bs, c.extras.usd)}
            ${fila('GASTOS FIJOS', c.fijos.bs, c.fijos.usd, 'incluye comisiones')}
            ${fila('EFECTIVO BS', c.efectivoBs, c.efectivoBsUsd)}
            ${fila('EFECTIVO $', null, c.divisas)}
            ${fila('VALES SOCIOS', c.vales.bs, c.valesUsd)}
            ${fila('BANCOS', c.bancosBs, c.bancosUsd)}
            ${fila('<b>GANANCIA BRUTA</b>', null, c.bruta, 'dinero disponible + gastos extras + gastos fijos · ' + pct(c.bruta / c.ventas))}
            ${fila('<b>GANANCIA NETA</b>', null, c.neta, 'dinero disponible + gastos extras · ' + pct(c.neta / c.ventas))}
            ${fila('INVENTARIO ' + esc(e.mes || ''), null, c.invActual)}
            ${fila('INVENTARIO ' + esc((e.invAnterior || {}).mes || 'ANTERIOR'), null, c.invAnterior)}
            ${fila('VARIACIÓN INVENTARIO', null, c.invVariacion)}
          </table>
        </div>
        <div class="panel" style="flex:1;min-width:320px">
          <h2>Cuadre del mes ($)</h2>
          <table>
            ${fila('Ventas', null, c.ventas)}
            ${fila('− Compras', null, c.compras.usd)}
            ${fila('− Gastos extras', null, c.extras.usd)}
            ${fila('− Gastos fijos', null, c.fijos.usd)}
            ${fila('<b>Debería quedar</b>', null, c.debeQuedar)}
            ${fila('Bancos', null, c.bancosUsd)}
            ${fila('Efectivo Bs', null, c.efectivoBsUsd)}
            ${fila('Efectivo divisas', null, c.divisas)}
            ${fila('Vales socios', null, c.valesUsd)}
            ${fila('<b>Hay</b>', null, c.disponible)}
            <tr><td><b>Diferencia (debería quedar − hay)</b></td><td></td><td class="num"><b style="${signo(-c.diferencia)}">${fmt(c.diferencia) || '0,00'}</b></td><td></td></tr>
          </table>
        </div>
      </div>
      <div class="panel">
        <h2>A repartir</h2>
        <div class="fila-flex" style="margin-bottom:8px">
          <label class="peq">Socios: <input type="text" id="socios" value="${esc((e.socios || []).join(', '))}" style="min-width:260px"></label>
          <label class="peq">Reserva de divisas que no se reparte ($): <input type="number" step="any" id="reserva" value="${e.reparto.reserva || ''}" style="width:110px"></label>
        </div>
        <div class="tabla-wrap"><table>
          <tr><th>Socio</th><th class="num">Bolívares c/u</th><th class="num">Vales en Bs</th><th class="num">Total a repartir Bs</th><th class="num">Divisas c/u</th><th>Vales en divisa</th><th class="num">Divisas físicas</th><th>Divisas en Banesco</th><th class="num">Total divisas $</th></tr>
          ${c.reparto.map((r) => `<tr><td><b>${esc(r.socio)}</b></td><td class="num">${fmt(r.bsCU)}</td><td class="num">${fmt(r.vale)}</td><td class="num"><b>${fmt(r.recibirBs) || '0,00'}</b></td><td class="num">${fmt(r.divCU)}</td>
            <td><input type="number" step="any" data-vale-div="${esc(r.socio)}" value="${e.reparto.valeDivisa[r.socio] || ''}" style="width:90px"></td><td class="num">${fmt(r.fisicas)}</td>
            <td><input type="number" step="any" data-banesco="${esc(r.socio)}" value="${e.reparto.banesco[r.socio] || ''}" style="width:90px"></td><td class="num"><b>${fmt(r.totalDiv) || '0,00'}</b></td></tr>`).join('')}
          <tr><td><b>TOTAL</b></td>${['bsCU', 'vale', 'recibirBs', 'divCU', 'valeDiv', 'fisicas', 'banesco', 'totalDiv'].map((k) => `<td class="num"><b>${fmt(c.reparto.reduce((s, r) => s + r[k], 0)) || '0,00'}</b></td>`).join('')}</tr>
        </table></div>
        <p class="peq">Bolívares c/u = (bancos + efectivo Bs + vales) ÷ número de socios; se le descuentan los vales de cada socio (pestaña Anticipo socios). Divisas c/u = (efectivo $ − reserva) ÷ número de socios.</p>
      </div>`;
  }

  function render(activa) {
    if (activa === 'ventas') renderVentas();
    if (activa === 'bancos') renderBancos();
    if (activa === 'inventario') renderInventario();
    if (activa === 'resumen') renderResumen();
    const dl = $('#listaProductos');
    if (dl && dl.childElementCount !== (E().inventario || []).length) dl.innerHTML = (E().inventario || []).map((p) => `<option value="${esc(p.nombre)}">`).join('');
  }

  // =====================================================================
  // EVENTOS
  // =====================================================================
  const listo = () => { FM.guardar(); FM.render(); };
  document.addEventListener('change', (ev) => {
    const t = ev.target, e = E();
    if (t.dataset.venta) {
      const f = t.closest('tr').dataset.dia;
      e.ventas[f] = e.ventas[f] || {};
      e.ventas[f][t.dataset.venta] = parseFloat(t.value) || 0;
      listo();
    } else if (t.dataset.ajuste !== undefined) {
      const a = e.ajustesDivisas[+t.dataset.ajuste];
      a[t.dataset.k] = t.dataset.k === 'monto' ? parseFloat(t.value) || 0 : t.value;
      listo();
    } else if (t.dataset.banco) {
      if (t.value === '') delete e.bancosManual[t.dataset.banco]; else e.bancosManual[t.dataset.banco] = parseFloat(t.value) || 0;
      listo();
    } else if (t.id === 'efectivoBs' || t.id === 'divisas' || t.id === 'tasaCierre') {
      e[t.id] = parseFloat(t.value) || 0; listo();
    } else if (t.dataset.p) {
      const p = e.inventario.find((x) => x.id === t.closest('tr').dataset.prod);
      const k = t.dataset.p;
      p[k] = ['nombre', 'unidad'].includes(k) ? t.value : parseFloat(t.value) || 0;
      listo();
    } else if (t.id === 'invExistencia') {
      FI.existencia = t.checked; renderInventario();
    } else if (t.id === 'socios') {
      e.socios = t.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean); listo();
    } else if (t.id === 'reserva') {
      e.reparto.reserva = parseFloat(t.value) || 0; listo();
    } else if (t.dataset.valeDiv) {
      e.reparto.valeDivisa[t.dataset.valeDiv] = parseFloat(t.value) || 0; listo();
    } else if (t.dataset.banesco) {
      e.reparto.banesco[t.dataset.banesco] = parseFloat(t.value) || 0; listo();
    }
  });
  let tBus;
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'invBuscar') {
      clearTimeout(tBus);
      tBus = setTimeout(() => { FI.texto = ev.target.value.trim().toLowerCase(); renderInventario(); const i = $('#invBuscar'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    }
  });
  document.addEventListener('click', (ev) => {
    const t = ev.target, e = E();
    if (t.id === 'llenarVentas') llenarVentas();
    else if (t.id === 'agregarAjuste') { e.ajustesDivisas.push({ concepto: '', monto: 0 }); listo(); }
    else if (t.dataset.borrarAjuste !== undefined) { e.ajustesDivisas.splice(+t.dataset.borrarAjuste, 1); listo(); }
    else if (t.id === 'invAgregar') {
      const nombre = prompt('Nombre del producto nuevo:'); if (!nombre) return;
      e.inventario.push({ id: 'p' + Date.now().toString(36), nombre: nombre.trim().toUpperCase(), unidad: 'UND', cant: 1, precio: 0, bultos: 0, unidades: 0 });
      e.inventario.sort((a, b) => a.nombre.localeCompare(b.nombre));
      listo();
    } else if (t.dataset.borrarProd) {
      if (!confirm('¿Quitar este producto del inventario?')) return;
      e.inventario = e.inventario.filter((p) => p.id !== t.dataset.borrarProd); listo();
    } else if (t.id === 'invCopiar') {
      if (!confirm('Se copiarán las cantidades del mes anterior en los productos que todavía están vacíos. ¿Continuar?')) return;
      const ant = (e.invAnterior || { items: {} }).items;
      let k = 0;
      for (const p of e.inventario) { const a = ant[p.nombre]; if (a && !n(p.bultos) && !n(p.unidades) && (n(a.bultos) || n(a.unidades))) { p.bultos = a.bultos; p.unidades = a.unidades; k++; } }
      listo(); FM.toast(k + ' productos copiados');
    }
  });

  // =====================================================================
  // EXCEL COMPLETO DEL CIERRE (con fórmulas, igual que el archivo de cierre)
  // =====================================================================
  function serial(f) { const [y, m, d] = f.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; }
  class Hoja {
    constructor() { this.ws = {}; this.maxR = 0; this.maxC = 0; }
    set(addr, v, z) {
      if (v === null || v === undefined || v === '') return;
      const c = XLSX.utils.decode_cell(addr);
      this.maxR = Math.max(this.maxR, c.r); this.maxC = Math.max(this.maxC, c.c);
      let cel;
      if (typeof v === 'object' && v.f) cel = { t: 'n', f: v.f.replace(/^=/, '') };
      else if (typeof v === 'object' && v.fecha) cel = { t: 'n', v: serial(v.fecha), z: 'dd/mm/yyyy' };
      else if (typeof v === 'number') cel = { t: 'n', v };
      else cel = { t: 's', v: String(v) };
      if (z) cel.z = z;
      this.ws[addr] = cel;
    }
    fila(r, valores, formatos) { valores.forEach((v, i) => this.set(XLSX.utils.encode_col(i) + r, v, formatos && formatos[i])); }
    hecha(anchos) {
      this.ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: this.maxR, c: this.maxC } });
      if (anchos) this.ws['!cols'] = anchos.map((w) => ({ wch: w }));
      return this.ws;
    }
  }
  const BS = '#,##0.00', TASA = '#,##0.0000', PCT = '0.0%';
  const q = (nombre) => "'" + nombre.replace(/'/g, "''") + "'";

  function exportar() {
    const e = E(), c = calcular();
    const wb = XLSX.utils.book_new();
    const mes = (e.mes || '').toUpperCase();
    const titulo = 'FIN DE MES ' + mes;
    const ref = {};
    const hojaInv = 'INVENTARIO ' + (FM.mesTrabajo().slice(0, 4));
    const hojaRes = ('RESUMEN ' + mes).slice(0, 31);

    // ---- VENTAS ----
    {
      const h = new Hoja();
      h.set('A1', titulo); h.set('A3', 'VENTA DIARIA');
      h.fila(4, ['FECHA', 'PUNTO DE VENTA', 'PAGO MOVIL', 'BOLIVARES EFECTIVO', 'BIOPAGO', 'DIVISAS', 'TOTAL VENTAS', 'TOTAL VENTAS SISTEMA', 'DIFERENCIAS']);
      let r = 5;
      for (const f of c.dias) {
        const v = e.ventas[f] || {};
        h.fila(r, [{ fecha: f }, n(v.pdv) || null, n(v.pm) || null, n(v.efbs) || null, n(v.bio) || null, n(v.div) || null, { f: `SUM(B${r}:F${r})` }, n(v.sistema) || null, { f: `+G${r}-H${r}` }],
          [null, BS, BS, BS, BS, BS, BS, BS, BS]);
        r++;
      }
      const T = r;
      h.fila(T, ['TOTAL'].concat('BCDEFGHI'.split('').map((L) => ({ f: `SUM(${L}5:${L}${T - 1})` }))), [null, BS, BS, BS, BS, BS, BS, BS, BS]);
      ref.ventas = `VENTAS!G${T}`;
      // Control de divisas
      let k = T + 2;
      h.set('E' + k, 'DIVISAS DE LAS VENTAS'); h.set('F' + k, { f: `+F${T}` }, BS); const ini = k; k++;
      for (const a of e.ajustesDivisas || []) { h.set('E' + k, (a.concepto || 'AJUSTE').toUpperCase()); h.set('F' + k, n(a.monto), BS); k++; }
      h.set('E' + k, 'TOTAL DIVISAS'); h.set('F' + k, { f: `SUM(F${ini}:F${k - 1})` }, BS); const tot = k; k++;
      h.set('E' + k, 'GASTOS PAGADOS EN DIVISAS'); h.set('F' + k, c.gDiv, BS); k++;
      h.set('E' + k, 'DIVISAS QUE DEBEN QUEDAR'); h.set('F' + k, { f: `+F${tot}-F${k - 1}` }, BS);
      XLSX.utils.book_append_sheet(wb, h.hecha([12, 16, 14, 18, 12, 14, 16, 20, 14]), 'VENTAS');
    }

    // ---- BANCOS Y EFECTIVO ----
    {
      const h = new Hoja();
      h.set('B3', 'BANCOS'); h.fila(4, [null, 'BANCO', 'BOLIVARES', 'SEGUN EXTRACTO', 'FECHA EXTRACTO']);
      FM.CUENTAS.forEach((cta, i) => {
        const s = saldoExtracto(cta);
        h.fila(5 + i, [null, cta, saldoCuenta(cta), s ? s.saldo : null, s ? { fecha: s.fecha } : null], [null, null, BS, BS]);
      });
      const u = 5 + FM.CUENTAS.length - 1;
      h.set('B' + (u + 1), 'TOTAL BANCOS'); h.set('C' + (u + 1), { f: `SUM(C5:C${u})` }, BS);
      h.set('B' + (u + 2), 'EFECTIVO'); h.set('C' + (u + 2), c.efectivoBs, BS);
      h.set('B' + (u + 3), 'BOLIVARES SOBERANOS'); h.set('C' + (u + 3), { f: `+C${u + 1}+C${u + 2}` }, BS);
      h.set('B' + (u + 5), 'DIVISAS'); h.set('C' + (u + 5), c.divisas, BS);
      h.set('B' + (u + 7), 'TASA DE CIERRE'); h.set('C' + (u + 7), c.tasa, TASA);
      ref.bancos = `${q('BANCOS Y EFECTIVO')}!C${u + 1}`; ref.efectivoBs = `${q('BANCOS Y EFECTIVO')}!C${u + 2}`;
      ref.divisas = `${q('BANCOS Y EFECTIVO')}!C${u + 5}`; ref.tasa = `${q('BANCOS Y EFECTIVO')}!C${u + 7}`;
      XLSX.utils.book_append_sheet(wb, h.hecha([2, 26, 18, 18, 14]), 'BANCOS Y EFECTIVO');
    }

    // ---- GASTOS EXTRAS, GASTOS FIJOS, COMPRAS ----
    for (const cat of ['extra', 'fijo', 'compra']) {
      const nombre = FM.HOJA[cat];
      const h = new Hoja();
      h.set('A1', titulo); h.set('A2', nombre);
      const cab = ['FECHA', 'FACTURA', 'BENEFICIARIO', 'DESCRIPCION', 'BOLIVARES', 'TASA', 'MONTO', 'REFERENCIA ', 'BANCO', 'BANCO RECEPTOR'];
      h.fila(3, cat === 'compra' ? cab.concat(['PRESENTACION', 'PRECIO', 'PRODUCTO INVENTARIO']) : cab);
      let r = 5;
      const fmts = [null, null, null, null, BS, TASA, BS, null, null, null, null, BS];
      for (const x of FM.items(cat)) {
        const monto = x.bs ? (x.tasa ? { f: `+E${r}/F${r}` } : null) : x.usd || null;
        const fila = [x.fecha ? { fecha: x.fecha } : null, x.factura, x.beneficiario, x.descripcion || x.descBanco, x.bs || null, x.bs ? x.tasa || null : null, monto, x.referencia, x.banco, x.receptor];
        if (cat === 'compra') fila.push(x.presentacion, n(x.precio) || null, x.producto);
        h.fila(r, fila, fmts); r++;
      }
      if (cat === 'fijo') {
        for (const x of FM.comisionesPorCuenta()) {
          h.fila(r, [x.fecha ? { fecha: x.fecha } : null, null, null, 'COMISIONES BANCARIAS ' + x.cuenta, x.bs, x.tasa || null, x.tasa ? { f: `+E${r}/F${r}` } : null, null, x.cuenta], fmts); r++;
        }
      }
      const T = Math.max(r, 6);
      h.fila(T, ['TOTAL ' + nombre, null, null, null, { f: `SUM(E5:E${T - 1})` }, null, { f: `SUM(G5:G${T - 1})` }], fmts);
      ref[cat] = { bs: `${q(nombre)}!E${T}`, usd: `${q(nombre)}!G${T}` };
      XLSX.utils.book_append_sheet(wb, h.hecha([12, 10, 30, 42, 16, 11, 12, 16, 20, 18, 16, 10, 28]), nombre);
    }

    // ---- INVENTARIO ----
    {
      const h = new Hoja();
      h.fila(1, ['PRODUCTOS', 'UNIDAD', 'CANTIDAD DE UNIDADES POR PAQUETE', 'PRECIO POR PACA', 'PRECIO POR UNIDAD', 'INVENTARIO  POR BULTO', 'INVENTARIO POR UNIDAD', 'MONTO $$ BULTO', 'MONTO $$ UNIDAD ', 'TOTAL DEL INVENTARIO ']);
      let r = 2;
      for (const p of e.inventario || []) {
        const f = filaInv(p);
        h.fila(r, [p.nombre, p.unidad, n(p.cant) || 1, f.precio, { f: `+D${r}/C${r}` }, n(p.bultos) || null, n(p.unidades) || null, { f: `F${r}*D${r}` }, { f: `G${r}*E${r}` }, { f: `I${r}+H${r}` }],
          [null, null, null, BS, BS, null, null, BS, BS, BS]);
        r++;
      }
      h.fila(r, ['TOTAL', null, null, null, null, null, null, { f: `SUM(H2:H${r - 1})` }, { f: `SUM(I2:I${r - 1})` }, { f: `SUM(J2:J${r - 1})` }], [null, null, null, null, null, null, null, BS, BS, BS]);
      ref.inventario = `${q(hojaInv)}!J${r}`;
      XLSX.utils.book_append_sheet(wb, h.hecha([40, 10, 12, 12, 12, 12, 12, 12, 12, 14]), hojaInv);
    }

    // ---- ANTICIPO SOCIOS ----
    {
      const h = new Hoja();
      const socios = c.socios;
      const colS = (i) => XLSX.utils.encode_col(2 + i);
      const colRef = 2 + socios.length;
      h.set('A4', 'APORTES SOCIOS');
      h.fila(5, ['FECHA', 'DESCRIPCION'].concat(socios.map((s) => s + ' Bs.-'), ['REFERENCIA', 'BANCO', 'BANCO DESTINO']));
      let r = 6;
      for (const x of FM.items('socio')) {
        const fila = [x.fecha ? { fecha: x.fecha } : null, x.descripcion || x.descBanco];
        socios.forEach((s) => fila.push(x.socio === s ? x.bs : null));
        fila.push(x.referencia, x.banco, x.receptor);
        h.fila(r, fila, [null, null].concat(socios.map(() => BS))); r++;
        if (!socios.includes(x.socio)) h.set(XLSX.utils.encode_col(colRef + 3) + (r - 1), 'SIN SOCIO: ' + fmt(x.bs) + ' Bs');
      }
      const T = Math.max(r, 7);
      h.set('B' + T, 'TOTAL');
      socios.forEach((s, i) => h.set(colS(i) + T, { f: `SUM(${colS(i)}6:${colS(i)}${T - 1})` }, BS));
      h.set('B' + (T + 2), 'Bolivares'); h.set('C' + (T + 2), socios.length ? { f: socios.map((s, i) => colS(i) + T).join('+') } : 0, BS);
      h.set('B' + (T + 3), '$'); h.set('C' + (T + 3), { f: `+C${T + 2}/${ref.tasa}` }, BS);
      ref.vales = `${q('ANTICIPO SOCIOS')}!C${T + 2}`;
      ref.valeSocio = Object.fromEntries(socios.map((s, i) => [s, `${q('ANTICIPO SOCIOS')}!${colS(i)}${T}`]));
      XLSX.utils.book_append_sheet(wb, h.hecha([12, 40].concat(socios.map(() => 14), [16, 18, 18])), 'ANTICIPO SOCIOS');
    }

    // ---- RESUMEN ----
    {
      const h = new Hoja();
      h.set('F1', 'TASA'); h.set('G1', { f: '+' + ref.tasa }, TASA);
      h.set('B3', 'RESUMEN MES DE ' + mes);
      h.set('B4', 'INGRESOS'); h.set('F4', 'GASTOS');
      h.fila(5, [null, null, null, 'Bs.-', '$', 'Bs.-', '$']);
      h.set('B6', 'VENTAS'); h.set('E6', { f: '+' + ref.ventas }, BS);
      h.set('B7', 'COMPRAS'); h.set('F7', { f: '+' + ref.compra.bs }, BS); h.set('G7', { f: '+' + ref.compra.usd }, BS);
      h.set('B8', 'GASTOS EXTRAS'); h.set('F8', { f: '+' + ref.extra.bs }, BS); h.set('G8', { f: '+' + ref.extra.usd }, BS);
      h.set('B9', 'GASTOS FIJOS'); h.set('F9', { f: '+' + ref.fijo.bs }, BS); h.set('G9', { f: '+' + ref.fijo.usd }, BS);
      h.set('B10', 'EFECTIVO BS'); h.set('D10', { f: '+' + ref.efectivoBs }, BS); h.set('E10', { f: '+D10/G1' }, BS);
      h.set('B11', 'EFECTIVO $'); h.set('E11', { f: '+' + ref.divisas }, BS);
      h.set('B12', 'VALES SOCIOS'); h.set('F12', { f: '+' + ref.vales }, BS); h.set('G12', { f: '+F12/G1' }, BS);
      h.set('B13', 'BANCOS'); h.set('D13', { f: '+' + ref.bancos }, BS); h.set('E13', { f: '+D13/G1' }, BS);
      h.set('B14', 'TOTALES'); h.set('D14', { f: '+D10+D13' }, BS); h.set('F14', { f: 'SUM(F7:F12)' }, BS); h.set('G14', { f: 'SUM(G7:G12)' }, BS);
      h.set('B15', 'GANANCIA BRUTA'); h.set('E15', { f: '+E10+E11+E13+G12+G8+G9' }, BS); h.set('G15', { f: 'IF(E6=0,0,E15/E6)' }, PCT);
      h.set('B16', 'GANANCIA NETA'); h.set('E16', { f: '+E10+E11+E13+G12+G8' }, BS); h.set('G16', { f: 'IF(E6=0,0,E16/E6)' }, PCT);
      h.set('B18', 'INV. ' + mes); h.set('E18', { f: '+' + ref.inventario }, BS);
      h.set('B19', 'INV. ' + ((e.invAnterior || {}).mes || 'ANTERIOR').toUpperCase()); h.set('E19', c.invAnterior, BS);
      h.set('B20', 'DIFERENCIA INVENTARIO'); h.set('E20', { f: '+E18-E19' }, BS);
      // Cuadre (columna derecha, como en el cierre)
      h.set('L3', 'VENTAS'); h.set('M3', { f: '+E6' }, BS);
      h.set('L4', 'GASTOS EXTRAS'); h.set('N4', { f: '+G8' }, BS);
      h.set('L5', 'GASTOS FIJOS'); h.set('N5', { f: '+G9' }, BS);
      h.set('L6', 'COMPRAS'); h.set('N6', { f: '+G7' }, BS);
      h.set('M7', { f: '+M3' }, BS); h.set('N7', { f: 'SUM(N4:N6)' }, BS);
      h.set('L8', 'DEBERIA QUEDAR'); h.set('M8', { f: '+M7-N7' }, BS);
      h.set('L11', 'BANCOS'); h.set('M11', { f: '+E13' }, BS);
      h.set('L12', 'EFECTIVO BS'); h.set('M12', { f: '+E10' }, BS);
      h.set('L13', 'EFECTIVO DIVISAS  $'); h.set('M13', { f: '+E11' }, BS);
      h.set('L14', 'VALES SOCIOS'); h.set('M14', { f: '+G12' }, BS);
      h.set('L15', 'HAY'); h.set('M15', { f: 'SUM(M11:M14)' }, BS);
      h.set('L17', 'DIFERENCIA'); h.set('M17', { f: '+M8-M15' }, BS);
      // A repartir
      h.set('E23', 'A REPARTIR'); h.set('H22', 'RESERVA DIVISAS $'); h.set('I22', n(e.reparto.reserva), BS);
      h.fila(24, [null, 'SOCIOS', 'BOLIVARES  C/U', 'VALE EN Bs.', 'TOTAL REPARTIR BS.', 'DIVISAS DE LAS VENTAS', 'VALES EN DIVISA', 'TOTAL A REPARTIR DIVISAS FISICAS', 'DIVISAS EN BANESCO', 'TOTAL DIVISAS A REPARTIR $']);
      const ns = c.socios.length || 1;
      let r = 25;
      for (const s of c.socios) {
        h.fila(r, [null, s, { f: `+($D$14+$F$12)/${ns}` }, { f: '+' + ref.valeSocio[s] }, { f: `+C${r}-D${r}` }, { f: `+($E$11-$I$22)/${ns}` }, n(e.reparto.valeDivisa[s]) || null, { f: `+F${r}-G${r}` }, n(e.reparto.banesco[s]) || null, { f: `+H${r}+I${r}` }],
          [null, null, BS, BS, BS, BS, BS, BS, BS, BS]);
        r++;
      }
      h.fila(r, [null, 'TOTAL'].concat('CDEFGHIJ'.split('').map((L) => ({ f: `SUM(${L}25:${L}${r - 1})` }))), [null, null, BS, BS, BS, BS, BS, BS, BS, BS]);
      XLSX.utils.book_append_sheet(wb, h.hecha([2, 24, 16, 16, 18, 16, 14, 18, 16, 18, 2, 22, 16, 16]), hojaRes);
    }

    // ---- EXTRACTOS (todos los movimientos con su clasificación) ----
    {
      const h = new Hoja();
      h.set('A1', titulo); h.set('A2', 'EXTRACTOS BANCARIOS');
      h.fila(4, ['FECHA', 'BANCO', 'REFERENCIA', 'DESCRIPCION BANCO', 'EGRESO Bs', 'INGRESO Bs', 'SALDO', 'CLASIFICACION', 'BENEFICIARIO', 'DESCRIPCION']);
      let r = 5;
      for (const m of e.movs) {
        const cl = e.clasif[m.id] || {}, cat = FM.categoria(m).cat;
        h.fila(r++, [{ fecha: m.fecha }, FM.cuentaDe(m), m.referencia, m.descripcion, m.debito || null, m.credito || null, m.saldo || null, cat ? FM.NOMBRE_CAT[cat].toUpperCase() : 'SIN CLASIFICAR', cl.beneficiario, cl.descripcion], [null, null, null, null, BS, BS, BS]);
      }
      XLSX.utils.book_append_sheet(wb, h.hecha([12, 22, 16, 45, 14, 14, 16, 24, 28, 35]), 'EXTRACTOS');
    }

    XLSX.writeFile(wb, 'CIERRE DE MES ' + (mes || 'MES') + '.xlsx');
  }

  window.Cierre = { render, exportar, calcular, inventarioComoAnterior, saldoExtracto };
  FM.render();
})();
