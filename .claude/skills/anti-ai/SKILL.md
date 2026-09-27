---
name: anti-ai
description: "Use this skill whenever generating, building, or refactoring UI components, layouts, CSS/Tailwind styles, or product copywriting. Enforces strict anti-AI design patterns by prohibiting overused AI clichés (purple/black themes, Bento grids, glassmorphism, Lucide icons, Inter/Geist fonts, drop shadows, hover animations) and marketing tropes (buzzword trios, aspirational fluff, banned vocabulary) to output clean, utility-first interfaces and direct, grounded copy."
---

# anti-ai

Prevent and eliminate generic "AI-generated" visual slop, overused SaaS clichés, lazy gradients, and repetitive copywriting tropes across all code, styling, and text outputs.

## Workflow & Guidelines

Follow this sequence whenever writing code, constructing templates, or generating interface copy:

### Step 1: Scan & Verify Design Guardrails

Apply strict negative constraints to all visual and layout elements:

1. **Color & Palette:**
   - **Banned:** Purple-and-black dark themes (`bg-slate-950 text-purple-500`), neon accent combinations (cyan/magenta), basic pastel schemes, and multi-color rainbow gradients.
   - **Allowed:** Monochromatic neutrals (pure charcoal, warm slate, rich zinc, deep off-black) or single-accent grounded brand colors (WCAG AA compliant).
2. **Backgrounds & Textures:**
   - **Banned:** Pure white (`#FFFFFF` / `bg-white`), radial glow/orbs (`bg-gradient-to-tr`), dot grid overlays, liquid glass/glassmorphism (`backdrop-blur-xl bg-white/10`), and floating 3D plastic/chrome blobs.
   - **Allowed:** Structured neutral backgrounds (e.g., `#09090B`, `#0F172A`, `#F8FAFC`, `#FAFAFA`). Rely on solid structural boundaries and negative space.
3. **Gradients, Borders & Shadows:**
   - **Banned:** Harsh gradients, drop shadows (`shadow-2xl`, `shadow-indigo-500/50`), colored left border strips (`border-l-4 border-indigo-500`), and soft/generic rounded corner radii (`rounded-xl`, `rounded-2xl`, `rounded-3xl`).
   - **Allowed:** Crisp 1px borders (`border-zinc-800`, `border-zinc-200`) and tight, intentional corner radii (`rounded-sm`, `rounded-md`, or sharp `rounded-none`).
4. **Layout & Grids:**
   - **Banned:** Bento grids, forced 3-feature card side-by-side rows, centered "over-symmetrical" hero sections with two twin buttons and a fake chart underneath, infinite logo marquees ("Trusted by teams at..."), and forced uniform grid padding (`p-6` everywhere).
   - **Allowed:** Asymmetric layouts dictated by content needs. Use list views, dynamic multi-column flows, data tables, or master-detail structures.

### Step 2: Enforce Typography, Icons & Interaction Rules

Check all typographic choices, icon packages, and micro-interactions:

1. **Typography & Fonts:**
   - **Banned:** `Inter`, `Geist`, `Space Grotesk`, `Plus Jakarta Sans`. Do not use em dashes (`—`) in body text or Title Case Every Word In Subtitles.
   - **Allowed:** System font stacks (`font-sans`), editorial typefaces (`Sora`, `Cabinet Grotesk`, `Newsreader`, `IBM Plex Sans`, `Outfit`, `Public Sans`), or monospace defaults (`JetBrains Mono`, `Fira Code`). Use sentence case for subtitles.
2. **Icons & Accents:**
   - **Banned:** Lucide icon sets, sparkle icons (`✨`), animated bouncing/pulsing arrows, checkmark bullet points (`✓` / `bg-green-500`), emojis in headers or copy, pill tags above headlines (`🚀 Introducing v2.0`), and overlapping stacked social-proof user avatars.
   - **Allowed:** Minimalist icon sets (Phosphor, Radix Icons, Heroicons, or custom inline SVGs) and standard typographic bullets (`-`).
3. **UI Dynamics & Loaders:**
   - **Banned:** Hover animations (`hover:-translate-y-1 hover:shadow-lg`), Framer Motion scroll "fade-up" triggers on every card (`opacity: 0, y: 20`), active-state glow rings, 3-tier pricing tables with the middle card scaled up (`scale-105`), fake terminal windows, fake charts (`+127% Growth`), and skeleton shimmer loaders.
   - **Allowed:** Instant, tactile focus/active state transitions (`transition-colors duration-100`, background color shifts), clean textual loading states, minimal line spinners, or immediate optimistic state updates.

### Step 3: Audit Copywriting & Tone

Filter out low-signal AI writing tropes:

1. **Eliminate Oppositional & Aspirational Phrasing:**
   - Never write: *"It's not Y, it's X"*, *"Stop doing Y. Start doing X."*, *"Supercharge your workflow"*, *"Build the future of [X]"*, *"Reimagining [X]"*, *"Your all-in-one platform"*, or *"Powered by AI"*.
2. **Banned Vocabulary Filter:**
   - Never use: `delve`, `unlock`, `seamless`, `leverage`, `elevate`, `robust`, `game-changer`, `empower`, `ecosystem`, `bespoke`, `synergy`, `frictionless`, `paradigm`.
3. **Use Utility-First Copy:**
   - State directly what the software physically does, what data it processes, and how it works using clear, dry, concise language. Avoid rule-of-three adjective strings ("Fast, secure, and seamless").

## Final Pre-Flight Verification

Before completing any task, run through this checklist:
- [ ] Are all banned font imports (`Inter`, `Geist`, `Space Grotesk`) removed?
- [ ] Are all `rounded-xl`, `bg-purple-*`, `shadow-*`, and Lucide icons eliminated?
- [ ] Is the output free of emojis, sparkle icons, pill badges, and glassmorphism filters?
- [ ] Does the copy sound like direct technical documentation rather than marketing fluff?