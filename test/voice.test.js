// The voice orchestrator with fake ears, voice and brain: fast path, miss recovery (FR-56), cancel (FR-99).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Engine, Store } from "../js/engine.js";
import { ContentGenerator } from "../js/generator.js";
import { Claude } from "../js/claude.js";
import { Source } from "../js/step.js";
import { VoiceOrchestrator, SentenceChunker, SpeechOut } from "../js/voice.js";

const noop = () => {};
let e, v, out, brain;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  e = new Engine(new Store(null), new ContentGenerator(new Claude("")), { play: () => true, toggle: noop, replay: noop, stop: noop, isPlaying: () => false, hasMedia: () => false });
  e.signIn("9000000001", "seeds123", true);
  await e.choose("no", Source.BUTTON);
  out = { available: true, said: [], notes: [], say(t, done) { this.said.push(t); this.done = done; }, note(t) { this.notes.push(t); }, begin(d) { this.done = d; }, enqueue(t) { this.said.push(t); }, end() {}, stop() {} };
  const input = { available: true, name: "fake recogniser", listen(_h, _w, _l, L) { this.L = L; }, stop: noop, cancel: noop };
  brain = { available: false, missed: false, newConversation: noop, turn: async () => ({}) };
  v = new VoiceOrchestrator(e, brain, input, out, { listening: noop, endListening: noop, startWorking: noop, stopWorking: noop, unlock: noop },
    { pauseForAgent: noop, isPlaying: () => false }, { start: noop, stop: noop });
});

test("fast path answers on the device, with no AI call", async () => {
  await e.choose("plan", Source.BUTTON);
  await v.handle("two");
  assert.equal(e.step.id, "pick_subject");
  await v.handle("maths");
  assert.equal(e.step.id, "plan_chapter");
  assert.match(out.said.at(-1), /Which chapter\?/);
  assert.match(v.turnInfo, /no AI call/);
});

test("a miss asks again, then reads the options, then shows buttons (FR-56)", async () => {
  await v.handle("banana");
  assert.match(out.said.at(-1), /didn't catch that/);
  await v.handle("banana");
  assert.match(out.said.at(-1), /^Let me put it another way\. .*You can say /);
  assert.doesNotMatch(out.said.at(-1), /\d, /); // no numbered menu
  await v.handle("banana");
  assert.ok(v.showOptions);
  assert.equal(e.step.id, "home"); // nothing was changed by the misses
});

test("cancelling a Claude turn while it works applies nothing (FR-99)", async () => {
  brain.available = true;
  brain.turn = (_t, _on, signal) => new Promise((_res, rej) => {
    e.setClassLang(7, "Tamil"); // the model's tool call already ran
    signal.addEventListener("abort", () => rej(new Error("aborted")));
  });
  const p = v.handle("set class seven to tamil and keep going");
  await tick();
  assert.equal(e.classLang(7), "Tamil");
  v.cancelTurn();
  await p;
  assert.equal(e.classLang(7), null);
  assert.equal(out.said.at(-1), "Cancelled. Nothing from that turn was applied.");
});

test("a commit by voice needs its own word", async () => {
  await e.choose("plan", Source.BUTTON);
  await e.choose("c6", Source.BUTTON); await e.choose("Science", Source.BUTTON); await e.choose("__more", Source.BUTTON); await e.choose("6-measure", Source.BUTTON); await e.choose("yes", Source.BUTTON);
  await v.handle("english");
  assert.ok(e.pending, "language is read back first");
  await v.handle("yes");
  assert.equal(e.classLang(6), "English");
});

test("waking greets, then listens; work in progress is said aloud", async () => {
  v.input.needsTap = false;
  v.wake();
  assert.equal(out.said.at(-1), "Hi, how can I help?");
  out.done(); // greeting finished
  assert.equal(v.state, "LISTENING");
  v.sleep(); v.wake();
  assert.equal(out.said.at(-1), "Yes, how can I help?");
  // a voice request that prepares something says what it is doing
  await e.choose("plan", Source.BUTTON); await e.choose("c6", Source.BUTTON); await e.choose("Science", Source.BUTTON); await e.choose("__more", Source.BUTTON); await e.choose("6-magnets", Source.BUTTON);
  e.setClassLang(6, "English"); await v.handle("yes");
  assert.deepEqual(out.notes, ["Preparing your lesson."]);
  assert.equal(e.step.id, "plan_review");
});

test("one request and one yes plan the whole lesson, then the teacher reviews it", async () => {
  e.setClassLang(7, "English");
  v.awake = true;
  await v.handle("Plan Class 7 Science for Thursday");
  assert.equal(e.step.id, "plan_confirm");
  assert.match(out.said.at(-1), /^Class 7, science[.] Start with chapter 1, The Ever-Evolving World of Science[?]$/);
  await v.handle("yes");
  assert.equal(e.step.id, "plan_review");
  assert.ok(out.notes.includes("Preparing your lesson."));
  assert.equal(out.said.at(-1), "Ready. Please review your lesson. Shall we go through it now?");
  const l = e.lesson();
  assert.ok(l.tik && l.questionSets.length && l.audio.length, "TIK, questions and audio are all prepared");
  // "yes" again goes through them one by one; the Content Studio TIK is in use as it is, so it starts with the questions
  await v.handle("yes");
  assert.equal(e.step.id, "qs_review");
  // "no" to the offered chapter keeps the class and asks for the chapter
  await v.handle("Plan Class 7 Science for Thursday"); await v.handle("no");
  assert.equal(e.step.id, "plan_chapter");
});

test("buttons never start the agent, even with the voice guide on", async () => {
  e.setVoiceGuide(true);
  const before = out.said.length;
  v.afterButton(await e.choose("plan", Source.BUTTON), false);
  v.afterButton(e.selectTab(1), false);
  assert.equal(out.said.length, before);
  assert.equal(v.state, "SLEEP");
  // "Hear them" is spoken because the tap asked for it, but the agent does not start listening
  v.afterButton("Question one.", true);
  assert.equal(out.said.at(-1), "Question one.");
  out.done();
  assert.equal(v.state, "SLEEP");
  // lesson audio finishing is not announced after button use
  e.notify(Source.SYSTEM);
  assert.equal(out.said.at(-1), "Question one.");
});

test("Safari listens straight from the tap, with no spoken greeting", () => {
  v.input.needsTap = true;
  const before = out.said.length;
  v.wake();
  assert.equal(v.state, "LISTENING");
  assert.equal(out.said.length, before);
});

test("streamed text is spoken sentence by sentence", () => {
  const c = new SentenceChunker();
  assert.deepEqual(c.push("Done. Now say"), ["Done."]);
  assert.deepEqual(c.push(" 1, Approve. "), ["Now say 1, Approve."]);
  assert.equal(c.flush(), null);
});

test("Speech: a voice the phone lacks is retried in the phone's default voice, and silence is reported", async () => {
  const spoken = [];
  class U { constructor(text) { this.text = text; } }
  // a phone whose engine fails any utterance that names a language or voice
  globalThis.SpeechSynthesisUtterance = U;
  globalThis.window = { speechSynthesis: { paused: false, getVoices: () => [], cancel() {}, resume() {},
    speak(u) { setTimeout(() => { if (u.lang || u.voice) u.onerror({ error: "language-unavailable" }); else { spoken.push(u.text); u.onstart(); u.onend(); } }, 0); } } };
  try {
    const so = new SpeechOut();
    await new Promise((done) => so.say("Hello there. Shall we start?", done));
    assert.deepEqual(spoken, ["Hello there.", "Shall we start?"]);
    assert.equal(so.spoke, true);
    assert.equal(so.lastError, "language-unavailable");
    // a phone that plays nothing at all: the orchestrator says so on screen
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onerror({ error: "synthesis-failed" }), 0);
    v.output = so;
    await new Promise((done) => { so.say("Hi.", () => { v.afterSpeaking(); done(); }); });
    assert.match(v.turnInfo, /didn't play my reply \(synthesis-failed\)/);
  } finally { delete globalThis.window; delete globalThis.SpeechSynthesisUtterance; }
});

test("the Speak button turns the agent on; it keeps listening and answering until the button turns it off", async () => {
  const listens = () => v.state === "LISTENING";
  v.onVoiceButton(); // on
  assert.ok(v.on);
  assert.equal(out.said.at(-1), "Hi, how can I help?");
  out.done();
  assert.ok(listens(), "listens after the greeting");
  // silence is not a miss: it just keeps listening, without asking again
  const before = out.said.length;
  await new Promise((r) => setTimeout(r, 300)); // the recogniser starts just after the tone
  v.input.L.onNoSpeech();
  assert.ok(listens());
  assert.equal(out.said.length, before);
  // one question after another, each answered, and it listens again every time
  await v.handle("plan"); out.done();
  assert.ok(listens());
  await v.handle("class six"); out.done();
  assert.ok(listens());
  assert.equal(e.step.id, "pick_subject");
  // three misses show the buttons, but it is still on and listening
  for (let k = 0; k < 3; k++) { await v.handle("banana"); out.done(); }
  assert.ok(v.showOptions && v.on && listens());
  // a tap on a button while it is on: the action is done and it keeps listening
  v.afterButton(await e.choose("Science", Source.BUTTON), false);
  assert.ok(listens());
  // the next press turns it off, whatever it is doing
  v.onVoiceButton();
  assert.equal(v.on, false);
  assert.equal(v.state, "SLEEP");
  v.afterButton(await e.choose("home", Source.BUTTON), false);
  assert.equal(v.state, "SLEEP"); // off stays off
  // saying "stop" also turns it off
  v.onVoiceButton(); out.done();
  await v.handle("stop");
  assert.equal(v.on, false);
});

test("while on, the agent stops listening when lesson audio starts, and picks up again when it ends", async () => {
  let playing = false;
  v.player.isPlaying = () => playing;
  v.onVoiceButton(); out.done();
  assert.equal(v.state, "LISTENING");
  playing = true; // the teacher taps Play audio
  v.afterButton("", false);
  assert.equal(v.state, "SLEEP");
  assert.ok(v.on, "still on");
  playing = false; // the audio ends
  e.notify(Source.SYSTEM);
  assert.equal(v.state, "SPEAKING");
  out.done();
  assert.equal(v.state, "LISTENING");
});

test("while lesson audio plays, the Speak button pauses it and listens; a command that plays it again is not talked over", async () => {
  let playing = false;
  v.player.isPlaying = () => playing;
  v.player.pauseForAgent = () => { playing = false; };
  v.onVoiceButton(); out.done();
  playing = true; v.sleep(); // the audio started: the agent waits, still on
  v.onVoiceButton();
  assert.ok(v.on && !playing, "paused, not turned off");
  assert.equal(out.said.at(-1), "Yes, how can I help?");
  out.done();
  const n = out.said.length;
  e.command = () => { playing = true; return ""; }; // e.g. "back 30 seconds" plays it again
  await v.handle("repeat");
  assert.equal(out.said.length, n);
  assert.ok(v.on && v.state === "SLEEP");
});
