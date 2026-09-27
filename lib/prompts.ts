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
