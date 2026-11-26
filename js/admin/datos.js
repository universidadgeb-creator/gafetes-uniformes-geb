// Escrituras del panel en Firestore. Cada cambio de inventario se hace en un lote (batch)
// que guarda el movimiento y ajusta el "real" del artículo al mismo tiempo.
import { claveGrupo, isoLocal, nombreArticulo } from '../comun.js'
import {
  arrayUnion,
  collection,
  db,
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from '../firebase.js'
import { articuloPorId, estado } from './estado.js'

const limpiarNumero = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
export { limpiarNumero }

// ---------- Artículos ----------

export async function crearArticulos(base, variantes) {
  const lote = writeBatch(db)
  for (const v of variantes) {
    const ref = doc(collection(db, 'articulos'))
    const a = {
      categoria: base.categoria,
      tipo: base.tipo,
      nombre: base.nombre || '',
      unidad: base.unidad || 'Todas',
      talla: v.talla || null,
      costo: limpiarNumero(base.costo),
      real: Math.round(limpiarNumero(v.real)),
      deseado: Math.round(limpiarNumero(v.deseado)),
      proveedor: base.proveedor || null,
      activo: true,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    }
    a.grupo = claveGrupo(a)
    lote.set(ref, a)
  }
  await lote.commit()
}

export async function actualizarArticulo(id, cambios) {
  const actual = articuloPorId(id)
  const nuevo = { ...actual, ...cambios }
  await updateDoc(doc(db, 'articulos', id), { ...cambios, grupo: claveGrupo(nuevo), actualizadoEn: serverTimestamp() })
}

export async function actualizarVarios(ids, cambios) {
  const lote = writeBatch(db)
  for (const id of ids) {
    const nuevo = { ...articuloPorId(id), ...cambios }
    lote.update(doc(db, 'articulos', id), { ...cambios, grupo: claveGrupo(nuevo), actualizadoEn: serverTimestamp() })
  }
  await lote.commit()
}

export async function eliminarArticulo(id) {
  await deleteDoc(doc(db, 'articulos', id))
}

// Importación desde Excel: crea los nuevos y actualiza (costo, deseado, real) los existentes.
export async function importarArticulos(filas) {
  const porClave = new Map(estado.articulos.map((a) => [`${a.grupo}|${a.talla ?? ''}`, a]))
  let creados = 0
  let actualizados = 0
  for (let i = 0; i < filas.length; i += 400) {
    const lote = writeBatch(db)
    for (const f of filas.slice(i, i + 400)) {
      const a = {
        categoria: f.categoria,
        tipo: f.tipo,
        nombre: f.nombre || '',
        unidad: f.unidad || 'Todas',
        talla: f.talla || null,
      }
      a.grupo = claveGrupo(a)
      const existente = porClave.get(`${a.grupo}|${a.talla ?? ''}`)
      if (existente) {
        lote.update(doc(db, 'articulos', existente.id), {
          costo: f.costo,
          deseado: f.deseado,
          real: f.real,
          ...(f.proveedor ? { proveedor: f.proveedor } : {}),
          activo: true,
          actualizadoEn: serverTimestamp(),
        })
        actualizados++
      } else {
        lote.set(doc(collection(db, 'articulos')), {
          ...a,
          costo: f.costo,
          real: f.real,
          deseado: f.deseado,
          proveedor: f.proveedor || null,
          activo: true,
          creadoEn: serverTimestamp(),
          actualizadoEn: serverTimestamp(),
        })
        creados++
      }
    }
    await lote.commit()
  }
  return { creados, actualizados }
}

// ---------- Movimientos ----------

function datosArticulo(a) {
  return {
    articuloId: a.id,
    articuloNombre: nombreArticulo(a),
    categoria: a.categoria,
    tipoArticulo: a.tipo,
    unidadArticulo: a.unidad ?? 'Todas',
    talla: a.talla ?? null,
  }
}

// lineas: [{ articuloId, cantidad, costoUnitario? }]
// tipo: 'entrada' (suma), 'salida' (resta), 'ajuste' (cantidad con signo).
function agregarMovimientos(lote, tipo, lineas, comunes) {
  for (const l of lineas) {
    const a = articuloPorId(l.articuloId)
    if (!a) continue
    const cantidad = tipo === 'ajuste' ? Math.round(l.cantidad) : Math.abs(Math.round(l.cantidad))
    if (!cantidad) continue
    const delta = tipo === 'entrada' ? cantidad : tipo === 'salida' ? -cantidad : cantidad
    const costoUnitario = l.costoUnitario != null ? limpiarNumero(l.costoUnitario) : Number(a.costo) || 0
    lote.set(doc(collection(db, 'movimientos')), {
      tipo,
      ...datosArticulo(a),
      cantidad,
      delta,
      costoUnitario,
      total: cantidad * costoUnitario,
      fecha: comunes.fecha || isoLocal(),
      por: estado.admin?.nombre ?? null,
      creadoEn: serverTimestamp(),
      ...limpiarComunes(comunes),
    })
    const cambios = { real: increment(delta), actualizadoEn: serverTimestamp() }
    if (tipo === 'entrada' && l.actualizarCosto) cambios.costo = costoUnitario
    lote.update(doc(db, 'articulos', a.id), cambios)
  }
}

function limpiarComunes(c) {
  const campos = ['motivo', 'razon', 'detalleRazon', 'colaborador', 'sucursal', 'rol', 'area', 'solicitadoPor', 'pedidoId', 'proveedor', 'factura', 'nota']
  const r = {}
  for (const k of campos) if (c[k] != null && c[k] !== '') r[k] = typeof c[k] === 'string' ? c[k].trim() : c[k]
  return r
}

export async function registrarMovimientos(tipo, lineas, comunes = {}) {
  const lote = writeBatch(db)
  agregarMovimientos(lote, tipo, lineas, comunes)
  await lote.commit()
}

export async function anularMovimiento(m) {
  const lote = writeBatch(db)
  lote.delete(doc(db, 'movimientos', m.id))
  if (articuloPorId(m.articuloId)) {
    lote.update(doc(db, 'articulos', m.articuloId), { real: increment(-(Number(m.delta) || 0)), actualizadoEn: serverTimestamp() })
  }
  await lote.commit()
}

// ---------- Pedidos ----------

const entradaHistorial = (est, nota) => ({ estado: est, en: Timestamp.now(), por: estado.admin?.nombre ?? '', nota: nota || '' })

export async function cambiarEstadoPedido(p, nuevoEstado, { mensaje, nota } = {}) {
  const cambios = { estado: nuevoEstado, historial: arrayUnion(entradaHistorial(nuevoEstado, nota)), actualizadoEn: serverTimestamp() }
  if (nuevoEstado !== 'nuevo' && !p.atendidoEn) cambios.atendidoEn = serverTimestamp()
  if (nuevoEstado === 'listo' && !p.listoEn) cambios.listoEn = serverTimestamp()
  if (nuevoEstado === 'entregado' || nuevoEstado === 'rechazado') cambios.resueltoEn = serverTimestamp()
  else cambios.resueltoEn = null
  if (mensaje != null) cambios.mensaje = mensaje
  await updateDoc(doc(db, 'pedidos', p.id), cambios)
}

export async function guardarMensajePedido(p, mensaje) {
  await updateDoc(doc(db, 'pedidos', p.id), { mensaje, actualizadoEn: serverTimestamp() })
}

// Cierra el pedido como entregado y descuenta del inventario en un solo lote.
export async function entregarPedido(p, lineas, { fecha, motivo, razon, mensaje, descontar = true } = {}) {
  const lote = writeBatch(db)
  if (descontar) {
    agregarMovimientos(lote, 'salida', lineas, {
      fecha,
      motivo,
      razon: motivo === 'reposicion' ? razon : null,
      detalleRazon: motivo === 'reposicion' ? p.detalleRazon : null,
      colaborador: p.nombre,
      sucursal: p.sucursal,
      rol: p.rol,
      area: p.area,
      solicitadoPor: p.solicitadoPor || p.nombre,
      pedidoId: p.id,
    })
  }
  const cambios = {
    estado: 'entregado',
    resueltoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
    entregaFecha: fecha || isoLocal(),
    descontado: descontar,
    historial: arrayUnion(entradaHistorial('entregado', descontar ? 'Entregado y descontado del inventario' : 'Entregado sin descontar inventario')),
  }
  if (!p.atendidoEn) cambios.atendidoEn = serverTimestamp()
  if (mensaje != null) cambios.mensaje = mensaje
  lote.update(doc(db, 'pedidos', p.id), cambios)
  await lote.commit()
}

export async function eliminarPedido(p) {
  await deleteDoc(doc(db, 'pedidos', p.id))
}

// ---------- Opciones públicas ----------

export function gruposDesdeArticulos(articulos) {
  const grupos = new Map()
  for (const a of articulos) {
    if (a.activo === false) continue
    const g = grupos.get(a.grupo) ?? {
      id: a.grupo,
      categoria: a.categoria,
      tipo: a.tipo,
      nombre: a.nombre || '',
      unidad: a.unidad || 'Todas',
      tallas: [],
    }
    if (a.talla && !g.tallas.includes(a.talla)) g.tallas.push(a.talla)
    grupos.set(a.grupo, g)
  }
  return [...grupos.values()].sort(
    (x, y) => x.categoria.localeCompare(y.categoria) || `${x.tipo} ${x.nombre}`.localeCompare(`${y.tipo} ${y.nombre}`, 'es'),
  )
}

export async function guardarOpciones(cambios) {
  await setDoc(doc(db, 'publico', 'opciones'), { ...cambios, actualizadoEn: serverTimestamp() }, { merge: true })
}

let ultimaFirma = null
// Mantiene publico/opciones.grupos al día con el inventario (lo que puede pedir el colaborador).
export async function sincronizarGrupos() {
  if (!estado.cargado.articulos || !estado.cargado.opciones) return
  const grupos = gruposDesdeArticulos(estado.articulos)
  const firma = JSON.stringify(grupos)
  if (firma === JSON.stringify(estado.opciones.grupos ?? []) && estado.opcionesGuardadas) return
  if (firma === ultimaFirma) return
  ultimaFirma = firma
  const base = estado.opcionesGuardadas ? {} : { ...estado.opciones }
  delete base.grupos
  await guardarOpciones({ ...base, grupos })
}

// ---------- Accesos ----------

export async function quitarAcceso(uid) {
  await deleteDoc(doc(db, 'admins', uid))
}
