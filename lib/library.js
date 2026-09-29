import fs from 'fs';
import path from 'path';
import { Marked } from 'marked';

/**
 * THE LEAGUE LIBRARY -- the three governing documents, read in the app.
 * September 29, 2026.
 *
 * WHAT THIS IS. The Rule Book, the Technical Manual and the Owner How-To
 * Manual, rendered from the markdown files in content/library/. Those files
 * are VERBATIM copies of the current documents in the commissioner's EDFL
 * folder -- they are never edited here. Updating a document is a file swap:
 * replace the .md (and, for the Rule Book, the .docx) and deploy. The version
 * and date on the index page are read out of the file itself, so they cannot
 * drift from the text.
 *
 * WHY THE FILES LIVE IN content/ AND NOT public/. R-7: the app has no public
 * face. Anything in public/ that ends in .jpg is excluded by the middleware
 * matcher and served to anybody, and the How-To screenshots are pictures of
 * the live app -- rosters, cap figures, team names. So every byte here goes
 * out through a route under /library, and every one of those routes checks
 * the session itself as well as sitting behind middleware.js.
 *
 * WHY next.config.js HAD TO CHANGE. These files are read with fs at request
 * time. Vercel only ships a file to a serverless function if the build's
 * file tracer sees it used; outputFileTracingIncludes in next.config.js names
 * content/library/ for every /library route so it is never left behind. If a
 * library page ever deploys and 500s with ENOENT, that entry is why.
 *
 * SAFETY OF THE MARKDOWN. The documents are ours, but raw HTML in them is
 * escaped rather than passed through anyway: a stray <tag> in a manual
 * should print as text, never become markup.
 *
 * ANCHORS. A numbered heading gets id "s-" + its number with dots as dashes:
 *   RB 5.17  ->  /library/rule-book#s-5-17
 *   HT 5.4   ->  /library/how-to#s-5-4
 *   TM 5.17  ->  /library/technical-manual#s-5-17
 * The documents promise stable section numbers (Rule Book "Numbering",
 * How-To "How sections are addressed"), so these links are stable too. Robo
 * Goodell and Discord can link straight to a section. DO NOT change the
 * scheme without a redirect plan -- links to it will be pasted in Discord.
 */

export const LIBRARY_DOCS = [
  {
    slug: 'rule-book',
    file: 'rule-book.md',
    title: 'Rule Book',
    fullTitle: 'EDFL Rule Book',
    answers: 'What are the rules?',
    blurb:
      'The rules of play. What is allowed, what things cost, and when deadlines fall. The Rule Book governs: where either manual differs from it, the Rule Book is right.',
    downloads: [
      { format: 'docx', label: 'Word (.docx)' },
      { format: 'md', label: 'Text (.md)' },
    ],
  },
  {
    slug: 'how-to',
    file: 'how-to.md',
    title: 'Owner How-To Manual',
    fullTitle: 'EDFL Owner How-To Manual',
    answers: 'How do I do a thing in the app?',
    blurb:
      'Where to click and what happens when you do, with screenshots and decision trees. Every section cites the rule it serves.',
    downloads: [{ format: 'md', label: 'Text (.md)' }],
  },
  {
    slug: 'technical-manual',
    file: 'technical-manual.md',
    title: 'Technical Manual',
    fullTitle: 'EDFL Technical Manual',
    answers: 'How does the app work, and how does it enforce the rules?',
    blurb:
      'How the league app is built and how it enforces each rule, numbered to match the Rule Book. Explains why things were built the way they were.',
    downloads: [{ format: 'md', label: 'Text (.md)' }],
  },
];

// Download filenames. Stable, unversioned -- the version is inside the file.
const DOWNLOAD_FILES = {
  'rule-book': {
    docx: { file: 'rule-book.docx', name: 'EDFL_Rule_Book.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    md: { file: 'rule-book.md', name: 'EDFL_Rule_Book.md', type: 'text/markdown; charset=utf-8' },
  },
  'how-to': {
    md: { file: 'how-to.md', name: 'EDFL_Owner_HowTo_Manual.md', type: 'text/markdown; charset=utf-8' },
  },
  'technical-manual': {
    md: { file: 'technical-manual.md', name: 'EDFL_Technical_Manual.md', type: 'text/markdown; charset=utf-8' },
  },
};

// The one place the directory is named. process.cwd() is the project root on
// Vercel and locally; the tracer include in next.config.js mirrors this path.
function libraryDir() {
  return path.join(process.cwd(), 'content', 'library');
}

export function findDoc(slug) {
  for (let i = 0; i < LIBRARY_DOCS.length; i++) {
    if (LIBRARY_DOCS[i].slug === slug) return LIBRARY_DOCS[i];
  }
  return null;
}

export function readDownload(slug, format) {
  const byDoc = DOWNLOAD_FILES[slug];
  if (!byDoc) return null;
  const entry = byDoc[format];
  if (!entry) return null;
  const bytes = fs.readFileSync(path.join(libraryDir(), entry.file));
  return { bytes, name: entry.name, type: entry.type };
}

// A figure name is the screenshot's filename without ".jpg". Validated by
// pattern AND by existence, so nothing outside figures/ can ever be named.
const FIGURE_NAME = /^EDFL_HowTo_\d{2}_[A-Za-z0-9_]+$/;

export function readFigure(name) {
  if (typeof name !== 'string' || !FIGURE_NAME.test(name)) return null;
  const dir = path.join(libraryDir(), 'figures');
  const file = path.join(dir, name + '.jpg');
  if (path.dirname(file) !== dir) return null;
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripMarkdown(raw) {
  return String(raw)
    .replace(/\*\*|__|\*|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

// "HT 5.4 Injured reserve" -> "5-4"; "5.17 Poaching" -> "5-17";
// "1. General" -> "1"; "1.6–1.7 Rule changes" -> "1-6". Null if unnumbered.
function sectionNumber(plain) {
  const m = /^(?:HT\s+)?(\d+(?:\.\d+)*)\.?(?=[\s–—-]|$)/.exec(plain);
  if (!m) return null;
  return m[1].replace(/\./g, '-');
}

function slugify(plain) {
  const s = plain
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'section';
}

// Screenshots are referenced in the How-To as ../League%20Images/How-To/X.jpg,
// a path that only means something in the commissioner's folder. Rewrite to
// the gated figure route.
function figureHref(href) {
  const decoded = decodeURIComponent(String(href || ''));
  const m = /League Images\/How-To\/([A-Za-z0-9_]+)\.jpg$/.exec(decoded);
  if (!m) return null;
  return '/library/figures/' + m[1];
}

function versionOf(markdown) {
  const m = /\*\*Version\s+([^—*]+?)\s+—\s+([^*]+?)\*\*/.exec(markdown);
  if (!m) return { version: null, date: null };
  return { version: m[1].trim(), date: m[2].trim() };
}

const cache = new Map();

/**
 * Renders one document. Returns
 *   { doc, html, toc, version, date, ids, sections }
 * sections is every numbered heading as { id, label } -- the list the
 * feedback form offers.
 * where toc is [{ id, text, level, children: [...] }] grouped under each
 * level-1 heading. Cached per server instance: the files cannot change
 * without a deploy, and a deploy is a new instance.
 */
export function loadDoc(slug, crossLinkIds) {
  const doc = findDoc(slug);
  if (!doc) return null;
  const cacheKey = slug + (crossLinkIds ? ':x' : '');
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const markdown = fs.readFileSync(path.join(libraryDir(), doc.file), 'utf8');
  const { version, date } = versionOf(markdown);

  const used = new Set();
  const headings = [];
  const sections = [];
  const tocDepth = slug === 'technical-manual' ? 3 : 2;

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading(text, level, raw) {
        const plain = stripMarkdown(raw);
        const num = sectionNumber(plain);
        let id = num ? 's-' + num : slugify(plain);
        let n = 2;
        const base = id;
        while (used.has(id)) {
          id = base + '-' + n;
          n += 1;
        }
        used.add(id);
        headings.push({ id, text: plain, level });

        // Technical Manual sections are numbered to match the Rule Book
        // (TM 5.17 enforces RB 5.17). Where the Rule Book has that exact
        // section, offer the jump.
        let cross = '';
        if (crossLinkIds && num && level >= 2 && crossLinkIds.has('s-' + num)) {
          cross =
            ' <a class="lib-xref" href="/library/rule-book#s-' +
            num +
            '">Rule Book ' +
            escapeHtml(num.replace(/-/g, '.')) +
            '</a>';
        }
        // Numbered sections can take feedback. The link preselects the
        // section in the feedback form at the foot of the page; the page
        // reads ?section= on the server, so it works without JavaScript.
        let fb = '';
        if (num) {
          sections.push({ id, label: plain });
          fb = ' <a class="lib-fblink" href="?section=' + id + '#feedback">Feedback</a>';
        }
        return (
          '<h' + level + ' id="' + id + '" class="lib-h">' +
          '<a class="lib-anchor" href="#' + id + '" aria-label="Link to this section">#</a>' +
          text + cross + fb +
          '</h' + level + '>\n'
        );
      },
      image(href, title, text) {
        const src = figureHref(href);
        if (!src) {
          return '<span class="lib-missing">[' + escapeHtml(text || 'image') + ']</span>';
        }
        return (
          '<a class="lib-figure" href="' + src + '" target="_blank" rel="noopener">' +
          '<img src="' + src + '" alt="' + escapeHtml(text || '') + '" loading="lazy" />' +
          '</a>'
        );
      },
      html(html) {
        // marked 12 passes a string here.
        return escapeHtml(typeof html === 'string' ? html : (html && html.text) || '');
      },
      link(href, title, text) {
        const h = String(href || '');
        const external = /^https?:\/\//i.test(h);
        return (
          '<a href="' + escapeHtml(h) + '"' +
          (title ? ' title="' + escapeHtml(title) + '"' : '') +
          (external ? ' target="_blank" rel="noopener noreferrer"' : '') +
          '>' + text + '</a>'
        );
      },
    },
  });

  let html = marked.parse(markdown);
  // Wide tables scroll inside their own box instead of widening the page.
  html = html.replace(/<table>/g, '<div class="lib-table"><table>').replace(/<\/table>/g, '</table></div>');

  // Table of contents. The first two headings are the document's title block
  // ("EL DYNASTY FUTBOL LEAGUE-O" / "EDFL RULE BOOK") and are not sections.
  const body = headings.slice(2).filter((h) => h.level <= tocDepth);
  const toc = [];
  let group = null;
  for (const h of body) {
    if (h.level === 1) {
      group = { id: h.id, text: h.text, level: 1, children: [] };
      toc.push(group);
    } else {
      if (!group) {
        group = { id: null, text: 'Introduction', level: 1, children: [] };
        toc.push(group);
      }
      group.children.push(h);
    }
  }

  const result = { doc, html, toc, version, date, ids: used, sections };
  cache.set(cacheKey, result);
  return result;
}

/** Version and date of every document, for the index page. */
export function libraryIndex() {
  return LIBRARY_DOCS.map((doc) => {
    const markdown = fs.readFileSync(path.join(libraryDir(), doc.file), 'utf8');
    const { version, date } = versionOf(markdown);
    return { ...doc, version, date };
  });
}
