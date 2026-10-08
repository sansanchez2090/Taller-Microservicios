# Respuestas del taller — Microservicios y Serverless
 
**Estudiante:** Santiago Sánchez Moya
 
Las salidas mostradas fueron obtenidas ejecutando el sistema completo
(Node.js 22, los 5 servicios + función serverless).
 
---
 
## P1. Responsabilidad de cada servicio
 
| Servicio | Responsabilidad |
|---|---|
| **servicio-pedidos** (3001) | **Orquestador**: recibe el pedido, valida la pizza, calcula el monto y coordina a los demás. Guarda el estado del pedido. |
| **servicio-inventario** (3002) | Dueño del stock: consulta, reserva y libera unidades. |
| **servicio-pagos** (3003) | Simula el cobro y devuelve un `transaccionId` (o rechaza con 402). |
| **servicio-notificaciones** (3004) | Registra/envía mensajes al cliente por email, sms o whatsapp. |
| **gateway** (3000) | Punto de entrada único: enruta, registra, limita y traduce errores. No contiene lógica de negocio. |
 
El que **coordina el flujo es `servicio-pedidos`** (patrón orquestación): los
otros servicios no se llaman entre sí, solo responden a pedidos.
 
---
 
## P2. Qué ocurre en `POST /pedidos`
 
1. (Opcional) El **gateway** recibe la petición, asigna `X-Request-Id` y la reenvía a `:3001`.
2. `pedidos` valida que la pizza exista (si no → **400**), crea el pedido (`estado: creado`).
3. Llama a `inventario /reservar` → descuenta 1 unidad (si no hay stock → **409**).
4. Llama a `pagos /pagos` con `{pedidoId, monto, tarjeta}` → obtiene `transaccionId` (`estado: pagado`).
5. Llama a `notificaciones` (best-effort) → `notificacion: enviada | no_enviada`.
6. Marca `estado: confirmado` y responde **201**.
Evidencia (todo arriba, vía gateway):
 
```json
{"mensaje":"Pedido confirmado","pedido":{"id":2,"pizza":"pepperoni","monto":30000,
 "estado":"confirmado","notificacion":"enviada","transaccionId":"TX-00002"}}   // HTTP 201
```
 
Inventario antes → después: `pepperoni: 5 → 4`. Casos límite verificados:
 
| Caso | Resultado |
|---|---|
| Pizza `piña` | **400** `Pizza invalida. Opciones: …` |
| 4.º pedido de `cuatro-quesos` (stock 3) | **409** `Sin stock de 'cuatro-quesos'`, estado `rechazado_sin_stock` |
 
---
 
## P3. `servicio-notificaciones` apagado
 
**El pedido se confirma igual (HTTP 201)**, pero con `"notificacion": "no_enviada"`:
 
```json
{"mensaje":"Pedido confirmado","pedido":{"id":1,"pizza":"hawaiana","estado":"confirmado",
 "notificacion":"no_enviada","transaccionId":"TX-00001"}}                       // HTTP 201
```
 
En el log de pedidos: `notificacion no enviada (se ignora): No se pudo conectar con …:3004`.
 
**Por qué se trata distinto:** inventario y pagos son **dependencias críticas**
(sin stock o sin cobro no hay pedido válido), mientras que la notificación es
**secundaria**: el cliente ya pagó y la pizza se prepara aunque el aviso falle.
Esto es **degradación elegante** (*graceful degradation*): una falla parcial no
tumba todo el sistema. Si se consulta directamente por el gateway,
`GET /notificaciones` con el servicio caído responde **502**
`Bad Gateway: servicio no disponible`.
 
Mejora: guardar la notificación pendiente y reintentarla después (cola).
 
---
 
## P4. `servicio-pagos` caído o con pago rechazado
 
**a) Pago rechazado (tarjeta `0000`)** → **402** y estado `pago_rechazado`:
 
```json
{"error":"Tarjeta rechazada","pedido":{"id":3,"pizza":"margarita","estado":"pago_rechazado",
 "stockLiberado":true}}                                                          // HTTP 402
```
 
**b) Servicio caído** → **503** y estado `fallido_pago`:
 
```json
{"error":"Servicio de pagos no disponible: No se pudo conectar con http://localhost:3003/pagos",
 "pedido":{"id":8,"estado":"fallido_pago","stockLiberado":true}}                // HTTP 503
```
 
**Qué pasa con el stock:** en ambos casos el stock ya se había reservado en el
paso 1, así que `pedidos` ejecuta una **compensación** llamando a
`inventario /liberar`. Comprobado: `margarita` quedó en **5** después del
rechazo (log: `reservada … quedan 4` seguido de `liberada … quedan 5`).
Sin esta compensación se perdería stock por pedidos que nunca se cobraron.
Es una versión simple del **patrón Saga** (transacción distribuida con
acciones compensatorias, ya que no existe una transacción ACID entre servicios).
 
Con el pago caído el gateway indica el problema en `GET /health`:
`{"pagos":"caido"}` con **HTTP 503**.
 
---
 
## P5. `servicio-pagos` lento
 
Con `LATENCIA_MS=5000` y `TIMEOUT_MS=2000` en pedidos, la petición tardó
**≈2.02 s** y respondió **504** (`Timeout (2000ms) llamando a …/pagos`), con
`estado: fallido_pago` y stock liberado.
 
**Beneficio del timeout:** sin él, el cliente y los recursos de `pedidos`
quedarían esperando indefinidamente (fallo en cascada).
 
**Problema de consistencia:** `pedidos` abandona la espera, pero el servicio de
pagos **no sabe que fue cancelado** y puede terminar de procesar el cobro unos
segundos después. Resultado: *cliente cobrado sin pedido confirmado* (o cobro
duplicado si el cliente reintenta).
 
**Mitigaciones:**
- **Idempotencia**: enviar una `Idempotency-Key` (p. ej. el `pedidoId`) para que reintentar no cobre dos veces.
- Consultar el estado del cobro antes de dar el pedido por fallido, o conciliar periódicamente.
- Reintentos con *backoff* y **circuit breaker** para no saturar un servicio degradado.
- Comunicación asíncrona (cola/eventos) para pagos.
---
 
## P6. `servicio-inventario` caído
 
Respuesta **503**, estado `fallido_inventario`:
 
```json
{"error":"Servicio de inventario no disponible: No se pudo conectar con http://localhost:3002/inventario/reservar",
 "pedido":{"id":11,"estado":"fallido_inventario"}}                               // HTTP 503
```
 
**No hay nada que compensar** porque el inventario es el **primer paso**: aún no
se ha reservado stock ni cobrado nada. El orden de los pasos importa: se
ejecutan primero las operaciones más baratas de revertir y se deja el cobro
para después de asegurar el stock.
 
---
 
## P7. API Gateway: ventajas y riesgos
 
**Ventajas (implementadas y probadas):**
- **Punto de entrada único**: el cliente solo conoce `:3000`; puertos y ubicación de los servicios quedan ocultos.
- **Preocupaciones transversales centralizadas**: log con `X-Request-Id` (permite trazar una petición entre servicios), rate limiting (**429**), API key (**401** sin clave; **200** con `x-api-key`).
- **Traducción de errores**: `502` si el servicio no responde, `504` si tarda, `404` para rutas inexistentes.
- **Salud agregada** (`/health`) y desacople: se puede mover/escalar un servicio sin cambiar a los clientes.
**Riesgos:**
- **Punto único de falla (SPOF)**: si el gateway cae, nada es accesible → se mitiga con varias réplicas detrás de un balanceador.
- **Cuello de botella** y latencia extra (un salto más).
- Si se le añade lógica de negocio, se convierte en un monolito disfrazado.
---
 
## P8. Función Serverless vs. microservicio de pedidos
 
| Aspecto | Microservicio `pedidos` | Función serverless `funcion-pedido` |
|---|---|---|
| **Ejecución** | Proceso siempre encendido (`node index.js`) | Se ejecuta **por petición**; la plataforma la inicia y la apaga |
| **Estado** | Guarda pedidos en memoria (`GET /pedidos`) | **Sin estado**: no guarda nada; cada invocación es independiente |
| **Dependencias** | Coordina inventario, pagos y notificaciones | Solo valida y calcula; no consulta inventario ni cobra |
| **Escalado** | Manual (lanzar más instancias + balanceador) | **Automático** (de 0 a N instancias) |
| **Costo** | Se paga por tener el servidor encendido, haya o no tráfico | Se paga **por invocación/tiempo de ejecución**; sin tráfico, ~0 |
| **Arranque en frío** | No (ya está corriendo) | **Sí**: la primera llamada tras inactividad es más lenta |
| **Límites** | Sin límite de duración, conexiones persistentes | Duración máxima (p. ej. 10 s configurado en `vercel.json`), sin estado local persistente |
| **Operación** | Tú gestionas el proceso, puertos, despliegue | Solo despliegas el código (`/api/pedido`) |
 
Pruebas realizadas (modo local): `POST` válido → **201** con id `FN-…`;
pizza inválida → **400**; `GET` → **405**. Handler de Netlify → **201**.
Nota: el arranque en frío solo se puede medir desplegando la función en
Vercel/Netlify (en local responde en ~15 ms porque no hay arranque en frío).
 
---
 
## P9. ¿Qué usar y dónde?
 
**Serverless** para tareas **sin estado, cortas, con tráfico irregular o
por eventos**: validar/calcular el precio de un pedido, enviar notificaciones
(email/sms), generar un recibo, procesar un webhook de la pasarela de pago,
tareas programadas. Se paga solo cuando hay pedidos (ideal en horas valle).
 
**Microservicios** para lo que requiere **estado, consistencia y baja latencia
constante**: `inventario` (stock compartido, fuente de verdad) y `pedidos`
(orquestación y estado del flujo), y `pagos` si necesita conexiones
persistentes y control fino de reintentos.
 
Un diseño **híbrido** es lo más realista: el núcleo transaccional como
microservicios y las piezas periféricas y de picos como funciones.
 
---
 
## P10. Mejoras para producción
 
1. **Persistencia real**: base de datos por servicio (hoy todo se pierde al reiniciar; stock, pedidos y notificaciones están en memoria).
2. **Mensajería asíncrona** (RabbitMQ/Kafka/SQS) para notificaciones y eventos de pedido: reintentos y desacople temporal.
3. **Resiliencia**: reintentos con *backoff*, **circuit breaker**, idempotencia en pagos y Saga completa (con persistencia del estado del pedido).
4. **Observabilidad**: logs estructurados, trazas distribuidas (OpenTelemetry usando `X-Request-Id`), métricas y alertas; *health checks* usados por el orquestador.
5. **Seguridad**: autenticación real (JWT/OAuth2) en el gateway, HTTPS/mTLS entre servicios, validación de entradas, gestión de secretos.
6. **Despliegue**: contenedores (Docker + docker-compose/Kubernetes), CI/CD, configuración por variables de entorno (ya soportada).
7. **Concurrencia en inventario**: operaciones atómicas en BD para evitar vender más de lo que hay.
8. **Gateway replicado** y descubrimiento de servicios para evitar el SPOF.
 