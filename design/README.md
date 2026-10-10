# Contribo design

This folder holds the approved designs for the Contribo web app. Use it as the reference when restyling the app.

## What's here

| File | Page in the app |
| --- | --- |
| `screens/landing.html` | `/` (landing page) |
| `screens/projects.html` | `/projects` (explore projects) |
| `screens/founder.html` | `/founder` (your projects + create a project) |
| `screens/founder-project.html` | `/founder/[id]` (manage project) |
| `screens/dashboard.html` | `/dashboard` (contributor dashboard) |
| `style-reference.md` | The design system: colors, type, spacing, radii, components, do's and don'ts |

The screens are design mockups, not production code. Their markup uses a design-tool format (`<x-dc>`, `<sc-for>`, `{{holes}}`), so read them for layout, spacing, colors and copy rather than copying the markup. The sample data in them (project names, amounts, wallets, usernames) is placeholder content.

## Build brief for Claude Code

Restyle the existing Next.js app to match these designs. Keep all existing data loading, server actions, auth, wallet and contract logic exactly as it is. Only the look changes.

1. **Tokens.** Replace the design tokens in `src/app/globals.css` with the ones in `style-reference.md` (Quick Start section): Ink `#06040e`, Deep Teal `#10242f`, Graphite `#452623`, Fog `#f5f5f5`, Paper `#ffffff`, Mist `#e1edf2`, Terracotta `#e39a4d`, Lavender `#cbb0eb`, Plum `#1f1738`, Sky `#a5c8d8`, Cream `#f6ddc4`. Keep the existing semantic utility names (`bg-surface`, `text-muted`, `border-line`, `bg-accent`, …) and point them at the new values.
2. **Font.** Use Manrope (weights 400, 500, 700) via `next/font/google` for everything, in place of Geist and Sora.
3. **Components** in `src/components/ui/`:
   - Button: primary = Ink fill, white text, 8px radius, 16px/24px padding. Secondary = transparent with a 2px border in a product color and text in its dark pair. Ghost = text only with a trailing `→`.
   - Card: white, 24px radius, no shadow, 36px padding. Feature cards: 56px radius, filled with Sky, Terracotta or Lavender.
   - Badge: 16px radius, 6–8px by 12–16px padding, 12px weight 500. Background is Mist or a product tint.
   - Inputs: Fog background, 1px Mist border, 8px radius, 48px tall.
   - Eyebrow label: 11px, weight 500, uppercase, 0.1em letter spacing.
4. **Color meaning.** Sky = projects and repositories, Terracotta = bounties, Lavender = contributor pools, rewards and claims, Plum = onchain panels. Contribution stage badges:
   - Submitted: Fog
   - Verified: Mist
   - Accepted: Sky
   - Approved onchain: Lavender
   - Paid: Ink with white text
   - Rejected: Cream
5. **No shadows, no gradients, no glow.** Elevation comes from color fills and radius only.
6. **Pages.** Match each screen's section order, headings, copy and layout. On the landing page, the floating blob shapes appear only in the hero corners and are optional.
7. **Responsive.** Grids collapse to one column on phones. Side menus stack above content. Page side padding is 16px on phones and 40px on desktop. Max content width is 1200px.
