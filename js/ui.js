import { Source, Tier, Flow, stripLang, langCode } from "./step.js";
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
  gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
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
  app.append(voiceEl, topEl, navEl, mainEl, fbEl, dlg);
  // The voice and feedback bars sit over the page; pad the page by their real height so they never hide content.
  const fit = () => {
    const root = document.documentElement.style;
    root.setProperty("--voice-real", voiceEl.offsetHeight + "px");
    root.setProperty("--bottom", voiceEl.offsetHeight + fbEl.offsetHeight + "px");
  };
  if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(voiceEl); ro.observe(fbEl); } // rotation and text resizing
  window.addEventListener("resize", fit);

  // ------------------------------------------------------------------ actions
  const say = (text, read = false) => { setFeedback(text); voice.afterButton(text, read); };
  async function onChoice(c) {
    if (voice.state === "THINKING" || engine.busy) return;
    if (!c.enabled) { say(c.whyDisabled || "That is not available right now.", true); return; }
    const res = await engine.choose(c.id, Source.BUTTON);
    say(res, c.tier === Tier.READ);
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
  function onUndo() { say(engine.undo(Source.BUTTON)); }
  function onBack() { if (engine.canGoBack) say(engine.back(Source.BUTTON).replace(/^Back\. /, "")); }

  function setFeedback(text) {
    ui.feedback = stripLang(text || "");
    clearTimeout(ui.feedbackTimer);
    if (ui.feedback) ui.feedbackTimer = setTimeout(() => { ui.feedback = ""; renderFeedback(); }, 10000);
    renderFeedback();
  }

  // ------------------------------------------------------------------ voice bar
  function renderVoice() {
    const st = voice.state;
    const label = { SLEEP: "Press to speak", LISTENING: "Listening… press to finish", THINKING: "Working… press to cancel", SPEAKING: "Speaking… press to interrupt" }[st];
    const btn = h("button", { class: "mic", type: "button", "data-state": st, "aria-label": `Voice guide: ${label}`, onclick: () => voice.onVoiceButton() },
      svg(st === "SPEAKING" || st === "LISTENING" ? ICON.stop : st === "THINKING" ? ICON.dots : ICON.mic));
    const lines = [];
    if (st === "LISTENING" || (voice.heard && st !== "SLEEP")) lines.push(h("div", { class: "vline" }, voice.heard ? `You: ${voice.heard}` : "Say an option, or what you want to do."));
    if (voice.said && (st === "SPEAKING" || st === "SLEEP")) lines.push(h("div", { class: "vline" }, `SEEDS: ${voice.said}`));
    const hint = matchMedia("(pointer: fine)").matches ? `Shortcut: ${SHORTCUT_TEXT}. Esc stops me.` : "Tap anywhere to stop me.";
    voiceEl.replaceChildren(h("div", { class: "shell" }, btn, h("div", { class: "vtext" }, h("div", { class: "vstate", "aria-hidden": "true" }, label), lines, !lines.length ? h("div", { class: "vhint" }, hint) : null)));
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
      h("button", { class: "iconbtn", type: "button", "aria-expanded": String(ui.navOpen), "aria-controls": "nav", onclick: () => { ui.navOpen = !ui.navOpen; renderTop(); } }, svg(ICON.menu), h("span", { class: "label" }, "Menu")),
      h("button", { class: "iconbtn", type: "button", "aria-label": "Settings", onclick: openSettings }, svg(ICON.gear)),
    ));
    if (!ui.navOpen) { navEl.replaceChildren(); return; }
    // FR-108 / §12: flat list in the order of the teaching day, the same at every screen size
    const items = [Flow.HOME, Flow.SCHEDULE, Flow.PLAN, Flow.TEACH, Flow.QUIZ, Flow.FOLLOWUP];
    navEl.replaceChildren(h("div", { class: "shell" }, h("ul", { class: "navlist" },
      items.map((f) => h("li", {}, h("button", { type: "button", "aria-current": s.flow === f ? "page" : null, onclick: async () => { ui.navOpen = false; say(stripLang(await engine.goTo(f, Source.BUTTON)).replace(/^[^.]+\. /, "")); } }, f.label))),
      h("li", {}, h("button", { type: "button", onclick: () => { ui.navOpen = false; renderTop(); say(engine.command("help", Source.BUTTON)); } }, "Help")),
      h("li", {}, h("button", { type: "button", onclick: () => { ui.navOpen = false; voice.stopAll(); engine.signOut(); } }, "Sign out")),
    )));
  }

  // ------------------------------------------------------------------ feedback bar (with Undo, FR-98)
  function renderFeedback() {
    const u = engine.undoPoint;
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
    const counts = { 2: p.tik.steps.length, 3: p.tik.activities.length, 4: p.tik.materials.length };
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
      const raw = TikTabs.raw(p.tik, tab), shown = TikTabs.lines(p.tik, tab);
      const Tag = tab === 2 || tab === 3 ? "ol" : "ul";
      body = [h(Tag, { lang: lc(p.tik.lang) }, (tab === 2 || tab === 3 ? raw : shown).map((x, k) => h("li", {}, x, added.includes(raw[k]) ? h("span", { class: "tag" }, "New") : null))),
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
    if (s.freeSpeech) {
      kids.push(h("div", { class: "free" },
        h("label", { for: "free-text" }, "Or type it"),
        h("textarea", { id: "free-text", "data-key": "free", placeholder: s.freeSpeech.prompt, oninput: (ev) => { ui.freeText = ev.target.value; } }),
        h("div", { class: "row" }, h("button", { class: "btn yes", type: "button", onclick: onSubmitText, "aria-disabled": off ? "true" : null }, "Send"))));
    }
    if (s.secondary.length) kids.push(h("div", { class: "secondary" }, s.secondary.map((c) => h("button", { class: "textbtn", type: "button", "data-key": `s-${c.id}`, onclick: () => onChoice(c) }, c.label))));
    kids.push(h("p", { class: "status" }, claude.available ? "Claude: on. Drafts are made by Claude in each class's language." : "Claude: off. Drafts are made on this device, in English. Add a key in Settings to use Claude.",
      voice.turnInfo ? [h("br"), voice.turnInfo] : null));
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
      h("button", { class: "choice primary", type: "submit" }, h("span", {}, "Log in"), h("span", { class: "chev", "aria-hidden": "true" }, "›")),
      h("button", { class: "linkbtn", type: "button", onclick: () => { ui.signInErr = "To reset your password, ask your school admin. They will send new sign-in details by text message or a phone call."; ui.phone = phone.value; ui.signInDirty = true; render(); } }, "Forgot password?"),
      h("div", { class: "demo" }, h("p", {}, h("strong", {}, "Prototype: "), "there are no real accounts yet. Use the demo teacher account. Everything you do stays in this browser."),
        h("button", { class: "btn", type: "button", onclick: () => { phone.value = "9000000001"; pw.value = "seeds123"; phone.focus(); } }, "Fill in the demo account")),
    );
    return [form];
  }

  // ------------------------------------------------------------------ settings
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
      h("span", {}, "Delete your schedule, lessons, records and settings from this browser? This cannot be undone. "),
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
        h("p", { class: "small" }, `Laptop shortcut: ${SHORTCUT_TEXT} starts or stops the voice guide${isMac ? " (Control, not Command)" : ""}. Esc stops it.`),
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
        h("p", { class: "small" }, "This prototype keeps your schedule, lessons and records only in this browser. Nothing is sent anywhere, except requests to Claude when you add a key. The classroom is never recorded."),
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
  voice.subscribe(() => { renderVoice(); if (voice.state === "THINKING" || voice.state === "SLEEP") render(); });
  claude.onChange(() => render());
  if (window.speechSynthesis) window.speechSynthesis.addEventListener("voiceschanged", () => render());

  // ------------------------------------------------------------------ keyboard and taps (FR-90, FR-93, FR-99)
  document.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey && ev.shiftKey && (ev.code === "Space" || ev.key === " ")) { ev.preventDefault(); voice.onVoiceButton(); return; }
    if (ev.key === "Escape") { if (voice.state !== "SLEEP") { ev.preventDefault(); voice.stopAll(); } return; }
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
