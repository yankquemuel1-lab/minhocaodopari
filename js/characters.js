// Personagens 3D procedurais: humanoides articulados e o Minhocão
import * as THREE from 'three';
import { noise2D } from './util.js';

const MAT = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!MAT[key]) {
    MAT[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
  }
  return MAT[key];
}

// Material com textura procedural (pele/tecido) — cache separado do `mat()` porque
// o objeto de textura não pode virar chave via JSON.stringify.
function texMat(color, texture, opts = {}) {
  const key = 'T' + color + '_' + texture.uuid + JSON.stringify(opts);
  if (!MAT[key]) {
    MAT[key] = new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.85, metalness: 0.05, ...opts });
  }
  return MAT[key];
}

function noiseCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const v = Math.max(0, Math.min(1, fn(px, py)));
      const idx = (py * size + px) * 4;
      const g = Math.floor(v * 255);
      img.data[idx] = g; img.data[idx + 1] = g; img.data[idx + 2] = g; img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// Pele com leve variação de tom (poros/sombreado sutil) — evita o efeito "plástico".
let _skinTex = null;
function skinTexture() {
  if (_skinTex) return _skinTex;
  _skinTex = noiseCanvas(64, (px, py) => {
    const blotch = noise2D(px * 0.08, py * 0.08);
    const fine = noise2D(px * 0.3, py * 0.3) * 0.3;
    return 0.75 + blotch * 0.2 + fine * 0.1;
  });
  return _skinTex;
}

// Tecido com trama sutil (roupas) — quebra a cor chapada das camisas/shorts.
let _fabricTex = null;
function fabricTexture() {
  if (_fabricTex) return _fabricTex;
  _fabricTex = noiseCanvas(64, (px, py) => {
    const weave = (Math.sin(px * 1.1) * 0.5 + Math.sin(py * 1.1) * 0.5) * 0.06;
    const fold = noise2D(px * 0.12, py * 0.12) * 0.25;
    return 0.78 + weave + fold;
  });
  return _fabricTex;
}

function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true;
  return m;
}

function sphere(r, color, opts) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat(color, opts));
  m.castShadow = true;
  return m;
}

function sphereSkin(r, color, opts) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), texMat(color, skinTexture(), opts));
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Humanoide articulado (jogador e NPC)
// ---------------------------------------------------------------------------
export function makeHumanoid(style) {
  const cfg = {
    boy:    { skin: 0xe0b58c, shirt: 0xd9822e, shorts: 0x33404f, shoes: 0x262626, hair: 0x241a14, height: 1.0 },
    girl:   { skin: 0x9a6a45, shirt: 0xf2cf3a, shorts: 0x3b6ea5, shoes: 0xc0392b, hair: 0x241811, height: 0.98 },
    maneca: { skin: 0x8a5a3b, shirt: 0xcfe3ee, shorts: 0x8a7455, shoes: 0x6b4a2c, hair: 0xd8d8d8, height: 1.02 }
  }[style];

  const g = new THREE.Group();
  const s = cfg.height;

  // Tronco arredondado (cápsula)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21 * s, 0.3 * s, 4, 12), texMat(cfg.shirt, fabricTexture()));
  torso.scale.x = 1.18;
  torso.position.y = 1.1 * s;
  torso.castShadow = true;
  g.add(torso);

  if (style === 'maneca') {
    const vest = new THREE.Mesh(new THREE.CapsuleGeometry(0.23 * s, 0.24 * s, 4, 12), texMat(0x4a6741, fabricTexture()));
    vest.scale.set(1.16, 1, 0.9);
    vest.position.y = 1.12 * s;
    g.add(vest);
  }

  // Quadril / bermuda
  const hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * s, 0.1 * s, 4, 12), texMat(cfg.shorts, fabricTexture()));
  hip.scale.x = 1.1;
  hip.position.y = 0.82 * s;
  g.add(hip);

  // Cabeça
  const headG = new THREE.Group();
  headG.position.y = 1.54 * s;
  const head = sphereSkin(0.2 * s, cfg.skin);
  head.scale.y = 1.08;
  headG.add(head);

  // Sorriso
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.07 * s, 0.012 * s, 6, 12, Math.PI),
    mat(0x5a3020)
  );
  smile.position.set(0, -0.05 * s, 0.185 * s);
  smile.rotation.z = Math.PI;
  headG.add(smile);

  // Olhos
  for (const sx of [-1, 1]) {
    const eye = sphere(0.028 * s, 0xffffff, { roughness: 0.3 });
    eye.position.set(sx * 0.07 * s, 0.03 * s, 0.16 * s);
    headG.add(eye);
    const pupil = sphere(0.013 * s, 0x241a10, { roughness: 0.3 });
    pupil.position.set(sx * 0.07 * s, 0.03 * s, 0.185 * s);
    headG.add(pupil);
  }

  // Cabelo / chapéu
  if (style === 'boy') {
    // Cabelo cacheado e volumoso (referência: foto do Ben). Núcleo SÓLIDO e
    // grande cobrindo topo/laterais/nuca por inteiro primeiro — evita mostrar
    // a cabeça "careca" vista de trás — com cachos por cima só pra silhueta
    // bagunçada. Tudo em z<=0 (nunca na frente do rosto): testa/olhos livres.
    const hairCore = sphere(0.2 * s, cfg.hair);
    hairCore.scale.set(1.18, 1.05, 0.95);
    hairCore.position.set(0, 0, -0.07 * s);
    headG.add(hairCore);
    const CURLS = [
      // topo e nuca alta
      [0.00, 0.27, -0.03, 1.00], [0.15, 0.24, -0.04, 0.85], [-0.15, 0.24, -0.04, 0.85],
      [0.00, 0.20, -0.20, 0.85],
      // laterais, cobrindo as orelhas
      [0.24, 0.10, -0.06, 0.92], [-0.24, 0.10, -0.06, 0.92],
      [0.25, -0.04, -0.10, 0.88], [-0.25, -0.04, -0.10, 0.88],
      // mechas caindo nas laterais, quase no queixo/pescoço
      [0.20, -0.18, -0.12, 0.80], [-0.20, -0.18, -0.12, 0.80],
      [0.10, -0.24, -0.16, 0.72], [-0.10, -0.24, -0.16, 0.72],
      // nuca — fecha o centro das costas da cabeça (aqui que "carecava")
      [0.00, 0.05, -0.26, 0.92], [0.11, -0.10, -0.25, 0.80], [-0.11, -0.10, -0.25, 0.80],
      [0.00, -0.16, -0.24, 0.78]
    ];
    for (const [cx, cy, cz, cr] of CURLS) {
      const curl = sphere(0.1 * cr * s, cfg.hair);
      curl.position.set(cx * s, cy * s, cz * s);
      headG.add(curl);
    }
  } else if (style === 'girl') {
    const hair = sphere(0.195 * s, cfg.hair);
    hair.scale.set(1.05, 0.85, 1.05);
    hair.position.y = 0.07 * s;
    headG.add(hair);
    // Trança
    for (let i = 0; i < 4; i++) {
      const b = sphere((0.075 - i * 0.01) * s, cfg.hair);
      b.position.set(0, (-0.02 - i * 0.13) * s, (-0.17 - i * 0.015) * s);
      headG.add(b);
    }
  } else {
    // Barba branca e chapéu de palha
    const beard = sphere(0.1 * s, cfg.hair);
    beard.scale.set(1.2, 0.7, 0.7);
    beard.position.set(0, -0.11 * s, 0.12 * s);
    headG.add(beard);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.34 * s, 0.03 * s, 20), mat(0xd9b96a));
    brim.position.y = 0.14 * s;
    brim.castShadow = true;
    headG.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.19 * s, 0.14 * s, 16), mat(0xcfa952));
    top.position.y = 0.22 * s;
    top.castShadow = true;
    headG.add(top);
  }
  g.add(headG);

  // Membros com pivô — cápsulas arredondadas
  function limb(w, len, color, x, y, handColor, isSkin) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(w / 2, len - w, 4, 10),
      texMat(color, isSkin ? skinTexture() : fabricTexture())
    );
    m.position.y = -len / 2;
    m.castShadow = true;
    pivot.add(m);
    if (handColor) {
      const hand = sphereSkin(w * 0.55, handColor);
      hand.position.y = -len + w * 0.2;
      pivot.add(hand);
    }
    g.add(pivot);
    return pivot;
  }

  const sleeve = style === 'maneca' ? 0xcfe3ee : cfg.skin;
  const legL = limb(0.14 * s, 0.72 * s, cfg.skin, -0.12 * s, 0.72 * s, null, true);
  const legR = limb(0.14 * s, 0.72 * s, cfg.skin, 0.12 * s, 0.72 * s, null, true);
  const armL = limb(0.11 * s, 0.56 * s, sleeve, -0.28 * s, 1.32 * s, cfg.skin, sleeve === cfg.skin);
  const armR = limb(0.11 * s, 0.56 * s, sleeve, 0.28 * s, 1.32 * s, cfg.skin, sleeve === cfg.skin);

  // Pés arredondados
  for (const pivot of [legL, legR]) {
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * s, 0.12 * s, 4, 8), mat(cfg.shoes, { roughness: 0.65 }));
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.71 * s, 0.07 * s);
    pivot.add(foot);
  }

  const parts = { torso, headG, legL, legR, armL, armR };

  return {
    group: g,
    parts,
    // Animação de caminhada: t em segundos, k intensidade 0..1
    walk(t, k) {
      const sw = Math.sin(t * 8.5) * 0.65 * k;
      parts.legL.rotation.x = sw;
      parts.legR.rotation.x = -sw;
      parts.armL.rotation.x = -sw * 0.8;
      parts.armR.rotation.x = sw * 0.8;
      g.position.y = Math.abs(Math.sin(t * 8.5)) * 0.045 * k;
    },
    idle(t) {
      parts.legL.rotation.x = 0;
      parts.legR.rotation.x = 0;
      parts.armL.rotation.x = Math.sin(t * 1.6) * 0.05;
      parts.armR.rotation.x = -Math.sin(t * 1.6) * 0.05;
      parts.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
      g.position.y = 0;
    },
    // Pose de montaria: pernas dobradas, braços à frente segurando as barbas
    ridePose() {
      parts.legL.rotation.x = -1.25;
      parts.legR.rotation.x = -1.25;
      parts.armL.rotation.x = -0.95;
      parts.armR.rotation.x = -0.95;
      parts.armL.rotation.z = 0.25;
      parts.armR.rotation.z = -0.25;
    }
  };
}

// ---------------------------------------------------------------------------
// Vara de pescar do Seu Maneca
// ---------------------------------------------------------------------------
export function makeFishingRod() {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 2.1, 6), mat(0x7a5230));
  rod.rotation.z = -0.9;
  rod.position.set(0.75, 0.9, 0);
  g.add(rod);

  const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(1.62, 1.52, 0),
    new THREE.Vector3(2.4, -0.1, 0)
  ]);
  g.add(new THREE.Line(lineGeo, lineMat));

  const float = sphere(0.05, 0xd0342c, { roughness: 0.4 });
  float.position.set(2.4, -0.08, 0);
  g.add(float);
  g.userData.float = float;
  return g;
}

// ---------------------------------------------------------------------------
// Textura procedural de escamas douradas
// ---------------------------------------------------------------------------
function makeScaleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#d9a441';
  x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 8; col++) {
      const px = col * 32 + (row % 2 ? 16 : 0);
      const py = row * 26;
      const grd = x.createRadialGradient(px, py + 8, 2, px, py + 8, 20);
      grd.addColorStop(0, '#e8bc5e');
      grd.addColorStop(0.8, '#c08a2e');
      grd.addColorStop(1, '#9a6b1e');
      x.fillStyle = grd;
      x.beginPath();
      x.arc(px, py + 8, 17, 0, Math.PI * 2);
      x.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// O Minhocão: corpo em tubo com ondulação por shader + cabeça expressiva
// ---------------------------------------------------------------------------
export function makeMinhocao() {
  const g = new THREE.Group();
  const L = 26; // comprimento do corpo

  const scaleTex = makeScaleTexture();
  scaleTex.repeat.set(6, 2);

  const bodyMat = new THREE.MeshStandardMaterial({
    map: scaleTex,
    color: 0xf0c05a,
    roughness: 0.55,
    metalness: 0.25
  });

  const uniforms = { uTime: { value: 0 }, uAmp: { value: 1.0 } };
  bodyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uAmp = uniforms.uAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uAmp;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float body = smoothstep(1.0, 8.0, transformed.z);
        transformed.x += sin(transformed.z * 0.42 - uTime * 3.2) * uAmp * 1.15 * body;
        transformed.y += sin(transformed.z * 0.3 - uTime * 2.1) * uAmp * 0.35 * body;`);
  };

  // Corpo: tubo reto no eixo +z (cauda no z positivo), pescoço em z=0
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.4, L * 0.3),
    new THREE.Vector3(0, -0.7, L * 0.65),
    new THREE.Vector3(0, -0.5, L)
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(spine, 80, 1.05, 18, false), bodyMat);
  tube.castShadow = true;
  g.add(tube);

  const taperAt = (z) => 1 - Math.max(0, (z - L * 0.55) / (L * 0.45)) * 0.75;
  const spineY = (z) => spine.getPointAt(Math.min(Math.max(z / L, 0), 1)).y;

  // Afunilamento da cauda: escala manual dos vértices finais
  {
    const pos = tube.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const taper = taperAt(z);
      const cy = spineY(z);
      pos.setX(i, pos.getX(i) * taper);
      pos.setY(i, cy + (pos.getY(i) - cy) * taper);
    }
    pos.needsUpdate = true;
    tube.geometry.computeVertexNormals();
  }

  // Crista dorsal contínua — usa o MESMO material do corpo, então ondula junto
  {
    const finGeo = new THREE.BoxGeometry(0.14, 1, L, 1, 1, 48);
    finGeo.translate(0, 0, L / 2);
    const pos = finGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const taper = taperAt(z);
      const cy = spineY(z);
      const localY = pos.getY(i); // -0.5..0.5
      const height = (0.8 + Math.sin((z / L) * Math.PI * 5) * 0.28) * taper;
      pos.setY(i, cy + 0.95 * taper + (localY + 0.5) * height);
      pos.setX(i, pos.getX(i) * taper);
    }
    pos.needsUpdate = true;
    finGeo.computeVertexNormals();
    const fin = new THREE.Mesh(finGeo, bodyMat);
    g.add(fin);
  }

  // Cabeça (grupo próprio no pescoço, não afetada pelo shader)
  const headG = new THREE.Group();
  headG.position.set(0, 0.35, -0.4);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 20), bodyMat);
  skull.scale.set(0.98, 0.92, 1.28);
  skull.castShadow = true;
  headG.add(skull);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 16), bodyMat);
  snout.scale.set(0.88, 0.6, 1.05);
  snout.position.set(0, -0.32, -1.15);
  headG.add(snout);

  // Narinas
  for (const sx of [-1, 1]) {
    const nostril = sphere(0.07, 0x8a5a1e);
    nostril.position.set(sx * 0.26, -0.12, -1.95);
    headG.add(nostril);
  }

  // Sorriso simpático
  const smileArc = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.045, 6, 16, Math.PI * 0.75),
    mat(0x7a4a12)
  );
  smileArc.position.set(0, -0.62, -1.35);
  smileArc.rotation.set(1.35, 0, Math.PI * 1.12);
  headG.add(smileArc);

  // Olhos grandes e amigáveis, com brilho
  for (const sx of [-1, 1]) {
    const white = sphere(0.38, 0xffffff, { roughness: 0.2 });
    white.position.set(sx * 0.56, 0.42, -0.78);
    headG.add(white);
    const iris = sphere(0.23, 0x9a6420, { roughness: 0.25 });
    iris.position.set(sx * 0.59, 0.42, -1.02);
    headG.add(iris);
    const pupil = sphere(0.12, 0x1a1108, { roughness: 0.25 });
    pupil.position.set(sx * 0.61, 0.42, -1.16);
    headG.add(pupil);
    const spark = sphere(0.045, 0xffffff, { roughness: 0.1 });
    spark.position.set(sx * 0.55, 0.52, -1.24);
    headG.add(spark);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), mat(0xc08a2e));
    brow.rotation.z = Math.PI / 2 + sx * -0.25;
    brow.position.set(sx * 0.56, 0.85, -0.75);
    headG.add(brow);
  }

  // Barbelas frontais curtas
  const whiskerMat = mat(0xe8bc5e, { roughness: 0.5 });
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.5, -0.15, -1.0),
      new THREE.Vector3(sx * 1.15, -0.5, -0.55),
      new THREE.Vector3(sx * 1.5, -1.15, 0.1)
    ]);
    const w = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.045, 6, false), whiskerMat);
    headG.add(w);
  }
  // Barbelas longas — as "rédeas" que voltam até as mãos do jogador (visíveis no POV)
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.58, 0.0, -1.05),
      new THREE.Vector3(sx * 1.35, -0.15, -0.1),
      new THREE.Vector3(sx * 0.95, 0.35, 0.85),
      new THREE.Vector3(sx * 0.35, 0.62, 1.35)
    ]);
    const w = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.05, 6, false), whiskerMat);
    headG.add(w);
  }

  // Nadadeiras laterais e crista
  const finMat = mat(0xd9a441, { roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 4), finMat);
    fin.position.set(sx * 1.05, -0.1, 0.4);
    fin.rotation.z = sx * 1.9;
    fin.scale.z = 0.25;
    headG.add(fin);
  }
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 4), finMat);
  crest.position.set(0, 1.05, 0.5);
  crest.rotation.x = 0.5;
  crest.scale.z = 0.3;
  headG.add(crest);

  g.add(headG);

  // Ponto de montaria no pescoço, atrás da cabeça
  const attach = new THREE.Object3D();
  attach.position.set(0, 1.05, 0.75);
  g.add(attach);

  return {
    group: g,
    headG,
    attach,
    uniforms,
    length: L,
    update(t) {
      uniforms.uTime.value = t;
      headG.position.y = 0.35 + Math.sin(t * 2.1) * 0.12;
      headG.rotation.z = Math.sin(t * 1.7) * 0.05;
    }
  };
}
