# Screen components

`app-components.css` is loaded with `media="screen"` after the foundation. Shared
controls use a 44px minimum height, 12px corner radius, token-based text/padding
and a visible keyboard focus ring. Cards/list surfaces use 16px corners; overlays
use 20px corners. This layer uses existing color/type/spacing roles and introduces
no raw colors or important declarations. Layout-specific score grids remain intact.

Disabled controls use readable disabled surface/content roles instead of dimming
the entire control. Press/hover feedback is transient; reduced-motion settings
remove transitions. Sheets and modal cards constrain scrolling to their viewport,
with sticky sheet headers and the existing keyboard-offset variable where needed.
The footer uses full-opacity secondary ink, supports enlarged text wrapping and
flows below content so it cannot intercept clicks on bottom actions. Memory Cancel
uses its existing ID/handler in the sticky header for reachability while scrolling.

The former color-refactor pixel tests intentionally isolate the foundation. The
current app is checked by dark contrast, enlarged-text/scoring and component
browser suites. Printed metrics and Ledger Entry reports remain independent.
Real hardware acceptance is still required; reduced viewport tests do not emulate
all Safari keyboard or Dynamic Type behavior.
