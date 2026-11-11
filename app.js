(() => {
  "use strict";
  const CFG = window.KRMA_CONFIG || {};
  const API = (CFG.API_BASE || "").replace(/\/$/, "");
  const WOMPI = CFG.WOMPI_URL || "";
  const WA = "https://wa.me/" + (CFG.WHATSAPP_NUMBER || "573215201208") + "?text=";
  const $ = id => document.getElementById(id);
  let token = localStorage.getItem("krma_token") || "";
  let products = [];
  let adminSecret = "";

  function money(v){ return "$" + Number(v || 0).toLocaleString("es-CO") + " COP"; }
  function showMessage(msg){ const el=$("message"); if(el){el.textContent=msg;el.classList.remove("hidden");} const er=$("error");if(er){er.textContent="";er.classList.add("hidden");} }
  function showError(msg){ const el=$("error");if(el){el.textContent=msg;el.classList.remove("hidden");}const m=$("message");if(m){m.textContent="";m.classList.add("hidden");} }
  async function api(path, options={}) {
    const headers={"Content-Type":"application/json",...(options.headers||{})};
    if(token) headers.Authorization="Bearer "+token;
    let response;
    try { response=await fetch(API+path,{...options,headers}); }
    catch(e){ throw new Error("No se pudo conectar con el servidor. Comprueba que Render esté activo."); }
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.detail || "Error de conexión con el servidor.");
    return data;
  }
  function normalize(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
  function productText(p){return normalize([p.id,p.nombre,p.name,p.categoria,p.category,p.tipo,p.type,p.descripcion,p.description].filter(Boolean).join(" "));}
  function includesAny(text, words){return (words||[]).some(w=>text.includes(normalize(w)));}
  function classify(p){
    const text=productText(p), rules=CFG.PRODUCT_RULES||{};
    const explicit=normalize(p.tipo||p.type||p.categoria||p.category||"");
    // Las reglas específicas se evalúan antes que las categorías generales.
    if(includesAny(explicit,["cuenta completa","cuenta-completa","complete account"]) || includesAny(text,rules.completeAccounts)) return "completeAccounts";
    if(includesAny(explicit,["perfil","profile"]) || includesAny(text,rules.profiles)) return "profiles";
    if(includesAny(explicit,["suscripcion","suscripción","subscription"]) || includesAny(text,rules.subscriptions)) return "subscriptions";
    if(includesAny(explicit,["aplicacion","aplicación","software"]) || includesAny(text,rules.applications)) return "applications";
    if(includesAny(explicit,["juego","videojuego","gaming"]) || includesAny(text,rules.games)) return "games";
    return "subscriptions";
  }
  function categoryLabel(key){return ({completeAccounts:"Cuentas completas",profiles:"Perfiles",subscriptions:"Suscripciones",applications:"Aplicaciones",games:"Videojuegos"})[key]||"Productos";}
  function iconFor(p){
    const t=productText(p), pairs=[["netflix","🎬"],["spotify","🎵"],["disney","🏰"],["max","🎞️"],["amazon","📺"],["youtube","▶️"],["canva","🎨"],["capcut","✂️"],["chatgpt","🤖"],["gemini","✨"],["steam","🕹️"],["xbox","🎮"],["playstation","🎮"],["gta","🚗"],["crunchyroll","🍥"],["duolingo","🦉"]];
    const found=pairs.find(x=>t.includes(x[0]));return found?found[1]:"✨";
  }
  function productName(p){return p.nombre||p.name||p.id||"Producto digital";}
  function productPrice(p){return p.precio===null||p.precio===undefined?"Consultar precio":money(p.precio);}
  function productDescription(p){return p.descripcion||p.description||"Confirma modalidad, duración, disponibilidad y condiciones antes de realizar el pago.";}

  async function loadCatalog(){
    const grid=$("products"); if(!grid)return;
    grid.innerHTML='<p class="intro">Cargando catálogo...</p>';
    try{
      const data=await api("/api/catalog");
      if(!Array.isArray(data))throw new Error("El catálogo no tiene el formato esperado.");
      products=data;
      const pageKey=document.body.dataset.category||"all";
      const selected=products.filter(p=>pageKey==="all"||classify(p)===pageKey);
      renderProducts(selected);
    }catch(e){grid.innerHTML="";grid.insertAdjacentHTML("beforeend",'<p class="empty"></p>');grid.querySelector(".empty").textContent="No se pudo cargar el catálogo: "+e.message;}
  }
  function renderProducts(list){
    const grid=$("products"), search=$("search"), count=$("resultCount"), empty=$("empty");
    if(!grid)return;
    const q=normalize(search?search.value:"");
    const filtered=list.filter(p=>!q||productText(p).includes(q));
    grid.innerHTML="";
    filtered.forEach(p=>{
      const card=document.createElement("article");card.className="product-card";
      const head=document.createElement("div");head.className="product-head";
      const icon=document.createElement("div");icon.className="product-icon";icon.textContent=iconFor(p);
      const titleBox=document.createElement("div"),tag=document.createElement("span");tag.className="product-tag";tag.textContent=categoryLabel(classify(p));
      const title=document.createElement("h3");title.textContent=productName(p);titleBox.append(tag,title);head.append(icon,titleBox);
      const desc=document.createElement("p");desc.textContent=productDescription(p);
      const price=document.createElement("div");price.className="price";price.textContent=productPrice(p);
      const actions=document.createElement("div");actions.className="product-actions";
      const buy=document.createElement("button");buy.className="buy";buy.textContent="🟢 CREAR PEDIDO / WHATSAPP";buy.addEventListener("click",()=>buyProduct(p));
      const pay=document.createElement("a");pay.className="pay-product";pay.href=WOMPI;pay.target="_blank";pay.rel="noopener noreferrer";pay.textContent="💳 ABRIR PAGO WOMPI";
      actions.append(buy,pay);card.append(head,desc,price,actions);grid.append(card);
    });
    if(count)count.textContent=filtered.length+" productos";
    if(empty)empty.classList.toggle("hidden",filtered.length>0);
  }
  async function buyProduct(p){
    if(p.precio===null||p.precio===undefined){window.open(WA+encodeURIComponent("Hola KrmaVerso Store. Quiero consultar disponibilidad y precio de: "+productName(p)),"_blank","noopener");return;}
    if(!token){showMessage("Para crear un pedido debes iniciar sesión o registrarte.");location.href="cuenta.html#acceso";return;}
    try{
      const result=await api("/api/orders",{method:"POST",body:JSON.stringify({product_id:p.id})});
      const msg="Hola KrmaVerso Store. Acabo de generar un pedido.\nProducto: "+result.product_name+"\nSubtotal: "+money(result.subtotal)+"\nDescuento: "+money(result.discount)+"\nTotal: "+money(result.total)+"\nNúmero de pedido: "+result.order_id+"\nQuiero confirmar disponibilidad y recibir instrucciones de pago.";
      window.open(WA+encodeURIComponent(msg),"_blank","noopener");
      showMessage("Pedido creado. Confirma el valor y las instrucciones por WhatsApp.");
    }catch(e){showError(e.message);}
  }

  function showLoggedOut(){if($("authPanel"))$("authPanel").classList.remove("hidden");if($("profilePanel"))$("profilePanel").classList.add("hidden");}
  function showLoggedIn(){if($("authPanel"))$("authPanel").classList.add("hidden");if($("profilePanel"))$("profilePanel").classList.remove("hidden");}
  function saveSession(result){token=result.access_token;localStorage.setItem("krma_token",token);}
  async function register(){
    const name=$("regName").value.trim(),email=$("regEmail").value.trim(),password=$("regPassword").value,accepted=$("acceptPolicy").checked;
    if(!name||!email||password.length<10)return showError("Completa nombre, correo y contraseña de mínimo 10 caracteres.");
    if(!accepted)return showError("Debes aceptar el tratamiento de datos personales.");
    try{const result=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name,email,password,referral_code:new URLSearchParams(location.search).get("ref")||null,accept_data_policy:true})});saveSession(result);showMessage("¡Cuenta creada correctamente!");await loadProfile();}
    catch(e){showError(e.message);}
  }
  async function login(){
    const email=$("loginEmail").value.trim(),password=$("loginPassword").value;
    if(!email||!password)return showError("Escribe tu correo y contraseña.");
    try{const result=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});saveSession(result);showMessage("¡Bienvenido de nuevo a KrmaVerso!");await loadProfile();}
    catch(e){showError(e.message);}
  }
  async function logout(){token="";localStorage.removeItem("krma_token");adminSecret="";showLoggedOut();showMessage("Sesión cerrada correctamente.");}
  function renderCoupons(coupons){
    const box=$("myCoupons");if(!box)return;box.innerHTML="";
    if(!coupons.length){box.textContent="Todavía no tienes cupones disponibles.";return;}
    coupons.forEach(c=>{const d=document.createElement("div");d.className="coupon";const title=document.createElement("strong");title.textContent=c.code;const p=document.createElement("p");p.textContent="Descuento: "+money(c.amount_off)+" · Vence: "+new Date(c.expires_at).toLocaleDateString("es-CO");const b=document.createElement("button");b.className="btn btn-secondary";b.textContent="COPIAR CÓDIGO";b.onclick=async()=>{try{await navigator.clipboard.writeText(c.code);showMessage("Cupón copiado.");}catch{showMessage("Tu cupón es: "+c.code);}};d.append(title,p,b);box.append(d);});
  }
  function renderOrders(orders){
    const box=$("myOrders");if(!box)return;box.innerHTML="";
    if(!orders.length){box.textContent="Todavía no tienes pedidos.";return;}
    orders.forEach(o=>{const d=document.createElement("div");d.className="order";const n=document.createElement("strong");n.textContent=o.product_name;const p=document.createElement("p");p.textContent="Subtotal: "+money(o.subtotal)+" · Descuento: "+money(o.discount)+" · Total: "+money(o.total);const s=document.createElement("p");s.textContent="Estado: "+String(o.status).toUpperCase();d.append(n,p,s);
      if(o.status==="pending"){const b=document.createElement("button");b.className="btn btn-danger";b.textContent="CANCELAR PEDIDO";b.onclick=async()=>{if(!confirm("¿Deseas cancelar este pedido pendiente?"))return;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/cancel",{method:"POST"});showMessage("Pedido cancelado.");await loadProfile();}catch(e){showError(e.message);}};d.append(b);}box.append(d);});
  }
  async function loadProfile(){
    if(!token){showLoggedOut();return;}
    try{const p=await api("/api/me");showLoggedIn();if($("profileName"))$("profileName").textContent=p.name||"Cliente KRMA";if($("profileEmail"))$("profileEmail").textContent=p.email||"";if($("referralCode"))$("referralCode").textContent=p.referral_code||"Pendiente";if($("firstPurchase"))$("firstPurchase").textContent=p.first_purchase_available?"¡Tienes 10% de descuento!":"Beneficio de primera compra utilizado";renderCoupons(p.coupons||[]);renderOrders(p.orders||[]);if($("copyReferralBtn")&&p.referral_link)$("copyReferralBtn").dataset.link=p.referral_link;}
    catch(e){token="";localStorage.removeItem("krma_token");showLoggedOut();showError("Tu sesión no está activa. Inicia sesión nuevamente.");}
  }
  async function loadAdmin(){
    const secret=$("adminSecret").value.trim();if(!secret)return showError("Introduce tu clave administrativa.");
    adminSecret=secret;const box=$("adminOrders");box.textContent="Cargando pedidos...";
    try{const r=await fetch(API+"/api/admin/orders",{headers:{"X-Admin-Secret":adminSecret}});const data=await r.json().catch(()=>[]);if(!r.ok)throw new Error(data.detail||"No fue posible consultar los pedidos.");box.innerHTML="";
      if(!data.length){box.textContent="No hay pedidos pendientes.";return;}
      data.forEach(o=>{const d=document.createElement("div");d.className="order";const t=document.createElement("strong");t.textContent=o.product_name;const p=document.createElement("p");p.textContent="Cliente ID: "+o.user_id+" · Total: "+money(o.total)+" · Pedido: "+o.id;const b=document.createElement("button");b.className="btn btn-green";b.textContent="CONFIRMAR PAGO RECIBIDO";b.onclick=async()=>{if(!confirm("Confirma únicamente si verificaste que el dinero llegó a tu cuenta Wompi. ¿Confirmas el pago?"))return;try{const rr=await fetch(API+"/api/admin/orders/"+encodeURIComponent(o.id)+"/paid",{method:"POST",headers:{"X-Admin-Secret":adminSecret}});const x=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(x.detail||"No se pudo confirmar el pago.");showMessage("Pago confirmado.");await loadAdmin();}catch(e){showError(e.message);}};d.append(t,p,b);box.append(d);});
    }catch(e){box.textContent="";showError(e.message);}
  }
  function bind(){
    if($("search"))$("search").addEventListener("input",loadSearch);
    if($("registerBtn"))$("registerBtn").addEventListener("click",register);
    if($("loginBtn"))$("loginBtn").addEventListener("click",login);
    if($("logoutBtn"))$("logoutBtn").addEventListener("click",logout);
    if($("refreshProfileBtn"))$("refreshProfileBtn").addEventListener("click",loadProfile);
    if($("copyReferralBtn"))$("copyReferralBtn").addEventListener("click",async()=>{const link=$("copyReferralBtn").dataset.link;if(!link)return showError("No se encontró tu enlace de referido.");try{await navigator.clipboard.writeText(link);showMessage("¡Enlace de referido copiado!");}catch{showMessage("Tu enlace: "+link);}});
    if($("loadAdminBtn"))$("loadAdminBtn").addEventListener("click",loadAdmin);
    if($("hideAdminBtn"))$("hideAdminBtn").addEventListener("click",()=>{$("adminPanel").classList.add("hidden");$("adminSecret").value="";$("adminOrders").innerHTML="";adminSecret="";});
    if($("showAdminBtn"))$("showAdminBtn").addEventListener("click",()=>{$("adminPanel").classList.remove("hidden");$("adminPanel").scrollIntoView({behavior:"smooth"});});
  }
  let allForSearch=[];
  function loadSearch(){const key=document.body.dataset.category||"all";renderProducts(products.filter(p=>key==="all"||classify(p)===key));}
  async function init(){
    bind();
    if($("products"))await loadCatalog();
    if($("authPanel")){if(token)await loadProfile();else showLoggedOut();}
  }
  document.addEventListener("DOMContentLoaded",init);
})();
