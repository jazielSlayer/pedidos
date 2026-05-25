
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMa6vRopArkn-3Q2ozoYcFam8jKjfZkJ5HdbNsMHx_JzvXx_-Tlzmi7ugWQQr2FRE/exec';

// ── Precios por tipo de página ──────────────────────
const PRECIOS = {
  landing:   150,
  empresa:   400,
  ecommerce: 800,
  blog:      250,
  portfolio: 300,
  otro:      500,
};

// ── Estado del QR ───────────────────────────────────
let qrTimerInterval = null;
let qrTimeoutId    = null;

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  injectQRModal();
  bindFormSubmit();
  bindPresupuestoHint();
});

// ══════════════════════════════════════════════════
// FORM SUBMIT
// ══════════════════════════════════════════════════
function bindFormSubmit() {
  document.getElementById('pedidoForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.querySelector('.btn-submit');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Procesando…';

    try {
      const campos = recolectarCampos();
      validarCampos(campos);

      const imagenFile = document.getElementById('imagenReferencia').files[0];
      const formData   = construirFormData(campos);

      if (imagenFile) {
        const base64 = await leerImagenBase64(imagenFile);
        formData.append('imagen', base64);
        formData.append('imagenNombre', imagenFile.name);
      }

      // Mostrar QR de pago antes de enviar
      const monto = campos.presupuesto || PRECIOS[campos.tipoPagina] || 0;
      abrirQR(monto, async () => {
        await enviarDatos(formData);
      });

    } catch (err) {
      mostrarError(err.message);
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = '📨 Enviar Solicitud';
    }
  });
}

// ── Sugerencia automática de presupuesto ────────────
function bindPresupuestoHint() {
  document.getElementById('tipoPagina').addEventListener('change', (e) => {
    const precio = PRECIOS[e.target.value];
    const input  = document.getElementById('presupuesto');
    if (precio && !input.value) {
      input.value = precio;
      input.style.borderBottomColor = 'var(--gold)';
      setTimeout(() => { input.style.borderBottomColor = ''; }, 1200);
    }
  });
}

// ══════════════════════════════════════════════════
// VALIDACIONES
// ══════════════════════════════════════════════════
function recolectarCampos() {
  return {
    nombre:      document.getElementById('nombre').value.trim(),
    celular:     document.getElementById('celular').value.trim(),
    email:       document.getElementById('email').value.trim(),
    tipoPagina:  document.getElementById('tipoPagina').value,
    descripcion: document.getElementById('descripcion').value.trim(),
    presupuesto: document.getElementById('presupuesto').value || '',
    fechaLimite: document.getElementById('fechaLimite').value || '',
  };
}

function validarCampos(c) {
  if (!c.nombre || !c.celular || !c.email || !c.tipoPagina || !c.descripcion)
    throw new Error('Por favor completa todos los campos requeridos.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
    throw new Error('Ingresa un correo electrónico válido.');
}

function construirFormData(c) {
  const fd = new FormData();
  fd.append('nombre',       c.nombre);
  fd.append('celular',      c.celular);
  fd.append('email',        c.email);
  fd.append('tipoPagina',   c.tipoPagina);
  fd.append('descripcion',  c.descripcion);
  fd.append('presupuesto',  c.presupuesto || 'No especificado');
  fd.append('fechaLimite',  c.fechaLimite || 'No especificada');
  fd.append('fechaPedido',  new Date().toLocaleString('es-ES'));
  return fd;
}

function leerImagenBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(',')[1]);
    r.onerror   = () => rej(new Error('No se pudo leer la imagen.'));
    r.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════
// ENVÍO A GOOGLE SHEETS
// ══════════════════════════════════════════════════
async function enviarDatos(formData) {
  const obj = {};
  for (const [k, v] of formData.entries()) obj[k] = v;

  try {
    await fetch(SCRIPT_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(obj),
    });

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title:             '¡Solicitud Enviada!',
        html:              'Tu solicitud ha sido registrada exitosamente.<br>Te contactaremos a la brevedad.',
        icon:              'success',
        confirmButtonText: 'Perfecto',
        customClass: { popup: '', title: '', confirmButton: '' }
      });
    } else {
      alert('¡Solicitud enviada correctamente!');
    }

    document.getElementById('pedidoForm').reset();

  } catch (err) {
    mostrarError('Hubo un error al enviar. Por favor intenta nuevamente.');
  }
}

// ══════════════════════════════════════════════════
// QR MODAL — SIMULACIÓN DE PAGO
// ══════════════════════════════════════════════════

// Inyectar el HTML del modal en el body
function injectQRModal() {
  const modal = document.createElement('div');
  modal.className = 'qr-overlay';
  modal.id = 'qrOverlay';
  modal.innerHTML = `
    <div class="qr-modal">
      <h2>Simular Pago</h2>
      <p class="qr-subtitle">Escanea para confirmar tu pedido</p>

      <div class="qr-amount">
        <span>USD </span><span id="qrMonto">0</span>
      </div>

      <div class="qr-box">
        <canvas id="qrCanvas" width="200" height="200"></canvas>
      </div>

      <p class="qr-instructions">
        Escanea el código QR con tu aplicación de pagos preferida.<br>
        <strong>Este es un pago simulado</strong> — no se realizará ningún cargo real.
      </p>

      <div class="qr-timer">
        <span class="qr-timer-dot"></span>
        Código válido por <span id="qrSegundos">120</span>s
      </div>
      <div class="qr-timer-bar">
        <div class="qr-timer-fill" id="qrTimerFill"></div>
      </div>

      <button class="btn-qr-simulate" id="btnSimularPago">✓ Simular Pago Completado</button>
      <button class="btn-qr-close" id="btnCerrarQR">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btnCerrarQR').addEventListener('click', cerrarQR);
  document.getElementById('btnSimularPago').addEventListener('click', onPagoSimulado);
}

// Abrir el modal QR
function abrirQR(monto, callbackPagoOk) {
  const overlay = document.getElementById('qrOverlay');
  document.getElementById('qrMonto').textContent = monto || '—';

  // Guardar callback
  overlay._callbackOk = callbackPagoOk;

  // Generar QR con datos simulados
  const payload = JSON.stringify({
    comercio: 'TuWebPerfecta',
    monto,
    moneda: 'USD',
    ref: 'TW-' + Date.now(),
    ts: new Date().toISOString(),
  });
  dibujarQR(payload);

  // Timer 120s
  let segundos = 120;
  const fill    = document.getElementById('qrTimerFill');
  const conteo  = document.getElementById('qrSegundos');

  fill.style.width = '100%';
  fill.style.transition = 'none';

  clearInterval(qrTimerInterval);
  clearTimeout(qrTimeoutId);

  overlay.classList.add('active');

  // Forzar reflow para que la transición arranque
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.transition = 'width 120s linear';
      fill.style.width = '0%';
    });
  });

  qrTimerInterval = setInterval(() => {
    segundos--;
    conteo.textContent = segundos;
    if (segundos <= 0) {
      clearInterval(qrTimerInterval);
      cerrarQR();
      mostrarError('El código QR expiró. Por favor vuelve a intentarlo.');
    }
  }, 1000);
}

function cerrarQR() {
  clearInterval(qrTimerInterval);
  clearTimeout(qrTimeoutId);
  document.getElementById('qrOverlay').classList.remove('active');

  const btn = document.querySelector('.btn-submit');
  if (btn) {
    btn.disabled = false;
    btn.querySelector('span').textContent = '📨 Enviar Solicitud';
  }
}

function onPagoSimulado() {
  const overlay = document.getElementById('qrOverlay');
  clearInterval(qrTimerInterval);

  // Feedback visual rápido
  const btnSim = document.getElementById('btnSimularPago');
  btnSim.textContent = '✓ Pago confirmado — enviando solicitud…';
  btnSim.disabled = true;

  qrTimeoutId = setTimeout(async () => {
    overlay.classList.remove('active');
    if (typeof overlay._callbackOk === 'function') {
      await overlay._callbackOk();
    }
    btnSim.textContent = '✓ Simular Pago Completado';
    btnSim.disabled = false;
  }, 1200);
}

// ══════════════════════════════════════════════════
// QR GENERATOR (sin librerías externas)
// Implementación mínima de QR de Versión 1 con
// canvas — genera un patrón visual convincente.
// Para producción real: usa qrcode.js o similar.
// ══════════════════════════════════════════════════
function dibujarQR(texto) {
  const canvas = document.getElementById('qrCanvas');
  const ctx    = canvas.getContext('2d');
  const size   = 200;
  const mod    = 21; // QR v1 = 21x21 módulos
  const cell   = Math.floor(size / mod);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0a0a0a';

  // Generar módulos pseudoaleatorios basados en el texto
  const bits = textoBits(texto, mod * mod);

  for (let r = 0; r < mod; r++) {
    for (let c = 0; c < mod; c++) {
      if (esFinderPattern(r, c, mod) || bits[r * mod + c]) {
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  // Finder patterns (esquinas)
  dibujarFinder(ctx, 0, 0, cell);
  dibujarFinder(ctx, (mod - 7) * cell, 0, cell);
  dibujarFinder(ctx, 0, (mod - 7) * cell, cell);
}

function dibujarFinder(ctx, x, y, cell) {
  // Marco exterior 7×7
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x, y, 7 * cell, 7 * cell);
  // Interior blanco 5×5
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + cell, y + cell, 5 * cell, 5 * cell);
  // Centro negro 3×3
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell);
}

function esFinderPattern(r, c, mod) {
  // Zonas reservadas para finder patterns
  if (r < 8 && c < 8) return false; // top-left
  if (r < 8 && c >= mod - 8) return false; // top-right
  if (r >= mod - 8 && c < 8) return false; // bottom-left
  return false;
}

function textoBits(texto, total) {
  // Hash simple del texto para generar bits reproducibles
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }

  const bits = new Uint8Array(total);
  let seed = hash;
  for (let i = 0; i < total; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    bits[i] = (seed >> 16) & 1;
  }
  return bits;
}

// ══════════════════════════════════════════════════
// UTILIDADES
// ══════════════════════════════════════════════════
function mostrarError(msg) {
  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'Error', text: msg, icon: 'error', confirmButtonText: 'OK' });
  } else {
    alert(msg);
  }
}