// Pestaña Presupuesto: proyección de compras con base en el consumo real (nuevos ingresos y reposiciones).
import { CATEGORIAS, dinero, fechaCorta, h, nombreMes, numero } from '../comun.js'
import { estado } from './estado.js'
import { gastoPorMes, proyeccion, ultimosMeses } from './metricas.js'
import { descargarExcel, etiquetaArticulo, fechaArchivo } from './ui.js'

let raiz = null
const leer = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d
  } catch {
    return d
  }
}
const guardar = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* nada */
  }
}
const params = { base: Number(leer('gu_base', 6)), horizonte: Number(leer('gu_horizonte', 6)), ingresos: leer('gu_ingresos', '') }

function segmentado(id, valor, opciones) {
  return `<div class="segmentado" id="${id}" role="group">${opciones
    .map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${Number(k) === valor}">${h(v)}</button>`)
    .join('')}</div>`
}

export function montar(el) {
  raiz = el
  el.innerHTML = `
    <div class="filtros" style="justify-content:space-between">
      <div><h1>Presupuesto</h1><p class="muted">Cuánto comprar y cuánto costará, según lo que de verdad se entrega.</p></div>
      <div class="acciones"><button class="btn" type="button" id="excel">Descargar Excel</button></div>
    </div>
    <div class="filtros">
      <div class="campo"><span>Calcular con el consumo de</span>${segmentado('p-base', params.base, [
        [3, 'Últimos 3 meses'],
        [6, '6 meses'],
        [12, '12 meses'],
      ])}</div>
      <div class="campo"><span>Presupuestar para</span>${segmentado('p-horizonte', params.horizonte, [
        [1, '1 mes'],
        [3, '3 meses'],
        [6, '6 meses'],
        [12, '12 meses'],
      ])}</div>
      <label class="campo"><span>Nuevos ingresos esperados por mes <small>(opcional)</small></span>
        <input id="p-ingresos" type="number" min="0" step="1" placeholder="Ej. 15" value="${h(params.ingresos)}" style="max-width:160px" /></label>
    </div>
    <div id="contenido"></div>`
  for (const [id, campo] of [
    ['p-base', 'base'],
    ['p-horizonte', 'horizonte'],
  ]) {
    el.querySelector(`#${id}`).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]')
      if (!b) return
      params[campo] = Number(b.dataset.v)
      guardar(`gu_${campo}`, params[campo])
      for (const x of el.querySelectorAll(`#${id} button`)) x.setAttribute('aria-pressed', String(Number(x.dataset.v) === params[campo]))
      actualizar()
    })
  }
  el.querySelector('#p-ingresos').addEventListener('input', (e) => {
    params.ingresos = e.target.value
    guardar('gu_ingresos', params.ingresos)
    actualizar()
  })
  el.querySelector('#excel').addEventListener('click', exportar)
}

function calcular() {
  const ingresos = params.ingresos === '' ? null : Math.max(0, Number(params.ingresos) || 0)
  return proyeccion(estado.articulos, estado.movimientos, { mesesBase: params.base, horizonte: params.horizonte, ingresosMes: ingresos })
}

const textoMeses = (n) => `${n} mes${n === 1 ? '' : 'es'}`

export function actualizar() {
  if (!raiz) return
  const c = raiz.querySelector('#contenido')
  if (!estado.articulos.length) {
    c.innerHTML = '<div class="tarjeta vacio"><b>Primero da de alta tu inventario</b>El presupuesto se calcula con el costo, el real y el deseado de cada artículo, más el consumo de las entregas.</div>'
    return
  }
  const p = calcular()
  const t = p.totales
  const H = params.horizonte
  const mesesUsados = Math.round(p.mesesBase * 10) / 10
  const historialCorto = p.mesesBase < params.base - 0.05
  const g = t.porCategoria.gafete ?? { compraCosto: 0, compraPiezas: 0 }
  const u = t.porCategoria.uniforme ?? { compraCosto: 0, compraPiezas: 0 }
  const meses = ultimosMeses(12)
  const gm = gastoPorMes(estado.movimientos, meses)
  const filasCompra = p.filas.filter((f) => f.compra > 0 || f.consumoMes > 0)

  c.innerHTML = `
    ${
      historialCorto
        ? `<div class="aviso aviso-alerta" style="margin-bottom:16px"><div><b>Historial corto:</b> hay movimientos desde el ${h(fechaCorta(p.desde))}, así que el consumo se calcula con ${numero(mesesUsados)} mes(es). La proyección mejora conforme registres entregas.</div></div>`
        : ''
    }
    <div class="kpis">
      <div class="kpi destacado"><div class="etq">Presupuesto sugerido · ${h(textoMeses(H))}</div><div class="valor">${dinero(t.compraCosto)}</div><div class="sub">Comprar ${numero(t.compraPiezas)} piezas</div></div>
      <div class="kpi"><div class="etq">Gafetes</div><div class="valor">${dinero(g.compraCosto)}</div><div class="sub">${numero(g.compraPiezas)} piezas</div></div>
      <div class="kpi"><div class="etq">Uniformes</div><div class="valor">${dinero(u.compraCosto)}</div><div class="sub">${numero(u.compraPiezas)} piezas</div></div>
      <div class="kpi"><div class="etq">Para llegar al deseado hoy</div><div class="valor">${dinero(t.faltanteCosto)}</div><div class="sub">Lo que falta sin contar consumo</div></div>
      <div class="kpi"><div class="etq">Rotación proyectada (nuevos ingresos)</div><div class="valor">${dinero(t.proyNuevoCosto)}</div><div class="sub">${numero(p.nuevosPorMes)} ingresos/mes · ${dinero(p.kitNuevoIngreso)} por persona</div></div>
      <div class="kpi"><div class="etq">Reposiciones proyectadas</div><div class="valor">${dinero(t.proyReposicionCosto)}</div><div class="sub">Extravío, desgaste, mal estado…</div></div>
    </div>
    ${
      p.escenario
        ? `<div class="aviso aviso-info" style="margin-bottom:16px"><div><b>Escenario: ${numero(p.escenario.ingresosMes)} nuevos ingresos al mes.</b>
            Con un kit promedio de ${dinero(p.kitNuevoIngreso)} por persona, la rotación costaría <b>${dinero(p.escenario.costo)}</b> en ${h(textoMeses(H))}
            (${p.escenario.diferencia >= 0 ? `${dinero(p.escenario.diferencia)} más` : `${dinero(-p.escenario.diferencia)} menos`} que lo proyectado con el historial).
            ${p.kitNuevoIngreso ? '' : 'Aún no hay entregas de nuevo ingreso para calcular el kit promedio.'}</div></div>`
        : ''
    }
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h3>Compra sugerida por artículo</h3><p>Consumo de ${numero(mesesUsados)} mes(es) · horizonte ${h(textoMeses(H))}</p></div>
      ${
        filasCompra.length
          ? `<div class="tabla-envoltura"><table>
        <thead><tr><th>Artículo</th><th class="num">Real</th><th class="num">Deseado</th><th class="num">Consumo / mes</th><th class="num">Uso en ${h(textoMeses(H))}</th><th class="num">Comprar</th><th class="num">Costo pieza</th><th class="num">Costo compra</th></tr></thead>
        <tbody>${filasCompra
          .map(
            (f) => `<tr>
            <td>${h(etiquetaArticulo(f.articulo))}<br><span class="tenue">${h(CATEGORIAS[f.articulo.categoria])}</span></td>
            <td class="num">${numero(f.articulo.real)}</td>
            <td class="num">${numero(f.articulo.deseado)}</td>
            <td class="num" title="Nuevo ingreso ${numero(f.mesNuevo)} · Reposición ${numero(f.mesReposicion)}">${numero(f.consumoMes)}</td>
            <td class="num">${numero(f.proyectado)}</td>
            <td class="num"><b>${numero(f.compra)}</b></td>
            <td class="num">${dinero(f.articulo.costo)}</td>
            <td class="num"><b>${dinero(f.costoCompra)}</b></td>
          </tr>`,
          )
          .join('')}</tbody>
        <tfoot><tr><td>Total</td><td colspan="4"></td><td class="num">${numero(t.compraPiezas)}</td><td></td><td class="num">${dinero(t.compraCosto)}</td></tr></tfoot>
      </table></div>`
          : '<p class="muted">No hace falta comprar nada: el inventario cubre lo deseado y no hay consumo registrado.</p>'
      }
      <details style="margin-top:12px"><summary class="tenue" style="cursor:pointer">¿Cómo se calcula?</summary>
        <ul class="muted" style="font-size:.9rem;margin:8px 0 0">
          <li><b>Consumo / mes</b> = piezas entregadas de ese artículo en el periodo elegido ÷ meses del periodo.</li>
          <li><b>Comprar</b> = deseado − real + consumo / mes × meses a presupuestar (nunca menos de 0). Así terminas el periodo con tu inventario deseado.</li>
          <li><b>Rotación</b> = lo que cuestan las entregas por nuevo ingreso. El kit promedio es ese costo ÷ número de personas nuevas.</li>
        </ul>
      </details>
    </div>
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h3>Gasto real por mes</h3><p>Últimos 12 meses</p></div>
      <div class="tabla-envoltura"><table>
        <thead><tr><th>Mes</th><th class="num">Nuevo ingreso</th><th class="num">Reposición</th><th class="num">Gafetes</th><th class="num">Uniformes</th><th class="num">Total entregado</th><th class="num">Compras</th></tr></thead>
        <tbody>${gm
          .map(
            (f) => `<tr><td>${h(nombreMes(f.mes, true))}</td><td class="num">${dinero(f.nuevo)}</td><td class="num">${dinero(f.reposicion)}</td><td class="num">${dinero(f.gafete)}</td><td class="num">${dinero(f.uniforme)}</td><td class="num"><b>${dinero(f.nuevo + f.reposicion)}</b></td><td class="num">${dinero(f.compras)}</td></tr>`,
          )
          .join('')}</tbody>
        <tfoot><tr><td>Total</td>${['nuevo', 'reposicion', 'gafete', 'uniforme']
          .map((k) => `<td class="num">${dinero(gm.reduce((s, f) => s + f[k], 0))}</td>`)
          .join('')}<td class="num">${dinero(gm.reduce((s, f) => s + f.nuevo + f.reposicion, 0))}</td><td class="num">${dinero(gm.reduce((s, f) => s + f.compras, 0))}</td></tr></tfoot>
      </table></div>
    </div>`
}

function exportar() {
  if (!estado.articulos.length) return
  const p = calcular()
  const compra = p.filas.map((f) => ({
    Categoría: CATEGORIAS[f.articulo.categoria],
    Artículo: etiquetaArticulo(f.articulo),
    Real: Number(f.articulo.real) || 0,
    Deseado: Number(f.articulo.deseado) || 0,
    'Consumo/mes nuevo ingreso': Math.round(f.mesNuevo * 100) / 100,
    'Consumo/mes reposición': Math.round(f.mesReposicion * 100) / 100,
    [`Uso en ${params.horizonte} meses`]: Math.round(f.proyectado * 10) / 10,
    'Piezas a comprar': f.compra,
    'Costo por pieza': Number(f.articulo.costo) || 0,
    'Costo de compra': f.costoCompra,
  }))
  const t = p.totales
  const resumen = [
    { Concepto: 'Presupuesto sugerido', Valor: t.compraCosto },
    { Concepto: 'Gafetes', Valor: t.porCategoria.gafete?.compraCosto ?? 0 },
    { Concepto: 'Uniformes', Valor: t.porCategoria.uniforme?.compraCosto ?? 0 },
    { Concepto: 'Para llegar al deseado hoy', Valor: t.faltanteCosto },
    { Concepto: 'Rotación proyectada (nuevos ingresos)', Valor: t.proyNuevoCosto },
    { Concepto: 'Reposiciones proyectadas', Valor: t.proyReposicionCosto },
    { Concepto: 'Kit promedio por nuevo ingreso', Valor: p.kitNuevoIngreso },
    { Concepto: 'Meses a presupuestar', Valor: params.horizonte },
    { Concepto: 'Meses de historial usados', Valor: Math.round(p.mesesBase * 10) / 10 },
  ]
  const gm = gastoPorMes(estado.movimientos, ultimosMeses(12)).map((f) => ({
    Mes: nombreMes(f.mes, true),
    'Nuevo ingreso': f.nuevo,
    Reposición: f.reposicion,
    Gafetes: f.gafete,
    Uniformes: f.uniforme,
    'Total entregado': f.nuevo + f.reposicion,
    Compras: f.compras,
  }))
  descargarExcel(`Presupuesto gafetes y uniformes ${fechaArchivo()}.xlsx`, [
    { nombre: 'Resumen', filas: resumen },
    { nombre: 'Compra sugerida', filas: compra },
    { nombre: 'Gasto por mes', filas: gm },
  ])
}
