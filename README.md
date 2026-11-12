# KrmaVerso Store — frontend y API

Este paquete contiene las páginas HTML, CSS y JavaScript de la tienda, además de una API FastAPI que usa PostgreSQL.

## Importante: estado real de este paquete

- El frontend principal (`index.html`, `cuenta.html`, categorías) usa `config.js` y `app.js`.
- `tienda.html` es una página independiente heredada; usa los mismos endpoints de API.
- La API admite registro, inicio de sesión, perfil, catálogo, creación/cancelación de pedidos y confirmación administrativa de pagos.
- Los pedidos toman nombre y precio del catálogo del servidor, no del precio enviado por el navegador.
- El sistema de referidos, descuentos y cupones NO está implementado en este paquete.
- El checkout de Wompi es un enlace fijo y NO confirma pagos automáticamente. El administrador debe verificar el pago en Wompi antes de marcarlo como pagado.
- Este ZIP no incluye un catálogo de productos precargado. La tabla `products` estará vacía hasta agregar productos desde `POST /api/admin/products` con el encabezado `X-Admin-Secret`.

## Render

**Build command**
```bash
pip install -r requirements.txt
```

**Start command**
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Configura estas variables privadas en Render:

- `DATABASE_URL`: URL de PostgreSQL.
- `JWT_SECRET`: secreto aleatorio largo (mínimo 32 caracteres).
- `ADMIN_SECRET`: otra clave aleatoria larga (mínimo 24 caracteres).
- `CORS_ORIGINS`: dominios autorizados separados por coma; por ejemplo `https://krmaverse.github.io`.

No subas valores secretos a GitHub ni los compartas en capturas.

## Comprobación

- `/health`: comprueba también la conexión a PostgreSQL. Responde `503` si la base de datos no está disponible.
- `/docs`: documentación interactiva de la API.

## Rutas principales

- `POST /api/auth/register` y `POST /api/register`
- `POST /api/auth/login` y `POST /api/login`
- `GET /api/me`
- `GET /api/catalog`
- `POST /api/orders` (requiere `product_id` y sesión)
- `GET /api/orders`
- `POST /api/orders/{order_id}/cancel`
- `GET /api/admin/orders` (requiere `X-Admin-Secret`)
- `POST` o `PATCH /api/admin/orders/{order_id}/paid` (requiere `X-Admin-Secret`)
- `POST /api/admin/products` (requiere `X-Admin-Secret`)

## Aviso de compatibilidad de base de datos

`create_all` crea tablas que no existan, pero no modifica automáticamente tablas antiguas. Haz una copia de seguridad antes de cualquier cambio de esquema.
