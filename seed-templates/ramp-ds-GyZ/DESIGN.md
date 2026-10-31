# Ramp — DESIGN.md

> 자료 우선순위: preview.html(= approved-preview.html 에 상응) > preview-desktop.png > preview-mobile.png > design-tokens.css > DESIGN.md
> 이 문서만 보고 새로 디자인하지 마라. 수치가 어긋나면 preview.html 이 맞다.

## Design Direction
Ramp — 분위기: minimal, confident, efficient, high-contrast, data-driven. hero 구조: centered top nav with notice bar above, left-aligned oversized headline block followed by a single-line input+CTA form, then a large full-width product screenshot panel below the fold

## Color System
background #FFFFFF / surface #F3F2EE / primary #0A0A0A / secondary #6B6B6B / accent #D6F23C / text #111111. 채도 mostly desaturated neutrals with one piercing high-saturation accent color used sparingly on primary CTAs, 색온도 cool-neutral overall grayscale palette punctuated by a warm-leaning acid-yellow-green accent

## Typography
geometric sans-serif with a slightly rounded, confident, tech-editorial feel. 스케일 very large display headline (roughly 60-72px) against small 11-12px uppercase label text above it, creating an extreme size jump, 굵기 bold/heavy for the hero headline, medium for nav and body, semibold for buttons, 행간 tight leading on the display headline (near 1.05-1.1), relaxed leading on the subcopy paragraph (around 1.5), 자간 wide tracked uppercase for the small eyebrow label, normal tracking elsewhere. 위계: three-tier stack: tiny uppercase eyebrow, massive headline, medium-weight subheading paragraph, then compact form

## Spacing
섹션 간격 generous vertical gap (roughly 80-120px equivalent) between header, hero copy, and the screenshot panel, 컨테이너 패딩 moderate horizontal padding (around 64-80px on desktop) framing the centered content column, 카드 패딩 comfortable internal padding on the input/button bar and the screenshot frame, roughly 16-24px, 콘텐츠 간격 moderate gap (around 16-24px) between eyebrow label, headline, subcopy, and form, hero 여백 ample open whitespace above and below the headline, letting the oversized type breathe against a plain white field

## Layout
컨테이너 narrow-to-medium centered column (roughly 1100-1200px) for text content, widening to near-full-bleed for the product screenshot panel, 정렬 left-aligned headline and supporting copy, left-aligned form controls, no center-justified body text, 이미지 배치 single large hero product screenshot placed directly beneath the CTA form inside a soft dotted-pattern card

## Grid
single-column centered content track with a max-width container; dashboard mockup breaks out to a wider inset panel. 섹션 순서: announcementBar → header → hero → productScreenshot → liveMetricsBar

## Photography
구도 no human photography in the hero; product UI screenshot is the sole visual, framed as a floating browser-window card with layered secondary panels peeking from behind, 조명 flat, even studio-style lighting simulated through soft neutral shadows under the floating UI card, 그레이딩 clean neutral white-balanced grading with muted grays, no stylized color cast, 화각 flat frontal/orthogonal view of the UI window, no perspective tilt, 심도 layered flat planes rather than optical blur; background panel is slightly offset and dimmed to imply depth, 비율 wide landscape panel roughly 16:9 to 2:1 for the product screenshot container

## Components
테두리 hairline 1px light gray borders on inputs, cards, and the nav bottom edge, 라운드 medium rounded corners (roughly 8-12px) on buttons, inputs, and cards, 그림자 very soft, low-opacity drop shadow beneath the floating screenshot card for subtle lift

## Navigation
horizontal top nav with dropdown chevrons, logo mark plus wordmark on the left, utility links and dual-tier CTAs on the right

## Buttons
pill-to-rounded-rectangle buttons with two tiers: a dark near-black solid primary and a bright accent-colored solid secondary, both with medium padding and no visible border

## Forms
single-line combined input and button bar, input with thin gray border and rounded corners, placeholder text in muted gray

## Cards
flat white/light-gray cards with very subtle borders and minimal shadow, used for the floating product screenshot window

## Motion
fade likely gentle fade-in on hero text elements as the page loads / reveal scroll-triggered reveal of the product screenshot and metrics bar as they enter viewport / scroll subtle parallax-like layering between the front and back UI panels on scroll / hover slight brightness or lift change on buttons and nav dropdown items on hover / transition fast, short-duration easing transitions (150-250ms) for interactive state changes

## Responsive
브레이크포인트: 834px, 560px

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
