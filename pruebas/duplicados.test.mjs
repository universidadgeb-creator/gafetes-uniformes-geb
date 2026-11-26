// Pruebas de "Unir duplicados" y del emparejamiento al importar:  npm run probar
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claveGrupo } from '../js/comun.js'
import { baseModelo, buscarDuplicados, claveFamilia, emparejarArticulos, generoArticulo, planearUnion, versionSugerida } from '../js/admin/importar.js'

const art = (id, datos) => {
  const a = { id, categoria: 'uniforme', unidad: 'Todas', activo: true, real: 5, deseado: 8, costo: 200, ...datos }
  a.grupo = claveGrupo(a)
  return a
}
// Lo que pasó en producción: la misma prenda cargada 3 veces.
const v1 = ['M', 'G'].map((t) => art(`v1-${t}`, { tipo: 'Playera', nombre: 'Playera coach / Hombre', talla: t }))
const v2 = ['M', 'G'].map((t) => art(`v2-${t}`, { tipo: 'Playera', nombre: 'Playera coach', genero: 'Hombre', talla: t }))
const v3 = ['M', 'XL'].map((t) => art(`v3-${t}`, { tipo: 'Playera', nombre: 'Playera coach', genero: 'Hombre', color: 'Verde', unidad: 'Vivo 47', talla: t }))
const mujer = art('m-M', { tipo: 'Playera', nombre: 'Playera coach / Mujer', talla: 'M' })
const gafete = ['Valle Real', 'GTM'].map((u) => art(`g-${u}`, { categoria: 'gafete', tipo: 'Gafete registrado', nombre: '', unidad: u, talla: null }))

test('modelo base y género', () => {
  assert.equal(baseModelo('Playera coach / Hombre'), 'Playera coach')
  assert.equal(baseModelo('Batas nutrición / Mujer'), 'Batas nutrición')
  assert.equal(baseModelo('Pantalón (Dama)'), 'Pantalón')
  assert.equal(generoArticulo({ nombre: 'Playera coach / Hombre' }), 'Hombre')
  assert.equal(generoArticulo({ nombre: 'Polo', genero: 'Mujer' }), 'Mujer')
  assert.equal(claveFamilia(v1[0]), claveFamilia(v3[0]))
  assert.notEqual(claveFamilia(v1[0]), claveFamilia(mujer))
})

test('detecta las 3 versiones y no mezcla hombre/mujer ni gafetes por sucursal', () => {
  const d = buscarDuplicados([...v1, ...v2, ...v3, mujer, ...gafete])
  assert.equal(d.length, 1)
  assert.equal(d[0].versiones.length, 3)
  assert.equal(versionSugerida(d[0]), v3[0].grupo, 'sugiere la que tiene color, género y unidad')
})

test('plan de unión: borra tallas repetidas y pasa las que faltan', () => {
  const [d] = buscarDuplicados([...v1, ...v2, ...v3])
  const plan = planearUnion(d, v3[0].grupo)
  assert.deepEqual(plan.borrar.map((b) => `${b.id}→${b.destino}`).sort(), ['v1-M→v3-M', 'v2-G→v1-G', 'v2-M→v3-M'].sort())
  assert.deepEqual(plan.adoptar.map((x) => x.id), ['v1-G'], 'la G no existía en la versión elegida: se pasa a ella')
  assert.equal(plan.adoptar[0].datos.color, 'Verde')
  assert.equal(plan.adoptar[0].datos.grupo, v3[0].grupo)
  assert.equal(plan.sumar.length, 0)
  const conSuma = planearUnion(d, v3[0].grupo, { sumarReal: true })
  assert.equal(conSuma.sumar.reduce((s, x) => s + x.cantidad, 0), 15)
})

test('importar: reconoce la misma prenda aunque cambie el nombre, color o unidad', () => {
  const fila = (datos) => ({ categoria: 'uniforme', costo: 200, real: 5, deseado: 8, unidad: 'Todas', ...datos })
  const r = emparejarArticulos(
    [
      fila({ tipo: 'Playera', nombre: 'Playera coach', genero: 'Hombre', color: 'Verde', unidad: 'Vivo 47', talla: 'M' }),
      fila({ tipo: 'Playera', nombre: 'Playera coach', genero: 'Hombre', color: 'Azul', unidad: 'Vivo 47', talla: 'M' }),
      fila({ tipo: 'Playera', nombre: 'Playera coach', genero: 'Mujer', talla: 'M' }),
      fila({ tipo: 'Polo', nombre: 'Polo', talla: 'M' }),
      fila({ tipo: 'Polo', nombre: 'Polo', talla: 'M' }),
    ],
    [v1[0], mujer, art('azul', { tipo: 'Pans', nombre: 'Pants', color: 'Azul', talla: 'M' })],
  )
  assert.equal(r[0].existente?.id, 'v1-M', '"Playera coach / Hombre" es la misma que "Playera coach · Verde · Hombre"')
  assert.equal(r[1].existente, null, 'otra fila con otro color ya no puede usar el mismo artículo')
  assert.equal(r[2].existente?.id, 'm-M')
  assert.equal(r[3].existente, null)
  assert.equal(r[4].existente?.nuevo, 3, 'un renglón nuevo repetido apunta al primero')
})

test('importar: no junta artículos con color o unidad distintos', () => {
  const existente = art('e', { tipo: 'Polo', nombre: 'Polo', color: 'Azul', unidad: 'EasyFit', talla: 'M' })
  const [r1] = emparejarArticulos([{ categoria: 'uniforme', tipo: 'Polo', nombre: 'Polo', color: 'Negro', unidad: 'EasyFit', talla: 'M' }], [existente])
  const [r2] = emparejarArticulos([{ categoria: 'uniforme', tipo: 'Polo', nombre: 'Polo', color: 'Azul', unidad: 'Vivo 47', talla: 'M' }], [existente])
  assert.equal(r1.existente, null)
  assert.equal(r2.existente, null)
})
