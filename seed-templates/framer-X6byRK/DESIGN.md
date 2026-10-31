# Framer — DESIGN.md

> 자료 우선순위: preview.html(= approved-preview.html 에 상응) > preview-desktop.png > preview-mobile.png > design-tokens.css > DESIGN.md
> 이 문서만 보고 새로 디자인하지 마라. 수치가 어긋나면 preview.html 이 맞다.

## Design Direction
Framer — 분위기: confident, futuristic, minimal, technical, sleek, premium. hero 구조: centered-left-aligned top nav with large two-line headline, supporting subcopy, dual CTA buttons, and a secondary text link all left-aligned within a wide container, followed below by a large rounded-corner product screenshot panel bleeding toward viewport edges

## Color System
background #000000 / surface #141414 / primary #FFFFFF / secondary #9A9A9A / accent #1F6FEB / text #FFFFFF. 채도 near-desaturated monochrome palette with one isolated saturated accent used sparingly for interactive glow/highlight moments, 색온도 cool overall temperature from near-black base and neutral grays, punctuated by a cool blue accent

## Typography
modern grotesque sans-serif, geometric and slightly condensed, feels engineered rather than warm. 스케일 hero headline roughly 2.5-3x body text size, wrapping across two lines at desktop width and three-plus lines on mobile, 굵기 heavy/bold weight on headline, medium weight on nav and buttons, regular weight on body copy, 행간 tight line-height on headline (around 1.05-1.1) for compact multi-line stacking, looser (around 1.4-1.5) on body subcopy, 자간 default to slightly tight tracking on headline, normal tracking on nav and body text. 위계: clear three-tier hierarchy: small nav labels, oversized bold headline as primary focal point, medium-weight muted subcopy directly beneath

## Spacing
섹션 간격 generous vertical gap (roughly 80-120px equivalent) between header, hero text, and the media panel below, 컨테이너 패딩 wide side padding on desktop (~80-100px), narrow side padding on mobile (~20px), 카드 패딩 moderate internal padding (~24-32px) inside the dark UI panel framing the product screenshot, 콘텐츠 간격 compact vertical rhythm between headline, subcopy, and CTA row (~16-24px increments), hero 여백 ample surrounding negative space around the hero text block and above the media panel, reinforcing a spacious, uncluttered first impression

## Layout
컨테이너 wide fluid container roughly 1280-1440px max-width with generous horizontal margins on desktop, collapsing to near-full-width with ~20px side padding on mobile, 정렬 left-aligned text block for headline/subcopy/CTAs, with the screenshot panel centered and inset below, 이미지 배치 single large interactive-UI screenshot placed directly beneath the hero copy, framed in a rounded dark panel that reads as an embedded product demo

## Grid
single-column content flow with a wide full-bleed media panel beneath the hero text block; no visible multi-column card grid in the captured fold. 섹션 순서: header → hero → productShowcase

## Photography
구도 screen-capture-style product UI shown inside a rounded device-like frame rather than lifestyle photography, 조명 simulated screen glow with a soft radial light bloom emanating from a central interactive element against the dark surface, 그레이딩 high-contrast near-monochrome grade with deep blacks and a single cool-toned glow accent, 화각 flat frontal angle, no perspective tilt, as if looking directly at a screen, 심도 sharp overall focus with a soft glow/blur halo used only around the highlighted UI element for emphasis, 비율 wide landscape ratio around 16:9 to 2:1 on desktop, taller near-square to portrait crop on mobile

## Components
테두리 thin, low-contrast hairline borders separating panel sections, barely visible against the dark background, 라운드 medium-large corner radius (roughly 12-20px) applied consistently to buttons, panels, and the hero media frame, 그림자 minimal to no elevation shadow; depth communicated instead through subtle surface-color contrast and glow effects

## Navigation
horizontal top nav bar with text links, dropdown-caret indicators on grouped items, and distinct visual treatment for auth actions (ghost text link vs solid filled button)

## Buttons
pill-to-rounded-rectangle buttons with solid white fill for primary action and dark filled/outlined style for secondary action, compact horizontal padding

## Forms
not visible in this fold; cookie-consent bar implies simple flat rectangular button inputs with minimal styling

## Cards
dark surface panels with soft rounded corners used to frame the product screenshot and inline UI chips, no visible drop shadow separation from background

## Motion
fade subtle fade-in suggested for hero text elements on load, consistent with a calm entrance rather than abrupt appearance / reveal progressive reveal of the product screenshot panel as if demonstrating a live interactive build process / scroll likely scroll-triggered section transitions beyond the captured fold, not confirmed from static screenshot / hover interactive UI chips (tab-style toggles, dropdown rows) imply hover-state highlighting with a lightened surface tone / transition smooth, moderate-duration easing implied by the soft glow diffusion and rounded panel treatment, avoiding abrupt or bouncy motion

## Responsive
브레이크포인트: 834px, 1440px, 833px

## Do
- preview.html 의 수치를 그대로 사용한다
- 색·간격·타이포는 design-tokens.css 의 변수로만 참조한다
- 섹션의 data-vdna-id 와 순서를 유지한다
- 반응형은 위 브레이크포인트를 그대로 쓴다

## Don't
- 이 문서만 보고 새로 디자인하지 않는다
- 토큰을 우회한 하드코딩 색상을 쓰지 않는다
- 섹션을 합치거나 쪼개지 않는다
- 임의로 값을 '개선'하지 않는다
