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
    
    // Reporting State Machine
    this.reportingState = 'IDLE'; // IDLE, TYPE, LOCATION, PHOTOS, CONFIRM
    this.reportData = {
      type: 'other',
      severity: 'moderate',
      description: '',
      location: null,
      photos: []
    };
  }

  init() {
    this.panel = document.getElementById(this.panelId);
    if (!this.panel) return;

    this.feed       = this.panel.querySelector('.ai-feed');
    this.chips      = this.panel.querySelector('.ai-chips');
    this.bottomBar  = this.panel.querySelector('.ai-bottom-bar');
    this.thumbWrap  = this.panel.querySelector('.ai-bottom-bar .ai-thumb-wrap');
    this.thumbImg   = this.panel.querySelector('.ai-thumb-img');
    this.thumbDel   = this.panel.querySelector('.ai-bottom-bar .ai-thumb-del');

    this.allInputbars = this.panel.querySelectorAll('.ai-inputbar');
    this._bindAllBars();
    this._initVoice();
    this._populateChips();

    // Initial greeting for citizen mode
    if (this.mode === 'citizen') {
      setTimeout(() => this._addBotBubble("Hi there! How can I assist you today? 🐶"), 500);
    }
  }

  _bindAllBars() {
    this.allInputbars.forEach(bar => {
      const inputEl  = bar.querySelector('.ai-input');
      const sendBtn  = bar.querySelector('.ai-btn-send');
      const plusBtn  = bar.querySelector('.ai-btn-plus');
      const fileIn   = bar.querySelector('.ai-file-input');
      const micBtn   = bar.querySelector('.ai-btn-mic');

      sendBtn?.addEventListener('click', () => this._send());
      inputEl?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
      inputEl?.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
        this._syncInputs(inputEl.value);
        this._updateSendReady(inputEl.value.trim());
      });

      plusBtn?.addEventListener('click', () => fileIn?.click());
      fileIn?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          this.pendingImage = ev.target.result;
          if (this.thumbImg) this.thumbImg.src = this.pendingImage;
          if (this.thumbWrap) this.thumbWrap.style.display = 'flex';
          this._updateSendReady('image');
        };
        reader.readAsDataURL(file);
      });

      micBtn?.addEventListener('click', () => this._toggleVoice());
    });

    this.thumbDel?.addEventListener('click', () => this._clearImage());

    this.chips?.addEventListener('click', e => {
      const chip = e.target.closest('.ai-chip, .ai-pill-btn');
      if (!chip) return;
      const text = chip.dataset.q || chip.textContent.trim();
      this._setInputAll(text);
      this._send();
    });
  }

  _getActiveInput() {
    for (const bar of this.allInputbars) {
      const el = bar.querySelector('.ai-input');
      if (el && el.value.trim()) return el;
    }
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
      const el = bar.querySelector('.ai-inputbar .ai-input');
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
      const btn = bar.querySelector('.ai-btn-send');
      if (btn) btn.style.opacity = hasContent ? '1' : '0.5';
    });
  }

  _clearImage() {
    this.pendingImage = null;
    if (this.thumbImg)  this.thumbImg.src = '';
    if (this.thumbWrap) this.thumbWrap.style.display = 'none';
    this.panel.querySelectorAll('.ai-file-input').forEach(f => f.value = '');
    this._updateSendReady('');
  }

  _initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    this.recognition = new SR();
    this.recognition.lang = 'en-US';
    this.recognition.onresult = e => {
      const text = Array.from(e.results).map(r => r[0].transcript).join('');
      this._setInputAll(text);
    };
    this.recognition.onend = () => {
      this.listening = false;
      this._updateMicUI();
      if (this._getActiveInput()?.value?.trim()) this._send();
    };
  }

  _toggleVoice() {
    if (!this.recognition) return;
    if (this.listening) this.recognition.stop();
    else { this.recognition.start(); this.listening = true; this._updateMicUI(); }
  }

  _updateMicUI() {
    this.panel.querySelectorAll('.ai-btn-mic').forEach(btn => btn.classList.toggle('mic-active', this.listening));
  }

  _populateChips() {
    const chipsData = {
      citizen: [
        { q: 'I found an injured animal', label: '🚑 Report an Animal' },
        { q: 'Found a Pet', label: '🐾 Found a Pet' },
        { q: 'Get Assistance', label: '🆘 Get Assistance' },
      ],
      rescuer: [
        { q: 'Generate summary', label: '📋 Summary' },
        { q: 'Equipment needed', label: '🛠️ Equipment' },
      ]
    };
    if (this.chips) {
      this.chips.innerHTML = (chipsData[this.mode] || [])
        .map(c => `<button class="ai-pill-btn" data-q="${c.q}">${c.label}</button>`)
        .join('');
    }
  }

  async _send() {
    if (this.isLoading) return;
    const inputEl = this._getActiveInput();
    const text    = inputEl?.value?.trim() || '';
    const image   = this.pendingImage;
    if (!text && !image) return;

    if (!this.hasChatted) {
      this.hasChatted = true;
      this.panel.classList.add('chatting');
    }

    this._bubble('user', text, image);
    this.history.push({ role: 'user', text: text || '', imageDataUrl: image || null });
    this._clearAllInputs();
    this._clearImage();

    // INTERCEPT FOR REPORTING FLOW
    if (this.mode === 'citizen' && (text.toLowerCase().includes('report') || text.toLowerCase().includes('injured') || this.reportingState !== 'IDLE')) {
      this._handleReportingFlow(text, image);
      return;
    }

    this.isLoading = true;
    const typingEl = this._showTyping();

    try {
      const endpoint = this.mode === 'citizen' ? '/api/ai/first-aid' : '/api/ai/analyze';
      const payload  = { question: text || 'Analyze this image', imageDataUrl: image, history: this.history.slice(-10) };
      if (this.mode === 'rescuer') payload.description = text;

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      typingEl.remove();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data  = await res.json();
      const reply = (this.mode === 'citizen' ? data.answer : data.report) || 'Processing...';
      await this._streamBubble(reply);
      this.history.push({ role: 'model', text: reply });
    } catch (err) {
      typingEl.remove();
      await this._streamBubble('⚠️ Connection issue. Still here to help!');
    }
    this.isLoading = false;
  }

  // ── Conversational Reporting Logic ────────────────────
  async _handleReportingFlow(text, image) {
    this.isLoading = true;
    const typingEl = this._showTyping();
    await this._sleep(800);

    try {
      if (image && this.reportingState === 'PHOTOS') {
        this.reportData.photos = this.reportData.photos || [];
        this.reportData.photos.push(image);
      }

      const payload = { 
        text: text || "User uploaded an image.", 
        history: this.history.slice(-10), 
        currentData: this.reportData 
      };

      const res = await fetch('/api/ai/report-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      typingEl.remove();

      if (!res.ok) throw new Error('Failed to parse incident');
      
      const data = await res.json();
      Object.assign(this.reportData, data.extractedData || {});

      if (data.action === 'REQUEST_LOCATION') {
        this.reportingState = 'LOCATION';
        await this._addBotBubble(data.reply);
        this._showLocationButton();
      } else if (data.action === 'REQUEST_PHOTOS') {
        this.reportingState = 'PHOTOS';
        await this._addBotBubble(data.reply);
        this._showQuickOptions(["I don't have a photo", "Upload Photo"]);
      } else if (data.action === 'COMPLETE') {
        this.reportingState = 'CONFIRM';
        await this._addBotBubble(data.reply || "Thank you! Generating the SOS signal now...");
        this._finalizeReport();
      } else {
        // ASK_INFO or any other state
        this.reportingState = 'TYPE';
        await this._addBotBubble(data.reply);
        if (data.reply.toLowerCase().includes('what kind')) {
           this._showQuickOptions(['🐕 Dog', '🐈 Cat', '🐦 Bird', '🐾 Other']);
        }
      }
    } catch (err) {
      typingEl.remove();
      console.error(err);
      await this._addBotBubble("⚠️ Connection issue processing report. Please use the main SOS button.");
    }

    this.isLoading = false;
  }

  async _finalizeReport() {
    try {
      // Use existing submitSOS logic from citizenMode
      if (window.app?.citizenMode) {
        const success = await window.app.citizenMode.submitSOS({
          animalType: this.reportData.type,
          severity: this.reportData.severity,
          description: this.reportData.description,
          location: this.reportData.location,
          photos: this.reportData.photos
        });

        if (success) {
          await this._addBotBubble("✅ **Rescue Signal Sent!** A nearby rescuer has been notified.");
          await this._addBotBubble("While you wait, please keep the animal calm. Do not attempt to move it if it has spinal injuries. 🩹");
        }
      }
    } catch (e) {
      await this._addBotBubble("⚠️ Failed to send signal. Please try using the main SOS button.");
    }
    this.reportingState = 'IDLE';
  }

  _addBotBubble(text) {
    const b = this._bubble('ai', text);
    this.history.push({ role: 'model', text });
    return b;
  }

  _showQuickOptions(options) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-chips';
    wrap.style.marginTop = '8px';
    wrap.innerHTML = options.map(o => `<button class="ai-pill-btn">${o}</button>`).join('');
    this.feed?.appendChild(wrap);
    this._scroll();
  }

  _showLocationButton() {
    const btn = document.createElement('button');
    btn.className = 'ai-action-btn';
    btn.innerHTML = '📍 Share My Location';
    btn.onclick = () => {
      btn.innerHTML = '⌛ Fetching Location...';
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          this.reportData.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          btn.innerHTML = '✅ Location Shared';
          btn.disabled = true;
          this._bubble('user', 'Shared my location');
          this._handleReportingFlow('shared');
        });
      }
    };
    this.feed?.appendChild(btn);
    this._scroll();
  }

  // ── Render helpers ────────────────────────────────────
  _bubble(role, text, imageUrl = null) {
    const wrap = document.createElement('div');
    wrap.className = `ai-row ai-row-${role}`;

    const imgTag = imageUrl ? `<img src="${imageUrl}" class="ai-bubble-img">` : '';
    const txtTag = text ? `<div class="ai-bubble-text">${role === 'ai' ? this._md(text) : this._esc(text)}</div>` : '';

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
    const wrap = this._bubble('ai', '\u200b');  // zero-width space ensures .ai-bubble-text div is created
    const inner = wrap.querySelector('.ai-bubble-text');
    if (!inner) return;  // safety guard
    inner.innerHTML = '';  // clear the placeholder
    const tokens = fullText.split(/(\s+)/);
    let acc = '';
    for (const tok of tokens) {
      acc += tok;
      inner.innerHTML = this._md(acc);
      this._scroll();
      await this._sleep(15);
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

  _md(raw) {
    return raw.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  }

  _esc(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  _scroll() { if (this.feed) this.feed.scrollTop = this.feed.scrollHeight; }
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
window.AIAssistant = AIAssistant;
