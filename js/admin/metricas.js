// Cálculos del panel: inventario, entregas, rotación, tiempos de tickets y presupuesto.
// Funciones puras (sin Firebase ni DOM) para poder probarlas en Node: npm run probar
import { ABIERTOS, aFecha, CERRADOS, normalizar } from '../comun.js'

export const HORA_MS = 36e5
export const DIA_MS = 864e5
const MES_DIAS = 30.4375

export function mesClave(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ultimosMeses(n, hasta = new Date()) {
  const r = []
  for (let i = n - 1; i >= 0; i--) r.push(mesClave(new Date(hasta.getFullYear(), hasta.getMonth() - i, 1)))
  return r
}

export const PERIODOS = {
  mes: 'Este mes',
  '3m': 'Últimos 3 meses',
  '12m': 'Últimos 12 meses',
  anio: 'Este año',
  todo: 'Todo',
}

export function rangoPeriodo(periodo, hoy = new Date()) {
  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  switch (periodo) {
    case 'mes':
      return { desde: new Date(y, m, 1), hasta: null }
    case '3m':
      return { desde: new Date(y, m - 2, 1), hasta: null }
    case '12m':
      return { desde: new Date(y, m - 11, 1), hasta: null }
    case 'anio':
      return { desde: new Date(y, 0, 1), hasta: null }
    default:
      return { desde: null, hasta: null }
  }
}

export function enRango(fecha, rango = {}) {
  if (!fecha) return false
  if (rango.desde && fecha < rango.desde) return false
  if (rango.hasta && fecha > rango.hasta) return false
  return true
}

export const fechaMovimiento = (m) => aFecha(m.fecha) ?? aFecha(m.creadoEn)
export const totalMovimiento = (m) => (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0)

// ---------- Inventario ----------

export function estadoStock(a) {
  const real = Number(a.real) || 0
  const deseado = Number(a.deseado) || 0
  if (real <= 0 && deseado > 0) return 'agotado'
  if (real < deseado) return 'bajo'
  if (deseado > 0 && real > deseado * 1.5 && real - deseado >= 3) return 'sobrante'
  return 'ok'
}

export function resumenInventario(articulos) {
  const r = {
    articulos: 0,
    piezas: 0,
    valor: 0,
    deseadoPiezas: 0,
    valorDeseado: 0,
    faltantePiezas: 0,
    faltanteCosto: 0,
    sobrantePiezas: 0,
    bajoDeseado: [],
    agotados: [],
    porCategoria: {},
  }
  for (const a of articulos) {
    if (a.activo === false) continue
    const real = Number(a.real) || 0
    const deseado = Number(a.deseado) || 0
    const costo = Number(a.costo) || 0
    const faltante = Math.max(0, deseado - real)
    const cat = (r.porCategoria[a.categoria] ??= { articulos: 0, piezas: 0, valor: 0, faltantePiezas: 0, faltanteCosto: 0 })
    r.articulos++
    cat.articulos++
    r.piezas += Math.max(0, real)
    cat.piezas += Math.max(0, real)
    r.valor += Math.max(0, real) * costo
    cat.valor += Math.max(0, real) * costo
    r.deseadoPiezas += deseado
    r.valorDeseado += deseado * costo
    r.faltantePiezas += faltante
    cat.faltantePiezas += faltante
    r.faltanteCosto += faltante * costo
    cat.faltanteCosto += faltante * costo
    r.sobrantePiezas += Math.max(0, real - deseado)
    const e = estadoStock(a)
    if (e === 'agotado') r.agotados.push(a)
    else if (e === 'bajo') r.bajoDeseado.push(a)
  }
  return r
}

// ---------- Entregas (salidas) ----------

function sumar(mapa, clave, piezas, costo) {
  const k = clave || 'Sin dato'
  const x = (mapa[k] ??= { clave: k, piezas: 0, costo: 0, n: 0 })
  x.piezas += piezas
  x.costo += costo
  x.n++
}

export function ordenar(mapa, por = 'costo') {
  return Object.values(mapa).sort((a, b) => b[por] - a[por] || b.piezas - a.piezas)
}

export function resumenEntregas(movimientos, rango = {}) {
  const r = {
    entregas: 0,
    piezas: 0,
    costo: 0,
    porMotivo: { nuevo: { piezas: 0, costo: 0, personas: 0 }, reposicion: { piezas: 0, costo: 0, personas: 0 } },
    porRazon: {},
    porSucursal: {},
    porCategoria: {},
    porArea: {},
    porArticulo: {},
    compras: { piezas: 0, costo: 0 },
    ajustes: { piezas: 0, costo: 0 },
  }
  const personas = { nuevo: new Set(), reposicion: new Set() }
  for (const m of movimientos) {
    const f = fechaMovimiento(m)
    if (!enRango(f, rango)) continue
    const cant = Number(m.cantidad) || 0
    const total = totalMovimiento(m)
    if (m.tipo === 'entrada') {
      r.compras.piezas += cant
      r.compras.costo += total
      continue
    }
    if (m.tipo === 'ajuste') {
      r.ajustes.piezas += cant
      r.ajustes.costo += total
      continue
    }
    if (m.tipo !== 'salida') continue
    r.entregas++
    r.piezas += cant
    r.costo += total
    const motivo = m.motivo === 'nuevo' ? 'nuevo' : 'reposicion'
    r.porMotivo[motivo].piezas += cant
    r.porMotivo[motivo].costo += total
    if (m.colaborador) personas[motivo].add(normalizar(m.colaborador))
    if (motivo === 'reposicion') sumar(r.porRazon, m.razon || 'sin_razon', cant, total)
    sumar(r.porSucursal, m.sucursal, cant, total)
    sumar(r.porCategoria, m.categoria, cant, total)
    sumar(r.porArea, m.area, cant, total)
    sumar(r.porArticulo, m.articuloNombre, cant, total)
  }
  r.porMotivo.nuevo.personas = personas.nuevo.size
  r.porMotivo.reposicion.personas = personas.reposicion.size
  r.costoPorNuevoIngreso = personas.nuevo.size ? r.porMotivo.nuevo.costo / personas.nuevo.size : 0
  return r
}

// Gasto mensual de entregas, separado por motivo y por categoría, más compras.
export function gastoPorMes(movimientos, meses) {
  const filas = Object.fromEntries(
    meses.map((k) => [k, { mes: k, nuevo: 0, reposicion: 0, gafete: 0, uniforme: 0, piezas: 0, compras: 0 }]),
  )
  for (const m of movimientos) {
    const f = fechaMovimiento(m)
    if (!f) continue
    const fila = filas[mesClave(f)]
    if (!fila) continue
    const total = totalMovimiento(m)
    if (m.tipo === 'entrada') fila.compras += total
    if (m.tipo !== 'salida') continue
    fila[m.motivo === 'nuevo' ? 'nuevo' : 'reposicion'] += total
    if (m.categoria === 'gafete' || m.categoria === 'uniforme') fila[m.categoria] += total
    fila.piezas += Number(m.cantidad) || 0
  }
  return meses.map((k) => filas[k])
}

// ---------- Pedidos (tickets) ----------

const horasEntre = (a, b) => (a && b ? (b.getTime() - a.getTime()) / HORA_MS : null)

function percentil(valores, p) {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const i = (v.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return v[lo] + (v[hi] - v[lo]) * (i - lo)
}

const promedio = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)

export function horasResolucion(p) {
  return horasEntre(aFecha(p.creadoEn), aFecha(p.resueltoEn))
}

export function antiguedadHoras(p, ahora = new Date()) {
  const inicio = aFecha(p.creadoEn)
  if (!inicio) return null
  const fin = CERRADOS.includes(p.estado) ? aFecha(p.resueltoEn) ?? ahora : ahora
  return horasEntre(inicio, fin)
}

export function metricasPedidos(pedidos, { rango = {}, slaHoras = 72, ahora = new Date() } = {}) {
  const r = {
    recibidos: 0,
    porEstado: { nuevo: 0, en_proceso: 0, listo: 0, entregado: 0, rechazado: 0 },
    abiertos: 0,
    vencidos: 0,
    abiertosPorAntiguedad: { menos24: 0, de1a3: 0, de3a7: 0, mas7: 0 },
    resueltos: 0,
    promedioResolucion: null,
    medianaResolucion: null,
    p90Resolucion: null,
    dentroSla: 0,
    pctDentroSla: null,
    promedioAtencion: null,
    porSucursal: {},
    porTipo: { nuevo: 0, reposicion: 0 },
  }
  const resol = []
  const aten = []
  const porSuc = {}
  for (const p of pedidos) {
    const creado = aFecha(p.creadoEn)
    if (ABIERTOS.includes(p.estado)) {
      r.abiertos++
      const edad = antiguedadHoras(p, ahora) ?? 0
      if (edad > slaHoras) r.vencidos++
      const dias = edad / 24
      r.abiertosPorAntiguedad[dias < 1 ? 'menos24' : dias < 3 ? 'de1a3' : dias < 7 ? 'de3a7' : 'mas7']++
    }
    if (enRango(creado, rango)) {
      r.recibidos++
      r.porEstado[p.estado] = (r.porEstado[p.estado] ?? 0) + 1
      r.porTipo[p.tipoSolicitud === 'nuevo' ? 'nuevo' : 'reposicion']++
      const ha = horasEntre(creado, aFecha(p.atendidoEn))
      if (ha != null && ha >= 0) aten.push(ha)
      const s = (porSuc[p.sucursal || 'Sin dato'] ??= { clave: p.sucursal || 'Sin dato', n: 0, abiertos: 0, horas: [] })
      s.n++
      if (ABIERTOS.includes(p.estado)) s.abiertos++
    }
    const resuelto = aFecha(p.resueltoEn)
    if (CERRADOS.includes(p.estado) && enRango(resuelto, rango)) {
      const hr = horasEntre(creado, resuelto)
      if (hr != null && hr >= 0) {
        r.resueltos++
        resol.push(hr)
        if (hr <= slaHoras) r.dentroSla++
        const s = (porSuc[p.sucursal || 'Sin dato'] ??= { clave: p.sucursal || 'Sin dato', n: 0, abiertos: 0, horas: [] })
        s.horas.push(hr)
      }
    }
  }
  r.promedioResolucion = promedio(resol)
  r.medianaResolucion = percentil(resol, 0.5)
  r.p90Resolucion = percentil(resol, 0.9)
  r.pctDentroSla = resol.length ? (r.dentroSla / resol.length) * 100 : null
  r.promedioAtencion = promedio(aten)
  r.porSucursal = Object.values(porSuc)
    .map((s) => ({ clave: s.clave, n: s.n, abiertos: s.abiertos, resueltos: s.horas.length, promedio: promedio(s.horas) }))
    .sort((a, b) => b.n - a.n)
  return r
}

export function resolucionPorMes(pedidos, meses) {
  const filas = Object.fromEntries(meses.map((k) => [k, { mes: k, horas: [], recibidos: 0 }]))
  for (const p of pedidos) {
    const c = aFecha(p.creadoEn)
    if (c && filas[mesClave(c)]) filas[mesClave(c)].recibidos++
    if (!CERRADOS.includes(p.estado)) continue
    const f = aFecha(p.resueltoEn)
    const hr = horasResolucion(p)
    if (!f || hr == null || !filas[mesClave(f)]) continue
    filas[mesClave(f)].horas.push(hr)
  }
  return meses.map((k) => ({
    mes: k,
    recibidos: filas[k].recibidos,
    resueltos: filas[k].horas.length,
    promedio: promedio(filas[k].horas),
  }))
}

// ---------- Presupuesto ----------

// Consumo promedio mensual por artículo con base en las entregas de los últimos `mesesBase` meses
// (o desde el primer movimiento registrado, si el sistema es más nuevo). La compra sugerida deja
// cada artículo en su inventario deseado al final del horizonte:
//   compra = max(0, deseado − real + consumo mensual × horizonte)
export function proyeccion(articulos, movimientos, { mesesBase = 6, horizonte = 6, hoy = new Date(), ingresosMes = null } = {}) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - mesesBase, hoy.getDate())
  let primera = null
  for (const m of movimientos) {
    const f = fechaMovimiento(m)
    if (f && (!primera || f < primera)) primera = f
  }
  const desde = primera && primera > inicio ? primera : inicio
  const meses = desde === inicio ? mesesBase : Math.max(1, (hoy.getTime() - desde.getTime()) / (MES_DIAS * DIA_MS))

  const consumo = {}
  const personasNuevas = new Set()
  let costoNuevos = 0
  for (const m of movimientos) {
    if (m.tipo !== 'salida') continue
    const f = fechaMovimiento(m)
    if (!f || f < desde || f > hoy) continue
    const c = (consumo[m.articuloId] ??= { nuevo: 0, reposicion: 0 })
    const motivo = m.motivo === 'nuevo' ? 'nuevo' : 'reposicion'
    c[motivo] += Number(m.cantidad) || 0
    if (motivo === 'nuevo') {
      costoNuevos += totalMovimiento(m)
      if (m.colaborador) personasNuevas.add(normalizar(m.colaborador))
    }
  }

  const totales = {
    compraPiezas: 0,
    compraCosto: 0,
    faltanteCosto: 0,
    proyNuevoCosto: 0,
    proyReposicionCosto: 0,
    porCategoria: {},
  }
  const filas = []
  for (const a of articulos) {
    if (a.activo === false) continue
    const c = consumo[a.id] ?? { nuevo: 0, reposicion: 0 }
    const costo = Number(a.costo) || 0
    const real = Number(a.real) || 0
    const deseado = Number(a.deseado) || 0
    const mesNuevo = c.nuevo / meses
    const mesReposicion = c.reposicion / meses
    const consumoMes = mesNuevo + mesReposicion
    const proyectado = consumoMes * horizonte
    const faltante = Math.max(0, deseado - real)
    const compra = Math.max(0, Math.ceil(deseado - real + proyectado - 1e-9))
    const fila = { articulo: a, consumoMes, mesNuevo, mesReposicion, proyectado, faltante, compra, costoCompra: compra * costo }
    filas.push(fila)
    totales.compraPiezas += compra
    totales.compraCosto += fila.costoCompra
    totales.faltanteCosto += faltante * costo
    totales.proyNuevoCosto += mesNuevo * horizonte * costo
    totales.proyReposicionCosto += mesReposicion * horizonte * costo
    const cat = (totales.porCategoria[a.categoria] ??= { compraPiezas: 0, compraCosto: 0 })
    cat.compraPiezas += compra
    cat.compraCosto += fila.costoCompra
  }
  filas.sort((x, y) => y.costoCompra - x.costoCompra || y.consumoMes - x.consumoMes)

  const kitNuevoIngreso = personasNuevas.size ? costoNuevos / personasNuevas.size : 0
  const nuevosPorMes = personasNuevas.size / meses
  const escenario =
    ingresosMes != null && ingresosMes >= 0
      ? { ingresosMes, costo: ingresosMes * kitNuevoIngreso * horizonte, diferencia: ingresosMes * kitNuevoIngreso * horizonte - totales.proyNuevoCosto }
      : null
  return { mesesBase: meses, desde, filas, totales, kitNuevoIngreso, nuevosPorMes, escenario }
}
