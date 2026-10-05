import type { Metadata } from 'next';
import { TOY_EXAMPLES } from '@/lib/toy-models/examples';
import { EmbedLabStage, SavedLabStage } from './embed-lab';

/**
 * RemNote-native embed surface (docs/remnote-native-architecture.md, Phase 3).
 *
 * A bare, chrome-free page that renders one interactive lab and nothing else,
 * so RemNote can unfurl its URL into a live widget inside the learner's notes.
 * The root layout already ships the fonts, Tailwind and `toy-models.css`, so
 * the instrument looks exactly as it does in the studio.
 *
 * Three kinds of ids resolve here:
 *  - a teaching-example id (`ohm`, `predprey`, …) — resolved statically, no key
 *    and no library needed;
 *  - a saved-schema id — the first lab inside that schema;
 *  - a stage activity id — the schema that carries it (this is what the lab's
 *    copy button emits while a session is still open, before the schema has a
 *    home of its own).
 *
 * The page never invents a lab: an id that matches neither says so plainly.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const example = TOY_EXAMPLES.find((candidate) => candidate.id === id);
  return {
    title: example ? `${example.config.title} · DeepEncode lab` : 'DeepEncode interactive lab',
    // Embeds are meant to be unfurled elsewhere; keep crawlers out of them.
    robots: { index: false, follow: false },
  };
}

export default async function ToyModelEmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The studio's teaching examples use `lab-<id>` activity ids, so both forms
  // resolve — and the raw id is passed through unchanged, which makes the copy
  // button on this page re-emit exactly the URL that is already working.
  const example = TOY_EXAMPLES.find((candidate) => candidate.id === id || `lab-${candidate.id}` === id);

  return (
    <main className="min-h-dvh bg-chassis p-4 sm:p-6" data-testid="toy-embed-page" data-embed-kind={example ? 'example' : 'library'}>
      {example ? (
        <EmbedLabStage config={example.config} activityId={id} />
      ) : (
        <SavedLabStage lookupId={id} />
      )}
    </main>
  );
}
