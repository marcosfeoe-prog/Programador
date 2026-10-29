// Gera as imagens recortadas (fundo transparente) dos carros e das caixas.
// Uso (na raiz do repositório):  node garagem/tools/render.mjs [id ...]
// Requer Playwright + Chromium. Sobe um servidor estático temporário.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.resolve(here, '../assets');
const port = 8000 + Math.floor(Math.random() * 900);

const server = spawn(process.execPath, [path.join(root, 'server.js'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
try {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(`http://localhost:${port}/garagem/tools/render.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  const args = process.argv.slice(2);
  const missing = args.includes('--missing');
  const only = args.filter((a) => a !== '--missing');
  const carIds = await page.evaluate(() => window.carIds);
  const boxIds = await page.evaluate(() => window.boxIds);
  const save = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  for (const id of carIds) {
    if (missing && fs.existsSync(path.join(out, 'cars', `${id}.webp`))) continue;
    if (!missing && only.length && !only.includes(id) && !only.includes('cars')) continue;
    const t = Date.now();
    save(path.join(out, 'cars', `${id}.webp`), await page.evaluate((i) => window.renderCar(i), id));
    console.log('carro', id, Date.now() - t, 'ms');
  }
  for (const id of boxIds) {
    if (missing && fs.existsSync(path.join(out, 'boxes', `${id}.webp`))) continue;
    if (!missing && only.length && !only.includes(id) && !only.includes('boxes')) continue;
    save(path.join(out, 'boxes', `${id}.webp`), await page.evaluate((i) => window.renderBox(i), id));
    console.log('caixa', id);
  }
  await browser.close();
} finally {
  server.kill();
}
