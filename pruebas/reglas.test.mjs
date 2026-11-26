// Pruebas de firestore.rules contra el emulador:  npm run probar-reglas
// Usa la clave de privado/clave-admin.txt (generada con npm run nueva-clave).
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'

const CLAVE = readFileSync('privado/clave-admin.txt', 'utf8').match(/GEB-[A-Z0-9-]{19}/)?.[0]
if (!CLAVE) throw new Error('No hay clave en privado/clave-admin.txt: corre npm run nueva-clave')

let env
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gafetes-geb',
    firestore: { host: '127.0.0.1', port: 8083, rules: readFileSync('firestore.rules', 'utf8') },
  })
})
after(() => env?.cleanup())
beforeEach(() => env.clearFirestore())

const pedido = (uid, extra = {}) => ({
  folio: 'GU-ABC234',
  uid,
  nombre: 'Colaborador de Prueba',
  solicitadoPor: null,
  fecha: '2026-11-26',
  unidad: 'Vivo 47',
  sucursal: 'Vivo 47 · Valle Real',
  rol: 'Coach Deportivo',
  area: 'Deportes',
  tipoSolicitud: 'reposicion',
  razon: 'desgaste',
  detalleRazon: null,
  articulos: [{ grupo: 'x', categoria: 'uniforme', tipo: 'Playera', descripcion: 'Playera', talla: 'M', cantidad: 1 }],
  comentarios: null,
  estado: 'nuevo',
  creadoEn: serverTimestamp(),
  ...extra,
})

async function hacerAdmin(uid) {
  const db = env.authenticatedContext(uid).firestore()
  await setDoc(doc(db, 'admins', uid), { nombre: 'Admin', clave: CLAVE, creadoEn: serverTimestamp() })
  return db
}

test('colaborador anónimo crea un pedido válido', async () => {
  const db = env.authenticatedContext('colab1').firestore()
  await assertSucceeds(setDoc(doc(db, 'pedidos', 'GU-ABC234'), pedido('colab1')))
})

test('pedido de nuevo ingreso sin razón es válido; con razón no', async () => {
  const db = env.authenticatedContext('colab1').firestore()
  await assertSucceeds(setDoc(doc(db, 'pedidos', 'GU-ABC234'), pedido('colab1', { tipoSolicitud: 'nuevo', razon: null })))
  await assertFails(setDoc(doc(db, 'pedidos', 'GU-ABC235'), pedido('colab1', { folio: 'GU-ABC235', tipoSolicitud: 'nuevo', razon: 'desgaste' })))
})

test('pedidos inválidos se rechazan', async () => {
  const db = env.authenticatedContext('colab1').firestore()
  const casos = [
    ['sin sesión', env.unauthenticatedContext().firestore(), pedido('colab1')],
    ['uid ajeno', db, pedido('otro')],
    ['estado distinto de nuevo', db, pedido('colab1', { estado: 'entregado' })],
    ['reposición sin razón', db, pedido('colab1', { razon: null })],
    ['razón inventada', db, pedido('colab1', { razon: 'me-lo-robaron-los-aliens' })],
    ['sin artículos', db, pedido('colab1', { articulos: [] })],
    ['campo extra', db, pedido('colab1', { resueltoEn: serverTimestamp() })],
    ['nombre vacío', db, pedido('colab1', { nombre: '' })],
    ['folio no coincide', db, pedido('colab1', { folio: 'GU-ZZZ999' })],
    ['fecha de creación falsa', db, pedido('colab1', { creadoEn: new Date(2020, 0, 1) })],
  ]
  for (const [nombre, base, datos] of casos) {
    await assertFails(setDoc(doc(base, 'pedidos', 'GU-ABC234'), datos), nombre)
  }
})

test('colaborador no puede ver inventario, movimientos ni pedidos ajenos en lista', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'articulos', 'a1'), { costo: 100 })
    await setDoc(doc(db, 'movimientos', 'm1'), { total: 100 })
    await setDoc(doc(db, 'pedidos', 'GU-AAA222'), { uid: 'otro', folio: 'GU-AAA222' })
    await setDoc(doc(db, 'pedidos', 'GU-BBB333'), { uid: 'colab1', folio: 'GU-BBB333' })
  })
  const db = env.authenticatedContext('colab1').firestore()
  await assertFails(getDoc(doc(db, 'articulos', 'a1')))
  await assertFails(getDocs(collection(db, 'movimientos')))
  await assertFails(getDocs(collection(db, 'pedidos')))
  await assertSucceeds(getDocs(query(collection(db, 'pedidos'), where('uid', '==', 'colab1'))))
  await assertSucceeds(getDoc(doc(db, 'pedidos', 'GU-AAA222')), 'con el folio sí puede consultar')
  await assertFails(updateDoc(doc(db, 'pedidos', 'GU-BBB333'), { estado: 'entregado' }), 'no puede cambiar su estado')
})

test('opciones públicas: todos leen, solo admin escribe', async () => {
  const anon = env.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(doc(anon, 'publico', 'opciones')))
  const colab = env.authenticatedContext('colab1').firestore()
  await assertFails(setDoc(doc(colab, 'publico', 'opciones'), { sucursales: [] }))
  const admin = await hacerAdmin('admin1')
  await assertSucceeds(setDoc(doc(admin, 'publico', 'opciones'), { sucursales: ['X'] }))
})

test('acceso de admin solo con la clave correcta', async () => {
  const db = env.authenticatedContext('u1').firestore()
  await assertFails(setDoc(doc(db, 'admins', 'u1'), { nombre: 'Intruso', clave: 'GEB-AAAA-AAAA-AAAA-AAAA', creadoEn: serverTimestamp() }))
  await assertFails(setDoc(doc(db, 'admins', 'otro'), { nombre: 'Alguien', clave: CLAVE, creadoEn: serverTimestamp() }), 'no puede dar acceso a otro uid')
  await assertSucceeds(setDoc(doc(db, 'admins', 'u1'), { nombre: 'Admin', clave: CLAVE, creadoEn: serverTimestamp() }))
  await assertFails(updateDoc(doc(db, 'admins', 'u1'), { nombre: 'Otro' }), 'no se edita')
})

test('admin lee y escribe inventario, movimientos y pedidos; no-admin no', async () => {
  const admin = await hacerAdmin('admin1')
  await assertSucceeds(setDoc(doc(admin, 'articulos', 'a1'), { costo: 100, real: 3 }))
  await assertSucceeds(setDoc(doc(admin, 'movimientos', 'm1'), { tipo: 'salida' }))
  await assertSucceeds(getDocs(collection(admin, 'pedidos')))
  await assertSucceeds(getDocs(collection(admin, 'admins')))
  const colab = env.authenticatedContext('colab1').firestore()
  await setDoc(doc(colab, 'pedidos', 'GU-ABC234'), pedido('colab1'))
  await assertSucceeds(updateDoc(doc(admin, 'pedidos', 'GU-ABC234'), { estado: 'en_proceso' }))
  await assertFails(setDoc(doc(colab, 'articulos', 'a2'), { costo: 1 }))
  await assertFails(getDocs(collection(colab, 'admins')))
})
