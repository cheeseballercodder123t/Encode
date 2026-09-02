'use client';

import React, { Suspense, lazy } from 'react';
import { Activity } from '@/lib/types';
import { TemplateErrorBoundary } from './TemplateErrorBoundary';
import { Sparkles, Eye } from 'lucide-react';

// Lazy-loaded visual components for maximum performance and code-splitting
const FirstPrinciplesVisual = lazy(() =>
  import('./FirstPrinciplesVisual').then(m => ({ default: m.FirstPrinciplesVisual }))
);
const CauseEffectVisual = lazy(() =>
  import('./CauseEffectVisual').then(m => ({ default: m.CauseEffectVisual }))
);
const VisualBlueprintVisual = lazy(() =>
  import('./VisualBlueprintVisual').then(m => ({ default: m.VisualBlueprintVisual }))
);
const AnalogyMatrixVisual = lazy(() =>
  import('./AnalogyMatrixVisual').then(m => ({ default: m.AnalogyMatrixVisual }))
);
const ConceptHierarchyVisual = lazy(() =>
  import('./ConceptHierarchyVisual').then(m => ({ default: m.ConceptHierarchyVisual }))
);
const StateTransitionVisual = lazy(() =>
  import('./StateTransitionVisual').then(m => ({ default: m.StateTransitionVisual }))
);
const BoundaryStressTestVisual = lazy(() =>
  import('./BoundaryStressTestVisual').then(m => ({ default: m.BoundaryStressTestVisual }))
);
const TaxonomicChunkingVisual = lazy(() =>
  import('./TaxonomicChunkingVisual').then(m => ({ default: m.TaxonomicChunkingVisual }))
);
const MnemonicPegVisual = lazy(() =>
  import('./MnemonicPegVisual').then(m => ({ default: m.MnemonicPegVisual }))
);
const MemoryPalaceVisual = lazy(() =>
  import('./MemoryPalaceVisual').then(m => ({ default: m.MemoryPalaceVisual }))
);
const ContrastGridVisual = lazy(() =>
  import('./ContrastGridVisual').then(m => ({ default: m.ContrastGridVisual }))
);
const FormulaSpatialVisual = lazy(() =>
  import('./FormulaSpatialVisual').then(m => ({ default: m.FormulaSpatialVisual }))
);
const PersonalSchemaVisual = lazy(() =>
  import('./PersonalSchemaVisual').then(m => ({ default: m.PersonalSchemaVisual }))
);

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

function TemplateLoadingSkeleton({ type }: { type: string }) {
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

  const renderComponent = () => {
    // Dispatch based on templateType or detected visualData payloads
    if (type === 'first_principles' || (!type && visualData?.nodes && !visualData.nodes.some(n => n.type === 'danger'))) {
      return <FirstPrinciplesVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'cause_effect' || (!type && visualData?.nodes?.some(n => n.type === 'danger'))) {
      return <CauseEffectVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'visual_blueprint') {
      return <VisualBlueprintVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'analogy_matrix' || visualData?.analogyMappings) {
      return (
        <AnalogyMatrixVisual
          activity={activity}
          field1={field1}
          field2={field2}
          field3={field3}
          selectedPreset={selectedPreset}
        />
      );
    }

    if (type === 'concept_hierarchy' || visualData?.hierarchyTree) {
      return <ConceptHierarchyVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'state_transition' || visualData?.flowSteps) {
      return <StateTransitionVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'boundary_stress_test' || visualData?.boundaryGauges) {
      return <BoundaryStressTestVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'taxonomic_chunking' || visualData?.chunkBuckets) {
      return <TaxonomicChunkingVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'mnemonic_peg' || visualData?.acronymLetters) {
      return <MnemonicPegVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'memory_palace' || visualData?.palaceRooms) {
      return <MemoryPalaceVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'contrast_grid' || visualData?.contrastMatrix) {
      return <ContrastGridVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'formula_spatial_grid' || visualData?.formulaComponents) {
      return <FormulaSpatialVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    if (type === 'personal_schema' || type === 'interleaved_srs') {
      return <PersonalSchemaVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
    }

    // Generic fallback
    return <FirstPrinciplesVisual activity={activity} field1={field1} field2={field2} field3={field3} />;
  };

  return (
    <TemplateErrorBoundary templateType={type}>
      <Suspense fallback={<TemplateLoadingSkeleton type={type} />}>
        {renderComponent()}
      </Suspense>
    </TemplateErrorBoundary>
  );
}
