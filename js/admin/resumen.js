// Pestaña Resumen: indicadores de inventario, costos (rotación y reposición) y tiempos de tickets.
import { CATEGORIAS, dinero, dineroCompacto, duracion, h, nombreMes, nombreSucursal, numero, RAZONES } from '../comun.js'
import { estado } from './estado.js'
import { barrasH, columnas } from './graficas.js'
import {
  gastoPorMes,
  metricasPedidos,
  ordenar,
  PERIODOS,
  rangoPeriodo,
  resolucionPorMes,
  resumenEntregas,
  resumenInventario,
  ultimosMeses,
} from './metricas.js'
import { etiquetaArticulo } from './ui.js'

const SERIE_NUEVO = '#2563a8'
const mesCorto = (clave) => nombreMes(clave).split(' ')[0]
const SERIE_REPO = '#b07a22'
let raiz = null
let periodo = (() => {
  try {
    return localStorage.getItem('gu_periodo') || '12m'
  } catch {
    return '12m'
  }
})()

export function montar(el) {
  raiz = el
  el.innerHTML = `
    <div class="filtros" style="justify-content:space-between;align-items:flex-end">
      <div><h1>Resumen</h1><p class="muted">Inventario, entregas, rotación y tiempos de respuesta.</p></div>
      <div class="segmentado" id="periodo" role="group" aria-label="Periodo">
        ${Object.entries(PERIODOS)
          .map(([k, v]) => `<button type="button" data-p="${k}" aria-pressed="${k === periodo}">${h(v)}</button>`)
          .join('')}
      </div>
    </div>
    <div id="contenido"></div>`
  el.querySelector('#periodo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]')
    if (!b) return
    periodo = b.dataset.p
    try {
      localStorage.setItem('gu_periodo', periodo)
    } catch {
      /* nada */
    }
    for (const x of el.querySelectorAll('#periodo button')) x.setAttribute('aria-pressed', String(x.dataset.p === periodo))
    actualizar()
  })
}

function kpi(etq, valor, sub, destacado = false) {
  return `<div class="kpi ${destacado ? 'destacado' : ''}"><div class="etq">${h(etq)}</div><div class="valor">${h(valor)}</div><div class="sub">${sub}</div></div>`
}

function primerosPasos() {
  const link = new URL('./', location.href).href
  return `
    <div class="tarjeta" style="margin-bottom:16px">
      <div class="tarjeta-titulo"><h2>Primeros pasos</h2></div>
      <ol style="margin:0;padding-left:20px;display:grid;gap:8px">
        <li><b>Da de alta tus gafetes y uniformes</b> en <a href="#inventario">Inventario</a>: tipo, tallas, costo por pieza, cuántos tienes (real) y cuántos quieres tener (deseado). También puedes importarlos desde Excel.</li>
        <li><b>Revisa sucursales, áreas y roles</b> en <a href="#ajustes">Ajustes</a>.</li>
        <li><b>Comparte el formulario</b> con los colaboradores: <a href="${h(link)}" target="_blank" rel="noopener">${h(link)}</a></li>
      </ol>
    </div>`
}

export function actualizar() {
  if (!raiz) return
  const c = raiz.querySelector('#contenido')
  const rango = rangoPeriodo(periodo)
  const sla = estado.opciones.slaHoras
  const inv = resumenInventario(estado.articulos)
  const ent = resumenEntregas(estado.movimientos, rango)
  const ped = metricasPedidos(estado.pedidos, { rango, slaHoras: sla })
  const meses = ultimosMeses(12)
  const gm = gastoPorMes(estado.movimientos, meses)
  const rm = resolucionPorMes(estado.pedidos, meses)
  const nuevo = ent.porMotivo.nuevo
  const repo = ent.porMotivo.reposicion
  const resurtir = [...inv.agotados, ...inv.bajoDeseado]
    .map((a) => ({ a, falta: Math.max(0, (Number(a.deseado) || 0) - (Number(a.real) || 0)) }))
    .sort((x, y) => y.falta * (Number(y.a.costo) || 0) - x.falta * (Number(x.a.costo) || 0))
  const nombreP = PERIODOS[periodo].toLowerCase()

  c.innerHTML = `
    ${!estado.articulos.length ? primerosPasos() : ''}
    <div class="kpis">
      ${kpi('Valor del inventario (real)', dinero(inv.valor), `${numero(inv.piezas)} piezas en ${inv.articulos} artículos`, true)}
      ${kpi('Para llegar al deseado', dinero(inv.faltanteCosto), `Faltan ${numero(inv.faltantePiezas)} piezas · ${inv.agotados.length} agotados`)}
      ${kpi('Entregado en el periodo', dinero(ent.costo), `${numero(ent.piezas)} piezas · ${h(nombreP)}`)}
      ${kpi('Rotación (nuevos ingresos)', dinero(nuevo.costo), `${nuevo.personas} personas · ${dinero(ent.costoPorNuevoIngreso)} por persona`)}
      ${kpi('Reposiciones', dinero(repo.costo), `${numero(repo.piezas)} piezas · ${repo.personas} personas`)}
      ${kpi('Pedidos abiertos', String(ped.abiertos), ped.vencidos ? `<span style="color:var(--error);font-weight:700">${ped.vencidos} fuera de tiempo</span> (más de ${h(duracion(sla))})` : `Ninguno fuera de tiempo (${h(duracion(sla))})`)}
      ${kpi('Tiempo promedio de resolución', duracion(ped.promedioResolucion), ped.resueltos ? `Mediana ${h(duracion(ped.medianaResolucion))} · ${Math.round(ped.pctDentroSla)}% a tiempo · ${ped.resueltos} cerrados` : 'Sin pedidos cerrados en el periodo')}
      ${kpi('Primera atención', duracion(ped.promedioAtencion), 'Promedio desde que llega hasta que se toma')}
    </div>

    <div class="graficas">
      <div class="tarjeta grafica">
        <div class="tarjeta-titulo"><h3>Gasto en entregas por mes</h3><p>Últimos 12 meses</p></div>
        ${columnas({
          filas: gm.map((f) => ({ etq: mesCorto(f.mes), valores: { nuevo: f.nuevo, reposicion: f.reposicion }, tip: `<b>${h(nombreMes(f.mes, true))}</b>Nuevo ingreso: ${h(dinero(f.nuevo))}<br>Reposición: ${h(dinero(f.reposicion))}<br>Total: ${h(dinero(f.nuevo + f.reposicion))}` })),
          series: [
            { clave: 'nuevo', nombre: 'Nuevo ingreso', color: SERIE_NUEVO },
            { clave: 'reposicion', nombre: 'Reposición', color: SERIE_REPO },
          ],
          formato: dinero,
          formatoEje: dineroCompacto,
          vacio: 'Aún no hay entregas registradas',
        })}
      </div>
      <div class="tarjeta grafica">
        <div class="tarjeta-titulo"><h3>Reposiciones por razón</h3><p>Costo · ${h(nombreP)}</p></div>
        ${barrasH(
          ordenar(ent.porRazon).map((x) => ({ etq: RAZONES[x.clave] ?? 'Sin razón', valor: x.costo, sub: `${numero(x.piezas)} piezas en ${x.n} entregas` })),
          { formato: dinero, vacio: 'Sin reposiciones en el periodo' },
        )}
      </div>
      <div class="tarjeta grafica">
        <div class="tarjeta-titulo"><h3>Entregas por sucursal</h3><p>Costo · ${h(nombreP)}</p></div>
        ${barrasH(
          ordenar(ent.porSucursal).map((x) => ({ etq: nombreSucursal(x.clave), valor: x.costo, sub: `${numero(x.piezas)} piezas` })),
          { formato: dinero, color: SERIE_NUEVO, vacio: 'Sin entregas en el periodo' },
        )}
      </div>
      <div class="tarjeta grafica">
        <div class="tarjeta-titulo"><h3>Tiempo promedio de resolución</h3><p>Por mes de cierre</p></div>
        ${columnas({
          filas: rm.map((f) => ({
            etq: mesCorto(f.mes),
            valores: { dias: (f.promedio ?? 0) / 24 },
            tip: `<b>${h(nombreMes(f.mes, true))}</b>Promedio: ${h(duracion(f.promedio))}<br>${f.resueltos} cerrados · ${f.recibidos} recibidos`,
          })),
          series: [{ clave: 'dias', nombre: 'Tiempo promedio', color: SERIE_NUEVO }],
          formato: (d) => duracion(d * 24),
          formatoEje: (d) => (d ? `${numero(d)} d` : '0'),
          vacio: 'Aún no hay pedidos cerrados',
        })}
      </div>
      <div class="tarjeta grafica">
        <div class="tarjeta-titulo"><h3>Gafetes vs. uniformes</h3><p>Costo entregado · ${h(nombreP)}</p></div>
        ${barrasH(
          ordenar(ent.porCategoria).map((x) => ({ etq: CATEGORIAS[x.clave] ?? x.clave, valor: x.costo, sub: `${numero(x.piezas)} piezas` })),
          { formato: dinero, vacio: 'Sin entregas en el periodo' },
        )}
      </div>
      <div class="tarjeta grafica">
        <div class="tarjeta-titulo"><h3>Pedidos abiertos por antigüedad</h3><p>Hoy</p></div>
        ${barrasH(
          [
            { etq: 'Menos de 1 día', valor: ped.abiertosPorAntiguedad.menos24 },
            { etq: '1 a 3 días', valor: ped.abiertosPorAntiguedad.de1a3 },
            { etq: '3 a 7 días', valor: ped.abiertosPorAntiguedad.de3a7 },
            { etq: 'Más de 7 días', valor: ped.abiertosPorAntiguedad.mas7 },
          ],
          { formato: (v) => `${v} pedido${v === 1 ? '' : 's'}`, color: SERIE_NUEVO, vacio: 'No hay pedidos abiertos' },
        )}
      </div>
    </div>

    <div class="tarjeta" style="margin-top:16px">
      <div class="tarjeta-titulo"><h3>Por resurtir</h3><p>${resurtir.length} artículo(s) por debajo del inventario deseado</p></div>
      ${
        resurtir.length
          ? `<div class="tabla-envoltura"><table>
              <thead><tr><th>Artículo</th><th class="num">Real</th><th class="num">Deseado</th><th class="num">Faltan</th><th class="num">Costo para completar</th></tr></thead>
              <tbody>${resurtir
                .slice(0, 10)
                .map(
                  ({ a, falta }) => `<tr><td>${h(etiquetaArticulo(a))}</td><td class="num">${numero(a.real)}</td><td class="num">${numero(a.deseado)}</td><td class="num"><b>${numero(falta)}</b></td><td class="num">${dinero(falta * (Number(a.costo) || 0))}</td></tr>`,
                )
                .join('')}</tbody></table></div>
            ${resurtir.length > 10 ? `<p class="tenue" style="margin-top:8px">Y ${resurtir.length - 10} más en <a href="#inventario">Inventario</a>.</p>` : ''}`
          : '<p class="muted">Todo el inventario está en su nivel deseado.</p>'
      }
    </div>`
}
