// =================================================
// ANTI-GRAVITY EFFECTS - Physics-based UI interactions
// =================================================

class AntiGravity {
  constructor() {
    this.magneticButtons = [];
    this.init();
  }

  init() {
    // Magnetic buttons — gently pull toward cursor
    document.querySelectorAll('.magnetic-btn').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => this.magneticPull(e, btn));
      btn.addEventListener('mouseleave', () => this.magneticReset(btn));
    });

    // Gyroscope tilt effect for cards (mobile)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => this.gyroTilt(e));
    }

    // Parallax on mouse move (desktop)
    document.addEventListener('mousemove', (e) => this.parallaxMove(e));
  }

  // Magnetic pull — button moves gently toward cursor
  magneticPull(e, btn) {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * 0.15;
    const dy = (e.clientY - cy) * 0.15;
    btn.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  magneticReset(btn) {
    btn.style.transform = 'translate(0, 0)';
  }

  // Gyroscope tilt effect for floating cards
  gyroTilt(e) {
    const tiltX = (e.gamma / 90) * 5; // left-right
    const tiltY = (e.beta / 180) * 5;  // front-back
    document.querySelectorAll('.incident-card, .request-asteroid').forEach((card) => {
      card.style.transform = `perspective(500px) rotateY(${tiltX}deg) rotateX(${-tiltY}deg)`;
    });
  }

  // Desktop parallax on mouse move
  parallaxMove(e) {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    document.querySelectorAll('.antigravity-float').forEach((el, i) => {
      const speed = (i % 3 + 1) * 0.5;
      const offsetX = x * speed;
      const offsetY = y * speed;
      el.style.setProperty('--parallax-x', `${offsetX}px`);
      el.style.setProperty('--parallax-y', `${offsetY}px`);
    });
  }

  // Gravity well effect — elements pull toward a point
  static gravityWell(element, x, y, strength = 0.3) {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (x - cx) * strength;
    const dy = (y - cy) * strength;
    element.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Floating animation with random offset
  static addFloat(element, amplitude = 8, duration = 3) {
    const delay = Math.random() * 2;
    element.style.animation = `antigravityFloat ${duration}s ease-in-out ${delay}s infinite`;
  }
}

window.AntiGravity = AntiGravity;
