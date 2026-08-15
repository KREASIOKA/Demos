document.addEventListener('DOMContentLoaded', () => {
    // --- STATE & UTILS ---
    const State = {
        step: 1,
        template: null,
        areas: [],
        currentAreaIdx: -1,
        stream: null,
        autoTimer: null,
        exportQuality: 1.0,
        tgToken: localStorage.getItem('tgToken') || '',
        tgChannel: localStorage.getItem('tgChannel') || '',
        templates: [] // From IndexedDB
    };

    // Configure localForage
    localforage.config({
        name: 'HARVES_Photobooth',
        storeName: 'templates_library'
    });

    const $ = id => document.getElementById(id);
    const $$ = selector => document.querySelectorAll(selector);
    const show = (el, show = true) => el && (el.style.display = show ? '' : 'none');
    
    // --- DOM ELEMENTS ---
    const els = {
        steps: [$('step1'), $('step2'), $('step3')],
        stepItems: $$('.step-item'),
        status: $('statusText'),
        goToCapture: $('goToCapture'),
        
        // Setup
        templateCanvas: $('templateCanvas'),
        photoCanvas: $('photoCanvas'),
        canvasEmpty: $('canvasEmpty'),
        imageInput: $('imageInput'),
        chromaSection: $('chromaSection'),
        chromaColor: $('chromaColor'),
        tolerance: $('tolerance'),
        minArea: $('minArea'),
        feathering: $('feathering'),
        detectAreasBtn: $('detectAreasBtn'),
        templateGallery: $('templateGallery'),
        cameraSelect: $('cameraSelect'),
        resolutionSelect: $('resolutionSelect'),
        mirrorCamera: $('mirrorCamera'),
        startCameraBtn: $('startCameraBtn'),
        
        // Capture
        captureProgress: $('captureProgress'),
        captureAreaInfo: $('captureAreaInfo'),
        webcamVideo: $('webcamVideo'),
        captureOverlay: $('captureOverlay'),
        countdownDisplay: $('countdownDisplay'),
        countdownMessage: $('countdownMessage'),
        flashOverlay: $('flashOverlay'),
        captureBtn: $('captureBtn'),
        autoCaptureBtn: $('autoCaptureBtn'),
        stopAutoCaptureBtn: $('stopAutoCaptureBtn'),
        reviewOverlay: $('reviewOverlay'),
        reviewCanvas: $('reviewCanvas'),
        retakeBtn: $('retakeBtn'),
        acceptBtn: $('acceptBtn'),
        backToSetup: $('backToSetup'),
        
        // Timing
        enableIdle: $('enableIdleTime'),
        idleTime: $('idleTime'),
        countdownTime: $('countdownTime'),
        idleRow: $('idleTimeRow'),
        
        // Result
        resultCanvasSlot: $('resultCanvasSlot'),
        setupCanvasSlot: $('setupCanvasSlot'),
        canvasArea: $('canvasArea'),
        exportBtn: $('exportBtn'),
        createGifBtn: $('createGifBtn'),
        sendTelegramBtn: $('sendTelegramBtn'),
        qrSection: $('qrSection'),
        qrCodeContainer: $('qrCodeContainer'),
        qrUrl: $('qrUrl'),
        backToCapture: $('backToCapture'),
        resetAllBtn: $('resetAllBtn'),
        
        // Settings
        settingsBtn: $('settingsBtn'),
        tgBotTokenInput: $('telegramBotToken'),
        tgChannelInput: $('telegramChannelLink'),
        saveSettingsBtn: $('saveSettings'),
        
        // Modals & Loaders
        settingsModal: new bootstrap.Modal($('settingsModal')),
        exportModal: new bootstrap.Modal($('exportModal')),
        gifModal: new bootstrap.Modal($('gifExportModal')),
        loadingOverlay: $('loadingOverlay'),
        loadingText: $('loadingText')
    };

    const ctx = {
        template: els.templateCanvas.getContext('2d', { willReadFrequently: true }),
        photo: els.photoCanvas.getContext('2d', { willReadFrequently: true }),
        overlay: els.captureOverlay.getContext('2d'),
        review: els.reviewCanvas.getContext('2d')
    };

    // --- TEMPLATE LIBRARY (IndexedDB) ---
    const loadTemplateLibrary = async () => {
        try {
            State.templates = [];
            await localforage.iterate((value, key) => {
                State.templates.push(value);
            });
            // Sort by timestamp desc
            State.templates.sort((a, b) => b.timestamp - a.timestamp);
            renderTemplateGallery();
        } catch (err) {
            console.error("Error loading templates from IndexedDB", err);
        }
    };

    const renderTemplateGallery = () => {
        if (State.templates.length === 0) {
            els.templateGallery.innerHTML = '<div class="info-text" style="grid-column: 1/-1; text-align:center;">No saved templates.</div>';
            return;
        }
        
        els.templateGallery.innerHTML = State.templates.map(t => `
            <div class="template-thumb-card ${State.activeTemplateId === t.id ? 'selected' : ''}" data-id="${t.id}">
                <img src="${t.thumbDataUrl}" alt="Template">
                <button class="template-delete-btn" data-id="${t.id}" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
        `).join('');

        // Attach events
        $$('.template-thumb-card').forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('.template-delete-btn')) return; // Ignore if clicking delete
                applySavedTemplate(card.dataset.id);
            };
        });
        $$('.template-delete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('Delete this template?')) {
                    await localforage.removeItem(btn.dataset.id);
                    if (State.activeTemplateId === btn.dataset.id) {
                        State.activeTemplateId = null;
                        State.template = null;
                        State.areas = [];
                        ctx.template.clearRect(0,0,els.templateCanvas.width,els.templateCanvas.height);
                        show(els.canvasEmpty, true);
                    }
                    loadTemplateLibrary();
                    updateUI();
                }
            };
        });
    };

    const applySavedTemplate = (id) => {
        const tpl = State.templates.find(t => t.id === id);
        if (!tpl) return;
        
        State.activeTemplateId = id;
        
        // Reset photos
        State.areas = tpl.areas.map(a => ({...a, photo: null}));
        
        const img = new Image();
        img.onload = () => {
            State.template = img;
            els.templateCanvas.width = els.photoCanvas.width = img.width;
            els.templateCanvas.height = els.photoCanvas.height = img.height;
            
            // The stored image is already the processed transparent PNG
            ctx.template.clearRect(0, 0, img.width, img.height);
            ctx.template.drawImage(img, 0, 0);
            
            // Draw dark placeholders so areas are visible on white bg
            drawAreaPlaceholders();
            
            show(els.canvasEmpty, false);
            show(els.chromaSection, false);
            resizeCanvas();
            updateUI();
            renderTemplateGallery();
        };
        img.src = tpl.imageDataUrl;
    };

    const saveTemplateToLibrary = async (originalImg, transparentDataUrl, areas) => {
        // Create a small thumbnail
        const thumbCanvas = document.createElement('canvas');
        const aspect = originalImg.width / originalImg.height;
        thumbCanvas.width = 160;
        thumbCanvas.height = 160 / aspect;
        thumbCanvas.getContext('2d').drawImage(originalImg, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

        const id = 'tpl_' + Date.now();
        const templateData = {
            id,
            timestamp: Date.now(),
            imageDataUrl: transparentDataUrl, // The image WITH transparent holes
            thumbDataUrl: thumbDataUrl,
            areas: areas.map(a => ({
                id: a.id,
                bounds: a.bounds,
                photoX: a.photoX, photoY: a.photoY, photoScale: a.photoScale
            }))
        };

        await localforage.setItem(id, templateData);
        State.activeTemplateId = id;
        loadTemplateLibrary();
    };

    // Load templates on boot
    loadTemplateLibrary();

    // --- NAVIGATION & UI FLOW ---
    const updateUI = () => {
        const canProceed = State.template && State.areas.length > 0 && State.stream;
        els.goToCapture.disabled = !canProceed;
        els.status.textContent = State.step === 1 ? (canProceed ? 'Ready to capture!' : 'Select/Load template and start camera.') :
                                 State.step === 2 ? 'Capturing photos...' : 'Review and share results.';
    };

    const goToStep = (step) => {
        State.step = step;
        els.steps.forEach((s, i) => s.classList.toggle('active', i === step - 1));
        els.stepItems.forEach((item, i) => {
            item.classList.toggle('active', i === step - 1);
            item.classList.toggle('done', i < step - 1);
        });
        
        if (step === 1) {
            els.setupCanvasSlot.appendChild(els.canvasArea);
            stopAutoCapture();
        } else if (step === 2) {
            State.currentAreaIdx = State.areas.findIndex(a => !a.photo);
            if (State.currentAreaIdx === -1) State.currentAreaIdx = 0; 
            if (State.areas.every(a => a.photo)) return goToStep(3);
            setupCaptureForCurrentArea();
            stopAutoCapture();
        } else if (step === 3) {
            els.resultCanvasSlot.appendChild(els.canvasArea);
            redrawPhotos();
        }
        updateUI();
        resizeCanvas();
    };

    // --- CHROMA KEY & TEMPLATE LOADING ---
    $('loadImageBtn').onclick = () => els.imageInput.click();
    els.imageInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            State.rawTemplate = img; // Store raw for saving later
            State.template = img;
            els.templateCanvas.width = els.photoCanvas.width = img.width;
            els.templateCanvas.height = els.photoCanvas.height = img.height;
            ctx.template.drawImage(img, 0, 0);
            show(els.canvasEmpty, false);
            show(els.chromaSection, true); // Show config to detect areas
            State.areas = [];
            State.activeTemplateId = null;
            renderTemplateGallery();
            resizeCanvas();
            updateUI();
        };
        img.src = URL.createObjectURL(file);
    };

    const resizeCanvas = () => {
        if (!State.template) return;
        const container = State.step === 3 ? els.resultCanvasSlot : els.setupCanvasSlot;
        const aspect = els.templateCanvas.width / els.templateCanvas.height;
        let w = container.clientWidth, h = container.clientHeight;
        if (w / h > aspect) w = h * aspect; else h = w / aspect;
        [els.templateCanvas, els.photoCanvas].forEach(c => {
            c.style.width = `${w}px`; c.style.height = `${h}px`;
        });
    };
    window.addEventListener('resize', resizeCanvas);

    const syncRangeValue = id => {
        $(id).oninput = e => { $(id + 'Value').textContent = e.target.value; };
    };
    ['tolerance', 'minArea', 'feathering', 'idleTime', 'countdownTime'].forEach(syncRangeValue);

    els.detectAreasBtn.onclick = async () => {
        if (!State.rawTemplate) return;
        
        withLoading('Detecting & Saving...', async () => {
            ctx.template.drawImage(State.rawTemplate, 0, 0);
            const w = els.templateCanvas.width, h = els.templateCanvas.height;
            const imgData = ctx.template.getImageData(0, 0, w, h);
            const data = imgData.data;
            const hex = els.chromaColor.value;
            const cR = parseInt(hex.substr(1,2),16), cG = parseInt(hex.substr(3,2),16), cB = parseInt(hex.substr(5,2),16);
            const tol = parseInt(els.tolerance.value);
            
            const mask = new Uint8Array(w * h);
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                if (Math.sqrt((r-cR)**2 * 0.3 + (g-cG)**2 * 0.6 + (b-cB)**2 * 0.1) <= tol) mask[i/4] = 1;
            }

            const feather = parseInt(els.feathering.value);
            if (feather > 0) {
                const exp = new Uint8Array(w * h);
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        if (mask[y*w+x]) {
                            for(let dy=-feather; dy<=feather; dy++) {
                                for(let dx=-feather; dx<=feather; dx++) {
                                    if(x+dx>=0 && x+dx<w && y+dy>=0 && y+dy<h) exp[(y+dy)*w+(x+dx)] = 1;
                                }
                            }
                        }
                    }
                }
                mask.set(exp);
            }

            State.areas = [];
            const visited = new Uint8Array(w * h);
            const minArea = parseInt(els.minArea.value);
            
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y*w+x;
                    if (mask[idx] && !visited[idx]) {
                        const stack = [{x, y}];
                        let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
                        
                        while (stack.length) {
                            const p = stack.pop();
                            const pi = p.y*w+p.x;
                            if (p.x<0 || p.x>=w || p.y<0 || p.y>=h || visited[pi] || !mask[pi]) continue;
                            visited[pi] = 1; count++;
                            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
                            stack.push({x:p.x+1, y:p.y}, {x:p.x-1, y:p.y}, {x:p.x, y:p.y+1}, {x:p.x, y:p.y-1});
                        }
                        
                        if (count >= minArea) {
                            State.areas.push({
                                id: State.areas.length + 1,
                                bounds: { x: minX, y: minY, w: maxX-minX+1, h: maxY-minY+1 },
                                photo: null, photoX: minX, photoY: minY, photoScale: 1.0
                            });
                        }
                    }
                }
            }
            
            for (let i = 0; i < data.length; i += 4) {
                if (mask[i/4]) data[i+3] = 0; 
            }
            ctx.template.putImageData(imgData, 0, 0);
            
            // Draw dark placeholders on photoCanvas so areas are visible on white bg
            drawAreaPlaceholders();
            
            // Save to IndexedDB
            const transparentDataUrl = els.templateCanvas.toDataURL('image/png');
            await saveTemplateToLibrary(State.rawTemplate, transparentDataUrl, State.areas);
            
            show(els.chromaSection, false);
            updateUI();
        });
    };

    // --- CAMERA ---
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const cams = devices.filter(d => d.kind === 'videoinput');
        els.cameraSelect.innerHTML = '<option value="">Select Camera</option>' + cams.map((c,i) => `<option value="${c.deviceId}">${c.label || 'Cam '+(i+1)}</option>`).join('');
    });

    const startCamera = () => {
        if (State.stream) {
            State.stream.getTracks().forEach(t => t.stop());
            State.stream = null;
            els.startCameraBtn.classList.remove('active');
            els.startCameraBtn.innerHTML = '<i class="bi bi-camera-video-fill"></i> Start Camera';
            updateUI();
            return;
        }
        const res = els.resolutionSelect.value.split('x');
        navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: els.cameraSelect.value ? { exact: els.cameraSelect.value } : undefined,
                width: { ideal: parseInt(res[0]) }, height: { ideal: parseInt(res[1]) }
            }
        }).then(s => {
            State.stream = s;
            els.webcamVideo.srcObject = s;
            els.startCameraBtn.classList.add('active');
            els.startCameraBtn.innerHTML = '<i class="bi bi-camera-video-off-fill"></i> Stop Camera';
            updateMirror();
            els.webcamVideo.onloadedmetadata = () => {
                els.captureOverlay.width = els.webcamVideo.videoWidth;
                els.captureOverlay.height = els.webcamVideo.videoHeight;
                if(State.step === 2) updateCaptureOverlay();
            };
            updateUI();
        });
    };
    els.startCameraBtn.onclick = startCamera;
    
    const updateMirror = () => {
        els.webcamVideo.style.transform = els.mirrorCamera.checked ? 'scaleX(-1)' : 'none';
        els.reviewCanvas.style.transform = els.mirrorCamera.checked ? 'scaleX(-1)' : 'none';
    };
    els.mirrorCamera.onchange = updateMirror;

    // --- CAPTURE FLOW (STEP 2) ---
    els.goToCapture.onclick = () => goToStep(2);
    els.backToSetup.onclick = () => goToStep(1);
    
    const setupCaptureForCurrentArea = () => {
        if(State.currentAreaIdx >= State.areas.length) return goToStep(3);
        const area = State.areas[State.currentAreaIdx];
        els.captureProgress.textContent = `Photo ${State.currentAreaIdx + 1} of ${State.areas.length}`;
        els.captureAreaInfo.textContent = `Area ${area.id}`;
        updateCaptureOverlay();
    };

    const updateCaptureOverlay = () => {
        if (!els.webcamVideo.videoWidth || State.currentAreaIdx < 0 || State.currentAreaIdx >= State.areas.length) return;
        const area = State.areas[State.currentAreaIdx];
        ctx.overlay.clearRect(0,0, els.captureOverlay.width, els.captureOverlay.height);
        
        const vidAsp = els.captureOverlay.width / els.captureOverlay.height;
        const areaAsp = area.bounds.w / area.bounds.h;
        let bw, bh;
        if (vidAsp > areaAsp) { bh = els.captureOverlay.height; bw = bh * areaAsp; } 
        else { bw = els.captureOverlay.width; bh = bw / areaAsp; }
        
        const bx = (els.captureOverlay.width - bw) / 2;
        const by = (els.captureOverlay.height - bh) / 2;
        
        ctx.overlay.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.overlay.fillRect(0,0, els.captureOverlay.width, els.captureOverlay.height);
        ctx.overlay.clearRect(bx, by, bw, bh);
        
        ctx.overlay.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.overlay.lineWidth = 4;
        ctx.overlay.strokeRect(bx, by, bw, bh);
        State.dimBox = {x:bx, y:by, w:bw, h:bh};
    };

    const flash = () => {
        els.flashOverlay.classList.add('flash');
        setTimeout(() => els.flashOverlay.classList.remove('flash'), 100);
    };

    const capturePhoto = () => {
        if (!State.dimBox) return;
        flash();
        
        const tmp = document.createElement('canvas');
        tmp.width = State.dimBox.w; tmp.height = State.dimBox.h;
        const tctx = tmp.getContext('2d');
        if (els.mirrorCamera.checked) { tctx.translate(tmp.width, 0); tctx.scale(-1, 1); }
        
        tctx.drawImage(els.webcamVideo, State.dimBox.x, State.dimBox.y, State.dimBox.w, State.dimBox.h, 0, 0, tmp.width, tmp.height);
        
        State.tempPhoto = new Image();
        State.tempPhoto.onload = () => {
            els.reviewCanvas.width = tmp.width; els.reviewCanvas.height = tmp.height;
            ctx.review.clearRect(0,0,tmp.width,tmp.height);
            els.reviewCanvas.style.transform = 'none'; 
            ctx.review.drawImage(State.tempPhoto, 0, 0);
            els.reviewOverlay.classList.add('show');
        };
        State.tempPhoto.src = tmp.toDataURL('image/jpeg', 0.9);
    };

    els.captureBtn.onclick = capturePhoto;

    els.retakeBtn.onclick = () => {
        els.reviewOverlay.classList.remove('show');
        if (State.autoTimer) startAutoCapture(); 
    };

    els.acceptBtn.onclick = () => {
        els.reviewOverlay.classList.remove('show');
        const area = State.areas[State.currentAreaIdx];
        area.photo = State.tempPhoto;
        area.photoScale = Math.min(area.bounds.w / State.tempPhoto.width, area.bounds.h / State.tempPhoto.height);
        redrawPhotos();
        
        State.currentAreaIdx++;
        if (State.currentAreaIdx >= State.areas.length) {
            stopAutoCapture();
            goToStep(3);
        } else {
            setupCaptureForCurrentArea();
            if (State.autoTimer) startAutoCaptureSequence(); 
        }
    };

    // Auto Capture
    els.enableIdle.onchange = () => show(els.idleRow, els.enableIdle.checked);
    
    const startAutoCapture = () => {
        els.autoCaptureBtn.style.display = 'none';
        els.stopAutoCaptureBtn.style.display = 'flex';
        els.captureBtn.style.pointerEvents = 'none';
        State.autoTimer = true;
        startAutoCaptureSequence();
    };

    const stopAutoCapture = () => {
        els.autoCaptureBtn.style.display = 'flex';
        els.stopAutoCaptureBtn.style.display = 'none';
        els.captureBtn.style.pointerEvents = 'auto';
        clearTimeout(State.autoTimer);
        clearInterval(State.countInterval);
        State.autoTimer = null;
        show(els.countdownMessage, false);
        show(els.countdownDisplay, false);
    };

    els.autoCaptureBtn.onclick = startAutoCapture;
    els.stopAutoCaptureBtn.onclick = stopAutoCapture;

    const startAutoCaptureSequence = () => {
        const idle = els.enableIdle.checked ? parseInt(els.idleTime.value) : 0;
        const count = parseInt(els.countdownTime.value);
        
        if (idle > 0) {
            els.countdownMessage.textContent = '🕐 Bersiap-siap...'; 
            els.countdownMessage.classList.remove('countdown-warning');
            show(els.countdownMessage, true);
            let c = idle;
            els.countdownDisplay.textContent = c; 
            els.countdownDisplay.classList.remove('countdown-warning');
            els.countdownDisplay.style.opacity = '0.5';
            show(els.countdownDisplay, true);
            
            State.countInterval = setInterval(() => {
                c--;
                if (c > 0) {
                    els.countdownDisplay.textContent = c;
                    els.countdownMessage.textContent = `🕐 Bersiap-siap... (${c}s)`;
                } else {
                    clearInterval(State.countInterval);
                    els.countdownDisplay.style.opacity = '1';
                    doCountdown(count);
                }
            }, 1000);
        } else {
            doCountdown(count);
        }
    };

    const doCountdown = (secs) => {
        els.countdownMessage.textContent = '📸 Tersenyum!'; 
        els.countdownMessage.classList.add('countdown-warning');
        show(els.countdownMessage, true);
        let c = secs;
        els.countdownDisplay.textContent = c; show(els.countdownDisplay, true);
        els.countdownDisplay.classList.remove('countdown-warning');
        
        State.countInterval = setInterval(() => {
            c--;
            if (c <= 3) els.countdownDisplay.classList.add('countdown-warning');
            if (c > 0) els.countdownDisplay.textContent = c;
            else {
                clearInterval(State.countInterval);
                show(els.countdownMessage, false); show(els.countdownDisplay, false);
                capturePhoto();
            }
        }, 1000);
    };

    // --- AREA PLACEHOLDERS (dark rectangles on white theme) ---
    const drawAreaPlaceholders = () => {
        ctx.photo.clearRect(0,0, els.photoCanvas.width, els.photoCanvas.height);
        State.areas.forEach(a => {
            if (a.photo) return; // skip if already has photo
            const b = a.bounds;
            // Draw dark semi-transparent fill
            ctx.photo.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.photo.fillRect(b.x, b.y, b.w, b.h);
            // Draw border
            ctx.photo.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.photo.lineWidth = 2;
            ctx.photo.setLineDash([8, 4]);
            ctx.photo.strokeRect(b.x, b.y, b.w, b.h);
            ctx.photo.setLineDash([]);
            // Draw area number
            const fontSize = Math.max(16, Math.min(b.w, b.h) * 0.15);
            ctx.photo.font = `bold ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
            ctx.photo.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.photo.textAlign = 'center';
            ctx.photo.textBaseline = 'middle';
            ctx.photo.fillText(`Area ${a.id}`, b.x + b.w / 2, b.y + b.h / 2);
        });
    };

    // --- PHOTO RENDERING ---
    const redrawPhotos = () => {
        ctx.photo.clearRect(0,0, els.photoCanvas.width, els.photoCanvas.height);
        ctx.photo.imageSmoothingEnabled = true;
        ctx.photo.imageSmoothingQuality = 'high';
        State.areas.forEach(a => {
            if(a.photo) ctx.photo.drawImage(a.photo, a.photoX, a.photoY, a.photo.width*a.photoScale, a.photo.height*a.photoScale);
            else {
                // Draw placeholder for unfilled areas
                const b = a.bounds;
                ctx.photo.fillStyle = 'rgba(0, 0, 0, 0.15)';
                ctx.photo.fillRect(b.x, b.y, b.w, b.h);
                ctx.photo.strokeStyle = 'rgba(0, 0, 0, 0.25)';
                ctx.photo.lineWidth = 2;
                ctx.photo.setLineDash([8, 4]);
                ctx.photo.strokeRect(b.x, b.y, b.w, b.h);
                ctx.photo.setLineDash([]);
                const fontSize = Math.max(16, Math.min(b.w, b.h) * 0.15);
                ctx.photo.font = `bold ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
                ctx.photo.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.photo.textAlign = 'center';
                ctx.photo.textBaseline = 'middle';
                ctx.photo.fillText(`Area ${a.id}`, b.x + b.w / 2, b.y + b.h / 2);
            }
        });
    };

    // --- STEP 3: RESULT & EXPORT ---
    els.backToCapture.onclick = () => {
        State.areas.forEach(a => a.photo = null);
        redrawPhotos();
        goToStep(2);
    };
    els.resetAllBtn.onclick = () => location.reload();
    
    // Telegram Settings
    els.settingsBtn.onclick = () => {
        els.tgBotTokenInput.value = State.tgToken;
        els.tgChannelInput.value = State.tgChannel;
        els.settingsModal.show();
    };
    els.saveSettingsBtn.onclick = () => {
        State.tgToken = els.tgBotTokenInput.value.trim();
        State.tgChannel = els.tgChannelInput.value.trim();
        localStorage.setItem('tgToken', State.tgToken);
        localStorage.setItem('tgChannel', State.tgChannel);
        els.settingsModal.hide();
    };

    // Show Loading
    const withLoading = async (msg, task) => {
        els.loadingText.textContent = msg;
        els.loadingOverlay.classList.add('show');
        await new Promise(r => setTimeout(r, 50)); 
        try { await task(); } catch(e) { alert('Error: ' + e.message); console.error(e); }
        els.loadingOverlay.classList.remove('show');
    };

    // Export High Res Image
    const generateHighResCanvas = (dpi, quality) => {
        const scale = dpi / 96;
        const c = document.createElement('canvas');
        c.width = els.templateCanvas.width * scale;
        c.height = els.templateCanvas.height * scale;
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        
        State.areas.forEach(a => {
            if(a.photo) cx.drawImage(a.photo, a.photoX*scale, a.photoY*scale, a.photo.width*a.photoScale*scale, a.photo.height*a.photoScale*scale);
        });
        cx.drawImage(els.templateCanvas, 0, 0, els.templateCanvas.width, els.templateCanvas.height, 0, 0, c.width, c.height);
        return new Promise(res => c.toBlob(blob => res(blob), 'image/jpeg', quality));
    };

    els.exportBtn.onclick = () => els.exportModal.show();
    $$('#exportModal .btn-outline-primary').forEach(btn => {
        btn.onclick = (e) => {
            $$('#exportModal .btn-outline-primary').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            State.exportQuality = parseFloat(e.target.dataset.quality);
        };
    });

    $('confirmExport').onclick = () => {
        withLoading('Generating image...', async () => {
            const dpi = parseInt($('exportDPI').value);
            const blob = await generateHighResCanvas(dpi, State.exportQuality);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${$('exportFileName').value || 'harves-photobooth'}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
            els.exportModal.hide();
        });
    };

    // GIF Export
    els.createGifBtn.onclick = () => els.gifModal.show();
    $('confirmGifExport').onclick = () => {
        withLoading('Creating GIF...', async () => {
            return new Promise((resolve, reject) => {
                const photos = State.areas.filter(a=>a.photo).sort((a,b)=>a.id-b.id);
                if(!photos.length) return reject(new Error('No photos'));
                
                const w = parseInt($('gifWidth').value), h = parseInt($('gifHeight').value);
                const gif = new GIF({ workers: 2, quality: parseInt($('gifQuality').value), width: w, height: h, workerScript: 'gif.worker.js', background: '#fff' });
                
                photos.forEach(a => {
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    const cx = c.getContext('2d');
                    cx.fillStyle='#fff'; cx.fillRect(0,0,w,h);
                    
                    const pAsp = a.photo.width/a.photo.height, cAsp = w/h;
                    let dw, dh, dx, dy;
                    if(pAsp > cAsp) { dw = w; dh = w/pAsp; dx = 0; dy = (h-dh)/2; }
                    else { dh = h; dw = h*pAsp; dx = (w-dw)/2; dy = 0; }
                    cx.drawImage(a.photo, dx, dy, dw, dh);
                    gif.addFrame(c, { delay: parseInt($('gifFrameDuration').value) });
                });
                
                gif.on('finished', blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `${$('gifFileName').value || 'gif'}.gif`;
                    a.click(); URL.revokeObjectURL(url);
                    els.gifModal.hide();
                    resolve();
                });
                gif.render();
            });
        });
    };

    // Telegram & QR
    els.sendTelegramBtn.onclick = () => {
        if (!State.tgToken || !State.tgChannel) return alert('Please configure Telegram Bot Token and Channel Link in Settings first.');
        
        withLoading('Sending to Telegram...', async () => {
            const blob = await generateHighResCanvas(96, 0.85); 
            const fd = new FormData();
            
            let chatId = State.tgChannel;
            if (chatId.includes('t.me/')) {
                const parts = chatId.split('/');
                chatId = '@' + parts[parts.length-1];
            }
            if (chatId.includes('/s/')) {
                const parts = chatId.split('/s/');
                chatId = '@' + parts[parts.length-1];
            }

            fd.append('chat_id', chatId);
            fd.append('photo', blob, 'photobooth.jpg');
            
            const res = await fetch(`https://api.telegram.org/bot${State.tgToken}/sendPhoto`, { method: 'POST', body: fd });
            const data = await res.json();
            
            if (data.ok) {
                const photos = data.result.photo;
                const fileId = photos[photos.length - 1].file_id;
                
                const fileRes = await fetch(`https://api.telegram.org/bot${State.tgToken}/getFile?file_id=${fileId}`);
                const fileData = await fileRes.json();
                
                if (fileData.ok) {
                    const filePath = fileData.result.file_path;
                    const directUrl = `https://api.telegram.org/file/bot${State.tgToken}/${filePath}`;
                    
                    els.qrCodeContainer.innerHTML = '';
                    const qr = qrcode(0, 'M');
                    qr.addData(directUrl);
                    qr.make();
                    els.qrCodeContainer.innerHTML = qr.createImgTag(5, 0);
                    
                    els.qrUrl.textContent = "Scan to view & download photo";
                    show(els.qrSection, true);
                    
                    document.querySelector('.sidebar-scroll').scrollTop = 9999;
                } else {
                    throw new Error("Failed to get direct file path from Telegram.");
                }
            } else {
                throw new Error(data.description);
            }
        });
    };
});