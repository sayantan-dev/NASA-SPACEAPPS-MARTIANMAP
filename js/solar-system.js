/* ARES Solar System: schematic distance/radius scale, independent time-based spin and orbital periods. */
(function () {
  'use strict';
  const host = document.getElementById('solar-view');
  if (!host || !window.THREE) return;
  const Motion = window.ARES_ORBIT_MATH;
  if (!Motion) throw new Error('ARES orbit-math.js must load before solar-system.js');
  // Two explicit visual clocks: one simulated orbital year takes 90 real seconds;
  // one simulated axial day takes 30 real seconds. The orbit-rate selector scales
  // only the orbit clock. Both clocks pause together and neither depends on frame count.
  const ORBIT_SIM_SECONDS_PER_REAL_SECOND = Motion.EARTH_YEAR_SECONDS / Motion.REAL_SECONDS_PER_SIMULATED_YEAR;
  const AXIAL_SIM_SECONDS_PER_REAL_SECOND = 86400 / Motion.REAL_SECONDS_PER_SIMULATED_DAY;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 650);
  camera.position.set(0, 38, 78);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .055;
  controls.minDistance = 8; controls.maxDistance = 160; controls.maxPolarAngle = Math.PI * .92;
  let cameraMove = null, focusLock = null;
  function moveCamera(position, target, duration = 1100, focusName = null, offset = null) {
    focusLock = null;
    cameraMove = { p0: camera.position.clone(), p1: position.clone(), t0: controls.target.clone(), t1: target.clone(),
      started: performance.now(), duration, focusName, offset };
  }
  controls.addEventListener('start', () => { if (!journey) { cameraMove = null; focusLock = null; } });
  scene.add(new THREE.AmbientLight(0x566577, .18));
  const sunLight = new THREE.PointLight(0xffdfbd, 3.8, 500, 1.15); scene.add(sunLight);
  const starGeo = new THREE.BufferGeometry(), starPos = [];
  for (let i = 0; i < 2400; i++) { const r = 120 + Math.random() * 230, a = Math.random() * Math.PI * 2, z = (Math.random() - .5) * 280; starPos.push(Math.cos(a)*r,z,Math.sin(a)*r); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc4d4e0, size: .2, transparent: true, opacity: .7, sizeAttenuation: true })));
  const loader = new THREE.TextureLoader();
  const maps = {
    Mercury: 'mercury-nasa.jpg', Venus: 'venus-clouds.jpg', Earth: 'earth-with-clouds-nasa.jpg', Mars: 'mars.jpg',
    Jupiter: 'jupiter.jpg', Saturn: 'saturn.jpg', Uranus: 'uranus.jpg', Neptune: 'neptune.jpg'
  };
  const fallbackColors = {Mercury:0x77736e,Venus:0xd4b26f,Earth:0x28658d,Mars:0xa94f36,Jupiter:0xb88b68,Saturn:0xc8b28a,Uranus:0x77b7bc,Neptune:0x315dba};
  const mapCache = new Map();
  function loadMap(name, material) {
    if (mapCache.has(name)) { material.map = mapCache.get(name); material.needsUpdate = true; return; }
    loader.load(`assets/planet-maps/${maps[name]}`, tex => {
      if (THREE.SRGBColorSpace && 'colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      mapCache.set(name, tex); material.map = tex; material.color.set(0xffffff); material.needsUpdate = true;
    }, undefined, err => console.warn(`ARES: failed loading ${maps[name]}`, err));
  }
  // name, schematic radius, display radius, orbital period (Earth years), signed sidereal period (Earth days), orbital inclination, axial tilt.
  // Negative sidereal periods mean retrograde relative to orbital north; the pole tilt is applied separately.
  const specs = [
    ['Mercury',10,1.05,.240846,58.646,7.00,.034],['Venus',15,1.55,.615,-243.025,3.39,177.36],
    ['Earth',21,1.72,1,.99726968,0,23.44],['Mars',28,1.35,1.8808,1.02595675,1.85,25.19],
    ['Jupiter',40,5,11.862,.41354,1.30,3.13],['Saturn',53,4.25,29.457,.44401,2.49,26.73],
    ['Uranus',66,3,84.0168,-.71833,.77,97.77],['Neptune',78,2.9,164.79,.67125,1.77,28.32]
  ];
  const bodies = new Map(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5.2, 96, 64), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); scene.add(sun);
  const corona = new THREE.Mesh(new THREE.SphereGeometry(6.4, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffb961, transparent: true, opacity: .09, side: THREE.BackSide })); scene.add(corona);
  const orbitMat = new THREE.LineBasicMaterial({ color: 0x9eafbb, transparent: true, opacity: .14 });
  function setOrbitalPlane(group, degrees) { group.rotation.set(THREE.MathUtils.degToRad(degrees), 0, 0); }
  specs.forEach((s, index) => {
    const [name, radius, size, orbitalYears, spinDays, orbitDeg, axialDeg] = s;
    const orbitalPlane = new THREE.Group(); setOrbitalPlane(orbitalPlane, orbitDeg); scene.add(orbitalPlane);
    const orbitPivot = new THREE.Group(); orbitalPlane.add(orbitPivot);
    const path = []; for(let i=0;i<=256;i++){const a=i/256*Math.PI*2;path.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}
    const orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(path), orbitMat.clone());
    setOrbitalPlane(orbitLine, orbitDeg); scene.add(orbitLine);
    const orbitalPosition = new THREE.Group(); orbitalPosition.position.x = radius; orbitPivot.add(orbitalPosition);
    const axis = new THREE.Group(); axis.rotation.z = THREE.MathUtils.degToRad(axialDeg); orbitalPosition.add(axis);
    const material = new THREE.MeshStandardMaterial({ color: fallbackColors[name], roughness: .94, metalness: 0 });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(size, 96, 64), material); planet.userData.planetName = name; axis.add(planet);
    if(name==='Earth'){
      const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(size*1.018,80,56),new THREE.MeshBasicMaterial({color:0x78bfff,transparent:true,opacity:.075,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending}));
      planet.add(atmosphere);
    }
    const halo = new THREE.Mesh(new THREE.SphereGeometry(size*1.045,64,40),new THREE.MeshBasicMaterial({color:0x9bd9ff,transparent:true,opacity:.16,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    halo.visible=false; planet.add(halo);
    loadMap(name, material);
    if(name==='Saturn') {
      const innerRadius=size*1.22, outerRadius=size*2.25;
      const ringGeometry=new THREE.RingGeometry(innerRadius,outerRadius,256,8);
      // The bundled ring map is a radial strip: horizontal pixels describe
      // distance from Saturn, so keep the sampled vertical coordinate centered.
      const positions=ringGeometry.attributes.position, ringUvs=[];
      for(let i=0;i<positions.count;i++){
        const x=positions.getX(i), y=positions.getY(i), r=Math.hypot(x,y);
        ringUvs.push((r-innerRadius)/(outerRadius-innerRadius),.5);
      }
      ringGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(ringUvs,2));
      const ringMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.92,side:THREE.DoubleSide,transparent:true,opacity:.96,depthWrite:false});
      const ring=new THREE.Mesh(ringGeometry,ringMaterial); ring.rotation.x=Math.PI/2; planet.add(ring);
      loader.load('assets/planet-maps/saturn-ring-alpha.png',tex=>{
        if(THREE.SRGBColorSpace&&'colorSpace' in tex) tex.colorSpace=THREE.SRGBColorSpace;
        else if(THREE.sRGBEncoding) tex.encoding=THREE.sRGBEncoding;
        tex.wrapS=THREE.ClampToEdgeWrapping; tex.wrapT=THREE.RepeatWrapping;
        tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
        ringMaterial.map=tex; ringMaterial.needsUpdate=true;
      },undefined,err=>console.warn('ARES: failed loading Saturn ring texture',err));
    }
    const body={name,orbitalPlane,orbitPivot,axis,planet,halo,radius,size,orbitalYears,spinDays,orbitDeg,axialDeg,
      phase:index*.73,spinPhase:index*.31};
    bodies.set(name,body);
  });
  // The Mars regional optical raster is projected onto the globe around its geodetic location.
  const mars = bodies.get('Mars');
  function addJezeroPatch() {
    if (!window.ARES_DATA || !ARES_DATA.opt || !ARES_DATA.meta) return;
    const m=ARES_DATA.meta, img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0);
      const tex=new THREE.CanvasTexture(c); if(THREE.SRGBColorSpace&&'colorSpace' in tex) tex.colorSpace=THREE.SRGBColorSpace; else if(THREE.sRGBEncoding) tex.encoding=THREE.sRGBEncoding;
      tex.anisotropy=4;
      const dLon=(m.x1-m.x0)*m.cos_lat/m.R, dLat=(m.y1-m.y0)/m.R;
      const centerLon=THREE.MathUtils.degToRad(77.45), centerLat=THREE.MathUtils.degToRad(18.4446);
      const nx=112, ny=48, verts=[], uvs=[], ids=[];
      for(let j=0;j<=ny;j++) for(let i=0;i<=nx;i++){
        const lon=centerLon+(i/nx-.5)*dLon, lat=centerLat+(.5-j/ny)*dLat;
        const r=mars.size*1.0005, cl=Math.cos(lat); verts.push(r*cl*Math.sin(lon),r*Math.sin(lat),r*cl*Math.cos(lon)); uvs.push(i/nx,1-j/ny);
      }
      for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;ids.push(a,c,b,b,c,d);}
      const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geo.setIndex(ids); geo.computeVertexNormals();
      mars.patch=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1})); mars.planet.add(mars.patch); mars.patch.userData.isRegionalTexture=true;
    };
    img.onerror=()=>console.warn('ARES: regional Mars optical image did not load'); img.src=ARES_DATA.opt;
  }
  addJezeroPatch();
  let selected='Mars', paused=false, speedScale=1, orbitSimSeconds=0, axialSimSeconds=0, last=performance.now();
  let journey=null, journeyState='SOLAR_SYSTEM', savedCamera=null;
  function emitStage(progress,state,label){journeyState=state;window.dispatchEvent(new CustomEvent('ares:journey-stage',{detail:{progress,state,label}}));}
  function select(name, focus=true) {
    if(!bodies.has(name)||journey) return;
    selected=name; journeyState='PLANET_SELECTED'; bodies.forEach((b,n)=>{b.halo.visible=n===name;}); document.querySelectorAll('[data-planet]').forEach(b=>{const on=b.dataset.planet===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    if(focus){const b=bodies.get(name),p=b.planet.getWorldPosition(new THREE.Vector3()),offset=new THREE.Vector3(Math.max(9,b.size*3.8),Math.max(7,b.size*2.8),Math.max(13,b.size*5.2));moveCamera(p.clone().add(offset),p,1100,name,offset);}
    window.dispatchEvent(new CustomEvent('ares:planet-selected',{detail:{name}}));
  }
  // One authoritative destination-button handler; the UI only reacts to the event above.
  document.querySelectorAll('[data-planet]').forEach(btn=>btn.addEventListener('click',()=>select(btn.dataset.planet,true)));
  let press=null;
  renderer.domElement.addEventListener('pointerdown',e=>press={x:e.clientX,y:e.clientY});
  renderer.domElement.addEventListener('pointerup',e=>{if(!press||Math.hypot(e.clientX-press.x,e.clientY-press.y)>5){press=null;return;}press=null;const rect=renderer.domElement.getBoundingClientRect();pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const objs=[];bodies.forEach(b=>objs.push(b.planet));const hit=raycaster.intersectObjects(objs,false)[0];if(hit)select(hit.object.userData.planetName,true);});
  const toggle=document.getElementById('orbit-toggle'), clock=document.getElementById('solar-clock');
  toggle.addEventListener('click',()=>{paused=!paused;toggle.innerHTML=paused?'▶ <span>RESUME MOTION</span>':'Ⅱ <span>PAUSE MOTION</span>';clock.textContent=paused?'ORBITAL MOTION PAUSED':'SIMULATION RUNNING';});
  document.getElementById('orbit-speed').addEventListener('change',e=>{speedScale=Number(e.target.value)||1;});
  document.getElementById('orbit-reset').addEventListener('click',()=>overview());
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  function marsSurfacePoint(){const lat=THREE.MathUtils.degToRad(18.4446),lon=THREE.MathUtils.degToRad(77.45088),r=mars.size*1.0005;return new THREE.Vector3(r*Math.cos(lat)*Math.sin(lon),r*Math.sin(lat),r*Math.cos(lat)*Math.cos(lon));}
  function beginJourney(){
    if(journey||selected!=='Mars') return false;
    try{
      savedCamera={position:camera.position.clone(),target:controls.target.clone(),selected,near:camera.near};
      journey={start:performance.now(),duration:12500,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),surface:marsSurfacePoint()};
      cameraMove=null;focusLock=null;controls.enabled=false;journeyState='MARS_APPROACH';
      emitStage(0,'MARS_APPROACH','Approaching Mars');return true;
    }catch(err){journey=null;journeyState='ERROR';controls.enabled=true;window.dispatchEvent(new CustomEvent('ares:journey-error',{detail:{message:String(err)}}));return false;}
  }
  function cancelJourney(){
    if(!journey)return false;
    journey=null;controls.enabled=true;camera.near=savedCamera.near;camera.updateProjectionMatrix();cameraMove={p0:camera.position.clone(),p1:savedCamera.position,t0:controls.target.clone(),t1:savedCamera.target,started:performance.now(),duration:950,focusName:null,offset:null};
    journeyState='CANCELLED';window.dispatchEvent(new CustomEvent('ares:journey-cancelled',{detail:{state:journeyState}}));return true;
  }
  function overview(){
    if(journey)cancelJourney();selected='Mars';
    journeyState='SOLAR_SYSTEM';
    document.body.classList.remove('terrain-active','handoff-pending','cinematic-flight');document.body.classList.add('solar-system-mode');
    const intro=document.getElementById('intro');if(intro){intro.hidden=false;intro.classList.remove('gone','flight-mode','handoff');}
    if(window.ARES) window.ARES.overviewMode=false;
    const b=bodies.get('Mars'),p=b.planet.getWorldPosition(new THREE.Vector3());
    cameraMove={p0:camera.position.clone(),p1:new THREE.Vector3(0,38,78),t0:controls.target.clone(),t1:new THREE.Vector3(0,0,0),started:performance.now(),duration:1000,focusName:null,offset:null};
    bodies.forEach((x,n)=>{x.halo.visible=n==='Mars';}); document.querySelectorAll('[data-planet]').forEach(x=>{const on=x.dataset.planet==='Mars';x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));});
    window.dispatchEvent(new CustomEvent('ares:planet-selected',{detail:{name:'Mars'}}));void p;
  }
  function resize(){const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(host);resize();
  function animate(now){
    requestAnimationFrame(animate);const dt=Math.max(0,(now-last)/1000);last=now;
    if(!paused){orbitSimSeconds+=dt*speedScale*ORBIT_SIM_SECONDS_PER_REAL_SECOND;axialSimSeconds+=dt*AXIAL_SIM_SECONDS_PER_REAL_SECOND;
      sun.rotation.y=Motion.spinAngle(0,axialSimSeconds,25,0);corona.rotation.y=Motion.spinAngle(0,axialSimSeconds,25,0)*-.42;
      bodies.forEach(b=>{b.orbitPivot.rotation.y=Motion.orbitAngle(b.phase,orbitSimSeconds,b.orbitalYears);b.planet.rotation.y=Motion.spinAngle(b.spinPhase,axialSimSeconds,b.spinDays,b.axialDeg);});}
    if(journey){try{
      const t=Math.min(1,(now-journey.start)/journey.duration), ease=x=>x*x*(3-2*x), marsPos=mars.planet.getWorldPosition(new THREE.Vector3()),surface=mars.planet.localToWorld(journey.surface.clone());
      let target,position,state;
      if(t<.25){const q=ease(t/.25);target=journey.fromTarget.clone().lerp(marsPos,q);position=journey.fromPosition.clone().lerp(marsPos.clone().add(new THREE.Vector3(0,9,34)),q);state='MARS_APPROACH';}
      else if(t<.53){const q=ease((t-.25)/.28);target=marsPos.clone().lerp(surface,q*.65);position=marsPos.clone().add(new THREE.Vector3(0,9,34)).lerp(surface.clone().add(new THREE.Vector3(0,3.6,8.5)),q);state='ATMOSPHERIC_TRANSITION';}
      else if(t<.94){const q=ease((t-.53)/.41), normal=surface.clone().sub(marsPos).normalize();target=surface.clone();position=surface.clone().add(new THREE.Vector3(0,3.6,8.5)).lerp(surface.clone().add(normal.clone().multiplyScalar(.008)),q);state='REGIONAL_DESCENT';}
      else {const normal=surface.clone().sub(marsPos).normalize();target=surface.clone();position=surface.clone().add(normal.multiplyScalar(.008));state='TERRAIN_HANDOFF';}
      if(t>.82 && camera.near!==.0001){camera.near=.0001;camera.updateProjectionMatrix();}
      camera.position.copy(position);controls.target.copy(target);
      emitStage(t,state, state==='ATMOSPHERIC_TRANSITION'?'Atmospheric transition':state==='REGIONAL_DESCENT'?'Regional descent':state==='TERRAIN_HANDOFF'?'Terrain handoff':'Mars approach');
      if(t>=1){journey=null;camera.near=.1;camera.updateProjectionMatrix();controls.enabled=true;journeyState='MISSION_CONTROL';window.dispatchEvent(new CustomEvent('ares:journey-complete',{detail:{state:journeyState}}));}
      }catch(err){journey=null;controls.enabled=true;camera.near=savedCamera?.near||.1;camera.updateProjectionMatrix();journeyState='ERROR';if(savedCamera)cameraMove={p0:camera.position.clone(),p1:savedCamera.position,t0:controls.target.clone(),t1:savedCamera.target,started:now,duration:900,focusName:null,offset:null};window.dispatchEvent(new CustomEvent('ares:journey-error',{detail:{state:journeyState,message:String(err)}}));}
    } else if(cameraMove){const t=Math.min(1,(now-cameraMove.started)/cameraMove.duration),e=t*t*(3-2*t);if(cameraMove.focusName){const b=bodies.get(cameraMove.focusName),p=b.planet.getWorldPosition(new THREE.Vector3());cameraMove.t1.copy(p);cameraMove.p1.copy(p).add(cameraMove.offset);}camera.position.lerpVectors(cameraMove.p0,cameraMove.p1,e);controls.target.lerpVectors(cameraMove.t0,cameraMove.t1,e);if(t>=1){focusLock=cameraMove.focusName?{name:cameraMove.focusName,last:bodies.get(cameraMove.focusName).planet.getWorldPosition(new THREE.Vector3())}:null;cameraMove=null;}}
    else if(focusLock){const p=bodies.get(focusLock.name).planet.getWorldPosition(new THREE.Vector3()),delta=p.sub(focusLock.last);camera.position.add(delta);controls.target.add(delta);focusLock.last.add(delta);}
    controls.update();renderer.render(scene,camera);
  }
  select('Mars',false);requestAnimationFrame(animate);
  window.ARES_SOLAR={select,getSelected:()=>selected,setPaused:v=>{paused=!!v;toggle.innerHTML=paused?'▶ <span>RESUME MOTION</span>':'Ⅱ <span>PAUSE MOTION</span>';},setSpeed:v=>{speedScale=Number(v)||1;},beginJourney,cancelJourney,overview,getJourneyState:()=>journeyState,
    getMotionState:()=>Array.from(bodies.values(),b=>({name:b.name,orbitalPeriodYears:b.orbitalYears,signedSiderealDays:b.spinDays,orbitalInclination:b.orbitDeg,axialTilt:b.axialDeg,orbitAngle:b.orbitPivot.rotation.y,spinAngle:b.planet.rotation.y,paused,speedScale}))};
})();
