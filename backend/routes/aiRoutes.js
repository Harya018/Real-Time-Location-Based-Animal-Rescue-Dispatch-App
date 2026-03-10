// ================================================
// AI ROUTES — Gemini-powered Chatbot Endpoints
// ================================================
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
let genAI = null;

function getGenAI() {
  if (!GEMINI_KEY) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(GEMINI_KEY);
  return genAI;
}

// Helper: convert base64 data URL to inline part for Gemini
function dataUrlToPart(dataUrl) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

// ── POST /api/ai/first-aid ──────────────────────────────────────────────────
// Citizen sends a question + optional image + conversation history
router.post('/first-aid', async (req, res) => {
  const { question, imageDataUrl, history = [] } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });

  if (!GEMINI_KEY) {
    return res.json({ answer: simulateFirstAid(question, history), simulated: true });
  }

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemInstruction = `You are PawGuard AI, a compassionate and knowledgeable animal rescue assistant.
Your role: help citizens provide immediate first aid and keep an injured or distressed animal calm until a professional rescuer arrives.
When answering:
- Be warm, clear, and empathetic
- Give numbered or bullet-point steps
- Always note what NOT to do
- End with a reassuring note about the rescuer coming
- If asked about something unrelated to animal rescue, politely redirect`;

    // Build Gemini chat history from previous turns
    const chatHistory = history.slice(-8).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));

    const chat = model.startChat({
      history: chatHistory,
      systemInstruction
    });

    const parts = [question];
    const imgPart = dataUrlToPart(imageDataUrl);
    if (imgPart) parts.push(imgPart);

    const result = await chat.sendMessage(parts);
    return res.json({ answer: result.response.text() });

  } catch (err) {
    console.error('[AI] First-aid error:', err.message);
    return res.json({ answer: simulateFirstAid(question, history), simulated: true });
  }
});

// ── POST /api/ai/analyze ────────────────────────────────────────────────────
// Rescuer chatbot — multi-turn analysis with image and history
router.post('/analyze', async (req, res) => {
  const { imageDataUrl, description = '', animalType = 'animal', severity = 'moderate', history = [] } = req.body;

  if (!imageDataUrl && !description) {
    return res.status(400).json({ error: 'Image or description is required' });
  }

  if (!GEMINI_KEY) {
    return res.json({ report: simulateRescuerReport(description, animalType, severity), simulated: true });
  }

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemInstruction = `You are PawGuard Rescue Analyst AI — a veterinary triage assistant for field rescuers.
When given an animal photo or incident description, produce a structured triage report:
## 🔍 Visual Assessment
## ⚠️ Likely Issues
## 🛠️ Recommended On-Site Actions
## 🚑 Transport Notes
## 🏥 Vet Priority Level
Context: Animal type: ${animalType}, Severity: ${severity}.
In follow-up questions, answer naturally and concisely based on the ongoing rescue context.`;

    const chatHistory = history.slice(-8).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));

    const chat = model.startChat({ history: chatHistory, systemInstruction });

    const parts = [description || 'Generate a complete rescue triage report.'];
    const imgPart = dataUrlToPart(imageDataUrl);
    if (imgPart) parts.push(imgPart);

    const result = await chat.sendMessage(parts);
    return res.json({ report: result.response.text() });

  } catch (err) {
    console.error('[AI] Analyze error:', err.message);
    return res.json({ report: simulateRescuerReport(description, animalType, severity), simulated: true });
  }
});

// ── SIMULATION fallbacks (for demo without API key) ──────────────────────────
function simulateFirstAid(question) {
  const q = question.toLowerCase();

  if (q.includes('dog') || q.includes('stray')) {
    return `🐕 **First Aid for Injured/Stray Dog:**

**Immediate Steps:**
• Stay calm and approach slowly to avoid startling the animal
• If bleeding — apply gentle pressure using a clean cloth
• Do NOT give food or water to an injured animal (risk of choking)
• Keep the dog warm by covering with a blanket if available

**Keep it Calm:**
• Speak in low, soothing tones
• Avoid sudden movements or loud noises nearby
• Limit crowd gathering around the animal

**Do NOT:**
• Attempt to move a dog with possible spinal injury
• Remove embedded objects (glass, metal) yourself
• Muzzle a dog that has trouble breathing

🚨 **Rescuer is on the way — keep monitoring breathing and stay close!**`;
  }

  if (q.includes('cat') || q.includes('kitten')) {
    return `🐈 **First Aid for Injured Cat/Kitten:**

**Immediate Steps:**
• Approach very slowly — injured cats can scratch defensively
• Use a towel or cloth to wrap the cat gently if needed
• If bleeding — hold clean cloth with LIGHT pressure
• Place in a dark, quiet box with ventilation if possible

**Keep it Safe:**
• Do not force movement — cats hide pain and may be worse than they seem
• If kitten appears cold, warm with a cloth over a warm (not hot) bottle

🚨 **PawGuard rescuer is en route. Minimize handling and keep the area quiet.**`;
  }

  return `🐾 **General Animal First Aid Tips:**

**While waiting for rescue:**
• Do not leave the animal unattended
• Keep curious bystanders at a distance
• If the animal is conscious, speak calmly and gently
• Do not offer food or water without vet guidance
• If possible, place in a ventilated box or crate to reduce stress

**Signs to watch for that need immediate attention:**
• Difficulty breathing (open-mouth breathing, blue gums)
• Heavy or uncontrolled bleeding
• Seizures or loss of consciousness
• Inability to stand combined with shock symptoms

🚨 **Your PawGuard rescue team is on its way. Stay close and keep others away.**`;
}

function simulateRescuerReport(description, animalType, severity) {
  return `## 🔍 Visual Assessment
- Animal appears to be in a ${severity} condition based on reporter's description
- Description provided: "${description || 'No description available'}"

## ⚠️ Likely Issues
- Physical trauma indicated (impact injury, fall, or entrapment)
- Possible dehydration if animal has been distressed for extended period
- Stress and shock symptoms should be anticipated

## 🛠️ Recommended Actions (On-Site)
- Approach slowly and calmly to avoid panic response
- Assess airway, breathing, and circulation first
- Apply light pressure to any visible external wounds
- Minimize unnecessary handling and movement

## 🚑 Transport Notes
- Wrap in a towel or blanket to reduce fear and keep warm
- Place in a ventilated carrier or box for transport
- Keep level to avoid aggravating spinal or limb injuries
- Drive smoothly to the nearest emergency vet clinic

## 🏥 Vet Priority Level
- **${severity === 'critical' ? '🔴 CRITICAL — Immediate vet care required' : severity === 'moderate' ? '🟡 MODERATE — Vet visit within 1-2 hours' : '🟢 STABLE — Prompt but non-emergency vet visit'}**`;
}

module.exports = router;
