import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

let browser = {
  instance: null,
  page: null,
  currentUrl: 'about:blank',
  isStarting: false,
  screenshotPath: null
};

// Start Puppeteer browser with retry logic
async function startBrowser(retryCount = 0) {
  if (browser.isStarting) {
    console.log('Browser already starting...');
    return false;
  }

  try {
    browser.isStarting = true;

    // Close existing browser if any
    if (browser.instance) {
      try {
        await browser.instance.close();
      } catch (error) {
        console.log('Error closing browser:', error.message);
      }
    }

    console.log('Starting Puppeteer Chrome...');
    browser.instance = await puppeteer.launch({
      headless: false,
      defaultViewport: {
        width: 1200,
        height: 800
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--start-maximized'
      ]
    });

    browser.page = await browser.instance.newPage();
    
    // Set user agent to avoid bot detection
    await browser.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Track navigation
    browser.page.on('framenavigated', () => {
      browser.currentUrl = browser.page.url();
      console.log('URL changed:', browser.currentUrl);
      // Take screenshot after navigation
      takeScreenshot();
    });

    // Handle page errors
    browser.page.on('pageerror', error => {
      console.log('Page error:', error);
    });

    await browser.page.goto('https://www.google.com');
    browser.currentUrl = 'https://www.google.com';
    await takeScreenshot();
    console.log('Browser ready');
    browser.isStarting = false;
    return true;
  } catch (error) {
    console.error('Browser error:', error);
    browser.isStarting = false;

    // Retry up to 3 times
    if (retryCount < 3) {
      console.log(`Retrying browser start (attempt ${retryCount + 1})...`);
      return startBrowser(retryCount + 1);
    }
    return false;
  }
}

// Take screenshot and save it
async function takeScreenshot() {
  if (!browser.page) return;
  
  try {
    const screenshotPath = path.join(process.cwd(), 'public', 'browser-screenshot.png');
    await browser.page.screenshot({ 
      path: screenshotPath,
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: 1200,
        height: 800
      }
    });
    browser.screenshotPath = '/browser-screenshot.png';
    console.log('Screenshot saved:', screenshotPath);
  } catch (error) {
    console.error('Error taking screenshot:', error);
    console.error('Screenshot error:', error);
  }
}

// Ensure browser is running before handling requests
async function ensureBrowser(req, res, next) {
  if (!browser.instance || !browser.page) {
    const success = await startBrowser();
    if (!success) {
      return res.status(500).json({ error: 'Failed to start browser' });
    }
  }
  console.log(`Request to ${req.path}. Current URL: ${browser.currentUrl}, Screenshot: ${browser.screenshotPath}`);
  next();
}

// Get current URL
app.get('/url', ensureBrowser, (req, res) => {
  res.json({ 
    url: browser.currentUrl,
    screenshot: browser.screenshotPath 
  }); 
  console.log('Sent /url response:', { url: browser.currentUrl, screenshot: browser.screenshotPath });
});

// Get screenshot endpoint
app.get('/screenshot', ensureBrowser, async (req, res) => {
  try {
    await takeScreenshot();
    res.json({ 
      success: true, 
      screenshot: browser.screenshotPath,
      url: browser.currentUrl 
    });
    console.log('Sent /screenshot response:', { success: true, screenshot: browser.screenshotPath, url: browser.currentUrl });
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Navigate to URL
app.post('/navigate', ensureBrowser, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    await browser.page.goto(fullUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    browser.currentUrl = fullUrl;
    await takeScreenshot();
    
    res.json({ 
      success: true, 
      url: fullUrl,
      screenshot: browser.screenshotPath 
    }); 
    console.log('Sent /navigate response:', { success: true, url: fullUrl, screenshot: browser.screenshotPath });
  } catch (error) {
    console.error('Navigation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Perform search
app.post('/search', ensureBrowser, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Make sure we're on Google
    if (!browser.currentUrl.includes('google.com')) {
      await browser.page.goto('https://www.google.com', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
    }

    // Wait for search box and type query
    await browser.page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 10000 });
    await browser.page.click('textarea[name="q"], input[name="q"]');
    await browser.page.evaluate(() => {
      const searchBox = document.querySelector('textarea[name="q"], input[name="q"]');
      if (searchBox) searchBox.value = '';
    });
    await browser.page.type('textarea[name="q"], input[name="q"]', query);
    await browser.page.keyboard.press('Enter');
    
    // Wait for search results
    await browser.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    await takeScreenshot();
    
    res.json({ 
      success: true,
      screenshot: browser.screenshotPath,
      url: browser.currentUrl 
    }); 
    console.log('Sent /search response:', { success: true, screenshot: browser.screenshotPath, url: browser.currentUrl });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: browser.instance && browser.page ? 'ready' : 'starting',
    url: browser.currentUrl,
    screenshot: browser.screenshotPath
  });
  });
});

// Gemini integration endpoint
app.post('/gemini', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Ensure browser is running
    if (!browser.instance || !browser.page) {
      await startBrowser();
    }

    // For demo purposes, simulate AI processing
    console.log('Processing Gemini request:', prompt);
    
    // Perform a search based on the prompt
    if (prompt.toLowerCase().includes('search')) {
      const searchQuery = prompt.replace(/search for?/i, '').trim();
      await browser.page.goto('https://www.google.com');
      await browser.page.waitForSelector('textarea[name="q"], input[name="q"]');
      await browser.page.type('textarea[name="q"], input[name="q"]', searchQuery);
      await browser.page.keyboard.press('Enter');
      await browser.page.waitForNavigation({ waitUntil: 'networkidle2' });
    } else if (prompt.toLowerCase().includes('go to') || prompt.toLowerCase().includes('visit')) {
      const urlMatch = prompt.match(/(?:go to|visit)\s+([^\s]+)/i);
      if (urlMatch) {
        const url = urlMatch[1].startsWith('http') ? urlMatch[1] : `https://${urlMatch[1]}`;
        await browser.page.goto(url, { waitUntil: 'networkidle2' });
      }
    }

    await takeScreenshot();

    res.json({
      success: true,
      result: `Executed: ${prompt}`,
      screenshot: browser.screenshotPath,
      url: browser.currentUrl,
      code: `// Executed command: ${prompt}`, // Ensure code is always returned
      code: `// Executed command: ${prompt}`,
      gemini: { response: `Task completed: ${prompt}` }
    });

  } catch (error) {
    console.error('Gemini error:', error);
    res.status(500).json({ 
      error: error.message,
      gemini: { error: error.message }
    });
  }
});

// Start server
app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Serving static files from: ${path.join(process.cwd(), 'public')}`);
  await startBrowser();
}); 