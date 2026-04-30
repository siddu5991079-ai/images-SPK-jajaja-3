const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { spawn, execSync } = require('child_process'); 
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const fs = require('fs'); // 🔥 ADDED FS FOR THUMBNAIL EDITING

// 🚀 Multi-Stream Key Manager
const STREAM_KEYS = {
    '1': '14601603391083_14040893622891_puxzrwjniu', 
    '2': '14601696583275_14041072274027_apdzpdb5xi', 
    '3': '14617940008555_14072500914795_ohw67ls7ny',
    '4': '14601972227691_14041593547371_obdhgewlmq',
    '5': 'YOUR_STREAM_KEY_5_HERE'
};

const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// 🔥 THUMBNAIL SETTINGS
const IMAGE_PREFIX = process.env.IMAGE_PREFIX || 'Live_Thumbnail';
const RELEASE_TAG = 'live-match-updates'; 

let browser = null;
let ffmpegProcess = null;
let thumbnailInterval = null; // 🔥 INTERVAL VARIABLE

// =========================================================================
// 🔄 MAIN LOOP
// =========================================================================
async function mainLoop() {
    // 🧹 STEP 1: CLEANUP OLD RELEASE ON STARTUP
    await setupCleanRelease();

    while (true) {
        try {
            await startDirectStreaming();
        } catch (error) {
            console.error(`\n[!] ALERT: ${error.message}`);
            console.log('[*] 🔄 Restarting everything in 3 seconds...');
            await cleanup();
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

// 📦 FUNCTION TO DELETE OLD IMAGES AND CREATE FRESH RELEASE
async function setupCleanRelease() {
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
        execSync(`gh release create ${RELEASE_TAG} --title "🔴 Live Match Updates" --notes "Auto uploaded custom thumbnails." --latest`, { stdio: 'inherit' });
        console.log(`[✅] General release created successfully!`);
    } catch (e) { 
        console.log(`[⚠️] Release creation error (It might already exist). Moving on...`);
    }
}

async function startDirectStreaming() {
    console.log(`[*] Starting browser and FFmpeg...`);
    
    // ⚙️ SMART QUALITY SELECTOR
    const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    let vBitrate = '800k', maxRate = '850k', bufSize = '1700k', resolution = '854:480', aBitrate = '64k';

    if (streamQuality.includes('40KBps')) {
        vBitrate = '300k'; maxRate = '350k'; bufSize = '700k'; resolution = '640:360'; aBitrate = '48k';
    } else if (streamQuality.includes('20KBps')) {
        vBitrate = '150k'; maxRate = '180k'; bufSize = '360k'; resolution = '426:240'; aBitrate = '32k';
    }

    browser = await puppeteer.launch({
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

    const page = await browser.newPage();
    const pages = await browser.pages();
    for (const p of pages) {
        if (p !== page) await p.close();
    }

    // 🛑 POPUP & REDIRECT BLOCKER
    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (newPage && newPage !== page) {
                    console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
                    await page.bringToFront(); 
                    await newPage.close();
                }
            } catch (e) {}
        }
    });

    console.log(`[*] Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 🎥 1. START 30-SEC DEBUG RECORDING
    const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
    console.log('[*] 🔴 Debug Recording Started...');
    await recorder.start('./recording.mp4');

    await new Promise(r => setTimeout(r, 5000));

    // 🖱️ 2. THE TERMINATOR CLICKER
    console.log('[*] Hunting for the JW Player Play Button...');
    let buttonGone = false;
    let attempts = 0;
    
    while (!buttonGone && attempts < 15) {
        buttonGone = true;
        for (const frame of page.frames()) {
            try {
                const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
                if (playBtn) {
                    const isVisible = await frame.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    }, playBtn);

                    if (isVisible) {
                        buttonGone = false;
                        console.log(`[*] Play button detected! Smashing it... (Attempt ${attempts + 1}/15)`);
                        await frame.evaluate(el => el.click(), playBtn); 
                        await new Promise(r => setTimeout(r, 2000));
                        break; 
                    }
                }
            } catch (err) {}
        }
        attempts++;
    }

    // 🧠 3. THE SMART SCANNER
    console.log('[*] Scanning iframes for the REAL Live Stream Video...');
    let targetFrame = null;
    for (const frame of page.frames()) {
        try {
            const isRealLiveStream = await frame.evaluate(() => {
                const vid = document.querySelector('video');
                if (!vid) return false;
                if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
                return true; 
            });

            if (isRealLiveStream) {
                targetFrame = frame;
                console.log(`[+] Smart Scanner locked onto video frame: ${frame.url().substring(0, 50)}...`);
                break;
            }
        } catch (e) { }
    }

    if (!targetFrame) {
        console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
        targetFrame = page.mainFrame();
    }

    // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
    console.log('[*] Enforcing Black Background and Full Screen UI...');
    await page.evaluate(() => {
        document.body.style.backgroundColor = 'black';
        document.body.style.overflow = 'hidden';
        document.querySelectorAll('iframe').forEach(iframe => {
            iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
            iframe.style.width = '100vw'; iframe.style.height = '100vh';
            iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
        });
    }).catch(() => {});

    await targetFrame.evaluate(async () => {
        const style = document.createElement('style');
        style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls { display: none !important; }`;
        document.head.appendChild(style);

        const video = document.querySelector('video');
        if (video) { 
            video.muted = false; 
            video.volume = 1.0; 
            video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
            video.style.width = '100vw'; video.style.height = '100vh';
            video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
        }
    }).catch(()=>{});

    // 📡 5. START FFMPEG BROADCAST (Dynamic Quality Applied Here)
    console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Selected Quality: ${streamQuality}`);
    const displayNum = process.env.DISPLAY || ':99';
    let ffmpegArgs = [
        '-y', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
        '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
        '-i', displayNum, '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'default',
        '-vf', `scale=${resolution}`, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
        '-b:v', vBitrate, '-maxrate', maxRate, '-bufsize', bufSize,
        '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', aBitrate, '-ac', '2', '-ar', '44100',
        '-async', '1', '-f', 'flv', RTMP_DESTINATION 
    ];
    
    ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    ffmpegProcess.stderr.on('data', (data) => {
        if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
    });

    // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
    console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
    await new Promise(r => setTimeout(r, 30000));
    await recorder.stop();
    console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

    // 🎨🔥 6.5. THE 30-SECOND THUMBNAIL LOOP (Background Safe Method)
    console.log('\n[*] 🔄 Starting 30-Second Thumbnail Generator Loop...');
    let cycleCounter = 1;
    
    thumbnailInterval = setInterval(async () => {
        try {
            console.log(`\n--- 🎨 THUMBNAIL CYCLE #${cycleCounter} ---`);
            const uniqueTime = Date.now(); 
            const rawFrame = `temp_raw_frame_${uniqueTime}.jpg`;
            
            // 1. Take raw screenshot from LIVE stream (No interference)
            await page.screenshot({ path: rawFrame, type: 'jpeg', quality: 90 });
            if (!fs.existsSync(rawFrame)) return;

            // 2. Read base64
            const b64Image = "data:image/jpeg;base64," + fs.readFileSync(rawFrame).toString('base64');
            const htmlCode = `<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700;900&display=swap" rel="stylesheet"><style>body { margin: 0; width: 1280px; height: 720px; background: #0f0f0f; font-family: 'Roboto', sans-serif; color: white; display: flex; flex-direction: column; overflow: hidden; } .header { height: 100px; display: flex; align-items: center; padding: 0 40px; justify-content: space-between; z-index: 10; } .logo { font-size: 50px; font-weight: 900; letter-spacing: 1px; text-shadow: 0 0 10px rgba(255,255,255,0.8); } .live-badge { border: 4px solid #cc0000; border-radius: 12px; padding: 5px 20px; font-size: 40px; font-weight: 700; display: flex; gap: 10px; } .hero-container { position: relative; width: 100%; height: 440px; } .hero-img { width: 100%; height: 100%; object-fit: cover; filter: blur(5px); opacity: 0.6; } .pip-img { position: absolute; top: 20px; right: 40px; width: 45%; border: 6px solid white; box-shadow: -15px 15px 30px rgba(0,0,0,0.8); } .text-container { position: relative; z-index: 999; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 10px 40px; } .main-title { font-size: 70px; font-weight: 900; line-height: 1.1; text-shadow: 6px 6px 15px rgba(0,0,0,0.9); } .live-text { color: #cc0000; }</style></head><body><div class="header"><div class="logo">SPORTSHUB</div><div class="live-badge"><span style="color:#cc0000">●</span> LIVE</div></div><div class="hero-container"><img src="${b64Image}" class="hero-img"><img src="${b64Image}" class="pip-img"></div><div class="text-container"><div class="main-title"><span class="live-text">🔴 Watch Live : </span>bulbul4u-live.xyz</div></div></body></html>`;

            // 3. SECRETE WEAPON: Start a hidden headless browser just for template rendering
            const thumbBrowser = await puppeteer.launch({ 
                headless: true, // Invisible, won't cover X11 screen
                defaultViewport: { width: 1280, height: 720 },
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
            });
            const thumbPage = await thumbBrowser.newPage();
            
            const outputImagePath = `${IMAGE_PREFIX}_CH${SELECTED_CHANNEL}_${uniqueTime}.png`;
            await thumbPage.setContent(htmlCode, { waitUntil: 'domcontentloaded' });
            await thumbPage.screenshot({ path: outputImagePath });
            await thumbBrowser.close(); // Close immediately

            fs.unlinkSync(rawFrame); // Delete raw image locally

            // 4. Upload to GitHub
            console.log(`[📤] Uploading designed thumbnail to Release...`);
            try {
                execSync(`gh release upload ${RELEASE_TAG} "${outputImagePath}" --clobber`, { stdio: 'inherit' });
                console.log(`[✅] Designed Thumbnail Successfully Uploaded!`);
            } catch (err) {
                console.log(`[❌] Upload failed: ${err.message}`);
            }

            if (fs.existsSync(outputImagePath)) fs.unlinkSync(outputImagePath); // Delete final image locally
            cycleCounter++;

        } catch (err) {
            console.log(`[❌] Thumbnail error in Cycle #${cycleCounter}: ${err.message}`);
        }
    }, 30000); // 30000 ms = 30 Seconds

    // 🧠 7. THE SMART WATCHDOG (Privacy & Health Check Active...)
    console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
    while (true) {
        if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

        const status = await targetFrame.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            const v = document.querySelector('video');
            if (!v || v.ended) return 'DEAD';
            return 'HEALTHY';
        }).catch(() => 'EVAL_ERROR');

        if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
            console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
            throw new Error("Watchdog detected video dead."); 
        }

        await new Promise(r => setTimeout(r, 5000)); 
    }
}

async function cleanup() {
    if (thumbnailInterval) { clearInterval(thumbnailInterval); thumbnailInterval = null; } // 🔥 STOP THUMBNAIL LOOP ON RESTART
    if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
    if (browser) { try { await browser.close(); } catch(e){} browser = null; }
}

process.on('SIGINT', async () => {
    console.log('\n[*] Stopping live script cleanly...');
    await cleanup();
    process.exit(0);
});

// =========================================================================
// ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// =========================================================================
setTimeout(async () => {
    console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GH_PAT;
    const ref = process.env.GITHUB_REF_NAME || 'main';
    
    if (!repo || !token) return;

    try {
        await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
            method: 'POST',
            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
            body: JSON.stringify({
                ref: ref,
                inputs: {
                    target_url: process.env.TARGET_URL,
                    okru_stream_channel: process.env.OKRU_STREAM_ID,
                    stream_quality: process.env.STREAM_QUALITY,
                    image_prefix: process.env.IMAGE_PREFIX || 'Live_Thumbnail' // 🔥 YAHAN NAAM AAGE BHEJ DIYA
                }
            })
        });
        console.log("[+] Next workflow run successfully triggered!");
    } catch (err) {
        console.error("[-] Failed to trigger next workflow.");
    }
}, 21000000); 

mainLoop();






























// ================= ALhamdullah both done in one repo, live broadcast to the ok.ru and also thumbnail =============================================



// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn, execSync } = require('child_process'); 
// const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
// const fs = require('fs'); // 🔥 ADDED FS FOR THUMBNAIL EDITING

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': 'YOUR_STREAM_KEY_5_HERE'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// // 🔥 THUMBNAIL SETTINGS
// const IMAGE_PREFIX = process.env.IMAGE_PREFIX || 'Live_Thumbnail';
// const RELEASE_TAG = 'live-match-updates'; 

// let browser = null;
// let ffmpegProcess = null;
// let thumbnailInterval = null; // 🔥 ADDED INTERVAL VARIABLE

// // =========================================================================
// // 🔄 MAIN LOOP
// // =========================================================================
// async function mainLoop() {
//     // 🧹 STEP 1: CLEANUP OLD RELEASE ON STARTUP
//     await setupCleanRelease();

//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// // 📦 FUNCTION TO DELETE OLD IMAGES AND CREATE FRESH RELEASE
// async function setupCleanRelease() {
//     console.log(`\n[🧹] STEP 1: Cleaning up old GENERAL release...`);
//     try {
//         execSync(`gh release delete ${RELEASE_TAG} --cleanup-tag -y`, { stdio: 'ignore' });
//         console.log(`[✅] Old release deleted. Waiting 5 seconds for GitHub to sync...`);
//         await new Promise(r => setTimeout(r, 5000)); 
//     } catch (e) {
//         console.log(`[ℹ️] No old release found to delete.`);
//     }

//     console.log(`[📦] STEP 2: Creating a fresh, VISIBLE GENERAL Release...`);
//     try {
//         execSync(`gh release create ${RELEASE_TAG} --title "🔴 Live Match Updates" --notes "Auto uploaded custom thumbnails." --latest`, { stdio: 'inherit' });
//         console.log(`[✅] General release created successfully!`);
//     } catch (e) { 
//         console.log(`[⚠️] Release creation error (It might already exist). Moving on...`);
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--window-size=1280,720',
//             '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) {
//         if (p !== page) await p.close();
//     }

//     // 🛑 POPUP & REDIRECT BLOCKER
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 🎥 1. START DEBUG RECORDING
//     const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
//     console.log('[*] 🔴 Debug Recording Started...');
//     await recorder.start('./recording.mp4');

//     await new Promise(r => setTimeout(r, 5000));

//     // 🖱️ 2. THE TERMINATOR CLICKER
//     console.log('[*] Hunting for the JW Player Play Button...');
//     let buttonGone = false;
//     let attempts = 0;
    
//     while (!buttonGone && attempts < 15) {
//         buttonGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         buttonGone = false;
//                         console.log(`[*] Play button detected! Smashing it... (Attempt ${attempts + 1}/15)`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         await new Promise(r => setTimeout(r, 2000));
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         attempts++;
//     }

//     // 🧠 3. THE SMART SCANNER
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 if (!vid) return false;
//                 if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
//                 return true; 
//             });

//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame: ${frame.url().substring(0, 50)}...`);
//                 break;
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) {
//         console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
//         targetFrame = page.mainFrame();
//     }

//     // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black';
//         document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls { display: none !important; }`;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//         }
//     }).catch(()=>{});

//     // 📡 5. START FFMPEG BROADCAST
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'default',
//         '-vf', 'scale=854:480', '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', '800k', '-maxrate', '850k', '-bufsize', '1700k',
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-ar', '44100',
//         '-async', '1', '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     });

//     // ⏱️ 6. STOP RECORDING AFTER 10 SECONDS
//     console.log('[*] Capturing stream for 10 seconds to finalize Debug Recording...');
//     await new Promise(r => setTimeout(r, 10000));
//     await recorder.stop();
//     console.log('[+] 10-Sec Debug Video Saved!');

//     // 🎨🔥 6.5. THE 30-SECOND THUMBNAIL LOOP (Background Safe Method)
//     console.log('\n[*] 🔄 Starting 30-Second Thumbnail Generator Loop...');
//     let cycleCounter = 1;
    
//     thumbnailInterval = setInterval(async () => {
//         try {
//             console.log(`\n--- 🎨 THUMBNAIL CYCLE #${cycleCounter} ---`);
//             const uniqueTime = Date.now(); 
//             const rawFrame = `temp_raw_frame_${uniqueTime}.jpg`;
            
//             // 1. Take raw screenshot from LIVE stream (No interference)
//             await page.screenshot({ path: rawFrame, type: 'jpeg', quality: 90 });
//             if (!fs.existsSync(rawFrame)) return;

//             // 2. Read base64
//             const b64Image = "data:image/jpeg;base64," + fs.readFileSync(rawFrame).toString('base64');
//             const htmlCode = `<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700;900&display=swap" rel="stylesheet"><style>body { margin: 0; width: 1280px; height: 720px; background: #0f0f0f; font-family: 'Roboto', sans-serif; color: white; display: flex; flex-direction: column; overflow: hidden; } .header { height: 100px; display: flex; align-items: center; padding: 0 40px; justify-content: space-between; z-index: 10; } .logo { font-size: 50px; font-weight: 900; letter-spacing: 1px; text-shadow: 0 0 10px rgba(255,255,255,0.8); } .live-badge { border: 4px solid #cc0000; border-radius: 12px; padding: 5px 20px; font-size: 40px; font-weight: 700; display: flex; gap: 10px; } .hero-container { position: relative; width: 100%; height: 440px; } .hero-img { width: 100%; height: 100%; object-fit: cover; filter: blur(5px); opacity: 0.6; } .pip-img { position: absolute; top: 20px; right: 40px; width: 45%; border: 6px solid white; box-shadow: -15px 15px 30px rgba(0,0,0,0.8); } .text-container { position: relative; z-index: 999; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 10px 40px; } .main-title { font-size: 70px; font-weight: 900; line-height: 1.1; text-shadow: 6px 6px 15px rgba(0,0,0,0.9); } .live-text { color: #cc0000; }</style></head><body><div class="header"><div class="logo">SPORTSHUB</div><div class="live-badge"><span style="color:#cc0000">●</span> LIVE</div></div><div class="hero-container"><img src="${b64Image}" class="hero-img"><img src="${b64Image}" class="pip-img"></div><div class="text-container"><div class="main-title"><span class="live-text">🔴 Watch Live : </span>bulbul4u-live.xyz</div></div></body></html>`;

//             // 3. SECRETE WEAPON: Start a hidden headless browser just for template rendering
//             const thumbBrowser = await puppeteer.launch({ 
//                 headless: true, // Invisible, won't cover X11 screen
//                 defaultViewport: { width: 1280, height: 720 },
//                 args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
//             });
//             const thumbPage = await thumbBrowser.newPage();
            
//             const outputImagePath = `${IMAGE_PREFIX}_CH${SELECTED_CHANNEL}_${uniqueTime}.png`;
//             await thumbPage.setContent(htmlCode, { waitUntil: 'domcontentloaded' });
//             await thumbPage.screenshot({ path: outputImagePath });
//             await thumbBrowser.close(); // Close immediately

//             fs.unlinkSync(rawFrame); // Delete raw image locally

//             // 4. Upload to GitHub
//             console.log(`[📤] Uploading designed thumbnail to Release...`);
//             try {
//                 execSync(`gh release upload ${RELEASE_TAG} "${outputImagePath}" --clobber`, { stdio: 'inherit' });
//                 console.log(`[✅] Designed Thumbnail Successfully Uploaded!`);
//             } catch (err) {
//                 console.log(`[❌] Upload failed: ${err.message}`);
//             }

//             if (fs.existsSync(outputImagePath)) fs.unlinkSync(outputImagePath); // Delete final image locally
//             cycleCounter++;

//         } catch (err) {
//             console.log(`[❌] Thumbnail error in Cycle #${cycleCounter}: ${err.message}`);
//         }
//     }, 30000); // 30000 ms = 30 Seconds

//     // 🧠 7. THE SMART WATCHDOG (Privacy & Health Check Active...)
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const bodyText = document.body.innerText.toLowerCase();
//             if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
//             console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
//             throw new Error("Watchdog detected video dead."); 
//         }

//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (thumbnailInterval) { clearInterval(thumbnailInterval); thumbnailInterval = null; } // 🔥 STOP THUMBNAIL LOOP ON RESTART
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // =========================================================================
// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// // =========================================================================
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
    
//     if (!repo || !token) return;

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow run successfully triggered!");
//     } catch (err) {
//         console.error("[-] Failed to trigger next workflow.");
//     }
// }, 21000000); 

// mainLoop();
