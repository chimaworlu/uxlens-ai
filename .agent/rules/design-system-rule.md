---
trigger: glob
---

# Design System Rules

Source of truth for every token in this file: the exported CSS custom properties (`:root` block). This file governs how those tokens are used in code — it does not redefine, rename, or reinterpret them.

## The one rule the source file already states twice

- **Primitive tokens (`--primitives-*`) are never applied directly to a UI component.** Not in a `style` attribute, not in a Tailwind config extension, not "just this once" for a hex value that looks close enough. Every color that reaches a component comes from a `--color-roles-*` token. If you catch yourself typing `var(--primitives-primary-color-palette-primary50)` inside a component file, stop — you're looking for the `--color-roles-*` token that wraps it.
- **Never hardcode a hex value** (`#3457d5`, `#2d2d2d`, etc.) anywhere in component code, even one copy-pasted from this file "to save a lookup." Every color is a `var(--color-roles-*)` reference. A hardcoded hex is invisible to future retheming and is the single most common way a design system silently rots.

## Color roles: pairing discipline

- `on-X` tokens are only ever used as text/icon color on top of `X` or `X-container` from the *same* family. `--color-roles-on-primary` goes on `--color-roles-primary` or is otherwise validated for contrast against it — never on `--color-roles-surface`, never on a different family's container, even if it "looks fine" in one screenshot.
- Families are: `primary`, `secondary`, `tertiary`, `error`, `success`, and the neutral-based `surface` group. Do not mix an `on-X` from one family with a background from another.
- `surface-container-*` (lowest → low → default → high → highest) is an ordered elevation scale, not five interchangeable grays. Use them in their intended order (lowest = most recessed, highest = most elevated) so elevation reads consistently across the product — don't pick whichever one happens to have enough contrast for a given text color.
- `inverse-surface` / `inverse-on-surface` are reserved for components that intentionally flip against the surrounding surface (e.g. a toast, a tooltip, a snackbar) — never used as a general dark-mode substitute, because this token set has no dark theme defined (see "What doesn't exist yet" below).

## Typography: closed scale

- Nine type styles exist: `display-{large,medium,small}`, `headline-{large,medium,small}`, `title-{large,medium,small}`, `body-{large,medium,small}`, `label-{large,medium,small}` (fifteen total, three sizes × five categories). Every piece of text in the product uses one of these fifteen, referenced as a group — font-size, weight, letter-spacing, and line-height for a given style are never mixed with another style's values.
- Never invent an intermediate size ("just a little bigger than body-large") by picking an arbitrary font-size. If nothing in the scale fits, that's a design system gap to raise, not a value to interpolate in code.
- `DM Sans` is the only font family in this system. Never substitute a system font or a fallback as anything other than a true last-resort CSS fallback stack (e.g. `DM Sans, sans-serif`) — never as a primary choice for a new component.
- All fifteen styles currently resolve to `fontweight: 500` or `600` (title-medium only) and `fontstyle: normal`. Don't introduce a bold/italic variant for a style that doesn't define one without checking whether the type scale actually needs a new style added, rather than a one-off override.

## Spacing: closed scale

- Eight spacing values exist (`no-spacing` through `very-large-spacing`, unitless 0–32). Every margin, padding, and gap in the product uses one of these eight — never an arbitrary pixel value ("just 18px here") because it fit a specific layout better.
- If a layout genuinely needs a value between two spacing tokens, that's a signal to reconsider the layout against the scale, not to introduce a ninth value inline.

## Units — stated assumption, not left ambiguous

- **[ASSUMPTION]** Every numeric spacing and typography token (`fontsize`, `lineheight`, `letterspacing`, spacing values) is treated as **px** when applied in CSS. This is inferred from the data itself — e.g. `display-large` has `fontsize: 57` and `lineheight: 85.5`, a 1.5 ratio consistent with px-based line-height authored in a design tool, not a unitless multiplier. If this assumption is wrong, it needs correcting at the token-consumption layer in one place, not per-component.
- Whatever the unit, it is applied **consistently** across every token of the same kind. Never mix `px` for one component's spacing and `rem` for another's using the same token — pick one convention at the CSS-variable-consumption layer (e.g. a single Sass/JS helper that appends the unit) and use it everywhere.

## Border radius: closed scale

- Four border-radius values exist: `small` (8), `medium` (12), `large` (16), `full` (999). Every rounded corner in the product uses one of these four — never an arbitrary pixel value.
- **This file is the authoritative source for these four values, not `design-tokens.tokens.json` / `design-tokens.css`.** Border radius is the one token category the design tool export never included and never will — the only `radius` fields in the JSON are shadow blur radii under `effect."button shadow".{soft,medium,hard}` (4 / 12 / 45), unrelated to corner rounding. This is a deliberate, permanent exception to the "Source of truth ... is the exported CSS custom properties" statement at the top of this file, scoped to border radius only.
- Implemented in `app/design-system.css` as `--ds-radius-small` / `--ds-radius-medium` / `--ds-radius-large` / `--ds-radius-full`, in their own block clearly commented as sourced from this file rather than from `design-tokens.css`. If this scale ever changes, update this file first, then that block to match — never the reverse.

## Status badges: component pattern

- Three live states exist: `processing`, `ready`, `failed`, plus a neutral no-badge / "Not analyzed" state for a project with zero `Analysis` rows (this fourth case is the absence of a status, not a value of the `AnalysisStatus` enum — see the FR-6 correction in the PRD). Every project status badge in the product renders one of these four, never a fifth ad hoc state.
- All three live states use their family's **container** tier, not the base tier — badges are a low-emphasis, filled-tonal component, and the container/on-container pair is the tier this token set defines for exactly that purpose (each family's `X90` background / `X30` text).
- `failed` uses `error container` (`--color-roles-error-container` background, `--color-roles-on-error-container` text).
- `ready` uses `success container` (`--color-roles-success-container` background, `--color-roles-on-success-container` text).
- `processing` uses `secondary container` (`--color-roles-secondary-container` background, `--color-roles-on-secondary-container` text) — confirmed against the approved Insights/Dashboard/Upload/Analysis screens' tan in-progress tone (`#fae9d1` / `#895810`), which resolves exactly to `secondary90` / `secondary30` in `design-tokens.tokens.json`. This is the token pairing to reference in code — never the literal hex, per this file's hardcoded-hex rule above.
- The neutral "Not analyzed" state uses the `surface` group (a `surface-container` background with `on-surface-variant` text), consistent with `inverse-surface` being reserved elsewhere and neutrals being the default resting state.

## Effects

- Three shadow levels exist: `soft`, `medium`, `hard`. They map to elevation intent (soft = subtle lift, hard = prominent/floating), not to arbitrary component types. Don't invent a fourth shadow value by tweaking blur/spread inline — if none of the three fit, that's a gap to raise, not a value to hand-roll.

## Standard patterns

- **Focus ring**: every interactive element's visible keyboard focus state is `2px solid var(--color-roles-primary)` with a `2px` offset — no per-component variation. `--color-roles-primary` resolves to `#3457d5`; reference the token, never the hex. Implemented correctly in `auth.module.css`'s `.input:focus` rule.
- **Standard hairline border**: `1px solid var(--color-roles-surface-variant)` — used for card borders, dividers, and input field borders throughout the product, never a one-off gray. `--color-roles-surface-variant` resolves to `#e6e6e6`; reference the token, never the hex. Already used correctly for input borders in `auth.module.css`.
- Container/content-width (e.g. a form card's `max-width`) is deliberately **not** part of either pattern above or any closed scale in this file — it stays contextual per screen.

## What doesn't exist yet — don't invent it

- **No dark theme.** There is exactly one set of color-role values in this token file. Do not build a dark-mode variant, a `prefers-color-scheme` branch, or a manual theme toggle unless a second token set is provided — guessing at dark-mode values from the light tokens produces a theme nobody actually designed.
- **No responsive/breakpoint-specific typography or spacing scale.** All fifteen type styles and eight spacing values are the same at every viewport width in this token set. Don't introduce a "mobile display-large" that differs from the defined one without a second token set to back it.
- **No additional color roles beyond what's listed** (primary/secondary/tertiary/surface families, error, success). Don't add a `warning` or `info` role by picking a primitive that "looks about right" — if the product needs one, that's a design system addition to request, not a value to improvise from the primitive palette.

## Content rules

- Marketing and in-product copy must never claim or imply guaranteed accuracy or "zero hallucination." The AI pipeline can still generate an incorrect candidate observation internally — the only claim the product may make is FR-19's actual guarantee: unverifiable insights are dropped by Pass C and never shown, not that the underlying model is infallible. "Every insight is cited" is an accurate claim; "our AI never hallucinates" is not, even as marketing shorthand.

## Changing this file

- This file is generated from a design tool export (the primitive/role naming convention and structure match a Material Design 3–style token pipeline). Never hand-edit a token's value directly in this CSS file to fix a one-off visual issue — that edit will be overwritten the next time the file is regenerated from source, and in the meantime it silently diverges the codebase from the design source of truth. Fix the source (Figma or wherever the tokens are authored) and re-export.