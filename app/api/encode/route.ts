import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

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
            description: "Template identifier e.g. 'first_principles', 'cause_effect', 'visual_blueprint', 'analogy_matrix', 'personal_schema', 'taxonomic_chunking', 'mnemonic_peg', 'memory_palace', 'contrast_grid', 'interleaved_srs'" 
          },
          prompt: { type: Type.STRING, description: "The overarching guiding challenge" },
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
      enableGuidedPath = false 
    } = await req.json();

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ error: "Please enter notes or upload a PDF/Image document." }, { status: 400 });
    }

    const wordCount = hasNotes ? notes.trim().split(/\s+/).length : 0;
    const isMassiveText = enableGuidedPath || wordCount > 900;

    let systemPrompt = '';

    if (isMassiveText) {
      systemPrompt = `You are a world-class Cognitive Science Architect specializing in MILLER'S 7±2 LAW and ADAPTIVE CHUNKING for massive texts and textbook chapters.

The user has provided a large textbook chapter, extensive lecture transcript, or comprehensive paper.
Rather than overwhelming working memory with a monolithic 5-stage schema, your mission is to decompose this material into 2 to 4 sequential "GUIDED PATH MODULES":

1. Each module represents a distinct, coherent semantic milestone (e.g. Module 1: Foundations & Ion Gradients, Module 2: Depolarization & Channel Kinetics, Module 3: Synaptic Transmission & Plasticity).
2. Each module contains exactly 3 active cognitive encoding exercises tailored to that specific chunk.
3. Crucially, each module ends with a "FEYNMAN CHECKPOINT" question: a probing conceptual challenge that the student must answer in their own words before unlocking the next chapter module.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
Identify if any vital foundational definitions or causal steps were omitted or rushed in the source text. Synthesize 1-2 missing background concepts into 'researchContexts' with clear explanations of why they are required.` : ''}

Generate structured scaffold fields, domain options, and crystal-clear example responses for each exercise.`;
    } else if (mode === 'memorization') {
      systemPrompt = `You are a world-class Cognitive Science & Mnemonic Architect specializing in ROTE & TAXONOMIC MEMORIZATION (e.g. Periodic Table trends, Strong/Weak Acids & Bases, 20 Amino Acids, Cranial Nerves, Pharmacological Drug Classes, Anatomy, Historical Classifications).

Your mission is to decompose these items into a 5-Stage High-Yield Mnemonic & Chunking Workout:
1. STAGE 1 (templateType: 'taxonomic_chunking'): Miller's 7±2 Law & Semantic Clustering. Group items into logical sub-buckets.
2. STAGE 2 (templateType: 'mnemonic_peg'): Phonetic Pegs & Acronym/Acrostic Mnemonic Construction.
3. STAGE 3 (templateType: 'memory_palace'): Method of Loci / Memory Palace Spatial Anchor along a physical journey.
4. STAGE 4 (templateType: 'contrast_grid'): Discriminative 2x2 Contrast Grid for lookalikes and traps.
5. STAGE 5 (templateType: 'interleaved_srs'): Interleaved Reverse-Recall Cloze Synthesis.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
If the user's notes miss foundational rules (e.g. forgot to define why HF has high bond enthalpy, or omitted a cranial nerve ganglion), fetch the missing foundational context in 'researchContexts' and link it to the relevant stage.` : ''}

Provide clear scaffold labels, helpful preset options, and concrete high-quality example answers for every stage.`;
    } else {
      systemPrompt = `You are a world-class Cognitive Science Architect specializing in Semantic Memory Encoding (Craik & Lockhart Levels of Processing, Paivio Dual Coding Theory, Chi's ICAP Framework, and Ausubel's Meaningful Learning).

Your mission is to decompose the study notes/file into an interactive 5-Stage Cognitive Encoding Workout:
1. STAGE 1 (templateType: 'first_principles'): Core Essence & First Principles mechanism + 3-5 critical keywords.
2. STAGE 2 (templateType: 'cause_effect'): Elaborative Interrogation (Why & How) + Counterfactual Breakdown.
3. STAGE 3 (templateType: 'visual_blueprint'): Paivio Dual Coding Visual Blueprint (Actor, Dynamic Motion, Spatial Anchor).
4. STAGE 4 (templateType: 'analogy_matrix'): Prior Knowledge Bridge & Analogical Mapping (Provide 3 concrete domain presets like Plumbing, Electrical Grids, Operating Systems, Cooking).
5. STAGE 5 (templateType: 'personal_schema'): Self-Reference & Spaced Repetition Flashcard Synthesis.

${enableDeepResearch ? `DEEP RESEARCH AGENT ACTIVE:
Analyze if the notes omit crucial foundational context (e.g. user mentions action potentials but omitted Na+/K+ resting potential; or user notes compound interest without defining the compounding frequency). Search foundational domain knowledge, create 1-2 'researchContexts', and attach the relevant research context to the appropriate stage with '💡 Context Added by Deep Research'.` : ''}

Provide clear scaffold labels, domain presets, and concrete high-quality example answers for every stage.`;
    }

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
