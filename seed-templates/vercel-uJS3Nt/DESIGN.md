# Vercel — DESIGN.md

> 자료 우선순위: preview.html(= approved-preview.html 에 상응) > preview-desktop.png > preview-mobile.png > design-tokens.css > DESIGN.md
> 이 문서만 보고 새로 디자인하지 마라. 수치가 어긋나면 preview.html 이 맞다.

## Design Direction
Vercel — 분위기: minimal, confident, technical, monochrome, spacious, sharp. hero 구조: split asymmetric hero: left-aligned headline+CTA block, centered glowing geometric mark, right-aligned stacked micro-copy lines, all on a single full-bleed background row

## Color System
background #F7F7F5 / surface #FFFFFF / primary #0A0A0A / secondary #6B6B6B / accent #FFFFFF / text #111111. 채도 near-desaturated neutral grayscale palette with no chromatic accent color, 색온도 neutral-cool, slightly warm-gray undertone in the background

## Typography
clean geometric sans-serif, neutral and engineering-flavored rather than warm. 스케일 very large display heading (roughly 56-72px desktop) dropping to mid-large (~32-36px) on mobile, 굵기 medium-to-regular nav and body text contrasted with a lighter-weight oversized display heading, 행간 tight line-height on multi-line headline (close to 1.0-1.1x) with looser spacing on supporting list text, 자간 default to slightly tight tracking on headline, normal tracking on nav and body. 위계: three clear tiers: small uppercase-free nav text, oversized headline as focal point, small secondary list copy as tertiary support

## Spacing
섹션 간격 large vertical gap (~96-120px) between hero and logo strip, 컨테이너 패딩 moderate horizontal padding (~24-32px) consistent across header and content, 카드 패딩 not applicable, no card components present, 콘텐츠 간격 medium gap (~16-24px) between headline, CTA row, and supporting text blocks, hero 여백 very generous negative space surrounding the central graphic and flanking text columns

## Layout
컨테이너 wide fluid container near full viewport width with generous side margins (~24-32px), no hard max-width card wrapper, 정렬 left-aligned headline and body text, center-aligned hero mark, right-aligned supporting copy on desktop; fully center-aligned stack on mobile, 이미지 배치 single symbolic graphic centered in the hero vertical axis, floating above the fold with soft radial glow behind it

## Grid
loose 3-column implicit grid in the hero (text / icon / text) collapsing to single-column stack on mobile. 섹션 순서: header → hero → logoStrip

## Photography
구도 single abstract 3D-rendered icon centered within a soft radial glow, isolated against flat background, 조명 soft diffused top-down studio light with a bright halo glow radiating behind the object, 그레이딩 high-contrast monochrome rendering, pure black object against near-white glow, 화각 straight-on frontal view with no perspective tilt, 심도 sharp focus throughout, glow providing the only depth cue, 비율 roughly square bounding area for the central graphic, scaling down proportionally on mobile

## Components
테두리 hairline 1px borders used sparingly on outlined buttons only, 라운드 large pill radius (999px) on buttons, no radius on text or logo elements, 그림자 no hard drop shadows, only a diffuse glow effect behind the hero graphic

## Navigation
horizontal text-link nav with small dropdown carets, collapsing to a single hamburger icon on mobile

## Buttons
fully rounded pill buttons, solid dark fill for primary action and white-outline ghost style for secondary action

## Forms
not present in this view

## Cards
no visible card containers in this view; content sits directly on background

## Motion
fade likely gentle fade-in on hero text and graphic on initial load / reveal logo strip items may reveal with a subtle stagger on scroll into view / scroll minimal scroll-triggered movement, content largely static once loaded / hover subtle background/opacity shift on nav links and button hover states / transition short, fast easing (150-250ms) typical of UI micro-interactions rather than dramatic animation

## Responsive
브레이크포인트: 834px, 1440px

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
