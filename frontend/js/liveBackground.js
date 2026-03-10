// =================================================
// LIVE BACKGROUND - Floating Paw Icons Wallpaper
// =================================================

class LiveBackground {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.count = options.count || 25;
    this.useGradients = options.useGradients !== undefined ? options.useGradients : true;
    this.init();
  }

  init() {
    this.container.innerHTML = '';
    for (let i = 0; i < this.count; i++) {
      this.createIcon(i);
    }
  }

  createIcon(index) {
    const icon = document.createElement('div');
    icon.className = 'floating-bg-icon';
    
    const size = Math.random() * 50 + 20; 
    const startX = Math.random() * 100;
    const startY = Math.random() * 100;
    const duration = Math.random() * 30 + 20;
    const delay = Math.random() * -duration;
    const opacity = this.useGradients ? (Math.random() * 0.15 + 0.05) : (Math.random() * 0.05 + 0.02);
    
    const gradients = [
      'linear-gradient(135deg, #6366f1, #8b5cf6)',
      'linear-gradient(135deg, #8b5cf6, #ec4899)',
      'linear-gradient(135deg, #06b6d4, #6366f1)',
      'linear-gradient(135deg, #10b981, #06b6d4)'
    ];
    const grad = gradients[Math.floor(Math.random() * gradients.length)];

    let style = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${startX}%;
      top: ${startY}%;
      opacity: ${opacity};
      animation: floatWallpaper ${duration}s linear infinite;
      animation-delay: ${delay}s;
      pointer-events: none;
      filter: blur(0.5px);
      z-index: -1;
    `;

    if (this.useGradients) {
      style += `
        background: ${grad};
        -webkit-mask-image: url('assets/paw_icon.png');
        mask-image: url('assets/paw_icon.png');
        -webkit-mask-size: contain;
        mask-size: contain;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
      `;
    } else {
      style += `
        background: url('assets/paw_icon.png') no-repeat center center;
        background-size: contain;
      `;
    }

    icon.style.cssText = style;
    this.container.appendChild(icon);
  }
}

window.LiveBackground = LiveBackground;
