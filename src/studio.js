// A product-photography studio that only exists to be reflected:
// a black room with a few large softboxes. Chrome and lacquer pick these up
// as long, clean highlights.
import * as THREE from 'three';

function softbox(w, h, intensity, color = '#ffffff') {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

export function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#050505');

  // big overhead box, slightly forward: long top highlights
  const top = softbox(14, 5, 2.0, '#fff4e6');
  top.position.set(0, 9, 2.5);
  top.rotation.x = Math.PI / 2;
  env.add(top);

  // tall key strip, front-left
  const key = softbox(2.2, 9, 6, '#ffe6c8');
  key.position.set(-8, 3, 5);
  key.lookAt(0, 1.5, 0);
  env.add(key);

  // thin cool rim strip, back-right
  const rim = softbox(0.9, 10, 7, '#dfe7ff');
  rim.position.set(8, 3, -4);
  rim.lookAt(0, 1.5, 0);
  env.add(rim);

  // faint warm card, front-right, for fill in the chrome
  const fill = softbox(5, 3, 0.8, '#ffd9b0');
  fill.position.set(7, 1.5, 7);
  fill.lookAt(0, 1.5, 0);
  env.add(fill);

  // soft card behind camera so metal facing us isn't black
  const front = softbox(10, 4, 0.9, '#f3e6d6');
  front.position.set(1, 2.5, 12);
  front.lookAt(0, 1.5, 0);
  env.add(front);

  // floor bounce
  const floor = softbox(30, 30, 0.04, '#3a2c20');
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  env.add(floor);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}
