import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildRadio } from './radio.js';
import { studioEnvironment } from './studio.js';
import { drawOverlay } from './overlay.js';
import { drawOverlay2, loadOverlayAssets } from './overlay2.js';
import { createCards } from './cards.js';
import { STATIONS as DIAL_STATIONS, STATIONS_7, NEW_STATION } from './textures.js';

await Promise.all([
  document.fonts.load('400 64px "Hedvig Letters Serif"'),
  document.fonts.load('600 46px Manrope'),
  document.fonts.load('700 44px Manrope'),
  document.fonts.load('500 32px Manrope'),
  document.fonts.load('600 46px Manrope'),
  document.fonts.load('400 54px "Hedvig Letters Serif"'),
]);
const symbolSvg = await (await fetch('assets/brand/symbol-light.svg')).text();
const symbolPaths = [...symbolSvg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

const BG = new THREE.Color('#0f0e0c');

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 18, 40);

scene.environment = studioEnvironment(renderer);
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.05, 100);

// ---------- set ----------
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshPhysicalMaterial({ color: '#241e18', roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// back wall with a warm pool of light behind the radio
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 30),
  new THREE.MeshStandardMaterial({ color: '#2a241e', roughness: 0.95 }),
);
wall.position.set(0, 15, -7);
wall.receiveShadow = true;
scene.add(wall);

const radio = buildRadio(renderer, { symbolPaths });
scene.add(radio.group);

// ---------- light ----------
const key = new THREE.SpotLight('#ffe2c2', 38, 30, 0.42, 0.85, 1.6);
key.position.set(-5.5, 8.5, 7);
key.target.position.set(0, 1.4, 0);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.02;
key.shadow.radius = 6;
scene.add(key, key.target);

const rim = new THREE.SpotLight('#d9e2ff', 40, 30, 0.5, 0.9, 1.6);
rim.position.set(6, 5, -6);
rim.target.position.set(0, 1.4, 0);
scene.add(rim, rim.target);

const kicker = new THREE.SpotLight('#ffcf9e', 8, 25, 0.5, 1, 1.6);
kicker.position.set(7, 2.2, 5);
kicker.target.position.set(0, 1.4, 0.8);
scene.add(kicker, kicker.target);

const wash = new THREE.SpotLight('#ffb978', 170, 30, 0.38, 1, 1.4);
wash.position.set(1.5, 9, 1);
wash.target.position.set(0.5, 2.6, -7);
scene.add(wash, wash.target);

scene.add(new THREE.HemisphereLight('#3a3028', '#0d0b09', 0.2));

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.5, 1.4);
composer.addPass(bloom);
const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.0006, maxblur: 0.006 });
bokeh.enabled = false;
composer.addPass(bokeh);
const vignette = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.42 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 d=vUv-.5; float v=1.-dot(d,d)*strength*2.2;
    gl_FragColor=vec4(c.rgb*clamp(v,0.,1.),c.a); }`,
});
composer.addPass(vignette);
composer.addPass(new OutputPass());

// ---------- cameras ----------
// offsets are relative to an anchor on the radio
const SHOTS = {
  1: { name: 'Hero', anchor: 'center', offset: new THREE.Vector3(4.6, 1.1, 10.4), dof: 0 },
  2: { name: 'Dial', anchor: 'dial', offset: new THREE.Vector3(0.9, 0.35, 2.6), dof: 0.0016 },
  3: { name: 'Knob', anchor: 'knob', offset: new THREE.Vector3(1.0, 0.25, 1.35), dof: 0.0028 },
  4: { name: 'Cloth', anchor: 'cloth', offset: new THREE.Vector3(-1.4, 0.15, 2.4), dof: 0.0018 },
  5: { name: 'Profile', anchor: 'center', offset: new THREE.Vector3(8.4, 0.9, 5.2), dof: 0 },
};
let shot = SHOTS[1];
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
const desiredPos = new THREE.Vector3(), desiredTarget = new THREE.Vector3();

function frameShot(s, snap = false) {
  shot = s;
  bokeh.enabled = s.dof > 0;
  bokeh.uniforms.aperture.value = s.dof;
  if (snap) {
    computeDesired(0);
    camPos.copy(desiredPos); camTarget.copy(desiredTarget);
  }
  document.getElementById('shot').textContent = s.name;
}

let computeDesired = function (t) {
  const a = radio.anchors[shot.anchor]();
  const drift = new THREE.Vector3(Math.sin(t * 0.11) * 0.25, Math.sin(t * 0.07) * 0.08, 0);
  if (shot.anchor !== 'center') drift.multiplyScalar(0.25);
  desiredTarget.copy(a);
  if (shot.anchor === 'center') desiredTarget.y -= 0.15;
  desiredPos.copy(a).add(shot.offset).add(drift);
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;
let orbiting = false;
renderer.domElement.addEventListener('pointerdown', () => {
  if (!orbiting) {
    orbiting = true;
    controls.target.copy(camTarget);
    controls.enabled = true;
    document.getElementById('shot').textContent = 'Free';
  }
});

// ---------- power and tuning ----------
const stations = radio.STATIONS;
let power = 0, powerTarget = 0, powerStartedAt = -1;
let stationIndex = 1; // First 100 Users
let needleAngle = -122, needleFrom = -122, needleTo = -122, needleT = 1, needleDur = 1.6;
const TURNS = 2.6; // knob turns per full needle sweep

function tuneTo(i) {
  stationIndex = (i + stations.length) % stations.length;
  needleFrom = needleAngle;
  needleTo = stations[stationIndex].angle;
  needleT = 0;
  needleDur = 0.9 + Math.abs(needleTo - needleFrom) / 160;
  document.getElementById('station').textContent = stations[stationIndex].name;
}

function setPower(on) {
  powerTarget = on ? 1 : 0;
  if (on) {
    powerStartedAt = clock.elapsedTime;
    setTimeout(() => tuneTo(stationIndex), 1200);
  } else {
    needleFrom = needleAngle; needleTo = -122; needleT = 0; needleDur = 1.6;
    document.getElementById('station').textContent = 'Off';
  }
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

addEventListener('keydown', (e) => {
  if (SHOTS[e.key]) {
    orbiting = false; controls.enabled = false;
    frameShot(SHOTS[e.key]);
  }
  if (e.code === 'Space') { e.preventDefault(); setPower(powerTarget < 0.5); }
  if (e.key === 'ArrowRight' && powerTarget) tuneTo(stationIndex + 1);
  if (e.key === 'ArrowLeft' && powerTarget) tuneTo(stationIndex - 1);
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
  if (e.key === 't' || e.key === 'T') turntable = !turntable;
});

// ---------- loop ----------
const clock = new THREE.Clock();
let turntable = true;
frameShot(SHOTS[1], true);
setTimeout(() => setPower(true), 1400);

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // slow sway, never showing the back
  if (turntable) radio.group.rotation.y = Math.sin(t * 0.16) * 0.42 - 0.12;

  // valves warming: eased ramp, a gentle wobble only while warming
  const rate = powerTarget > power ? 0.55 : 1.8;
  power += Math.sign(powerTarget - power) * Math.min(Math.abs(powerTarget - power), dt * rate);
  const warming = powerTarget === 1 && power < 0.98;
  const wobble = warming ? (Math.sin(t * 23) * 0.5 + Math.sin(t * 37) * 0.5) * 0.06 * (1 - power) : 0;
  const glow = Math.max(0, THREE.MathUtils.smoothstep(power, 0, 1) + wobble);
  radio.mats.dial.emissiveIntensity = glow * 0.8;
  radio.mats.lamp.emissiveIntensity = glow * 6;
  radio.mats.needle.emissiveIntensity = 0.15 + glow * 0.5;
  radio.mats.indexLine.emissiveIntensity = 0.2 + glow * 0.6;
  radio.glowLight.intensity = glow * 0.35;

  // needle + tuning knob
  if (needleT < 1) {
    needleT = Math.min(1, needleT + dt / needleDur);
    needleAngle = THREE.MathUtils.lerp(needleFrom, needleTo, ease(needleT));
  }
  radio.needlePivot.rotation.z = THREE.MathUtils.degToRad(-needleAngle);
  radio.tuning.rotation.y = THREE.MathUtils.degToRad(-needleAngle * TURNS);

  if (orbiting) {
    controls.update();
  } else {
    computeDesired(t);
    const k = 1 - Math.pow(0.0015, dt);
    camPos.lerp(desiredPos, k);
    camTarget.lerp(desiredTarget, k);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }
  if (bokeh.enabled) bokeh.uniforms.focus.value = camera.position.distanceTo(orbiting ? controls.target : camTarget);

  composer.render();
  requestAnimationFrame(tick);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// force a state for stills, even when the tab isn't animating
function setState({ power: p = 1, station = 1, sway = null } = {}) {
  power = powerTarget = p;
  stationIndex = station;
  needleAngle = needleTo = needleFrom = p ? stations[station].angle : -122; needleT = 1;
  const glow = p;
  radio.mats.dial.emissiveIntensity = glow * 0.8;
  radio.mats.lamp.emissiveIntensity = glow * 6;
  radio.mats.needle.emissiveIntensity = 0.15 + glow * 0.5;
  radio.mats.indexLine.emissiveIntensity = 0.2 + glow * 0.6;
  radio.glowLight.intensity = glow * 0.35;
  radio.needlePivot.rotation.z = THREE.MathUtils.degToRad(-needleAngle);
  radio.tuning.rotation.y = THREE.MathUtils.degToRad(-needleAngle * TURNS);
  if (sway !== null) { turntable = false; radio.group.rotation.y = sway; }
}

window.__radio = { setState, wash, wall, radio, scene, camera, renderer, frameShot, SHOTS, setPower, tuneTo, key, rim, kicker, bloom, bokeh, floor };

// full-resolution still for review: __capture('name.png', 1920, 1080)
window.__capture = async (name, w = 1920, h = 1080, overlay = null) => {
  const prev = [innerWidth, innerHeight, renderer.getPixelRatio()];
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(1);
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!orbiting) {
    computeDesired(clock.elapsedTime);
    camPos.copy(desiredPos); camTarget.copy(desiredTarget);
    camera.position.copy(camPos); camera.lookAt(camTarget);
    if (bokeh.enabled) bokeh.uniforms.focus.value = camera.position.distanceTo(camTarget);
  }
  composer.render();
  let url;
  if (overlay) {
    const c2 = (window.__c2 ||= document.createElement('canvas'));
    c2.width = w; c2.height = h;
    const g = c2.getContext('2d');
    g.drawImage(renderer.domElement, 0, 0, w, h);
    overlay(g, w, h);
    url = c2.toDataURL('image/jpeg', 0.93);
  } else {
    url = renderer.domElement.toDataURL('image/png');
  }
  renderer.setPixelRatio(prev[2]);
  renderer.setSize(prev[0], prev[1]);
  composer.setPixelRatio(prev[2]);
  composer.setSize(prev[0], prev[1]);
  camera.aspect = prev[0] / prev[1]; camera.updateProjectionMatrix();
  const r = await fetch('/save?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  return r.status;
};

// ---------- scripted look-test clip ----------
// __film(t) poses everything for time t (seconds) and returns a frame.
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const lerpV = (a, b, k) => a.clone().lerp(b, k);
window.__film = async (t, name) => {
  turntable = false; orbiting = false;
  // power: off until 1s, valves warm 1s to 3.2s
  const p = smooth(1.0, 3.2, t);
  const wob = t > 1 && t < 3.2 ? (Math.sin(t * 23) * 0.5 + Math.sin(t * 37) * 0.5) * 0.06 * (1 - p) : 0;
  const glow = Math.max(0, p + wob);
  radio.mats.dial.emissiveIntensity = glow * 0.8;
  radio.mats.lamp.emissiveIntensity = glow * 6;
  radio.mats.needle.emissiveIntensity = 0.15 + glow * 0.5;
  radio.mats.indexLine.emissiveIntensity = 0.2 + glow * 0.6;
  radio.glowLight.intensity = glow * 0.35;
  // needle: rests left, swings to Design & Motion as it warms, then glides to First 100 Users
  let a = -122;
  a = THREE.MathUtils.lerp(a, stations[0].angle, ease(smooth(2.2, 3.6, t)));
  a = THREE.MathUtils.lerp(a, stations[1].angle, ease(smooth(5.0, 7.0, t)));
  radio.needlePivot.rotation.z = THREE.MathUtils.degToRad(-a);
  radio.tuning.rotation.y = THREE.MathUtils.degToRad(-a * TURNS);
  // the radio turns slowly toward us
  radio.group.rotation.y = THREE.MathUtils.lerp(-0.5, -0.12, t / 10);
  // cameras: hero push-in, then dial, then knob
  let s, k;
  if (t < 4) { s = SHOTS[1]; k = t / 4; }
  else if (t < 7.6) { s = SHOTS[2]; k = (t - 4) / 3.6; }
  else { s = SHOTS[3]; k = (t - 7.6) / 2.4; }
  const anchor = radio.anchors[s.anchor]();
  const start = s.offset.clone().multiplyScalar(1.1).add(new THREE.Vector3(0.3, 0.05, 0));
  const end = s.offset.clone().multiplyScalar(0.94);
  const pos = anchor.clone().add(lerpV(start, end, ease(Math.min(1, k))));
  const tgt = anchor.clone(); if (s.anchor === 'center') tgt.y -= 0.15;
  shot = s; bokeh.enabled = s.dof > 0; bokeh.uniforms.aperture.value = s.dof;
  computeDesired = () => { desiredPos.copy(pos); desiredTarget.copy(tgt); };
  return __capture(name);
};

// ---------- the radio show demo ----------
// __show(t, name) poses the radio for time t of audio/timeline.json and captures a frame with the overlay.
const SHOW_SHOTS = {
  hero:  { anchor: 'center', a: [4.9, 1.25, 11.2], b: [4.2, 1.0, 9.7], dof: 0 },
  hero2: { anchor: 'center', a: [-3.9, 1.5, 11.0], b: [-3.1, 1.2, 9.8], dof: 0 },
  dial:  { anchor: 'dial', a: [1.05, 0.4, 2.9], b: [0.75, 0.3, 2.3], dof: 0.0016 },
  dialT: { anchor: 'dial', a: [0.42, 0.16, 1.75], b: [0.3, 0.1, 1.45], dof: 0.0022 },
  knob:  { anchor: 'knob', a: [1.15, 0.32, 1.55], b: [0.85, 0.22, 1.2], dof: 0.0028 },
  cloth: { anchor: 'cloth', a: [-1.6, 0.25, 2.7], b: [-1.15, 0.15, 2.15], dof: 0.0018 },
  cloth2:{ anchor: 'cloth', a: [1.5, -0.45, 2.5], b: [1.15, -0.35, 2.0], dof: 0.0018 },
};
let TL = null;
const sample = (pts, t) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return THREE.MathUtils.lerp(v0, v1, ease((t - t0) / (t1 - t0)));
    }
  }
  return pts[pts.length - 1][1];
};
function showShotAt(t) {
  const e = TL.events;
  const segs = TL.segments;
  if (t < 3.0) return ['hero', 0, 3.0];
  if (t < segs[0].start - 0.2) return ['dial', 3.0, segs[0].start - 0.2];
  if (t >= e.tune - 0.2 && t < e.cross) return ['dialT', e.tune - 0.2, e.cross];
  if (t >= e.chime - 0.2 && t < e.latest) return ['hero', e.chime - 0.2, e.latest];
  if (t > e.end + 0.3) return ['hero2', e.end + 0.3, TL.duration];
  // segment-driven: quotes on the speaker, host lines rotate around the set
  let idx = segs.findIndex((s, i) => t < (segs[i + 1] ? segs[i + 1].start - 0.2 : Infinity));
  if (idx < 0) idx = segs.length - 1;
  const s = segs[idx];
  const t0 = idx === 0 ? segs[0].start - 0.2 : s.start - 0.2;
  const t1 = segs[idx + 1] ? segs[idx + 1].start - 0.2 : e.end + 0.3;
  const hostCycle = { h1: 'dial', h2: 'hero', h3: 'knob', h4: 'dial', h5: 'hero', x1: 'hero2', x2: 'dial', x3: 'hero', j1: 'knob', j2: 'hero' };
  const name = s.quote ? (idx % 2 ? 'cloth' : 'cloth2') : (hostCycle[s.id] || 'hero');
  return [name, t0, t1];
}

window.__show = async (t, name) => {
  if (!TL) {
    TL = await (await fetch('audio/timeline.json')).json();
    await Promise.all(['500 32px Manrope', '600 18px Manrope', '700 15px Manrope', '400 42px "Hedvig Letters Serif"'].map((f) => document.fonts.load(f)));
  }
  turntable = false; orbiting = false;
  const e = TL.events;
  // power: click at 1.0, warm to 3.2; off at the end
  const offAt = TL.duration - 1.0;
  const p = smooth(1.05, 3.2, t) * (1 - smooth(offAt, offAt + 0.6, t));
  const warm = t > 1 && t < 3.2 ? (Math.sin(t * 23) * 0.5 + Math.sin(t * 37) * 0.5) * 0.06 * (1 - p) : 0;
  const env = TL.env[Math.min(TL.env.length - 1, Math.floor(t * TL.fps))] || 0;
  const tuning = t > e.tune && t < e.cross + 0.6 ? (Math.sin(t * 31) * 0.5 + Math.sin(t * 47) * 0.5) * 0.08 : 0;
  const glow = Math.max(0, p + warm + tuning);
  radio.mats.dial.emissiveIntensity = glow * (0.74 + env * 0.22);
  radio.mats.lamp.emissiveIntensity = glow * (5 + env * 3);
  radio.mats.needle.emissiveIntensity = 0.15 + glow * 0.5;
  radio.mats.indexLine.emissiveIntensity = 0.2 + glow * 0.6;
  radio.glowLight.intensity = glow * (0.3 + env * 0.15);
  const a = sample(TL.needle, t);
  radio.needlePivot.rotation.z = THREE.MathUtils.degToRad(-a);
  radio.tuning.rotation.y = THREE.MathUtils.degToRad(-a * TURNS);
  radio.group.rotation.y = -0.28 + Math.sin(t * 0.05) * 0.06;

  const [shotName, t0, t1] = showShotAt(t);
  const S = SHOW_SHOTS[shotName];
  const k = Math.min(1, Math.max(0, (t - t0) / Math.max(0.1, t1 - t0)));
  const anchor = radio.anchors[S.anchor]();
  const off = new THREE.Vector3(...S.a).lerp(new THREE.Vector3(...S.b), k * k * (3 - 2 * k) * 0.9 + k * 0.1);
  const pos = anchor.clone().add(off);
  const tgt = anchor.clone(); if (S.anchor === 'center') tgt.y -= 0.15;
  bokeh.enabled = S.dof > 0; bokeh.uniforms.aperture.value = S.dof;
  computeDesired = () => { desiredPos.copy(pos); desiredTarget.copy(tgt); };
  return __capture(name, 1920, 1080, (g, w, h) => drawOverlay(g, t, TL, w, h));
};

// ---------- demo v2: the 45s show ----------
let TL2 = null, CARDS = null;
const SHOTS2 = {
  dialHook: { anchor: 'dial', a: [0.32, -0.2, 1.75], b: [0.22, -0.22, 1.45], dof: 0.0022, look: [0, -0.3, 0] },
  hero:     { anchor: 'center', a: [4.6, 1.15, 10.8], b: [3.9, 0.95, 9.4], dof: 0 },
  dialT:    { anchor: 'dial', a: [0.42, 0.16, 1.7], b: [0.3, 0.1, 1.42], dof: 0.0022 },
  dialThread: { anchor: 'dial', a: [0.05, 0.32, 1.5], b: [-0.05, 0.28, 1.28], dof: 0.002, look: [-0.25, 0.25, 0] },
  dial:     { anchor: 'dial', a: [1.0, 0.05, 3.0], b: [0.7, -0.02, 2.5], dof: 0.0016, look: [0, -0.42, 0] },
  crossWide:{ anchor: 'center', a: [0.6, 0.85, 7.8], b: [0.3, 0.72, 7.1], dof: 0, look: [-0.05, 0.4, 1.0] },
  heroPull: { anchor: 'center', a: [3.2, 0.9, 8.6], b: [4.8, 1.3, 11.6], dof: 0 },
  cardA:    { card: 'q2', a: [0.55, 0.12, 2.5], b: [0.4, 0.08, 2.15], dof: 0.0016 },
  cardB:    { card: 'q3', a: [-0.55, 0.1, 2.45], b: [-0.4, 0.06, 2.1], dof: 0.0016 },
  cardE:    { card: 'q6', a: [0.45, 0.15, 2.5], b: [0.3, 0.1, 2.15], dof: 0.0016 },
};

function shot2At(t) {
  const S = {}; TL2.segments.forEach((x) => (S[x.id] = x));
  const e = TL2.events;
  const plan = [
    ['dialHook', 0, 3.1],
    ['hero', 3.1, S.q2.start - 0.55],
    ['cardA', S.q2.start - 0.55, S.q3.start - 0.55],
    ['cardB', S.q3.start - 0.55, e.tune - 0.1],
    ['dialT', e.tune - 0.1, e.thread[0]],
    ['dialThread', e.thread[0], e.thread[1] + 0.35],
    ['crossWide', e.thread[1] + 0.35, S.x2.start + 0.4],
    ['dial', S.x2.start + 0.4, e.capture - 0.45],
    ['hero', e.capture - 0.45, e.reprint[0] - 0.1],
    ['dialT', e.reprint[0] - 0.1, S.q6.start - 0.55],
    ['cardE', S.q6.start - 0.55, S.e1.start - 0.25],
    ['heroPull', S.e1.start - 0.25, TL2.duration + 1],
  ];
  return plan.find(([, a, b]) => t >= a && t < b) || plan[plan.length - 1];
}

window.__show2 = async (t, name) => {
  if (!TL2) {
    TL2 = await (await fetch('audio/timeline2.json')).json();
    await loadOverlayAssets();
    CARDS = createCards(radio);
    TL2.segments.filter((x) => x.card).forEach((x) => {
      const c = x.card;
      const collection = { q4: 'First 100 Users', q5: 'Product Stories' }[x.id];
      CARDS.make(x.id, { site: c.site, saved: c.saved, title: c.title, who: c.who, quote: x.display || x.text, collection }, collection ? 1.75 : 1.45);
    });
  }
  turntable = false; orbiting = false;
  const S = {}; TL2.segments.forEach((x) => (S[x.id] = x));
  const e = TL2.events;

  // power and glow (already on air at t=0; switched off at the end)
  const p = 1 - smooth(e.off, e.off + 0.6, t);
  const env = TL2.env[Math.min(TL2.env.length - 1, Math.floor(t * TL2.fps))] || 0;
  const between = t > e.tune && t < e.capture ? (Math.sin(t * 31) * 0.5 + Math.sin(t * 47) * 0.5) * 0.06 : 0;
  const absorb = Math.exp(-Math.pow((t - (e.capture + 1.0)) / 0.18, 2));
  const glow = Math.max(0, p + between);
  radio.mats.dial.emissiveIntensity = glow * (0.74 + env * 0.22 + absorb * 0.5);
  radio.mats.lamp.emissiveIntensity = glow * (5 + env * 3 + absorb * 8);
  radio.mats.needle.emissiveIntensity = 0.15 + glow * 0.5;
  radio.mats.indexLine.emissiveIntensity = 0.2 + glow * 0.6;
  radio.glowLight.intensity = glow * (0.3 + env * 0.15 + absorb * 0.6);

  // dial: thread between the two stations, then the reprint with a new station
  const [r0, r1] = e.reprint;
  const kr = ease(Math.min(1, Math.max(0, (t - r0) / (r1 - r0))));
  const litPair = Math.min(1, Math.max(0, (t - e.thread[0]) / 0.5)) * (1 - Math.min(1, Math.max(0, (t - e.capture) / 0.5)));
  const arrive = e.capture + 2.9;
  const litNew = Math.min(1, Math.max(0, (t - (arrive - 0.3)) / 0.4)) * (1 - 0.6 * Math.min(1, Math.max(0, (t - arrive - 1.5) / 2)));
  const stations = DIAL_STATIONS.map((st, i) => ({
    ...st, alpha: 1, angle: THREE.MathUtils.lerp(st.angle, STATIONS_7[i], kr),
    lit: (st.name === 'First 100 Users' || st.name === 'Product Stories') ? litPair : 0,
  }));
  stations.push({ ...NEW_STATION, angle: STATIONS_7[6], alpha: kr, lit: litNew });
  const thread = t > e.thread[0] && t < e.capture + 0.3
    ? { a: 'First 100 Users', b: 'Product Stories', progress: Math.min(1, (t - e.thread[0]) / (e.thread[1] - e.thread[0])) * (1 - Math.min(1, Math.max(0, (t - e.capture) / 0.3))) }
    : null;
  radio.liveDial.draw({ stations, thread });

  const a = sample(TL2.needle, t);
  radio.needlePivot.rotation.z = THREE.MathUtils.degToRad(-a);
  radio.tuning.rotation.y = THREE.MathUtils.degToRad(-a * TURNS);
  radio.group.rotation.y = -0.26 + Math.sin(t * 0.05) * 0.05;

  // cards
  const F = radio.FRONT, cx = radio.clothX, px = radio.plateX;
  CARDS.poseRise(CARDS.cards.get('q2'), t, { rise: S.q2.start - 0.5, exit: S.q2.end + 0.45, to: new THREE.Vector3(cx + 0.25, 0.42, F + 1.25), rotY: 0.12 });
  CARDS.poseRise(CARDS.cards.get('q3'), t, { rise: S.q3.start - 0.5, exit: S.q3.end + 0.55, to: new THREE.Vector3(cx + 0.45, 0.38, F + 1.25), rotY: -0.12 });
  const crossRise = e.thread[1] + 0.15;
  CARDS.poseRise(CARDS.cards.get('q4'), t, { rise: crossRise, exit: S.x2.start + 0.2, to: new THREE.Vector3(cx - 0.2, 0.66, F + 1.1), rotY: 0.2 });
  CARDS.poseRise(CARDS.cards.get('q5'), t, { rise: crossRise + 0.25, exit: S.x2.start + 0.2, to: new THREE.Vector3(px + 0.25, 0.48, F + 1.2), rotY: -0.2 });
  const cE = CARDS.cards.get('q6');
  if (t < S.q6.start - 0.6) CARDS.poseFlyIn(cE, t, { t0: e.capture - 0.25, t1: e.capture + 1.05, from: new THREE.Vector3(2.9, 1.0, F + 3.0) });
  else CARDS.poseRise(cE, t, { rise: S.q6.start - 0.5, exit: S.e1.start + 0.2, to: new THREE.Vector3(cx + 0.35, 0.4, F + 1.25), rotY: 0.1 });

  // camera
  const [shotName, t0, t1] = shot2At(t);
  const SH = SHOTS2[shotName];
  const k = Math.min(1, Math.max(0, (t - t0) / Math.max(0.1, t1 - t0)));
  let anchor;
  if (SH.card) {
    const cg = CARDS.cards.get(SH.card).group;
    radio.group.updateMatrixWorld(true);
    anchor = cg.getWorldPosition(new THREE.Vector3());
  } else anchor = radio.anchors[SH.anchor]();
  const off = new THREE.Vector3(...SH.a).lerp(new THREE.Vector3(...SH.b), k * k * (3 - 2 * k) * 0.85 + k * 0.15);
  const pos = anchor.clone().add(off);
  const tgt = anchor.clone();
  if (SH.anchor === 'center') tgt.y -= 0.15;
  if (SH.look) tgt.add(new THREE.Vector3(...SH.look));
  bokeh.enabled = SH.dof > 0; bokeh.uniforms.aperture.value = SH.dof;
  computeDesired = () => { desiredPos.copy(pos); desiredTarget.copy(tgt); };
  return __capture(name, 1920, 1080, (g, w, h) => drawOverlay2(g, t, TL2, w, h));
};
