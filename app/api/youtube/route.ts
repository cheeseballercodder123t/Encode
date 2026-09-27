import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";
import { validateEncodedSchema } from "@/lib/ai-output-validation";
import { extractYouTubeId, fetchYouTubeMeta, fetchYouTubeTranscript } from "@/lib/services/youtubeTranscript";

const youtubeSchemaResponse = {
  type: Type.OBJECT,
  properties: {
    videoTitle: { type: Type.STRING, description: "Official or inferred video title" },
    authorName: { type: Type.STRING, description: "Channel or educator name" },
    durationEstimated: { type: Type.STRING, description: "Estimated duration e.g. '14:20'" },
    topicSummary: { type: Type.STRING, description: "Concise summary of the core video thesis" },
    timestamps: {
      type: Type.ARRAY,
      description: "List of 4-6 key timestamp milestones identified in this lecture with visual/audio cues",
      items: {
        type: Type.OBJECT,
        properties: {
          seconds: { type: Type.INTEGER, description: "Timestamp in seconds (e.g. 195 for 3:15)" },
          formatted: { type: Type.STRING, description: "Timestamp string e.g. '03:15'" },
          label: { type: Type.STRING, description: "Brief chapter title e.g. 'Visualizing Voltage Gating'" },
          insight: { type: Type.STRING, description: "Key takeaway shown or discussed at this timestamp" }
        },
        required: ["seconds", "formatted", "label", "insight"]
      }
    },
    activities: {
      type: Type.ARRAY,
      description: "5 scaffolded cognitive encoding exercises tied directly to specific timestamps and visual scenes in the video.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          stageNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          framework: { type: Type.STRING },
          cognitiveGoal: { type: Type.STRING },
          contextSnippet: { type: Type.STRING, description: "Quote, audio transcript excerpt, or visual description at this timestamp" },
          keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          templateType: { type: Type.STRING },
          prompt: { type: Type.STRING },
          videoTimestamp: {
            type: Type.OBJECT,
            properties: {
              seconds: { type: Type.INTEGER },
              formatted: { type: Type.STRING },
              label: { type: Type.STRING },
              insight: { type: Type.STRING }
            },
            required: ["seconds", "formatted", "label"]
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
  required: ["videoTitle", "topicSummary", "timestamps", "activities"]
};

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, mode = 'conceptual', settings, hiddenTemplates = [] } = await req.json();
    const hiddenList: string[] = Array.isArray(hiddenTemplates)
      ? hiddenTemplates.filter((t: unknown) => typeof t === 'string')
      : [];
    const hiddenNote = hiddenList.length > 0
      ? `\nLEARNER TEMPLATE PREFERENCES: The learner hid these templates in Settings because they don't help them — NEVER use them: (${hiddenList.join(', ')}). Choose only from the remaining catalog.`
      : '';

    const videoId = extractYouTubeId(videoUrl);
    if (!videoId) {
      return NextResponse.json({ 
        error: "Invalid YouTube URL. Please provide a valid YouTube watch link or youtu.be link." 
      }, { status: 400 });
    }

    // oEmbed metadata + the video's own caption track (plain HTTP, no AI).
    const meta = await fetchYouTubeMeta(videoId);
    const oEmbedTitle = meta.title;
    const oEmbedAuthor = meta.author;
    const thumbnailUrl = meta.thumbnailUrl;
    const transcriptSnippet = await fetchYouTubeTranscript(videoId);

    const systemPrompt = `You are a world-class Video Pedagogy & Cognitive Science Architect.
You transform YouTube educational lectures, university courses, and tutorials into active cognitive schemas with timestamped reviews.

Target Video:
- URL: https://www.youtube.com/watch?v=${videoId}
- Known Video ID: ${videoId}
${oEmbedTitle ? `- Known Video Title: "${oEmbedTitle}"` : ''}
${oEmbedAuthor ? `- Channel/Author: "${oEmbedAuthor}"` : ''}
${hiddenNote}

Your tasks:
1. Deconstruct the lecture into its core progression.
2. Identify 4-6 key timestamp inflection points where the presenter introduces pivotal definitions, visual diagrams, mathematical proofs, or counter-intuitive examples.
3. Generate exactly 5 scaffolded active cognitive exercises. Each exercise MUST include a 'videoTimestamp' object tied to a genuine milestone in the video.
4. Provide structured scaffold fields, domain options, and crystal-clear example responses.`;

    const userPrompt = `Generate a comprehensive timestamped cognitive schema for the YouTube lecture:
URL: https://www.youtube.com/watch?v=${videoId}
${oEmbedTitle ? `Title: ${oEmbedTitle}` : ''}
${oEmbedAuthor ? `Author: ${oEmbedAuthor}` : ''}
Mode: ${mode}

${transcriptSnippet ? `VERIFIED VIDEO TRANSCRIPT:\n${transcriptSnippet}` : ''}`;

    const parsedResult = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: youtubeSchemaResponse,
      settings,
      isChecker: false,
      // Same video + same options served from cache on repeat requests.
      useCache: true,
    });

    const responsePayload = {
      ...validateEncodedSchema(parsedResult, mode),
      youtubeData: {
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title: parsedResult.videoTitle || oEmbedTitle || 'YouTube Lecture',
        authorName: parsedResult.authorName || oEmbedAuthor || 'YouTube Educator',
        thumbnailUrl,
        duration: parsedResult.durationEstimated || 'Video Lecture',
        timestamps: Array.isArray(parsedResult.timestamps) ? parsedResult.timestamps : []
      }
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Error in /api/youtube:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to parse YouTube video and build cognitive schema." 
    }, { status: 500 });
  }
}
