import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

const prerequisitesSchema = {
  type: Type.OBJECT,
  properties: {
    isReadyToEncode: {
      type: Type.BOOLEAN,
      description: "True if the notes have minimal prerequisites or are introductory; False if the concepts assume deep prior domain knowledge."
    },
    topicTitle: {
      type: Type.STRING,
      description: "Concise topic title."
    },
    prerequisites: {
      type: Type.ARRAY,
      description: "2 to 4 crucial prerequisite concepts required before encoding this topic.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING, description: "Name of prerequisite concept (e.g. 'Wave-Particle Duality', 'Resting Membrane Potential', 'AIMD Congestion Window')" },
          importance: { type: Type.STRING, description: "Why mastering this first is non-negotiable (1 sentence)" },
          primerSummary: { type: Type.STRING, description: "An intuitive 3-sentence primer explaining the prerequisite in crystal-clear first principles." },
          checkQuestion: { type: Type.STRING, description: "A quick self-assessment question the user can ask themselves." }
        },
        required: ["id", "name", "importance", "primerSummary"]
      }
    }
  },
  required: ["isReadyToEncode", "topicTitle", "prerequisites"]
};

export async function POST(req: NextRequest) {
  try {
    const { notes, file, settings } = await req.json();

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ error: "No notes provided to audit prerequisites." }, { status: 400 });
    }

    const systemPrompt = `You are a world-class Learning Sciences Architect & Cognitive Diagnostic Specialist.
You implement the "Concept Prerequisites Engine" (The 'You Are Not Ready' warning).

When a student prepares to encode complex material (e.g., Quantum Entanglement, Transformer Attention Mechanisms, Kidney Countercurrent Multiplier, TCP Congestion Control, Advanced Organic Chemistry Mechanisms):
1. Scan the text/document and detect 2 to 4 mandatory foundational concepts that MUST be understood before this material can be integrated into long-term semantic memory.
2. For each prerequisite, provide an ultra-clear, intuitive 3-sentence primer so that if the user clicks "No, I don't know this", they can immediately read the primer and catch up in 30 seconds.
3. Be rigorous, scientific, and clear.`;

    let userPrompt = '';
    if (hasNotes) {
      userPrompt += `STUDENT NOTES / TEXT:\n\n${notes.slice(0, 14000)}\n\n`;
    }
    if (hasFile) {
      userPrompt += `[ATTACHED FILE: ${file.name} (${file.type}). Audit prerequisites for the content in this document.]`;
    }

    userPrompt += `Detect the mandatory concept prerequisites and provide intuitive 3-sentence primers. Output valid JSON.`;

    const parsedResult = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: prerequisitesSchema,
      settings,
      isChecker: false,
      file: hasFile ? file : null,
    });

    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error("Error in /api/prerequisites:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to generate concept prerequisites." 
    }, { status: 500 });
  }
}
