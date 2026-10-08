# Taller de Microservicios y Serverless — Pizzería
 
Estudiante: Santiago Sánchez Moya
 
## Descripción
 
Sistema de ejemplo de una pizzería usado para practicar Microservicios y
Serverless. El sistema recibe pedidos de pizza y los procesa coordinando varios
servicios independientes que se comunican por HTTP. Incluye además una función
Serverless de ejemplo.
 
## Objetivo
 
Ejecutar y probar un sistema de microservicios, observar su comportamiento ante
fallos, completar un microservicio nuevo y consumir una función Serverless para
compararla con los microservicios.
 
## Tecnologías
 
- Node.js
- Express (microservicios y API Gateway)
- Función Serverless compatible con Vercel/Netlify
## Estructura
 
```text
taller-microservicios-serverless/
├── microservicios/
│   ├── servicio-pedidos/         (coordina el pedido)
│   ├── servicio-inventario/      (controla el stock)
│   ├── servicio-pagos/           (simula el cobro)
│   ├── servicio-notificaciones/  (lo completa el estudiante)
│   └── gateway/                  (punto de entrada único, lo completa el estudiante)
├── serverless/
│   └── funcion-pedido/           (función Serverless de ejemplo)
├── respuestas/
│   └── respuestas.md             (respuestas del taller)
├── guia-taller.md                (guía del laboratorio)
└── README.md
```
 
## Servicios y puertos
 
| Servicio | Puerto |
|---|---|
| servicio-pedidos | 3001 |
| servicio-inventario | 3002 |
| servicio-pagos | 3003 |
| servicio-notificaciones | 3004 |
| gateway | 3000 |
 
## Cómo ejecutar
 
Instala dependencias en cada servicio y ejecútalos en terminales separadas
(requiere Node.js 18 o superior).
 
```text
# Terminal 1
cd microservicios/servicio-inventario
npm install
node index.js
 
# Terminal 2
cd microservicios/servicio-pagos
npm install
node index.js
 
# Terminal 3
cd microservicios/servicio-pedidos
npm install
node index.js
```
 
El cuarto microservicio (`servicio-notificaciones`, puerto 3004) y el `gateway`
(puerto 3000) se levantan igual, cada uno en su terminal.
 
> Atajo opcional: después de hacer `npm install` en los cinco servicios,
> `node scripts/levantar-todo.js` los levanta todos en una sola terminal.
 
## Pruebas principales
 
Crear un pedido:
 
```text
curl.exe -X POST http://localhost:3001/pedidos -H "Content-Type: application/json" -d '{\"pizza\":\"hawaiana\"}'
```
 
Consultar inventario:
 
```text
curl.exe http://localhost:3002/inventario
```
 
A través del gateway puedes hacer lo mismo usando el punto de entrada único en el
puerto 3000:
 
```text
curl.exe -X POST http://localhost:3000/pedidos -H "Content-Type: application/json" -d '{\"pizza\":\"hawaiana\"}'
curl.exe http://localhost:3000/inventario
```
 
> En Linux/macOS usa `curl` en lugar de `curl.exe` y comillas simples sin
> escapar: `-d '{"pizza":"hawaiana"}'`.
 
El paso a paso completo del laboratorio, las actividades y las preguntas están
en `guia-taller.md`.
 
## Referencia rápida de la API
 
| Servicio | Endpoint | Descripción |
|---|---|---|
| pedidos | `POST /pedidos` `{pizza, tarjeta?}` | Crea y orquesta un pedido |
| pedidos | `GET /pedidos`, `GET /pedidos/:id` | Lista / consulta pedidos |
| inventario | `GET /inventario` | Stock actual |
| inventario | `POST /inventario/reservar` · `/liberar` | Descuenta / devuelve una unidad |
| pagos | `POST /pagos` `{pedidoId, monto, tarjeta?}` | Simula el cobro (tarjeta `0000` = rechazada) |
| notificaciones | `POST /notificaciones` `{pedidoId, mensaje, canal?}` | Registra un envío (`email`, `sms`, `whatsapp`) |
| notificaciones | `GET /notificaciones[?pedidoId=1]` | Historial de envíos |
| gateway | `GET /health` | Estado agregado de todos los servicios |
 
Pizzas disponibles: `hawaiana`, `pepperoni`, `margarita`, `cuatro-quesos`.
 
### Variables de entorno útiles para los experimentos
 
| Variable | Servicio | Efecto |
|---|---|---|
| `LATENCIA_MS` | pagos | Retraso artificial del cobro (por defecto 300) |
| `TIMEOUT_MS` | pedidos / gateway | Tiempo máximo de espera por llamada (2000 / 5000) |
| `API_KEY` | gateway | Si se define, exige la cabecera `x-api-key` |
| `LIMITE_POR_MINUTO` | gateway | Máx. de peticiones por IP por minuto (60) |
 
Ejemplo (PowerShell): `$env:LATENCIA_MS=5000; node index.js`
 
## Función Serverless
 
```text
cd serverless/funcion-pedido
npm install
node local.js          # http://localhost:4000/api/pedido
```
 
```text
curl.exe -X POST http://localhost:4000/api/pedido -H "Content-Type: application/json" -d '{\"pizza\":\"hawaiana\"}'
```
 
- **Vercel:** `vercel deploy` → expone `POST /api/pedido`.
- **Netlify:** `netlify deploy` → expone `POST /.netlify/functions/pedido`.
## Respuestas
 
Las respuestas de las preguntas del taller se encuentran en:
`respuestas/respuestas.md`
 