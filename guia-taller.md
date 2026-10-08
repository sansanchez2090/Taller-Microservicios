# Guía del laboratorio — Microservicios y Serverless (Pizzería)
 
Duración estimada: 2 horas · Requisitos: Node.js 18+, `curl` (en Windows `curl.exe`).
 
## Arquitectura
 
```text
                       ┌──────────────────┐
  cliente ───────────► │ gateway  :3000   │  (punto de entrada único)
                       └────────┬─────────┘
                                │ enruta por prefijo
        ┌───────────────────────┼──────────────────────┐
        ▼                       ▼                      ▼
 ┌───────────────┐      ┌───────────────┐      ┌─────────────────┐
 │ pedidos :3001 │─────►│ inventario    │      │ notificaciones  │
 │ (orquestador) │      │ :3002         │      │ :3004           │
 │               │─────►┌───────────────┐      └─────────────────┘
 │               │      │ pagos :3003   │               ▲
 │               │──────┴───────────────┘               │
 └───────┬───────┘───────────────────────────────────────┘
         │
   Flujo de POST /pedidos:
   1) inventario/reservar   (crítico)
   2) pagos                 (crítico; si falla → inventario/liberar)
   3) notificaciones        (NO crítico; si falla el pedido sigue)
```
 
Cada servicio tiene su propio proceso, su propio puerto y su propio estado en
memoria. Solo se comunican por HTTP.
 
---
 
## Parte 1 — Levantar el sistema (15 min)
 
1. Instala dependencias (`npm install`) en cada carpeta de `microservicios/`.
2. Levanta **solo** `inventario` (3002), `pagos` (3003) y `pedidos` (3001), cada
   uno en su terminal.
3. Verifica que cada servicio responde:
```text
   curl.exe http://localhost:3002/health
   curl.exe http://localhost:3003/health
   curl.exe http://localhost:3001/health
```
 
## Parte 2 — Pruebas del flujo normal (15 min)
 
1. Consulta el inventario inicial: `GET http://localhost:3002/inventario`.
2. Crea un pedido: `POST http://localhost:3001/pedidos` con `{"pizza":"hawaiana"}`.
3. Vuelve a consultar el inventario y lista los pedidos (`GET /pedidos`).
4. Prueba una pizza inexistente (`{"pizza":"piña"}`).
5. Agota el stock de `cuatro-quesos` (3 unidades) y haz un cuarto pedido.
**Preguntas:** P1, P2.
 
> Observa: el pedido se confirma aunque `servicio-notificaciones` aún **no está
> levantado**. Fíjate en el campo `notificacion` de la respuesta.
 
## Parte 3 — Fallos (30 min)
 
Con el sistema completo en marcha (incluye la Parte 4 y 5 si ya las tienes),
provoca cada fallo y **anota** el código HTTP, el mensaje, el estado del pedido
y el inventario resultante.
 
| # | Experimento | Cómo provocarlo |
|---|---|---|
| F1 | Pago rechazado | `{"pizza":"margarita","tarjeta":"0000"}` |
| F2 | `servicio-pagos` caído | Ctrl+C en su terminal |
| F3 | `servicio-pagos` lento | Reinícialo con `LATENCIA_MS=5000` |
| F4 | `servicio-notificaciones` caído | Ctrl+C en su terminal |
| F5 | `servicio-inventario` caído | Ctrl+C en su terminal |
 
Después de cada experimento, consulta `GET /inventario` y `GET /pedidos`.
Reinicia el servicio antes del siguiente experimento.
 
**Preguntas:** P3, P4, P5, P6.
 
## Parte 4 — Completar `servicio-notificaciones` (20 min)
 
Implementa el servicio en `microservicios/servicio-notificaciones/index.js`
(puerto 3004). Requisitos:
 
- `GET /health` → `{ servicio, estado: "ok" }`.
- `POST /notificaciones` con `{ pedidoId, mensaje, canal? }`:
  - 400 si falta `pedidoId` o `mensaje`.
  - 400 si el `canal` no es `email`, `sms` o `whatsapp` (por defecto `email`).
  - Guarda la notificación en memoria y responde **201**.
- `GET /notificaciones` → historial, con filtro opcional `?pedidoId=`.
Comprueba que, al levantarlo, `servicio-pedidos` pasa a registrar
`notificacion: "enviada"` sin tocar el código de pedidos.
 
**Pregunta:** P3 (vuelve a comparar).
 
## Parte 5 — Completar el `gateway` (20 min)
 
Implementa en `microservicios/gateway/index.js` (puerto 3000):
 
- Enrutamiento por prefijo: `/pedidos`, `/inventario`, `/pagos`, `/notificaciones`.
- Cabecera `X-Request-Id` y log de cada petición (método, ruta, estado, ms).
- `502 Bad Gateway` si el servicio no responde y `504` si excede el timeout.
- `GET /health` que agregue el estado de todos los servicios.
- Extras: límite de peticiones por IP (429) y API key opcional (401).
Repite las pruebas de la Parte 2 usando el puerto **3000** en lugar de 3001/3002,
y observa qué ocurre con un servicio caído.
 
**Pregunta:** P7.
 
## Parte 6 — Función Serverless (20 min)
 
1. Entra a `serverless/funcion-pedido`, ejecuta `npm install` y `node local.js`.
2. Llama a la función:
```text
   curl.exe -X POST http://localhost:4000/api/pedido -H "Content-Type: application/json" -d '{\"pizza\":\"hawaiana\"}'
```
3. Prueba una pizza inválida y una petición `GET`.
4. (Opcional) Despliégala en Vercel (`/api/pedido`) o Netlify
   (`/.netlify/functions/pedido`) y mide el tiempo de la **primera** llamada y
   el de las siguientes.
5. Compara con `POST /pedidos` del microservicio: ¿qué hace una y qué no hace la otra?
**Preguntas:** P8, P9.
 
## Parte 7 — Reflexión final
 
**Pregunta:** P10.
 
---
 
## Preguntas del taller
 
- **P1.** ¿Qué responsabilidad tiene cada servicio y cuál de ellos coordina el flujo?
- **P2.** Describe paso a paso qué ocurre internamente cuando haces `POST /pedidos`.
- **P3.** ¿Qué pasa con el pedido si `servicio-notificaciones` está apagado? ¿Por
  qué `servicio-pedidos` lo trata distinto a inventario y pagos?
- **P4.** ¿Qué ocurre si `servicio-pagos` está caído o rechaza el pago? ¿Qué pasa
  con el stock y por qué?
- **P5.** ¿Qué ocurre si `servicio-pagos` responde muy lento? ¿Qué problema de
  consistencia puede aparecer y cómo se mitiga?
- **P6.** ¿Qué ocurre si `servicio-inventario` está caído? ¿Por qué aquí no hay
  nada que compensar?
- **P7.** ¿Qué ventajas aporta el API Gateway? ¿Qué riesgo introduce?
- **P8.** Compara la función Serverless con el microservicio de pedidos
  (estado, escalado, costo, arranque en frío, límites).
- **P9.** ¿Para qué parte de la pizzería usarías Serverless y para cuál
  microservicios? Justifica.
- **P10.** Menciona al menos cuatro mejoras para llevar este sistema a producción.
## Entrega
 
Completa `respuestas/respuestas.md` con tus observaciones (códigos HTTP,
salidas de `curl` y conclusiones).
 