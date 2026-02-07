/**
 * Fetch image via Puppeteer (real Chrome) — обход блокировки наш.дом.рф для datacenter IP.
 * Используется когда axios возвращает 502.
 */
let browser = null;
let browserPromise = null;

const LAUNCH_TIMEOUT_MS = 12000;

const getBrowser = async () => {
  if (browser && browser.connected) return browser;
  if (browserPromise) return browserPromise;
  const launchTask = (async () => {
    const puppeteer = require('puppeteer');
    const b = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
    return b;
  })();
  const timeoutPromise = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('Puppeteer launch timeout')), LAUNCH_TIMEOUT_MS)
  );
  browserPromise = Promise.race([launchTask, timeoutPromise])
    .then((b) => {
      browser = b;
      b.on('disconnected', () => {
        browser = null;
        browserPromise = null;
      });
      return b;
    })
    .catch((e) => {
      browserPromise = null;
      throw e;
    });
  return browserPromise;
};

/**
 * @param {string} url - image URL (наш.дом.рф resizer)
 * @returns {{ buffer: Buffer, contentType: string } | null}
 */
const fetchImage = async (url) => {
  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setExtraHTTPHeaders({
      Referer: 'https://xn--80az8a.xn--d1aqf.xn--p1ai/',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    });
    const resp = await page.goto(url, {
      waitUntil: 'load',
      timeout: 15000,
    });
    if (!resp || resp.status() !== 200) return null;
    const buffer = await resp.buffer();
    const contentType = resp.headers()['content-type'] || 'image/jpeg';
    return { buffer, contentType };
  } catch (e) {
    console.error('puppeteer-fetch:', e.message);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
};

module.exports = { fetchImage };
