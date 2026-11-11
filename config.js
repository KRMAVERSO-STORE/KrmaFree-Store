/* CONFIGURACIÓN GENERAL DE KRMAVERSO STORE */
window.KRMA_CONFIG = {
  API_BASE: "https://krmafree-store-nqak.onrender.com",
  WOMPI_URL: "https://checkout.wompi.co/l/VPOS_P4mjTE",
  WHATSAPP_NUMBER: "573215201208",
  TELEGRAM: "@KrmaVerso",

  /*
   * CLASIFICACIÓN DEL CATÁLOGO
   * El backend actual entrega /api/catalog. Para separar correctamente
   * los productos, esta tienda revisa los campos categoria/category/tipo/type
   * y también el nombre e ID del producto.
   *
   * Si algún producto aparece en una sección equivocada, agrega aquí una
   * regla con palabras que aparezcan en su ID o nombre.
   */
  PRODUCT_RULES: {
    completeAccounts: ["cuenta completa", "cuenta completa", "cuenta-entera", "cuenta-full", "full account", "cuenta individual"],
    profiles: ["perfil", "profile", "pantalla", "usuario individual"],
    subscriptions: ["suscripcion", "suscripción", "plan", "mensualidad", "premium", "estandar", "estándar", "normal"],
    applications: ["canva", "capcut", "filmora", "office", "google one", "google-one", "duolingo", "chatgpt", "gemini", "productividad"],
    games: ["steam", "xbox", "playstation", "gta", "fc-", "minecraft", "juego", "recarga", "videojuego"]
  }
};
