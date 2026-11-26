// Portal del colaborador: hacer un pedido de gafete/uniforme y consultar su estado.
import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  mensajeError,
  query,
  serverTimestamp,
  sesion,
  setDoc,
  where,
} from './firebase.js'
import {
  aFecha,
  duracion,
  ESTADOS,
  fechaCorta,
  fechaHora,
  h,
  isoLocal,
  MOTIVOS,
  nombreSucursal,
  normalizar,
  nuevoFolio,
  opcionesCompletas,
  ordenTalla,
  RAZONES,
  slug,
  textoRazon,
  unidadDe,
  unidades,
} from './comun.js'

const app = document.getElementById('app')
const nav = document.getElementById('nav')
let opciones = opcionesCompletas(null)
let usuario = null

const MIS_DATOS = 'gu_mis_datos_v1'
const MIS_FOLIOS = 'gu_mis_folios_v1'

function leerLocal(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave)
    return v ? JSON.parse(v) : porDefecto
  } catch {
    return porDefecto
  }
}
function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

let temporizadorToast
function toast(texto, error = false) {
  const t = document.getElementById('toast')
  t.textContent = texto
  t.classList.toggle('error', error)
  t.classList.add('visible')
  clearTimeout(temporizadorToast)
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), 3200)
}

function marcarNav(vista) {
  for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.vista === vista))
}

nav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-vista]')
  if (!b) return
  if (b.dataset.vista === 'pedido') mostrarFormulario()
  else mostrarConsulta()
})

// ---------- Artículos que se pueden pedir ----------

// Artículos que aplican a la sucursal: los de "Todas", los de su unidad (Vivo 47, EasyFit…) o los marcados con la sucursal.
function gruposDisponibles(sucursal) {
  const unidad = unidadDe(sucursal)
  const corto = normalizar(String(sucursal ?? '').split(' · ').slice(1).join(' · '))
  const aplica = (g) => !sucursal || !g.unidad || g.unidad === 'Todas' || g.unidad === unidad || normalizar(g.unidad) === corto || g.unidad === sucursal
  let grupos = opciones.grupos.filter(aplica)
  if (opciones.grupos.length && !grupos.some((g) => g.categoria === 'gafete')) {
    grupos = [{ id: 'tipo-gafete', categoria: 'gafete', tipo: 'Gafete', nombre: '', tallas: [] }, ...grupos]
  }
  if (!opciones.grupos.length) {
    grupos = [
      ...opciones.tiposGafete.map((t) => ({ id: `tipo-${slug('gafete ' + t)}`, categoria: 'gafete', tipo: t, nombre: '', tallas: [] })),
      ...opciones.tiposUniforme.map((t) => ({ id: `tipo-${slug('uniforme ' + t)}`, categoria: 'uniforme', tipo: t, nombre: '', tallas: opciones.tallas })),
    ]
  }
  return grupos
}

const etiquetaGrupo = (g) => [g.tipo, g.nombre && g.nombre !== g.tipo ? g.nombre : null].filter(Boolean).join(' · ')

function htmlArticulos(sucursal) {
  const grupos = gruposDisponibles(sucursal)
  if (!grupos.length) return '<p class="muted">Todavía no hay artículos configurados para tu unidad. Escribe lo que necesitas en comentarios.</p>'
  let html = ''
  for (const cat of ['gafete', 'uniforme']) {
    const deCat = grupos.filter((g) => g.categoria === cat)
    if (!deCat.length) continue
    html += `<p class="grupo-titulo">${cat === 'gafete' ? 'Gafete' : 'Uniforme'}</p>`
    for (const g of deCat) {
      const tallas = [...(g.tallas ?? [])].sort((a, b) => ordenTalla(a) - ordenTalla(b))
      html += `
        <div class="articulo-pedido">
          <label class="articulo-check">
            <input type="checkbox" name="art" value="${h(g.id)}" />
            <span class="nombre">${h(etiquetaGrupo(g))}</span>
            ${g.unidad && g.unidad !== 'Todas' ? `<span class="tenue">${h(g.unidad)}</span>` : ''}
          </label>
          <div class="extra">
            ${
              tallas.length
                ? `<label>Talla <select name="talla-${h(g.id)}"><option value="">Elige…</option>${tallas
                    .map((t) => `<option>${h(t)}</option>`)
                    .join('')}</select></label>`
                : ''
            }
            <label>Cantidad <select name="cant-${h(g.id)}">${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}</select></label>
          </div>
        </div>`
    }
  }
  return html
}

function opcionesSucursal(seleccion) {
  let html = '<option value="">Elige tu sucursal…</option>'
  for (const u of unidades(opciones.sucursales)) {
    html += `<optgroup label="${h(u)}">`
    for (const s of opciones.sucursales.filter((x) => unidadDe(x) === u)) {
      html += `<option value="${h(s)}" ${s === seleccion ? 'selected' : ''}>${h(s.includes(' · ') ? s.split(' · ').slice(1).join(' · ') : s)}</option>`
    }
    html += '</optgroup>'
  }
  return html
}

// ---------- Formulario ----------

function mostrarFormulario() {
  marcarNav('pedido')
  const datos = leerLocal(MIS_DATOS, {})
  const hoy = isoLocal()
  app.innerHTML = `
    <section style="margin-bottom:18px">
      <h1>Pide tu gafete o uniforme</h1>
      <p class="muted" style="margin-top:6px">Llena tus datos y elige lo que necesitas. Al enviar recibes un folio para seguir tu pedido.
      Tiempo estimado de respuesta: <b>${h(duracion(opciones.slaHoras))}</b>.</p>
    </section>
    <form id="form" novalidate>
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h2><span class="seccion-num">1</span>Datos del colaborador</h2></div>
        <div class="rejilla-2">
          <label class="campo" style="grid-column:1/-1"><span>Nombre completo <em>*</em></span>
            <input name="nombre" autocomplete="name" maxlength="120" value="${h(datos.nombre)}" placeholder="Nombre y apellidos" /></label>
          <label class="campo"><span>Fecha <em>*</em></span>
            <input name="fecha" type="date" value="${hoy}" max="${hoy}" /></label>
          <label class="campo"><span>Sucursal <em>*</em></span>
            <select name="sucursal">${opcionesSucursal(datos.sucursal)}</select></label>
          <label class="campo"><span>Rol / puesto <em>*</em></span>
            <input name="rol" list="lista-roles" maxlength="120" value="${h(datos.rol)}" placeholder="Ej. Coach Deportivo" />
            <datalist id="lista-roles">${opciones.roles.map((r) => `<option value="${h(r)}"></option>`).join('')}</datalist></label>
          <label class="campo"><span>Área <em>*</em></span>
            <select name="area"><option value="">Elige tu área…</option>${opciones.areas
              .map((a) => `<option ${a === datos.area ? 'selected' : ''}>${h(a)}</option>`)
              .join('')}</select></label>
        </div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-titulo"><h2><span class="seccion-num">2</span>Tipo de solicitud</h2></div>
        <div class="opciones-radio" role="radiogroup">
          <label class="opcion"><input type="radio" name="tipo" value="nuevo" />
            <span><b>Nuevo ingreso</b><small>Es mi primer gafete o uniforme</small></span></label>
          <label class="opcion"><input type="radio" name="tipo" value="reposicion" />
            <span><b>Reposición</b><small>Ya tenía y necesito uno nuevo</small></span></label>
        </div>
        <div id="bloque-razon" class="oculto" style="margin-top:16px">
          <p class="etiqueta" style="margin-bottom:8px">¿Por qué necesitas reposición? <em>*</em></p>
          <div class="chips-radio">
            ${Object.entries(RAZONES)
              .map(([k, v]) => `<label><input type="radio" name="razon" value="${k}" />${h(v)}</label>`)
              .join('')}
          </div>
          <label class="campo" style="margin-top:12px"><span id="etq-detalle">Cuéntanos más (opcional)</span>
            <textarea name="detalleRazon" maxlength="600" rows="2" placeholder="Ej. Se rompió el broche, la playera está deslavada…"></textarea></label>
        </div>
        <div style="margin-top:18px">
          <p class="etiqueta" style="margin-bottom:8px">¿Quién lo solicita?</p>
          <div class="chips-radio">
            <label><input type="radio" name="quien" value="yo" checked />Yo mismo</label>
            <label><input type="radio" name="quien" value="otro" />Lo pido para alguien de mi equipo</label>
          </div>
          <label class="campo oculto" id="bloque-solicitante" style="margin-top:12px"><span>Nombre de quien solicita <em>*</em></span>
            <input name="solicitadoPor" maxlength="120" placeholder="Ej. tu nombre como gerente o líder" /></label>
        </div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-titulo"><h2><span class="seccion-num">3</span>¿Qué necesitas?</h2><p>Marca uno o varios</p></div>
        <div class="lista-articulos" id="articulos">${htmlArticulos(datos.sucursal)}</div>
        <label class="campo" style="margin-top:16px"><span>Comentarios (opcional)</span>
          <textarea name="comentarios" maxlength="600" rows="2" placeholder="Algo más que debamos saber"></textarea></label>
      </div>

      <div id="errores" class="aviso aviso-error oculto" style="margin-top:16px" role="alert"></div>
      <div style="margin-top:16px">
        <button class="btn btn-primario btn-bloque" type="submit" id="enviar">Enviar pedido</button>
        <p class="tenue" style="text-align:center;margin-top:10px">Tus datos se usan solo para atender este pedido.</p>
      </div>
    </form>`

  const form = document.getElementById('form')
  form.addEventListener('change', (e) => {
    const n = e.target.name
    if (n === 'tipo' || n === 'razon') {
      const repo = form.tipo.value === 'reposicion'
      document.getElementById('bloque-razon').classList.toggle('oculto', !repo)
      document.getElementById('etq-detalle').innerHTML =
        form.razon.value === 'otra' ? 'Cuéntanos qué pasó <em>*</em>' : 'Cuéntanos más (opcional)'
    }
    if (n === 'quien') document.getElementById('bloque-solicitante').classList.toggle('oculto', form.quien.value !== 'otro')
    if (n === 'sucursal') {
      const marcados = new Set([...form.querySelectorAll('input[name="art"]:checked')].map((i) => i.value))
      document.getElementById('articulos').innerHTML = htmlArticulos(form.sucursal.value)
      for (const i of form.querySelectorAll('input[name="art"]')) i.checked = marcados.has(i.value)
    }
    e.target.classList.remove('invalido')
  })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    enviar(form)
  })
}

function leerFormulario(form) {
  const v = (n) => (form.elements[n]?.value ?? '').trim()
  const errores = []
  const malos = []
  const nombre = v('nombre').replace(/\s+/g, ' ')
  if (nombre.length < 3) {
    errores.push('Escribe tu nombre completo.')
    malos.push('nombre')
  }
  const fecha = v('fecha')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    errores.push('Elige la fecha.')
    malos.push('fecha')
  }
  const sucursal = v('sucursal')
  if (!sucursal) {
    errores.push('Elige tu sucursal.')
    malos.push('sucursal')
  }
  const rol = v('rol')
  if (rol.length < 2) {
    errores.push('Escribe tu rol o puesto.')
    malos.push('rol')
  }
  const area = v('area')
  if (!area) {
    errores.push('Elige tu área.')
    malos.push('area')
  }
  const tipo = form.tipo.value
  if (!tipo) errores.push('Elige si es nuevo ingreso o reposición.')
  const razon = tipo === 'reposicion' ? form.razon.value : null
  const detalle = v('detalleRazon')
  if (tipo === 'reposicion' && !razon) errores.push('Elige la razón de la reposición.')
  if (razon === 'otra' && detalle.length < 3) {
    errores.push('Cuéntanos qué pasó.')
    malos.push('detalleRazon')
  }
  const paraOtro = form.quien.value === 'otro'
  const solicitadoPor = paraOtro ? v('solicitadoPor') : ''
  if (paraOtro && solicitadoPor.length < 3) {
    errores.push('Escribe el nombre de quien solicita.')
    malos.push('solicitadoPor')
  }
  const grupos = gruposDisponibles(sucursal)
  const articulos = []
  for (const i of form.querySelectorAll('input[name="art"]:checked')) {
    const g = grupos.find((x) => x.id === i.value)
    if (!g) continue
    const talla = form.elements[`talla-${g.id}`]?.value ?? ''
    if ((g.tallas ?? []).length && !talla) {
      errores.push(`Elige la talla de ${etiquetaGrupo(g)}.`)
      form.elements[`talla-${g.id}`]?.classList.add('invalido')
    }
    articulos.push({
      grupo: g.id,
      categoria: g.categoria,
      tipo: g.tipo,
      nombre: g.nombre || '',
      descripcion: etiquetaGrupo(g),
      talla: talla || null,
      cantidad: Number(form.elements[`cant-${g.id}`]?.value) || 1,
    })
  }
  if (!articulos.length) errores.push('Marca al menos un artículo.')
  for (const n of malos) form.elements[n]?.classList.add('invalido')
  return {
    errores,
    datos: {
      nombre,
      solicitadoPor: solicitadoPor || null,
      fecha,
      unidad: unidadDe(sucursal),
      sucursal,
      rol,
      area,
      tipoSolicitud: tipo,
      razon,
      detalleRazon: detalle || null,
      articulos,
      comentarios: v('comentarios') || null,
    },
  }
}

async function enviar(form) {
  const cajaErrores = document.getElementById('errores')
  const { errores, datos } = leerFormulario(form)
  if (errores.length) {
    cajaErrores.innerHTML = `<div><b>Revisa estos puntos:</b>${errores.map((e) => `<div>• ${h(e)}</div>`).join('')}</div>`
    cajaErrores.classList.remove('oculto')
    cajaErrores.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  cajaErrores.classList.add('oculto')
  const boton = document.getElementById('enviar')
  boton.disabled = true
  boton.textContent = 'Enviando…'
  try {
    usuario = await sesion()
    let folio = null
    let ultimoError = null
    for (let intento = 0; intento < 4 && !folio; intento++) {
      const candidato = nuevoFolio()
      try {
        await setDoc(doc(db, 'pedidos', candidato), {
          ...datos,
          folio: candidato,
          uid: usuario.uid,
          estado: 'nuevo',
          creadoEn: serverTimestamp(),
        })
        folio = candidato
      } catch (e) {
        ultimoError = e
        if (!String(e?.code).includes('permission-denied')) break
      }
    }
    if (!folio) throw ultimoError
    guardarLocal(MIS_DATOS, { nombre: datos.solicitadoPor ? '' : datos.nombre, sucursal: datos.sucursal, rol: datos.solicitadoPor ? '' : datos.rol, area: datos.area })
    const folios = leerLocal(MIS_FOLIOS, [])
    guardarLocal(MIS_FOLIOS, [folio, ...folios.filter((f) => f !== folio)].slice(0, 30))
    mostrarExito(folio, datos)
  } catch (e) {
    console.error(e)
    cajaErrores.innerHTML = `<div><b>No se pudo enviar.</b> ${h(mensajeError(e))}</div>`
    cajaErrores.classList.remove('oculto')
    boton.disabled = false
    boton.textContent = 'Enviar pedido'
  }
}

function mostrarExito(folio, datos) {
  window.scrollTo({ top: 0 })
  app.innerHTML = `
    <div class="tarjeta" style="text-align:center">
      <h1>¡Pedido enviado!</h1>
      <p class="muted" style="margin-top:6px">Guarda tu folio (toma captura). Con él puedes ver en qué va tu pedido.</p>
      <div class="folio-grande">${h(folio)}</div>
      <p class="muted">${h(datos.nombre)} · ${h(MOTIVOS[datos.tipoSolicitud])} · ${datos.articulos.length} artículo(s)</p>
      <p class="tenue" style="margin-top:6px">Tiempo estimado de respuesta: ${h(duracion(opciones.slaHoras))}</p>
      <div class="acciones" style="justify-content:center;margin-top:18px">
        <button class="btn" type="button" id="copiar">Copiar folio</button>
        <button class="btn btn-primario" type="button" id="ver">Ver estado</button>
        <button class="btn btn-texto" type="button" id="otro">Hacer otro pedido</button>
      </div>
    </div>`
  document.getElementById('copiar').onclick = async () => {
    try {
      await navigator.clipboard.writeText(folio)
      toast('Folio copiado')
    } catch {
      toast('No se pudo copiar; anótalo o toma captura', true)
    }
  }
  document.getElementById('ver').onclick = () => mostrarConsulta(folio)
  document.getElementById('otro').onclick = () => mostrarFormulario()
}

// ---------- Consulta ----------

function htmlPedido(p) {
  const e = ESTADOS[p.estado] ?? ESTADOS.nuevo
  const rechazado = p.estado === 'rechazado'
  const pasos = ['Recibido', 'En proceso', 'Listo para entregar', rechazado ? 'No procede' : 'Entregado']
  return `
    <article class="tarjeta">
      <div class="tarjeta-titulo">
        <h3>Folio ${h(p.folio)}</h3>
        <span class="badge tono-${e.tono}">${h(e.texto)}</span>
      </div>
      <p class="muted">${h(p.nombre)} · ${h(MOTIVOS[p.tipoSolicitud] ?? '')}${p.tipoSolicitud === 'reposicion' ? ` (${h(textoRazon(p))})` : ''}</p>
      <p class="tenue">${h(nombreSucursal(p.sucursal))} · pedido del ${h(fechaCorta(p.fecha))}</p>
      <div class="pasos">${pasos
        .map((t, i) => {
          const hecho = rechazado ? i === 0 || i === 3 : i < e.paso
          return `<div class="paso ${hecho ? 'hecho' : ''} ${rechazado && i === 3 ? 'rechazo' : ''}"><i></i>${h(t)}</div>`
        })
        .join('')}</div>
      <ul style="margin:12px 0 0;padding-left:18px">
        ${(p.articulos ?? [])
          .map((a) => `<li>${h(a.descripcion ?? a.tipo)}${a.talla ? ` · talla ${h(a.talla)}` : ''} × ${h(a.cantidad)}</li>`)
          .join('')}
      </ul>
      ${p.mensaje ? `<div class="aviso aviso-info" style="margin-top:12px"><div><b>Mensaje de Capital Humano</b>${h(p.mensaje)}</div></div>` : ''}
      <p class="tenue" style="margin-top:10px">Enviado ${h(fechaHora(p.creadoEn))}${
        p.resueltoEn ? ` · Cerrado ${h(fechaHora(p.resueltoEn))}` : ''
      }</p>
    </article>`
}

async function mostrarConsulta(folioBuscado = null) {
  marcarNav('consulta')
  app.innerHTML = `
    <section style="margin-bottom:18px">
      <h1>Mis pedidos</h1>
      <p class="muted" style="margin-top:6px">Aquí ves los pedidos hechos desde este celular o computadora. También puedes buscar uno por folio.</p>
    </section>
    <form class="tarjeta" id="buscar" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
      <label class="campo" style="flex:1 1 200px"><span>Buscar por folio</span>
        <input name="folio" placeholder="GU-XXXXXX" autocapitalize="characters" value="${h(folioBuscado ?? '')}" /></label>
      <button class="btn btn-primario" type="submit">Buscar</button>
    </form>
    <div id="resultado" style="margin-top:16px"><div class="cargando">Buscando tus pedidos…</div></div>`
  document.getElementById('buscar').addEventListener('submit', (e) => {
    e.preventDefault()
    const f = e.target.folio.value.trim().toUpperCase().replace(/\s+/g, '')
    if (f) mostrarConsulta(f.startsWith('GU-') ? f : `GU-${f.replace(/^GU/, '')}`)
  })
  const resultado = document.getElementById('resultado')
  try {
    usuario = await sesion()
    const pedidos = new Map()
    if (folioBuscado) {
      const s = await getDoc(doc(db, 'pedidos', folioBuscado)).catch(() => null)
      if (!s?.exists()) {
        resultado.innerHTML = `<div class="aviso aviso-alerta"><div><b>No encontramos el folio ${h(folioBuscado)}.</b> Revisa que esté bien escrito.</div></div>`
        return
      }
      pedidos.set(s.id, s.data())
    } else {
      const snap = await getDocs(query(collection(db, 'pedidos'), where('uid', '==', usuario.uid)))
      snap.forEach((d) => pedidos.set(d.id, d.data()))
      const faltan = leerLocal(MIS_FOLIOS, []).filter((f) => !pedidos.has(f)).slice(0, 10)
      const extra = await Promise.all(faltan.map((f) => getDoc(doc(db, 'pedidos', f)).catch(() => null)))
      extra.forEach((s) => s?.exists() && pedidos.set(s.id, s.data()))
    }
    const lista = [...pedidos.values()].sort((a, b) => (aFecha(b.creadoEn) ?? 0) - (aFecha(a.creadoEn) ?? 0))
    resultado.innerHTML = lista.length
      ? lista.map(htmlPedido).join('')
      : `<div class="tarjeta vacio"><b>Aún no tienes pedidos</b>Cuando hagas uno, aparecerá aquí.<div style="margin-top:14px"><button class="btn btn-primario" type="button" id="ir">Hacer pedido</button></div></div>`
    document.getElementById('ir')?.addEventListener('click', () => mostrarFormulario())
  } catch (e) {
    console.error(e)
    resultado.innerHTML = `<div class="aviso aviso-error"><div><b>No se pudo consultar.</b> ${h(mensajeError(e))}</div></div>`
  }
}

// ---------- Inicio ----------

async function iniciar() {
  try {
    const conLimite = (promesa, ms) => Promise.race([promesa, new Promise((r) => setTimeout(() => r(null), ms))])
    const [u, snap] = await Promise.all([sesion(), conLimite(getDoc(doc(db, 'publico', 'opciones')).catch(() => null), 8000)])
    usuario = u
    if (snap?.exists()) opciones = opcionesCompletas(snap.data())
  } catch (e) {
    console.error(e)
    app.innerHTML = `<div class="aviso aviso-error"><div><b>No se pudo cargar la página.</b> ${h(mensajeError(e))}</div></div>`
    return
  }
  const folio = new URLSearchParams(location.search).get('folio')
  if (folio) mostrarConsulta(folio.toUpperCase())
  else mostrarFormulario()
}

iniciar()
