/* Pin Parade browser shell. Game saves remain in Godot's origin-scoped /userfs. */
(() => {
'use strict';
const files=window.PinParadeWebFiles;
const status=document.getElementById('start-status');
const play=document.getElementById('play');
const silentPlay=document.getElementById('play-silent');
const startNormal=()=>startGame(false),startSilent=()=>startGame(true);
const progress=document.getElementById('progress');
const frame=document.getElementById('game-frame');
const canvas=document.getElementById('canvas');
let offlineReady=false,started=false,registration=null;
let engine=null;
const appleTouch=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const standalone=()=>navigator.standalone===true || matchMedia('(display-mode: standalone)').matches;
function notice(text){const node=document.getElementById('notice');node.textContent=text;node.hidden=false;}
function fit(){
 if(window.AstroPinsDevice && window.AstroPinsDevice.needsPortrait)return;
 const v=window.visualViewport;
 document.documentElement.style.setProperty('--visible-height',`${v?v.height:innerHeight}px`);
 document.documentElement.style.setProperty('--visible-top',`${v?v.offsetTop:0}px`);
 const bounds=frame.getBoundingClientRect(),ratio=appleTouch?1:Math.min(devicePixelRatio||1,2);
 const w=Math.max(1,Math.round(bounds.width*ratio)),h=Math.max(1,Math.round(bounds.height*ratio));
 if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
}
function waitForWorker(reg){return new Promise((resolve,reject)=>{
 if(reg.active){resolve(reg.active);return;}
 const worker=reg.installing||reg.waiting;
 if(!worker){reject(Error('No se pudo preparar el modo sin conexión.'));return;}
 const timeout=setTimeout(()=>reject(Error('La descarga está tardando. Revisá tu conexión y volvé a abrir el juego.')),180000);
 const check=()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve(worker);}else if(worker.state==='redundant'){clearTimeout(timeout);reject(Error('La descarga no terminó. Conectate y volvé a intentarlo.'));}};
 worker.addEventListener('statechange',check);check();
});}
function workerStatus(worker){return new Promise((resolve,reject)=>{
 const ch=new MessageChannel(),timeout=setTimeout(()=>{ch.port1.close();reject(Error('No se pudo verificar la descarga sin conexión.'));},12000);
 ch.port1.onmessage=e=>{clearTimeout(timeout);ch.port1.close();resolve(e.data);};
 worker.postMessage({type:'PIN_OFFLINE_STATUS',requestId:Date.now()},[ch.port2]);
});}
async function prepareOffline(){
 if(!isSecureContext || !('serviceWorker' in navigator))throw Error('Este navegador no permite preparar el juego sin conexión. Abrí el enlace en Safari.');
 status.textContent='Descargando el juego completo. La primera vez puede tardar unos minutos.';
 registration=await navigator.serviceWorker.register('pin-sw.js',{scope:'./',updateViaCache:'none'});
 const worker=await waitForWorker(registration),result=await workerStatus(worker);
 if(!result.ready)throw Error('Faltan archivos por descargar. Conectate a internet y volvé a intentarlo.');
 if(result.build!==files.build){const error=Error('Hay una actualización preparada. Cerrá todas las ventanas del juego y volvé a abrirlo. Tu partida se conserva.');error.code='UPDATE_PENDING';throw error;}
 offlineReady=true;
 status.textContent='✓ Listo sin conexión';
 const updateNotice=()=>{if(registration.waiting)notice('Hay una actualización preparada. Cerrá todas las ventanas del juego y volvé a abrirlo para usarla. Tu partida se conserva.');};
 registration.addEventListener('updatefound',()=>{const w=registration.installing;if(w)w.addEventListener('statechange',updateNotice);});
 updateNotice();
}
async function requestPersistence(){
 try{if(standalone() && navigator.storage && navigator.storage.persist){await navigator.storage.persist();}}catch(_){}
}
function loadWasm(){
 let index=0,reader=null;
 const stream=new ReadableStream({async pull(controller){
  try{
   while(true){
    if(!reader){
     if(index===files.chunks.length){controller.close();return;}
     const part=files.chunks[index++],response=await fetch(part.url,{credentials:'same-origin'});
     if(!response.ok)throw Error('No se pudo cargar el motor. Conectate y volvé a abrir el juego.');
     reader=response.body.getReader();
    }
    const result=await reader.read();
    if(result.done){reader=null;continue;}
    controller.enqueue(result.value);return;
   }
  }catch(e){controller.error(e);}
 },cancel(reason){if(reader)return reader.cancel(reason);}});
 return Promise.resolve(new Response(stream,{headers:{'Content-Type':'application/wasm'}}));
}
async function startGame(silent){
 if(window.AstroPinsDevice && window.AstroPinsDevice.needsPortrait)return;
 if(window.AstroPinsDevice)window.AstroPinsDevice.requestPortrait();
 if(started)return;started=true;play.disabled=true;silentPlay.disabled=true;
 const chosen=silent?silentPlay:play;chosen.textContent='Abriendo…';progress.hidden=false;
 await requestPersistence();
 try{
  const missing=Engine.getMissingFeatures({threads:false});
  if(missing.length)throw Error('Este navegador necesita WebGL 2 y WebAssembly para jugar. Probá actualizar iOS.');
  const config=window.PinParadeExportConfig;
  config.unloadAfterInit=true;config.canvasResizePolicy=0;config.mainPack=files.pack;config.serviceWorker='';config.ensureCrossOriginIsolationHeaders=false;
  config.persistentPaths=['/userfs/AstroPinsAlpha'];
  config.fileSizes={...config.fileSizes,[files.pack]:files.packBytes};
  if(silent)config.args=['--audio-driver','Dummy','--','--astro-silent'];
  engine=new Engine(config);
  await engine.startGame({onProgress(current,total){if(total>0){progress.value=current;progress.max=total;}},onPrintError(...args){console.error(...args);}});
  document.getElementById('welcome').hidden=true;canvas.focus();fit();
 }catch(e){started=false;status.textContent='No se pudo abrir el juego. '+(e.message||String(e));play.disabled=false;play.textContent='Volver a cargar';progress.hidden=true;play.removeEventListener('click',startNormal);play.addEventListener('click',()=>location.reload(),{once:true});silentPlay.textContent='Entrar sin sonido';}
}
async function boot(){
 fit();window.addEventListener('astropins:devicechange',fit);window.addEventListener('resize',fit);if(window.visualViewport){visualViewport.addEventListener('resize',fit);visualViewport.addEventListener('scroll',fit);}if('ResizeObserver' in window)new ResizeObserver(fit).observe(frame);
 document.getElementById('install-tip').hidden=standalone();
 play.addEventListener('click',startNormal);silentPlay.addEventListener('click',startSilent);
 try{await prepareOffline();play.disabled=false;silentPlay.disabled=false;play.textContent='Jugar';progress.hidden=true;}
 catch(e){status.textContent=e.message||'No se pudo completar la descarga.';progress.hidden=true;play.disabled=e.code==='UPDATE_PENDING';play.textContent=e.code==='UPDATE_PENDING'?'Cerrá y volvé a abrir':'Reintentar descarga';play.removeEventListener('click',startNormal);if(e.code!=='UPDATE_PENDING')play.addEventListener('click',()=>location.reload());}
 window.addEventListener('online',()=>{if(registration)registration.update().catch(()=>{});});
}
window.PinParadeWeb={boot,loadWasm,notice,get offlineReady(){return offlineReady;},get started(){return started;}};
})();
