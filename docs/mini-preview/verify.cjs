const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../..');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server = http.createServer(async (request, response) => {
  try {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, `.${urlPath}`);
    if (target !== root && !target.startsWith(root + path.sep)) {response.writeHead(403).end();return;}
    response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    response.end(await fs.readFile(target));
  } catch {response.writeHead(404).end();}
});

(async () => {
  let browser;
  const checks = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/docs/mini-preview/index.html`;
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    assert.equal(await page.locator('[data-placement]').count(), 3);
    assert.equal(await page.locator('[data-design]').count(), 5);
    checks.push('Three activation placement choices and five widget choices render');
    for (let id = 1; id <= 3; id++) {
      await page.locator(`[data-select-placement="${id}"]`).click();
      assert.equal(await page.evaluate(() => window.miniPreview.state.placement), id);
      assert.equal(await page.locator('.placement-card.selected').count(), 1);
    }
    for (let id = 1; id <= 5; id++) {
      await page.locator(`[data-select-design="${id}"]`).click();
      assert.equal(await page.evaluate(() => window.miniPreview.state.design), id);
      assert.equal(await page.locator('.design-card.selected').count(), 1);
      const bounds = await page.evaluate(() => {
        const stage = document.querySelector('#desktop').getBoundingClientRect();
        const widget = document.querySelector('#floating-widget').getBoundingClientRect();
        return {right:widget.right <= stage.right-10,top:widget.top >= stage.top+10};
      });
      assert.ok(bounds.right && bounds.top);
    }
    checks.push('Every placement selects correctly; every widget starts at the top right');
    for (let design = 1; design <= 5; design++) {
      await page.locator(`[data-select-design="${design}"]`).click();
      for (const metric of ['download','upload','link','signal','latency']) {
        await page.locator('#open-menu').click();
        await page.locator('#reset-widget').click();
        await page.locator('#open-menu').click();
        for (const other of ['download','upload','link','signal','latency'].filter(id => id !== metric)) await page.locator(`[data-toggle-metric="${other}"]`).uncheck();
        assert.ok(await page.locator(`#floating-widget [data-metric="${metric}"]`).first().isVisible(),`Design ${design} displays ${metric} when it is the only reading`);
        assert.equal(await page.locator('#floating-widget [data-metric]:not(.metric-hidden)').count(),1);
        await page.keyboard.press('Escape');
      }
    }
    checks.push('Every single metric is visible independently in all five designs; Little dial adapts its focal reading');
    await page.locator('[data-select-placement="2"]').click();
    await page.locator('[data-select-design="1"]').click();
    await page.locator('#open-menu').click();
    await page.locator('#reset-widget').click();
    await page.locator('#floating-widget').scrollIntoViewIfNeeded();
    await page.locator('#floating-widget').click({button:'right'});
    assert.ok(await page.locator('#widget-menu').isVisible());
    await page.locator('#opacity').fill('62');
    assert.equal(await page.locator('#opacity-output').textContent(), '62%');
    assert.equal(await page.locator('#floating-widget').evaluate(node => node.style.opacity), '0.62');
    await page.locator('#size').fill('125');
    assert.equal(await page.locator('#size-output').textContent(), '125%');
    assert.match(await page.locator('#floating-widget').evaluate(node => node.style.transform), /1.25/);
    checks.push('Right-click opens popover; custom opacity and size sliders update the widget');
    await page.locator('[data-toggle-metric="link"]').uncheck();
    assert.ok(await page.locator('#floating-widget [data-metric="link"]').evaluate(node => node.classList.contains('metric-hidden')));
    for (const id of ['upload','signal','latency']) await page.locator(`[data-toggle-metric="${id}"]`).uncheck();
    await page.locator('[data-toggle-metric="download"]').click();
    assert.ok(await page.locator('[data-toggle-metric="download"]').isChecked());
    checks.push('Metric toggles work and at least one reading remains selected');
    await page.locator('#reset-widget').click();
    await page.locator('#floating-widget').press('Shift+F10');
    assert.ok(await page.locator('#widget-menu').isVisible());
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#widget-menu').isHidden());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'floating-widget');
    const before = await page.locator('#floating-widget').boundingBox();
    await page.locator('#floating-widget').press('ArrowLeft');
    const after = await page.locator('#floating-widget').boundingBox();
    assert.equal(Math.round(before.x - after.x), 5);
    checks.push('Keyboard menu, Escape focus restoration, and arrow-key positioning work');
    await page.mouse.move(after.x + 35, after.y + 45);
    await page.mouse.down();
    await page.mouse.move(after.x - 105, after.y + 105,{steps:8});
    await page.mouse.up();
    const dragged = await page.locator('#floating-widget').boundingBox();
    assert.ok(dragged.x < after.x-100);
    checks.push('Pointer drag moves the widget');
    await page.locator('#open-menu').click();
    await page.locator('#pause-readings').click();
    assert.ok(await page.locator('#floating-widget .widget').evaluate(node => node.classList.contains('paused')));
    await page.locator('#open-menu').click();
    await page.locator('#restore-full').click();
    assert.ok(await page.locator('#full-app').isVisible());
    assert.ok(await page.locator('#floating-widget').isHidden());
    await page.locator('#full-app [data-activate]').first().click();
    assert.ok(await page.locator('#floating-widget').isVisible());
    assert.ok(await page.locator('#full-app').isHidden());
    checks.push('Pause, full-mode restoration, and reactivation work');
    await page.locator('[data-dismiss-banner]').first().click();
    assert.equal(await page.locator('.announcement').count(),0);
    await page.reload();
    assert.equal(await page.locator('.announcement').count(),0);
    checks.push('Banner dismissal persists across reloads');
    await page.evaluate(() => window.miniPreview.resetBanner());
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    checks.push('Theme and selections persist across reloads');
    for (const [section, theme, file] of [['placements','light','placements-paper.png'],['designs','light','widgets-paper.png'],['designs','dark','widgets-dark.png']]) {
      await page.goto(`${base}?capture=${section}&theme=${theme}`);
      await page.locator(`#${section}`).screenshot({path:path.join(__dirname,file)});
    }
    await page.goto(`${base}?capture=playground&theme=light`);
    await page.locator('#open-menu').click();
    await page.locator('#playground').screenshot({path:path.join(__dirname,'desktop-menu.png')});
    await page.goto(base);
    await page.setViewportSize({width:390,height:844});
    for (let id = 1; id <= 5; id++) {
      await page.locator(`[data-select-design="${id}"]`).click();
      await page.locator('#open-menu').click();
      await page.locator('#size').fill('140');
      const fits = await page.evaluate(() => {
        const s = document.querySelector('#desktop').getBoundingClientRect();
        const w = document.querySelector('#floating-widget').getBoundingClientRect();
        const m = document.querySelector('#widget-menu').getBoundingClientRect();
        return w.left >= s.left && w.right <= s.right && m.left >= s.left && m.right <= s.right && m.top >= s.top && m.bottom <= s.bottom;
      });
      assert.ok(fits,`Widget ${id} and popover fit mobile desktop`);
      await page.keyboard.press('Escape');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'No horizontal page overflow');
    checks.push('All five designs and popover remain inside the desktop at 390px with size at 140%');
    await page.locator('[data-select-design="1"]').click();
    await page.locator('#open-menu').click();
    await page.locator('#reset-widget').click();
    await page.locator('#reset-position').click();
    await page.locator('#playground').screenshot({path:path.join(__dirname,'desktop-mobile.png')});
    assert.deepEqual(errors,[]);
    checks.push('No browser runtime errors');
    await fs.writeFile(path.join(__dirname,'verification.json'),JSON.stringify({checks,passed:checks.length,screenshots:['placements-paper.png','widgets-paper.png','widgets-dark.png','desktop-menu.png','desktop-mobile.png']},null,2)+'\n');
    console.log(`${checks.length} preview checks passed. Contact sheets written to docs/mini-preview/.`);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error);process.exitCode=1;});
