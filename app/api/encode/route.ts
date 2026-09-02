import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
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
              exampleAnswer: { type: Type.STRING, description: "A high-quality example to spark the user's creativity" }
            },
            required: ["field1Label", "field1Placeholder", "field2Label", "field2Placeholder", "exampleAnswer"]
          }
        },
        required: ["id", "stageNumber", "title", "framework", "cognitiveGoal", "contextSnippet", "keywords", "templateType", "prompt", "scaffold"]
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
                    exampleAnswer: { type: Type.STRING }
                  },
                  required: ["field1Label", "field1Placeholder", "field2Label", "field2Placeholder", "exampleAnswer"]
                }
              },
              required: ["id", "stageNumber", "title", "framework", "cognitiveGoal", "contextSnippet", "keywords", "templateType", "prompt", "scaffold"]
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
      interleaveMode = false
    } = await req.json();

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

    let systemPrompt = '';

    if (isMassiveText) {
      systemPrompt = `You are a world-class Cognitive Science Architect specializing in MILLER'S 7±2 LAW, ADAPTIVE CHUNKING, and MULTI-TEMPLATE VISUAL ENCODING for massive texts.

Decompose this material into 2 to 4 sequential "GUIDED PATH MODULES":
1. Each module represents a distinct, coherent semantic milestone.
2. Each module contains 3 active cognitive exercises. For each exercise, select the best visual template from the catalog ('first_principles', 'cause_effect', 'visual_blueprint', 'analogy_matrix', 'concept_hierarchy', 'state_transition', 'boundary_stress_test', 'taxonomic_chunking', 'contrast_grid') and generate appropriate 'visualData'.
3. Each module ends with a "FEYNMAN CHECKPOINT" question testing intuitive causal mastery.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
Identify if any vital foundational definitions or causal steps were omitted or rushed in the source text. Synthesize 1-2 missing background concepts into 'researchContexts'.` : ''}`;
    } else if (mode === 'memorization') {
      systemPrompt = `You are a world-class Cognitive Science & Mnemonic Architect specializing in ROTE & TAXONOMIC MEMORIZATION (e.g. Periodic Table trends, Strong/Weak Acids & Bases, 20 Amino Acids, Cranial Nerves, Pharmacological Drug Classes, Anatomy, Historical Classifications).

Your mission is to construct a 5-Stage High-Yield Visual Mnemonic & Spatial Workout.
You have access to a rich catalog of VISUAL MEMORIZATION TEMPLATES. Choose 5 complementary, highly visual templates that best fit the exact nature of the items:

AVAILABLE MEMORIZATION TEMPLATES CATALOG:
1. 'taxonomic_chunking' (Miller's 7±2 Semantic Cluster Buckets):
   - Best for: Grouping 10-30 items into 3-5 logical categorical buckets (e.g., Polar vs Non-polar, Strong vs Weak, Acid vs Base).
   - visualData: Provide 'chunkBuckets' with bucket names, items, and color hints.
2. 'mnemonic_peg' (Phonetic Pegs & Acronym/Acrostic Letter Matrix):
   - Best for: Ordered sequences or lists where first letters form acronyms or phonetic rhymes (e.g. Cranial Nerves, Essential Amino Acids).
   - visualData: Provide 'acronymLetters' with letters, associated words, and vivid phonetic cues.
3. 'memory_palace' (Method of Loci Spatial Journey):
   - Best for: Fixed sequential items anchored in a physical route (Foyer -> Living Room -> Kitchen -> Hallway -> Balcony).
   - visualData: Provide 'palaceRooms' with roomName, itemPlaced, vividSensoryHook (bizarre, funny, interactive image), and locusNumber (1 to 5).
4. 'contrast_grid' (2x2 Discriminative Disambiguation Matrix):
   - Best for: Confusable lookalike pairs and tricky exam traps.
   - visualData: Provide 'contrastMatrix' with axisX, axisY, and 4 quadrants with trap warnings.
5. 'formula_spatial_grid' (Formula & Sequence Subway Line):
   - Best for: Formulas, equations, mathematical laws, or linear sequential pathways.
   - visualData: Provide 'formulaComponents' with symbols, meanings, and roles ('variable' | 'constant' | 'operator' | 'state').
6. 'interleaved_srs' (Retrieval Cloze & Flashcard Deck):
   - Best for: High-yield active recall synthesis with bidirectional cueing.
7. 'shape_association' (Number-Shape Pegboard):
   - Best for: Numbered rules or ranked lists anchored to visual shape archetypes.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
If the user's notes miss foundational rules (e.g. forgot why HF is a weak acid or omitted a cranial nerve ganglion), fetch the missing foundational context in 'researchContexts' and link it.` : ''}

CRITICAL: For every stage, specify the chosen 'templateType', populate 'visualData' with rich structured nodes/buckets/palace rooms/acronyms, and provide clear scaffold labels and concrete high-quality example answers.`;
    } else {
      systemPrompt = `You are a world-class Cognitive Science Architect specializing in Semantic Memory Encoding (Craik & Lockhart Levels of Processing, Paivio Dual Coding Theory, Chi's ICAP Framework, and Ausubel's Meaningful Learning).

Your mission is to decompose the study notes/file into an interactive 5-Stage Visual Cognitive Encoding Workout.
You have access to a rich catalog of VISUAL CONCEPTUAL TEMPLATES. Dynamically choose the 5 most effective and diverse visual templates that best capture the structure of the subject:

AVAILABLE CONCEPTUAL TEMPLATES CATALOG:
1. 'first_principles' (Step-by-Step First-Principles Causal Chain):
   - Best for: Foundational mechanisms, physical laws, and core definitions.
   - visualData: Provide 'nodes' with step-by-step causal chain (type: 'input' | 'mechanism' | 'outcome').
2. 'cause_effect' (Perturbation & Counterfactual Domino):
   - Best for: System dynamics, feedback loops, and "What happens if variable X drops?" breakdowns.
   - visualData: Provide 'nodes' with disturbance shock, cascading consequence, and broken state (type: 'danger').
3. 'visual_blueprint' (Paivio Dual-Coding Mental Diagram):
   - Best for: Spatial, anatomical, cellular, or architectural phenomena that benefit from vivid mental imagery.
   - visualData: Provide 'flowSteps' or 'nodes' highlighting Foreground Actor, Motion Vector, and Spatial Anchor.
4. 'analogy_matrix' (Schema Bridge & Cross-Domain Mapping):
   - Best for: Abstract concepts explained via familiar real-world domains (Plumbing, Traffic, Electrical Grids, Cooking, OS Kernels).
   - visualData: Provide 'analogyMappings' with sourceElement, targetElement, and mechanistic explanation.
5. 'concept_hierarchy' (Taxonomic Mind Tree & Multilevel DAG):
   - Best for: Subjects with parent theories, sub-mechanisms, and branch conditions.
   - visualData: Provide 'hierarchyTree' with rootNode and branches with subItems.
6. 'state_transition' (Cyclic State Machine & Feedback Loop):
   - Best for: Cycles (e.g., Krebs Cycle, TCP 3-Way Handshake, Heart Cardiac Cycle, Market Cycles).
   - visualData: Provide 'flowSteps' with step numbers, titles, mechanisms, and icons.
7. 'boundary_stress_test' (Parameter Extremes & Failure Envelope):
   - Best for: Testing understanding at extreme edge cases (e.g. Temperature -> infinity, Concentration -> 0, Velocity -> speed of light).
   - visualData: Provide 'boundaryGauges' with variables, normal ranges, extreme cases, and breakdown results.
8. 'personal_schema' (Self-Reference & Spaced Repetition Synthesis):
   - Best for: Linking the theory to personal intuition, everyday decisions, or clinical intuition.

THE GENERATION EFFECT (CRITICAL):
Information that the user deduces and generates themselves is remembered far better than information passively read.
For EVERY stage, you MUST populate 'visualData.generationChallenge' with:
1. 'premisePrompt': The setup/premise (e.g., "If the cell is an industrial factory, what is the mitochondria?").
2. 'clue': A Socratic hint guiding the learner's deduction.
3. 'missingRoleOrTarget': The missing counterpart or mechanism to be deduced.
4. 'expertCompletion': The completed expert synthesis.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
Analyze if the notes omit crucial foundational context (e.g. Na+/K+ resting potential, compounding frequency). Fetch 1-2 missing background concepts into 'researchContexts' and link to relevant stages.` : ''}

CRITICAL: For every stage, specify the chosen 'templateType', populate 'visualData' with rich structured nodes/mappings/trees/gauges and 'generationChallenge', and provide clear scaffold labels, domain presets, and concrete example answers.`;
    }

    systemPrompt += `\n\n${difficultyInstruction}${confidenceContext}`;

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
    });

    if (isMassiveText && parsedResult.guidedModules && parsedResult.guidedModules.length > 0) {
      // Mark first module as unlocked, rest locked initially
      const formattedModules = parsedResult.guidedModules.map((mod: any, idx: number) => ({
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

    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error("Error in /api/encode:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to generate cognitive schema tasks." 
    }, { status: 500 });
  }
}
