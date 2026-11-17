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
      objective: "Students identify magnetic materials, find the poles of a magnet and describe attraction and repulsion through touch and sound.",
      steps: [
        "Interest generation: pass a bar magnet and a steel spoon around the class. Ask each student to feel the pull.",
        "Magnetic or not: students test objects from a tray, such as a pin, an eraser, a key, a paper clip and a pencil, and sort them into two boxes.",
        "Poles: students slide a paper clip along a bar magnet and say where it holds on most strongly.",
        "Attraction and repulsion: in pairs, students bring two ring magnets together and describe what they feel.",
        "Let's discuss: where do we use magnets at home?",
      ],
      activities: [
        "Sorting tray. Level 1: sort five objects. Level 2: predict before testing, then explain.",
        "Pole hunt with paper clips.",
        "Ring magnet push and pull, in pairs.",
      ],
      materials: ["Bar magnets", "Ring magnets", "Tray of everyday objects", "Two boxes labelled in Braille and large print"],
      adaptations: [
        "Every activity is done by touch. Name each object aloud as it is passed.",
        "Use objects with clearly different textures.",
        "Pair students so that each pair can describe what they feel to each other.",
      ],
      extension: "Magnet strength test: count how many paper clips each magnet can hold in a chain.",
      sources: ["Content Studio: Exploring Magnets chapter TIK (sample)"],
      reasoning: "Synced from Content Studio.", checks: [], instruction: null,
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
      objective: "Students explain, with tactile and everyday examples, that matter is made of moving particles, and relate this to states of matter and evaporation.",
      steps: [
        "Interest generation: dissolve a spoon of salt in water. Students taste a drop and discuss where the salt went.",
        "Particles: students shake a closed box of marbles gently and then hard, and describe the difference in movement.",
        "States of matter: students feel a block of wood, a cup of water and a filled balloon, and describe shape and volume.",
        "Evaporation: students wet the back of one hand and blow on it, and describe the cooling.",
        "Let's discuss: why do we dry clothes in the sun and the wind?",
      ],
      activities: [
        "Marble box model. Level 1: describe the movement. Level 2: link it to solid, liquid and gas.",
        "Shape and volume by touch.",
        "Wet-hand evaporation test.",
      ],
      materials: ["Salt, water and cups", "Closed box with marbles", "Wooden block, cup of water, balloon"],
      adaptations: ["All observations are by touch, taste of a safe drop, and sound.", "Describe each step aloud before students try it."],
      extension: "Students predict which dries faster, a wet cloth spread out or folded, and test it by touch the next day.",
      sources: ["Content Studio: Matter in Our Surroundings chapter TIK (sample)"],
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
