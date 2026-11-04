// A local page showing every card on GitHub's light and dark backgrounds.
export function previewHtml(files: string[]): string {
  const cards = (mode: 'light' | 'dark') =>
    files
      .filter((f) => f.endsWith(`-${mode}.svg`))
      .map((f) => `<figure><img src="${f}"><figcaption>${f}</figcaption></figure>`)
      .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Card preview</title>
<style>
  body { margin: 0; font: 13px -apple-system, 'Segoe UI', sans-serif; }
  section { padding: 24px; display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  .light { background: #ffffff; color: #59636e; }
  .dark { background: #0d1117; color: #9198a1; }
  figure { margin: 0; }
  figcaption { margin-top: 6px; }
  img { display: block; max-width: 100%; }
</style>
</head>
<body>
<section class="light">${cards('light')}</section>
<section class="dark">${cards('dark')}</section>
<script>
  // Reload the images so the animations play again: ?replay or press r.
  addEventListener('keydown', (e) => {
    if (e.key === 'r') document.querySelectorAll('img').forEach((i) => (i.src = i.src.split('?')[0] + '?' + Date.now()));
  });
</script>
</body>
</html>
`;
}
