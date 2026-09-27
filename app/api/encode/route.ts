import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateEncodedSchema } from "@/lib/ai-output-validation";
import { FIRST_PRINCIPLES_ENGINE, FIRST_PRINCIPLES_FEW_SHOT } from "@/lib/prompts";
import { getDifficultyLevel, getDifficultyPromptModifier } from "@/lib/services/adaptiveDifficulty";

// Allow up to 60s for multi-stage schema generation on Vercel
export const maxDuration = 60;

// Structured visual configurations per template type
const visualDataSchema = {
  type: Type.OBJECT,
  description: "Visual and structural diagram data customized for the stage's templateType",
  properties: {
    generationChallenge: {
      type: Type.OBJECT,
      description: "Generation Effect: Partial schema premise prompting the learner to deduce the missing half",
      properties: {
        premisePrompt: { type: Type.STRING, description: "e.g. 'If the cell is an industrial factory, what is the mitochondria?'" },
        clue: { type: Type.STRING, description: "Socratic hint to guide generation without giving the answer away" },
        missingRoleOrTarget: { type: Type.STRING, description: "The missing target/mechanism the user should generate" },
        expertCompletion: { type: Type.STRING, description: "Full expert schema completion" }
      },
      required: ["premisePrompt", "missingRoleOrTarget"]
    },
    nodes: {
      type: Type.ARRAY,
      description: "Causal or flowchart nodes for first_principles and cause_effect",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING },
          subtext: { type: Type.STRING },
          type: { type: Type.STRING, description: "'input' | 'mechanism' | 'outcome' | 'danger'" }
        },
        required: ["id", "label"]
      }
    },
    analogyMappings: {
      type: Type.ARRAY,
      description: "Cross-domain mappings for analogy_matrix",
      items: {
        type: Type.OBJECT,
        properties: {
          sourceElement: { type: Type.STRING, description: "Familiar domain component e.g. 'Water Pipe'" },
          targetElement: { type: Type.STRING, description: "Target concept component e.g. 'Electrical Wire'" },
          explanation: { type: Type.STRING, description: "How the mechanics match" }
        },
        required: ["sourceElement", "targetElement"]
      }
    },
    contrastMatrix: {
      type: Type.OBJECT,
      description: "2x2 Disambiguation grid for contrast_grid",
      properties: {
        axisX: { type: Type.STRING },
        axisY: { type: Type.STRING },
        quadrants: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              items: { type: Type.ARRAY, items: { type: Type.STRING } },
              trapWarning: { type: Type.STRING }
            },
            required: ["title", "items"]
          }
        }
      }
    },
    palaceRooms: {
      type: Type.ARRAY,
      description: "Spatial journey rooms for memory_palace",
      items: {
        type: Type.OBJECT,
        properties: {
          roomName: { type: Type.STRING },
          itemPlaced: { type: Type.STRING },
          vividSensoryHook: { type: Type.STRING },
          locusNumber: { type: Type.INTEGER }
        },
        required: ["roomName", "itemPlaced", "vividSensoryHook", "locusNumber"]
      }
    },
    chunkBuckets: {
      type: Type.ARRAY,
      description: "Categorical cluster buckets for taxonomic_chunking",
      items: {
        type: Type.OBJECT,
        properties: {
          bucketName: { type: Type.STRING },
          items: { type: Type.ARRAY, items: { type: Type.STRING } },
          colorHint: { type: Type.STRING }
        },
        required: ["bucketName", "items"]
      }
    },
    acronymLetters: {
      type: Type.ARRAY,
      description: "Letter breakdown for mnemonic_peg",
      items: {
        type: Type.OBJECT,
        properties: {
          letter: { type: Type.STRING },
          word: { type: Type.STRING },
          mnemonicCue: { type: Type.STRING }
        },
        required: ["letter", "word"]
      }
    },
    flowSteps: {
      type: Type.ARRAY,
      description: "State machine or process sequence steps for state_transition",
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          mechanism: { type: Type.STRING },
          visualIcon: { type: Type.STRING }
        },
        required: ["stepNumber", "title"]
      }
    },
    hierarchyTree: {
      type: Type.OBJECT,
      description: "Mind-tree hierarchy for concept_hierarchy",
      properties: {
        rootNode: { type: Type.STRING },
        branches: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              branchName: { type: Type.STRING },
              subItems: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["branchName", "subItems"]
          }
        }
      }
    },
    boundaryGauges: {
      type: Type.ARRAY,
      description: "Parameter edge tests for boundary_stress_test",
      items: {
        type: Type.OBJECT,
        properties: {
          variable: { type: Type.STRING },
          normalRange: { type: Type.STRING },
          extremeCase: { type: Type.STRING },
          breakdownResult: { type: Type.STRING }
        },
        required: ["variable", "normalRange", "extremeCase", "breakdownResult"]
      }
    },
    formulaComponents: {
      type: Type.ARRAY,
      description: "Formula component decomposition for formula_spatial_grid",
      items: {
        type: Type.OBJECT,
        properties: {
          symbol: { type: Type.STRING },
          meaning: { type: Type.STRING },
          role: { type: Type.STRING, description: "'variable' | 'constant' | 'operator' | 'state'" }
        },
        required: ["symbol", "meaning", "role"]
      }
    },
    brokenModel: {
      type: Type.OBJECT,
      description: "Sabotaged causal diagram with 1-2 intentional conceptual bugs for broken_model_debug",
      properties: {
        scenarioTitle: { type: Type.STRING, description: "e.g. 'Flawed Depolarization Model'" },
        flawCount: { type: Type.INTEGER, description: "Number of flawed nodes (typically 1 or 2)" },
        studentMisconceptionPremise: { type: Type.STRING, description: "The plausible misconception statement" },
        expertCorrection: { type: Type.STRING, description: "Full expert first-principles correction" },
        sabotagedNodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              subtext: { type: Type.STRING },
              isFlawed: { type: Type.BOOLEAN, description: "True if this node contains an intentional bug" },
              flawExplanation: { type: Type.STRING, description: "Why this step is wrong physically/biologically" },
              studentCorrectionHint: { type: Type.STRING, description: "Socratic hint to help learner spot the bug" }
            },
            required: ["id", "label", "isFlawed"]
          }
        }
      },
      required: ["scenarioTitle", "flawCount", "studentMisconceptionPremise", "sabotagedNodes", "expertCorrection"]
    },
    mnemonicStoryboard: {
      type: Type.OBJECT,
      description: "Interactive visual element grid with absurd narrative stories for mnemonic_storyboard",
      properties: {
        questTitle: { type: Type.STRING, description: "e.g. 'Quest 1: The First 10 Elements'" },
        narrativeStory: { type: Type.STRING, description: "A hilarious, vivid, connected story linking all items in order" },
        tiles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              symbol: { type: Type.STRING, description: "e.g. 'H', 'He', 'Li'" },
              name: { type: Type.STRING, description: "e.g. 'Hydrogen'" },
              numberOrOrder: { type: Type.INTEGER, description: "Atomic number or list sequence (1, 2, 3...)" },
              categoryTag: { type: Type.STRING, description: "e.g. 'Alkali Metal', 'Noble Gas'" },
              mnemonicHook: { type: Type.STRING, description: "Absurd sensory imagery anchor" },
              color: { type: Type.STRING, description: "e.g. 'emerald', 'cyan', 'amber', 'purple', 'rose'" }
            },
            required: ["symbol", "name", "mnemonicHook"]
          }
        }
      },
      required: ["questTitle", "narrativeStory", "tiles"]
    }
  }
};

// Standard Single Schema Response with Deep Research Context Grounding
const standardResponseSchema = {
  type: Type.OBJECT,
  properties: {
    topicSummary: {
      type: Type.STRING,
      description: "A concise 1-line title for the subject being encoded."
    },
    researchContexts: {
      type: Type.ARRAY,
      description: "List of 1-3 foundational prerequisite concepts or missing background facts automatically detected and fetched by Deep Research.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          detectedGap: { type: Type.STRING, description: "What key prerequisite or context was omitted/vague in the user's notes" },
          conceptAdded: { type: Type.STRING, description: "The foundational principle or mechanism fetched to complete the concept" },
          explanation: { type: Type.STRING, description: "Why this background is vital for true schema integration" },
          sourceTitle: { type: Type.STRING, description: "Foundational textbook or domain standard reference" },
          sourceUrl: { type: Type.STRING, description: "Optional web resource or authoritative documentation URL" }
        },
        required: ["id", "detectedGap", "conceptAdded", "explanation"]
      }
    },
    activities: {
      type: Type.ARRAY,
      description: "Exactly 5 structured, gamified cognitive encoding exercises based on the notes or uploaded document/image.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          stageNumber: { type: Type.INTEGER },
          title: { type: Type.STRING, description: "Name of the stage" },
          framework: { type: Type.STRING, description: "Cognitive science framework" },
          cognitiveGoal: { type: Type.STRING, description: "Short purpose of this encoding step" },
          contextSnippet: { type: Type.STRING, description: "Key raw snippet, visual fact, or Deep Research concept targeted" },
          keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3-5 essential conceptual keywords"
          },
          templateType: { 
            type: Type.STRING, 
            description: "Template identifier chosen intelligently from the catalog for this mode." 
          },
          prompt: { type: Type.STRING, description: "The overarching guiding challenge" },
          paradox: {
            type: Type.STRING,
            description:
              "The stage's PHYSICAL PARADOX, phrased as a 'how is this possible?' hook. Name the two facts that cannot both be naively true, then ask how the system gets away with it. Example: 'Active pumps in a cell membrane cannot build a gradient above ~200 mOsm in one step because the ions leak back, yet the loop of Henle reaches 1,200 mOsm. How does it reach 1,200 without breaking thermodynamics?' NEVER a definition request ('Define X and list its components') and never a homework instruction: this is the puzzle the stage exists to resolve."
          },
          gedankenexperiment: {
            type: Type.STRING,
            description:
              "ONE extreme, qualitative thought experiment the learner runs BEFORE formalising anything, written as a direct instruction to become part of the system. Example: 'You are an enzyme. The pH drops from 7.4 to 2.0. What physically happens to you, step by step?' No numbers to solve and no terms to recite: the learner should be tracking charges, forces and shapes. Skip it (empty string) only for pure rote/memorization stages where no mechanism exists."
          },
          boundaryContrast: {
            type: Type.OBJECT,
            description: "Discriminative boundary for this stage's concept (required for exam-ready cards)",
            properties: {
              confusableLookalike: { type: Type.STRING, description: "The lookalike concept students confuse it with" },
              distinguishingRule: { type: Type.STRING, description: "The concrete test/rule that separates the two" }
            },
            required: ["confusableLookalike", "distinguishingRule"]
          },
          visualData: visualDataSchema,
          researchContext: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              detectedGap: { type: Type.STRING },
              conceptAdded: { type: Type.STRING },
              explanation: { type: Type.STRING },
              sourceTitle: { type: Type.STRING }
            }
          },
          scaffold: {
            type: Type.OBJECT,
            properties: {
              field1Label: { type: Type.STRING },
              field1Placeholder: { type: Type.STRING },
              field1Prefix: { type: Type.STRING },
              field2Label: { type: Type.STRING },
              field2Placeholder: { type: Type.STRING },
              field2Prefix: { type: Type.STRING },
              field3Label: { type: Type.STRING },
              field3Placeholder: { type: Type.STRING },
              field3Prefix: { type: Type.STRING },
              presetOptions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Helpful suggestions, chunk categories, or domain options"
              },
              exampleAnswer: { type: Type.STRING, description: "A high-quality example to spark the user's creativity" },
              causalFrame: {
                type: Type.STRING,
                description:
                  "ONE causal sentence template with the markers [[1]], [[2]] and optionally [[3]] standing for the stage's field1/field2/field3 answers, using real causal connectives (when/because/which forces/unless) rather than labels. Example: 'When [[1]], the [[2]] is forced, so [[3]] — UNLESS the pore is blocked.' Never repeat a marker, never use markers other than [[1]]-[[3]], and keep it under 30 words."
              }
            },
            required: ["field1Label", "field1Placeholder", "field2Label", "field2Placeholder", "exampleAnswer"]
          }
        },
        required: ["id", "stageNumber", "title", "framework", "cognitiveGoal", "contextSnippet", "keywords", "templateType", "prompt", "paradox", "scaffold"]
      }
    }
  },
  required: ["topicSummary", "activities"]
};

// Guided Path Multi-Module Chunking Schema (Miller's Law 7±2 decomposition)
const guidedPathResponseSchema = {
  type: Type.OBJECT,
  properties: {
    topicSummary: {
      type: Type.STRING,
      description: "Overarching title of the massive text / chapter."
    },
    totalModulesCount: { type: Type.INTEGER },
    researchContexts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          detectedGap: { type: Type.STRING },
          conceptAdded: { type: Type.STRING },
          explanation: { type: Type.STRING },
          sourceTitle: { type: Type.STRING }
        },
        required: ["id", "detectedGap", "conceptAdded", "explanation"]
      }
    },
    guidedModules: {
      type: Type.ARRAY,
      description: "2-4 sequentially unlocked learning modules according to Miller's Law (7±2 items per working memory window).",
      items: {
        type: Type.OBJECT,
        properties: {
          moduleId: { type: Type.STRING },
          moduleNumber: { type: Type.INTEGER },
          title: { type: Type.STRING, description: "Concise module name e.g. 'Module 1: Resting Potentials & Ion Gradients'" },
          summary: { type: Type.STRING, description: "1-2 sentence core focus of this chapter segment" },
          targetFocus: { type: Type.STRING, description: "The specific chunk of the massive text handled here" },
          feynmanCheckpoint: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING, description: "A probing, conceptual Socratic question requiring intuitive causal explanation to unlock the next module" },
              corePrerequisite: { type: Type.STRING, description: "The single most crucial causal insight the student must demonstrate" },
              hint: { type: Type.STRING, description: "Gentle Socratic hint if the user gets stuck" }
            },
            required: ["question", "corePrerequisite"]
          },
          activities: {
            type: Type.ARRAY,
            description: "3 highly focused cognitive exercises for this module",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                stageNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                framework: { type: Type.STRING },
                cognitiveGoal: { type: Type.STRING },
                contextSnippet: { type: Type.STRING },
                keywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                templateType: { type: Type.STRING },
                prompt: { type: Type.STRING },
                paradox: {
                  type: Type.STRING,
                  description:
                    "This stage's physical paradox, as a 'how is this possible?' hook (never a definition request)."
                },
                gedankenexperiment: {
                  type: Type.STRING,
                  description:
                    "One extreme qualitative thought experiment to run before formalising, written as an instruction to become part of the system."
                },
                boundaryContrast: {
                  type: Type.OBJECT,
                  properties: {
                    confusableLookalike: { type: Type.STRING },
                    distinguishingRule: { type: Type.STRING }
                  },
                  required: ["confusableLookalike", "distinguishingRule"]
                },
                visualData: visualDataSchema,
                scaffold: {
                  type: Type.OBJECT,
                  properties: {
                    field1Label: { type: Type.STRING },
                    field1Placeholder: { type: Type.STRING },
                    field1Prefix: { type: Type.STRING },
                    field2Label: { type: Type.STRING },
                    field2Placeholder: { type: Type.STRING },
                    field2Prefix: { type: Type.STRING },
                    field3Label: { type: Type.STRING },
                    field3Placeholder: { type: Type.STRING },
                    field3Prefix: { type: Type.STRING },
                    presetOptions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    exampleAnswer: { type: Type.STRING },
                    causalFrame: {
                      type: Type.STRING,
                      description:
                        "ONE causal sentence template with the markers [[1]], [[2]] and optionally [[3]] standing for field1/field2/field3, using real causal connectives instead of labels."
                    }
                  },
                  required: ["field1Label", "field1Placeholder", "field2Label", "field2Placeholder", "exampleAnswer"]
                }
              },
              required: ["id", "stageNumber", "title", "framework", "cognitiveGoal", "contextSnippet", "keywords", "templateType", "prompt", "paradox", "scaffold"]
            }
          }
        },
        required: ["moduleId", "moduleNumber", "title", "summary", "targetFocus", "feynmanCheckpoint", "activities"]
      }
    }
  },
  required: ["topicSummary", "guidedModules"]
};

export async function POST(req: NextRequest) {
  try {
    const {
      notes,
      mode = 'conceptual',
      settings,
      file,
      enableDeepResearch = true,
      enableGuidedPath = false,
      userConfidence,
      successRate,
      interleaveMode = false,
      gear = 2,
      hiddenTemplates = [],
    } = await req.json();

    // Templates the learner hid in Settings are excluded from the AI catalog
    // so personal taste sticks for online generations too (offline matches).
    const hiddenList: string[] = Array.isArray(hiddenTemplates)
      ? hiddenTemplates.filter((t: unknown) => typeof t === 'string')
      : [];

    // ─── Cognitive gears ────────────────────────────────────────────────────
    // Encoding used to demand the same full workout every day, which is why a
    // Thursday night after labs felt like homework rather than a puzzle. The
    // gear changes how deep the session goes, never whether it happens.
    // Science preserved at every gear: Slamecka & Graf's generation effect
    // shows that generating a single missing word buys almost the same memory
    // boost as writing the whole paragraph.
    const gearInstruction =
      gear === 1
        ? `

COGNITIVE GEAR 1 — EXPRESS FORGE (low energy, about 60 seconds):
- Generate exactly TWO stages, not five. Ruthlessly pick the two load-bearing mechanisms.
- Strip every stage down to its causal crux: populate ONLY field1 (the pivotal blank) and leave field2/field3 labels EMPTY. There is no essay in this session.
- 'scaffold.causalFrame' is REQUIRED at this gear and is the whole exercise: ONE short sentence with 2-3 blanks, each answerable in one to three words (e.g. "When [[1]], the membrane becomes [[2]], so the cell is [[3]] excitable."). Never a blank that needs a clause.
- 'paradox' and 'gedankenexperiment' stay mandatory: the puzzle is what makes the blanks worth filling.
- Every blank must be a word the learner could say out loud in a corridor. If it needs a sentence, the blank is wrong: cut it down.`
        : gear === 3
          ? `

COGNITIVE GEAR 3 — DEEP CRUCIBLE (high energy):
- Generate all FIVE stages with full field1/field2/field3 depth: the full Feynman workout.
- Write the hardest 'gedankenexperiment' you can that is still answerable qualitatively, and make each 'paradox' genuinely counterintuitive rather than a restatement of the definition.
- Assume the learner will speak their answer aloud and defend it: 'scaffold.causalFrame' should template a complete causal chain, not a fill-in-the-blank cue.
- Prefer templates that punish hand-waving (first_principles, boundary_stress_test, broken_model_debug, cause_effect).`
          : `

COGNITIVE GEAR 2 — INTERACTIVE PUZZLES (medium energy):
- Generate THREE stages. No essay writing is expected of the learner at this gear.
- Favour templates that can be SOLVED rather than described: 'first_principles', 'state_transition', 'contrast_grid', 'broken_model_debug', 'concept_hierarchy'. A stage whose only answer channel is prose is the wrong template here.
- Keep 'scaffold.causalFrame' short (under 20 words) with blanks answerable in a few words, and make sure every stage carries a 'boundaryContrast' so the discrimination pair exists.
- 'paradox' and 'gedankenexperiment' stay mandatory.`;

    const diffLevel = getDifficultyLevel(typeof successRate === 'number' ? successRate : 0.6);
    const difficultyInstruction = getDifficultyPromptModifier(diffLevel);
    const confidenceContext = typeof userConfidence === 'number' 
      ? `\nLEARNER PRE-ASSESSMENT CONFIDENCE: ${userConfidence}/5. ${userConfidence <= 2 ? 'The student reports low confidence; provide intuitive, crystal-clear analogies.' : userConfidence >= 4 ? 'The student reports high familiarity; push for rigorous mechanistic precision and edge cases.' : 'Calibrate for standard balanced difficulty.'}` 
      : '';

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ error: "Please enter notes or upload a PDF/Image document." }, { status: 400 });
    }

    const wordCount = hasNotes ? notes.trim().split(/\s+/).length : 0;
    const isMassiveText = enableGuidedPath || wordCount > 900;

    // Interleaving (launchpad toggle): the learner chose to alternate
    // conceptual and rote retrieval practice inside one workout, instead of
    // grouping every mechanism stage together. Practice that is interleaved
    // is retained better than practice that is blocked.
    const interleaveNote = interleaveMode
      ? `\nINTERLEAVING ENABLED: Alternate template FAMILIES across the sequence — never place two conceptual/mechanism templates back to back. After a conceptual template, place a retrieval-oriented one ('interleaved_srs', 'mnemonic_peg', 'taxonomic_chunking', 'contrast_grid'), then return to conceptual. This forces the learner to switch retrieval strategies between stages.`
      : '';

    const hiddenNote = hiddenList.length > 0
      ? `\nLEARNER TEMPLATE PREFERENCES: The learner hid these templates in Settings because they don't help them — NEVER use them: (${hiddenList.join(', ')}). Choose only from the remaining catalog.`
      : '';

    let systemPrompt = '';

    if (isMassiveText) {
      systemPrompt = `${FIRST_PRINCIPLES_ENGINE}

${FIRST_PRINCIPLES_FEW_SHOT}

Decompose this material into 2 to 4 sequential "GUIDED PATH MODULES":
1. Each module is a distinct, coherent semantic milestone.
2. Each module contains 3 exercises, each built on the template whose structure matches the mechanism — pick from ('first_principles', 'cause_effect', 'visual_blueprint', 'analogy_matrix', 'concept_hierarchy', 'state_transition', 'boundary_stress_test', 'taxonomic_chunking', 'contrast_grid') — and generate appropriate 'visualData'.
3. Each module ends with a "FEYNMAN CHECKPOINT" question testing intuitive causal mastery.
${hiddenNote}

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
Identify if any vital foundational definitions or causal steps were omitted or rushed in the source text. Synthesize 1-2 missing background concepts into 'researchContexts'.` : ''}`;
    } else if (mode === 'memorization') {
      systemPrompt = `${FIRST_PRINCIPLES_ENGINE}

This mode encodes ROTE material (Periodic Table, Amino Acids, Cranial Nerves, Strong/Weak Acids, Drug Classes, Anatomy). The imagery stays ABSURD, BIZARRE and SENSORY — that is elite encoding — but every image must carry the real structural fact, and even a list has a reason it is shaped the way it is.

${FIRST_PRINCIPLES_FEW_SHOT}

AVAILABLE MEMORIZATION TEMPLATES:
1. 'mnemonic_storyboard' (RECOMMENDED for sequential lists): 5-15 items in order (Elements 1-10, Cranial Nerves I-XII). 'questTitle' + 'narrativeStory' (one ridiculous connected story where the symbols are characters) + 'tiles' (symbol, name, numberOrOrder, categoryTag, mnemonicHook).
2. 'taxonomic_chunking': 10-30 items into 3-5 categorical buckets (Polar vs Non-polar, Strong vs Weak). 'chunkBuckets': bucketName, items, colorHint.
3. 'mnemonic_peg': ordered lists whose first letters form an acronym (Cranial Nerves, Essential Amino Acids). 'acronymLetters': letter, word, mnemonicCue.
4. 'memory_palace': fixed sequence anchored to a physical route (Foyer -> Living Room -> Kitchen -> Hallway). 'palaceRooms': roomName, itemPlaced, vividSensoryHook, locusNumber (1 to 5).
5. 'contrast_grid': confusable lookalike pairs and exam traps. 'contrastMatrix': axisX, axisY, 4 quadrants with trap warnings.
6. 'formula_spatial_grid': formulas, equations, mathematical laws, linear pathways. 'formulaComponents': symbol, meaning, role ('variable' | 'constant' | 'operator' | 'state').
7. 'interleaved_srs': high-yield active recall synthesis with bidirectional cueing.
8. 'shape_association': numbered rules or ranked lists pegged to visual shape archetypes.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
If the user's notes miss foundational rules (e.g. forgot why HF is a weak acid or omitted a cranial nerve ganglion), fetch the missing foundational context in 'researchContexts' and link it.` : ''}

PARADOX FIRST: write 'paradox' for EVERY stage as a "how is this possible?" hook, never a definition request. "Define the strong acids and list their properties" is homework; "HF has a stronger H-F bond than HCl, so why is HF the WEAKER acid?" is a puzzle, and the list follows from resolving it. For pure taxonomy, ask why the classification holds (why these belong together and not next to their lookalike).

'gedankenexperiment' too: one extreme, qualitative thought experiment the learner runs before formalising anything ("You are the electron. The bond stretches. What happens to the energy?"). No arithmetic, no terms to recite.

One item-cluster per stage. For EVERY stage populate 'boundaryContrast' (confusableLookalike + distinguishingRule) — the confusable pair in this list (strong vs weak acid, Na vs K channel) and the one-sentence rule that separates them — and 'scaffold.causalFrame': ONE sentence templating the stage's deduction with [[1]] / [[2]] / (optional) [[3]] where the learner's field1 / field2 / field3 answers go (real connectives, no labels, no repeated markers).

For every stage specify the chosen 'templateType', populate 'visualData' with rich structured nodes/buckets/palace rooms/acronyms, and provide clear scaffold labels and concrete high-quality example answers.`;
    } else {
      systemPrompt = `${FIRST_PRINCIPLES_ENGINE}

If a stage's explanation could be replaced by the name of the process, it is jargon — cut it. This is the depth to emit:

${FIRST_PRINCIPLES_FEW_SHOT}

Decompose the study notes/file into an interactive 5-stage visual encoding workout. Dynamically choose the 5 templates that best capture the structure of the subject:

AVAILABLE CONCEPTUAL TEMPLATES CATALOG:
1. 'first_principles': foundational mechanisms and physical laws. 'nodes': causal chain (type: 'input' | 'mechanism' | 'outcome').
2. 'cause_effect': system dynamics, feedback loops, "what happens if variable X drops?". 'nodes': disturbance shock, cascading consequence, broken state (type: 'danger').
3. 'visual_blueprint': spatial, anatomical, cellular or architectural motion. 'flowSteps' or 'nodes': Foreground Actor, Motion Vector, Spatial Anchor.
4. 'analogy_matrix': abstract concepts via a familiar domain (Plumbing, Traffic, Electrical Grids, OS Kernels). 'analogyMappings': sourceElement, targetElement, mechanistic explanation.
5. 'concept_hierarchy': parent theories with sub-mechanisms and branch conditions. 'hierarchyTree': rootNode + branches with subItems.
6. 'state_transition': cycles (Krebs Cycle, TCP 3-Way Handshake, Cardiac Cycle). 'flowSteps': step numbers, titles, mechanisms, icons.
7. 'boundary_stress_test': extremes and failure envelopes (Temperature -> infinity, Concentration -> 0). 'boundaryGauges': variable, normalRange, extremeCase, breakdownResult.
8. 'personal_schema': linking the mechanism to personal intuition and everyday decisions.
9. 'broken_model_debug' (HIGHLY RECOMMENDED): causal mechanisms students fall for. 'brokenModel': 3-5 sequential nodes with 1-2 INTENTIONALLY SABOTAGED (set 'isFlawed: true' + 'flawExplanation').
${hiddenNote}

PARADOX FIRST: never open a stage with a definition request. For EVERY stage write 'paradox' as the physical contradiction the stage exists to resolve — name the two facts that cannot both be naively true, then ask how the system gets away with it. Example: "Active ion pumps cannot build more than ~200 mOsm of gradient in one step, yet the loop of Henle reaches 1,200 mOsm. How?" The learner should be solving a puzzle, not filling in a worksheet.

'gedankenexperiment': for every stage with a mechanism, one extreme qualitative thought experiment run BEFORE formalising, written as an instruction to become part of the system ("You are an enzyme. The pH drops from 7.4 to 2.0. What physically happens to you, step by step?"). Answerable by tracking charges, forces and shapes — no numbers to solve, no jargon to recite. Empty string only for pure rote stages where no mechanism exists.

'visualData.generationChallenge' for EVERY stage: 'premisePrompt' (the setup, e.g. "If the cell is an industrial factory, what is the mitochondria?"), 'clue' (a hint that guides without giving it away), 'missingRoleOrTarget' (the mechanism to be deduced), 'expertCompletion' (the completed synthesis). What the learner deduces survives; what they read does not.

ONE mechanism per stage : one idea, one card. Every scaffold label and example answer must be answerable in UNDER 15 WORDS so the learner's wording becomes one atomic spaced-repetition card.

'scaffold.causalFrame' is the ONE sentence this stage asks the learner to complete, with [[1]] / [[2]] / (optional) [[3]] where their field1 / field2 / field3 answers go — real connectives (when … then … which forces … unless …), never a list of labels, never a repeated marker, blanks exactly where the deduction breaks down.

'boundaryContrast' is REQUIRED for every stage: 'confusableLookalike' (the concept it is most often confused with) and 'distinguishingRule' (the concrete test, exception or one-sentence rule that separates them). These become the discriminative cards that kill the classic single-concept exam trap.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
Analyze if the notes omit crucial foundational context (e.g. Na+/K+ resting potential, compounding frequency). Fetch 1-2 missing background concepts into 'researchContexts' and link to relevant stages.` : ''}

For every stage specify the chosen 'templateType' and populate 'visualData' with rich structured nodes/mappings/trees/gauges plus 'generationChallenge', clear scaffold labels, domain presets and concrete example answers, and ALWAYS include 'boundaryContrast'.`;
    }

    systemPrompt += `\n\n${gearInstruction}${difficultyInstruction}${confidenceContext}${interleaveNote}`;

    let userPrompt = '';
    if (hasNotes) {
      userPrompt += `STUDY NOTES / DOCUMENT:\n\n${notes.slice(0, 16000)}\n\n`;
    }
    if (hasFile) {
      userPrompt += `[ATTACHED MULTIMODAL FILE: ${file.name} (${file.type}, ${Math.round(file.size / 1024)} KB). Extract all key knowledge, diagrams, formulas, and concepts directly from this file.]`;
    }

    const activeSchema = isMassiveText ? guidedPathResponseSchema : standardResponseSchema;

    const parsedResult = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: activeSchema,
      settings,
      isChecker: false,
      file: hasFile ? file : null,
      // Identical (provider, model, notes, options) requests short-circuit from
      // the in-memory cache : regenerating the same source costs nothing.
      useCache: true,
    });

    if (isMassiveText && parsedResult.guidedModules && parsedResult.guidedModules.length > 0) {
      // Validate each guided module's activities so a partial model response
      // never ships a broken module chain. Non-modular malformed output falls
      // through to the standard validated response below.
      const validatedGuidedModules = parsedResult.guidedModules
        .filter((mod: any) => mod && typeof mod === 'object' && Array.isArray(mod.activities))
        .map((mod: any) => {
          const validated = validateEncodedSchema({ ...mod, activities: mod.activities }, mode);
          return {
            ...mod,
            title: mod.title || validated.topicSummary,
            activities: validated.activities,
          };
        });

      if (validatedGuidedModules.length > 0) {
        // Mark first module as unlocked, rest locked initially
        const formattedModules = validatedGuidedModules.map((mod: any, idx: number) => ({
          ...mod,
          unlocked: idx === 0,
          completed: false,
          activities: (mod.activities || []).map((act: any, aIdx: number) => ({
            ...act,
            stageNumber: aIdx + 1
          }))
        }));

        return NextResponse.json({
          isGuidedPath: true,
          topicSummary: parsedResult.topicSummary || 'Guided Path Chapter',
          guidedModules: formattedModules,
          researchContexts: parsedResult.researchContexts || [],
          activities: formattedModules[0].activities || [],
          currentModuleIndex: 0
        });
      }
    }

    // Standard / non-modular response : coerce into the shape the workbench
    // depends on (missing scaffolds get safe defaults, empty activity lists
    // get a fallback stage).
    const validated = validateEncodedSchema(parsedResult, mode);
    return NextResponse.json({
      topicSummary: validated.topicSummary,
      activities: validated.activities,
      researchContexts: validated.researchContexts || parsedResult.researchContexts || [],
    });
  } catch (error: any) {
    console.error("Error in /api/encode:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to generate cognitive schema tasks." 
    }, { status: 500 });
  }
}
