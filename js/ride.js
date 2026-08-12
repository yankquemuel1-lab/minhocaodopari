// Corrida POV: descendo o rio montado no pescoço do Minhocão
import * as THREE from 'three';
import { rand, randInt, choice, clamp, lerp } from './util.js';
import { makeHumanoid, makeMinhocao } from './characters.js';
import * as SC from './scenery.js';

const CHUNK_LEN = 90;
const AHEAD = 8;         // chunks à frente
const RIVER_HALF = 24;   // meia largura navegável
const MIN_GATE_GAP = 110; // distância mínima entre dois portões — dá espaço de manobra
const GATE_CLEAR = 16;    // raio (em z) ao redor do portão livre de obstáculos soltos

const BIOMES = {
  chapada: {
    nome: 'Rio Quilombo — Chapada dos Guimarães',
    fog: new THREE.Color(0xf7c98f),
    water: new THREE.Color(0x2ec4b6),
    ground: 0xc98a4a
  },
  cerrado: {
    nome: 'Rio Manso — Cerrado',
    fog: new THREE.Color(0xffe0a8),
    water: new THREE.Color(0x35b8a0),
    ground: 0xa8973f
  },
  pantanal: {
    nome: 'Encontro das Águas — Pantanal',
    fog: new THREE.Color(0xcfe4b8),
    water: new THREE.Color(0x2ea886),
    ground: 0x5d8a4a
  },
  cuiaba: {
    nome: 'Rio Cuiabá — Cidade de Cuiabá',
    fog: new THREE.Color(0xe0c9ae),
    water: new THREE.Color(0x3a9aa0),
    ground: 0xb0a898
  }
};

// Sequência de trechos: Chapada e depois ciclo cerrado→pantanal→cidade→pantanal
function biomeAt(dist) {
  if (dist < 600) return 'chapada';
  const cycle = ['cerrado', 'pantanal', 'cuiaba', 'pantanal'];
  const seg = Math.floor((dist - 600) / 700);
  return cycle[seg % cycle.length];
}

export class RideWorld {
  constructor(app, charStyle) {
    this.app = app;
    this.group = new THREE.Group();

    // Água contínua que acompanha a câmera
    this.water = SC.makeWater(140, 700, app.waterUniforms);
    this.water.position.y = -0.35;
    this.group.add(this.water);

    // Leito distante nas laterais (base sob os cenários)
    this.sideBase = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 700),
      SC.texMat(0x8a7455, SC.tiledTexture(SC.terrainTexture(), 100, 175), { roughness: 1 })
    );
    // Textura das margens por chunk — instância própria (repeat menor, criada
    // uma única vez e reaproveitada em todo spawnChunk, nunca clonada por chunk).
    this.bankTex = SC.tiledTexture(SC.terrainTexture(), 10, 20);
    this.sideBase.rotation.x = -Math.PI / 2;
    this.sideBase.position.y = -2.6;
    this.group.add(this.sideBase);

    // Espuma nas margens do rio
    this.foamL = SC.makeFoamStrip(700, app.waterUniforms);
    this.foamL.position.set(-RIVER_HALF + 0.4, -0.08, 0);
    this.group.add(this.foamL);
    this.foamR = SC.makeFoamStrip(700, app.waterUniforms);
    this.foamR.position.set(RIVER_HALF - 0.4, -0.08, 0);
    this.group.add(this.foamR);

    // Spray de água no pescoço do Minhocão
    const sprayN = 90;
    const sprayPos = new Float32Array(sprayN * 3);
    this.sprayParts = [];
    for (let i = 0; i < sprayN; i++) {
      this.sprayParts.push({ life: Math.random(), vx: 0, vy: 0, vz: 0 });
      sprayPos[i * 3 + 1] = -10;
    }
    this.sprayGeo = new THREE.BufferGeometry();
    this.sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    this.spray = new THREE.Points(this.sprayGeo, new THREE.PointsMaterial({
      color: 0xeafcf8, size: 0.32, transparent: true, opacity: 0.8, depthWrite: false
    }));
    this.group.add(this.spray);

    // Minhocão + jogador montado
    this.serpent = makeMinhocao();
    this.group.add(this.serpent.group);

    this.player = makeHumanoid(charStyle);
    this.player.ridePose();
    this.player.group.rotation.y = Math.PI;
    this.serpent.attach.add(this.player.group);

    // Estado
    this.dist = 0;
    this.score = 0;
    this.vidas = 3;
    this.maxVidas = 5;
    this.level = 1;
    this.invuln = 0;
    this.gameOver = false;
    this.targetX = 0;
    this.curX = 0;
    this.distAcc = 0;
    this.biome = 'chapada';
    this.diveT = -1;
    this.rideT = 0; // tempo desde o início da corrida — usado na largada suave

    this.chunks = [];
    this.frontierZ = 60; // próximo chunk começa aqui e cresce para -z
    this.lastGateZ = null; // controla o espaçamento mínimo entre portões

    for (let i = 0; i < AHEAD; i++) this.spawnChunk();

    this.headWorld = new THREE.Vector3();
    this.attachWorld = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  // ------------------------------------------------------------------
  spawnChunk() {
    const z0 = this.frontierZ - CHUNK_LEN; // chunk cobre [z0, z0+CHUNK_LEN]
    this.frontierZ = z0;
    const distHere = Math.max(0, -z0);
    const biome = biomeAt(distHere);
    const B = BIOMES[biome];

    const g = new THREE.Group();
    const obstacles = [];
    const items = [];

    // Margens
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(
        new THREE.PlaneGeometry(46, CHUNK_LEN),
        SC.texMat(B.ground, this.bankTex, { roughness: 0.95 })
      );
      bank.rotation.x = -Math.PI / 2;
      bank.position.set(side * (RIVER_HALF + 24), -0.1, z0 + CHUNK_LEN / 2);
      g.add(bank);
    }

    // Cenário por bioma
    if (biome === 'chapada') {
      for (const side of [-1, 1]) {
        const cliff = SC.makeCliff(CHUNK_LEN, rand(26, 40));
        cliff.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        cliff.position.set(side * (RIVER_HALF + 22), 0, side === -1 ? z0 : z0 + CHUNK_LEN);
        g.add(cliff);
        if (Math.random() < 0.3) {
          const wf = SC.makeWaterfall(rand(8, 14), rand(20, 30), this.app.waterUniforms);
          wf.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
          wf.position.set(side * (RIVER_HALF + 14), 0, z0 + rand(15, 75));
          g.add(wf);
        }
        for (let i = 0; i < 3; i++) {
          const t = SC.makeTree('palm');
          t.position.set(side * rand(RIVER_HALF + 3, RIVER_HALF + 12), 0, z0 + rand(0, CHUNK_LEN));
          g.add(t);
        }
      }
    } else if (biome === 'cerrado') {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const t = SC.makeTree(choice(['cerrado', 'cerrado', 'ipe_yellow', 'ipe_purple']));
          t.position.set(side * rand(RIVER_HALF + 3, RIVER_HALF + 34), 0, z0 + rand(0, CHUNK_LEN));
          t.scale.setScalar(rand(0.8, 1.6));
          g.add(t);
        }
        for (let i = 0; i < 3; i++) {
          const m = SC.makeTermiteMound();
          m.position.set(side * rand(RIVER_HALF + 4, RIVER_HALF + 26), 0, z0 + rand(0, CHUNK_LEN));
          g.add(m);
        }
      }
    } else if (biome === 'pantanal') {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const t = SC.makeTree(choice(['twisted', 'twisted', 'palm']));
          t.position.set(side * rand(RIVER_HALF + 3, RIVER_HALF + 30), 0, z0 + rand(0, CHUNK_LEN));
          g.add(t);
        }
        if (Math.random() < 0.6) {
          const b = SC.makeBird();
          b.position.set(side * rand(RIVER_HALF - 4, RIVER_HALF + 6), 0, z0 + rand(0, CHUNK_LEN));
          b.rotation.y = rand(0, Math.PI * 2);
          g.add(b);
        }
        if (Math.random() < 0.5) {
          const c = SC.makeCapivara();
          c.position.set(side * rand(RIVER_HALF + 2, RIVER_HALF + 10), 0, z0 + rand(0, CHUNK_LEN));
          c.rotation.y = rand(0, Math.PI * 2);
          g.add(c);
        }
      }
      // Vitórias-régias na beirada
      for (let i = 0; i < 6; i++) {
        const lily = new THREE.Mesh(
          new THREE.CylinderGeometry(rand(0.8, 1.6), rand(0.8, 1.6), 0.08, 12),
          new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.7 })
        );
        lily.position.set(choice([-1, 1]) * rand(RIVER_HALF - 6, RIVER_HALF - 1), -0.25, z0 + rand(0, CHUNK_LEN));
        g.add(lily);
      }
    } else {
      // Cuiabá
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const b = SC.makeBuilding();
          b.position.set(side * rand(RIVER_HALF + 8, RIVER_HALF + 40), 0, z0 + i * (CHUNK_LEN / 5) + rand(2, 10));
          g.add(b);
        }
        for (let i = 0; i < 2; i++) {
          const t = SC.makeTree('palm');
          t.position.set(side * rand(RIVER_HALF + 2, RIVER_HALF + 7), 0, z0 + rand(0, CHUNK_LEN));
          g.add(t);
        }
      }
      if (Math.random() < 0.55) {
        const bridge = SC.makeBridge(130);
        bridge.position.set(0, 0, z0 + rand(20, 70));
        g.add(bridge);
      }
    }

    // Obstáculos e coletáveis (só depois da largada)
    if (distHere > 40) {
      const lvl = this.level;
      const kindsPool = biome === 'pantanal'
        ? ['pedra', 'raiz', 'lixo', 'garrafa', 'piranha', 'jacare', 'jacare']
        : ['pedra', 'raiz', 'lixo', 'garrafa', 'piranha'];
      const addObstacle = (x, z, mover) => {
        const o = SC.makeObstacle(choice(kindsPool));
        o.position.set(x, 0, z);
        o.userData.phase = rand(0, 6);
        // Obstáculos móveis a partir do nível 2
        if (mover) o.userData.vx = choice([-1, 1]) * rand(2.5, 4 + lvl * 0.5);
        g.add(o);
        obstacles.push(o);
      };

      // "Portão" decidido ANTES dos obstáculos soltos — reserva uma faixa livre
      // ao redor dele, senão obstáculos soltos podem cercar a brecha por todo
      // lado e tornar a passagem impossível (sem espaço pra se alinhar a tempo).
      let gate = null;
      const gateZCandidate = z0 + rand(18, CHUNK_LEN - 18);
      const farFromLastGate = this.lastGateZ === null || (this.lastGateZ - gateZCandidate) >= MIN_GATE_GAP;
      if (lvl >= 2 && farFromLastGate && Math.random() < Math.min(0.8, 0.25 + lvl * 0.1)) {
        gate = {
          z: gateZCandidate,
          gapX: rand(-RIVER_HALF + 6, RIVER_HALF - 6),
          gapW: Math.max(8, 13 - lvl * 0.7) // brecha encolhe com o nível, mais devagar que antes
        };
        this.lastGateZ = gateZCandidate;
      }

      // Obstáculos soltos — quantidade cresce com o nível, evitando a faixa do portão
      const nObs = Math.min(8, 3 + Math.floor(lvl * 0.9));
      let placed = 0, tries = 0;
      while (placed < nObs && tries < nObs * 4) {
        tries++;
        const z = z0 + rand(4, CHUNK_LEN - 4);
        if (gate && Math.abs(z - gate.z) < GATE_CLEAR) continue;
        const mover = lvl >= 2 && Math.random() < 0.3;
        addObstacle(rand(-RIVER_HALF + 3, RIVER_HALF - 3), z, mover);
        placed++;
      }

      // Fileira do portão em si, com a brecha reservada
      if (gate) {
        for (let x = -RIVER_HALF + 3; x <= RIVER_HALF - 3; x += 4.6) {
          if (Math.abs(x - gate.gapX) > gate.gapW / 2) {
            addObstacle(x + rand(-0.8, 0.8), gate.z + rand(-2, 2), false);
          }
        }
        // Recompensa na brecha: atravessar bem dá pontos
        const prize = SC.makeCollectible(Math.random() < 0.3 ? 'estrela' : 'gota');
        prize.position.set(gate.gapX, 1.6, gate.z);
        prize.userData.phase = rand(0, 6);
        g.add(prize);
        items.push(prize);
      }

      const nItems = 3;
      for (let i = 0; i < nItems; i++) {
        const kinds = ['gota', 'gota', 'folha', 'semente', 'estrela'];
        if (Math.random() < 0.06) kinds.push('coracao');
        const it = SC.makeCollectible(choice(kinds));
        it.position.set(rand(-RIVER_HALF + 3, RIVER_HALF - 3), 1.6, z0 + rand(4, CHUNK_LEN - 4));
        it.userData.phase = rand(0, 6);
        g.add(it);
        items.push(it);
      }
    }

    this.group.add(g);
    this.chunks.push({ group: g, z0, obstacles, items, biome });
  }

  // ------------------------------------------------------------------
  update(dt, t) {
    const app = this.app;
    const S = this.serpent;

    if (this.gameOver) {
      // Mergulho final
      this.diveT += dt;
      S.group.position.y = lerp(S.group.position.y, -16, dt * 1.4);
      S.group.rotation.x = lerp(S.group.rotation.x, 0.55, dt * 2);
      S.group.position.z -= 14 * dt;
      this.updateCamera(dt, t);
      if (this.diveT > 1.6) {
        app.endRide(this.score);
      }
      return;
    }

    this.rideT += dt;
    const speed = this.getSpeed();

    // Direção
    const k = app.keys;
    let steer = 0;
    if (k['a'] || k['arrowleft']) steer -= 1;
    if (k['d'] || k['arrowright']) steer += 1;
    this.targetX = clamp(this.targetX + steer * 36 * dt, -RIVER_HALF + 3, RIVER_HALF - 3);
    this.curX = lerp(this.curX, this.targetX, Math.min(1, dt * 3.8));

    // Avanço
    S.group.position.z -= speed * dt;
    S.group.position.x = this.curX;
    S.group.position.y = Math.sin(t * 2.2) * 0.25;
    S.group.rotation.z = clamp((this.targetX - this.curX) * -0.06, -0.3, 0.3);
    S.group.rotation.y = clamp((this.targetX - this.curX) * -0.02, -0.12, 0.12);
    S.update(t);
    this.dist += speed * dt;

    // Água, base e espuma acompanham
    this.water.position.z = S.group.position.z - 220;
    this.sideBase.position.z = S.group.position.z - 220;
    this.foamL.position.z = S.group.position.z - 220;
    this.foamR.position.z = S.group.position.z - 220;
    this.water.material.color.lerp(BIOMES[this.biome].water, dt * 0.8);

    // Spray de água nas laterais do pescoço
    {
      const pos = this.sprayGeo.attributes.position;
      for (let i = 0; i < this.sprayParts.length; i++) {
        const p = this.sprayParts[i];
        p.life -= dt * 1.8;
        if (p.life <= 0) {
          p.life = 0.5 + Math.random() * 0.5;
          const side = Math.random() < 0.5 ? -1 : 1;
          pos.setXYZ(i,
            S.group.position.x + side * (1.1 + Math.random() * 0.5),
            S.group.position.y + 0.1,
            S.group.position.z + Math.random() * 2
          );
          p.vx = side * (1.5 + Math.random() * 2.5);
          p.vy = 2.5 + Math.random() * 3.5;
          p.vz = speed * 0.35 + Math.random() * 3;
        } else {
          p.vy -= 14 * dt;
          pos.setXYZ(i, pos.getX(i) + p.vx * dt, pos.getY(i) + p.vy * dt, pos.getZ(i) + p.vz * dt);
        }
      }
      pos.needsUpdate = true;
    }

    // Bioma / névoa / HUD
    const b = biomeAt(this.dist);
    if (b !== this.biome) {
      this.biome = b;
      app.setTrecho(BIOMES[b].nome);
    }
    app.scene.fog.color.lerp(BIOMES[this.biome].fog, dt * 0.7);

    // Gerenciamento de chunks
    while (this.frontierZ > S.group.position.z - AHEAD * CHUNK_LEN) this.spawnChunk();
    while (this.chunks.length && this.chunks[0].z0 > S.group.position.z + 80) {
      const old = this.chunks.shift();
      this.group.remove(old.group);
    }

    // Posição da cabeça no mundo (ponto de colisão)
    this.headWorld.set(S.group.position.x, S.group.position.y + 0.6, S.group.position.z - 1.6);

    // Colisões e animação dos itens
    for (const chunk of this.chunks) {
      if (chunk.z0 > S.group.position.z + 20 || chunk.z0 + CHUNK_LEN < S.group.position.z - 40) continue;

      for (let i = chunk.obstacles.length - 1; i >= 0; i--) {
        const o = chunk.obstacles[i];
        o.position.y = Math.sin(t * 1.8 + o.userData.phase) * 0.12;
        // Obstáculos móveis: deriva lateral quicando nas margens
        if (o.userData.vx) {
          o.position.x += o.userData.vx * dt;
          if (o.position.x > RIVER_HALF - 2.5 || o.position.x < -RIVER_HALF + 2.5) {
            o.userData.vx *= -1;
            o.position.x = clamp(o.position.x, -RIVER_HALF + 2.5, RIVER_HALF - 2.5);
          }
        }
        // Anel de perigo pulsando
        if (o.userData.ring) {
          const pulse = 1 + Math.sin(t * 5 + o.userData.phase) * 0.15;
          o.userData.ring.scale.setScalar(pulse);
        }
        if (this.invuln <= 0 && this.headWorld.distanceTo(o.position) < o.userData.radius + 1.7) {
          chunk.group.remove(o);
          chunk.obstacles.splice(i, 1);
          this.hit();
        }
      }
      for (let i = chunk.items.length - 1; i >= 0; i--) {
        const it = chunk.items[i];
        it.rotation.y += dt * 2.5;
        it.position.y = 1.6 + Math.sin(t * 2.2 + it.userData.phase) * 0.35;
        if (this.headWorld.distanceTo(it.position) < it.userData.radius + 2.1) {
          chunk.group.remove(it);
          chunk.items.splice(i, 1);
          this.collect(it.userData.kind);
        }
      }
    }

    // Invulnerabilidade piscando
    if (this.invuln > 0) {
      this.invuln -= dt;
      const blink = Math.sin(this.invuln * 24) > 0;
      S.headG.visible = blink;
      this.player.group.visible = blink;
      if (this.invuln <= 0) {
        S.headG.visible = true;
        this.player.group.visible = true;
      }
    }

    // Pontos por distância
    this.distAcc += speed * dt;
    if (this.distAcc >= 8) {
      this.score += Math.floor(this.distAcc / 8);
      this.distAcc %= 8;
      this.checkLevel();
      app.setScore(this.score);
    }

    this.updateCamera(dt, t);
  }

  updateCamera(dt, t) {
    const cam = this.app.camera;
    this.serpent.attach.getWorldPosition(this.attachWorld);
    // POV: logo atrás e acima do jogador montado — visão ampla do rio
    const goal = this.tmp.set(
      this.attachWorld.x,
      this.attachWorld.y + 2.5 + Math.sin(t * 2.2) * 0.08,
      this.attachWorld.z + 3.1
    );
    cam.position.lerp(goal, Math.min(1, dt * 10));
    cam.lookAt(
      this.serpent.group.position.x * 0.85,
      this.attachWorld.y - 0.4,
      this.attachWorld.z - 42
    );

    // Inclinação nas curvas (lean)
    const lean = (this.targetX - this.curX) * 0.014;
    cam.rotateZ(-lean);

    // FOV abre com a velocidade — sensação de aceleração
    const speed = this.getSpeed();
    const targetFov = 72 + (speed - 17) * 0.34;
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 2);
      cam.updateProjectionMatrix();
    }
  }

  // Velocidade atual: largada suave nos primeiros 30s (nem lenta demais, nem
  // rápida demais de cara), depois segue a progressão normal por nível/distância.
  getSpeed() {
    const RAMP_TIME = 30;
    const rampT = Math.min(1, this.rideT / RAMP_TIME);
    const rampEase = rampT * rampT * (3 - 2 * rampT); // smoothstep
    const baseSpeed = lerp(12, 21, rampEase);
    return Math.min(60, baseSpeed + this.level * 3.4 + this.dist * 0.0018);
  }

  checkLevel() {
    const lvl = Math.floor(this.score / 500) + 1;
    if (lvl > this.level) {
      this.level = lvl;
      this.app.popup('NÍVEL ' + lvl + '!', 'gold');
    }
  }

  collect(kind) {
    const pts = { gota: 10, folha: 15, semente: 20, estrela: 50 }[kind];
    if (kind === 'coracao') {
      if (this.vidas < this.maxVidas) {
        this.vidas++;
        this.app.setVidas(this.vidas);
        this.app.popup('+1 vida!', 'heart');
      } else {
        this.score += 25;
        this.app.popup('+25', 'gold');
      }
    } else {
      this.score += pts;
      this.app.popup('+' + pts, 'gold');
    }
    this.app.setScore(this.score);
    this.checkLevel();
  }

  hit() {
    this.vidas--;
    this.app.setVidas(this.vidas);
    this.app.flashDamage();
    this.app.shake = 0.4;
    setTimeout(() => { this.app.shake = 0; }, 260);
    if (this.vidas <= 0) {
      this.gameOver = true;
      this.diveT = 0;
    } else {
      this.invuln = 1.1;
    }
  }

  dispose() {
    this.app.scene.remove(this.group);
  }
}
