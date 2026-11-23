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

## What is in it (PRD v5.4 on the voiceb branch)

| Area | What works |
|---|---|
| F1 Sign in (FR-107) | Phone number and password fields, Show password, Remember me (ticked by default; unticked, the sign-in ends when the browser closes), Forgot password? (reset through the school admin) |
| Buttons and voice (FR-52–FR-61, FR-86–FR-106) | Buttons never start the voice agent: it starts only from the voice button or the shortcut. The voice button is an on/off switch: one press turns the agent on, and it keeps listening and answering, question after question, until the next press turns it off (saying "stop" or pressing Esc also turns it off). Silence does not turn it off. It does not listen while lesson audio plays. Voice button in the same place on every screen and first in focus order. Laptop shortcut **Ctrl + Shift + Space**. Each listening window is up to 15 s (60 s for free speech), then it listens again. Risk tiers with read-back; a commit needs its own word or a tap. Undo for changes: the Undo bar shows for 6 seconds, then hides; after that say "undo" or press Ctrl + Z (⌘ + Z on a Mac). Cancelling a turn applies nothing. Miss recovery. Saying "read out the content" (or "read the screen", "read it out", "what's on the screen") reads the whole screen aloud, like the Listen button (speaker icon in the top bar): the title, the details at the top, the open TIK tab in full (not a summary), then the rest of the screen. Suggestions from usage history. Opening sentence ("plan the next class 7 science lesson"). |
| Class language (FR-109–FR-112) | Asked once per class: English, Hindi, Tamil or Bengali. Drafts follow it when Claude is on. Content Studio sample content is English only, and the app says so. |
| Lesson sequence (8.1) | No calendar. A lesson is planned for a whole chapter, because a TIK is always for a whole chapter; the app never asks for a topic. It offers the next chapter in textbook order ("Next is chapter 4, Exploring Magnets. Continue from here?"), and stays on a chapter until all its topics are covered. A topic counts as covered once its concept generation step is finished in class. When a TIK is finished, Home shows what is up next (the chapter's next topic, or the next chapter) with "Plan the next lesson" |
| Subjects | Science and maths for classes 6, 7 and 9. After the class, the app asks the subject (plan a lesson, what to teach next, plan a quiz); saying it ("plan the class 6 maths lesson") skips that question. Maths chapters are a sample Course with no Content Studio TIK, quiz or audio yet, so maths TIKs and quizzes are drafted |
| Content Studio audio and TIKs | Real chapter recordings, synced from Content Studio, each with a sample Content Studio chapter TIK in Vision Empower's format (activities by touch, sound and smell), for class 6 science chapters 1 to 3, class 7 science and maths chapters 1 to 3, and class 9 maths chapters 1 to 3. One recording per chapter, offered for every topic of that chapter and played as a file. In class, Play opens an audio player pop-up: play and pause, back or forward 30 seconds, a position slider, and speed (0.5×, 1×, 1.25×, 1.5×, 2×, remembered). By voice, press the voice button (it pauses the audio) and say pause, play, "back 30 seconds", "forward 1 minute", "jump to minute 20", "from the beginning", "faster", "slower", "normal speed" or "speed 1.5"; the audio carries on from there, and the agent says nothing over it. These also work on the TIK step and Learning check screens, which open the audio and play from there. Where the recording stopped is remembered for the lesson, so the next class carries on from there (cleared once it plays to the end). The files are in the audio folder, re-encoded to 32 kbps mono (speech quality) so each stays under GitHub limits; about 174 MB in all |
| F3 Plan in one go | "Plan the next class 7 science lesson" → "Start with chapter 1, The Ever-Evolving World of Science?" → "yes" prepares the TIK (Content Studio's as it is, otherwise built), the questions (one set for the chapter overview and one for each topic) and the Content Studio audio, none approved. "Ready. Please review your lesson." Then review everything in a row, or open one piece. "No" keeps the class and asks for the chapter. |
| F2 Home | Lessons ready to teach, a lesson being planned, "What should I teach next?", and items waiting for you |
| F3/F4 TIK | Vision Empower's Teacher Instruction Kit format: header (syllabus, subject, grade, textbook, chapter), Overview (objectives, prerequisite concept), Learn (key points), Engage (interest generation activity, then concept generation activities by topic, each with materials required, prerequisites, objective and activity flow), Exercises and reinforcement, References, Important guidelines. Shown as tabs with a Summary and a Why tab. Use the Content Studio TIK as it is, apply suggestions, ask for a change, try again, approve. In class, the teaching view goes step by step through the TIK. Only a follow-up for a topic the class found hard gets a smaller TIK for that topic. |
| F17 Learning check | Questions at planning (or the Course's own, used as they are), read by the teacher or the agent near the end of class, before End class; after End class the teacher says how many could answer: few, some, many or none |
| F5–F7 Audio and teaching | Audio comes only from Content Studio: use it as it is or teach without it; with none, the lesson is taught from the TIK. Class goes through the TIK one step at a time: objectives and prerequisites, key points, interest generating activity, one concept generation step per topic, then the exercise and reinforcement activity. Play, pause and replay. "Audio not working?" leads to teacher-led in one step. End class asks whether the current step was finished; the next class of that lesson starts where this one stopped. If at least 5 minutes of the 40-minute period are left and a step remains, End class also suggests carrying on to the next step. |
| History | The History tab (was Records) lists every approved TIK, with whether it is taught completely, taught partly (and where the next class starts) or not taught yet, and every approved quiz, with whether it was taken, is being taken on IVR, or not taken yet. Each item opens: a TIK with its tabs and Teach it or Continue teaching; a quiz with its questions, answer key and how the class did, and Share to IVR or See responses. History can be filtered by class and subject (Filter by class and subject, then Show everything to clear it). Follow-ups and class records open from there |
| F8 Quiz | Plan a quiz: choose the class and chapter, use the Content Studio quiz for that chapter, or make a new one for the whole chapter or chosen topics. Every question is multiple choice with an answer key. Approve, choose how long it stays open, then Share to IVR: only the questions and options are sent, never the answer key. Close it to get results for the class as a whole: answers, correct per question, and topics that need reinforcement, which become follow-up suggestions (phone calls simulated). |
| Workspace (BR-11, BR-21) | Every TIK, audio and quiz in one place, in two groups: from Content Studio, and made by you, with each item's status. Open a TIK as tabs, play audio and read its script, or read a quiz with its answer key and how the class did. A quiz can be reviewed, shared to IVR or followed from there. Read-only: Content Studio items can't be changed by teachers, and your own are changed in their flows. Open it from Menu, More options, or by saying "workspace". |
| F9/F10 | Pre-filled class record, preview of what is stored, save, follow-up for the class as a whole (confirm, change or dismiss), simpler TIK or new quiz through approval |

Not built: sharing with my school (FR-44, needs a server), the per-topic language switch, real IVR calls, and a measured loudness check.

## Files

`js/engine.js` holds the shared actions that buttons and the voice agent both call (FR-96). `js/steps.js` holds each screen's description (FR-97). `js/voice.js` is the speech pipeline (recognition, the Claude turn and speech). `js/ui.js` draws the screens.
