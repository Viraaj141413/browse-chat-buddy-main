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

// Ensure public directory exists
const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Start Puppeteer browser
async function startBrowser() {
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
        console.log('Error closing existing browser:', error.message);
      }
    }

    console.log('🚀 Starting Puppeteer Chrome browser...');
    
    browser.instance = await puppeteer.launch({
      headless: false, // ALWAYS show browser window
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
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      ignoreHTTPSErrors: true
    });

    browser.page = await browser.instance.newPage();
    
    // Set user agent to avoid bot detection
    await browser.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to Google
    console.log('🌐 Navigating to Google...');
    await browser.page.goto('https://www.google.com', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    browser.currentUrl = 'https://www.google.com';
    
    // Take initial screenshot
    await takeScreenshot();
    
    console.log('✅ Browser ready and window opened!');
    browser.isStarting = false;
    return true;
    
  } catch (error) {
    console.error('❌ Browser startup error:', error);
    browser.isStarting = false;
    return false;
  }
}

// Take screenshot and save it
async function takeScreenshot() {
  if (!browser.page) {
    console.log('No page available for screenshot');
    return;
  }
  
  try {
    const screenshotPath = path.join(publicDir, 'browser-screenshot.png');
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
    console.log('📸 Screenshot saved');
  } catch (error) {
    console.error('Screenshot error:', error);
  }
}

// Ensure browser is running
async function ensureBrowser(req, res, next) {
  if (!browser.instance || !browser.page) {
    console.log('Browser not running, starting...');
    const success = await startBrowser();
    if (!success) {
      return res.status(500).json({ error: 'Failed to start browser' });
    }
  }
  next();
}

// Health check endpoint
app.get('/health', (req, res) => {
  const isReady = browser.instance && browser.page && !browser.isStarting;
  res.json({ 
    status: isReady ? 'ready' : 'starting',
    url: browser.currentUrl,
    screenshot: browser.screenshotPath
  });
  console.log('Health check:', { status: isReady ? 'ready' : 'starting', url: browser.currentUrl });
});

// Get screenshot
app.post('/screenshot', ensureBrowser, async (req, res) => {
  try {
    await takeScreenshot();
    res.json({ 
      success: true, 
      screenshot: browser.screenshotPath,
      url: browser.currentUrl 
    });
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
    console.log('🌐 Navigating to:', fullUrl);
    
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

    console.log('🔍 Searching for:', query);

    // Go to Google if not already there
    if (!browser.currentUrl.includes('google.com')) {
      await browser.page.goto('https://www.google.com', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
    }

    // Search
    await browser.page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 10000 });
    await browser.page.click('textarea[name="q"], input[name="q"]');
    
    // Clear and type
    await browser.page.evaluate(() => {
      const searchBox = document.querySelector('textarea[name="q"], input[name="q"]');
      if (searchBox) searchBox.value = '';
    });
    
    await browser.page.type('textarea[name="q"], input[name="q"]', query);
    await browser.page.keyboard.press('Enter');
    
    // Wait for results
    await browser.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    browser.currentUrl = browser.page.url();
    await takeScreenshot();
    
    res.json({ 
      success: true,
      screenshot: browser.screenshotPath,
      url: browser.currentUrl 
    }); 
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gemini integration
app.post('/gemini', ensureBrowser, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('🤖 Processing Gemini request:', prompt);
    
    // Simple command processing
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

    browser.currentUrl = browser.page.url();
    await takeScreenshot();

    res.json({
      success: true,
      result: `Executed: ${prompt}`,
      screenshot: browser.screenshotPath,
      url: browser.currentUrl,
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

// Start server and browser
app.listen(port, async () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📁 Serving static files from: ${publicDir}`);
  
  // Start browser immediately
  console.log('🔄 Starting browser...');
  const success = await startBrowser();
  
  if (success) {
    console.log('✅ Browser window opened successfully!');
    console.log('🌐 You should see a Chrome window open');
  } else {
    console.log('❌ Failed to start browser');
  }
});

// Handle process termination
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down...');
  if (browser.instance) {
    await browser.instance.close();
    console.log('🔒 Browser closed');
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down...');
  if (browser.instance) {
    await browser.instance.close();
    console.log('🔒 Browser closed');
  }
  process.exit(0);
});