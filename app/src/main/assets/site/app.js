const IS_ANDROID = typeof window.MDSNative !== 'undefined';
let nativeSaveOK=false;
'use strict';
let SEED=JSON.parse(document.getElementById('app-data').textContent);
const EMBEDDED_SEED=JSON.parse(JSON.stringify(SEED));
const SNAP=JSON.parse(document.getElementById('saved-state').textContent||'null');
const STORE='mds-visitas-v3';
let state={version:3,updated:0,overrides:{},progress:{},notes:{},geo:{},geocodeFailures:{},days:SEED.days,day:0,tab:'route',stale:false,visitMinutes:20,parkingMinutes:5,dayMinutes:480};
let storageOK=true,busy=false,abortRun=false,editorId=null,searchValue='',filterValue='all',undoAction=null;
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=35&&p[0]<=44.5&&p[1]>=-10&&p[1]<=5;
const keyOf=c=>norm(c.full);
function saveLegacy(){state.updated=Date.now();try{localStorage.setItem(STORE,JSON.stringify(state));storageOK=true;}catch(e){storageOK=false;}showStorage();}
function showStorageLegacy(){if($('storageNotice'))$('storageNotice').hidden=storageOK;}
function customers(){return SEED.clients.map(c=>({...c,...state.overrides[c.id]}));}
function customer(id){return customers().find(c=>c.id===String(id));}
function done(id){return state.progress[id]?.status==='done';}
function processed(id){return ['done','skip'].includes(state.progress[id]?.status);}
function loc(c){const g=state.geo[keyOf(c)];return g&&validPoint(g.point)?g:null;}
function target(c){return loc(c)?loc(c).point.map(x=>x.toFixed(6)).join(','):c.full;}
function mapsUrl(origin,destination,waypoints=[],navigate=false){const p=new URLSearchParams({api:'1',destination,travelmode:'driving',avoid:'ferries'});if(origin)p.set('origin',origin);if(waypoints.length)p.set('waypoints',waypoints.join('|'));if(navigate)p.set('dir_action','navigate');return 'https://www.google.com/maps/dir/?'+p;}
function google(c){return 'https://www.google.com/search?q='+encodeURIComponent(c.title+' '+c.town+' '+c.address);}
function mapsSearch(c){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(c.title+', '+c.full);}
function phone(c){return ((c.mobile||'')+' '+(c.phone||'')).replace(/\s|\(|\)|\.|-/g,'').match(/(?:\+34)?[6789]\d{8}/)?.[0]||'';}
function routeClients(d){return (d?.ids||[]).map(customer).filter(c=>c&&c.active&&!c.autoRouteExcluded&&c.id!=='729');}
function sourceLinks(c){const links=[...new Set([c.change?.source,...(c.urls||[])].filter(Boolean))].slice(0,4).filter(x=>/^https?:\/\//.test(x)).map((u,i)=>`<a href="${E(u)}" target="_blank" rel="noopener noreferrer">Fuente ${i+1} ↗</a>`);links.push(`<a href="${E(googleHours(c))}" target="_blank" rel="noopener noreferrer">Comprobar horario en Google ↗</a>`);return links.join(' · ');}
function badge(c){if(c.manualConfirmed)return '<span class="badge good">Confirmado por ti</span>';if(c.change)return '<span class="badge blue">Dirección actualizada</span>';if(c.status==='Dirección comercial corroborada'||c.status==='Corroborada con ajuste menor')return '<span class="badge good">Publicado por el negocio</span>';if(!c.active)return '<span class="badge amber">Por confirmar / apartado</span>';return '<span class="badge amber">Confirmar visita</span>';}
function km(v){return Number.isFinite(v)?new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(v)+' km':'Sin calcular';}
function time(v){if(!Number.isFinite(v))return 'Sin calcular';let x=Math.ceil(v);return `${Math.floor(x/60)?Math.floor(x/60)+' h ':''}${x%60} min`;}

const DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];
const DAY_NAMES={sun:'Domingo',mon:'Lunes',tue:'Martes',wed:'Miércoles',thu:'Jueves',fri:'Viernes',sat:'Sábado'};
const WORKDAYS=['mon','tue','wed','thu','fri'];
function hmMinutes(v){const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;}
function minText(v){if(!Number.isFinite(v))return '—';const m=Math.max(0,Math.round(v));return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function hoursInfo(c){return c?.businessHours||{hours:{},confidence:'unknown',source:'public-search',sourceName:'',note:'Horario no verificado.'};}
function hasPublicHours(c){const h=hoursInfo(c).hours||{};return Object.values(h).some(v=>Array.isArray(v)&&v.length);}
function isTempClosed(c){return hoursInfo(c).businessStatus==='temporarily_closed';}
function hoursConfidenceText(c){const x=hoursInfo(c).confidence;return x==='high'?'Horario contrastado':x==='medium'?'Horario asociado · revisar':x==='low'?'Horario orientativo · confirmar':'Horario no verificado';}
function dayHours(c,key){
 const h=hoursInfo(c).hours||{},windows=Array.isArray(h[key])?h[key]:null;
 if(isTempClosed(c))return 'Cerrado temporalmente';
 if(!windows)return 'Horario no verificado';
 if(!windows.length)return 'Cerrado';
 return windows.map(w=>w.join('–')).join(' · ');
}
function weeklyHoursHTML(c){
 const h=hoursInfo(c),keys=['mon','tue','wed','thu','fri','sat','sun'];
 if(isTempClosed(c))return '<div class="hours-warning"><b>Cerrado temporalmente</b><span>'+E(h.note||'Confirmar antes de visitar.')+'</span></div>';
 if(!hasPublicHours(c))return '<div class="hours-warning"><b>Horario no verificado</b><span>Se buscó información pública para esta ficha, pero no se encontró un horario inequívoco. Confirma antes de desplazarte.</span></div>';
 return '<div class="weekly-hours">'+keys.map(k=>`<div><span>${E(DAY_NAMES[k])}</span><b>${E(dayHours(c,k))}</b></div>`).join('')+'</div>';
}
function currentOpenState(c,at=new Date()){
 if(isTempClosed(c))return {class:'closed',label:'Cerrado temporalmente'};
 const h=hoursInfo(c).hours||{},key=DAY_KEYS[at.getDay()],windows=Array.isArray(h[key])?h[key]:null;
 if(!windows)return {class:'unknown',label:'Horario no verificado'};
 if(!windows.length)return {class:'closed',label:'Cerrado hoy'};
 const minute=at.getHours()*60+at.getMinutes();
 for(const [a,b] of windows){const s=hmMinutes(a),e=hmMinutes(b);if(s!==null&&e!==null&&minute>=s&&minute<e)return {class:'open',label:'Abierto ahora · hasta '+b};}
 const future=windows.map(w=>[hmMinutes(w[0]),w[0]]).filter(x=>x[0]!==null&&x[0]>minute).sort((a,b)=>a[0]-b[0])[0];
 return future?{class:'closed',label:'Cerrado ahora · abre '+future[1]}:{class:'closed',label:'Cerrado ahora'};
}
function plannedStop(d,id){return (d?.stops||[]).find(s=>String(s.id)===String(id));}
function routeAvailability(c,weekday,eta,visitMinutes){
 if(isTempClosed(c))return {possible:false,reason:'Cerrado temporalmente',known:true};
 const h=hoursInfo(c).hours||{},windows=Array.isArray(h[weekday])?h[weekday]:null;
 if(windows){
   if(!windows.length)return {possible:false,reason:'Cerrado '+DAY_NAMES[weekday].toLowerCase(),known:true};
   for(const [a,b] of windows){const s=hmMinutes(a),e=hmMinutes(b);if(s===null||e===null)continue;const arrival=Math.max(eta,s);if(arrival+visitMinutes<=e)return {possible:true,arrival,wait:Math.max(0,arrival-eta),known:true,closes:e,label:(arrival>eta?'Esperar hasta '+a:'Abierto')+' · cierra '+b};}
   return {possible:false,reason:'Fuera de horario',known:true};
 }
 // Sin horario público: nunca se presenta como abierto. Se usa una franja prudente
 // para que no bloquee la planificación, pero la ficha queda marcada para confirmar.
 const safeStart=10*60,safeEnd=13*60;const arrival=Math.max(eta,safeStart);
 if(arrival+visitMinutes<=safeEnd)return {possible:true,arrival,wait:Math.max(0,arrival-eta),known:false,closes:safeEnd,label:'Horario no verificado · confirmar antes'};
 return {possible:false,reason:'Horario no verificado fuera de franja prudente',known:false};
}
function workdayForIndex(i,startKey='mon'){let idx=Math.max(0,WORKDAYS.indexOf(startKey));return WORKDAYS[(idx+i)%WORKDAYS.length];}
function nextBusinessDayKey(){const d=new Date().getDay();return d>=1&&d<=5?DAY_KEYS[d]:'mon';}
function googleHours(c){return 'https://www.google.com/search?q='+encodeURIComponent((c.commercialName||c.title||c.name)+' '+c.town+' horario');}
function hoursBadge(c){
 const live=currentOpenState(c),conf=hoursInfo(c).confidence||'unknown';
 return `<span class="hours-badge ${E(live.class)}">${E(live.label)}</span><span class="hours-confidence ${E(conf)}">${E(hoursConfidenceText(c))}</span>`;
}

function toast(t,undo=null){$('toastText').textContent=t;$('undo').hidden=!undo;undoAction=undo;$('toast').hidden=false;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').hidden=true,7000);}
function modalClose(id){$(id).close();}
function setTab(tab){state.tab=tab;save();render();window.scrollTo({top:0,behavior:'smooth'});}
function statusNote(c){return c.manualConfirmed?'Dirección confirmada por el usuario.':c.change?.reason||c.status;}
function segments(d){const cs=routeClients(d);if(!cs.length)return [];let points=[SEED.origin,...cs,SEED.origin];const result=[];for(let i=0;i<points.length-1;i+=4){const chunk=points.slice(i,Math.min(i+5,points.length));const start=i+1,end=Math.min(i+4,cs.length);const returnOnly=i>=cs.length;const url=mapsUrl(target(chunk[0]),target(chunk.at(-1)),chunk.slice(1,-1).map(target));if(url.length>2048){for(let j=0;j<chunk.length-1;j++)result.push({label:i+j+1>cs.length?'Volver a la sede':`Visita ${i+j+1}`,url:mapsUrl(target(chunk[j]),target(chunk[j+1]))});}else result.push({label:returnOnly?'Regreso':`Tramo ${result.length+1}`,detail:returnOnly?'Último cliente → sede':`Visitas ${start}–${end}${i+4>cs.length?' + regreso':''}`,url});}return result;}

// Display-only helpers: no routing, stored progress or address is changed here.
function present(value){return value!==null&&value!==undefined&&String(value).trim()!=='';}
function shown(value){return present(value)?E(value):'<span class="missing">No informado</span>';}
function infoField(label,value,opts={}){return `<div class="sheet-field${opts.wide?' wide':''}${opts.address?' address-field':''}"><dt>${E(label)}</dt><dd>${opts.html?value:shown(value)}</dd></div>`;}
function commercialName(c){if(present(c.commercialName))return c.commercialName;return present(c.title)&&norm(c.title)!==norm(c.name)?c.title:'';}
function shownName(c){return commercialName(c)||c.title||c.name||('Cliente '+c.id);}
// Link only valid number/email substrings; retain annotations, separators and
// the complete original text. An incomplete address is never silently fixed.
function contactValue(value,kind){
 if(!present(value))return shown('');
 const text=String(value),pattern=kind==='email'?/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi:/(?:\+34[ .-]*)?[6789](?:[ .]*\d){8}(?!\d)/g;
 let result='',at=0;for(const match of text.matchAll(pattern)){if(kind!=='email'&&match.index>0&&/\d/.test(text[match.index-1]))continue;result+=E(text.slice(at,match.index));const destination=kind==='email'?'mailto:'+match[0]:'tel:'+match[0].replace(/[^\d+]/g,'');result+=`<a href="${E(destination)}">${E(match[0])}</a>`;at=match.index+match[0].length;}
 return result+E(text.slice(at));
}
function clientSheetFull(c,i,cs,d,nextId){
 const st=state.progress[c.id]?.status,progress=state.progress[c.id],same=i>0&&keyOf(c)===keyOf(cs[i-1]),leg=d.legs?.[i],point=loc(c),stop=plannedStop(d,c.id);
 const status=st==='done'?'Visita realizada':st==='skip'?'Pospuesta · sigue pendiente':c.id===nextId?'Siguiente visita':'Pendiente';
 const statusClass=st==='done'?'done':st==='skip'?'skip':c.id===nextId?'next':'';
 const roadMode=String(d.mode||'').startsWith('road');const legText=same?'Misma dirección que la visita anterior':roadMode&&!state.stale&&leg?`${km(leg.km)} desde ${i?'la visita anterior':'la sede'} · ${time(leg.minutes)}${stop?.plannedArrival?' · llegada prevista '+stop.plannedArrival:''}`:stop?.plannedArrival?`Llegada prevista ${stop.plannedArrival} · ordenado por horario y cercanía aproximada`:'Recorrido pendiente de cálculo por carretera';
 const commercial=commercialName(c),raw=c.commercialRaw;
 const fields=[
 infoField('Nombre comercial',commercial,{wide:true}),
 infoField('Razón social / nombre fiscal',c.name,{wide:true}),
 infoField('Código de cliente',c.id),
 infoField('NIF / CIF',c.nif),
 infoField('Dirección de visita',c.full,{wide:true,address:true}),
 infoField('Población',c.town),infoField('Código postal',c.cp),
 infoField('Provincia',c.province),infoField('Persona de contacto',c.contact,{wide:true}),
 infoField('Teléfono',contactValue(c.phone,'phone'),{html:true}),
 infoField('Móvil',contactValue(c.mobile,'phone'),{html:true}),
 infoField('Correo electrónico',contactValue(c.email,'email'),{html:true,wide:true}),
 infoField('Fax',contactValue(c.fax,'phone'),{html:true}),
 infoField('Agente · código original',c.agent),
 infoField('Tipo de cliente · código original',c.clientType),
 infoField('Incluido en la planificación',c.active&&!c.autoRouteExcluded?'Sí':'No'),
 infoField('Horario público · '+DAY_NAMES[stop?.weekday||d.weekday||DAY_KEYS[new Date().getDay()]],dayHours(c,stop?.weekday||d.weekday||DAY_KEYS[new Date().getDay()]),{wide:true}),
 infoField('Confianza del horario',hoursConfidenceText(c)),
 infoField('Horario revisado',hoursInfo(c).checked||'No verificado'),
 present(raw)&&norm(raw)!==norm(commercial)?infoField('Campo comercial original / referencia',raw,{wide:true}):'',
 present(c.originalMarker)?infoField('Marca original del fichero (sin interpretar)',c.originalMarker):''
 ].join('');
 const notes=present(state.notes[c.id])?E(state.notes[c.id]):'<span class="missing">Sin notas registradas.</span>';
 const advice=[c.manualConfirmed?'Dirección de visita confirmada por ti.':c.action,c.structural,...(c.hold||[]),state.geocodeFailures[keyOf(c)]].filter(present);
 const before=advice.length?`<div class="sheet-advice"><strong>Antes de la visita</strong><p>${E([...new Set(advice)].join('\n'))}</p></div>`:'';
 const auditFields=[
 infoField('Estado de la dirección',c.manualConfirmed?'Confirmada por ti':c.status,{wide:true}),
 infoField('Dirección original',c.original,{wide:true}),
 present(c.publicAddress)?infoField('Dirección publicada / alternativa',c.publicAddress,{wide:true}):'',
 present(c.samePlace)?infoField('Otras fichas en la misma dirección · códigos',c.samePlace,{wide:true}):'',
 present(c.sameTax)?infoField('Otras fichas con el mismo NIF · códigos',c.sameTax,{wide:true}):'',
 point?infoField('Coordenadas guardadas',point.point.join(', '),{wide:true}):'',
 point?.source?infoField('Origen de las coordenadas',point.source,{wide:true}):''
 ].join('');
 const evidence=[c.change?.reason,c.evidence].filter(present);
 let recorded='';if(progress?.date){const date=new Date(progress.date);if(!Number.isNaN(date.getTime()))recorded=`<p class="sheet-evidence">${st==='done'?'Visita registrada':'Última anotación'}: ${E(date.toLocaleString('es-ES'))}</p>`;}
 const sources=sourceLinks(c),tel=phone(c);
 return `<article class="visit client-sheet ${st==='done'?'completed':''} ${c.id===nextId?'current':''}" id="client-${E(c.id)}" aria-labelledby="client-title-${E(c.id)}">
  <header class="sheet-head"><span class="stopnum" aria-label="Visita ${i+1}">${st==='done'?'✓':String(i+1).padStart(2,'0')}</span><div class="sheet-heading"><div class="sheet-eyebrow">${commercial?'Nombre comercial':'Cliente · sin nombre comercial informado'}</div><h4 class="sheet-title" id="client-title-${E(c.id)}">${E(shownName(c))}</h4><div class="sheet-meta"><span class="sheet-status ${statusClass}">${E(status)}</span>${badge(c)}</div></div></header>
  <dl class="sheet-grid">${fields}</dl>
  <section class="sheet-section hours-section"><h4>Horario del negocio</h4>${hoursBadge(c)}${weeklyHoursHTML(c)}<p class="sheet-evidence">${E(hoursInfo(c).sourceName?`Fuente asociada: ${hoursInfo(c).sourceName}. `:'')}${E(hoursInfo(c).note||'')} <a href="${E(googleHours(c))}" target="_blank" rel="noopener noreferrer">Comprobar horario en Google ↗</a></p></section>
  <section class="sheet-section"><h4>Notas del cliente / visita</h4><div class="sheet-note">${notes}</div>${recorded}${before}</section>
  <section class="sheet-section sheet-audit"><h4>Dirección y comprobaciones disponibles</h4><dl class="sheet-grid">${auditFields}</dl>${[...new Set(evidence)].map(t=>`<p class="sheet-evidence">${E(t)}</p>`).join('')}${sources?`<p class="sheet-sources">Fuentes de la ficha: ${sources}</p>`:''}</section>
  <p class="sheet-leg">${E(legText)}</p>
  <div class="sheet-actions"><button class="smallbutton register" data-${processed(c.id)?'undo-visit':'visit'}="${E(c.id)}">${processed(c.id)?'Deshacer registro':'Registrar visita'}</button><a class="smallbutton" href="${E(mapsUrl(null,target(c),[],true))}" target="_blank" rel="noopener noreferrer" data-route-client="${E(c.id)}">Google Maps ↗</a>${tel?`<a class="smallbutton" href="tel:${E(tel)}">Llamar</a>`:''}<button class="smallbutton" data-edit="${E(c.id)}">Corregir ficha / notas</button></div>
 </article>`;
}

function renderBase(){
 for(const id of ['route','clients','tools'])$(id+'View').hidden=state.tab!==id;
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===state.tab);b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false');});
 state.day=Math.max(0,Math.min(state.day,Math.max(0,state.days.length-1)));
 const all=customers();$('headerSummary').textContent=`${all.length} clientes · ${all.filter(c=>c.active&&!c.autoRouteExcluded).length} en rutas · ${all.filter(c=>!c.active||c.autoRouteExcluded).length} fuera de ruta`;
 $('daySelect').innerHTML=state.days.map((d,i)=>`<option value="${i}"${state.day===i?' selected':''}>Jornada ${i+1}${d.weekdayName?' · '+d.weekdayName:''} · ${routeClients(d).length} clientes${String(d.mode||'').startsWith('road')?' · carretera':' · horario+cercanía'}</option>`).join('');
 $('prevDay').disabled=state.day<=0;$('nextDay').disabled=state.day>=state.days.length-1;
 const d=state.days[state.day]||{ids:[],mode:'provisional'};const cs=routeClients(d);let pending=cs.filter(c=>!processed(c.id));let n=cs.filter(c=>done(c.id)).length;let skips=cs.filter(c=>state.progress[c.id]?.status==='skip').length;
 $('dayTitle').textContent='Jornada '+(state.day+1)+(d.weekdayName?' · '+d.weekdayName:'');$('zone').textContent=[...new Set(cs.map(c=>c.town))].join(' → ')||'Sin clientes programados';
 $('kpiDone').textContent=`${n} / ${cs.length}`;$('kpiPending').textContent=pending.length;$('kpiRoad').textContent=String(d.mode||'').startsWith('road')&&!state.stale?km(d.km):'Horario ✓';
 $('progressBar').style.width=(cs.length?(n+skips)/cs.length*100:0)+'%';
 $('runWarning').hidden=String(d.mode||'').startsWith('road')&&!state.stale;
 $('modeLabel').textContent=state.stale?'La dirección o selección ha cambiado. Recalcula las rutas.':String(d.mode||'').startsWith('road')?'Carretera + horarios · sin tráfico en directo':'Horarios + cercanía aproximada · pendiente de distancia exacta por carretera';
 $('roadSummary').hidden=!String(d.mode||'').startsWith('road')||state.stale;
 const total=(Number(d.minutes)||0)+cs.length*(state.visitMinutes+state.parkingMinutes);
 $('roadSummary').innerHTML=String(d.mode||'').startsWith('road')?`Conducción estimada: <b>${time(d.minutes)}</b> · Con visitas y aparcamiento: <b>${time(total)}</b> · orden ajustado a los horarios públicos${total>state.dayMinutes?'<div class="alert">Esta jornada supera la duración orientativa disponible. Se prioriza no llegar con el negocio cerrado.</div>':''}`:'';
 const c=pending[0];$('nextCard').hidden=!c;$('finishedCard').hidden=!!c;
 if(c){const pos=cs.findIndex(x=>x.id===c.id)+1,stop=plannedStop(d,c.id),dayKey=stop?.weekday||d.weekday||DAY_KEYS[new Date().getDay()];$('nextNumber').textContent=String(pos).padStart(2,'0');$('nextName').textContent=shownName(c);$('nextAddress').textContent=c.full;$('nextBadge').innerHTML=badge(c)+' '+hoursBadge(c);$('nextMeta').textContent='Código '+c.id+(c.contact?' · '+c.contact:'')+' · '+dayHours(c,dayKey)+(stop?.plannedArrival?' · llegada prevista '+stop.plannedArrival:'');$('navigate').href=mapsUrl(null,target(c),[],true);$('navigate').onclick=()=>{if(!loc(c)){if(!confirm('Esta ubicación no está geocodificada. Google Maps buscará la dirección escrita. Revisa el destino antes de iniciar la navegación.'))return false;}};$('doneNext').dataset.id=c.id;$('skipNext').dataset.id=c.id;$('editNext').dataset.id=c.id;const tel=phone(c);$('callNext').hidden=!tel;$('callNext').href='tel:'+tel;}
 $('completeText').textContent=skips?`${n} visitas realizadas y ${skips} pospuestas. Puedes recuperarlas desde la lista.`:'Todas las visitas de esta jornada están registradas.';
 $('backToBase').href=mapsUrl(null,target(SEED.origin),[],true);
 $('segmentLinks').innerHTML=segments(d).map(s=>`<a class="segment" href="${E(s.url)}" target="_blank" rel="noopener noreferrer"><b>${E(s.label)} ↗</b><small>${E(s.detail||'Abrir en Google Maps')}</small></a>`).join('');
 $('visitList').innerHTML=cs.map((item,i)=>clientSheet(item,i,cs,d,c?.id)).join('')||'<p class="empty">No hay clientes programados para esta jornada.</p>';
 $('locationCount').textContent=`${cs.length} fichas · ${new Set(cs.map(keyOf)).size} direcciones textuales · ${cs.filter(hasPublicHours).length} con horario público en esta jornada. Las fichas sin horario están marcadas para confirmar.`;
 $('clientFilter').value=filterValue;renderClients();$('visitMinutes').value=state.visitMinutes;$('parkingMinutes').value=state.parkingMinutes;$('dayMinutes').value=state.dayMinutes;
 $('changesCount').textContent=SEED.changed;$('allCount').textContent=all.length;$('heldCount').textContent=all.filter(c=>!c.active||c.autoRouteExcluded).length;
 if($('hoursKnownCount'))$('hoursKnownCount').textContent=all.filter(hasPublicHours).length;if($('hoursUnknownCount'))$('hoursUnknownCount').textContent=all.filter(c=>!hasPublicHours(c)&&!isTempClosed(c)).length;
 $('calcCount').textContent=all.filter(c=>loc(c)).length;
 const assigned=new Set(state.days.flatMap(x=>x.ids));const unassigned=all.filter(c=>c.active&&!c.autoRouteExcluded&&!assigned.has(c.id));
 $('excludedNotice').hidden=!unassigned.length;$('excludedNotice').textContent=unassigned.length?'Hay '+unassigned.length+' fichas activas sin jornada: falta confirmar su ubicación o recalcular. Siguen conservadas en Clientes.':'';
 showStorage();
}
function renderClientsLegacy(){const q=norm(searchValue);const all=customers();const rows=all.filter(c=>(!q||norm([c.title,c.commercialName,c.commercialRaw,c.name,c.contact,c.phone,c.mobile,c.email,c.town,c.address,c.id,c.nif].join(' ')).includes(q))&&(filterValue==='all'||filterValue==='active'&&c.active||filterValue==='hold'&&!c.active||filterValue==='changed'&&c.change||filterValue==='unlocated'&&c.active&&!loc(c)));
 $('clientCount').textContent=rows.length+' fichas';$('customerList').innerHTML=rows.map(c=>`<article class="customercard"><div><div class="flex between"><b>${E(c.title)}</b><small>#${E(c.id)}</small></div><p>${E(c.full)}</p><div class="flex wrap">${badge(c)}<span class="subtle">${loc(c)?'Ubicación localizada':'Sin coordenadas de portal'}</span></div>${!c.active?`<p class="reason">${E(c.hold?.join(' · ')||'Apartado por el usuario')}</p>`:''}${state.geocodeFailures[keyOf(c)]?`<p class="reason">${E(state.geocodeFailures[keyOf(c)])}</p>`:''}</div><div class="flex"><button class="smallbutton" data-edit="${E(c.id)}">Ver / corregir</button><a class="smallbutton" href="${E(google(c))}" target="_blank" rel="noopener noreferrer">Google ↗</a>${phone(c)?`<a class="smallbutton" href="tel:${E(phone(c))}">Llamar</a>`:''}</div></article>`).join('')||'<p class="empty">No hay fichas con este filtro.</p>';}
function markLegacy(id,status,note){const prev=state.progress[id];const prevNote=state.notes[id];state.progress[id]={status,date:new Date().toISOString()};if(note!==undefined)state.notes[id]=note;save();render();toast(status==='done'?'Visita registrada. Ya tienes disponible la siguiente.':'Visita pospuesta; sigue pendiente de realizar.',()=>{if(prev)state.progress[id]=prev;else delete state.progress[id];if(prevNote!==undefined)state.notes[id]=prevNote;else delete state.notes[id];save();render();});}
function showVisitLegacy(id){editorId=id;$('visitName').textContent=customer(id).title;$('visitNote').value=state.notes[id]||'';$('visitDialog').showModal();}
function editAddressLegacy(id){editorId=id;const c=customer(id);$('editTitle').textContent=c.title;$('editFiscal').textContent=c.name+' · código '+c.id;$('editAddress').value=c.address;$('editTown').value=c.town;$('editCP').value=c.cp;$('editActive').checked=c.active;$('editActive').disabled=c.id==='729';$('editConfirmed').checked=!!c.manualConfirmed;const g=loc(c);$('editCoordinates').value=g?g.point.join(', '):'';$('editOriginal').textContent=c.original;$('editPublic').textContent=c.publicAddress||'No se localizó una alternativa pública inequívoca en la revisión anterior.';$('editEvidence').textContent=c.change?.reason||c.evidence;$('editSources').innerHTML=sourceLinks(c);$('editGoogle').href=google(c);$('editMap').href=mapsSearch(c);$('editReason').textContent=c.hold?.join(' · ')||c.action||'Confirma que es el establecimiento donde te recibirán.';$('editNote').value=state.notes[id]||'';$('editError').textContent='';$('editDialog').showModal();}
function parsePoint(s){s=String(s).trim();if(!s)return null;let m=s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/)||s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);if(!m)return null;const p=[+m[1],+m[2]];return validPoint(p)?p:null;}
function saveEditLegacy(){const c=customer(editorId);const address=$('editAddress').value.trim(),town=$('editTown').value.trim(),cp=$('editCP').value.trim();if(!address||!town){$('editError').textContent='Escribe calle y población.';return;}if(cp&&!/^\d{5}$/.test(cp)){$('editError').textContent='El código postal debe tener 5 cifras, o dejarse vacío.';return;}const raw=$('editCoordinates').value.trim();const point=parsePoint(raw);if(raw&&!point){$('editError').textContent='Usa latitud, longitud (por ejemplo 37.280000, -5.930000) del portal, no el centro del mapa.';return;}const active=$('editActive').checked&&c.id!=='729';const confirmed=$('editConfirmed').checked;const full=[address,cp,town,'Sevilla, España'].filter(Boolean).join(', ');const changed=full!==c.full||active!==c.active;state.overrides[c.id]={...state.overrides[c.id],address,town,cp,full,active,manualConfirmed:confirmed,hold:active?[]:c.hold?.length?c.hold:['Apartado por el usuario']};if(point){state.geo[norm(full)]={point,label:full,source:'Confirmado manualmente por el usuario',date:new Date().toISOString()};delete state.geocodeFailures[norm(full)];}else delete state.geo[norm(full)];state.notes[c.id]=$('editNote').value.trim();if(changed||point||loc(c))state.stale=true;save();$('editDialog').close();render();toast(changed?'Ficha guardada. Recalcula para incorporar el cambio a las jornadas.':'Cambios guardados.');}
function download(name,text,type){
 if(IS_ANDROID)return window.MDSAndroid.exportFile(name,text,type);
 return new Promise(resolve=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();resolve(true);},1000);});
}
function exportCSVLegacy(){const heads=['Jornada','Orden','Código','Cliente','Nombre fiscal','Dirección de visita','Dirección original','Población','CP','Teléfono','Móvil','Contacto','Email','NIF','Estado dirección','Incluido','Motivo apartado','Resultado visita','Notas','Google Maps','Fuente'];const positions={};state.days.forEach((d,i)=>d.ids.forEach((id,j)=>positions[id]=[i+1,j+1]));const rows=customers().map(c=>[...(positions[c.id]||['','']),c.id,c.title,c.name,c.full,c.original,c.town,c.cp,c.phone,c.mobile,c.contact,c.email,c.nif,statusNote(c),c.active?'Sí':'No',c.hold.join(' · '),state.progress[c.id]?.status||'pendiente',state.notes[c.id]||'',mapsUrl(null,target(c),[],true),c.change?.source||c.urls[0]||'']);const cell=x=>'"'+String(x??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';download('MDS_clientes_y_jornadas_actualizados.csv','\ufeff'+[heads,...rows].map(r=>r.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');}
function exportHTMLLegacy(){save();const root=document.documentElement.cloneNode(true);root.querySelector('#saved-state').textContent=JSON.stringify(state).replace(/</g,'\\u003c');root.querySelectorAll('dialog').forEach(d=>d.removeAttribute('open'));root.querySelector('#toast').setAttribute('hidden','');root.querySelector('#busyPanel').setAttribute('hidden','');download('MDS_Visitas_mi_copia.html','<!doctype html>\n'+root.outerHTML,'text/html;charset=utf-8');toast('Copia guardada con direcciones, jornadas y visitas.');}
function hav(a,b){const r=Math.PI/180,dlat=(b[0]-a[0])*r,dlon=(b[1]-a[1])*r;return 6371008.8*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dlon/2)**2)));}
function splitAddress(c){
 let a=c.address.replace(/\b(?:C\.?\s*P\.?|CODIGO POSTAL)\s*\d[\d .]*/gi,'').trim();
 if(/\bKM\b|\bS\s*\/\s*N\b/i.test(a))return {street:a,number:null,query:a+', '+c.town};
 // A local, nave or apartment number is not the street entrance number.
 a=a.replace(/\b(?:local(?:es)?|nave|bloque|blq\.?|planta|puerta|oficina|piso|esc(?:alera)?)\b.*$/i,'').trim().replace(/[,\s]+$/,'');
 const comma=a.match(/^(.*?),\s*(?:N[º°.]?\s*|NUMERO\s+)?(\d+[a-z]?)(?:\s*-\s*\d+[a-z]?)*(?=\s|,|$|\.)/i);
 const trailing=a.match(/^(.*?)\s+(?:N[º°.]?\s*|NUMERO\s+)?(\d+[a-z]?)(?:\s*-\s*\d+[a-z]?)*(?:\s+\d+[ºªa-z]?(?:\s*[a-z])?)?[.,\s]*$/i);
 const match=comma||trailing;
 if(!match)return {street:a,number:null,query:a+', '+c.town};
 const street=match[1].trim().replace(/[,\s]+$/,'');const number=match[2];
 if(!tokens(street).some(t=>/[a-z]/.test(t)))return {street:a,number:null,query:a+', '+c.town};
 return {street,number,query:street+' '+number+', '+c.town};
}
const stopwords=new Set(['calle','avenida','avda','av','carretera','ctra','crta','de','del','la','el','los','las','c','cl','plaza','paseo','p','i','poligono','industrial','pol','nave']);
function tokens(s){return norm(s).split(' ').filter(x=>x&&!stopwords.has(x));}
function addressMatch(c,raw){const parsed=splitAddress(c);if(!parsed.number)return false;const muni=norm(raw.muni||raw.city||raw.town||raw.poblacion||'');const expect=norm(c.town);const aliases=[expect,expect.replace(' de sevilla',''),expect==='san jose de la rinconada'?'la rinconada':expect,expect==='los rosales'?'tocina':expect];if(!aliases.includes(muni)&&!aliases.includes(norm(raw.poblacion)))return false;const n=String(raw.portalNumber??raw.housenumber??'').toLowerCase().replace(/^0+/,'');if(n!==parsed.number.toLowerCase().replace(/^0+/,''))return false;const a=tokens(parsed.street),b=new Set(tokens(raw.address||raw.street||''));if(!a.length||a.some(x=>!b.has(x)))return false;const lat=num(raw.lat),lng=num(raw.lng??raw.lon);return lat!==null&&lng!==null&&validPoint([lat,lng]);}
let nextRequest=0;
async function fetchJSON(url){if(abortRun)throw Error('Cálculo detenido.');const delay=Math.max(0,nextRequest-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));if(abortRun)throw Error('Cálculo detenido.');nextRequest=Date.now()+1100;const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),18000);try{const response=await fetch(url,{signal:ctrl.signal,credentials:'omit',cache:'no-store'});if(!response.ok)throw Error('Servicio externo: HTTP '+response.status);return await response.json();}catch(e){if(e.name==='AbortError')throw Error('El servicio de mapas ha tardado demasiado en responder. Vuelve a intentarlo más tarde.');if(e instanceof TypeError)throw Error('No se pudo conectar con el servicio de mapas. Comprueba Internet; también puede estar limitado por el servicio o el navegador.');throw e;}finally{clearTimeout(timer);}}
async function geocode(c){const key=keyOf(c);if(loc(c))return loc(c);if(state.geocodeFailures[key])return null;const p=splitAddress(c);if(!p.number){state.geocodeFailures[key]='Dirección sin portal inequívoco. Abre la ficha, confirma el acceso y pega sus coordenadas.';return null;}let results=await fetchJSON('https://www.cartociudad.es/geocoder/api/geocoder/candidates?'+new URLSearchParams({q:p.query,limit:'10'}));if(!Array.isArray(results))throw Error('Respuesta de geocodificación no reconocida.');let matches=results.filter(x=>addressMatch(c,x));let unique=[...new Map(matches.map(x=>[[Number(x.lat).toFixed(6),Number(x.lng).toFixed(6)].join(','),x])).values()];if(unique.length===1){const x=unique[0];const out={point:[+x.lat,+x.lng],label:x.address+' · '+x.portalNumber+' · '+x.muni,source:'CartoCiudad / IGN',date:new Date().toISOString()};state.geo[key]=out;return out;}state.geocodeFailures[key]=unique.length>1?'Varios portales posibles: confirma las coordenadas en la ficha.':'No se ha encontrado coincidencia inequívoca de calle, número y municipio. No se usa el centro del código postal.';return null;}
function report(text,percent){$('busyTitle').textContent=text;$('calcProgress').value=Math.max(0,Math.min(100,percent));$('busyPercent').textContent=Math.round(percent)+' %';}
function greedyDays(ids,locationIndex,D,T,limit=15){
 const remaining=new Set(ids.map(String)),result=[],startKey=nextBusinessDayKey();let dayIndex=0,emptyDays=0;
 while(remaining.size&&dayIndex<260){
   const weekday=workdayForIndex(dayIndex,startKey),weekdayName=DAY_NAMES[weekday];
   let cursor=0,route=[],legs=[],stops=[],meters=0,seconds=0,waitMinutes=0,current=7*60+30;
   for(let k=0;k<limit&&remaining.size;k++){
     let best=null,bestScore=Infinity,bestData=null;
     for(const id of remaining){
       const c=customer(id);if(!c||c.autoRouteExcluded||isTempClosed(c))continue;
       const idx=locationIndex[id],dist=D[cursor]?.[idx],dur=T[cursor]?.[idx];
       if(dist===null||dur===null||!Number.isFinite(dist)||!Number.isFinite(dur))continue;
       const eta=current+dur/60,availability=routeAvailability(c,weekday,eta,state.visitMinutes);
       if(!availability.possible)continue;
       const slack=Number.isFinite(availability.closes)?availability.closes-(availability.arrival+state.visitMinutes):999;
       const urgency=Math.max(0,120-slack);
       const score=dist+availability.wait*450+(availability.known?0:5000)-urgency*15;
       if(score<bestScore-0.01||(Math.abs(score-bestScore)<0.01&&(dur<(bestData?.dur??Infinity)||(dur===(bestData?.dur??Infinity)&&Number(id)<Number(best))))){
         best=id;bestScore=score;bestData={idx,dist,dur,eta,availability,slack};
       }
     }
     if(best===null)break;
     const c=customer(best),a=bestData.availability;
     remaining.delete(best);route.push(best);meters+=bestData.dist;seconds+=bestData.dur;waitMinutes+=a.wait||0;
     legs.push({km:bestData.dist/1000,minutes:bestData.dur/60,waitMinutes:a.wait||0});
     stops.push({id:best,order:route.length,plannedArrival:minText(a.arrival),distanceFromPreviousKm:bestData.dist/1000,openingStatusAtPlan:a.known?(a.wait?`Apertura ${minText(a.arrival)} · cierra ${minText(a.closes)}`:`Abierto · cierra ${minText(a.closes)}`):'Horario no verificado · confirmar antes',hoursConfidence:hoursInfo(c).confidence||'unknown',weekday});
     current=a.arrival+state.visitMinutes+state.parkingMinutes;cursor=bestData.idx;
   }
   if(route.length){
     const backD=D[cursor]?.[0],backT=T[cursor]?.[0];
     if(!Number.isFinite(backD)||!Number.isFinite(backT))throw Error('No se pudo calcular el regreso a la sede.');
     result.push({number:result.length+1,weekday,weekdayName,ids:route,stops,mode:'road-hours',km:(meters+backD)/1000,minutes:(seconds+backT)/60,waitMinutes,legs,returnKm:backD/1000,returnMinutes:backT/60,calculated:new Date().toISOString(),criterion:'Primero clientes visitables según horario público a la hora estimada; entre ellos, menor distancia por carretera desde la ubicación anterior. Las fichas sin horario se usan solo en una franja prudente y quedan marcadas para confirmar.'});
     emptyDays=0;
   }else{
     emptyDays++;
     if(emptyDays>=5)break;
   }
   dayIndex++;
 }
 return {days:result,unreachable:[...remaining]};
}
async function roadMatrix(points){const N=points.length,D=Array.from({length:N},()=>Array(N).fill(null)),T=Array.from({length:N},()=>Array(N).fill(null));let far=new Set(),count=0,blocks=Math.ceil(N/40)**2;for(let a=0;a<N;a+=40)for(let b=0;b<N;b+=40){if(abortRun)throw Error('Cálculo detenido.');const src=Array.from({length:Math.min(40,N-a)},(_,i)=>a+i),dst=Array.from({length:Math.min(40,N-b)},(_,i)=>b+i);const idx=[...new Set([...src,...dst])];const local=new Map(idx.map((v,i)=>[v,i]));const coords=idx.map(i=>points[i][1].toFixed(6)+','+points[i][0].toFixed(6)).join(';');const u='https://router.project-osrm.org/table/v1/driving/'+coords+'?'+new URLSearchParams({sources:src.map(i=>local.get(i)).join(';'),destinations:dst.map(i=>local.get(i)).join(';'),annotations:'distance,duration'});const json=await fetchJSON(u);if(json.code!=='Ok'||!Array.isArray(json.distances)||!Array.isArray(json.durations))throw Error('No hay una matriz de carreteras válida: '+(json.message||json.code||'respuesta incompleta'));src.forEach((r,i)=>dst.forEach((c,j)=>{D[r][c]=json.distances[i]?.[j]??null;T[r][c]=json.durations[i]?.[j]??null;}));(json.sources||[]).forEach((v,i)=>{if(v.distance>200)far.add(src[i]);});(json.destinations||[]).forEach((v,i)=>{if(v.distance>200)far.add(dst[i]);});report('Calculando recorridos por carretera…',55+40*(++count)/blocks);}return {D,T,far};}
async function calculate(){if(busy)return;if(!confirm('Se enviarán únicamente calles y poblaciones a CartoCiudad, y coordenadas a OSRM para calcular las distancias por carretera. No se envían NIF, teléfonos ni notas. El orden combinará horario público + distancia desde la visita anterior. Los horarios no verificados se marcarán para confirmar y los negocios cerrados temporalmente no se programarán. ¿Optimizar ahora?'))return;busy=true;abortRun=false;$('busyPanel').hidden=false;$('stopCalc').disabled=false;const previous=state.days;$('calcError').hidden=true;report('Localizando el punto de salida…',0);try{
 let depot=await geocode(SEED.origin);if(!depot)throw Error('Primero hay que localizar con precisión la sede. En Herramientas puedes introducir sus coordenadas del portal.');
 const locked=previous.filter(d=>d.ids.some(id=>processed(id))).map(d=>state.stale?{...d,mode:'hours-approx',km:null,minutes:null,legs:[],needsReview:true}:d);const lockedIds=new Set(locked.flatMap(d=>d.ids));const cs=customers().filter(c=>c.active&&!c.autoRouteExcluded&&c.id!=='729'&&!lockedIds.has(c.id));let good=[],bad=[];
 for(let i=0;i<cs.length;i++){report(`Localizando dirección ${i+1} de ${cs.length} · ${cs[i].town}`,5+50*i/Math.max(1,cs.length));const g=await geocode(cs[i]);if(g)good.push(cs[i]);else bad.push(cs[i].id);if(i%10===0)save();}
 if(!good.length)throw Error('No se localizaron nuevos portales con suficiente precisión. Revisa las fichas sin coordenadas. El borrador anterior sigue disponible.');
 const points=[depot.point],unique=new Map([[depot.point.join(','),0]]),index={};for(const c of good){const point=loc(c).point,k=point.join(',');if(!unique.has(k)){unique.set(k,points.length);points.push(point);}index[c.id]=unique.get(k);}
 const {D,T,far}=await roadMatrix(points);if(far.has(0))throw Error('La sede está demasiado lejos de la vía calculada: confirma su acceso.');const safe=good.filter(c=>!far.has(index[c.id]));good.filter(c=>far.has(index[c.id])).forEach(c=>{bad.push(c.id);state.geocodeFailures[keyOf(c)]='El punto queda a más de 200 m de la vía. Confirma el acceso en coche.';});
 const out=greedyDays(safe.map(c=>c.id),index,D,T,15);if(!out.days.length)throw Error('No se pudo construir ninguna jornada conectada con la sede.');
 const expected=safe.length-out.unreachable.length,actual=out.days.flatMap(d=>d.ids);if(actual.length!==expected||new Set(actual).size!==actual.length)throw Error('La comprobación de integridad ha fallado. No se han aplicado las rutas.');
 if(abortRun)throw Error('Cálculo detenido.');state.days=[...locked,...out.days];state.day=locked.length;state.stale=false;state.lastCalculation={date:new Date().toISOString(),located:good.length,excluded:[...bad,...out.unreachable],count:actual.length,lockedDays:locked.length};save();report('Jornadas por carretera y horarios guardadas.',100);render();toast(`${out.days.length} jornadas optimizadas por carretera + horarios. ${bad.length+out.unreachable.length} fichas requieren ubicación u horario compatible. Las visitas ya empezadas no se han movido.`);
 }catch(e){save();$('calcError').textContent=(abortRun?'Cálculo detenido.':(e.message||'No se pudo conectar con los servicios de mapas.'))+' No se han sustituido las jornadas anteriores. Las ubicaciones ya obtenidas quedan guardadas.';$('calcError').hidden=false;toast('No se ha completado la optimización por carretera + horarios. Se conserva el plan anterior.');}finally{busy=false;$('busyPanel').hidden=true;render();}}
function validateImportLegacy(x){if(!x||x.version!==3||!Array.isArray(x.days)||!x.overrides||!x.progress||!x.geo)throw Error('No es una copia válida de MDS Visitas.');const ids=new Set(SEED.clients.map(c=>c.id));const assigned=[];for(const d of x.days){if(!Array.isArray(d.ids)||d.ids.length>15||d.ids.some(id=>!ids.has(String(id))))throw Error('La copia contiene jornadas no válidas.');assigned.push(...d.ids);}if(new Set(assigned).size!==assigned.length)throw Error('La copia repite clientes entre jornadas.');for(const id of Object.keys(x.overrides)){if(!ids.has(id))throw Error('La copia contiene clientes desconocidos.');}return x;}

document.addEventListener('click',e=>{const a=e.target.closest('a[data-route-client]');if(!a)return;const c=customer(a.dataset.routeClient);if(c&&!loc(c)&&!confirm('Esta ubicación no está geocodificada. Google Maps buscará la dirección escrita. Revisa el destino antes de iniciar la navegación.'))e.preventDefault();});

// UI event handlers. No external dependency, tracker or automatic background request.
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(busy&&!['stopCalc'].includes(b.id)){toast('Hay un cálculo en curso. Puedes detenerlo antes de modificar datos.');return;}if(b.dataset.tab)setTab(b.dataset.tab);if(b.dataset.edit)edit(b.dataset.edit);if(b.dataset.visit)showVisit(b.dataset.visit);if(b.dataset.undoVisit){delete state.progress[b.dataset.undoVisit];save();render();}if(b.dataset.close)modalClose(b.dataset.close);});
$('daySelect').addEventListener('change',e=>{state.day=+e.target.value;save();render();});
$('prevDay').onclick=()=>{if(busy)return;state.day--;save();render();};$('nextDay').onclick=()=>{if(busy)return;state.day++;save();render();};
$('doneNext').onclick=e=>{if(!busy)showVisit(e.currentTarget.dataset.id);};$('skipNext').onclick=e=>{if(!busy)mark(e.currentTarget.dataset.id,'skip');};$('editNext').onclick=e=>{if(!busy)edit(e.currentTarget.dataset.id);};
$('visitSave').onclick=()=>{if(busy)return;mark(editorId,'done',$('visitNote').value.trim());$('visitDialog').close();};$('editSave').onclick=()=>{if(!busy)saveEdit();};
for(const field of ['editAddress','editTown','editCP'])$(field).addEventListener('input',()=>{if($('editCoordinates').value){$('editCoordinates').value='';$('editError').textContent='La dirección ha cambiado: se han retirado las coordenadas anteriores. Podrás localizarla al recalcular.';}});
$('undo').onclick=()=>{if(undoAction)undoAction();$('toast').hidden=true;};
$('search').oninput=e=>{searchValue=e.target.value;renderClients();};$('clientFilter').onchange=e=>{filterValue=e.target.value;renderClients();};
$('calcRoutes').onclick=calculate;$('calcRoutes2').onclick=calculate;$('stopCalc').onclick=()=>{abortRun=true;$('stopCalc').disabled=true;$('busyTitle').textContent='Deteniendo sin cambiar tus jornadas…';};
$('saveCopy').onclick=exportHTML;$('saveCopy2').onclick=exportHTML;$('exportCSV').onclick=exportCSV;
$('exportJSON').onclick=()=>download('MDS_Visitas_copia.json',JSON.stringify(state,null,2),'application/json');
$('importJSON').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>8000000)throw Error('La copia supera el tamaño admitido.');const data=validateImport(JSON.parse(await file.text()));if(confirm('Se sustituirán los datos guardados en este navegador por la copia seleccionada. ¿Continuar?')){state={...state,...data};save();render();toast('Copia restaurada.');}}catch(err){toast(err.message);}e.target.value='';};
$('saveTimes').onclick=()=>{const v=+$('visitMinutes').value,p=+$('parkingMinutes').value,d=+$('dayMinutes').value;if(!Number.isFinite(v)||!Number.isFinite(p)||!Number.isFinite(d)||v<1||v>240||p<0||p>120||d<60||d>960){toast('Revisa los minutos indicados.');return;}Object.assign(state,{visitMinutes:v,parkingMinutes:p,dayMinutes:d});save();render();toast('Duraciones orientativas guardadas.');};
$('saveOrigin').onclick=()=>{const point=parsePoint($('originCoordinates').value);if(!point){toast('Introduce las coordenadas del portal de la sede: latitud, longitud.');return;}state.geo[keyOf(SEED.origin)]={point,label:SEED.origin.full,source:'Sede confirmada por el usuario',date:new Date().toISOString()};delete state.geocodeFailures[keyOf(SEED.origin)];state.stale=true;save();toast('Punto de salida guardado. Puedes calcular las rutas.');render();};
$('retryLocations').onclick=()=>{state.geocodeFailures={};save();toast('Puedes volver a calcular para reintentar las direcciones no localizadas.');render();};
$('showHeld').onclick=()=>{filterValue='hold';setTab('clients');};$('showChanged').onclick=()=>{filterValue='changed';setTab('clients');};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
window.MDS_TEST={splitAddress,addressMatch,greedyDays,segments,parsePoint,mapsUrl,validateImport,customers,loc,commercialName,shownName,contactValue,clientSheet};

// Mobile/offline layer. Plain JavaScript, no third-party library or telemetry.
const MOBILE_FORMAT='mds-visitas-mobile';
const MOBILE_STORE='mds-visitas-mobile-v1';
const MOBILE_DB='mds-visitas-mobile-v1';
let db=null, writeQueue=Promise.resolve(), writeCount=0, lastSaveOK=false;
let detailId=null, deferredInstall=null, cacheReady=false, lastStorageError='', remoteConflict=false;
let editDraftTimer=null, noteDraftTimer=null;
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
function baseState(seed){return {version:3,updated:0,overrides:{},progress:{},notes:{},geo:{},geocodeFailures:{},days:clone(seed.days||[]),day:0,tab:'route',stale:false,visitMinutes:20,parkingMinutes:5,dayMinutes:480,crm:{},history:{},drafts:{},mobileSchema:1};}
function completeState(x){return {...baseState(SEED),...x,crm:x.crm||{},history:x.history||{},drafts:x.drafts||{},notes:x.notes||{},geocodeFailures:x.geocodeFailures||{},mobileSchema:1};}

function migrateStateToEmbedded(x){
 const ids=new Set(EMBEDDED_SEED.clients.map(c=>String(c.id))),out=completeState(clone(x||{}));
 const filterById=obj=>Object.fromEntries(Object.entries(obj||{}).filter(([id])=>ids.has(String(id))));
 out.overrides=filterById(out.overrides);out.progress=filterById(out.progress);out.notes=filterById(out.notes);out.crm=filterById(out.crm);out.history=filterById(out.history);
 out.drafts=Object.fromEntries(Object.entries(out.drafts||{}).filter(([key])=>{const id=String(key).split(':').at(-1);return ids.has(id);}));
 out.days=clone(EMBEDDED_SEED.days||[]);out.day=Math.max(0,Math.min(Number(out.day)||0,Math.max(0,out.days.length-1)));delete out.lastCalculation;
 // Se conservan correcciones/notas del usuario. Si cambió una dirección o la inclusión,
 // se avisa para que pueda recalcular la distancia exacta.
 out.stale=Object.values(out.overrides||{}).some(v=>v&&(v.address!==undefined||v.town!==undefined||v.cp!==undefined||v.active!==undefined));
 return out;
}

function bundle(){return {format:MOBILE_FORMAT,schema:1,exportedAt:new Date().toISOString(),seed:SEED,state};}
function openDB(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(Error('Base local no disponible.'));let settled=false;const request=indexedDB.open(MOBILE_DB,1);const timer=setTimeout(()=>{settled=true;reject(Error('La base local no respondió.'));},5000);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('kv'))request.result.createObjectStore('kv');};request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);reject(Error('Cierra otras ventanas de esta app.'));};});}
function dbRead(){return new Promise((resolve,reject)=>{const t=db.transaction('kv','readonly'),r=t.objectStore('kv').get('bundle');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbWrite(value){return new Promise((resolve,reject)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(value,'bundle');t.oncomplete=()=>resolve(true);t.onabort=t.onerror=()=>reject(t.error||Error('No se pudo guardar la base local.'));});}
function showStorage(){
 if($('storageNotice')){$('storageNotice').hidden=storageOK&&!remoteConflict;$('storageNotice').innerHTML=remoteConflict?'Otra ventana ha modificado los datos. Guarda una copia de tus cambios y vuelve a abrir esta app antes de seguir.':'No se ha podido guardar en este dispositivo. No cierres la app: usa <b>Copia de seguridad</b> para conservar los cambios.';}
 const label=remoteConflict?'Reabrir: cambios en otra ventana':writeCount?'Guardando en el dispositivo…':storageOK?((db||IS_ANDROID&&nativeSaveOK)?'Guardado en el dispositivo':'Guardado local · modo limitado'):'Guardado no disponible';
 if($('saveStatus')){$('saveStatus').textContent=label;$('saveStatus').classList.toggle('bad',!storageOK||remoteConflict);}
 if($('storageEngine'))$('storageEngine').textContent=IS_ANDROID?(nativeSaveOK?'Guardado privado de Android + base local':'Base local · revisar respaldo de Android'):(db?'Base local IndexedDB + respaldo local':'Respaldo local del navegador');
 if($('storageDetails'))$('storageDetails').textContent=lastStorageError||'Los clientes, jornadas, contactos, notas e historial se guardan aquí. No se sincronizan con otros dispositivos.';
}
function save(){
 if(remoteConflict){storageOK=false;showStorage();return Promise.resolve(false);}
 state.updated=Date.now();let snapshot;try{snapshot=clone(bundle());}catch(e){lastStorageError=e.message;storageOK=false;showStorage();return Promise.resolve(false);}
 let nativeOK=false;if(IS_ANDROID){try{nativeOK=!!MDSNative.saveBundle(JSON.stringify(snapshot));nativeSaveOK=nativeOK;}catch{nativeSaveOK=false;}}
 let localOK=false;try{localStorage.setItem(MOBILE_STORE,JSON.stringify(snapshot));localOK=true;}catch(e){lastStorageError='El respaldo local no está disponible; se intenta guardar en la base del dispositivo.';}
 writeCount++;showStorage();
 const task=writeQueue.then(async()=>{let databaseOK=false;if(db){try{await dbWrite(snapshot);databaseOK=true;lastStorageError='';}catch(e){lastStorageError='No se pudo escribir en IndexedDB. '+(localOK?'Los cambios están en el respaldo local.':'Haz una copia de seguridad antes de cerrar.');}}
 storageOK=databaseOK||localOK||nativeOK;if(nativeOK)lastStorageError='';lastSaveOK=storageOK;return storageOK;}).catch(e=>{lastStorageError=e.message;storageOK=localOK||nativeOK;lastSaveOK=storageOK;return storageOK;}).finally(()=>{writeCount--;showStorage();});
 writeQueue=task;return task;
}
function safelyReadLocal(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function verifySeed(seed){if(!seed||!Array.isArray(seed.clients)||seed.clients.length>10000||!seed.origin||typeof seed.origin.full!=='string'||!Array.isArray(seed.days))throw Error('La copia no contiene una base de clientes válida.');const ids=new Set();for(const c of seed.clients){if(!c||typeof c.id!=='string'||!c.id||ids.has(c.id)||typeof c.name!=='string'||typeof c.full!=='string')throw Error('Hay códigos duplicados o fichas no válidas.');ids.add(c.id);if(c.urls!==undefined&&!Array.isArray(c.urls))throw Error('Fuentes del cliente no válidas.');if(c.hold!==undefined&&!Array.isArray(c.hold))throw Error('Avisos del cliente no válidos.');}return ids;}
function validateStateFor(x,seed){
 if(!x||x.version!==3||!Array.isArray(x.days)||!x.overrides||typeof x.overrides!=='object'||Array.isArray(x.overrides)||!x.progress||!x.geo)throw Error('No es una copia válida de MDS Visitas.');
 const ids=verifySeed(seed),assigned=[];
 for(const d of x.days){if(!d||!Array.isArray(d.ids)||d.ids.length>15||d.ids.some(id=>!ids.has(String(id))))throw Error('La copia contiene jornadas no válidas.');assigned.push(...d.ids.map(String));}
 if(new Set(assigned).size!==assigned.length)throw Error('La copia repite clientes entre jornadas.');
 for(const id of Object.keys(x.overrides)){if(!ids.has(id)||!x.overrides[id]||typeof x.overrides[id]!=='object')throw Error('Hay correcciones de clientes desconocidos.');if(x.overrides[id].id!==undefined&&String(x.overrides[id].id)!==id)throw Error('No se puede alterar el código de un cliente.');for(const k of ['hold','urls'])if(x.overrides[id][k]!==undefined&&!Array.isArray(x.overrides[id][k]))throw Error('Avisos o fuentes no válidos en una corrección.');for(const k of ['name','title','full','address','town','cp'])if(x.overrides[id][k]!==undefined&&typeof x.overrides[id][k]!=='string')throw Error('Texto del cliente no válido: '+k);}
 for(const field of ['notes','history','crm','drafts','progress','geo','geocodeFailures'])if(x[field]!==undefined&&(typeof x[field]!=='object'||x[field]===null||Array.isArray(x[field])))throw Error('Campo no válido en la copia: '+field);
 if(x.history)for(const [id,entries]of Object.entries(x.history)){if(!ids.has(id)||!Array.isArray(entries)||entries.some(h=>!h||typeof h!=='object'||typeof h.text!=='string'))throw Error('Historial no válido.');}
 if(x.crm)for(const [id,info]of Object.entries(x.crm)){if(!ids.has(id)||!info||typeof info!=='object'||info.custom!==undefined&&(!Array.isArray(info.custom)||info.custom.some(f=>!f||typeof f.label!=='string'||typeof f.value!=='string')))throw Error('Información del cliente no válida.');}
 if(x.tab&&!['route','clients','tools'].includes(x.tab))x.tab='route';
 return x;
}
function validateImport(x){return validateStateFor(x,SEED);}
function parseBackup(data){if(data?.format===MOBILE_FORMAT&&data.seed){validateStateFor(data.state,data.seed);return data;}if(data?.clients&&data?.origin){verifySeed(data);const s=baseState(data);validateStateFor(s,data);return {seed:data,state:s};}if(!SEED.clients.length)throw Error('Primero importa CLIENTES_MDS.json. Después podrás restaurar una copia de la versión anterior.');validateStateFor(data,SEED);return {seed:SEED,state:data};}
async function importBackup(file,ask=true){
 if(!file)return false;if(file.size>32*1024*1024)throw Error('El archivo supera los 32 MB.');
 const raw=await file.text();const data=JSON.parse(raw,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw Error('La copia contiene una clave no permitida.');return value;});
 const incoming=parseBackup(data);
 if(ask&&SEED.clients.length&&!confirm('Se sustituirá la base y las anotaciones de este dispositivo por la copia seleccionada. Exporta antes tus avances si debes conservarlos. ¿Restaurar?'))return false;
 const useEmbedded=EMBEDDED_SEED.clients.length&&incoming.seed?.dataRevision!==EMBEDDED_SEED.dataRevision;SEED=useEmbedded?clone(EMBEDDED_SEED):clone(incoming.seed);state=useEmbedded?migrateStateToEmbedded(clone(incoming.state)):completeState(clone(incoming.state));state.tab='route';state.day=Math.max(0,Math.min(state.day,state.days.length-1));remoteConflict=false;detailId=null;
 const ok=await save();render();toast(ok?'Clientes y jornadas guardados en este dispositivo.':'Datos cargados, pero no se han podido guardar. Exporta una copia antes de cerrar.');return ok;
}
function statusLabel(id){return done(id)?'Realizada':state.progress[id]?.status==='skip'?'Pospuesta':'Pendiente';}
function clientSheet(c,i,cs,d,nextId){
 const priority=state.crm[c.id]?.priority,stop=plannedStop(d,c.id),dayKey=stop?.weekday||d.weekday||DAY_KEYS[new Date().getDay()];
 const planned=stop?.plannedArrival?` · Previsto ${stop.plannedArrival}`:'';
 const schedule=stop?.openingStatusAtPlan|| (hasPublicHours(c)?dayHours(c,dayKey):'Horario por confirmar');
 const scheduleClass=isTempClosed(c)?'closed':hasPublicHours(c)?'open':'unknown';
 return `<button type="button" class="visit compact-client ${c.id===nextId?'current':''} ${done(c.id)?'completed':''}" data-open="${E(c.id)}" aria-label="Abrir ficha completa de ${E(shownName(c))}"><span class="stopnum">${done(c.id)?'✓':String(i+1).padStart(2,'0')}</span><span class="compact-main"><strong>${E(shownName(c))}</strong><span class="compact-address">${E(c.address)} · ${E(c.town)}</span><span class="compact-hours ${E(scheduleClass)}">${E(schedule)}${E(planned)}</span><span class="compact-meta">${c.id===nextId?'Siguiente visita':statusLabel(c.id)}${priority==='Alta'?' · Prioridad alta':''}${(state.history[c.id]||[]).length?' · Con historial':''}</span></span><span class="chevron" aria-hidden="true">›</span></button>`;
}
function renderClients(){
 const q=norm(searchValue);
 const rows=customers().filter(c=>{
   const match=!q||norm([c.title,c.commercialName,c.commercialRaw,c.name,c.contact,c.phone,c.mobile,c.email,c.town,c.address,c.id,c.nif,state.notes[c.id],hoursInfo(c).sourceName].join(' ')).includes(q);
   const filter=filterValue==='all'||filterValue==='active'&&c.active&&!c.autoRouteExcluded||filterValue==='hold'&&(!c.active||c.autoRouteExcluded)||filterValue==='changed'&&c.change||filterValue==='unlocated'&&c.active&&!loc(c)||filterValue==='hours'&&hasPublicHours(c)||filterValue==='nohours'&&!hasPublicHours(c)&&!isTempClosed(c)||filterValue==='tempclosed'&&isTempClosed(c);
   return match&&filter;
 });
 $('clientCount').textContent=rows.length+' clientes · toca uno para ver su ficha';
 $('customerList').innerHTML=rows.map(c=>{const live=currentOpenState(c);return `<button type="button" class="compact-client catalog-client" data-open="${E(c.id)}" aria-label="Abrir ficha completa de ${E(shownName(c))}"><span class="initials">${E(shownName(c).split(/\s+/).slice(0,2).map(s=>s[0]).join(''))}</span><span class="compact-main"><strong>${E(shownName(c))}</strong><span class="compact-address">${E(c.town)} · ${E(c.address)}</span><span class="compact-hours ${E(live.class)}">${E(live.label)}</span><span class="compact-meta">#${E(c.id)}${!c.active||c.autoRouteExcluded?' · Fuera de ruta automática':''}${state.crm[c.id]?.followUp?' · Seguimiento '+E(state.crm[c.id].followUp):''}</span></span><span class="chevron" aria-hidden="true">›</span></button>`}).join('')||'<p class="empty">No hay clientes con este filtro.</p>';
}
function render(){renderBase();$('welcomePanel').hidden=SEED.clients.length>0;document.querySelector('main.container').hidden=!SEED.clients.length;document.querySelector('.mobilenav').hidden=!SEED.clients.length;if(SEED.clients.length){$('headerSummary').textContent=customers().length+' clientes · guardados en este móvil';const cs=routeClients(state.days[state.day]),c=cs.find(x=>!processed(x.id));if(c){$('nextName').dataset.open=c.id;$('nextName').setAttribute('role','button');$('nextName').setAttribute('tabindex','0');$('nextName').setAttribute('aria-label','Abrir ficha de '+shownName(c));$('editNext').dataset.id=c.id;}const baseOnly=state.days.every(d=>!String(d.mode||'').startsWith('road'));$('planHint').textContent=baseOnly?'Las jornadas integradas ya tienen en cuenta horarios públicos y cercanía aproximada. Pulsa para sustituir la distancia aproximada por carretera exacta.':'Se mantiene el cálculo por carretera y horarios guardado; revisa los avisos y las fichas sin horario verificado.';}
 updateConnectivity();showStorage();}
function eventEntry(id,type,text,extra={}){const item={id:uid(),date:new Date().toISOString(),type,text,...extra};(state.history[id]??=[]).push(item);return item.id;}
function detailRefresh(){if(detailId&&$('detailDialog').open)fillDetails(detailId);}
function historyHTML(id){const entries=(state.history[id]||[]).slice().reverse();if(!entries.length&&state.progress[id]?.date)entries.push({date:state.progress[id].date,type:'Registro anterior',text:state.progress[id].status==='done'?'Visita realizada en la versión anterior.':'Visita pospuesta en la versión anterior.'});return entries.length?entries.map(h=>`<article class="timeline-item"><div class="flex between"><b>${E(h.type||'Anotación')}</b><time>${E(new Date(h.date).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'}))}</time></div><p>${E(h.text||'Sin observaciones adicionales.')}</p>${h.nextDate?`<small>Seguimiento: ${E(h.nextDate)}</small>`:''}</article>`).join(''):'<p class="subtle">Todavía no has añadido anotaciones ni visitas a este cliente.</p>';}
function fillDetails(id){const c=customer(id);if(!c)return;const day=state.days.find(d=>d.ids.includes(id))||{ids:[id],mode:'provisional'},cs=day.ids.map(customer).filter(Boolean),index=Math.max(0,cs.findIndex(c=>c.id===id));const info=state.crm[id]||{};
 $('detailTitle').textContent=shownName(c);$('detailCode').textContent='Ficha de cliente · #'+c.id;
 $('detailContent').innerHTML=`<div class="detail-actions"><button class="primary" data-add-note="${E(id)}">＋ Añadir información</button><button class="secondary" data-edit="${E(id)}">Editar datos</button></div><section class="crm-summary"><h3>Información comercial</h3><dl class="sheet-grid">${infoField('Prioridad',info.priority||'Normal')}${infoField('Próximo seguimiento',info.followUp)}${infoField('Horario / disponibilidad',info.hours,{wide:true})}${infoField('Interés / productos',info.interest,{wide:true})}${(info.custom||[]).map(f=>infoField(f.label,f.value,{wide:true})).join('')}</dl></section>${clientSheetFull(c,index,cs,day,cs.find(x=>!processed(x.id))?.id)}<section class="history-section" id="clientHistory"><h3>Historial del cliente</h3><p class="subtle">Observaciones, cambios y visitas guardados en este dispositivo.</p>${historyHTML(id)}</section>`;
 $('detailContent').querySelector('.sheet-actions button[data-edit]').textContent='Editar datos y notas';const summary=$('detailContent').querySelector('.crm-summary');$('detailContent').querySelector('.client-sheet > .sheet-grid').after(summary);}
function showDetails(id){if(busy){toast('Detén el cálculo antes de abrir una ficha.');return;}if(!customer(id))return;detailId=id;fillDetails(id);if(!$('detailDialog').open)$('detailDialog').showModal();$('detailContent').scrollTop=0;}
function showAddNote(id){if(!customer(id))return;editorId=id;$('noteCustomer').textContent=shownName(customer(id));const draft=state.drafts['note:'+id]||{};$('noteType').value=draft.type||'Observación';$('noteText').value=draft.text||'';$('noteNextDate').value=draft.nextDate||'';$('noteDraftStatus').textContent=draft.text?'Borrador recuperado. Pulsa Guardar para añadirlo al historial.':'La anotación se guardará en el historial del cliente.';$('noteDialog').showModal();}
function flushNoteDraft(){if(!$('noteDialog').open||!editorId)return;state.drafts['note:'+editorId]={type:$('noteType').value,text:$('noteText').value,nextDate:$('noteNextDate').value};save().then(ok=>$('noteDraftStatus').textContent=ok?'Borrador guardado en el dispositivo. Pulsa Guardar para añadirlo al historial.':'Borrador sin guardar: haz una copia de seguridad.');}
function modalClose(id){if(id==='editDialog'){clearTimeout(editDraftTimer);flushEditDraft();}if(id==='noteDialog'){clearTimeout(noteDraftTimer);flushNoteDraft();}$(id).close();}
async function saveClientNote(){const text=$('noteText').value.trim(),nextDate=$('noteNextDate').value;if(!text&&!nextDate){$('noteDraftStatus').textContent='Escribe la información que quieres añadir o una fecha de seguimiento.';return;}if($('noteSave').disabled)return;$('noteSave').disabled=true;const id=editorId;eventEntry(id,$('noteType').value,text,{nextDate});if(nextDate)state.crm[id]={...state.crm[id],followUp:nextDate};delete state.drafts['note:'+id];clearTimeout(noteDraftTimer);const ok=await save();$('noteDialog').close();$('noteSave').disabled=false;render();detailRefresh();toast(ok?'Información añadida al historial del cliente.':'Información en pantalla, sin guardado confirmado. Haz una copia.');}
const editFields={editCommercial:'commercialName',editLegal:'name',editContact:'contact',editPhone:'phone',editMobile:'mobile',editEmail:'email',editTax:'nif',editFax:'fax',editAgent:'agent',editClientType:'clientType',editProvince:'province',editRaw:'commercialRaw',editAddress:'address',editTown:'town',editCP:'cp'};
function customFieldsHTML(items){$('customFields').innerHTML=(items||[]).map(f=>`<div class="custom-field-row"><input aria-label="Nombre del dato adicional" class="custom-label" placeholder="Dato (ej. Máquina instalada)" value="${E(f.label||'')}"><input aria-label="Valor del dato adicional" class="custom-value" placeholder="Información" value="${E(f.value||'')}"><button class="remove-custom secondary" type="button" aria-label="Quitar dato adicional">×</button></div>`).join('');}
function editorValues(){const fields={};for(const [id,key]of Object.entries(editFields))fields[key]=$(id).value;return {fields,active:$('editActive').checked,confirmed:$('editConfirmed').checked,coordinates:$('editCoordinates').value,note:$('editNote').value,crm:{priority:$('editPriority').value,followUp:$('editFollowUp').value,hours:$('editHours').value,interest:$('editInterest').value,custom:[...$('customFields').children].map(row=>({label:row.querySelector('.custom-label').value,value:row.querySelector('.custom-value').value}))}};}
function applyEditorValues(v){for(const [id,key]of Object.entries(editFields))$(id).value=v.fields[key]??'';$('editActive').checked=!!v.active;$('editConfirmed').checked=!!v.confirmed;$('editCoordinates').value=v.coordinates||'';$('editNote').value=v.note||'';const info=v.crm||{};$('editPriority').value=info.priority||'Normal';$('editFollowUp').value=info.followUp||'';$('editHours').value=info.hours||'';$('editInterest').value=info.interest||'';customFieldsHTML(info.custom||[]);}
function edit(id){editAddressLegacy(id);const c=customer(id);const values={fields:c,active:c.active,confirmed:c.manualConfirmed,coordinates:loc(c)?.point.join(', ')||'',note:state.notes[id]||'',crm:state.crm[id]||{}};applyEditorValues(state.drafts['edit:'+id]||values);$('editDraftStatus').textContent=state.drafts['edit:'+id]?'Borrador recuperado. Guarda para aplicar las modificaciones.':'Los borradores se conservan; pulsa Guardar ficha para aplicar los cambios.';}
function flushEditDraft(){if(!$('editDialog').open||!editorId)return;state.drafts['edit:'+editorId]=editorValues();save().then(ok=>$('editDraftStatus').textContent=ok?'Borrador guardado en el dispositivo. Pulsa Guardar ficha para aplicar.':'Borrador sin guardar. Haz una copia antes de cerrar.');}
async function saveEdit(){
 if($('editSave').disabled)return;const c=customer(editorId);const values=editorValues(),fields=Object.fromEntries(Object.entries(values.fields).map(([k,v])=>[k,v.trim()]));
 if(!fields.name||!fields.address||!fields.town){$('editError').textContent='Completa al menos razón social, dirección y población.';return;}
 if(fields.cp&&!/^\d{5}$/.test(fields.cp)){$('editError').textContent='El código postal debe tener 5 cifras, o quedar vacío.';return;}
 const point=parsePoint(values.coordinates);if(values.coordinates.trim()&&!point){$('editError').textContent='Usa la latitud y longitud del portal: 37.280000, -5.930000.';return;}
 if(values.crm.custom.some(f=>!f.label.trim()&&f.value.trim())){$('editError').textContent='Pon un nombre a cada dato adicional.';return;}
 $('editSave').disabled=true;const changedAddress=['address','town','cp','province'].some(k=>(fields[k]||'')!==(c[k]||''));
 const full=changedAddress?[fields.address,fields.cp,fields.town,fields.province||'Sevilla','España'].filter(Boolean).join(', '):c.full;
 const active=values.active&&c.id!=='729',oldGeo=loc(c),pointChanged=JSON.stringify(oldGeo?.point||null)!==JSON.stringify(point);
 const title=fields.commercialName||fields.name;
 state.overrides[c.id]={...state.overrides[c.id],...fields,title,full,active,manualConfirmed:values.confirmed,hold:active?[]:c.hold?.length?c.hold:['Apartado por el usuario']};
 if(changedAddress){delete state.geo[keyOf(c)];delete state.geocodeFailures[keyOf(c)];}
 if(point&&(pointChanged||changedAddress))state.geo[norm(full)]={point,label:full,source:'Confirmado manualmente por el usuario',date:new Date().toISOString()};
 else if(!point&&pointChanged)delete state.geo[norm(full)];
 if(changedAddress||pointChanged||active!==c.active)state.stale=true;
 state.notes[c.id]=values.note.trim();state.crm[c.id]={...values.crm,custom:values.crm.custom.filter(f=>f.label.trim()).map(f=>({label:f.label.trim(),value:f.value.trim()}))};
 const modified=Object.entries(fields).filter(([k,v])=>v!==(c[k]||'')).map(([key])=>({commercialName:'nombre comercial',name:'razón social',contact:'contacto',phone:'teléfono',mobile:'móvil',email:'correo',nif:'NIF/CIF',address:'dirección',town:'población',cp:'código postal',province:'provincia',fax:'fax',agent:'agente',clientType:'tipo de cliente',commercialRaw:'referencia comercial'}[key]||key));
 eventEntry(c.id,'Ficha actualizada',modified.length?'Datos modificados: '+modified.join(', ')+'.':'Información comercial o notas actualizadas.');
 delete state.drafts['edit:'+c.id];clearTimeout(editDraftTimer);const ok=await save();$('editDialog').close();$('editSave').disabled=false;render();detailRefresh();toast(ok?'Ficha guardada en este dispositivo.'+(changedAddress?' La ruta necesita revisión.':''):'No se pudo confirmar el guardado. Exporta una copia.');
}
function showVisit(id){editorId=id;$('visitName').textContent=shownName(customer(id));$('visitNote').value=state.drafts['visit:'+id]||'';$('visitDialog').showModal();}
async function mark(id,status,note){const prev=clone(state.progress[id]||null);state.progress[id]={status,date:new Date().toISOString()};const eventId=eventEntry(id,status==='done'?'Visita realizada':'Visita pospuesta',note||'');delete state.drafts['visit:'+id];const ok=await save();render();detailRefresh();toast(ok?(status==='done'?'Visita guardada. Puedes continuar con la siguiente.':'Visita pospuesta; no cuenta como realizada.'):'No se pudo confirmar el guardado. Exporta una copia.',async()=>{if(prev)state.progress[id]=prev;else delete state.progress[id];state.history[id]=(state.history[id]||[]).filter(x=>x.id!==eventId);await save();render();detailRefresh();});return ok;}
async function undoVisit(id){delete state.progress[id];eventEntry(id,'Registro deshecho','La visita vuelve a quedar pendiente.');await save();render();detailRefresh();}
async function exportBackup(){
 window.MDSAndroid?.flushDrafts();
 const ok=await download('MDS_Visitas_copia_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(bundle(),null,2),'application/json');
 if(ok){state.lastBackup=Date.now();await save();toast('Copia guardada. Contiene datos privados de clientes.');}
 else toast('No se ha guardado la copia. Tus datos siguen dentro de la aplicación.');
}
async function exportHTML(){return exportBackup();}
function exportCSV(){const heads=['Jornada','Orden','Código','Nombre comercial','Razón social','Dirección','Dirección original','Población','CP','Provincia','Contacto','Teléfono','Móvil','Email','NIF','Fax','Agente','Tipo de cliente','Prioridad','Seguimiento','Horario','Interés','Datos adicionales','Estado visita','Notas','Historial'];const pos={};state.days.forEach((d,i)=>d.ids.forEach((id,j)=>pos[id]=[i+1,j+1]));const rows=customers().map(c=>{const x=state.crm[c.id]||{};return [...(pos[c.id]||['','']),c.id,commercialName(c),c.name,c.full,c.original,c.town,c.cp,c.province,c.contact,c.phone,c.mobile,c.email,c.nif,c.fax,c.agent,c.clientType,x.priority||'Normal',x.followUp,x.hours,x.interest,(x.custom||[]).map(f=>f.label+': '+f.value).join('\n'),statusLabel(c.id),state.notes[c.id],(state.history[c.id]||[]).map(h=>h.date+' | '+h.type+' | '+h.text).join('\n')];});const cell=x=>'"'+String(x??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';download('MDS_clientes_movil.csv','\ufeff'+[heads,...rows].map(r=>r.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');}
function updateConnectivity(){const online=navigator.onLine;$('connectionStatus').textContent=online?'Con conexión':'Sin conexión';$('connectionStatus').classList.toggle('offline',!online);$('offlineNotice').hidden=online;$('cacheStatus').textContent=location.protocol==='file:'?'Archivo local · no es una app instalada':cacheReady?'Aplicación disponible sin conexión':'Preparando modo sin conexión…';if($('installHelpText'))$('installHelpText').textContent=location.protocol==='file:'?'Estás en la versión HTML de consulta. Para instalar, publica la carpeta web del ZIP en HTTPS y abre esa dirección en el móvil.':matchMedia('(display-mode: standalone)').matches||navigator.standalone?'Ya estás utilizando la app desde su icono.':'Android: menú del navegador → Instalar aplicación. iPhone: Safari → Compartir → Añadir a pantalla de inicio → Abrir como app, si aparece.';if(IS_ANDROID){$('cacheStatus').textContent='Aplicación Android · disponible sin conexión';$('installApp').hidden=true;if($('installHelpText'))$('installHelpText').textContent='APK instalado. No necesitas servidor ni instalar una aplicación web.';}}
async function installApp(){if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;}else{$('installDialog').showModal();updateConnectivity();}}
async function protectStorage(){if(IS_ANDROID){$('persistenceStatus').textContent='Guardado en los datos privados de Android, no en la caché temporal. Borrar los datos o desinstalar elimina la información. Conserva copias de seguridad.';toast('El guardado local está activo. Exporta copias periódicamente.');return;}if(!navigator.storage?.persist){toast('Este navegador no permite solicitar almacenamiento persistente. Conserva copias de seguridad.');return;}try{const granted=await navigator.storage.persist();$('persistenceStatus').textContent=granted?'Protección contra borrado automático concedida. Borrar los datos de la app los elimina igualmente.':'El navegador no ha concedido la protección. Puedes seguir usando la app; conserva una copia.';toast(granted?'Protección de almacenamiento concedida.':'Protección no concedida por el navegador.');}catch{toast('No se pudo solicitar la protección de almacenamiento.');}}
async function setupPWA(){updateConnectivity();if(IS_ANDROID){cacheReady=true;updateConnectivity();return;}if(location.protocol==='file:')return;if(!isSecureContext||!('serviceWorker'in navigator)){$('cacheStatus').textContent='Necesitas HTTPS y un navegador compatible para el modo sin conexión.';return;}try{const reg=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;cacheReady=true;updateConnectivity();if(reg.waiting)$('updateBanner').hidden=false;reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)$('updateBanner').hidden=false;});});$('applyUpdate').onclick=async()=>{if(busy||$('editDialog').open||$('noteDialog').open||$('visitDialog').open){toast('Guarda y cierra la ficha antes de actualizar la aplicación.');return;}await save();if(reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'});navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});}else location.reload();};}catch{$('cacheStatus').textContent='No se ha podido preparar la app sin conexión. Reabre con Internet.';}}
async function bootMobile(){
 let saved=[];
 if(IS_ANDROID){try{const raw=MDSNative.readBundle();if(raw){const b=JSON.parse(raw);if(b?.format===MOBILE_FORMAT){validateStateFor(b.state,b.seed);saved.push(b);nativeSaveOK=true;}}}catch{lastStorageError='No se pudo leer el respaldo privado de Android. Se intentará recuperar la base local.';}}
 try{db=await openDB();const b=await dbRead();if(b?.format===MOBILE_FORMAT){validateStateFor(b.state,b.seed);saved.push(b);}}catch(e){lastStorageError=e.message;}
 const local=safelyReadLocal(MOBILE_STORE);if(local?.format===MOBILE_FORMAT){try{validateStateFor(local.state,local.seed);saved.push(local);}catch{lastStorageError='Se ha ignorado un respaldo local no válido.';}}
 if(SNAP&&SEED.clients.length){try{validateStateFor(SNAP,SEED);saved.push({seed:SEED,state:SNAP});}catch{}}
 if(SEED.clients.length){const legacy=safelyReadLocal(STORE);if(legacy?.version===3){try{validateStateFor(legacy,SEED);saved.push({seed:SEED,state:legacy});}catch{}}}
 if(saved.length){saved.sort((a,b)=>(b.state.updated||0)-(a.state.updated||0));const best=saved[0],useEmbedded=EMBEDDED_SEED.clients.length&&best.seed?.dataRevision!==EMBEDDED_SEED.dataRevision;SEED=useEmbedded?clone(EMBEDDED_SEED):clone(best.seed);state=useEmbedded?migrateStateToEmbedded(clone(best.state)):completeState(clone(best.state));}else{SEED=clone(EMBEDDED_SEED);state=completeState(state);}
 if(SEED.clients.length)await save();else{storageOK=!!db;lastSaveOK=storageOK;}
 render();$('bootOverlay').hidden=true;
 const g=loc(SEED.origin);if(g)$('originCoordinates').value=g.point.join(', ');
 setupPWA();if(IS_ANDROID){$('persistenceStatus').textContent='Almacenamiento privado de Android. Desinstalar o borrar los datos elimina tus avances.';}else navigator.storage?.persisted?.().then(granted=>{$('persistenceStatus').textContent=granted?'Protección de almacenamiento concedida. Sigue haciendo copias de seguridad.':'Puedes pedir protección contra el borrado automático. El sistema decide si la concede.';}).catch(()=>{});
 window.MDS_MOBILE_TEST={bundle:()=>clone(bundle()),save,importBackup,validateStateFor,showDetails,showAddNote,protectStorage,ready:true};
}
// Capture protects compact cards from the original delegated editor handlers.
document.addEventListener('click',e=>{const t=e.target.closest('[data-open],[data-add-note],[data-undo-visit]');if(!t)return;e.preventDefault();e.stopImmediatePropagation();if(busy){toast('Detén el cálculo antes de modificar las fichas.');return;}if(t.dataset.open)showDetails(t.dataset.open);if(t.dataset.addNote)showAddNote(t.dataset.addNote);if(t.dataset.undoVisit)undoVisit(t.dataset.undoVisit);},true);
document.addEventListener('keydown',e=>{if(e.target.matches('[data-open]:not(button)')&&['Enter',' '].includes(e.key)){e.preventDefault();showDetails(e.target.dataset.open);}});
$('editNext').onclick=e=>showDetails(e.currentTarget.dataset.id);
$('detailDialog').addEventListener('close',()=>{detailId=null;});
$('noteSave').onclick=saveClientNote;
$('noteDialog').addEventListener('input',()=>{clearTimeout(noteDraftTimer);noteDraftTimer=setTimeout(flushNoteDraft,250);});
$('editDialog').addEventListener('input',()=>{clearTimeout(editDraftTimer);editDraftTimer=setTimeout(flushEditDraft,250);});
$('addCustomField').onclick=()=>{const current=editorValues().crm.custom;current.push({label:'',value:''});customFieldsHTML(current);$('customFields').lastElementChild.querySelector('input').focus();flushEditDraft();};
$('customFields').addEventListener('click',e=>{if(e.target.closest('.remove-custom')){e.target.closest('.custom-field-row').remove();flushEditDraft();}});
$('visitNote').addEventListener('input',()=>{if(editorId){state.drafts['visit:'+editorId]=$('visitNote').value;save();}});
$('visitSave').onclick=async()=>{if(busy||$('visitSave').disabled)return;$('visitSave').disabled=true;const id=editorId;await mark(id,'done',$('visitNote').value.trim());$('visitDialog').close();$('visitSave').disabled=false;};
$('exportJSON').onclick=exportBackup;$('saveCopy').onclick=exportBackup;$('saveCopy2').onclick=exportBackup;
$('exportPortable').onclick=exportHTML;$('installApp').onclick=installApp;$('protectStorage').onclick=protectStorage;
for(const id of ['importJSON','firstImport'])$(id).onchange=async e=>{try{await importBackup(e.target.files[0]);}catch(err){toast('No se ha importado: '+err.message);}e.target.value='';};
for(const id of ['calcRoutes','calcRoutes2'])$(id).onclick=()=>{if(!navigator.onLine){toast('Necesitas Internet para recalcular. Tus jornadas y notas siguen disponibles.');return;}calculate();};
for(const id of ['editDialog','noteDialog'])$(id).addEventListener('cancel',()=>{if(id==='editDialog'){clearTimeout(editDraftTimer);flushEditDraft();}else{clearTimeout(noteDraftTimer);flushNoteDraft();}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('installApp').hidden=false;});
window.addEventListener('appinstalled',()=>{$('installApp').hidden=true;toast('Aplicación instalada. Ábrela desde su icono.');});
window.addEventListener('online',updateConnectivity);window.addEventListener('offline',updateConnectivity);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){clearTimeout(editDraftTimer);clearTimeout(noteDraftTimer);flushEditDraft();flushNoteDraft();}});
window.addEventListener('beforeunload',e=>{if(writeCount||!storageOK){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',e=>{if(e.key!==MOBILE_STORE||!e.newValue)return;try{const other=JSON.parse(e.newValue);if(other.state.updated>state.updated&&SEED.clients.length){remoteConflict=true;showStorage();}}catch{}});

// Native adapter: only the packaged app can call this interface. No remote HTML is loaded.
window.MDSAndroid={
 pending:new Map(),
 exportFile(name,text,type){
   if(this.pending.size){toast('Termina primero la copia que tienes abierta.');return Promise.resolve(false);}
   const id=uid();
   return new Promise(resolve=>{
     this.pending.set(id,resolve);
     try{MDSNative.exportText(String(name),String(text),String(type),id);}
     catch{this.pending.delete(id);resolve(false);toast('No se pudo abrir el selector de guardado.');}
   });
 },
 exportResult(id,ok,message){
   const resolve=this.pending.get(id);this.pending.delete(id);
   if(resolve)resolve(!!ok);
   if(message&&!ok)toast(message);
 },
 flushDrafts(){
   if($('editDialog').open){clearTimeout(editDraftTimer);flushEditDraft();}
   if($('noteDialog').open){clearTimeout(noteDraftTimer);flushNoteDraft();}
   if($('visitDialog').open&&editorId){state.drafts['visit:'+editorId]=$('visitNote').value;save();}
 },
 back(){
   const id=['noteDialog','editDialog','visitDialog','installDialog','detailDialog'].find(id=>$(id)?.open);
   if(id){this.flushDrafts();modalClose(id);return true;}
   if(busy){toast('Detén el cálculo antes de cerrar la aplicación.');return true;}
   if(state.tab!=='route'){setTab('route');return true;}
   this.flushDrafts();save();return false;
 }
};
if(IS_ANDROID)document.addEventListener('click',e=>{
 const a=e.target.closest('a[href]');
 if(!a||e.defaultPrevented)return;
 const href=a.getAttribute('href');
 if(!href||href.startsWith('#'))return;
 e.preventDefault();
 if(/^(https?:|tel:|mailto:|geo:)/i.test(href))MDSNative.openExternal(a.href);
 else toast('Este tipo de enlace no está permitido.');
});

bootMobile().catch(e=>{$('bootOverlay').hidden=true;$('welcomePanel').hidden=false;storageOK=false;lastStorageError=e.message;showStorage();toast('No se pudieron recuperar los datos. Restaura una copia de seguridad.');});
