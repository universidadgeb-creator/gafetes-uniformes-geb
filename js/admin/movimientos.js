// Pestaña Entregas y movimientos: bitácora de entregas (nuevo ingreso / reposición), compras y ajustes.
import { dinero, fechaCorta, h, isoLocal, MOTIVOS, nombreSucursal, normalizar, numero, RAZONES, TIPOS_MOVIMIENTO } from '../comun.js'
import { anularMovimiento, registrarMovimientos } from './datos.js'
import { articuloPorId, estado } from './estado.js'
import { fechaMovimiento, resumenEntregas, totalMovimiento } from './metricas.js'
import {
  abrirDialogo,
  confirmar,
  descargarExcel,
  fechaArchivo,
  opcionesArticulos,
  opcionesLista,
  opcionesSucursales,
  toast,
} from './ui.js'

let raiz = null
const filtros = { tipo: 'salida', motivo: '', razon: '', sucursal: '', desde: '', hasta: '', texto: '' }

export function montar(el) {
  raiz = el
  el.innerHTML = `
    <div class="filtros" style="justify-content:space-between">
      <div><h1>Entregas y movimientos</h1><p class="muted">Cada entrega guarda a quién, por qué (nuevo ingreso o reposición), quién lo pidió y cuánto costó.</p></div>
      <div class="acciones">
        <button class="btn btn-primario" type="button" id="nueva">+ Registrar entrega</button>
        <button class="btn" type="button" id="excel">Descargar Excel</button>
      </div>
    </div>
    <div class="filtros">
      <div class="segmentado" id="f-tipo" role="group" aria-label="Tipo">
        ${[['salida', 'Entregas'], ['entrada', 'Compras'], ['ajuste', 'Ajustes'], ['', 'Todo']]
          .map(([k, v]) => `<button type="button" data-t="${k}" aria-pressed="${filtros.tipo === k}">${v}</button>`)
          .join('')}
      </div>
    </div>
    <div class="filtros">
      <label class="campo"><span>Motivo</span><select id="f-motivo"><option value="">Todos</option>${Object.entries(MOTIVOS)
        .map(([k, v]) => `<option value="${k}" ${filtros.motivo === k ? 'selected' : ''}>${h(v)}</option>`)
        .join('')}</select></label>
      <label class="campo"><span>Razón</span><select id="f-razon"><option value="">Todas</option>${Object.entries(RAZONES)
        .map(([k, v]) => `<option value="${k}" ${filtros.razon === k ? 'selected' : ''}>${h(v)}</option>`)
        .join('')}</select></label>
      <label class="campo"><span>Sucursal</span><select id="f-sucursal">${opcionesSucursales(filtros.sucursal, 'Todas')}</select></label>
      <label class="campo"><span>Desde</span><input type="date" id="f-desde" value="${h(filtros.desde)}" /></label>
      <label class="campo"><span>Hasta</span><input type="date" id="f-hasta" value="${h(filtros.hasta)}" /></label>
      <label class="campo"><span>Buscar</span><input type="search" id="f-texto" placeholder="Colaborador, artículo, folio…" value="${h(filtros.texto)}" /></label>
    </div>
    <div id="contenido"></div>`
  el.querySelector('#f-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]')
    if (!b) return
    filtros.tipo = b.dataset.t
    for (const x of el.querySelectorAll('#f-tipo button')) x.setAttribute('aria-pressed', String(x.dataset.t === filtros.tipo))
    actualizar()
  })
  for (const [id, campo, evento] of [
    ['f-motivo', 'motivo', 'change'],
    ['f-razon', 'razon', 'change'],
    ['f-sucursal', 'sucursal', 'change'],
    ['f-desde', 'desde', 'change'],
    ['f-hasta', 'hasta', 'change'],
    ['f-texto', 'texto', 'input'],
  ]) {
    el.querySelector(`#${id}`).addEventListener(evento, (e) => {
      filtros[campo] = e.target.value
      actualizar()
    })
  }
  el.querySelector('#nueva').addEventListener('click', () => dialogoEntrega())
  el.querySelector('#excel').addEventListener('click', exportar)
  el.querySelector('#contenido').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-anular]')
    if (!b) return
    const m = estado.movimientos.find((x) => x.id === b.dataset.anular)
    if (!m) return
    const ok = await confirmar('¿Anular este movimiento?', {
      aceptar: 'Anular',
      peligro: true,
      detalle: !Number(m.delta) ? `Se borra el registro de ${h(m.articuloNombre)}${m.colaborador ? ` de ${h(m.colaborador)}` : ''}. No cambia el inventario (no se había descontado).` : `Se borra el registro y se revierte el inventario (${m.delta > 0 ? 'se restan' : 'se suman'} ${Math.abs(m.delta)} pieza(s) de ${h(m.articuloNombre)}${m.talla ? ` talla ${h(m.talla)}` : ''}).${m.pedidoId ? ' El pedido seguirá marcado como entregado.' : ''}`,
    })
    if (!ok) return
    try {
      await anularMovimiento(m)
      toast('Movimiento anulado')
    } catch (err) {
      console.error(err)
      toast('No se pudo anular', true)
    }
  })
}

function filtrados() {
  const t = normalizar(filtros.texto)
  const desde = filtros.desde ? new Date(`${filtros.desde}T00:00:00`) : null
  const hasta = filtros.hasta ? new Date(`${filtros.hasta}T23:59:59`) : null
  return estado.movimientos.filter((m) => {
    if (filtros.tipo && m.tipo !== filtros.tipo) return false
    if (filtros.motivo && m.motivo !== filtros.motivo) return false
    if (filtros.razon && m.razon !== filtros.razon) return false
    if (filtros.sucursal && m.sucursal !== filtros.sucursal) return false
    const f = fechaMovimiento(m)
    if (desde && (!f || f < desde)) return false
    if (hasta && (!f || f > hasta)) return false
    if (t && !normalizar(`${m.colaborador ?? ''} ${m.articuloNombre} ${m.talla ?? ''} ${m.pedidoId ?? ''} ${m.solicitadoPor ?? ''} ${m.proveedor ?? ''} ${m.nota ?? ''} ${m.rol ?? ''}`).includes(t)) return false
    return true
  })
}

function textoMotivo(m) {
  if (m.tipo === 'entrada') return [m.proveedor, m.factura].filter(Boolean).join(' · ') || 'Compra'
  if (m.tipo === 'ajuste') return m.nota || 'Ajuste'
  if (m.motivo === 'nuevo') return '<span class="badge sin-punto tono-info">Nuevo ingreso</span>'
  return `<span class="badge sin-punto tono-oro">Reposición</span><br><span class="tenue">${h(RAZONES[m.razon] ?? '')}</span>`
}

export function actualizar() {
  if (!raiz) return
  const lista = filtrados().sort((a, b) => (fechaMovimiento(b) ?? 0) - (fechaMovimiento(a) ?? 0) || (b.creadoEn?.toMillis?.() ?? 0) - (a.creadoEn?.toMillis?.() ?? 0))
  const c = raiz.querySelector('#contenido')
  if (!lista.length) {
    c.innerHTML = `<div class="tarjeta vacio"><b>${estado.movimientos.length ? 'Nada con estos filtros' : 'Aún no hay movimientos'}</b>${
      estado.movimientos.length ? 'Prueba con otro tipo o rango de fechas.' : 'Registra entregas aquí o al cerrar un pedido. Las compras y conteos se registran desde Inventario.'
    }</div>`
    return
  }
  const r = resumenEntregas(lista)
  const piezas = lista.reduce((s, m) => s + (Number(m.cantidad) || 0), 0)
  const total = lista.reduce((s, m) => s + totalMovimiento(m), 0)
  const mostrar = lista.slice(0, 500)
  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="etq">Movimientos</div><div class="valor">${numero(lista.length)}</div><div class="sub">${numero(piezas)} piezas</div></div>
      <div class="kpi destacado"><div class="etq">Costo total</div><div class="valor">${dinero(total)}</div><div class="sub">Con los filtros actuales</div></div>
      ${
        filtros.tipo === 'salida' || !filtros.tipo
          ? `<div class="kpi"><div class="etq">Nuevo ingreso (rotación)</div><div class="valor">${dinero(r.porMotivo.nuevo.costo)}</div><div class="sub">${r.porMotivo.nuevo.personas} personas</div></div>
             <div class="kpi"><div class="etq">Reposición</div><div class="valor">${dinero(r.porMotivo.reposicion.costo)}</div><div class="sub">${r.porMotivo.reposicion.personas} personas</div></div>`
          : ''
      }
    </div>
    <div class="tabla-envoltura"><table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo</th><th class="num">Piezas</th><th class="num">Costo c/u</th><th class="num">Total</th><th>Motivo</th><th>Colaborador</th><th>Sucursal</th><th>Solicitó</th><th>Pedido</th><th></th></tr></thead>
      <tbody>${mostrar
        .map(
          (m) => `<tr>
          <td style="white-space:nowrap">${h(fechaCorta(fechaMovimiento(m)))}</td>
          <td>${h(TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo)}</td>
          <td>${h(m.articuloNombre)}${m.talla ? ` <span class="tenue">· ${h(m.talla)}</span>` : ''}</td>
          <td class="num ${m.tipo === 'salida' || m.delta < 0 ? 'negativo' : 'positivo'}">${m.tipo === 'salida' ? `-${numero(m.cantidad)}${Number(m.delta) ? '' : '<br><span class="tenue">sin descontar</span>'}` : `${m.delta > 0 ? '+' : ''}${numero(m.delta)}`}</td>
          <td class="num">${dinero(m.costoUnitario)}</td>
          <td class="num">${dinero(totalMovimiento(m))}</td>
          <td>${textoMotivo(m)}</td>
          <td>${m.colaborador ? `${h(m.colaborador)}<br><span class="tenue">${h(m.rol ?? '')}${m.area ? ` · ${h(m.area)}` : ''}</span>` : '<span class="tenue">—</span>'}</td>
          <td>${h(m.sucursal ? nombreSucursal(m.sucursal) : '—')}</td>
          <td>${h(m.solicitadoPor ?? (m.tipo === 'salida' ? m.colaborador ?? '' : m.por ?? ''))}</td>
          <td>${m.pedidoId ? `<a href="#pedidos">${h(m.pedidoId)}</a>` : '<span class="tenue">Directa</span>'}</td>
          <td><button class="btn btn-chico btn-texto btn-peligro" type="button" data-anular="${h(m.id)}" title="Anular y revertir inventario">Anular</button></td>
        </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    ${lista.length > mostrar.length ? `<p class="tenue" style="margin-top:8px">Se muestran los 500 más recientes de ${lista.length}. Descarga el Excel para verlos todos.</p>` : ''}`
}

// ---------- Entrega directa ----------

function filaLinea(articuloId = '') {
  return `<tr>
    <td><select data-art>${opcionesArticulos(articuloId)}</select></td>
    <td style="width:100px"><input data-cant type="number" min="1" step="1" value="1" /></td>
    <td class="num" data-info></td>
    <td style="width:40px"><button class="btn btn-chico btn-texto" type="button" data-quitar aria-label="Quitar">×</button></td>
  </tr>`
}

let ultimaEntrega = { fecha: isoLocal(), sucursal: '', motivo: 'nuevo', area: '' }

function dialogoEntrega() {
  if (!estado.articulos.some((a) => a.activo !== false)) {
    toast('Primero da de alta artículos en Inventario', true)
    return
  }
  const o = estado.opciones
  abrirDialogo({
    titulo: 'Registrar entrega',
    subtitulo: 'Para entregas sin pedido, por ejemplo el kit de nuevo ingreso en la inducción.',
    ancho: true,
    cuerpo: `
      <div class="rejilla">
        <label class="campo"><span>Colaborador <em>*</em></span><input id="colaborador" maxlength="120" /></label>
        <label class="campo"><span>Fecha</span><input id="fecha" type="date" value="${h(ultimaEntrega.fecha)}" /></label>
        <label class="campo"><span>Sucursal <em>*</em></span><select id="sucursal">${opcionesSucursales(ultimaEntrega.sucursal)}</select></label>
        <label class="campo"><span>Rol / puesto</span><input id="rol" list="dl-roles" maxlength="120" /><datalist id="dl-roles">${o.roles.map((r) => `<option value="${h(r)}"></option>`).join('')}</datalist></label>
        <label class="campo"><span>Área</span><select id="area">${opcionesLista(o.areas, ultimaEntrega.area)}</select></label>
        <label class="campo"><span>Solicitado por</span><input id="solicitado" maxlength="120" placeholder="Si no es el mismo colaborador" /></label>
      </div>
      <div>
        <p class="etiqueta" style="margin-bottom:8px">Motivo</p>
        <div class="chips-radio" id="motivo">${Object.entries(MOTIVOS)
          .map(([k, v]) => `<label><input type="radio" name="motivo" value="${k}" ${k === ultimaEntrega.motivo ? 'checked' : ''} />${h(v)}</label>`)
          .join('')}</div>
      </div>
      <div id="bloque-razon" class="${ultimaEntrega.motivo === 'reposicion' ? '' : 'oculto'}">
        <p class="etiqueta" style="margin-bottom:8px">Razón de la reposición</p>
        <div class="chips-radio">${Object.entries(RAZONES)
          .map(([k, v], i) => `<label><input type="radio" name="razon" value="${k}" ${i === 0 ? 'checked' : ''} />${h(v)}</label>`)
          .join('')}</div>
        <label class="campo" style="margin-top:10px"><span>Detalle</span><input id="detalle" maxlength="300" /></label>
      </div>
      <div class="tabla-envoltura"><table>
        <thead><tr><th>Artículo</th><th>Piezas</th><th class="num">Stock · costo</th><th></th></tr></thead>
        <tbody id="lineas">${filaLinea()}</tbody>
      </table></div>
      <div class="acciones" style="justify-content:space-between"><button class="btn btn-chico" type="button" id="agregar">+ Otro artículo</button><b id="total"></b></div>
      <label class="campo"><span>Nota</span><input id="nota" maxlength="200" /></label>`,
    pie: `<button class="btn" type="button" data-cerrar>Cancelar</button>
      <button class="btn" type="button" data-guardar="otra">Guardar y registrar otra</button>
      <button class="btn btn-primario" type="button" data-guardar="cerrar">Guardar entrega</button>`,
    alMontar: (dlg) => {
      const $ = (s) => dlg.querySelector(s)
      const tbody = $('#lineas')
      const recalcular = () => {
        let total = 0
        for (const tr of tbody.querySelectorAll('tr')) {
          const a = articuloPorId(tr.querySelector('[data-art]').value)
          const cant = Number(tr.querySelector('[data-cant]').value) || 0
          if (!a) {
            tr.querySelector('[data-info]').innerHTML = '<span class="tenue">—</span>'
            continue
          }
          total += cant * (Number(a.costo) || 0)
          tr.querySelector('[data-info]').innerHTML = `${(Number(a.real) || 0) < cant ? `<span class="negativo">${numero(a.real)} en stock</span>` : `${numero(a.real)} en stock`}<br><span class="tenue">${dinero(a.costo)} c/u</span>`
        }
        $('#total').textContent = `Costo: ${dinero(total)}`
        $('#bloque-razon').classList.toggle('oculto', dlg.querySelector('input[name="motivo"]:checked')?.value !== 'reposicion')
      }
      dlg.addEventListener('change', recalcular)
      dlg.addEventListener('input', recalcular)
      tbody.addEventListener('click', (e) => {
        if (e.target.closest('[data-quitar]')) {
          e.target.closest('tr').remove()
          recalcular()
        }
      })
      $('#agregar').onclick = () => {
        tbody.insertAdjacentHTML('beforeend', filaLinea())
        recalcular()
      }
      recalcular()
      const guardar = async (modo) => {
        const colaborador = $('#colaborador').value.trim()
        const sucursal = $('#sucursal').value
        const motivo = dlg.querySelector('input[name="motivo"]:checked')?.value ?? 'nuevo'
        const lineas = [...tbody.querySelectorAll('tr')]
          .map((tr) => ({ articuloId: tr.querySelector('[data-art]').value, cantidad: Number(tr.querySelector('[data-cant]').value) || 0 }))
          .filter((l) => l.articuloId && l.cantidad > 0)
        if (colaborador.length < 3 || !sucursal || !lineas.length) {
          toast('Falta el colaborador, la sucursal o algún artículo', true)
          return
        }
        for (const b of dlg.querySelectorAll('[data-guardar]')) b.disabled = true
        try {
          await registrarMovimientos('salida', lineas, {
            fecha: $('#fecha').value || isoLocal(),
            motivo,
            razon: motivo === 'reposicion' ? dlg.querySelector('input[name="razon"]:checked')?.value : null,
            detalleRazon: motivo === 'reposicion' ? $('#detalle').value : null,
            colaborador,
            sucursal,
            rol: $('#rol').value,
            area: $('#area').value,
            solicitadoPor: $('#solicitado').value.trim() || colaborador,
            nota: $('#nota').value,
          })
          ultimaEntrega = { fecha: $('#fecha').value || isoLocal(), sucursal, motivo, area: $('#area').value }
          toast(`Entrega registrada: ${colaborador}`)
          dlg.cerrar()
          if (modo === 'otra') dialogoEntrega()
        } catch (e) {
          console.error(e)
          toast('No se pudo guardar la entrega', true)
          for (const b of dlg.querySelectorAll('[data-guardar]')) b.disabled = false
        }
      }
      for (const b of dlg.querySelectorAll('[data-guardar]')) b.onclick = () => guardar(b.dataset.guardar)
      $('#colaborador').focus()
    },
  })
}

function exportar() {
  const filas = filtrados()
    .sort((a, b) => (fechaMovimiento(b) ?? 0) - (fechaMovimiento(a) ?? 0))
    .map((m) => ({
      Fecha: m.fecha ?? '',
      Tipo: TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo,
      Categoría: m.categoria === 'gafete' ? 'Gafete' : 'Uniforme',
      Artículo: m.articuloNombre,
      'Unidad del artículo': m.unidadArticulo ?? '',
      Talla: m.talla ?? '',
      Piezas: m.tipo === 'salida' ? -m.cantidad : m.delta,
      'Descontó inventario': m.tipo === 'salida' ? (Number(m.delta) ? 'Sí' : 'No') : '',
      'Costo por pieza': m.costoUnitario,
      Total: totalMovimiento(m),
      Motivo: m.tipo === 'salida' ? MOTIVOS[m.motivo] ?? '' : '',
      Razón: m.tipo === 'salida' && m.motivo === 'reposicion' ? RAZONES[m.razon] ?? '' : '',
      Detalle: m.detalleRazon ?? '',
      Colaborador: m.colaborador ?? '',
      Sucursal: m.sucursal ?? '',
      Rol: m.rol ?? '',
      Área: m.area ?? '',
      'Solicitado por': m.solicitadoPor ?? '',
      Pedido: m.pedidoId ?? '',
      Proveedor: m.proveedor ?? '',
      Factura: m.factura ?? '',
      Nota: m.nota ?? '',
      'Registró': m.por ?? '',
    }))
  descargarExcel(`Movimientos gafetes y uniformes ${fechaArchivo()}.xlsx`, [{ nombre: 'Movimientos', filas }])
}

