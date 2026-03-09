// =================================================
// HEALTH PASSPORT - Animal medical records UI
// =================================================

class HealthPassport {
  constructor(app) {
    this.app = app;
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Open passport modal from nav or post-rescue
    document.querySelectorAll('[data-view="passport"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('passport-modal').classList.add('active');
      });
    });

    // Close
    document.getElementById('passport-modal-close').addEventListener('click', () => {
      document.getElementById('passport-modal').classList.remove('active');
    });

    // Form submit
    document.getElementById('passport-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePassport();
    });
  }

  savePassport() {
    const animalType = document.getElementById('passport-animal-type').value;
    const status = document.getElementById('passport-status').value;
    const vetNotes = document.getElementById('passport-vet-notes').value;
    const rehabCenter = document.getElementById('passport-rehab').value;

    if (!animalType) {
      this.app.showToast('⚠️ Please enter the animal type', 'error');
      return;
    }

    const passportData = {
      animal_type: animalType,
      status,
      vet_notes: vetNotes,
      rehab_center: rehabCenter,
      treatment_history: {
        entries: [
          {
            date: new Date().toISOString(),
            action: 'Initial assessment',
            notes: vetNotes,
          },
        ],
      },
    };

    // In a real app, POST to /api/health-passports
    console.log('[HealthPassport] Saving:', passportData);

    // Add to timeline UI
    this.addTimelineEntry({
      date: new Date().toLocaleDateString(),
      action: 'Initial Assessment',
      notes: vetNotes || 'No notes provided',
    });

    this.app.showToast('💊 Health passport saved!', 'success');
  }

  addTimelineEntry(entry) {
    const timeline = document.getElementById('treatment-timeline');
    const empty = timeline.querySelector('.timeline-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <span class="timeline-date">${entry.date}</span>
      <h5>${entry.action}</h5>
      <p>${entry.notes}</p>
    `;
    timeline.appendChild(item);

    // Trigger anti-gravity float
    AntiGravity.addFloat(item);
  }
}

window.HealthPassport = HealthPassport;
