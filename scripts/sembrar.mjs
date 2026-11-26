// Llena el EMULADOR con datos de ejemplo (inventarios, entregas de 8 meses y pedidos en todos los estados).
// Nunca toca el proyecto real: solo funciona con el proyecto demo-gafetes-geb.
//
//   npm run emuladores     (en otra terminal)
//   npm run sembrar
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { claveGrupo, nombreArticulo, OPCIONES_BASE } from '../js/comun.js'

const env = await initializeTestEnvironment({
  projectId: 'demo-gafetes-geb',
  firestore: { host: '127.0.0.1', port: 8083, rules: readFileSync('firestore.rules', 'utf8') },
})
await env.clearFirestore()

let semilla = 7
const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646
const elegir = (l) => l[Math.floor(azar() * l.length)]
const hoy = new Date()
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hace = (dias, horas = 0) => new Date(hoy.getTime() - dias * 864e5 - horas * 36e5)

const catalogo = [
  ['gafete', 'Gafete PVC impreso', '', 'Todas', [null], 45, 30, 40],
  ['gafete', 'Porta gafete', 'Rígido transparente', 'Todas', [null], 12, 60, 50],
  ['gafete', 'Cordón / lanyard', 'Negro con logo GEB', 'Todas', [null], 28, 8, 40],
  ['uniforme', 'Playera polo', 'Azul marino', 'Vivo 47', ['S', 'M', 'L', 'XL'], 260, 6, 10],
  ['uniforme', 'Playera deportiva (dry fit)', 'Negra', 'EasyFit', ['S', 'M', 'L', 'XL'], 185, 9, 8],
  ['uniforme', 'Pants', 'Negro', 'Todas', ['S', 'M', 'L', 'XL'], 340, 3, 6],
  ['uniforme', 'Chamarra', 'Rompevientos', 'Vivo 47', ['M', 'L'], 520, 1, 4],
]

const articulos = []
for (const [categoria, tipo, nombre, unidad, tallas, costo, real, deseado] of catalogo) {
  for (const talla of tallas) {
    const a = { categoria, tipo, nombre, unidad, talla, costo, real: Math.max(0, real + Math.round((azar() - 0.5) * 6)), deseado, proveedor: categoria === 'gafete' ? 'Impresos GDL' : 'Uniformes Occidente', activo: true }
    a.grupo = claveGrupo(a)
    a.id = `art-${articulos.length + 1}`
    articulos.push(a)
  }
}

const nombres = ['Ana Ruiz', 'Luis Torres', 'María López', 'Jorge Díaz', 'Sofía Herrera', 'Carlos Medina', 'Fernanda Gil', 'Raúl Castro', 'Paola Vega', 'Diego Ortiz', 'Elena Mora', 'Iván Rojas']
const sucursales = ['Vivo 47 · Naciones Unidas', 'Vivo 47 · Valle Real', 'Vivo 47 · Gourmetería', 'EasyFit · Ávila Camacho', 'EasyFit · Iteso', 'EasyFit · Cañadas']
const roles = ['Coach Deportivo', 'Técnico de Orden y Limpieza', 'Recepción', 'Concierge', 'Coach de Estiramiento']
const areas = ['Deportes', 'Mantenimiento y Servicios', 'Administración', 'Comercial']
const razones = ['extravio', 'desgaste', 'desgaste', 'mal_estado', 'cambio_talla']

const movimientos = []
const conUnidad = (s) => articulos.filter((a) => a.unidad === 'Todas' || s.startsWith(a.unidad))
for (let dia = 240; dia >= 1; dia -= 3) {
  if (azar() < 0.35) continue
  const sucursal = elegir(sucursales)
  const motivo = azar() < 0.55 ? 'nuevo' : 'reposicion'
  const colaborador = `${elegir(nombres)} ${dia}`
  const lineas = motivo === 'nuevo' ? conUnidad(sucursal).filter((a) => a.categoria === 'gafete' || (a.talla === 'M' && a.tipo !== 'Chamarra')) : [elegir(conUnidad(sucursal))]
  for (const a of lineas) {
    movimientos.push({
      tipo: 'salida', articuloId: a.id, articuloNombre: nombreArticulo(a), categoria: a.categoria, tipoArticulo: a.tipo, unidadArticulo: a.unidad, talla: a.talla,
      cantidad: 1, delta: -1, costoUnitario: a.costo, total: a.costo, fecha: iso(hace(dia)), motivo,
      ...(motivo === 'reposicion' ? { razon: elegir(razones) } : {}),
      colaborador, sucursal, rol: elegir(roles), area: elegir(areas), solicitadoPor: colaborador, por: 'Datos de prueba',
    })
  }
}
for (const a of articulos.filter((_, i) => i % 3 === 0)) {
  movimientos.push({ tipo: 'entrada', articuloId: a.id, articuloNombre: nombreArticulo(a), categoria: a.categoria, tipoArticulo: a.tipo, unidadArticulo: a.unidad, talla: a.talla, cantidad: 10, delta: 10, costoUnitario: a.costo, total: a.costo * 10, fecha: iso(hace(120)), proveedor: a.proveedor, factura: 'F-1029', por: 'Datos de prueba' })
}

const ts = (d) => Timestamp.fromDate(d)
const pedidos = []
const estados = ['entregado', 'entregado', 'entregado', 'entregado', 'rechazado', 'listo', 'en_proceso', 'nuevo', 'nuevo']
for (let i = 0; i < 26; i++) {
  const est = i < 18 ? elegir(estados.slice(0, 5)) : estados[5 + (i % 4)]
  const diasAtras = i < 18 ? 10 + Math.floor(azar() * 200) : Math.floor(azar() * 6)
  const creado = hace(diasAtras, Math.floor(azar() * 10))
  const horasRes = 4 + azar() * 110
  const tipoSolicitud = azar() < 0.5 ? 'nuevo' : 'reposicion'
  const a = elegir(articulos.filter((x) => x.categoria === 'uniforme'))
  const p = {
    folio: `GU-PRB${String(i).padStart(3, '0')}`.slice(0, 9),
    uid: 'datos-prueba',
    nombre: `${elegir(nombres)} (prueba)`,
    solicitadoPor: azar() < 0.2 ? 'Gerente de prueba' : null,
    fecha: iso(creado),
    sucursal: elegir(sucursales),
    rol: elegir(roles),
    area: elegir(areas),
    tipoSolicitud,
    razon: tipoSolicitud === 'reposicion' ? elegir(razones) : null,
    articulos: [
      { grupo: a.grupo, categoria: a.categoria, tipo: a.tipo, nombre: a.nombre, descripcion: nombreArticulo(a), talla: a.talla, cantidad: 1 },
      ...(tipoSolicitud === 'nuevo' ? [{ grupo: articulos[0].grupo, categoria: 'gafete', tipo: articulos[0].tipo, nombre: '', descripcion: articulos[0].tipo, talla: null, cantidad: 1 }] : []),
    ],
    estado: est,
    creadoEn: ts(creado),
  }
  p.unidad = p.sucursal.split(' · ')[0]
  if (est !== 'nuevo') p.atendidoEn = ts(new Date(creado.getTime() + Math.min(horasRes, 2 + azar() * 20) * 36e5))
  if (est === 'entregado' || est === 'rechazado') p.resueltoEn = ts(new Date(creado.getTime() + horasRes * 36e5))
  if (est === 'rechazado') p.mensaje = 'Tu gafete anterior sigue vigente.'
  p.historial = [{ estado: est, en: p.resueltoEn ?? p.atendidoEn ?? p.creadoEn, por: 'Datos de prueba', nota: '' }]
  pedidos.push(p)
}
pedidos[0].folio = 'GU-PRB000'

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const lote = writeBatch(db)
  for (const { id, ...a } of articulos) lote.set(doc(db, 'articulos', id), a)
  movimientos.forEach((m, i) => lote.set(doc(db, 'movimientos', `mov-${i}`), { ...m, creadoEn: Timestamp.now() }))
  for (const p of pedidos) lote.set(doc(db, 'pedidos', p.folio), p)
  await lote.commit()
  const grupos = [...new Map(articulos.map((a) => [a.grupo, { id: a.grupo, categoria: a.categoria, tipo: a.tipo, nombre: a.nombre, unidad: a.unidad, tallas: articulos.filter((x) => x.grupo === a.grupo && x.talla).map((x) => x.talla) }])).values()]
  await setDoc(doc(db, 'publico', 'opciones'), { ...OPCIONES_BASE, grupos })
})
console.log(`Emulador sembrado: ${articulos.length} artículos, ${movimientos.length} movimientos, ${pedidos.length} pedidos.`)
await env.cleanup()
