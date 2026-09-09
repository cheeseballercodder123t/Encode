import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { ProceduralMCQArchetype } from "@/lib/types";
import {
  validateProceduralArchetypes,
  validateProceduralArchetype,
} from "@/lib/procedural-validator";

/** Model used by the repair pass (the flash-3.1-lite tier). */
const REPAIR_MODEL = "gemini-flash-3.1-lite";

const archetypeSchema = {
  type: Type.OBJECT,
  properties: {
    archetypes: {
      type: Type.ARRAY,
      description:
        "Procedural / parametric AP-style multiple-choice archetypes. Each questionTemplate MUST embed " +
        "variable ticks like {{m}} that the embedded Anki runner re-randomizes on every card review.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "Unique kebab-case id, prefixed with 'aiai-' to avoid collisions with built-in archetypes.",
          },
          topic: { type: Type.STRING, description: "e.g. 'AP Chemistry: Buffer pH'" },
          questionTemplate: {
            type: Type.STRING,
            description:
              "Question with {{var}} placeholders, e.g. 'A buffer has pKa = {{pKa}} and ratio [A-]/[HA] = {{ratio}}. What is pH?'",
          },
          variables: {
            type: Type.OBJECT,
            description: "Map of variable name to its range spec.",
            additionalProperties: {
              type: Type.OBJECT,
              properties: {
                min: { type: Type.NUMBER },
                max: { type: Type.NUMBER },
                step: { type: Type.NUMBER },
                decimals: { type: Type.NUMBER },
                choices: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              },
              required: [],
            },
          },
          unit: { type: Type.STRING, description: "Answer unit, e.g. 'm/s' or 'unitless (Qc)'" },
          correctFormulaJs: {
            type: Type.STRING,
            description:
              "Pure JS expression over ONLY the declared variables and Math, e.g. '(pKa + Math.log10(ratio)).toFixed(2)'. " +
              "No statements, no arrow bodies, no globals.",
          },
          traps: {
            type: Type.ARRAY,
            minItems: 3,
            maxItems: 3,
            description: "Exactly 3 AP-style conceptual distractors.",
            items: {
              type: Type.OBJECT,
              properties: {
                trapName: { type: Type.STRING },
                formulaJs: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ["trapName", "formulaJs", "explanation"],
            },
          },
          stepByStepSolutionTemplate: {
            type: Type.STRING,
            description:
              "Full LaTeX derivation using \\( ... \\) inline delimiters, optionally embedding {{var}} values for the current roll.",
          },
        },
        required: ["id", "topic", "questionTemplate", "variables", "unit", "correctFormulaJs", "traps", "stepByStepSolutionTemplate"],
      },
    },
  },
  required: ["archetypes"],
};

const AUTHOR_SYSTEM_PROMPT = `You are DeepEncode's Procedural Trap-Engine MCQ author.
You write PROCEDURAL (parametric) multiple-choice archetypes for AP Physics C, AP Chemistry, and AP Statistics
that defeat the "Answer Recognition Trap" : students must actually EXECUTE the algorithm, not memorize numbers.

RULES:
1. questionTemplate embeds each variable as {{name}} (e.g. {{m}}, {{k}}, {{A}}). The Anki runner replaces these
   with freshly rolled numbers on every review.
2. variables declares each variable: either min/max (+ optional step and decimals) OR a discrete choices array.
   Ranges must be physically realistic (positive radii, sensible units) and WIDE ENOUGH that an answer is never
   accidentally a "nice" number colliding with a distractor.
3. correctFormulaJs and every trap formulaJs are PURE JS EXPRESSIONS (single return statement, no semicolons)
   over ONLY the declared variable names and Math. E.g. "(A * Math.sqrt(k / m)).toFixed(2)". Never reference
   window, document, eval, globals, constants outside Math, or multiple statements.
4. traps: exactly 3 AP-style conceptual distractors with trapName + formulaJs + explanation. Each trap must be a
   REAL misconception (inverted fraction, squared term, dropped unit, wrong constant, sign flip...), numerically
   DIFFERENT from the correct answer across the whole variable space, and DIFFERENT from each other.
5. stepByStepSolutionTemplate: full LaTeX derivation in \\( ... \\) delimiters, with the reasoning spelled out.

Respond with strictly valid JSON.`;

function buildAuthorPrompt(topic: string, count: number, notes?: string): string {
  let prompt = `AUTHOR ${count} procedural MCQ archetypes for: "${topic}".\n`;
  prompt += `Each archetype needs a distinct sub-concept (e.g. for "AP Chemistry: Equilibrium", cover Q vs K, Kp from Kc, ICE-table shift, etc.).\n`;
  if (notes && notes.trim()) {
    prompt += `\nSTUDENT NOTES TO DERIVE QUESTIONS FROM:\n${notes.slice(0, 6000)}\n\nHonor the notation used in these notes where possible.\n`;
  }
  prompt +=
    `\nIMPORTANT: variables must be declared EXACTLY as used in questionTemplate. ` +
    `Formulas must be pure expressions that compile with the variable names as parameters.`;
  return prompt;
}

function buildRepairPrompt(issueSummary: string): string {
  return (
    `The following archetypes FAILED automated validation. Fix them while preserving their educational intent, and ` +
    `return the SAME archetype objects with corrected fields (keep ids and topics).\n\nVALIDATION ERRORS:\n${issueSummary}\n\n` +
    `Rules recap: formulas are pure JS expressions over declared variables + Math only; exactly 3 distinct traps each ` +
    `numerically different from the correct answer AND from each other across the FULL variable range; ` +
    `\\( \\) LaTeX delimiters balanced.`
  );
}

function summarizeIssues(archetypes: ProceduralMCQArchetype[], errorsByIndex: Record<number, string[]>): string {
  return archetypes
    .map((a, i) => {
      const errors = errorsByIndex[i] || [];
      return `- [${a.topic || a.id}] ${errors.length ? errors.join(' | ') : 'ok'}`;
    })
    .join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const { topic, count, notes, settings } = await req.json();
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json({ error: "A 'topic' is required, e.g. 'AP Physics C: Rotational Motion'." }, { status: 400 });
    }
    const requestedCount = Math.min(Math.max(Number(count) || 3, 1), 5);

    const authorResult = await generateJSONWithProvider({
      systemPrompt: AUTHOR_SYSTEM_PROMPT,
      userPrompt: buildAuthorPrompt(topic, requestedCount, notes),
      responseSchema: archetypeSchema,
      settings,
      isChecker: false,
    });

    const rawArchetypes: ProceduralMCQArchetype[] = Array.isArray(authorResult?.archetypes)
      ? authorResult.archetypes
      : [];

    // ── Validate-then-repair loop (max 2 rounds with the flash-lite tier). ──
    let archetypes = rawArchetypes.map((a, i) => ({
      ...a,
      id: a.id && a.id.startsWith('aiai-') ? a.id : `aiai-${a.id || `archetype-${Date.now()}-${i}`}`,
    }));
    let repairedCount = 0;
    let repairRounds = 0;

    while (repairRounds < 2) {
      const results = archetypes.map((a) => validateProceduralArchetype(a));
      const invalid = results.some((r) => !r.valid);
      if (!invalid) break;

      const errorsByIndex: Record<number, string[]> = {};
      results.forEach((r, i) => {
        if (!r.valid) errorsByIndex[i] = r.errors;
      });
      const issueSummary = summarizeIssues(archetypes, errorsByIndex);

      let repairResult: any = null;
      try {
        repairResult = await generateJSONWithProvider({
          systemPrompt: AUTHOR_SYSTEM_PROMPT,
          userPrompt:
            buildAuthorPrompt(topic, requestedCount, notes) +
            '\n\n' +
            buildRepairPrompt(issueSummary),
          responseSchema: archetypeSchema,
          settings: { ...settings, geminiCheckerModel: settings?.geminiCheckerModel || REPAIR_MODEL },
          isChecker: true,
        });
      } catch (repairError: any) {
        // Fall back to the provider's default checker model if flash-lite is unavailable.
        repairResult = await generateJSONWithProvider({
          systemPrompt: AUTHOR_SYSTEM_PROMPT,
          userPrompt:
            buildAuthorPrompt(topic, requestedCount, notes) +
            '\n\n' +
            buildRepairPrompt(issueSummary),
          responseSchema: archetypeSchema,
          settings,
          isChecker: true,
        });
      }

      const repaired: ProceduralMCQArchetype[] = Array.isArray(repairResult?.archetypes)
        ? repairResult.archetypes
        : [];
      if (repaired.length === 0) break; // repair agent returned nothing : keep originals (they'll fail validation)
      archetypes = repaired.map((a, i) => ({
        ...a,
        id: a.id && a.id.startsWith('aiai-') ? a.id : `aiai-${a.id || `archetype-${Date.now()}-${i}`}`,
      }));
      repairedCount = 1;
      repairRounds++;
    }

    const finalReport = validateProceduralArchetypes(archetypes);
    return NextResponse.json({
      archetypes,
      validationReport: finalReport,
      repairedCount,
      repairRounds,
    });
  } catch (error: any) {
    console.error('Error in /api/archetype:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to author procedural archetypes.' },
      { status: 500 }
    );
  }
}