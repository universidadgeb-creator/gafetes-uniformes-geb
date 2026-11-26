// Pestaña Ajustes: link del formulario, tiempo objetivo, catálogos y accesos de administrador.
import { duracion, fechaHora, h, OPCIONES_BASE } from '../comun.js'
import { collection, db, getDocs } from '../firebase.js'
import { guardarOpciones, quitarAcceso } from './datos.js'
import { estado } from './estado.js'
import { confirmar, toast } from './ui.js'

let raiz = null
let editando = false

const CATALOGOS = [
  ['sucursales', 'Sucursales', 'Una por renglón, con el formato "Unidad · Sucursal" (ej. Vivo 47 · Valle Real). La unidad se usa para filtrar artículos.'],
  ['areas', 'Áreas', 'Una por renglón.'],
  ['roles', 'Roles / puestos sugeridos', 'Aparecen como sugerencia; el colaborador también puede escribir otro.'],
  ['tiposGafete', 'Tipos de gafete', 'Opciones al dar de alta un gafete.'],
  ['tiposUniforme', 'Tipos de uniforme', 'Opciones al dar de alta un uniforme.'],
  ['tallas', 'Tallas', 'Las que aparecen como casillas al dar de alta un artículo.'],
]

export function montar(el) {
  raiz = el
  editando = false
  const link = new URL('./', location.href).href
  el.innerHTML = `
    <div style="margin-bottom:16px"><h1>Ajustes</h1><p class="muted">Lo que ven los colaboradores en el formulario y quién administra.</p></div>
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h3>Link para colaboradores</h3><p>Compártelo por WhatsApp, correo o un QR en sucursal</p></div>
      <div class="acciones">
        <input readonly value="${h(link)}" style="flex:1 1 280px" id="link" />
        <button class="btn btn-primario" type="button" id="copiar">Copiar</button>
        <a class="btn" href="${h(link)}" target="_blank" rel="noopener">Abrir</a>
      </div>
    </div>
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h3>Tiempo objetivo de respuesta</h3><p>Pedidos abiertos más tiempo que esto salen en rojo</p></div>
      <div class="acciones">
        <input id="sla" type="number" min="1" step="1" style="max-width:120px" /> <span class="muted">horas</span>
        <span class="tenue" id="sla-texto"></span>
        <button class="btn" type="button" id="guardar-sla">Guardar</button>
      </div>
    </div>
    <form class="tarjeta" id="catalogos">
      <div class="tarjeta-titulo"><h3>Catálogos</h3><p>Cambios visibles al instante en el formulario</p></div>
      <div class="rejilla">${CATALOGOS.map(
        ([k, t, ayuda]) => `<label class="campo"><span>${h(t)}</span><textarea name="${k}" rows="8"></textarea><small>${h(ayuda)}</small></label>`,
      ).join('')}</div>
      <div class="acciones fin" style="margin-top:14px">
        <button class="btn btn-texto" type="button" id="restaurar">Restaurar valores iniciales</button>
        <button class="btn btn-primario" type="submit">Guardar catálogos</button>
      </div>
    </form>
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h3>Accesos de administrador</h3><p>Dispositivos que entraron con la clave</p></div>
      <div id="accesos"><button class="btn" type="button" id="ver-accesos">Ver accesos</button></div>
      <p class="tenue" style="margin-top:10px">Para cambiar la clave pídeselo a quien mantiene el sistema (comando <code>npm run nueva-clave</code>, ver README). Los accesos actuales siguen activos hasta que los quites aquí.</p>
    </div>`

  el.querySelector('#copiar').onclick = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copiado')
    } catch {
      el.querySelector('#link').select()
    }
  }
  const sla = el.querySelector('#sla')
  sla.addEventListener('input', () => {
    el.querySelector('#sla-texto').textContent = Number(sla.value) > 0 ? `= ${duracion(Number(sla.value))}` : ''
  })
  el.querySelector('#guardar-sla').onclick = async () => {
    const v = Math.round(Number(sla.value))
    if (!(v > 0)) {
      toast('Escribe un número de horas', true)
      return
    }
    await guardarOpciones({ slaHoras: v })
    toast('Tiempo objetivo guardado')
  }
  const form = el.querySelector('#catalogos')
  form.addEventListener('input', () => {
    editando = true
  })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const cambios = {}
    for (const [k] of CATALOGOS) {
      cambios[k] = [...new Set(form.elements[k].value.split('\n').map((s) => s.trim().replace(/\s*·\s*/g, ' · ')).filter(Boolean))]
      if (!cambios[k].length) {
        toast('Ningún catálogo puede quedar vacío', true)
        return
      }
    }
    try {
      await guardarOpciones(cambios)
      editando = false
      toast('Catálogos guardados')
    } catch (err) {
      console.error(err)
      toast('No se pudo guardar', true)
    }
  })
  el.querySelector('#restaurar').onclick = async () => {
    if (!(await confirmar('¿Restaurar los catálogos iniciales?', { aceptar: 'Restaurar', detalle: 'Se reemplazan sucursales, áreas, roles, tipos y tallas por los de fábrica. Tu inventario no cambia.' }))) return
    const base = {}
    for (const [k] of CATALOGOS) base[k] = OPCIONES_BASE[k]
    await guardarOpciones(base)
    editando = false
    llenar(true)
    toast('Catálogos restaurados')
  }
  el.querySelector('#accesos').addEventListener('click', async (e) => {
    if (e.target.closest('#ver-accesos')) cargarAccesos()
    const b = e.target.closest('[data-quitar]')
    if (!b) return
    const propio = b.dataset.quitar === estado.admin.uid
    if (!(await confirmar(propio ? '¿Quitar el acceso de este dispositivo?' : '¿Quitar este acceso?', { aceptar: 'Quitar acceso', peligro: true, detalle: 'Ese dispositivo tendrá que volver a escribir la clave.' }))) return
    await quitarAcceso(b.dataset.quitar)
    if (propio) location.reload()
    else cargarAccesos()
  })
}

async function cargarAccesos() {
  const caja = raiz.querySelector('#accesos')
  caja.innerHTML = '<div class="cargando">Cargando…</div>'
  try {
    const snap = await getDocs(collection(db, 'admins'))
    const lista = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => (b.creadoEn?.toMillis?.() ?? 0) - (a.creadoEn?.toMillis?.() ?? 0))
    caja.innerHTML = `<div class="tabla-envoltura"><table><thead><tr><th>Nombre</th><th>Desde</th><th></th></tr></thead><tbody>${lista
      .map(
        (a) => `<tr><td><b>${h(a.nombre)}</b>${a.uid === estado.admin.uid ? ' <span class="badge sin-punto tono-ok">Este dispositivo</span>' : ''}</td>
        <td>${h(fechaHora(a.creadoEn))}</td>
        <td class="derecha"><button class="btn btn-chico btn-peligro" type="button" data-quitar="${h(a.uid)}">Quitar acceso</button></td></tr>`,
      )
      .join('')}</tbody></table></div>`
  } catch (e) {
    console.error(e)
    caja.innerHTML = '<div class="aviso aviso-error"><div>No se pudieron cargar los accesos.</div></div>'
  }
}

function llenar(forzar = false) {
  const o = estado.opciones
  const sla = raiz.querySelector('#sla')
  if (document.activeElement !== sla) {
    sla.value = o.slaHoras
    raiz.querySelector('#sla-texto').textContent = `= ${duracion(o.slaHoras)}`
  }
  if (editando && !forzar) return
  const form = raiz.querySelector('#catalogos')
  for (const [k] of CATALOGOS) form.elements[k].value = (o[k] ?? []).join('\n')
}

export function actualizar() {
  if (raiz) llenar()
}
