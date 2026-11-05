import type { Config } from '../config.ts';
import type { Model } from '../compute.ts';
import { renderContributions } from './contributions.ts';
import { renderLanguages } from './languages.ts';
import { renderSummary } from './summary.ts';
import { renderWeekly } from './weekly.ts';
import { THEMES, type Mode } from './svg.ts';

/** File name -> SVG, one light and one dark variant per card. */
export function renderAll(model: Model, config: Config): Record<string, string> {
  const files: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as Mode[]) {
    const theme = THEMES[mode];
    files[`summary-${mode}.svg`] = renderSummary(model.summary, theme, config);
    files[`languages-${mode}.svg`] = renderLanguages(model.languages, theme, config);
    files[`contributions-${mode}.svg`] = renderContributions(model.contributions, theme, config);
    files[`weekly-${mode}.svg`] = renderWeekly(model.weekly, theme, config);
  }
  return files;
}
