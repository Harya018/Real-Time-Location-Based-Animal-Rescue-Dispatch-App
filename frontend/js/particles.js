// =================================================
// PARTICLE SYSTEM - Animated background particles
// =================================================
class ParticleSystem {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animationId = null;

    this.options = {
      count: options.count || 50,
      color: options.color || 'rgba(99, 102, 241, 0.3)',
      maxSize: options.maxSize || 3,
      speed: options.speed || 0.5,
      connect: options.connect !== undefined ? options.connect : true,
      connectDistance: options.connectDistance || 120,
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = this.canvas.parentElement.offsetWidth;
    this.canvas.height = this.canvas.parentElement.offsetHeight;
  }

  init() {
    this.particles = [];
    for (let i = 0; i < this.options.count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        radius: Math.random() * this.options.maxSize + 0.5,
        vx: (Math.random() - 0.5) * this.options.speed,
        vy: (Math.random() - 0.5) * this.options.speed - 0.2, // bias upward (anti-gravity)
        opacity: Math.random() * 0.5 + 0.2,
      });
    }
    this.animate();
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach((p, i) => {
      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around
      if (p.x < 0) p.x = this.canvas.width;
      if (p.x > this.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.canvas.height;
      if (p.y > this.canvas.height) p.y = 0;

      // Draw
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = this.options.color.replace(/[\d.]+\)$/, `${p.opacity})`);
      this.ctx.fill();

      // Connections
      if (this.options.connect) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const p2 = this.particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < this.options.connectDistance) {
            this.ctx.beginPath();
            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.strokeStyle = this.options.color.replace(/[\d.]+\)$/, `${0.1 * (1 - dist / this.options.connectDistance)})`);
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
          }
        }
      }
    });

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }
}

window.ParticleSystem = ParticleSystem;
