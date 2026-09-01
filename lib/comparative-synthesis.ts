import { generateJSONWithProvider } from './ai-client';
import { 
  ComparativeDocumentAsset, 
  ComparativeSchemaReport, 
  AISettings 
} from './types';

export async function generateComparativeSchema(
  docA: ComparativeDocumentAsset,
  docB: ComparativeDocumentAsset,
  settings: AISettings
): Promise<ComparativeSchemaReport> {
  const systemPrompt = `You are an elite cognitive science professor executing Multi-Document Comparative Schema Synthesis.
Your task is to analyze two source documents, cross-examine their claims, and build a unified Comparative 4-Quadrant Cognitive Matrix.
Identify:
1. Agreed Core Principles
2. Contradictions & Nuance Discrepancies (with exam trap warnings)
3. Complementary Deep-Dives (unique points in Document A vs Document B)
4. Unified 4-Quadrant Mechanism Matrix`;

  const userPrompt = `Document A Name: "${docA.name}"
Document A Excerpt/Notes: ${docA.contentSnippet || 'See attached file'}

Document B Name: "${docB.name}"
Document B Excerpt/Notes: ${docB.contentSnippet || 'See attached file'}

Execute the multi-document synthesis and return JSON strictly matching the specified structure:
{
  "synthesisTitle": "Comparative Synthesis: ${docA.name.replace(/"/g, "'")} vs ${docB.name.replace(/"/g, "'")}",
  "docAName": "${docA.name.replace(/"/g, "'")}",
  "docBName": "${docB.name.replace(/"/g, "'")}",
  "agreedCorePrinciples": [ "string" ],
  "contradictions": [
    {
      "id": "contra-1",
      "topicOrConcept": "string",
      "docAClaim": "string",
      "docBClaim": "string",
      "resolutionOrNuance": "string",
      "examTrapWarning": "string"
    }
  ],
  "complements": [
    {
      "id": "comp-1",
      "conceptName": "string",
      "uniqueInDocA": "string",
      "uniqueInDocB": "string",
      "synthesizedTakeaway": "string"
    }
  ],
  "unifiedMatrix": [
    {
      "id": "mech-1",
      "conceptName": "string",
      "whatIsIt": "string",
      "whyItMatters": "string",
      "howItWorks": "string",
      "whatIfEdgeCase": "string",
      "boundaryContrast": {
        "confusableLookalike": "string",
        "distinguishingRule": "string"
      }
    }
  ]
}`;

  const result = await generateJSONWithProvider({
    systemPrompt,
    userPrompt,
    settings,
    file: docA.fileAsset || docB.fileAsset || null,
  });

  return result as ComparativeSchemaReport;
}
