# Fin de Mes – Extractos bancarios

Herramienta para el cierre de mes. Junta los extractos de todos los bancos en una sola página para clasificar cada movimiento como **Gasto fijo**, **Gasto extra** o **Compra**. Cada movimiento clasificado pasa automáticamente a su propia página, y al final se descarga un Excel con las mismas columnas del cierre de mes.

Funciona en el navegador (Chrome o Edge) y no hay que instalar nada. **Los datos bancarios no salen de la computadora**: no se envían a ningún servidor.

## Cómo abrirla

1. En GitHub: botón verde **Code → Download ZIP**, y descomprimir la carpeta.
2. Abrir `app/index.html` con doble clic (se abre en Chrome o Edge).
3. Para tenerla a mano: guardar la página en Favoritos.

## Uso cada mes

El cierre completo se hace en la web y al final se descarga el Excel del cierre, con las mismas hojas y fórmulas del archivo de cierre de mes.

| Pestaña | Qué hacer | Qué se hace solo |
|---|---|---|
| **Extractos bancarios** | Arrastrar los extractos de todos los bancos y clasificar los egresos con la lista de la derecha | Comisiones e ingresos se clasifican solos, igual que los pagos que tienen una regla |
| **Ventas** | Escribir la venta diaria en $ (bolívares en efectivo, divisas, total del sistema) | **Llenar desde los bancos** completa punto de venta, pago móvil y biopago con lo que entró a los bancos ese día. También hace el control de divisas |
| **Gastos fijos / extras / Compras** | Completar factura, beneficiario y descripción. Con **+ Agregar fila** se cargan los pagos en divisas o efectivo, que no salen en el banco | **+ Agregar gastos recurrentes** crea la nómina y el delivery de cada semana, el alquiler, el mantenimiento y el fin de mes. Las comisiones bancarias se suman por cuenta |
| **Anticipo socios** | Elegir a qué socio corresponde cada vale | Los movimientos clasificados como "Vale / anticipo socio" aparecen aquí |
| **Bancos y efectivo** | Escribir el efectivo en Bs y las divisas contadas | El saldo de cada cuenta se toma del último movimiento de su extracto |
| **Inventario** | Contar y escribir bultos y unidades | Los totales se calculan solos. El precio se actualiza con la última compra si en Compras se indica "Producto del inventario" y "Precio $". **Copiar cantidades del mes anterior** sirve como punto de partida |
| **Resumen** | Revisar los números. En el reparto, escribir los vales en divisa y las divisas en Banesco de cada socio | Todo lo demás se calcula solo: ventas, gastos, ganancia bruta y neta, cuadre (debería quedar contra lo que hay), inventario contra el mes anterior y reparto entre socios |
| **Tasas BCV** | Importar el Excel del BCV para los días nuevos | Se usa la tasa de cada día y la del último día como tasa de cierre |

**Descargar Excel del cierre** genera estas hojas: VENTAS, BANCOS Y EFECTIVO, GASTOS EXTRAS, GASTOS FIJOS, COMPRAS, INVENTARIO, ANTICIPO SOCIOS, RESUMEN y EXTRACTOS. Llevan fórmulas, así que si se corrige un número en Excel el resumen se recalcula.

**Empezar mes nuevo** borra los datos del mes y conserva las reglas, las cuentas, los socios y los productos con sus precios. El inventario del mes pasa a ser el "mes anterior".

### Para ahorrar tiempo: Reglas automáticas

En la página **Reglas automáticas** se guardan textos que se repiten. Por ejemplo, si la descripción del banco contiene `CORPOELEC`, se clasifica como Gasto fijo con el beneficiario CORPOELEC. Desde ese momento esos pagos llegan ya clasificados cada mes.

**Botón "Recordar":** después de clasificar un egreso, el botón **Recordar** que aparece a su lado crea la regla en un clic. Si el banco muestra la cédula o el RIF (por ejemplo `TRFMB 0134 V024635876 LOZANO RODRIGUEZ`), la regla usa ese número. Si no, usa la descripción sin los números. Si la descripción es genérica ("Banesco Pago Movil", "Transf. Internet Terceros"…), avisa y no crea la regla, porque clasificaría mal otros pagos. En las páginas de gastos, Recordar también guarda el beneficiario y la descripción que se hayan escrito.

La herramienta trae **33 reglas de fábrica**, sacadas de los extractos de noviembre y del cierre de octubre (archivo `app/reglas-base.js`):
- **Gastos fijos:** CORPOELEC, SENIAT, impuestos de la Alcaldía Libertador (SUMAR), DIGITEL, CANTV, HIDROCAPITAL, SIMPLE TV, IVSS, FAOV/BANAVIH.
- **Compras:** proveedores habituales. En Banesco se reconocen por el RIF (Pollo Premium, Lácteos Flor de Catia, Brostihouse, Disjobel) y en los demás bancos por el nombre (Coca Cola, Tierra Santa, Il Piacere, Pollo Dorado, etc.).
- **Comisiones:** mantenimiento de la tarjeta de débito ("SERV AL CLIENTE"), comisiones de transferencias en Mercantil, y la comisión que Banesco cobra con la misma referencia del pago móvil.

Las comisiones bancarias se suman por cuenta y aparecen en Gastos fijos como "COMISIONES BANCARIAS <CUENTA>", igual que en el cierre.

### Respaldo

El trabajo se guarda solo en el navegador de esa computadora. **Guardar respaldo** descarga un archivo `.json` que sirve para pasar el trabajo a otra computadora o recuperarlo con **Abrir respaldo**.

## Formatos de banco que reconoce

| Banco | Archivo que se descarga | Notas |
|---|---|---|
| Banesco (empresa y personal) | `.xls` con el RIF o la CI en el nombre (ej. `J503822244.xls`) | RIF J = Empresa, V = Personal |
| Bancamiga Empresa (2 cuentas) | `Movimientos_DDMMAAAA.xls` | La cuenta se reconoce por su número |
| Bancaribe Empresa | PDF de "Movimientos" o Excel de Mi Conexión | Si se cargan los dos de la misma cuenta, los movimientos no se duplican |
| Bancaribe (otro formato Excel) | `Movimientos.xlsx` (Fecha y hora / Tipo de operación / Monto) | Se toma como Bancaribe Empresa |
| Mercantil Empresa | `.xlsx` con columnas Egreso / Ingreso / Saldo | |
| Mercantil Empresa (cuenta corriente) | `.xlsx` con columnas Tipo / Fecha / Referencia / Descripción / Monto Bs. | El saldo de cada movimiento se calcula desde el saldo final |
| Banco de Venezuela | `.xlsx` de movimientos (Día / Referencia / Descripción / Fecha / Tipo de Movimiento / Crédito / Débito / Saldo) | El "Histórico de operaciones" no sirve: no es un estado de cuenta |

Si un banco cambia su formato o se agrega otro, el lector está en `app/parsers.js`.
