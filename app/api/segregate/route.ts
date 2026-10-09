import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { parseRouteBody, segregateSchema } from "@/lib/api-validation";
import {
  buildSegregationSystemPrompt,
  buildSegregationUserPrompt,
  resolveSegregationSections,
  segregationSchema,
} from "@/lib/services/segregation";

export async function POST(req: NextRequest) {
  try {
    const body = await parseRouteBody(req, segregateSchema);
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status });
    }
    const { notes, file, settings, include } = body.data;

    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasFile = file && file.base64Data && file.type;

    if (!hasNotes && !hasFile) {
      return NextResponse.json({ error: "No notes provided for segregation." }, { status: 400 });
    }

    // Which flashcard sections the user wants. Default : everything.
    const want = resolveSegregationSections(include);

    const result = await generateJSONWithProvider({
      systemPrompt: buildSegregationSystemPrompt(want),
      userPrompt: buildSegregationUserPrompt({
        notes: hasNotes ? notes : undefined,
        hasFile: Boolean(hasFile),
        fileName: file?.name,
        fileType: file?.type,
      }),
      responseSchema: segregationSchema,
      settings,
      // Segregation is a heavyweight generation task (26-52 cards with worked
      // examples), so it must ride the powerful generator model, not flash-lite.
      isChecker: false,
      file: hasFile ? file : null,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/segregate:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to segregate concepts and facts." 
    }, { status: 500 });
  }
}
