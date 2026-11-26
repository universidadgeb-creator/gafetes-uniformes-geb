// Estado compartido del panel (lo llenan las suscripciones de Firestore en app.js).
import { opcionesCompletas } from '../comun.js'

export const estado = {
  admin: null,
  articulos: [],
  pedidos: [],
  movimientos: [],
  opciones: opcionesCompletas(null),
  opcionesGuardadas: false,
  cargado: { articulos: false, pedidos: false, movimientos: false, opciones: false },
}

const oyentes = new Set()
export function alCambiar(fn) {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

let pendiente = false
export function avisar() {
  if (pendiente) return
  pendiente = true
  requestAnimationFrame(() => {
    pendiente = false
    for (const fn of oyentes) fn()
  })
}

export const articuloPorId = (id) => estado.articulos.find((a) => a.id === id)
export const todoCargado = () => Object.values(estado.cargado).every(Boolean)
