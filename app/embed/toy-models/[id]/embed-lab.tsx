'use client';

import React from 'react';
import { ToyModelLab } from '@/components/toy-models/ToyModelLab';
import { loadSavedSchemas } from '@/lib/storage';
import type { Activity, SavedSchema } from '@/lib/types';
import type { ToyModelConfig } from '@/lib/toy-models/types';

/**
 * The static half of the embed route (RemNote plan Phase 3): one teaching
 * example, rendered with no workbench around it. Reuses the real lab so the
 * embed behaves exactly like the studio surface, minus the chrome.
 */
export function EmbedLabStage({ config, activityId }: { config: ToyModelConfig; activityId: string }) {
  return <ToyModelLab key={activityId} activityId={activityId} config={config} />;
}

/** What the lookup matched, and the id the lab's own progress storage uses. */
interface ResolvedLab {
  activityId: string;
  config: ToyModelConfig;
}

/**
 * Resolve a library lab by schema id OR by stage activity id. Session labs are
 * keyed by activity id in the toy progress cache, so an embed opened mid-session
 * must accept the activity id directly — matching only schemas would blank the
 * widget until the learner saved.
 */
function resolveLibraryLab(lookupId: string): ResolvedLab | undefined {
  const schemas = loadSavedSchemas();
  const bySchema = schemas.find((candidate) => candidate.id === lookupId);
  const schema: SavedSchema | undefined =
    bySchema ??
    schemas.find((candidate) => (candidate.activities || []).some((candidate2) => candidate2.id === lookupId));
  const activity: Activity | undefined =
    bySchema
      ? (bySchema.activities || []).find((candidate) => candidate.toyModel)
      : schema?.activities?.find((candidate) => candidate.id === lookupId && candidate.toyModel);

  const config = activity?.toyModel;
  if (!config) return undefined;
  return { activityId: `embed-schema-${schema!.id}-${activity!.id}`, config };
}

/**
 * The library half of the embed route: resolves a schema id or activity id from
 * the learner's own library after hydration — no model call, no server data.
 */
export function SavedLabStage({ lookupId }: { lookupId: string }) {
  const [state, setState] = React.useState<'loading' | 'found' | 'missing'>('loading');
  const [lab, setLab] = React.useState<ResolvedLab | undefined>();

  React.useEffect(() => {
    // Read the browser-only library after hydration, never during SSR or while
    // rendering — the same deferred external-store read the studio lab uses.
    const timer = setTimeout(() => {
      const resolved = resolveLibraryLab(lookupId);
      if (!resolved) {
        setState('missing');
        return;
      }
      setLab(resolved);
      setState('found');
    }, 0);
    return () => clearTimeout(timer);
  }, [lookupId]);

  if (state === 'loading') {
    return (
      <div
        className="mx-auto mt-24 max-w-md text-center font-mono text-xs uppercase tracking-[0.2em] text-solder"
        role="status"
        data-testid="toy-embed-loading"
      >
        Loading lab…
      </div>
    );
  }

  if (state === 'missing') {
    return (
      <div className="mx-auto mt-24 max-w-md border border-edge/70 bg-deck p-6 text-center" data-testid="toy-embed-missing">
        <p className="font-serif text-lg text-bone">No interactive lab for “{lookupId}”</p>
        <p className="mt-2 text-xs leading-relaxed text-solder">
          An embed URL only shows a lab saved in this browser, or one of the six teaching examples. Copy the embed again from the studio to get the right link.
        </p>
      </div>
    );
  }

  return lab ? <ToyModelLab key={lab.activityId} activityId={lab.activityId} config={lab.config} /> : null;
}
