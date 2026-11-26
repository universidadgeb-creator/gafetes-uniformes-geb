// Constantes y utilidades compartidas por el portal del colaborador y el panel de admin.
// Este archivo no importa Firebase, así que también lo usan las pruebas en Node.

export const ESTADOS = {
  nuevo: { texto: 'Recibido', paso: 1, tono: 'info' },
  en_proceso: { texto: 'En proceso', paso: 2, tono: 'alerta' },
  listo: { texto: 'Listo para entregar', paso: 3, tono: 'oro' },
  entregado: { texto: 'Entregado', paso: 4, tono: 'ok' },
  rechazado: { texto: 'No procede', paso: 4, tono: 'error' },
}
export const ABIERTOS = ['nuevo', 'en_proceso', 'listo']
export const CERRADOS = ['entregado', 'rechazado']

export const MOTIVOS = { nuevo: 'Nuevo ingreso', reposicion: 'Reposición' }
export const RAZONES = {
  extravio: 'Extravío',
  desgaste: 'Desgaste',
  mal_estado: 'Mal estado / dañado',
  cambio_talla: 'Cambio de talla',
  otra: 'Otra',
}
export const CATEGORIAS = { gafete: 'Gafete', uniforme: 'Uniforme' }
export const TIPOS_MOVIMIENTO = { entrada: 'Entrada (compra)', salida: 'Entrega', ajuste: 'Ajuste de conteo' }

export const SUCURSALES_PRIMERA_VERSION = [
    'Vivo 47 · Naciones Unidas',
    'Vivo 47 · Valle Real',
    'Vivo 47 · Gourmetería',
    'Vivo 47 · La Estancia',
    'EasyFit · Ávila Camacho',
    'EasyFit · Aleira',
    'EasyFit · Cañadas',
    'EasyFit · GEBienestar',
    'EasyFit · Iteso',
    'EasyFit · La Estancia',
    'Center · Center',
    'GEB · Oficina de Soporte',
    'Nuevos Negocios · Acton Academy',
    'Nuevos Negocios · Clínica',
    'Nuevos Negocios · Onara',
    'Nuevos Negocios · Onara VR',
    'Nuevos Negocios · Seven Nutrition',
    'Nuevos Negocios · White Mouse',
  ]

// Valores iniciales. Se editan en Ajustes y se guardan en publico/opciones.
export const OPCIONES_BASE = {
  sucursales: [
    'Vivo 47 · Naciones Unidas',
    'Vivo 47 · Valle Real',
    'Vivo 47 · Gourmetería',
    'Vivo 47 · La Estancia',
    'Vivo 47 · Oficina Central',
    'EasyFit · ITESO',
    'EasyFit · Ávila Camacho',
    'EasyFit · Cañadas',
    'EasyFit · Aleira',
    'EasyFit · Oficina Central',
    'GEB · Estructura y Soporte',
    'GEB · Capital Humano',
    'GEB · Marketing',
  ],
  areas: [
    'Acuática',
    'Administración',
    'Alimentos y Bebidas',
    'Capital Humano',
    'Clínica',
    'Comercial',
    'Deportes',
    'Dirección',
    'Estacionamiento',
    'Estructura y Soporte',
    'Finanzas',
    'Ludoteca',
    'Mantenimiento y Servicios',
    'Marketing',
    'Nuevos Negocios',
    'Sistemas',
    'Otra',
  ],
  roles: [
    'Técnico de Orden y Limpieza',
    'Capitán de Orden y Limpieza',
    'Coach Deportivo',
    'Coach de Estiramiento',
    'Coach de Mobility',
    'Coach Funcional',
    'Asesor Deportivo',
    'Líder Deportivo',
    'R.P.',
    'Concierge',
    'Recepción',
    'Cajero',
    'Ejecutivo de Membresía',
    'Coordinador de Turno',
    'Líder de Turno',
    'Líder de Servicio',
    'Técnico en Mantenimiento',
    'Nutriólogo',
    'Fisioterapia',
    'Maestra de Ludoteca',
    'Maestra Kids',
    'Barista',
    'Mesero',
    'Gerente de Sucursal',
    'Gerente de Club',
    'Coordinador Universidad',
    'Auxiliar Administrativo',
    'Auxiliar de Sistemas',
  ],
  tiposGafete: ['Gafete PVC impreso', 'Porta gafete', 'Cordón / lanyard', 'Yoyo retráctil', 'Gafete provisional'],
  tiposUniforme: [
    'Playera',
    'Playera polo',
    'Playera deportiva (dry fit)',
    'Camisa',
    'Blusa',
    'Sudadera',
    'Chamarra',
    'Chaleco',
    'Pants',
    'Pantalón',
    'Short',
    'Leggings',
    'Mandil',
    'Filipina',
    'Gorra',
    'Calzado',
  ],
  tallas: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Única'],
  slaHoras: 72,
  grupos: [],
}

export function opcionesCompletas(o) {
  const r = { ...OPCIONES_BASE, ...(o ?? {}) }
  for (const k of ['sucursales', 'areas', 'roles', 'tiposGafete', 'tiposUniforme', 'tallas', 'grupos']) {
    if (!Array.isArray(r[k])) r[k] = OPCIONES_BASE[k]
  }
  if (!(Number(r.slaHoras) > 0)) r.slaHoras = OPCIONES_BASE.slaHoras
  return r
}

export function h(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const fmtDinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
const fmtDineroCorto = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const fmtNumero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })

export const dinero = (n) => fmtDinero.format(Number(n) || 0)
export const dineroCorto = (n) => fmtDineroCorto.format(Math.round(Number(n) || 0))
export const numero = (n) => fmtNumero.format(Number(n) || 0)

export function dineroCompacto(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e6) return `$${fmtNumero.format(v / 1e6)} M`
  if (Math.abs(v) >= 1e4) return `$${fmtNumero.format(v / 1e3)} mil`
  return dineroCorto(v)
}

// Convierte Timestamp de Firestore, Date, número o 'AAAA-MM-DD' a Date (o null).
export function aFecha(v) {
  if (!v) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v === 'number') return new Date(v)
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000)
  return null
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function fechaCorta(v) {
  const d = aFecha(v)
  return d ? `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}` : '—'
}

export function fechaHora(v) {
  const d = aFecha(v)
  if (!d) return '—'
  const hh = d.getHours()
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ampm = hh < 12 ? 'a. m.' : 'p. m.'
  return `${fechaCorta(d)}, ${hh % 12 || 12}:${mm} ${ampm}`
}

export function nombreMes(clave, largo = false) {
  const [a, m] = clave.split('-').map(Number)
  return largo ? `${MESES_LARGOS[m - 1]} ${a}` : `${MESES[m - 1]} ${String(a).slice(2)}`
}

export function isoLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Horas → texto corto: "35 min", "5 h", "1 d 4 h", "12 d".
export function duracion(horas) {
  if (horas == null || !Number.isFinite(horas)) return '—'
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`
  if (horas < 24) return `${Math.round(horas)} h`
  const d = Math.floor(horas / 24)
  const r = Math.round(horas - d * 24)
  if (d >= 10 || r === 0) return `${Math.round(horas / 24)} d`
  return r === 24 ? `${d + 1} d` : `${d} d ${r} h`
}

const LETRAS_FOLIO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function nuevoFolio() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `GU-${Array.from(bytes, (b) => LETRAS_FOLIO[b % LETRAS_FOLIO.length]).join('')}`
}

export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function slug(s) {
  return normalizar(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

export function unidadDe(sucursal) {
  const s = String(sucursal ?? '')
  const i = s.indexOf(' · ')
  return i >= 0 ? s.slice(0, i) : s
}

export function nombreSucursal(sucursal) {
  const s = String(sucursal ?? '')
  const i = s.indexOf(' · ')
  if (i < 0) return s
  const u = s.slice(0, i)
  const n = s.slice(i + 3)
  return u === n ? u : s
}

export function unidades(sucursales) {
  return [...new Set((sucursales ?? []).map(unidadDe).filter(Boolean))]
}

const ORDEN_TALLAS = ['XXS', 'XS', 'CH', 'S', 'M', 'MED', 'G', 'L', 'XL', 'EG', 'XXL', '2XL', 'XXXL', '3XL', 'ÚNICA', 'UNICA']
export function ordenTalla(t) {
  const s = String(t ?? '').toUpperCase().trim()
  const i = ORDEN_TALLAS.indexOf(s)
  if (i >= 0) return i
  const n = parseFloat(s)
  return Number.isFinite(n) ? 100 + n : 500
}

export const GENEROS = ['Hombre', 'Mujer', 'Unisex']

// "Playera · Playera coach · Negro · Hombre" (sin repetir lo que ya dice el modelo).
export function nombreArticulo(a) {
  if (!a) return ''
  const partes = [a.tipo]
  if (a.nombre && a.nombre !== a.tipo) partes.push(a.nombre)
  for (const extra of [a.color, a.genero]) {
    if (extra && !normalizar(partes.join(' ')).includes(normalizar(extra))) partes.push(extra)
  }
  return partes.filter(Boolean).join(' · ')
}

// Identifica un artículo sin la talla. Color y género solo cuentan si existen (las claves viejas no cambian).
export function claveGrupo(a) {
  const extra = [a.color, a.genero].filter(Boolean).join('|')
  return slug(`${a.categoria}|${a.tipo}|${a.nombre ?? ''}|${a.unidad ?? 'Todas'}${extra ? `|${extra}` : ''}`)
}

// Mismo colaborador = mismo nombre (sin acentos ni mayúsculas) en la misma sucursal.
export const llaveColaborador = (nombre, sucursal) => `${normalizar(nombre).replace(/\s+/g, ' ')}|${normalizar(sucursal)}`

export function textoRazon(p) {
  if (p.tipoSolicitud !== 'reposicion' && p.motivo !== 'reposicion') return ''
  const r = RAZONES[p.razon] ?? 'Sin razón'
  return p.detalleRazon ? `${r}: ${p.detalleRazon}` : r
}
