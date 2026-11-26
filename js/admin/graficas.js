// Gráficas hechas con HTML/CSS (se ven nítidas en celular y computadora) + tooltips al pasar el mouse.
import { h } from '../comun.js'

function maximoBonito(v) {
  if (!(v > 0)) return 1
  const exp = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp
  return 10 * exp
}

// filas: [{ etq, valores: { clave: número }, tip }]; series: [{ clave, nombre, color }]
export function columnas({ filas, series, formato = String, formatoEje = formato, alto = 190, vacio = 'Sin datos todavía' }) {
  const totales = filas.map((f) => series.reduce((s, x) => s + (Number(f.valores[x.clave]) || 0), 0))
  const max = maximoBonito(Math.max(0, ...totales))
  if (!totales.some((t) => t > 0)) return `<div class="vacio" style="padding:30px 10px">${h(vacio)}</div>`
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const iMax = totales.indexOf(Math.max(...totales))
  const leyenda =
    series.length > 1
      ? `<div class="leyenda">${series.map((s) => `<span><i style="background:${s.color}"></i>${h(s.nombre)}</span>`).join('')}</div>`
      : ''
  const bandas = filas
    .map((f, i) => {
      const total = totales[i]
      const segmentos = series
        .map((s) => ({ s, v: Number(f.valores[s.clave]) || 0 }))
        .filter((x) => x.v > 0)
        .map((x) => `<i style="flex:${x.v};background:${x.s.color}"></i>`)
        .join('')
      const tip =
        f.tip ??
        `<b>${h(f.etq)}</b>${series.map((s) => `${h(s.nombre)}: ${h(formato(f.valores[s.clave] || 0))}`).join('<br>')}${
          series.length > 1 ? `<br>Total: ${h(formato(total))}` : ''
        }`
      return `<div class="colg-banda" data-tip="${h(tip)}">
          ${i === iMax && total > 0 ? `<span class="colg-valor">${h(formatoEje(total))}</span>` : ''}
          <div class="colg-pila" style="height:${(total / max) * 100}%">${segmentos}</div>
        </div>`
    })
    .join('')
  return `${leyenda}
    <div class="colg ${filas.length > 6 ? 'muchas' : ''}" style="--alto:${alto}px">
      <div class="colg-y">${ticks.map((t) => `<span style="bottom:${t * 100}%">${h(formatoEje(max * t))}</span>`).join('')}</div>
      <div class="colg-area">
        ${ticks.slice(1).map((t) => `<div class="colg-linea" style="bottom:${t * 100}%"></div>`).join('')}
        <div class="colg-bandas">${bandas}</div>
      </div>
      <div></div>
      <div class="colg-x">${filas.map((f) => `<span>${h(f.etq)}</span>`).join('')}</div>
    </div>`
}

// items: [{ etq, valor, sub }]
export function barrasH(items, { formato = String, color = 'var(--serie-2)', vacio = 'Sin datos todavía', max: limite = 8 } = {}) {
  const lista = items.filter((x) => x.valor > 0).slice(0, limite)
  if (!lista.length) return `<div class="vacio" style="padding:30px 10px">${h(vacio)}</div>`
  const max = Math.max(...lista.map((x) => x.valor))
  return `<div class="barras-h">${lista
    .map(
      (x) => `<div class="barra-h" data-tip="${h(`<b>${h(x.etq)}</b>${h(formato(x.valor))}${x.sub ? `<br>${h(x.sub)}` : ''}`)}">
        <span class="etq" title="${h(x.etq)}">${h(x.etq)}</span>
        <span class="pista"><span class="relleno" style="display:block;width:${(x.valor / max) * 100}%;background:${color}"></span></span>
        <span class="v">${h(formato(x.valor))}</span>
      </div>`,
    )
    .join('')}</div>`
}

let tooltip = null
// Un solo manejador para todo el documento: cualquier elemento con data-tip dentro de .grafica.
export function activarTooltips() {
  if (tooltip) return
  tooltip = document.createElement('div')
  tooltip.className = 'tooltip oculto'
  const mostrar = (e) => {
    const el = e.target.closest?.('[data-tip]')
    const caja = el?.closest('.grafica')
    if (!el || !caja) {
      tooltip.classList.add('oculto')
      return
    }
    if (tooltip.parentElement !== caja) caja.appendChild(tooltip)
    tooltip.innerHTML = el.dataset.tip
    tooltip.classList.remove('oculto')
    const r = caja.getBoundingClientRect()
    const ancho = tooltip.offsetWidth
    const x = Math.min(Math.max(e.clientX - r.left, ancho / 2 + 4), r.width - ancho / 2 - 4)
    tooltip.style.left = `${x}px`
    tooltip.style.top = `${e.clientY - r.top}px`
  }
  document.addEventListener('mousemove', mostrar)
  document.addEventListener('click', mostrar)
  document.addEventListener('scroll', () => tooltip.classList.add('oculto'), { passive: true })
}
