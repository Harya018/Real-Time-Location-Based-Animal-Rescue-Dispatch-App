// ================================================
// AI ROUTES — Gemini-powered Chatbot Endpoints
// ================================================
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
let genAI = null;

// Use the user's provided key by default, falling back to process.env if available
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const openaiClient = new OpenAI({ apiKey: OPENAI_KEY });

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

// ── POST /api/ai/report-incident ───────────────────────────────────────────
// Uses LLM to intelligently extract incident details from conversational text
router.post('/report-incident', async (req, res) => {
  const { text, history = [], currentData = {} } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });

  // System prompt to force structured JSON output
  const systemPrompt = `You are JeevaRaksha Dispatch AI.
Your goal is to parse user messages to extract details for an animal rescue SOS report.
Current gathered data: ${JSON.stringify(currentData)}
Recent User Message: "${text}"

RULES:
1. ONLY reply with valid JSON format. Do not use markdown blocks like \`\`\`json.
2. Structure: 
{
  "extractedData": { "type": "dog/cat/bird", "severity": "moderate/critical" },
  "action": "ASK_INFO" | "REQUEST_LOCATION" | "REQUEST_PHOTOS" | "COMPLETE",
  "reply": "Your natural language response to the user."
}
3. If 'type' is missing or unclear, set action="ASK_INFO" and politely ask what animal it is.
4. If 'type' is known but location is missing (currentData.location is null/undefined), set action="REQUEST_LOCATION" and ask for their location.
5. If 'type' and 'location' are known but 'photos' is empty, set action="REQUEST_PHOTOS" and ask for an image if possible.
6. If the user says they have no photo or uploaded one (handled strictly), or everything is provided, set action="COMPLETE", reply "Thank you! Generating the SOS signal now...".
7. Be concise, warm, and add an emoji.

Example: If user says "a dog is injured near me", you realize 'type' = 'dog'. Since 'location' is null, you return action="REQUEST_LOCATION".`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" }
    });
    
    // Attempt to parse JSON strictly
    let responseText = response.choices[0].message.content.trim();
    if (responseText.startsWith('\`\`\`json')) {
        responseText = responseText.replace(/^\`\`\`json/m, '').replace(/\`\`\`$/m, '').trim();
    }
    const result = JSON.parse(responseText);
    return res.json(result);

  } catch (err) {
    console.warn('[AI] Report-incident parsing error via OpenAI. Using Regex Fallback.', err.message);
    
    // Smart Fallback Regex Parser
    let action = 'ASK_INFO';
    let reply = "What kind of animal is it? (e.g., Dog, Cat, Bird)";
    let extractedData = {};
    
    const lowerText = text.toLowerCase();
    if (lowerText.includes('dog') || lowerText.includes('puppy')) extractedData.type = 'dog';
    else if (lowerText.includes('cat') || lowerText.includes('kitten')) extractedData.type = 'cat';
    else if (lowerText.includes('bird') || lowerText.includes('pigeon')) extractedData.type = 'bird';
    
    const type = extractedData.type || currentData.type;
    
    if (type && !currentData.location) {
      action = 'REQUEST_LOCATION';
      reply = `Got it, a ${type}. Can you share your location so I can find the nearest rescuer? 📍`;
    } else if (type && currentData.location && (!currentData.photos || currentData.photos.length === 0)) {
      action = 'REQUEST_PHOTOS';
      reply = "Location received! 📍 If you can, please share an image of the animal.";
    } else if (type && currentData.location && (lowerText.includes('no photo') || currentData.photos?.length > 0)) {
       action = 'COMPLETE';
       reply = "Thank you! Generating the SOS signal now...";
    }
    
    return res.json({ action, reply, extractedData });
  }
});

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

    const systemInstruction = `You are JeevaRaksha AI, a compassionate and knowledgeable animal rescue assistant.
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

    const systemInstruction = `You are JeevaRaksha Rescue Analyst AI — a veterinary triage assistant for field rescuers.
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

// ── POST /api/ai/analyze-animal ─────────────────────────────────────────────
// Feature 1: AI Animal Detection — structured rescue report from image
router.post('/analyze-animal', async (req, res) => {
  const { imageDataUrl, lat, lng, timestamp } = req.body;

  if (!imageDataUrl && !lat) {
    return res.status(400).json({ error: 'Image or location data is required' });
  }

  const locationStr = (lat && lng) ? `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}` : 'Unknown';
  const timeStr = timestamp || new Date().toISOString();

  if (!GEMINI_KEY) {
    return res.json({
      analysis: simulateAnimalAnalysis(imageDataUrl, locationStr, timeStr),
      simulated: true
    });
  }

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are JeevaRaksha Animal Detection AI. Analyze this image of a potentially injured or distressed animal.

Return ONLY valid JSON (no markdown, no code fences) with exactly these fields:
{
  "animal_type": "species name (Dog, Cat, Cow, Bird, etc.)",
  "possible_breed": "breed if identifiable, or 'Unknown'",
  "number_of_animals": 1,
  "visible_injuries": "description of visible injuries or 'No visible injuries'",
  "condition": "description of posture/state (lying down, bleeding, limping, trapped, etc.)",
  "severity_level": "Low / Medium / High / Critical",
  "urgency_level": "Non-Urgent / Moderate / Urgent / Critical",
  "environment_context": "description (Urban roadside, Forest area, Residential, etc.)",
  "recommended_action": "what should be done",
  "nearest_rescue_priority": true or false,
  "analysis_confidence": "percentage string like 85%"
}

Location: ${locationStr}
Timestamp: ${timeStr}

Analyze the image carefully. Be accurate about injuries and severity. Return ONLY the JSON object.`;

    const parts = [{ text: prompt }];
    const imgPart = dataUrlToPart(imageDataUrl);
    if (imgPart) parts.push(imgPart);

    const result = await model.generateContent(parts);
    let responseText = result.response.text().trim();

    // Strip markdown code fences if present
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const analysis = JSON.parse(responseText);
    analysis.location_coordinates = locationStr;
    analysis.timestamp = timeStr;

    return res.json({ analysis });
  } catch (err) {
    console.error('[AI] Analyze-animal error:', err.message);
    return res.json({
      analysis: simulateAnimalAnalysis(imageDataUrl, locationStr, timeStr),
      simulated: true
    });
  }
});

// ── Simulated animal analysis (demo fallback) ─────────────────────────────
function simulateAnimalAnalysis(imageDataUrl, locationStr, timeStr) {
  // Produce plausible mock data
  const animals = [
    { type: 'Dog', breed: 'Indian Street Dog (Pariah)', injuries: 'Possible leg fracture and superficial wounds', condition: 'Animal lying on roadside, unable to bear weight on front-left leg', severity: 'High', urgency: 'Critical', env: 'Urban roadside', action: 'Immediate rescue and veterinary assistance required. Stabilize limb before transport.', confidence: '82%' },
    { type: 'Cat', breed: 'Domestic Shorthair', injuries: 'Lacerations on torso, possible internal trauma', condition: 'Animal hiding in corner, labored breathing', severity: 'High', urgency: 'Critical', env: 'Residential area', action: 'Careful extraction, wrap in towel, emergency vet transport.', confidence: '78%' },
    { type: 'Dog', breed: 'Mixed breed (medium size)', injuries: 'Skin abrasions and dehydration', condition: 'Animal wandering slowly, appears disoriented and malnourished', severity: 'Medium', urgency: 'Urgent', env: 'Urban area near market', action: 'Provide water, capture gently, transport to shelter for treatment.', confidence: '85%' },
    { type: 'Bird', breed: 'Common Pigeon', injuries: 'Broken right wing, unable to fly', condition: 'Bird on ground, flapping one wing, alert but grounded', severity: 'Medium', urgency: 'Moderate', env: 'Urban park area', action: 'Pick up gently with cloth, place in dark ventilated box, transport to avian vet.', confidence: '90%' },
    { type: 'Cow', breed: 'Indigenous breed', injuries: 'Open wound on hind leg, signs of infection', condition: 'Animal standing but favoring injured leg, moderate distress', severity: 'High', urgency: 'Urgent', env: 'Semi-urban roadside', action: 'Contact large animal rescue unit. Do not attempt to move. Provide shade and water.', confidence: '75%' },
  ];

  const pick = animals[Math.floor(Math.random() * animals.length)];

  return {
    animal_type: pick.type,
    possible_breed: pick.breed,
    number_of_animals: 1,
    visible_injuries: pick.injuries,
    condition: pick.condition,
    severity_level: pick.severity,
    urgency_level: pick.urgency,
    environment_context: pick.env,
    recommended_action: pick.action,
    nearest_rescue_priority: pick.urgency === 'Critical' || pick.urgency === 'Urgent',
    analysis_confidence: pick.confidence,
    location_coordinates: locationStr,
    timestamp: timeStr
  };
}

// ── SIMULATION fallbacks (for demo without API key) ──────────────────────────
function simulateFirstAid(question, history = []) {
  const q = question.toLowerCase();
  // Build context from history for follow-up awareness
  const fullContext = history.map(h => (h.text || '')).join(' ').toLowerCase() + ' ' + q;

  // ── Dog / Stray ──
  if (q.includes('dog') || q.includes('puppy') || q.includes('stray dog')) {
    return `🐕 **First Aid for Injured/Stray Dog:**

**Immediate Steps:**
• Stay calm and approach slowly — avoid startling the animal
• If bleeding — apply gentle pressure using a clean cloth
• Do NOT give food or water to an injured animal (risk of choking)
• Keep the dog warm by covering with a blanket if available

**Keep it Calm:**
• Speak in low, soothing tones
• Avoid sudden movements or loud noises nearby
• Limit crowd gathering around the animal

**⛔ Do NOT:**
• Attempt to move a dog with possible spinal injury
• Remove embedded objects (glass, metal) yourself
• Muzzle a dog that has trouble breathing

🚨 **Rescuer is on the way — keep monitoring breathing and stay close!**`;
  }

  // ── Cat / Kitten ──
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

**Tiny Kittens (eyes still closed):**
• Keep warm — use a sock filled with uncooked rice, microwaved for 30 seconds
• Do NOT feed cow's milk (causes diarrhea) — use kitten formula or warm water temporarily

🚨 **JeevaRaksha rescuer is en route. Minimize handling and keep the area quiet.**`;
  }

  // ── Bird ──
  if (q.includes('bird') || q.includes('pigeon') || q.includes('parrot') || q.includes('crow') || q.includes('sparrow') || q.includes('chick')) {
    return `🐦 **First Aid for an Injured Bird:**

**Immediate Steps:**
• Gently pick up the bird using a soft cloth or towel
• Place it in a ventilated cardboard box with a soft lining (paper towels work well)
• Keep the box in a warm, dark, and quiet place — darkness calms birds

**If the wing appears broken:**
• Do NOT try to splint it yourself
• Keep the bird contained so it doesn't flap and worsen the injury

**Baby bird on the ground?**
• If feathered (fledgling) — leave it alone; parent is likely nearby
• If naked/eyes closed (nestling) — gently return to the nest if you can find it

**⛔ Do NOT:**
• Give food or water — aspiration risk is very high in birds
• Hold it too tightly — birds have fragile ribcages

🚨 **Rescuer is on the way. Keep the box closed and the area quiet!**`;
  }

  // ── Bleeding / Wound ──
  if (q.includes('bleed') || q.includes('blood') || q.includes('wound') || q.includes('cut') || q.includes('gash')) {
    return `🩸 **How to Handle a Bleeding Animal:**

**Step 1 — Stay Calm:**
The animal can sense your stress. Take a breath.

**Step 2 — Apply Pressure:**
• Use a clean cloth, gauze, or even a t-shirt
• Press firmly but gently over the wound
• Hold for at least 5 minutes without peeking

**Step 3 — Elevate if Possible:**
• If bleeding is on a limb, try to keep it slightly elevated

**Step 4 — Bandage Loosely:**
• Wrap the cloth around the wound — not too tight
• You should be able to fit one finger underneath

**⛔ Do NOT:**
• Use tourniquets — they can cause tissue death
• Remove embedded objects (leave for the vet)
• Pour antiseptic directly into a deep wound

**Signs of Severe Blood Loss (rush to vet):**
• Pale gums, rapid breathing, weakness, cold paws

🚨 **Keep pressure on the wound. The JeevaRaksha rescuer is coming!**`;
  }

  // ── Broken bone / Limping ──
  if (q.includes('broken') || q.includes('fracture') || q.includes('limp') || q.includes('leg') || q.includes('bone')) {
    return `🦴 **How to Help an Animal with a Suspected Fracture:**

**Signs of a Broken Bone:**
• Limping or refusing to put weight on a leg
• Swelling, unusual angle, or dangling limb
• Crying or yelping when the area is touched

**What to Do:**
• Keep the animal as still as possible — do NOT try to set the bone
• If it's a small animal, gently place it in a padded box
• For larger animals, create a soft barrier around them so they can't move far
• You can loosely splint with rolled newspaper + tape, but only if the animal lets you

**⛔ Do NOT:**
• Force the limb into a "normal" position
• Give human painkillers (ibuprofen and paracetamol are toxic to animals)
• Let the animal walk or run on the injured limb

🚨 **Immobilize and wait — the JeevaRaksha team will handle transport safely!**`;
  }

  // ── Trapped / Stuck ──
  if (q.includes('trap') || q.includes('stuck') || q.includes('drain') || q.includes('fence') || q.includes('well') || q.includes('hole') || q.includes('net')) {
    return `🕳️ **Animal Trapped or Stuck:**

**First, Assess the Situation:**
• Can you see the animal? Is it conscious and responsive?
• Is it in immediate danger (water rising, heat, predators)?
• Can you safely reach it, or do you need equipment?

**What You Can Do:**
• Talk softly to keep the animal calm
• If stuck in a net or wire — use scissors carefully, cutting AWAY from the body
• If in a drain or hole — do not pour water to "flush" it out
• Place food near the exit to encourage it to come out on its own

**If the Animal is Panicking:**
• Step back and reduce noise
• Sometimes a dark cloth placed over the animal calms it down
• Wait for the rescuer — forced extraction can cause injury

**⛔ Do NOT:**
• Reach into tight spaces blindly — frightened animals may bite
• Pull the animal by its limbs or tail

🚨 **Mark your location and stay nearby. Rescuers with proper extraction gear are on the way!**`;
  }

  // ── Poisoning ──
  if (q.includes('poison') || q.includes('toxic') || q.includes('ate something') || q.includes('vomit') || q.includes('chemical') || q.includes('pesticide')) {
    return `☠️ **Suspected Animal Poisoning — Act Fast!**

**Common Signs:**
• Excessive drooling, vomiting, or diarrhea
• Tremors, seizures, or difficulty walking
• Dilated pupils, rapid breathing
• Lethargy or sudden collapse

**What to Do Immediately:**
• Try to identify what the animal ate/was exposed to
• Take a photo of the substance or packaging if possible
• Do NOT induce vomiting unless a vet specifically tells you to
• Wipe any chemical off the fur with a damp cloth (wear gloves)

**If the Animal is Conscious:**
• Keep it calm and in a ventilated area
• Do NOT give milk — it doesn't neutralize poisons

**If the Animal is Unconscious:**
• Place it on its side (recovery position)
• Keep the airway clear — gently pull the tongue forward
• Monitor breathing

🚨 **This is time-critical! Rescuer + vet transport is being dispatched. Stay with the animal!**`;
  }

  // ── Snakebite ──
  if (q.includes('snake') || q.includes('bite') || q.includes('snakebite')) {
    return `🐍 **Animal Snakebite — Emergency Response:**

**Signs of Snakebite:**
• Sudden swelling at the bite site
• Two small puncture marks
• Pain, whimpering, drooling
• Rapid breathing, weakness, or collapse

**What to Do:**
• Keep the animal completely still — movement spreads venom faster
• Keep the bite area below heart level if possible
• Remove any collars or bands that could tighten as swelling increases
• Note the time of the bite — this helps the vet

**⛔ Do NOT:**
• Try to suck out the venom
• Apply ice or a tourniquet
• Cut the wound open
• Try to catch or kill the snake (just note its color/pattern if safe)

**Time is critical:**
• Antivenin is most effective within 4 hours
• Even "dry bites" (no venom) need vet check

🚨 **Keep the animal immobilized. JeevaRaksha emergency transport is on the way!**`;
  }

  // ── Heatstroke ──
  if (q.includes('heat') || q.includes('hot') || q.includes('panting') || q.includes('overheating') || q.includes('sun')) {
    return `🌡️ **Animal Heatstroke — Cool Down Carefully!**

**Signs of Heatstroke:**
• Heavy panting, drooling, bright red tongue
• Glazed eyes, unsteady walking
• Vomiting, rapid heartbeat
• Collapse or loss of consciousness

**Cooling Protocol (DO THIS NOW):**
1. Move the animal to shade or an air-conditioned area immediately
2. Apply cool (NOT ice-cold) water to the belly, paws, and ears
3. Place wet towels on the body — replace them every few minutes (they heat up)
4. Fan the animal while wetting the fur
5. Offer small sips of cool water if conscious — don't force

**⛔ Do NOT:**
• Use ice or ice-cold water — causes blood vessels to constrict, trapping heat inside
• Cover the animal completely with wet towels (traps heat)
• Leave the animal in a parked car — even for "just a minute"

🚨 **Continue cooling until the rescuer arrives. Heatstroke can be fatal within 15 minutes!**`;
  }

  // ── Drowning / Water ──
  if (q.includes('drown') || q.includes('water') || q.includes('pool') || q.includes('river') || q.includes('swimming')) {
    return `💧 **Animal in Water / Possible Drowning:**

**If the Animal is Still in Water:**
• Do NOT jump in unless you are a strong swimmer
• Use a long stick, rope, or board to help it reach the edge
• If in a pool — guide it to the steps

**If Just Rescued from Water:**
1. Hold small animals upside down briefly to drain water from lungs
2. For larger animals — lay on side with head lower than body
3. Check for breathing — if none, perform gentle chest compressions
4. Clear any debris from the mouth
5. Wrap in a dry towel/blanket to prevent hypothermia

**⛔ Do NOT:**
• Apply forceful CPR — animal ribcages are fragile
• Use a hairdryer to warm up (risk of burns)

🚨 **Time is critical! Keep the animal warm and the airway clear until rescue arrives.**`;
  }

  // ── Transport / How to move ──
  if (q.includes('transport') || q.includes('carry') || q.includes('move') || q.includes('take to vet') || q.includes('pick up')) {
    return `🚗 **How to Safely Transport an Injured Animal:**

**For Small Animals (cats, small dogs, birds):**
• Use a sturdy cardboard box with air holes
• Line with a soft towel or old t-shirt
• Cover the top — darkness reduces stress
• Keep the box level during transport

**For Medium/Large Dogs:**
• Use a flat board, blanket, or large towel as a stretcher
• Slide the animal onto it gently — do NOT lift by the limbs
• Have someone support the head during transport
• Secure in the car floor or back seat — never in an open truck bed

**During Transport:**
• Keep the vehicle cool and well-ventilated
• Drive smoothly — avoid sudden braking
• Keep the radio off or very low
• Have someone sit with the animal if possible

**⛔ Do NOT:**
• Let the animal sit on someone's lap (sudden movement risk)
• Transport an animal with suspected spinal injury without a board

🚨 **Contact the nearest vet clinic to alert them you're coming. JeevaRaksha can help locate one!**`;
  }

  // ── Feeding / Food ──
  if (q.includes('feed') || q.includes('food') || q.includes('hungry') || q.includes('eat') || q.includes('milk') || q.includes('water')) {
    return `🍽️ **Feeding Guidance for Rescued Animals:**

**⚠️ Important Rule:** Do NOT feed an injured animal unless it's been stable for at least 2 hours and is conscious and alert.

**Safe Foods by Animal Type:**

🐕 **Dogs:** Small amounts of plain boiled chicken, rice, or dog food. Fresh water always.
🐈 **Cats:** Wet cat food preferred. Plain boiled fish (no bones). Never cow's milk.
🐦 **Birds:** Soaked bread crumbs, seeds, or soft fruit pieces. Water in a shallow dish.
🐢 **Turtles:** Leafy greens, small fish pieces, commercial turtle pellets.

**For Baby Animals:**
• Puppies/Kittens: Kitten milk replacer (KMR) — NOT cow's milk
• Baby birds: Soaked dog food mashed into a paste, fed with tweezers
• Feed every 2-3 hours in small amounts

**⛔ Do NOT:**
• Give cow's milk to any wild or young animal
• Feed chocolate, onions, grapes, or garlic to dogs/cats
• Force-feed an unconscious or panicking animal
• Give bread soaked in milk to birds (causes crop problems)

🚨 **When in doubt, just provide fresh water in a shallow dish and wait for the rescuer!**`;
  }

  // ── Found a pet / Lost pet ──
  if (q.includes('found a pet') || q.includes('lost') || q.includes('collar') || q.includes('owner') || q.includes('tag')) {
    return `🔍 **Found a Lost Pet? Here's What to Do:**

**Step 1 — Check for Identification:**
• Look for a collar with tags (name, phone number)
• Check for a microchip — any vet clinic can scan for free
• Take clear photos of the animal from multiple angles

**Step 2 — Keep the Animal Safe:**
• If friendly, bring to a secure area (your yard, garage, room)
• Provide fresh water and a quiet resting space
• Do NOT keep it on a chain or in a cramped cage

**Step 3 — Report the Find:**
• Post on local social media groups (neighborhood / community pages)
• Contact nearby vet clinics and shelters — owners often call there first
• Use the JeevaRaksha app to file a "Found Pet" report
• Put up flyers in the area where you found the animal

**Step 4 — If No Owner is Found:**
• Contact your local animal welfare organization for foster/adoption
• Do NOT release a domesticated pet back onto the streets

🐾 **You're doing a wonderful thing by caring! JeevaRaksha is here to help reconnect pets with their families.**`;
  }

  // ── Assistance / General help ──
  if (q.includes('help') || q.includes('assist') || q.includes('what can') || q.includes('how do i') || q.includes('what should')) {
    return `🆘 **JeevaRaksha AI Assistant — How I Can Help:**

I'm here to guide you through animal emergencies! Here's what I can help with:

**🩹 First Aid Guidance:**
• Bleeding, wounds, broken bones
• Heatstroke, poisoning, snakebite
• Drowning, choking

**📦 Rescue Situations:**
• Animals trapped in drains, fences, walls
• Animals stuck on rooftops or trees
• Stray animals in dangerous locations

**🍼 Baby Animal Care:**
• Found a kitten, puppy, or baby bird?
• How to feed, warm, and protect them

**🚗 Transport Advice:**
• How to safely move an injured animal to a vet

**🔍 Lost & Found Pets:**
• Found a pet with/without a collar?

**Just describe your situation and I'll give you step-by-step guidance!** Try typing something like:
• "Found a bleeding dog on the road"
• "Kitten stuck in a drain"
• "Bird fell from a tree"
• "How do I transport an injured cat?"

🐾 **I'm always here. Type your question!**`;
  }

  // ── Turtle / Reptile ──
  if (q.includes('turtle') || q.includes('tortoise') || q.includes('lizard') || q.includes('reptile') || q.includes('iguana')) {
    return `🐢 **Helping an Injured Turtle or Reptile:**

**If a Turtle is Injured (cracked shell, hit by car):**
• Pick it up gently with both hands on either side of the shell
• Keep it level — do NOT flip it over
• Place in a shallow box lined with a damp cloth
• A cracked shell CAN heal with veterinary care — don't give up!

**If Crossing a Road:**
• Move it in the direction it was heading (they know where they're going)
• For snapping turtles — push gently from behind using a board

**For Lizards/Reptiles:**
• Gently scoop into a box with a secure lid (air holes!)
• Keep at room temperature — not too hot, not too cold
• Do NOT handle with bare hands if you suspect it's venomous

**⛔ Do NOT:**
• Paint or put anything on a cracked shell
• Release a pet turtle/tortoise into the wild
• Put a reptile in water unless it's an aquatic species

🚨 **Reptiles need specialized vet care. JeevaRaksha will connect you with the right clinic!**`;
  }

  // ── Cow / Large animal ──
  if (q.includes('cow') || q.includes('buffalo') || q.includes('horse') || q.includes('donkey') || q.includes('goat') || q.includes('large animal')) {
    return `🐄 **Helping a Large Animal (Cow, Horse, Buffalo):**

**⚠️ Safety First:** Large animals can be dangerous when injured. Keep a safe distance.

**What to Do:**
• Block traffic if the animal is on a road — use your vehicle's hazard lights
• Do NOT approach from behind — startled large animals kick
• Call local animal control or police in addition to JeevaRaksha
• If the animal is lying down, do not try to force it to stand

**If Bleeding:**
• Apply pressure with a large cloth if you can safely reach the area
• For leg injuries, do NOT try to bandage — wait for professionals

**If Hit by a Vehicle:**
• Do NOT move the animal
• Keep people and vehicles away
• Note the location and wait for rescue & veterinary teams

🚨 **Large animal rescue requires specialized equipment. JeevaRaksha is dispatching help!**`;
  }

  // ── Monkey / Wildlife ──
  if (q.includes('monkey') || q.includes('squirrel') || q.includes('rabbit') || q.includes('bat') || q.includes('wildlife') || q.includes('wild animal') || q.includes('fox') || q.includes('deer')) {
    return `🐒 **Helping Injured Wildlife:**

**⚠️ Important:** Wild animals are unpredictable when scared. Always prioritize your safety.

**What to Do:**
• Keep a safe distance — observe but don't crowd
• Cover the animal with a light cloth or towel to reduce stress (not for monkeys)
• Place small wildlife (squirrels, rabbits, bats) in a ventilated box
• Keep in a warm, dark, quiet place

**For Monkeys:**
• Do NOT approach — injured monkeys can be very aggressive
• Contact local wildlife authorities or JeevaRaksha immediately
• Keep bystanders away

**For Bats:**
• Use thick gloves or a towel — NEVER touch with bare hands (rabies risk)
• Place in a box with a small water dish
• Do NOT try to feed

**For Baby Wildlife:**
• Many "abandoned" babies are actually being watched by parents nearby
• Watch from a distance for 2-4 hours before intervening
• If truly orphaned, keep warm and contact a wildlife rehabilitator

🚨 **Wildlife rescue requires licensed handlers. JeevaRaksha will connect you with the right people!**`;
  }

  // ── Default catch-all (much improved) ──
  return `🐾 **JeevaRaksha Animal First Aid — Quick Guide:**

Thanks for reaching out! Here's some general guidance while I connect you with help:

**🩹 Immediate Actions for Any Injured Animal:**
• Approach slowly and speak softly — sudden movements cause panic
• If the animal is in danger (road, water), try to shield it without direct contact
• Cover with a light cloth or towel to reduce stress
• Keep bystanders and other animals away

**📋 Assess the Situation:**
• Is the animal breathing normally? Conscious?
• Any visible wounds, blood, or awkward limb positions?
• Was it hit by a vehicle, attacked, or found this way?

**🆘 While Waiting for Rescue:**
• Do NOT offer food or water (choking risk for injured animals)
• Keep the animal warm but not hot
• If possible, gently place in a ventilated box or create a barrier so it can't run into danger
• Note your exact location for the rescuer

**⛔ Things to Avoid:**
• Human medications (paracetamol, ibuprofen are toxic to most animals)
• Cow's milk for any animal
• Forceful handling or loud noises

**💡 For more specific help, try telling me:**
• What type of animal it is (dog, cat, bird, etc.)
• What the injury is (bleeding, limping, trapped, etc.)
• Or just describe the situation!

🚨 **JeevaRaksha rescuers are ready to help. You're already making a difference by being here! 💚**`;
}

function simulateRescuerReport(description, animalType, severity) {
  const desc = (description || '').toLowerCase();
  const animal = (animalType || 'animal').toLowerCase();

  // Severity-specific urgency text
  const urgencyMap = {
    critical: { icon: '🔴', label: 'CRITICAL — Immediate emergency vet care required', color: 'red', timeframe: 'within 30 minutes' },
    moderate: { icon: '🟡', label: 'MODERATE — Vet visit recommended within 1-2 hours', color: 'yellow', timeframe: 'within 2 hours' },
    stable:   { icon: '🟢', label: 'STABLE — Non-emergency vet visit when possible', color: 'green', timeframe: 'within 24 hours' }
  };
  const urgency = urgencyMap[severity] || urgencyMap.moderate;

  // Animal-specific handling tips
  const handlingTips = {
    dog: '• Muzzle if consciousness allows (injured dogs may bite reflexively)\n• Support hindquarters when lifting\n• Use a flat surface as a stretcher if spinal injury suspected',
    cat: '• Wrap in a towel for safe handling ("burrito wrap" technique)\n• Place in a dark carrier — darkness calms cats significantly\n• Watch for defensive scratching, even from friendly cats',
    bird: '• Handle with extreme care — bird bones are hollow and fragile\n• Place in a dark, ventilated box lined with paper towels\n• Do NOT offer water (aspiration risk is very high in birds)',
    other: '• Approach with caution — unfamiliar species may have unexpected defenses\n• Use thick gloves or a towel for handling\n• Contain in a ventilated box appropriate to the animal\'s size'
  };
  const handling = handlingTips[animal] || handlingTips.other;

  // Injury-context-specific notes
  let injuryNotes = '';
  if (desc.includes('bleed') || desc.includes('blood') || desc.includes('wound')) {
    injuryNotes = '\n• **Active bleeding detected:** Apply direct pressure with sterile gauze. Elevate if limb wound.\n• Pack wound loosely if deep laceration. Do NOT remove embedded objects.';
  } else if (desc.includes('hit') || desc.includes('vehicle') || desc.includes('car') || desc.includes('road')) {
    injuryNotes = '\n• **Vehicle trauma suspected:** Assume internal injuries. Minimal handling.\n• Check for abdominal swelling, pale gums, labored breathing.\n• Spinal precautions: use a rigid board for transport.';
  } else if (desc.includes('trap') || desc.includes('stuck') || desc.includes('drain') || desc.includes('fence')) {
    injuryNotes = '\n• **Entrapment case:** Assess for circulation loss in trapped limbs.\n• Cut entangling material AWAY from the body. Use padding to prevent further abrasion.\n• Check for compression injuries after release — watch for shock.';
  } else if (desc.includes('fall') || desc.includes('height') || desc.includes('roof') || desc.includes('tree')) {
    injuryNotes = '\n• **Fall trauma:** Check for jaw fractures (common in cats), limb fractures, internal bleeding.\n• Palpate ribcage gently for crepitus (grinding sensation = rib fracture).\n• Monitor for delayed onset shock.';
  }

  return `## 🔍 Visual Assessment
- **Animal Type:** ${animalType || 'Unknown'} | **Reported Severity:** ${urgency.icon} ${(severity || 'moderate').toUpperCase()}
- **Description:** "${description || 'No description provided by reporter'}"
- Assess for: consciousness level, breathing pattern, visible wounds, mobility
- Check mucous membranes (gums) — pink = normal, pale/white = shock, blue = oxygen deprivation${injuryNotes}

## ⚠️ Likely Issues
- Physical trauma indicated based on the report
- Stress-induced shock should be anticipated regardless of visible injuries
- Possible dehydration if the animal has been distressed for an extended period
- Risk of secondary infection if open wounds are present
- Internal injuries may not be immediately visible — monitor for deterioration

## 🛠️ Recommended On-Site Actions
**Approach & Secure:**
- Approach slowly at a 45° angle (less threatening than head-on)
- Speak in a low, calm voice continuously
${handling}

**Medical Assessment (ABCDE Protocol):**
- **A**irway — Clear any obstructions, position head for open airway
- **B**reathing — Count breaths per minute (normal: dogs 15-30, cats 20-30, birds 40-50)
- **C**irculation — Check pulse, gum color, capillary refill time (press gum, should pink up in <2 sec)
- **D**isability — Check pupil response, level of consciousness
- **E**xposure — Full body check for hidden wounds (check between toes, under tail, inside ears)

## 🚑 Transport Notes
- Wrap in a towel or blanket to reduce fear and conserve body heat
- Use a rigid surface for suspected spinal injuries
- Place in a ventilated carrier or box — secure against sliding
- Keep the vehicle cool, drive smoothly, avoid sudden braking
- **Nearest vet alert:** Call ahead so they're prepared for immediate intake
- **Estimated transport window:** ${urgency.timeframe}

## 🏥 Vet Priority Level
- **${urgency.icon} ${urgency.label}**
- Recommended diagnostics: X-ray, blood panel, wound culture (if applicable)
- Pre-vet stabilization: keep warm, control bleeding, maintain airway`;
}

module.exports = router;
