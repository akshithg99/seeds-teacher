import { match, hints, opening } from "./matcher.js";
import { Source, spoken, optionsPhrase, splitLang, stripLang, langCode } from "./step.js";

// ===================================================================== ASR (FR-101: one interface)

/**
 * Browser speech recognition, English (Indian) first (FR-92). Needs a connection on most browsers (D-111).
 * listen(hints, windowMs, long, L) with L = { onPartial, onFinal, onNoSpeech, onError(msg, quiet) }.
 * shortcut: the step's expected words (FR-101 hints) are not passed to the browser recogniser, which has no
 * stable way to take them; a cloud recogniser behind this same interface would use them (OQ-92).
 */
export class SpeechIn {
  constructor() {
    this.SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    this.rec = null; this.lang = "en-IN"; this.cancelled = false;
  }
  get available() { return !!this.SR; }
  get name() { return `browser recogniser (${this.lang})`; }
  /** Safari (iPhone, iPad, Mac) starts the recogniser only from a tap, not after the agent has spoken. */
  get needsTap() {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    return /iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|Android|FxiOS/.test(ua));
  }

  listen(_hints, windowMs, long, L, fromGesture) {
    this.cancel();
    this.cancelled = false;
    const r = new this.SR();
    this.rec = r;
    r.lang = this.lang; r.interimResults = true; r.maxAlternatives = 1; r.continuous = long;
    let finalText = "", interim = "", done = false, silence = null;
    const started = Date.now();
    const cap = setTimeout(() => { try { r.stop(); } catch { /* already stopped */ } }, windowMs);
    const finish = (fn) => { if (done) return; done = true; clearTimeout(cap); clearTimeout(silence); fn(); };
    r.onresult = (ev) => {
      interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += (finalText ? " " : "") + t.trim(); else interim += t;
      }
      L.onPartial((finalText + " " + interim).trim());
      if (long) { clearTimeout(silence); silence = setTimeout(() => { try { r.stop(); } catch { /* stopped */ } }, 2500); }
    };
    r.onerror = (ev) => {
      const err = ev.error;
      if (err === "no-speech" || err === "aborted") return; // onend follows
      if (err === "language-not-supported" && this.lang !== "en-US") { this.lang = "en-US"; finish(() => this.listen(_hints, windowMs, long, L, fromGesture)); return; }
      const msg = {
        network: "Speech recognition needs an internet connection. Carry on with the buttons.",
        "audio-capture": "No microphone was found. Carry on with the buttons.",
        "not-allowed": fromGesture ? "The microphone is blocked for this site. Allow it in the browser's site settings, or keep using the buttons." : "Tap the voice button to answer.",
        "service-not-allowed": fromGesture ? "This browser does not allow speech recognition here. Keep using the buttons." : "Tap the voice button to answer.",
      }[err] || `Speech recognition stopped (${err}). The buttons still work.`;
      finish(() => L.onError(msg, !fromGesture && (err === "not-allowed" || err === "service-not-allowed")));
    };
    r.onend = () => finish(() => {
      if (this.cancelled) return;
      const text = (finalText || interim).trim();
      if (text) L.onFinal(text, (Date.now() - started) / 1000); else L.onNoSpeech();
    });
    try { r.start(); } catch (e) { finish(() => L.onError("Speech recognition could not start. The buttons still work.", false)); }
  }
  /** End the listening window early; what was heard so far is kept. */
  stop() { if (this.rec) { try { this.rec.stop(); } catch { /* stopped */ } } }
  cancel() { this.cancelled = true; if (this.rec) { try { this.rec.abort(); } catch { /* stopped */ } } this.rec = null; }
}

// ===================================================================== TTS

const synth = () => (typeof window !== "undefined" ? window.speechSynthesis : null);

/** A voice for a content language, or null when the device has none (FR-110). English prefers Indian English (FR-92). */
export function voiceFor(lang) {
  const s = synth();
  if (!s) return null;
  // the newer neural voices sound far less robotic than the older defaults: try them first
  const natural = (v) => (/natural|neural|online|google|premium|enhanced|siri/i.test(v.name) ? 0 : 1);
  const voices = [...s.getVoices()].sort((a, b) => natural(a) - natural(b));
  const code = langCode(lang || "English").toLowerCase();
  const prefix = code.slice(0, 2);
  const norm = (v) => v.lang.toLowerCase().replace("_", "-");
  return voices.find((v) => norm(v) === code) || voices.find((v) => norm(v).startsWith(prefix + "-")) || voices.find((v) => norm(v) === prefix) ||
    (prefix === "en" ? voices.find((v) => /english/i.test(v.name)) || voices[0] || null : null);
}
export const hasVoice = (lang) => !lang || lang === "English" ? !!synth() : !!voiceFor(lang);

function sentences(text) {
  const out = [];
  for (const s of text.split(/(?<=[.!?।])\s+/)) {
    let x = s.trim();
    while (x.length > 220) { const cut = x.lastIndexOf(" ", 220); out.push(x.slice(0, cut > 40 ? cut : 220)); x = x.slice(cut > 40 ? cut + 1 : 220); }
    if (x) out.push(x);
  }
  return out;
}

/** The agent's voice. Content marked as Hindi, Tamil or Bengali is read in a voice for that language, never in English. */
export class SpeechOut {
  constructor() { this.rate = 1; this.token = 0; this.pending = 0; this.ended = true; this.onDone = null; this.warned = new Set(); }
  get available() { return !!synth(); }

  say(text, onDone) { this.stop(); this.begin(onDone); this.enqueue(text); this.end(); }
  begin(onDone) { this.token++; this.onDone = onDone; this.pending = 0; this.ended = false; this.warned = new Set(); }
  enqueue(text) {
    const s = synth();
    if (!s) return;
    for (const part of splitLang(text)) {
      const v = voiceFor(part.lang);
      if (part.lang && !v) {
        if (!this.warned.has(part.lang)) { this.warned.add(part.lang); this.utter(`This part is in ${part.lang}, and this device has no ${part.lang} voice, so I won't read it. It is on the screen.`, null); }
        continue;
      }
      sentences(part.text).forEach((x) => this.utter(x, part.lang ? v : voiceFor("English"), part.lang));
    }
  }
  utter(text, voice, lang) {
    const s = synth(), my = this.token;
    // said the way a person would: "Start (5 min):" -> "Start, 5 minutes:"
    const u = new SpeechSynthesisUtterance(text.replace(/\s*\((\d+) min\)/g, ", $1 minutes,").replace(/ · /g, ", "));
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : langCode(lang || "English");
    u.rate = this.rate;
    this.pending++;
    let fired = false;
    const done = () => { if (fired) return; fired = true; clearTimeout(dog); if (my !== this.token) return; this.pending--; this.check(); };
    // some browsers never fire onend; move on after a generous estimate
    const dog = setTimeout(done, 4000 + (text.split(/\s+/).length * 700) / this.rate);
    u.onend = done; u.onerror = done;
    s.speak(u);
  }
  /** A short spoken note while working. It sits in the speech queue ahead of the reply and is cut off by stop(). */
  note(text) {
    const s = synth(), v = voiceFor("English");
    if (!s) return;
    const u = new SpeechSynthesisUtterance(text);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = this.rate;
    s.speak(u);
  }
  end() { this.ended = true; this.check(); }
  check() { if (this.ended && this.pending <= 0 && this.onDone) { const f = this.onDone; this.onDone = null; f(); } }
  stop() { this.token++; this.onDone = null; const had = this.pending > 0; this.pending = 0; this.ended = true; if (had && synth()) synth().cancel(); }
}

/** Splits a streamed reply into sentences so speech starts before the whole reply has arrived. */
export class SentenceChunker {
  constructor() { this.buf = ""; }
  push(delta) {
    this.buf += delta;
    const out = [];
    let m;
    while ((m = this.buf.match(/^([\s\S]*?[.!?])(\s+)/))) { out.push(m[1].trim()); this.buf = this.buf.slice(m[0].length); }
    return out.filter(Boolean);
  }
  flush() { const s = this.buf.trim(); this.buf = ""; return s || null; }
}

// ===================================================================== sounds (FR-95)

export class Earcons {
  constructor() { this.ctx = null; this.loop = null; }
  unlock() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }
  tone(freqs, dur = 0.09, gain = 0.12) {
    if (!this.ctx) return;
    let t = this.ctx.currentTime;
    for (const f of freqs) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur);
      t += dur;
    }
  }
  listening() { this.tone([660, 880]); }
  endListening() { this.tone([880, 660]); }
  startWorking() { this.stopWorking(); this.loop = setInterval(() => this.tone([520], 0.05, 0.05), 900); }
  stopWorking() { clearInterval(this.loop); this.loop = null; }
}

// ===================================================================== barge-in (FR-93)

/**
 * Energy-based voice activity detection while the agent speaks. Off by default: browsers do not reliably
 * cancel their own speech voice from the microphone, so on loudspeakers the agent could stop itself.
 * Teachers who use headphones can turn it on in Settings. Never on in class (FR-104).
 */
export class BargeIn {
  constructor() { this.stream = null; this.timer = null; this.ctx = null; }
  async start(onSpeech) {
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const an = this.ctx.createAnalyser(); an.fftSize = 1024;
      this.ctx.createMediaStreamSource(this.stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let loud = 0;
      // calibration for real rooms: 300 ms above this level counts as the teacher speaking
      const THRESHOLD = 0.045;
      this.timer = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((a, x) => a + x * x, 0) / buf.length);
        loud = rms > THRESHOLD ? loud + 1 : 0;
        if (loud >= 6) { this.stop(); onSpeech(); }
      }, 50);
    } catch { this.stop(); }
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }
}

// ===================================================================== lesson audio (F7)

/**
 * Plays an approved clip's script through this device's voice for the clip's language, sentence by sentence,
 * so pause and resume work on every browser. Returns false from play() when there is no voice for the language.
 */
export class LessonPlayer {
  constructor() { this.clip = null; this.parts = []; this.i = 0; this.playing = false; this.token = 0; this.onFinished = null; this.onFailed = null; this.onChange = () => {}; }
  play(clip, onFinished, onFailed) {
    const s = synth();
    const v = voiceFor(clip.lang);
    if (!s || (clip.lang && clip.lang !== "English" && !v)) return false;
    this.stop();
    this.clip = clip; this.voice = v; this.parts = sentences(clip.script); this.i = 0;
    this.onFinished = onFinished; this.onFailed = onFailed;
    this.playing = true; this.next(); this.onChange();
    return true;
  }
  next() {
    const s = synth(), my = ++this.token;
    if (!this.playing) return;
    if (this.i >= this.parts.length) { this.playing = false; this.clip = null; this.onChange(); if (this.onFinished) this.onFinished(); return; }
    const u = new SpeechSynthesisUtterance(this.parts[this.i]);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice ? this.voice.lang : "en-IN";
    u.rate = 0.9; u.volume = 1; // classroom: slightly slower, full volume
    u.onend = () => { if (my !== this.token || !this.playing) return; this.i++; this.next(); };
    u.onerror = (ev) => {
      if (my !== this.token || !this.playing) return;
      if (ev.error === "interrupted" || ev.error === "canceled") return;
      this.stop(); if (this.onFailed) this.onFailed();
    };
    s.speak(u);
  }
  toggle() {
    if (!this.clip) return;
    if (this.playing) { this.playing = false; this.token++; synth().cancel(); } else { this.playing = true; this.next(); }
    this.onChange();
  }
  replay() { if (!this.clip) return; this.token++; synth().cancel(); this.i = 0; this.playing = true; this.next(); this.onChange(); }
  stop() { const had = !!this.clip; this.playing = false; this.clip = null; this.token++; if (had && synth()) synth().cancel(); if (had) this.onChange(); }
  isPlaying() { return this.playing; }
  hasMedia() { return !!this.clip; }
  /** The agent was woken: pause the lesson so the two never talk over each other (FR-61). */
  pauseForAgent() { if (this.playing) this.toggle(); }
}

// ===================================================================== orchestrator

/**
 * The orchestrator of the cascaded pipeline (ASR -> LLM -> TTS):
 * - one turn at a time: tone, listen (the recogniser ends the turn on silence, 15 s / 60 s cap, FR-91), tone
 * - fast path for constrained answers on the device, otherwise Claude with tools (streamed)
 * - streams Claude's text into speech sentence by sentence
 * - barge-in while speaking (opt-in, never in class: only a tap or key stops it there, FR-104)
 * - cancel while working: nothing from that turn is applied (FR-99)
 * - miss recovery: ask again, then read the options, then show them as buttons (FR-56)
 */
export class VoiceOrchestrator {
  constructor(engine, brain, input, output, earcons, player, vad) {
    Object.assign(this, { engine, brain, input, output, earcons, player, vad });
    this.state = "SLEEP"; this.heard = ""; this.said = ""; this.showOptions = false; this.turnInfo = "";
    this.awake = false; this.interrupted = false; this.misses = 0; this.missStep = ""; this.forceListen = false;
    this.abort = null; this.listeners = new Set();
    engine.subscribe((src) => {
      // say what it is doing while a voice request is worked on: "Preparing your lesson plan."
      if (engine.busy && engine.busy !== this.narrated && this.state === "THINKING") { this.narrated = engine.busy; this.output.note(engine.busy.replace(/…$/, ".")); }
      if (!engine.busy) this.narrated = null;
      if (src && src !== Source.VOICE && this.showOptions) { this.showOptions = false; this.emit(); }
      // app-caused changes (lesson audio finished or failed) are announced only if the teacher was last using the agent
      if (src === Source.SYSTEM && this.voiceSession && this.state === "SLEEP") this.speak(spoken(engine.step), false);
    });
  }
  subscribe(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit() { this.listeners.forEach((f) => f()); }
  set(patch) { Object.assign(this, patch); this.emit(); }

  /** The voice button or the laptop shortcut. One press starts a turn (FR-90). */
  onVoiceButton() {
    this.earcons.unlock();
    switch (this.state) {
      case "SPEAKING": this.interrupt(); break; // FR-93: stops speech at once, then listens
      case "THINKING": this.cancelTurn(); break; // FR-99
      case "LISTENING": this.input.stop(); break; // end the listening window early
      default: this.wake();
    }
  }

  wake() {
    if (!this.engine.st.signedInPhone) {
      // FR-84: the agent never listens to or repeats credentials
      this.speak("Please type your phone number and password on the screen. I don't listen to them.", false);
      return;
    }
    if (!this.input.available) { this.speak("This browser can't listen. Use Chrome, Edge or Safari for the voice guide. The buttons work everywhere.", false); return; }
    this.player.pauseForAgent();
    this.brain.newConversation();
    this.awake = true; this.misses = 0; this.voiceSession = true;
    // Safari only lets the recogniser start inside the tap itself, so there it listens at once (the tone is the greeting)
    if (this.input.needsTap) { this.listen(true); return; }
    this.forceListen = true;
    this.speak(this.greeted ? "Yes, how can I help?" : "Hi, how can I help?", true);
    this.greeted = true;
  }

  /** Any tap on the screen stops the agent's speech at once (FR-93), without starting to listen. */
  quietForTap() {
    if (this.state === "SPEAKING" || this.state === "LISTENING") {
      this.interrupted = true;
      if (this.abort) this.abort.abort();
      this.output.stop(); this.input.cancel();
      this.sleep();
    }
  }

  /**
   * After a button action. Buttons never start the agent: only a button that asks to hear something
   * ("Hear them") is spoken, and the agent does not listen afterwards. The voice button is the only way in.
   */
  afterButton(result, read) {
    this.voiceSession = false;
    if (this.player.isPlaying()) return; // never talk over lesson audio (FR-61)
    if (read && result) this.speak(result, false);
  }

  sleep() { this.awake = false; this.vad.stop(); this.input.cancel(); this.earcons.stopWorking(); this.set({ state: "SLEEP" }); }
  stopAll() { if (this.abort) this.abort.abort(); this.output.stop(); this.sleep(); }

  // ------------------------------------------------------------------ turn

  listen(fromGesture = false) {
    this.vad.stop();
    const step = this.engine.step;
    if (step.id !== this.missStep) { this.misses = 0; this.missStep = step.id; }
    this.set({ state: "LISTENING", heard: "" });
    this.earcons.listening();
    const long = !!step.freeSpeech;
    const go = () => {
      if (this.state !== "LISTENING") return;
      this.input.listen(hints(step), long ? 60000 : 15000, long, {
        onPartial: (t) => this.set({ heard: t }),
        onFinal: (t, secs) => { this.earcons.endListening(); this.set({ heard: t }); this.handle(t, secs); },
        onNoSpeech: () => { this.earcons.endListening(); this.onMiss(true); },
        onError: (msg, quiet) => {
          this.earcons.endListening();
          this.awake = false;
          this.set({ turnInfo: "Voice: " + msg });
          if (quiet) this.sleep(); else this.speak(msg, false);
        },
      }, fromGesture);
    };
    // iOS only allows the recogniser to start inside the tap itself; elsewhere keep the start tone out of it
    if (fromGesture) go(); else setTimeout(go, 250);
  }

  afterAction(said) {
    if (this.engine.pending) return said;
    return [said, spoken(this.engine.step)].filter(Boolean).join(" ");
  }

  async handle(text, secs = 0) {
    this.set({ state: "THINKING" });
    this.earcons.startWorking();
    this.interrupted = false;
    const e = this.engine;
    try {
      const intent = match(text, e.step, e.pending);
      let reply = null;
      if (intent.type === "command") {
        if (intent.name === "stop") { this.earcons.stopWorking(); this.sleep(); return; }
        reply = e.command(intent.name, Source.VOICE);
      } else if (intent.type === "choose") reply = this.afterAction(await e.choose(intent.choiceId, Source.VOICE));
      else if (intent.type === "goto") reply = await e.goTo(intent.flow, Source.VOICE);
      else if (intent.type === "confirm") reply = this.afterAction(await e.confirmPending(Source.VOICE, text));
      else if (intent.type === "cancel") reply = e.cancelPending() + " " + e.step.question;
      if (reply != null) {
        this.misses = 0;
        this.set({ turnInfo: `Heard by the ${this.input.name} · understood on this device (no AI call)` });
        e.log("voice_turn", null, Source.VOICE, `fast path, ${secs.toFixed(1)} s of speech`);
        this.speak(reply, true);
        return;
      }
      if (this.brain.available) await this.llmTurn(text, secs); else this.offlineTurn(text, secs);
    } catch (err) {
      this.earcons.stopWorking();
      this.speak(`Sorry, I couldn't do that. ${String((err && err.message) || "").slice(0, 100)} The buttons still work.`, false);
    }
  }

  async llmTurn(text, secs) {
    const e = this.engine, chunker = new SentenceChunker();
    const cp = e.checkpoint();
    const ac = new AbortController(); this.abort = ac;
    let spoke = false, said = "";
    const startSpeaking = () => { if (spoke) return; spoke = true; this.earcons.stopWorking(); this.set({ state: "SPEAKING" }); this.startBargeIn(); };
    this.output.begin(() => this.afterSpeaking());
    let usage;
    try {
      usage = await this.brain.turn(text, (delta) => {
        if (this.interrupted || ac.signal.aborted) return;
        for (const s of chunker.push(delta)) { startSpeaking(); this.output.enqueue(s); said += s + " "; this.set({ said: stripLang(said) }); }
      }, ac.signal);
    } catch (err) {
      this.abort = null;
      if (ac.signal.aborted) {
        if (!this.interrupted) {
          // FR-99: cancelled while working, so nothing from the turn stays applied
          e.rollback(cp); this.brain.newConversation(); this.earcons.stopWorking();
          this.speak("Cancelled. Nothing from that turn was applied.", false);
        }
        return;
      }
      this.brain.newConversation();
      throw new Error(plainLLMError(err));
    }
    this.abort = null;
    if (this.interrupted) return;
    const rest = chunker.flush();
    if (rest) { startSpeaking(); this.output.enqueue(rest); said += rest; this.set({ said: stripLang(said) }); }
    this.set({ turnInfo: `Heard by the ${this.input.name} · Claude ${usage.model}: ${usage.inputTokens} in / ${usage.outputTokens} out tokens · about $${usage.estCostUsd.toFixed(4)}` });
    e.log("voice_turn", null, Source.VOICE, `claude in=${usage.inputTokens} out=${usage.outputTokens} cost=${usage.estCostUsd.toFixed(5)} speech=${secs.toFixed(1)}s`);
    if (this.brain.missed && !spoke) { this.output.stop(); this.onMiss(false); return; }
    if (!spoke) { this.earcons.stopWorking(); this.output.stop(); this.speak(spoken(e.step), true); return; }
    if (!this.brain.missed) this.misses = 0;
    this.output.end();
  }

  async offlineTurn(text, secs) {
    const e = this.engine, step = e.step;
    this.set({ turnInfo: `Heard by the ${this.input.name} · understood on this device (no Claude key)` });
    e.log("voice_turn", null, Source.VOICE, `offline, ${secs.toFixed(1)} s of speech`);
    let reply = null;
    if (step.freeSpeech) reply = this.afterAction(await e.submitText(text, Source.VOICE));
    else { const o = opening(text); if (o) reply = await e.fillDetails(o.intent, o.classNum, o.day, o.period, o.chapter, null, Source.VOICE); }
    if (reply == null) this.onMiss(false); else { this.misses = 0; this.speak(reply, true); }
  }

  /** FR-56: ask once more, then read the options, then offer them as buttons. Earlier answers are kept. */
  onMiss(silence) {
    this.earcons.stopWorking();
    this.misses++;
    const step = this.engine.step;
    if (this.misses === 1) { this.forceListen = true; this.speak((silence ? "I didn't hear anything. " : "Sorry, I didn't catch that. ") + step.question, true); }
    else if (this.misses === 2) { this.forceListen = true; this.speak(`Let me put it another way. ${step.question} ${optionsPhrase(step, true)}`, true); }
    else { this.set({ showOptions: true }); this.misses = 0; this.speak("I'm having trouble hearing you. The choices are on the screen as buttons, or press the voice button and try me again.", false); }
  }

  // ------------------------------------------------------------------ speaking

  speak(text, keepAwake) {
    this.earcons.stopWorking();
    if (!keepAwake) this.awake = false;
    if (!this.output.available) { this.set({ said: stripLang(text) }); this.afterSpeaking(); return; }
    this.set({ said: stripLang(text), state: "SPEAKING" });
    this.output.say(text, () => this.afterSpeaking());
    this.startBargeIn();
  }

  afterSpeaking() {
    this.vad.stop();
    const e = this.engine, step = e.step;
    const follow = this.awake && (this.forceListen || !!e.pending || (e.voiceGuideOn && !step.inClass && step.choices.length > 0));
    this.forceListen = false;
    if (follow && e.st.signedInPhone && this.input.available) this.listen(false); else this.sleep();
  }

  startBargeIn() {
    if (!this.engine.st.bargeIn || this.engine.step.inClass) return;
    this.vad.start(() => { if (this.state === "SPEAKING") this.interrupt(); });
  }

  /** Barge-in, tap or key while speaking: stop at once and listen (FR-93). */
  interrupt() {
    this.interrupted = true;
    if (this.abort) this.abort.abort();
    this.output.stop(); this.vad.stop();
    if (!this.engine.st.signedInPhone || !this.input.available) { this.sleep(); return; }
    this.awake = true;
    this.listen(true);
  }

  cancelTurn() { if (this.abort) this.abort.abort(); else { this.output.stop(); this.sleep(); } }
}

function plainLLMError(err) {
  const s = (err && err.status) || 0, m = String((err && err.message) || err || "");
  if (s === 401 || /authentication/i.test(m)) return "The Claude key is not accepted. Check it in Settings.";
  if (s === 429) return "Claude is busy or the key's limit is reached.";
  if (/fetch|network|load/i.test(m)) return "The connection is weak or off.";
  return m.slice(0, 100);
}
