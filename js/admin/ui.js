// Piezas de interfaz del panel: avisos, diálogos, selects de artículos y Excel.
import { CATEGORIAS, ESTADOS, h, nombreArticulo, ordenTalla, unidades } from '../comun.js'
import { estado } from './estado.js'

let temporizadorToast
export function toast(texto, error = false) {
  const t = document.getElementById('toast')
  t.textContent = texto
  t.classList.toggle('error', error)
  t.classList.add('visible')
  clearTimeout(temporizadorToast)
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), 3400)
}

// Abre un <dialog>. `alMontar(dlg)` recibe el diálogo ya en el DOM. dlg.cerrar() lo quita.
export function abrirDialogo({ titulo, subtitulo = '', cuerpo = '', pie = '', ancho = false, alMontar }) {
  const dlg = document.createElement('dialog')
  if (ancho) dlg.classList.add('ancho')
  dlg.innerHTML = `
    <div class="dialogo-cab">
      <div><h2>${h(titulo)}</h2>${subtitulo ? `<p class="tenue" style="margin-top:4px">${subtitulo}</p>` : ''}</div>
      <button class="cerrar" type="button" data-cerrar aria-label="Cerrar">×</button>
    </div>
    <div class="dialogo-cuerpo">${cuerpo}</div>
    ${pie ? `<div class="dialogo-pie">${pie}</div>` : ''}`
  document.body.appendChild(dlg)
  dlg.cerrar = () => {
    if (dlg.open) dlg.close()
    dlg.remove()
  }
  dlg.addEventListener('close', () => dlg.remove())
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) dlg.cerrar()
  })
  dlg.showModal()
  alMontar?.(dlg)
  return dlg
}

export function confirmar(texto, { aceptar = 'Sí, continuar', peligro = false, detalle = '' } = {}) {
  return new Promise((resolve) => {
    let respuesta = false
    const dlg = abrirDialogo({
      titulo: texto,
      cuerpo: detalle ? `<p class="muted">${detalle}</p>` : '<p class="muted">Confirma para continuar.</p>',
      pie: `<button class="btn" type="button" data-cerrar>Cancelar</button>
            <button class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" type="button" data-si>${h(aceptar)}</button>`,
      alMontar: (d) => {
        d.querySelector('[data-si]').onclick = () => {
          respuesta = true
          d.cerrar()
        }
      },
    })
    dlg.addEventListener('close', () => resolve(respuesta))
  })
}

export function badgeEstado(est) {
  const e = ESTADOS[est] ?? ESTADOS.nuevo
  return `<span class="badge tono-${e.tono}">${h(e.texto)}</span>`
}

export const ESTADO_STOCK = {
  agotado: { texto: 'Agotado', tono: 'error' },
  bajo: { texto: 'Por resurtir', tono: 'alerta' },
  sobrante: { texto: 'Sobrante', tono: 'info' },
  ok: { texto: 'Completo', tono: 'ok' },
}

export function ordenarArticulos(lista) {
  return [...lista].sort(
    (a, b) =>
      (a.categoria ?? '').localeCompare(b.categoria ?? '') ||
      nombreArticulo(a).localeCompare(nombreArticulo(b), 'es') ||
      String(a.unidad ?? '').localeCompare(String(b.unidad ?? ''), 'es') ||
      ordenTalla(a.talla) - ordenTalla(b.talla),
  )
}

export function etiquetaArticulo(a) {
  return [nombreArticulo(a), a.unidad && a.unidad !== 'Todas' ? a.unidad : null, a.talla ? `talla ${a.talla}` : null]
    .filter(Boolean)
    .join(' · ')
}

// <option>s de artículos activos agrupados por categoría.
export function opcionesArticulos(seleccionado = '', { categoria = null, conVacio = true } = {}) {
  let html = conVacio ? '<option value="">Elige artículo…</option>' : ''
  for (const cat of Object.keys(CATEGORIAS)) {
    if (categoria && cat !== categoria) continue
    const lista = ordenarArticulos(estado.articulos.filter((a) => a.categoria === cat && a.activo !== false))
    if (!lista.length) continue
    html += `<optgroup label="${h(CATEGORIAS[cat])}">${lista
      .map((a) => `<option value="${h(a.id)}" ${a.id === seleccionado ? 'selected' : ''}>${h(etiquetaArticulo(a))} — ${Number(a.real) || 0} en stock</option>`)
      .join('')}</optgroup>`
  }
  return html
}

export function opcionesLista(lista, seleccionado = '', vacio = 'Elige…') {
  return `${vacio != null ? `<option value="">${h(vacio)}</option>` : ''}${lista
    .map((x) => `<option ${x === seleccionado ? 'selected' : ''}>${h(x)}</option>`)
    .join('')}`
}

export function opcionesSucursales(seleccionado = '', vacio = 'Elige sucursal…') {
  const suc = estado.opciones.sucursales
  let html = vacio != null ? `<option value="">${h(vacio)}</option>` : ''
  for (const u of unidades(suc)) {
    html += `<optgroup label="${h(u)}">${suc
      .filter((s) => s.startsWith(`${u} · `) || s === u)
      .map((s) => `<option value="${h(s)}" ${s === seleccionado ? 'selected' : ''}>${h(s)}</option>`)
      .join('')}</optgroup>`
  }
  if (seleccionado && !suc.includes(seleccionado)) html += `<option selected>${h(seleccionado)}</option>`
  return html
}

// ---------- Excel (SheetJS, se carga solo cuando hace falta) ----------

let promesaXLSX = null
export function cargarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX)
  promesaXLSX ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = () => {
      promesaXLSX = null
      reject(new Error('No se pudo cargar el lector de Excel.'))
    }
    document.head.appendChild(s)
  })
  return promesaXLSX
}

export async function descargarExcel(nombreArchivo, hojas) {
  try {
    const XLSX = await cargarXLSX()
    const libro = XLSX.utils.book_new()
    for (const hoja of hojas) {
      const ws = XLSX.utils.json_to_sheet(hoja.filas.length ? hoja.filas : [{ '(sin datos)': '' }])
      const columnas = Object.keys(hoja.filas[0] ?? { x: 1 })
      ws['!cols'] = columnas.map((c) => ({
        wch: Math.min(45, Math.max(c.length + 2, ...hoja.filas.slice(0, 200).map((f) => String(f[c] ?? '').length + 1))),
      }))
      XLSX.utils.book_append_sheet(libro, ws, hoja.nombre.slice(0, 31))
    }
    XLSX.writeFile(libro, nombreArchivo)
  } catch (e) {
    console.error(e)
    toast('No se pudo generar el Excel. Revisa tu conexión.', true)
  }
}

export const fechaArchivo = () => new Date().toISOString().slice(0, 10)
