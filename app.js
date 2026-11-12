
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
          password,
          referral_code: new URLSearchParams(location.search).get("ref") || null
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

      if ($("referralCode")) $("referralCode").textContent = profile.referral_code || "No disponible";
      if ($("copyReferralBtn")) $("copyReferralBtn").dataset.link = profile.referral_link || "";
      if ($("firstPurchase")) $("firstPurchase").textContent = profile.first_purchase_available
        ? "Aún no registras una compra pagada. Comparte tu enlace y gana $3.000 por cada amigo que complete su primera compra."
        : "Tu primera compra ya fue confirmada. Consulta los cupones que tengas disponibles.";
      if ($("myCoupons")) {
        const coupons = Array.isArray(profile.coupons) ? profile.coupons : [];
        $("myCoupons").innerHTML = "";
        if (!coupons.length) $("myCoupons").textContent = "Aún no tienes cupones. Cuando un amigo referido complete su primera compra, recibirás tu bono de $3.000.";
        else coupons.forEach(coupon => {
          const item = document.createElement("div"); item.className = "coupon";
          const title = document.createElement("strong"); title.textContent = coupon.code + " · " + money(coupon.amount);
          const detail = document.createElement("p"); detail.textContent = "Estado: " + coupon.status.toUpperCase() + " · Vence: " + new Date(coupon.expires_at).toLocaleDateString("es-CO");
          item.append(title, detail); $("myCoupons").appendChild(item);
        });
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

  function brandFor(product) {
    const text = normalize(productName(product) + " " + (product.category || ""));
    const brands = [
      [/netflix/, "netflix", "E50914", "🎬"],
      [/spotify/, "spotify", "1DB954", "🎵"],
      [/disney/, "disneyplus", "113CCF", "🏰"],
      [/\bmax\b|hbo/, "hbo", "5822B4", "🎞️"],
      [/youtube/, "youtube", "FF0033", "▶️"],
      [/canva/, "canva", "00C4CC", "🎨"],
      [/chatgpt|openai/, "openai", "10A37F", "🤖"],
      [/gemini/, "googlegemini", "8E75B2", "✨"],
      [/claude/, "claude", "D97757", "🤖"],
      [/amazon|prime video/, "primevideo", "00A8E1", "📦"],
      [/paramount/, "paramountplus", "0064FF", "⛰️"],
      [/crunchyroll/, "crunchyroll", "F47521", "🍥"],
      [/capcut/, "capcut", "111111", "✂️"],
      [/filmora/, "filmora", "00AEEF", "🎬"],
      [/deezer/, "deezer", "FEAA2D", "🎧"],
      [/duolingo/, "duolingo", "58CC02", "🦉"],
      [/tiktok/, "tiktok", "111111", "♪"],
      [/twitch/, "twitch", "9146FF", "🎮"],
      [/xbox/, "xbox", "107C10", "🎮"],
      [/playstation/, "playstation", "003791", "🎮"],
      [/steam/, "steam", "171A21", "🕹️"],
      [/free fire/, "garena", "E53935", "🔥"]
    ];
    return brands.find(item => item[0].test(text)) || null;
  }

  function iconFor(product) {
    const brand = brandFor(product);
    return brand ? brand[3] : "✨";
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
      "cuentas": ["perfil", "perfiles", "cuenta", "cuentas"],
      "perfiles": ["perfil", "perfiles", "cuenta", "cuentas"],
      "aplicaciones": ["aplicacion", "aplicaciones", "productividad", "educacion"],
      "inteligencia-artificial": ["inteligencia artificial", "inteligencia-artificial", "ia", "ai"],
      "juegos": ["videojuego", "videojuegos", "juegos", "gaming"]
    })[page] || [];

    // Modalidades de acceso individual del catálogo Stream Crack.
    // Se muestran en PERFILES sin cambiar precios ni categorías guardadas.
    const isProfileAccess = product => {
      const category = normalize(product.category || "");
      const name = normalize(productName(product));
      return ["perfil", "perfiles", "cuenta", "cuentas"].some(value => category.includes(value)) ||
        /(^|\b)(pantalla|compartida|invitacion)(\b|$)/.test(name);
    };

    const isAIProduct = product => {
      const category = normalize(product.category || "");
      const name = normalize(productName(product));
      const description = normalize(productDescription(product));
      const aiCategory = category.includes("inteligencia artificial") || category.includes("inteligencia-artificial") || category === "ia" || category === "ai";
      const aiName = /chatgpt|openai|gemini|google ai|claude|midjourney|copilot|perplexity|deepseek|character ai|leonardo ai|runway|elevenlabs|notion ai|mistral ai|grok|suno ai/.test(name);
      const aiDescription = /inteligencia artificial|asistente ia|modelo de lenguaje|generador de imagenes con ia/.test(description);
      return aiCategory || aiName || aiDescription;
    };

    const filtered = list.filter(product => {
      const category = normalize(product.category || "");
      const text = normalize(
        productName(product) + " " +
        productDescription(product) + " " +
        (product.category || "")
      );
      let matchesCategory = !pageCategory.length || pageCategory.some(value => category.includes(normalize(value)));
      // La página PERFILES reúne el catálogo completo de 55 productos.
      // Las demás páginas conservan sus filtros por categoría.
      if (page === "perfiles" || page === "cuentas") matchesCategory = true;
      if (page === "suscripciones") matchesCategory = matchesCategory && !isProfileAccess(product);
      if (page === "aplicaciones") matchesCategory = matchesCategory && !isAIProduct(product);
      if (page === "inteligencia-artificial") matchesCategory = isAIProduct(product);
      return matchesCategory && (!search || text.includes(search));
    });

    grid.innerHTML = "";

    const displayList = (page === "perfiles" || page === "cuentas")
      ? filtered.slice().reverse()
      : filtered;

    displayList.forEach(product => {
      const card = document.createElement("article");
      card.className = "product-card";

      const head = document.createElement("div");
      head.className = "product-head";

      const icon = document.createElement("div");
      icon.className = "product-icon";
      const brand = brandFor(product);
      if (brand) {
        icon.classList.add("brand-icon");
        icon.style.setProperty("--brand-color", "#" + brand[2]);
        // Wordmark local: no depende de un CDN externo que pueda bloquearse.
        const logo = document.createElement("span");
        logo.className = "product-logo product-wordmark";
        logo.setAttribute("aria-label", brand[1] + " logo");
        logo.textContent = ({
          netflix: "N", spotify: "≋", disneyplus: "D+", hbo: "MAX",
          youtube: "▶", canva: "Canva", openai: "AI", googlegemini: "✦",
          claude: "C", primevideo: "prime", paramountplus: "P+",
          crunchyroll: "CR", capcut: "剪", filmora: "F", deezer: "≋",
          duolingo: "Duo", tiktok: "♪", twitch: "T", xbox: "X",
          playstation: "PS", steam: "STEAM", garena: "FF"
        })[brand[1]] || brand[1].slice(0, 2).toUpperCase();
        icon.appendChild(logo);
      } else {
        icon.textContent = iconFor(product);
      }

      const titleBox = document.createElement("div");

      const tag = document.createElement("span");
      tag.className = "product-tag";
      tag.textContent = (page === "perfiles" || page === "cuentas") ? (product.category || "Suscripciones, perfiles y cuentas") : (product.category || "Producto digital");

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
      $("resultCount").textContent = displayList.length + " productos";
    }

    if ($("empty")) {
      $("empty").classList.toggle("hidden", displayList.length > 0);
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
          quantity: 1,
          coupon_code: (window.prompt("¿Tienes un cupón KRMA? Escribe el código o deja vacío para continuar sin descuento.") || "").trim() || null
        })
      });

      const message =
        "Hola KRMA VERSO Store. Acabo de generar un pedido." +
        "\nProducto: " + result.product_name +
        "\nDescuento: " + money(result.discount || 0) +
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
    if ($("copyReferralBtn")) {
      $("copyReferralBtn").addEventListener("click", async () => {
        const link = $("copyReferralBtn").dataset.link || "";
        if (!link) return showError("No se pudo generar tu enlace de referido.");
        try { await navigator.clipboard.writeText(link); showMessage("Enlace de referido copiado. ¡Compártelo con tus amigos!"); }
        catch (_) { window.prompt("Copia tu enlace de referido:", link); }
      });
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
    const currentPage = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a").forEach(link => {
      const target = (link.getAttribute("href") || "").split("#")[0].split("/").pop();
      if (target === currentPage) { link.classList.add("active"); link.setAttribute("aria-current", "page"); }
    });

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
