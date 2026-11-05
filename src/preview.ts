// A local page showing the cards the way setup.sh lays them out in a profile README (two per
// row at 49%, in a column as wide as GitHub's), on GitHub's light and dark backgrounds.
export function previewHtml(files: string[]): string {
  const picture = (mode: 'light' | 'dark', card: string) =>
    files.includes(`${card}-${mode}.svg`) ? `<img src="${card}-${mode}.svg" width="49%" alt="${card}">` : '';
  const readme = (mode: 'light' | 'dark') => `
<section class="${mode}"><div class="readme">
<p align="center">${picture(mode, 'summary')}
${picture(mode, 'languages')}</p>
<p align="center">${picture(mode, 'contributions')}</p>
</div></section>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Card preview</title>
<style>
  body { margin: 0; }
  section { padding: 24px 16px; }
  .readme { max-width: 830px; margin: 0 auto; }
  .light { background: #ffffff; }
  .dark { background: #0d1117; }
</style>
</head>
<body>
${readme('light')}
${readme('dark')}
<script>
  // Press r to reload the images, so the animations play again.
  addEventListener('keydown', (e) => {
    if (e.key === 'r') document.querySelectorAll('img').forEach((i) => (i.src = i.src.split('?')[0] + '?' + Date.now()));
  });
</script>
</body>
</html>
`;
}
