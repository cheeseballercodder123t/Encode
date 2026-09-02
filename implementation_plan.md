# Architectural Enhancement Plan: Shared Design System, Heavy-Session Performance, and Scalable Template Engine

This plan establishes a modular design system, a pluggable template registry, and high-performance client storage to prepare DeepEncode for heavy user sessions and rapid template scaling.

---

## 1. User Review Required

> [!IMPORTANT]
> - **Backward Compatibility**: All existing localStorage schemas and session data will be transparently preserved and automatically migrated to the faster IndexedDB layer with localStorage fallback.
> - **No Breaking Changes to Templates**: All 13 existing visual templates (`first_principles`, `cause_effect`, `analogy_matrix`, `memory_palace`, etc.) will continue to work identically, but will now be managed by the new declarative registry.

---

## 2. Proposed Architecture & Changes

```mermaid
graph TD
    subgraph UI Layer ["🎨 Shared Design System (components/ui/)"]
        Button[Button]
        Badge[Badge]
        Card[Card & CardHeader/Content]
        Modal[Modal base & Backdrop]
        Input[Input & Textarea]
        Slider[Slider]
        Tooltip[Tooltip]
    end

    subgraph Template Engine ["🧩 Scalable Template Registry (lib/templates/)"]
        Registry[Template Registry]
        Meta[Template Metadata & Cognitive Frameworks]
        StageRenderer[StageVisualRenderer Dynamic Dispatch]
    end

    subgraph Performance & Storage Layer ["⚡ Heavy Session Engine (lib/storage/ & lib/services/)"]
        IDB[IndexedDB Storage Engine]
        Cache[In-Memory LRU Cache]
        Fallback[LocalStorage Fallback]
        AnalyticsCache[Memoized Session Analytics]
    end

    UI Layer --> Modals[Modals & Workouts]
    Template Engine --> StageRenderer
    Performance & Storage Layer --> AnalyticsDashboard[Analytics & History]
```

---

## Proposed Changes

### Component 1: Shared Design System (`components/ui/`)

Create reusable, accessible UI primitives styled with the application's dark slate & indigo palette (`#07080D`, `#0F111A`, `#131622`, `border-slate-800`, `text-slate-100`):

#### [NEW] [`components/ui/Button.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Button.tsx)
- Standardized variants: `primary` (indigo), `secondary` (slate), `emerald` (success), `danger` (rose), `outline`, `ghost`.
- Sizes: `sm`, `md`, `lg`.
- Built-in loading spinner (`Loader2`), icon slots, disabled state, and focus visible rings.

#### [NEW] [`components/ui/Badge.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Badge.tsx)
- Color variants: `indigo`, `emerald`, `amber`, `violet`, `rose`, `slate`.
- Dot indicator option and icon badge support.

#### [NEW] [`components/ui/Card.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Card.tsx)
- Glassmorphic card primitives with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter`.

#### [NEW] [`components/ui/Modal.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Modal.tsx)
- Shared accessible modal with focus trap, backdrop blur, `Escape` key close handler, and `motion/react` spring transition animations.

#### [NEW] [`components/ui/Input.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Input.tsx) & [`components/ui/Textarea.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Textarea.tsx)
- Inputs with labels, error states, prefix/suffix icons, character counters, and consistent focus styles.

#### [NEW] [`components/ui/Slider.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Slider.tsx)
- Smooth slider with tooltip value display and accent track fill.

#### [NEW] [`components/ui/Tooltip.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ui/Tooltip.tsx)
- Hover and focus tooltip for scientific explanations and cognitive theory badges.

#### [MODIFY] Modals Refactor
- Update [`PreSessionConfidenceModal.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/PreSessionConfidenceModal.tsx), [`ReadinessModal.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/ReadinessModal.tsx), [`EndSessionReviewModal.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/EndSessionReviewModal.tsx), and [`AnalyticsDashboard.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/AnalyticsDashboard.tsx) to use the new UI primitives for consistent design.

---

### Component 2: Scalable Template Registry (`lib/templates/`)

#### [NEW] [`lib/templates/registry.ts`](file:///c:/Users/vinso/Documents/Encode-main/lib/templates/registry.ts)
- Defines the `TemplateDefinition` interface:
  ```ts
  export interface TemplateDefinition {
    id: VisualTemplateType;
    title: string;
    category: 'conceptual' | 'memorization' | 'hybrid';
    cognitiveFramework: string; // e.g. "Gentner Structure Mapping (1983)"
    description: string;
    icon: string;
    accentColor: string;
    systemPromptDirective: string;
    component: React.ComponentType<any>;
  }
  ```
- Registers all 13+ templates in a single declarative registry map.
- Exposes query utilities:
  - `getTemplateDefinition(id)`
  - `getTemplatesByCategory(category)`
  - `getAllTemplates()`
  - `registerTemplate(definition)` — enables 1-step addition of future templates without modifying switch statements.

#### [MODIFY] [`components/stage-templates/StageVisualRenderer.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/stage-templates/StageVisualRenderer.tsx)
- Replaces the 150-line manual `if/else` dispatch tree with dynamic lookup from the template registry, complete with fallback rendering and error boundaries.

---

### Component 3: Heavy Session Performance Engine

#### [NEW] [`lib/storage/indexedDB.ts`](file:///c:/Users/vinso/Documents/Encode-main/lib/storage/indexedDB.ts)
- Lightweight IndexedDB promise-based key-value store.
- Handles multi-megabyte session histories, rich SVG schema nodes, and audio blobs without blocking the UI thread.
- Automatically falls back to `localStorage` in private browsing or unsupported environments.

#### [MODIFY] [`lib/storage.ts`](file:///c:/Users/vinso/Documents/Encode-main/lib/storage.ts)
- Integrates asynchronous writes with in-memory caching for synchronous read speed.
- Debounces autosaves so typing in stage fields does not freeze animations.

#### [MODIFY] [`lib/services/sessionAnalytics.ts`](file:///c:/Users/vinso/Documents/Encode-main/lib/services/sessionAnalytics.ts)
- Implements memoization for session stats calculation: computes once per session and caches results in memory.
- Adds pagination and slicing helpers for large histories.

#### [MODIFY] [`components/AnalyticsDashboard.tsx`](file:///c:/Users/vinso/Documents/Encode-main/components/AnalyticsDashboard.tsx)
- Adds tabbed/paginated session log viewing with search filter to ensure 60fps rendering even with 100+ recorded learning workouts.

---

## Verification Plan

### Automated Tests & Builds
- Run `npm run build` to verify full compilation, zero TypeScript errors, and complete static page generation.

### Manual Verification
1. **Design System**: Check modal animations, button states, focus rings, and dark glassmorphic styling across all modals.
2. **Template Registry**: Run workouts across both conceptual (First Principles, Analogy Matrix) and memorization templates (Memory Palace, Chunking, Contrast Grid) to verify dynamic registry rendering.
3. **Performance**: Generate and save schemas to confirm IndexedDB storage and seamless instant loading of the Analytics Dashboard.
