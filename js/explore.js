// Exploração em 3ª pessoa na beira do Rio Quilombo (Chapada dos Guimarães)
import * as THREE from 'three';
import { rand, choice, clamp, lerp } from './util.js';
import { makeHumanoid, makeFishingRod, makeMinhocao } from './characters.js';
import * as SC from './scenery.js';

export class ExploreWorld {
  constructor(app, charStyle) {
    this.app = app;
    this.group = new THREE.Group();

    // ----- Terreno: margem gramada + faixa de areia -----
    // A borda direita do chão mergulha sob a água como um declive de praia
    // (worldX 5→9 desce até ~-1.5): fecha a fresta entre areia e rio sem o chão
    // plano cobrir a água por cima (que era o bug do Minhocão "na terra").
    const GROUND_OFFSET_X = -23; // -55..9 no mundo (água começa em 8; a borda já está submersa)
    const groundGeo = new THREE.PlaneGeometry(64, 180, 30, 60);
    {
      const pos = groundGeo.attributes.position;
      const colors = [];
      const grass = new THREE.Color(0x8a9a4a);
      const grass2 = new THREE.Color(0x74864a);
      const sand = new THREE.Color(0xe0c290);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i); // -32..32 (vira mundo x -55..9 após offset)
        const worldX = x + GROUND_OFFSET_X;
        const dip = Math.max(0, (worldX - 5) * 0.5); // declive submerso na beira
        pos.setZ(i, rand(0, 0.5) + Math.max(0, (-x - 20) * 0.08) - dip);
        const c = worldX > 2 ? sand : (Math.random() < 0.4 ? grass2 : grass);
        colors.push(c.r, c.g, c.b);
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      groundGeo.computeVertexNormals();
    }
    const groundTex = SC.tiledTexture(SC.terrainTexture(), 16, 45);
    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(GROUND_OFFSET_X, 0, 0);
    ground.receiveShadow = true;
    this.group.add(ground);

    // ----- Rio (x de 4 a 82: entra por baixo do declive da praia e da margem
    // oposta, para a linha d'água se formar na interseção, sem frestas) -----
    this.water = SC.makeWater(78, 180, app.waterUniforms);
    this.water.position.set(43, -0.35, 0);
    this.group.add(this.water);

    // Margem oposta
    const farBank = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 180),
      SC.texMat(0x6e8a3a, groundTex, { roughness: 0.95 })
    );
    farBank.rotation.x = -Math.PI / 2;
    farBank.position.set(95, 0.1, 0);
    this.group.add(farBank);

    // ----- Paredões -----
    const cliffBack = SC.makeCliff(180, 34);
    cliffBack.rotation.y = Math.PI / 2;
    cliffBack.position.set(-50, 0, -90);
    this.group.add(cliffBack);

    const cliffFar = SC.makeCliff(180, 42);
    cliffFar.rotation.y = -Math.PI / 2;
    cliffFar.position.set(108, 0, 90);
    this.group.add(cliffFar);

    const cliffNorth = SC.makeCliff(170, 38);
    cliffNorth.position.set(-50, 0, -86);
    this.group.add(cliffNorth);

    const cliffSouth = SC.makeCliff(170, 30);
    cliffSouth.position.set(-50, 0, 88);
    this.group.add(cliffSouth);

    // ----- Cachoeira ao fundo, caindo no rio -----
    this.waterfall = SC.makeWaterfall(26, 36, app.waterUniforms);
    this.waterfall.position.set(46, 0, -82);
    this.group.add(this.waterfall);

    // ----- Vegetação espalhada -----
    const treeTypes = ['cerrado', 'cerrado', 'ipe_yellow', 'ipe_purple', 'palm'];
    for (let i = 0; i < 34; i++) {
      const t = SC.makeTree(choice(treeTypes));
      t.position.set(rand(-46, -2), 0, rand(-78, 78));
      t.scale.setScalar(rand(0.8, 1.5));
      t.rotation.y = rand(0, Math.PI * 2);
      this.group.add(t);
    }
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rand(0.5, 1.6), 0),
        SC.texMat(0x9a8a78, SC.stoneTexture(), { roughness: 0.95, flatShading: true })
      );
      r.position.set(rand(-40, 6), 0.3, rand(-70, 70));
      this.group.add(r);
    }
    const capi = SC.makeCapivara();
    capi.position.set(-18, 0, -40);
    capi.rotation.y = 0.8;
    this.group.add(capi);

    // ----- Jogador -----
    this.player = makeHumanoid(charStyle);
    this.playerRoot = new THREE.Group();
    this.playerRoot.add(this.player.group);
    this.playerRoot.position.set(-22, 0, 30);
    this.playerRoot.rotation.y = -0.5;
    this.group.add(this.playerRoot);

    // ----- Seu Maneca pescando -----
    this.maneca = makeHumanoid('maneca');
    this.manecaRoot = new THREE.Group();
    this.manecaRoot.add(this.maneca.group);
    this.rod = makeFishingRod();
    this.manecaRoot.add(this.rod);
    this.manecaRoot.position.set(4.5, 0, -10);
    this.manecaRoot.rotation.y = Math.PI / 2; // olhando para o rio (+x)
    this.group.add(this.manecaRoot);

    // Marcador de objetivo flutuando sobre o Maneca
    this.marker = SC.makeMarker();
    this.marker.position.copy(this.manecaRoot.position);
    this.group.add(this.marker);

    // Balde e pedra ao lado do pescador
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      SC.texMat(0x9a8a78, SC.stoneTexture(), { roughness: 0.95, flatShading: true })
    );
    rock.scale.set(1.2, 0.7, 1.2);
    rock.position.set(3, 0.3, -12.5);
    this.group.add(rock);

    // ----- Minhocão escondido embaixo d'água (para a cutscene) -----
    this.minhocao = makeMinhocao();
    this.minhocao.group.position.set(40, -14, -10); // alinhado ao riseSpot da cutscene
    this.minhocao.group.rotation.y = Math.PI / 2; // cabeça voltada para a margem
    this.group.add(this.minhocao.group);

    this.walkT = 0;
    this.camGoal = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
  }

  // Movimento relativo à tela com câmera de ângulo FIXO — nunca perde a visão
  update(dt, t) {
    const app = this.app;
    const k = app.keys;
    const speed = 8;

    // Cima na tela = para longe da câmera (norte), direita = leste; sempre estável
    let mx = 0, mz = 0;
    if (k['w'] || k['arrowup']) mz -= 1;
    if (k['s'] || k['arrowdown']) mz += 1;
    if (k['a'] || k['arrowleft']) mx -= 1;
    if (k['d'] || k['arrowright']) mx += 1;

    const moving = (mx !== 0 || mz !== 0) && !app.dialogActive;

    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const p = this.playerRoot.position;
      p.x = clamp(p.x + mx * speed * dt, -42, 6.2);
      p.z = clamp(p.z + mz * speed * dt, -74, 74);
      // O personagem gira para a direção do movimento; a câmera NÃO gira junto
      const targetRot = Math.atan2(mx, mz);
      let d = targetRot - this.playerRoot.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.playerRoot.rotation.y += d * Math.min(1, dt * 10);
      this.walkT += dt;
      this.player.walk(this.walkT, 1);
    } else {
      this.player.idle(t);
    }

    // NPC idle + bóia da vara
    this.maneca.idle(t);
    this.maneca.parts.armR.rotation.x = -0.6 + Math.sin(t * 1.2) * 0.05;
    const float = this.rod.userData.float;
    float.position.y = -0.08 + Math.sin(t * 2.4) * 0.06;

    this.minhocao.update(t);

    // Marcador pulsando sobre o objetivo
    this.marker.userData.arrow.position.y = 3.4 + Math.sin(t * 3) * 0.35;
    this.marker.userData.arrow.rotation.y = t * 2;

    // Câmera fixa: sempre atrás/acima olhando para o norte (visão frontal estável)
    const p = this.playerRoot.position;
    this.camGoal.set(p.x * 0.85 - 2, 9, p.z + 13);
    app.camera.position.lerp(this.camGoal, Math.min(1, dt * 5));
    this.camLook.lerp(new THREE.Vector3(p.x, 1.8, p.z - 4), Math.min(1, dt * 7));
    app.camera.lookAt(this.camLook);

    // Proximidade do NPC
    const dist = p.distanceTo(this.manecaRoot.position);
    return dist < 5.5;
  }
}
