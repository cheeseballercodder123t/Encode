import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { generateJSONWithProvider } from '@/lib/ai-client';
import { ComparativeSchemaReport } from '@/lib/types';
import { parseRouteBody, synthesisSchema } from '@/lib/api-validation';

const comparativeSynthesisSchema = {
  type: Type.OBJECT,
  properties: {
    synthesisTitle: { type: Type.STRING },
    docAName: { type: Type.STRING },
    docBName: { type: Type.STRING },
    agreedCorePrinciples: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    contradictions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          topicOrConcept: { type: Type.STRING },
          docAClaim: { type: Type.STRING },
          docBClaim: { type: Type.STRING },
          resolutionOrNuance: { type: Type.STRING },
          examTrapWarning: { type: Type.STRING },
        },
        required: ['id', 'topicOrConcept', 'docAClaim', 'docBClaim', 'resolutionOrNuance', 'examTrapWarning'],
      },
    },
    complements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          conceptName: { type: Type.STRING },
          uniqueInDocA: { type: Type.STRING },
          uniqueInDocB: { type: Type.STRING },
          synthesizedTakeaway: { type: Type.STRING },
        },
        required: ['id', 'conceptName', 'synthesizedTakeaway'],
      },
    },
    unifiedMatrix: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          conceptName: { type: Type.STRING },
          whatIsIt: { type: Type.STRING },
          whyItMatters: { type: Type.STRING },
          howItWorks: { type: Type.STRING },
          whatIfEdgeCase: { type: Type.STRING },
          boundaryContrast: {
            type: Type.OBJECT,
            properties: {
              confusableLookalike: { type: Type.STRING },
              distinguishingRule: { type: Type.STRING },
            },
            required: ['confusableLookalike', 'distinguishingRule'],
          },
        },
        required: ['id', 'conceptName', 'whatIsIt', 'whyItMatters', 'howItWorks', 'whatIfEdgeCase'],
      },
    },
  },
  required: ['synthesisTitle', 'docAName', 'docBName', 'agreedCorePrinciples', 'contradictions', 'complements', 'unifiedMatrix'],
};

export async function POST(req: NextRequest) {
  try {
    const body = await parseRouteBody(req, synthesisSchema);
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status });
    }
    const { docA, docB, settings } = body.data;

    if (!docA || !docB) {
      return NextResponse.json(
        { error: 'Both Document A and Document B must be provided for comparative synthesis.' },
        { status: 400 }
      );
    }

    const docAName = docA.name || 'Document A';
    const docBName = docB.name || 'Document B';

    const systemPrompt = `You are an elite cognitive science professor executing Multi-Document Comparative Schema Synthesis.
Your task is to analyze two source documents, cross-examine their claims, and build a unified Comparative 4-Quadrant Cognitive Matrix.
Identify:
1. Agreed Core Principles
2. Contradictions & Nuance Discrepancies (with exam trap warnings)
3. Complementary Deep-Dives (unique points in Document A vs Document B)
4. Unified 4-Quadrant Mechanism Matrix`;

    const userPrompt = `Document A Name: "${docAName.replace(/"/g, "'")}"
Document A Excerpt/Notes: ${docA.contentSnippet || (docA.fileAsset ? `Attached file: ${docA.fileAsset.name}` : '(empty)')}

Document B Name: "${docBName.replace(/"/g, "'")}"
Document B Excerpt/Notes: ${docB.contentSnippet || (docB.fileAsset ? `Attached file: ${docB.fileAsset.name}` : '(empty)')}

Execute the multi-document synthesis and return JSON strictly matching the schema.`;

    const result = await generateJSONWithProvider({
      systemPrompt,
      userPrompt,
      responseSchema: comparativeSynthesisSchema,
      settings,
      file: docA.fileAsset || docB.fileAsset || null,
      isChecker: false,
    });

    return NextResponse.json(result as ComparativeSchemaReport);
  } catch (error: any) {
    console.error('Error in /api/synthesis:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to synthesize multi-document comparison.' },
      { status: 500 }
    );
  }
}
