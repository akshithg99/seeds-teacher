# SEEDS Teacher: web prototype

One responsive webapp for phone and laptop browsers. It follows PRD v5.2 (16–17 Nov 2026, D-119): the same address, the same screens and the same voice on every device, with nothing to install.

It has no server and no real accounts. Each tester's data stays in their own browser.

## Run it on this laptop

You need Node.js 18 or later.

```bash
cd seeds-web
node serve.mjs
```

Open http://localhost:8080. On the sign-in page, press **Fill in the demo account**, then **Log in**.

To run the tests:

```bash
npm test
```

## Open it on a phone

Phones only allow the microphone on an `https://` address, so `http://<laptop-ip>:8080` shows the buttons but cannot listen. Put the folder on any static host. It is plain HTML, CSS and JavaScript with no build step. Upload everything except `test/`.

- **GitHub Pages**: push the folder to a repository, then go to Settings → Pages → Deploy from branch. On a free account the repository must be public.
- **Netlify Drop**: drag the `seeds-web` folder onto app.netlify.com/drop. Without an account the site is removed after an hour. With a free account it stays.

## Versions for testing

The live site shows the `main` branch. Each test version is a branch with its own public repo named `seeds-teacher-<version>`, at `https://akshithg99.github.io/seeds-teacher-<version>/`. `dev` goes to `seeds-teacher-preview`.

To add a version, for example `voice-a`:

```bash
git switch -c voice-a dev
git remote add voice-a https://github.com/akshithg99/seeds-teacher-voice-a.git
git push -u origin voice-a
git push voice-a voice-a:main
```

Create the repo on GitHub first. After the first push, turn on Settings → Pages → Deploy from branch → `main`.

Each version site reads its name from its address. It shows "Preview: voice-a" in the top bar and keeps its own sign-in, settings and Claude key, apart from the live site and other versions. To make a version live, merge its branch into `main`.

## Which browsers

| | Buttons | Voice guide (listening) | Voice guide (speaking) |
|---|---|---|---|
| Chrome / Edge, Android or laptop | Yes | Yes, needs internet | Yes |
| Safari, iPhone or Mac | Yes | Yes (iOS 14.5+), needs internet; tap the voice button for each answer | Yes |
| Firefox | Yes | No: the app says so, and buttons work | Yes |

Lesson audio and content are read by the device's own voices. If the device has no Hindi, Tamil or Bengali voice, the app says so and does not read that text in English (FR-110). Settings lists which voices this device has.

## Claude

Without a key, everything works. Drafts are made on the device in English, and the voice guide understands option words, numbers, commands and simple opening sentences.

With a key (Settings → Claude → **Save and test key**):
- `claude-opus-5-5` drafts TIKs, questions, audio scripts and quizzes in the class's language.
- It also understands any wording the teacher uses.

The key is checked before it is saved, and it is kept only in that browser.

> Shortcut: the key sits in the browser, which is fine for one tester per device. A pilot needs a small server that holds the key.

## What is in it (PRD v5.2)

| Area | What works |
|---|---|
| F1 Sign in (FR-107) | Phone number and password fields, Show password, Remember me (ticked by default; unticked, the sign-in ends when the browser closes), Forgot password? (reset through the school admin) |
| Buttons and voice (FR-52–FR-61, FR-86–FR-106) | Buttons never start the voice agent: it starts only from the voice button or the shortcut. Voice button in the same place on every screen and first in focus order. Laptop shortcut **Ctrl + Shift + Space**; Esc stops. Listens up to 15 s (60 s for free speech). Risk tiers with read-back; a commit needs its own word or a tap. Undo for changes: the Undo bar shows for 6 seconds, then hides; after that say "undo" or press Ctrl + Z (⌘ + Z on a Mac). Cancelling a turn applies nothing. Miss recovery. Suggestions from usage history. Opening sentence ("plan class 7 science for Thursday"). |
| Class language (FR-109–FR-112) | Asked once per class: English, Hindi, Tamil or Bengali. Drafts follow it when Claude is on. Content Studio sample content is English only, and the app says so. |
| F14 Calendar Scheduling | Week set-up, read-back, "the next chapter", change, move or remove one entry |
| F3 Plan in one go | "Plan class 7 science for Thursday" → "Start with chapter 1, Nutrition in Plants, topic …?" → "yes" prepares the TIK (Content Studio's as it is, otherwise built), the questions and the audio, none approved. "Ready. Please review your lesson." Then review everything in a row, open one piece, or make a topic TIK for the class. "No" keeps the class and asks for the chapter. |
| F2 Home | Next lesson and whether it is ready, the week's readiness, and items waiting for you |
| F3/F4 TIK | Use the Content Studio TIK as it is, or open it as tabs (Summary, Objective, Steps, Activities, Materials, Accessibility, Extension, Sources, Why). The Summary shows what is in it, what changed and suggested changes. Apply suggestions, ask for a change, try again, approve. |
| F17 Learning check | Questions at planning (or the Course's own, used as they are), asked after class: most, some, few or none |
| F5–F7 Audio and teaching | Prepare, preview and approve audio. Step-by-step teaching view. Play, pause and replay. "Audio not working?" leads to teacher-led in one step. End class with coverage. Extension activity on an early finish. |
| F8 Quiz | Draft, approve, open until a deadline, close, class-level results (phone calls simulated) |
| Workspace (BR-11, BR-21) | Every TIK, audio and quiz in one place, in two groups: from Content Studio, and made by you, with each item's status. Open a TIK as tabs, play audio and read its script, or read a quiz with its answers. Read-only: Content Studio items can't be changed by teachers, and your own are changed in their flows. Open it from Menu, More options, or by saying "workspace". |
| F9/F10 | Pre-filled class record, preview of what is stored, save, follow-up suggestion, simpler TIK / audio / quiz through approval |

Not built: sharing with my school (FR-44, needs a server), the per-topic language switch, real IVR calls, and a measured loudness check.

## Files

`js/engine.js` holds the shared actions that buttons and the voice agent both call (FR-96). `js/steps.js` holds each screen's description (FR-97). `js/voice.js` is the speech pipeline (recognition, the Claude turn and speech). `js/ui.js` draws the screens.
