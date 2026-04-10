# Design System Specification: The Blueprint Ledger
 
## 1. Overview & Creative North Star: The Blueprint Ledger
The "Architectural Compiler" aesthetic demands a rejection of the soft, bubbly "SaaS-standard" look. Our Creative North Star, **The Blueprint Ledger**, treats the interface not as a collection of widgets, but as a high-precision technical document. It combines the rigorous logic of a code compiler with the spatial elegance of an architectural floor plan.
 
By utilizing sharp 0px edges, high-contrast typography, and a "tonal layering" approach, we create an environment that feels authoritative and hyper-functional. We break the template look through intentional asymmetry—placing technical metadata in unexpected gutters and using vertical whitespace as a structural element rather than a mere gap.
 
## 2. Colors: Tonal Precision
This system relies on a sophisticated light-mode palette where hierarchy is communicated through subtle shifts in temperature and luminosity rather than decorative elements.
 
### The "No-Line" Rule
Standard UI relies on 1px borders to separate content. In this system, **solid borders for sectioning are prohibited.** Boundaries must be defined through:
- **Background Shifts:** Placing a `surface-container-low` (#f0f4f8) element against a `surface` (#f7f9fc) background.
- **Tonal Transitions:** Using `surface-container-highest` (#d9e4ec) to anchor sidebars or tool-strips against the main canvas.
 
### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, precision-cut sheets.
- **Base Layer:** `surface` (#f7f9fc) for the main application background.
- **Nesting:** Place `surface-container-lowest` (#ffffff) cards on top of `surface-container` (#e8eff4) zones to create a "pop" of high-contrast clarity.
- **Logic Blocks:** Use `secondary-container` (#e1e2e8) for non-interactive technical blocks (like code snippets or read-only metadata).
 
### Signature Textures & Accents
- **The "Glass & Gradient" Rule:** Floating panels (like command palettes) should use `surface-container-lowest` at 85% opacity with a 20px backdrop-blur. 
- **Accent Logic:** Use `primary` (#0061a4) and `primary-fixed` (#d1e4ff) exclusively for "actionable intent." A subtle linear gradient from `primary` to `primary_dim` (#005590) can be applied to large CTAs to provide a "machined metal" finish.
 
## 3. Typography: The Technical Serif
We use **Inter** as our sole typeface, leaning on its high x-height and tabular numbers to reinforce the compiler aesthetic.
 
- **Display & Headlines:** Use `display-md` (2.75rem) for high-impact entry points. These should be set with tight letter-spacing (-0.02em) to feel "heavy" and intentional.
- **The Metadata Layer:** `label-sm` (0.6875rem) and `label-md` (0.75rem) are the workhorses of this system. Use them for line numbers, file paths, and compiler status.
- **The Body:** `body-md` (0.875rem) provides a comfortable reading density for long-form markdown text, ensuring high contrast using `on-surface` (#29343a).
 
## 4. Elevation & Depth: Tonal Layering
In a 0px radius world, shadows must be handled with extreme restraint to avoid looking like 90s brutalism.
 
- **The Layering Principle:** Depth is "found," not "made." An active state is not a shadow; it is a shift from `surface-container-low` to `surface-container-highest`.
- **Ambient Shadows:** For floating menus, use a dual-shadow approach:
    - Shadow 1: `0px 4px 20px rgba(41, 52, 58, 0.04)` (The "Atmosphere")
    - Shadow 2: `0px 2px 4px rgba(41, 52, 58, 0.08)` (The "Contact")
- **The Ghost Border:** For accessibility in input fields, use `outline-variant` (#a8b3bb) at 30% opacity. This creates a "suggestion" of a boundary without cluttering the architectural grid.
 
## 5. Components
 
### Buttons
- **Primary:** Solid `primary` (#0061a4) with `on-primary` (#f5f7ff) text. 0px radius. 
- **Secondary:** `secondary-container` (#e1e2e8) background. No border.
- **Tertiary:** Text-only using `primary` color. Interaction state is indicated by a background shift to `surface-container-high` (#e1e9f0).
 
### Input Fields & Editor
- **Styling:** No bottom line or full box. Use a subtle background fill of `surface-container-low` (#f0f4f8). 
- **Active State:** On focus, the background shifts to `surface-container-highest` (#d9e4ec) and a 2px `primary` vertical "indicator bar" appears on the left edge.
 
### Cards & Lists
- **Rule:** Absolute prohibition of divider lines.
- **Separation:** Use `body-sm` (0.75rem) vertical spacing (e.g., 16px or 24px) or a background stagger (alternating between `surface` and `surface-container-low`).
 
### Technical Overlays (Breadcrumbs & Status)
- Use `tertiary-container` (#dbdefe) for non-critical status indicators (e.g., "Line 42, Col 12").
- Use `error` (#9f403d) and `on-error-container` (#752121) for syntax warnings, but keep them contained within sharp-edged boxes.
 
## 6. Do’s and Don’ts
 
### Do:
- **Do** lean into asymmetry. Align text to a rigorous grid, but let some elements (like timestamps) hang in the margins.
- **Do** use `primary` (#0061a4) sparingly. It is a "laser pointer," not a bucket of paint.
- **Do** ensure all elements have 0px roundedness.
 
### Don’t:
- **Don't** use 1px solid black or high-contrast borders. It breaks the "Architectural" flow.
- **Don't** use standard "drop shadows" on cards. Use tonal shifts.
- **Don't** use icons without accompanying text labels unless they are globally understood (e.g., Save, Close). This system values semantic clarity over minimalism.
- **Don't** use "Soft" colors. If a color isn't in the spec, it shouldn't be in the UI. Stick to the crisp technical grays and the precision blue.