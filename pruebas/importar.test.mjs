// Pruebas de la lectura de la plantilla de Excel:  npm run probar
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OPCIONES_BASE } from '../js/comun.js'
import { emparejarSucursal, leerArticulo, leerFecha, leerGafete, leerReposicion, llaveGafete, razonDesdeTexto, tipoHoja } from '../js/admin/importar.js'

const catalogo = OPCIONES_BASE.sucursales

test('reconoce qué tipo de hoja es', () => {
  assert.equal(tipoHoja([{ Categoría: 'Uniforme', Tipo: 'Playera' }]), 'articulos')
  assert.equal(tipoHoja([{ 'Nombre del colaborador': 'Ana', Sucursal: 'Iteso', 'Reposición (Sí/No)': 'No' }]), 'gafetes')
  assert.equal(tipoHoja([{ Colaborador: 'Ana', Sucursal: 'Iteso' }]), 'gafetes')
  assert.equal(tipoHoja([{ Sucursal: 'Vivo 47 · Valle Real' }]), null)
})

test('reposición: sí/no y textos libres', () => {
  for (const v of ['Sí', 'si', 'X', 'Reposición', 'SI ']) assert.equal(leerReposicion(v).reposicion, true, v)
  for (const v of ['No', '', null, 'Nuevo ingreso', '0']) assert.equal(leerReposicion(v).reposicion, false, String(v))
  assert.deepEqual(leerReposicion('Extravío'), { reposicion: true, texto: 'Extravío' })
})

test('razón desde texto', () => {
  assert.equal(razonDesdeTexto('Lo perdió').razon, 'extravio')
  assert.equal(razonDesdeTexto('desgastado').razon, 'desgaste')
  assert.equal(razonDesdeTexto('Se rompió').razon, 'mal_estado')
  assert.deepEqual(razonDesdeTexto('Cambio de puesto'), { razon: 'otra', detalle: 'Cambio de puesto' })
  assert.equal(razonDesdeTexto('').razon, null)
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

test('renglón de gafete', () => {
  const g = leerGafete({ 'Nombre del colaborador': '  Ana   López ', Sucursal: 'Gourmetería', 'Reposición (Sí/No)': 'Sí', 'Razón (opcional)': 'Extravío' }, { catalogo, fechaPorDefecto: '2026-11-26' })
  assert.deepEqual(g, { nombre: 'Ana López', sucursal: 'Vivo 47 · Gourmetería', sucursalReconocida: true, motivo: 'reposicion', razon: 'extravio', detalle: null, fecha: '2026-11-26', sinFecha: true })
  const n = leerGafete({ Colaborador: 'Luis Pérez', Sucursal: 'Iteso', 'Reposición (Sí/No)': 'No', Fecha: 46350 }, { catalogo, fechaPorDefecto: '2026-11-26' })
  assert.equal(n.motivo, 'nuevo')
  assert.equal(n.razon, null)
  assert.equal(n.fecha, '2026-11-24')
  assert.equal(leerGafete({ 'Nombre del colaborador': 'Ejemplo: Ana', Sucursal: 'Iteso' }, { catalogo }), null)
  assert.equal(llaveGafete(n), llaveGafete({ colaborador: 'luis perez', sucursal: 'EasyFit · ITESO', motivo: 'nuevo', fecha: '2026-11-24' }))
})

test('renglón de uniforme', () => {
  const a = leerArticulo({ Categoría: 'Uniforme', Tipo: 'Playera polo', 'Modelo / color': 'Azul', Unidad: '', Talla: 'M', 'Costo por pieza': '$250', Real: 10, Deseado: 15 })
  assert.equal(a.unidad, 'Todas')
  assert.equal(a.costo, 250)
  assert.equal(leerArticulo({ Categoría: 'Uniforme', Tipo: 'Playera polo', 'Modelo / color': 'Ejemplo azul' }), null)
})
