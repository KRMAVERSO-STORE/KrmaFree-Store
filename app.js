
(() => {
  "use strict";

  const CFG = window.KRMA_CONFIG || {};
  const API = (CFG.API_BASE || "https://krmafree-verso-store.onrender.com").replace(/\/$/, "");
  const WOMPI = CFG.WOMPI_URL || "";
  const WA = "https://wa.me/" + (CFG.WHATSAPP_NUMBER || "573215201208") + "?text=";

  const $ = id => document.getElementById(id);

  let token = localStorage.getItem("krma_token") || "";
  let products = [];
  let adminSecret = "";

  function money(value) {
    return "$" + Number(value || 0).toLocaleString("es-CO") + " COP";
  }

  function showMessage(message) {
    const el = $("message");
    if (el) {
      el.textContent = message;
      el.classList.remove("hidden");
    }

    const error = $("error");
    if (error) {
      error.textContent = "";
      error.classList.add("hidden");
    }
  }

  function showError(message) {
    const el = $("error");
    if (el) {
      el.textContent = message;
      el.classList.remove("hidden");
    }

    const msg = $("message");
    if (msg) {
      msg.textContent = "";
      msg.classList.add("hidden");
    }
  }

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    let response;

    try {
      response = await fetch(API + path, {
        ...options,
        headers
      });
    } catch (error) {
      throw new Error("No se pudo conectar con el servidor. Comprueba Render.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || "Error al comunicarse con el servidor.");
    }

    return data;
  }

  function saveSession(result) {
    if (!result || !result.token) {
      throw new Error("El servidor no entregó el token de acceso.");
    }

    token = result.token;
    localStorage.setItem("krma_token", token);
  }

  function showLoggedOut() {
    if ($("authPanel")) $("authPanel").classList.remove("hidden");
    if ($("profilePanel")) $("profilePanel").classList.add("hidden");
  }

  function showLoggedIn() {
    if ($("authPanel")) $("authPanel").classList.add("hidden");
    if ($("profilePanel")) $("profilePanel").classList.remove("hidden");
  }

  // REGISTRO DE USUARIOS

  async function register() {
    const name = $("regName")?.value.trim() || "";
    const email = $("regEmail")?.value.trim() || "";
    const password = $("regPassword")?.value || "";
    const accepted = $("acceptPolicy")?.checked || false;

    if (!name || !email || password.length < 10) {
      showError("Completa nombre, correo y contraseña de mínimo 10 caracteres.");
      return;
    }

    if (!accepted) {
      showError("Debes aceptar el tratamiento de datos personales.");
      return;
    }

    try {
      const result = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password
        })
      });

      saveSession(result);
      showMessage("¡Tu cuenta KRMA VERSO fue creada correctamente!");
      await loadProfile();

    } catch (error) {
      showError(error.message);
    }
  }

  // INICIO DE SESIÓN

  async function login() {
    const email = $("loginEmail")?.value.trim() || "";
    const password = $("loginPassword")?.value || "";

    if (!email || !password) {
      showError("Escribe tu correo y contraseña.");
      return;
    }

    try {
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password
        })
      });

      saveSession(result);

      showMessage("¡Bienvenido de nuevo a KRMA VERSO!");
      await loadProfile();

    } catch (error) {
      showError(error.message);
    }
  }

  // CERRAR SESIÓN

  function logout() {
    token = "";
    localStorage.removeItem("krma_token");
    adminSecret = "";

    showLoggedOut();
    showMessage("Sesión cerrada correctamente.");
  }

  // PERFIL DEL USUARIO

  async function loadProfile() {
    if (!token) {
      showLoggedOut();
      return;
    }

    try {
      const profile = await api("/api/me");

      showLoggedIn();

      if ($("profileName")) {
        $("profileName").textContent = profile.name || "Cliente KRMA";
      }

      if ($("profileEmail")) {
        $("profileEmail").textContent = profile.email || "";
      }

      if ($("referralCode")) {
        $("referralCode").textContent = "Próximamente";
      }

      if ($("firstPurchase")) {
        $("firstPurchase").textContent = "Beneficios próximamente disponibles";
      }

      if ($("myCoupons")) {
        $("myCoupons").textContent = "Todavía no tienes cupones disponibles.";
      }

      await loadOrders();

    } catch (error) {
      token = "";
      localStorage.removeItem("krma_token");
      showLoggedOut();
      showError("Tu sesión no está activa. Inicia sesión nuevamente.");
    }
  }

  // PEDIDOS DEL USUARIO

  async function loadOrders() {
    const box = $("myOrders");
    if (!box || !token) return;

    try {
      const orders = await api("/api/orders");

      box.innerHTML = "";

      if (!Array.isArray(orders) || orders.length === 0) {
        box.textContent = "Todavía no tienes pedidos.";
        return;
      }

      orders.forEach(order => {
        const item = document.createElement("div");
        item.className = "order";

        const title = document.createElement("strong");
        title.textContent = order.product_name || "Pedido KRMA";

        const price = document.createElement("p");
        price.textContent = "Total: " + money(order.total);

        const status = document.createElement("p");
        status.textContent = "Estado: " + String(order.status || "pendiente").toUpperCase();

        item.append(title, price, status);
        box.appendChild(item);
      });

    } catch (error) {
      box.textContent = "No se pudieron cargar tus pedidos.";
    }
  }

  // CATÁLOGO

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function productName(product) {
    return product.name || product.nombre || "Producto digital";
  }

  function productDescription(product) {
    return product.description || product.descripcion || "Consulta disponibilidad y condiciones.";
  }

  function productPrice(product) {
    return product.price === null || product.price === undefined
      ? "Consultar precio"
      : money(product.price);
  }

  function iconFor(product) {
    const text = normalize(productName(product));

    const icons = [
      ["netflix", "🎬"],
      ["spotify", "🎵"],
      ["disney", "🏰"],
      ["max", "🎞️"],
      ["youtube", "▶️"],
      ["canva", "🎨"],
      ["chatgpt", "🤖"],
      ["xbox", "🎮"],
      ["playstation", "🎮"],
      ["steam", "🕹️"],
      ["robux", "💎"],
      ["free fire", "🔥"]
    ];

    const found = icons.find(item => text.includes(item[0]));
    return found ? found[1] : "✨";
  }

  async function loadCatalog() {
    const grid = $("products");
    if (!grid) return;

    grid.textContent = "Cargando catálogo...";

    try {
      const data = await api("/api/catalog");

      if (!Array.isArray(data)) {
        throw new Error("El catálogo tiene un formato incorrecto.");
      }

      products = data;
      renderProducts(products);

    } catch (error) {
      grid.textContent = "No se pudo cargar el catálogo: " + error.message;
    }
  }

  function renderProducts(list) {
    const grid = $("products");
    if (!grid) return;

    const search = normalize($("search")?.value || "");
    const page = normalize(location.pathname.split("/").pop().replace(/\.html$/, ""));
    const pageCategory = ({
      "suscripciones": ["suscripcion", "suscripciones", "subscription"],
      "cuentas": ["cuenta completa", "cuentas completas", "cuentas"],
      "perfiles": ["perfil", "perfiles"],
      "aplicaciones": ["aplicacion", "aplicaciones", "productividad", "educacion", "inteligencia artificial"],
      "juegos": ["videojuego", "videojuegos", "juegos", "gaming"]
    })[page] || [];

    const filtered = list.filter(product => {
      const category = normalize(product.category || "");
      const text = normalize(
        productName(product) + " " +
        productDescription(product) + " " +
        (product.category || "")
      );
      const matchesCategory = !pageCategory.length || pageCategory.some(value => category.includes(normalize(value)));
      return matchesCategory && (!search || text.includes(search));
    });

    grid.innerHTML = "";

    filtered.forEach(product => {
      const card = document.createElement("article");
      card.className = "product-card";

      const head = document.createElement("div");
      head.className = "product-head";

      const icon = document.createElement("div");
      icon.className = "product-icon";
      icon.textContent = iconFor(product);

      const titleBox = document.createElement("div");

      const tag = document.createElement("span");
      tag.className = "product-tag";
      tag.textContent = product.category || "Producto digital";

      const title = document.createElement("h3");
      title.textContent = productName(product);

      titleBox.append(tag, title);
      head.append(icon, titleBox);

      const description = document.createElement("p");
      description.textContent = productDescription(product);

      const price = document.createElement("div");
      price.className = "price";
      price.textContent = productPrice(product);

      const actions = document.createElement("div");
      actions.className = "product-actions";

      const buy = document.createElement("button");
      buy.className = "buy";
      buy.textContent = "🟢 CREAR PEDIDO";
      buy.addEventListener("click", () => buyProduct(product));

      const pay = document.createElement("a");
      pay.className = "pay-product";
      pay.href = WOMPI || "#";
      pay.target = "_blank";
      pay.rel = "noopener noreferrer";
      pay.textContent = "💳 ABRIR PAGO WOMPI";

      actions.append(buy, pay);
      card.append(head, description, price, actions);
      grid.appendChild(card);
    });

    if ($("resultCount")) {
      $("resultCount").textContent = filtered.length + " productos";
    }

    if ($("empty")) {
      $("empty").classList.toggle("hidden", filtered.length > 0);
    }
  }

  // CREAR PEDIDO

  async function buyProduct(product) {
    if (!token) {
      showMessage("Inicia sesión para crear un pedido.");
      location.href = "cuenta.html#acceso";
      return;
    }

    if (product.price === null || product.price === undefined) {
      window.open(
        WA + encodeURIComponent("Hola KRMA VERSO. Quiero consultar el precio de: " + productName(product)),
        "_blank"
      );
      return;
    }

    try {
      const profile = await api("/api/me");

      const result = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(product.id),
          quantity: 1
        })
      });

      const message =
        "Hola KRMA VERSO Store. Acabo de generar un pedido." +
        "\nProducto: " + result.product_name +
        "\nTotal: " + money(result.total) +
        "\nNúmero de pedido: " + result.order_id +
        "\nQuiero confirmar disponibilidad e instrucciones de pago.";

      window.open(WA + encodeURIComponent(message), "_blank");

      showMessage("Pedido creado correctamente.");
      await loadOrders();

    } catch (error) {
      showError(error.message);
    }
  }

  // ADMINISTRACIÓN

  async function loadAdmin() {
    const secret = $("adminSecret")?.value.trim() || "";

    if (!secret) {
      showError("Introduce tu clave administrativa.");
      return;
    }

    adminSecret = secret;

    const box = $("adminOrders");
    if (!box) return;

    box.textContent = "Cargando pedidos...";

    try {
      const response = await fetch(API + "/api/admin/orders", {
        headers: {
          "X-Admin-Secret": adminSecret
        }
      });

      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(data.detail || "No se pudieron consultar los pedidos.");
      }

      box.innerHTML = "";

      if (!data.length) {
        box.textContent = "No hay pedidos.";
        return;
      }

      data.forEach(order => {
        const item = document.createElement("div");
        item.className = "order";

        const title = document.createElement("strong");
        title.textContent = order.product_name;

        const details = document.createElement("p");
        details.textContent =
          "Cliente: " + (order.customer_name || "Cliente") +
          " · Total: " + money(order.total) +
          " · Pedido: " + order.id;

        const button = document.createElement("button");
        button.className = "btn btn-green";
        button.textContent = "CONFIRMAR PAGO RECIBIDO";

        button.addEventListener("click", async () => {
          if (!confirm("Confirma únicamente si verificaste que el dinero llegó. ¿Confirmas el pago?")) {
            return;
          }

          try {
            const result = await fetch(
              API + "/api/admin/orders/" + encodeURIComponent(order.id) + "/paid",
              {
                method: "PATCH",
                headers: {
                  "X-Admin-Secret": adminSecret
                }
              }
            );

            const answer = await result.json().catch(() => ({}));

            if (!result.ok) {
              throw new Error(answer.detail || "No se pudo confirmar el pago.");
            }

            showMessage("Pago confirmado.");
            await loadAdmin();

          } catch (error) {
            showError(error.message);
          }
        });

        item.append(title, details, button);
        box.appendChild(item);
      });

    } catch (error) {
      box.textContent = "";
      showError(error.message);
    }
  }

  // EVENTOS DE LA PÁGINA

  function bind() {
    if ($("registerBtn")) {
      $("registerBtn").addEventListener("click", register);
    }

    if ($("loginBtn")) {
      $("loginBtn").addEventListener("click", login);
    }

    if ($("logoutBtn")) {
      $("logoutBtn").addEventListener("click", logout);
    }

    if ($("refreshProfileBtn")) {
      $("refreshProfileBtn").addEventListener("click", loadProfile);
    }

    if ($("search")) {
      $("search").addEventListener("input", () => renderProducts(products));
    }

    if ($("loadAdminBtn")) {
      $("loadAdminBtn").addEventListener("click", loadAdmin);
    }

    if ($("hideAdminBtn")) {
      $("hideAdminBtn").addEventListener("click", () => {
        if ($("adminPanel")) $("adminPanel").classList.add("hidden");
        if ($("adminSecret")) $("adminSecret").value = "";
        if ($("adminOrders")) $("adminOrders").innerHTML = "";
        adminSecret = "";
      });
    }

    if ($("showAdminBtn")) {
      $("showAdminBtn").addEventListener("click", () => {
        if ($("adminPanel")) {
          $("adminPanel").classList.remove("hidden");
          $("adminPanel").scrollIntoView({ behavior: "smooth" });
        }
      });
    }
  }

  // INICIAR APLICACIÓN

  async function init() {
    bind();

    if ($("products")) {
      await loadCatalog();
    }

    if ($("authPanel")) {
      if (token) {
        await loadProfile();
      } else {
        showLoggedOut();
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);

})();
