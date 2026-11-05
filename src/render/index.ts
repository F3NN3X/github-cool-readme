import type { Config } from '../config.ts';
import type { Model } from '../compute.ts';
import { renderDisplayContributions } from '../display/contributions.ts';
import { look, type Style } from '../display/dmd.ts';
import { renderDisplayLanguages } from '../display/languages.ts';
import { renderDisplaySummary } from '../display/summary.ts';
import { renderDisplayWeekly } from '../display/weekly.ts';
import { renderContributions } from './contributions.ts';
import { renderLanguages } from './languages.ts';
import { renderSummary } from './summary.ts';
import { THEMES, type Mode } from './svg.ts';
import { renderWeekly } from './weekly.ts';

/** File name -> SVG, one light and one dark variant per card. The same names for both styles. */
export function renderAll(model: Model, config: Config): Record<string, string> {
  const files: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as Mode[]) {
    if (config.style === 'oled') {
      const style: Style = { look: look(config.color, mode), dots: config.matrix, animations: config.theme.animations };
      files[`summary-${mode}.svg`] = renderDisplaySummary(model.summary, style);
      files[`languages-${mode}.svg`] = renderDisplayLanguages(model.languages, config.languages.title, style);
      files[`contributions-${mode}.svg`] = renderDisplayContributions(model.contributions, config.contributions.title, style);
      files[`weekly-${mode}.svg`] = renderDisplayWeekly(model.weekly, config.weekly.title, style);
      continue;
    }
    const theme = THEMES[mode];
    files[`summary-${mode}.svg`] = renderSummary(model.summary, theme, config);
    files[`languages-${mode}.svg`] = renderLanguages(model.languages, theme, config);
    files[`contributions-${mode}.svg`] = renderContributions(model.contributions, theme, config);
    files[`weekly-${mode}.svg`] = renderWeekly(model.weekly, theme, config);
  }
  return files;
}

/** The width each card is shown at in a README. OLED cards are 450 wide, shown at 400 so two fit a row. */
export function cardWidths(config: Config): Record<string, number> {
  return config.style === 'oled'
    ? { summary: 400, languages: 400, contributions: 400, weekly: 400 }
    : { summary: 450, languages: 350, contributions: 450, weekly: 350 };
}
