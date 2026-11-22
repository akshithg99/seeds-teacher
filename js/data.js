// SAMPLE curriculum standing in for the Content Studio sync (FR-39, read-only).
// Chapter order stands in for the board textbook's contents page (FR-106).
// This is demo data written for the prototype, not a real board's syllabus. Content Studio
// has it in English only, so other class languages fall back to English and say so (FR-111, FR-112).

export const LANGS = ["English", "Hindi", "Tamil", "Bengali"];
export const LANG_CODE = { English: "en-IN", Hindi: "hi-IN", Tamil: "ta-IN", Bengali: "bn-IN" };

// Test account for the prototype only, as if issued by a school admin (FR-81). Not a real person.
export const DemoAccounts = {
  teachers: [{ phone: "9000000001", password: "seeds123", name: "Demo Teacher", school: "Demo partner school", board: "Sample state board" }],
  byPhone(phone) { return this.teachers.find((t) => t.phone === phone) || null; },
};

const t = (id, name, definitions, checkQuestions, syncedAudio = false) => ({ id, name, definitions, checkQuestions, syncedAudio });
/** One activity in Vision Empower's TIK format. */
export const act = (name, materials, prerequisites, objective, flow) => ({ name, materials, prerequisites, objective, flow });

/** The lines at the top of every TIK, as in Vision Empower's format. */
export const tikHeader = (ch, topic = null) => [`Syllabus: ${DemoAccounts.teachers[0].board}`, `Subject: ${ch.subject}`, `Grade: ${ch.classNum}`,
  `Textbook name: Class ${ch.classNum} ${ch.subject} textbook (sample)`, `Chapter number and name: ${ch.number}. ${ch.name}`, ...(topic ? [`Topic: ${topic.name}`] : [])];

/** Vision Empower's important guidelines for every TIK, with the accessibility rules every activity follows. */
export const GUIDELINES = [
  "Exercise reading: students re-read the new ideas in their accessible textbooks or other material they can use.",
  "Perform textbook activities: practise the textbook's questions and activities, adapted where they are not accessible to students with visual impairment.",
  "Provide homework: do one or two questions with the class, and give the rest for practice so students use their accessible books on their own.",
  "Name each object aloud as you pass it, and give students time to explore it by touch.",
  "Ask for answers aloud, one student at a time, so no one depends on seeing hands.",
];

const SUBJECT = "Science";

const chapters = [
  // ---------------- Class 6 ----------------
  {
    id: "6-magnets", classNum: 6, subject: SUBJECT, number: 1, name: "Exploring Magnets",
    objective: "Students find out which materials a magnet attracts, where its pull is strongest, and how two magnets push or pull each other.",
    keyPoints: ["A magnet attracts iron, nickel and cobalt.", "Every magnet has a north pole and a south pole.", "Like poles repel and unlike poles attract."],
    topics: [
      t("6-magnets-1", "Magnetic and non-magnetic materials",
        ["A magnet attracts materials such as iron, nickel and cobalt. These are magnetic materials.",
          "Materials that a magnet does not attract, such as wood, plastic and paper, are non-magnetic materials."],
        ["Name one thing in our classroom that a magnet will pull.", "Will a magnet pull a wooden pencil? Why or why not?"], true),
      t("6-magnets-2", "Poles of a magnet",
        ["Every magnet has two poles, a north pole and a south pole.", "The pull of a magnet is strongest at its poles."],
        ["Where is the pull of a bar magnet the strongest?", "How many poles does a magnet have?"]),
      t("6-magnets-3", "Attraction and repulsion",
        ["Unlike poles of two magnets attract each other.", "Like poles of two magnets push each other away. This is called repulsion."],
        ["What happens when you bring the north poles of two magnets together?"]),
    ],
    syncedTik: {
      provenance: "Synced from Content Studio", scope: "chapter", lang: "English",
      objectives: ["To know which materials a magnet attracts.", "To find the poles of a magnet.", "To understand attraction and repulsion between two magnets."],
      prerequisites: "Everyday objects made of iron, wood, plastic and paper, from earlier classes.",
      keyPoints: [
        "Magnetic and non-magnetic materials: a magnet attracts iron, nickel and cobalt. Wood, plastic and paper are not attracted.",
        "Poles of a magnet: every magnet has a north pole and a south pole. Its pull is strongest at the poles.",
        "Attraction and repulsion: unlike poles attract each other, and like poles push each other away.",
      ],
      learnMore: "",
      interest: [act("Feel the pull", ["Bar magnet", "Steel spoon"], "Students should be able to handle the given material.", "",
        ["Pass a bar magnet and a steel spoon around the class.", "Ask each student to bring them close and feel the pull.", "Ask: what do you think is happening? Take two or three answers aloud."])],
      concepts: [
        { topic: "Magnetic and non-magnetic materials", activities: [act("Magnetic or not", ["Bar magnets", "Tray of everyday objects: pin, eraser, key, paper clip, pencil", "Two boxes labelled in Braille and large print"],
          "Students should be able to handle the given material.", "To know which materials a magnet attracts.",
          ["Ask the students to form groups of three.", "Give each group a magnet and the tray of objects.", "Students test each object with the magnet and sort it into the two boxes.",
            "Ask each group to share which objects stuck and which did not.", "From their responses, explain that a magnet attracts iron, nickel and cobalt, and that these are magnetic materials."])] },
        { topic: "Poles of a magnet", activities: [act("Pole hunt", ["Bar magnets", "Paper clips"], "Know that a magnet attracts iron.", "To find where the pull of a magnet is strongest.",
          ["Give each student a bar magnet and a paper clip.", "Students slide the paper clip slowly along the magnet from one end to the other.", "Ask: where does it hold on most strongly?",
            "Explain that these places are the poles, a north pole and a south pole, and that the pull is strongest there."])] },
        { topic: "Attraction and repulsion", activities: [act("Push and pull", ["Ring magnets"], "Know that a magnet has two poles.", "To understand attraction and repulsion.",
          ["Ask the students to sit in pairs.", "Give each pair two ring magnets.", "Students bring the magnets together one way, then turn one over and try again.", "Ask them to describe what they feel each time.",
            "Explain that unlike poles attract and like poles push each other away. This push is called repulsion."])] },
      ],
      exercises: [act("Magnet strength test", ["Magnets", "Paper clips"], "Know where the pull of a magnet is strongest.", "",
        ["Divide the students into groups.", "Each group counts how many paper clips each magnet can hold in a chain.", "Groups say their counts aloud and compare which magnet is strongest."])],
      references: ["Content Studio: Exploring Magnets chapter TIK (sample)"],
      guidelines: GUIDELINES,
      reasoning: "Synced from Content Studio.", checks: [], instruction: null,
    },
    syncedQuiz: {
      provenance: "Synced from Content Studio", lang: "English",
      checks: "Whether students remember the key facts of Exploring Magnets: 4 multiple-choice questions. Students press the number of the right answer.",
      questions: [
        { q: "Which of these does a magnet attract?", options: ["A wooden pencil", "An iron nail", "A paper cup", "A plastic ruler"], answer: 1, topicId: "6-magnets-1" },
        { q: "Which of these is a non-magnetic material?", options: ["Iron", "Nickel", "Plastic", "Cobalt"], answer: 2, topicId: "6-magnets-1" },
        { q: "Where is the pull of a bar magnet strongest?", options: ["In the middle", "At its poles", "It is the same everywhere"], answer: 1, topicId: "6-magnets-2" },
        { q: "What happens when the north poles of two magnets are brought together?", options: ["They attract", "They push each other away", "Nothing happens"], answer: 1, topicId: "6-magnets-3" },
      ],
    },
  },
  {
    id: "6-measure", classNum: 6, subject: SUBJECT, number: 2, name: "Measurement of Length and Motion",
    objective: "Students measure length in standard units and describe different kinds of motion.",
    keyPoints: ["The metre is the standard unit of length.", "Motion can be linear, circular or periodic."],
    topics: [
      t("6-measure-1", "Standard units of length", ["The metre is the standard unit of length.", "One metre is one hundred centimetres."], ["How many centimetres make one metre?"]),
      t("6-measure-2", "Measuring length correctly", ["Start measuring from the zero mark.", "Keep the measuring scale along the length being measured."], ["Why should we start measuring from the zero mark?"]),
      t("6-measure-3", "Types of motion", ["Linear motion is along a straight line.", "Circular motion is along a circle.", "Periodic motion repeats itself after a fixed time."], ["What kind of motion does a swing have?"]),
    ],
  },
  {
    id: "6-temp", classNum: 6, subject: SUBJECT, number: 3, name: "Temperature and its Measurement",
    objective: "Students describe hotness and coldness as temperature and measure it safely.",
    keyPoints: ["Temperature tells how hot or cold something is.", "Temperature is measured in degrees Celsius."],
    topics: [
      t("6-temp-1", "Hot and cold", ["Temperature tells us how hot or cold something is.", "Touch alone cannot tell us the exact temperature."], ["Can our hands tell us exactly how hot water is?"]),
      t("6-temp-2", "Thermometers", ["A clinical thermometer measures body temperature.", "Normal body temperature is about thirty-seven degrees Celsius."], ["What is the normal temperature of the human body?"]),
      t("6-temp-3", "Using a talking thermometer", ["A talking thermometer speaks the reading aloud.", "Wait for the beep before reading the temperature."], ["Why do we wait for the beep before reading the temperature?"]),
    ],
  },
  // ---------------- Class 7 ----------------
  {
    id: "7-nutrition", classNum: 7, subject: SUBJECT, number: 1, name: "Nutrition in Plants",
    objective: "Students explain how green plants make their own food and name other modes of nutrition in plants.",
    keyPoints: ["Green plants make food by photosynthesis.", "Leaves are the food factories of the plant."],
    topics: [
      t("7-nutrition-1", "Photosynthesis", ["Green plants make their own food using sunlight, water and carbon dioxide. This process is called photosynthesis.", "Oxygen is given out during photosynthesis."], ["What three things does a plant need to make its food?"], true),
      t("7-nutrition-2", "Leaves and chlorophyll", ["Leaves contain a green substance called chlorophyll.", "Chlorophyll helps leaves use sunlight to make food."], ["Why are leaves called the food factories of a plant?"]),
      t("7-nutrition-3", "Other modes of nutrition", ["Some plants, like Cuscuta, take food from other plants. They are parasites.", "Insectivorous plants, like the pitcher plant, trap insects for nutrients."], ["How does a pitcher plant get some of its nutrients?"]),
    ],
  },
  {
    id: "7-heat", classNum: 7, subject: SUBJECT, number: 2, name: "Heat",
    objective: "Students describe how heat moves by conduction, convection and radiation.",
    keyPoints: ["Heat flows from a hotter object to a colder one.", "Heat moves by conduction, convection and radiation."],
    topics: [
      t("7-heat-1", "Hot and cold objects", ["Heat flows from a hotter object to a colder object."], ["If you hold a cold glass of water, which way does heat flow?"]),
      t("7-heat-2", "Conduction", ["In conduction, heat moves through a solid from the hotter end to the colder end.", "Metals are good conductors. Wood and plastic are poor conductors."], ["Why do cooking pans often have wooden or plastic handles?"]),
      t("7-heat-3", "Convection and radiation", ["In convection, heat is carried by moving water or air.", "In radiation, heat travels without any material, like heat from the sun."], ["How does heat from the sun reach us?"]),
    ],
  },
  {
    id: "7-electric", classNum: 7, subject: SUBJECT, number: 3, name: "Electric Current and its Effects",
    objective: "Students build simple circuits and describe the heating and magnetic effects of electric current.",
    keyPoints: ["A closed circuit lets current flow.", "Electric current produces heat and magnetism."],
    topics: [
      t("7-electric-1", "Electric circuits", ["Current flows only when the circuit is closed.", "A switch opens or closes a circuit."], ["What happens to the bulb when the switch is open?"]),
      t("7-electric-2", "Heating effect of current", ["A wire gets hot when current flows through it.", "Electric irons and heaters use this heating effect."], ["Name one appliance at home that uses the heating effect of current."]),
      t("7-electric-3", "Magnetic effect of current", ["A wire carrying current behaves like a magnet.", "An electromagnet is made by winding wire around an iron nail."], ["How can we make an electromagnet?"]),
    ],
  },
  // ---------------- Class 9 ----------------
  {
    id: "9-matter", classNum: 9, subject: SUBJECT, number: 1, name: "Matter in Our Surroundings",
    objective: "Students explain the particle nature of matter, the states of matter and evaporation.",
    keyPoints: ["Matter is made of tiny particles that are always moving.", "Evaporation causes cooling."],
    topics: [
      t("9-matter-1", "Particles of matter", ["Matter is made of very small particles with spaces between them.", "The particles of matter are continuously moving and attract each other."], ["Why does the smell of hot food reach us from a distance?"]),
      t("9-matter-2", "States of matter", ["Solids have a fixed shape and volume.", "Liquids have a fixed volume but take the shape of their container.", "Gases have neither a fixed shape nor a fixed volume."], ["Why can a gas be compressed easily but a solid cannot?"]),
      t("9-matter-3", "Evaporation", ["Evaporation is the change of a liquid into vapour at any temperature below its boiling point.", "Evaporation causes cooling."], ["Why do we feel cool after sweating on a windy day?"], true),
    ],
    syncedTik: {
      provenance: "Synced from Content Studio", scope: "chapter", lang: "English",
      objectives: ["To know that matter is made of tiny moving particles.", "To understand the states of matter.", "To understand evaporation and why it causes cooling."],
      prerequisites: "States of matter, solid, liquid and gas, from earlier classes.",
      keyPoints: [
        "Particles of matter: matter is made of very small particles with spaces between them. They keep moving and attract each other.",
        "States of matter: solids have a fixed shape and volume. Liquids have a fixed volume but take the shape of their container. Gases have neither.",
        "Evaporation: a liquid changes into vapour below its boiling point. Evaporation causes cooling.",
      ],
      learnMore: "",
      interest: [act("Where did the salt go?", ["Salt", "Water", "Cups"], "Students should be able to handle the given material.", "",
        ["Dissolve a spoon of salt in a cup of water.", "Students taste a drop of the water.", "Ask: where did the salt go? Take two or three answers aloud."])],
      concepts: [
        { topic: "Particles of matter", activities: [act("Marble box model", ["Closed box with marbles"], "Students should be able to handle the given material.", "To know that particles of matter keep moving.",
          ["Give each group a closed box of marbles.", "Students shake it gently, then hard, and listen and feel.", "Ask them to describe the difference in movement.",
            "Explain that particles of matter move all the time, faster when they have more energy."])] },
        { topic: "States of matter", activities: [act("Shape and volume by touch", ["Wooden block", "Cup of water", "Filled balloon"], "Basic idea of solid, liquid and gas.", "To know the states of matter.",
          ["Ask the students to form groups of three.", "Give each group a wooden block, a cup of water and a filled balloon.", "Students feel each one and describe its shape and volume.",
            "From their responses, explain how solids, liquids and gases differ."])] },
        { topic: "Evaporation", activities: [act("Wet-hand test", ["Water"], "Know that liquids can change into gas.", "To understand that evaporation causes cooling.",
          ["Students wet the back of one hand.", "They blow on it gently.", "Ask: what do you feel?", "Explain that the water evaporates and takes heat from the hand, so it feels cool."])] },
      ],
      exercises: [act("Which dries faster?", ["Two wet cloths"], "Know what evaporation is.", "",
        ["Spread one wet cloth out and fold the other.", "Students predict which will dry faster.", "The next day, students check both by touch and say what happened."])],
      references: ["Content Studio: Matter in Our Surroundings chapter TIK (sample)"],
      guidelines: GUIDELINES,
      reasoning: "Synced from Content Studio.", checks: [], instruction: null,
    },
  },
  {
    id: "9-motion", classNum: 9, subject: SUBJECT, number: 2, name: "Motion",
    objective: "Students describe motion using distance, displacement, speed, velocity and acceleration.",
    keyPoints: ["Displacement is the shortest distance from start to end.", "Acceleration is the rate of change of velocity."],
    topics: [
      t("9-motion-1", "Distance and displacement", ["Distance is the total path length covered.", "Displacement is the shortest distance from the starting point to the end point, in a given direction."], ["If you walk around the classroom and return to your seat, what is your displacement?"]),
      t("9-motion-2", "Speed and velocity", ["Speed is distance covered per unit time.", "Velocity is speed in a given direction."], ["What is the difference between speed and velocity?"]),
      t("9-motion-3", "Acceleration", ["Acceleration is the change in velocity per unit time.", "A bus speeding up or slowing down is accelerating."], ["Is a bus that is slowing down accelerating? Explain."]),
    ],
  },
  {
    id: "9-sound", classNum: 9, subject: SUBJECT, number: 3, name: "Sound",
    objective: "Students explain how sound is produced by vibration and travels through a medium.",
    keyPoints: ["Sound is produced by vibrating objects.", "Sound needs a medium to travel."],
    topics: [
      t("9-sound-1", "Production of sound", ["Sound is produced when an object vibrates.", "A stretched rubber band hums when plucked because it vibrates."], ["What happens to a drum skin when it makes a sound?"]),
      t("9-sound-2", "Propagation of sound", ["Sound needs a medium, such as air, water or a solid, to travel.", "Sound travels as a longitudinal wave."], ["Why can sound not travel in a vacuum?"]),
      t("9-sound-3", "Echo", ["An echo is a sound heard again after it reflects from a surface.", "To hear a clear echo, the reflecting surface must be far enough away."], ["Where might you hear an echo near your school?"]),
    ],
  },
];

const words = (s) => s.toLowerCase().split(" ").filter((w) => w.length > 3);
function bestByName(pool, spoken) {
  const s = spoken.toLowerCase();
  const exact = pool.find((x) => s.includes(x.name.toLowerCase()));
  if (exact) return exact;
  let best = null, score = 0;
  for (const x of pool) {
    const n = words(x.name).filter((w) => s.includes(w)).length;
    if (n > score) { best = x; score = n; }
  }
  return best;
}

export const Curriculum = {
  SUBJECT,
  coveredClasses: [6, 7, 9],
  chapters,
  forClass: (c) => chapters.filter((x) => x.classNum === c).sort((a, b) => a.number - b.number),
  chapter: (id) => chapters.find((x) => x.id === id) || null,
  topic: (id) => chapters.flatMap((c) => c.topics).find((x) => x.id === id) || null,
  chapterOfTopic: (id) => chapters.find((c) => c.topics.some((x) => x.id === id)) || null,
  /** Match a spoken chapter name to the curriculum tree (AC-44.2). */
  findChapter(classNum, spoken) { return bestByName(classNum != null ? this.forClass(classNum) : chapters, spoken); },
  findTopic(chapter, spoken) { return bestByName(chapter ? chapter.topics : chapters.flatMap((c) => c.topics), spoken); },
};
