/**
 * The few-shot that replaces the literature review.
 *
 * Both generation routes used to open by introducing the model to a cognitive
 * science persona and then cite it: Craik & Lockhart, Paivio, Chi, Ausubel,
 * Joshua Foer. Naming those researchers changed nothing about the physics of
 * the answer, and the model answered in the shape the prose invited — a polite
 * tutor: definitions, hedged explanations, "X is important because...".
 *
 * Models copy the shape of a demonstration far more reliably than they follow
 * an adjective. So the persona is one sentence and the example is long: one
 * jargon-soup answer marked bad, one mechanism answer marked good, and the
 * reason for each. Everything else in the route prompts stays concrete (which
 * fields must be populated, what a paradox is), but the academic citations and
 * the rhetorical justification around them are gone.
 */

/** Who is answering. One sentence, no literature. */
export const FIRST_PRINCIPLES_ENGINE =
  `You are a first-principles STEM engine. You convert dense science into the physical mechanism: the gradients, forces, and collisions that make it happen.`;

/** The demonstration: the exact depth of answer to emit, and the depth to avoid. */
export const FIRST_PRINCIPLES_FEW_SHOT = `BAD OUTPUT:
"Mitochondria produce ATP through oxidative phosphorylation to power the cell."
(Why it's bad: Jargon-soup, zero physical mechanics, pure passive definition.)

GOOD OUTPUT:
"Complexes I, III, and IV pump protons across the inner mitochondrial membrane, building a steep positive charge and concentration gradient in the intermembrane space. These trapped protons can only escape by physically rotating the rotor of ATP synthase, mechanically pressing ADP and inorganic phosphate together."
(Why it's good: Shows the gradient, the physical constraint, the rotor movement, and the mechanical formation.)`;

// ─── The scaffold's field contract ───────────────────────────────────────────
//
// The workbench renders `fieldNLabel` above each blank and `fieldNPlaceholder`
// inside it, so both are instructional text the learner reads BEFORE answering.
// A live probe of the gear paths caught the models writing the answer into both
// (`field1Label: "countercurrent flow"`, `field1Placeholder: "Na+ extrusion in
// thick ascending limb"`) and camelCase identifiers (`pumpStepEffect`) into the
// labels the sentence scaffold turns into clauses - because neither field had a
// description in the response schema and the prompt never stated the rule.
//
// The rules live here rather than in a single route because three routes produce
// stage scaffolds (/api/encode, its guided branch, and /api/youtube), and only
// Gemini ever receives the schema: the same rule has to be in the prompt too.

/** `field1Label`/`field2Label`/`field3Label` - the blank's role, never its answer. */
export const SCAFFOLD_LABEL_RULE =
  "The ROLE of this blank in 2-5 words, named so the learner knows what to produce ('Trigger', 'Mechanism', 'Failure mode'). NEVER the answer itself: a label that contains the answer gives the exercise away.";

/** `field1Placeholder`/`field2Placeholder`/`field3Placeholder` - a cue, never the answer. */
export const SCAFFOLD_PLACEHOLDER_RULE =
  "A cue that provokes the answer - a question or the shape of the expected phrase ('What sets it off?'), never the answer itself.";

/** `exampleAnswer` - shown for comparison after the learner has answered. */
export const SCAFFOLD_EXAMPLE_RULE =
  "The model answer for this blank, written for the learner to compare against AFTER they have answered.";

/**
 * The same contract in words, for the providers that are never handed a schema.
 *
 * OpenRouter and the OpenAI-compatible `json_object` mode only require valid
 * JSON, so a rule that exists solely as a schema description does not reach the
 * model that is actually writing the blanks.
 */
export const SCAFFOLD_CONTRACT = `SCAFFOLD CONTRACT - the blanks a stage asks the learner to fill:
- Each 'fieldNLabel' names the ROLE of that blank in 2-5 words ("Trigger", "Physical mechanism", "Failure mode"). A label is NEVER the answer: "countercurrent flow" is an answer, and a label containing it hands the exercise over. Never a camelCase identifier, never a bare keyword.
- Each 'fieldNPlaceholder' is a cue that provokes the answer ("What sets it off?"), never the answer itself.
- 'exampleAnswer' is the model answer, for the learner to compare against AFTER they have answered.`;
