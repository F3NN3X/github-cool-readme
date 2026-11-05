import type { Config } from '../config.ts';
import { CARD_HEIGHT, CONTENT_TOP, FULL as WIDTH, HEADER_Y, PAD, TEXT, card, esc, fadeIn, headerText, truncate, type Theme } from './svg.ts';

const TEXT_ROOM = 490; // in textWidth's estimate, which runs wide: about 390px on screen
const FACTS_X = 430;
const FACTS_ROOM = 440;
const FACT_ROW = 46;
const LINE = 22;

export function renderAbout(theme: Theme, config: Config): string {
  const { title, headline, lines, facts } = config.about;
  const header = title ? headerText(title, PAD) : '';
  const entries = Object.entries(facts);
  if (!headline && !lines.length && !entries.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'About', desc: 'Nothing here yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">Nothing here yet</text>`,
    });
  }

  const textTop = headline ? 46 : 14;
  const intro = fadeIn(
    PAD,
    CONTENT_TOP,
    0,
    (headline ? `<text y="20" style="font-size: 22px; font-weight: 700;">${esc(truncate(headline, TEXT_ROOM, 22, true))}</text>` : '') +
      lines.map((line, i) => `<text y="${textTop + i * LINE}" class="label secondary">${esc(truncate(line, TEXT_ROOM, TEXT))}</text>`).join(''),
    config,
  );

  const rows = entries
    .map(([label, text], i) =>
      fadeIn(
        FACTS_X,
        CONTENT_TOP + i * FACT_ROW,
        i + 1,
        `<text y="11" class="col">${esc(label.toUpperCase())}</text>` +
          `<text y="30" class="label">${esc(truncate(text, FACTS_ROOM, TEXT))}</text>`,
        config,
      ),
    )
    .join('\n');

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'About',
    desc: [headline, ...lines, ...entries.map(([label, text]) => `${label}: ${text}`)].filter(Boolean).join(' '),
    theme,
    config,
    body: header + `<line x1="${FACTS_X - 24}" y1="${HEADER_Y - 8}" x2="${FACTS_X - 24}" y2="${CARD_HEIGHT - PAD}" stroke="${theme.track}"/>\n` + intro + '\n' + rows,
  });
}
