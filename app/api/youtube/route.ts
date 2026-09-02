import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { generateJSONWithProvider } from "@/lib/ai-client";

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();
  
  // Standard full URL & share formats
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  if (match && match[1]) {
    return match[1];
  }
  
  // Raw 11 character ID
  if (/^[\w-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }

  return null;
}

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
    const { videoUrl, mode = 'conceptual', settings } = await req.json();

    const videoId = extractYouTubeId(videoUrl);
    if (!videoId) {
      return NextResponse.json({ 
        error: "Invalid YouTube URL. Please provide a valid YouTube watch link or youtu.be link." 
      }, { status: 400 });
    }

    // Attempt to fetch oEmbed metadata for real video title & author
    let oEmbedTitle = '';
    let oEmbedAuthor = '';
    let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    let transcriptSnippet = '';

    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
        next: { revalidate: 3600 }
      });
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        oEmbedTitle = oembedData.title || '';
        oEmbedAuthor = oembedData.author_name || '';
        if (oembedData.thumbnail_url) {
          thumbnailUrl = oembedData.thumbnail_url;
        }
      }
    } catch (e) {
      console.warn("Could not fetch YouTube oEmbed info:", e);
    }

    // Attempt to extract real transcript timed text from YouTube watch page
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0' }
      });
      if (pageRes.ok) {
        const pageHtml = await pageRes.text();
        const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
        if (captionMatch && captionMatch[1]) {
          const tracks = JSON.parse(captionMatch[1]);
          const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
          if (track && track.baseUrl) {
            const transcriptRes = await fetch(track.baseUrl);
            if (transcriptRes.ok) {
              const xml = await transcriptRes.text();
              const lines = Array.from(xml.matchAll(/<text start="([\d.]+)" dur="[\d.]+">(.*?)<\/text>/g))
                .slice(0, 120)
                .map((m: any) => {
                  const sec = Math.floor(parseFloat(m[1]));
                  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
                  const ss = String(sec % 60).padStart(2, '0');
                  const cleanText = m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                  return `[${mm}:${ss}] ${cleanText}`;
                });
              transcriptSnippet = lines.join('\n');
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not extract YouTube transcript, falling back to title cues:", e);
    }

    const systemPrompt = `You are a world-class Video Pedagogy & Cognitive Science Architect.
You transform YouTube educational lectures, university courses, and tutorials into active cognitive schemas with timestamped reviews.

Target Video:
- URL: https://www.youtube.com/watch?v=${videoId}
- Known Video ID: ${videoId}
${oEmbedTitle ? `- Known Video Title: "${oEmbedTitle}"` : ''}
${oEmbedAuthor ? `- Channel/Author: "${oEmbedAuthor}"` : ''}

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
      isChecker: false
    });

    const responsePayload = {
      ...parsedResult,
      youtubeData: {
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title: parsedResult.videoTitle || oEmbedTitle || 'YouTube Lecture',
        authorName: parsedResult.authorName || oEmbedAuthor || 'YouTube Educator',
        thumbnailUrl,
        duration: parsedResult.durationEstimated || 'Video Lecture',
        timestamps: parsedResult.timestamps || []
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
