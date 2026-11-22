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

const t = (id, name, definitions, checkQuestions) => ({ id, name, definitions, checkQuestions });
/** Audio synced from Content Studio: one recording per chapter, served from the app's audio folder. */
const csAudio = (file, minutes) => ({ src: "audio/" + file, minutes });
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
    id: "6-world", classNum: 6, subject: SUBJECT, number: 1, name: "The Wonderful World of Science",
    objective: "Students understand science as a way of asking questions about the world and finding answers by observing and testing.",
    keyPoints: ["Science is all around us.", "Scientists ask questions, make a guess, test it and reach a conclusion."],
    topics: [
      t("6-world-1", "Science around us", ["Science helps us understand the things around us, from cooking to the weather.", "Anyone who asks questions and looks for answers is doing science."], ["Name one thing at home that science helps us understand."]),
      t("6-world-2", "Asking questions", ["Science begins with curiosity: asking how and why.", "A good question can be answered by observing or testing."], ["What is one question you have about the world around you?"]),
      t("6-world-3", "The scientific method", ["The scientific method is: observe, ask a question, make a guess, test it, and reach a conclusion.", "If the test does not support the guess, we make a new guess and test again."], ["What do we do after we make a guess?"]),
    ],
    audio: csAudio("c6-science-1.mp3", 15),
  },
  {
    id: "6-diversity", classNum: 6, subject: SUBJECT, number: 2, name: "Diversity in the Living World",
    objective: "Students describe the variety of plants and animals and group them by features they can observe.",
    keyPoints: ["Living things show great variety, called diversity.", "We group plants and animals by their features."],
    topics: [
      t("6-diversity-1", "Variety in plants", ["Plants can be grouped as herbs, shrubs and trees by the kind of stem they have.", "Herbs have soft green stems; trees have thick, hard, woody trunks."], ["Is a mango plant a herb, a shrub or a tree?"]),
      t("6-diversity-2", "Leaves and roots", ["Some leaves have veins in a net-like pattern; others have veins running side by side.", "Some plants have one main tap root; others have many thin fibrous roots."], ["What kind of roots does grass have?"]),
      t("6-diversity-3", "Animals and their habitats", ["The place where a plant or animal lives is its habitat.", "Animals have features that help them live in their habitat, such as the camel's long legs in the desert."], ["How does a fish's body help it live in water?"]),
    ],
    audio: csAudio("c6-science-2.mp3", 64),
  },
  {
    id: "6-eating", classNum: 6, subject: SUBJECT, number: 3, name: "Mindful Eating: A Path to a Healthy Body",
    objective: "Students name the components of food and explain why a balanced diet keeps the body healthy.",
    keyPoints: ["Food has carbohydrates, proteins, fats, vitamins and minerals.", "A balanced diet has all of them in the right amounts, with roughage and water."],
    topics: [
      t("6-eating-1", "Food we eat", ["People in different regions eat different foods, depending on what grows there.", "Eating mindfully means paying attention to what and how much we eat."], ["Name one food that is grown near your home."]),
      t("6-eating-2", "Components of food", ["Carbohydrates and fats give energy; proteins help the body grow and repair.", "Vitamins and minerals keep us healthy, and roughage helps digestion."], ["Which component of food helps the body grow?"]),
      t("6-eating-3", "Balanced diet", ["A balanced diet has all the components of food in the right amounts.", "A lack of a component for a long time can cause a deficiency disease."], ["Why should we not eat only one kind of food every day?"]),
    ],
    audio: csAudio("c6-science-3.mp3", 54),
  },
  {
    id: "6-magnets", classNum: 6, subject: SUBJECT, number: 4, name: "Exploring Magnets",
    objective: "Students find out which materials a magnet attracts, where its pull is strongest, and how two magnets push or pull each other.",
    keyPoints: ["A magnet attracts iron, nickel and cobalt.", "Every magnet has a north pole and a south pole.", "Like poles repel and unlike poles attract."],
    topics: [
      t("6-magnets-1", "Magnetic and non-magnetic materials",
        ["A magnet attracts materials such as iron, nickel and cobalt. These are magnetic materials.",
          "Materials that a magnet does not attract, such as wood, plastic and paper, are non-magnetic materials."],
        ["Name one thing in our classroom that a magnet will pull.", "Will a magnet pull a wooden pencil? Why or why not?"]),
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
    id: "6-measure", classNum: 6, subject: SUBJECT, number: 5, name: "Measurement of Length and Motion",
    objective: "Students measure length in standard units and describe different kinds of motion.",
    keyPoints: ["The metre is the standard unit of length.", "Motion can be linear, circular or periodic."],
    topics: [
      t("6-measure-1", "Standard units of length", ["The metre is the standard unit of length.", "One metre is one hundred centimetres."], ["How many centimetres make one metre?"]),
      t("6-measure-2", "Measuring length correctly", ["Start measuring from the zero mark.", "Keep the measuring scale along the length being measured."], ["Why should we start measuring from the zero mark?"]),
      t("6-measure-3", "Types of motion", ["Linear motion is along a straight line.", "Circular motion is along a circle.", "Periodic motion repeats itself after a fixed time."], ["What kind of motion does a swing have?"]),
    ],
  },
  {
    id: "6-temp", classNum: 6, subject: SUBJECT, number: 7, name: "Temperature and its Measurement",
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
    id: "7-world", classNum: 7, subject: SUBJECT, number: 1, name: "The Ever-Evolving World of Science",
    objective: "Students understand that scientific ideas grow and change as people observe, question and test.",
    keyPoints: ["Science is a way of finding out, not a fixed list of facts.", "Ideas in science change when new evidence is found."],
    topics: [
      t("7-world-1", "Science in everyday life", ["We use science every day, for example when we cook, travel or use a phone.", "Science helps us make sense of what we observe."], ["Name one way you used science today."]),
      t("7-world-2", "Curiosity and questions", ["Curiosity leads to questions, and questions lead to discoveries.", "Observing carefully helps us ask better questions."], ["What makes a question easy to test?"]),
      t("7-world-3", "Science keeps changing", ["Scientific ideas change when new evidence is found.", "Scientists share their findings so others can check them."], ["Why do scientists share their findings?"]),
    ],
    audio: csAudio("c7-science-1.mp3", 15),
  },
  {
    id: "7-substances", classNum: 7, subject: SUBJECT, number: 2, name: "Exploring Substances: Acidic, Basic, and Neutral",
    objective: "Students group substances as acidic, basic or neutral using indicators and describe neutralisation.",
    keyPoints: ["Indicators tell us whether a substance is acidic, basic or neutral.", "An acid and a base cancel each other out in neutralisation."],
    topics: [
      t("7-substances-1", "Acids and bases", ["Acids, like lemon juice and vinegar, are often sour.", "Bases, like soap solution, often feel slippery. We never taste or touch unknown substances to test them."], ["Is lemon juice an acid or a base?"]),
      t("7-substances-2", "Indicators", ["An indicator changes colour in an acid or a base.", "Turmeric turns red in a base; blue litmus turns red in an acid."], ["What does an indicator do?"]),
      t("7-substances-3", "Neutralisation", ["When an acid and a base are mixed in the right amounts, they cancel each other out. This is neutralisation.", "An antacid relieves acidity in the stomach by neutralisation."], ["Why does an antacid help with stomach acidity?"]),
    ],
    audio: csAudio("c7-science-2.mp3", 42),
  },
  {
    id: "7-electric", classNum: 7, subject: SUBJECT, number: 3, name: "Electricity: Circuits and their Components",
    objective: "Students build a simple circuit and sort materials into conductors and insulators.",
    keyPoints: ["Current flows only in a closed circuit.", "Conductors let current pass; insulators do not."],
    topics: [
      t("7-electric-1", "Electric cell", ["An electric cell has a positive terminal and a negative terminal.", "Two or more cells joined together make a battery."], ["How many terminals does a cell have?"]),
      t("7-electric-2", "Electric circuits", ["Current flows only when the circuit is closed.", "A switch opens or closes a circuit."], ["What happens to the bulb when the switch is open?"]),
      t("7-electric-3", "Conductors and insulators", ["Materials that let current pass, such as metals, are conductors.", "Materials that do not, such as plastic, rubber and wood, are insulators."], ["Why are electric wires covered with plastic?"]),
    ],
    audio: csAudio("c7-science-3.mp3", 60),
  },
  // ---------------- Class 9 ----------------
  {
    id: "9-matter", classNum: 9, subject: SUBJECT, number: 1, name: "Matter in Our Surroundings",
    objective: "Students explain the particle nature of matter, the states of matter and evaporation.",
    keyPoints: ["Matter is made of tiny particles that are always moving.", "Evaporation causes cooling."],
    topics: [
      t("9-matter-1", "Particles of matter", ["Matter is made of very small particles with spaces between them.", "The particles of matter are continuously moving and attract each other."], ["Why does the smell of hot food reach us from a distance?"]),
      t("9-matter-2", "States of matter", ["Solids have a fixed shape and volume.", "Liquids have a fixed volume but take the shape of their container.", "Gases have neither a fixed shape nor a fixed volume."], ["Why can a gas be compressed easily but a solid cannot?"]),
      t("9-matter-3", "Evaporation", ["Evaporation is the change of a liquid into vapour at any temperature below its boiling point.", "Evaporation causes cooling."], ["Why do we feel cool after sweating on a windy day?"]),
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
    id: "7m-large", classNum: 7, subject: MATHS, number: 1, name: "Large Numbers Around Us",
    objective: "Students read, write and estimate large numbers using lakhs and crores.",
    keyPoints: ["One lakh is one hundred thousand; one crore is one hundred lakh.", "Estimating gives a quick, close answer."],
    topics: [
      t("7m-large-1", "Lakhs and crores", ["One lakh is 1,00,000, which is one hundred thousand.", "One crore is 1,00,00,000, which is one hundred lakh."], ["How many lakhs make one crore?"]),
      t("7m-large-2", "Reading and writing large numbers", ["In the Indian system, we group digits as ones, thousands, lakhs and crores.", "Saying each group by its name helps us read a large number aloud."], ["Read this number aloud: 2,50,000."]),
      t("7m-large-3", "Estimating large numbers", ["To estimate, we round numbers to the nearest thousand, lakh or crore.", "An estimate is close to the exact answer, not equal to it."], ["About how many people live in your village or town?"]),
    ],
    audio: csAudio("c7-maths-1.mp3", 79),
  },
  {
    id: "7m-arith", classNum: 7, subject: MATHS, number: 2, name: "Arithmetic Expressions",
    objective: "Students write arithmetic expressions and find their values in the right order.",
    keyPoints: ["An expression is numbers joined by operations.", "Brackets first, then multiplication and division, then addition and subtraction."],
    topics: [
      t("7m-arith-1", "Writing expressions", ["An arithmetic expression is numbers joined by operations, such as 12 plus 3 times 4.", "The value of an expression is the number it works out to."], ["Write an expression for: 5 pens at 10 rupees each."]),
      t("7m-arith-2", "Order of operations", ["Work out brackets first, then multiplication and division, then addition and subtraction.", "12 plus 3 times 4 is 12 plus 12, which is 24."], ["What is 2 plus 3 times 5?"]),
      t("7m-arith-3", "Comparing expressions", ["Two expressions can have the same value even if they look different.", "6 times 4 and 4 times 6 have the same value."], ["Do 10 minus 3 and 3 minus 10 have the same value?"]),
    ],
    audio: csAudio("c7-maths-2.mp3", 81),
  },
  {
    id: "7m-decimals", classNum: 7, subject: MATHS, number: 3, name: "A Peek Beyond the Point",
    objective: "Students use tenths and hundredths and write them as decimals.",
    keyPoints: ["A decimal shows parts of a whole after the point.", "One tenth is 0.1 and one hundredth is 0.01."],
    topics: [
      t("7m-decimals-1", "Fractional units", ["When one whole is split into 10 equal parts, each part is one tenth.", "When one whole is split into 100 equal parts, each part is one hundredth."], ["How many tenths make one whole?"]),
      t("7m-decimals-2", "Decimal notation", ["One tenth is written 0.1 and one hundredth is written 0.01.", "In 3.5, the 3 is ones and the 5 is tenths."], ["How do we write five tenths as a decimal?"]),
      t("7m-decimals-3", "Comparing decimals", ["To compare decimals, compare the ones first, then the tenths, then the hundredths.", "0.5 is bigger than 0.25, because 5 tenths is more than 2 tenths."], ["Which is bigger, 0.7 or 0.65?"]),
    ],
    audio: csAudio("c7-maths-3.mp3", 114),
  },
  // ---------------- Class 9 ----------------
  {
    id: "9m-coord", classNum: 9, subject: MATHS, number: 1, name: "Orienting Yourself: The Use of Coordinates",
    objective: "Students describe the position of a point with coordinates and name the quadrants.",
    keyPoints: ["A point is described by its x and y coordinates.", "The two axes divide the plane into four quadrants."],
    topics: [
      t("9m-coord-1", "The Cartesian system", ["The x-axis runs left to right and the y-axis runs up and down.", "The axes cross at the origin, the point 0, 0."], ["Where do the x-axis and y-axis meet?"]),
      t("9m-coord-2", "Plotting a point", ["The coordinates 3, 2 mean 3 along the x-axis and 2 up the y-axis.", "The x coordinate is always said first."], ["Which coordinate do we say first?"]),
      t("9m-coord-3", "Quadrants", ["The axes divide the plane into four quadrants.", "In the first quadrant, both coordinates are positive."], ["In which quadrant is the point 2, 5?"]),
    ],
    audio: csAudio("c9-maths-1.mp3", 54),
  },
  {
    id: "9m-poly", classNum: 9, subject: MATHS, number: 2, name: "Introduction to Linear Polynomials",
    objective: "Students recognise linear polynomials, find their zero and understand how they describe steady change.",
    keyPoints: ["A linear polynomial has degree 1, like 2x plus 3.", "The zero of a linear polynomial is the value of x that makes it zero."],
    topics: [
      t("9m-poly-1", "Linear expressions", ["A linear polynomial has the form a x plus b, where a is not zero.", "Its degree is 1, because the highest power of x is 1."], ["Is x squared plus 1 a linear polynomial?"]),
      t("9m-poly-2", "Zero of a linear polynomial", ["The zero of a linear polynomial is the value of x that makes it equal to zero.", "The zero of x minus 4 is 4."], ["What is the zero of x plus 2?"]),
      t("9m-poly-3", "Linear patterns", ["A linear polynomial grows by the same amount each time x goes up by 1.", "If a taxi charges 20 rupees plus 10 rupees per kilometre, the cost is 10x plus 20."], ["How much does the cost go up for each extra kilometre in 10x plus 20?"]),
    ],
    audio: csAudio("c9-maths-2.mp3", 81),
  },
  {
    id: "9m-numsys", classNum: 9, subject: MATHS, number: 3, name: "The World of Numbers",
    objective: "Students tell rational and irrational numbers apart and place real numbers on the number line.",
    keyPoints: ["A rational number can be written as p over q, with q not zero.", "Rational and irrational numbers together are the real numbers."],
    topics: [
      t("9m-numsys-1", "Rational numbers", ["A rational number can be written as p over q, where p and q are integers and q is not zero.", "Every integer is a rational number, because 5 is 5 over 1."], ["Is 0.75 a rational number? Write it as a fraction."]),
      t("9m-numsys-2", "Irrational numbers", ["An irrational number cannot be written as p over q.", "The square root of 2 is irrational; its decimal goes on without repeating."], ["Is the square root of 9 rational or irrational?"]),
      t("9m-numsys-3", "Real numbers on the number line", ["Every real number has a place on the number line.", "Between any two real numbers there are infinitely many others."], ["Name a number between 1 and 2."]),
    ],
    audio: csAudio("c9-maths-3.mp3", 100),
  },
];

// ================ Content Studio TIKs for the chapters with recordings (sample, in Vision Empower's format) ================
const HANDLE = "Students should be able to handle the given material.";
/** A chapter TIK synced from Content Studio. `concepts` is [[topic name, activity], ...], one per topic of the chapter. */
const csTik = (name, objectives, prerequisites, keyPoints, interest, concepts, exercise) => ({
  provenance: "Synced from Content Studio", scope: "chapter", lang: "English",
  objectives, prerequisites, keyPoints, learnMore: "",
  interest: [interest], concepts: concepts.map(([topic, a]) => ({ topic, activities: [a] })), exercises: [exercise],
  references: [`Content Studio: ${name} chapter TIK (sample)`], guidelines: GUIDELINES,
  reasoning: "Synced from Content Studio.", checks: [], instruction: null,
});

const CS_TIKS = {
  // ---------------- Class 6 Science ----------------
  "6-world": csTik("The Wonderful World of Science",
    ["To notice science in everyday things.", "To ask questions that can be tested.", "To follow the steps of the scientific method."],
    "Everyday experiences at home and on the way to school.",
    ["Science around us: science helps us understand everyday things, from cooking to the weather.",
      "Asking questions: science begins with curiosity, asking how and why.",
      "The scientific method: observe, ask a question, make a guess, test it, and reach a conclusion."],
    act("Mystery bag", ["A cloth bag", "Five everyday objects: spoon, leaf, stone, ball, bottle cap"], HANDLE, "",
      ["Pass the closed bag around the class.", "Each student feels one object through the cloth and guesses aloud what it is.",
        "Ask: how did you work it out? Let students share their clues.", "Explain that guessing from clues and then checking is what scientists do."]),
    [["Science around us", act("Science at home", ["Steel tumblers", "Water", "Ice cubes"], "Everyday experiences at home.", "To notice science in everyday things.",
      ["Ask the students to sit in pairs.", "Give each pair a steel tumbler of ice water.", "After two minutes, students feel the outside of the tumbler.",
        "Ask: where did the water drops on the outside come from? Let pairs discuss and share their ideas.",
        "Explain that science helps us understand everyday things like this, from cooking to the weather."])],
    ["Asking questions", act("Question circle", ["A seed", "A stone", "A dry leaf"], HANDLE, "To ask questions that can be tested.",
      ["Ask the students to sit in a circle.", "Pass the three objects around.", "Each student asks one how or why question about an object.",
        "The class discusses which questions can be answered by testing, for example: does the seed sink in water?",
        "Explain that science begins with curiosity, and a good question can be tested."])],
    ["The scientific method", act("Will it sink or float?", ["A bucket of water", "Stone", "Cork", "Steel spoon", "Plastic bottle cap"], "Know how to ask a testable question.",
      "To follow the steps of the scientific method.",
      ["Ask the students to form groups of four.", "Each group holds one object and says its guess aloud: will it sink or float?",
        "The group drops it into the water and feels where it ends up.", "Groups share whether the test matched their guess.",
        "Explain the steps: observe, ask a question, make a guess, test it, and reach a conclusion."])]],
    act("My own test", ["Objects from the classroom"], "Know the steps of the scientific method.", "",
      ["Ask the students to sit in pairs.", "Each pair chooses one question about an object in the classroom.", "They say their guess, test it, and share their conclusion with the class."])),

  "6-diversity": csTik("Diversity in the Living World",
    ["To group plants as herbs, shrubs and trees.", "To tell leaf veins and roots apart by touch.", "To link animals' features to their habitats."],
    "The parts of a plant, and some common animals, from earlier classes.",
    ["Variety in plants: herbs have soft green stems, shrubs have hard stems that branch near the ground, and trees have thick, woody trunks.",
      "Leaves and roots: leaf veins form a net or run side by side; roots are a single tap root or many thin fibrous roots.",
      "Animals and their habitats: a habitat is where a living thing lives, and animals have features that suit their habitat."],
    act("Two leaves", ["Leaves of three or four different plants"], HANDLE, "",
      ["Give each student two different leaves.", "Ask them to feel the edges, size and surface of each leaf.", "Students share how the two leaves are different."]),
    [["Variety in plants", act("Stem feel", ["A small herb, such as tulsi or coriander", "A twig from a shrub", "A piece of tree bark"], HANDLE,
      "To group plants as herbs, shrubs and trees by their stems.",
      ["Ask the students to form groups of three.", "Pass the three stems around each group.", "Students bend each one gently and feel whether it is soft or hard and woody.",
        "Groups discuss which kind of plant each came from.", "Explain herbs, shrubs and trees from the students' responses."])],
    ["Leaves and roots", act("Veins and roots by touch", ["A mango or peepal leaf", "A grass or banana leaf", "A mustard seedling with its root", "A clump of grass with roots"],
      "Know the parts of a plant.", "To tell net-like and parallel veins, and tap and fibrous roots, apart by touch.",
      ["Students trace the veins of each leaf with a fingertip.", "Ask: do the veins spread like a net, or run side by side?",
        "Students then feel the two roots and describe them.", "Pairs share their findings.", "Explain net-like and parallel veins, and tap and fibrous roots."])],
    ["Animals and their habitats", act("Who lives where?", ["Tactile models or toys of a fish, a camel, a frog and a bird"], "Know some common animals.",
      "To link animals' features to their habitats.",
      ["Ask the students to form groups.", "Each group explores the models by touch.", "Ask: what body feature helps this animal live where it does?",
        "Groups discuss and share, for example the fish's fins and smooth body.", "Explain that a habitat is where a living thing lives, and animals have features suited to it."])]],
    act("Sort the living things", ["Cards with the names of plants and animals in Braille and large print"], "Know herbs, shrubs, trees and habitats.", "",
      ["Divide the students into groups.", "Groups sort the cards into herbs, shrubs, trees and animals.", "Each group shares one reason for its sorting aloud."])),

  "6-eating": csTik("Mindful Eating: A Path to a Healthy Body",
    ["To know that food varies from region to region.", "To name the components of food.", "To plan a balanced meal."],
    "Foods eaten at home.",
    ["Food we eat: people in different regions eat different foods, depending on what grows there.",
      "Components of food: carbohydrates and fats give energy; proteins help the body grow; vitamins and minerals keep us healthy; roughage helps digestion.",
      "Balanced diet: a balanced diet has all the components of food in the right amounts, with water."],
    act("Guess the food", ["Small samples: rice, dal, groundnuts, a banana, jaggery"], HANDLE, "",
      ["Pass the samples around one at a time.", "Students smell and feel each one and guess aloud what it is.", "Students share which of these they eat at home."]),
    [["Food we eat", act("Food from my region", ["Samples of local grains and vegetables"], "Know some foods eaten at home.", "To know that food varies by region.",
      ["Each student names one dish from home and what it is made of.", "Group the dishes aloud by their main grain: rice, wheat or millet.",
        "Discuss why people in different places eat different foods.", "Explain that eating mindfully means paying attention to what and how much we eat."])],
    ["Components of food", act("Greasy spot test", ["Groundnuts", "A boiled potato", "Plain paper"], HANDLE, "To find out that some foods contain fat.",
      ["Ask the students to sit in pairs.", "Each pair rubs a crushed groundnut on one piece of paper and a piece of potato on another.",
        "After two minutes, students feel both papers. The groundnut leaves a greasy spot; the potato patch dries.", "Pairs share what they felt.",
        "Explain the components of food and what each one does for the body."])],
    ["Balanced diet", act("Build a thali", ["A plate", "Food cards in Braille and large print"], "Know the components of food.", "To plan a balanced meal.",
      ["Divide the students into groups.", "Each group chooses cards to make a thali for one meal.", "Groups check aloud that every component of food is in their thali.",
        "Groups share their thali and discuss what is missing, if anything.", "Explain a balanced diet, and that a lack of a component can cause a deficiency disease."])]],
    act("My food diary", ["None"], "Know what a balanced diet is.", "",
      ["Each student says aloud what they ate yesterday.", "The class discusses which component of food, if any, was missing."])),

  // ---------------- Class 7 Science ----------------
  "7-world": csTik("The Ever-Evolving World of Science",
    ["To know that we use science every day.", "To ask questions from careful observation.", "To understand that scientific ideas change with new evidence."],
    "What students learned about the scientific method in class 6.",
    ["Science in everyday life: we use science every day, when we cook, travel or use a phone.",
      "Curiosity and questions: curiosity leads to questions, and careful observation leads to better questions.",
      "Science keeps changing: scientific ideas change when new evidence is found, and scientists share their findings so others can check them."],
    act("Then and now", ["A clay cup", "A steel tumbler", "A plastic bottle"], HANDLE, "",
      ["Pass the three objects around.", "Students feel each one and guess which idea is the oldest.", "Students share how carrying water has changed over time, and why."]),
    [["Science in everyday life", act("Inside a torch", ["A torch with its cells"], HANDLE, "To know that we use science every day.",
      ["Ask the students to sit in pairs.", "Each pair opens the torch and feels the cells, the spring and the switch.", "Ask: what makes it work?",
        "Pairs share their ideas.", "Explain that we use science every day, in things like a torch."])],
    ["Curiosity and questions", act("Question jar", ["A jar", "Slips of paper or Braille cards"], "Know how to ask a question.", "To ask questions from careful observation.",
      ["Each student says one question they wonder about, and it goes in the jar.", "Take out questions one by one.",
        "The class discusses which ones can be tested in class.", "Explain that careful observation helps us ask better questions."])],
    ["Science keeps changing", act("Flat or round?", ["A ball"], HANDLE, "To understand that scientific ideas change with new evidence.",
      ["Tell the story: long ago, many people thought the Earth was flat.", "Students hold the ball and discuss how sailors' long journeys gave new evidence.",
        "Students share other ideas they know that changed.", "Explain that ideas in science change when new evidence is found."])]],
    act("Ask an elder", ["None"], "Know that science changes how we live.", "",
      ["At home, each student asks an elder one way life has changed because of science.", "In the next class, students share what they found out."])),

  "7-substances": csTik("Exploring Substances: Acidic, Basic, and Neutral",
    ["To know common acids and bases.", "To test substances with an indicator.", "To understand neutralisation."],
    "Sour and bitter tastes of foods eaten at home. Never taste or touch an unknown substance.",
    ["Acids and bases: acids, like lemon juice and vinegar, are sour; bases, like soap solution, feel slippery.",
      "Indicators: an indicator changes in an acid or a base. Onion juice is an indicator that students can test by smell.",
      "Neutralisation: an acid and a base mixed in the right amounts cancel each other out. Antacids work this way."],
    act("Smell and remember", ["A lemon", "Tamarind", "A soap bar"], HANDLE, "",
      ["Pass each item around.", "Students smell each one and remember how the foods taste at home.", "Students share words for them: sour, bitter, slippery."]),
    [["Acids and bases", act("Sour or slippery?", ["Lemon juice, vinegar, soap solution and baking soda solution, in labelled cups"], "Never taste an unknown substance.",
      "To know common acids and bases.",
      ["The teacher names each cup aloud.", "Students rub a drop of soap solution between their fingers and feel that it is slippery.",
        "The teacher explains that lemon juice and vinegar are sour.", "Groups discuss and sort the cups into acids and bases.", "Explain acids and bases, and never to taste them."])],
    ["Indicators", act("Smell indicator", ["Cloth strips soaked in onion juice", "Vinegar", "Baking soda solution"], "Know that vinegar is an acid and baking soda solution is a base.",
      "To test substances with an indicator that changes smell.",
      ["Give each group onion strips.", "Students dip one strip in vinegar and smell it: the onion smell stays.",
        "They dip another strip in baking soda solution and smell it: the onion smell goes away.", "Groups share what they noticed.",
        "Explain that an indicator changes in an acid or a base. Litmus and turmeric are other indicators, which a partner can describe."])],
    ["Neutralisation", act("Use up the acid", ["Vinegar", "Baking soda solution", "Onion strips", "A spoon"], "Know how the onion indicator works.", "To understand neutralisation.",
      ["Groups add baking soda solution to vinegar, one spoon at a time, and listen to the fizz.", "After each spoon, they dip an onion strip and smell it.",
        "When the onion smell goes away, the acid is used up.", "Groups discuss what happened.", "Explain neutralisation, and how an antacid relieves acidity."])]],
    act("Kitchen sort", ["Cards with kitchen items in Braille and large print"], "Know acids, bases and neutral substances.", "",
      ["Divide the students into groups.", "Groups sort lemon, curd, soap, baking soda, salt water and sugar water into acidic, basic and neutral.", "Groups share their reasons."])),

  "7-electric": csTik("Electricity: Circuits and their Components",
    ["To know the terminals of a cell.", "To make a closed circuit.", "To sort materials into conductors and insulators."],
    "Electrical devices used at home. Never touch mains electricity or open a cell.",
    ["Electric cell: a cell has a positive and a negative terminal; cells joined together make a battery.",
      "Electric circuits: current flows only in a closed circuit; a switch opens or closes it.",
      "Conductors and insulators: metals let current pass; plastic, rubber and wood do not."],
    act("Torch puzzle", ["A torch with one cell put in the wrong way round"], HANDLE, "",
      ["Pass the torch around and let students press the switch.", "Ask: why does it not work? Let students share their ideas.", "Turn the cell the right way round and try again."]),
    [["Electric cell", act("Feel the cell", ["AA cells", "A 9-volt battery"], HANDLE, "To know the terminals of a cell.",
      ["Give each student a cell.", "Students feel the bump at the positive terminal and the flat negative terminal.",
        "Pairs join two cells end to end and feel how they fit.", "Pairs share what they found.", "Explain terminals, and that cells joined together make a battery."])],
    ["Electric circuits", act("Make the buzzer sound", ["A cell in a holder", "A buzzer", "Connecting wires with clips", "A switch"], "Know the terminals of a cell.",
      "To make a closed circuit.",
      ["Ask the students to form groups of three.", "Groups connect the cell, the switch and the buzzer with the wires.",
        "They close the switch and listen: the buzzer sounds. They open it: the buzzer stops.", "Groups share what the switch does.",
        "Explain that current flows only when the circuit is closed."])],
    ["Conductors and insulators", act("Will it buzz?", ["The buzzer circuit with a gap", "Key", "Coin", "Eraser", "Pencil", "Plastic ruler", "Paper clip"],
      "Know how to make a closed circuit.", "To sort materials into conductors and insulators.",
      ["Groups place each object across the gap in the circuit.", "They listen for the buzzer.", "They sort the objects into two boxes: buzzes and does not buzz.",
        "Groups share their results.", "Explain conductors and insulators, and why electric wires are covered with plastic."])]],
    act("Circuit check", ["Buzzer circuits with one fault, such as a loose wire"], "Know how a closed circuit works.", "",
      ["Give each group a circuit with one fault.", "Groups find the fault by touch and fix it.", "Groups share what was wrong."])),

  // ---------------- Class 7 Maths ----------------
  "7m-large": csTik("Large Numbers Around Us",
    ["To know lakhs and crores.", "To read and write large numbers in the Indian system.", "To estimate large numbers."],
    "Place value up to thousands.",
    ["Lakhs and crores: one lakh is 1,00,000; one crore is 1,00,00,000, which is one hundred lakh.",
      "Reading and writing large numbers: group the digits as ones, thousands, lakhs and crores, and say each group by its name.",
      "Estimating large numbers: round to the nearest thousand, lakh or crore to get a quick, close answer."],
    act("How many seeds?", ["A bag of 100 seeds or beads"], HANDLE, "",
      ["Pass the bag around and let students guess how many seeds are in it.", "Count them together in tens.",
        "Ask: how many such bags would make one lakh? Students share their guesses."]),
    [["Lakhs and crores", act("Place value chart", ["Tactile place value chart with Braille labels", "Counters"], "Place value up to thousands.", "To know lakhs and crores.",
      ["Students feel the columns of the chart, from ones to crores.", "They place one counter in the lakhs column and say the number aloud.",
        "Ask: how many thousands make one lakh? Let students discuss.", "Explain that one lakh is one hundred thousand and one crore is one hundred lakh."])],
    ["Reading and writing large numbers", act("Say it aloud", ["Number cards in Braille and large print"], "Know lakhs and crores.", "To read large numbers in the Indian system.",
      ["Ask the students to sit in pairs.", "One student reads a card aloud, group by group: crores, lakhs, thousands, ones.", "The partner checks.",
        "Pairs share the hardest number they read.", "Explain how the commas group digits in the Indian system."])],
    ["Estimating large numbers", act("Round the towns", ["Abacus"], "Know how to read large numbers.", "To estimate large numbers.",
      ["Say aloud the populations of three nearby towns.", "Students round each to the nearest lakh on the abacus.",
        "Groups discuss which town has about two lakh people.", "Explain that an estimate is close to the exact answer, not equal to it."])]],
    act("Big numbers at home", ["None"], "Know how to read large numbers.", "",
      ["Each student finds one large number at home or in the news.", "In the next class, students share it aloud in lakhs and crores."])),

  "7m-arith": csTik("Arithmetic Expressions",
    ["To write an arithmetic expression for a situation.", "To find the value of an expression in the right order.", "To compare the values of expressions."],
    "Addition, subtraction, multiplication and division of whole numbers.",
    ["Writing expressions: an expression is numbers joined by operations, and its value is the number it works out to.",
      "Order of operations: brackets first, then multiplication and division, then addition and subtraction.",
      "Comparing expressions: expressions that look different can have the same value."],
    act("Shopkeeper game", ["Toy coins", "Three items with prices in Braille and large print"], HANDLE, "",
      ["One student buys two pens and one notebook from a classmate.", "The class says aloud how to work out the total.", "Students share the different ways they found."]),
    [["Writing expressions", act("Story to expression", ["Counters"], "Multiplication of whole numbers.", "To write an expression for a situation.",
      ["Tell a short story: 5 pens at 10 rupees each.", "Students say the expression aloud: 5 times 10.", "They build it with counters and find its value.",
        "Pairs make up their own story and share its expression.", "Explain what an expression and its value are."])],
    ["Order of operations", act("Two answers?", ["Abacus"], "Know how to write an expression.", "To find the value of an expression in the right order.",
      ["Say aloud: 2 plus 3 times 5.", "Half the class adds first; the other half multiplies first.", "Compare the answers, 25 and 17, and discuss which is right.",
        "Explain the order: brackets, then multiplication and division, then addition and subtraction."])],
    ["Comparing expressions", act("Same value?", ["Counters"], "Know the order of operations.", "To compare the values of expressions.",
      ["Pairs build 6 groups of 4 and 4 groups of 6 with counters, and count each.", "Then they work out 10 minus 3 and 3 minus 10.",
        "Pairs discuss which expressions have the same value, and share why.", "Explain that order matters for subtraction but not for multiplication."])]],
    act("Expression relay", ["Expression cards in Braille and large print"], "Know the order of operations.", "",
      ["Divide the students into groups.", "Groups take turns finding the value of an expression aloud.", "The other groups check and share their answers."])),

  "7m-decimals": csTik("A Peek Beyond the Point",
    ["To know tenths and hundredths.", "To write tenths and hundredths as decimals.", "To compare decimals."],
    "Fractions with 10 and 100 as the denominator.",
    ["Fractional units: one whole split into 10 equal parts gives tenths; into 100 equal parts gives hundredths.",
      "Decimal notation: one tenth is 0.1 and one hundredth is 0.01; in 3.5, the 3 is ones and the 5 is tenths.",
      "Comparing decimals: compare the ones first, then the tenths, then the hundredths."],
    act("Share the chapati", ["A paper circle cut into 10 equal parts"], HANDLE, "",
      ["Pass the paper circle around in its 10 pieces.", "Ask: what part of the whole is one piece?", "Students share their answers."]),
    [["Fractional units", act("Tenths and hundredths by touch", ["A card strip cut into 10 equal parts", "A 10 by 10 grid with raised lines"], HANDLE,
      "To know tenths and hundredths.",
      ["Students feel the whole strip, then its 10 parts.", "Explain that one part is one tenth.", "Students feel the grid and find one small square: one hundredth.",
        "Pairs discuss how many hundredths make one tenth, and share."])],
    ["Decimal notation", act("Point on the ruler", ["A tactile ruler with raised centimetre and millimetre marks", "Pencils"], "Know tenths.", "To write tenths as decimals.",
      ["Students find 3 centimetres and 5 millimetres on the ruler by touch.", "Say it together: 3.5 centimetres.",
        "Pairs measure a pencil and share its length as a decimal.", "Explain that in 3.5, the 3 is ones and the 5 is tenths."])],
    ["Comparing decimals", act("Which is longer?", ["Two ribbons, 0.7 metres and 0.65 metres long, labelled in Braille"], "Know decimal notation.", "To compare decimals.",
      ["Students guess which ribbon is longer from the labels alone.", "They hold the two ribbons side by side to check.",
        "Groups discuss why 0.7 is more than 0.65.", "Explain: compare the ones, then the tenths, then the hundredths."])]],
    act("Decimal shopping", ["Price cards in Braille and large print, such as 12.50 rupees and 12.05 rupees"], "Know how to compare decimals.", "",
      ["Divide the students into groups.", "Groups put the price cards in order from least to most.", "Groups share their order and explain it."])),

  // ---------------- Class 9 Maths ----------------
  "9m-coord": csTik("Orienting Yourself: The Use of Coordinates",
    ["To know the axes and the origin.", "To plot a point from its coordinates.", "To name the quadrants."],
    "The number line, including negative numbers.",
    ["The Cartesian system: the x-axis runs left to right and the y-axis runs up and down; they cross at the origin, 0, 0.",
      "Plotting a point: the coordinates 3, 2 mean 3 along the x-axis and 2 up the y-axis; the x coordinate is said first.",
      "Quadrants: the axes divide the plane into four quadrants; in the first, both coordinates are positive."],
    act("Find my seat", ["Classroom desks in rows"], HANDLE, "",
      ["Say aloud: row 2, seat 3.", "The student sitting there stands and says their name.", "Ask: why do we need two numbers? Students share their ideas."]),
    [["The Cartesian system", act("Two strings", ["A pegboard or tactile graph board", "Two thick strings"], HANDLE, "To know the axes and the origin.",
      ["Groups fix one string across the board and one string up and down it.", "Students feel where the strings cross.",
        "Groups discuss why we need a starting point.", "Explain the x-axis, the y-axis and the origin, 0, 0."])],
    ["Plotting a point", act("Peg the point", ["A pegboard with axes", "Pegs"], "Know the axes and the origin.", "To plot a point from its coordinates.",
      ["From the origin, students move 3 holes right and 2 holes up, and put a peg there: 3, 2.", "Pairs give each other coordinates to peg.",
        "Partners check each other by touch and share any mistakes.", "Explain that the x coordinate is always said first."])],
    ["Quadrants", act("Four corners", ["A pegboard with axes", "Pegs"], "Know how to plot a point.", "To name the quadrants.",
      ["Students put pegs at 2, 5; minus 2, 5; minus 2, minus 5; and 2, minus 5.", "They feel which part of the board each peg is in.",
        "Groups discuss the signs of the coordinates in each part.", "Explain the four quadrants."])]],
    act("Coordinate treasure hunt", ["A pegboard with axes", "Pegs"], "Know how to plot a point.", "",
      ["Ask the students to sit in pairs.", "One student places a peg and says its coordinates; the other finds it by touch.", "Pairs swap roles and share how they did."])),

  "9m-poly": csTik("Introduction to Linear Polynomials",
    ["To recognise linear polynomials.", "To find the zero of a linear polynomial.", "To understand how a linear polynomial describes steady change."],
    "Algebraic expressions and solving simple equations.",
    ["Linear expressions: a linear polynomial has the form a x plus b, where a is not zero, and its degree is 1.",
      "Zero of a linear polynomial: the value of x that makes it equal to zero; the zero of x minus 4 is 4.",
      "Linear patterns: a linear polynomial grows by the same amount each time x goes up by 1."],
    act("Taxi fare", ["Toy coins"], HANDLE, "",
      ["Say: a taxi charges 20 rupees plus 10 rupees for each kilometre.", "Students count out the fare in coins for 1, 2 and 3 kilometres.", "Students share the pattern they notice."]),
    [["Linear expressions", act("Sort the expressions", ["Expression cards in Braille and large print: 2x plus 3, x squared plus 1, 5x, 7"], "Know what an expression is.",
      "To recognise linear polynomials.",
      ["Divide the students into groups.", "Groups sort the cards into those with degree 1 and the rest.", "Groups discuss and share their reasons.",
        "Explain that a linear polynomial has the form a x plus b, with degree 1."])],
    ["Zero of a linear polynomial", act("Make it zero", ["A tactile number line"], "Know how to substitute a value for x.", "To find the zero of a linear polynomial.",
      ["Students try values of x on the number line for x minus 4.", "They find which value gives zero.", "Pairs share their answer and how they found it.",
        "Explain that the zero of x minus 4 is 4."])],
    ["Linear patterns", act("Steady steps", ["Counters"], "Know linear polynomials.", "To know that a linear polynomial changes by the same amount each step.",
      ["Students build 10x plus 20 with counters for x equals 1, 2 and 3.", "They feel that each step adds 10 counters.",
        "Groups discuss what stays the same each step, and share.", "Explain that a linear polynomial grows by the same amount each time x goes up by 1."])]],
    act("Make your own rule", ["Counters"], "Know linear polynomials and their zeroes.", "",
      ["Ask the students to sit in pairs.", "Each pair makes a linear rule for a real situation, such as a phone plan.", "Pairs share their expression and its zero."])),

  "9m-numsys": csTik("The World of Numbers",
    ["To know rational numbers.", "To know irrational numbers.", "To place real numbers on the number line."],
    "Fractions, decimals and integers.",
    ["Rational numbers: can be written as p over q, where p and q are integers and q is not zero.",
      "Irrational numbers: cannot be written as p over q; the square root of 2 is irrational.",
      "Real numbers: rational and irrational numbers together; every real number has a place on the number line."],
    act("Rope number line", ["A rope with knots at 0, 1, 2 and 3"], HANDLE, "",
      ["Students walk their hands along the rope from 0.", "They stop halfway between 1 and 2.", "Ask: what number is this? Students share their answers."]),
    [["Rational numbers", act("Fraction or not?", ["Number cards in Braille and large print: 0.75, 5, minus 2, one third"], "Know fractions and integers.", "To know rational numbers.",
      ["Divide the students into groups.", "Groups say each number aloud as p over q.", "Groups discuss and share any that were hard.",
        "Explain that every integer is rational, because 5 is 5 over 1."])],
    ["Irrational numbers", act("The diagonal", ["A card square with sides of one unit", "String"], "Know rational numbers.", "To know irrational numbers.",
      ["Students measure the diagonal of the square with string.", "They compare it with a side: it is longer than 1 and shorter than 2.",
        "Explain that its length is the square root of 2, whose decimal never ends or repeats.", "Groups discuss why it cannot be written as p over q, and share."])],
    ["Real numbers on the number line", act("Squeeze between", ["The knotted rope"], "Know rational and irrational numbers.", "To place real numbers on the number line.",
      ["Two students hold the knots for 1 and 2.", "Others name numbers between them, and the class finds each one on the rope.",
        "Students discuss whether they could ever run out of numbers, and share.", "Explain that between any two real numbers there are infinitely many others."])]],
    act("Number sort", ["Number cards in Braille and large print"], "Know rational and irrational numbers.", "",
      ["Divide the students into groups.", "Groups sort the cards into rational and irrational numbers.", "Groups share and explain their sorting."])),
};
for (const c of chapters) if (CS_TIKS[c.id]) c.syncedTik = CS_TIKS[c.id];
// every Content Studio TIK starts with its header: syllabus, subject, grade, textbook and chapter
for (const c of chapters) if (c.syncedTik) c.syncedTik.header = tikHeader(c);

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
