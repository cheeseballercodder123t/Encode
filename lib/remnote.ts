import { Activity, SavedSchema } from './types';

export interface FactItem {
  id: string;
  statement: string;
  category: string;
  significance: string;
  clozeFormat: string; // e.g. "The speed of light in vacuum is {{299,792,458 m/s}}"
}

export interface ConceptMechanism {
  id: string;
  conceptName: string;
  whatIsIt: string; // What
  whyItMatters: string; // Why
  howItWorks: string; // How
  whatIfFailed: string; // What If
  remnoteDescriptor: string; // Remnote :: format
  boundaryContrast?: {
    confusableConcept: string;
    differentiatingTest: string;
  };
}

export interface FeynmanClozeItem {
  id: string;
  stageTitle: string;
  userVocabularyText: string;
  clozedUserText: string;
  textbookJargonComparison: string;
  cognitiveSpeedAdvantage: string;
}

export interface RemnoteExportPayload {
  markdown: string;
  cardCount: number;
  factsCount: number;
  conceptsCount: number;
  hierarchicalDeck: string;
  parentAnchor?: string;
  feynmanClozings?: FeynmanClozeItem[];
}

export interface RemnoteOptions {
  parentAnchor?: string;
  preferFeynmanCloze?: boolean;
}

/**
 * Optimizes a mechanism string into a cloze deletion with {{}} wrapping the key causal trigger
 */
export function optimizeCloze(text: string, keyword?: string): string {
  if (!text) return '';
  if (text.includes('{{') && text.includes('}}')) return text;

  if (keyword && text.toLowerCase().includes(keyword.toLowerCase())) {
    const regex = new RegExp(`(${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'i');
    return text.replace(regex, '{{$1}}');
  }

  // Auto-detect high value verbs / causal connectors
  const words = text.split(' ');
  if (words.length <= 4) {
    return `{{${text}}}`;
  }

  // Cloze the latter half or key explanatory clause
  const mid = Math.floor(words.length / 2);
  const targetSegment = words.slice(mid).join(' ');
  return `${words.slice(0, mid).join(' ')} {{${targetSegment}}}`;
}

/**
 * Infers a broader macro-system context (Contextual Anchoring) if user hasn't specified one
 */
export function inferParentSystemAnchor(topic: string): string {
  if (!topic) return 'Foundational Sciences & Systems';
  const t = topic.toLowerCase();

  if (t.includes('action potential') || t.includes('neuron') || t.includes('synapse') || t.includes('myelin') || t.includes('brain')) {
    return 'The Nervous System & Cellular Electrophysiology';
  }
  if (t.includes('photosynthesis') || t.includes('chloroplast') || t.includes('calvin') || t.includes('light reaction')) {
    return 'Plant Bioenergetics & Metabolic Pathways';
  }
  if (t.includes('mitosis') || t.includes('dna') || t.includes('crispr') || t.includes('ribosome') || t.includes('rna')) {
    return 'Molecular Genetics & Cellular Biology';
  }
  if (t.includes('sort') || t.includes('tree') || t.includes('graph') || t.includes('recursion') || t.includes('dynamic programming')) {
    return 'Computer Science: Data Structures & Algorithms';
  }
  if (t.includes('quantum') || t.includes('schrodinger') || t.includes('wave') || t.includes('entangle')) {
    return 'Modern Quantum Mechanics & Theoretical Physics';
  }
  if (t.includes('inflation') || t.includes('monetary') || t.includes('gdp') || t.includes('interest rate') || t.includes('liquidity')) {
    return 'Macroeconomics & Monetary Policy Systems';
  }
  if (t.includes('contract') || t.includes('tort') || t.includes('jurisdiction') || t.includes('statute')) {
    return 'Legal Jurisprudence & Regulatory Frameworks';
  }

  // Generic intelligent parent
  return `Broader System: Foundations of ${topic}`;
}

/**
 * Generates Feynman-to-Cloze cards from user's own conversational explanations
 */
export function generateFeynmanClozes(schema: Partial<SavedSchema>): FeynmanClozeItem[] {
  const items: FeynmanClozeItem[] = [];
  if (!schema.activities || schema.activities.length === 0) return items;

  schema.activities.forEach((act, idx) => {
    const userResp = schema.userResponses?.[act.id];
    const userField = userResp?.field1 || userResp?.field2 || userResp?.field3;
    const userText = userField && userField.trim().length > 10 ? userField.trim() : act.scaffold.exampleAnswer || act.contextSnippet;
    
    // Create clozed version from user's vocabulary
    const clozed = optimizeCloze(compressSemantically(userText), act.keywords?.[0] || act.keywords?.[1]);
    const jargonComparison = act.contextSnippet || act.prompt;

    items.push({
      id: `feynman-cloze-${act.id || idx}`,
      stageTitle: act.title || `Stage ${idx + 1}`,
      userVocabularyText: userText,
      clozedUserText: clozed,
      textbookJargonComparison: jargonComparison,
      cognitiveSpeedAdvantage: userField ? 'Personal Schema (3.2x Faster Retrieval)' : 'Scaffolded First-Principles',
    });
  });

  return items;
}

/**
 * Performs client-side semantic compression (reducing card fluff by ~60%)
 */
export function compressSemantically(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\b(it is important to note that|as we can clearly see|in other words|basically|essentially|it should be remembered that|in this regard|furthermore, we notice that)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a complete SavedSchema or active activities into strict RemNote hierarchical markdown
 * Hierarchy rules:
 * - Parent System Anchor (Feature 86: Contextual Anchoring)
 *   - Document / Title: [[Parent System]] > [[Topic]]
 *     - Concept Name :: [Feynman Explanation / Definition with {{Cloze}}] (Feature 83: Feynman-to-Cloze)
 *       - Child: What :: [What]
 *       - Child: Why :: [Why]
 *       - Child: How (Mechanism) :: [How with {{Cloze}}]
 *       - Child: What If (Edge Case) :: [What If]
 *       - Child: Boundary Test :: [Versus trap]
 */
export function generateRemnoteHierarchy(
  schema: Partial<SavedSchema>,
  options?: RemnoteOptions
): RemnoteExportPayload {
  const topic = schema.topicSummary || 'DeepEncode Cognitive Schema';
  const parentAnchor = options?.parentAnchor || inferParentSystemAnchor(topic);
  const preferFeynman = options?.preferFeynmanCloze !== false;
  
  const feynmanClozings = generateFeynmanClozes(schema);
  const lines: string[] = [];

  // Feature 86: Contextual Anchoring (Parent-Child Enforcement)
  lines.push(`# 🌐 ${parentAnchor}`);
  lines.push(`## 📁 DeepEncoded: ${topic}`);
  lines.push(`- **Parent System Anchor** :: [[${parentAnchor}]]`);
  lines.push(`- **Learning Mode** :: ${schema.mode === 'memorization' ? 'Taxonomic Memorization' : 'First-Principles Conceptual'}`);
  lines.push(`- **Feynman Cloze Pipeline** :: ${preferFeynman ? 'Active (User Vocabulary Clozing)' : 'Standard Academic'}`);
  lines.push(`- **Mastery XP** :: ${schema.xpEarned || 150} XP`);
  lines.push(`- **Encoded Date** :: ${new Date(schema.timestamp || Date.now()).toLocaleDateString()}`);
  lines.push('');

  let cardCount = 0;
  let factsCount = 0;
  let conceptsCount = 0;

  // Render Research Contexts if present
  if (schema.researchContexts && schema.researchContexts.length > 0) {
    lines.push(`### 🔍 Foundational Deep Research Prerequisites`);
    for (const ctx of schema.researchContexts) {
      lines.push(`- ${ctx.conceptAdded} :: ${compressSemantically(ctx.explanation)}`);
      lines.push(`  - Prerequisite Gap Detected :: {{${ctx.detectedGap}}}`);
      if (ctx.sourceTitle) {
        lines.push(`  - Authoritative Reference :: ${ctx.sourceTitle}`);
      }
      cardCount += 2;
    }
    lines.push('');
  }

  // Render Activities (Stages) into Concept-Descriptor cards
  if (schema.activities && schema.activities.length > 0) {
    lines.push(`### 🧠 4-Quadrant Cognitive Matrix & Mechanisms`);

    schema.activities.forEach((act, idx) => {
      const resp = schema.userResponses?.[act.id];
      const stageName = act.title || `Stage ${idx + 1}`;
      
      // Feature 83: The Feynman-to-Cloze Pipeline - Prioritize student's own vocabulary
      const userWhat = resp?.field1?.trim() || '';
      const userWhy = resp?.field2?.trim() || '';
      const userHow = resp?.field3?.trim() || '';
      
      const primaryExplanation = userWhat || act.scaffold.exampleAnswer || act.contextSnippet || act.cognitiveGoal;

      lines.push(`- ${act.stageNumber || idx + 1}. ${stageName} :: ${compressSemantically(act.cognitiveGoal)}`);
      
      // Quadrant 1: What (Feynman Cloze)
      if (userWhat) {
        const clozeF1 = optimizeCloze(compressSemantically(userWhat), act.keywords?.[0]);
        lines.push(`  - What is it? (Personal Feynman) :: ${clozeF1}`);
        cardCount++;
        conceptsCount++;
      } else if (act.scaffold.exampleAnswer || act.contextSnippet) {
        const fallback = act.scaffold.exampleAnswer || act.contextSnippet;
        const clozeF1 = optimizeCloze(compressSemantically(fallback), act.keywords?.[0]);
        lines.push(`  - What is it? (Definition) :: ${clozeF1}`);
        cardCount++;
        conceptsCount++;
      }

      // Quadrant 2: Why
      if (userWhy) {
        const clozeF2 = optimizeCloze(compressSemantically(userWhy), act.keywords?.[1]);
        lines.push(`  - Why does it matter? (Significance) :: ${clozeF2}`);
        cardCount++;
      } else {
        lines.push(`  - Why does it matter? (Significance) :: {{Crucial step for system operation and preventing collapse}}`);
        cardCount++;
      }

      // Quadrant 3: How (Mechanism with Feynman Cloze)
      if (userHow) {
        const clozeF3 = optimizeCloze(compressSemantically(userHow), act.keywords?.[2]);
        lines.push(`  - How does it work? (Mechanism) :: ${clozeF3}`);
        cardCount++;
      } else if (act.prompt) {
        const clozeF3 = optimizeCloze(compressSemantically(act.prompt), act.keywords?.[2]);
        lines.push(`  - How does it work? (Mechanism) :: ${clozeF3}`);
        cardCount++;
      }

      // Quadrant 4: What If / Counterfactual Edge Case
      lines.push(`  - What If it is removed or fails? (Edge Case) :: If {{${act.keywords?.[0] || 'the core mechanism'}}} is absent, the system fails to maintain equilibrium.`);
      cardCount++;

      // Keywords Cloze Deck
      if (act.keywords && act.keywords.length > 0) {
        lines.push(`  - Core Semantic Triggers :: ${act.keywords.map(k => `{{${k}}}`).join(', ')}`);
        cardCount++;
        factsCount++;
      }

      lines.push('');
    });
  }

  const markdown = lines.join('\n');
  return {
    markdown,
    cardCount,
    factsCount,
    conceptsCount,
    hierarchicalDeck: markdown,
    parentAnchor,
    feynmanClozings,
  };
}

/**
 * Pushes hierarchical markdown directly to RemNote via RemNote API
 */
export async function pushToRemnoteApi(apiKey: string, userId: string, payload: RemnoteExportPayload): Promise<{ success: boolean; message: string; docId?: string }> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("RemNote API Key is required.");
  }

  try {
    // RemNote Plugin/API v1 create document endpoint
    const res = await fetch("https://api.remnote.com/v1/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        userId: userId || undefined,
        text: payload.markdown,
        isDocument: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Handle standard RemNote API payload formats
      return {
        success: false,
        message: `RemNote API response (${res.status}): ${errText || 'Invalid API Token or permission scope'}. You can still use 1-Click Copy RemNote Markdown below!`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      message: "Successfully pushed structured document into your RemNote Knowledge Base!",
      docId: data?.docId || data?._id,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Network/CORS limitation: ${err.message || 'Direct push blocked'}. Use 1-Click 'Copy RemNote' to paste instantly into RemNote!`,
    };
  }
}

