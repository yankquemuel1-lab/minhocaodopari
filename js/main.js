// Minhocão do Pari 3D — orquestração: estados, input, UI e render
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeSky } from './scenery.js';
import { ExploreWorld } from './explore.js';
import { buildCutscene } from './cutscene.js';
import { RideWorld } from './ride.js';
import { enviarPontuacao, buscarTop10 } from './ranking.js';

const $ = (id) => document.getElementById(id);

// Diagnóstico: mostra erros fatais na tela de loading
window.addEventListener('error', (e) => {
  const el = document.getElementById('loading');
  if (el) {
    el.classList.remove('hidden');
    el.style.cssText += 'font-size:13px;white-space:pre-wrap;text-align:left;padding:40px;';
    const stack = (e.error && e.error.stack) ? e.error.stack.split('\n').slice(0, 8).join('\n') : '';
    el.textContent = 'Erro: ' + e.message + '\n' + stack;
  }
});

class App {
  constructor() {
    // ----- Render -----
    this.renderer = new THREE.WebGLRenderer({
      canvas: $('game-canvas'),
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf7c98f, 60, 380);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.camera.position.set(-30, 5, 40);

    // ----- Pós-processamento: bloom sutil no sol/água/itens brilhantes -----
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45,  // strength
      0.55,  // radius
      0.82   // threshold — só brilha o que já é bem claro (sol, glows, emissive)
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // ----- Luz dourada de fim de tarde -----
    const hemi = new THREE.HemisphereLight(0xffd9a0, 0x5a4630, 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 1.9);
    this.sun.position.set(40, 70, -60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.camera.far = 300;
    this.scene.add(this.sun);

    this.sky = makeSky();
    this.scene.add(this.sky);

    // ----- Estado -----
    this.state = 'menu';
    this.keys = {};
    this.shake = 0;
    this.waterUniforms = { uTime: { value: 0 } };
    this.dialogActive = false;
    this.cutsceneActive = false;
    this.paused = false;
    this.charStyle = 'boy';
    this.clock = new THREE.Clock();

    // Fade para transições
    this.fadeDiv = document.createElement('div');
    this.fadeDiv.style.cssText =
      'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .5s;z-index:25;';
    $('app').appendChild(this.fadeDiv);

    this.bindUI();
    this.bindInput();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    const rec = localStorage.getItem('minhocao3d_recorde');
    if (rec) $('menu-record').textContent = 'Recorde: ' + rec + ' pontos';

    // Atalho de debug: ?auto=1&char=girl&cena=ride entra direto no jogo
    const params = new URLSearchParams(location.search);
    if (params.get('auto')) this.startGame(params.get('char') || 'boy');

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    });
  }

  // ----------------------------------------------------------------
  bindUI() {
    document.querySelectorAll('.char-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = $('player-name');
        const nome = input.value.trim();
        if (!nome) {
          // Nome é obrigatório: é ele que entra no ranking
          input.classList.add('attention');
          input.focus();
          setTimeout(() => input.classList.remove('attention'), 900);
          return;
        }
        this.playerName = nome;
        this.startGame(btn.dataset.char);
      });
    });
    $('btn-restart').addEventListener('click', () => this.restartRide());
    $('btn-menu').addEventListener('click', () => location.reload());

    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-resume').addEventListener('click', () => this.resumeGame());
    // Sai sem chamar endRide()/publicarRanking() — nenhuma pontuação é registrada
    $('btn-pause-menu').addEventListener('click', () => location.reload());
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // digitando o nome
      const key = e.key.toLowerCase();
      this.keys[key] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();

      if (key === 'e' && this.state === 'explore' && this.nearNPC && !this.dialogActive && !this.paused) {
        this.startDialog();
      }
      if (key === ' ' && this.dialogActive && !this.paused) this.advanceDialog();
      if ((key === 'escape' || key === 'p') && !this.dialogActive) this.togglePause();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('pointerdown', () => {
      if (this.dialogActive && !this.paused) this.advanceDialog();
    });
  }

  // ----------------------------------------------------------------
  startGame(char) {
    this.charStyle = char;
    this.playerName = this.playerName || 'Teste'; // fallback só pro atalho ?auto=1
    this.nome = char === 'girl' ? 'Dandara' : 'Ben';
    $('screen-menu').classList.add('hidden');
    $('loading').classList.remove('hidden');

    setTimeout(() => {
      this.explore = new ExploreWorld(this, char);
      this.scene.add(this.explore.group);
      this.state = 'explore';
      $('loading').classList.add('hidden');
      $('btn-pause').classList.remove('hidden');

      // Objetivo inicial na tela
      const cap = $('cutscene-caption');
      cap.textContent = 'Ande com WASD ou setas até o pescador na beira do rio — siga a luz dourada ✦';
      cap.classList.remove('hidden');
      setTimeout(() => { if (this.state !== 'cutscene') cap.classList.add('hidden'); }, 8000);

      // Atalho de debug: ?cena=ride pula direto para a corrida
      const p = new URLSearchParams(location.search);
      if (p.get('cena') === 'ride') this.beginRide();
      if (p.get('cena') === 'cutscene') this.startCutscene();
      if (p.get('cena') === 'gameover') this.endRide(parseInt(p.get('pontos') || '42', 10));
      if (p.get('testpause')) this.pauseGame();
    }, 60);
  }

  // ----------------------------------------------------------------
  startDialog() {
    this.dialogActive = true;
    this.falas = [
      'Ô ' + this.nome + '! Chega mais, guri' + (this.charStyle === 'girl' ? 'a' : '') + '... Tô pescando aqui no Quilombo desde cedinho.',
      'Cê sentiu? A água tremeu três vez só hoje. Isso é sinal. Aqui embaixo mora o MINHOCÃO DO PARI, a cobra d\'água mais antiga de Mato Grosso.',
      'O povo diz que ele vira canoa e engole rede de pescador... mas eu sei da verdade: ele só tá é sozinho, faz mais de cem ano.',
      'Ele vai subir hoje. E quando subir, cê tem que ser RÁPIDO: pula no pescoço dele e agarra firme nas barba!',
      'Quem doma o Minhocão desce o rio até Cuiabá vendo o que ninguém nunca viu... Se prepara. Ele vem... AGORA!'
    ];
    this.falaIdx = 0;
    $('interact-hint').classList.add('hidden');
    $('dialog-box').classList.remove('hidden');
    this.showFala();
  }

  showFala() {
    const texto = this.falas[this.falaIdx];
    const el = $('dialog-text');
    el.textContent = '';
    this.typing = true;
    let i = 0;
    clearInterval(this.typeTimer);
    this.typeTimer = setInterval(() => {
      el.textContent = texto.slice(0, ++i);
      if (i >= texto.length) {
        this.typing = false;
        clearInterval(this.typeTimer);
      }
    }, 20);
  }

  advanceDialog() {
    if (this.typing) {
      clearInterval(this.typeTimer);
      $('dialog-text').textContent = this.falas[this.falaIdx];
      this.typing = false;
      return;
    }
    this.falaIdx++;
    if (this.falaIdx < this.falas.length) {
      this.showFala();
    } else {
      this.dialogActive = false;
      $('dialog-box').classList.add('hidden');
      this.startCutscene();
    }
  }

  // ----------------------------------------------------------------
  startCutscene() {
    this.state = 'cutscene';
    $('btn-pause').classList.add('hidden'); // sem pausa durante a cutscene roteirizada
    this.cutscene = buildCutscene(this, this.explore, () => this.beginRide());
  }

  beginRide() {
    // Fade rápido para a troca de mundo
    this.fadeDiv.style.opacity = 1;
    setTimeout(() => {
      this.scene.remove(this.explore.group);
      this.ride = new RideWorld(this, this.charStyle);
      this.scene.add(this.ride.group);
      this.state = 'ride';
      this.sun.castShadow = false; // performance na corrida

      $('hud').classList.remove('hidden');
      $('btn-pause').classList.remove('hidden');
      this.setScore(0);
      this.setVidas(3);
      this.setTrecho('Rio Quilombo — Chapada dos Guimarães');
      this.fadeDiv.style.opacity = 0;
    }, 550);
  }

  restartRide() {
    $('screen-gameover').classList.add('hidden');
    if (this.ride) this.ride.dispose();
    this.ride = new RideWorld(this, this.charStyle);
    this.scene.add(this.ride.group);
    this.scene.fog.color.set(0xf7c98f);
    this.state = 'ride';
    $('hud').classList.remove('hidden');
    $('btn-pause').classList.remove('hidden');
    this.setScore(0);
    this.setVidas(3);
    this.setTrecho('Rio Quilombo — Chapada dos Guimarães');
  }

  endRide(score) {
    this.state = 'gameover';
    $('hud').classList.add('hidden');
    $('btn-pause').classList.add('hidden');
    const rec = parseInt(localStorage.getItem('minhocao3d_recorde') || '0', 10);
    const isNew = score > rec;
    if (isNew) localStorage.setItem('minhocao3d_recorde', String(score));
    $('final-score').textContent = this.playerName + ': ' + score + ' pontos';
    $('final-record').textContent = isNew
      ? '★ NOVO RECORDE! ★'
      : 'Recorde: ' + Math.max(rec, score) + ' pontos';
    $('screen-gameover').classList.remove('hidden');
    this.publicarRanking(score);
  }

  // Envia a pontuação e redesenha o top 10 com medalhas
  async publicarRanking(score) {
    const list = $('ranking-list');
    list.innerHTML = '<li class="ranking-status">Registrando sua pontuação...</li>';

    const minha = await enviarPontuacao(this.playerName, score);
    const top = await buscarTop10();

    if (!top) {
      list.innerHTML = '<li class="ranking-status">Sem conexão — o ranking online está indisponível.</li>';
      return;
    }

    const MEDALHAS = ['🥇', '🥈', '🥉'];
    list.innerHTML = '';
    top.forEach((r, i) => {
      const li = document.createElement('li');
      const pos = MEDALHAS[i] || (i + 1) + 'º';
      li.innerHTML = '<span class="rk-pos">' + pos + '</span>' +
        '<span class="rk-nome"></span>' +
        '<span class="rk-pontos">' + r.pontos + '</span>';
      li.querySelector('.rk-nome').textContent = r.nome; // textContent: nome vem de fora, nunca como HTML
      if (minha && r.id === minha.id) li.classList.add('rk-eu');
      list.appendChild(li);
    });

    // Se o jogador não entrou no top 10, mostra a posição dele no fim
    if (minha && !top.some(r => r.id === minha.id)) {
      const li = document.createElement('li');
      li.className = 'rk-eu rk-fora';
      li.innerHTML = '<span class="rk-pos">—</span><span class="rk-nome"></span>' +
        '<span class="rk-pontos">' + score + '</span>';
      li.querySelector('.rk-nome').textContent = this.playerName + ' (você)';
      list.appendChild(li);
    }
  }

  // ----------------------------------------------------------------
  togglePause() {
    if (this.state !== 'explore' && this.state !== 'ride') return;
    if (this.dialogActive) return; // não pausa no meio da fala do Seu Maneca
    this.paused ? this.resumeGame() : this.pauseGame();
  }

  pauseGame() {
    this.paused = true;
    $('screen-pause').classList.remove('hidden');
  }

  resumeGame() {
    this.paused = false;
    $('screen-pause').classList.add('hidden');
  }

  // ----------------------------------------------------------------
  setScore(v) { $('hud-score').textContent = 'Pontos: ' + v; }
  setTrecho(v) { $('hud-trecho').textContent = v; }
  setVidas(v) { $('hud-vidas').textContent = '❤'.repeat(Math.max(0, v)); }

  flashDamage() {
    const f = $('damage-flash');
    f.style.opacity = 1;
    setTimeout(() => { f.style.opacity = 0; }, 180);
  }

  popup(txt, kind) {
    const el = document.createElement('div');
    el.className = 'score-pop' + (kind === 'heart' ? ' heart' : '');
    el.textContent = txt;
    el.style.left = (45 + Math.random() * 10) + '%';
    el.style.top = (48 + Math.random() * 10) + '%';
    $('popup-layer').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  // ----------------------------------------------------------------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // Pausado: consome o delta (evita salto de tempo ao voltar) mas não
    // avança nada do mundo — o frame continua sendo renderizado, congelado,
    // por trás do overlay de pausa.
    if (!this.paused) {
      this.waterUniforms.uTime.value = t;

      if (this.state === 'explore') {
        this.nearNPC = this.explore.update(dt, t);
        $('interact-hint').classList.toggle('hidden', !this.nearNPC || this.dialogActive);
      } else if (this.state === 'cutscene') {
        // Atalho de debug: ?cutfreeze=6.5 congela a cutscene nesse instante
        // (pra capturar screenshot de um momento exato em teste headless)
        if (this.cutFreezeAt === undefined) {
          const cf = new URLSearchParams(location.search).get('cutfreeze');
          this.cutFreezeAt = cf === null ? -1 : parseFloat(cf);
          this.cutT = 0;
        }
        let cdt = dt;
        if (this.cutFreezeAt >= 0) {
          if (this.cutT >= this.cutFreezeAt) cdt = 0;
          this.cutT += cdt;
        }
        this.cutscene.update(cdt, t);
      } else if (this.state === 'ride' || this.state === 'gameover') {
        if (this.ride && this.state === 'ride') this.ride.update(dt, t);
      }

      // Céu acompanha a câmera (horizonte estável)
      this.sky.position.copy(this.camera.position);

      // Tremor de câmera
      if (this.shake > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
      }
    }

    this.composer.render();
  }
}

new App();
