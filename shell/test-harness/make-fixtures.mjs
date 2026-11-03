// Builds the harness apps' asset directories (git-ignored) from the HTML and CSS
// in fixtures/. home, chat and atlas were saved from the live public pages on
// 2026-11-03. quiz and graph sit behind Access, so quiz.html and graph.html are
// the index pages of a local static build (`npm ci && npm run build` in
// frontend/) of quiz-app 6579d3c and graph-notes f9399ec, origin/main on
// 2026-11-03. Chat is served in two states:
// - as today: each page carries its own bundled boot script and tokens;
// - migrated: boot script and bundled tokens removed (what an app ships after
//   its site-shell PR), so the theme can only come from compose().
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, 'fixtures');
const apps = join(here, 'apps');
const read = (p) => readFileSync(join(fx, p), 'utf8');
const put = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };

// Test-only probe, first in <body>: records what the first frame can show. The
// inline boot and tokens are parsed before it; body content is not.
const PROBE = `<script>window.__firstFrame={theme:document.documentElement.getAttribute('data-theme'),surface:getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),card:getComputedStyle(document.documentElement).getPropertyValue('--card').trim()}</script>`;
const withProbe = (html) => html.replace(/<body([^>]*)>/, `<body$1>${PROBE}`);
const BOOT = /<script>\(function \w+\(\w,\w\)\{if\(!\w\.__siteThemeBoot\)[\s\S]*?<\/script>/;
const stripBoot = (html) => {
  if (!BOOT.test(html)) throw new Error('bundled boot script not found');
  return html.replace(BOOT, '');
};
const stripTokens = (css) => {
  const out = css.replace(/:root,\[data-theme=classic-light\]\{[^}]*\}/, '').replace(/\[data-theme=classic-dark\]\{[^}]*\}/, '');
  if (out.includes('--surface:#')) throw new Error('bundled tokens not fully removed');
  return out;
};

const chatHtml = read('chat.html');
const chatCss = read('css/060d43116cea3511.css');
for (const name of ['home', 'chat', 'chat-migrated', 'quiz', 'graph', 'atlas']) rmSync(join(apps, name, name === 'atlas' ? 'dist' : 'out'), { recursive: true, force: true });

// chat, as today
put(join(apps, 'chat/out/chat-archives.html'), withProbe(chatHtml));
put(join(apps, 'chat/out/_next/static/css/060d43116cea3511.css'), chatCss);
// a 50 KB page (the homepage HTML) and a ~500 KB one, for timing compose()
put(join(apps, 'chat/out/chat-archives/big50.html'), read('home.html'));
const big500 = read('home.html').replace('</main>', `${'<p>filler paragraph for size</p>'.repeat(14500)}</main>`);
put(join(apps, 'chat/out/chat-archives/big500.html'), big500);
// the same bytes as text/plain: the hook passes them through, so timing the
// two isolates what compose() adds
put(join(apps, 'chat/out/chat-archives/big500.txt'), big500);
put(join(apps, 'chat/out/chat-archives/big50.txt'), read('home.html'));

// chat, migrated
const migrated = withProbe(stripBoot(chatHtml));
put(join(apps, 'chat-migrated/out/chat-archives.html'), migrated);
put(join(apps, 'chat-migrated/out/_next/static/css/060d43116cea3511.css'), stripTokens(chatCss));
// the same page plus the one-time :where(:root) fallback (README, 'Wiring an app')
const FALLBACK = readFileSync(join(here, '../generated/fallback.css'), 'utf8').trim();
put(join(apps, 'chat-migrated/out/chat-archives/with-fallback.html'), migrated.replace('</head>', `<style>${FALLBACK}</style></head>`));

// home, as today, at the root
put(join(apps, 'home/out/index.html'), read('home.html'));

// quiz, as today
put(join(apps, 'quiz/out/index.html'), read('quiz.html'));

// graph, as today, with the proposed service worker
put(join(apps, 'graph/out/index.html'), read('graph.html'));
put(join(apps, 'graph/out/sw.js'), readFileSync(join(here, 'sw-proposed.js'), 'utf8').replace("'__VERSION__'", "'v1'").replace('__FILES__', JSON.stringify(['/graph/'])));

// atlas, as today (bundled), at its full public path
for (const [file, page] of [['atlas.html', 'index.html'], ['atlas-state.html', 'state/index.html']]) {
  put(join(apps, 'atlas/dist/elections/india', page), withProbe(read(file)));
}
for (const css of ['274c034f0c047d45.css', '13b38e94e53ac10d.css']) {
  cpSync(join(fx, 'css', css), join(apps, 'atlas/dist/elections/india/_next/static/css', css));
}
console.log('fixtures written');
