/**
 * motionStyles.js
 * Shared per-card motion vocabulary used by BOTH playback pipelines:
 *   - useSequence  (live: GSAP tweens on the DOM world / card wrappers)
 *   - useOfflineRender (offline: identical GSAP tweens on plain proxies)
 * Keeping the tween construction here guarantees the exported video matches
 * what the user previews on the board.
 *
 * Card fields consumed (all optional, undefined = default):
 *   card.zoom      number   camera framing tightness (1 = default width)
 *   card.pathStyle string   'smooth'|'linear'|'arc'|'whip'|'punch'|'kenburns'
 *   card.entrance  string   'none'|'fade'|'slide-*'|'scale'|'pop'
 */

export const PATH_STYLES = [
  { value: 'smooth',   label: 'Smooth' },
  { value: 'linear',   label: 'Linear' },
  { value: 'arc',      label: 'Arc' },
  { value: 'whip',     label: 'Whip pan' },
  { value: 'punch',    label: 'Punch-in' },
  { value: 'kenburns', label: 'Ken Burns' },
];

export const ENTRANCE_EFFECTS = [
  { value: 'none',        label: 'No FX' },
  { value: 'fade',        label: 'Fade' },
  { value: 'slide-up',    label: 'Slide ↑' },
  { value: 'slide-down',  label: 'Slide ↓' },
  { value: 'slide-left',  label: 'Slide ←' },
  { value: 'slide-right', label: 'Slide →' },
  { value: 'scale',       label: 'Scale in' },
  { value: 'pop',         label: 'Pop' },
];

/** Ken Burns dwell drift: slow push-in by 6% over the stay time. */
export const KENBURNS_DRIFT = 1.06;

export const cardZoom = (card) => (Number(card?.zoom) > 0 ? Number(card.zoom) : 1);
export const cardPath = (card) => card?.pathStyle || 'smooth';
export const cardEntrance = (card) => card?.entrance || 'none';

export function easeForPath(style) {
  switch (style) {
    case 'linear': return 'none';
    case 'whip':   return 'expo.inOut';
    case 'punch':  return 'back.out(1.6)';
    case 'kenburns': return 'power2.inOut';
    default:       return 'power3.inOut'; // 'smooth'
  }
}

/**
 * Add the arrival move for one card to `tl` at `position`.
 * `target` is either the world DOM element, a card wrapper, or a plain
 * {x, y, scale} proxy — anything GSAP can tween x/y(/scale) on.
 *
 * `from` (previous camera position) is only needed by the 'arc' style, which
 * flies through a waypoint bowed perpendicular to the travel direction.
 * `to.scale` is optional (card wrappers don't carry camera scale).
 */
export function addCameraArrival(tl, target, { from, to, arrival, style }, position) {
  if (style === 'arc' && from && arrival > 0.05) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const bow = Math.min(dist * 0.2, 400);
      const midX = from.x + dx / 2 - (dy / dist) * bow;
      const midY = from.y + dy / 2 + (dx / dist) * bow;
      tl.to(target, { x: midX, y: midY, duration: arrival / 2, ease: 'power2.in' }, position);
      tl.to(target, { x: to.x, y: to.y, duration: arrival / 2, ease: 'power2.out' }, '>');
      if (to.scale !== undefined) {
        tl.to(target, { scale: to.scale, duration: arrival, ease: 'power2.inOut' }, position);
      }
      return;
    }
  }
  const vars = { x: to.x, y: to.y, duration: arrival, ease: easeForPath(style) };
  if (to.scale !== undefined) vars.scale = to.scale;
  tl.to(target, vars, position);
}

/**
 * Ken Burns dwell: slow linear drift deeper into the card while staying
 * centred on it. Camera coords are linear in scale (x = -card.x * scale), so
 * multiplying x/y/scale by the same factor keeps the card centred.
 * `position` optional — defaults to appending at the end of the timeline.
 */
export function addKenBurnsDwell(tl, target, to, stay, position) {
  if (stay <= 0.05) return;
  const vars = { duration: stay, ease: 'none' };
  if (to.x !== undefined) vars.x = to.x * KENBURNS_DRIFT;
  if (to.y !== undefined) vars.y = to.y * KENBURNS_DRIFT;
  if (to.scale !== undefined) vars.scale = to.scale * KENBURNS_DRIFT;
  if (position !== undefined) tl.to(target, vars, position);
  else tl.to(target, vars);
}

/**
 * Start values for a card's entrance effect, or null for 'none'.
 * The effect always ends at { x: 0, y: 0, scale: endScale, alpha: 1 }.
 * Slide offsets are in world units, proportional to the card's size.
 */
export function entranceStart(effect, cardW, cardH, endScale = 1) {
  switch (effect) {
    case 'fade':        return { x: 0, y: 0, scale: endScale, alpha: 0, ease: 'power2.out' };
    case 'slide-up':    return { x: 0, y: cardH * 0.4, scale: endScale, alpha: 0, ease: 'power3.out' };
    case 'slide-down':  return { x: 0, y: -cardH * 0.4, scale: endScale, alpha: 0, ease: 'power3.out' };
    case 'slide-left':  return { x: cardW * 0.4, y: 0, scale: endScale, alpha: 0, ease: 'power3.out' };
    case 'slide-right': return { x: -cardW * 0.4, y: 0, scale: endScale, alpha: 0, ease: 'power3.out' };
    case 'scale':       return { x: 0, y: 0, scale: endScale * 0.55, alpha: 0, ease: 'power3.out' };
    case 'pop':         return { x: 0, y: 0, scale: endScale * 0.4, alpha: 0, ease: 'back.out(2)' };
    default:            return null;
  }
}
