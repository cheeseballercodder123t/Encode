'use client';

import React from 'react';
import { Activity } from '@/lib/types';
import { FirstPrinciplesVisual } from './FirstPrinciplesVisual';
import { CauseEffectVisual } from './CauseEffectVisual';
import { VisualBlueprintVisual } from './VisualBlueprintVisual';
import { AnalogyMatrixVisual } from './AnalogyMatrixVisual';
import { ConceptHierarchyVisual } from './ConceptHierarchyVisual';
import { StateTransitionVisual } from './StateTransitionVisual';
import { BoundaryStressTestVisual } from './BoundaryStressTestVisual';
import { TaxonomicChunkingVisual } from './TaxonomicChunkingVisual';
import { MnemonicPegVisual } from './MnemonicPegVisual';
import { MemoryPalaceVisual } from './MemoryPalaceVisual';
import { ContrastGridVisual } from './ContrastGridVisual';
import { FormulaSpatialVisual } from './FormulaSpatialVisual';
import { PersonalSchemaVisual } from './PersonalSchemaVisual';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function StageVisualRenderer({ activity, field1, field2, field3, selectedPreset }: Props) {
  const type = activity.templateType || '';
  const visualData = activity.visualData;

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
}
