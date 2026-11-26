// Pestaña Inventario: real vs. deseado, costo por pieza, costo del inventario y del faltante.
import { CATEGORIAS, claveGrupo, dinero, h, isoLocal, nombreArticulo, normalizar, numero, ordenTalla, unidades } from '../comun.js'
import {
  actualizarArticulo,
  actualizarVarios,
  crearArticulos,
  eliminarArticulo,
  importarArticulos,
  limpiarNumero,
  registrarMovimientos,
} from './datos.js'
import { articuloPorId, estado } from './estado.js'
import { estadoStock, resumenInventario } from './metricas.js'
import {
  abrirDialogo,
  cargarXLSX,
  confirmar,
  descargarExcel,
  ESTADO_STOCK,
  etiquetaArticulo,
  fechaArchivo,
  opcionesArticulos,
  ordenarArticulos,
  toast,
} from './ui.js'

let raiz = null
const filtros = { categoria: '', unidad: '', texto: '', resurtir: false, inactivos: false }

export function montar(el) {
  raiz = el
  el.innerHTML = `
    <div class="filtros" style="justify-content:space-between">
      <div><h1>Inventario</h1><p class="muted">Lo real contra lo deseado, con su costo. El "real" cambia solo con compras, entregas y conteos.</p></div>
      <div class="acciones">
        <button class="btn btn-primario" type="button" data-accion="nuevo">+ Nuevo artículo</button>
        <button class="btn" type="button" data-accion="compra">Registrar compra</button>
        <button class="btn" type="button" data-accion="conteo">Conteo físico</button>
        <button class="btn" type="button" data-accion="importar">Importar Excel</button>
        <button class="btn" type="button" data-accion="excel">Descargar Excel</button>
      </div>
    </div>
    <div class="filtros">
      <div class="segmentado" id="f-cat" role="group" aria-label="Categoría">
        ${[['', 'Todo'], ['gafete', 'Gafetes'], ['uniforme', 'Uniformes']]
          .map(([k, v]) => `<button type="button" data-c="${k}" aria-pressed="${filtros.categoria === k}">${v}</button>`)
          .join('')}
      </div>
      <label class="campo"><span class="sr">Unidad</span><select id="f-unidad"></select></label>
      <label class="campo"><span class="sr">Buscar</span><input type="search" id="f-texto" placeholder="Buscar tipo, modelo, talla…" value="${h(filtros.texto)}" /></label>
      <label style="display:flex;gap:6px;align-items:center;font-weight:600;font-size:.9rem"><input type="checkbox" id="f-resurtir" ${filtros.resurtir ? 'checked' : ''} /> Solo por resurtir</label>
      <label style="display:flex;gap:6px;align-items:center;font-weight:600;font-size:.9rem"><input type="checkbox" id="f-inactivos" ${filtros.inactivos ? 'checked' : ''} /> Ver inactivos</label>
    </div>
    <div id="contenido"></div>`
  el.querySelector('#f-cat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]')
    if (!b) return
    filtros.categoria = b.dataset.c
    for (const x of el.querySelectorAll('#f-cat button')) x.setAttribute('aria-pressed', String(x.dataset.c === filtros.categoria))
    actualizar()
  })
  el.querySelector('#f-unidad').addEventListener('change', (e) => {
    filtros.unidad = e.target.value
    actualizar()
  })
  el.querySelector('#f-texto').addEventListener('input', (e) => {
    filtros.texto = e.target.value
    actualizar()
  })
  el.querySelector('#f-resurtir').addEventListener('change', (e) => {
    filtros.resurtir = e.target.checked
    actualizar()
  })
  el.querySelector('#f-inactivos').addEventListener('change', (e) => {
    filtros.inactivos = e.target.checked
    actualizar()
  })
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]')
    if (b) {
      const id = b.dataset.id
      const a = b.dataset.accion
      if (a === 'nuevo') dialogoNuevo()
      if (a === 'compra') dialogoCompra(id)
      if (a === 'conteo') dialogoConteo(id)
      if (a === 'importar') dialogoImportar()
      if (a === 'excel') exportar()
      return
    }
    const fila = e.target.closest('tr[data-art]')
    if (fila) dialogoEditar(fila.dataset.art)
  })
}

function unidadesDisponibles() {
  return [...new Set([...unidades(estado.opciones.sucursales), ...estado.articulos.map((a) => a.unidad).filter((u) => u && u !== 'Todas')])]
}

function filtrados() {
  const t = normalizar(filtros.texto)
  return estado.articulos.filter((a) => {
    if (!filtros.inactivos && a.activo === false) return false
    if (filtros.categoria && a.categoria !== filtros.categoria) return false
    if (filtros.unidad && (a.unidad || 'Todas') !== filtros.unidad) return false
    if (filtros.resurtir && !['agotado', 'bajo'].includes(estadoStock(a))) return false
    if (t && !normalizar(`${a.tipo} ${a.nombre} ${a.talla} ${a.unidad} ${a.proveedor ?? ''}`).includes(t)) return false
    return true
  })
}

export function actualizar() {
  if (!raiz) return
  const selUnidad = raiz.querySelector('#f-unidad')
  selUnidad.innerHTML = `<option value="">Todas las unidades</option><option value="Todas" ${filtros.unidad === 'Todas' ? 'selected' : ''}>Para todas (genéricos)</option>${unidadesDisponibles()
    .map((u) => `<option ${u === filtros.unidad ? 'selected' : ''}>${h(u)}</option>`)
    .join('')}`
  const lista = ordenarArticulos(filtrados())
  const c = raiz.querySelector('#contenido')
  if (!estado.articulos.length) {
    c.innerHTML = `<div class="tarjeta vacio"><b>Tu inventario está vacío</b>Da de alta tus gafetes y uniformes con <b>+ Nuevo artículo</b>, o súbelos todos de una vez con <b>Importar Excel</b>.
      <div class="acciones" style="justify-content:center;margin-top:16px"><button class="btn btn-primario" type="button" data-accion="nuevo">+ Nuevo artículo</button><button class="btn" type="button" data-accion="importar">Importar Excel</button></div></div>`
    return
  }
  const res = resumenInventario(lista)
  let filas = ''
  let grupoActual = null
  for (const a of lista) {
    if (a.grupo !== grupoActual) {
      grupoActual = a.grupo
      const hermanos = lista.filter((x) => x.grupo === a.grupo)
      const valor = hermanos.reduce((s, x) => s + Math.max(0, Number(x.real) || 0) * (Number(x.costo) || 0), 0)
      filas += `<tr class="grupo-fila"><td colspan="9"><b>${h(nombreArticulo(a))}</b> <span class="tenue">· ${h(CATEGORIAS[a.categoria])} · ${h(a.unidad && a.unidad !== 'Todas' ? a.unidad : 'Todas las unidades')}${a.proveedor ? ` · ${h(a.proveedor)}` : ''} · ${dinero(valor)} en stock</span></td></tr>`
    }
    const real = Number(a.real) || 0
    const deseado = Number(a.deseado) || 0
    const costo = Number(a.costo) || 0
    const dif = real - deseado
    const e = ESTADO_STOCK[estadoStock(a)]
    filas += `<tr class="clic ${a.activo === false ? 'inactivo' : ''}" data-art="${h(a.id)}">
      <td class="sangria">${a.talla ? `Talla <b>${h(a.talla)}</b>` : 'Sin talla'}</td>
      <td class="num"><b>${numero(real)}</b></td>
      <td class="num">${numero(deseado)}</td>
      <td class="num ${dif < 0 ? 'negativo' : dif > 0 ? 'positivo' : ''}">${dif > 0 ? '+' : ''}${numero(dif)}</td>
      <td class="num">${dinero(costo)}</td>
      <td class="num">${dinero(Math.max(0, real) * costo)}</td>
      <td class="num">${dinero(Math.max(0, -dif) * costo)}</td>
      <td>${a.activo === false ? '<span class="badge tono-neutro">Inactivo</span>' : `<span class="badge tono-${e.tono}">${e.texto}</span>`}</td>
      <td style="white-space:nowrap"><button class="btn btn-chico" type="button" data-accion="compra" data-id="${h(a.id)}">+ Compra</button>
        <button class="btn btn-chico btn-texto" type="button" data-accion="conteo" data-id="${h(a.id)}">Conteo</button></td>
    </tr>`
  }
  c.innerHTML = `
    <div class="kpis">
      <div class="kpi destacado"><div class="etq">Costo del inventario (real)</div><div class="valor">${dinero(res.valor)}</div><div class="sub">${numero(res.piezas)} piezas</div></div>
      <div class="kpi"><div class="etq">Inventario deseado</div><div class="valor">${dinero(res.valorDeseado)}</div><div class="sub">${numero(res.deseadoPiezas)} piezas</div></div>
      <div class="kpi"><div class="etq">Para llegar al deseado</div><div class="valor">${dinero(res.faltanteCosto)}</div><div class="sub">Faltan ${numero(res.faltantePiezas)} piezas</div></div>
      <div class="kpi"><div class="etq">Por resurtir</div><div class="valor">${res.agotados.length + res.bajoDeseado.length}</div><div class="sub">${res.agotados.length} agotados · ${numero(res.sobrantePiezas)} piezas de sobra</div></div>
    </div>
    ${
      lista.length
        ? `<div class="tabla-envoltura"><table>
      <thead><tr><th>Artículo / talla</th><th class="num">Real</th><th class="num">Deseado</th><th class="num">Diferencia</th><th class="num">Costo pieza</th><th class="num">Costo inventario</th><th class="num">Costo faltante</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td>Total (${lista.length})</td><td class="num">${numero(res.piezas)}</td><td class="num">${numero(res.deseadoPiezas)}</td><td class="num">${numero(res.piezas - res.deseadoPiezas)}</td><td></td><td class="num">${dinero(res.valor)}</td><td class="num">${dinero(res.faltanteCosto)}</td><td colspan="2"></td></tr></tfoot>
    </table></div><p class="tenue" style="margin-top:8px">Toca un renglón para editar costo, deseado o datos del artículo.</p>`
        : '<div class="tarjeta vacio"><b>Nada con estos filtros</b>Prueba con otra categoría o búsqueda.</div>'
    }`
}

// ---------- Nuevo artículo ----------

function opcionesTipo(categoria, seleccion = '') {
  const lista = categoria === 'gafete' ? estado.opciones.tiposGafete : estado.opciones.tiposUniforme
  const incluye = !seleccion || lista.includes(seleccion)
  return `<option value="">Elige tipo…</option>${lista.map((t) => `<option ${t === seleccion ? 'selected' : ''}>${h(t)}</option>`).join('')}${
    incluye ? '' : `<option selected>${h(seleccion)}</option>`
  }<option value="__otro">Otro (escribir)…</option>`
}

function opcionesUnidad(sel = 'Todas') {
  return `<option value="Todas">Todas las unidades</option>${unidadesDisponibles()
    .map((u) => `<option ${u === sel ? 'selected' : ''}>${h(u)}</option>`)
    .join('')}`
}

function dialogoNuevo() {
  const tallas = estado.opciones.tallas
  abrirDialogo({
    titulo: 'Nuevo artículo',
    subtitulo: 'Un artículo puede tener varias tallas; cada talla lleva su propio real y deseado.',
    ancho: true,
    cuerpo: `
      <div>
        <p class="etiqueta" style="margin-bottom:8px">Categoría</p>
        <div class="chips-radio" id="cat">
          <label><input type="radio" name="cat" value="uniforme" checked />Uniforme</label>
          <label><input type="radio" name="cat" value="gafete" />Gafete</label>
        </div>
      </div>
      <div class="rejilla">
        <label class="campo"><span>Tipo <em>*</em></span><select id="tipo">${opcionesTipo('uniforme')}</select>
          <input id="tipo-otro" class="oculto" maxlength="60" placeholder="Escribe el tipo" /></label>
        <label class="campo"><span>Modelo / color / descripción</span><input id="nombre" maxlength="80" placeholder="Ej. Azul marino con logo" /></label>
        <label class="campo"><span>Unidad de negocio</span><select id="unidad">${opcionesUnidad()}</select></label>
        <label class="campo"><span>Costo por pieza (MXN) <em>*</em></span><input id="costo" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /></label>
        <label class="campo"><span>Proveedor</span><input id="proveedor" maxlength="80" /></label>
      </div>
      <div>
        <p class="etiqueta" style="margin-bottom:8px">Tallas</p>
        <div class="chips-radio" id="tallas">
          <label><input type="checkbox" value="" data-sin />Sin talla</label>
          ${tallas.map((t) => `<label><input type="checkbox" value="${h(t)}" />${h(t)}</label>`).join('')}
        </div>
        <label class="campo" style="margin-top:10px"><span>Otras tallas <small>(separadas por coma, ej. 28, 30, 32)</small></span><input id="tallas-extra" /></label>
      </div>
      <div id="tabla-tallas"></div>
      <div id="error" class="aviso aviso-error oculto"></div>`,
    pie: '<button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn-primario" type="button" id="guardar">Guardar artículo</button>',
    alMontar: (dlg) => {
      const $ = (s) => dlg.querySelector(s)
      const valores = {}
      const tallasElegidas = () => {
        const marcadas = [...dlg.querySelectorAll('#tallas input:checked')].map((i) => i.value)
        const extra = $('#tallas-extra').value.split(',').map((s) => s.trim()).filter(Boolean)
        return [...new Set([...marcadas, ...extra])].sort((a, b) => ordenTalla(a) - ordenTalla(b))
      }
      const pintarTabla = () => {
        for (const i of dlg.querySelectorAll('#tabla-tallas input')) valores[i.name] = i.value
        const ts = tallasElegidas()
        $('#tabla-tallas').innerHTML = ts.length
          ? `<div class="tabla-envoltura"><table><thead><tr><th>Talla</th><th>Real (lo que tienes hoy)</th><th>Deseado (lo que quieres tener)</th></tr></thead><tbody>${ts
              .map(
                (t) => `<tr><td><b>${h(t || 'Sin talla')}</b></td>
                <td><input type="number" min="0" step="1" name="real|${h(t)}" value="${h(valores[`real|${t}`] ?? '0')}" /></td>
                <td><input type="number" min="0" step="1" name="deseado|${h(t)}" value="${h(valores[`deseado|${t}`] ?? '0')}" /></td></tr>`,
              )
              .join('')}</tbody></table></div>`
          : '<p class="tenue">Elige al menos una talla (o "Sin talla").</p>'
      }
      $('#cat').addEventListener('change', () => {
        const cat = dlg.querySelector('input[name="cat"]:checked').value
        $('#tipo').innerHTML = opcionesTipo(cat)
        $('#tipo-otro').classList.add('oculto')
        const sin = dlg.querySelector('[data-sin]')
        if (cat === 'gafete' && !tallasElegidas().length) sin.checked = true
        pintarTabla()
      })
      $('#tipo').addEventListener('change', () => $('#tipo-otro').classList.toggle('oculto', $('#tipo').value !== '__otro'))
      $('#tallas').addEventListener('change', pintarTabla)
      $('#tallas-extra').addEventListener('input', pintarTabla)
      pintarTabla()
      $('#guardar').onclick = async () => {
        const categoria = dlg.querySelector('input[name="cat"]:checked').value
        const tipo = $('#tipo').value === '__otro' ? $('#tipo-otro').value.trim() : $('#tipo').value
        const base = {
          categoria,
          tipo,
          nombre: $('#nombre').value.trim(),
          unidad: $('#unidad').value,
          costo: $('#costo').value,
          proveedor: $('#proveedor').value.trim(),
        }
        const ts = tallasElegidas()
        const errores = []
        if (!tipo) errores.push('Elige el tipo.')
        if ($('#costo').value === '' || limpiarNumero(base.costo) < 0) errores.push('Escribe el costo por pieza.')
        if (!ts.length) errores.push('Elige al menos una talla (o "Sin talla").')
        const grupo = claveGrupo(base)
        const repetidas = ts.filter((t) => estado.articulos.some((a) => a.grupo === grupo && String(a.talla ?? '') === t))
        if (repetidas.length) errores.push(`Ya existe este artículo en: ${repetidas.map((t) => t || 'sin talla').join(', ')}. Edítalo desde la tabla.`)
        if (errores.length) {
          $('#error').innerHTML = errores.map((e) => `<div>• ${h(e)}</div>`).join('')
          $('#error').classList.remove('oculto')
          return
        }
        const variantes = ts.map((t) => ({
          talla: t,
          real: dlg.querySelector(`[name="real|${CSS.escape(t)}"]`)?.value,
          deseado: dlg.querySelector(`[name="deseado|${CSS.escape(t)}"]`)?.value,
        }))
        $('#guardar').disabled = true
        try {
          await crearArticulos(base, variantes)
          toast(`Artículo guardado (${variantes.length} talla${variantes.length === 1 ? '' : 's'})`)
          dlg.cerrar()
        } catch (e) {
          console.error(e)
          toast('No se pudo guardar. Intenta otra vez.', true)
          $('#guardar').disabled = false
        }
      }
    },
  })
}

// ---------- Editar ----------

function dialogoEditar(id) {
  const a = articuloPorId(id)
  if (!a) return
  const hermanos = estado.articulos.filter((x) => x.grupo === a.grupo && x.id !== a.id)
  const usado = estado.movimientos.some((m) => m.articuloId === a.id)
  abrirDialogo({
    titulo: etiquetaArticulo(a),
    subtitulo: `${h(CATEGORIAS[a.categoria])} · Real actual: <b>${numero(a.real)}</b> piezas`,
    cuerpo: `
      <div class="rejilla">
        <label class="campo"><span>Tipo</span><select id="tipo">${opcionesTipo(a.categoria, a.tipo)}</select>
          <input id="tipo-otro" class="oculto" maxlength="60" placeholder="Escribe el tipo" /></label>
        <label class="campo"><span>Modelo / color / descripción</span><input id="nombre" maxlength="80" value="${h(a.nombre ?? '')}" /></label>
        <label class="campo"><span>Unidad de negocio</span><select id="unidad">${opcionesUnidad(a.unidad || 'Todas')}</select></label>
        <label class="campo"><span>Talla</span><input id="talla" maxlength="20" value="${h(a.talla ?? '')}" placeholder="Sin talla" /></label>
        <label class="campo"><span>Costo por pieza (MXN)</span><input id="costo" type="number" min="0" step="0.01" value="${h(a.costo ?? 0)}" /></label>
        <label class="campo"><span>Inventario deseado</span><input id="deseado" type="number" min="0" step="1" value="${h(a.deseado ?? 0)}" /></label>
        <label class="campo"><span>Proveedor</span><input id="proveedor" maxlength="80" value="${h(a.proveedor ?? '')}" /></label>
      </div>
      ${
        hermanos.length
          ? `<label style="display:flex;gap:8px;align-items:flex-start;font-weight:600"><input type="checkbox" id="todas" checked style="margin-top:4px" />
             <span>Aplicar tipo, modelo, unidad, costo y proveedor también a las otras ${hermanos.length} talla(s) de este artículo<br><span class="tenue">El deseado y la talla solo cambian en esta.</span></span></label>`
          : ''
      }
      <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="activo" ${a.activo !== false ? 'checked' : ''} /> Activo (aparece en el formulario y en el inventario)</label>
      <div class="aviso aviso-info"><div>El <b>real</b> no se edita a mano: usa <b>Registrar compra</b> cuando llega mercancía o <b>Conteo físico</b> si contaste y no cuadra. Así queda el historial y el costo.</div></div>
      <div class="acciones"><button class="btn btn-chico" type="button" id="ir-compra">+ Registrar compra</button><button class="btn btn-chico" type="button" id="ir-conteo">Conteo físico</button></div>`,
    pie: `${usado ? '' : '<button class="btn btn-texto btn-peligro" type="button" id="borrar" style="margin-right:auto">Eliminar</button>'}
      <button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn-primario" type="button" id="guardar">Guardar</button>`,
    alMontar: (dlg) => {
      const $ = (s) => dlg.querySelector(s)
      $('#tipo').addEventListener('change', () => $('#tipo-otro').classList.toggle('oculto', $('#tipo').value !== '__otro'))
      $('#ir-compra').onclick = () => {
        dlg.cerrar()
        dialogoCompra(a.id)
      }
      $('#ir-conteo').onclick = () => {
        dlg.cerrar()
        dialogoConteo(a.id)
      }
      $('#borrar')?.addEventListener('click', async () => {
        if (!(await confirmar('¿Eliminar este artículo?', { aceptar: 'Eliminar', peligro: true, detalle: 'No tiene movimientos registrados. No se puede deshacer.' }))) return
        await eliminarArticulo(a.id)
        toast('Artículo eliminado')
        dlg.cerrar()
      })
      $('#guardar').onclick = async () => {
        const tipo = $('#tipo').value === '__otro' ? $('#tipo-otro').value.trim() : $('#tipo').value
        if (!tipo) {
          toast('Elige el tipo', true)
          return
        }
        const comunes = {
          tipo,
          nombre: $('#nombre').value.trim(),
          unidad: $('#unidad').value || 'Todas',
          costo: limpiarNumero($('#costo').value),
          proveedor: $('#proveedor').value.trim() || null,
        }
        const propios = { talla: $('#talla').value.trim() || null, deseado: Math.round(limpiarNumero($('#deseado').value)), activo: $('#activo').checked }
        $('#guardar').disabled = true
        try {
          if (hermanos.length && $('#todas')?.checked) {
            await actualizarVarios(
              hermanos.map((x) => x.id),
              comunes,
            )
          }
          await actualizarArticulo(a.id, { ...comunes, ...propios })
          toast('Cambios guardados')
          dlg.cerrar()
        } catch (e) {
          console.error(e)
          toast('No se pudo guardar', true)
          $('#guardar').disabled = false
        }
      }
    },
  })
}

// ---------- Compra (entrada) ----------

function filaCompra(articuloId = '') {
  const a = articuloPorId(articuloId)
  return `<tr>
    <td><select data-art>${opcionesArticulos(articuloId)}</select></td>
    <td style="width:100px"><input data-cant type="number" min="1" step="1" value="1" /></td>
    <td style="width:130px"><input data-costo type="number" min="0" step="0.01" value="${h(a?.costo ?? '')}" /></td>
    <td class="num" data-sub></td>
    <td style="width:40px"><button class="btn btn-chico btn-texto" type="button" data-quitar aria-label="Quitar">×</button></td>
  </tr>`
}

function dialogoCompra(articuloId = '') {
  if (!estado.articulos.length) {
    toast('Primero da de alta un artículo', true)
    return
  }
  abrirDialogo({
    titulo: 'Registrar compra',
    subtitulo: 'Suma piezas al inventario real y guarda el costo de lo que compraste.',
    ancho: true,
    cuerpo: `
      <div class="rejilla">
        <label class="campo"><span>Fecha</span><input id="fecha" type="date" value="${isoLocal()}" /></label>
        <label class="campo"><span>Proveedor</span><input id="proveedor" maxlength="80" /></label>
        <label class="campo"><span>Factura / folio</span><input id="factura" maxlength="60" /></label>
      </div>
      <div class="tabla-envoltura"><table>
        <thead><tr><th>Artículo</th><th>Piezas</th><th>Costo c/u</th><th class="num">Subtotal</th><th></th></tr></thead>
        <tbody id="lineas">${filaCompra(articuloId)}</tbody>
      </table></div>
      <div class="acciones" style="justify-content:space-between"><button class="btn btn-chico" type="button" id="agregar">+ Otra línea</button><b id="total"></b></div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="act-costo" checked /> Actualizar el costo por pieza con el de esta compra</label>
      <label class="campo"><span>Nota</span><input id="nota" maxlength="200" /></label>`,
    pie: '<button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn-primario" type="button" id="guardar">Guardar compra</button>',
    alMontar: (dlg) => {
      const tbody = dlg.querySelector('#lineas')
      const recalcular = () => {
        let total = 0
        for (const tr of tbody.querySelectorAll('tr')) {
          const sub = (Number(tr.querySelector('[data-cant]').value) || 0) * limpiarNumero(tr.querySelector('[data-costo]').value)
          total += sub
          tr.querySelector('[data-sub]').textContent = dinero(sub)
        }
        dlg.querySelector('#total').textContent = `Total: ${dinero(total)}`
      }
      tbody.addEventListener('change', (e) => {
        if (e.target.matches('[data-art]')) {
          const a = articuloPorId(e.target.value)
          if (a) e.target.closest('tr').querySelector('[data-costo]').value = a.costo ?? ''
        }
        recalcular()
      })
      tbody.addEventListener('input', recalcular)
      tbody.addEventListener('click', (e) => {
        if (e.target.closest('[data-quitar]')) {
          e.target.closest('tr').remove()
          recalcular()
        }
      })
      dlg.querySelector('#agregar').onclick = () => {
        tbody.insertAdjacentHTML('beforeend', filaCompra())
        recalcular()
      }
      recalcular()
      dlg.querySelector('#guardar').onclick = async () => {
        const actualizarCosto = dlg.querySelector('#act-costo').checked
        const lineas = [...tbody.querySelectorAll('tr')]
          .map((tr) => ({
            articuloId: tr.querySelector('[data-art]').value,
            cantidad: Number(tr.querySelector('[data-cant]').value) || 0,
            costoUnitario: tr.querySelector('[data-costo]').value,
            actualizarCosto,
          }))
          .filter((l) => l.articuloId && l.cantidad > 0)
        if (!lineas.length) {
          toast('Agrega al menos un artículo con piezas', true)
          return
        }
        dlg.querySelector('#guardar').disabled = true
        try {
          await registrarMovimientos('entrada', lineas, {
            fecha: dlg.querySelector('#fecha').value,
            proveedor: dlg.querySelector('#proveedor').value,
            factura: dlg.querySelector('#factura').value,
            nota: dlg.querySelector('#nota').value,
          })
          toast('Compra registrada')
          dlg.cerrar()
        } catch (e) {
          console.error(e)
          toast('No se pudo guardar la compra', true)
          dlg.querySelector('#guardar').disabled = false
        }
      }
    },
  })
}

// ---------- Conteo físico (ajuste) ----------

function dialogoConteo(articuloId = '') {
  const lista = articuloId
    ? [articuloPorId(articuloId)].filter(Boolean)
    : ordenarArticulos(estado.articulos.filter((a) => a.activo !== false && (!filtros.categoria || a.categoria === filtros.categoria)))
  if (!lista.length) {
    toast('No hay artículos para contar', true)
    return
  }
  abrirDialogo({
    titulo: 'Conteo físico',
    subtitulo: 'Escribe lo que contaste. Solo se ajustan los renglones que llenes; la diferencia queda registrada como ajuste.',
    ancho: true,
    cuerpo: `
      <div class="tabla-envoltura" style="max-height:52vh;overflow:auto"><table>
        <thead><tr><th>Artículo</th><th class="num">En sistema</th><th>Conteo</th><th class="num">Diferencia</th></tr></thead>
        <tbody>${lista
          .map(
            (a) => `<tr data-id="${h(a.id)}"><td>${h(etiquetaArticulo(a))}</td><td class="num">${numero(a.real)}</td>
              <td style="width:120px"><input type="number" min="0" step="1" data-conteo placeholder="—" /></td><td class="num" data-dif></td></tr>`,
          )
          .join('')}</tbody>
      </table></div>
      <div class="rejilla">
        <label class="campo"><span>Fecha</span><input id="fecha" type="date" value="${isoLocal()}" /></label>
        <label class="campo"><span>Nota</span><input id="nota" maxlength="200" placeholder="Ej. Conteo mensual de noviembre" /></label>
      </div>`,
    pie: '<button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn-primario" type="button" id="guardar">Guardar conteo</button>',
    alMontar: (dlg) => {
      dlg.addEventListener('input', (e) => {
        const tr = e.target.closest('tr[data-id]')
        if (!tr) return
        const a = articuloPorId(tr.dataset.id)
        const v = e.target.value
        const cel = tr.querySelector('[data-dif]')
        if (v === '') {
          cel.textContent = ''
          return
        }
        const d = Math.round(Number(v)) - (Number(a.real) || 0)
        cel.innerHTML = `<span class="${d < 0 ? 'negativo' : d > 0 ? 'positivo' : ''}">${d > 0 ? '+' : ''}${d}</span>`
      })
      dlg.querySelector('[data-conteo]')?.focus()
      dlg.querySelector('#guardar').onclick = async () => {
        const lineas = []
        for (const tr of dlg.querySelectorAll('tr[data-id]')) {
          const v = tr.querySelector('[data-conteo]').value
          if (v === '') continue
          const a = articuloPorId(tr.dataset.id)
          const d = Math.round(Number(v)) - (Number(a.real) || 0)
          if (d) lineas.push({ articuloId: a.id, cantidad: d })
        }
        if (!lineas.length) {
          toast('No hay diferencias que guardar')
          dlg.cerrar()
          return
        }
        dlg.querySelector('#guardar').disabled = true
        try {
          await registrarMovimientos('ajuste', lineas, { fecha: dlg.querySelector('#fecha').value, nota: dlg.querySelector('#nota').value || 'Conteo físico' })
          toast(`Conteo guardado (${lineas.length} ajuste${lineas.length === 1 ? '' : 's'})`)
          dlg.cerrar()
        } catch (e) {
          console.error(e)
          toast('No se pudo guardar el conteo', true)
          dlg.querySelector('#guardar').disabled = false
        }
      }
    },
  })
}

// ---------- Excel ----------

const COLUMNAS_PLANTILLA = ['Categoría', 'Tipo', 'Modelo / color', 'Unidad', 'Talla', 'Costo por pieza', 'Real', 'Deseado', 'Proveedor']

function exportar() {
  const filas = ordenarArticulos(filtrados()).map((a) => {
    const real = Number(a.real) || 0
    const deseado = Number(a.deseado) || 0
    const costo = Number(a.costo) || 0
    return {
      Categoría: CATEGORIAS[a.categoria],
      Tipo: a.tipo,
      'Modelo / color': a.nombre ?? '',
      Unidad: a.unidad ?? 'Todas',
      Talla: a.talla ?? '',
      'Costo por pieza': costo,
      Real: real,
      Deseado: deseado,
      Diferencia: real - deseado,
      'Costo inventario real': Math.max(0, real) * costo,
      'Costo inventario deseado': deseado * costo,
      'Costo para llegar al deseado': Math.max(0, deseado - real) * costo,
      Estado: a.activo === false ? 'Inactivo' : ESTADO_STOCK[estadoStock(a)].texto,
      Proveedor: a.proveedor ?? '',
    }
  })
  descargarExcel(`Inventario gafetes y uniformes ${fechaArchivo()}.xlsx`, [{ nombre: 'Inventario', filas }])
}

function leerFilaImportada(f) {
  const v = {}
  for (const [k, val] of Object.entries(f)) v[normalizar(k).replace(/[^a-z]/g, '')] = typeof val === 'string' ? val.trim() : val
  const cat = normalizar(v.categoria ?? '')
  const categoria = cat.startsWith('g') ? 'gafete' : cat.startsWith('u') ? 'uniforme' : null
  const tipo = String(v.tipo ?? '').trim()
  if (!categoria || !tipo) return null
  const unidad = String(v.unidad ?? '').trim()
  return {
    categoria,
    tipo,
    nombre: String(v.modelocolor ?? v.modelo ?? v.nombre ?? '').trim(),
    unidad: !unidad || normalizar(unidad).startsWith('toda') ? 'Todas' : unidad,
    talla: String(v.talla ?? '').trim() || null,
    costo: limpiarNumero(v.costoporpieza ?? v.costo),
    real: Math.round(limpiarNumero(v.real)),
    deseado: Math.round(limpiarNumero(v.deseado)),
    proveedor: String(v.proveedor ?? '').trim(),
  }
}

function dialogoImportar() {
  let filas = []
  abrirDialogo({
    titulo: 'Importar inventario desde Excel',
    cuerpo: `
      <ol style="margin:0;padding-left:20px;display:grid;gap:6px">
        <li>Descarga la plantilla y llénala (un renglón por talla).</li>
        <li>En <b>Categoría</b> escribe Gafete o Uniforme. <b>Unidad</b> puede quedar vacía (= todas).</li>
        <li>Súbela aquí. Si un artículo con esa talla ya existe, se actualizan su costo, real y deseado.</li>
      </ol>
      <div class="acciones"><button class="btn" type="button" id="plantilla">Descargar plantilla</button></div>
      <label class="campo"><span>Archivo de Excel</span><input id="archivo" type="file" accept=".xlsx,.xls,.csv" /></label>
      <div id="vista-previa"></div>`,
    pie: '<button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn-primario" type="button" id="importar" disabled>Importar</button>',
    alMontar: (dlg) => {
      dlg.querySelector('#plantilla').onclick = () =>
        descargarExcel('Plantilla inventario gafetes y uniformes.xlsx', [
          {
            nombre: 'Inventario',
            filas: [
              Object.fromEntries(COLUMNAS_PLANTILLA.map((c, i) => [c, ['Uniforme', 'Playera polo', 'Azul marino', 'Vivo 47', 'M', 250, 10, 15, 'Proveedor X'][i]])),
              Object.fromEntries(COLUMNAS_PLANTILLA.map((c, i) => [c, ['Gafete', 'Gafete PVC impreso', '', '', '', 45, 30, 40, ''][i]])),
            ],
          },
        ])
      dlg.querySelector('#archivo').onchange = async (e) => {
        const archivo = e.target.files?.[0]
        const vista = dlg.querySelector('#vista-previa')
        if (!archivo) return
        try {
          const XLSX = await cargarXLSX()
          const libro = XLSX.read(await archivo.arrayBuffer())
          const crudas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '' })
          filas = crudas.map(leerFilaImportada).filter(Boolean)
          const omitidas = crudas.length - filas.length
          const existentes = new Set(estado.articulos.map((a) => `${a.grupo}|${a.talla ?? ''}`))
          const actualizan = filas.filter((f) => existentes.has(`${claveGrupo(f)}|${f.talla ?? ''}`)).length
          vista.innerHTML = filas.length
            ? `<div class="aviso aviso-info"><div><b>${filas.length} renglón(es) listos:</b> ${filas.length - actualizan} nuevos y ${actualizan} se actualizan.${omitidas ? ` Se omiten ${omitidas} sin categoría o tipo.` : ''}</div></div>`
            : '<div class="aviso aviso-error"><div>No encontré renglones válidos. Revisa que existan las columnas Categoría y Tipo.</div></div>'
          dlg.querySelector('#importar').disabled = !filas.length
        } catch (err) {
          console.error(err)
          vista.innerHTML = '<div class="aviso aviso-error"><div>No pude leer el archivo.</div></div>'
        }
      }
      dlg.querySelector('#importar').onclick = async () => {
        dlg.querySelector('#importar').disabled = true
        try {
          const r = await importarArticulos(filas)
          toast(`Importado: ${r.creados} nuevos, ${r.actualizados} actualizados`)
          dlg.cerrar()
        } catch (err) {
          console.error(err)
          toast('No se pudo importar', true)
          dlg.querySelector('#importar').disabled = false
        }
      }
    },
  })
}
