'use client';

import React, { Suspense, lazy } from 'react';
import { Activity } from '@/lib/types';
import { TemplateErrorBoundary } from './TemplateErrorBoundary';
import { TEMPLATE_REGISTRY } from '@/lib/templates/registry';

// Common props interface for all visual components
interface VisualComponentProps {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

// All visual components still lazy-loaded for code-splitting
const COMPONENT_MAP: Record<string, React.LazyExoticComponent<React.ComponentType<VisualComponentProps>>> = {
  first_principles: lazy(() => import('./FirstPrinciplesVisual').then(m => ({ default: m.FirstPrinciplesVisual }))),
  cause_effect: lazy(() => import('./CauseEffectVisual').then(m => ({ default: m.CauseEffectVisual }))),
  visual_blueprint: lazy(() => import('./VisualBlueprintVisual').then(m => ({ default: m.VisualBlueprintVisual }))),
  analogy_matrix: lazy(() => import('./AnalogyMatrixVisual').then(m => ({ default: m.AnalogyMatrixVisual }))),
  concept_hierarchy: lazy(() => import('./ConceptHierarchyVisual').then(m => ({ default: m.ConceptHierarchyVisual }))),
  state_transition: lazy(() => import('./StateTransitionVisual').then(m => ({ default: m.StateTransitionVisual }))),
  boundary_stress_test: lazy(() => import('./BoundaryStressTestVisual').then(m => ({ default: m.BoundaryStressTestVisual }))),
  taxonomic_chunking: lazy(() => import('./TaxonomicChunkingVisual').then(m => ({ default: m.TaxonomicChunkingVisual }))),
  mnemonic_peg: lazy(() => import('./MnemonicPegVisual').then(m => ({ default: m.MnemonicPegVisual }))),
  memory_palace: lazy(() => import('./MemoryPalaceVisual').then(m => ({ default: m.MemoryPalaceVisual }))),
  contrast_grid: lazy(() => import('./ContrastGridVisual').then(m => ({ default: m.ContrastGridVisual }))),
  formula_spatial_grid: lazy(() => import('./FormulaSpatialVisual').then(m => ({ default: m.FormulaSpatialVisual }))),
  personal_schema: lazy(() => import('./PersonalSchemaVisual').then(m => ({ default: m.PersonalSchemaVisual }))),
  interleaved_srs: lazy(() => import('./PersonalSchemaVisual').then(m => ({ default: m.PersonalSchemaVisual }))),
};

interface Props extends VisualComponentProps {}

function TemplateLoadingSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-4 shadow-lg animate-pulse">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-slate-800" />
          <div className="h-3 w-36 bg-slate-800 rounded" />
        </div>
        <div className="h-3 w-24 bg-slate-800 rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="h-20 bg-slate-800/60 rounded-xl" />
        <div className="h-20 bg-slate-800/60 rounded-xl" />
        <div className="h-20 bg-slate-800/60 rounded-xl" />
      </div>
    </div>
  );
}

export function StageVisualRenderer({ activity, field1, field2, field3, selectedPreset }: Props) {
  const type = activity.templateType || '';
  const visualData = activity.visualData;

  // Determine which component key to use
  let resolvedKey = type;

  // Legacy fallback: detect payload shape if templateType not set
  if (!resolvedKey) {
    if (visualData?.analogyMappings) resolvedKey = 'analogy_matrix';
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

  const Component = COMPONENT_MAP[resolvedKey] ?? COMPONENT_MAP['first_principles'];
  // meta available for future use (e.g. rendering template badge)
  const _meta = TEMPLATE_REGISTRY[resolvedKey];

  return (
    <TemplateErrorBoundary templateType={type}>
      <Suspense fallback={<TemplateLoadingSkeleton />}>
        <Component
          activity={activity}
          field1={field1}
          field2={field2}
          field3={field3}
          selectedPreset={selectedPreset}
        />
      </Suspense>
    </TemplateErrorBoundary>
  );
}
