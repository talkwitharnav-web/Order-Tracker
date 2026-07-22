# Bistro Glaze Design Specification

Bistro Glaze is this app's warm, restaurant-native interpretation of the ideas behind Apple's Liquid Glass. It is not an attempt to reproduce Apple's private rendering system or shaders. It is a web material system built from standard CSS, the app's existing color tokens, and the app's existing motion language.

This document has two levels. Sections 1-16 describe the product language and rollout in plain terms. Sections 17 onward provide the engineering and research foundation: optics, formulas, texture construction, compositing, motion, accessibility, performance budgets, and test methods.

Research claims are labeled throughout:

- **Physics:** an equation or relationship from optics or mechanics.
- **Standard:** a platform, accessibility, color-science, or rendering convention.
- **Art direction:** a deliberate 2D approximation chosen for this product.

The goal is to make controls and temporary interface layers feel responsive, dimensional, and connected to the content beneath them without turning the whole app into translucent glass.

## 1. Design Intent

Bistro Glaze should feel like:

- Light catching the rim of glazed ceramic.
- A warm cafe window with a little steam on it.
- Terracotta, olive, parchment, and espresso seen through a polished surface.
- A functional layer floating above the restaurant's real work.

It should not feel like:

- Cold blue glass.
- Generic frosted-glass cards.
- A transparent skin applied to every rectangle.
- A copy of an Apple interface.
- An effect that makes kitchen information harder to scan.

The material is based on one product principle already established by the help page: translucency reassures the user that the content underneath still exists. The material should reveal context, not decorate empty space.

## 2. Core Rules

### 2.1 Glaze belongs to the functional layer

Use Bistro Glaze on things that float, appear temporarily, control the page, communicate intent, or remain available while content moves beneath them.

Good examples:

- Settings and navigation controls.
- Toolbars and sticky control bars.
- Notifications.
- Dropdowns, tooltips, and popovers.
- Modal surfaces and backdrops.
- Temporary loading capsules.
- Interactive status controls.

### 2.2 Content remains dependable

Primary content surfaces should normally stay opaque. The user must never depend on the background behind an element to read an order, password field, table row, or QR code.

Do not apply backdrop transparency to:

- Kitchen order cards and rows.
- Customer order-status cards.
- Admin table rows and cells.
- Login, registration, and Kitchen Portal cards.
- Error-reference cards.
- Text inputs and PIN digits.
- The printable customer handoff sign.
- The chef's body or illustration layers.

### 2.3 Tint may communicate meaning

Glaze is not restricted to neutral white or gray. A tinted material can preserve semantic meaning:

- Green or olive for success.
- Orange for warning or pending work.
- Red for errors and destructive actions.
- Terracotta for brand and primary action.
- Parchment or espresso for neutral controls.

Tint never replaces the existing icon and text. Status and severity must continue to be communicated by icon, wording, and color together.

### 2.4 One material body per control group

Related controls share one glazed container. Do not place a separate blurred bubble behind every icon in a toolbar. Nested backdrop blurs are expensive and visually muddy.

Use internal dividers and selected-state fills to distinguish controls within one shared material body.

## 3. Material Variants

Bistro Glaze uses a small closed set of variants. The percentages below are prototype starting points, not permanent values. They must be tuned through live screenshots and final-composite contrast measurements. Section 18 derives the variant ladder from a Beer-Lambert-shaped thickness model, then applies stricter legibility floors where text sits directly on the material.

Blur is selected by elevation, surface size, backdrop detail, and measured browser behavior—not semantic variant alone. The original `8-12px`/`12-18px` ranges below remain prototype research bands; live rollout proved this app needs much lower approved values (`1.5-2px`) to preserve context and avoid over-frosting.

### 3.1 Neutral Glaze

Purpose: general settings, toolbars, tooltips, and small floating controls.

Character:

- Warm surface tint.
- Moderate blur selected by elevation.
- Restrained neutral highlight.
- Clear but not heavy shadow.

Suggested starting formula:

```css
--glaze-source: var(--color-surface-1);
--glaze-accent: var(--color-brand);
--glaze-background: color-mix(
  in oklab,
  var(--glaze-source) 72%,
  color-mix(in oklab, var(--glaze-accent) 8%, transparent)
);
--glaze-blur: var(--glaze-blur-for-elevation);
--glaze-saturation: 135%;
```

### 3.2 Brand Glaze

Purpose: primary floating actions, selected toolbar segments, and emphasized control states.

Character:

- Terracotta tint.
- Higher color presence than Neutral Glaze.
- Strong foreground contrast using `--color-on-brand` where appropriate.

Suggested starting formula:

```css
--glaze-background: color-mix(
  in oklab,
  var(--color-surface-1) 55%,
  var(--color-brand) 28%
);
--glaze-edge-color: color-mix(
  in oklab,
  var(--color-brand) 55%,
  var(--color-border-strong)
);
```

### 3.3 Success Glaze

Purpose: successful notifications and positive confirmations.

Source token: `--color-success`.

The tint must remain visually distinct from the other active semantic variants in every supported theme, contrast mode, and CVD palette. Its meaning remains complete through the success icon and explicit wording; no fixed green or olive hue is required in remapped CVD palettes.

### 3.4 Warning Glaze

Purpose: warning notifications, pending actions, and attention states.

Source token: `--color-warning`.

The tint must remain visually distinct from the other active semantic variants in every supported theme, contrast mode, and CVD palette. Its meaning remains complete through the warning icon and explicit wording; no fixed orange or amber hue is required in remapped CVD palettes.

### 3.5 Danger Glaze

Purpose: error notifications, destructive confirmation surfaces, and failed health states.

Source token: `--color-danger`.

The material can have a stronger border and less transparency than other variants because immediate readability matters more than seeing the content beneath it.

### 3.6 Thick Glaze

Purpose: text-heavy dropdowns, modal panels, and larger sidebars.

Character:

- Mostly opaque.
- Moderate backdrop blur.
- Strong edge separation.
- Suitable for small or muted text.

Thick Glaze is the safe choice whenever underlying content could interfere with reading.

### 3.7 Clear Glaze

Purpose: sparse floating controls over decorative artwork or media.

Character:

- Most transparent variant.
- Stronger blur to separate foreground controls.
- Minimal text.

Clear Glaze must not contain paragraphs, dense settings, table data, status details, or low-contrast muted text. The existing floating search bar on `/help/errors` is the current reference: the bar is translucent, while the actual search input remains opaque.

## 4. Material Anatomy

Each glaze surface is built from independent layers. A surface does not need every layer.

### 4.1 Base tint

A partially transparent theme-aware background establishes the material color. Derive it from existing semantic tokens with `color-mix()`. Do not hardcode a second palette that can drift away from light, dark, high-contrast, or CVD themes.

### 4.2 Backdrop treatment

Use standard CSS only:

```css
backdrop-filter: blur(var(--glaze-blur)) saturate(var(--glaze-saturation));
-webkit-backdrop-filter: blur(var(--glaze-blur)) saturate(var(--glaze-saturation));
```

This is an approximation. It does not provide Apple's dynamic refraction or framebuffer-aware luminosity system.

### 4.3 Edge

Use a thin tint-aware border to keep the material visible against similar backgrounds.

```css
border: 1px solid color-mix(
  in oklab,
  var(--color-border-strong) 70%,
  var(--glaze-accent) 18%
);
```

High Contrast must replace this with the existing strong opaque border behavior.

### 4.4 Top highlight

A subtle inset top highlight suggests light catching a glazed rim.

```css
box-shadow:
  inset 0 1px 0 rgb(255 255 255 / 0.16),
  var(--glaze-shadow);
```

Dark mode needs its own tested highlight strength. A bright white line should not look fluorescent against espresso surfaces.

### 4.5 Shadow

Use a soft warm shadow rather than a cold black halo. The shadow should support elevation without making the material look like a detached marketing card.

### 4.6 Optional sheen

A static, low-opacity diagonal or radial gradient may be used on large or emphasized glaze surfaces. It must not obscure controls and must use `pointer-events: none`.

Pointer-tracked highlights and SVG displacement are explicitly deferred. They are more expensive, create stacking and backdrop-root risks, and are not required to establish the material language.

## 5. Shape Rules

Bistro Glaze reuses the app's existing radius system:

- `--radius-sm`: compact controls and small tooltip surfaces.
- `--radius-md`: menus, popovers, and modal panels.
- `--radius-full`: toolbars, notification capsules, and control pills.

Do not add decorative nested cards. A glazed container is the outer material body for its related controls.

Large surfaces should use concentric geometry: inner selected controls and dividers should feel aligned with the outer radius rather than randomly rounded.

## 6. Motion Rules

Bistro Glaze should feel responsive and slightly playful, not slippery.

### 6.1 Existing motion language

Use the app's established spring-like curve for expressive arrivals:

```css
cubic-bezier(0.34, 1.56, 0.64, 1)
```

Use faster, more direct motion for exits:

```css
cubic-bezier(0.4, 0, 1, 1)
```

The help page's floating search and notification entrance are the reference personality. A cubic Bezier is an authored fixed-duration approximation, not a physical spring; Section 21 defines the equivalent spring target for any future physics-driven implementation.

### 6.2 Do not animate blur continuously

Animate geometry, opacity, tint, and highlight strength. Avoid long animations of `backdrop-filter` itself because blur is expensive to recomposite, especially over scrolling or live-updating content.

### 6.3 Morph by relationship

A control opening a panel should make the panel feel like an extension of the same material:

- The settings square unravels into its toolbar.
- A toolbar popover uses the same tint and edge language as its parent.
- A button opening a confirmation can transfer its semantic tint to the modal.

This is a visual relationship, not a requirement for path-level shape interpolation.

### 6.4 Reduce Motion

Every new keyframe and transition must remain covered by the existing OS-level and in-app Reduce Motion rules. The final state must remain understandable when all movement becomes instant.

## 7. Compact Settings Pill Interaction

The shared settings toolbar starts compact by default.

### Collapsed state

- Shape: `2.5rem` by `2.5rem` rounded square (40 by 40 pixels at Medium UI size), scaling proportionally with the app's Small/Medium/Big root size.
- Position: fixed at the existing top-right anchor.
- Icon: Lucide Settings.
- Accessible name: `Open settings`.
- `aria-expanded="false"`.
- Only the settings trigger is keyboard reachable.

On the kitchen dashboard's mobile layout, the navigation hamburger remains separate and always reachable. Collapsing settings must never hide the kitchen navigation control.

### Expanded state

- The pill grows leftward because its right edge remains fixed.
- Existing controls retain their current order and behavior.
- A right-facing Lucide ChevronRight remains at the far-right edge.
- Accessible name: `Collapse settings`.
- `aria-expanded="true"`.

### Animation

Suggested starting timing:

- Unravel: 450ms with the established spring-like curve.
- Ravel: 260ms with the established direct exit curve.
- Height remains fixed at `2.5rem` (40px at Medium UI size), scaling proportionally with Small and Big UI.
- Width is measured from real contents rather than guessed.
- The expanded pill may overshoot by a few pixels before settling, but controls must not reflow or wrap.

The same physical button remains mounted while its icon changes. This preserves keyboard focus when opening and closing.

Hidden controls remain mounted but `inert` and `aria-hidden` while collapsed. This prevents focus from entering invisible controls without destroying child state.

The pill may clip its contents while width is actively changing, but overflow must return to visible when expanded so tooltips and dropdown panels are not cropped.

## 8. Application Map

### Phase 1: Material foundation and proof surfaces

- **Implemented:** `/help/errors` floating search control — Clear Glaze on a dedicated inset layer; full-width row stays transparent.
- **Implemented:** `SettingsToggles` — Neutral Glaze in compact and expanded states.
- **Implemented:** system-wide toast notifications — Success, Warning, and Danger Glaze.

These three demonstrate clear, neutral, and semantic material variants.

### Phase 2: Attached floating controls

- **Implemented:** Accessibility menu — denser text-safe glaze with working nested-backdrop handling.
- Health details popover.
- Kitchen clock popover.
- Themed tooltips.
- Select menus.
- Restaurant autocomplete.
- Restaurant and status filter panels.
- Admin infinite-scroll loading capsules.

Text-heavy panels use Thick Glaze. Their option rows may use opaque local fills for hover and selection.

### Phase 3: Modals and intent

- Refine the existing modal backdrop.
- Neutral modal: Thick Neutral Glaze.
- Destructive modal: Thick Danger Glaze.
- PIN pad: Thick Brand or Warning Glaze.
- Success confirmation: Thick Success Glaze where appropriate.

Inputs inside modal panels remain opaque.

### Phase 4: Larger navigation surfaces

- Desktop gateway sidebar.
- Desktop kitchen sidebar.
- Kitchen mobile top bar.
- Sticky control headers that remain visible while content scrolls.

These require performance testing because they cover larger screen areas. Dense admin table headers should not receive backdrop blur by default.

### Phase 5: Selective interactive details

- Interactive status-step controls may receive status-tinted glaze during hover, focus, or activation.
- Primary, success, warning, and danger buttons in floating surfaces may receive mostly opaque glaze.
- Chef speech bubble may be explored only after physical-phone testing, with placement and dimensions completely untouched.

## 9. Notifications

Notifications are a first-class Bistro Glaze use case.

Their material is translucent but not faint. The semantic tint must remain obvious regardless of the background.

A toast keeps:

- Its current success, warning, or error icon.
- Its current message.
- Its error-code chip or Undo action.
- Its existing entrance and exit behavior.

The toast gains:

- Semantic translucent tint.
- Backdrop blur.
- Tint-aware border.
- Bright top rim.
- Soft semantic shadow.

Under High Contrast or Reduce Transparency, it falls back to a solid surface with retained semantic icon/wording. This cannot simply mean "the current fill with white text": measured dark-theme contrast against white is only `2.364:1` for success, `2.464:1` for warning, and `3.457:1` for danger. Production now defines `--color-on-success`, `--color-on-warning`, and `--color-on-danger` as theme/CVD-aware foreground tokens.

## 10. Accessibility

### 10.1 Reduce Transparency is independent

Add a new independent preference rather than bundling it into Reduce Motion or High Contrast.

Suggested model:

```text
localStorage key: transparency
html attribute: data-transparency="reduced"
```

The preference must be applied before hydration using the same safe script pattern as theme, contrast, motion, focus, and CVD preferences.

Also honor `prefers-reduced-transparency` where the browser supports it. Do not rely on that media query alone because Safari and Firefox support remains incomplete.

### 10.2 Solid fallback

Under reduced transparency:

- Set `backdrop-filter: none`.
- Use an opaque semantic surface.
- Keep the same border, icon, text, and interaction.
- Do not remove controls or alter layout.

### 10.3 High Contrast

High Contrast forces glaze surfaces opaque or nearly opaque and uses the existing thick-border rules. High Contrast and Reduce Transparency remain independent settings even if both currently result in similar material fallbacks.

### 10.4 Color vision modes

All semantic glaze tints derive from the active semantic tokens. Do not define fixed green, orange, or red values that bypass the CVD palettes.

### 10.5 Keyboard and screen reader behavior

- New reveal controls use native buttons.
- Expanded state is announced with `aria-expanded`.
- Hidden toolbar content is `inert` and `aria-hidden`.
- Focus remains on the same toggle button through ravel and unravel.
- Existing Enhanced Focus styling remains visible over every glaze variant.

## 11. Performance and Browser Constraints

- Prefer one backdrop-filter surface around a group, not one filter per child.
- Avoid glaze on scrolling order rows and table cells.
- Avoid continuous blur animation.
- Test on old or weak kitchen tablets, not only the development PC.
- Provide an opaque fallback with `@supports not (backdrop-filter: blur(1px))`.
- Do not use `will-change` permanently. It can create extra compositor layers and backdrop roots.
- Never add `contain` or `overscroll-behavior` to `html` or `body` as an optimization.

## 12. Stacking and Backdrop Roots

`backdrop-filter` samples only to the nearest backdrop root. Ancestors using opacity, filter, backdrop-filter, masks, clip paths, blend modes, or related `will-change` values can silently change what the glaze sees.

This app has already experienced a related positioning failure: a transformed dashboard ancestor changed the containing block for a fixed modal. Viewport-level overlays should continue using portals to `document.body` where appropriate.

Rules:

- Keep the existing z-index ladder: content, sticky content, floating panels, toolbar, modal/toast.
- Do not solve stacking problems with arbitrary huge z-index values.
- Do not nest multiple active backdrop blurs without testing the combined result.
- Verify computed styles in the real browser bundle, not only source CSS.

## 13. Print Rules

Bistro Glaze must never affect the customer handoff print sign.

Print output must:

- Use an opaque white background.
- Render the QR code without blur or tint.
- Hide floating settings, notifications, backdrops, and popovers.
- Remain readable without screen-only shadows.

## 14. Rollout and Rollback

Implement the material in clearly marked blocks inside the existing `globals.css`. Do not split the stylesheet as part of this work.

Introduce one phase at a time and verify the actual browser CSS bundle after every phase, including the presence and computed behavior of `.chef3d-*`, speech-bubble, notification, and new glaze selectors.

Recommended gate during development:

```text
data-glaze="on"
```

This can allow side-by-side testing and rapid rollback while the design is tuned. The production default should only change after live approval.

Rollback should be possible by removing glaze classes or disabling the gate without reverting unrelated component behavior.

## 15. Acceptance Checklist

For every phase, verify:

- Light and dark themes.
- Small, medium, and Big UI.
- Normal and High Contrast.
- Deuteranopia, protanopia, and tritanopia palettes.
- Reduce Motion.
- Reduce Transparency.
- Keyboard and screen-reader state.
- Desktop, narrow mobile, short viewport, and physical phone.
- Real wheel, pointer, keyboard, and touch input.
- No horizontal overflow.
- No clipping of tooltips or popovers.
- No jank while scrolling beneath glaze.
- Modal behavior from inside transformed dashboard tabs.
- Customer QR print preview.
- 2D and 3D chefs, bubbles, and animations unchanged.
- Browser bundle contains all expected original and glaze CSS selectors.

## 16. Non-Goals for the First Release

The first Bistro Glaze release does not include:

- True optical refraction.
- Shader or canvas rendering.
- Per-pixel framebuffer sampling.
- Pointer-tracked reflections.
- Dynamic per-segment opacity based on arbitrary page content.
- Glaze on every card or table.
- A redesign of the chef.

Those ideas may be prototyped later, but they are not required to establish a coherent, useful material system.

---

## 17. Optical Foundation

The browser cannot reproduce a physical dielectric. Bistro Glaze uses physics to choose believable relationships between body tint, edge light, highlight spread, blur, and shadow. The equations calibrate the art direction; CSS gradients and filters remain approximations.

### 17.1 Baseline dielectric reflectance

**Physics.** At normal incidence, an uncoated dielectric interface reflects approximately:

$$
R_0 = \left(\frac{n_1-n_2}{n_1+n_2}\right)^2
$$

For air, $n_1 \approx 1$. Using ordinary glass as the visual reference, $n_2 \approx 1.5$ gives:

$$
R_0 \approx \left(\frac{1-1.5}{1+1.5}\right)^2 = 0.04
$$

Only about four percent of face-on light is reflected. A screen needs a perceptual gain for that reflection to be visible, but the relationship tells us that the resting face sheen should remain restrained.

**Art direction.** Start with:

```css
--glaze-r0: 0.04;
--glaze-sheen-gain: 3;
--glaze-face-highlight-alpha: 0.12;
```

Treat `0.10-0.16` as the light-theme tuning band. Values much above `0.18` tend to read as plastic film rather than ceramic glaze.

### 17.2 Fresnel edge brightening

**Physics.** Reflection increases sharply toward a grazing angle. Schlick's approximation is:

$$
R(\theta) = R_0 + (1-R_0)(1-\cos\theta)^5
$$

The fifth power creates a steep rise close to the edge. That is why a narrow bright rim reads more convincingly than a wide uniform glow.

CSS has no surface normal or view angle. Bistro Glaze maps grazing angle to distance from the element boundary:

$$
\operatorname{rim}(d) = R_0 + (1-R_0)\left(1-\frac{d}{w}\right)^5,
\qquad 0 \le d \le w
$$

This second equation is **art direction**, not literal optics. It says that most apparent edge energy belongs in the first one or two CSS pixels.

Practical rule:

- Small controls: `1px` rim.
- Medium panels: `1px` rim plus a faint second inset line.
- Large modal or sidebar surfaces: at most `2px` total visible rim.
- Never use a broad white outline as the primary glass cue.

### 17.3 Dielectric highlight color

**Physics.** On a dielectric such as glass, plastic, or a clear ceramic glaze, the surface reflection mostly carries the color of the light source. The material pigment colors the transmitted body beneath it. Metals behave differently and can tint their specular reflection.

This produces a load-bearing Bistro Glaze rule:

> Tint the body; keep the rim and primary sheen near-neutral.

Success, warning, danger, and brand glaze receive semantic color in the body. Their top rim remains warm white or candlelight-neutral. A green rim on a green body reads more like colored plastic than glazed ceramic.

### 17.4 Roughness and highlight spread

**Physics.** Microfacet models describe roughness as variation in tiny surface normals. A smooth surface concentrates reflected energy in a narrow highlight; a rough surface distributes it over a broader, dimmer area.

Bistro Glaze targets glossy ceramic, not mirror glass. Define an artistic gloss parameter:

$$
g \in [0,1], \qquad g_{\text{bistro}} \approx 0.60-0.75
$$

Use `g = 0.68` as the starting point.

One useful authored mapping is:

$$
  ext{sheen spread} = 20\% + 60\%(1-g)
$$

At $g=0.68$, the sheen reaches about `39%` of the surface before fading. This should produce a broad soft reflection rather than a sharp glass sparkle.

### 17.5 Thin-surface transmission

**Physics.** A real thin dielectric has two interfaces. Light repeatedly reflects between them while the remaining energy transmits. PBRT models this with a geometric series and notes that the second interface increases total reflection compared with a single boundary.

Bistro Glaze does not simulate those paths. The practical translation is two restrained reflective cues:

1. A brighter top or key-light rim.
2. A much weaker opposite-edge or lower inset line.

The lower line must remain subtle. Equal bright lines on every edge make the component look embossed rather than translucent.

## 18. Thickness, Opacity, and Tint Model

### 18.1 Beer-Lambert-shaped opacity

**Physics.** Light passing through an absorbing or scattering medium decays exponentially:

$$
T = \frac{I}{I_0} = e^{-\mu d}
$$

Here, $T$ is transmittance, $\mu$ is the extinction coefficient, and $d$ is path length. For the UI model, combine material density and path length into a normalized thickness $t$:

$$
T(t) = e^{-kt}, \qquad \alpha_{\text{optical}}(t)=1-e^{-kt}
$$

Use $k=2.2$ as an **art-direction fit**, not a measured ceramic constant.

| Variant | Thickness $t$ | Optical body alpha $1-e^{-2.2t}$ | Meaning |
| --- | ---: | ---: | --- |
| Clear | `0.15` | `0.28` | Context-first outer shell; no direct small text |
| Neutral | `0.45` | `0.63` | General toolbar or control material |
| Brand | `0.55` | `0.70` | Stronger terracotta presence |
| Success / Warning | `0.55` | `0.70` | Semantic tint starting point |
| Danger | `0.70` | `0.79` | Denser urgent material |
| Thick | `0.90` | `0.86` | Text-heavy panel starting point |

Do not calculate `exp()` in production CSS. Precompute these values as static tokens. The equation documents why the ladder is nonlinear.

### 18.2 Legibility floor

Optical plausibility does not guarantee readable text. Define final material alpha as:

$$
\alpha_{\text{final}} = \max\left(\alpha_{\text{optical}},\alpha_{\text{legibility floor}}\right)
$$

Starting floors:

| Use | Legibility floor | Additional rule |
| --- | ---: | --- |
| Clear outer shell | `0.25-0.35` | Essential text/input uses an opaque local backplate |
| Neutral direct-text control | `0.72` | Must pass final-composite contrast sampling |
| Brand direct-text control | `0.78` | Use paired foreground token |
| Success / Warning toast | `0.92` | Icon and explicit wording required |
| Danger toast / destructive surface | `0.96` | Strong edge and paired foreground required |
| Thick text panel | `0.92-1.00` | Move to `1.00` if any sample fails |

These are release starting points, not guarantees. If the possible backdrop cannot be bounded, use an opaque surface.

### 18.3 Tint saturation follows thickness

Absorption makes a thicker colored medium both less transparent and more visibly tinted. Couple tint strength to the same curve:

$$
  ext{tint fraction}(t)=p_{\max}\left(1-e^{-kt}\right)
$$

For neutral glaze, keep $p_{\max}$ low. Semantic glaze can use a larger $p_{\max}$, but foreground contrast remains the release gate.

### 18.4 Static production ladder

Illustrative tokens for future implementation:

```css
:root {
  --glaze-alpha-clear: 28%;
  --glaze-alpha-neutral: 72%;
  --glaze-alpha-brand: 78%;
  --glaze-alpha-semantic: 92%;
  --glaze-alpha-danger: 96%;
  --glaze-alpha-thick: 92%;
}
```

These belong inside a clearly marked glaze block in the existing `globals.css`, not a separate stylesheet.

## 19. Depth, Blur, and Elevation

### 19.1 Blur as a depth cue

**Art-direction analogy.** More backdrop blur can imply separation between a foreground control and moving content behind it. This is not a depth-of-field simulation and does not establish physical distance. The mapping below is product and performance tuning, not optical calibration.

Use elevation $E$ as a small integer:

- `E=1`: attached toolbar or status control.
- `E=2`: popover, dropdown, tooltip, toast.
- `E=3`: modal or large navigation layer.

An authored mapping is:

$$
b(E,t)=\operatorname{clamp}\left(8,\ 6+5E(0.5+0.5t),\ 28\right)\ \text{px}
$$

Suggested production ranges:

| Surface | Blur range |
| --- | ---: |
| Attached toolbar | `8-12px` |
| Popover / dropdown / toast | `12-18px` |
| Modal / large rail | `16-24px` |
| Hard prototype ceiling | `28px` |

Clear glaze is deliberately unusual: it has low body alpha but can use higher blur because its purpose is to preserve context while separating sparse controls from busy art.

### 19.2 Saturation compensation

Backdrop blur can make warm colors look gray or muddy. Start with:

$$
  ext{saturation} = 120\% + 30\%g
$$

At $g=0.68$, this is about `140%`. Treat `125-145%` as the normal tuning band. Above that, parchment and terracotta can become aggressively orange.

### 19.3 Never animate blur as a normal transition

Static blur is already a rendering cost. Animating blur changes the sampled filter region and can force repeated raster work. Keep blur constant during entrance and exit; animate shell geometry, transform, and opacity instead.

Scroll-edge adaptation may switch between a small set of static classes, but it must not tween blur continuously on every scroll frame.

## 20. Shadow, Rim, and Texture Grammar

### 20.1 Two-light shadow model

**Standard.** Use a tighter directional key shadow and a broader ambient shadow. This communicates elevation better than one generic black blur.

Use explicit elevation tokens rather than multiplying lengths in `calc()`, which is not a dependable production target across this app's browser range:

```css
--glaze-shadow-ink: color-mix(in oklab, #000 82%, var(--color-brand) 18%);

--glaze-shadow-e1:
  0 1px 2px color-mix(in oklab, var(--glaze-shadow-ink) 22%, transparent),
  0 3px 8px -1px color-mix(in oklab, var(--glaze-shadow-ink) 14%, transparent);
--glaze-shadow-e2:
  0 2px 4px color-mix(in oklab, var(--glaze-shadow-ink) 22%, transparent),
  0 6px 16px -2px color-mix(in oklab, var(--glaze-shadow-ink) 14%, transparent);
--glaze-shadow-e3:
  0 3px 6px color-mix(in oklab, var(--glaze-shadow-ink) 22%, transparent),
  0 9px 24px -3px color-mix(in oklab, var(--glaze-shadow-ink) 14%, transparent);
```

Each component selects one shadow token, then adds the separate inset face highlight. Exact alphas must be tuned live.

### 20.2 Texture exists at three scales

Glazed ceramic is not noisy glass. Texture should be perceived as slight material irregularity, not visible grit.

#### Macro texture: tint field

A large low-frequency gradient prevents the surface from looking digitally flat.

- Scale: `80-160%` of the component bounds.
- Contrast: subtle enough that text contrast is not materially different across the component.
- Direction: top-left or top-center key light, consistent app-wide.

#### Meso texture: sheen and rim

This is the primary material cue.

- Broad neutral sheen over roughly `30-45%` of the face.
- Thin high-energy top/key edge.
- Much weaker opposite-edge inset line.
- No continuous moving shine.

#### Micro texture: glaze variation

Optional and enhanced-tier only.

- Deterministic, static, non-photographic.
- Effective alpha around `0.006-0.015`.
- Spatial period roughly `3-8px`, varied enough to avoid a visible grid.
- Omit on controls under `48px`, text-dense panels, print, High Contrast, forced colors, and weak-device mode.

Do not add a JPEG noise texture. It introduces compression artifacts, extra requests, and scale-dependent grain. If micro texture is tested, use a static CSS pseudo-element or a tiny data texture with a documented fallback.

### 20.3 Texture hierarchy by variant

| Variant | Macro tint | Meso sheen | Micro variation |
| --- | --- | --- | --- |
| Clear | Very weak | Crisp but restrained | None |
| Neutral | Warm, low chroma | Broad ceramic sheen | Optional on large surfaces |
| Brand | Terracotta-present | Neutral-white rim | Very subtle |
| Semantic | Meaningful tint | Neutral-white rim | None; clarity first |
| Thick | Strong surface field | Soft broad sheen | Optional on large modal only |

## 21. Color and Luminance Engineering

### 21.1 Why OKLab is the default mix space

**Standard.** OKLab was designed so lightness, chroma, and hue behave more perceptually evenly than HSV or direct sRGB mixing. It reduces muddy or hue-shifting intermediate colors when blending warm surfaces with semantic accents.

Use:

```css
color-mix(in oklab, var(--color-surface-1), var(--glaze-accent) 18%)
```

Use OKLCH only when a prototype needs explicit lightness/chroma control while preserving hue. Provide a static fallback before any relative-color syntax.

### 21.2 Final composited color

For a simple source-over approximation:

$$
C_{\text{final}} = \alpha C_{\text{glaze}} + (1-\alpha)C_{\text{filtered backdrop}}
$$

Real `backdrop-filter` output is more complex because blur samples neighboring pixels and saturation alters them. Therefore token math is only a planning tool. Contrast must be evaluated against final rendered pixels.

### 21.3 Relative luminance and contrast

WCAG contrast uses linearized relative luminance:

$$
L=0.2126R+0.7152G+0.0722B
$$

and:

$$
  ext{contrast}=\frac{L_{\text{lighter}}+0.05}{L_{\text{darker}}+0.05}
$$

Release thresholds must not be rounded. `4.499:1` does not satisfy `4.5:1`.

### 21.4 Theme adaptation

A white rim at `0.14` can be subtle on parchment and fluorescent on espresso. Start with:

```css
:root {
  --glaze-face-highlight-alpha: 0.14;
  --glaze-shadow-strength: 1;
  --glaze-highlight-color: #fff;
}

[data-theme="dark"] {
  --glaze-face-highlight-alpha: 0.07;
  --glaze-shadow-strength: 0.6;
  --glaze-highlight-color:
    color-mix(in oklab, #fff 85%, var(--color-brand-hover) 15%);
}
```

These are tuning values, not accessibility guarantees.

### 21.5 Semantic foreground tokens are mandatory

Production semantic toast glaze uses paired foreground tokens rather than hardcoding white:

```css
--color-on-success: ...;
--color-on-warning: ...;
--color-on-danger: ...;
```

Measured current dark-theme fill contrast against white:

| Fill | Color | White-text contrast |
| --- | --- | ---: |
| Success | `#8fb377` | `2.364:1` |
| Warning | `#e8912f` | `2.464:1` |
| Danger | `#d9694c` | `3.457:1` |

All fail `4.5:1` for normal text. Glaze must not preserve this assumption.

## 22. Unified Material Parameter Model

Every surface chooses a small set of inputs. The remaining visual values derive from them.

### 22.1 Inputs

| Token | Range | Meaning |
| --- | --- | --- |
| `--glaze-accent` | semantic color token | Neutral, brand, success, warning, danger |
| `--glaze-thickness` | `0.15-0.90` | Clear to Thick |
| `--glaze-elevation` | `1-3` | Attached to modal-level |
| `--glaze-gloss` | `0.60-0.75` | Highlight concentration |
| `--glaze-importance` | `0-2` | Rim and shadow emphasis |
| `--glaze-alpha` | static percent | Accessibility-adjusted final alpha |
| `--glaze-radius` | existing radius token | Geometry |

### 22.2 Derived outputs

| Output | Derived from | Purpose |
| --- | --- | --- |
| Body alpha | thickness + legibility floor | Transmission/readability |
| Tint fraction | body alpha + semantic importance | Material color |
| Blur | elevation + size class | Depth separation |
| Saturation | gloss | Compensate blur washout |
| Rim width | UI scale + component size | Fresnel-like edge cue |
| Highlight alpha | theme + importance | Face sheen |
| Shadow size | elevation | Layer hierarchy |

### 22.3 Worked examples

#### Neutral settings toolbar

```text
accent     = surface/brand trace
thickness  = 0.45
elevation  = 1
gloss      = 0.68
importance = 0
alpha      = max(0.63 optical, 0.72 text floor) = 0.72
blur       = about 10-12px
```

#### Success notification

```text
accent     = --color-success
thickness  = 0.55
elevation  = 2
gloss      = 0.68
importance = 1
alpha      = max(0.70 optical, 0.92 semantic floor) = 0.92
blur       = about 14-18px
foreground = --color-on-success
```

#### Danger notification

```text
accent     = --color-danger
thickness  = 0.70
elevation  = 2
gloss      = 0.68
importance = 2
alpha      = max(0.79 optical, 0.96 danger floor) = 0.96
blur       = about 14-18px
foreground = --color-on-danger
```

#### Clear help search shell

```text
accent     = surface
thickness  = 0.15
elevation  = 2
gloss      = 0.72
importance = 0
alpha      = 0.28
blur       = about 16-20px
direct text/input = opaque local input surface
```

## 23. Rendering Architecture

This section implements the normative browser and fallback constraints in Sections 10-12. Where wording differs, Sections 10-12 govern.

### 23.1 Tier 0: Solid baseline

Always define an opaque, complete interface first.

```css
.glaze {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-strong);
}
```

This is the unsupported-browser, reduced-transparency, forced-colors, print, and performance fallback.

### 23.2 Tier 1: Standard Glaze

Enable standard glaze only after feature detection:

```css
@supports ((backdrop-filter: blur(1px)) or
           (-webkit-backdrop-filter: blur(1px))) {
  :root:not([data-transparency="reduced"]) .glaze {
    background: rgb(255 255 255 / 0.72);
    /* Enhanced OKLab mix follows; an engine that rejects it keeps the line above. */
    background:
      linear-gradient(
        180deg,
        rgb(255 255 255 / var(--glaze-face-highlight-alpha)),
        transparent 45%
      ),
      color-mix(
        in oklab,
        var(--glaze-body) var(--glaze-alpha),
        transparent
      );
    backdrop-filter:
      blur(var(--glaze-blur))
      saturate(var(--glaze-saturation));
    -webkit-backdrop-filter:
      blur(var(--glaze-blur))
      saturate(var(--glaze-saturation));
  }
}
```

The code is illustrative. Shipped surfaces were tested through this repo's Tailwind/PostCSS pipeline; inline `backdropFilter` custom-property bridges are used where that pipeline drops declarations.

### 23.3 Tier 2: Enhanced static material

Optional enhancements:

- Static broad sheen pseudo-element.
- Weak lower inset reflection.
- Large-scale tint field.
- Very subtle micro texture on large surfaces.

Tier 2 must remain removable without changing component markup or interaction.

### 23.4 Tier 3: Refraction laboratory

Not a production dependency.

Possible experiments:

- SVG `feDisplacementMap` on one static specimen.
- Canvas or OffscreenCanvas-generated displacement map.
- WebGL full-screen material study.
- Sampled physical spring exported to CSS `linear()`.

Do not use CSS Paint API as a required implementation; support remains incomplete. Do not apply SVG displacement to scrolling lists, toolbars over live content, or multiple simultaneous overlays.

### 23.5 Backdrop-root audit

Before adding glaze to an element, inspect all ancestors for:

- `filter` other than `none`.
- `opacity` less than `1`.
- `mask`, `mask-image`, or non-none `clip-path`.
- `backdrop-filter`.
- non-normal `mix-blend-mode`.
- `will-change` naming any of the above.

These can establish a backdrop root and silently change what the blur samples. A correct-looking CSS declaration can still blur the wrong pixels.

Production lessons from 2026-07-21:

- A computed `blur(...)` value is not proof of visible backdrop sampling. Place a fine alternating stripe probe behind the surface and inspect pixels/screenshots.
- `animation-fill-mode: both` can retain an identity transform after animation settlement; identity transforms still establish backdrop roots. Glaze-bearing dropdown/search entrances use `backwards` so transforms release.
- Nested active backdrop filters stop descendants from sampling the page. Accessibility is nested under Settings, so `.settings-pill:has(.accessibility-glaze-panel)` suspends the parent filter while the panel is mounted and restores it on close.
- Use a dedicated absolute material layer behind foreground controls when input/background utilities or component paint would otherwise cover the glaze.

### 23.6 Stacking-context contract

- Keep the existing z-index ladder.
- Portal viewport-level modals and backdrops to `document.body`.
- Avoid glaze inside another active glaze.
- Keep child popovers opaque or as sibling/portal layers when nested blur would occur.
- Never solve backdrop issues with arbitrary giant z-index values.

## 24. Motion Engineering

### 24.1 Real spring model

**Physics.** A damped harmonic oscillator is:

$$
m\ddot{x}+c\dot{x}+kx=0
$$

with natural frequency and damping ratio:

$$
\omega_n=\sqrt{\frac{k}{m}},
\qquad
\zeta=\frac{c}{2\sqrt{km}}
$$

Approximate two-percent settling time:

$$
t_s \approx \frac{4}{\zeta\omega_n}
$$

- $\zeta<1$: underdamped, overshoots.
- $\zeta=1$: critical damping, fastest no-overshoot response.
- $\zeta>1$: overdamped, slow no-overshoot response.

### 24.2 Bistro personality target

The current `cubic-bezier(0.34, 1.56, 0.64, 1)` is **spring-like**, not a physical spring. It visually resembles a moderately underdamped system with roughly one visible overshoot.

For a future JS or sampled `linear()` spring, start with:

```text
mass m       = 1
response     = 0.40s
damping zeta = 0.60
omega_n      = 2*pi/response = 15.708 rad/s
stiffness k  = omega_n^2*m   = 246.74
damping c    = 2*zeta*sqrt(k*m) = 18.85
settling     = about 0.424s
```

This is a starting equivalence for tuning, not an exact inverse of the cubic Bezier.

### 24.3 Spatial versus effect channels

Only spatial channels may overshoot:

- Translation.
- Scale.
- Rotation.
- Width/radius where genuine geometry must change.

Effect channels must not overshoot:

- Opacity.
- Tint.
- Blur strength.
- Contrast.
- Saturation.

For example, a toast may scale to `1.02` before settling, but opacity must stop at `1` and semantic tint must not oscillate beyond its target.

### 24.4 Motion speed classes

| Class | Duration | Typical use |
| --- | ---: | --- |
| Micro | `80-150ms` | Press feedback, tint response |
| Utility | `150-220ms` | Tooltip/dropdown, small panel |
| Standard | `220-350ms` | Modal, moderate control reveal |
| Expressive | `350-480ms` | Toast arrival, settings unravel |

No Bistro Glaze interaction should block input until its animation finishes.

### 24.5 Input modality

**Art direction, informed by Apple's input-modality guidance.** Touch may use slightly stronger compression than pointer input, provided keyboard activation reaches the same functional state.

For Bistro Glaze:

- Touch press: `scale(0.97)` plus stronger tint/shadow compression.
- Mouse press: approximately half that scale change.
- Keyboard activation: same final state and focus treatment; no dependence on hover.
- Hover: color/edge response only, no bouncy geometry.

### 24.6 Interruption and reversal

Open/close motion must reverse from its current visual value. Do not queue a close until open finishes. CSS transitions naturally support this; keyframe-based systems need explicit current-state handling.

Test reversal at approximately `25%`, `50%`, and `75%` progress.

### 24.7 Reduced-motion substitution

The existing app collapses all durations to `0.01ms`, which remains the minimum safe implementation. For future large-travel transitions, prefer a fade substitution rather than merely making a spatial jump fast.

Under Reduce Motion:

- No ravel travel.
- No modal scale or top-drop travel.
- No toast translation.
- Static material and semantic tint remain.
- Scroll-edge legibility remains because it is functional, not decorative motion.

## 25. Composited Readability and Accessibility

This section implements the normative accessibility policy in Section 10. Where wording differs, Section 10 governs.

### 25.1 Foregrounds remain opaque

Never apply `opacity` to a whole glaze container that contains text or icons. That fades the foreground together with the surface and destroys contrast. Transparency belongs in the background layers only.

### 25.2 Release contrast targets

| Property | Required release threshold |
| --- | --- |
| Normal text | WCAG minimum `4.5:1`; project target `7:1` at or below 16px and for critical semantic messages |
| Large text | `3:1` only at least 24px regular or 18.5px bold after UI scaling |
| High Contrast normal text | `7:1` |
| Essential icons and boundaries | Minimum `3:1`; project target `4.5:1` |
| Focus indicator | At least 2px visible perimeter and `3:1` adjacent contrast |
| Operational small text | APCA advisory target `|Lc| 75+`; `|Lc| 90` target at or below 14px |

WCAG 2.2 remains the conformance authority. APCA is advisory only while its specification remains under development.

### 25.3 Worst-case backdrop set

Every direct-text glaze specimen with an unbounded or scrolling backdrop must be stress-tested over:

- Pure black and pure white.
- A black/white split directly behind the foreground.
- An `8px` black/white checkerboard.
- Alternating light and dark text rows.
- Every light/dark `surface-0/1/2` token.
- Brand, success, warning, danger, and status colors.
- Every CVD palette.
- Real order cards, overdue rings, admin rows, and `BackgroundArt` marks.
- Grayscale and High Contrast.

If any essential pixel fails, increase alpha in five-point steps. At `92%`, if failure remains, use `100%` opacity.

### 25.4 Screenshot sampling protocol

For rigorous specimens:

1. Capture with foreground visible.
2. Capture the same frame with foreground temporarily hidden.
3. Use the hidden frame as the post-filter background beneath each glyph or icon.
4. Sample stable interior glyph pixels and the immediate rendered background at multiple representative points.
5. Record the minimum stable sample, fifth percentile, and median contrast.
6. The minimum stable sample determines pass/fail; ignore rasterization-dependent anti-aliased fringe pixels.
7. Repeat at materially different scroll positions and after animation settles.

Automated scanners are supporting evidence only; gradients, images, blur, and transparency can exceed their reliable model.

### 25.5 Semantic contract

| Meaning | Required non-color signature |
| --- | --- |
| Success | Check-circle plus explicit completed/result wording |
| Warning / pending | Triangle-alert plus explicit warning, pending, or action-needed wording |
| Danger / error | X-circle or octagon plus explicit error/failure/destructive wording |
| Selected | Checkmark, filled control, `aria-selected`, or `aria-pressed` |
| Loading | Visible loading/progress wording and programmatic status; spinner is supplementary |

The meaning must remain complete if every semantic tint becomes the same color.

### 25.6 Toast announcements

Production semantic toast glaze includes programmatic status messaging:

- Polite success and ordinary warning: `role="status"` or a polite live region.
- Urgent error requiring immediate attention: `role="alert"` only when urgency is real.
- Use `aria-atomic="true"` where the whole message must be announced together.
- Avoid announcing purely decorative animation or countdown updates every frame.

### 25.7 Reduce Transparency

Effective reduction is:

```text
saved manual data-transparency="reduced"
OR forced-colors
```

High Contrast also renders glaze opaque, but does not change the saved transparency preference. Accessibility axes remain independent. A compatible platform reduced-transparency signal may initialize the behavior only when the user has not chosen a site preference; it remains optional progressive enhancement.

### 25.8 Forced Colors

In `@media (forced-colors: active)`:

- Disable blur, tint gradients, highlights, semantic shadows, and micro texture.
- Keep `forced-color-adjust: auto`.
- Use real borders because box shadows are forced to `none`.
- Use native elements and `currentColor` for Lucide strokes.
- Use system colors such as `Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, `Highlight`, and `HighlightText` only for targeted repairs.
- Do not opt out of the user's palette unless an essential control is otherwise broken.

## 26. Performance Budget and Instrumentation

### 26.1 Material budget

Starting project budgets:

- One backdrop-filter body per control group.
- Never nest active backdrop filters.
- No backdrop filter on scrolling rows or table cells.
- Standard blur ceiling `18px`.
- Modal/large-surface ceiling `24px`.
- Absolute prototype ceiling `28px`.
- At most two simultaneous blurred overlay bodies in ordinary flows.
- Reflection and micro texture are first to be removed on weak hardware.

These are internal acceptance budgets for the weakest supported kitchen tablet, not universal web-performance standards or browser guarantees.

### 26.2 Animation budget

Prefer `transform` and `opacity`. Width and border-radius animation are accepted only where actual geometry must change, such as the settings pill. Never leave permanent `will-change` declarations.

### 26.3 Weak-device release gate

On the weakest supported kitchen tablet:

- p95 frame interval no worse than `33.3ms` during glaze interaction or scroll.
- No input-to-paint delay above `200ms` caused by glaze.
- No performance regression greater than `20%` compared with the opaque specimen.
- No increasing memory trend after 50 repeated open/close cycles.
- No full-viewport paint flashing during a compact overlay animation.

### 26.4 DevTools procedure

1. Record an opaque baseline.
2. Record the same interaction with glaze.
3. Enable screenshots, FPS meter, and paint flashing.
4. Inspect Recalculate Style, Layout, Paint, Raster, and Composite work.
5. Inspect layer count and memory.
6. Test scroll while the glaze remains static.
7. Test opening, reversing, and closing repeatedly.
8. Repeat with CPU throttling and on physical hardware.

### 26.5 Repo-specific CSS integrity gate

After every global CSS change:

1. Verify the actual browser bundle contains the new glaze selector.
2. Verify the same bundle still contains `.chef3d-*`, `.chef-speech-bubble`, notification keyframes, and print rules.
3. If source and browser disagree, stop the exact server, delete only `app/.next`, and restart through `startup`.
4. Never infer client rendering from curl or source text alone.

## 27. Component Recipe Matrix

| Component | Variant | Thickness / alpha | Elevation / blur | Texture | Motion | Solid fallback |
| --- | --- | --- | --- | --- | --- | --- |
| Settings pill | Neutral (approved) | body `29%`; warmth `16%` left / `22%` right | `1.5px`, saturation `145%` | Asymmetric ceramic rim + sheen + olive trace | 450ms unravel, 260ms ravel; radius `12px→20px` | Opaque surface-1 |
| Help sticky search | Clear (approved) | body `29%` | working `2px` on dedicated inset layer | Same ceramic grammar; input foreground remains opaque/clear | Existing pop in/out; settled transform released | Opaque search control |
| Success toast | Success (approved) | semantic body `29%` | `1.5px`, saturation `145%` | Neutral rim + semantic edge pools | Existing geometry overshoot | Opaque surface + semantic icon/text |
| Warning toast | Warning (approved) | semantic body `29%` | `1.5px`, saturation `145%` | Neutral rim + semantic edge pools | Existing geometry overshoot | Opaque surface + semantic icon/text |
| Error toast | Danger (approved) | semantic body `29%` | `1.5px`, saturation `145%` | Neutral rim + semantic edge pools | Existing geometry overshoot | Opaque surface + semantic icon/text |
| Tooltip | Thick Neutral | alpha `92%+` | E2, `10-14px` | None | 150-220ms | Opaque surface-1 |
| Accessibility popover | Thick Neutral (approved) | body `72%` | working `2px`; parent Settings filter suspended while open | Asymmetric ceramic texture | 180ms in / 150ms out; transform releases | Entire panel opaque |
| Health/clock popover | Thick Neutral (pending) | prototype `92%+` | prototype `12-16px` | Broad sheen only | 180-240ms | Entire panel opaque |
| Select/autocomplete/filter | Thick Neutral | alpha `92%+` | E2, `12-16px` | None | 180-240ms | Panel and rows opaque |
| Modal panel | Thick Neutral | alpha `92-100%` | E3, `16-24px` | Optional macro/meso | Existing modal motion | Opaque panel; no blur |
| Danger modal | Danger accent on neutral body | alpha `96-100%` | E3, `16-24px` | Strong rim | Existing modal motion | Opaque body + danger border/title |
| Desktop sidebar | Neutral Thick | alpha `86-96%` | E1, `8-12px` | Optional macro tint | Static | Existing opaque sidebar |
| Loading capsule | Neutral | alpha `72-86%` | E1, `8-12px` | None | Spinner may stop under Reduce Motion | Opaque capsule with text |

## 28. Specimen Lab and Acceptance Process

Before changing production components, build one internal specimen page or temporary developer-only harness containing:

- Every material variant.
- Every theme and CVD palette.
- Clear/neutral/thick layers over the mandatory backdrop set.
- Normal, Small, and Big UI.
- Focused, hovered, pressed, disabled, and selected states.
- One stacked-overlay failure specimen.
- One forced-colors specimen.
- One reduced-transparency specimen.
- One weak-device performance loop.

The specimen is accepted only when:

- Every direct-text combination passes final-composite contrast.
- Semantic meaning survives grayscale and forced colors.
- Geometry does not shift when glaze is disabled.
- Opening/closing can reverse mid-flight.
- Paint flashing does not cover unrelated page regions.
- The opaque fallback remains visually intentional, not broken glaze.

## 29. Research Sources

### Apple design guidance

- [Apple Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) - functional layer, regular/clear materials, restraint, legibility, scroll-edge behavior.
- [Apple Human Interface Guidelines: Motion](https://developer.apple.com/design/human-interface-guidelines/motion) - purposeful motion, interruption, input modality, brevity, reduced-motion guidance.
- [Apple: Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) - controls, navigation, grouping, accessibility, and performance guidance.

### Optics and rendering theory

- [Physically Based Rendering, 4th ed.: Dielectric BSDF](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF) - dielectric reflection/transmission and thin-interface behavior.
- [Physically Based Rendering, 4th ed.: Roughness Using Microfacet Theory](https://pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory.html) - roughness and microfacet distributions.
- Christophe Schlick, *An Inexpensive BRDF Model for Physically-Based Rendering* (1994) - Schlick Fresnel approximation.
- [Beer-Lambert law](https://en.wikipedia.org/wiki/Beer%E2%80%93Lambert_law) - exponential transmission/absorption relationship used as the shape of the thickness ladder.

### Web rendering and color

- [MDN: `backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter) - syntax, support, backdrop roots, and sampling boundaries.
- [WebKit: Introducing Backdrop Filters](https://webkit.org/blog/3632/introducing-backdrop-filters/) - web backdrop-filter rendering model and cost considerations.
- [MDN: `color-mix()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix) - color interpolation and compatibility.
- [Bjorn Ottosson: A perceptual color space for image processing](https://bottosson.github.io/posts/oklab/) - OKLab design, perceptual axes, and blending behavior.
- [MDN: `prefers-reduced-transparency`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency) - preference behavior and support gaps.
- [MDN: `forced-colors`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors) - system palette behavior, removed shadows/background images, and system colors.

### Motion and performance

- [web.dev: How to create high-performance CSS animations](https://web.dev/articles/animations-guide) - compositor-friendly properties, paint/layout diagnostics, and `will-change` caution.
- [Material Design: Light and shadows](https://m2.material.io/design/environment/light-shadows.html) - key/ambient shadow model and elevation cues.
- [Maxime Heckel: The Physics Behind Spring Animations](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/) - damped oscillator derivation and practical spring parameters.
- [Josh W. Comeau: A Friendly Introduction to Spring Physics](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/) - spring mental model and CSS timing limitations.

### Accessibility

- [WCAG 2.2: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) - final contrast thresholds and no-rounding rule.
- [WCAG 2.2: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) - UI component and state contrast.
- [WCAG 2.2: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) - non-color semantic redundancy.
- [WCAG 2.2: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) - programmatic announcement requirements.
- [WCAG 2.2: Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) - persistent, hoverable, dismissible tooltip/popover behavior.
- [Microsoft: Styling for Windows High Contrast with forced colors](https://blogs.windows.com/msedgedev/2020/09/17/styling-for-windows-high-contrast-with-new-standards-for-forced-colors/) - practical forced-colors integration.

## 30. Approved Decisions and Remaining Questions

Resolved through live prototypes:

1. Standard approved material uses asymmetric terracotta edge pools, neutral-white rim/sheen, and a small olive trace.
2. Approved production blur is deliberately low: Settings/toasts `1.5px`; Help/Accessibility `2px`.
3. Approved body alpha: Settings/Help/semantic toast `29%`; text-heavy Accessibility `72%`.
4. Semantic notifications use active theme/CVD semantic tokens plus explicit icons/wording and `--color-text-primary`-based foregrounds.
5. Settings square/pill radius interpolates from `12px` to the real half-height (`20px`), not `9999px`; its trigger has no opaque tooltip/hover block.
6. Notifications are fixed at the true viewport top-right (`1rem`, `1rem`) and intentionally ignore surrounding layout.

Still open:

1. Whether any micro texture survives side-by-side review without reading as noise.
2. Whether modal panels benefit from glaze or should retain opaque ceramic surfaces with only a glazed backdrop.
3. Whether desktop sidebars pass the weak-device scroll benchmark.
4. Whether a sampled CSS `linear()` spring provides a meaningful improvement over the established cubic Bezier.
5. Exact recipes for remaining Health, clock, tooltip, select/autocomplete/filter, loading capsule, modal, and navigation phases.

Research formulas and unapproved component rows remain prototype defaults. Approved rows in Section 27 are the current production constants until the user explicitly retunes them.
