// Pestaña Pedidos: tickets de los colaboradores, cambio de estado, entrega con descuento de inventario.
import {
  ABIERTOS,
  CERRADOS,
  dinero,
  duracion,
  ESTADOS,
  fechaCorta,
  fechaHora,
  h,
  isoLocal,
  MOTIVOS,
  nombreSucursal,
  normalizar,
  RAZONES,
  textoRazon,
} from '../comun.js'
import { cambiarEstadoPedido, eliminarPedido, entregarPedido, guardarMensajePedido } from './datos.js'
import { articuloPorId, estado } from './estado.js'
import { antiguedadHoras, horasResolucion } from './metricas.js'
import { abrirDialogo, badgeEstado, confirmar, descargarExcel, etiquetaArticulo, fechaArchivo, opcionesArticulos, opcionesSucursales, toast } from './ui.js'

let raiz = null
const filtros = { estado: 'abiertos', texto: '', sucursal: '', tipo: '' }
const FILTROS_ESTADO = { abiertos: 'Abiertos', todos: 'Todos', ...Object.fromEntries(Object.entries(ESTADOS).map(([k, v]) => [k, v.texto])) }

export function montar(el) {
  raiz = el
  el.innerHTML = `
    <div class="filtros" style="justify-content:space-between">
      <div><h1>Pedidos</h1><p class="muted">Tickets de los colaboradores. El tiempo corre desde que llega el pedido hasta que se entrega o se cierra.</p></div>
      <div class="acciones">
        <button class="btn" type="button" id="copiar-link">Copiar link del formulario</button>
        <button class="btn" type="button" id="excel">Descargar Excel</button>
      </div>
    </div>
    <div class="filtros">
      <div class="segmentado" id="f-estado" role="group" aria-label="Estado"></div>
    </div>
    <div class="filtros">
      <label class="campo"><span class="sr">Buscar</span><input type="search" id="f-texto" placeholder="Buscar nombre, folio, rol…" value="${h(filtros.texto)}" /></label>
      <label class="campo"><span class="sr">Sucursal</span><select id="f-sucursal">${opcionesSucursales(filtros.sucursal, 'Todas las sucursales')}</select></label>
      <label class="campo"><span class="sr">Tipo</span><select id="f-tipo">
        <option value="">Nuevo ingreso y reposición</option>
        <option value="nuevo" ${filtros.tipo === 'nuevo' ? 'selected' : ''}>Solo nuevo ingreso</option>
        <option value="reposicion" ${filtros.tipo === 'reposicion' ? 'selected' : ''}>Solo reposición</option>
      </select></label>
    </div>
    <div id="contenido"></div>`
  el.querySelector('#f-estado').addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]')
    if (!b) return
    filtros.estado = b.dataset.e
    actualizar()
  })
  el.querySelector('#f-texto').addEventListener('input', (e) => {
    filtros.texto = e.target.value
    actualizar()
  })
  el.querySelector('#f-sucursal').addEventListener('change', (e) => {
    filtros.sucursal = e.target.value
    actualizar()
  })
  el.querySelector('#f-tipo').addEventListener('change', (e) => {
    filtros.tipo = e.target.value
    actualizar()
  })
  el.querySelector('#copiar-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(new URL('./', location.href).href)
      toast('Link copiado. Pégalo en WhatsApp o correo.')
    } catch {
      toast('No se pudo copiar el link', true)
    }
  })
  el.querySelector('#excel').addEventListener('click', exportar)
  el.querySelector('#contenido').addEventListener('click', (e) => {
    const fila = e.target.closest('[data-pedido]')
    if (fila) abrirPedido(fila.dataset.pedido)
  })
}

function filtrados() {
  const t = normalizar(filtros.texto)
  return estado.pedidos.filter((p) => {
    if (filtros.estado === 'abiertos' && !ABIERTOS.includes(p.estado)) return false
    if (!['abiertos', 'todos'].includes(filtros.estado) && p.estado !== filtros.estado) return false
    if (filtros.sucursal && p.sucursal !== filtros.sucursal) return false
    if (filtros.tipo && p.tipoSolicitud !== filtros.tipo) return false
    if (t && !normalizar(`${p.folio} ${p.nombre} ${p.solicitadoPor ?? ''} ${p.rol} ${p.area} ${p.sucursal}`).includes(t)) return false
    return true
  })
}

const resumenArticulos = (p) =>
  (p.articulos ?? []).map((a) => `${a.descripcion ?? a.tipo}${a.talla ? ` (${a.talla})` : ''} ×${a.cantidad}`).join(', ')

function celdaTiempo(p) {
  const sla = estado.opciones.slaHoras
  if (CERRADOS.includes(p.estado)) return `<span class="tenue">Resuelto en</span><br><b>${h(duracion(horasResolucion(p)))}</b>`
  const edad = antiguedadHoras(p) ?? 0
  const tono = edad > sla ? 'error' : edad > sla * 0.66 ? 'alerta' : 'neutro'
  return `<span class="badge sin-punto tono-${tono}" title="Objetivo: ${h(duracion(sla))}">${h(duracion(edad))}</span>`
}

export function actualizar() {
  if (!raiz) return
  const conteo = (k) =>
    k === 'abiertos' ? estado.pedidos.filter((p) => ABIERTOS.includes(p.estado)).length : k === 'todos' ? estado.pedidos.length : estado.pedidos.filter((p) => p.estado === k).length
  raiz.querySelector('#f-estado').innerHTML = Object.entries(FILTROS_ESTADO)
    .map(([k, v]) => `<button type="button" data-e="${k}" aria-pressed="${filtros.estado === k}">${h(v)} <span class="tenue">${conteo(k)}</span></button>`)
    .join('')
  const lista = filtrados()
  const fecha = (p) => p.creadoEn?.toMillis?.() ?? 0
  lista.sort((a, b) => (filtros.estado === 'abiertos' ? fecha(a) - fecha(b) : fecha(b) - fecha(a)))
  const c = raiz.querySelector('#contenido')
  if (!lista.length) {
    c.innerHTML = `<div class="tarjeta vacio"><b>${estado.pedidos.length ? 'Nada con estos filtros' : 'Aún no hay pedidos'}</b>${
      estado.pedidos.length ? 'Prueba con otro estado o búsqueda.' : 'Cuando un colaborador haga su pedido aparecerá aquí al instante.'
    }</div>`
    return
  }
  c.innerHTML = `
    <div class="tabla-envoltura"><table>
      <thead><tr><th>Folio</th><th>Colaborador</th><th>Sucursal</th><th>Tipo</th><th>Artículos</th><th>Estado</th><th>Tiempo</th></tr></thead>
      <tbody>${lista
        .map(
          (p) => `<tr class="clic" data-pedido="${h(p.id)}">
            <td style="white-space:nowrap"><b>${h(p.folio)}</b><br><span class="tenue">${h(fechaCorta(p.creadoEn ?? p.fecha))}</span></td>
            <td><b>${h(p.nombre)}</b><br><span class="tenue">${h(p.rol)} · ${h(p.area)}</span></td>
            <td>${h(nombreSucursal(p.sucursal))}</td>
            <td>${
              p.tipoSolicitud === 'nuevo'
                ? '<span class="badge sin-punto tono-info">Nuevo ingreso</span>'
                : `<span class="badge sin-punto tono-oro">Reposición</span><br><span class="tenue">${h(RAZONES[p.razon] ?? '')}</span>`
            }</td>
            <td style="max-width:280px">${h(resumenArticulos(p))}</td>
            <td>${badgeEstado(p.estado)}</td>
            <td>${celdaTiempo(p)}</td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <p class="tenue" style="margin-top:8px">${lista.length} pedido(s). Toca uno para atenderlo.</p>`
}

// ---------- Detalle ----------

function abrirPedido(id) {
  const p = estado.pedidos.find((x) => x.id === id)
  if (!p) return
  const sla = estado.opciones.slaHoras
  const creado = p.creadoEn
  const horasAtencion = p.atendidoEn && creado ? (p.atendidoEn.toMillis() - creado.toMillis()) / 36e5 : null
  const abierto = ABIERTOS.includes(p.estado)
  const historial = [...(p.historial ?? [])].sort((a, b) => (a.en?.toMillis?.() ?? 0) - (b.en?.toMillis?.() ?? 0))
  const acciones = []
  if (p.estado === 'nuevo') acciones.push('<button class="btn" type="button" data-accion="en_proceso">Tomar pedido</button>')
  if (['nuevo', 'en_proceso'].includes(p.estado)) acciones.push('<button class="btn" type="button" data-accion="listo">Listo para entregar</button>')
  if (abierto) {
    acciones.push('<button class="btn btn-peligro" type="button" data-accion="rechazar">No procede</button>')
    acciones.push('<button class="btn btn-primario" type="button" data-accion="entregar">Entregar…</button>')
  } else acciones.push('<button class="btn" type="button" data-accion="reabrir">Reabrir</button>')

  abrirDialogo({
    titulo: `Pedido ${p.folio}`,
    subtitulo: `${badgeEstado(p.estado)} &nbsp;Recibido ${h(fechaHora(creado))}`,
    ancho: true,
    cuerpo: `
      <dl class="ficha">
        <div><dt>Colaborador</dt><dd>${h(p.nombre)}</dd></div>
        <div><dt>Solicitado por</dt><dd>${h(p.solicitadoPor || 'El mismo colaborador')}</dd></div>
        <div><dt>Rol / puesto</dt><dd>${h(p.rol)}</dd></div>
        <div><dt>Área</dt><dd>${h(p.area)}</dd></div>
        <div><dt>Sucursal</dt><dd>${h(p.sucursal)}</dd></div>
        <div><dt>Fecha del pedido</dt><dd>${h(fechaCorta(p.fecha))}</dd></div>
        <div><dt>Tipo</dt><dd>${h(MOTIVOS[p.tipoSolicitud] ?? '')}</dd></div>
        ${p.tipoSolicitud === 'reposicion' ? `<div><dt>Razón</dt><dd>${h(textoRazon(p))}</dd></div>` : ''}
        <div><dt>Primera atención</dt><dd>${p.atendidoEn ? `${h(duracion(horasAtencion))} <span class="tenue">(${h(fechaHora(p.atendidoEn))})</span>` : '<span class="tenue">Pendiente</span>'}</dd></div>
        <div><dt>${abierto ? 'Tiempo abierto' : 'Tiempo de resolución'}</dt><dd>${h(duracion(abierto ? antiguedadHoras(p) : horasResolucion(p)))} <span class="tenue">· objetivo ${h(duracion(sla))}</span></dd></div>
      </dl>
      <div>
        <p class="etiqueta">Artículos solicitados</p>
        <ul style="margin:6px 0 0;padding-left:18px">${(p.articulos ?? [])
          .map((a) => `<li>${h(a.descripcion ?? a.tipo)}${a.talla ? ` · talla <b>${h(a.talla)}</b>` : ''} × ${h(a.cantidad)}</li>`)
          .join('')}</ul>
      </div>
      ${p.comentarios ? `<div class="aviso aviso-info"><div><b>Comentarios del colaborador</b>${h(p.comentarios)}</div></div>` : ''}
      <label class="campo"><span>Mensaje para el colaborador <small>(lo ve al consultar su folio)</small></span>
        <textarea id="mensaje" rows="2" maxlength="500" placeholder="Ej. Pasa a recogerlo con Capital Humano el jueves.">${h(p.mensaje ?? '')}</textarea></label>
      <div class="acciones"><button class="btn btn-chico" type="button" data-accion="mensaje">Guardar mensaje</button>
        <button class="btn btn-chico btn-texto" type="button" data-accion="copiar">Copiar link de seguimiento</button></div>
      ${
        historial.length
          ? `<div><p class="etiqueta" style="margin-bottom:8px">Historial</p><ul class="linea-tiempo">${historial
              .map((x) => `<li><span><b>${h(ESTADOS[x.estado]?.texto ?? x.estado)}</b> · ${h(fechaHora(x.en))}${x.por ? ` · ${h(x.por)}` : ''}${x.nota ? `<br><span class="tenue">${h(x.nota)}</span>` : ''}</span></li>`)
              .join('')}</ul></div>`
          : ''
      }`,
    pie: `<button class="btn btn-texto btn-peligro" type="button" data-accion="eliminar" style="margin-right:auto">Eliminar</button>${acciones.join('')}`,
    alMontar: (dlg) => {
      dlg.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-accion]')
        if (!b) return
        const mensaje = dlg.querySelector('#mensaje').value.trim()
        const a = b.dataset.accion
        try {
          if (a === 'copiar') {
            await navigator.clipboard.writeText(`${new URL('./', location.href).href}?folio=${p.folio}`)
            toast('Link de seguimiento copiado')
            return
          }
          if (a === 'mensaje') {
            await guardarMensajePedido(p, mensaje)
            toast('Mensaje guardado')
            return
          }
          if (a === 'entregar') {
            dlg.cerrar()
            abrirEntrega(p, mensaje)
            return
          }
          if (a === 'rechazar') {
            if (!mensaje) {
              toast('Escribe en el mensaje por qué no procede', true)
              dlg.querySelector('#mensaje').focus()
              return
            }
            if (!(await confirmar('¿Marcar como "No procede"?', { aceptar: 'Sí, cerrar pedido', peligro: true, detalle: 'El pedido se cierra y cuenta en el tiempo de resolución.' }))) return
            await cambiarEstadoPedido(p, 'rechazado', { mensaje, nota: mensaje })
            toast('Pedido cerrado como "No procede"')
            dlg.cerrar()
            return
          }
          if (a === 'eliminar') {
            if (!(await confirmar(`¿Eliminar el pedido ${p.folio}?`, { aceptar: 'Eliminar', peligro: true, detalle: 'Úsalo solo para pedidos duplicados o de prueba. No se puede deshacer y no afecta el inventario.' }))) return
            await eliminarPedido(p)
            toast('Pedido eliminado')
            dlg.cerrar()
            return
          }
          const nuevo = a === 'reabrir' ? 'en_proceso' : a
          await cambiarEstadoPedido(p, nuevo, { mensaje: mensaje || null, nota: a === 'reabrir' ? 'Reabierto' : '' })
          toast(`Pedido: ${ESTADOS[nuevo].texto}`)
          dlg.cerrar()
        } catch (err) {
          console.error(err)
          toast('No se pudo guardar. Intenta otra vez.', true)
        }
      })
    },
  })
}

// ---------- Entrega ----------

function sugerirArticulo(p, linea) {
  const activos = estado.articulos.filter((a) => a.activo !== false)
  const misma = (a) => String(a.talla ?? '') === String(linea.talla ?? '')
  const deUnidad = (a) => !a.unidad || a.unidad === 'Todas' || a.unidad === p.unidad
  return (
    activos.find((a) => a.grupo === linea.grupo && misma(a)) ??
    activos.find((a) => a.categoria === linea.categoria && a.tipo === linea.tipo && misma(a) && deUnidad(a)) ??
    activos.find((a) => a.categoria === linea.categoria && a.tipo === linea.tipo && misma(a)) ??
    activos.find((a) => a.grupo === linea.grupo) ??
    null
  )
}

function filaEntrega(articuloId, cantidad, solicitado = '') {
  return `<tr>
    <td>${solicitado ? `<span class="tenue">Pidió: ${h(solicitado)}</span><br>` : ''}<select data-art>${opcionesArticulos(articuloId)}</select></td>
    <td style="width:90px"><input data-cant type="number" min="1" step="1" value="${h(cantidad)}" /></td>
    <td class="num" data-info></td>
    <td style="width:40px"><button class="btn btn-chico btn-texto" type="button" data-quitar aria-label="Quitar">×</button></td>
  </tr>`
}

function abrirEntrega(p, mensajePrevio = '') {
  const sinArticulos = !estado.articulos.some((a) => a.activo !== false)
  const filas = (p.articulos ?? []).map((l) => {
    const sug = sugerirArticulo(p, l)
    return filaEntrega(sug?.id ?? '', l.cantidad, `${l.descripcion ?? l.tipo}${l.talla ? ` · ${l.talla}` : ''} ×${l.cantidad}`)
  })
  abrirDialogo({
    titulo: `Entregar pedido ${p.folio}`,
    subtitulo: `${h(p.nombre)} · ${h(nombreSucursal(p.sucursal))}`,
    ancho: true,
    cuerpo: `
      ${sinArticulos ? '<div class="aviso aviso-alerta"><div><b>Aún no hay artículos en el inventario.</b> Puedes cerrar el pedido sin descontar, o primero darlos de alta en Inventario.</div></div>' : ''}
      <div class="rejilla">
        <label class="campo"><span>Fecha de entrega</span><input id="fecha" type="date" value="${isoLocal()}" max="${isoLocal()}" /></label>
        <label class="campo"><span>Motivo</span><select id="motivo">${Object.entries(MOTIVOS)
          .map(([k, v]) => `<option value="${k}" ${k === p.tipoSolicitud ? 'selected' : ''}>${h(v)}</option>`)
          .join('')}</select></label>
        <label class="campo" id="campo-razon"><span>Razón de reposición</span><select id="razon">${Object.entries(RAZONES)
          .map(([k, v]) => `<option value="${k}" ${k === p.razon ? 'selected' : ''}>${h(v)}</option>`)
          .join('')}</select></label>
      </div>
      <div class="tabla-envoltura"><table>
        <thead><tr><th>Artículo que se entrega</th><th>Cantidad</th><th class="num">Stock · costo</th><th></th></tr></thead>
        <tbody id="lineas">${filas.join('')}</tbody>
      </table></div>
      <div class="acciones" style="justify-content:space-between">
        <button class="btn btn-chico" type="button" id="agregar">+ Agregar otro artículo</button>
        <b id="total"></b>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="descontar" ${sinArticulos ? '' : 'checked'} /> Descontar del inventario y registrar el costo</label>
      <label class="campo"><span>Mensaje para el colaborador (opcional)</span><textarea id="mensaje" rows="2" maxlength="500">${h(mensajePrevio)}</textarea></label>`,
    pie: '<button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn-primario" type="button" id="confirmar">Confirmar entrega</button>',
    alMontar: (dlg) => {
      const tbody = dlg.querySelector('#lineas')
      const recalcular = () => {
        let total = 0
        for (const tr of tbody.querySelectorAll('tr')) {
          const a = articuloPorId(tr.querySelector('[data-art]').value)
          const cant = Number(tr.querySelector('[data-cant]').value) || 0
          const info = tr.querySelector('[data-info]')
          if (!a) {
            info.innerHTML = '<span class="tenue">—</span>'
            continue
          }
          const real = Number(a.real) || 0
          total += cant * (Number(a.costo) || 0)
          info.innerHTML = `${real < cant ? `<span style="color:var(--error);font-weight:700">${real} en stock</span>` : `${real} en stock`}<br><span class="tenue">${dinero(a.costo)} c/u</span>`
        }
        dlg.querySelector('#total').textContent = `Costo de la entrega: ${dinero(total)}`
        dlg.querySelector('#campo-razon').classList.toggle('oculto', dlg.querySelector('#motivo').value !== 'reposicion')
      }
      dlg.addEventListener('input', recalcular)
      dlg.addEventListener('change', recalcular)
      dlg.querySelector('#agregar').onclick = () => {
        tbody.insertAdjacentHTML('beforeend', filaEntrega('', 1))
        recalcular()
      }
      tbody.addEventListener('click', (e) => {
        if (e.target.closest('[data-quitar]')) {
          e.target.closest('tr').remove()
          recalcular()
        }
      })
      recalcular()
      dlg.querySelector('#confirmar').onclick = async () => {
        const descontar = dlg.querySelector('#descontar').checked
        const lineas = [...tbody.querySelectorAll('tr')]
          .map((tr) => ({ articuloId: tr.querySelector('[data-art]').value, cantidad: Number(tr.querySelector('[data-cant]').value) || 0 }))
          .filter((l) => l.articuloId && l.cantidad > 0)
        if (descontar && !lineas.length) {
          toast('Elige al menos un artículo del inventario, o quita "Descontar del inventario"', true)
          return
        }
        const faltantes = lineas.filter((l) => (Number(articuloPorId(l.articuloId)?.real) || 0) < l.cantidad)
        if (descontar && faltantes.length) {
          const ok = await confirmar('Hay artículos sin stock suficiente', {
            aceptar: 'Entregar de todos modos',
            detalle: `${faltantes.map((l) => h(etiquetaArticulo(articuloPorId(l.articuloId)))).join(', ')} quedará(n) en negativo. Revisa tu conteo físico después.`,
          })
          if (!ok) return
        }
        const boton = dlg.querySelector('#confirmar')
        boton.disabled = true
        try {
          await entregarPedido(p, lineas, {
            fecha: dlg.querySelector('#fecha').value || isoLocal(),
            motivo: dlg.querySelector('#motivo').value,
            razon: dlg.querySelector('#razon').value,
            mensaje: dlg.querySelector('#mensaje').value.trim() || null,
            descontar,
          })
          toast(descontar ? 'Entregado y descontado del inventario' : 'Pedido cerrado como entregado')
          dlg.cerrar()
        } catch (err) {
          console.error(err)
          toast('No se pudo registrar la entrega. Intenta otra vez.', true)
          boton.disabled = false
        }
      }
    },
  })
}

// ---------- Excel ----------

function exportar() {
  const filas = filtrados().map((p) => ({
    Folio: p.folio,
    Estado: ESTADOS[p.estado]?.texto ?? p.estado,
    'Recibido': fechaHora(p.creadoEn),
    'Fecha del pedido': p.fecha,
    Colaborador: p.nombre,
    'Solicitado por': p.solicitadoPor || p.nombre,
    Unidad: p.unidad ?? '',
    Sucursal: p.sucursal,
    Rol: p.rol,
    Área: p.area,
    Tipo: MOTIVOS[p.tipoSolicitud] ?? '',
    Razón: p.tipoSolicitud === 'reposicion' ? textoRazon(p) : '',
    Artículos: resumenArticulos(p),
    Comentarios: p.comentarios ?? '',
    'Primera atención': fechaHora(p.atendidoEn),
    'Cerrado': fechaHora(p.resueltoEn),
    'Horas de resolución': CERRADOS.includes(p.estado) ? Math.round((horasResolucion(p) ?? 0) * 10) / 10 : '',
    'Horas abierto': ABIERTOS.includes(p.estado) ? Math.round((antiguedadHoras(p) ?? 0) * 10) / 10 : '',
    'Mensaje al colaborador': p.mensaje ?? '',
  }))
  descargarExcel(`Pedidos gafetes y uniformes ${fechaArchivo()}.xlsx`, [{ nombre: 'Pedidos', filas }])
}
