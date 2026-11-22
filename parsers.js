/* Lectores de extractos bancarios.
 * Cada lector recibe el archivo y devuelve:
 *   { formato, claveCuenta, cuentaSugerida, aviso, movimientos: [{fecha, referencia, descripcion, debito, credito, saldo}] }
 * fecha en formato AAAA-MM-DD, montos en bolívares (números positivos).
 */
(function (global) {
  'use strict';

  // ---------- utilidades ----------
  // Convierte "1.234,56", "+6.247,00", "763777,97", "84716.52", -5942.75 a número.
  function num(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[\s 'Bs$]/g, '').replace(/^\+/, '');
    if (!s || s === '-') return 0;
    const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
    if (coma >= 0 && punto >= 0) {
      if (coma > punto) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (coma >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (punto >= 0 && /^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
      s = s.replace(/\./g, ''); // 1.234.567 sin decimales
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  const MESES = { ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12 };
  const pad = (n) => String(n).padStart(2, '0');

  // Acepta 2026/11/09, 09/11/2026, 09/11/26, "16/11/2026 11:14 AM", 16NOV2026, números de Excel.
  function fecha(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (typeof v === 'number') { // fecha serial de Excel
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
    m = s.replace(/[^0-9A-Za-z]/g, '').match(/^(\d{1,2})([A-Za-z]{3})(\d{4})$/);
    if (m && MESES[m[2].toUpperCase()]) return m[3] + '-' + pad(MESES[m[2].toUpperCase()]) + '-' + pad(m[1]);
    return '';
  }

  const limpiar = (s) => String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
  const ref = (s) => limpiar(s).replace(/^'+/, '');

  function mov(f, r, d, monto, saldo) {
    return { fecha: f, referencia: ref(r), descripcion: limpiar(d), debito: monto < 0 ? -monto : 0, credito: monto > 0 ? monto : 0, saldo: saldo };
  }

  // ---------- lectura de archivos ----------
  function decodificar(buf) {
    const utf = new TextDecoder('utf-8').decode(buf);
    if (utf.indexOf('�') === -1) return utf;
    return new TextDecoder('windows-1252').decode(buf);
  }

  function esHTML(buf) {
    const ini = new TextDecoder('latin1').decode(buf.slice(0, 400)).replace(/^﻿/, '').trim().toLowerCase();
    return ini.startsWith('<');
  }

  // Tabla HTML -> matriz de textos
  function tablasHTML(texto) {
    const doc = new DOMParser().parseFromString(texto, 'text/html');
    return Array.from(doc.querySelectorAll('table')).map((t) =>
      Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => limpiar(c.textContent))));
  }

  // Excel real -> matriz (primera hoja)
  function tablaExcel(buf, reparar) {
    if (reparar) buf = repararXlsx(buf);
    // Fechas como número de serie de Excel (se convierten en fecha() sin depender de la zona horaria)
    const wb = XLSX.read(buf, { type: 'array' });
    return wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
  }

  // Algunos bancos generan .xlsx con espacios dobles dentro de las etiquetas XML
  // (<c  t="inlineStr">) que la librería no entiende: se normalizan y se vuelve a leer.
  function repararXlsx(buf) {
    const zip = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
    for (const e of zip.FileIndex) {
      if (!/\.(xml|rels)$/i.test(e.name) || !e.content) continue;
      const t = new TextDecoder('utf-8').decode(e.content)
        .replace(/<([^>]*)>/g, (m, dentro) => '<' + dentro.replace(/\s+/g, ' ').replace(/ (\/?)$/, '$1') + '>');
      e.content = new TextEncoder().encode(t);
      e.size = e.content.length;
    }
    return XLSX.CFB.write(zip, { type: 'array', fileType: 'zip' });
  }

  const norm = (s) => limpiar(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function filaEncabezado(m, ...palabras) {
    for (let i = 0; i < Math.min(m.length, 30); i++) {
      const f = m[i].map(norm);
      if (palabras.every((p) => f.some((c) => c === p || c.startsWith(p)))) return i;
    }
    return -1;
  }
  const col = (fila, palabra) => fila.map(norm).findIndex((c) => c === palabra || c.startsWith(palabra));

  // ---------- formatos ----------

  // Banesco: Fecha | Referencia | Descripción | Monto (+/-) | Balance. El nombre del archivo es el RIF/CI.
  function banesco(m, nombre) {
    const h = filaEncabezado(m, 'fecha', 'referencia', 'descripcion', 'monto', 'balance');
    if (h < 0) return null;
    const idx = { f: col(m[h], 'fecha'), r: col(m[h], 'referencia'), d: col(m[h], 'descripcion'), m: col(m[h], 'monto'), b: col(m[h], 'balance') };
    const movimientos = [];
    for (const row of m.slice(h + 1)) {
      const f = fecha(row[idx.f]);
      if (!f) continue;
      movimientos.push(mov(f, row[idx.r], row[idx.d], num(row[idx.m]), num(row[idx.b])));
    }
    const id = (nombre.match(/([JVEGP])-?0*(\d{6,})/i) || []);
    const tipo = id[1] ? id[1].toUpperCase() : '';
    return {
      formato: 'Banesco',
      claveCuenta: 'banesco:' + (id[0] ? id[0].toUpperCase() : nombre),
      cuentaSugerida: tipo === 'J' ? 'BANESCO EMPRESA' : tipo ? 'BANESCO PERSONAL' : '',
      movimientos,
    };
  }

  // Bancamiga: encabezado con "Cuenta: 0172...", columnas Nro | Fecha | Referencia | Concepto | Débito | Crédito | Saldo
  function bancamiga(m) {
    const plano = m.slice(0, 8).map((r) => r.join(' ')).join(' ');
    if (!/bancamiga/i.test(plano) && filaEncabezado(m, 'concepto', 'debito', 'credito') < 0) return null;
    const h = filaEncabezado(m, 'fecha', 'referencia', 'concepto', 'debito', 'credito');
    if (h < 0) return null;
    const cuenta = (plano.match(/Cuenta:\s*(\d{10,20})/i) || [])[1] || '';
    const i = { f: col(m[h], 'fecha'), r: col(m[h], 'referencia'), c: col(m[h], 'concepto'), d: col(m[h], 'debito'), k: col(m[h], 'credito'), s: col(m[h], 'saldo') };
    const movimientos = [];
    for (const row of m.slice(h + 1)) {
      const f = fecha(row[i.f]);
      if (!f) continue;
      movimientos.push(mov(f, row[i.r], row[i.c], num(row[i.k]) - num(row[i.d]), num(row[i.s])));
    }
    return { formato: 'Bancamiga', claveCuenta: 'bancamiga:' + cuenta, cuentaSugerida: '', numeroCuenta: cuenta, movimientos };
  }

  // Excel con "Nro. Cuenta" y columnas Fecha | Referencia | Descripción | Egreso | Ingreso | Saldo
  function egresoIngreso(m) {
    const h = filaEncabezado(m, 'fecha', 'referencia', 'descripcion', 'egreso', 'ingreso');
    if (h < 0) return null;
    let cuenta = '';
    for (const r of m.slice(0, h)) {
      const k = r.findIndex((c) => /cuenta/i.test(String(c)));
      if (k >= 0) cuenta = String(r.slice(k + 1).find((c) => String(c).trim()) || '').trim();
    }
    const i = { f: col(m[h], 'fecha'), r: col(m[h], 'referencia'), d: col(m[h], 'descripcion'), e: col(m[h], 'egreso'), g: col(m[h], 'ingreso'), s: col(m[h], 'saldo') };
    const movimientos = [];
    for (const row of m.slice(h + 1)) {
      const d = limpiar(row[i.d]);
      const f = fecha(row[i.f]);
      if (!f || /^saldo (inicial|final)/i.test(d)) continue;
      movimientos.push(mov(f, row[i.r], d, num(row[i.g]) - Math.abs(num(row[i.e])), num(row[i.s])));
    }
    return { formato: 'Excel Egreso/Ingreso', claveCuenta: 'cuenta:' + cuenta, cuentaSugerida: 'MERCANTIL EMPRESA', numeroCuenta: cuenta, movimientos };
  }

  // Excel "Movimientos": Fecha y hora | Referencia | Tipo de operación | Moneda | Monto | Disponible
  function fechaHoraMonto(m) {
    const h = filaEncabezado(m, 'fecha y hora', 'referencia', 'tipo de operacion', 'monto');
    if (h < 0) return null;
    const i = { f: col(m[h], 'fecha'), r: col(m[h], 'referencia'), d: col(m[h], 'tipo de operacion'), m: col(m[h], 'monto'), s: col(m[h], 'disponible') };
    const movimientos = [];
    for (const row of m.slice(h + 1)) {
      const f = fecha(row[i.f]);
      if (!f) continue;
      movimientos.push(mov(f, row[i.r], row[i.d], num(row[i.m]), num(row[i.s])));
    }
    return { formato: 'Excel Fecha y hora', claveCuenta: 'formato:fecha-hora-monto', cuentaSugerida: 'BANCARIBE EMPRESA', movimientos };
  }

  // Histórico de operaciones de BDV: es un registro de accesos, no un estado de cuenta.
  function historicoBDV(m) {
    if (filaEncabezado(m, 'identificacionempresa', 'tipotransaccion') < 0) return null;
    return {
      formato: 'Histórico de operaciones (BDV)',
      claveCuenta: 'bdv:historico',
      cuentaSugerida: 'VENEZUELA EMPRESA',
      aviso: 'Este archivo es el "Histórico de operaciones" (inicios de sesión y operaciones hechas en línea), no el estado de cuenta. En BDV en línea descargue "Movimientos de la cuenta" o "Estado de cuenta".',
      movimientos: [],
    };
  }

  // Banco de Venezuela (BDV en línea, "Movimientos"): Día | Referencia | Descripción | Fecha | Tipo de Movimiento | Crédito | Débito | Saldo
  function bdv(m) {
    const h = filaEncabezado(m, 'referencia', 'descripcion', 'fecha', 'tipo de movimiento', 'credito', 'debito', 'saldo');
    if (h < 0) return null;
    const i = { r: col(m[h], 'referencia'), d: col(m[h], 'descripcion'), f: col(m[h], 'fecha'), c: col(m[h], 'credito'), b: col(m[h], 'debito'), s: col(m[h], 'saldo') };
    const movimientos = [];
    for (const row of m.slice(h + 1)) {
      const f = fecha(row[i.f]), d = limpiar(row[i.d]);
      if (!f || /^saldo (inicial|final)/i.test(d)) continue;
      movimientos.push(mov(f, row[i.r], d, Math.abs(num(row[i.c])) - Math.abs(num(row[i.b])), num(row[i.s])));
    }
    return { formato: 'Banco de Venezuela', claveCuenta: 'bdv:movimientos', cuentaSugerida: 'VENEZUELA EMPRESA', movimientos };
  }

  // Mercantil en línea (cuenta corriente): Tipo | Fecha | Referencia | Descripción | Monto Bs. (sin columna de saldo,
  // de lo más nuevo a lo más viejo, con una fila "SALDO FINAL" arriba). El saldo de cada movimiento se calcula.
  function mercantilMonto(m) {
    const h = filaEncabezado(m, 'tipo', 'fecha', 'referencia', 'descripcion', 'monto');
    if (h < 0 || col(m[h], 'saldo') >= 0) return null;
    let cuenta = '', saldoFinal = null;
    for (const r of m.slice(0, h)) {
      const t = r.map((c) => String(c)).join(' ');
      const c = t.match(/cuenta.*?(\d{4})\s*$/i); if (c) cuenta = c[1];
      if (/saldo final/i.test(t)) saldoFinal = num(r[r.length - 1]);
    }
    const i = { t: col(m[h], 'tipo'), f: col(m[h], 'fecha'), r: col(m[h], 'referencia'), d: col(m[h], 'descripcion'), m: col(m[h], 'monto') };
    const filas = [];
    for (const row of m.slice(h + 1)) {
      const f = fecha(row[i.f]), d = limpiar(row[i.d]);
      if (!f) continue;
      if (/^saldo final/i.test(d)) { saldoFinal = num(row[i.m]); continue; }
      if (/^saldo inicial/i.test(d)) continue;
      let monto = num(row[i.m]);
      const tipo = String(row[i.t]).trim().toUpperCase();
      if (tipo === 'ND') monto = -Math.abs(monto); else if (tipo === 'NC') monto = Math.abs(monto);
      filas.push({ f, r: row[i.r], d, monto });
    }
    let saldo = saldoFinal || 0;
    const movimientos = filas.map((x) => { const mv = mov(x.f, x.r, x.d, x.monto, Math.round(saldo * 100) / 100); saldo -= x.monto; return mv; });
    return { formato: 'Mercantil (cuenta corriente)', claveCuenta: 'mercantil:' + (cuenta || 'cc'), cuentaSugerida: 'MERCANTIL PERSONAL', numeroCuenta: cuenta ? '****' + cuenta : '', movimientos };
  }

  // Bancaribe (Mi Conexión, Excel sin encabezados): 1.ª fila = número de cuenta; luego
  // Fecha | Referencia | Descripción | D/C | Monto | Diferido | Disponible | Real
  function bancaribeExcel(m) {
    const filas = m.filter((r) => typeof r[0] === 'number' && r[0] > 30000 && r[0] < 80000 && /^[DC]$/.test(String(r[3]).trim()) && typeof r[4] === 'number');
    if (filas.length < 1 || filas.length < (m.length - 2) / 2) return null;
    const cuenta = String(typeof m[0][0] === 'number' ? BigInt(Math.round(m[0][0])).toString() : m[0][0]).replace(/\D/g, '');
    const movimientos = filas.map((r) => mov(fecha(r[0]), r[1], r[2], String(r[3]).trim() === 'D' ? -r[4] : r[4], num(r[6])));
    return { formato: 'Bancaribe (Excel)', claveCuenta: claveBancaribe(cuenta), cuentaSugerida: 'BANCARIBE PERSONAL', numeroCuenta: cuenta, movimientos };
  }
  // El Excel de Bancaribe trae el número de cuenta redondeado (1.14017E+18): se identifica la cuenta por sus primeros 13 dígitos
  const claveBancaribe = (cuenta) => 'bancaribe:' + String(cuenta).replace(/^0+/, '').slice(0, 13);

  const LECTORES_TABLA = [historicoBDV, bdv, bancamiga, egresoIngreso, fechaHoraMonto, mercantilMonto, bancaribeExcel];

  // ---------- PDF de Bancaribe (Conexión Bancaribe) ----------
  async function pdfBancaribe(buf) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    let cuenta = '', limiteTrans = null, textoTotal = '';
    const movimientos = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const items = (await pagina.getTextContent()).items
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, s: it.str.trim() }));
      textoTotal += ' ' + items.map((i) => i.s).join(' ');
      const c = textoTotal.match(/Cuenta\s*-\s*(\d{20})/);
      if (c) cuenta = c[1];
      const hTrans = items.find((i) => /^Transacci/i.test(i.s));
      if (hTrans) limiteTrans = hTrans.x - 12;

      // Agrupar por línea (misma y)
      const lineas = new Map();
      for (const it of items) {
        const k = Math.round(it.y);
        let clave = [...lineas.keys()].find((y) => Math.abs(y - k) <= 1);
        if (clave === undefined) { clave = k; lineas.set(k, []); }
        lineas.get(clave).push(it);
      }
      const anclas = [];
      for (const [y, its] of lineas) {
        its.sort((a, b) => a.x - b.x);
        // La fecha viene partida en "16", "NOV", "2026" (a veces con caracteres invisibles entre medio)
        const fm = its.map((i) => i.s).join('').replace(/[^0-9A-Za-z]/g, '').match(/^(\d{1,2})([A-Za-z]{3})(\d{4})/);
        const f = fm ? fecha(fm[0]) : '';
        if (!f) continue;
        const signoIt = its.find((i) => i.s === '+' || i.s === '-');
        if (!signoIt) continue;
        const despues = its.filter((i) => i.x > signoIt.x && /^[\d.,]+$/.test(i.s));
        const refIt = its.find((i) => /^\d{5,}$/.test(i.s));
        anclas.push({ y, f, signo: signoIt.s, signoX: signoIt.x, referencia: refIt ? refIt.s : '', monto: num(despues[0] && despues[0].s), saldo: num(despues[2] && despues[2].s) });
      }
      const lim = limiteTrans || 235;
      for (const a of anclas) {
        const desc = items
          .filter((i) => i.x >= lim && i.x < a.signoX - 2 && Math.abs(i.y - a.y) <= 18)
          .filter((i) => anclas.every((b) => b === a || Math.abs(i.y - a.y) <= Math.abs(i.y - b.y)))
          .sort((x, y) => y.y - x.y || x.x - y.x)
          .map((i) => i.s).join(' ');
        movimientos.push(mov(a.f, a.referencia, desc, a.signo === '-' ? -a.monto : a.monto, a.saldo));
      }
    }
    if (!movimientos.length) return null;
    const personas = /Bancaribe Personas/i.test(textoTotal);
    return { formato: 'PDF Bancaribe', claveCuenta: claveBancaribe(cuenta), cuentaSugerida: personas ? 'BANCARIBE PERSONAL' : 'BANCARIBE EMPRESA', numeroCuenta: cuenta, movimientos };
  }

  function probar(tablas, nombre) {
    for (const t of tablas) {
      for (const lector of LECTORES_TABLA) {
        const r = lector(t);
        if (r) return r;
      }
      const r = banesco(t, nombre);
      if (r) return r;
    }
    return null;
  }

  // ---------- punto de entrada ----------
  async function leerArchivo(nombre, buf) {
    const ext = (nombre.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') {
      const r = await pdfBancaribe(buf);
      if (r) return r;
      throw new Error('No se reconoció el formato del PDF. Por ahora se leen los PDF de Conexión Bancaribe.');
    }
    let tablas;
    if (esHTML(buf)) {
      tablas = tablasHTML(decodificar(buf));
      // Banesco usa el nombre del archivo (RIF) para identificar la cuenta
      for (const t of tablas) { const r = banesco(t, nombre); if (r) return r; }
    } else {
      tablas = tablaExcel(buf);
    }
    const r1 = probar(tablas, nombre);
    if (r1) return r1;
    if (!esHTML(buf)) {
      const r2 = probar(tablaExcel(buf, true), nombre);
      if (r2) return r2;
    }
    throw new Error('No se reconoció el formato de este archivo.');
  }

  // Excel oficial del BCV (2_1_2xYY_smc.xls): una hoja por día con "Fecha Valor: dd/mm/aaaa"
  // y la fila USD. Se toma Bs./M.E. Venta (ASK), que es la que se usa en el cierre de mes.
  function leerTasasBCV(buf) {
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const tasas = {};
    for (const n of wb.SheetNames) {
      const m = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      const fv = m.flat().map(String).find((c) => /fecha valor/i.test(c));
      const f = fv && fecha((fv.match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0]);
      const usd = m.find((r) => r.some((c) => String(c).trim().toUpperCase() === 'USD'));
      if (!f || !usd) continue;
      const nums = usd.map(num).filter((x) => x > 0);
      const venta = nums[nums.length - 1]; // última columna: Bs./M.E. Venta (ASK)
      if (venta > 1) tasas[f] = venta;
    }
    if (!Object.keys(tasas).length) throw new Error('No parece el archivo de tipo de cambio del BCV.');
    return tasas;
  }

  global.Extractos = { leerArchivo, leerTasasBCV, num, fecha };
})(window);
