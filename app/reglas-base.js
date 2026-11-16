/* Reglas que vienen de fábrica, sacadas de los extractos de noviembre 2026 y del cierre de octubre 2026.
 * Se agregan solas la primera vez (o cuando sube la versión). La administradora puede borrarlas o agregar otras
 * en la página "Reglas automáticas".
 * texto: lo que debe contener la descripción del banco (sin importar mayúsculas). Para las transferencias de
 * Banesco ("TRFMB 0134 J304112629 INDUSTRIAS POLLO") se usa el RIF, que es único.
 */
window.REGLAS_BASE = {
  version: 1,
  reglas: [
    // Comisiones que el banco no llama "comisión"
    { texto: 'SERV AL CLIENTE', cat: 'comision', descripcion: 'MANTENIMIENTO TARJETA DE DEBITO' },
    { texto: 'OP.CRED.DIRT', cat: 'comision', descripcion: 'COMISION TRANSFERENCIA' },
    { texto: 'DESCUENTO TARJETA', cat: 'comision' },

    // Gastos fijos: servicios e impuestos
    { texto: 'CORPOELEC', cat: 'fijo', beneficiario: 'CORPOELEC', descripcion: 'ENERGIA + ASEO' },
    { texto: 'SENIAT', cat: 'fijo', beneficiario: 'SENIAT', descripcion: 'IMPUESTOS' },
    { texto: 'IMPUESTOS LIBERTADOR', cat: 'fijo', beneficiario: 'SUMAR', descripcion: 'IMPUESTOS ALCALDIA' },
    { texto: 'DIGITEL', cat: 'fijo', beneficiario: 'DIGITEL', descripcion: 'SALDO TELEFONO' },
    { texto: 'CANTV', cat: 'fijo', beneficiario: 'CANTV', descripcion: 'TELEFONO' },
    { texto: 'HIDROCAPITAL', cat: 'fijo', beneficiario: 'HIDROCAPITAL', descripcion: 'AGUA' },
    { texto: 'SIMPLE TV', cat: 'fijo', beneficiario: 'SIMPLE TV', descripcion: 'INTERNET' },
    { texto: 'IVSS', cat: 'fijo', beneficiario: 'IVSS' },
    { texto: 'BANAVIH', cat: 'fijo', beneficiario: 'FAOV' },
    { texto: 'FAOV', cat: 'fijo', beneficiario: 'FAOV' },

    // Compras: proveedores (por RIF en Banesco)
    { texto: 'J304112629', cat: 'compra', beneficiario: 'INDUSTRIAS POLLO PREMIUM 58 CA', descripcion: 'POLLO' },
    { texto: 'J302697964', cat: 'compra', beneficiario: 'LACTEOS FLOR DE CATIA', descripcion: 'REFRESCOS' },
    { texto: 'J506698854', cat: 'compra', beneficiario: 'PROCESADORA BROSTIHOUSE, C.A - FACIL BROSTER', descripcion: 'EMPANIZADO' },
    { texto: 'J306110860', cat: 'compra', beneficiario: 'DISJOBEL', descripcion: 'LEGUMBRES / PAPA' },

    // Compras: proveedores por nombre (para bancos que muestran el nombre)
    { texto: 'POLLO PREMIUM', cat: 'compra', beneficiario: 'INDUSTRIAS POLLO PREMIUM 58 CA' },
    { texto: 'POLLO DORADO', cat: 'compra', beneficiario: 'DISTRIBUIDORA POLLO DORADO 0304, C.A.', descripcion: 'MILANESA' },
    { texto: 'FLOR DE CATIA', cat: 'compra', beneficiario: 'LACTEOS FLOR DE CATIA', descripcion: 'REFRESCOS' },
    { texto: 'BROSTI', cat: 'compra', beneficiario: 'PROCESADORA BROSTIHOUSE, C.A - FACIL BROSTER', descripcion: 'EMPANIZADO' },
    { texto: 'DISJOBEL', cat: 'compra', beneficiario: 'DISJOBEL' },
    { texto: 'COCA COLA', cat: 'compra', beneficiario: 'COCA COLA FEMSA DE VENEZUELA', descripcion: 'REFRESCOS' },
    { texto: 'TIERRA SANTA', cat: 'compra', beneficiario: 'TIERRA SANTA', descripcion: 'LEGUMBRES Y QUESO' },
    { texto: 'IL PIACERE', cat: 'compra', beneficiario: 'IL PIACERE', descripcion: 'POSTRES' },
    { texto: 'FUERZA PLAST', cat: 'compra', beneficiario: 'COMERCIAL FUERZA PLAST 168' },
    { texto: 'YARU', cat: 'compra', beneficiario: 'DISTRIBUIDORA YARU 2012 CA' },
    { texto: 'OLOFIDIO', cat: 'compra', beneficiario: 'INVERSIONES OLOFIDIO MARY V CA', descripcion: 'ACEITE VATEL PRO' },
    { texto: 'MARI MILLA', cat: 'compra', beneficiario: 'COMERCIALIZADORA MARI MILLA', descripcion: 'ARROZ' },
    { texto: 'TODO PAPEL', cat: 'compra', beneficiario: 'TODO PAPEL CARACAS C.A.' },
    { texto: 'HIGIEA', cat: 'compra', beneficiario: 'CORPORACION HIGIEA 6912', descripcion: 'SERVILLETAS' },
    { texto: 'FAMA CENTER', cat: 'compra', beneficiario: 'DISTRIBUIDORA FAMA CENTER' },
    { texto: 'FAMACENTER', cat: 'compra', beneficiario: 'FAMACENTER 1, C.A.' },
  ],
};
