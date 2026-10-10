# Type and spacing scale

## Screen roles

The shared root layer contains eight rem-based type roles: caption, label,
secondary, body, section, score, title and display. Their regular 16px-root sizes
are 11, 12, 14, 16, 18, 20, 24 and 32px. A shared 11px minimum floor prevents a
smaller browser/system default from making captions unreadable. Body/input text
has a 16px floor to avoid tiny editable controls. At larger root sizes the rem
portion grows normally.

Weights are regular 400, medium 500, semibold 600 and strong 700. Screen labels
no longer use excessive 800-950 weights or blanket uppercase transformations.
User-entered names and meaningful acronyms are preserved. Leading uses heading,
control and body roles.

Spacing uses fixed logical steps of 1, 2, 4, 8, 12, 16, 24, 32, 48 and 64px.
Keeping gutters/padding fixed lets enlarged text use the reading area instead of
enlarging every nested inset. Structural geometry such as borders, measured chrome
height, safe areas, table scroll widths and radii is outside this token conversion.

Score/putt choices, score actions, readbacks, preference segments and library
identities reflow intrinsically when the text needs more room. The controller,
input IDs, events and saved-state shape remain unchanged.

## Device text and charts

Touch WebKit opts into `font: -apple-system-body` on the root while desktop/other
browsers retain their normal root preference. The previous 100% text-size-adjust
lock is removed. WebKit documents these system font shorthands as its Dynamic Type
mechanism: https://webkit.org/blog/3709/using-the-system-font-in-web-content/.

`app-presentation.js` observes only SVG viewport geometry and applies an inverse
viewBox scale to annotation fonts. This prevents an 11px logical SVG label from
becoming a 5px label on a phone. It does not read or change scores, chart values,
records, or storage. Detached SVGs are unobserved. The chart view renderer reserves
more annotation space and reduces crowded label frequency as text grows, using
the captured presentation model. Every point and its accessible title remain;
the scoring scale and values stay unchanged. Printing uses the original geometry.

Browser tests exercise 16/24/32px roots, a smaller root with minimum floors, both
scoring controllers in a reduced keyboard viewport, and 320/430/1280px widths.
This demonstrates CSS scaling and reflow, not physical iPhone acceptance. Before
approval, verify iOS Larger Text at default and accessibility sizes, both scoring
modes with the keyboard open, portrait/landscape and light/dark appearance.

## Paper and drift prevention

`app-print.css` is a print-only projection of the committed pre-scale typography,
spacing and complete print cascade. Its font root is fixed at 16px. The checked
identity protects it against accidental edits; exact browser comparison against
the frozen original stylesheet verifies rendered print metrics and pixels.
Ledger Entry and generated report-window styles are independent and unchanged.

The former 197 exact px font-size exceptions shrink to four existing print-only
exceptions in `style.css`. No screen exceptions remain. The guard rejects new
literal screen sizes, undefined type/spacing roles and local token overrides.
The reviewed role registry remains explicit. The original light color baseline,
color registry and dark palette remain frozen; typography deliberately changes
screen geometry, while color and paper checks continue.
