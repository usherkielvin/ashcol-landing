const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new'
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  try {
    await page.evaluateOnNewDocument(() => { localStorage.setItem('ashcol-token', 'fake-token'); sessionStorage.setItem('ashcol-token', 'fake-token'); localStorage.setItem('user', JSON.stringify({ role: 'admin', username: 'test' })); }); await page.goto('http://localhost:5173/audit-report', { waitUntil: 'networkidle0', timeout: 10000 });
    console.log('Page loaded successfully');
  } catch (e) {
    console.log('Navigation error:', e.message);
  }
  
  await browser.close();
})();
