// servicio-notificaciones (puerto 3004): envia (simula) mensajes al cliente.
const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const CANALES = ['email', 'sms', 'whatsapp'];
const enviadas = []; // historial en memoria

app.get('/health', (req, res) => res.json({ servicio: 'notificaciones', estado: 'ok' }));

// Historial (opcionalmente filtrado por pedido: /notificaciones?pedidoId=1)
app.get('/notificaciones', (req, res) => {
  const { pedidoId } = req.query;
  const lista = pedidoId ? enviadas.filter((n) => n.pedidoId === Number(pedidoId)) : enviadas;
  res.json({ total: lista.length, notificaciones: lista });
});

// Registrar/enviar una notificacion
app.post('/notificaciones', (req, res) => {
  const { pedidoId, mensaje, canal = 'email' } = req.body || {};
  if (!pedidoId || !mensaje) return res.status(400).json({ error: 'pedidoId y mensaje son obligatorios' });
  if (!CANALES.includes(canal)) return res.status(400).json({ error: `Canal invalido. Usa: ${CANALES.join(', ')}` });

  const notificacion = { id: enviadas.length + 1, pedidoId: Number(pedidoId), mensaje, canal, enviada: new Date().toISOString() };
  enviadas.push(notificacion);
  console.log(`[notificaciones] (${canal}) pedido ${pedidoId}: ${mensaje}`);
  res.status(201).json({ ok: true, notificacion });
});

app.listen(PORT, () => console.log(`servicio-notificaciones escuchando en http://localhost:${PORT}`));