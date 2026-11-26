// Pruebas de los cálculos del panel:  npm run probar
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claveGrupo, duracion, nombreSucursal, ordenTalla, unidadDe } from '../js/comun.js'
import {
  estadoStock,
  gastoPorMes,
  metricasPedidos,
  proyeccion,
  resolucionPorMes,
  resumenEntregas,
  resumenInventario,
} from '../js/admin/metricas.js'

const H = 36e5
const hoy = new Date(2026, 10, 26, 12) // 26 nov 2026
const haceDias = (d) => new Date(hoy.getTime() - d * 24 * H)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('duración legible', () => {
  assert.equal(duracion(null), '—')
  assert.equal(duracion(0.5), '30 min')
  assert.equal(duracion(5), '5 h')
  assert.equal(duracion(28), '1 d 4 h')
  assert.equal(duracion(72), '3 d')
  assert.equal(duracion(300), '13 d')
})

test('sucursales y tallas', () => {
  assert.equal(unidadDe('Vivo 47 · Valle Real'), 'Vivo 47')
  assert.equal(nombreSucursal('Center · Center'), 'Center')
  assert.ok(ordenTalla('S') < ordenTalla('M'))
  assert.ok(ordenTalla('XL') < ordenTalla('XXL'))
  assert.ok(ordenTalla('28') < ordenTalla('30'))
  assert.equal(claveGrupo({ categoria: 'uniforme', tipo: 'Playera polo', nombre: 'Azul', unidad: 'Vivo 47' }), 'uniforme-playera-polo-azul-vivo-47')
})

test('resumen de inventario: real, deseado y costos', () => {
  const r = resumenInventario([
    { categoria: 'uniforme', real: 4, deseado: 10, costo: 200 },
    { categoria: 'gafete', real: 0, deseado: 5, costo: 50 },
    { categoria: 'gafete', real: 20, deseado: 10, costo: 50 },
    { categoria: 'gafete', real: 100, deseado: 0, costo: 10, activo: false },
  ])
  assert.equal(r.articulos, 3)
  assert.equal(r.piezas, 24)
  assert.equal(r.valor, 4 * 200 + 20 * 50)
  assert.equal(r.faltantePiezas, 6 + 5)
  assert.equal(r.faltanteCosto, 6 * 200 + 5 * 50)
  assert.equal(r.agotados.length, 1)
  assert.equal(r.bajoDeseado.length, 1)
  assert.equal(r.porCategoria.gafete.valor, 1000)
  assert.equal(estadoStock({ real: 20, deseado: 10 }), 'sobrante')
})

const movs = [
  { tipo: 'salida', articuloId: 'a', cantidad: 2, costoUnitario: 100, motivo: 'nuevo', colaborador: 'Ana Pérez', sucursal: 'Vivo 47 · Valle Real', categoria: 'uniforme', fecha: iso(haceDias(10)) },
  { tipo: 'salida', articuloId: 'b', cantidad: 1, costoUnitario: 50, motivo: 'nuevo', colaborador: 'ana perez', sucursal: 'Vivo 47 · Valle Real', categoria: 'gafete', fecha: iso(haceDias(10)) },
  { tipo: 'salida', articuloId: 'a', cantidad: 1, costoUnitario: 100, motivo: 'reposicion', razon: 'desgaste', colaborador: 'Luis', sucursal: 'EasyFit · Iteso', categoria: 'uniforme', fecha: iso(haceDias(40)) },
  { tipo: 'entrada', articuloId: 'a', cantidad: 10, costoUnitario: 90, fecha: iso(haceDias(170)) },
  { tipo: 'ajuste', articuloId: 'a', cantidad: -1, costoUnitario: 100, fecha: iso(haceDias(5)) },
]

test('entregas: rotación (nuevo ingreso) vs. reposición', () => {
  const r = resumenEntregas(movs, {})
  assert.equal(r.entregas, 3)
  assert.equal(r.costo, 350)
  assert.equal(r.porMotivo.nuevo.costo, 250)
  assert.equal(r.porMotivo.nuevo.personas, 1, 'el mismo nombre con otra escritura cuenta como una persona')
  assert.equal(r.costoPorNuevoIngreso, 250)
  assert.equal(r.porMotivo.reposicion.costo, 100)
  assert.equal(r.porRazon.desgaste.piezas, 1)
  assert.equal(r.compras.costo, 900)
  assert.equal(r.ajustes.piezas, -1)
  const soloMes = resumenEntregas(movs, { desde: haceDias(20) })
  assert.equal(soloMes.costo, 250)
})

test('gasto por mes', () => {
  const g = gastoPorMes(movs, ['2026-10', '2026-11'])
  assert.equal(g[1].nuevo, 250)
  assert.equal(g[0].reposicion, 100)
  assert.equal(g[1].uniforme, 200)
})

test('tickets: tiempo de resolución, SLA y antigüedad', () => {
  const ts = (d) => ({ toDate: () => d })
  const pedidos = [
    { estado: 'entregado', creadoEn: ts(haceDias(5)), atendidoEn: ts(new Date(haceDias(5).getTime() + 2 * H)), resueltoEn: ts(haceDias(4)), sucursal: 'A', tipoSolicitud: 'nuevo' },
    { estado: 'rechazado', creadoEn: ts(haceDias(6)), resueltoEn: ts(haceDias(2)), sucursal: 'A', tipoSolicitud: 'reposicion' },
    { estado: 'nuevo', creadoEn: ts(haceDias(4)), sucursal: 'B', tipoSolicitud: 'reposicion' },
    { estado: 'en_proceso', creadoEn: ts(new Date(hoy.getTime() - 3 * H)), sucursal: 'B', tipoSolicitud: 'nuevo' },
  ]
  const m = metricasPedidos(pedidos, { slaHoras: 72, ahora: hoy })
  assert.equal(m.recibidos, 4)
  assert.equal(m.abiertos, 2)
  assert.equal(m.vencidos, 1)
  assert.equal(m.resueltos, 2)
  assert.equal(m.promedioResolucion, (24 + 96) / 2)
  assert.equal(m.pctDentroSla, 50)
  assert.equal(m.promedioAtencion, 2)
  assert.equal(m.abiertosPorAntiguedad.menos24, 1)
  assert.equal(m.abiertosPorAntiguedad.de3a7, 1)
  const porMes = resolucionPorMes(pedidos, ['2026-11'])
  assert.equal(porMes[0].resueltos, 2)
})

test('presupuesto: compra para quedar en el deseado al final del horizonte', () => {
  const articulos = [
    { id: 'a', categoria: 'uniforme', real: 5, deseado: 10, costo: 100 },
    { id: 'b', categoria: 'gafete', real: 50, deseado: 10, costo: 50 },
  ]
  // 12 piezas de "a" en los últimos 6 meses (2/mes); hay historial desde hace un año.
  const salidas = [
    { tipo: 'entrada', articuloId: 'a', cantidad: 1, costoUnitario: 100, fecha: iso(haceDias(365)) },
    ...Array.from({ length: 6 }, (_, i) => ({ tipo: 'salida', articuloId: 'a', cantidad: 2, costoUnitario: 100, motivo: i % 2 ? 'nuevo' : 'reposicion', colaborador: `P${i}`, fecha: iso(haceDias(15 + i * 28)) })),
  ]
  const p = proyeccion(articulos, salidas, { mesesBase: 6, horizonte: 3, hoy })
  const a = p.filas.find((f) => f.articulo.id === 'a')
  assert.ok(Math.abs(a.consumoMes - 2) < 0.05, `consumo ${a.consumoMes}`)
  assert.equal(a.compra, 11) // 10 − 5 + 2 × 3
  const b = p.filas.find((f) => f.articulo.id === 'b')
  assert.equal(b.compra, 0)
  assert.equal(p.totales.compraCosto, 1100)
  assert.equal(p.totales.faltanteCosto, 500)
  assert.ok(p.kitNuevoIngreso > 0)
  const conEscenario = proyeccion(articulos, salidas, { mesesBase: 6, horizonte: 3, hoy, ingresosMes: 10 })
  assert.ok(conEscenario.escenario.costo > 0)
})

test('presupuesto con historial corto usa los meses reales', () => {
  const articulos = [{ id: 'a', categoria: 'uniforme', real: 0, deseado: 0, costo: 10 }]
  const salidas = [{ tipo: 'salida', articuloId: 'a', cantidad: 3, costoUnitario: 10, motivo: 'nuevo', fecha: iso(haceDias(30)) }]
  const p = proyeccion(articulos, salidas, { mesesBase: 6, horizonte: 1, hoy })
  assert.ok(p.mesesBase < 1.1)
  assert.ok(p.filas[0].consumoMes > 2.5)
})
