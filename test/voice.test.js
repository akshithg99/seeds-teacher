// The voice orchestrator with fake ears, voice and brain: fast path, miss recovery (FR-56), cancel (FR-99).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Engine, Store } from "../js/engine.js";
import { ContentGenerator } from "../js/generator.js";
import { Claude } from "../js/claude.js";
import { Source } from "../js/step.js";
import { VoiceOrchestrator, SentenceChunker } from "../js/voice.js";

const noop = () => {};
let e, v, out, brain;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  e = new Engine(new Store(null), new ContentGenerator(new Claude("")), { play: () => true, toggle: noop, replay: noop, stop: noop, isPlaying: () => false, hasMedia: () => false });
  e.signIn("9000000001", "seeds123", true);
  await e.choose("no", Source.BUTTON);
  out = { available: true, said: [], say(t, done) { this.said.push(t); this.done = done; }, begin(d) { this.done = d; }, enqueue(t) { this.said.push(t); }, end() {}, stop() {} };
  const input = { available: true, name: "fake recogniser", listen(_h, _w, _l, L) { this.L = L; }, stop: noop, cancel: noop };
  brain = { available: false, missed: false, newConversation: noop, turn: async () => ({}) };
  v = new VoiceOrchestrator(e, brain, input, out, { listening: noop, endListening: noop, startWorking: noop, stopWorking: noop, unlock: noop },
    { pauseForAgent: noop, isPlaying: () => false }, { start: noop, stop: noop });
});

test("fast path answers on the device, with no AI call", async () => {
  await e.choose("plan", Source.BUTTON);
  await v.handle("two");
  assert.equal(e.step.id, "plan_chapter");
  assert.match(out.said.at(-1), /Which chapter\?/);
  assert.match(v.turnInfo, /no AI call/);
});

test("a miss asks again, then reads the options, then shows buttons (FR-56)", async () => {
  await v.handle("banana");
  assert.match(out.said.at(-1), /didn't catch that/);
  await v.handle("banana");
  assert.match(out.said.at(-1), /^Here are the options\./);
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
  await e.choose("c6", Source.BUTTON); await e.choose("6-measure", Source.BUTTON); await e.choose("6-measure-1", Source.BUTTON); await e.choose("yes", Source.BUTTON);
  await v.handle("english");
  assert.ok(e.pending, "language is read back first");
  await v.handle("yes");
  assert.equal(e.classLang(6), "English");
});

test("streamed text is spoken sentence by sentence", () => {
  const c = new SentenceChunker();
  assert.deepEqual(c.push("Done. Now say"), ["Done."]);
  assert.deepEqual(c.push(" 1, Approve. "), ["Now say 1, Approve."]);
  assert.equal(c.flush(), null);
});
