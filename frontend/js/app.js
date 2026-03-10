// =================================================
// APP BOOTSTRAP - Main entry point & screen manager
// =================================================

class App {
  constructor() {
    this.userId = 'user-' + Math.random().toString(36).substr(2, 9);
    this.currentScreen = 'splash';
    this.role = null;
    this.socket = null;
    this.citizenMode = null;
    this.rescuerMode = null;
    this.healthPassport = null;
    this.toastContainer = null;
  }

  init() {
    // Create toast container
    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'toast-container';
    document.body.appendChild(this.toastContainer);

    // Connect Socket.IO
    this.socket = new SocketClient();
    this.socket.connect();

    // Initialize Anti-Gravity effects
    new AntiGravity();

    // Initialize Live Background Wallpaper
    if (window.LiveBackground) {
      new LiveBackground('live-wallpaper');
    }

    // Run splash screen
    this.runSplash();

    // Initialize Health Passport (accessible from all modes)
    this.healthPassport = new HealthPassport(this);
    this.healthPassport.init();
  }

  // ===== SPLASH SCREEN =====
  runSplash() {
    // Start particle system
    const splashParticles = new ParticleSystem('splash-particles', {
      count: 40,
      color: 'rgba(99, 102, 241, 0.4)',
      maxSize: 2,
      speed: 0.3,
    });
    splashParticles.init();

    // Animate energy bar
    const fill = document.getElementById('energy-fill');
    const status = document.getElementById('splash-status');
    const statusMessages = [
      'Initializing Neural Network...',
      'Connecting to Satellite Uplink...',
      'Calibrating Anti-Gravity Sensors...',
      'Fetching Real-Time Distress Signals...',
      'Synthesizing Quantum Rescue Patterns...',
      'Synchronizing Dispatch Core...',
      'Welcome to PawGuard.'
    ];

    let progress = 0;
    const interval = setInterval(() => {
      progress += 1.5; // Slightly slower for better feel
      if (fill) fill.style.width = progress + '%';

      // Update status text based on progress
      if (status) {
        const msgIndex = Math.floor((progress / 100) * statusMessages.length);
        if (statusMessages[msgIndex]) status.textContent = statusMessages[msgIndex];
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          splashParticles.destroy();
          this.showScreen('role-screen');
        }, 800);
      }
    }, 40);
  }

  // ===== SCREEN MANAGEMENT =====
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
      this.currentScreen = screenId;
    }

    // Initialize screen-specific logic
    if (screenId === 'role-screen') {
      this.initRoleSelect();
    }
  }

  initRoleSelect() {
    // Start particles
    const roleParticles = new ParticleSystem('role-particles', {
      count: 30,
      color: 'rgba(139, 92, 246, 0.3)',
      maxSize: 2.5,
      speed: 0.2,
    });
    roleParticles.init();

    // Role card click handlers
    document.querySelectorAll('.role-card').forEach((card) => {
      card.addEventListener('click', () => {
        const role = card.dataset.role;
        this.role = role;
        
        console.log('[App] Switching to role:', role);
        roleParticles.destroy();

        if (role === 'citizen') {
          this.showScreen('citizen-screen');
          this.citizenMode = new CitizenMode(this);
          this.citizenMode.init();
        } else {
          this.showScreen('rescuer-screen');
          this.rescuerMode = new RescuerMode(this);
          this.rescuerMode.init();
        }
      });
    });
  }

  // ===== TOAST NOTIFICATIONS =====
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 3500);
  }
}

// Boot the application
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
