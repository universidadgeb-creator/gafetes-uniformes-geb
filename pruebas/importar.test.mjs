// Pruebas de la lectura de la plantilla de Excel:  npm run probar
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claveGrupo, llaveColaborador, nombreArticulo, OPCIONES_BASE } from '../js/comun.js'
import {
  emparejarSucursal,
  expandirPlan,
  leerArticulo,
  leerCantidad,
  leerFecha,
  leerGafete,
  leerGenero,
  leerReposicion,
  objetivoGafetes,
  planearGafetes,
  razonDesdeTexto,
  tipoHoja,
} from '../js/admin/importar.js'

const catalogo = OPCIONES_BASE.sucursales

test('reconoce qué tipo de hoja es', () => {
  assert.equal(tipoHoja([{ Categoría: 'Uniforme', Tipo: 'Playera' }]), 'articulos')
  assert.equal(tipoHoja([{ 'Nombre del colaborador': 'Ana', Sucursal: 'Iteso', 'Reposición (cantidad de gafetes)': 2 }]), 'gafetes')
  assert.equal(tipoHoja([{ Colaborador: 'Ana', Sucursal: 'Iteso' }]), 'gafetes')
  assert.equal(tipoHoja([{ Sucursal: 'Vivo 47 · Valle Real' }]), null)
})

test('reposición sí/no (formato anterior) y razón desde texto', () => {
  for (const v of ['Sí', 'si', 'X', 'Reposición', 'SI ']) assert.equal(leerReposicion(v).reposicion, true, v)
  for (const v of ['No', '', null, 'Nuevo ingreso', '0']) assert.equal(leerReposicion(v).reposicion, false, String(v))
  assert.equal(razonDesdeTexto('Lo perdió').razon, 'extravio')
  assert.equal(razonDesdeTexto('desgastado').razon, 'desgaste')
  assert.equal(razonDesdeTexto('Se rompió').razon, 'mal_estado')
  assert.deepEqual(razonDesdeTexto('Cambio de puesto'), { razon: 'otra', detalle: 'Cambio de puesto' })
})

test('cantidad de gafetes en la columna Reposición', () => {
  assert.deepEqual(leerCantidad(3), { cantidad: 3, siNo: null, texto: '' })
  assert.equal(leerCantidad('2').cantidad, 2)
  assert.equal(leerCantidad('4.0').cantidad, 4)
  assert.deepEqual(leerCantidad('Sí'), { cantidad: null, siNo: true, texto: '' })
  assert.equal(leerCantidad('').siNo, false)
})

test('sucursal: nombre corto, abreviatura o completo', () => {
  assert.equal(emparejarSucursal('Valle Real', catalogo).sucursal, 'Vivo 47 · Valle Real')
  assert.equal(emparejarSucursal('VR', catalogo).sucursal, 'Vivo 47 · Valle Real')
  assert.equal(emparejarSucursal('NU', catalogo).sucursal, 'Vivo 47 · Naciones Unidas')
  assert.equal(emparejarSucursal('iteso', catalogo).sucursal, 'EasyFit · ITESO')
  assert.equal(emparejarSucursal('GTM', catalogo).sucursal, 'Vivo 47 · Gourmetería')
  assert.equal(emparejarSucursal('La Estancia', catalogo).sucursal, 'Vivo 47 · La Estancia')
  assert.equal(emparejarSucursal('EasyFit - Ávila Camacho', catalogo).sucursal, 'EasyFit · Ávila Camacho')
  const ambigua = emparejarSucursal('Oficina Central', catalogo)
  assert.equal(ambigua.reconocida, false, 'Oficina Central existe en Vivo 47 y en EasyFit')
  assert.equal(ambigua.sucursal, 'Oficina Central')
  assert.equal(emparejarSucursal('EasyFit Oficina Central', catalogo).sucursal, 'EasyFit · Oficina Central')
})

test('fechas de Excel', () => {
  assert.equal(leerFecha(46350), '2026-11-24')
  assert.equal(leerFecha('24/11/2026'), '2026-11-24')
  assert.equal(leerFecha('2026-11-24'), '2026-11-24')
  assert.equal(leerFecha('5/3/26'), '2026-03-05')
  assert.equal(leerFecha('mañana'), null)
})

test('renglón de gafete con cantidad', () => {
  const g = leerGafete({ 'Nombre del colaborador': '  Ana   López ', Sucursal: 'Gourmetería', 'Reposición (cantidad de gafetes)': 3 }, { catalogo, fechaPorDefecto: '2026-11-26' })
  assert.deepEqual(g, { nombre: 'Ana López', sucursal: 'Vivo 47 · Gourmetería', sucursalReconocida: true, cantidad: 3, siNo: null, razon: null, detalle: null, fecha: '2026-11-26', sinFecha: true })
  const n = leerGafete({ Colaborador: 'Luis Pérez', Sucursal: 'Iteso', Reposición: 1, Fecha: 46350 }, { catalogo, fechaPorDefecto: '2026-11-26' })
  assert.equal(n.cantidad, 1)
  assert.equal(n.fecha, '2026-11-24')
  assert.equal(leerGafete({ 'Nombre del colaborador': 'Ejemplo: Ana', Sucursal: 'Iteso' }, { catalogo }), null)
})

test('objetivo de gafetes según cómo se lea la cantidad', () => {
  assert.deepEqual(objetivoGafetes({ cantidad: 3 }, 'total'), { nuevos: 1, reposiciones: 2 })
  assert.deepEqual(objetivoGafetes({ cantidad: 1 }, 'total'), { nuevos: 1, reposiciones: 0 })
  assert.deepEqual(objetivoGafetes({ cantidad: 0 }, 'total'), { nuevos: 0, reposiciones: 0 })
  assert.deepEqual(objetivoGafetes({ cantidad: 3 }, 'reposiciones'), { nuevos: 1, reposiciones: 3 })
  assert.deepEqual(objetivoGafetes({ cantidad: null, siNo: true }, 'total'), { nuevos: 1, reposiciones: 1 })
})

test('plan de importación: solo agrega lo que falta y no duplica al resubir', () => {
  const filas = [
    { nombre: 'Ana López', sucursal: 'Vivo 47 · Valle Real', cantidad: 3, razon: 'extravio', detalle: null, fecha: '2026-11-20' },
    { nombre: 'Luis Pérez', sucursal: 'EasyFit · ITESO', cantidad: 1, razon: null, detalle: null, fecha: '2026-11-21' },
    { nombre: 'Eva Ruiz', sucursal: 'GEB · Marketing', cantidad: 1, razon: null, detalle: null, fecha: '2026-11-21' },
  ]
  const existentes = new Map([
    [llaveColaborador('ana lopez', 'Vivo 47 · Valle Real'), { nuevos: 1, reposiciones: 0 }],
    [llaveColaborador('Eva Ruiz', 'GEB · Marketing'), { nuevos: 1, reposiciones: 1 }],
  ])
  const { plan, alDia, conMas } = planearGafetes(filas, { modo: 'total', existentes })
  assert.equal(plan.length, 2)
  assert.deepEqual(
    plan.map((p) => [p.nombre, p.agregarNuevos, p.agregarReposiciones, p.previos]),
    [
      ['Ana López', 0, 2, 1],
      ['Luis Pérez', 1, 0, 0],
    ],
  )
  assert.equal(alDia, 1)
  assert.equal(conMas, 1, 'Eva ya tiene 2 y el archivo dice 1: no se borra nada')
  const registros = expandirPlan(plan)
  assert.equal(registros.length, 3)
  assert.deepEqual(
    registros.map((r) => [r.nombre, r.motivo, r.razon]),
    [
      ['Ana López', 'reposicion', 'extravio'],
      ['Ana López', 'reposicion', 'extravio'],
      ['Luis Pérez', 'nuevo', null],
    ],
  )
  // Si se vuelve a subir el mismo archivo ya registrado, no agrega nada.
  const despues = new Map([
    [llaveColaborador('Ana López', 'Vivo 47 · Valle Real'), { nuevos: 1, reposiciones: 2 }],
    [llaveColaborador('Luis Pérez', 'EasyFit · ITESO'), { nuevos: 1, reposiciones: 0 }],
    [llaveColaborador('Eva Ruiz', 'GEB · Marketing'), { nuevos: 1, reposiciones: 1 }],
  ])
  assert.equal(planearGafetes(filas, { modo: 'total', existentes: despues }).plan.length, 0)
})

test('renglón de uniforme con color, género y rol', () => {
  const a = leerArticulo({ Categoría: 'Uniforme', Tipo: 'Playera', 'Modelo / descripción': 'Playera coach', Color: 'Negro', Género: 'H', 'Para qué rol': 'Coach Deportivo ,Líder Deportivo', Unidad: '', Talla: 'M', 'Costo por pieza': '$250', Real: 10, Deseado: 15, 'ID (no lo cambies)': 'abc123' })
  assert.equal(a.unidad, 'Todas')
  assert.equal(a.costo, 250)
  assert.equal(a.color, 'Negro')
  assert.equal(a.genero, 'Hombre')
  assert.equal(a.rol, 'Coach Deportivo, Líder Deportivo')
  assert.equal(a.id, 'abc123')
  assert.equal(leerArticulo({ Categoría: 'Uniforme', Tipo: 'Playera polo', 'Modelo / color': 'Azul' }).nombre, 'Azul', 'acepta la columna anterior')
  assert.equal(leerArticulo({ Categoría: 'Uniforme', Tipo: 'Playera polo', 'Modelo / descripción': 'Ejemplo azul' }), null)
  for (const [v, e] of [['Mujer', 'Mujer'], ['dama', 'Mujer'], ['M', 'Mujer'], ['Unisex', 'Unisex'], ['otro', ''], ['', '']]) assert.equal(leerGenero(v), e, v)
})

test('nombre y clave de artículo con color y género', () => {
  const base = { categoria: 'uniforme', tipo: 'Playera', nombre: 'Playera coach', unidad: 'Todas' }
  assert.equal(claveGrupo(base), claveGrupo({ ...base, color: null, genero: null }), 'sin extras la clave no cambia')
  assert.notEqual(claveGrupo({ ...base, genero: 'Hombre' }), claveGrupo({ ...base, genero: 'Mujer' }))
  assert.equal(nombreArticulo({ ...base, color: 'Negro', genero: 'Mujer' }), 'Playera · Playera coach · Negro · Mujer')
  assert.equal(nombreArticulo({ ...base, nombre: 'Playera coach / Hombre', genero: 'Hombre' }), 'Playera · Playera coach / Hombre', 'no repite el género')
})
