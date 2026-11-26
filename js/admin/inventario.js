// Pestaña Inventario: real vs. deseado, costo por pieza, costo del inventario y del faltante.
import { CATEGORIAS, claveGrupo, dinero, fechaCorta, GENEROS, h, isoLocal, llaveColaborador, nombreArticulo, nombreSucursal, normalizar, numero, ordenTalla, RAZONES, unidades } from '../comun.js'
import {
  actualizarArticulo,
  actualizarVarios,
  asegurarArticuloGafete,
  crearArticulos,
  eliminarArticulo,
  importarArticulos,
  limpiarNumero,
  registrarGafetes,
  registrarMovimientos,
} from './datos.js'
import { articuloPorId, estado } from './estado.js'
import { emparejarSucursal, expandirPlan, leerArticulo, leerGafete, planearGafetes, tipoHoja } from './importar.js'
import { estadoStock, fechaMovimiento, gafetesPorColaborador, resumenInventario, totalMovimiento } from './metricas.js'
import {
  abrirDialogo,
  cargarXLSX,
  confirmar,
  descargarExcel,
  ESTADO_STOCK,
  etiquetaArticulo,
  fechaArchivo,
  opcionesArticulos,
  opcionesLista,
  opcionesSucursales,
  ordenarArticulos,
  toast,
} from './ui.js'

let raiz = null
const filtros = { categoria: '', unidad: '', texto: '', resurtir: false, inactivos: false }
const filtrosGafete = { sucursal: '' }
let ultimoGafete = { sucursal: '', fecha: isoLocal() }

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
      <label class="campo"><span class="sr">Buscar</span><input type="search" id="f-texto" placeholder="Buscar artículo, talla o colaborador…" value="${h(filtros.texto)}" /></label>
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
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'gaf-sucursal') return
    filtrosGafete.sucursal = e.target.value
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
      if (a === 'gafete') dialogoGafete({ nombre: b.dataset.nombre, sucursal: b.dataset.sucursal })
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
    if (t && !normalizar(`${a.tipo} ${a.nombre} ${a.color ?? ''} ${a.genero ?? ''} ${a.rol ?? ''} ${a.area ?? ''} ${a.talla} ${a.unidad} ${a.proveedor ?? ''}`).includes(t)) return false
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
      <div class="acciones" style="justify-content:center;margin-top:16px"><button class="btn btn-primario" type="button" data-accion="nuevo">+ Nuevo artículo</button><button class="btn" type="button" data-accion="gafete">+ Registrar gafete</button><button class="btn" type="button" data-accion="importar">Importar Excel</button></div></div>`
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
      filas += `<tr class="grupo-fila"><td colspan="9"><b>${h(nombreArticulo(a))}</b> <span class="tenue">· ${h(CATEGORIAS[a.categoria])}${a.area ? ` · Área: ${h(a.area)}` : ''}${a.rol ? ` · Para: ${h(a.rol)}` : ''} · ${h(a.unidad && a.unidad !== 'Todas' ? a.unidad : 'Todas las unidades')}${a.proveedor ? ` · ${h(a.proveedor)}` : ''} · ${dinero(valor)} en stock</span></td></tr>`
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
    }
    ${filtros.categoria === 'uniforme' ? '' : htmlRegistroGafetes()}`
}

// ---------- Gafetes por colaborador ----------
// Un renglón por colaborador: sucursal y cantidad de gafetes (el primero es nuevo ingreso, los demás reposición).

const gafetesRegistrados = () => estado.movimientos.filter((m) => m.tipo === 'salida' && m.categoria === 'gafete')
const tiposGafete = () => ordenarArticulos(estado.articulos.filter((a) => a.categoria === 'gafete' && a.activo !== false))
const gafetePorDefecto = (tipos) =>
  tipos.find((a) => (a.unidad || 'Todas') === 'Todas' && /gafete/i.test(a.tipo)) ?? tipos.find((a) => /gafete/i.test(a.tipo)) ?? tipos[0]

// Si diste de alta un gafete por sucursal o por unidad (columna Unidad), se usa el que le toca.
function gafeteDeSucursal(sucursal, tipos) {
  if (!sucursal) return null
  return tipos.find((a) => a.unidad && a.unidad !== 'Todas' && emparejarSucursal(a.unidad, [sucursal]).reconocida) ?? null
}
const opcionesGafete = (tipos, seleccionado) =>
  tipos
    .map((a) => `<option value="${h(a.id)}" ${a.id === seleccionado?.id ? 'selected' : ''}>${h(etiquetaArticulo(a))} · ${dinero(a.costo)} · ${numero(a.real)} en stock</option>`)
    .join('')
const conteoPorColaborador = () => new Map(gafetesPorColaborador(gafetesRegistrados()).map((x) => [llaveColaborador(x.nombre, x.sucursal), x]))

function htmlRegistroGafetes() {
  const t = normalizar(filtros.texto)
  const todos = gafetesPorColaborador(gafetesRegistrados())
  const lista = todos
    .filter((x) => !filtrosGafete.sucursal || x.sucursal === filtrosGafete.sucursal)
    .filter((x) => !t || normalizar(`${x.nombre} ${x.sucursal}`).includes(t))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
  const gafetes = lista.reduce((s, x) => s + x.total, 0)
  const reposiciones = lista.reduce((s, x) => s + x.reposiciones, 0)
  const costo = lista.reduce((s, x) => s + x.costo, 0)
  const sucursales = [...new Set([...estado.opciones.sucursales, ...todos.map((x) => x.sucursal).filter(Boolean)])]
  const mostrar = lista.slice(0, 300)
  return `
    <div class="tarjeta" style="margin-top:16px">
      <div class="tarjeta-titulo">
        <div><h3>Gafetes por colaborador</h3><p>Sucursal, cantidad de gafetes (reposición) y nombre · no cuenta porta gafetes ni cordones</p></div>
        <div class="acciones">
          <select id="gaf-sucursal" aria-label="Sucursal" style="width:auto"><option value="">Todas las sucursales</option>${sucursales
            .map((s) => `<option value="${h(s)}" ${s === filtrosGafete.sucursal ? 'selected' : ''}>${h(nombreSucursal(s))}</option>`)
            .join('')}</select>
          <button class="btn btn-primario" type="button" data-accion="gafete">+ Registrar gafete</button>
        </div>
      </div>
      <p class="muted" style="margin-bottom:12px"><b>${numero(lista.length)}</b> colaboradores · ${numero(gafetes)} gafetes · ${numero(reposiciones)} reposiciones · ${dinero(costo)}</p>
      ${
        mostrar.length
          ? `<div class="tabla-envoltura"><table>
        <thead><tr><th>Colaborador</th><th>Sucursal</th><th class="num">Gafetes</th><th class="num">Reposiciones</th><th>Último</th><th class="num">Costo</th><th></th></tr></thead>
        <tbody>${mostrar
          .map(
            (x) => `<tr>
            <td><b>${h(x.nombre)}</b></td>
            <td>${h(x.sucursal ? nombreSucursal(x.sucursal) : '—')}</td>
            <td class="num"><b>${numero(x.total)}</b></td>
            <td class="num">${x.reposiciones ? `<span class="badge sin-punto tono-${x.reposiciones >= 2 ? 'alerta' : 'oro'}">${numero(x.reposiciones)}</span>` : '<span class="tenue">0</span>'}</td>
            <td style="white-space:nowrap">${h(fechaCorta(x.ultima))}</td>
            <td class="num">${dinero(x.costo)}</td>
            <td><button class="btn btn-chico" type="button" data-accion="gafete" data-nombre="${h(x.nombre)}" data-sucursal="${h(x.sucursal)}">+ Gafete</button></td>
          </tr>`,
          )
          .join('')}</tbody>
      </table></div>${lista.length > mostrar.length ? `<p class="tenue" style="margin-top:8px">Se muestran 300 de ${lista.length}. Descarga el Excel para verlos todos.</p>` : ''}
      <p class="tenue" style="margin-top:8px">El detalle de cada gafete (fecha, razón, si se descontó) está en Entregas y movimientos.</p>`
          : '<p class="muted">Aún no hay gafetes registrados. Regístralos uno por uno o súbelos con <b>Importar Excel</b> (hoja "Gafetes").</p>'
      }
    </div>`
}

function dialogoGafete(prefijo = {}) {
  const tipos = tiposGafete()
  const sucursalInicial = prefijo.sucursal || ultimoGafete.sucursal
  const inicial = gafeteDeSucursal(sucursalInicial, tipos) ?? gafetePorDefecto(tipos)
  const conteo = conteoPorColaborador()
  abrirDialogo({
    titulo: 'Registrar gafete',
    subtitulo: 'Nombre del colaborador, sucursal y cuántos gafetes se le dan.',
    cuerpo: `
      <div class="rejilla">
        <label class="campo" style="grid-column:1/-1"><span>Nombre del colaborador <em>*</em></span><input id="g-nombre" maxlength="120" autocomplete="off" value="${h(prefijo.nombre ?? '')}" /></label>
        <label class="campo"><span>Sucursal <em>*</em></span><select id="g-sucursal">${opcionesSucursales(sucursalInicial)}</select></label>
        <label class="campo"><span>Gafetes que se le dan</span><input id="g-cantidad" type="number" min="1" max="20" step="1" value="1" /></label>
        <label class="campo"><span>Fecha</span><input id="g-fecha" type="date" value="${h(ultimoGafete.fecha)}" /></label>
      </div>
      <div id="g-previos" class="aviso aviso-info oculto"></div>
      <div>
        <p class="etiqueta" style="margin-bottom:8px">¿Es su primer gafete?</p>
        <div class="chips-radio">
          <label><input type="radio" name="g-rep" value="no" checked />Sí, nuevo ingreso</label>
          <label><input type="radio" name="g-rep" value="si" />No, es reposición</label>
        </div>
      </div>
      <div id="g-bloque-razon" class="oculto">
        <p class="etiqueta" style="margin-bottom:8px">Razón de la reposición (opcional)</p>
        <div class="chips-radio">${Object.entries(RAZONES)
          .map(([k, v]) => `<label><input type="radio" name="g-razon" value="${k}" />${h(v)}</label>`)
          .join('')}</div>
      </div>
      ${
        tipos.length
          ? `<label class="campo"><span>Gafete</span><select id="g-art">${opcionesGafete(tipos, inicial)}</select><small>Si tienes un gafete dado de alta por sucursal, se elige solo.</small></label>`
          : `<div class="rejilla">
              <label class="campo"><span>Tipo de gafete</span><select id="g-tipo">${opcionesLista(estado.opciones.tiposGafete, estado.opciones.tiposGafete[0], null)}</select></label>
              <label class="campo"><span>Costo por gafete (MXN) <em>*</em></span><input id="g-costo" type="number" min="0" step="0.01" inputmode="decimal" /></label>
            </div><p class="tenue">Es tu primer gafete: con esto se da de alta el tipo de gafete y su costo.</p>`
      }
      <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="g-descontar" /> Descontar del inventario de gafetes</label>`,
    pie: `<button class="btn" type="button" data-cerrar>Cancelar</button>
      <button class="btn" type="button" data-guardar="otro">Guardar y registrar otro</button>
      <button class="btn btn-primario" type="button" data-guardar="cerrar">Guardar</button>`,
    alMontar: (dlg) => {
      const $ = (s) => dlg.querySelector(s)
      const ajustarDescontar = () => {
        const a = articuloPorId($('#g-art')?.value)
        $('#g-descontar').checked = Boolean(a && (Number(a.real) || 0) > 0)
      }
      const marcarRepo = (si) => {
        dlg.querySelector(`input[name="g-rep"][value="${si ? 'si' : 'no'}"]`).checked = true
        $('#g-bloque-razon').classList.toggle('oculto', !si)
      }
      let auto = false
      const revisar = () => {
        const x = conteo.get(llaveColaborador($('#g-nombre').value.trim(), $('#g-sucursal').value))
        const caja = $('#g-previos')
        if (x) {
          caja.innerHTML = `<div><strong>${h(x.nombre)}</strong> ya tiene ${numero(x.total)} gafete(s) registrado(s), ${numero(x.reposiciones)} de reposición. Los que agregues cuentan como reposición.</div>`
          caja.classList.remove('oculto')
          marcarRepo(true)
          auto = true
        } else {
          caja.classList.add('oculto')
          if (auto) marcarRepo(false)
          auto = false
        }
      }
      ajustarDescontar()
      revisar()
      $('#g-art')?.addEventListener('change', ajustarDescontar)
      $('#g-nombre').addEventListener('input', revisar)
      $('#g-sucursal').addEventListener('change', () => {
        const propio = gafeteDeSucursal($('#g-sucursal').value, tipos)
        if (propio && $('#g-art')) {
          $('#g-art').value = propio.id
          ajustarDescontar()
        }
        revisar()
      })
      dlg.addEventListener('change', (e) => {
        if (e.target.name === 'g-rep') {
          auto = false
          $('#g-bloque-razon').classList.toggle('oculto', e.target.value !== 'si')
        }
      })
      $(prefijo.nombre ? '#g-cantidad' : '#g-nombre').focus()
      const guardar = async (modo) => {
        const nombre = $('#g-nombre').value.trim().replace(/\s+/g, ' ')
        const sucursal = $('#g-sucursal').value
        const cantidad = Math.min(20, Math.max(1, Math.round(Number($('#g-cantidad').value) || 1)))
        const esPrimero = dlg.querySelector('input[name="g-rep"]:checked')?.value !== 'si'
        const razon = dlg.querySelector('input[name="g-razon"]:checked')?.value ?? null
        const fecha = $('#g-fecha').value || isoLocal()
        if (nombre.length < 3 || !sucursal) {
          toast('Falta el nombre del colaborador o la sucursal', true)
          return
        }
        if (!tipos.length && $('#g-costo').value === '') {
          toast('Escribe el costo por gafete', true)
          return
        }
        const registros = Array.from({ length: cantidad }, (_, i) => {
          const motivo = esPrimero && i === 0 ? 'nuevo' : 'reposicion'
          return { nombre, sucursal, motivo, razon: motivo === 'reposicion' ? razon : null, fecha }
        })
        for (const b of dlg.querySelectorAll('[data-guardar]')) b.disabled = true
        try {
          const articulo = await asegurarArticuloGafete({ articuloId: $('#g-art')?.value, tipo: $('#g-tipo')?.value, costo: $('#g-costo')?.value })
          await registrarGafetes(registros, { articulo, descontar: $('#g-descontar').checked })
          ultimoGafete = { sucursal, fecha }
          toast(`${cantidad === 1 ? 'Gafete registrado' : `${cantidad} gafetes registrados`}: ${nombre}`)
          dlg.cerrar()
          if (modo === 'otro') dialogoGafete({ sucursal })
        } catch (err) {
          console.error(err)
          toast('No se pudo registrar el gafete', true)
          for (const b of dlg.querySelectorAll('[data-guardar]')) b.disabled = false
        }
      }
      for (const b of dlg.querySelectorAll('[data-guardar]')) b.onclick = () => guardar(b.dataset.guardar)
    },
  })
}

// ---------- Color, género y rol de los uniformes ----------

const COLORES_SUGERIDOS = ['Blanco', 'Negro', 'Azul marino', 'Gris', 'Rojo', 'Verde', 'Beige', 'Rosa']

function camposExtra(a = {}) {
  const colores = [...new Set([...estado.articulos.map((x) => x.color).filter(Boolean), ...COLORES_SUGERIDOS])]
  return `
    <label class="campo"><span>Color</span><input id="color" maxlength="40" list="dl-colores" value="${h(a.color ?? '')}" placeholder="Ej. Azul marino" />
      <datalist id="dl-colores">${colores.map((c) => `<option value="${h(c)}"></option>`).join('')}</datalist></label>
    <label class="campo"><span>Género</span><select id="genero"><option value="">—</option>${GENEROS.map((g) => `<option ${g === a.genero ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <label class="campo"><span>Área</span><select id="area"><option value="">—</option>${estado.opciones.areas
      .map((x) => `<option ${x === a.area ? 'selected' : ''}>${h(x)}</option>`)
      .join('')}${a.area && !estado.opciones.areas.includes(a.area) ? `<option selected>${h(a.area)}</option>` : ''}</select></label>
    <label class="campo" style="grid-column:1/-1"><span>Para qué rol <small>(uno o varios, separados por coma)</small></span>
      <input id="rol" maxlength="160" list="dl-roles-art" value="${h(a.rol ?? '')}" placeholder="Ej. Coach Deportivo, Líder Deportivo" />
      <datalist id="dl-roles-art">${estado.opciones.roles.map((r) => `<option value="${h(r)}"></option>`).join('')}</datalist></label>`
}

const leerExtra = (dlg) => ({
  color: dlg.querySelector('#color').value.trim() || null,
  genero: dlg.querySelector('#genero').value || null,
  area: dlg.querySelector('#area').value || null,
  rol: dlg.querySelector('#rol').value.trim().replace(/\s*,\s*/g, ', ').replace(/,\s*$/, '') || null,
})

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
        <label class="campo"><span>Modelo / descripción</span><input id="nombre" maxlength="80" placeholder="Ej. Playera coach" /></label>
        ${camposExtra()}
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
          ...leerExtra(dlg),
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
        <label class="campo"><span>Modelo / descripción</span><input id="nombre" maxlength="80" value="${h(a.nombre ?? '')}" /></label>
        ${camposExtra(a)}
        <label class="campo"><span>Unidad de negocio</span><select id="unidad">${opcionesUnidad(a.unidad || 'Todas')}</select></label>
        <label class="campo"><span>Talla</span><input id="talla" maxlength="20" value="${h(a.talla ?? '')}" placeholder="Sin talla" /></label>
        <label class="campo"><span>Costo por pieza (MXN)</span><input id="costo" type="number" min="0" step="0.01" value="${h(a.costo ?? 0)}" /></label>
        <label class="campo"><span>Inventario deseado</span><input id="deseado" type="number" min="0" step="1" value="${h(a.deseado ?? 0)}" /></label>
        <label class="campo"><span>Proveedor</span><input id="proveedor" maxlength="80" value="${h(a.proveedor ?? '')}" /></label>
      </div>
      ${
        hermanos.length
          ? `<label style="display:flex;gap:8px;align-items:flex-start;font-weight:600"><input type="checkbox" id="todas" checked style="margin-top:4px" />
             <span>Aplicar tipo, modelo, color, género, rol, unidad, costo y proveedor también a las otras ${hermanos.length} talla(s) de este artículo<br><span class="tenue">El deseado y la talla solo cambian en esta.</span></span></label>`
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
          ...leerExtra(dlg),
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

const COLUMNAS_UNIFORMES = ['Categoría', 'Tipo', 'Modelo / descripción', 'Color', 'Género', 'Para qué rol', 'Área', 'Unidad', 'Talla', 'Costo por pieza', 'Real', 'Deseado', 'Proveedor']
const COLUMNAS_GAFETES = ['Nombre del colaborador', 'Sucursal', 'Reposición (cantidad de gafetes)', 'Fecha (opcional)']
const filaDe = (columnas, valores) => Object.fromEntries(columnas.map((c, i) => [c, valores[i] ?? '']))

function exportar() {
  const filas = ordenarArticulos(filtrados()).map((a) => {
    const real = Number(a.real) || 0
    const deseado = Number(a.deseado) || 0
    const costo = Number(a.costo) || 0
    return {
      Categoría: CATEGORIAS[a.categoria],
      Tipo: a.tipo,
      'Modelo / descripción': a.nombre ?? '',
      Color: a.color ?? '',
      Género: a.genero ?? '',
      'Para qué rol': a.rol ?? '',
      Área: a.area ?? '',
      Unidad: a.unidad ?? 'Todas',
      Talla: a.talla ?? '',
      'Costo por pieza': costo,
      Real: real,
      Deseado: deseado,
      Proveedor: a.proveedor ?? '',
      Diferencia: real - deseado,
      'Costo inventario real': Math.max(0, real) * costo,
      'Costo inventario deseado': deseado * costo,
      'Costo para llegar al deseado': Math.max(0, deseado - real) * costo,
      Estado: a.activo === false ? 'Inactivo' : ESTADO_STOCK[estadoStock(a)].texto,
      'ID (no lo cambies)': a.id,
    }
  })
  const porColaborador = gafetesPorColaborador(gafetesRegistrados())
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((x) => ({
      'Nombre del colaborador': x.nombre,
      Sucursal: x.sucursal,
      'Reposición (cantidad de gafetes)': x.total,
      'Nuevo ingreso': x.nuevos,
      Reposiciones: x.reposiciones,
      'Primer gafete': fechaCorta(x.primera),
      'Último gafete': fechaCorta(x.ultima),
      'Costo total': x.costo,
    }))
  const detalle = gafetesRegistrados()
    .sort((a, b) => (fechaMovimiento(b) ?? 0) - (fechaMovimiento(a) ?? 0))
    .map((m) => ({
      Fecha: m.fecha ?? '',
      Colaborador: m.colaborador ?? '',
      Sucursal: m.sucursal ?? '',
      Tipo: m.motivo === 'nuevo' ? 'Nuevo ingreso' : 'Reposición',
      Razón: m.motivo === 'nuevo' ? '' : RAZONES[m.razon] ?? '',
      Gafete: m.articuloNombre ?? '',
      Costo: totalMovimiento(m),
      Inventario: Number(m.delta) ? 'Descontado' : 'Sin descontar',
      Pedido: m.pedidoId ?? '',
    }))
  descargarExcel(`Inventario gafetes y uniformes ${fechaArchivo()}.xlsx`, [
    { nombre: 'Inventario', filas },
    { nombre: 'Gafetes por colaborador', filas: porColaborador },
    { nombre: 'Gafetes (detalle)', filas: detalle },
  ])
}

function descargarPlantilla() {
  descargarExcel('Plantilla inventario gafetes y uniformes.xlsx', [
    {
      nombre: 'Uniformes',
      filas: [
        filaDe(COLUMNAS_UNIFORMES, ['Uniforme', 'Playera', 'Ejemplo playera coach', 'Negro', 'Hombre', 'Coach Deportivo, Líder Deportivo', 'Deportes', 'Vivo 47', 'M', 250, 10, 15, '']),
        filaDe(COLUMNAS_UNIFORMES, ['Uniforme', 'Playera', 'Ejemplo playera coach', 'Negro', 'Mujer', 'Coach Deportivo, Líder Deportivo', 'Deportes', 'Vivo 47', 'CH', 250, 8, 12, '']),
      ],
    },
    {
      nombre: 'Gafetes',
      filas: [
        filaDe(COLUMNAS_GAFETES, ['Ejemplo Ana López', 'Vivo 47 · Valle Real', 1, '']),
        filaDe(COLUMNAS_GAFETES, ['Ejemplo Luis Pérez', 'EasyFit · ITESO', 3, '20/11/2026']),
      ],
    },
    { nombre: 'Sucursales', filas: estado.opciones.sucursales.map((s) => ({ 'Sucursales (copia el nombre tal cual)': s })) },
    { nombre: 'Roles', filas: estado.opciones.roles.map((r) => ({ 'Roles (para la columna Para qué rol)': r })) },
  ])
}

function dialogoImportar() {
  let articulos = []
  let leidos = []
  let resultado = { plan: [], registros: [], alDia: 0, conMas: 0, nuevos: 0, reposiciones: 0, sinFecha: 0, noReconocidas: new Set() }
  const tipos = tiposGafete()
  const hayPorSucursal = tipos.some((a) => a.unidad && a.unidad !== 'Todas')
  abrirDialogo({
    titulo: 'Importar desde Excel',
    ancho: true,
    cuerpo: `
      <ol style="margin:0;padding-left:20px;display:grid;gap:6px">
        <li>Descarga la plantilla. Tiene dos hojas: <b>Uniformes</b> (un renglón por talla: color, género, rol, área, costo, real y deseado) y <b>Gafetes</b> (un renglón por colaborador: nombre, sucursal y cantidad de gafetes).</li>
        <li>Para completar color, género, rol o área de lo que ya tienes, usa <b>Descargar Excel</b>, llena esas columnas y súbelo aquí (la columna ID dice qué artículo es).</li>
        <li>Los renglones que dicen "Ejemplo" se ignoran. Si un colaborador ya tiene gafetes registrados, solo se agregan los que falten.</li>
      </ol>
      <div class="acciones"><button class="btn" type="button" id="plantilla">Descargar plantilla</button></div>
      <label class="campo"><span>Archivo de Excel</span><input id="archivo" type="file" accept=".xlsx,.xls,.csv" /></label>
      <div id="opciones-gafetes" class="oculto" style="display:grid;gap:12px;border:1px solid var(--borde);border-radius:var(--radio);padding:14px;background:#fcfaf6">
        <p class="etiqueta">La columna "Reposición" de los gafetes es:</p>
        <div class="opciones-radio">
          <label class="opcion"><input type="radio" name="g-modo" value="total" checked /><span><b>Total de gafetes del colaborador</b><small>El primero es nuevo ingreso y los demás reposiciones. Ej. 3 = 1 + 2 reposiciones.</small></span></label>
          <label class="opcion"><input type="radio" name="g-modo" value="reposiciones" /><span><b>Solo reposiciones</b><small>Además de su primer gafete. Ej. 3 = 1 + 3 reposiciones.</small></span></label>
        </div>
        <div class="rejilla">
          ${
            tipos.length
              ? `<label class="campo"><span>${hayPorSucursal ? 'Gafete para las sucursales que no tienen uno propio' : 'Tipo de gafete (para el costo)'}</span><select id="g-art">${opcionesGafete(tipos, gafetePorDefecto(tipos))}</select>${
                  hayPorSucursal ? '<small>Las sucursales con gafete propio (columna Unidad) usan el suyo.</small>' : ''
                }</label>`
              : `<label class="campo"><span>Tipo de gafete</span><select id="g-tipo">${opcionesLista(estado.opciones.tiposGafete, estado.opciones.tiposGafete[0], null)}</select></label>
                 <label class="campo"><span>Costo por gafete (MXN) <em>*</em></span><input id="g-costo" type="number" min="0" step="0.01" /></label>`
          }
          <label class="campo"><span>Fecha para renglones sin fecha</span><input id="g-fecha" type="date" value="${isoLocal()}" /><small>Los gafetes que se agreguen de un renglón llevan esa fecha.</small></label>
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="g-descontar" /> Descontar del inventario de gafetes <span class="tenue" style="font-weight:500">(déjalo sin marcar si ya se entregaron)</span></label>
      </div>
      <div id="vista-previa"></div>`,
    pie: '<button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn-primario" type="button" id="importar" disabled>Importar</button>',
    alMontar: (dlg) => {
      const $ = (s) => dlg.querySelector(s)
      $('#plantilla').onclick = descargarPlantilla
      const preparar = () => {
        const fechaPorDefecto = $('#g-fecha').value || isoLocal()
        const modo = dlg.querySelector('input[name="g-modo"]:checked')?.value ?? 'total'
        const filas = leidos.map((f) => leerGafete(f, { catalogo: estado.opciones.sucursales, fechaPorDefecto })).filter(Boolean)
        const existentes = new Map(gafetesPorColaborador(gafetesRegistrados()).map((x) => [llaveColaborador(x.nombre, x.sucursal), { nuevos: x.nuevos, reposiciones: x.reposiciones }]))
        const { plan, alDia, conMas } = planearGafetes(filas, { modo, existentes })
        for (const p of plan) p.articulo = gafeteDeSucursal(p.sucursal, tipos)
        const registros = expandirPlan(plan)
        resultado = {
          plan,
          registros,
          alDia,
          conMas,
          filas: filas.length,
          nuevos: registros.filter((r) => r.motivo === 'nuevo').length,
          reposiciones: registros.filter((r) => r.motivo !== 'nuevo').length,
          sinFecha: plan.filter((p) => p.sinFecha).length,
          noReconocidas: new Set(filas.filter((g) => !g.sucursalReconocida && g.sucursal).map((g) => g.sucursal)),
          fechaPorDefecto,
        }
      }
      const pintar = () => {
        preparar()
        const r = resultado
        const partes = []
        if (articulos.length) {
          const porId = new Set(estado.articulos.map((a) => a.id))
          const existentes = new Set(estado.articulos.map((a) => `${a.grupo}|${a.talla ?? ''}`))
          const sinExtras = (a) => `${claveGrupo({ ...a, color: null, genero: null })}|${a.talla ?? ''}`
          const base = new Set(estado.articulos.filter((a) => !a.color && !a.genero).map(sinExtras))
          const actualizan = articulos.filter((f) => (f.id && porId.has(f.id)) || existentes.has(`${claveGrupo(f)}|${f.talla ?? ''}`) || base.has(sinExtras(f))).length
          partes.push(`<div><b>Uniformes y artículos:</b> ${articulos.length} renglón(es): ${articulos.length - actualizan} nuevos y ${actualizan} se actualizan.</div>`)
        }
        if (leidos.length) {
          partes.push(
            `<div><b>Gafetes:</b> ${r.filas} colaboradores en el archivo. Se agregan <strong>${r.registros.length} gafetes</strong> (${r.nuevos} de nuevo ingreso y ${r.reposiciones} reposiciones)${
              r.alDia ? `; ${r.alDia} colaboradores ya estaban al día` : ''
            }${r.sinFecha ? `; ${r.sinFecha} sin fecha quedan con ${h(fechaCorta(r.fechaPorDefecto))}` : ''}.</div>`,
          )
          if (r.conMas) partes.push(`<div class="tenue">${r.conMas} colaborador(es) tienen más gafetes registrados que en el archivo; no se borra nada.</div>`)
          if (r.noReconocidas.size) partes.push(`<div class="tenue">Sucursales que no están en tu catálogo (se guardan como vienen): ${[...r.noReconocidas].map(h).join(', ')}.</div>`)
        }
        const muestra = r.plan.slice(0, 6)
        $('#vista-previa').innerHTML = partes.length
          ? `<div class="aviso aviso-info"><div style="display:grid;gap:4px">${partes.join('')}</div></div>${
              muestra.length
                ? `<div class="tabla-envoltura" style="margin-top:10px"><table><thead><tr><th>Colaborador</th><th>Sucursal</th><th class="num">En el archivo</th><th class="num">Ya registrados</th><th class="num">Se agregan</th><th>Gafete</th></tr></thead><tbody>${muestra
                    .map(
                      (p) => `<tr><td>${h(p.nombre)}</td><td>${h(p.sucursal)}</td><td class="num">${numero(p.total)}</td><td class="num">${numero(p.previos)}</td><td class="num"><b>${numero(
                        p.agregarNuevos + p.agregarReposiciones,
                      )}</b></td><td>${p.articulo ? h(etiquetaArticulo(p.articulo)) : '<span class="tenue">El elegido arriba</span>'}</td></tr>`,
                    )
                    .join('')}</tbody></table></div>${r.plan.length > muestra.length ? `<p class="tenue" style="margin-top:6px">…y ${r.plan.length - muestra.length} colaboradores más.</p>` : ''}`
                : ''
            }`
          : '<div class="aviso aviso-error"><div>No encontré renglones válidos. La hoja de uniformes necesita Categoría y Tipo; la de gafetes, Nombre del colaborador y Sucursal.</div></div>'
        $('#opciones-gafetes').classList.toggle('oculto', !leidos.length)
        $('#importar').disabled = !articulos.length && !r.registros.length
      }
      $('#archivo').onchange = async (e) => {
        const archivo = e.target.files?.[0]
        if (!archivo) return
        try {
          const XLSX = await cargarXLSX()
          const libro = XLSX.read(await archivo.arrayBuffer())
          articulos = []
          leidos = []
          for (const nombre of libro.SheetNames) {
            if (normalizar(nombre).includes('detalle')) continue
            const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { defval: '' })
            const tipo = tipoHoja(filas)
            if (tipo === 'articulos') articulos.push(...filas.map(leerArticulo).filter(Boolean))
            if (tipo === 'gafetes') leidos.push(...filas)
          }
          pintar()
        } catch (err) {
          console.error(err)
          $('#vista-previa').innerHTML = '<div class="aviso aviso-error"><div>No pude leer el archivo.</div></div>'
        }
      }
      $('#g-fecha').addEventListener('change', () => leidos.length && pintar())
      dlg.addEventListener('change', (e) => {
        if (e.target.name === 'g-modo') pintar()
      })
      $('#importar').onclick = async () => {
        if (resultado.registros.length && !tipos.length && $('#g-costo').value === '') {
          toast('Escribe el costo por gafete', true)
          $('#g-costo').focus()
          return
        }
        $('#importar').disabled = true
        try {
          const hecho = []
          if (articulos.length) {
            const r = await importarArticulos(articulos)
            hecho.push(`${r.creados} artículos nuevos y ${r.actualizados} actualizados`)
          }
          if (resultado.registros.length) {
            const articulo = await asegurarArticuloGafete({ articuloId: $('#g-art')?.value, tipo: $('#g-tipo')?.value, costo: $('#g-costo')?.value })
            await registrarGafetes(resultado.registros, { articulo, descontar: $('#g-descontar').checked, nota: 'Importado de Excel' })
            hecho.push(`${resultado.registros.length} gafetes registrados`)
          }
          toast(`Importado: ${hecho.join(' · ')}`)
          dlg.cerrar()
        } catch (err) {
          console.error(err)
          toast('No se pudo importar', true)
          $('#importar').disabled = false
        }
      }
    },
  })
}
