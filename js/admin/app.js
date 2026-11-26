// Panel de administración: acceso con clave, suscripciones en vivo y navegación por pestañas.
import { ABIERTOS, h, opcionesCompletas } from '../comun.js'
import {
  cerrarSesion,
  collection,
  db,
  deleteDoc,
  doc,
  EN_LOCAL,
  getDoc,
  mensajeError,
  onSnapshot,
  serverTimestamp,
  sesion,
  setDoc,
} from '../firebase.js'
import * as ajustes from './ajustes.js'
import { sincronizarGrupos } from './datos.js'
import { alCambiar, estado, todoCargado } from './estado.js'
import { activarTooltips } from './graficas.js'
import * as inventario from './inventario.js'
import { antiguedadHoras, estadoStock } from './metricas.js'
import * as movimientos from './movimientos.js'
import * as pedidos from './pedidos.js'
import * as presupuesto from './presupuesto.js'
import * as resumen from './resumen.js'
import { confirmar, toast } from './ui.js'

const VISTAS = {
  resumen: { titulo: 'Resumen', mod: resumen },
  pedidos: { titulo: 'Pedidos', mod: pedidos },
  inventario: { titulo: 'Inventario', mod: inventario },
  movimientos: { titulo: 'Entregas y movimientos', mod: movimientos },
  presupuesto: { titulo: 'Presupuesto', mod: presupuesto },
  ajustes: { titulo: 'Ajustes', mod: ajustes },
}

const app = document.getElementById('app')
let vistaActual = null
const desuscribir = []

function normalizarClave(texto) {
  const limpio = String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^GEB[A-Z0-9]{16}$/.test(limpio)) {
    const r = limpio.slice(3)
    return `GEB-${r.slice(0, 4)}-${r.slice(4, 8)}-${r.slice(8, 12)}-${r.slice(12, 16)}`
  }
  return String(texto ?? '').trim()
}

function mostrarAcceso(usuario) {
  app.innerHTML = `
    <div class="acceso">
      <form class="tarjeta" id="acceso" style="display:grid;gap:14px">
        <div>
          <h1>Panel de administración</h1>
          <p class="muted" style="margin-top:6px">Escribe tu nombre y la clave de administrador. Solo se pide una vez en este dispositivo.</p>
        </div>
        <label class="campo"><span>Tu nombre</span><input name="nombre" autocomplete="name" maxlength="80" required /></label>
        <label class="campo"><span>Clave de administrador</span>
          <input name="clave" type="password" autocomplete="current-password" autocapitalize="characters" spellcheck="false" required placeholder="GEB-XXXX-XXXX-XXXX-XXXX" /></label>
        <div id="error" class="aviso aviso-error oculto" role="alert"></div>
        <button class="btn btn-primario btn-bloque" type="submit">Entrar</button>
        <p class="tenue" style="text-align:center">¿Eres colaborador? <a href="./">Haz tu pedido aquí</a>.</p>
      </form>
    </div>`
  const form = document.getElementById('acceso')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const nombre = form.nombre.value.trim().replace(/\s+/g, ' ')
    const clave = normalizarClave(form.clave.value)
    const error = document.getElementById('error')
    if (nombre.length < 2 || !clave) {
      error.textContent = 'Escribe tu nombre y la clave.'
      error.classList.remove('oculto')
      return
    }
    const boton = form.querySelector('button')
    boton.disabled = true
    boton.textContent = 'Entrando…'
    try {
      await setDoc(doc(db, 'admins', usuario.uid), { nombre, clave, creadoEn: serverTimestamp() })
      arrancar(usuario, { nombre })
    } catch (err) {
      console.error(err)
      error.textContent = String(err?.code).includes('permission-denied') ? 'La clave no es correcta.' : mensajeError(err)
      error.classList.remove('oculto')
      boton.disabled = false
      boton.textContent = 'Entrar'
    }
  })
}

function suscribir(nombre, ref, alRecibir) {
  const off = onSnapshot(
    ref,
    (snap) => {
      alRecibir(snap)
      estado.cargado[nombre] = true
      if (nombre === 'articulos' || nombre === 'opciones') sincronizarGrupos().catch((e) => console.error(e))
      for (const fn of oyentesInternos) fn()
    },
    (err) => {
      console.error(nombre, err)
      if (String(err?.code).includes('permission-denied')) {
        app.innerHTML = `<div class="acceso"><div class="tarjeta"><h2>Sin acceso</h2><p class="muted" style="margin-top:6px">Este dispositivo ya no tiene acceso de administrador.</p><div style="margin-top:14px"><button class="btn btn-primario" onclick="location.reload()">Volver a entrar</button></div></div></div>`
      } else toast(mensajeError(err), true)
    },
  )
  desuscribir.push(off)
}

const oyentesInternos = []
let avisoPendiente = false
function programarAviso() {
  if (avisoPendiente) return
  avisoPendiente = true
  requestAnimationFrame(() => {
    avisoPendiente = false
    actualizarContadores()
    if (vistaActual && todoCargado()) {
      document.querySelector('[data-cargando]')?.remove()
      vistaActual.mod.actualizar()
    }
  })
}
oyentesInternos.push(programarAviso)
alCambiar(programarAviso)

function actualizarContadores() {
  const abiertos = estado.pedidos.filter((p) => ABIERTOS.includes(p.estado))
  const vencidos = abiertos.filter((p) => (antiguedadHoras(p) ?? 0) > estado.opciones.slaHoras).length
  const cPed = document.querySelector('[data-contador="pedidos"]')
  if (cPed) {
    cPed.textContent = abiertos.length
    cPed.classList.toggle('oculto', !abiertos.length)
    cPed.classList.toggle('neutro', !vencidos)
    cPed.title = vencidos ? `${vencidos} fuera de tiempo` : 'Pedidos abiertos'
  }
  const resurtir = estado.articulos.filter((a) => a.activo !== false && ['agotado', 'bajo'].includes(estadoStock(a))).length
  const cInv = document.querySelector('[data-contador="inventario"]')
  if (cInv) {
    cInv.textContent = resurtir
    cInv.classList.toggle('oculto', !resurtir)
    cInv.classList.add('ambar')
    cInv.title = 'Artículos por resurtir'
  }
}

function arrancar(usuario, datosAdmin) {
  estado.admin = { uid: usuario.uid, nombre: datosAdmin.nombre }
  document.getElementById('quien').textContent = datosAdmin.nombre
  const salir = document.getElementById('salir')
  salir.classList.remove('oculto')
  salir.onclick = async () => {
    const ok = await confirmar('¿Salir de este dispositivo?', {
      aceptar: 'Salir',
      detalle: 'Se quita el acceso de administrador en este navegador. Para volver a entrar necesitarás la clave.',
    })
    if (!ok) return
    try {
      desuscribir.forEach((f) => f())
      await deleteDoc(doc(db, 'admins', usuario.uid))
      await cerrarSesion()
    } finally {
      location.reload()
    }
  }

  app.innerHTML = `
    ${EN_LOCAL ? '<div class="aviso aviso-alerta" style="margin-bottom:14px"><div><b>Modo de prueba local.</b> Estás usando los emuladores; nada de esto se guarda en el sistema real.</div></div>' : ''}
    <nav class="pestanas" role="tablist">
      ${Object.entries(VISTAS)
        .map(
          ([k, v]) =>
            `<button class="pestana" role="tab" data-vista="${k}" aria-selected="false">${h(v.titulo)}${
              k === 'pedidos' || k === 'inventario' ? `<span class="contador oculto" data-contador="${k}"></span>` : ''
            }</button>`,
        )
        .join('')}
    </nav>
    <div id="vista"></div>`
  app.querySelector('.pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista]')
    if (b) location.hash = b.dataset.vista
  })

  suscribir('articulos', collection(db, 'articulos'), (s) => {
    estado.articulos = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
  })
  suscribir('pedidos', collection(db, 'pedidos'), (s) => {
    estado.pedidos = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
  })
  suscribir('movimientos', collection(db, 'movimientos'), (s) => {
    estado.movimientos = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
  })
  suscribir('opciones', doc(db, 'publico', 'opciones'), (s) => {
    estado.opciones = opcionesCompletas(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null)
    estado.opcionesGuardadas = s.exists()
  })

  activarTooltips()
  window.addEventListener('hashchange', () => mostrarVista(location.hash.slice(1)))
  mostrarVista(location.hash.slice(1))
}

function mostrarVista(nombre) {
  if (!VISTAS[nombre]) nombre = 'resumen'
  for (const b of document.querySelectorAll('.pestana')) b.setAttribute('aria-selected', String(b.dataset.vista === nombre))
  vistaActual = VISTAS[nombre]
  document.title = `${vistaActual.titulo} · Gafetes y Uniformes GEB`
  // Contenedor nuevo en cada cambio para no acumular manejadores de eventos de otras pestañas.
  const el = document.createElement('div')
  el.id = 'vista'
  document.getElementById('vista').replaceWith(el)
  vistaActual.mod.montar(el)
  if (todoCargado()) vistaActual.mod.actualizar()
  else el.insertAdjacentHTML('beforeend', '<div class="cargando" data-cargando>Cargando datos…</div>')
}

async function iniciar() {
  try {
    const usuario = await sesion()
    const s = await getDoc(doc(db, 'admins', usuario.uid))
    if (s.exists()) arrancar(usuario, s.data())
    else mostrarAcceso(usuario)
  } catch (e) {
    console.error(e)
    app.innerHTML = `<div class="aviso aviso-error"><div><b>No se pudo cargar el panel.</b> ${h(mensajeError(e))}</div></div>`
  }
}

iniciar()
