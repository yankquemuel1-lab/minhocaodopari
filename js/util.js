// Utilitários: aleatórios, easing e uma timeline simples para cutscenes
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Ruído 2D suave (value noise) — usado para texturas procedurais e deslocamento
// orgânico de geometria (paredões, terreno, água), sem depender de libs externas.
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2D(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export const ease = {
  linear: (t) => t,
  inOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)
};

// Sequência de passos: [{ dur, start(), update(k), end() }]
export class Timeline {
  constructor(steps, onDone) {
    this.steps = steps;
    this.onDone = onDone;
    this.i = -1;
    this.t = 0;
    this.done = false;
    this._next();
  }

  _next() {
    this.i++;
    this.t = 0;
    const s = this.steps[this.i];
    if (!s) {
      this.done = true;
      if (this.onDone) this.onDone();
      return;
    }
    if (s.start) s.start();
  }

  update(dt) {
    if (this.done) return;
    const s = this.steps[this.i];
    this.t += dt;
    const k = clamp(this.t / s.dur, 0, 1);
    if (s.update) s.update(k);
    if (this.t >= s.dur) {
      if (s.end) s.end();
      this._next();
    }
  }

  skip() {
    // Pula para o fim de todos os passos
    while (!this.done) {
      const s = this.steps[this.i];
      if (s.update) s.update(1);
      if (s.end) s.end();
      this._next();
    }
  }
}
