import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { chromium } from 'playwright';
import path from 'path';

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

let browser = {
  instance: null,
  page: null,
  currentUrl: 'about:blank',
  isStarting: false
};

// Start browser with retry logic
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

    console.log('Starting Chrome...');
    browser.instance = await chromium.launch({
      headless: false,
      args: ['--start-maximized', '--disable-dev-shm-usage']
    });

    // Handle browser disconnection
    browser.instance.on('disconnected', async () => {
      console.log('Browser disconnected, restarting...');
      browser.instance = null;
      browser.page = null;
      await startBrowser();
    });

    const context = await browser.instance.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    browser.page = await context.newPage();

    // Track URL changes
    browser.page.on('framenavigated', async frame => {
      if (frame === browser.page.mainFrame()) {
        browser.currentUrl = frame.url();
        console.log('URL changed:', browser.currentUrl);
      }
    });

    // Handle page errors
    browser.page.on('pageerror', error => {
      console.log('Page error:', error);
    });

    browser.page.on('crash', () => {
      console.log('Page crashed, restarting...');
      startBrowser();
    });

    await browser.page.goto('https://www.google.com');
    browser.currentUrl = 'https://www.google.com';
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

// Ensure browser is running before handling requests
async function ensureBrowser(req, res, next) {
  if (!browser.instance || !browser.page) {
    const success = await startBrowser();
    if (!success) {
      return res.status(500).json({ error: 'Failed to start browser' });
    }
  }
  next();
}

// Get current URL
app.get('/url', ensureBrowser, (req, res) => {
  res.json({ url: browser.currentUrl });
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
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    browser.currentUrl = fullUrl;
    
    res.json({ success: true, url: fullUrl });
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
        waitUntil: 'networkidle',
        timeout: 30000 
      });
    }

    // Wait for search box and type query
    await browser.page.waitForSelector('input[name="q"]', { timeout: 10000 });
    await browser.page.click('input[name="q"]');
    await browser.page.keyboard.press('Control+A');
    await browser.page.keyboard.press('Backspace');
    await browser.page.type('input[name="q"]', query);
    await browser.page.keyboard.press('Enter');
    
    // Wait for search results
    await browser.page.waitForLoadState('networkidle', { timeout: 30000 });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: browser.instance && browser.page ? 'ready' : 'starting',
    url: browser.currentUrl
  });
});

// Start server
app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  await startBrowser();
}); 