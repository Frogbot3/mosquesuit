# Foundation design system

Design reference: `design/foundation-reference.png` (generated with the built-in image-generation tool; reference only, never displayed as app UI). The original brief is retained in `design/concept-prompt.txt`. No raster asset is required by the runtime.

## Tokens and components

- Light background `#f3f5f7`, true-white surfaces, text `#142631`, muted text `#5a687a`, borders `#dce2e8`.
- Forest green action `#0d513e`, pale green selected state `#e4f3eb`; amber foundation notice with explicit text.
- Segoe UI for Windows chrome; bundled Noto Sans Malayalam for Malayalam. Body 15–16px, headings 21px and 28–40px; 44px primary controls. Focus outline 3px.
- 7–8px surface/control radii, 20–30px gutters. No gradients, charts or decoration implying real activity.
- Outline Lucide icons. Consistent button, navigation, field, status, panel, table, notification and modal primitives.
- Sidebar / breadcrumb / notice / page heading / metrics / ward list + setup panel / milestone strip. Settings extend the same panel/field system.
- Native accessible modal dialogs trap focus and default to the cancel action. Feedback is announced with status/alert roles. Prefer-reduced-motion is respected.

## Deliberate differences from the concept

The actual implementation lists Marriage, Divorce and Death separately, and labels Audit History exactly as requested. The original concept grouped registries and called the last item Activity. The longer sidebar scrolls independently to retain readable controls. Planned entries are non-interactive and labelled as planned. The header uses the Lucide building icon family; no custom organizational logo has been invented. The production UI does not contain fabricated family/collection counts. The application’s Windows title bar is provided by Electron.

The desktop implementation follows the concept’s light palette, structure, typography hierarchy, container model, green actions and ward-row treatment. Compact layouts stack panels; the supported desktop minimum remains 980×700. Additional responsive CSS is useful for rendering QA, not a claim of a shipped mobile product.

## Visual verification

The built-in concept and actual Electron screenshots were inspected with `view_image`. The reference viewport was checked at 1536×1024 CSS pixels (screenshots use CSS scale to avoid Windows 125% display scaling), plus 1000×720 and an emulated 390×844 compact viewport. Light and dark themes were inspected. Playwright's Electron driver was used because this product needs its native preload/SQLite bridge; the Browser plugin/skill is not installed in this session.

| Comparison | Result / intentional change |
| --- | --- |
| Page structure and reading order | Sidebar, notice, heading, metrics, ward/setup columns and roadmap preserved. |
| Palette / surface treatment | White surfaces on cool gray; green actions; subtle borders; no added gradients or illustration. |
| Typography and controls | Segoe UI/local Malayalam font; hierarchy preserved with more compact heading/chrome for the longer requested navigation. |
| Ward-row treatment | Four real database rows, bilingual names, code tiles and textual active status match the reference. |
| Icons | Consistent outline Lucide family. Building icon intentionally replaces the illustrative mosque mark. |
| Copy | Main heading, actions, metrics and setup copy preserved. Separate event registries and “Audit History” follow the user's explicit navigation. “Planned” added to clarify disabled modules. |
| Contrast | Automated scan found two roadmap number labels below contrast threshold; changed to stronger text color, then scans passed. |
| Responsive behavior | Columns stack in compact layout; no horizontal document overflow. Desktop sidebar scroll preserves all navigation. |

No unresolved clipping/overflow was observed in the inspected dashboard states. This is a faithful implementation of the reference's structure and visual system with the explicit navigation/icon/density adjustments above, not a pixel-identical reproduction. Manual Malayalam proofreading, screen-reader testing and actual printed output remain future gates.
