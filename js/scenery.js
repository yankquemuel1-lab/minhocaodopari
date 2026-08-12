// Cenografia procedural estilizada — direção de arte: Alto's Odyssey / Monument Valley
// Mesas estratificadas da Chapada, água com brilho, vegetação arredondada,
// itens com glow (prêmios) e anel vermelho (perigos)
import * as THREE from 'three';
import { rand, randInt, choice, noise2D } from './util.js';

const MAT = {};
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!MAT[key]) MAT[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, ...opts });
  return MAT[key];
}

// Material colorido + textura procedural compartilhada — cache separado do `mat()`
// acima porque a textura (objeto THREE.Texture) não pode entrar no JSON.stringify
// usado como chave ali (referência circular / serialização gigante).
const TEX_MAT = {};
export function texMat(color, texture, opts = {}) {
  const key = color + '_' + texture.uuid + JSON.stringify(opts);
  if (!TEX_MAT[key]) {
    TEX_MAT[key] = new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.9, metalness: 0.02, ...opts });
  }
  return TEX_MAT[key];
}

// Desloca o raio de uma geometria de revolução (cilindro/cone) usando ruído 2D
// em função do ângulo — quebra a silhueta perfeitamente circular, dando um ar
// de rocha/tronco esculpido à mão em vez de "extrudado" geometricamente.
function roughenRadial(geo, amp, seed) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    if (r < 0.01) continue;
    const ang = Math.atan2(z, x);
    const n = noise2D(Math.cos(ang) * 2.4 + seed, Math.sin(ang) * 2.4 + y * 0.35 + seed);
    const scale = 1 + (n - 0.5) * amp;
    pos.setX(i, x * scale);
    pos.setZ(i, z * scale);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// Texturas procedurais de superfície (canvas + ruído) — dão detalhe fino
// (poros, veios, grão) que a geometria low-poly sozinha não consegue.
// Tons neutros/médios: multiplicam sobre a cor do material sem escurecer demais.
// ---------------------------------------------------------------------------
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
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let _rockTex = null;
export function rockTexture() {
  if (_rockTex) return _rockTex;
  _rockTex = noiseCanvas(256, (px, py) => {
    const erosion = noise2D(px * 0.045, py * 0.16);
    const fine = noise2D(px * 0.14, py * 0.14) * 0.5;
    const streak = noise2D(px * 0.02, py * 0.6) * 0.22;
    return 0.6 + erosion * 0.3 + fine * 0.16 - streak * 0.18;
  });
  _rockTex.repeat.set(1.5, 1.5);
  return _rockTex;
}

let _stoneTex = null;
export function stoneTexture() {
  if (_stoneTex) return _stoneTex;
  _stoneTex = noiseCanvas(128, (px, py) => {
    const a = noise2D(px * 0.1, py * 0.1);
    const b = noise2D(px * 0.3, py * 0.3) * 0.4;
    return 0.55 + a * 0.35 + b * 0.15;
  });
  return _stoneTex;
}

let _barkTex = null;
export function barkTexture() {
  if (_barkTex) return _barkTex;
  _barkTex = noiseCanvas(128, (px, py) => {
    const grain = noise2D(px * 0.05, py * 0.5) * 0.35;
    const fine = noise2D(px * 0.4, py * 0.4) * 0.2;
    const ring = Math.sin(py * 0.25 + noise2D(px * 0.08, 0) * 6) * 0.08;
    return 0.55 + grain + fine - ring;
  });
  _barkTex.repeat.set(1, 3);
  return _barkTex;
}

let _foliageTex = null;
export function foliageTexture() {
  if (_foliageTex) return _foliageTex;
  _foliageTex = noiseCanvas(128, (px, py) => {
    const clump = noise2D(px * 0.09, py * 0.09);
    const leaf = noise2D(px * 0.35, py * 0.35) * 0.45;
    return 0.55 + clump * 0.32 + leaf * 0.18;
  });
  return _foliageTex;
}

// Clona uma textura-base com um repeat próprio — necessário porque `.repeat` é
// uma propriedade da instância de Texture: reaproveitar o mesmo objeto entre
// planos de tamanhos bem diferentes faria o ladrilhamento de um "vazar" pro outro.
export function tiledTexture(base, rx, ry) {
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

let _terrainTex = null;
export function terrainTexture() {
  if (_terrainTex) return _terrainTex;
  _terrainTex = noiseCanvas(256, (px, py) => {
    const patch = noise2D(px * 0.05, py * 0.05);
    const blade = noise2D(px * 0.3, py * 0.3) * 0.4;
    const speck = noise2D(px * 0.9, py * 0.9) * 0.15;
    return 0.58 + patch * 0.3 + blade * 0.18 - speck * 0.1;
  });
  return _terrainTex;
}

let _waterBumpTex = null;
export function waterBumpTexture() {
  if (_waterBumpTex) return _waterBumpTex;
  _waterBumpTex = noiseCanvas(128, (px, py) => {
    const big = noise2D(px * 0.06, py * 0.06);
    const small = noise2D(px * 0.22, py * 0.22) * 0.5;
    return 0.5 + (big - 0.5) * 0.7 + (small - 0.5) * 0.5;
  });
  return _waterBumpTex;
}

const GEO = {
  sphere: new THREE.SphereGeometry(1, 12, 10),
  blob: new THREE.IcosahedronGeometry(1, 1),
  rock: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  disc: new THREE.CircleGeometry(1, 24)
};

// ---------------------------------------------------------------------------
// Texturas utilitárias
// ---------------------------------------------------------------------------
let glowTexCache = {};
export function glowTexture(hex) {
  if (glowTexCache[hex]) return glowTexCache[hex];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, hex + 'ff');
  g.addColorStop(0.35, hex + '66');
  g.addColorStop(1, hex + '00');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowTexCache[hex] = tex;
  return tex;
}

export function makeGlowSprite(hex, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(hex),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  }));
  s.scale.setScalar(size);
  return s;
}

function shadowDisc(r) {
  const d = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({
    color: 0x06222a, transparent: true, opacity: 0.28, depthWrite: false
  }));
  d.rotation.x = -Math.PI / 2;
  d.scale.setScalar(r);
  d.position.y = 0.03;
  return d;
}

// ---------------------------------------------------------------------------
// Céu: gradiente rico + sol com halo + nuvens estilizadas
// ---------------------------------------------------------------------------
export function makeSky() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0.0, '#26436e');
  grd.addColorStop(0.3, '#4d6b9a');
  grd.addColorStop(0.5, '#9a7ba0');
  grd.addColorStop(0.62, '#e88a6a');
  grd.addColorStop(0.74, '#ffb877');
  grd.addColorStop(0.88, '#ffd9a0');
  grd.addColorStop(1.0, '#ffe9c4');
  x.fillStyle = grd;
  x.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(34, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf, fog: false })
  );
  sun.position.set(110, 100, -800);
  sky.add(sun);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('#ffdf9e'),
    blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, fog: false
  }));
  halo.scale.setScalar(420);
  halo.position.copy(sun.position);
  sky.add(halo);

  // Nuvens achatadas no dourado do horizonte
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffe8cc, transparent: true, opacity: 0.9, fog: false });
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group();
    const n = randInt(3, 5);
    for (let j = 0; j < n; j++) {
      const p = new THREE.Mesh(GEO.sphere, cloudMat);
      p.scale.set(rand(18, 34), rand(6, 10), rand(12, 20));
      p.position.set(j * rand(14, 22) - n * 8, rand(-2, 4), rand(-6, 6));
      cl.add(p);
    }
    const a = rand(0, Math.PI * 2);
    const r = rand(480, 700);
    cl.position.set(Math.cos(a) * r, rand(90, 220), Math.sin(a) * r);
    sky.add(cl);
  }
  return sky;
}

// ---------------------------------------------------------------------------
// Água estilizada: ondas suaves + brilho especular do sol
// ---------------------------------------------------------------------------
export function makeWater(width, length, uniforms) {
  const geo = new THREE.PlaneGeometry(width, length, 40, 80);
  const bump = waterBumpTexture();
  bump.repeat.set(width / 5, length / 5);
  const m = new THREE.MeshStandardMaterial({
    color: 0x27b8a8,
    transparent: true,
    opacity: 0.92,
    roughness: 0.12,
    metalness: 0.45,
    depthWrite: false,
    bumpMap: bump,
    bumpScale: 0.18
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += sin(transformed.x * 0.32 + uTime * 1.3) * 0.09
                       + sin(transformed.y * 0.2 + uTime * 0.8) * 0.11;`);
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// Faixa de espuma na beira do rio
export function makeFoamStrip(length, uniforms) {
  const m = new THREE.MeshBasicMaterial({
    color: 0xeafcf8, transparent: true, opacity: 0.4, depthWrite: false
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.x += sin(transformed.y * 0.5 + uTime * 2.0) * 0.5;`);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, length, 1, 40), m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ---------------------------------------------------------------------------
// Mesa estratificada (formação da Chapada) — substitui os "blocos Minecraft"
// ---------------------------------------------------------------------------
const STRATA = ['#7a3212', '#9a4318', '#b5541f', '#c96a2e', '#d98a4a', '#e8b378'];

export function makeMesa(radius, height) {
  const g = new THREE.Group();
  const nSlabs = randInt(4, 6);
  const seed = rand(0, 100);
  let y = 0;
  const rBase = radius;
  for (let i = 0; i < nSlabs; i++) {
    const t = i / (nSlabs - 1);
    const h = (height / nSlabs) * rand(0.8, 1.25);
    const rTop = rBase * (1 - t * 0.16) * rand(0.94, 1.02);
    const rBot = rBase * (1 - Math.max(0, t - 1 / nSlabs) * 0.16) * rand(0.98, 1.06);
    const col = STRATA[Math.min(STRATA.length - 1, Math.floor(t * STRATA.length) )];
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 12, 2);
    roughenRadial(geo, 0.16, seed + i * 3.7);
    const slab = new THREE.Mesh(
      geo,
      texMat(new THREE.Color(col).getHex(), rockTexture(), { flatShading: true, roughness: 1 })
    );
    slab.position.y = y + h / 2;
    slab.rotation.y = rand(0, 0.6);
    slab.castShadow = true;
    slab.receiveShadow = true;
    g.add(slab);
    y += h * 0.96;
  }
  // Topo verde (vegetação do platô)
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(rBase * 0.8, rBase * 0.86, height * 0.06, 12),
    mat(0x5d7a4a, { flatShading: true })
  );
  cap.position.y = y + height * 0.02;
  g.add(cap);
  for (let i = 0; i < 3; i++) {
    const bush = new THREE.Mesh(GEO.blob, texMat(choice([0x4a6741, 0x6e8a3a]), foliageTexture(), { flatShading: true }));
    bush.scale.setScalar(rand(1, 2.2));
    bush.position.set(rand(-radius * 0.5, radius * 0.5), y + 1, rand(-radius * 0.5, radius * 0.5));
    g.add(bush);
  }
  // Tálus (pedras caídas na base)
  for (let i = 0; i < 3; i++) {
    const rock = new THREE.Mesh(GEO.rock, texMat(choice([0x9a4318, 0xb5541f]), stoneTexture(), { flatShading: true }));
    rock.scale.setScalar(rand(0.8, 2));
    rock.position.set(rand(-radius, radius), rand(0.2, 0.8), radius * rand(0.7, 1.1));
    g.add(rock);
  }
  return g;
}

// Fileira de mesas formando o paredão do cânion
export function makeCliff(length, height) {
  const g = new THREE.Group();
  let x = 0;
  while (x < length) {
    const r = rand(7, 12);
    const mesa = makeMesa(r, height * rand(0.7, 1.15));
    mesa.position.set(x + r * 0.5, 0, rand(-4, 4));
    g.add(mesa);
    x += r * rand(1.1, 1.5);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Cachoeira em camadas com névoa
// ---------------------------------------------------------------------------
export function makeWaterfall(width, height, uniforms) {
  const g = new THREE.Group();
  for (const [off, op] of [[0, 0.85], [0.5, 0.5]]) {
    const m = new THREE.MeshStandardMaterial({
      color: 0xeaf6ff, transparent: true, opacity: op, roughness: 0.25, depthWrite: false
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.z += sin(transformed.y * 1.1 + uTime * ${(6 + off * 3).toFixed(1)}) * 0.3;`);
    };
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(width * (1 - off * 0.2), height, 8, 20), m);
    fall.position.set(0, height / 2, off * 0.7);
    g.add(fall);
  }
  const foam = new THREE.Mesh(GEO.sphere, new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.8, roughness: 0.4, depthWrite: false
  }));
  foam.scale.set(width * 0.6, 1.3, 3);
  foam.position.y = 0.5;
  g.add(foam);

  const mist = makeGlowSprite('#ffffff', width * 1.6);
  mist.material.opacity = 0.35;
  mist.position.y = 3;
  g.add(mist);
  return g;
}

// ---------------------------------------------------------------------------
// Vegetação arredondada em camadas
// ---------------------------------------------------------------------------
function foliage(colors, scale) {
  const g = new THREE.Group();
  const layers = randInt(3, 4);
  for (let i = 0; i < layers; i++) {
    const b = new THREE.Mesh(GEO.blob, texMat(colors[i % colors.length], foliageTexture(), { flatShading: true }));
    const s = scale * (1 - i * 0.2) * rand(0.85, 1.05);
    b.scale.set(s, s * 0.78, s);
    b.position.set(rand(-0.6, 0.6) * scale * 0.45, i * scale * 0.36, rand(-0.6, 0.6) * scale * 0.45);
    b.rotation.y = rand(0, Math.PI * 2);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

// Ponto no topo de um cilindro centrado em `pos`, com metade da altura `half`
// e rotação `th` em torno de Z — a rotação do THREE.Mesh gira em torno do
// próprio centro da geometria, não da base, então o topo real não é
// simplesmente "pos + altura" quando há inclinação.
function tiltedTop(pos, half, th) {
  return { x: pos.x - half * Math.sin(th), y: pos.y + half * Math.cos(th) };
}

function curvedTrunk(height, lean, color) {
  const g = new THREE.Group();
  const bark = texMat(color, barkTexture(), { flatShading: true });

  const h1 = height * 0.55, half1 = h1 / 2, th1 = lean * 0.4;
  const pos1 = { x: 0, y: height * 0.27 };
  const seg1 = new THREE.Mesh(GEO.cyl, bark);
  seg1.scale.set(0.28, h1, 0.28);
  seg1.position.set(pos1.x, pos1.y, 0);
  seg1.rotation.z = th1;
  seg1.castShadow = true;
  g.add(seg1);

  // Segmento 2 encaixado exatamente no topo real do segmento 1 (mesmo cálculo
  // de rotação-em-torno-do-centro aplicado de trás pra frente) — antes disso,
  // os dois pedaços do tronco ficavam com um vão visível entre eles em
  // inclinações maiores (bem visível na palmeira, que tem o maior lean),
  // o que a cor sólida escondia mas a textura de casca deixou aparente.
  const h2 = height * 0.55, half2 = h2 / 2, th2 = lean * 0.8;
  const top1 = tiltedTop(pos1, half1, th1);
  const pos2 = { x: top1.x - half2 * Math.sin(th2), y: top1.y + half2 * Math.cos(th2) };
  const seg2 = new THREE.Mesh(GEO.cyl, bark);
  seg2.scale.set(0.22, h2, 0.22);
  seg2.position.set(pos2.x, pos2.y, 0);
  seg2.rotation.z = th2;
  seg2.castShadow = true;
  g.add(seg2);

  const top2 = tiltedTop(pos2, half2, th2);
  return { group: g, topX: top2.x, topY: top2.y };
}

export function makeTree(type) {
  const g = new THREE.Group();
  if (type === 'palm') {
    const lean = rand(-0.3, 0.3);
    const t = curvedTrunk(6, lean, 0x8a6a45);
    g.add(t.group);
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.Mesh(GEO.cone, texMat(i % 2 ? 0x4f9a52 : 0x62b060, foliageTexture(), { flatShading: true, side: THREE.DoubleSide }));
      leaf.scale.set(0.85, 2.9, 0.34);
      const a = (i / 8) * Math.PI * 2;
      leaf.position.set(t.topX + Math.cos(a) * 1.4, t.topY + 0.15, Math.sin(a) * 1.4);
      leaf.rotation.set(Math.sin(a) * 1.45, 0, Math.cos(a) * -1.45);
      leaf.castShadow = true;
      g.add(leaf);
    }
    for (let i = 0; i < 3; i++) {
      const coco = new THREE.Mesh(GEO.sphere, mat(0x6e5238));
      coco.scale.setScalar(0.28);
      coco.position.set(t.topX + rand(-0.4, 0.4), t.topY - 0.3, rand(-0.4, 0.4));
      g.add(coco);
    }
  } else if (type === 'ipe_yellow' || type === 'ipe_purple') {
    const col = type === 'ipe_yellow' ? 0xf2c62e : 0xc77ad4;
    const colLight = type === 'ipe_yellow' ? 0xffdf6e : 0xdda2e8;
    const lean = rand(-0.25, 0.25);
    const t = curvedTrunk(4, lean, 0x5e4530);
    g.add(t.group);
    for (let i = 0; i < 7; i++) {
      const blob = new THREE.Mesh(GEO.blob, mat(i % 2 ? col : colLight, {
        flatShading: true, emissive: col, emissiveIntensity: 0.12
      }));
      blob.scale.setScalar(rand(0.8, 1.5));
      blob.position.set(t.topX + rand(-1.6, 1.6), t.topY + rand(-0.4, 1.4), rand(-1.6, 1.6));
      g.add(blob);
    }
  } else if (type === 'twisted') {
    const g2 = curvedTrunk(3.4, rand(-0.5, 0.5), 0x53412c);
    g.add(g2.group);
    const f = foliage([0x3f6339, 0x54774a], rand(1.8, 2.6));
    f.position.set(g2.topX, g2.topY * 0.92, 0);
    g.add(f);
  } else {
    const lean = rand(-0.2, 0.2);
    const t = curvedTrunk(3.2, lean, 0x6e5238);
    g.add(t.group);
    const f = foliage([0x466b3a, 0x5d8a4a, 0x74a04f], rand(1.6, 2.4));
    f.position.set(t.topX, t.topY * 0.9, 0);
    g.add(f);
  }
  return g;
}

export function makeTermiteMound() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(GEO.cone, mat(0xa5714a, { flatShading: true }));
  m.scale.set(rand(0.6, 0.9), rand(1.2, 2), rand(0.6, 0.9));
  m.position.y = m.scale.y / 2;
  m.rotation.y = rand(0, 3);
  g.add(m);
  return g;
}

export function makeCapivara() {
  const g = new THREE.Group();
  const c = mat(0x96703f, { flatShading: true });
  const body = new THREE.Mesh(GEO.blob, c);
  body.scale.set(0.6, 0.45, 0.85);
  body.position.y = 0.45;
  g.add(body);
  const head = new THREE.Mesh(GEO.blob, c);
  head.scale.set(0.32, 0.3, 0.42);
  head.position.set(0, 0.6, 0.8);
  g.add(head);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(GEO.sphere, c);
    ear.scale.setScalar(0.08);
    ear.position.set(sx * 0.18, 0.82, 0.72);
    g.add(ear);
  }
  const snout = new THREE.Mesh(GEO.sphere, mat(0x7a5a32));
  snout.scale.set(0.16, 0.13, 0.16);
  snout.position.set(0, 0.52, 1.05);
  g.add(snout);
  return g;
}

export function makeBird() {
  const g = new THREE.Group();
  const white = mat(0xf7f7f2, { flatShading: true });
  const body = new THREE.Mesh(GEO.blob, white);
  body.scale.set(0.28, 0.3, 0.5);
  body.position.y = 1.0;
  g.add(body);
  const neck = new THREE.Mesh(GEO.cyl, white);
  neck.scale.set(0.05, 0.55, 0.05);
  neck.position.set(0, 1.35, 0.35);
  neck.rotation.x = 0.45;
  g.add(neck);
  const head = new THREE.Mesh(GEO.sphere, white);
  head.scale.setScalar(0.13);
  head.position.set(0, 1.62, 0.52);
  g.add(head);
  const beak = new THREE.Mesh(GEO.cone, mat(0xe8a53a));
  beak.scale.set(0.045, 0.3, 0.045);
  beak.position.set(0, 1.6, 0.72);
  beak.rotation.x = Math.PI / 2;
  g.add(beak);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(GEO.cyl, mat(0x2a2a2a));
    leg.scale.set(0.028, 1, 0.028);
    leg.position.set(sx * 0.1, 0.5, 0);
    g.add(leg);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Cuiabá ao entardecer: prédios com janelas acesas, postes, orla
// ---------------------------------------------------------------------------
let windowTex = null;
function getWindowTex() {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#5a6474';
  x.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 12; r++) {
    for (let col = 0; col < 5; col++) {
      x.fillStyle = Math.random() < 0.55 ? '#ffd980' : '#2a3542';
      x.fillRect(8 + col * 24, 10 + r * 20, 14, 12);
    }
  }
  windowTex = new THREE.CanvasTexture(c);
  windowTex.colorSpace = THREE.SRGBColorSpace;
  return windowTex;
}

const BUILDING_COLORS = [0xe0d5c5, 0xd9c8b8, 0xc8b8a8, 0xe8ddd0, 0xd0c8c0];

export function makeBuilding() {
  const g = new THREE.Group();
  const w = rand(6, 11), h = rand(12, 36), d = rand(6, 11);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: choice(BUILDING_COLORS), roughness: 0.85,
    map: getWindowTex(), emissive: 0xffc966, emissiveIntensity: 0.28, emissiveMap: getWindowTex()
  });
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMat);
  b.scale.set(w, h, d);
  b.position.y = h / 2;
  g.add(b);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x8a8378));
  crown.scale.set(w * 1.04, 0.9, d * 1.04);
  crown.position.y = h + 0.4;
  g.add(crown);
  if (Math.random() < 0.45) {
    const tank = new THREE.Mesh(GEO.cyl, mat(0x9a9288));
    tank.scale.set(1.2, 1.8, 1.2);
    tank.position.set(rand(-w * 0.25, w * 0.25), h + 1.8, rand(-d * 0.25, d * 0.25));
    g.add(tank);
  }
  return g;
}

export function makeLampPost() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(GEO.cyl, mat(0x4a4a4a));
  pole.scale.set(0.09, 4.6, 0.09);
  pole.position.y = 2.3;
  g.add(pole);
  const bulb = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0xffd980 }));
  bulb.scale.setScalar(0.25);
  bulb.position.y = 4.7;
  g.add(bulb);
  const glow = makeGlowSprite('#ffd980', 3.2);
  glow.position.y = 4.7;
  g.add(glow);
  return g;
}

export function makeBridge(span) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xc0b8ac));
  deck.scale.set(span, 1.2, 7.5);
  deck.position.y = 14;
  g.add(deck);
  // Arco de sustentação
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(span * 0.32, 0.8, 8, 24, Math.PI),
    mat(0xd9a441, { metalness: 0.4, roughness: 0.4 })
  );
  arc.position.y = 14.6;
  arc.scale.y = 0.55;
  g.add(arc);
  for (const dz of [-3.4, 3.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x8a8378));
    rail.scale.set(span, 0.7, 0.25);
    rail.position.set(0, 15, dz);
    g.add(rail);
  }
  const nP = Math.max(2, Math.floor(span / 30));
  for (let i = 0; i <= nP; i++) {
    const p = new THREE.Mesh(GEO.cyl, mat(0x9a9288));
    p.scale.set(1.4, 14, 1.4);
    p.position.set(-span / 2 + (span / nP) * i, 7, 0);
    g.add(p);
  }
  // Luzes na ponte
  for (let i = 0; i < 6; i++) {
    const glow = makeGlowSprite('#ffd980', 4);
    glow.position.set(-span / 2 + (span / 5) * i, 16, 0);
    g.add(glow);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Marcador de objetivo (waypoint dourado sobre o NPC)
// ---------------------------------------------------------------------------
export function makeMarker() {
  const g = new THREE.Group();
  const arrow = new THREE.Mesh(GEO.cone, new THREE.MeshStandardMaterial({
    color: 0xffd23e, emissive: 0xc79510, emissiveIntensity: 0.9, roughness: 0.3
  }));
  arrow.scale.set(0.5, 0.9, 0.5);
  arrow.rotation.x = Math.PI;
  arrow.position.y = 3.4;
  g.add(arrow);
  const glow = makeGlowSprite('#ffd23e', 3.4);
  glow.position.y = 3.5;
  g.add(glow);
  const beam = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({
    color: 0xffd23e, transparent: true, opacity: 0.12, depthWrite: false
  }));
  beam.scale.set(0.55, 8, 0.55);
  beam.position.y = 4;
  g.add(beam);
  g.userData.arrow = arrow;
  return g;
}

// ---------------------------------------------------------------------------
// Obstáculos: silhuetas claras + anel de perigo vermelho pulsante
// ---------------------------------------------------------------------------
function dangerRing() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.1, 0.12, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  return ring;
}

export function makeObstacle(kind) {
  const g = new THREE.Group();
  if (kind === 'pedra') {
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(GEO.rock, texMat(0x78828a, stoneTexture(), { flatShading: true }));
      r.scale.setScalar(rand(0.9, 1.7));
      r.rotation.set(rand(0, 3), rand(0, 3), 0);
      r.position.set(rand(-0.9, 0.9), rand(0.2, 0.7), rand(-0.7, 0.7));
      g.add(r);
    }
    const moss = new THREE.Mesh(GEO.blob, texMat(0x5d7a4a, foliageTexture(), { flatShading: true }));
    moss.scale.set(0.8, 0.3, 0.8);
    moss.position.y = 1.5;
    g.add(moss);
  } else if (kind === 'raiz') {
    // Tronco flutuante bem legível: madeira com anéis de casca e galhos
    const wood = texMat(0x6e4a2e, barkTexture(), { flatShading: true });
    const log = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 4.2, 4, 10), wood);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rand(-0.4, 0.4);
    log.position.y = 0.45;
    g.add(log);
    for (const dx of [-1.4, 0.2, 1.5]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.09, 6, 14), mat(0x53381f));
      band.rotation.y = Math.PI / 2;
      band.position.set(dx, 0.45, 0);
      band.rotation.z = log.rotation.y;
      g.add(band);
    }
    for (let i = 0; i < 2; i++) {
      const stub = new THREE.Mesh(GEO.cyl, wood);
      stub.scale.set(0.16, 0.9, 0.16);
      stub.position.set(rand(-1.6, 1.6), 1.0, rand(-0.2, 0.2));
      stub.rotation.z = rand(-0.6, 0.6);
      g.add(stub);
    }
  } else if (kind === 'lixo') {
    const bagMat = texMat(0x22262e, stoneTexture(), { roughness: 0.35 });
    const bag = new THREE.Mesh(GEO.blob, bagMat);
    bag.scale.set(1.0, 0.95, 1.0);
    bag.position.y = 0.75;
    g.add(bag);
    const knot = new THREE.Mesh(GEO.cone, bagMat);
    knot.scale.set(0.32, 0.5, 0.32);
    knot.position.y = 1.75;
    g.add(knot);
    // Latinhas coloridas espalhadas — leitura imediata de "lixo"
    for (const [dx, dz, col] of [[-1.1, 0.4, 0xd0342c], [1.0, -0.3, 0x2e6ea5], [0.3, 1.0, 0xe8a53a]]) {
      const can = new THREE.Mesh(GEO.cyl, mat(col, { metalness: 0.5, roughness: 0.3 }));
      can.scale.set(0.18, 0.36, 0.18);
      can.position.set(dx, 0.2, dz);
      can.rotation.z = rand(-1.5, 1.5);
      g.add(can);
    }
  } else if (kind === 'jacare') {
    // Jacaré espreitando: quase todo submerso, só o dorso/focinho/olhos de fora
    const skin = texMat(0x3c4a2e, stoneTexture(), { flatShading: true, roughness: 0.65 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.3, 4, 10), skin);
    body.rotation.z = Math.PI / 2;
    body.position.y = -0.15;
    g.add(body);
    const snout = new THREE.Mesh(GEO.cone, skin);
    snout.scale.set(0.26, 0.85, 0.26);
    snout.rotation.z = Math.PI / 2;
    snout.position.set(1.5, -0.08, 0);
    g.add(snout);
    // Fileira de escamas dorsais — silhueta reconhecível mesmo de longe
    for (let i = -2; i <= 2; i++) {
      const spike = new THREE.Mesh(GEO.cone, mat(0x2e3a20, { flatShading: true }));
      spike.scale.set(0.13, 0.24, 0.13);
      spike.position.set(i * 0.48, 0.34, 0);
      g.add(spike);
    }
    // Olhos amarelos frios espreitando na superfície
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(GEO.sphere, mat(0xd8c23a, { emissive: 0x8a6a10, emissiveIntensity: 0.55, roughness: 0.3 }));
      eye.scale.setScalar(0.12);
      eye.position.set(1.0, 0.2, sx * 0.24);
      g.add(eye);
      const pupil = new THREE.Mesh(GEO.sphere, mat(0x1a1408));
      pupil.scale.setScalar(0.05);
      pupil.position.set(1.06, 0.22, sx * 0.26);
      g.add(pupil);
    }
    const tail = new THREE.Mesh(GEO.cone, skin);
    tail.scale.set(0.32, 1.1, 0.32);
    tail.rotation.z = -Math.PI / 2;
    tail.position.set(-1.65, -0.1, 0);
    g.add(tail);
  } else if (kind === 'piranha') {
    // Cardume de piranhas — vermelho vivo, nadando rente à superfície
    const finBody = mat(0xc4342a, { flatShading: true, emissive: 0x5a0f0a, emissiveIntensity: 0.25 });
    const belly = mat(0xe8dca0, { flatShading: true });
    const school = [[0, 0, 0, 1], [0.65, 0.05, 0.5, 0.8], [-0.55, -0.03, 0.55, 0.78],
      [0.35, 0.08, -0.6, 0.7], [-0.6, 0, -0.35, 0.68]];
    for (const [px, py, pz, sc] of school) {
      const fish = new THREE.Group();
      const body = new THREE.Mesh(GEO.blob, finBody);
      body.scale.set(0.4 * sc, 0.24 * sc, 0.6 * sc);
      fish.add(body);
      const bellyM = new THREE.Mesh(GEO.blob, belly);
      bellyM.scale.set(0.28 * sc, 0.13 * sc, 0.48 * sc);
      bellyM.position.y = -0.08 * sc;
      fish.add(bellyM);
      const fin = new THREE.Mesh(GEO.cone, finBody);
      fin.scale.set(0.03 * sc, 0.26 * sc, 0.18 * sc);
      fin.position.set(0, 0.2 * sc, -0.05 * sc);
      fish.add(fin);
      fish.position.set(px, py, pz);
      fish.rotation.y = rand(-0.5, 0.5);
      g.add(fish);
    }
  } else {
    // Garrafa PET grande, deitada, com rótulo
    const bottle = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.6, 4, 12), mat(0xcfe8f0, {
      roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.75
    }));
    bottle.add(body);
    const label = new THREE.Mesh(GEO.cyl, mat(0xe84a3a));
    label.scale.set(0.58, 0.55, 0.58);
    bottle.add(label);
    const neckB = new THREE.Mesh(GEO.cyl, mat(0xcfe8f0, { transparent: true, opacity: 0.75, roughness: 0.1 }));
    neckB.scale.set(0.22, 0.5, 0.22);
    neckB.position.y = 1.35;
    bottle.add(neckB);
    const cap = new THREE.Mesh(GEO.cyl, mat(0x2e6ea5));
    cap.scale.set(0.24, 0.2, 0.24);
    cap.position.y = 1.68;
    bottle.add(cap);
    bottle.rotation.z = rand(-1.9, -1.3);
    bottle.position.y = 0.7;
    g.add(bottle);
  }
  g.add(dangerRing());
  g.add(shadowDisc(2));
  g.userData.radius = 2.2;
  g.userData.ring = g.children[g.children.length - 2];
  return g;
}

// ---------------------------------------------------------------------------
// Coletáveis: formas icônicas + glow — leitura imediata de "prêmio"
// ---------------------------------------------------------------------------
let starGeo = null;
function getStarGeo() {
  if (starGeo) return starGeo;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.85 : 0.38;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  shape.closePath();
  starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 });
  return starGeo;
}

let heartGeo = null;
function getHeartGeo() {
  if (heartGeo) return heartGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.6);
  s.bezierCurveTo(-1.0, 0.1, -0.55, 0.85, 0, 0.35);
  s.bezierCurveTo(0.55, 0.85, 1.0, 0.1, 0, -0.6);
  heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 1 });
  return heartGeo;
}

export function makeCollectible(kind) {
  const g = new THREE.Group();
  let glowColor = '#ffd23e';

  if (kind === 'gota') {
    glowColor = '#4ec8ff';
    const gm = mat(0x4ec8ff, { roughness: 0.1, metalness: 0.2, emissive: 0x1a78b8, emissiveIntensity: 0.7 });
    const b = new THREE.Mesh(GEO.sphere, gm);
    b.scale.set(0.5, 0.62, 0.5);
    g.add(b);
    const tip = new THREE.Mesh(GEO.cone, gm);
    tip.scale.set(0.42, 0.6, 0.42);
    tip.position.y = 0.72;
    g.add(tip);
  } else if (kind === 'semente') {
    glowColor = '#e8a53a';
    const b = new THREE.Mesh(GEO.blob, mat(0x8a5a2e, { roughness: 0.5, emissive: 0x5a3410, emissiveIntensity: 0.5 }));
    b.scale.set(0.5, 0.68, 0.45);
    g.add(b);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 16), mat(0xe8a53a, { emissive: 0xa86a1a, emissiveIntensity: 0.6 }));
    band.rotation.x = Math.PI / 2;
    g.add(band);
  } else if (kind === 'estrela') {
    glowColor = '#ffd23e';
    const star = new THREE.Mesh(getStarGeo(), mat(0xffd23e, {
      roughness: 0.15, metalness: 0.6, emissive: 0xc79510, emissiveIntensity: 0.9
    }));
    star.position.z = -0.12;
    g.add(star);
  } else if (kind === 'folha') {
    glowColor = '#6ee85a';
    const leaf = new THREE.Mesh(GEO.sphere, mat(0x53c23a, {
      roughness: 0.4, emissive: 0x1e7a12, emissiveIntensity: 0.55, side: THREE.DoubleSide
    }));
    leaf.scale.set(0.78, 0.1, 0.5);
    g.add(leaf);
    const vein = new THREE.Mesh(GEO.cyl, mat(0x2e8a1e));
    vein.scale.set(0.04, 0.05, 1.35);
    vein.rotation.x = Math.PI / 2;
    g.add(vein);
  } else {
    glowColor = '#ff5d6a';
    const heart = new THREE.Mesh(getHeartGeo(), mat(0xff4d5a, {
      roughness: 0.2, emissive: 0xa8101e, emissiveIntensity: 0.85
    }));
    heart.position.z = -0.15;
    g.add(heart);
  }

  const glow = makeGlowSprite(glowColor, 3.2);
  glow.material.opacity = 0.75;
  g.add(glow);
  const sh = shadowDisc(1);
  sh.position.y = -1.55; // grupo flutua a ~1,6m — sombra projeta na água
  g.add(sh);

  g.userData.radius = 1.9;
  g.userData.kind = kind;
  return g;
}
