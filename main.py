
import json
import os
import secrets
from pathlib import Path
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from pwdlib import PasswordHash
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session


# ==================================================
# CONFIGURACIÓN
# ==================================================

DATABASE_URL = os.getenv("DATABASE_URL", "")
JWT_SECRET = os.getenv("JWT_SECRET", "")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")
DEFAULT_CORS_ORIGINS = ["https://krmaverse.github.io", "https://krmaverso-store.github.io"]
CORS_ORIGINS = list(dict.fromkeys(
    DEFAULT_CORS_ORIGINS
    + [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
))

if not DATABASE_URL:
    raise RuntimeError("Falta configurar DATABASE_URL en Render.")

if not JWT_SECRET:
    raise RuntimeError("Falta configurar JWT_SECRET en Render.")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://", "postgresql+psycopg://", 1
    )
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://", "postgresql+psycopg://", 1
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"connect_timeout": 15},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()
password_hash = PasswordHash.recommended()


# ==================================================
# MODELOS DE BASE DE DATOS
# ==================================================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    referral_code = Column(String(24), unique=True, index=True, nullable=True)
    referred_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(180), nullable=False)
    description = Column(Text, default="")
    category = Column(String(100), default="Digital")
    price = Column(Float, nullable=True, default=None)
    image = Column(Text, default="")
    active = Column(Boolean, default=True)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    customer_name = Column(String(120), nullable=False)
    customer_email = Column(String(180), nullable=True)
    product_name = Column(String(180), nullable=False)
    quantity = Column(Integer, default=1)
    total = Column(Float, nullable=False)
    status = Column(String(40), default="pendiente")
    payment_reference = Column(String(180), nullable=True)
    discount = Column(Float, default=0)
    coupon_id = Column(Integer, ForeignKey("coupons.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True)
    amount = Column(Float, nullable=False, default=3000)
    status = Column(String(24), nullable=False, default="disponible")
    source_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    redeemed_at = Column(DateTime, nullable=True)


# ==================================================
# ESQUEMAS DE SOLICITUD
# ==================================================

class RegisterData(BaseModel):
    name: str
    email: EmailStr
    password: str
    referral_code: str | None = None


class LoginData(BaseModel):
    email: EmailStr
    password: str


class OrderData(BaseModel):
    product_id: int | None = None
    customer_name: str | None = None
    customer_email: EmailStr | None = None
    product_name: str | None = None
    quantity: int = 1
    total: float | None = None
    payment_reference: str | None = None
    coupon_code: str | None = None


class ProductData(BaseModel):
    name: str
    description: str = ""
    category: str = "Digital"
    price: float | None = None
    image: str = ""
    active: bool = True


# ==================================================
# APLICACIÓN FASTAPI
# ==================================================

app = FastAPI(
    title="KRMA VERSO API",
    description="Backend oficial de KRMA VERSO Store",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# CONEXIÓN A BASE DE DATOS
# ==================================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def startup():
    # Fallar el despliegue si PostgreSQL no conecta; no anunciar un servicio sano sin BD.
    with engine.begin() as connection:
        connection.execute(text("SELECT 1"))
    Base.metadata.create_all(bind=engine)

    # Migraciones aditivas: conservan usuarios, productos y pedidos existentes.
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(24)"))
        connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id)"))
        connection.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount FLOAT NOT NULL DEFAULT 0"))
        connection.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id)"))

    # Permitir productos cuyo precio se confirma por WhatsApp.
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE products ALTER COLUMN price DROP NOT NULL"))

    # Recuperar el catálogo histórico una sola vez, solo si la tabla está vacía.
    db = SessionLocal()
    try:
        if db.query(Product).count() == 0:
            catalog_path = Path(__file__).with_name("catalog_seed.json")
            if catalog_path.exists():
                with catalog_path.open("r", encoding="utf-8") as file:
                    catalog_items = json.load(file)
                for item in catalog_items:
                    db.add(Product(**item))
                db.commit()
                print(f"Catálogo KRMA VERSO cargado: {len(catalog_items)} productos.")
            else:
                print("No se encontró catalog_seed.json; catálogo sin precargar.")
    finally:
        db.close()

    print("Base de datos KRMA VERSO conectada y tablas verificadas.")


# ==================================================
# AUTENTICACIÓN
# ==================================================

def create_token(user_id: int):
    expiration = datetime.now(timezone.utc) + timedelta(days=7)

    payload = {
        "sub": str(user_id),
        "exp": expiration,
    }

    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_current_user(
    authorization: str = Header(default=None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token de autenticación requerido",
        )

    token = authorization.replace("Bearer ", "", 1)

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
        )
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Sesión inválida o vencida",
        )

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Usuario no encontrado",
        )

    return user


def verify_admin(
    x_admin_secret: str = Header(default=None),
):
    if not ADMIN_SECRET or not x_admin_secret:
        raise HTTPException(
            status_code=403,
            detail="Acceso administrativo no autorizado",
        )

    if not secrets.compare_digest(x_admin_secret, ADMIN_SECRET):
        raise HTTPException(
            status_code=403,
            detail="Clave administrativa incorrecta",
        )

    return True


# ==================================================
# RUTAS PRINCIPALES
# ==================================================

@app.get("/")
def home():
    return {
        "message": "KRMA VERSO Store API funcionando",
        "status": "online",
        "version": "1.0.0",
    }


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="PostgreSQL no está disponible")
    return {"status": "ok", "database": "connected", "service": "KRMA VERSO Backend"}


# ==================================================
# CATÁLOGO
# ==================================================

@app.get("/api/catalog")
def get_catalog(db: Session = Depends(get_db)):
    products = (
        db.query(Product)
        .filter(Product.active == True)
        .order_by(Product.id.desc())
        .all()
    )

    return [
        {
            "id": product.id,
            "name": product.name,
            "nombre": product.name,
            "description": product.description,
            "descripcion": product.description,
            "category": product.category,
            "price": product.price,
            "precio": product.price,
            "image": product.image,
            "active": product.active,
        }
        for product in products
    ]


@app.post("/api/admin/products")
def create_product(
    data: ProductData,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin),
):
    if data.price is not None and data.price < 0:
        raise HTTPException(status_code=400, detail="Precio inválido")

    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)

    return {
        "message": "Producto creado",
        "id": product.id,
    }


# ==================================================
# REGISTRO
# ==================================================

@app.post("/api/auth/register")
@app.post("/api/register")
def register(
    data: RegisterData,
    db: Session = Depends(get_db),
):
    existing = (
        db.query(User)
        .filter(User.email == data.email.lower())
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Este correo ya está registrado",
        )

    if len(data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe tener al menos 8 caracteres",
        )

    referrer = None
    referral_code = (data.referral_code or "").strip().upper()
    if referral_code:
        referrer = db.query(User).filter(User.referral_code == referral_code).first()
        if not referrer:
            raise HTTPException(status_code=400, detail="El código de referido no existe.")

    own_code = secrets.token_hex(4).upper()
    while db.query(User).filter(User.referral_code == own_code).first():
        own_code = secrets.token_hex(4).upper()

    user = User(
        name=data.name.strip(),
        email=data.email.lower(),
        password=password_hash.hash(data.password),
        referral_code=own_code,
        referred_by_user_id=referrer.id if referrer else None,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id)
    return {
        "message": "Cuenta creada correctamente",
        "token": token,
        "access_token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
        },
    }


# ==================================================
# INICIO DE SESIÓN
# ==================================================

@app.post("/api/auth/login")
@app.post("/api/login")
def login(
    data: LoginData,
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == data.email.lower())
        .first()
    )

    if not user or not password_hash.verify(
        data.password,
        user.password,
    ):
        raise HTTPException(
            status_code=401,
            detail="Correo o contraseña incorrectos",
        )

    token = create_token(user.id)
    return {
        "message": "Inicio de sesión correcto",
        "token": token,
        "access_token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
        },
    }


# ==================================================
# PERFIL DEL USUARIO
# ==================================================

@app.get("/api/me")
def get_me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.referral_code:
        user.referral_code = secrets.token_hex(4).upper()
        db.commit()
    coupons = db.query(Coupon).filter(Coupon.user_id == user.id).order_by(Coupon.id.desc()).all()
    paid_orders = db.query(Order).filter(Order.user_id == user.id, Order.status == "pagado").count()
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "referral_code": user.referral_code,
        "referral_link": "https://krmaverso-store.github.io/KrmaFree-Store/cuenta.html?ref=" + user.referral_code,
        "first_purchase_available": paid_orders == 0,
        "referred_by": user.referred_by_user_id is not None,
        "coupons": [{
            "id": coupon.id, "code": coupon.code, "amount": coupon.amount,
            "status": coupon.status, "expires_at": coupon.expires_at.isoformat(),
        } for coupon in coupons],
    }


# ==================================================
# PEDIDOS
# ==================================================

@app.post("/api/orders")
def create_order(
    data: OrderData,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if data.quantity < 1:
        raise HTTPException(status_code=400, detail="Cantidad inválida")

    # El precio y el nombre siempre se toman del catálogo del servidor.
    if data.product_id is not None:
        product = db.query(Product).filter(Product.id == data.product_id, Product.active == True).first()
        if not product:
            raise HTTPException(status_code=404, detail="Producto no encontrado o no disponible")
        product_name = product.name
        if product.price is None:
            raise HTTPException(
                status_code=400,
                detail="Este producto requiere confirmar el precio por WhatsApp",
            )
        total = float(product.price) * data.quantity
    else:
        # Compatibilidad temporal con clientes antiguos; no confiar en precios enviados por el navegador.
        raise HTTPException(status_code=400, detail="Debes seleccionar un producto válido del catálogo")

    coupon = None
    discount = 0.0
    if data.coupon_code:
        coupon = db.query(Coupon).filter(
            Coupon.code == data.coupon_code.strip().upper(),
            Coupon.user_id == user.id,
            Coupon.status == "disponible",
        ).first()
        if not coupon:
            raise HTTPException(status_code=400, detail="Cupón inválido, usado o no pertenece a tu cuenta.")
        if coupon.expires_at < datetime.utcnow():
            coupon.status = "vencido"
            db.commit()
            raise HTTPException(status_code=400, detail="Este cupón ya venció.")
        discount = min(float(coupon.amount), total)
        coupon.status = "reservado"

    order = Order(
        user_id=user.id,
        customer_name=(data.customer_name or user.name).strip(),
        customer_email=data.customer_email or user.email,
        product_name=product_name,
        quantity=data.quantity,
        total=round(total - discount, 2),
        discount=discount,
        coupon_id=coupon.id if coupon else None,
        payment_reference=data.payment_reference,
    )

    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        "message": "Pedido creado correctamente",
        "order_id": order.id,
        "product_name": order.product_name,
        "subtotal": total,
        "discount": discount,
        "total": round(total - discount, 2),
        "status": order.status,
    }


@app.get("/api/orders")
def get_my_orders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == user.id)
        .order_by(Order.id.desc())
        .all()
    )

    return [
        {
            "id": order.id,
            "product_name": order.product_name,
            "quantity": order.quantity,
            "total": order.total,
            "discount": order.discount or 0,
            "status": order.status,
            "created_at": order.created_at.isoformat(),
        }
        for order in orders
    ]


@app.post("/api/orders/{order_id}/cancel")
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id, Order.user_id == user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.status != "pendiente":
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar pedidos pendientes")
    order.status = "cancelado"
    if order.coupon_id:
        coupon = db.query(Coupon).filter(Coupon.id == order.coupon_id).first()
        if coupon and coupon.status == "reservado":
            coupon.status = "disponible"
    db.commit()
    return {"message": "Pedido cancelado", "order_id": order.id, "status": order.status}


# ==================================================
# ADMINISTRACIÓN DE PEDIDOS
# ==================================================

@app.get("/api/admin/orders")
def admin_get_orders(
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin),
):
    orders = db.query(Order).order_by(Order.id.desc()).all()

    return [
        {
            "id": order.id,
            "user_id": order.user_id,
            "customer_name": order.customer_name,
            "customer_email": order.customer_email,
            "product_name": order.product_name,
            "quantity": order.quantity,
            "total": order.total,
            "status": order.status,
            "payment_reference": order.payment_reference,
            "created_at": order.created_at.isoformat(),
        }
        for order in orders
    ]


@app.post("/api/admin/orders/{order_id}/paid")
@app.patch("/api/admin/orders/{order_id}/paid")
def mark_order_paid(
    order_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin),
):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Pedido no encontrado",
        )

    if order.status == "pagado":
        return {"message": "Este pedido ya estaba pagado.", "order_id": order.id, "status": order.status}

    previous_paid = db.query(Order).filter(
        Order.user_id == order.user_id, Order.status == "pagado"
    ).count() if order.user_id else 0
    order.status = "pagado"
    if order.coupon_id:
        coupon = db.query(Coupon).filter(Coupon.id == order.coupon_id).first()
        if coupon:
            coupon.status = "usado"
            coupon.redeemed_at = datetime.utcnow()

    # Al confirmar la primera compra de un referido, ambos reciben un cupón.
    if order.user_id and previous_paid == 0:
        buyer = db.query(User).filter(User.id == order.user_id).first()
        if buyer and buyer.referred_by_user_id:
            referrer = db.query(User).filter(User.id == buyer.referred_by_user_id).first()
            already_rewarded = db.query(Coupon).filter(Coupon.source_user_id == buyer.id).count()
            if referrer and not already_rewarded:
                expiry = datetime.utcnow() + timedelta(days=90)
                for beneficiary in (referrer, buyer):
                    code = "KRMA" + secrets.token_hex(3).upper()
                    while db.query(Coupon).filter(Coupon.code == code).first():
                        code = "KRMA" + secrets.token_hex(3).upper()
                    db.add(Coupon(
                        user_id=beneficiary.id, code=code, amount=3000,
                        status="disponible", source_user_id=buyer.id, expires_at=expiry,
                    ))

    db.commit()

    return {
        "message": "Pago confirmado. Si era la primera compra de un referido, los dos cupones ya están disponibles.",
        "order_id": order.id,
        "status": order.status,
    }
