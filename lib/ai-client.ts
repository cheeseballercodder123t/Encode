import { GoogleGenAI } from "@google/genai";
import { AISettings, UploadedFileAsset } from "./types";

interface GenerateJSONOptions {
  systemPrompt: string;
  userPrompt: string;
  responseSchema?: any;
  settings?: Partial<AISettings>;
  isChecker?: boolean;
  file?: UploadedFileAsset | null;
}

export async function generateJSONWithProvider({
  systemPrompt,
  userPrompt,
  responseSchema,
  settings,
  isChecker = false,
  file = null,
}: GenerateJSONOptions): Promise<any> {
  const provider = settings?.provider || 'gemini';

  if (provider === 'gemini') {
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No Gemini API key found. Please provide a Gemini API Key in Settings or configure GEMINI_API_KEY.");
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    let targetModel = isChecker
      ? (settings?.geminiCheckerModel || 'gemini-3.5-flash')
      : (settings?.geminiModel || 'gemini-3.7-flash');

    const config: any = {
      responseMimeType: "application/json",
      temperature: isChecker ? 0.3 : 0.6,
    };

    if (responseSchema) {
      config.responseSchema = responseSchema;
    }

    const parts: any[] = [
      { text: systemPrompt },
      { text: userPrompt }
    ];

    // If multimodal file payload is present (PDF, PNG, JPEG, WEBP)
    if (file && file.base64Data && file.type) {
      parts.push({
        inlineData: {
          mimeType: file.type,
          data: file.base64Data
        }
      });
    }

    // Try primary target model with fallback chain: targetModel -> gemini-3.6-flash -> gemini-3.5-flash -> gemini-2.5-flash
    const modelsToTry = [targetModel];
    const fallbackChain = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
    for (const fb of fallbackChain) {
      if (!modelsToTry.includes(fb)) {
        modelsToTry.push(fb);
      }
    }

    let lastError: any = null;
    for (const mName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: mName,
          contents: [
            {
              role: "user",
              parts
            }
          ],
          config,
        });

        const text = response.text;
        if (!text) {
          throw new Error("Empty response returned from Gemini.");
        }
        return JSON.parse(text);
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || err).toLowerCase();
        // If it's a quota / rate limit / 429 error, try fallback model in loop
        if (errStr.includes('quota') || errStr.includes('429') || errStr.includes('resource_exhausted') || errStr.includes('limit')) {
          console.warn(`Gemini model ${mName} hit rate limit / quota error, falling back to next available model...`);
          continue;
        }
        // If it's a structural or auth error, throw immediately
        throw err;
      }
    }

    throw lastError || new Error("All Gemini model fallbacks failed.");
  }

  if (provider === 'openrouter') {
    const apiKey = settings?.openrouterApiKey;
    if (!apiKey) {
      throw new Error("No OpenRouter API key found. Please enter your OpenRouter Key in Settings.");
    }

    const modelName = isChecker
      ? (settings?.openrouterCheckerModel || 'google/gemini-2.5-flash-lite')
      : (settings?.openrouterModel || 'google/gemini-2.5-flash');

    // Build user content array for OpenRouter if file is image
    let userContent: any = userPrompt;
    if (file && file.base64Data && file.type.startsWith('image/')) {
      userContent = [
        { type: "text", text: userPrompt },
        { 
          type: "image_url", 
          image_url: { url: `data:${file.type};base64,${file.base64Data}` } 
        }
      ];
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai.studio/build",
        "X-Title": "DeepEncode",
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${systemPrompt}\n\nIMPORTANT: Respond with valid JSON matching the requested structure.` },
          { role: "user", content: userContent }
        ],
        temperature: isChecker ? 0.3 : 0.6,
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenRouter");
    return JSON.parse(content);
  }

  if (provider === 'openai') {
    const apiKey = settings?.openaiApiKey;
    if (!apiKey) {
      throw new Error("No OpenAI API key found. Please enter your OpenAI Compatible Key in Settings.");
    }

    const baseUrl = (settings?.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const modelName = isChecker
      ? (settings?.openaiCheckerModel || 'gpt-4o-mini')
      : (settings?.openaiModel || 'gpt-4o-mini');

    let userContent: any = userPrompt;
    if (file && file.base64Data && file.type.startsWith('image/')) {
      userContent = [
        { type: "text", text: userPrompt },
        { 
          type: "image_url", 
          image_url: { url: `data:${file.type};base64,${file.base64Data}` } 
        }
      ];
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${systemPrompt}\n\nIMPORTANT: Respond strictly with valid JSON conforming to the requested schema.` },
          { role: "user", content: userContent }
        ],
        temperature: isChecker ? 0.3 : 0.6,
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI-compatible error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI-compatible provider");
    return JSON.parse(content);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
