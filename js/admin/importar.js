// Lectura de la plantilla de Excel: hoja de artículos (uniformes por talla) y hoja de gafetes
// por colaborador (nombre, sucursal, reposición sí/no). Funciones puras: se prueban en Node.
import { claveGrupo, llaveColaborador, nombreArticulo, normalizar } from '../comun.js'

const claveColumna = (k) => normalizar(k).replace(/[^a-z0-9]/g, '')
const texto = (v) => String(v ?? '').trim()
export const numeroDe = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function normalizarFila(fila) {
  const r = {}
  for (const [k, v] of Object.entries(fila)) r[claveColumna(k)] = typeof v === 'string' ? v.trim() : v
  return r
}

const buscar = (fila, prueba) => {
  const k = Object.keys(fila).find(prueba)
  return k == null ? undefined : fila[k]
}
const esEjemplo = (fila) => Object.values(fila).some((v) => normalizar(v).startsWith('ejemplo'))
const columnaNombre = (k) => ['nombredelcolaborador', 'colaborador', 'nombrecolaborador', 'nombrecompleto', 'nombre'].includes(k) || k.startsWith('nombredel') || k.includes('colaborador')

// 'articulos' | 'gafetes' | null, según los encabezados de la hoja.
export function tipoHoja(filas) {
  const claves = new Set(filas.slice(0, 10).flatMap((f) => Object.keys(normalizarFila(f))))
  if (claves.has('categoria') && claves.has('tipo')) return 'articulos'
  if ([...claves].some(columnaNombre) && claves.has('sucursal')) return 'gafetes'
  return null
}

// ---------- Uniformes / artículos ----------

// "Hombre", "H", "Dama", "Unisex"… → Hombre | Mujer | Unisex | ''
export function leerGenero(valor) {
  const s = normalizar(valor)
  if (!s) return ''
  if (s === 'h' || /^(hombre|caballero|masculino|varon)/.test(s)) return 'Hombre'
  if (s === 'm' || /^(mujer|dama|femenino)/.test(s)) return 'Mujer'
  if (s === 'u' || /^(unisex|ambos|mixto)/.test(s)) return 'Unisex'
  return ''
}


export function leerArticulo(fila) {
  if (esEjemplo(fila)) return null
  const v = normalizarFila(fila)
  const cat = normalizar(v.categoria ?? '')
  const categoria = cat.startsWith('g') ? 'gafete' : cat.startsWith('u') ? 'uniforme' : null
  const tipo = texto(v.tipo)
  if (!categoria || !tipo) return null
  const unidad = texto(v.unidad)
  return {
    categoria,
    tipo,
    id: texto(buscar(v, (k) => k === 'id' || k.startsWith('idno'))) || null,
    nombre: texto(v.modelodescripcion ?? v.modelocolor ?? v.modelo ?? v.nombre),
    color: texto(v.color),
    genero: leerGenero(v.genero ?? v.sexo),
    area: texto(v.area),
    rol: texto(v.paraquerol ?? v.rol ?? v.roles ?? v.puesto).replace(/\s*,\s*/g, ', ').replace(/,\s*$/, ''),
    unidad: !unidad || normalizar(unidad).startsWith('toda') ? 'Todas' : unidad,
    talla: texto(v.talla) || null,
    costo: numeroDe(v.costoporpieza ?? v.costo),
    real: Math.round(numeroDe(v.real)),
    deseado: Math.round(numeroDe(v.deseado)),
    proveedor: texto(v.proveedor),
  }
}

// ---------- Gafetes por colaborador ----------

const NO = ['no', 'n', '0', 'false', 'nuevo', 'nuevoingreso', 'ingreso', 'ninguna', 'na', 'primero', 'primervez']
const SI = ['si', 's', 'x', '1', 'true', 'yes', 'reposicion', 'ok']

export function leerReposicion(valor) {
  const s = normalizar(valor).replace(/[^a-z0-9]/g, '')
  if (!s || NO.includes(s)) return { reposicion: false, texto: '' }
  return { reposicion: true, texto: SI.includes(s) ? '' : texto(valor) }
}

export function razonDesdeTexto(t) {
  const s = normalizar(t)
  if (!s) return { razon: null, detalle: null }
  if (/extrav|perd|robo|olvid/.test(s)) return { razon: 'extravio', detalle: null }
  if (/desgast|viej|deslav|borr/.test(s)) return { razon: 'desgaste', detalle: null }
  if (/mal estado|roto|rompi|quebr|dan|estrell/.test(s)) return { razon: 'mal_estado', detalle: null }
  if (/talla/.test(s)) return { razon: 'cambio_talla', detalle: null }
  return { razon: 'otra', detalle: texto(t).slice(0, 300) }
}

const ALIAS_SUCURSAL = { nu: 'naciones unidas', vr: 'valle real', gmt: 'gourmeteria', gtm: 'gourmeteria', naciones: 'naciones unidas', avila: 'avila camacho' }

// Busca la sucursal del catálogo que corresponde a lo escrito ("Valle Real", "VR", "Vivo 47 · Valle Real").
export function emparejarSucursal(valor, catalogo) {
  const original = texto(valor)
  let t = normalizar(original).replace(/\s*[·|/-]\s*/g, ' · ')
  if (!t) return { sucursal: '', reconocida: false }
  t = ALIAS_SUCURSAL[t] ?? t
  const n = (s) => normalizar(s)
  const parte = (s) => n(s.includes(' · ') ? s.split(' · ').slice(1).join(' · ') : s)
  const unica = (lista) => (lista.length === 1 ? lista[0] : null)
  const sinSeparador = (s) => s.replace(/ · /g, ' ')
  const unidad = (s) => n(s.split(' · ')[0])
  const hallada =
    catalogo.find((s) => n(s) === t) ??
    catalogo.find((s) => sinSeparador(n(s)) === sinSeparador(t)) ??
    unica(catalogo.filter((s) => s.includes(' · ') && t.includes(unidad(s)) && t.includes(parte(s)))) ??
    unica(catalogo.filter((s) => parte(s) === t)) ??
    unica(catalogo.filter((s) => n(s).includes(t))) ??
    unica(catalogo.filter((s) => t.includes(parte(s))))
  return hallada ? { sucursal: hallada, reconocida: true } : { sucursal: original, reconocida: false }
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Fecha de Excel (número de serie), texto dd/mm/aaaa o aaaa-mm-dd → 'aaaa-mm-dd' (o null).
export function leerFecha(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 864e5))
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  const s = texto(v)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12) return iso(y, Number(m[2]), Number(m[1]))
  }
  return null
}

// Columna con la cantidad de gafetes del colaborador ("Reposición", "Cantidad", "Gafetes"…).
const columnaCantidad = (k) =>
  k.startsWith('reposicion') || k === 'esreposicion' || k.startsWith('cantidad') || k === 'gafetes' || k.startsWith('numerodegafetes') || k.startsWith('nodegafetes') || k.startsWith('totaldegafetes')

// Número → cantidad. Si viene "Sí"/"No" (formato anterior) se respeta como reposición sí/no.
export function leerCantidad(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return { cantidad: Math.max(0, Math.round(valor)), siNo: null, texto: '' }
  const s = texto(valor)
  if (/^\d+([.,]0+)?$/.test(s)) return { cantidad: Math.max(0, Math.round(Number(s.replace(',', '.')))), siNo: null, texto: '' }
  const r = leerReposicion(s)
  return { cantidad: null, siNo: r.reposicion, texto: r.texto }
}

export function leerGafete(fila, { catalogo = [], fechaPorDefecto } = {}) {
  if (esEjemplo(fila)) return null
  const v = normalizarFila(fila)
  const nombre = texto(buscar(v, columnaNombre)).replace(/\s+/g, ' ')
  if (nombre.length < 2) return null
  const { sucursal, reconocida } = emparejarSucursal(v.sucursal, catalogo)
  const c = leerCantidad(buscar(v, columnaCantidad))
  const { razon, detalle } = razonDesdeTexto(texto(buscar(v, (k) => k.startsWith('razon') || k.startsWith('motivo'))) || c.texto)
  const fecha = leerFecha(buscar(v, (k) => k.startsWith('fecha')))
  return {
    nombre,
    sucursal,
    sucursalReconocida: reconocida,
    cantidad: c.cantidad,
    siNo: c.siNo,
    razon,
    detalle,
    fecha: fecha ?? fechaPorDefecto,
    sinFecha: !fecha,
  }
}

// Cuántos gafetes debe tener el colaborador según el renglón.
// modo 'total': la cantidad incluye el primer gafete · modo 'reposiciones': la cantidad es solo de reposiciones.
export function objetivoGafetes(g, modo = 'total') {
  if (g.cantidad == null) return { nuevos: 1, reposiciones: g.siNo ? 1 : 0 }
  if (modo === 'reposiciones') return { nuevos: 1, reposiciones: g.cantidad }
  return { nuevos: g.cantidad > 0 ? 1 : 0, reposiciones: Math.max(0, g.cantidad - 1) }
}

// Compara el archivo con lo ya registrado (Map llave → { nuevos, reposiciones }) y devuelve solo lo que falta,
// así volver a subir el mismo archivo (o uno con cantidades nuevas) no duplica gafetes.
export function planearGafetes(filas, { modo = 'total', existentes = new Map() } = {}) {
  const ya = new Map([...existentes].map(([k, v]) => [k, { ...v }]))
  const plan = []
  let alDia = 0
  let conMas = 0
  for (const g of filas) {
    const k = llaveColaborador(g.nombre, g.sucursal)
    const tiene = ya.get(k) ?? { nuevos: 0, reposiciones: 0 }
    const meta = objetivoGafetes(g, modo)
    const agregarNuevos = Math.max(0, meta.nuevos - tiene.nuevos)
    const agregarReposiciones = Math.max(0, meta.reposiciones - tiene.reposiciones)
    if (!agregarNuevos && !agregarReposiciones) {
      alDia++
      if (tiene.nuevos + tiene.reposiciones > meta.nuevos + meta.reposiciones) conMas++
      continue
    }
    plan.push({ ...g, total: meta.nuevos + meta.reposiciones, previos: tiene.nuevos + tiene.reposiciones, agregarNuevos, agregarReposiciones })
    ya.set(k, { nuevos: Math.max(tiene.nuevos, meta.nuevos), reposiciones: Math.max(tiene.reposiciones, meta.reposiciones) })
  }
  return { plan, alDia, conMas }
}

// Un registro por gafete (lo que guarda registrarGafetes).
export function expandirPlan(plan) {
  const registros = []
  for (const p of plan) {
    const base = { nombre: p.nombre, sucursal: p.sucursal, fecha: p.fecha, articulo: p.articulo ?? null }
    for (let i = 0; i < p.agregarNuevos; i++) registros.push({ ...base, motivo: 'nuevo', razon: null, detalle: null })
    for (let i = 0; i < p.agregarReposiciones; i++) registros.push({ ...base, motivo: 'reposicion', razon: p.razon, detalle: p.detalle })
  }
  return registros
}

// ---------- Misma prenda en varias versiones ----------

// "Playera coach / Hombre" → "Playera coach"
const GENERO_AL_FINAL = /\s*[/(–-]\s*(hombre|mujer|unisex|caballero|dama)\s*\)?\s*$/i
export const baseModelo = (nombre) => texto(nombre).replace(GENERO_AL_FINAL, '').trim()

export function generoArticulo(a) {
  if (a.genero) return a.genero
  const m = normalizar(a.nombre).match(/\b(hombre|mujer|unisex|caballero|dama)\b/)
  return m ? leerGenero(m[1]) : ''
}

// Misma prenda: categoría + tipo + modelo (sin el género pegado al nombre) + género. No cuenta color ni unidad.
export const claveFamilia = (a) => [a.categoria, normalizar(a.tipo), normalizar(baseModelo(a.nombre)), generoArticulo(a)].join('|')

// ¿Puede el renglón nuevo ser el mismo artículo que el existente? (no choca en color ni en unidad)
export function compatible(existente, nuevo) {
  const color = !existente.color || !nuevo.color || normalizar(existente.color) === normalizar(nuevo.color)
  const u1 = existente.unidad || 'Todas'
  const u2 = nuevo.unidad || 'Todas'
  return color && (u1 === 'Todas' || u2 === 'Todas' || u1 === u2)
}

// Uniformes activos que existen en más de una versión (grupo).
export function buscarDuplicados(articulos) {
  const familias = new Map()
  for (const a of articulos) {
    if (a.categoria !== 'uniforme' || a.activo === false) continue
    const k = claveFamilia(a)
    const f = familias.get(k) ?? new Map()
    const g = a.grupo ?? claveGrupo(a)
    f.set(g, [...(f.get(g) ?? []), a])
    familias.set(k, f)
  }
  return [...familias]
    .filter(([, f]) => f.size > 1)
    .map(([clave, f]) => ({ clave, versiones: [...f].map(([grupo, lista]) => ({ grupo, articulos: lista })) }))
}

// Versión con más datos llenos (color, género, rol, área, unidad); en empate, la más reciente.
export function versionSugerida(duplicado) {
  const puntos = (v) => {
    const a = v.articulos[0]
    return [a.color, a.genero, a.rol, a.area, a.unidad && a.unidad !== 'Todas' ? a.unidad : null].filter(Boolean).length
  }
  const fecha = (v) => Math.max(0, ...v.articulos.map((a) => a.creadoEn?.toMillis?.() ?? 0))
  return [...duplicado.versiones].sort((x, y) => puntos(y) - puntos(x) || fecha(y) - fecha(x))[0].grupo
}

// Qué hacer para dejar una sola versión: las tallas repetidas se borran (sus entregas pasan a la elegida)
// y las tallas que la elegida no tiene se pasan a ella.
export function planearUnion(duplicado, grupoElegido, { sumarReal = false } = {}) {
  const elegida = duplicado.versiones.find((v) => v.grupo === grupoElegido) ?? duplicado.versiones[0]
  const base = elegida.articulos[0]
  const datos = {
    tipo: base.tipo,
    nombre: base.nombre ?? '',
    color: base.color ?? null,
    genero: base.genero ?? null,
    unidad: base.unidad ?? 'Todas',
    rol: base.rol ?? null,
    area: base.area ?? null,
    grupo: elegida.grupo,
  }
  const porTalla = new Map(elegida.articulos.map((a) => [String(a.talla ?? ''), a]))
  const plan = { nombre: nombreArticulo(datos), adoptar: [], borrar: [], sumar: [] }
  for (const v of duplicado.versiones) {
    if (v === elegida) continue
    for (const a of v.articulos) {
      const talla = String(a.talla ?? '')
      const destino = porTalla.get(talla)
      if (destino) {
        plan.borrar.push({ id: a.id, destino: destino.id, talla: a.talla ?? null })
        if (sumarReal && Number(a.real)) plan.sumar.push({ id: destino.id, cantidad: Number(a.real) })
      } else {
        plan.adoptar.push({ id: a.id, datos })
        porTalla.set(talla, a)
      }
    }
  }
  return plan
}

// Empareja renglones del Excel con artículos existentes: por ID, por clave exacta, por clave sin color/género
// y por "misma prenda" (familia) si no choca en color ni unidad. Un artículo no se empareja dos veces por
// parecido. Los renglones nuevos repetidos apuntan al primero (existente.nuevo = índice).
export function emparejarArticulos(filas, existentes) {
  const porId = new Map(existentes.map((a) => [a.id, a]))
  const clave = (a) => `${a.grupo ?? claveGrupo(a)}|${a.talla ?? ''}`
  const sinExtras = (a) => `${claveGrupo({ ...a, color: null, genero: null })}|${a.talla ?? ''}`
  const familia = (a) => `${claveFamilia(a)}|${a.talla ?? ''}`
  const porClave = new Map(existentes.map((a) => [clave(a), a]))
  const porBase = new Map(existentes.filter((a) => !a.color && !a.genero).map((a) => [sinExtras(a), a]))
  const porFamilia = new Map()
  for (const a of existentes) porFamilia.set(familia(a), [...(porFamilia.get(familia(a)) ?? []), a])
  const usados = new Set()
  return filas.map((f, i) => {
    const fila = { ...f, grupo: claveGrupo(f) }
    let existente = f.id ? porId.get(f.id) ?? null : null
    const porSuId = Boolean(existente)
    existente ??= porClave.get(clave(fila)) ?? null
    if (!existente) {
      const b = porBase.get(sinExtras(fila))
      if (b && !usados.has(b.id)) existente = b
    }
    if (!existente) existente = (porFamilia.get(familia(fila)) ?? []).find((x) => !usados.has(x.id) && compatible(x, fila)) ?? null
    if (existente?.id) usados.add(existente.id)
    if (!existente) porClave.set(clave(fila), { ...fila, id: null, nuevo: i })
    return { fila, existente, porSuId }
  })
}

export { claveGrupo, llaveColaborador }
