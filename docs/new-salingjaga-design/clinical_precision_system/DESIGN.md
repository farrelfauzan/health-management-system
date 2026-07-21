---
name: Clinical Precision System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424656'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#727687'
  outline-variant: '#c2c6d8'
  surface-tint: '#0054d6'
  primary: '#0050cb'
  on-primary: '#ffffff'
  primary-container: '#0066ff'
  on-primary-container: '#f8f7ff'
  inverse-primary: '#b3c5ff'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#a33200'
  on-tertiary: '#ffffff'
  tertiary-container: '#cc4204'
  on-tertiary-container: '#fff6f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#001849'
  on-primary-fixed-variant: '#003fa4'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832600'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h1-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  h2:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  h3:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.2'
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  mono:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1440px
  gutter: 20px
---

## Brand & Style

This design system is engineered for high-stakes healthcare environments where clarity, speed of intent, and trust are paramount. The brand personality is **clinical, precise, and unobtrusive**, drawing inspiration from modern developer tools (Linear/Vercel) to bring a high-performance "Pro" aesthetic to medical software.

The design style is **Modern Enterprise Minimalism**. It prioritizes high information density without sacrificing readability. Visual interest is generated through perfect alignment, subtle micro-interactions, and a sophisticated use of "ink" levels rather than heavy decorative elements. The emotional response should be one of calm control and professional reliability.

## Colors

The palette is rooted in "Medical Blue" to establish immediate industry authority. 

- **Primary (#0066FF):** Used for primary actions and active states. It is a high-vibrancy blue that ensures accessibility.
- **Secondary (#0D9488):** A calming teal used for secondary data visualizations or health-status indicators.
- **Semantic Palette:** Success (Emerald), Warning (Amber), and Danger (Rose) follow standard health software conventions but are tuned for high legibility against white backgrounds.
- **Neutrals:** A slate-leaning gray scale is used to define the UI structure. `Slate-50` for background fills, `Slate-200` for borders, and `Slate-900` for primary text.

## Typography

The system uses a dual-font approach. **Geist** is utilized for headlines, labels, and technical data to provide a sharp, modern, and engineered feel. **Inter** is used for all body text and patient notes to ensure maximum readability during long-form consumption.

Standardize on `body-md` (14px) for the majority of the application interface to achieve the desired high-density "SaaS" look. Use `mono` for patient IDs, lab results, and numerical values to ensure character alignment in tabular data.

## Layout & Spacing

This design system employs a **12-column fluid grid** with a maximum container width of 1440px for desktop. 

- **Density:** We utilize a 4px baseline grid. 
- **Margins:** Desktop views should use 32px side margins; mobile scales down to 16px.
- **Sidebars:** Use a fixed-width left navigation (240px) to maintain consistent spatial mental models for clinicians.
- **Table Layouts:** Tables should use "Compact" (32px row height) or "Default" (48px row height) settings depending on the data volume.

## Elevation & Depth

Depth is communicated through **Tonal Layering** and **Micro-Shadows**. 

1.  **Level 0 (Background):** Base surface is `Slate-50` or pure white.
2.  **Level 1 (Cards/Containers):** Pure white surface with a 1px border of `Slate-200`.
3.  **Level 2 (Modals/Popovers):** Pure white surface with a soft, diffused shadow (`0 10px 15px -3px rgba(0,0,0,0.1)`) and a slightly darker border.

Avoid heavy blurs or colorful glows. Depth should feel physical and architectural, like layers of paper or medical charts stacked neatly.

## Shapes

The shape language is **Rounded**, utilizing an 8px (0.5rem) base radius. This strikes the balance between the clinical "sharpness" of the software and the "softness" required for a patient-centric healthcare tool.

- **Small Components (Buttons, Inputs):** 8px radius.
- **Large Components (Cards, Modals):** 12px (rounded-lg) to 16px (rounded-xl) radius.
- **Status Badges:** Fully pill-shaped for immediate distinction from interactive buttons.

## Components

### Buttons
- **Primary:** Solid Medical Blue, white text. No gradient. 8px radius.
- **Secondary:** Ghost style. `Slate-200` border, `Slate-900` text. White fill.
- **Danger:** Solid Rose background for destructive actions (e.g., deleting a patient record).

### Inputs
- **Text Fields:** 1px `Slate-200` border. On focus: 1px `Medical Blue` border with a 2px soft blue outer glow (ring).
- **Labels:** Always Geist Medium, 12px, `Slate-700`, positioned above the field.

### Enterprise Tables
- **Header:** `Slate-50` background, uppercase 12px Geist labels, sticky position.
- **Rows:** 1px bottom border only (`Slate-100`). Hover state: `Slate-50` subtle background shift.
- **Cells:** Use Inter for text data; Geist Mono for numerical/ID data.

### Status Badges
- **Style:** Light tinted background (10% opacity of the semantic color) with high-contrast text.
- **Shape:** Pill-shaped (rounded-full) to differentiate from buttons.

### Modals
- Centered on screen with a `Slate-900/40` backdrop blur.
- Header includes a clear title and a "Close" icon button in the top right.
- Footer is right-aligned for primary/secondary action buttons.