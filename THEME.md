# Ink & Terminal Theme

A refined developer-focused theme with high contrast and elegant typography. Designed for clarity and readability in both light and dark modes.

## Design Philosophy

The **Ink & Terminal** theme embodies refined minimalism:

- **High Contrast**: Deep blacks on pure white (light mode) / Bright text on deep backgrounds (dark mode)
- **Professional Polish**: Clean, modern aesthetic with consistent design language
- **Developer Experience**: Optimized for long coding sessions with comfortable reading
- **Accessibility First**: WCAG AA compliant with proper focus states

## What Makes It Unique

1. **Slate-based palette** - Professional gray tones that work across contexts
2. **Indigo accent** - Rich, distinctive primary color that stands out
3. **High contrast ratios** - Text that's always readable
4. **Consistent spacing** - 8px base radius throughout
5. **Smooth transitions** - 150ms for responsive feel
6. **Focus ring with offset** - Clear keyboard navigation

## Color Palette

### Light Mode

| Semantic | HSL Value | Usage |
|----------|-----------|-------|
| `background` | `0 0% 100%` | Primary background - Pure white |
| `foreground` | `222 47% 11%` | Primary text - Deep slate |
| `card` | `210 40% 98%` | Card background - slate-50 |
| `primary` | `239 84% 67%` | Primary action - Indigo |
| `secondary` | `210 40% 96%` | Secondary background - slate-100 |
| `muted` | `210 40% 96%` | Muted background |
| `muted-foreground` | `215 16% 47%` | Muted text - slate-500 |
| `border` | `214 32% 91%` | Border color - slate-200 |
| `ring` | `239 84% 67%` | Focus ring - Indigo |

### Dark Mode

| Semantic | HSL Value | Usage |
|----------|-----------|-------|
| `background` | `222 47% 11%` | Primary background - slate-900 |
| `foreground` | `210 40% 98%` | Primary text - slate-50 |
| `card` | `217 33% 17%` | Card background - slate-800 |
| `primary` | `239 84% 67%` | Primary action - Indigo |
| `secondary` | `215 25% 27%` | Secondary background - slate-600 |
| `muted` | `215 25% 27%` | Muted background |
| `muted-foreground` | `215 20% 65%` | Muted text - slate-400 |
| `border` | `215 20% 27%` | Border color - slate-700 |
| `ring` | `239 84% 67%` | Focus ring - Indigo |

## Typography

### Font Families

- **Sans**: DM Sans - Modern, clean, highly readable
- **Mono**: JetBrains Mono - Perfect for code and technical content

### Type Scale

| Element | Size | Weight |
|---------|------|--------|
| h1 | 3xl | Semibold |
| h2 | 2xl | Semibold |
| h3 | xl | Semibold |
| h4 | lg | Semibold |
| h5 | base | Semibold |
| h6 | sm | Semibold |
| Body | base | Normal |
| Small | sm | Normal |

## Spacing & Radius

- **Border Radius**: `0.625rem` (10px) - consistent throughout
- **Radius variations**:
  - `lg`: `0.625rem` (10px)
  - `md`: `calc(0.625rem - 2px)` (8px)
  - `sm`: `calc(0.625rem - 4px)` (6px)

## Shadows

### Light Mode

| Name | Value |
|------|-------|
| `soft` | `0 2px 8px -2px rgb(0 0 0 / 0.08)` |
| `soft-md` | `0 4px 12px -2px rgb(0 0 0 / 0.1)` |
| `soft-lg` | `0 8px 24px -4px rgb(0 0 0 / 0.12)` |

### Component Usage

Use standard Tailwind slate colors directly:
- `text-slate-900`, `bg-slate-50`, `border-slate-200` (light mode)
- `text-slate-100`, `bg-slate-800`, `border-slate-700` (dark mode)

## Files Modified

1. `/packages/client/assets/css.css` - CSS variables and utility classes
2. `/packages/client/tailwind.config.js` - Tailwind configuration
3. `/packages/client/app.config.ts` - Nuxt UI theme configuration
4. All component files updated to use standard slate colors

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS Custom Properties (variables)
- CSS Grid and Flexbox
- `@layer` for CSS organization

---

**Theme**: Ink & Terminal
**Philosophy**: High Contrast Developer Experience
**Colors**: Slate grays + Indigo accent
**Vibe**: Professional, clean, readable, modern
**Perfect for**: Developer tools, dashboards, professional applications
