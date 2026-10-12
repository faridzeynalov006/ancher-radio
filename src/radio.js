// The radio, built from primitives. Units are roughly decimetres.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  walnutTextures, clothTextures, brushedTextures, machinedTexture,
  createLiveDial, badgeTextures, labelTexture, hardboardTexture, STATIONS,
} from './textures.js';

const W = 4.6, H = 2.8, D = 1.9, FRONT = D / 2;
const FEET = 0.14;

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function roundedRectPath(w, h, r) {
  const s = new THREE.Path();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// planar UVs so a texture spans the whole extruded face
function planarUV(geo, w, h) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
}

function knurledKnob(r, h, mats, ridges = 54) {
  const g = new THREE.Group();
  // profile: slight taper, chamfered top edge
  const pts = [
    new THREE.Vector2(0, -h / 2),
    new THREE.Vector2(r * 0.98, -h / 2),
    new THREE.Vector2(r, -h / 2 + h * 0.08),
    new THREE.Vector2(r * 0.97, h / 2 - h * 0.16),
    new THREE.Vector2(r * 0.9, h / 2 - h * 0.02),
    new THREE.Vector2(r * 0.84, h / 2),
    new THREE.Vector2(0, h / 2),
  ];
  const body = new THREE.LatheGeometry(pts, ridges * 4);
  const pos = body.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const rad = Math.hypot(v.x, v.z);
    const yNorm = (v.y + h / 2) / h;
    if (rad > r * 0.9 && yNorm > 0.1 && yNorm < 0.8) {
      const th = Math.atan2(v.z, v.x);
      const k = Math.abs(Math.sin(th * ridges));
      const s = 1 - 0.035 * (1 - Math.pow(k, 0.6));
      v.x *= s; v.z *= s;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, mats.knob));
  // machined cap
  const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.84, 96), mats.knobCap);
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = h / 2 + 0.0015;
  g.add(cap);
  // index line
  const line = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, 0.004, r * 0.55), mats.indexLine);
  line.position.set(0, h / 2 + 0.003, -r * 0.42);
  g.add(line);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildRadio(renderer, { symbolPaths = [] } = {}) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const wood = walnutTextures();
  const cloth = clothTextures();
  const brushed = brushedTextures();
  const machined = machinedTexture();
  const liveDial = createLiveDial();
  const dialTex = liveDial.texture;
  const badge = badgeTextures(symbolPaths);
  [wood.map, wood.roughnessMap, cloth.map, cloth.bumpMap, brushed, machined, dialTex]
    .forEach((t) => (t.anisotropy = maxAniso));

  const mats = {
    walnut: new THREE.MeshPhysicalMaterial({
      map: wood.map, roughnessMap: wood.roughnessMap, roughness: 0.55,
      clearcoat: 0.65, clearcoatRoughness: 0.22, sheen: 0.2, sheenColor: new THREE.Color('#6b3f22'),
    }),
    cloth: new THREE.MeshPhysicalMaterial({
      map: cloth.map, bumpMap: cloth.bumpMap, bumpScale: 1.6, roughness: 0.95,
      sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#f1dfc0'),
    }),
    plate: new THREE.MeshPhysicalMaterial({
      color: '#b3ab9d', metalness: 1, roughness: 0.38, roughnessMap: brushed,
      bumpMap: brushed, bumpScale: 0.15,
    }),
    bezel: new THREE.MeshPhysicalMaterial({ color: '#dedbd5', metalness: 1, roughness: 0.33 }),
    knob: new THREE.MeshPhysicalMaterial({ color: '#d6d4cf', metalness: 1, roughness: 0.28 }),
    knobCap: new THREE.MeshPhysicalMaterial({
      color: '#e2e0dc', metalness: 1, roughness: 0.22, bumpMap: machined, bumpScale: 0.6,
    }),
    indexLine: new THREE.MeshStandardMaterial({ color: '#EB7514', emissive: '#EB7514', emissiveIntensity: 0.2 }),
    brass: new THREE.MeshPhysicalMaterial({ color: '#b08a4e', metalness: 1, roughness: 0.3 }),
    dial: new THREE.MeshPhysicalMaterial({
      map: dialTex, emissiveMap: dialTex, emissive: new THREE.Color('#ffa040'), emissiveIntensity: 0,
      roughness: 0.6,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.08, ior: 1.5,
      clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1,
    }),
    needle: new THREE.MeshStandardMaterial({ color: '#EB7514', emissive: '#EB7514', emissiveIntensity: 0.15, roughness: 0.4 }),
    lamp: new THREE.MeshPhysicalMaterial({
      color: '#7a2f06', emissive: '#ff8a2a', emissiveIntensity: 0, roughness: 0.1, transmission: 0.2, clearcoat: 1,
    }),
    hardboard: new THREE.MeshStandardMaterial({ map: hardboardTexture(), roughness: 0.9 }),
    darkPanel: new THREE.MeshStandardMaterial({ color: '#16130f', roughness: 0.7 }),
  };

  const radio = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = H / 2 + FEET;
  radio.add(body);

  // cabinet
  const cab = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 8, 0.3), mats.walnut);
  cab.castShadow = cab.receiveShadow = true;
  body.add(cab);

  // back panel
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.7, H - 0.7), mats.hardboard);
  back.rotation.y = Math.PI;
  back.position.z = -FRONT - 0.002;
  body.add(back);

  // front face: recessed dark field behind everything
  const IW = 3.8, IH = 2.0;
  const field = new THREE.Mesh(new THREE.PlaneGeometry(IW, IH), mats.darkPanel);
  field.position.z = FRONT + 0.001;
  body.add(field);

  // speaker cloth (left)
  const clothW = 2.05, clothX = -IW / 2 + clothW / 2 + 0.04;
  const clothMesh = new THREE.Mesh(new THREE.PlaneGeometry(clothW, IH - 0.08), mats.cloth);
  clothMesh.position.set(clothX, 0, FRONT + 0.004);
  clothMesh.receiveShadow = true;
  body.add(clothMesh);

  // slim metal bars over the cloth; the middle one parts around the badge
  const BADGE_R = 0.2, gap = BADGE_R + 0.11;
  const barSpan = clothW - 0.16;
  for (let i = 0; i < 5; i++) {
    const y = -0.64 + i * 0.32;
    const pieces = i === 2
      ? [[clothX - barSpan / 2, clothX - gap], [clothX + gap, clothX + barSpan / 2]]
      : [[clothX - barSpan / 2, clothX + barSpan / 2]];
    pieces.forEach(([a, b]) => {
      const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, b - a - 0.028, 6, 16), mats.bezel);
      bar.rotation.z = Math.PI / 2;
      bar.position.set((a + b) / 2, y, FRONT + 0.03);
      bar.castShadow = true;
      body.add(bar);
    });
  }

  // enamel badge: official Ancher symbol, ink on sand, in a polished ring
  const badgeGroup = new THREE.Group();
  badgeGroup.position.set(clothX, 0, FRONT + 0.03);
  const badgeFace = new THREE.Mesh(new THREE.CircleGeometry(BADGE_R, 96), new THREE.MeshPhysicalMaterial({
    map: badge.map, bumpMap: badge.bumpMap, bumpScale: 2.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08,
  }));
  badgeFace.position.z = 0.012;
  badgeGroup.add(badgeFace);
  const badgeRing = new THREE.Mesh(new THREE.TorusGeometry(BADGE_R + 0.008, 0.02, 24, 120), mats.bezel);
  badgeRing.position.z = 0.014;
  badgeRing.castShadow = true;
  badgeGroup.add(badgeRing);
  const badgeBack = new THREE.Mesh(new THREE.CylinderGeometry(BADGE_R + 0.02, BADGE_R + 0.03, 0.02, 96), mats.bezel);
  badgeBack.rotation.x = Math.PI / 2;
  badgeGroup.add(badgeBack);
  body.add(badgeGroup);

  // brushed control plate (right)
  const plateW = IW - clothW - 0.16, plateH = IH - 0.08;
  const plateX = IW / 2 - plateW / 2 - 0.04;
  const plateGeo = new THREE.ExtrudeGeometry(roundedRectShape(plateW, plateH, 0.05), {
    depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 12,
  });
  planarUV(plateGeo, plateW, plateH);
  const plate = new THREE.Mesh(plateGeo, mats.plate);
  plate.position.set(plateX, 0, FRONT + 0.002);
  plate.receiveShadow = true;
  body.add(plate);

  // polished bezel frame around the whole front
  const frameShape = roundedRectShape(IW + 0.18, IH + 0.18, 0.12);
  frameShape.holes.push(roundedRectPath(IW, IH, 0.06));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 5, curveSegments: 16,
  }), mats.bezel);
  frame.position.z = FRONT - 0.01;
  frame.castShadow = frame.receiveShadow = true;
  body.add(frame);

  // ---------- dial ----------
  const DR = 0.56;
  const dialCenter = new THREE.Vector3(plateX, 0.17, FRONT + 0.035);
  const dialGroup = new THREE.Group();
  dialGroup.position.copy(dialCenter);
  body.add(dialGroup);

  const face = new THREE.Mesh(new THREE.CircleGeometry(DR, 128), mats.dial);
  dialGroup.add(face);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(DR + 0.03, 0.035, 32, 160), mats.bezel);
  ring.position.z = 0.01;
  ring.castShadow = true;
  dialGroup.add(ring);

  // needle on a pivot
  const needlePivot = new THREE.Group();
  needlePivot.position.z = 0.012;
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.014, DR * 0.86, 0.006), mats.needle);
  needle.position.y = DR * 0.43;
  needlePivot.add(needle);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, DR * 0.18, 0.006), mats.needle);
  tail.position.y = -DR * 0.09;
  needlePivot.add(tail);
  dialGroup.add(needlePivot);

  // domed glass
  const domeR = 2.2, theta = Math.asin((DR + 0.01) / domeR);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR, 128, 24, 0, Math.PI * 2, 0, theta), mats.glass);
  dome.rotation.x = Math.PI / 2;
  dome.position.z = 0.02 - domeR * Math.cos(theta);
  dialGroup.add(dome);

  // tuning knob in the centre, through the glass
  const tuning = knurledKnob(0.115, 0.15, mats);
  tuning.rotation.x = Math.PI / 2;
  tuning.position.z = 0.14;
  dialGroup.add(tuning);

  // ---------- lower controls ----------
  const lowY = -0.6;
  const volume = knurledKnob(0.12, 0.12, mats, 42);
  volume.rotation.x = Math.PI / 2;
  volume.position.set(plateX - 0.42, lowY, FRONT + 0.1);
  body.add(volume);
  const tone = knurledKnob(0.12, 0.12, mats, 42);
  tone.rotation.x = Math.PI / 2;
  tone.position.set(plateX + 0.42, lowY, FRONT + 0.1);
  body.add(tone);

  // pilot lamp
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 32, 16), mats.lamp);
  lamp.position.set(plateX, lowY, FRONT + 0.05);
  body.add(lamp);
  const lampRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.012, 16, 48), mats.bezel);
  lampRing.position.set(plateX, lowY, FRONT + 0.045);
  body.add(lampRing);

  const label = (text, x, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.08),
      new THREE.MeshStandardMaterial({ map: labelTexture(text), transparent: true, roughness: 0.6 }));
    m.position.set(x, y, FRONT + 0.033);
    body.add(m);
  };
  label('Volume', plateX - 0.42, lowY - 0.2);
  label('Tone', plateX + 0.42, lowY - 0.2);

  // feet
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, FEET, 32), mats.brass);
    f.position.set(sx * (W / 2 - 0.45), FEET / 2, sz * (D / 2 - 0.35));
    f.castShadow = true;
    radio.add(f);
  });

  // warm spill from the dial onto the plate and knobs
  const glowLight = new THREE.PointLight('#ffa24a', 0, 3.2, 1.6);
  glowLight.position.set(0, 0, 0.45);
  dialGroup.add(glowLight);

  radio.traverse((o) => { if (o.isMesh && o.castShadow === false && o !== field) o.receiveShadow = true; });

  // world-space helpers for camera framing
  const anchors = {
    dial: () => dialGroup.getWorldPosition(new THREE.Vector3()),
    knob: () => tone.getWorldPosition(new THREE.Vector3()),
    cloth: () => clothMesh.getWorldPosition(new THREE.Vector3()),
    badge: () => badgeGroup.getWorldPosition(new THREE.Vector3()),
    center: () => body.getWorldPosition(new THREE.Vector3()),
  };

  return {
    group: radio, body, mats, needlePivot, tuning, volume, tone, glowLight, anchors, liveDial, FRONT, clothX, plateX,
    size: { W, H: H + FEET, D }, STATIONS,
  };
}
