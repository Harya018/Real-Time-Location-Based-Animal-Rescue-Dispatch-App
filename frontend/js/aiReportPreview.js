// =================================================
// AI REPORT PREVIEW — Image Analysis + Report Card
// =================================================
class AIReportPreview {
  constructor(citizenMode) {
    this.citizenMode = citizenMode;
    this.currentAnalysis = null;
    this.isAnalyzing = false;
  }

  init() {
    // Hook the analyze button
    const analyzeBtn = document.getElementById('ai-analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => this.analyzeImage());
    }

    // Hook discard button
    const discardBtn = document.getElementById('ai-report-discard');
    if (discardBtn) {
      discardBtn.addEventListener('click', () => this.discardReport());
    }

    // Hook confirm button
    const confirmBtn = document.getElementById('ai-report-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmAndSubmit());
    }

    // Show/hide analyze button when photo is uploaded
    const photoInput = document.getElementById('sos-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', () => {
        const hasFile = photoInput.files && photoInput.files.length > 0;
        if (analyzeBtn) analyzeBtn.style.display = hasFile ? 'flex' : 'none';
        // Hide old analysis when new photo is uploaded
        this.hidePreview();
      });
    }
  }

  async analyzeImage() {
    if (this.isAnalyzing) return;

    const photoPreview = document.getElementById('photo-preview');
    const imageDataUrl = photoPreview?.src || null;

    if (!imageDataUrl || imageDataUrl === '') {
      window.app?.showToast('📸 Please upload a photo first', 'error');
      return;
    }

    this.isAnalyzing = true;
    this.showLoading();
    this.updateAnalyzeButton(true);

    // Get GPS location
    const loc = this.citizenMode?.userLocation || { lat: 12.9716, lng: 77.5946 };

    try {
      const res = await fetch('/api/ai/analyze-animal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          lat: loc.lat,
          lng: loc.lng,
          timestamp: new Date().toISOString()
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.currentAnalysis = data.analysis;
      this.renderPreview(data.analysis, data.simulated);
      window.app?.showToast('🔬 AI analysis complete!', 'success');

    } catch (err) {
      console.error('[AIReport] Analysis error:', err);
      // Generate client-side fallback
      this.currentAnalysis = this.clientFallbackAnalysis(loc);
      this.renderPreview(this.currentAnalysis, true);
      window.app?.showToast('🔬 Analysis generated (offline mode)', 'info');
    }

    this.isAnalyzing = false;
    this.updateAnalyzeButton(false);
  }

  clientFallbackAnalysis(loc) {
    return {
      animal_type: 'Unknown',
      possible_breed: 'Unknown — requires visual analysis',
      number_of_animals: 1,
      visible_injuries: 'Pending assessment on-site',
      condition: 'Animal in distress — details pending professional evaluation',
      severity_level: 'Medium',
      urgency_level: 'Urgent',
      environment_context: 'Location captured via GPS',
      recommended_action: 'Dispatch rescuer for immediate on-site assessment',
      nearest_rescue_priority: true,
      analysis_confidence: 'N/A (offline)',
      location_coordinates: `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
      timestamp: new Date().toISOString()
    };
  }

  renderPreview(analysis, simulated = false) {
    const container = document.getElementById('ai-report-container');
    if (!container) return;

    const confNum = parseInt(analysis.analysis_confidence) || 0;
    const confClass = confNum < 60 ? 'low' : '';
    const simBadge = simulated ? '<span class="simulated-badge">⚡ Demo Mode</span>' : '';

    container.innerHTML = `
      <div class="ai-report-preview">
        <div class="ai-report-header">
          <h3>🔬 AI Analysis Report ${simBadge}</h3>
          <span class="confidence-badge ${confClass}">
            🎯 ${analysis.analysis_confidence}
          </span>
        </div>
        <div class="ai-report-body">
          <div class="report-severity-row">
            <div class="report-field">
              <span class="report-field-label">🐾 Animal Type</span>
              <div class="report-field-value" contenteditable="true" data-field="animal_type">${analysis.animal_type}</div>
            </div>
            <div class="report-field">
              <span class="report-field-label">🧬 Possible Breed</span>
              <div class="report-field-value" contenteditable="true" data-field="possible_breed">${analysis.possible_breed}</div>
            </div>
          </div>
          <div class="report-severity-row">
            <div class="report-field">
              <span class="report-field-label">⚠️ Severity</span>
              <div class="report-field-value" data-field="severity_level">
                <span class="severity-tag ${analysis.severity_level}">${analysis.severity_level}</span>
              </div>
            </div>
            <div class="report-field">
              <span class="report-field-label">🚨 Urgency</span>
              <div class="report-field-value" data-field="urgency_level">
                <span class="severity-tag ${analysis.urgency_level}">${analysis.urgency_level}</span>
              </div>
            </div>
          </div>
          <div class="report-field">
            <span class="report-field-label">🩹 Visible Injuries</span>
            <div class="report-field-value" contenteditable="true" data-field="visible_injuries">${analysis.visible_injuries}</div>
          </div>
          <div class="report-field">
            <span class="report-field-label">📋 Condition</span>
            <div class="report-field-value" contenteditable="true" data-field="condition">${analysis.condition}</div>
          </div>
          <div class="report-field">
            <span class="report-field-label">🌍 Environment</span>
            <div class="report-field-value" contenteditable="true" data-field="environment_context">${analysis.environment_context}</div>
          </div>
          <div class="report-field">
            <span class="report-field-label">🛠️ Recommended Action</span>
            <div class="report-field-value" contenteditable="true" data-field="recommended_action">${analysis.recommended_action}</div>
          </div>
          <div class="report-severity-row">
            <div class="report-field">
              <span class="report-field-label">📍 Location</span>
              <div class="report-field-value">${analysis.location_coordinates}</div>
            </div>
            <div class="report-field">
              <span class="report-field-label">🔢 Animals Detected</span>
              <div class="report-field-value" contenteditable="true" data-field="number_of_animals">${analysis.number_of_animals}</div>
            </div>
          </div>
        </div>
        <div class="ai-report-actions">
          <button class="btn-discard-report" id="ai-report-discard">✕ Discard</button>
          <button class="btn-confirm-report" id="ai-report-confirm">✅ Confirm & Submit</button>
        </div>
      </div>
    `;

    // Re-bind buttons after innerHTML replacement
    document.getElementById('ai-report-discard')?.addEventListener('click', () => this.discardReport());
    document.getElementById('ai-report-confirm')?.addEventListener('click', () => this.confirmAndSubmit());

    container.style.display = 'block';
  }

  showLoading() {
    const container = document.getElementById('ai-report-container');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = `
      <div class="ai-report-loading">
        <div class="skeleton-header">
          <div class="skeleton-spinner"></div>
          <span>Analyzing image with AI...</span>
        </div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    `;
  }

  hidePreview() {
    const container = document.getElementById('ai-report-container');
    if (container) { container.style.display = 'none'; container.innerHTML = ''; }
    this.currentAnalysis = null;
  }

  discardReport() {
    this.hidePreview();
    window.app?.showToast('Report discarded', 'info');
  }

  updateAnalyzeButton(loading) {
    const btn = document.getElementById('ai-analyze-btn');
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<div class="skeleton-spinner"></div> Analyzing...'
      : '<span>🔬</span> AI Analyze Image';
  }

  getEditedAnalysis() {
    if (!this.currentAnalysis) return null;
    const edited = { ...this.currentAnalysis };
    document.querySelectorAll('.report-field-value[data-field]').forEach(el => {
      const field = el.dataset.field;
      const text = el.textContent.trim();
      if (field === 'number_of_animals') {
        edited[field] = parseInt(text) || 1;
      } else {
        edited[field] = text;
      }
    });
    return edited;
  }

  async confirmAndSubmit() {
    const analysis = this.getEditedAnalysis();
    if (!analysis) { window.app?.showToast('No analysis to submit', 'error'); return; }

    // Map AI severity to SOS severity
    const severityMap = { 'Critical': 'critical', 'High': 'critical', 'Medium': 'moderate', 'Low': 'stable' };
    const mappedSeverity = severityMap[analysis.severity_level] || 'moderate';

    // Build description from analysis
    const description = `[AI-ANALYZED] ${analysis.animal_type} (${analysis.possible_breed}): ${analysis.visible_injuries}. ${analysis.condition}. Action: ${analysis.recommended_action}`;

    const photoPreview = document.getElementById('photo-preview');
    const photos = photoPreview?.src ? [photoPreview.src] : [];

    const loc = this.citizenMode?.userLocation || { lat: 12.9716, lng: 77.5946 };

    const reportData = {
      citizen_id: window.app?.userId,
      lat: loc.lat,
      lng: loc.lng,
      description,
      severity: mappedSeverity,
      photos,
      ai_analysis: analysis
    };

    // Check if offline
    if (window.offlineManager && !navigator.onLine) {
      await window.offlineManager.queueReport(reportData);
      this.hidePreview();
      document.getElementById('sos-modal')?.classList.remove('active');
      window.app?.showToast('📱 Report saved offline — will sync when connected', 'info');
      return;
    }

    // Submit online
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData)
      });

      if (!res.ok) throw new Error('Submission failed');
      const data = await res.json();

      window.app?.showToast('✅ AI-analyzed rescue report submitted!', 'success');
      this.hidePreview();
      document.getElementById('sos-modal')?.classList.remove('active');

      if (this.citizenMode) {
        this.citizenMode.activeRequestId = data.id;
        this.citizenMode.loadIncidentsFromAPI();
      }
    } catch (err) {
      console.error('[AIReport] Submit error:', err);
      // Queue offline if submit fails
      if (window.offlineManager) {
        await window.offlineManager.queueReport(reportData);
        this.hidePreview();
        document.getElementById('sos-modal')?.classList.remove('active');
        window.app?.showToast('📱 Submit failed — report saved offline', 'info');
      } else {
        window.app?.showToast('❌ Failed to submit report', 'error');
      }
    }
  }
}

window.AIReportPreview = AIReportPreview;
