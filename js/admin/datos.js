// Escrituras del panel en Firestore. Cada cambio de inventario se hace en un lote (batch)
// que guarda el movimiento y ajusta el "real" del artículo al mismo tiempo.
import { claveGrupo, isoLocal, nombreArticulo, OPCIONES_BASE, SUCURSALES_PRIMERA_VERSION } from '../comun.js'
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
import { emparejarArticulos } from './importar.js'

const limpiarNumero = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
export { limpiarNumero }

// ---------- Artículos ----------

export async function crearArticulos(base, variantes) {
  const lote = writeBatch(db)
  const creados = []
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
      color: base.color || null,
      genero: base.genero || null,
      rol: base.rol || null,
      area: base.area || null,
      activo: true,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    }
    a.grupo = claveGrupo(a)
    lote.set(ref, a)
    creados.push({ id: ref.id, ...a })
  }
  await lote.commit()
  return creados
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

// Importación desde Excel (ver emparejarArticulos en importar.js para cómo se reconoce cada renglón).
export async function importarArticulos(filas) {
  const pares = emparejarArticulos(filas, estado.articulos)
  const refs = pares.map((p) => (p.existente ? null : doc(collection(db, 'articulos'))))
  let creados = 0
  let actualizados = 0
  for (let i = 0; i < pares.length; i += 400) {
    const lote = writeBatch(db)
    pares.slice(i, i + 400).forEach(({ fila: f, existente, porSuId }, j) => {
      const k = i + j
      const a = {
        categoria: f.categoria,
        tipo: f.tipo,
        nombre: f.nombre || '',
        unidad: f.unidad || 'Todas',
        talla: f.talla || null,
        color: f.color || null,
        genero: f.genero || null,
        rol: f.rol || null,
        area: f.area || null,
      }
      a.grupo = claveGrupo(a)
      if (!existente) {
        lote.set(refs[k], {
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
        return
      }
      // Con ID se respeta todo lo del archivo; sin ID, color, género, rol y área vacíos no borran lo que ya había.
      const datos = porSuId
        ? a
        : { ...a, color: a.color ?? existente.color ?? null, genero: a.genero ?? existente.genero ?? null, rol: a.rol ?? existente.rol ?? null, area: a.area ?? existente.area ?? null }
      datos.grupo = claveGrupo(datos)
      const id = existente.id ?? refs[existente.nuevo].id
      lote.update(doc(db, 'articulos', id), {
        ...datos,
        costo: f.costo,
        deseado: f.deseado,
        real: f.real,
        ...(f.proveedor ? { proveedor: f.proveedor } : {}),
        activo: true,
        actualizadoEn: serverTimestamp(),
      })
      if (existente.id) actualizados++
    })
    await lote.commit()
  }
  return { creados, actualizados }
}

// Guarda el costo por pieza de varios artículos (Map id → costo).
export async function actualizarCostos(costos) {
  if (!costos.size) return
  const lote = writeBatch(db)
  for (const [id, costo] of costos) lote.update(doc(db, 'articulos', id), { costo, actualizadoEn: serverTimestamp() })
  await lote.commit()
}

// Deja una sola versión de cada uniforme repetido. planes: resultado de planearUnion (importar.js).
export async function unirDuplicados(planes) {
  const operaciones = []
  let borrados = 0
  let movidos = 0
  for (const p of planes) {
    for (const x of p.adoptar) operaciones.push((lote) => lote.update(doc(db, 'articulos', x.id), { ...x.datos, activo: true, actualizadoEn: serverTimestamp() }))
    for (const s of p.sumar) operaciones.push((lote) => lote.update(doc(db, 'articulos', s.id), { real: increment(s.cantidad), actualizadoEn: serverTimestamp() }))
    for (const b of p.borrar) {
      for (const m of estado.movimientos.filter((x) => x.articuloId === b.id)) {
        operaciones.push((lote) => lote.update(doc(db, 'movimientos', m.id), { articuloId: b.destino, articuloNombre: p.nombre }))
        movidos++
      }
      operaciones.push((lote) => lote.delete(doc(db, 'articulos', b.id)))
      borrados++
    }
  }
  for (let i = 0; i < operaciones.length; i += 400) {
    const lote = writeBatch(db)
    for (const op of operaciones.slice(i, i + 400)) op(lote)
    await lote.commit()
  }
  return { borrados, movidos, adoptados: planes.reduce((s, p) => s + p.adoptar.length, 0) }
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
    const a = l.articulo ?? articuloPorId(l.articuloId)
    if (!a) continue
    const cantidad = tipo === 'ajuste' ? Math.round(l.cantidad) : Math.abs(Math.round(l.cantidad))
    if (!cantidad) continue
    // sinInventario: se registra la entrega y su costo, pero no se descuenta del "real" (p. ej. gafetes históricos).
    const delta = l.sinInventario ? 0 : tipo === 'entrada' ? cantidad : tipo === 'salida' ? -cantidad : cantidad
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
    if (l.sinInventario) continue
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
  if (Number(m.delta) && articuloPorId(m.articuloId)) {
    lote.update(doc(db, 'articulos', m.articuloId), { real: increment(-(Number(m.delta) || 0)), actualizadoEn: serverTimestamp() })
  }
  await lote.commit()
}

// ---------- Gafetes por colaborador ----------

// Devuelve el artículo de gafete elegido o crea uno nuevo (tipo + costo) si todavía no hay.
export async function asegurarArticuloGafete({ articuloId, tipo, costo }) {
  const existente = articuloId && articuloPorId(articuloId)
  if (existente) return existente
  const [creado] = await crearArticulos({ categoria: 'gafete', tipo: tipo || 'Gafete PVC impreso', nombre: '', unidad: 'Todas', costo }, [{ talla: null, real: 0, deseado: 0 }])
  return creado
}

// registros: [{ nombre, sucursal, motivo, razon, detalle, fecha }]. Un gafete = una entrega de 1 pieza.
export async function registrarGafetes(registros, { articulo, descontar = false, nota = '' } = {}) {
  for (let i = 0; i < registros.length; i += 200) {
    const lote = writeBatch(db)
    for (const r of registros.slice(i, i + 200)) {
      agregarMovimientos(lote, 'salida', [{ articulo: r.articulo ?? articulo, cantidad: 1, sinInventario: !descontar, costoUnitario: r.costo ?? null }], {
        fecha: r.fecha,
        motivo: r.motivo,
        razon: r.motivo === 'reposicion' ? r.razon : null,
        detalleRazon: r.motivo === 'reposicion' ? r.detalle : null,
        colaborador: r.nombre,
        sucursal: r.sucursal,
        solicitadoPor: r.solicitadoPor || r.nombre,
        nota: r.nota || nota,
      })
    }
    await lote.commit()
  }
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
      color: a.color || null,
      genero: a.genero || null,
      rol: a.rol || null,
      area: a.area || null,
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
let sucursalesMigradas = false
export async function sincronizarGrupos() {
  if (!estado.cargado.articulos || !estado.cargado.opciones) return
  // Si el catálogo de sucursales sigue siendo el de la primera versión (sin cambios), se cambia por el oficial.
  if (!sucursalesMigradas && estado.opcionesGuardadas && JSON.stringify(estado.opciones.sucursales) === JSON.stringify(SUCURSALES_PRIMERA_VERSION)) {
    sucursalesMigradas = true
    await guardarOpciones({ sucursales: OPCIONES_BASE.sucursales })
  }
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
