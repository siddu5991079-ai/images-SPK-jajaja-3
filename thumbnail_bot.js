const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { execSync } = require('child_process');
const fs = require('fs');

// ==========================================
// ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// ==========================================
const TARGET_URL = process.env.TARGET_URL || 'https://dlstreams.com/watch.php?id=316';
const IMAGE_PREFIX = process.env.IMAGE_PREFIX || 'Live_Thumbnail';
const WAIT_TIME_MS = 30 * 1000; // 30 Seconds Wait Time

// 👇 GENERAL AREA TAG 👇
const RELEASE_TAG = 'live-match-updates'; 

let cycleCounter = 1;
let browser;
let videoPage; // Hum video ko is page par hamesha safe rakhenge

async function setupBrowserAndPlayVideo() {
    browser = await puppeteer.launch({
        channel: 'chrome', 
        headless: false,
        defaultViewport: { width: 1280, height: 720 },
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--disable-accelerated-video-decode', 
            '--disable-software-rasterizer',
            '--autoplay-policy=no-user-gesture-required', 
            '--mute-audio'
        ]
    });

    videoPage = await browser.newPage();
    console.log(`[*] Navigating to target URL: ${TARGET_URL}...`);
    
    try {
        await videoPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 10000)); // Wait for player to load
    } catch (error) {
        console.log(`[❌] Navigation Timeout! Page ne load hone mein time lagaya.`);
        return false; 
    }

    let targetFrame = null;
    console.log('[*] Scanning iframes for the Live Stream Video...');
    for (const frame of videoPage.frames()) {
        try {
            const isRealLiveStream = await frame.evaluate(() => {
                const vid = document.querySelector('video[data-html5-video]') || document.querySelector('video');
                return vid && vid.clientWidth > 300; 
            });
            if (isRealLiveStream) {
                targetFrame = frame;
                await frame.evaluate(() => { const fAd = document.getElementById('floated'); if (fAd) fAd.remove(); });
                break;
            }
        } catch (e) { }
    }

    if (!targetFrame) {
        console.log('[❌] No video frame found. Please check the URL.');
        return false;
    }

    console.log('[*] Attempting to click, play, and fullscreen the video...');
    try {
        const iframeEl = await targetFrame.frameElement();
        const box = await iframeEl.boundingBox();
        if (box) await videoPage.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2), { delay: 100 });
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) { }

    await targetFrame.evaluate(async () => {
        const video = document.querySelector('video[data-html5-video]') || document.querySelector('video');
        if (video) { video.volume = 1.0; await video.play().catch(e => {}); }
    });

    await targetFrame.evaluate(async () => {
        const vid = document.querySelector('video[data-html5-video]') || document.querySelector('video');
        if (!vid) return;
        try {
            if (vid.requestFullscreen) await vid.requestFullscreen();
            else if (vid.webkitRequestFullscreen) await vid.webkitRequestFullscreen();
        } catch (err) {
            vid.style.position = 'fixed'; vid.style.top = '0'; vid.style.left = '0';
            vid.style.width = '100vw'; vid.style.height = '100vh'; vid.style.zIndex = '2147483647'; 
            vid.style.backgroundColor = 'black'; vid.style.objectFit = 'contain';
        }
    });

    console.log('[⏳] Waiting 5 seconds to ensure video is fully playing...');
    await new Promise(r => setTimeout(r, 5000)); 
    return true;
}

async function generateAndUploadThumbnail() {
    console.log(`\n--------------------------------------------------`);
    console.log(`--- 🔄 STARTING THUMBNAIL CYCLE #${cycleCounter} ---`);
    console.log(`--------------------------------------------------`);

    // ✅ 1. TAKE RAW SCREENSHOT FROM THE SAFE VIDEO PAGE
    const uniqueTime = Date.now(); 
    const rawFrame = `temp_raw_frame_${uniqueTime}.jpg`;
    
    try {
        await videoPage.screenshot({ path: rawFrame, type: 'jpeg', quality: 90 });
    } catch (e) {
        console.log(`[❌] Screenshot failed: ${e.message}`);
        cycleCounter++;
        return;
    }

    if (!fs.existsSync(rawFrame)) {
        cycleCounter++;
        return;
    }

    console.log(`[🎨] Generating HD Thumbnail with template in a NEW TAB...`);
    const b64Image = "data:image/jpeg;base64," + fs.readFileSync(rawFrame).toString('base64');
    
    const htmlCode = `<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700;900&display=swap" rel="stylesheet"><style>body { margin: 0; width: 1280px; height: 720px; background: #0f0f0f; font-family: 'Roboto', sans-serif; color: white; display: flex; flex-direction: column; overflow: hidden; } .header { height: 100px; display: flex; align-items: center; padding: 0 40px; justify-content: space-between; z-index: 10; } .logo { font-size: 50px; font-weight: 900; letter-spacing: 1px; text-shadow: 0 0 10px rgba(255,255,255,0.8); } .live-badge { border: 4px solid #cc0000; border-radius: 12px; padding: 5px 20px; font-size: 40px; font-weight: 700; display: flex; gap: 10px; } .hero-container { position: relative; width: 100%; height: 440px; } .hero-img { width: 100%; height: 100%; object-fit: cover; filter: blur(5px); opacity: 0.6; } .pip-img { position: absolute; top: 20px; right: 40px; width: 45%; border: 6px solid white; box-shadow: -15px 15px 30px rgba(0,0,0,0.8); } .text-container { position: relative; z-index: 999; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 10px 40px; } .main-title { font-size: 70px; font-weight: 900; line-height: 1.1; text-shadow: 6px 6px 15px rgba(0,0,0,0.9); } .live-text { color: #cc0000; }</style></head><body><div class="header"><div class="logo">SPORTSHUB</div><div class="live-badge"><span style="color:#cc0000">●</span> LIVE</div></div><div class="hero-container"><img src="${b64Image}" class="hero-img"><img src="${b64Image}" class="pip-img"></div><div class="text-container"><div class="main-title"><span class="live-text">🔴 Watch Live : </span>bulbul4u-live.xyz</div></div></body></html>`;

    const outputImagePath = `${IMAGE_PREFIX}_${uniqueTime}.png`; 
    
    // ✅ 2. THE FIX: USE A BRAND NEW TAB TO RENDER HTML (SAVES THE VIDEO PAGE)
    let editorPage;
    try {
        editorPage = await browser.newPage();
        await editorPage.setViewport({ width: 1280, height: 720 });
        await editorPage.setContent(htmlCode, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await editorPage.screenshot({ path: outputImagePath });
    } catch (e) {
        console.log(`[❌] Template render karne mein timeout aagaya: ${e.message}`);
    } finally {
        if (editorPage) await editorPage.close(); // Hamesha editor tab close karein
        if (fs.existsSync(rawFrame)) fs.unlinkSync(rawFrame); // Delete kacha screenshot
    }
    
    if (!fs.existsSync(outputImagePath)) {
        cycleCounter++;
        return;
    }

    console.log(`[✅] Thumbnail Ready: ${outputImagePath}`);

    // ✅ 3. UPLOAD TO GITHUB RELEASE
    console.log(`[📤] Adding Thumbnail to the FIXED General Release (${RELEASE_TAG})...`);
    try {
        execSync(`gh release upload ${RELEASE_TAG} "${outputImagePath}" --clobber`, { stdio: 'inherit' });
        console.log(`✅ [+] Successfully ADDED to ${RELEASE_TAG}!`);
    } catch (err) {
        console.log(`[❌] Upload failed. Error: ${err.message}`);
    }

    // Clean up final image from local disk
    if (fs.existsSync(outputImagePath)) fs.unlinkSync(outputImagePath);

    console.log(`\n[⏳] Cycle #${cycleCounter} Complete! Waiting 30 seconds...`);
    cycleCounter++;
}

// 🔥 MAIN LOOP FUNCTION 🔥
async function main() {
    console.log(`\n[🧹] STEP 1: Cleaning up old GENERAL release...`);
    try {
        execSync(`gh release delete ${RELEASE_TAG} --cleanup-tag -y`, { stdio: 'ignore' });
        console.log(`[✅] Old release deleted. Waiting 5 seconds for GitHub to sync...`);
        await new Promise(r => setTimeout(r, 5000)); 
    } catch (e) {
        console.log(`[ℹ️] No old release found to delete.`);
    }

    console.log(`[📦] STEP 2: Creating a fresh, VISIBLE GENERAL Release...`);
    try {
        execSync(`gh release create ${RELEASE_TAG} --title "🔴 Live Match Updates" --notes "Sari thumbnails yahan auto-add hongi." --latest`, { stdio: 'inherit' });
        console.log(`[✅] General release created successfully!`);
    } catch (e) { 
        console.log(`[⚠️] Release creation error (It might already exist). Moving on...`);
    }

    console.log(`[🚀] STEP 3: Starting Browser and loading video...`);
    const isReady = await setupBrowserAndPlayVideo();
    
    if (!isReady) {
        console.log(`[❌] Setup failed. Exiting...`);
        if (browser) await browser.close();
        process.exit(1);
    }

    // STEP 4: Start 30 seconds loop
    while (true) {
        await generateAndUploadThumbnail();
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME_MS));
    }
}

main();
