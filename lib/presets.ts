// Concept / Memorization / YouTube presets extracted from app/page.tsx so they
// can be reused by other surfaces (launchpad, share import, future schedulers).

export interface NotePreset {
  title: string;
  icon: string;
  notes: string;
}

export interface YouTubePreset {
  title: string;
  url: string;
  channel: string;
  icon: string;
}

// Concept Presets
export const CONCEPTUAL_PRESETS: NotePreset[] = [
  {
    title: 'Biology: Action Potentials',
    icon: '⚡',
    notes: `Action potentials are rapid electrical signals used by neurons. 
At resting potential (-70mV), Na+/K+ pumps maintain high K+ inside and high Na+ outside. 
When a stimulus depolarizes the membrane to threshold (-55mV), voltage-gated Na+ channels open rapidly, causing Na+ influx (depolarization up to +40mV). 
Next, Na+ channels inactivate and voltage-gated K+ channels open, allowing K+ efflux (repolarization). 
The slow closure of K+ channels causes hyperpolarization before returning to resting state. Myelin sheaths enable saltatory conduction between Nodes of Ranvier.`
  },
  {
    title: 'CS: TCP 3-Way Handshake & AIMD',
    icon: '🌐',
    notes: `TCP uses a 3-way handshake to establish a reliable connection between client and server before data transfer begins.
Step 1: Client sends a SYN (Synchronize) packet with a random initial sequence number (ISN_c) to the server. Client enters SYN-SENT state.
Step 2: Server receives SYN, allocates buffers, and replies with SYN-ACK packet containing its own sequence number (ISN_s) and ACK = ISN_c + 1. Server enters SYN-RECEIVED state.
Step 3: Client sends an ACK packet with ACK = ISN_s + 1. Both endpoints are now in ESTABLISHED state.
For Congestion Control, TCP uses AIMD (Additive Increase / Multiplicative Decrease). It increases congestion window by 1 MSS per RTT, but cuts the window in half upon packet loss.`
  },
  {
    title: 'Psychology: Cognitive Dissonance',
    icon: '🧠',
    notes: `Leon Festinger's Cognitive Dissonance Theory states that when a person holds two contradictory beliefs, or their behavior conflicts with their belief, they experience an uncomfortable psychological tension called dissonance.
Because dissonance is unpleasant, individuals are motivated to reduce it through three strategies:
1. Changing the behavior (e.g. quit smoking).
2. Changing the cognition/attitude (e.g. "smoking isn't actually that dangerous").
3. Adding new consonant cognitions to justify the behavior (e.g. "smoking relieves my stress which keeps me healthy").`
  },
  {
    title: 'Finance: Compound Interest & Risk',
    icon: '📈',
    notes: `Compound interest is the addition of interest to the principal sum of a loan or deposit, or in other words, 'interest on interest'. 
The mathematical formula is A = P(1 + r/n)^(nt), where A is final amount, P is principal, r is annual interest rate, n is compounding frequency, and t is time.
Over short horizons, linear growth dominates, but over long horizons, exponential compounding causes exponential acceleration. As n approaches infinity, A = P * e^(rt).`
  }
];

// Memorization Presets
export const MEMORIZATION_PRESETS: NotePreset[] = [
  {
    title: 'Chemistry: 7 Strong Acids vs Weak Acids',
    icon: '🧪',
    notes: `The 7 Strong Acids dissociate completely in water (Ka >> 1):
1. Hydrochloric Acid (HCl)
2. Hydrobromic Acid (HBr)
3. Hydroiodic Acid (HI)
4. Nitric Acid (HNO3)
5. Sulfuric Acid (H2SO4 - 1st proton)
6. Perchloric Acid (HClO4)
7. Chloric Acid (HClO3)

Common Weak Acids that only partially dissociate:
- Hydrofluoric acid (HF - despite being a halogen, strong H-F bond and high hydration enthalpy make it weak)
- Acetic acid (CH3COOH)
- Phosphoric acid (H3PO4)
- Carbonic acid (H2CO3)`
  },
  {
    title: 'Chemistry: Periodic Table Group 1 & 17 Trends',
    icon: '⚛️',
    notes: `Group 1 (Alkali Metals): Lithium (Li), Sodium (Na), Potassium (K), Rubidium (Rb), Cesium (Cs), Francium (Fr).
- Valence: 1 electron in s-orbital (ns1).
- Reactivity: Increases down the group as ionization energy decreases (larger atomic radius, shielding). React violently with water producing H2 gas and alkaline MOH.
- Stored under mineral oil to prevent oxidation.

Group 17 (Halogens): Fluorine (F), Chlorine (Cl), Bromine (Br), Iodine (I), Astatine (At).
- Valence: 7 electrons (ns2 np5), highly electronegative oxidizers.
- Physical state down group: F2 (pale yellow gas), Cl2 (green gas), Br2 (red-brown liquid), I2 (dark purple solid).
- Reactivity decreases down the group.`
  },
  {
    title: 'Biochemistry: 9 Essential Amino Acids',
    icon: '🧬',
    notes: `The 9 Essential Amino Acids that cannot be synthesized de novo by the human body:
1. Phenylalanine (Phe / F) - Aromatic, precursor to Tyrosine, Dopamine, Epinephrine.
2. Valine (Val / V) - Branched-Chain Amino Acid (BCAA), non-polar hydrophobic.
3. Threonine (Thr / T) - Polar uncharged, hydroxyl group.
4. Tryptophan (Trp / W) - Aromatic indole ring, precursor to Serotonin & Melatonin.
5. Isoleucine (Ile / I) - Branched-Chain Amino Acid (BCAA).
6. Methionine (Met / M) - Non-polar, contains sulfur, start codon (AUG).
7. Histidine (His / H) - Positively charged basic, imidazole ring, buffer.
8. Leucine (Leu / L) - Branched-Chain Amino Acid (BCAA), key trigger for mTOR protein synthesis.
9. Lysine (Lys / K) - Positively charged basic, amine side chain.`
  },
  {
    title: 'Medicine: 12 Cranial Nerves',
    icon: '🩻',
    notes: `The 12 Cranial Nerves and their primary functions:
CN I: Olfactory (Sensory - Smell)
CN II: Optic (Sensory - Vision)
CN III: Oculomotor (Motor - Eye movement, pupil constriction)
CN IV: Trochlear (Motor - Superior oblique eye muscle / down-and-in)
CN V: Trigeminal (Both - Facial sensation, chewing/mastication muscles)
CN VI: Abducens (Motor - Lateral rectus eye muscle / lateral gaze)
CN VII: Facial (Both - Facial expression muscles, taste anterior 2/3 tongue)
CN VIII: Vestibulocochlear (Sensory - Hearing & balance/vestibular)
CN IX: Glossopharyngeal (Both - Taste posterior 1/3, swallowing, carotid baroreceptors)
CN X: Vagus (Both - Parasympathetic innervation to heart, lungs, GI tract)
CN XI: Accessory (Motor - Sternocleidomastoid & Trapezius / shoulder shrug)
CN XII: Hypoglossal (Motor - Tongue movement)`
  }
];

// YouTube Video Lecture Presets (1-Click Test)
export const YOUTUBE_PRESETS: YouTubePreset[] = [
  {
    title: '3Blue1Brown: Neural Networks & Backprop',
    url: 'https://www.youtube.com/watch?v=aircAruvnKk',
    channel: '3Blue1Brown',
    icon: '🤖'
  },
  {
    title: 'Khan Academy: Action Potentials & Gating',
    url: 'https://www.youtube.com/watch?v=7EyhsOewnH4',
    channel: 'Khan Academy',
    icon: '⚡'
  },
  {
    title: 'MIT OCW: TCP Congestion & Networking',
    url: 'https://www.youtube.com/watch?v=kZX169bNn4M',
    channel: 'MIT OpenCourseWare',
    icon: '🌐'
  },
  {
    title: 'Huberman Lab: Dopamine & Neuroplasticity',
    url: 'https://www.youtube.com/watch?v=QmOF0crdyRU',
    channel: 'Huberman Lab',
    icon: '🧠'
  }
];

