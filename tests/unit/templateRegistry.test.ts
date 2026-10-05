import { describe, it, expect, afterEach } from 'vitest';
import {
  TEMPLATE_REGISTRY,
  TEMPLATE_COMPONENTS,
  getAllTemplates,
  getTemplateDefinition,
  getTemplatesByCategory,
  registerTemplate,
} from '@/lib/templates/registry';

/**
 * The template registry is the single answer to "which renderer draws this
 * stage?" — `StageVisualRenderer` looks the id up here instead of holding its
 * own table, so the two things that can go wrong are the ones pinned below:
 * a registered template with no renderer (a stage that draws nothing), and an
 * id the renderer can resolve that the registry has never heard of (a stage
 * that silently falls back to the wrong diagram).
 */

// Every key the renderer can arrive at: the 15 registered templates plus the
// interleaved-SRS variant, which borrows the personal-schema renderer.
const RESOLVABLE_KEYS = [
  'first_principles',
  'cause_effect',
  'analogy_matrix',
  'concept_hierarchy',
  'state_transition',
  'boundary_stress_test',
  'visual_blueprint',
  'contrast_grid',
  'taxonomic_chunking',
  'mnemonic_peg',
  'memory_palace',
  'formula_spatial_grid',
  'personal_schema',
  'mnemonic_storyboard',
  'broken_model_debug',
  'interleaved_srs',
];

const BASELINE_IDS = new Set(Object.keys(TEMPLATE_REGISTRY));
const BASELINE_RENDERERS = new Set(Object.keys(TEMPLATE_COMPONENTS));

// A test may register a template; nothing it adds may outlive the test.
afterEach(() => {
  for (const id of Object.keys(TEMPLATE_REGISTRY)) {
    if (!BASELINE_IDS.has(id)) delete TEMPLATE_REGISTRY[id];
  }
  for (const id of Object.keys(TEMPLATE_COMPONENTS)) {
    if (!BASELINE_RENDERERS.has(id)) delete TEMPLATE_COMPONENTS[id];
  }
});

describe('template registry', () => {
  it('registers the declarative metadata for every template', () => {
    const templates = getAllTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(15);
    for (const template of templates) {
      expect(template.id, template.title).toBeTruthy();
      expect(template.title).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.learnerBenefit).toBeTruthy();
      expect(template.learnerTask).toBeTruthy();
      expect(template.cognitiveFramework).toBeTruthy();
      expect(template.systemPromptDirective).toBeTruthy();
      expect(['conceptual', 'memorization', 'hybrid']).toContain(template.category);
    }
  });

  it('keeps each definition under its own id', () => {
    for (const [key, template] of Object.entries(TEMPLATE_REGISTRY)) {
      expect(template.id, key).toBe(key);
    }
  });

  it('gives every registered template a renderer', () => {
    for (const template of getAllTemplates()) {
      expect(template.component, template.id).toBeTruthy();
    }
  });

  it('resolves every id the renderer can arrive at', () => {
    for (const id of RESOLVABLE_KEYS) {
      expect(TEMPLATE_COMPONENTS[id], id).toBeTruthy();
    }
  });

  it('gives every registered template the same renderer the table holds', () => {
    for (const template of getAllTemplates()) {
      expect(TEMPLATE_COMPONENTS[template.id], template.id).toBe(template.component);
    }
  });

  it('sends the interleaved-SRS variant through the personal-schema renderer', () => {
    expect(TEMPLATE_COMPONENTS['interleaved_srs']).toBe(TEMPLATE_COMPONENTS['personal_schema']);
  });

  it('reports an unknown id as unknown instead of guessing a renderer', () => {
    expect(TEMPLATE_COMPONENTS['no_such_template']).toBeUndefined();
    expect(getTemplateDefinition('no_such_template')).toBeUndefined();
  });

  it('filters templates by category', () => {
    const memorization = getTemplatesByCategory('memorization');
    expect(memorization.length).toBeGreaterThan(0);
    expect(memorization.every((t) => t.category === 'memorization')).toBe(true);
    expect(memorization.map((t) => t.id)).toContain('memory_palace');
  });

  it('accepts a new template at runtime, with no edit to the renderer', () => {
    const Probe = () => null;
    registerTemplate({
      id: 'phase_plane_probe',
      title: 'Phase Plane Probe',
      category: 'conceptual',
      cognitiveFramework: 'Phase-plane analysis',
      description: 'Trace a system through its state space.',
      learnerBenefit: 'Seeing the whole state space shows where the system must go next.',
      learnerTask: 'Predict which way the trajectory turns and why.',
      icon: '🌀',
      accentColor: 'flux',
      systemPromptDirective: 'Generate a phase_plane_probe schema.',
      component: Probe,
    });

    expect(getTemplateDefinition('phase_plane_probe')?.title).toBe('Phase Plane Probe');
    expect(TEMPLATE_COMPONENTS['phase_plane_probe']).toBe(Probe);
    expect(getAllTemplates().map((t) => t.id)).toContain('phase_plane_probe');
  });

  it('lets a registration replace an existing template in place', () => {
    const before = getTemplateDefinition('first_principles');
    const Replacement = () => null;
    registerTemplate({ ...before!, component: Replacement });
    expect(TEMPLATE_COMPONENTS['first_principles']).toBe(Replacement);
    // The metadata of the original is untouched by the swap above it.
    expect(getTemplateDefinition('first_principles')?.title).toBe(before!.title);
  });
});
