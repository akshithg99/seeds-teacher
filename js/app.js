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
// Each version site is its own repo, seeds-teacher-<version>, on the live site's origin (akshithg99.github.io),
// so it keeps its own keys. The live site (/seeds-teacher/) and localhost keep the plain keys.
const site = location.pathname.split("/")[1] || "";
const version = site.startsWith("seeds-teacher-") ? site.slice("seeds-teacher-".length) : "";
const NS = version ? "_" + version : "";
const KEY_KEY = "seeds_claude_key" + NS, STATE_KEY = "seeds_state_v1" + NS, SESSION_KEY = "seeds_session" + NS;

const store = new Store(local, STATE_KEY);
// FR-83 / FR-107: with Remember me unticked, the sign-in lasts only until the browser closes
if (store.state.signedInPhone && !store.state.rememberMe && !(session && session.getItem(SESSION_KEY))) {
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
player.onPosition = (clip, sec) => engine.saveAudioAt(clip, sec);
player.rate = store.state.audioRate || 1;

mountUI({
  engine, voice, claude, player, version,
  setSession: (remember) => { if (session) { if (remember) session.removeItem(SESSION_KEY); else session.setItem(SESSION_KEY, "1"); } },
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
  clearData: () => { voice.stopAll(); if (local) { local.removeItem(STATE_KEY); local.removeItem(KEY_KEY); } if (session) session.clear(); location.reload(); },
});

// Leaving the page or switching apps stops the agent and lesson audio, so nothing talks in the background.
document.addEventListener("visibilitychange", () => { if (document.hidden) { voice.stopAll(); player.pauseForAgent(); } });
