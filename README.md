# Gafetes y Uniformes GEB

Sistema de Capital Humano para controlar el inventario de **gafetes y uniformes**, recibir los **pedidos de los colaboradores** y medir **costos, rotación, reposiciones y tiempos de respuesta** para predecir el presupuesto.

| Página | Para quién | Link |
|---|---|---|
| Formulario de pedido | Colaboradores | https://universidadgeb-creator.github.io/gafetes-uniformes-geb/ |
| Panel de administración | Capital Humano | https://universidadgeb-creator.github.io/gafetes-uniformes-geb/admin.html |

## Qué hace

**Colaborador** (sin cuenta, desde el celular)
- Pide gafete y/o uniforme con: nombre, fecha, sucursal, rol, área, tipo de solicitud (nuevo ingreso o reposición) y, si es reposición, la razón: extravío, desgaste, mal estado, cambio de talla u otra.
- Los uniformes salen en **listas desplegables por tipo de prenda**, con buscador y filtro Hombre/Mujer; arriba, **Recomendados para ti** según su rol y su área.
- Puede indicar si lo pide para alguien de su equipo (queda registrado **quién lo solicita**).
- Recibe un **folio** y ve el avance: Recibido → En proceso → Listo para entregar → Entregado (o No procede), con el mensaje que le deje Capital Humano.

**Admin** (con clave)
- **Resumen:** valor del inventario, costo para llegar al deseado, gasto entregado, **costo de rotación** (nuevos ingresos) y por persona, costo de reposiciones, pedidos abiertos y fuera de tiempo, **tiempo promedio de resolución**, mediana, % a tiempo y tiempo de primera atención. Gráficas por mes, por razón, por sucursal, gafetes vs. uniformes y antigüedad de pedidos.
- **Pedidos:** bandeja de tickets con semáforo de tiempo. Al entregar, el sistema propone qué artículo y talla descontar, registra el costo y cierra el ticket.
- **Inventario:** cada artículo (tipo, modelo/color, unidad de negocio, talla) con **real, deseado, diferencia, costo por pieza, costo del inventario y costo del faltante**. Alta de artículos con varias tallas, compras, conteo físico, importación y descarga en Excel.
- **Gafetes por colaborador:** un renglón por colaborador con **sucursal, cantidad de gafetes (reposición) y nombre**; el primero cuenta como nuevo ingreso y los demás como reposición. No cuenta porta gafetes ni cordones. Alta manual o con la hoja *Gafetes* de la plantilla; si hay un gafete dado de alta por sucursal (columna *Unidad*), se usa el de su sucursal; se puede descontar o no del inventario.
- **Uniformes con color, género, rol y área:** cada artículo puede llevar color, género (Hombre/Mujer/Unisex), para qué rol(es) es y su área. En el formulario, al colaborador le salen como recomendados los de su rol o su área.
- **Entregas y movimientos:** bitácora de entregas (a quién, sucursal, rol, área, nuevo ingreso o reposición, razón, quién lo pidió, costo), compras y ajustes. Registro directo de entregas (por ejemplo, el kit de inducción) y anulación con reversa de inventario.
- **Presupuesto:** compra sugerida por artículo y costo total para 1, 3, 6 o 12 meses, con base en el consumo real de los últimos 3, 6 o 12 meses. Separa rotación y reposición y permite simular cuántos ingresos esperas al mes.
- **Ajustes:** link para colaboradores, tiempo objetivo de respuesta, catálogos (sucursales, áreas, roles, tipos de gafete y uniforme, tallas) y accesos de admin.

## Cómo se calcula

- **Costo del inventario** = real × costo por pieza. **Costo del faltante** = (deseado − real) × costo, cuando falta.
- **Rotación** = costo de lo entregado por *nuevo ingreso*. **Kit por persona** = ese costo ÷ personas nuevas distintas.
- **Tiempo de resolución** = desde que llega el pedido hasta que se marca *Entregado* o *No procede*. **Primera atención** = hasta el primer cambio de estado.
- **Compra sugerida** = deseado − real + consumo mensual × meses a presupuestar (mínimo 0).

## Plantilla de importación

- **Uniformes:** Categoría, Tipo, Modelo / descripción, Color, Género, Para qué rol, Área, Unidad, Talla, Costo por pieza, Real, Deseado, Proveedor (un renglón por talla). Para completar color, género, rol o área de lo que ya existe: *Descargar Excel*, llenar y volver a subir (la columna ID identifica cada artículo).
- **Gafetes:** Nombre del colaborador, Sucursal, Reposición (cantidad de gafetes), Fecha (opcional). Al importar se elige si la cantidad es el total (incluye el primer gafete) o solo reposiciones. Si el colaborador ya tiene gafetes, solo se agregan los que falten, así que volver a subir el archivo no duplica. La sucursal puede venir corta ("Valle Real", "GTM", "ITESO").
- Las hojas *Sucursales* y *Roles* son de consulta. Los renglones que dicen "Ejemplo" se ignoran.

## Acceso de administrador

- La clave está en `privado/clave-admin.txt` de la carpeta local (esa carpeta **no** se sube a GitHub; aquí solo va su huella SHA-256 dentro de `firestore.rules`).
- Se escribe una sola vez por dispositivo. En **Ajustes → Accesos** se ve quién tiene acceso y se puede quitar.
- Para cambiar la clave: `npm run nueva-clave` y luego `npm run deploy:reglas`.

## Cómo está hecho

- Sitio estático (HTML + JavaScript, sin compilación) publicado con GitHub Pages desde `main`.
- Datos en **Firebase** (proyecto `gafetes-uniformes-geb`, cuenta universidad@gebienestar.com.mx): Firestore + sesión anónima. Las reglas de seguridad (`firestore.rules`) hacen que los colaboradores solo puedan crear pedidos válidos y consultar los suyos; inventario, costos y movimientos solo los ven los admins.
- Colecciones: `articulos`, `movimientos`, `pedidos`, `admins`, `publico/opciones` (lo que ve el formulario, sin costos).

## Para desarrollar

Requiere Node 22+ y Java 21 (para los emuladores).

```
npm install
npm run emuladores        # sitio local en http://127.0.0.1:5190 con datos de prueba aislados
npm run sembrar           # (otra terminal) llena el emulador con datos de ejemplo
npm run probar            # pruebas de cálculos
npm run probar-reglas     # pruebas de las reglas de seguridad
npm run deploy:reglas     # publica reglas y acceso anónimo en Firebase
```

En `localhost` la página usa los emuladores; agrega `?real` a la URL para apuntar al proyecto real.
