// =================================================
// AI ASSISTANT — PawGuard ChatGPT-Style Chat
// Centered input before conversation, bottom bar after
// =================================================

class AIAssistant {
  constructor(mode = 'citizen') {
    this.mode         = mode;
    this.history      = [];
    this.pendingImage = null;
    this.listening    = false;
    this.recognition  = null;
    this.isLoading    = false;
    this.hasChatted   = false;
    this.panelId      = mode === 'citizen' ? 'citizen-ai-panel' : 'rescuer-ai-panel';
  }

  init() {
    this.panel = document.getElementById(this.panelId);
    if (!this.panel) return;

    this.feed       = this.panel.querySelector('.ai-feed');
    this.chips      = this.panel.querySelector('.ai-chips');
    this.bottomBar  = this.panel.querySelector('.ai-bottom-bar');
    this.thumbWrap  = this.panel.querySelector('.ai-bottom-bar .ai-thumb-wrap');
    this.thumbImg   = this.panel.querySelector('.ai-thumb-img');
    this.thumbDel   = this.panel.querySelector('.ai-thumb-del');

    // There are TWO inputbars (center + bottom). Bind BOTH.
    this.allInputbars = this.panel.querySelectorAll('.ai-inputbar');
    this._bindAllBars();
    this._initVoice();
    this._populateChips();
  }

  // ── Bind both input bars ──────────────────────────────
  _bindAllBars() {
    this.allInputbars.forEach(bar => {
      const inputEl  = bar.querySelector('.ai-input');
      const sendBtn  = bar.querySelector('.ai-btn-send');
      const plusBtn  = bar.querySelector('.ai-btn-plus');
      const fileIn   = bar.querySelector('.ai-file-input');
      const micBtn   = bar.querySelector('.ai-btn-mic');

      // Send
      sendBtn?.addEventListener('click', () => this._send());
      inputEl?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
      inputEl?.addEventListener('input', () => {
        // Auto-grow
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
        // Sync text across both bars
        this._syncInputs(inputEl.value);
        // Toggle send button active state
        this._updateSendReady(inputEl.value.trim());
      });

      // + attach
      plusBtn?.addEventListener('click', () => fileIn?.click());
      fileIn?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          this.pendingImage = ev.target.result;
          if (this.thumbImg) this.thumbImg.src = this.pendingImage;
          if (this.thumbWrap) this.thumbWrap.style.display = 'flex';
        };
        reader.readAsDataURL(file);
      });

      // mic
      micBtn?.addEventListener('click', () => this._toggleVoice());
    });

    // Thumb delete
    this.thumbDel?.addEventListener('click', () => this._clearImage());

    // Chips click
    this.chips?.addEventListener('click', e => {
      const chip = e.target.closest('.ai-chip');
      if (!chip) return;
      this._setInputAll(chip.dataset.q || chip.textContent.trim());
      this._send();
    });
  }

  // Get value from whichever input currently has text (prefer active bar)
  _getActiveInput() {
    for (const bar of this.allInputbars) {
      const el = bar.querySelector('.ai-input');
      if (el && el.value.trim()) return el;
    }
    // Return first available
    return this.allInputbars[0]?.querySelector('.ai-input') || null;
  }

  _setInputAll(value) {
    this.allInputbars.forEach(bar => {
      const el = bar.querySelector('.ai-input');
      if (el) { el.value = value; el.style.height = 'auto'; }
    });
    this._updateSendReady(value.trim());
  }

  _syncInputs(value) {
    this.allInputbars.forEach(bar => {
      const el = bar.querySelector('.ai-input');
      if (el && el.value !== value) el.value = value;
    });
  }

  _clearAllInputs() {
    this.allInputbars.forEach(bar => {
      const el = bar.querySelector('.ai-input');
      if (el) { el.value = ''; el.style.height = 'auto'; }
    });
    this._updateSendReady('');
  }

  _updateSendReady(value) {
    const hasContent = value.length > 0 || !!this.pendingImage;
    this.allInputbars.forEach(bar => {
      bar.querySelector('.ai-btn-send')?.classList.toggle('send-ready', hasContent);
    });
  }

  _clearImage() {
    this.pendingImage = null;
    if (this.thumbImg)  this.thumbImg.src = '';
    if (this.thumbWrap) this.thumbWrap.style.display = 'none';
    this.panel.querySelectorAll('.ai-file-input').forEach(f => f.value = '');
    this._updateSendReady('');
  }

  // ── Voice ─────────────────────────────────────────────
  _initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.panel.querySelectorAll('.ai-btn-mic').forEach(b => b.style.opacity = '0.3');
      return;
    }
    this.recognition = new SR();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;

    this.recognition.onresult = e => {
      const text = Array.from(e.results).map(r => r[0].transcript).join('');
      this._setInputAll(text);
    };

    this.recognition.onend = () => {
      this.listening = false;
      this._updateMicUI();
      const input = this._getActiveInput();
      if (input?.value?.trim()) this._send();
    };

    this.recognition.onerror = () => {
      this.listening = false;
      this._updateMicUI();
    };
  }

  _toggleVoice() {
    if (!this.recognition) return;
    if (this.listening) {
      this.recognition.stop();
    } else {
      this.recognition.start();
      this.listening = true;
      this._updateMicUI();
    }
  }

  _updateMicUI() {
    this.panel.querySelectorAll('.ai-btn-mic').forEach(btn => {
      btn.classList.toggle('mic-active', this.listening);
    });
  }

  // ── Chips ─────────────────────────────────────────────
  _populateChips() {
    const chipsData = {
      citizen: [
        { q: 'What should I do for an injured dog?',      label: '🐕 Injured dog' },
        { q: 'How do I safely approach a stray cat?',     label: '🐈 Stray cat' },
        { q: 'What are signs of shock in an animal?',     label: '⚡ Signs of shock' },
        { q: 'How do I help an injured bird?',             label: '🐦 Injured bird' },
      ],
      rescuer: [
        { q: 'Generate a report for a dog with broken leg', label: '📋 Dog injury' },
        { q: 'Cat entrapment in drainage — assess severity', label: '🐱 Cat in drain' },
        { q: 'What transport protocol for injured wildlife?', label: '🚑 Transport' },
        { q: 'What equipment should I bring?',               label: '🛠️ Equipment' },
      ]
    };

    if (this.chips) {
      this.chips.innerHTML = (chipsData[this.mode] || [])
        .map(c => `<button class="ai-chip" data-q="${c.q}">${c.label}</button>`)
        .join('');
    }
  }

  // ── Send ──────────────────────────────────────────────
  async _send() {
    if (this.isLoading) return;

    const inputEl = this._getActiveInput();
    const text    = inputEl?.value?.trim() || '';
    const image   = this.pendingImage;

    if (!text && !image) return;

    // Switch to chatting mode on first message
    if (!this.hasChatted) {
      this.hasChatted = true;
      this.panel.classList.add('chatting');
    }

    this._clearAllInputs();
    this._clearImage();

    this._bubble('user', text, image);
    this.history.push({ role: 'user', text: text || '', imageDataUrl: image || null });

    this.isLoading = true;
    const typingEl = this._showTyping();

    try {
      const endpoint = this.mode === 'citizen' ? '/api/ai/first-aid' : '/api/ai/analyze';
      const payload  = this.mode === 'citizen'
        ? { question: text || 'Analyze this image', imageDataUrl: image, history: this.history.slice(-10) }
        : { description: text || 'Analyze this image', imageDataUrl: image, history: this.history.slice(-10) };

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });

      typingEl.remove();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data  = await res.json();
      const reply = (this.mode === 'citizen' ? data.answer : data.report)
                    || 'Sorry, I could not process that. Please try again.';

      await this._streamBubble(reply);
      this.history.push({ role: 'model', text: reply });

      if (data.simulated) {
        this._note('💡 Demo mode — add a Gemini API key to backend/.env for live AI');
      }
    } catch (err) {
      typingEl.remove();
      await this._streamBubble('⚠️ Network error. Please try again.');
      console.error('[AI]', err);
    }

    this.isLoading = false;
  }

  // ── Render helpers ────────────────────────────────────
  _bubble(role, text, imageUrl = null) {
    const wrap = document.createElement('div');
    wrap.className = `ai-row ai-row-${role}`;

    const imgTag = imageUrl
      ? `<img src="${imageUrl}" class="ai-bubble-img" alt="uploaded">`
      : '';
    const txtTag = text
      ? `<div class="ai-bubble-text">${role === 'ai' ? this._md(text) : this._esc(text)}</div>`
      : '';

    if (role === 'ai') {
      wrap.innerHTML = `<div class="ai-av ai-av-bot">🐾</div><div class="ai-bubble ai-bubble-bot">${imgTag}${txtTag}</div>`;
    } else {
      wrap.innerHTML = `<div class="ai-bubble ai-bubble-user">${imgTag}${txtTag}</div><div class="ai-av ai-av-user">👤</div>`;
    }

    this.feed?.appendChild(wrap);
    this._scroll();
    return wrap;
  }

  async _streamBubble(fullText) {
    const wrap   = document.createElement('div');
    wrap.className = 'ai-row ai-row-ai';
    const inner  = document.createElement('div');
    inner.className = 'ai-bubble-text';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble ai-bubble-bot';
    bubble.appendChild(inner);
    wrap.innerHTML = `<div class="ai-av ai-av-bot">🐾</div>`;
    wrap.appendChild(bubble);
    this.feed?.appendChild(wrap);
    this._scroll();

    const tokens = fullText.split(/(\s+)/);
    let acc = '';
    for (const tok of tokens) {
      acc += tok;
      inner.innerHTML = this._md(acc);
      this._scroll();
      await this._sleep(12);
    }
  }

  _showTyping() {
    const el = document.createElement('div');
    el.className = 'ai-row ai-row-ai';
    el.innerHTML = `<div class="ai-av ai-av-bot">🐾</div><div class="ai-bubble ai-bubble-bot"><div class="ai-typing"><span></span><span></span><span></span></div></div>`;
    this.feed?.appendChild(el);
    this._scroll();
    return el;
  }

  _note(text) {
    const el = document.createElement('div');
    el.className = 'ai-note';
    el.textContent = text;
    this.feed?.appendChild(el);
    this._scroll();
  }

  // ── Markdown ──────────────────────────────────────────
  _md(raw) {
    return raw
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/```([\s\S]*?)```/g,'<pre class="ai-pre"><code>$1</code></pre>')
      .replace(/`([^`]+)`/g,'<code class="ai-code-inline">$1</code>')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.*?)\*/g,'<em>$1</em>')
      .replace(/^## (.*)/gm,'<h4 class="ai-h">$1</h4>')
      .replace(/^### (.*)/gm,'<h5 class="ai-h5">$1</h5>')
      .replace(/^[-•] (.*)/gm,'<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, m => `<ul class="ai-ul">${m}</ul>`)
      .replace(/\n\n/g,'<br><br>')
      .replace(/\n/g,'<br>');
  }

  _esc(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  _scroll() { if (this.feed) this.feed.scrollTop = this.feed.scrollHeight; }
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // rescuerMode.js hook
  async analyzeRequest(desc, imgUrl, type = 'animal', sev = 'moderate') {
    if (this.mode !== 'rescuer') return;
    this._setInputAll(`Generate a triage report for a ${sev} ${type} incident: ${desc}`);
    if (imgUrl?.startsWith('http')) {
      try {
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        this.pendingImage = await new Promise(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result); fr.readAsDataURL(blob); });
        if (this.thumbImg)  this.thumbImg.src = this.pendingImage;
        if (this.thumbWrap) this.thumbWrap.style.display = 'flex';
      } catch {}
    }
    await this._send();
  }
}

window.AIAssistant = AIAssistant;
