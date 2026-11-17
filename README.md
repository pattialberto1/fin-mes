# Fin de Mes – Extractos bancarios

Herramienta para el cierre de mes. Junta los extractos de todos los bancos en una sola página para clasificar cada movimiento como **Gasto fijo**, **Gasto extra** o **Compra**. Cada movimiento clasificado pasa automáticamente a su propia página, y al final se descarga un Excel con las mismas columnas del cierre de mes.

Funciona en el navegador (Chrome o Edge) y no hay que instalar nada. **Los datos bancarios no salen de la computadora**: no se envían a ningún servidor.

## Cómo abrirla

1. En GitHub: botón verde **Code → Download ZIP**, y descomprimir la carpeta.
2. Abrir `app/index.html` con doble clic (se abre en Chrome o Edge).
3. Para tenerla a mano: guardar la página en Favoritos.

## Uso cada mes

1. **Descargar los extractos** de cada banco (ver la tabla de abajo) y arrastrarlos todos juntos al recuadro punteado.
2. La primera vez, en la lista de cuentas, elegir **qué cuenta es** cada archivo. Esa elección queda guardada para los meses siguientes.
3. En **Extractos bancarios**, usar la lista de la derecha (**Clasificación**) para elegir *Gasto fijo*, *Gasto extra* o *Compra*. El movimiento pasa a esa página.
   - Las comisiones bancarias y los ingresos (ventas, puntos de venta, pagos móviles recibidos) se clasifican solos, en letra cursiva. Se pueden cambiar a mano.
   - El botón **Sin clasificar** muestra solo lo que falta por revisar.
4. En **Gastos fijos / Gastos extras / Compras** se completan la factura, el beneficiario y la descripción.
5. **Tasas BCV:** la herramienta ya trae las tasas oficiales del BCV (Bs/$, Venta, por Fecha Valor) del 01/10/2026 al 17/11/2026. Los fines de semana y feriados usan la tasa del último día hábil. Para los días nuevos, se descarga de bcv.org.ve → Estadísticas → Tipo de cambio de referencia el Excel del trimestre (ej. `2_1_2d26_smc.xls`) y se abre con el botón **Importar Excel del BCV**. Cualquier día se puede corregir a mano.
6. **Descargar Excel**: genera un archivo con las hojas EXTRACTOS, GASTOS FIJOS, GASTOS EXTRAS y COMPRAS, con las mismas columnas del cierre (el MONTO lleva la fórmula Bolívares ÷ Tasa).
7. **Empezar mes nuevo** borra los movimientos y conserva las cuentas y las reglas.

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
| Banesco (empresa y personal) | `.xls` con nombre del RIF/CI (ej. `J503822244.xls`) | RIF que empieza con J = Empresa; V = Personal |
| Bancamiga | `Movimientos_DDMMAAAA.xls` | La cuenta se reconoce por su número |
| Bancaribe (Conexión Bancaribe) | PDF de "Movimientos" | |
| Excel con columnas Fecha / Referencia / Descripción / Egreso / Ingreso / Saldo | `.xlsx` (ej. `noviembre.xlsx`) | Se tomó como Mercantil Empresa: **confirmar** |
| Excel con columnas Fecha y hora / Referencia / Tipo de operación / Monto / Disponible | `Movimientos.xlsx` | Se tomó como Bancaribe Empresa: **confirmar** |
| Banco de Venezuela | ⚠️ falta | El "Histórico de operaciones" no es un estado de cuenta. Hay que descargar los movimientos de la cuenta |

Si un banco cambia su formato o se agrega otro, el lector está en `app/parsers.js`.
