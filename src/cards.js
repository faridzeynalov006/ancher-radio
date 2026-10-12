// Ancher note cards that rise out of the speaker (and one that flies into it).
import * as THREE from 'three';
import { noteCardTexture } from './textures.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,170,90,1)');
  grad.addColorStop(0.4, 'rgba(235,117,20,0.55)');
  grad.addColorStop(1, 'rgba(235,117,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createCards(radio) {
  const halo = haloTexture();
  const cards = new Map();

  function make(id, data, width = 1.45) {
    const { texture, aspect } = noteCardTexture(data);
    texture.anisotropy = 16;
    const h = width / aspect;
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
    mesh.renderOrder = 10;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.9, h * 2.2),
      new THREE.MeshBasicMaterial({ map: halo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
    glow.position.z = -0.02;
    group.add(glow, mesh);
    group.visible = false;
    radio.body.add(group);
    const card = { id, group, mesh, glow, mat, h };
    cards.set(id, card);
    return card;
  }

  // emerge from the speaker cloth to `to` (body-local), float, then drift away
  function poseRise(card, t, { rise, exit, to, rotY = 0, from = null }) {
    const F = radio.FRONT;
    const start = from || new THREE.Vector3(radio.clothX, -0.05, F + 0.02);
    if (t < rise || t > exit + 0.6) { card.group.visible = false; return; }
    card.group.visible = true;
    const k = ease(clamp01((t - rise) / 0.9));
    const ke = clamp01((t - exit) / 0.55);
    const p = start.clone().lerp(to, k);
    p.y += Math.sin(k * Math.PI) * 0.22 + Math.sin(t * 1.4) * 0.018 * k + ke * 0.35;
    card.group.position.copy(p);
    const s = 0.18 + 0.82 * easeOut(clamp01((t - rise) / 0.9));
    card.group.scale.setScalar(s * (1 - 0.08 * ke));
    card.group.rotation.set(-0.35 * (1 - k) + Math.sin(t * 0.9) * 0.015, rotY * k, Math.sin(t * 1.1) * 0.012);
    card.mat.opacity = clamp01((t - rise) / 0.35) * (1 - ke);
    card.glow.material.opacity = Math.sin(clamp01((t - rise) / 1.1) * Math.PI) * 0.75 * (1 - ke);
  }

  // fly in from off to the right and sink into the speaker
  function poseFlyIn(card, t, { t0, t1, from }) {
    if (t < t0 || t > t1) { card.group.visible = false; return; }
    card.group.visible = true;
    const k = ease(clamp01((t - t0) / (t1 - t0)));
    const to = new THREE.Vector3(radio.clothX, 0, radio.FRONT + 0.03);
    const p = from.clone().lerp(to, k);
    p.y += Math.sin(k * Math.PI) * 0.5;
    card.group.position.copy(p);
    card.group.scale.setScalar(1 - 0.85 * k);
    card.group.rotation.set(0, -0.5 * (1 - k), 0.25 * (1 - k));
    card.mat.opacity = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15;
    card.glow.material.opacity = 0.2 + 0.8 * Math.max(0, (k - 0.6) / 0.4) * (1 - Math.max(0, (k - 0.92) / 0.08));
  }

  return { cards, make, poseRise, poseFlyIn };
}
