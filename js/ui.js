import { Source, Tier, Flow, stripLang, langCode, spoken, AUDIO_SPEEDS } from "./step.js";
import { TikTabs } from "./tiktabs.js";
import { LANGS, Curriculum } from "./data.js";
import { KEY_REJECTED } from "./claude.js";
import { hasVoice } from "./voice.js";

// ------------------------------------------------------------------ tiny DOM helper
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const svg = (path) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = path; return s; };
const ICON = {
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  gear: '<path d="M18.93 10.05L21.47 10.45L21.47 13.55L18.93 13.95L18.28 15.53L19.79 17.60L17.60 19.79L15.53 18.28L13.95 18.93L13.55 21.47L10.45 21.47L10.05 18.93L8.47 18.28L6.40 19.79L4.21 17.60L5.72 15.53L5.07 13.95L2.53 13.55L2.53 10.45L5.07 10.05L5.72 8.47L4.21 6.40L6.40 4.21L8.47 5.72L10.05 5.07L10.45 2.53L13.55 2.53L13.95 5.07L15.53 5.72L17.60 4.21L19.79 6.40L18.28 8.47Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  home: '<path d="M4 11l8-6.5 8 6.5V20h-5.5v-5.5h-5V20H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  plan: '<path d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5V20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  history: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  workspace: '<path d="M4 7.5L12 4l8 3.5-8 3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 12l8 3.5 8-3.5M4 16.5L12 20l8-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  dots: '<circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/>',
};
const lc = (lang) => (lang && lang !== "English" ? langCode(lang) : null);
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
export const SHORTCUT_TEXT = "Ctrl + Shift + Space";

export function mountUI({ engine, voice, claude, player, saveKey, removeKey, clearData, setSession, version = "" }) {
  const app = document.getElementById("app");
  const ui = { navOpen: false, freeText: "", feedback: "", feedbackTimer: null, lastStepId: null, lastSignedIn: null, signInErr: "", showPw: false };

  // DOM order sets focus order: the voice bar comes first on every screen (FR-90), the layout puts it at the bottom.
  const voiceEl = h("section", { class: "voice", "aria-label": "Voice guide" });
  const topEl = h("header", { class: "topbar" });
  // Testers must be able to tell the preview site from the live one at a glance.
  const badgeText = !version ? "" : version === "preview" ? "Preview" : `Preview: ${version}`;
  const badge = () => badgeText ? h("span", { class: "badge" }, badgeText) : null;
  if (badgeText) document.title = `${badgeText} · ${document.title}`;
  const navEl = h("nav", { "aria-label": "Feature flows", id: "nav" });
  const mainEl = h("main", { class: "shell", id: "main" });
  const fbEl = h("div", { class: "feedback", role: "status", "aria-live": "polite" });
  const dlg = h("dialog", { class: "settings", "aria-labelledby": "settings-title" });
  const pdlg = h("dialog", { class: "settings player", "aria-labelledby": "player-title" });
  app.append(voiceEl, topEl, navEl, mainEl, fbEl, dlg, pdlg);
  // The voice and feedback bars sit over the page; pad the page by their real height so they never hide content.
  const fit = () => {
    const root = document.documentElement.style;
    root.setProperty("--voice-real", voiceEl.offsetHeight + "px");
    root.setProperty("--bottom", voiceEl.offsetHeight + fbEl.offsetHeight + "px");
  };
  if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(voiceEl); ro.observe(fbEl); } // rotation and text resizing
  window.addEventListener("resize", fit);

  // ------------------------------------------------------------------ actions
  // a reply the agent reads aloud is not also shown as a pop-up; it is in the voice bar while it is spoken
  const say = (text, read = false) => { if (!read) setFeedback(text); voice.afterButton(text, read); };
  async function onChoice(c) {
    if (voice.state === "THINKING" || engine.busy) return;
    if (!c.enabled) { say(c.whyDisabled || "That is not available right now.", true); return; }
    const res = await engine.choose(c.id, Source.BUTTON);
    say(res, c.tier === Tier.READ);
    if (c.id === "toggle" && engine.step.id === "audio_player" && player.isPlaying() && !pdlg.open) openPlayer(); // the controls pop up when it starts
  }
  async function onConfirm() { const p = engine.pending; if (!p) return; const res = await engine.choose(p.choice.id, Source.BUTTON, true); say(res); }
  function onCancel() { say(engine.cancelPending()); }
  async function onSubmitText() {
    const t = ui.freeText.trim();
    if (!t || engine.busy) return;
    ui.freeText = "";
    const res = await engine.submitText(t, Source.BUTTON);
    say(res);
  }
  async function goFlow(f) { ui.navOpen = false; say(stripLang(await engine.goTo(f, Source.BUTTON)).replace(/^[^.]+\. /, "")); }
  function onHelp() { ui.navOpen = false; renderTop(); say(engine.command("help", Source.BUTTON)); }
  function onUndo() { say(engine.undo(Source.BUTTON)); }
  function onBack() { if (engine.canGoBack) say(engine.back(Source.BUTTON).replace(/^Back\. /, "")); }

  function setFeedback(text) {
    ui.feedback = stripLang(text || "");
    if (ui.feedback) hideBarLater();
    renderFeedback();
  }

  // The bar hides after a few seconds so it doesn't cover the page. Undo still works by voice and Ctrl/⌘ + Z.
  const BAR_MS = 6000;
  function hideBarLater() {
    clearTimeout(ui.feedbackTimer);
    ui.feedbackTimer = setTimeout(function hide() {
      // never pull it away while the pointer or keyboard focus is on it (WCAG 2.2.1)
      if (fbEl.contains(document.activeElement) || fbEl.matches(":hover")) { ui.feedbackTimer = setTimeout(hide, BAR_MS); return; }
      ui.feedback = ""; ui.hiddenUndo = engine.undoPoint; renderFeedback();
    }, BAR_MS);
  }

  // ------------------------------------------------------------------ voice bar
  function renderVoice() {
    const st = voice.state, on = voice.on;
    // one press turns the agent on; it keeps listening until the next press turns it off
    const label = !on ? "Off. Press to turn on" : st === "SLEEP" && player.isPlaying() ? "On, waiting for the audio. Press to pause it and speak" : { LISTENING: "On, listening. Press to turn off", THINKING: "On, working. Press to turn off", SPEAKING: "On, speaking. Press to turn off" }[st] || "On. Press to turn off";
    const btn = h("button", { class: "mic", type: "button", "data-state": on && st === "SLEEP" ? "LISTENING" : st, "aria-pressed": String(on), "aria-label": `Voice guide: ${label}`, onclick: () => voice.onVoiceButton() },
      svg(!on ? ICON.mic : st === "THINKING" ? ICON.dots : ICON.stop));
    const lines = [];
    if (st === "LISTENING" || (voice.heard && st !== "SLEEP")) lines.push(h("div", { class: "vline" }, voice.heard ? `You: ${voice.heard}` : "Say an option, or what you want to do."));
    if (voice.said && (st === "SPEAKING" || st === "SLEEP")) lines.push(h("div", { class: "vline" }, `SEEDS: ${voice.said}`));
    if (!lines.length && matchMedia("(pointer: fine)").matches) lines.push(h("div", { class: "vhint" }, `Shortcut: ${SHORTCUT_TEXT} turns me on and off. Esc turns me off.`));
    const short = !on ? "Speak" : { LISTENING: "Listening", THINKING: "Working", SPEAKING: "Speaking" }[st] || "On";
    const signedIn = !!engine.st.signedInPhone, flow = signedIn ? engine.step.flow : null;
    const tab = (label, icon, onclick, current) => h("button", { class: "vtab", type: "button", "aria-current": current ? "page" : null, onclick }, svg(icon), h("span", {}, label));
    // the mic stays first in focus order (FR-90); the layout draws it in the middle of the four tabs
    voiceEl.replaceChildren(h("div", { class: "shell" + (signedIn ? " tabs" : "") },
      h("div", { class: "micwrap" }, btn, h("span", { class: "miclabel", "aria-hidden": "true" }, short)),
      lines.length ? h("div", { class: "vtext" }, lines) : null,
      signedIn ? [
        tab("Today", ICON.home, () => goFlow(Flow.HOME), flow === Flow.HOME),
        tab("Plan", ICON.plan, () => goFlow(Flow.PLAN), flow === Flow.PLAN),
        tab("History", ICON.history, () => goFlow(Flow.HISTORY), flow === Flow.HISTORY),
        tab("Workspace", ICON.workspace, () => goFlow(Flow.WORKSPACE), flow === Flow.WORKSPACE),
      ] : null));
    fit();
  }

  // ------------------------------------------------------------------ top bar + nav
  function renderTop() {
    if (!engine.st.signedInPhone) { topEl.replaceChildren(h("div", { class: "shell" }, badge(), h("div", { class: "flow" }, "SEEDS Teacher"))); navEl.replaceChildren(); return; }
    const s = engine.step;
    topEl.replaceChildren(h("div", { class: "shell" },
      h("button", { class: "iconbtn", type: "button", "aria-label": "Back", "aria-disabled": engine.canGoBack ? null : "true", onclick: onBack }, svg(ICON.back)),
      badge(),
      h("div", { class: "flow" }, s.flow.label),
      // Listen reads the screen aloud ("read out the content" by voice); like every button, it never starts listening
      h("button", { class: "iconbtn", type: "button", onclick: () => voice.afterButton(engine.readScreen(), true) }, svg(ICON.speaker), h("span", { class: "label" }, "Listen")),
      h("button", { class: "iconbtn", type: "button", "aria-expanded": String(ui.navOpen), "aria-controls": "nav", onclick: () => { ui.navOpen = !ui.navOpen; renderTop(); } }, svg(ICON.menu), h("span", { class: "label" }, "Menu")),
      h("button", { class: "iconbtn", type: "button", "aria-label": "Settings", onclick: openSettings }, svg(ICON.gear)),
    ));
    if (!ui.navOpen) { navEl.replaceChildren(); return; }
    // FR-108 / §12: flat list in the order of the teaching day, the same at every screen size
    const items = [Flow.HOME, Flow.PLAN, Flow.TEACH, Flow.QUIZ, Flow.HISTORY, Flow.FOLLOWUP, Flow.WORKSPACE];
    navEl.replaceChildren(h("div", { class: "shell" }, h("ul", { class: "navlist" },
      items.map((f) => h("li", {}, h("button", { type: "button", "aria-current": s.flow === f ? "page" : null, onclick: () => goFlow(f) }, f.label))),
      h("li", {}, h("button", { type: "button", onclick: onHelp }, "Help")),
      h("li", {}, h("button", { type: "button", onclick: () => { ui.navOpen = false; voice.stopAll(); engine.signOut(); } }, "Sign out")),
    )));
  }

  // ------------------------------------------------------------------ feedback bar (with Undo, FR-98)
  function renderFeedback() {
    // no pop-up while the agent is speaking; Undo still works by voice and Ctrl/⌘ + Z
    if (voice.state === "SPEAKING") { ui.feedback = ""; fbEl.replaceChildren(); fit(); return; }
    const u = engine.undoPoint !== ui.hiddenUndo ? engine.undoPoint : null;
    if (u && u !== ui.shownUndo) { ui.shownUndo = u; hideBarLater(); } // a new change: show Undo for a few seconds
    if (!ui.feedback && !u) { fbEl.replaceChildren(); fit(); return; }
    fbEl.replaceChildren(h("div", { class: "shell" }, h("div", { class: "inner" },
      h("div", { class: "msg" }, ui.feedback || `You can undo: ${u.label}.`),
      u ? h("button", { class: "btn", type: "button", onclick: onUndo, "aria-label": `Undo ${u.label}` }, "Undo") : null,
    )));
    fit();
  }

  // ------------------------------------------------------------------ TIK tabs
  function renderTik(p, tab, contentLang) {
    const titles = TikTabs.titles;
    const changes = TikTabs.changes(p.before, p.tik);
    const counts = { 3: TikTabs.activities(p.tik).length, 4: p.tik.exercises.length };
    const strip = h("div", { class: "tabstrip", role: "tablist", "aria-label": "Teacher Information Kit" },
      titles.map((t, i) => h("button", {
        class: "tab", role: "tab", id: `tab-${i}`, type: "button", "aria-selected": String(i === tab), "aria-controls": "tikpanel", tabindex: i === tab ? "0" : "-1", "data-key": `tab-${i}`,
        onclick: () => selectTab(i), onkeydown: (ev) => {
          const k = ev.key; let n = null;
          if (k === "ArrowRight") n = i + 1; else if (k === "ArrowLeft") n = i - 1; else if (k === "Home") n = 0; else if (k === "End") n = titles.length - 1;
          if (n != null) { ev.preventDefault(); selectTab((n + titles.length) % titles.length, true); }
        },
      }, t, counts[i] != null ? h("span", { class: "count" }, `(${counts[i]})`) : null,
        changes.has(i) ? [h("span", { class: "dot", "aria-hidden": "true" }, "•"), h("span", { class: "sr-only" }, ", changed")] : null)));
    let body;
    if (tab === 0) body = TikTabs.summary(p).map((s) => [h("h3", {}, s.heading), h("ul", {}, s.lines.map((x) => h("li", { lang: s.heading === "What changed" ? lc(p.tik.lang) : null }, x)))]);
    else {
      const added = changes.has(tab) ? changes.get(tab)[0] : [], removed = changes.has(tab) ? changes.get(tab)[1] : [];
      const isNew = (x) => (added.includes(x) ? h("span", { class: "tag" }, "New") : null);
      // the TIK's own headings: level 1 is a section (Interest generation activity), 2 a topic or activity, 3 an activity under a topic
      body = [TikTabs.blocks(p.tik, tab).map((b) => [b.heading ? h(`h${b.level + 2}`, { lang: lc(p.tik.lang) }, b.heading, isNew(b.heading)) : null,
        b.lines.length ? h("ul", { lang: lc(p.tik.lang) }, b.lines.map((x) => h("li", {}, x, isNew(x)))) : null]),
        removed.length ? [h("h3", {}, "Removed in this version"), h("ul", { lang: lc(p.tik.lang) }, removed.map((x) => h("li", { class: "removed" }, x)))] : null];
    }
    const prev = (tab - 1 + titles.length) % titles.length, next = (tab + 1) % titles.length;
    return h("section", { class: "tik", "aria-label": "TIK" }, strip,
      h("div", { class: "tabpanel", role: "tabpanel", id: "tikpanel", "aria-labelledby": `tab-${tab}`, tabindex: "0" },
        h("h2", { class: "sr-only" }, `${titles[tab]} tab, ${tab + 1} of ${titles.length}`), body,
        h("div", { class: "tabnav" },
          h("button", { class: "textbtn", type: "button", onclick: () => selectTab(prev) }, `‹ ${titles[prev]}`),
          h("button", { class: "textbtn", type: "button", onclick: () => selectTab(next) }, `${titles[next]} ›`))));
  }
  function selectTab(i, focus = false) {
    const text = engine.selectTab(i);
    if (focus) { const t = document.getElementById(`tab-${engine.tikTab}`); if (t) t.focus(); } // render ran synchronously on the tab change
    voice.afterButton(text, false); // a tap on a tab is a button action: the agent stays quiet
  }

  // ------------------------------------------------------------------ step
  function renderStep() {
    const s = engine.step, busy = engine.busy, pending = engine.pending, thinking = voice.state === "THINKING";
    const kids = [];
    if (s.progress) kids.push(h("ol", { class: "stages", "aria-label": "Progress" }, s.progress.labels.map((x, i) => h("li", { class: i < s.progress.current ? "done" : null, "aria-current": i === s.progress.current ? "step" : null }, x))));
    if (s.known.length) kids.push(h("dl", { class: "known" }, s.known.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])));
    kids.push(h("h1", { class: "title", tabindex: "-1", id: "step-title" }, s.title));
    if (s.banner) kids.push(h("p", { class: "banner" }, s.banner));
    if (s.announce) kids.push(h("p", { class: "announce", lang: s.inClass && s.contentLang ? lc(s.contentLang) : null }, stripLang(s.announce)));
    if (s.contentLang && s.contentLang !== "English" && !hasVoice(s.contentLang)) kids.push(h("p", { class: "notice" }, `This device has no ${s.contentLang} voice, so the voice guide will not read the ${s.contentLang} text aloud. Add a ${s.contentLang} voice in the device's speech settings to hear it.`));
    if (s.tik) kids.push(renderTik(s.tik, engine.tikTab, s.contentLang));
    s.sections.forEach((x) => kids.push(h("section", { class: "sec" + (x.emphasis ? " emph" : "") }, h("h2", {}, x.heading), h("ul", { lang: lc(x.lang) }, x.lines.map((y) => h("li", {}, y))))));
    if (busy) kids.push(h("div", { class: "card busy", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), h("span", {}, busy)));
    if (pending) {
      const word = pending.choice.tier === Tier.COMMIT ? (pending.choice.commitWord || pending.choice.label) : "yes";
      kids.push(h("div", { class: "card confirm", role: "group", "aria-labelledby": "confirm-text" },
        h("p", { id: "confirm-text" }, stripLang(pending.choice.readBack || pending.choice.label + ".")),
        h("p", { class: "small" }, `With the voice guide, say '${word}' to confirm.`),
        h("div", { class: "row" }, h("button", { class: "btn yes", type: "button", id: "confirm-btn", "data-key": "confirm", onclick: onConfirm }, `Confirm: ${pending.choice.label}`), h("button", { class: "btn", type: "button", onclick: onCancel, "data-key": "cancel" }, "Cancel"))));
    }
    kids.push(h("h2", { class: "question" }, s.question));
    if (thinking) kids.push(h("p", { class: "notice", role: "status" }, "Working on what you said. Tap anywhere or press Esc to cancel; nothing will be applied."));
    const off = !!(busy || thinking);
    kids.push(h("ul", { class: "choices" }, s.choices.map((c, i) => h("li", {}, h("button", {
      class: "choice" + (i === 0 ? " primary" : "") + (c.suggested ? " suggested" : ""), type: "button", "data-key": `c-${c.id}`,
      "aria-disabled": !c.enabled || off ? "true" : null, onclick: () => onChoice(c),
      "aria-describedby": c.enabled ? null : `why-${i}`,
    }, h("span", {}, h("span", { class: "num", "aria-hidden": "true" }, i + 1), c.label, !c.enabled ? h("span", { class: "why", id: `why-${i}` }, c.whyDisabled) : null, c.suggested && s.suggestion && s.suggestion.choiceId === c.id ? h("span", { class: "why" }, `Suggested ${s.suggestion.reason}.`) : null),
      h("span", { class: "chev", "aria-hidden": "true" }, "›"))))));
    if (s.id === "audio_player") kids.push(h("div", { class: "row" }, h("button", { class: "btn", type: "button", "data-key": "open-player", onclick: openPlayer }, "Open player controls")));
    if (s.freeSpeech) {
      kids.push(h("div", { class: "free" },
        h("label", { for: "free-text" }, "Or type it"),
        h("textarea", { id: "free-text", "data-key": "free", placeholder: s.freeSpeech.prompt, oninput: (ev) => { ui.freeText = ev.target.value; } }),
        h("div", { class: "row" }, h("button", { class: "btn yes", type: "button", onclick: onSubmitText, "aria-disabled": off ? "true" : null }, "Send"))));
    }
    if (s.secondary.length) kids.push(h("div", { class: "secondary" }, s.secondary.map((c) => h("button", { class: "textbtn", type: "button", "data-key": `s-${c.id}`, onclick: () => onChoice(c) }, c.label))));
    if (voice.turnInfo) kids.push(h("p", { class: "status" }, voice.turnInfo));
    return kids;
  }

  // ------------------------------------------------------------------ sign-in (F1, FR-107)
  function renderSignIn() {
    const phone = h("input", { type: "tel", id: "phone", inputmode: "numeric", autocomplete: "tel", required: true, value: ui.phone || null, "aria-describedby": ui.signInErr ? "signin-err" : null });
    const pw = h("input", { type: ui.showPw ? "text" : "password", id: "password", autocomplete: "current-password", required: true });
    const remember = h("input", { type: "checkbox", id: "remember", checked: true });
    const err = ui.signInErr ? h("p", { class: "err", id: "signin-err", role: "alert" }, ui.signInErr) : null;
    const form = h("form", { class: "signin", novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      const msg = engine.signIn(phone.value, pw.value, remember.checked);
      if (msg) { ui.signInErr = msg; ui.phone = phone.value; ui.signInDirty = true; render(); document.getElementById("phone").focus(); return; }
      ui.signInErr = ""; setSession(remember.checked);
    } },
      h("h1", { tabindex: "-1", id: "step-title" }, "Sign in to SEEDS"),
      h("p", {}, "Use the phone number and password your school admin gave you. Type them; the voice guide never listens to them."),
      err,
      h("div", { class: "field" }, h("label", { for: "phone" }, "Phone number"), phone),
      h("div", { class: "field" }, h("label", { for: "password" }, "Password"), pw),
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "showpw", checked: ui.showPw, onchange: (ev) => { ui.showPw = ev.target.checked; pw.type = ui.showPw ? "text" : "password"; } }), "Show password"),
      h("label", { class: "check" }, remember, "Remember me on this device"),
      h("p", { class: "small" }, "Untick Remember me on a shared phone."),
      // the demo account button sits beside Log in, so testers fill and log in without scrolling
      h("div", { class: "loginrow" },
        h("button", { class: "btn", type: "button", onclick: () => { phone.value = "9000000001"; pw.value = "seeds123"; document.getElementById("login-btn").focus(); } }, "Fill in the demo account"),
        h("button", { class: "choice primary", type: "submit", id: "login-btn" }, h("span", {}, "Log in"), h("span", { class: "chev", "aria-hidden": "true" }, "›"))),
      h("button", { class: "linkbtn", type: "button", onclick: () => { ui.signInErr = "To reset your password, ask your school admin. They will send new sign-in details by text message or a phone call."; ui.phone = phone.value; ui.signInDirty = true; render(); } }, "Forgot password?"),
      h("div", { class: "demo" }, h("p", {}, h("strong", {}, "Prototype: "), "there are no real accounts yet. Use Fill in the demo account, next to Log in. Everything you do stays in this browser.")),
    );
    return [form];
  }

  // ------------------------------------------------------------------ settings
  // ------------------------------------------------------------------ audio player popup
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let ptimer = null;
  pdlg.addEventListener("close", () => { clearInterval(ptimer); ptimer = null; });
  function openPlayer() {
    const clip = engine.audioClip();
    if (!clip) return;
    let dragging = false;
    const time = h("p", { class: "ptime", "aria-hidden": "true" });
    const bar = h("input", { type: "range", class: "range", id: "p-pos", min: "0", step: "1", "aria-label": "Position in the recording",
      onpointerdown: () => { dragging = true; }, onchange: (ev) => { dragging = false; player.seekTo(+ev.target.value); update(); } });
    const back = h("button", { class: "btn", type: "button", "aria-label": "Back 30 seconds", onclick: () => { player.seekBy(-30); update(); } }, "−30 s");
    const fwd = h("button", { class: "btn", type: "button", "aria-label": "Forward 30 seconds", onclick: () => { player.seekBy(30); update(); } }, "+30 s");
    const playBtn = h("button", { class: "btn yes pplay", type: "button", onclick: () => { if (player.hasMedia()) player.toggle(); else engine.command("audio_play", Source.BUTTON); update(); } });
    const speeds = AUDIO_SPEEDS.map((r) => h("button", { class: "btn", type: "button", onclick: () => { engine.setAudioSpeed(r); update(); } }, `${r}×`));
    function update() {
      const has = player.hasMedia(), pos = has ? player.position() : engine.audioAt(engine.lesson(), clip), dur = (has && player.duration()) || clip.durationSec;
      time.textContent = `${mmss(pos)} / ${mmss(dur)}`;
      bar.max = String(Math.floor(dur));
      if (!dragging) bar.value = String(Math.floor(pos));
      bar.setAttribute("aria-valuetext", `${Math.floor(pos / 60)} minutes ${Math.floor(pos % 60)} seconds of ${Math.round(dur / 60)} minutes`);
      bar.disabled = !player.canSeek();
      for (const b of [back, fwd]) b.setAttribute("aria-disabled", player.canSeek() ? "false" : "true");
      playBtn.textContent = player.isPlaying() ? "Pause" : "Play";
      speeds.forEach((b, i) => b.setAttribute("aria-pressed", String(player.rate === AUDIO_SPEEDS[i])));
    }
    pdlg.replaceChildren(
      h("div", { class: "head" }, h("h2", { id: "player-title" }, "Audio player"), h("button", { class: "btn", type: "button", onclick: () => pdlg.close() }, "Close")),
      h("div", { class: "body" },
        h("p", {}, clip.name),
        time, bar,
        h("div", { class: "prow" }, back, playBtn, fwd),
        h("h3", { id: "speed-title" }, "Speed"),
        h("div", { class: "prow", role: "group", "aria-labelledby": "speed-title" }, speeds),
        h("p", { class: "small" }, "Moving around works once the recording is playing. Closing this keeps the audio playing."),
      ));
    update();
    clearInterval(ptimer); ptimer = setInterval(update, 500);
    if (!pdlg.open) pdlg.showModal();
  }

  function openSettings() {
    const st = engine.st;
    const keyIn = h("input", { type: "password", id: "claude-key", autocomplete: "off", spellcheck: "false", placeholder: claude.available ? "A key is saved on this device" : "sk-ant-…" });
    const keyMsg = h("p", { class: "small", role: "status", "aria-live": "polite" });
    const removeRow = h("div", { class: "keyrow" });
    const showRemove = () => removeRow.replaceChildren(claude.available ? h("button", { class: "btn", type: "button", onclick: confirmRemove }, "Remove key") : "");
    function confirmRemove() {
      removeRow.replaceChildren(h("span", {}, "Remove the key from this device? Drafts will be made on the device again. "),
        h("button", { class: "btn yes", type: "button", onclick: () => { removeKey(); keyMsg.textContent = "Key removed."; keyIn.placeholder = "sk-ant-…"; showRemove(); render(); } }, "Yes, remove"),
        h("button", { class: "btn", type: "button", onclick: showRemove }, "Cancel"));
    }
    showRemove();
    const voices = LANGS.map((g) => `${g}: ${hasVoice(g) ? "voice available" : "no voice on this device"}`);
    const delRow = h("div", { class: "keyrow" });
    const showDel = () => delRow.replaceChildren(h("button", { class: "btn", type: "button", onclick: () => delRow.replaceChildren(
      h("span", {}, "Delete your lessons, records and settings from this browser? This cannot be undone. "),
      h("button", { class: "btn yes", type: "button", onclick: clearData }, "Yes, delete"), h("button", { class: "btn", type: "button", onclick: showDel }, "Cancel")) }, "Delete my data on this device"));
    showDel();
    const check = (idv, label, checked, onchange) => h("label", { class: "check" }, h("input", { type: "checkbox", id: idv, checked, onchange }), label);
    dlg.replaceChildren(
      h("div", { class: "head" }, h("h2", { id: "settings-title" }, "Settings"), h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Close")),
      h("div", { class: "body" },
        h("h3", {}, "Voice guide"),
        h("p", { class: "small" }, "The voice guide starts only when you press the voice button. Using the buttons never starts it."),
        check("set-voice", "Keep the conversation going: after I answer, listen for your next answer until you say stop", engine.voiceGuideOn, (ev) => { engine.setVoiceGuide(ev.target.checked); }),
        check("set-barge", "Stop speaking when I start talking (use with headphones; never in class)", !!st.bargeIn, (ev) => engine.setPref("bargeIn", ev.target.checked)),
        h("label", { for: "set-rate", class: "small" }, `Speech speed: ${st.speechRate.toFixed(1)}×`),
        h("input", { type: "range", class: "range", id: "set-rate", min: "0.7", max: "1.4", step: "0.1", value: String(st.speechRate), onchange: (ev) => { engine.setPref("speechRate", parseFloat(ev.target.value)); voice.output.rate = parseFloat(ev.target.value); openSettings(); } }),
        h("p", { class: "small" }, `Laptop shortcut: ${SHORTCUT_TEXT} starts or stops the voice guide${isMac ? " (Control, not Command)" : ""}. Esc stops it. ${isMac ? "⌘" : "Ctrl"} + Z undoes the last change.`),
        h("h3", {}, "Class languages"),
        h("p", { class: "small" }, "What SEEDS prepares for each class is in that class's language. The voice guide always speaks English."),
        Curriculum.coveredClasses.map((c) => h("div", { class: "langrow" }, h("label", { for: `lang-${c}` }, `Class ${c}`),
          h("select", { id: `lang-${c}`, onchange: (ev) => engine.setClassLang(c, ev.target.value) },
            h("option", { value: "", disabled: true, selected: !engine.classLang(c) }, "Not set yet"),
            LANGS.map((g) => h("option", { value: g, selected: engine.classLang(c) === g }, g))))),
        h("p", { class: "small" }, "Voices on this device: " + voices.join(". ") + "."),
        h("h3", {}, "Claude"),
        h("p", { class: "small" }, "Without a key, everything still works: drafts are made on this device, in English. With a key, Claude drafts in each class's language and understands any wording. Get a key at console.anthropic.com, under API keys. Use a key with a monthly spending limit. It is kept only in this browser; anyone using this browser profile could use it."),
        h("div", { class: "keyrow" }, h("label", { class: "sr-only", for: "claude-key" }, "Claude API key"), keyIn,
          h("button", { class: "btn", type: "button", onclick: () => { keyIn.type = keyIn.type === "password" ? "text" : "password"; } }, "Show key")),
        h("div", { class: "keyrow" }, h("button", { class: "btn yes", type: "button", onclick: async () => {
          const k = keyIn.value.trim();
          if (!k) { keyMsg.textContent = "Paste a key first."; return; }
          keyMsg.textContent = "Checking the key…";
          const err = await saveKey(k);
          if (err) { keyMsg.textContent = "Not saved: " + err; }
          else { keyMsg.textContent = "Saved and working. Claude is on."; keyIn.value = ""; keyIn.placeholder = "A key is saved on this device"; }
          showRemove(); render();
        } }, "Save and test key")),
        keyMsg, removeRow,
        h("h3", {}, "Your data"),
        h("p", { class: "small" }, "This prototype keeps your lessons and records only in this browser. Nothing is sent anywhere, except requests to Claude when you add a key. The classroom is never recorded."),
        delRow,
      ));
    if (!dlg.open) dlg.showModal();
  }

  // ------------------------------------------------------------------ render
  function render() {
    const signedIn = !!engine.st.signedInPhone;
    const active = document.activeElement;
    const key = active && active.getAttribute && active.getAttribute("data-key");
    const caret = active && active.id === "free-text" ? [active.selectionStart, active.selectionEnd] : null;
    renderTop();
    renderVoice();
    renderFeedback();
    if (!signedIn) {
      // the form is rebuilt only when it first shows or its message changes, so typing is never lost
      if (ui.lastSignedIn !== false || ui.signInDirty) {
        mainEl.replaceChildren(...renderSignIn());
        if (ui.lastSignedIn !== false) { const t = document.getElementById("step-title"); if (t) t.focus({ preventScroll: true }); }
        ui.lastSignedIn = false; ui.lastStepId = null; ui.signInDirty = false;
      }
      return;
    }
    ui.lastSignedIn = true;
    const stepChanged = engine.step.id !== ui.lastStepId || engine.route.page !== ui.lastPage;
    if (stepChanged) ui.freeText = "";
    mainEl.replaceChildren(...renderStep());
    const ta = document.getElementById("free-text");
    if (ta) ta.value = ui.freeText;
    if (stepChanged) {
      ui.lastStepId = engine.step.id; ui.lastPage = engine.route.page;
      // FR-89: on a new step, focus goes to its heading so a screen reader announces it once
      const t = document.getElementById("step-title"); if (t) t.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    } else if (engine.pending && ui.pendingShown !== engine.pending.choice.id && voice.state === "SLEEP") {
      // a new read-back from a tap: focus its Confirm button once (not while the agent is talking, FR-89)
      const b = document.getElementById("confirm-btn"); if (b) b.focus();
    } else if (key) {
      const el = mainEl.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (el) { el.focus({ preventScroll: true }); if (caret && el.setSelectionRange) el.setSelectionRange(caret[0], caret[1]); }
    }
    ui.pendingShown = engine.pending ? engine.pending.choice.id : null;
    if (voice.showOptions && !ui.optionsFocused) { const first = mainEl.querySelector(".choice"); if (first) first.focus(); }
    ui.optionsFocused = voice.showOptions;
  }

  engine.subscribe(render);
  voice.subscribe(() => { renderVoice(); renderFeedback(); if (voice.state === "THINKING" || voice.state === "SLEEP") render(); });
  claude.onChange(() => render());
  if (window.speechSynthesis) window.speechSynthesis.addEventListener("voiceschanged", () => render());

  // ------------------------------------------------------------------ keyboard and taps (FR-90, FR-93, FR-99)
  document.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey && ev.shiftKey && (ev.code === "Space" || ev.key === " ")) { ev.preventDefault(); voice.onVoiceButton(); return; }
    const typing = ev.target.closest && ev.target.closest("input, textarea, [contenteditable]");
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "z" && !typing && !dlg.open && engine.undoPoint) { ev.preventDefault(); onUndo(); return; }
    if (ev.key === "Escape") { if (voice.on || voice.state !== "SLEEP") { ev.preventDefault(); voice.stopAll(); } return; }
    if (["Shift", "Control", "Alt", "Meta", "Tab"].includes(ev.key)) return;
    if (voice.state === "SPEAKING") voice.quietForTap();
    if (voice.state === "THINKING" && !dlg.open) voice.cancelTurn();
  }, true);
  document.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest && ev.target.closest(".mic")) return;
    if (voice.state === "THINKING") { voice.cancelTurn(); return; }
    voice.quietForTap();
  }, true);

  render();
  return { render };
}
