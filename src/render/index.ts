import { CARDS, type Card, type Config } from '../config.ts';
import type { Model } from '../compute.ts';
import { renderDisplayContributions } from '../display/contributions.ts';
import { look, type Style } from '../display/dmd.ts';
import { renderDisplayLanguages } from '../display/languages.ts';
import { renderDisplaySummary } from '../display/summary.ts';
import { renderDisplayWeekly } from '../display/weekly.ts';
import { renderAbout } from './about.ts';
import { renderActivity } from './activity.ts';
import { renderContributions } from './contributions.ts';
import { renderDownloads } from './downloads.ts';
import { renderGlance, tileCard } from './glance.ts';
import { renderLanguages, shareCard } from './languages.ts';
import { renderNow } from './now.ts';
import { renderProjects } from './projects.ts';
import { renderReleases } from './releases.ts';
import { renderSummary } from './summary.ts';
import { renderTelemetry } from './telemetry.ts';
import { THEMES, type Mode } from './svg.ts';
import { renderWeekly } from './weekly.ts';
import { renderYears } from './years.ts';

/**
 * File name -> SVG, one light and one dark variant of each card in `config.cards`, in the usual
 * card order. The same names for both styles.
 */
export function renderAll(model: Model, config: Config): Record<string, string> {
  const files: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as Mode[]) {
    let render: Partial<Record<Card, () => string>>;
    if (config.style === 'oled') {
      const style: Style = { look: look(config.color, mode), dots: config.matrix, animations: config.theme.animations, panel: !config.transparent };
      render = {
        summary: () => renderDisplaySummary(model.summary, style),
        languages: () => renderDisplayLanguages(model.languages, config.languages.title, style),
        contributions: () => renderDisplayContributions(model.contributions, config.contributions.title, style),
        weekly: () => renderDisplayWeekly(model.weekly, config.weekly.title, style),
      };
    } else {
      const theme = THEMES[mode];
      render = {
        summary: () => renderSummary(model.summary, theme, config),
        languages: () => renderLanguages(model.languages, theme, config),
        contributions: () => renderContributions(model.contributions, theme, config),
        weekly: () => renderWeekly(model.weekly, theme, config),
        projects: () => renderProjects(model.projects, theme, config),
        activity: () => renderActivity(model.activity, theme, config),
        years: () => renderYears(model.years, theme, config),
        glance: () => renderGlance(model.glance, theme, config),
        releases: () => renderReleases(model.releases, theme, config),
        downloads: () => renderDownloads(model.downloads, theme, config),
        streaks: () => tileCard(config.streaks.title, 'Streaks', model.streaks, theme, config),
        pulls: () => tileCard(config.pulls.title, 'Pull requests', model.pulls, theme, config),
        telemetry: () => renderTelemetry(model.telemetry, theme, config),
        now: () => renderNow(model.now, theme, config),
        about: () => renderAbout(theme, config),
        types: () => shareCard(config.types.title, 'Commit types', 'No commit data yet', model.types, theme, config),
      };
    }
    for (const card of CARDS) if (config.cards.includes(card)) files[`${card}-${mode}.svg`] = render[card]!();
  }
  return files;
}

/** The width each card is shown at in a README. OLED cards are 450 wide, shown at 400 so two fit a row. */
export function cardWidths(config: Config): Record<string, number> {
  return config.style === 'oled'
    ? { summary: 400, languages: 400, contributions: 400, weekly: 400 }
    : { summary: 450, languages: 350, contributions: 450, weekly: 350, projects: 450, glance: 350, releases: 450, streaks: 350, downloads: 450, pulls: 350, activity: 450, years: 350, telemetry: 800, now: 800, types: 350, about: 800 };
}
