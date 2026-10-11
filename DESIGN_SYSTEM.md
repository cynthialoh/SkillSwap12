# SkillSwap design system — Phase 0

This design foundation builds on the responsive prototype in `index.html`. The standalone [design-system.html](./design-system.html) page is the visual reference for the tokens, components, states, and core screen map.

## Brand mark

The app uses the generated logo's symbol and wordmark in its header, with the symbol as favicon. The source image is preserved as `skillswap-logo-original.png`; recolored app assets are `skillswap-logo.png`, `skillswap-symbol.png`, and `skillswap-wordmark.png`. The original green is mapped to SkillSwap teal and the original navy to the app's violet accent; transparent backgrounds let the logo sit cleanly on app surfaces.

## Product design principles

- One Member account supports both teaching and learning; the interface uses “I can teach” and “I want to learn” as listing directions, not separate account types.
- Make the next useful action clear while explaining why a match or system state appears.
- Use a bright, welcoming palette with restrained surfaces so skill content stays easy to read.
- Show trust and safety information with labels and context; never rely on a color or score alone.
- Keep Admin tasks operational and visually distinct from Member activity.
- Design from narrow screens upward. At 360px, stack content and keep primary actions available without horizontal page scrolling.

## Tokens and layout

The canonical color, type, radius, and shadow variables live in the `:root` rule in `styles.css`.

| Token group | Foundation |
|---|---|
| Color roles | Teal for primary actions; amber for learning accents; violet for teaching accents; blue for information; green for success; coral red for errors and urgent states. Pale role tints support surfaces and selected states. |
| Typography | Manrope for page and card headings; DM Sans for interface copy, fields, and supporting text. |
| Spacing | 4px base scale with common 8, 12, 16, 24, and 32px steps. |
| Shape | 7–8px controls, 9–12px cards and chips, 14–16px dialogs and hero panels. |
| Elevation | Subtle card shadow; keep most surfaces flat with borders. Reserve stronger elevation for overlays and high-priority surfaces. |
| Responsive layout | Prototype breakpoints at 1050px, 760px, and 390px. Use a single column on small screens; avoid making navigation or key actions desktop-only. |

## Component inventory

The visual reference demonstrates: primary/secondary/quiet/disabled buttons; links; text input, select, checkbox, error and hint; tabs; dialog; toast/status alert; badges; avatars; empty and loading states; pagination; cards; skill chips; profile/match summary; trust label; credit amount; session summary; and Admin report queue row.

The component styling should preserve semantic HTML and use real labels, accessible names, `aria-selected`/`aria-invalid` state, and live status roles where appropriate. The showcase is a visual specification; it does not make the sample controls production interactions.

## Interaction and accessibility rules

- Every control is reachable by keyboard and has a visible focus outline. Focus must remain distinct from hover and selection.
- Use native focus behavior for inputs; associate every field with a label and help/error text. Describe invalid state in text and with `aria-invalid`.
- Dialogs open with focus inside, keep keyboard focus within the modal while open, close on Escape where safe, and return focus to the invoking control.
- Tabs expose the selected tab semantically. Toasts use a status announcement and do not carry the only copy of important information.
- Success, warning, error, and priority states include text or an icon plus color. Status text must remain understandable in monochrome.
- Respect `prefers-reduced-motion`; transitions are brief and never required to understand a state change.
- Target WCAG 2.2 AA contrast and controls with practical touch targets. Review final combinations and keyboard flows before declaring Phase 0 complete.

## Prototype journey audit and screen map

The current prototype has clickable overview, discovery, skills, exchanges, credits, saved items, and an Admin preview. Search/category filtering, sample save/request actions, skill add/remove, exchange tabs, toasts, and the skill dialog demonstrate the main interaction style. Authentication, onboarding, real conversations, privacy settings, scheduling, credit settlement, and secured Admin access remain product journeys to design for the production build; the Admin preview is not authorization.

| Journey | Screen sequence | Key states to design |
|---|---|---|
| Join and setup | Sign up → verify email → profile → teach/learn skills → availability and privacy | Invalid form, verification pending, success, skip/continue |
| Discover and connect | Overview → search/browse → match reason → profile → request → conversation | No results, saved, request sent/declined, private profile, blocked |
| Exchange | Request → agree time → session details/link → completion → review | Pending/accepted, reschedule, cancellation, no-show, dispute |
| Credits | Wallet → purchase/gift/history | Available/held, payment pending/failed, refund, gift accepted |
| Member account | Profile/listings → privacy and visibility → notification preferences | Hidden/searchable, access requested/approved, preference saved |
| Admin operations | Admin home → report/dispute/verification queue → case details → decision → audit history | Priority, unassigned/assigned, evidence access, appeal, restricted action |

## Phase 0 completion checklist

- [x] Audit the existing prototype and record current interactions and production gaps.
- [x] Establish the initial visual tokens and responsive rules in the stylesheet and reference page.
- [x] Inventory and visually demonstrate the component families and important interaction states.
- [x] Map the PRD's Member and Admin journeys.
- [ ] Review the rendered page at 360px and desktop widths, check contrast combinations against WCAG 2.2 AA, and review keyboard behavior before approving this phase.
