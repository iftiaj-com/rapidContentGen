// The plan.json contract: every block command that edits a job's page, in ONE map. Record mode,
// plan check and plan apply all import it, so the planner side and the renderer side cannot drift
// (ai-video-editor kept two copies of its plan shape and nothing compared them).
//
// Per command:
//   track     where the item belongs: captions | camera | blocks | effects | audio | page
//   text      it puts text on screen (safe zones, overlaps and the face check apply)
//   key(a)    the item's identity: running the command again with the same key updates the item
//             in place (blocks replace their own host, so the first position keeps the layering)
//   required  flags a valid item must carry
//   inputs    flags whose values are files that must exist
//   removes(a) the key a removal run deletes (--remove), or null
// A command missing here is not recorded; a recorded item whose command is missing fails the check.

const bare = (v) => String(v ?? '').replace(/^#/, '');

export const KINDS = {
  captions: { track: 'captions', text: true, key: (a) => a.id || `captions-${a.style}`, required: ['words', 'style'], inputs: ['words'] },
  title: { track: 'blocks', text: true, key: (a) => a.id || 'title-main', required: ['text'], inputs: [] },
  beatflash: { track: 'effects', text: true, key: (a) => a.id || 'beatflash', required: ['words', 'audio'], inputs: ['audio'] },
  shader: { track: 'effects', key: (a) => a.id || `shader-${a.shader}`, required: ['shader'], inputs: ['audio'] },
  three: { track: 'effects', key: (a) => a.id || 'three-main', required: ['scene'], inputs: ['audio'] },
  camera: { track: 'camera', key: (a) => a.id || `cam-${bare(a.target)}`, required: ['target'], inputs: ['track', 'kick', 'audio'] },
  ramp: { track: 'camera', key: (a) => `ramp-${bare(a.target)}`, required: ['target'], inputs: ['audio'] },
  pnp: { track: 'blocks', key: (a) => a.id || 'p1', required: ['base', 'cutout'], inputs: ['cutout'] },
  layer: { track: 'blocks', key: (a) => `layer-${bare(a.id)}`, required: ['id'], inputs: [] },
  transition: { track: 'effects', key: (a) => a.id || `tx-${String(a.at).replace('.', '_')}`, required: ['at', 'style'], inputs: [], removes: (a) => a.remove },
  cinema: { track: 'effects', key: (a) => a.id || 'cf1', required: [], inputs: [], removes: (a) => a.remove },
  strips: { track: 'blocks', key: (a) => a.id || `strips-${a.mode}`, required: ['mode', 'clips', 'start', 'duration'], inputs: ['leak'] },
  target: { track: 'effects', key: (a) => a.id || 'target', required: ['base', 'fx', 'cutout', 'windows'], inputs: ['fx', 'cutout'] },
  flythrough: { track: 'blocks', key: (a) => a.id || 'fly-main', required: [], inputs: ['spec'] },
  style: {
    track: 'blocks',
    text: true,
    // apply | add | build edit the page; list | show do not
    edits: (a) => ['apply', 'add', 'build'].includes(a._[0]),
    key: (a) => (a._[0] === 'apply' ? 'style-apply' : a._[0] === 'build' ? `style-build-${a.spec}` : a.id || `style-${a.component}@${a.start}`),
    required: (a) => (a._[0] === 'apply' ? ['style'] : a._[0] === 'build' ? ['spec'] : ['style', 'component', 'start', 'duration']),
    inputs: ['spec'],
  },
  // Page builders and audio placers: they write the page too, so they are steps of the plan.
  // Composite runs (marketing-pro build, split-screen build, recipe build) are not: the rcg steps
  // they run are recorded one by one.
  assemble: { track: 'page', key: () => 'assemble', required: [], inputs: [] },
  'marketing-pro': { track: 'audio', edits: (a) => a._[0] === 'audio', key: () => 'marketing-pro-audio', required: [], inputs: [] },
  'split-screen': {
    track: (a) => (a._[0] === 'layout' ? 'page' : 'captions'),
    edits: (a) => ['layout', 'clamp'].includes(a._[0]),
    key: (a) => `split-screen-${a._[0]}`,
    required: [],
    inputs: [],
  },
  infographics: {
    track: (a) => (a._[0] === 'scaffold' ? 'page' : 'audio'),
    edits: (a) => ['scaffold', 'place-voice'].includes(a._[0]),
    key: (a) => `infographics-${a._[0]}`,
    required: [],
    inputs: ['meta', 'music'],
  },
};

/** The item's track for these args. */
export const trackOf = (kind, a) => (typeof kind.track === 'function' ? kind.track(a) : kind.track);

/** The kind for a command and its parsed args, or null when the run does not edit a page. */
export function kindOf(command, a) {
  const k = KINDS[command];
  if (!k || !a.job || a.job === true) return null;
  if (k.edits && !k.edits(a)) return null;
  return k;
}

/** Problems with one item's args: missing required flags. */
export function validate(command, a) {
  const k = KINDS[command];
  if (!k) return [`no kind "${command}" in tools/plan/kinds.mjs`];
  const req = typeof k.required === 'function' ? k.required(a) : k.required;
  return req.filter((f) => a[f] == null || a[f] === true).map((f) => `--${f} is missing`);
}
