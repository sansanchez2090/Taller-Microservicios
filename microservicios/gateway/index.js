// gateway (puerto 3000): punto de entrada unico.
const express = require('express');
const crypto = require('crypto');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || ''; // si se define, exige la cabecera x-api-key
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 5000);
const LIMITE_POR_MINUTO = Number(process.env.LIMITE_POR_MINUTO || 60);

const RUTAS = {
  '/pedidos': process.env.URL_PEDIDOS || 'http://localhost:3001',
  '/inventario': process.env.URL_INVENTARIO || 'http://localhost:3002',
  '/pagos': process.env.URL_PAGOS || 'http://localhost:3003',
  '/notificaciones': process.env.URL_NOTIFICACIONES || 'http://localhost:3004',
};

// --- Middleware: id de peticion + log ---
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  const t0 = Date.now();
  res.on('finish', () => console.log(`[gateway] ${req.id} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t0}ms)`));
  next();
});

// --- Middleware: rate limit en memoria (ventana de 1 minuto por IP) ---
const ventanas = new Map();
app.use((req, res, next) => {
  const ahora = Date.now();
  const v = ventanas.get(req.ip) || { inicio: ahora, n: 0 };
  if (ahora - v.inicio > 60000) { v.inicio = ahora; v.n = 0; }
  v.n += 1;
  ventanas.set(req.ip, v);
  if (v.n > LIMITE_POR_MINUTO) return res.status(429).json({ error: 'Demasiadas peticiones, intenta mas tarde' });
  next();
});

// --- Middleware: autenticacion opcional por API key ---
app.use((req, res, next) => {
  if (!API_KEY || req.path === '/health' || req.path === '/') return next();
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'API key invalida o ausente' });
  next();
});

app.get('/', (req, res) => res.json({ gateway: 'pizzeria', rutas: Object.keys(RUTAS) }));

// Salud agregada: consulta el /health de cada servicio
app.get('/health', async (req, res) => {
  const estados = {};
  await Promise.all(Object.entries(RUTAS).map(async ([prefijo, base]) => {
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
      estados[prefijo.slice(1)] = r.ok ? 'ok' : `error ${r.status}`;
    } catch {
      estados[prefijo.slice(1)] = 'caido';
    }
  }));
  const todoOk = Object.values(estados).every((e) => e === 'ok');
  res.status(todoOk ? 200 : 503).json({ gateway: 'ok', servicios: estados });
});

// --- Proxy por prefijo ---
for (const [prefijo, base] of Object.entries(RUTAS)) {
  app.use(prefijo, async (req, res) => {
    const destino = base + req.originalUrl;
    const tieneCuerpo = !['GET', 'HEAD'].includes(req.method);
    try {
      const resp = await fetch(destino, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': req.id },
        body: tieneCuerpo ? JSON.stringify(req.body ?? {}) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const texto = await resp.text();
      res.status(resp.status).type(resp.headers.get('content-type') || 'application/json').send(texto);
    } catch (err) {
      const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      res.status(timeout ? 504 : 502).json({
        error: timeout ? 'Gateway Timeout: el servicio tardo demasiado' : 'Bad Gateway: servicio no disponible',
        servicio: prefijo.slice(1),
      });
    }
  });
}

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada en el gateway' }));

app.listen(PORT, () => console.log(`gateway escuchando en http://localhost:${PORT}`));