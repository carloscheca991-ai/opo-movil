// Oposición · app del móvil. Gemela del addon de WoW: mismas reglas, mismos
// temas (datos/tema_NN.json, generados por movil/generar.js) y mismos modos.
// El progreso se guarda en este navegador (localStorage), con la hora de cada
// respuesta para poder cruzarlo después con el del juego.
'use strict';

const VERSION = '0.6.0';
const NIVEL_BASE = 20, NIVEL_MAX = 90;   // cada tema (21 a 90) da un nivel
const XP_NORMAL = 10, XP_DIFICIL = 20;
const UMBRAL = 0.9;                       // parte de la experiencia del tema que da el nivel
const ACERTADA = 1, FALLADA = 2;
const LETRAS = ['A', 'B', 'C', 'D'];
const MODOS = [['lectura', 'Lectura'], ['intercalado', 'Intercalado'], ['test', 'Solo test']];
const CLAVE = 'opo.movil.v1';

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

const $ = id => document.getElementById(id);

// Crea un elemento: el('button', { class: 'boton', onclick: f }, 'Texto')
function el(tag, attrs, ...hijos) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'onclick') e.addEventListener('click', v);
    else if (k === 'disabled') e.disabled = true;
    else e.setAttribute(k, v);
  }
  for (const h of hijos.flat(Infinity)) {
    if (h == null || h === false) continue;
    e.append(h.nodeType ? h : document.createTextNode(String(h)));
  }
  return e;
}

const tinta = (clase, texto) => el('span', { class: clase }, texto);
const miles = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const ahora = () => Math.floor(Date.now() / 1000);

function barajar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

// ---------------------------------------------------------------------
// Progreso guardado
// ---------------------------------------------------------------------

function dbVacia() {
  return {
    v: 1,
    est: {},      // [id de pregunta] = 1 acertada, 2 fallada
    cuando: {},   // [id] = hora (segundos) de la última respuesta o del borrado
    hecho: {},    // [tema] = true cuando ya ha dado su nivel
    fallos: {},   // [id] = veces fallada
    leer: {},     // [tema] = { ap, k }: por dónde se va en solo lectura
    n: { ok: 0, ko: 0 },
    ui: {},       // tema, modo, página y letra
  };
}

function leerDB() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (d && typeof d === 'object') {
      const base = dbVacia();
      for (const k in base) if (d[k] == null || typeof d[k] !== typeof base[k]) d[k] = base[k];
      return d;
    }
  } catch (e) { /* se empieza de cero */ }
  return dbVacia();
}

let db = leerDB();
let porGuardar = null;

function guardarYa() {
  clearTimeout(porGuardar);
  porGuardar = null;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db));
  } catch (e) {
    console.error('No se ha podido guardar el progreso', e);
  }
}
function guardar() {
  if (!porGuardar) porGuardar = setTimeout(guardarYa, 300);
}
window.addEventListener('pagehide', guardarYa);
document.addEventListener('visibilitychange', () => { if (document.hidden) guardarYa(); });

// Cambia el estado de una pregunta y apunta cuándo. Estado 0 = sin contestar.
function marcar(id, estado) {
  if (estado) db.est[id] = estado;
  else delete db.est[id];
  // Siempre posterior a la marca anterior, para que un borrado hecho en el
  // mismo segundo que la respuesta no pierda contra ella al cruzar.
  db.cuando[id] = Math.max(ahora(), (db.cuando[id] || 0) + 1);
  porSubir();
}

// ---------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------

let indice = null;      // { v, temas: [{ n, corto, bloque, np, nd, par }] }
const temas = {};       // temas ya cargados

const TIPOS = { T: 'titulo', F: 'frase', I: 'item', P: 'par', D: 'detalle' };

function piezas(lista) {
  return lista.map(p => {
    const tipo = TIPOS[p[0]] || 'frase';
    if (tipo === 'par') return { tipo, clave: p[1], html: p[2], nivel: p[3] || 1 };
    if (tipo === 'item') return { tipo, html: p[1], nivel: p[2] || 1, marca: p[3] };
    if (tipo === 'titulo') return { tipo, texto: p[1], nivel: 1 };
    return { tipo, html: p[1], nivel: 1 };
  });
}

// Convierte los datos compactos de un tema en objetos enlazados entre sí.
function registrar(d) {
  const t = { n: d.n, corto: d.corto, titulo: d.titulo, bloque: d.bloque,
    apartados: [], preguntas: [], parrafoPorId: {}, xpTotal: 0 };
  d.ap.forEach((a, i) => {
    const ap = { idx: i, tema: t, h1: a.h1, h2: a.h2, nombre: a.h2 || a.h1,
      parrafos: [], dificiles: [], preguntas: [] };
    a.par.forEach((p, k) => {
      const par = { idx: k, id: p.id, ap, bloques: piezas(p.b), q: [] };
      for (const x of p.q) {
        const q = { id: x[0], q: x[1], o: x[2], c: x[3], e: x[4], xp: XP_NORMAL, par, p: [p.id], ap, tema: t };
        par.q.push(q);
        ap.preguntas.push(q);
      }
      ap.parrafos.push(par);
      t.parrafoPorId[p.id] = par;
    });
    for (const x of a.dif) {
      const q = { id: x[0], q: x[1], o: x[2], c: x[3], e: x[4], p: x[5], xp: XP_DIFICIL, dificil: true, ap, tema: t };
      ap.dificiles.push(q);
      ap.preguntas.push(q);
    }
    for (const q of ap.preguntas) {
      t.preguntas.push(q);
      t.xpTotal += q.xp;
    }
    t.apartados.push(ap);
  });
  t.xpNecesario = Math.ceil(t.xpTotal * UMBRAL);
  return t;
}

// En la versión publicada en internet los datos van cifrados con una
// contraseña (datos/*.bin); en el PC, sin cifrar (datos/*.json).
let cifrado = null;   // { sal, vueltas, prueba } si los datos van cifrados
let llave = null;     // la llave para descifrarlos
const CLAVE_LLAVE = 'opo.movil.llave';

const deBase64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const aBase64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));

async function descifrar(datos, conLlave) {
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: datos.slice(0, 12) }, conLlave, datos.slice(12));
  return new TextDecoder().decode(claro);
}

// Comprueba una llave (32 bytes) contra el texto de prueba del sitio.
async function probarLlave(bytes) {
  try {
    const k = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
    if (await descifrar(deBase64(cifrado.prueba), k) === 'oposicion') return k;
  } catch (e) { /* llave equivocada */ }
  return null;
}

async function llaveDeContrasena(contrasena) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: deBase64(cifrado.sal), iterations: cifrado.vueltas }, base, 256);
  const k = await probarLlave(bits);
  if (k) localStorage.setItem(CLAVE_LLAVE, aBase64(bits));
  return k;
}

// Pantalla que pide la contraseña del temario. Solo la primera vez en cada móvil.
function pedirContrasena() {
  return new Promise(listo => {
    const campo = el('input', { type: 'password', class: 'campo', placeholder: 'Contraseña', autocomplete: 'current-password' });
    const aviso = el('p', { class: 'nota' }, 'El temario está protegido. Escribe la contraseña que elegiste al publicarlo; este móvil la recordará.');
    const entrar = async () => {
      if (!campo.value) return;
      aviso.textContent = 'Comprobando…';
      const k = await llaveDeContrasena(campo.value);
      if (!k) { aviso.textContent = 'Contraseña incorrecta.'; campo.value = ''; return; }
      listo(k);
    };
    campo.addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
    cuerpo(el('h2', { class: 'titulo' }, 'Contraseña del temario'),
      el('div', { class: 'ajuste' }, campo, el('button', { class: 'menor', type: 'button', onclick: entrar }, 'Entrar')), aviso);
    pies();
  });
}

async function pedir(ruta) {
  const r = await fetch(cifrado ? ruta.replace(/\.json$/, '.bin') : ruta);
  if (!r.ok) throw new Error(ruta + ': ' + r.status);
  if (!cifrado) return r.json();
  return JSON.parse(await descifrar(new Uint8Array(await r.arrayBuffer()), llave));
}

async function cargarTema(n) {
  if (!temas[n]) temas[n] = registrar(await pedir(`datos/tema_${n}.json`));
  return temas[n];
}

// ---------------------------------------------------------------------
// Reglas: progreso, experiencia y niveles (como en Nucleo.lua)
// ---------------------------------------------------------------------

function progreso(lista) {
  let ok = 0, ko = 0, pend = 0, xp = 0;
  for (const q of lista) {
    const e = db.est[q.id];
    if (e === ACERTADA) { ok++; xp += q.xp; }
    else if (e === FALLADA) ko++;
    else pend++;
  }
  return { ok, ko, pend, xp };
}

const pendientes = lista => lista.filter(q => !db.est[q.id]);
const falladas = t => t.preguntas.filter(q => db.est[q.id] === FALLADA);

// Qué toca en un apartado: ['parrafo', k], ['dificiles'] o ['fin'].
function siguientePaso(ap) {
  for (let k = 0; k < ap.parrafos.length; k++) {
    if (pendientes(ap.parrafos[k].q).length) return ['parrafo', k];
  }
  if (pendientes(ap.dificiles).length) return ['dificiles'];
  return ['fin'];
}

const apartadoPendiente = t => t.apartados.find(ap => siguientePaso(ap)[0] !== 'fin') || null;
const nivel = () => Math.min(NIVEL_MAX, NIVEL_BASE + Object.keys(db.hecho).filter(k => db.hecho[k]).length);
const superado = t => db.hecho[t.n] === true;

// Registra una respuesta. «eleccion» es el índice de la opción en los datos.
function responder(q, eleccion) {
  const antes = db.est[q.id];
  const acierto = eleccion === q.c;
  let xp = 0;
  if (acierto) {
    marcar(q.id, ACERTADA);
    if (antes !== ACERTADA) xp = q.xp;
    db.n.ok++;
  } else {
    marcar(q.id, FALLADA);
    if (antes === ACERTADA) xp = -q.xp;
    db.fallos[q.id] = (db.fallos[q.id] || 0) + 1;
    db.n.ko++;
  }
  let subida = false;
  const t = q.tema;
  if (!db.hecho[t.n] && progreso(t.preguntas).xp >= t.xpNecesario) {
    db.hecho[t.n] = true;
    subida = true;
  }
  guardar();
  return { acierto, xp, subida };
}

// Borra las respuestas de una lista de preguntas. El nivel ganado no se pierde.
function reiniciar(lista) {
  for (const q of lista) if (db.est[q.id]) marcar(q.id, 0);
  guardar();
}

// Experiencia de cada tema, sin tener que cargar sus datos (para la lista).
function xpPorTema() {
  const r = {};
  for (const id in db.est) {
    if (db.est[id] !== ACERTADA) continue;
    const m = /^(\d+)([pd])/.exec(id);
    if (m) r[m[1]] = (r[m[1]] || 0) + (m[2] === 'd' ? XP_DIFICIL : XP_NORMAL);
  }
  return r;
}

// ---------------------------------------------------------------------
// Pantalla: cabecera, pie y navegación
// ---------------------------------------------------------------------

const V = { pagina: null, tema: null, s: null };

function refrescar() {
  $('nivel').textContent = `Nivel ${nivel()} / ${NIVEL_MAX}`;
  const t = V.tema;
  const relleno = $('relleno');
  if (!t) {
    relleno.style.width = '0';
    $('xpTexto').textContent = 'Elige un tema';
    return;
  }
  const xp = progreso(t.preguntas).xp;
  const sup = superado(t);
  const meta = sup ? t.xpTotal : t.xpNecesario;
  relleno.style.width = (meta > 0 ? Math.min(1, xp / meta) * 100 : 0) + '%';
  relleno.className = sup ? 'oro' : '';
  $('xpTexto').textContent = `Tema ${t.n} ${sup ? 'superado ' : ''}· ${miles(xp)} / ${miles(meta)} XP`;
}

// Botones de abajo. Cada uno: [texto, acción, activo] o null.
function pies(...botones) {
  const pie = $('pies');
  pie.replaceChildren();
  for (const b of botones) {
    if (!b) continue;
    pie.append(el('button', { class: 'boton', type: 'button', onclick: b[1], disabled: b[2] === false || !b[1] }, b[0]));
  }
}

function cuerpo(...hijos) {
  const c = $('cuerpo');
  c.replaceChildren(...hijos.flat(Infinity).filter(Boolean));
  c.scrollTop = 0;
  return c;
}

// La tecla «atrás» del móvil sube un nivel en vez de cerrar la app.
function mostrar(pagina) {
  V.pagina = pagina;
  if (pagina !== 'temas' && !(history.state && history.state.dentro)) history.pushState({ dentro: true }, '');
}
window.addEventListener('popstate', () => {
  if (V.pagina === 'estudio' && V.tema) {
    history.pushState({ dentro: true }, '');
    irATema();
  } else if (V.pagina !== 'temas') {
    irATemas();
  }
});

function estandarte(l1, l2) {
  const e = $('estandarte');
  e.replaceChildren(el('div', { class: 'l1' }, l1), el('div', { class: 'l2' }, l2));
  e.hidden = false;
  clearTimeout(estandarte.reloj);
  estandarte.reloj = setTimeout(() => { e.hidden = true; }, 6000);
  e.onclick = () => { e.hidden = true; };
}

// ---------------------------------------------------------------------
// Lista de temas
// ---------------------------------------------------------------------

function irATemas() {
  mostrar('temas');
  db.ui.pagina = 'temas';
  guardar();
  V.s = null;
  refrescar();
  const xp = xpPorTema();
  let superados = 0;
  const filas = indice.temas.map(t => {
    const hecho = db.hecho[t.n] === true;
    if (hecho) superados++;
    const necesario = Math.ceil((t.np * XP_NORMAL + t.nd * XP_DIFICIL) * UMBRAL);
    const der = hecho ? tinta('verde', 'superado') : Math.floor(100 * (xp[t.n] || 0) / necesario) + ' %';
    return el('button', { class: 'fila-lista' + (hecho ? ' hecho' : ''), type: 'button', onclick: () => elegirTema(t.n) },
      el('span', { class: 'txt' }, `Tema ${t.n} · ${t.corto}`), el('span', { class: 'der' }, der));
  });
  cuerpo(
    el('h2', { class: 'titulo' }, 'Temas: cada tema superado da un nivel'),
    el('p', { class: 'resumen' }, `Temas: ${indice.temas.length} · superados: ${superados}`),
    el('div', { class: 'lista' }, filas));
  pies();
}

async function elegirTema(n) {
  cuerpo(el('p', { class: 'aviso' }, `Cargando el tema ${n}…`));
  pies();
  try {
    V.tema = await cargarTema(n);
  } catch (e) {
    cuerpo(el('p', { class: 'aviso' },
      `No se ha podido cargar el tema ${n}. Si estás sin conexión, ábrelo una vez con conexión o descarga todos los temas desde Ajustes.`));
    pies(['« Temas', irATemas]);
    return;
  }
  db.ui.tema = n;
  db.ui.ap = null;
  irATema();
}

// ---------------------------------------------------------------------
// Página del tema: selector de modo y lo que toca en cada uno
// ---------------------------------------------------------------------

function ponerModo(modo) {
  db.ui.modo = modo;
  guardar();
  irATema();
}

// Filas de apartados, con las cabeceras de sus bloques.
function filasDeApartados(t, fila) {
  const filas = [];
  let h1Anterior;
  for (const ap of t.apartados) {
    const sub = ap.h2 !== '';
    if (sub && ap.h1 !== h1Anterior) filas.push(el('div', { class: 'cabecera' }, ap.h1));
    h1Anterior = ap.h1;
    const f = fila(ap);
    filas.push(el('button', { class: 'fila-lista' + (sub ? ' sangria' : '') + (f.hecho ? ' hecho' : ''), type: 'button', onclick: f.accion },
      el('span', { class: 'txt' }, ap.nombre), el('span', { class: 'der' }, f.derecha)));
  }
  return el('div', { class: 'lista' }, filas);
}

function irATema() {
  const t = V.tema;
  mostrar('tema');
  db.ui.pagina = 'tema';
  guardar();
  V.s = null;
  refrescar();
  const modo = db.ui.modo || 'intercalado';
  const { ok, ko, pend } = progreso(t.preguntas);
  let confirmar = false;

  const cabeza = [
    el('div', { class: 'arriba' }, el('button', { class: 'menor', type: 'button', onclick: irATemas }, '« Temas')),
    el('h2', { class: 'titulo' }, `Tema ${t.n} · ${t.corto}`),
    el('p', { class: 'resumen' }, `${ok} acertadas · `, ko > 0 ? tinta('rojo', `${ko} falladas`) : `${ko} falladas`, ` · ${pend} sin hacer`),
    el('div', { class: 'modos' }, MODOS.map(([id, nombre]) =>
      el('button', { class: 'modo' + (id === modo ? ' activo' : ''), type: 'button', onclick: () => ponerModo(id) }, nombre))),
  ];
  const botonFalladas = [`Falladas (${ko})`, abrirFalladas, ko > 0];

  if (modo === 'lectura') {
    const pos = db.leer[t.n];
    let apPos = pos && t.apartados[pos.ap];
    if (apPos && !apPos.parrafos[pos.k]) apPos = null;
    cuerpo(cabeza, filasDeApartados(t, ap => {
      const n = ap.parrafos.length;
      if (ap === apPos) {
        return { derecha: tinta('oro', `vas por el ${pos.k + 1} de ${n}`), accion: () => abrirLectura(ap, pos.k) };
      }
      return { derecha: tinta('gris', n + (n === 1 ? ' párrafo' : ' párrafos')), accion: () => abrirLectura(ap, 0) };
    }));
    pies(botonFalladas, [apPos ? 'Seguir leyendo »' : 'Empezar a leer »',
      () => (apPos ? abrirLectura(apPos, pos.k) : abrirLectura(t.apartados[0], 0))]);

  } else if (modo === 'test') {
    const lineas = [
      el('p', null, 'Salen mezcladas todas las preguntas del tema que aún no has contestado, las de párrafo y las difíciles.'),
      el('p', null, 'Si aciertas, la pregunta desaparece. Si fallas, pasa a «Falladas».'),
      el('p', null, 'Sin contestar: ', tinta('oro', pend), ` de ${t.preguntas.length}`, el('br'),
        'Acertadas: ', tinta('verde', ok), el('br'), 'Falladas: ', tinta(ko > 0 ? 'rojo' : 'verde', ko)),
    ];
    let principal;
    if (pend > 0) {
      principal = [`Empezar test (${pend}) »`, abrirTest];
    } else if (ko > 0) {
      lineas.push(el('p', null, 'Ya no quedan preguntas nuevas: repasa las falladas.'));
      principal = ['Test completo', null, false];
    } else {
      lineas.push(el('p', null, 'Las has acertado todas. «Reiniciar test» borra las respuestas de este tema para volver a hacerlo; el nivel ganado no se pierde.'));
      principal = ['Reiniciar test', function () {
        if (!confirmar) {
          confirmar = true;
          $('pies').lastChild.textContent = '¿Seguro?';
          return;
        }
        reiniciar(t.preguntas);
        irATema();
      }];
    }
    cuerpo(cabeza, el('div', { class: 'texto' }, lineas));
    pies(botonFalladas, principal);

  } else {
    cuerpo(cabeza, filasDeApartados(t, ap => {
      const p = progreso(ap.preguntas);
      const total = ap.preguntas.length;
      let derecha;
      if (p.pend === total) derecha = tinta('gris', `0/${total}`);
      else if (p.pend === 0 && p.ko === 0) derecha = tinta('verde', `${total}/${total}`);
      else derecha = [p.ko > 0 ? tinta('rojo', `${p.ko} mal  `) : null, `${p.ok}/${total}`];
      return { derecha, hecho: p.pend === 0 && p.ko === 0, accion: () => abrirApartado(ap) };
    }));
    const siguiente = apartadoPendiente(t);
    pies(botonFalladas, [siguiente ? 'Continuar »' : 'Tema completo', siguiente ? () => abrirApartado(siguiente) : null, !!siguiente]);
  }
}

// ---------------------------------------------------------------------
// Estudio: piezas de la pantalla
// ---------------------------------------------------------------------

// Cabecera de la pantalla de estudio; devuelve el hueco del contenido.
function marco(titulo, lugar, contenido) {
  cuerpo(
    el('div', { class: 'arriba' },
      el('button', { class: 'menor', type: 'button', onclick: irATema }, '« Tema'),
      el('span', { class: 'lugar' }, lugar)),
    el('h2', { class: 'titulo' }, titulo),
    contenido);
}

// Espacio en blanco entre dos piezas consecutivas (como en el addon).
function separacion(previa, pieza) {
  if (!previa) return 0;
  if (pieza.tipo === 'titulo') return 18;
  if (previa.tipo === 'titulo') return 8;
  if (pieza.nivel === 2) return 3;
  if (previa.nivel === 2) return 7;
  if (pieza.tipo === 'frase' || previa.tipo === 'frase') return 8;
  return 3;
}

// El temario como una pila de piezas: títulos, frases, filas de tabla,
// elementos de lista con sus subelementos y aclaraciones.
function pintarPiezas(lista) {
  const caja = el('div', { class: 'piezas' });
  let previa = null;
  for (const p of lista) {
    const n2 = p.nivel === 2 ? ' n2' : '';
    let d;
    if (p.tipo === 'titulo') {
      d = el('div', { class: 'pz-titulo' }, p.texto);
    } else if (p.tipo === 'par') {
      d = el('div', { class: 'pz-par' + n2 + (p.html ? '' : ' sola') },
        el('span', { class: 'clave' }, p.clave), p.html ? el('span', { html: p.html }) : null);
    } else if (p.tipo === 'item') {
      d = el('div', { class: 'pz-item' + n2 + (p.marca && !n2 ? ' marcado' : '') },
        p.marca && !n2 ? el('span', { class: 'marca' }, p.marca) : null, el('span', { html: p.html }));
    } else if (p.tipo === 'detalle') {
      d = el('div', { class: 'pz-detalle', html: p.html });
    } else {
      d = el('div', { class: 'pz-frase', html: p.html });
    }
    d.style.marginTop = separacion(previa, p) + 'px';
    caja.append(d);
    previa = p;
  }
  return caja;
}

const texto = (...parrafos) => el('div', { class: 'texto' }, parrafos.filter(Boolean).map(p => el('p', null, p)));

function lineaDeNivel(t) {
  if (superado(t)) return `Tema ${t.n} superado: ya te ha dado su nivel.`;
  const falta = Math.max(0, t.xpNecesario - progreso(t.preguntas).xp);
  return ['Para subir de nivel con este tema te faltan ', tinta('oro', miles(falta) + ' XP'), '.'];
}

// ---------------------------------------------------------------------
// Intercalado: lectura de un párrafo y sus preguntas
// ---------------------------------------------------------------------

function abrirApartado(ap) {
  V.s = { modo: 'apartado', ap };
  db.ui.ap = ap.idx;
  db.ui.estudio = 'apartado';
  db.ui.pagina = 'estudio';
  guardar();
  mostrar('estudio');
  const [paso, k] = siguientePaso(ap);
  if (paso === 'parrafo') lectura(k);
  else if (paso === 'dificiles') introDificiles();
  else fin();
}

function despuesDeLosParrafos() {
  if (pendientes(V.s.ap.dificiles).length) introDificiles();
  else fin();
}

function lectura(k) {
  const s = V.s, ap = s.ap, par = ap.parrafos[k];
  const pend = pendientes(par.q);
  s.vista = 'lectura';
  s.k = k;
  marco(ap.nombre, `Párrafo ${k + 1} de ${ap.parrafos.length} · ` + (pend.length ? `${pend.length} preguntas` : 'preguntas hechas'),
    pintarPiezas(par.bloques));
  let der;
  if (pend.length) der = [`Preguntas (${pend.length}) »`, () => empezarCola(pend, 'parrafo')];
  else if (k < ap.parrafos.length - 1) der = ['Siguiente »', () => lectura(k + 1)];
  else der = ['Continuar »', despuesDeLosParrafos];
  pies(['« Anterior', () => lectura(k - 1), k > 0], der);
}

function introDificiles() {
  const s = V.s, ap = s.ap;
  const pend = pendientes(ap.dificiles);
  s.vista = 'dificiles';
  marco(ap.nombre, 'Preguntas difíciles', texto(
    'Has terminado los párrafos de este apartado.',
    ['Ahora tocan ', tinta('oro', `${pend.length} preguntas difíciles`),
      `. Mezclan lo que acabas de leer con otros apartados del tema y valen el doble: ${XP_DIFICIL} XP cada una.`],
    'Si dudas, en cada pregunta puedes pulsar «Ver párrafo».'));
  pies(['« Releer', () => lectura(ap.parrafos.length - 1)], [`Empezar (${pend.length}) »`, () => empezarCola(pend, 'dificiles')]);
}

function fin() {
  const s = V.s, ap = s.ap, t = ap.tema;
  const { ok, ko } = progreso(ap.preguntas);
  const total = ap.preguntas.length;
  let confirmar = false;
  s.vista = 'fin';
  marco(ap.nombre, 'Resumen del apartado', texto(
    tinta('oro', 'Apartado terminado'),
    ['Acertadas: ', tinta('verde', ok), ` de ${total}`, ko > 0 ? el('br') : null, ko > 0 ? 'Falladas: ' : null, ko > 0 ? tinta('rojo', ko) : null],
    ko > 0 ? 'Las falladas no dan experiencia hasta que las aciertes. Las tienes en «Falladas», en la página del tema.' : null,
    lineaDeNivel(t)));
  const siguiente = t.apartados[ap.idx + 1];
  pies(['« Releer', () => lectura(0)],
    ['Repetir', function () {
      if (!confirmar) {
        confirmar = true;
        $('pies').children[1].textContent = '¿Seguro?';
        return;
      }
      reiniciar(ap.preguntas);
      refrescar();
      abrirApartado(ap);
    }],
    siguiente ? ['Siguiente »', () => abrirApartado(siguiente)] : ['Al tema »', irATema]);
}

// ---------------------------------------------------------------------
// Solo lectura
// ---------------------------------------------------------------------

function abrirLectura(ap, k) {
  V.s = { modo: 'lectura', ap };
  db.ui.estudio = 'lectura';
  db.ui.pagina = 'estudio';
  mostrar('estudio');
  leer(k || 0);
}

function leer(k) {
  const s = V.s, ap = s.ap, t = ap.tema;
  k = Math.max(0, Math.min(k, ap.parrafos.length - 1));
  s.vista = 'leer';
  s.k = k;
  db.leer[t.n] = { ap: ap.idx, k };
  guardar();
  marco(ap.nombre, `Solo lectura · párrafo ${k + 1} de ${ap.parrafos.length}`, pintarPiezas(ap.parrafos[k].bloques));
  const anterior = t.apartados[ap.idx - 1], siguiente = t.apartados[ap.idx + 1];
  let izq, der;
  if (k > 0) izq = ['« Anterior', () => leer(k - 1)];
  else if (anterior) izq = ['« Anterior', () => abrirLectura(anterior, anterior.parrafos.length - 1)];
  else izq = ['« Anterior', null, false];
  if (k < ap.parrafos.length - 1) der = ['Siguiente »', () => leer(k + 1)];
  else if (siguiente) der = ['Siguiente »', () => abrirLectura(siguiente, 0)];
  else der = ['Al tema »', irATema];
  pies(izq, der);
}

// ---------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------

// Empieza una tanda: 'parrafo', 'dificiles', 'falladas' o 'test'.
function empezarCola(cola, tipo) {
  const s = V.s;
  s.cola = cola;
  s.tipo = tipo;
  s.pos = -1;
  siguientePregunta();
}

function siguientePregunta() {
  const s = V.s;
  s.pos++;
  s.q = s.cola[s.pos];
  s.orden = barajar([0, 1, 2, 3]);
  s.respondida = false;
  s.elegida = null;
  s.acierto = null;
  s.xp = 0;
  s.vista = 'pregunta';
  pintarPregunta();
}

function pintarPregunta(bajar) {
  const s = V.s, q = s.q, ap = q.ap;
  const cuenta = `Pregunta ${s.pos + 1} de ${s.cola.length}`;
  let titulo = ap.nombre, lugar;
  if (s.tipo === 'test') {
    // En el test no se dice de qué apartado es la pregunta hasta contestarla.
    if (!s.respondida) titulo = `Tema ${q.tema.n} · solo test`;
    lugar = 'Solo test · ' + cuenta;
  } else if (s.tipo === 'falladas') {
    lugar = 'Falladas · ' + cuenta;
  } else if (s.tipo === 'dificiles') {
    lugar = 'Difíciles · ' + cuenta;
  } else {
    lugar = `Párrafo ${s.k + 1} de ${ap.parrafos.length} · ${cuenta}`;
  }

  let letraCorrecta = '?';
  const opciones = s.orden.map((idx, i) => {
    if (idx === q.c) letraCorrecta = LETRAS[i];
    let clase = 'opcion';
    if (s.respondida) clase += idx === q.c ? ' bien' : idx === s.elegida ? ' mal' : ' apagada';
    return el('button', { class: clase, type: 'button', disabled: s.respondida, onclick: () => elegir(i) },
      el('span', { class: 'letra' }, LETRAS[i] + ')'), q.o[idx]);
  });

  let resultado = null, explicacion = null;
  if (s.respondida) {
    resultado = s.acierto
      ? el('div', { class: 'resultado' }, tinta('verde', '¡Correcto!'), s.xp > 0 ? tinta('oro', `  +${s.xp} XP`) : null)
      : el('div', { class: 'resultado' }, tinta('rojo', 'Incorrecto.'), ` La correcta es la ${letraCorrecta}.`,
        s.xp < 0 ? tinta('rojo', `  ${s.xp} XP`) : null);
    explicacion = el('div', { class: 'explicacion' }, q.e);
  }
  marco(titulo, lugar, [el('p', { class: 'pregunta' }, q.q), opciones, resultado, explicacion]);
  if (bajar && resultado) resultado.scrollIntoView({ block: 'nearest' });
  pies(['Ver párrafo', consulta], [s.pos < s.cola.length - 1 ? 'Siguiente »' : 'Continuar »', avanzar, s.respondida]);
}

// Se pulsa la opción que está en la posición i de la pantalla.
function elegir(i) {
  const s = V.s;
  if (!s || s.vista !== 'pregunta' || s.respondida) return;
  const idx = s.orden[i];
  const r = responder(s.q, idx);
  s.respondida = true;
  s.elegida = idx;
  s.acierto = r.acierto;
  s.xp = r.xp;
  if (s.modo === 'falladas' && r.acierto) s.recuperadas++;
  if (s.modo === 'test') {
    if (r.acierto) s.aciertos++; else s.fallos++;
  }
  refrescar();
  pintarPregunta(true);
  if (r.subida) estandarte(`Oposición: nivel ${nivel()}`, `Tema ${s.q.tema.n} superado`);
}

// Tras responder: siguiente pregunta o siguiente paso.
function avanzar() {
  const s = V.s;
  if (!s.respondida) return;
  if (s.pos < s.cola.length - 1) return siguientePregunta();
  if (s.modo === 'falladas') finFalladas();
  else if (s.modo === 'test') finTest();
  else if (s.tipo === 'parrafo') {
    if (s.k < s.ap.parrafos.length - 1) lectura(s.k + 1);
    else despuesDeLosParrafos();
  } else fin();
}

// Consulta del temario desde una pregunta: los párrafos de los que sale.
function consulta() {
  const s = V.s, q = s.q, t = q.tema;
  s.vista = 'consulta';
  const trozos = [];
  for (const id of q.p) {
    const par = t.parrafoPorId[id];
    if (!par) continue;
    trozos.push(el('div', { class: 'pz-detalle oro', style: 'margin-top:14px' }, par.ap.nombre));
    const caja = pintarPiezas(par.bloques);
    caja.style.marginTop = '8px';
    trozos.push(caja);
  }
  marco(s.tipo === 'test' && !s.respondida ? `Tema ${t.n} · solo test` : q.ap.nombre, 'Consulta del temario', trozos);
  pies(['« Volver', () => { s.vista = 'pregunta'; pintarPregunta(); }]);
}

// ---------------------------------------------------------------------
// Falladas y solo test
// ---------------------------------------------------------------------

function abrirFalladas() {
  const cola = falladas(V.tema);
  if (!cola.length) return;
  V.s = { modo: 'falladas', total: cola.length, recuperadas: 0 };
  mostrar('estudio');
  empezarCola(cola, 'falladas');
}

function finFalladas() {
  const s = V.s, t = V.tema;
  const quedan = falladas(t).length;
  s.vista = 'finfalladas';
  marco(`Tema ${t.n} · preguntas falladas`, 'Resumen del repaso', texto(
    tinta('oro', 'Repaso terminado'),
    ['Recuperadas: ', tinta('verde', s.recuperadas), ` de ${s.total}`, el('br'),
      'Siguen falladas: ', tinta(quedan > 0 ? 'rojo' : 'verde', quedan)],
    quedan > 0 ? 'Las que sigues fallando se quedan aquí hasta que las aciertes.' : null));
  pies(['« Al tema', irATema], quedan > 0 ? [`Otra vuelta (${quedan}) »`, abrirFalladas] : null);
}

// Solo test: las preguntas del tema que aún no se han contestado, mezcladas.
function abrirTest() {
  const cola = barajar(pendientes(V.tema.preguntas));
  if (!cola.length) return;
  V.s = { modo: 'test', total: cola.length, aciertos: 0, fallos: 0 };
  mostrar('estudio');
  empezarCola(cola, 'test');
}

function finTest() {
  const s = V.s, t = V.tema;
  const { ko } = progreso(t.preguntas);
  s.vista = 'fintest';
  marco(`Tema ${t.n} · solo test`, 'Resumen del test', texto(
    tinta('oro', 'Test terminado'),
    ['Acertadas: ', tinta('verde', s.aciertos), ` de ${s.total}`, el('br'),
      'Falladas: ', tinta(s.fallos > 0 ? 'rojo' : 'verde', s.fallos)],
    ko > 0 ? ['Las falladas no dan experiencia hasta que las aciertes. Tienes ', tinta('rojo', ko), ' en «Falladas».'] : null,
    lineaDeNivel(t)));
  pies(['« Al tema', irATema], ko > 0 ? [`Falladas (${ko}) »`, abrirFalladas] : null);
}

// ---------------------------------------------------------------------
// Sincronización con el juego
// ---------------------------------------------------------------------
// El progreso se cruza con el del addon de WoW a través de un «buzón»: el
// archivo progreso.json del repositorio privado «opo-progreso» de GitHub. La
// app lo lee, lo cruza con lo suyo (en cada pregunta gana la respuesta más
// reciente; el nivel nunca baja) y sube el resultado. En el PC hace lo mismo
// el script sincro/sincronizar.js.

const REPO_PROGRESO = 'opo-progreso';
const CLAVE_GH = 'opo.movil.github';

const sinc = {
  clave: '', login: '',
  ocupado: false, repetir: false, sucio: false,
  marca: null,        // versión del buzón que se leyó la última vez
  ultimo: 0, error: '',
  reloj: null,
};
try {
  const g = JSON.parse(localStorage.getItem(CLAVE_GH) || 'null');
  if (g && g.clave) { sinc.clave = g.clave; sinc.login = g.login || ''; }
} catch (e) { /* sin conectar */ }

function miProgreso() {
  const est = {};
  for (const id in db.cuando) est[id] = [db.est[id] || 0, db.cuando[id]];
  for (const id in db.est) if (!est[id]) est[id] = [db.est[id], 0];
  const hecho = {};
  for (const n in db.hecho) if (db.hecho[n]) hecho[Number(n)] = true;
  return { est, hecho };
}

function masReciente(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a[1] !== b[1]) return a[1] > b[1] ? a : b;
  return a[0] >= b[0] ? a : b;
}

function fusionar(a, b) {
  const est = {};
  for (const id in a.est) est[id] = masReciente(a.est[id], b.est[id]);
  for (const id in b.est) if (!est[id]) est[id] = b.est[id];
  return { est, hecho: Object.assign({}, a.hecho, b.hecho) };
}

const igual = (x, y) => !!x && !!y && x[0] === y[0] && x[1] === y[1];

function hayDiferencias(nuevo, viejo) {
  for (const id in nuevo.est) if (!igual(nuevo.est[id], viejo.est[id])) return true;
  for (const n in nuevo.hecho) if (!viejo.hecho[n]) return true;
  return false;
}

function empaquetar(p) {
  const est = {};
  for (const id of Object.keys(p.est).sort()) {
    const m = /^(\d+)(.+)$/.exec(id);
    if (m) (est[m[1]] = est[m[1]] || {})[m[2]] = p.est[id];
  }
  const hecho = {};
  for (const n of Object.keys(p.hecho).sort()) hecho[n] = 1;
  return JSON.stringify({ v: 1, t: ahora(), est, hecho });
}

function desempaquetar(texto) {
  const p = { est: {}, hecho: {} };
  if (!texto || !texto.trim()) return p;
  const d = JSON.parse(texto);
  for (const tema in d.est || {}) {
    for (const resto in d.est[tema]) {
      const r = d.est[tema][resto];
      if (Array.isArray(r) && r.length === 2) p.est[tema + resto] = [r[0] | 0, Number(r[1]) || 0];
    }
  }
  for (const n in d.hecho || {}) if (d.hecho[n]) p.hecho[Number(n)] = true;
  return p;
}

async function github(metodo, ruta, cuerpo, alSalir) {
  const r = await fetch('https://api.github.com' + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + sinc.clave, Accept: 'application/vnd.github+json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    keepalive: !!alSalir,
  });
  let datos = null;
  try { datos = await r.json(); } catch (e) { /* sin cuerpo */ }
  return { estado: r.status, datos };
}

const rutaBuzon = () => `/repos/${sinc.login}/${REPO_PROGRESO}/contents/progreso.json`;

// Da el nivel de los temas que ya llegan a su experiencia (puede pasar al
// juntar lo contestado aquí con lo contestado en el juego).
function revisarNiveles() {
  const xp = xpPorTema();
  for (const t of indice.temas) {
    if (!db.hecho[t.n] && (xp[t.n] || 0) >= Math.ceil((t.np * XP_NORMAL + t.nd * XP_DIFICIL) * UMBRAL)) db.hecho[t.n] = true;
  }
}

// Incorpora a este móvil lo que el cruce traiga de nuevo. Devuelve cuántas respuestas cambian.
function aplicar(total, local) {
  let cambios = 0;
  for (const id in total.est) {
    const r = total.est[id];
    if (igual(r, local.est[id])) continue;
    if (r[0] === ACERTADA || r[0] === FALLADA) db.est[id] = r[0];
    else delete db.est[id];
    db.cuando[id] = r[1];
    cambios++;
  }
  for (const n in total.hecho) db.hecho[n] = true;
  return cambios;
}

async function sincronizar() {
  if (!sinc.clave || !indice) return;
  if (sinc.ocupado) { sinc.repetir = true; return; }
  sinc.ocupado = true;
  clearTimeout(sinc.reloj);
  sinc.reloj = null;
  try {
    for (let intento = 0; intento < 4; intento++) {
      const r = await github('GET', rutaBuzon());
      if (r.estado === 401 || r.estado === 403) throw new Error('GitHub no acepta la clave.');
      if (r.estado !== 200 && r.estado !== 404) throw new Error('GitHub ha respondido ' + r.estado + '.');
      const hay = r.estado === 200;
      const remoto = desempaquetar(hay ? atob((r.datos.content || '').replace(/\s/g, '')) : '');
      sinc.marca = hay ? r.datos.sha : null;
      const local = miProgreso();
      const total = fusionar(local, remoto);
      const cambios = aplicar(total, local);
      revisarNiveles();
      if (cambios) {
        guardarYa();
        // Solo se repinta si no se está en mitad de una pregunta o una lectura.
        if (V.pagina === 'temas') irATemas();
        else if (V.pagina === 'tema') irATema();
        else refrescar();
      }
      if (hayDiferencias(total, remoto)) {
        const w = await github('PUT', rutaBuzon(), {
          message: 'Progreso desde el móvil',
          content: btoa(empaquetar(miProgreso())),
          sha: sinc.marca || undefined,
        });
        if (w.estado === 409 || w.estado === 422) continue;   // el PC acaba de escribir: otra vuelta
        if (w.estado === 404) throw new Error('Falta preparar el buzón en el PC.');
        if (w.estado !== 200 && w.estado !== 201) throw new Error('GitHub no ha guardado el progreso (' + w.estado + ').');
        sinc.marca = w.datos && w.datos.content ? w.datos.content.sha : null;
      }
      sinc.sucio = false;
      sinc.ultimo = Date.now();
      sinc.error = '';
      break;
    }
  } catch (e) {
    sinc.error = navigator.onLine === false ? 'Sin conexión: se enviará cuando vuelva.' : (e.message || 'No se ha podido sincronizar.');
  }
  sinc.ocupado = false;
  if (sinc.alCambiar) sinc.alCambiar();
  if (sinc.repetir) { sinc.repetir = false; porSubir(); }
}

// Hay algo nuevo que enviar: se sube a los pocos segundos de la última respuesta.
function porSubir() {
  if (!sinc.clave) return;
  sinc.sucio = true;
  clearTimeout(sinc.reloj);
  sinc.reloj = setTimeout(sincronizar, 12000);
}

// Al pasar la app a segundo plano: un último envío que el sistema deja terminar.
function enviarAlSalir() {
  if (!sinc.clave || !sinc.sucio || sinc.ocupado || !sinc.login) return;
  clearTimeout(sinc.reloj);
  sinc.reloj = null;
  github('PUT', rutaBuzon(), {
    message: 'Progreso desde el móvil',
    content: btoa(empaquetar(miProgreso())),
    sha: sinc.marca || undefined,
  }, true).then(w => {
    if (w.estado === 200 || w.estado === 201) {
      sinc.sucio = false;
      sinc.marca = w.datos && w.datos.content ? w.datos.content.sha : null;
    }
  }).catch(() => { /* se enviará al volver */ });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) enviarAlSalir();
  else sincronizar();
});
window.addEventListener('online', sincronizar);

// Conecta este móvil con GitHub usando una clave que solo sirve para el buzón.
async function conectar(clave) {
  sinc.clave = clave.trim();
  sinc.login = '';
  const yo = await github('GET', '/user');
  if (yo.estado !== 200) { sinc.clave = ''; throw new Error('GitHub no acepta esa clave.'); }
  sinc.login = yo.datos.login;
  const repo = await github('GET', `/repos/${sinc.login}/${REPO_PROGRESO}`);
  if (repo.estado !== 200) {
    sinc.clave = '';
    sinc.login = '';
    throw new Error('La clave no llega al buzón «opo-progreso». Comprueba que la creaste para ese repositorio.');
  }
  localStorage.setItem(CLAVE_GH, JSON.stringify({ clave: sinc.clave, login: sinc.login }));
  await sincronizar();
}

function desconectar() {
  localStorage.removeItem(CLAVE_GH);
  clearTimeout(sinc.reloj);
  Object.assign(sinc, { clave: '', login: '', sucio: false, marca: null, ultimo: 0, error: '', reloj: null });
}

// ---------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------

function aplicarLetra() {
  document.documentElement.style.setProperty('--letra', (db.ui.letra || 16) + 'px');
}

function irAAjustes() {
  const volver = V.tema ? irATema : irATemas;
  mostrar('ajustes');
  V.s = null;
  const valor = el('span', { class: 'valor' }, (db.ui.letra || 16) + ' px');
  const cambiar = d => {
    db.ui.letra = Math.max(13, Math.min(24, (db.ui.letra || 16) + d));
    guardar();
    aplicarLetra();
    valor.textContent = db.ui.letra + ' px';
  };
  const estado = el('p', { class: 'nota' }, 'serviceWorker' in navigator
    ? 'Los temas que abras quedan guardados en el móvil. Con este botón se guardan todos de una vez (unos 10 MB).'
    : 'Este navegador no permite guardar los temas para usarlos sin conexión.');
  const descargar = el('button', { class: 'menor', type: 'button', onclick: async () => {
    descargar.disabled = true;
    let hechos = 0, fallos = 0;
    for (const t of indice.temas) {
      try { await fetch(`datos/tema_${t.n}.json`).then(r => { if (!r.ok) throw 0; return r.blob(); }); } catch (e) { fallos++; }
      hechos++;
      estado.textContent = `Guardando temas: ${hechos} de ${indice.temas.length}…`;
    }
    estado.textContent = fallos ? `Han fallado ${fallos} temas. Comprueba la conexión y vuelve a intentarlo.`
      : `Guardados los ${indice.temas.length} temas: ya puedes usar la app sin conexión.`;
    descargar.disabled = false;
  } }, 'Guardar todos');
  const total = Object.keys(db.est).length;
  const zonaSinc = el('div');
  const pintarSinc = () => {
    if (V.pagina !== 'ajustes') return;
    if (!sinc.clave) {
      const campo = el('input', { type: 'password', class: 'campo', placeholder: 'Clave de GitHub', autocomplete: 'off' });
      const aviso = el('p', { class: 'nota' },
        'Para que el progreso de este móvil y el del juego sean el mismo, pega aquí la clave de GitHub que creaste para el buzón «opo-progreso». Se guarda solo en este móvil.');
      const boton = el('button', { class: 'menor', type: 'button', onclick: async () => {
        if (!campo.value.trim()) return;
        boton.disabled = true;
        aviso.textContent = 'Conectando…';
        try {
          await conectar(campo.value);
        } catch (e) {
          aviso.textContent = e.message;
          boton.disabled = false;
          return;
        }
        pintarSinc();
      } }, 'Conectar');
      zonaSinc.replaceChildren(el('div', { class: 'ajuste' }, campo, boton), aviso);
      return;
    }
    let linea;
    if (sinc.ocupado) linea = 'Sincronizando…';
    else if (sinc.error) linea = sinc.error;
    else if (sinc.ultimo) linea = 'Última sincronización: ' + new Date(sinc.ultimo).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + (sinc.sucio ? ' · hay respuestas por enviar' : '');
    else linea = 'Aún no se ha sincronizado.';
    zonaSinc.replaceChildren(
      el('div', { class: 'ajuste' }, el('span', { class: 'nombre' }, 'Conectado como ' + sinc.login),
        el('button', { class: 'menor', type: 'button', onclick: () => { sincronizar(); pintarSinc(); } }, 'Sincronizar'),
        el('button', { class: 'menor', type: 'button', onclick: () => { desconectar(); pintarSinc(); } }, 'Quitar')),
      el('p', { class: 'nota' + (sinc.error ? ' rojo' : '') }, linea));
  };
  sinc.alCambiar = pintarSinc;
  cuerpo(
    el('h2', { class: 'titulo' }, 'Ajustes'),
    el('div', { class: 'ajuste' }, el('span', { class: 'nombre' }, 'Tamaño de letra'),
      el('button', { class: 'menor', type: 'button', onclick: () => cambiar(-1) }, 'A−'), valor,
      el('button', { class: 'menor', type: 'button', onclick: () => cambiar(1) }, 'A+')),
    el('div', { class: 'ajuste' }, el('span', { class: 'nombre' }, 'Usar sin conexión'), 'serviceWorker' in navigator ? descargar : null),
    estado,
    el('h2', { class: 'titulo' }, 'Sincronizar con el juego'),
    zonaSinc,
    el('p', { class: 'nota' }, `Versión ${VERSION} · ${indice.temas.length} temas · ${total} preguntas contestadas en este móvil.`));
  pintarSinc();
  pies(['« Volver', volver]);
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------

async function arrancar() {
  aplicarLetra();
  $('btnAjustes').addEventListener('click', () => { if (indice) irAAjustes(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(e => console.error('Sin servicio sin conexión', e));
  }
  history.replaceState({ raiz: true }, '');
  refrescar();
  // ¿Datos cifrados? Entonces hace falta la llave: la guardada o la contraseña.
  try {
    const r = await fetch('datos/cifrado.json');
    if (r.ok) cifrado = await r.json();
  } catch (e) { /* sin conexión y sin copia: se verá al pedir el índice */ }
  if (cifrado) {
    const guardada = localStorage.getItem(CLAVE_LLAVE);
    llave = guardada ? await probarLlave(deBase64(guardada)) : null;
    if (!llave) llave = await pedirContrasena();
  }
  try {
    indice = await pedir('datos/indice.json');
  } catch (e) {
    cuerpo(el('p', { class: 'aviso' }, 'No se ha podido cargar la lista de temas. Comprueba la conexión y vuelve a abrir la app.'));
    return;
  }

  // Se vuelve a donde se estaba: leyendo, en un apartado o en la página del tema.
  const ui = db.ui;
  if (ui.tema && ui.pagina !== 'temas' && indice.temas.some(t => t.n === ui.tema)) {
    try {
      const t = V.tema = await cargarTema(ui.tema);
      const lec = ui.pagina === 'estudio' && ui.estudio === 'lectura' && db.leer[t.n];
      const apLec = lec && t.apartados[lec.ap];
      const ap = ui.pagina === 'estudio' && ui.estudio !== 'lectura' && t.apartados[ui.ap];
      if (apLec) abrirLectura(apLec, lec.k);
      else if (ap) abrirApartado(ap);
      else irATema();
      sincronizar();
      return;
    } catch (e) { /* sin ese tema a mano: a la lista */ }
  }
  irATemas();
  sincronizar();
}

arrancar();
