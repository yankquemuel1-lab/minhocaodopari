// Cutscene in-engine: o Minhocão surge do rio e o jogador pula no pescoço
import * as THREE from 'three';
import { Timeline, ease, lerp } from './util.js';

export function buildCutscene(app, world, onDone) {
  const cam = app.camera;
  const player = world.playerRoot;
  const serpent = world.minhocao;
  const caption = document.getElementById('cutscene-caption');

  const bankPoint = new THREE.Vector3(5.5, 0, -6);   // ponto na margem
  const riseSpot = new THREE.Vector3(40, 0, -10);    // onde o Minhocão emerge — fundo do rio, longe da praia
  const approachX = 17;                              // até onde ele nada para buscar o jogador (água ainda funda)
  const SWIM_Y = 1.3;                                // altura de "nado": corpo parcialmente submerso, cabeça de fora

  const camStart = cam.position.clone();
  const playerStart = player.position.clone();
  const playerStartRot = player.rotation.y;

  // Splash de partículas
  const splashGeo = new THREE.BufferGeometry();
  const N = 420;
  const positions = new Float32Array(N * 3);
  const vels = [];
  for (let i = 0; i < N; i++) {
    positions[i * 3] = riseSpot.x + (Math.random() - 0.5) * 6;
    positions[i * 3 + 1] = -1;
    positions[i * 3 + 2] = riseSpot.z + (Math.random() - 0.5) * 6;
    vels.push({
      x: (Math.random() - 0.5) * 11,
      y: 7 + Math.random() * 15,
      z: (Math.random() - 0.5) * 11
    });
  }
  splashGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const splash = new THREE.Points(splashGeo, new THREE.PointsMaterial({
    color: 0xdff4ff, size: 0.45, transparent: true, opacity: 0.95
  }));
  splash.visible = false;
  world.group.add(splash);

  let splashActive = false;
  let splashT = 0;

  // Anéis de ondulação na superfície (pressentimento)
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.09, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xeafcf8, transparent: true, opacity: 0, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(riseSpot.x, 0.15, riseSpot.z);
    world.group.add(ring);
    rings.push(ring);
  }

  // Bolhas subindo
  const bubbles = [];
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + Math.random() * 0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xeafcf8, transparent: true, opacity: 0, depthWrite: false })
    );
    b.position.set(riseSpot.x + (Math.random() - 0.5) * 4, -0.3, riseSpot.z + (Math.random() - 0.5) * 4);
    b.userData.speed = 0.8 + Math.random() * 1.4;
    b.userData.delay = Math.random() * 1.6;
    world.group.add(b);
    bubbles.push(b);
  }

  // Anel de espuma da explosão
  const foamRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.55, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 0.4, depthWrite: false })
  );
  foamRing.rotation.x = -Math.PI / 2;
  foamRing.scale.z = 0.4;
  foamRing.position.set(riseSpot.x, 0.25, riseSpot.z);
  world.group.add(foamRing);

  // Coluna d'água no momento da explosão
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 9, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd8f2f8, transparent: true, opacity: 0, roughness: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  column.position.set(riseSpot.x, 0, riseSpot.z);
  world.group.add(column);

  const cleanupFx = () => {
    rings.forEach(r => world.group.remove(r));
    bubbles.forEach(b => world.group.remove(b));
    world.group.remove(foamRing);
    world.group.remove(column);
  };

  function say(txt) { caption.textContent = txt; caption.classList.remove('hidden'); }

  const jumpFrom = new THREE.Vector3();
  const attachWorld = new THREE.Vector3();

  const tl = new Timeline([
    // 1 — pressentimento: câmera abre, água ondula, bolhas sobem
    {
      dur: 3.2,
      start: () => {
        app.cutsceneActive = true;
        say('As águas do Rio Quilombo começam a tremer...');
      },
      update: (k) => {
        const e = ease.inOut(Math.min(1, k * 1.3));
        cam.position.set(
          lerp(camStart.x, -4, e),
          lerp(camStart.y, 6.5, e),
          lerp(camStart.z, 12, e)
        );
        cam.lookAt(lerp(cam.position.x, riseSpot.x, 0.9), 1.5, riseSpot.z);

        // Anéis expandindo em sequência
        rings.forEach((r, i) => {
          const phase = ((k * 2.4 + i * 0.33) % 1);
          r.scale.setScalar(0.5 + phase * 7);
          r.material.opacity = (1 - phase) * 0.7 * Math.min(1, k * 3);
        });
        // Bolhas estourando na superfície
        bubbles.forEach((b) => {
          const bt = Math.max(0, k * 3.2 - b.userData.delay);
          if (bt <= 0) return;
          const cycle = (bt * b.userData.speed) % 1;
          b.position.y = -0.3 + cycle * 1.1;
          b.material.opacity = cycle < 0.85 ? 0.75 : (1 - cycle) * 5;
        });
        app.shake = k * 0.09;
      }
    },
    // 2 — a EXPLOSÃO: coluna d'água, anel de espuma, splash e o gigante
    {
      dur: 3.0,
      start: () => {
        say('O MINHOCÃO DO PARI!');
        splash.visible = true;
        splashActive = true;
        app.shake = 0.45;
        rings.forEach(r => { r.material.opacity = 0; });
        bubbles.forEach(b => { b.material.opacity = 0; });
      },
      update: (k) => {
        const e = ease.out(k);
        // Coluna d'água: sobe rápido e some
        const colK = Math.min(1, k * 2.5);
        column.scale.y = colK;
        column.position.y = colK * 4.5 - 2;
        column.material.opacity = (1 - Math.max(0, k * 1.8 - 0.55)) * 0.55;
        // Anel de espuma expandindo
        foamRing.scale.x = foamRing.scale.y = 1 + e * 10;
        foamRing.material.opacity = Math.max(0, 0.85 - k * 1.1);

        // Sobe com pico dramático no meio da explosão, mas assenta na altura de
        // nado (corpo parcialmente submerso) — não pode terminar pairando no ar
        const peak = Math.sin(Math.min(1, k * 1.3) * Math.PI) * 3.2;
        serpent.group.position.set(riseSpot.x, lerp(-14, SWIM_Y, e) + peak, riseSpot.z);
        serpent.group.rotation.z = Math.sin(k * 16) * 0.07 * (1 - k);
        serpent.headG.rotation.x = lerp(0.8, 0.02, e);
        cam.lookAt(riseSpot.x, lerp(0, 7, e), riseSpot.z);
        app.shake = 0.45 * (1 - k) + 0.05;
      },
      end: () => { app.shake = 0; }
    },
    // 3 — jogador corre até a beira
    {
      dur: 1.8,
      start: () => {
        say('Seja rápido! PULA no pescoço dele!');
        player.lookAt(bankPoint.x, 0, bankPoint.z);
      },
      update: (k) => {
        const e = ease.inOut(k);
        player.position.set(
          lerp(playerStart.x, bankPoint.x, e),
          0,
          lerp(playerStart.z, bankPoint.z, e)
        );
        world.player.walk(k * 14, 1);
        // O Minhocão nada do meio do rio até perto da margem, serpenteando na água
        serpent.group.position.x = lerp(riseSpot.x, approachX, e);
        serpent.group.position.y = SWIM_Y + Math.sin(k * 7) * 0.15;
        const p = player.position;
        cam.position.set(p.x - 6, 4.5, p.z + 9);
        cam.lookAt(serpent.group.position.x, 3, serpent.group.position.z);
      }
    },
    // 4 — o pulo!
    {
      dur: 1.5,
      start: () => {
        say('Você salta e agarra as barbas do gigante!');
        jumpFrom.copy(player.position);
        serpent.attach.getWorldPosition(attachWorld);
        world.player.ridePose();
      },
      update: (k) => {
        const e = ease.inOut(k);
        serpent.attach.getWorldPosition(attachWorld);
        player.position.set(
          lerp(jumpFrom.x, attachWorld.x, e),
          lerp(0, attachWorld.y, e) + Math.sin(k * Math.PI) * 4.5,
          lerp(jumpFrom.z, attachWorld.z, e)
        );
        player.rotation.y = lerp(playerStartRot, Math.PI / 2, e);
        cam.position.set(player.position.x - 8, player.position.y + 2.5, player.position.z + 8);
        cam.lookAt(player.position);
      },
      end: () => {
        // Prende o jogador no pescoço do Minhocão
        world.group.remove(player);
        serpent.attach.add(player);
        player.position.set(0, 0, 0);
        player.rotation.set(0, Math.PI, 0); // olhando para a frente do Minhocão
      }
    },
    // 5 — câmera assume o POV e o Minhocão parte
    {
      dur: 2.2,
      start: () => { say('SEGURA! A jornada rio abaixo começou!'); },
      update: (k) => {
        const e = ease.inOut(k);
        serpent.attach.getWorldPosition(attachWorld);
        // Câmera desliza para trás do jogador (posição de POV da corrida)
        const povX = attachWorld.x - 3.2 * (1 - e) * 3;
        cam.position.set(
          lerp(cam.position.x, attachWorld.x, Math.min(1, e * 1.6)),
          lerp(cam.position.y, attachWorld.y + 2.1, e),
          lerp(cam.position.z, attachWorld.z + 3.4, e)
        );
        const fwd = new THREE.Vector3(0, 0, -30).applyQuaternion(serpent.group.quaternion);
        cam.lookAt(attachWorld.x + fwd.x * e, attachWorld.y + 1 - e * 2, attachWorld.z + fwd.z * e);
      }
    }
  ], () => {
    caption.classList.add('hidden');
    splash.visible = false;
    cleanupFx();
    onDone();
  });

  return {
    update(dt, t) {
      tl.update(dt);
      serpent.update(t);
      if (splashActive) {
        splashT += dt;
        const pos = splashGeo.attributes.position;
        for (let i = 0; i < N; i++) {
          const v = vels[i];
          pos.setX(i, pos.getX(i) + v.x * dt);
          pos.setY(i, pos.getY(i) + v.y * dt);
          pos.setZ(i, pos.getZ(i) + v.z * dt);
          v.y -= 22 * dt;
        }
        pos.needsUpdate = true;
        splash.material.opacity = Math.max(0, 0.95 - splashT * 0.45);
        if (splashT > 2.4) splashActive = false;
      }
    }
  };
}
