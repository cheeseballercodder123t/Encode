'use client';

import React, { Suspense, useMemo } from 'react';
import { validateToyModelConfig } from '@/lib/toy-models/validation';
import { modelFingerprint } from '@/lib/toy-models/engine';
import type { ToyModelProgress } from '@/lib/toy-models/types';
const ToyModelLab = React.lazy(() => import('@/components/toy-models/ToyModelLab').then((module) => ({ default: module.ToyModelLab })));
import { Activity } from '@/lib/types';
import { TemplateErrorBoundary } from './TemplateErrorBoundary';
import { TEMPLATE_COMPONENTS, type TemplateComponentProps } from '@/lib/templates/registry';

// The props bundle and the id → renderer table both live in the registry, which
// owns the mapping; this component only decides which id to resolve.
interface VisualComponentProps extends TemplateComponentProps {
  /**
   * Optional write-back hook. Templates that can blank one of their own cells
   * (first principles, analogy matrix, state transition) use it to put the
   * completed link into the stage answer; without it they render statically.
   */
  onAdopt?: (text: string) => void;
}

interface Props extends VisualComponentProps {}

function TemplateLoadingSkeleton() {
  return (
    <div className="border border-edge/40 bg-deck/40 p-4">
      <div className="flex items-center justify-between border-b border-edge pb-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-inset" />
          <div className="h-3 w-36 bg-inset" />
        </div>
        <div className="h-3 w-24 bg-inset" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="h-20 bg-inset/60" />
        <div className="h-20 bg-inset/60" />
        <div className="h-20 bg-inset/60" />
      </div>
    </div>
  );
}

export function StageVisualRenderer({ activity, field1, field2, field3, selectedPreset, onAdopt, toyProgress, onToyProgress }: Props) {
  const toyValidation = useMemo(() => activity.toyModel ? validateToyModelConfig(activity.toyModel) : undefined, [activity.toyModel]);
  const toyConfig = toyValidation?.sanitizedConfig;
  const type = activity.templateType || '';
  const visualData = activity.visualData;

  // Determine which component key to use. The registry owns the id → renderer
  // mapping (including the ids that borrow another template's component), so
  // this only has to answer "which id is this stage?" — never "how do I draw
  // it?".
  let resolvedKey = type;

  // Legacy fallback: detect payload shape if templateType not set
  if (!resolvedKey) {
    if (visualData?.brokenModel) resolvedKey = 'broken_model_debug';
    else if (visualData?.mnemonicStoryboard) resolvedKey = 'mnemonic_storyboard';
    else if (visualData?.analogyMappings) resolvedKey = 'analogy_matrix';
    else if (visualData?.hierarchyTree) resolvedKey = 'concept_hierarchy';
    else if (visualData?.flowSteps) resolvedKey = 'state_transition';
    else if (visualData?.boundaryGauges) resolvedKey = 'boundary_stress_test';
    else if (visualData?.chunkBuckets) resolvedKey = 'taxonomic_chunking';
    else if (visualData?.acronymLetters) resolvedKey = 'mnemonic_peg';
    else if (visualData?.palaceRooms) resolvedKey = 'memory_palace';
    else if (visualData?.contrastMatrix) resolvedKey = 'contrast_grid';
    else if (visualData?.formulaComponents) resolvedKey = 'formula_spatial_grid';
    else if (visualData?.nodes?.some((n: any) => n.type === 'danger')) resolvedKey = 'cause_effect';
    else resolvedKey = 'first_principles';
  }

  const Component = TEMPLATE_COMPONENTS[resolvedKey] ?? TEMPLATE_COMPONENTS['first_principles'];
  if (!Component) return null;

  return (
    <TemplateErrorBoundary templateType={type}>
      <Suspense fallback={<TemplateLoadingSkeleton />}>
        {toyConfig ? <ToyModelLab key={`${activity.id}-${modelFingerprint(toyConfig)}`} activityId={activity.id} config={toyConfig} progress={toyProgress} onProgress={onToyProgress} onAdopt={onAdopt} /> : <>
          {(activity.toyModelIssues?.length || toyValidation?.issues.length) ? <div className="mb-3 p-3 border border-hazard-500/30 rounded-lg text-xs text-slate-ink" role="status">Interactive model unavailable: {(activity.toyModelIssues || toyValidation?.issues || []).join('; ')}. The original stage remains usable.</div> : null}
        <Component
          activity={activity}
          field1={field1}
          field2={field2}
          field3={field3}
          selectedPreset={selectedPreset}
          onAdopt={onAdopt}
        />
        </>}
      </Suspense>
    </TemplateErrorBoundary>
  );
}
