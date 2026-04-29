const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { execSync } = require('child_process');
const fs = require('fs');

const TARGET_URL = process.env.TARGET_URL || 'https://dlstreams.com/watch.php?id=316';
const IMAGE_PREFIX = process.env.IMAGE_PREFIX || 'Live_Thumbnail';
const WAIT_TIME_MS = 30 * 1000;
const RELEASE_TAG = 'live-match-updates';

let browser = null;
let videoPage = null;
let renderPage = null;
let cycleCounter = 1;

async function setupStream() {
    console.log(`[*] Starting browser with CPU Natural Settings...`);
    
    browser = await puppeteer.launch({
        channel: 'chrome',
        headless: false,
        defaultViewport: { width: 1280, height: 720 },
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,720',
            '--kiosk',
            '--autoplay-policy=no-user-gesture-required'
        ]
    });

    videoPage = await browser.newPage();
    renderPage = await browser.newPage();

    const pages = await browser.pages();
    for (const p of pages) {
        if (p !== videoPage && p !== renderPage) await p.close();
    }

    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (newPage && newPage !== videoPage && newPage !== renderPage) {
                    console.log(`[!] Ad Popup KILLED!`);
                    await videoPage.bringToFront();
                    await newPage.close();
                }
            } catch (e) {}
        }
    });

    console.log(`[*] Navigating to: ${TARGET_URL}`);
    await videoPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 8000));

    // 🖱️ THE RELIABLE PROJECT 2 CLICKER
    console.log('[*] Hunting for the Play Button...');
    for (let attempts = 0; attempts < 10; attempts++) {
        let clickedInThisAttempt = false;
        
        for (const frame of videoPage.frames()) {
            try {
                const playBtn = await frame.$('.jw-icon-display[aria-label="Play"], .plyr__control--overlaid');
                if (playBtn) {
                    const isVisible = await frame.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    }, playBtn);
                    
                    if (isVisible) {
                        console.log(`[*] Play button smashed! (Attempt ${attempts + 1}/10)`);
                        await frame.evaluate(el => el.click(), playBtn);
                        clickedInThisAttempt = true;
                        break;
                    }
                }
            } catch (err) {}
        }
        
        if (clickedInThisAttempt) {
            await new Promise(r => setTimeout(r, 4000));
        } else {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // ⬛ IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
    console.log('[*] Enforcing Black Background and Full Screen UI...');
    await videoPage.evaluate(() => {
        document.body.style.backgroundColor = 'black';
        document.body.style.overflow = 'hidden';
        document.querySelectorAll('iframe').forEach(iframe => {
            iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
            iframe.style.width = '100vw'; iframe.style.height = '100vh';
            iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
        });
    }).catch(() => {});

    for (const frame of videoPage.frames()) {
        try {
            await frame.evaluate(() => {
                const style = document.createElement('style');
                style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar { display: none !important; }`;
                document.head.appendChild(style);

                const video = document.querySelector('video');
                if (video) {
                    video.muted = true;
                    video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
                    video.style.width = '100vw'; video.style.height = '100vh';
                    video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
                }
            });
        } catch (e) {}
    }

    console.log('[✅] Stream is successfully set up! Starting Thumbnail Loop...');
}

async function captureAndUpload() {
    console.log(`\n--------------------------------------------------`);
    console.log(`--- 🔄 STARTING THUMBNAIL CYCLE #${cycleCounter} ---`);
    console.log(`--------------------------------------------------`);

    const uniqueTime = Date.now();
    const rawFrame = `temp_raw_${uniqueTime}.jpg`;
    const finalImage = `${IMAGE_PREFIX}_${uniqueTime}.png`;
    
    try {
        console.log(`[📸] Taking raw screenshot using FFmpeg (The Only Proven Method)...`);
        
        // Ensure video is rendering on screen before capture
        await videoPage.bringToFront();
        await new Promise(r => setTimeout(r, 1000));

        // 🔥 USE FFMPEG TO GRAB THE ACTUAL DISPLAY FRAME BUFFER
        const displayNum = process.env.DISPLAY || ':99';
        execSync(`ffmpeg -y -f x11grab -draw_mouse 0 -video_size 1280x720 -i ${displayNum} -vframes 1 "${rawFrame}"`, { stdio: 'pipe' });

        console.log(`[🎨] Generating HD Thumbnail with template...`);
        const b64Image = "data:image/jpeg;base64," + fs.readFileSync(rawFrame).toString('base64');
        
        const htmlCode = `<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700;900&display=swap" rel="stylesheet"><style>body { margin: 0; width: 1280px; height: 720px; background: #0f0f0f; font-family: 'Roboto', sans-serif; color: white; display: flex; flex-direction: column; overflow: hidden; } .header { height: 100px; display: flex; align-items: center; padding: 0 40px; justify-content: space-between; z-index: 10; } .logo { font-size: 50px; font-weight: 900; letter-spacing: 1px; text-shadow: 0 0 10px rgba(255,255,255,0.8); } .live-badge { border: 4px solid #cc0000; border-radius: 12px; padding: 5px 20px; font-size: 40px; font-weight: 700; display: flex; gap: 10px; } .hero-container { position: relative; width: 100%; height: 440px; } .hero-img { width: 100%; height: 100%; object-fit: cover; filter: blur(5px); opacity: 0.6; } .pip-img { position: absolute; top: 20px; right: 40px; width: 45%; border: 6px solid white; box-shadow: -15px 15px 30px rgba(0,0,0,0.8); } .text-container { position: relative; z-index: 999; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 10px 40px; } .main-title { font-size: 70px; font-weight: 900; line-height: 1.1; text-shadow: 6px 6px 15px rgba(0,0,0,0.9); } .live-text { color: #cc0000; }</style></head><body><div class="header"><div class="logo">SPORTSHUB</div><div class="live-badge"><span style="color:#cc0000">●</span> LIVE</div></div><div class="hero-container"><img src="${b64Image}" class="hero-img"><img src="${b64Image}" class="pip-img"></div><div class="text-container"><div class="main-title"><span class="live-text">🔴 Watch Live : </span>bulbul4u-live.xyz</div></div></body></html>`;

        await renderPage.setViewport({ width: 1280, height: 720 });
        await renderPage.setContent(htmlCode, { waitUntil: 'domcontentloaded' });
        // Render page ka SS lene ke liye Puppeteer theek hai kyunke usme sirf image aur text hai, video nahi
        await renderPage.screenshot({ path: finalImage });

        console.log(`[📤] Uploading ${finalImage} to GitHub Release (${RELEASE_TAG})...`);
        execSync(`gh release upload ${RELEASE_TAG} "${finalImage}"`, { stdio: 'inherit' });
        console.log(`✅ [+] Successfully ADDED FINAL THUMBNAIL to ${RELEASE_TAG}!`);

    } catch (err) {
        console.log(`[❌] Error in capture cycle: ${err.message}`);
    }

    if (fs.existsSync(rawFrame)) fs.unlinkSync(rawFrame);
    if (fs.existsSync(finalImage)) fs.unlinkSync(finalImage);

    console.log(`[⏳] Cycle #${cycleCounter} Complete! Waiting 30 seconds...`);
    cycleCounter++;
}

async function main() {
    console.log(`\n[🧹] STEP 1: Cleaning up old GENERAL release...`);
    try {
        execSync(`gh release delete ${RELEASE_TAG} --cleanup-tag -y`, { stdio: 'ignore' });
        console.log(`[✅] Old release deleted. Waiting 5 seconds...`);
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {}

    console.log(`[📦] STEP 2: Creating a fresh Release...`);
    try {
        execSync(`gh release create ${RELEASE_TAG} --title "🔴 Live Match Updates" --notes "Auto generated thumbnails." --latest`, { stdio: 'inherit' });
        console.log(`[✅] General release created successfully!`);
    } catch (e) {}

    await setupStream();

    while (true) {
        await captureAndUpload();
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME_MS));
    }
}

main();
