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
const MATHS = "Maths";

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

  // ================ Maths (sample Course, no Content Studio TIK, quiz or audio yet) ================
  // ---------------- Class 6 ----------------
  {
    id: "6m-patterns", classNum: 6, subject: MATHS, number: 1, name: "Patterns in Mathematics",
    objective: "Students find the rule behind number and shape patterns and continue them.",
    keyPoints: ["A pattern follows a rule.", "Odd numbers, square numbers and triangular numbers are number patterns."],
    topics: [
      t("6m-patterns-1", "Number patterns", ["A number pattern is a list of numbers that follows a rule.", "In 1, 3, 5, 7 the rule is: add 2 each time, so the next number is 9."], ["What comes next in 2, 4, 6, 8, and why?"]),
      t("6m-patterns-2", "Square and triangular numbers", ["A square number is a number multiplied by itself, such as 1, 4, 9 and 16.", "Triangular numbers, such as 1, 3, 6 and 10, are the counts of objects that can be arranged in a triangle."], ["Is 25 a square number? How do you know?"]),
      t("6m-patterns-3", "Shape patterns", ["A shape pattern repeats or grows by a rule.", "Each new row of a triangle of objects has one more object than the row before."], ["How many objects are in the fifth row of a triangle that starts with one?"]),
    ],
  },
  {
    id: "6m-lines", classNum: 6, subject: MATHS, number: 2, name: "Lines and Angles",
    objective: "Students tell points, lines, line segments and rays apart and compare angles.",
    keyPoints: ["A line segment has two end points; a ray has one.", "An angle is formed by two rays from the same point."],
    topics: [
      t("6m-lines-1", "Points, lines and rays", ["A line segment has two end points.", "A ray starts at one point and goes on without end in one direction."], ["How is a ray different from a line segment?"]),
      t("6m-lines-2", "Angles", ["An angle is formed by two rays that start from the same point, called the vertex.", "A right angle is a quarter turn, like the corner of a book."], ["Name one right angle you can feel in the classroom."]),
      t("6m-lines-3", "Comparing angles", ["An angle smaller than a right angle is acute.", "An angle bigger than a right angle and smaller than a straight angle is obtuse."], ["Is the angle of a half-open door acute or obtuse?"]),
    ],
  },
  {
    id: "6m-numplay", classNum: 6, subject: MATHS, number: 3, name: "Number Play",
    objective: "Students explore even and odd numbers, palindromes and quick ways to add.",
    keyPoints: ["An even number can be split into two equal groups.", "A palindrome reads the same forwards and backwards."],
    topics: [
      t("6m-numplay-1", "Even and odd numbers", ["An even number can be shared equally into two groups.", "An odd number always leaves one over when shared into two groups."], ["Is 15 even or odd? How can you check?"]),
      t("6m-numplay-2", "Palindromic numbers", ["A palindromic number reads the same forwards and backwards.", "121 and 4554 are palindromic numbers."], ["Say a three-digit palindromic number."]),
      t("6m-numplay-3", "Mental maths", ["Adding in tens first makes sums quicker.", "To add 38 and 25, add 30 and 20, then 8 and 5, then add the two answers."], ["How would you add 46 and 37 in your head?"]),
    ],
  },
  // ---------------- Class 7 ----------------
  {
    id: "7m-integers", classNum: 7, subject: MATHS, number: 1, name: "Integers",
    objective: "Students use positive and negative numbers and add and subtract them.",
    keyPoints: ["Integers are whole numbers and their negatives.", "Adding a negative number is the same as subtracting."],
    topics: [
      t("7m-integers-1", "Positive and negative numbers", ["Integers are the whole numbers and their negatives, such as minus 3, 0 and 5.", "Numbers below zero, such as a temperature of minus 2 degrees, are negative."], ["Which is bigger, minus 5 or minus 2?"]),
      t("7m-integers-2", "Adding integers", ["Adding a positive number moves up the number line.", "Adding a negative number moves down the number line."], ["What is 4 plus minus 6?"]),
      t("7m-integers-3", "Subtracting integers", ["Subtracting a number is the same as adding its opposite.", "5 minus minus 2 is the same as 5 plus 2, which is 7."], ["What is 3 minus minus 4?"]),
    ],
  },
  {
    id: "7m-fractions", classNum: 7, subject: MATHS, number: 2, name: "Fractions and Decimals",
    objective: "Students multiply and divide fractions and work with decimals.",
    keyPoints: ["To multiply fractions, multiply the tops and multiply the bottoms.", "A decimal is another way to write a fraction with 10, 100 or 1000 at the bottom."],
    topics: [
      t("7m-fractions-1", "Multiplying fractions", ["To multiply two fractions, multiply the numerators and multiply the denominators.", "Half of a quarter is one eighth."], ["What is one half times one third?"]),
      t("7m-fractions-2", "Dividing fractions", ["To divide by a fraction, multiply by its reciprocal.", "The reciprocal of two thirds is three halves."], ["What is the reciprocal of three quarters?"]),
      t("7m-fractions-3", "Decimals", ["A decimal shows parts of a whole after the decimal point.", "0.5 is the same as one half."], ["Which is bigger, 0.5 or 0.25?"]),
    ],
  },
  {
    id: "7m-equations", classNum: 7, subject: MATHS, number: 3, name: "Simple Equations",
    objective: "Students write simple equations and solve them by balancing both sides.",
    keyPoints: ["An equation says two things are equal.", "Doing the same thing to both sides keeps an equation balanced."],
    topics: [
      t("7m-equations-1", "What an equation is", ["An equation says that two expressions are equal, such as x plus 3 equals 7.", "The letter stands for a number we do not know yet."], ["In x plus 3 equals 7, what does x stand for?"]),
      t("7m-equations-2", "Solving an equation", ["To solve an equation, do the same thing to both sides until the letter is alone.", "If x plus 3 equals 7, take 3 from both sides, so x equals 4."], ["Solve: x minus 2 equals 5."]),
      t("7m-equations-3", "Equations from word problems", ["A word problem can be written as an equation by naming the unknown with a letter.", "If 3 pens cost 30 rupees, then 3 times p equals 30, so p equals 10."], ["Write an equation: a number plus 6 is 10."]),
    ],
  },
  // ---------------- Class 9 ----------------
  {
    id: "9m-numsys", classNum: 9, subject: MATHS, number: 1, name: "Number Systems",
    objective: "Students tell rational and irrational numbers apart and place real numbers on the number line.",
    keyPoints: ["A rational number can be written as p over q, with q not zero.", "Rational and irrational numbers together are the real numbers."],
    topics: [
      t("9m-numsys-1", "Rational numbers", ["A rational number can be written as p over q, where p and q are integers and q is not zero.", "Every integer is a rational number, because 5 is 5 over 1."], ["Is 0.75 a rational number? Write it as a fraction."]),
      t("9m-numsys-2", "Irrational numbers", ["An irrational number cannot be written as p over q.", "The square root of 2 is irrational; its decimal goes on without repeating."], ["Is the square root of 9 rational or irrational?"]),
      t("9m-numsys-3", "Real numbers on the number line", ["Every real number has a place on the number line.", "Between any two real numbers there are infinitely many others."], ["Name a number between 1 and 2."]),
    ],
  },
  {
    id: "9m-poly", classNum: 9, subject: MATHS, number: 2, name: "Polynomials",
    objective: "Students identify polynomials, their degree and zeroes, and factorise simple ones.",
    keyPoints: ["The degree of a polynomial is its highest power.", "A zero of a polynomial makes its value zero."],
    topics: [
      t("9m-poly-1", "Polynomials in one variable", ["A polynomial in one variable is a sum of terms with whole-number powers of that variable.", "The degree is the highest power, so x squared plus 3x has degree 2."], ["What is the degree of 4x cubed plus x?"]),
      t("9m-poly-2", "Zeroes of a polynomial", ["A zero of a polynomial is a value of x that makes the polynomial equal to zero.", "2 is a zero of x minus 2."], ["What is the zero of x plus 5?"]),
      t("9m-poly-3", "Factorising polynomials", ["Factorising writes a polynomial as a product of simpler polynomials.", "x squared minus 9 factorises as x plus 3 times x minus 3."], ["Factorise x squared minus 4."]),
    ],
  },
  {
    id: "9m-coord", classNum: 9, subject: MATHS, number: 3, name: "Coordinate Geometry",
    objective: "Students describe the position of a point with coordinates and name the quadrants.",
    keyPoints: ["A point is described by its x and y coordinates.", "The two axes divide the plane into four quadrants."],
    topics: [
      t("9m-coord-1", "The Cartesian system", ["The x-axis runs left to right and the y-axis runs up and down.", "The axes cross at the origin, the point 0, 0."], ["Where do the x-axis and y-axis meet?"]),
      t("9m-coord-2", "Plotting a point", ["The coordinates 3, 2 mean 3 along the x-axis and 2 up the y-axis.", "The x coordinate is always said first."], ["Which coordinate do we say first?"]),
      t("9m-coord-3", "Quadrants", ["The axes divide the plane into four quadrants.", "In the first quadrant, both coordinates are positive."], ["In which quadrant is the point 2, 5?"]),
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
  subjects: [SUBJECT, MATHS],
  coveredClasses: [6, 7, 9],
  chapters,
  /** A class's chapters in contents order; only one subject's when `subject` is given. */
  forClass: (c, subject = null) => chapters.filter((x) => x.classNum === c && (!subject || x.subject === subject)).sort((a, b) => a.number - b.number),
  chapter: (id) => chapters.find((x) => x.id === id) || null,
  topic: (id) => chapters.flatMap((c) => c.topics).find((x) => x.id === id) || null,
  chapterOfTopic: (id) => chapters.find((c) => c.topics.some((x) => x.id === id)) || null,
  /** Match a spoken chapter name to the curriculum tree (AC-44.2). */
  findChapter(classNum, spoken, subject = null) { return bestByName(chapters.filter((x) => (classNum == null || x.classNum === classNum) && (!subject || x.subject === subject)), spoken); },
  findTopic(chapter, spoken) { return bestByName(chapter ? chapter.topics : chapters.flatMap((c) => c.topics), spoken); },
};
