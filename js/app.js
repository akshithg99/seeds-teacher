import { Engine, Store } from "./engine.js";
import { ContentGenerator } from "./generator.js";
import { Claude } from "./claude.js";
import { AgentBrain } from "./brain.js";
import { SpeechIn, SpeechOut, Earcons, BargeIn, LessonPlayer, VoiceOrchestrator } from "./voice.js";
import { mountUI } from "./ui.js";

// Browser storage can be blocked (private windows, strict settings): the app then runs in memory only.
const safe = (get) => { try { const s = get(); const k = "__seeds_probe"; s.setItem(k, "1"); s.removeItem(k); return s; } catch { return null; } };
const local = safe(() => window.localStorage);
const session = safe(() => window.sessionStorage);
const KEY_KEY = "seeds_claude_key";

const store = new Store(local);
// FR-83 / FR-107: with Remember me unticked, the sign-in lasts only until the browser closes
if (store.state.signedInPhone && !store.state.rememberMe && !(session && session.getItem("seeds_session"))) {
  store.update((s) => ({ ...s, signedInPhone: null }));
}

const claude = new Claude((local && local.getItem(KEY_KEY)) || "");
const gen = new ContentGenerator(claude);
const player = new LessonPlayer();
const engine = new Engine(store, gen, player);
const brain = new AgentBrain(claude, engine);
const output = new SpeechOut();
output.rate = store.state.speechRate || 1;
const voice = new VoiceOrchestrator(engine, brain, new SpeechIn(), output, new Earcons(), player, new BargeIn());
player.onChange = () => engine.refresh();

mountUI({
  engine, voice, claude, player,
  setSession: (remember) => { if (session) { if (remember) session.removeItem("seeds_session"); else session.setItem("seeds_session", "1"); } },
  /** Saves the key only if Claude accepts it. Returns null on success, else a plain message. */
  saveKey: async (key) => {
    const before = claude.key;
    claude.configure(key);
    const err = await claude.test();
    if (err) { claude.configure(before); return err; }
    if (local) local.setItem(KEY_KEY, key);
    return null;
  },
  removeKey: () => { if (local) local.removeItem(KEY_KEY); claude.configure(""); },
  clearData: () => { voice.stopAll(); if (local) { local.removeItem("seeds_state_v1"); local.removeItem(KEY_KEY); } if (session) session.clear(); location.reload(); },
});

// Leaving the page or switching apps stops the agent and lesson audio, so nothing talks in the background.
document.addEventListener("visibilitychange", () => { if (document.hidden) { voice.stopAll(); player.pauseForAgent(); } });
