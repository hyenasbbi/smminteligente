const SUPABASE_URL = 'https://jgjvzqfxakvogaeqfual.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ylZfwhV3QQ98wG9qLiL7Jg_vTLaLByl';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const app = document.getElementById('app');

let session = null;
let profile = null;
let seller = null;
let currentView = 'home';
let currentCategory = null;
let currentServices = [];
let selected = new Map();
let favorites = new Set();

const CATS = [
  ['LIKES','Likes'],['COMMENTS','Comments'],['VIEWS','Views'],['SHARES','Shares'],
  ['REPOST','Reposts'],['FOLLOWERS','Followers'],['SAVES','Saves'],['STORY VIEWS','Story Views']
];

const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = v => v == null ? '—' : '$' + Number(v).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
const sec = v => {
  if(v == null) return '—';
  const n=Number(v); if(n<60) return `${Math.round(n)}s`; if(n<3600) return `${Math.round(n/60)} min`; return `${(n/3600).toFixed(1)} h`;
};
const pct = v => v == null ? '—' : `${Number(v).toFixed(1)}%`;

async function init(){
  const {data:{session:s}} = await sb.auth.getSession();
  session=s;
  if(!session) return renderAuth('login');
  await routeLoggedIn();
}

async function routeLoggedIn(){
  const {data:p,error} = await sb.from('smm_user_profiles').select('*').eq('user_id',session.user.id).maybeSingle();
  if(error || !p) return renderBlack('Cuenta pendiente','Tu cuenta fue creada, pero todavía no tiene un perfil habilitado.');
  profile=p;
  if(profile.status!=='active'){
    const titles={pending:'Aprobación pendiente',suspended:'Acceso suspendido',expelled:'Acceso bloqueado',rejected:'Solicitud rechazada'};
    return renderBlack(titles[profile.status]||'Sin acceso', profile.status==='pending'?'Tu solicitud está esperando aprobación del administrador.':'No tenés acceso al sistema en este momento.');
  }
  if(profile.assigned_seller_id){
    const {data:s}=await sb.from('smm_sellers').select('*').eq('id',profile.assigned_seller_id).single(); seller=s;
  }
  await loadFavorites();
  currentView = favorites.size ? 'favorites' : 'home';
  renderShell();
}

function renderAuth(mode='login'){
  app.innerHTML=`<div class="authwrap"><div class="authcard">
    <div class="brand"><span>BBI COMPANY</span></div>
    <h1>${mode==='login'?'Ingresar':'Crear cuenta'}</h1>
    <p>${mode==='login'?'Acceso interno del equipo.':'Elegí tu nombre. La cuenta quedará pendiente hasta ser aprobada.'}</p>
    <div class="field"><label>Email</label><input id="email" type="email" autocomplete="email"></div>
    <div class="field"><label>Contraseña</label><input id="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}"></div>
    ${mode==='signup'?'<div class="field"><label>Vendedor</label><select id="sellerSelect"><option>Cargando...</option></select></div>':''}
    <button class="primary" id="authBtn">${mode==='login'?'Ingresar':'Crear cuenta'}</button>
    <div id="authMsg" class="msg"></div>
    <div class="authswitch">${mode==='login'?'¿No tenés cuenta? <button id="switch">Registrarme</button>':'¿Ya tenés cuenta? <button id="switch">Ingresar</button>'}</div>
  </div></div>`;
  document.getElementById('switch').onclick=()=>renderAuth(mode==='login'?'signup':'login');
  if(mode==='signup') loadAvailableSellers();
  document.getElementById('authBtn').onclick=()=> mode==='login'?login():signup();
}

async function loadAvailableSellers(){
  const sel=document.getElementById('sellerSelect');
  const {data,error}=await sb.from('smm_sellers').select('id,name,short_code').order('name');
  if(error){sel.innerHTML='<option>No disponible</option>';return;}
  sel.innerHTML=(data||[]).map(s=>`<option value="${esc(s.short_code)}">${esc(s.name)}</option>`).join('')||'<option>No hay vendedores disponibles</option>';
}

async function login(){
  const email=document.getElementById('email').value.trim(), password=document.getElementById('password').value;
  const msg=document.getElementById('authMsg'); msg.textContent='Ingresando...';
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){msg.textContent=error.message;return;} session=data.session; await routeLoggedIn();
}
async function signup(){
  const email=document.getElementById('email').value.trim(), password=document.getElementById('password').value, code=document.getElementById('sellerSelect').value;
  const msg=document.getElementById('authMsg'); msg.textContent='Creando cuenta...';
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{requested_seller_code:code}}});
  if(error){msg.textContent=error.message;return;}
  if(!data.session){msg.textContent='Cuenta creada. Revisá tu email si Supabase solicita confirmación. Después tu acceso quedará pendiente de aprobación.';return;}
  session=data.session; await routeLoggedIn();
}

function renderBlack(title,text){
  app.innerHTML=`<div class="blackstate"><div class="inner"><div class="brand"><span>BBI COMPANY</span></div><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="ghost" id="logout">Cerrar sesión</button></div></div>`;
  document.getElementById('logout').onclick=logout;
}

function renderShell(){
  app.innerHTML=`<div class="shell">
    <div class="topbar"><div class="brand"><span>BBI COMPANY</span> · SMM INTELLIGENCE</div><div class="userbox"><b>${esc(seller?.name||'ADMIN')}</b><button class="ghost" id="logout">Salir</button></div></div>
    <div class="nav">
      <button data-view="home">Inicio</button><button data-view="favorites">Favoritos</button><button data-view="top">Top 7 días</button>${profile.role==='admin'?'<button data-view="admin">Administración</button>':''}
    </div><main id="main"></main></div>`;
  document.getElementById('logout').onclick=logout;
  document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;renderCurrent();});
  renderCurrent();
}

function markNav(){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));}
async function renderCurrent(){
  markNav(); selected.clear();
  if(currentView==='home') return renderHome();
  if(currentView==='favorites') return renderFavorites();
  if(currentView==='top') return renderTop();
  if(currentView==='admin') return renderAdmin();
}

function renderHome(){
  const main=document.getElementById('main');
  main.innerHTML=`<section class="hero"><div><h1>Bienvenido, <span class="gradient">${esc(seller?.name||'Admin')}</span></h1><p>Elegí qué querés buscar. El sistema mostrará hasta 15 opciones globales mezclando paneles y priorizando rendimiento.</p></div></section>
  <div class="categories">${CATS.map(([v,l])=>`<button class="cat" data-cat="${esc(v)}"><b>${esc(l)}</b><span>Ver mejores opciones</span></button>`).join('')}</div>
  <div id="serviceArea"></div>`;
  document.querySelectorAll('.cat').forEach(b=>b.onclick=()=>loadCategory(b.dataset.cat));
}

async function loadCategory(cat){
  currentCategory=cat; const area=document.getElementById('serviceArea');
  area.innerHTML='<div class="empty">Cargando servicios...</div>';
  const {data,error}=await sb.from('smm_service_live_cards').select('*').ilike('platform','%instagram%').eq('function_label',cat).limit(200);
  if(error){area.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return;}
  currentServices=data||[]; renderServiceArea(currentServices,cat);
}

function healthRank(s){return s==='green'?0:s==='yellow'?1:2}
function compareBest(a,b){
  return healthRank(a.health_status)-healthRank(b.health_status)
    || (Number(a.avg_completion_seconds??1e15)-Number(b.avg_completion_seconds??1e15))
    || (Number(a.avg_start_seconds??1e15)-Number(b.avg_start_seconds??1e15))
    || (Number(a.current_price??1e15)-Number(b.current_price??1e15));
}
function comparePrice(a,b){return Number(a.current_price??1e15)-Number(b.current_price??1e15)||compareBest(a,b)}

function renderServiceArea(data,cat,sort='best'){
  const area=document.getElementById('serviceArea'); if(!area)return;
  let sorted=[...data].sort(sort==='price'?comparePrice:compareBest).slice(0,15);
  area.innerHTML=`<div class="toolbar"><div><div class="label">Resultados</div><b>${esc(cat)} · hasta 15 mejores globales</b></div><div><div class="label">Ordenar</div><select id="sortSelect"><option value="best">Mejor rendimiento</option><option value="price" ${sort==='price'?'selected':''}>Precio: menor a mayor</option></select></div><button class="ghost" id="refresh">Actualizar</button></div>${renderServices(sorted)}${copyBar()}`;
  document.getElementById('sortSelect').onchange=e=>renderServiceArea(data,cat,e.target.value);
  document.getElementById('refresh').onclick=()=>loadCategory(cat);
  wireServiceInteractions(sorted);
}

function renderServices(items){
  if(!items.length)return '<div class="card empty">Todavía no hay servicios sincronizados para esta categoría.</div>';
  return `<div class="service-list">${items.map(s=>serviceCard(s)).join('')}</div>`;
}
function serviceCard(s){
  const change=s.price_change_pct==null?'—':`${Number(s.price_change_pct)>0?'+':''}${Number(s.price_change_pct).toFixed(1)}%`;
  return `<article class="service" data-service="${s.service_id}">
    <div class="service-head">
      <input class="check" type="checkbox" data-id="${s.service_id}">
      <div><div class="service-title">${esc(s.function_label)} · ${esc(s.panel_code)} · ID ${esc(s.service_code)} <span class="statusdot ${esc(s.health_status)}"></span></div><div class="small">Start ${sec(s.avg_start_seconds)}</div></div>
      <div class="metric-mini hide-sm">${money(s.current_price)}/1K</div>
      <div class="metric-mini hide-sm">Avg ${sec(s.avg_completion_seconds)}</div>
      <div class="metric-mini hide-sm">${s.health_status==='red'?'ALERTA':s.health_status==='yellow'?'CAMBIANDO':'ESTABLE'}</div>
      <div>⌄</div>
    </div>
    <div class="service-details">
      <div class="exact-name"><b>Nombre exacto del panel</b><br>${esc(s.exact_service_name||'No disponible')}</div>
      <div class="detail-grid">
        <div class="detail"><div class="k">Precio actual</div><div class="v">${money(s.current_price)}</div></div>
        <div class="detail"><div class="k">Precio anterior</div><div class="v">${money(s.previous_price)}</div></div>
        <div class="detail"><div class="k">Variación</div><div class="v">${change}</div></div>
        <div class="detail"><div class="k">Start time</div><div class="v">${sec(s.avg_start_seconds)}</div></div>
        <div class="detail"><div class="k">Average time</div><div class="v">${sec(s.avg_completion_seconds)}</div></div>
        <div class="detail"><div class="k">Success</div><div class="v">${pct(s.success_rate)}</div></div>
        <div class="detail"><div class="k">Drop 7d</div><div class="v">${pct(s.avg_drop_7d)}</div></div>
        <div class="detail"><div class="k">Refill</div><div class="v">${s.refill===true?'Sí':s.refill===false?'No':'—'}</div></div>
        <div class="detail"><div class="k">Min / Max</div><div class="v">${s.min_qty??'—'} / ${s.max_qty??'—'}</div></div>
        <div class="detail"><div class="k">País</div><div class="v">${esc(s.country||'—')}</div></div>
        <div class="detail"><div class="k">BBI Score</div><div class="v">${s.bbi_score??'—'}</div></div>
        <div class="detail"><div class="k">Última actualización</div><div class="v">${s.last_synced_at?new Date(s.last_synced_at).toLocaleString():'—'}</div></div>
      </div>
      <div class="actions"><button class="mini-btn favorite" data-fav="${s.service_id}">${favorites.has(s.service_id)?'★ Quitar favorito':'☆ Agregar favorito'}</button></div>
    </div>
  </article>`;
}
function copyBar(){return `<div class="copybar"><div><b id="selectedCount">0 seleccionadas</b><div class="small">Se copiarán juntas</div></div><button id="copySelected">COPIAR SELECCIÓN</button></div>`}

function wireServiceInteractions(items){
  document.querySelectorAll('.service-head').forEach(h=>h.onclick=e=>{if(e.target.matches('input'))return;h.closest('.service').classList.toggle('open')});
  document.querySelectorAll('.check').forEach(c=>c.onchange=()=>{const s=items.find(x=>x.service_id===c.dataset.id);if(c.checked)selected.set(s.service_id,s);else selected.delete(s.service_id);updateSelectedCount();});
  document.querySelectorAll('[data-fav]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=items.find(x=>x.service_id===b.dataset.fav);await toggleFavorite(s);});
  const cp=document.getElementById('copySelected'); if(cp)cp.onclick=copySelected;
}
function updateSelectedCount(){const x=document.getElementById('selectedCount');if(x)x.textContent=`${selected.size} seleccionadas`}

async function copySelected(){
  if(!selected.size)return;
  const arr=[...selected.values()];
  const text=arr.map(s=>`${s.function_label} ${s.panel_code} ID ${s.service_code}`).join('\n');
  await navigator.clipboard.writeText(text);
  await sb.from('smm_copy_events').insert(arr.map(s=>({user_id:session.user.id,service_id:s.service_id})));
  const btn=document.getElementById('copySelected'); if(btn){btn.textContent='COPIADO ✓';setTimeout(()=>btn.textContent='COPIAR SELECCIÓN',1200)}
}

async function loadFavorites(){
  if(!profile?.assigned_seller_id){favorites=new Set();return;}
  const {data}=await sb.from('smm_seller_favorite_services').select('service_id').eq('seller_id',profile.assigned_seller_id).eq('is_favorite',true);
  favorites=new Set((data||[]).map(x=>x.service_id).filter(Boolean));
}
async function toggleFavorite(s){
  if(!seller)return;
  if(favorites.has(s.service_id)){
    await sb.from('smm_seller_favorite_services').delete().eq('seller_id',seller.id).eq('service_id',s.service_id);favorites.delete(s.service_id);
  }else{
    const row={seller_id:seller.id,seller_name:seller.name,seller_code:seller.short_code,function_name:s.function_label,provider_id:s.provider_id,service_code:s.service_code,service_id:s.service_id,is_favorite:true};
    const {error}=await sb.from('smm_seller_favorite_services').insert(row);if(error){alert(error.message);return;}favorites.add(s.service_id);
  }
  renderCurrent();
}

async function renderFavorites(){
  const main=document.getElementById('main');
  main.innerHTML=`<section class="hero"><div><h1>Tus <span class="gradient">Favoritos</span></h1><p>Acá ves sus métricas actualizadas, cambios de precio y estado operativo.</p></div></section><div id="favArea" class="empty">Cargando...</div>`;
  if(!favorites.size){document.getElementById('favArea').innerHTML='Todavía no guardaste favoritos.';return;}
  const ids=[...favorites];
  const {data,error}=await sb.from('smm_service_live_cards').select('*').in('service_id',ids);
  if(error){document.getElementById('favArea').innerHTML=esc(error.message);return;}
  currentServices=data||[]; document.getElementById('favArea').outerHTML=`<div id="favArea">${renderServices(currentServices.sort(compareBest))}${copyBar()}</div>`;wireServiceInteractions(currentServices);
}

async function renderTop(){
  const main=document.getElementById('main'); main.innerHTML=`<section class="hero"><div><h1>Top global <span class="gradient">7 días</span></h1><p>Servicios más copiados por todo el equipo durante los últimos siete días.</p></div></section><div id="topArea" class="card empty">Cargando...</div>`;
  const {data,error}=await sb.from('smm_global_top_7d').select('*').limit(15);
  const a=document.getElementById('topArea'); if(error){a.innerHTML=esc(error.message);return;} if(!data?.length){a.innerHTML='Todavía no hay suficientes copias registradas.';return;}
  a.className='card';a.innerHTML=data.map((x,i)=>`<div class="rank-row"><div class="rank">#${i+1}</div><div><b>${esc(x.function_label)} · ${esc(x.panel_code)} · ID ${esc(x.service_code)}</b><div class="small">${x.health_status.toUpperCase()} · Start ${sec(x.avg_start_seconds)}</div></div><div><b>${x.copies_7d}</b><div class="small">copias</div></div><div>${money(x.current_price)}</div></div>`).join('');
}

async function renderAdmin(){
  const main=document.getElementById('main'); if(profile.role!=='admin'){return renderHome();}
  main.innerHTML=`<section class="hero"><div><h1>Administración</h1><p>Usuarios pendientes, activos y control de accesos.</p></div></section><div class="admin-grid"><div class="card admin-card"><h3>Solicitudes pendientes</h3><div id="pending">Cargando...</div></div><div class="card admin-card"><h3>Usuarios</h3><div id="users">Cargando...</div></div></div>`;
  const [{data:profiles,error},{data:sellers}]=await Promise.all([sb.from('smm_user_profiles').select('*').order('created_at',{ascending:false}),sb.from('smm_sellers').select('*').order('name')]);
  if(error){document.getElementById('pending').textContent=error.message;return;}
  const smap=new Map((sellers||[]).map(s=>[s.id,s]));
  const pend=(profiles||[]).filter(p=>p.status==='pending');
  document.getElementById('pending').innerHTML=pend.length?pend.map(p=>adminRequest(p,smap)).join(''):'Sin pendientes.';
  document.getElementById('users').innerHTML=(profiles||[]).filter(p=>p.status!=='pending').map(p=>`<div class="request"><div><b>${esc(smap.get(p.assigned_seller_id)?.name||'Sin vendedor')}</b><div class="small">${esc(p.email_norm)} · ${esc(p.status)} · ${esc(p.role)}</div></div><div class="request-actions">${p.status==='active'?`<button data-suspend="${p.user_id}">Suspender</button><button class="bad" data-expel="${p.user_id}">Expulsar</button>`:''}${p.status==='suspended'?`<button class="ok" data-reactivate="${p.user_id}">Reactivar</button>`:''}</div></div>`).join('')||'Sin usuarios.';
  wireAdmin();
}
function adminRequest(p,smap){
  const req=smap.get(p.requested_seller_id);
  return `<div class="request"><div><b>${esc(req?.name||'Sin vendedor')}</b><div class="small">${esc(p.email_norm)}</div></div><div class="request-actions"><button class="ok" data-approve="${p.user_id}" data-seller="${p.requested_seller_id||''}">Aprobar</button><button class="bad" data-reject="${p.user_id}">Rechazar</button></div></div>`;
}
function wireAdmin(){
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>adminUpdate(b.dataset.approve,{status:'active',assigned_seller_id:b.dataset.seller,approved_at:new Date().toISOString(),approved_by:session.user.id}));
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>adminUpdate(b.dataset.reject,{status:'rejected'}));
  document.querySelectorAll('[data-suspend]').forEach(b=>b.onclick=()=>adminUpdate(b.dataset.suspend,{status:'suspended'}));
  document.querySelectorAll('[data-reactivate]').forEach(b=>b.onclick=()=>adminUpdate(b.dataset.reactivate,{status:'active'}));
  document.querySelectorAll('[data-expel]').forEach(b=>b.onclick=()=>adminUpdate(b.dataset.expel,{status:'expelled'}));
}
async function adminUpdate(user_id,patch){const {error}=await sb.from('smm_user_profiles').update(patch).eq('user_id',user_id);if(error)alert(error.message);else renderAdmin();}

async function logout(){await sb.auth.signOut();session=null;profile=null;seller=null;renderAuth('login')}
init();
