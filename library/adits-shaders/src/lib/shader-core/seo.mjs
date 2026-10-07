// Page identity for the gallery: titles, descriptions, keywords and URLs.
//
// Plain ESM so the three consumers agree on every string: the React app (via
// Vite), scripts/seo-pages.mjs which prerenders one HTML file per shader, and
// scripts/og-images.mjs which names the social cards. A shader page's metadata
// is derived entirely from the shader's own header, so publishing a shader
// stays a one-file job.

/** Canonical origin. Override with SITE_ORIGIN when building for another host. */
export const SITE_ORIGIN = 'https://shaders.adits.app';

export const SITE_NAME = 'Adits Shaders';

export const SITE_TAGLINE = 'Audio-reactive shader objects for the Adits video engine';

export const SITE_DESCRIPTION =
  'Downloadable, audio-reactive generative shader objects for the Adits video engine. '
  + 'Preview live, orbit with the camera, download one file, drop it into Adits.';

/** Keywords that describe the site itself, prepended to a shader's own tags. */
export const SITE_KEYWORDS = [
  'shader',
  'GLSL',
  'audio-reactive',
  'generative art',
  'visuals',
  'Adits',
];

/** Google truncates around here, so compose to fit rather than getting cut. */
export const DESCRIPTION_LIMIT = 158;

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** "acid-urchin-armillary" -> "Acid Urchin Armillary" */
export function titleFromSlug(slug) {
  return String(slug)
    .split(/[-_]+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Root-relative path of a shader's page. Keep in step with the router. */
export function shaderPath(id) {
  return `/shader/${encodeURIComponent(id)}`;
}

/**
 * Root-relative path of a shader page's Markdown mirror. Same content as the
 * page, in the form a text-extraction pipeline handles without guessing. The
 * HTML page links to it with rel="alternate"; it points back with an HTTP
 * Link: rel="canonical" header, so the pair is not read as duplicate content.
 */
export function shaderMarkdownPath(id) {
  return `/shader/${encodeURIComponent(id)}.md`;
}

/**
 * Standalone documents the site serves besides the gallery and the shader
 * pages. These are real content rather than alternates of a page, so they
 * belong in the sitemap. llms.md is the hand-written reference; llms.txt and
 * llms-full.txt are generated from it at build time.
 */
export const DOC_PATHS = [
  "/shader-guide.md",
  "/skill.md",
  "/llms.md",
  // /llms.txt is deliberately absent. It is byte-for-byte the same document as
  // /llms.md, and a sitemap lists canonical URLs, so listing both would offer
  // a crawler two URLs for one document. The generated _headers names the .md
  // as the canonical of the pair. /llms-full.txt is listed because it carries
  // the corpus index and is therefore its own document.
  "/llms-full.txt",
];

/** Absolute URL for a root-relative path. */
export function absoluteUrl(path, origin = SITE_ORIGIN) {
  return origin.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path);
}

/**
 * Trim to a length a search result will actually show, breaking on a word so
 * the snippet does not end mid-token. Collapses whitespace first.
 */
export function clampDescription(text, limit = DESCRIPTION_LIMIT) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '') + '…';
}

/**
 * The questions a reader or an answer engine actually asks, with answers short
 * enough to be quoted whole.
 *
 * Every fact here is already stated in public/shader-guide.md or public/llms.md;
 * nothing is asserted that those two do not say, and the guide stays the
 * authority if they ever disagree. Deliberately absent: anything about
 * licensing, which the repository owner has not settled.
 *
 * One definition, three consumers. The React app renders it on the gallery
 * page, scripts/seo-pages.mjs emits it as FAQPage structured data, and the same
 * script writes it into the prerendered fallback. A crawler and a reader
 * therefore see the same words, which is the whole point.
 */
export const SITE_FAQ = [
  {
    question: 'What is an Adits shader object?',
    answer:
      'One file that draws one object. It holds a JSON header comment followed by a GLSL ES '
      + '1.00 fragment shader, and it draws a single object centred on transparent black with '
      + 'premultiplied alpha, so the Adits video engine can composite it into a 3D scene over '
      + 'live footage. There is no scene, no background and no second object in the file.',
  },
  {
    question: 'What does audio-reactive mean here?',
    answer:
      'The host injects the sound as uniforms the shader can read: bass, mid, treble, volume '
      + 'and an auto-gained level, decaying pulses for beat, kick, snare and hat, and a '
      + '24-band log-spaced spectrum. All are clamped 0 to 1 and smoothed before the shader '
      + 'sees them. Any numeric control can also be bound to one of those sources, in which '
      + 'case its panel value acts as a floor and the sound pushes it toward the maximum.',
  },
  {
    question: 'Does a shader still look right in silence?',
    answer:
      'Yes, and that is a requirement rather than a nicety. With no audio every audio uniform '
      + 'reads 0.0 and every bound control sits exactly at its declared default, so the '
      + 'defaults have to be the finished look. Sound adds recoil, flash and swell on top of a '
      + 'design that is already complete without it.',
  },
  {
    question: 'How do I use one?',
    answer:
      'Press Download on any shader page, then drop the file onto the Adits shader panel. The '
      + 'labelled controls, the audio binding and the hand-tracking binding all come from the '
      + "file's own header, so there is nothing to wire up and no account or API key involved.",
  },
  {
    question: 'What do the low, medium and high cost labels mean?',
    answer:
      'They set the default preview resolution: low renders at 1024 by 1024, medium at 768, '
      + 'high at 512. Every shader is written against a budget of roughly 2 ms at 512 by 512 '
      + 'on integrated graphics, so the label tells you how much of that budget the object '
      + 'spends rather than how good it looks.',
  },
  {
    question: 'Who writes these shaders?',
    answer:
      'AI agents, working against a strict authoring guide and publishing by pull request. '
      + 'Each file names its own author in a CREDIT field. Two gates run before anything '
      + 'merges: a validator for the guide\u2019s mechanical rules, and a real GLSL compile in a '
      + 'headless browser. Whether a shader actually looks good stays a human judgement.',
  },
];

/** Where the corpus lives. Used as codeRepository in the structured data. */
export const REPO_URL = 'https://github.com/iftiaj-com/AditsShaders';

/** The Adits product this gallery belongs to. */
export const ORG_NAME = 'Adits';
export const ORG_URL = 'https://adits.app';
export const LOGO_PATH = '/adits-logo.png';

/**
 * The "Open in Adits" deep link for one shader: opens the app with this shader
 * already compiled into the Anamorphic 3D scene, so the visitor skips the
 * download and the import menu entirely.
 *
 * Lives here rather than in lib/download.ts because two consumers need the same
 * string: the React buttons, and scripts/seo-pages.mjs, which emits it as a
 * plain anchor in the prerendered no-JavaScript fallback. An .mjs build script
 * cannot import the TypeScript module, so this is the shared home.
 *
 * A SLUG, never the source and never a full URL. Adits' Worker maps the slug
 * back to /shaders/<slug>.glsl with the upstream origin fixed server side, so
 * the link cannot be rewritten into "make Adits compile this arbitrary GLSL".
 * It also means a shared link always serves the current version of the shader,
 * which a self-contained payload in the URL fragment could not do.
 */
export function aditsDeepLink(id, origin = ORG_URL) {
  return `${origin}/?shader=${encodeURIComponent(id)}`;
}

/** Matches the zinc-950 the app paints its background with. */
export const THEME_COLOR = '#09090b';

/**
 * Stable node identifiers for the structured data.
 *
 * Every page emits the same Organization and WebSite nodes under these ids and
 * points at them, which is what makes the 35 pages one entity rather than 35
 * unrelated documents. The ids are fragment URLs on the origin: conventional
 * for schema.org, and they never resolve to a request.
 */
export function orgId(origin = SITE_ORIGIN) {
  return absoluteUrl('/', origin) + '#org';
}
export function websiteId(origin = SITE_ORIGIN) {
  return absoluteUrl('/', origin) + '#website';
}

/**
 * The Organization and WebSite nodes, for the head of every page's @graph.
 *
 * No potentialAction/SearchAction: the gallery's search is client-side state
 * with no URL of its own, so declaring a search endpoint would describe a
 * route that does not exist. Add it if search ever takes a query parameter.
 */
export function siteGraph(origin = SITE_ORIGIN) {
  return [
    {
      '@type': 'Organization',
      '@id': orgId(origin),
      name: ORG_NAME,
      url: ORG_URL,
      logo: absoluteUrl(LOGO_PATH, origin),
    },
    {
      '@type': 'WebSite',
      '@id': websiteId(origin),
      name: SITE_NAME,
      alternateName: SITE_TAGLINE,
      description: SITE_DESCRIPTION,
      url: absoluteUrl('/', origin),
      inLanguage: 'en',
      publisher: { '@id': orgId(origin) },
    },
  ];
}

/**
 * Path of a shader's social card, and of the fallback every page can use.
 *
 * JPEG rather than PNG: these are 1200x630 photographic-looking renders over an
 * opaque gradient, where PNG bought nothing and cost 500 to 700 KB each, about
 * 20 MB across the corpus. Quality 85 lands near 60 KB.
 *
 * JPEG rather than WebP, even though the posters below are WebP: an OG image is
 * fetched by other companies' link unfurlers, and JPEG is the one format all of
 * them have always handled. A poster is fetched by a browser, where WebP is
 * universal. Different consumers, different safe answer.
 */
export const OG_IMAGE_EXT = 'jpg';
export const OG_FALLBACK_PATH = `/og/default.${OG_IMAGE_EXT}`;
export function ogImagePath(id) {
  return `/og/${id}.${OG_IMAGE_EXT}`;
}

/**
 * Poster frames: what a gallery card shows before its WebGL canvas has drawn,
 * and the only images on the site a crawler can index.
 *
 * Square, because the card is square. 640 gives a 2x pixel ratio at the roughly
 * 264 px a card occupies in the four-column grid. Drawn with transparency and
 * no baked background, so a poster composites over the card's CSS backdrop
 * exactly as the live canvas does.
 */
export const POSTER_SIZE = 640;
export function posterPath(id) {
  return `/posters/${id}.webp`;
}

/**
 * The 1x variant of a poster, offered alongside the 640 through srcset.
 *
 * 640 is right for a 2x display and twice what a 1x one can show, and a card
 * grid pays that cost once per card: at 100 per page the posters alone were
 * several megabytes. The browser picks per device, so a retina reader still
 * gets the sharp file and nobody else downloads it.
 *
 * Downscaled from the committed 640 by scripts/posters.mjs rather than drawn
 * separately, so the two can never show different frames of the same object.
 */
export const POSTER_THUMB_SIZE = 320;
export function posterThumbPath(id) {
  return `/posters/${id}@${POSTER_THUMB_SIZE}.webp`;
}

/**
 * Alt text for a poster. The description is the shader's own sentence, so this
 * says what the image shows rather than repeating the title twice.
 */
export function posterAlt(entry) {
  const title = entry.title || titleFromSlug(entry.id);
  const description = entry.meta?.description;
  return description ? `${title}: ${clampDescription(description, 120)}` : title;
}

/**
 * Everything a shader page needs in its head, derived from the shader header.
 *
 * @param {{ id: string, title?: string, meta: object }} entry
 * @param {{ origin?: string, hasOwnImage?: boolean }} [options]
 */
export function shaderSeo(entry, options = {}) {
  const origin = options.origin ?? SITE_ORIGIN;
  const title = entry.title || titleFromSlug(entry.id);
  const meta = entry.meta ?? {};
  const categories = Array.isArray(meta.categories) ? meta.categories : [];
  const path = shaderPath(entry.id);

  // The shader's own tags first: they are the specific terms, and the generic
  // site words only help once a page has something specific to attach them to.
  const keywords = [...new Set([...categories, title.toLowerCase(), ...SITE_KEYWORDS])]
    .filter(Boolean);

  return {
    path,
    url: absoluteUrl(path, origin),
    title: `${title} · ${SITE_NAME}`,
    heading: title,
    description: clampDescription(meta.description || `${title}, an audio-reactive shader object for Adits.`),
    keywords,
    image: absoluteUrl(options.hasOwnImage ? ogImagePath(entry.id) : OG_FALLBACK_PATH, origin),
    credit: typeof meta.credit === 'string' ? meta.credit : '',
    date: typeof meta.date === 'string' ? meta.date : '',
    cost: meta.cost ?? '',
    categories,
  };
}

/** The gallery's own head, for symmetry with shaderSeo. */
export function gallerySeo(options = {}) {
  const origin = options.origin ?? SITE_ORIGIN;
  return {
    path: '/',
    url: absoluteUrl('/', origin),
    title: `${SITE_NAME} · audio-reactive shader objects`,
    description: clampDescription(SITE_DESCRIPTION),
    keywords: [...SITE_KEYWORDS, 'shader gallery', 'shader download'],
    image: absoluteUrl(OG_FALLBACK_PATH, origin),
  };
}
