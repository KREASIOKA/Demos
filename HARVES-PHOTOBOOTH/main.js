document.addEventListener('DOMContentLoaded', () => {
    // --- STATE & UTILS ---
    const State = {
        step: 0,
        template: null,
        areas: [],
        currentAreaIdx: -1,
        stream: null,
        autoTimer: null,
        tgToken: localStorage.getItem('tgToken') || '',
        tgChannel: localStorage.getItem('tgChannel') || '',
        templates: [], // From IndexedDB
        activeTemplateId: null,
        mockupImages: [],
        // Admin upload state
        adminRawTemplate: null,
        adminAreas: [],
        adminHasTransparency: false
    };

    // Preload mockups
    for (let i = 1; i <= 10; i++) {
        const img = new Image();
        img.src = `img/mockup/${i}.jpeg`;
        State.mockupImages.push(img);
    }

    localforage.config({ name: 'HARVES_Photobooth', storeName: 'templates_library' });

    const $ = id => document.getElementById(id);
    const $$ = selector => document.querySelectorAll(selector);
    const show = (el, show = true) => el && (el.style.display = show ? 'flex' : 'none');

    // --- DOM ELEMENTS ---
    const els = {
        steps: [$('step0'), $('step1'), $('step2'), $('step3'), $('step4')],

        // Settings / Floating
        settingsBtn: $('settingsBtn'),
        settingsModal: new bootstrap.Modal($('settingsModal')),
        tgBotTokenInput: $('telegramBotToken'),
        tgChannelInput: $('telegramChannelLink'),
        saveSettingsBtn: $('saveSettings'),
        factoryResetBtn: $('factoryResetBtn'),

        // Admin Upload
        loadImageBtn: $('loadImageBtn'),
        imageInput: $('imageInput'),
        templatePreviewSection: $('templatePreviewSection'),
        previewCanvasSettings: $('previewCanvasSettings'),
        templateStatusText: $('templateStatusText'),
        chromaSettings: $('chromaSettings'),
        btnDetectPreview: $('btnDetectPreview'),
        btnSaveTemplatePreview: $('btnSaveTemplatePreview'),

        // Step 0: Welcome
        btnStartApp: $('btnStartApp'),

        // Step 1: Template Library
        templateGallery: $('templateGallery'),
        btnBackToWelcome: $('btnBackToWelcome'),
        btnContinueToTimer: $('btnContinueToTimer'),

        // Hidden Canvases
        photoCanvas: $('photoCanvas'),
        templateCanvas: $('templateCanvas'),

        // Step 2: Timer
        enableIdle: $('enableIdleTime'),
        idleTime: $('idleTime'),
        countdownTime: $('countdownTime'),
        idleRow: $('idleTimeRow'),
        btnBackToTemplate: $('btnBackToTemplate'),
        btnStartCapture: $('btnStartCapture'),

        // Camera Config (Admin)
        cameraSelect: $('cameraSelect'),
        resolutionSelect: $('resolutionSelect'),
        mirrorCamera: $('mirrorCamera'),

        // Step 3: Capture
        captureProgress: $('captureProgress'),
        captureAreaInfo: $('captureAreaInfo'),
        webcamVideo: $('webcamVideo'),
        captureOverlay: $('captureOverlay'),
        countdownDisplay: $('countdownDisplay'),
        countdownMessage: $('countdownMessage'),
        flashOverlay: $('flashOverlay'),
        manualControls: $('manualControls'),
        autoCaptureBtn: $('autoCaptureBtn'),
        captureBtn: $('captureBtn'),
        reviewOverlay: $('reviewOverlay'),
        reviewCanvas: $('reviewCanvas'),
        retakeBtn: $('retakeBtn'),
        acceptBtn: $('acceptBtn'),
        backToTimer: $('backToTimer'),
        retakeAllBtn: $('retakeAllBtn'),

        // Step 4: Result
        resultCanvasSlot: $('resultCanvasSlot'),
        exportBtn: $('exportBtn'),
        createGifBtn: $('createGifBtn'),
        sendTelegramBtn: $('sendTelegramBtn'),
        qrSection: $('qrSection'),
        qrCodeContainer: $('qrCodeContainer'),
        qrUrl: $('qrUrl'),
        backToCaptureBtn: $('backToCaptureBtn'),
        resetAllBtn: $('resetAllBtn'),
        exportModal: new bootstrap.Modal($('exportModal')),

        // Chroma Key controls
        chromaColor: $('chromaColor'),
        tolerance: $('tolerance'),
        minArea: $('minArea'),
        feathering: $('feathering'),

        loadingOverlay: $('loadingOverlay'),
        loadingText: $('loadingText')
    };

    const ctx = {
        template: els.templateCanvas.getContext('2d', { willReadFrequently: true }),
        photo: els.photoCanvas.getContext('2d', { willReadFrequently: true }),
        overlay: els.captureOverlay.getContext('2d'),
        review: els.reviewCanvas.getContext('2d'),
        preview: els.previewCanvasSettings.getContext('2d', { willReadFrequently: true })
    };

    const withLoading = async (msg, task) => {
        els.loadingText.textContent = msg;
        els.loadingOverlay.style.display = 'flex';
        await new Promise(r => setTimeout(r, 50));
        try { await task(); } catch (e) { alert('Error: ' + e.message); console.error(e); }
        els.loadingOverlay.style.display = 'none';
    };

    // --- NAVIGATION (5-STEP WIZARD) ---
    const delay = ms => new Promise(res => setTimeout(res, ms));

    const goToStep = async (stepIdx) => {
        if (State.step === stepIdx) return;
        const currentEl = els.steps[State.step];
        const nextEl = els.steps[stepIdx];

        State.step = stepIdx;

        if (currentEl) {
            currentEl.classList.add('step-leave');
            await delay(300);
            currentEl.classList.remove('active', 'step-leave');
        }

        if (nextEl) {
            nextEl.classList.add('active', 'step-enter');
            await delay(50);
            nextEl.classList.remove('step-enter');
        }

        // Logic per step
        if (stepIdx === 0) {
            // Stop camera if going back to start to save resources? No, keep it running for fast access
        } else if (stepIdx === 1) {
            startCamera(); // Ensure camera is running
            renderTemplateGallery();
        } else if (stepIdx === 2) {
            // Just timer settings
        } else if (stepIdx === 3) {
            State.currentAreaIdx = State.areas.findIndex(a => !a.photo);
            if (State.currentAreaIdx === -1) State.currentAreaIdx = 0;
            if (State.areas.every(a => a.photo)) return goToStep(4);
            setupCaptureForCurrentArea();
            startAutoCaptureSequence(); // Start auto right away
        } else if (stepIdx === 4) {
            stopAutoCapture();
            els.resultCanvasSlot.innerHTML = '';
            els.resultCanvasSlot.appendChild(els.photoCanvas);
            els.resultCanvasSlot.appendChild(els.templateCanvas);
            redrawPhotos();
            // Set container size to match template aspect ratio
            const cw = els.resultCanvasSlot.parentElement.clientWidth;
            const ch = els.resultCanvasSlot.parentElement.clientHeight;
            const tAsp = els.templateCanvas.width / els.templateCanvas.height;
            let rw = cw, rh = ch;
            if (cw / ch > tAsp) rw = ch * tAsp; else rh = cw / tAsp;
            els.resultCanvasSlot.style.width = rw + 'px';
            els.resultCanvasSlot.style.height = rh + 'px';
            [els.templateCanvas, els.photoCanvas].forEach(c => { c.style.width = rw + 'px'; c.style.height = rh + 'px'; });
            els.qrSection.style.display = 'none';
        }
    };

    // Navigation Bindings
    els.btnStartApp.onclick = () => goToStep(1);
    els.btnBackToWelcome.onclick = () => goToStep(0);
    els.btnContinueToTimer.onclick = () => goToStep(2);
    els.btnBackToTemplate.onclick = () => goToStep(1);
    els.btnStartCapture.onclick = () => goToStep(3);
    els.backToTimer.onclick = () => { stopAutoCapture(); goToStep(2); };
    els.backToCaptureBtn.onclick = () => { State.areas.forEach(a => a.photo = null); goToStep(3); };
    els.resetAllBtn.onclick = () => {
        State.activeTemplateId = null; State.template = null; State.areas = [];
        ctx.photo.clearRect(0, 0, els.photoCanvas.width, els.photoCanvas.height);
        ctx.template.clearRect(0, 0, els.templateCanvas.width, els.templateCanvas.height);
        goToStep(0);
    };

    // --- TEMPLATE LIBRARY ---
    const loadTemplateLibrary = async () => {
        try {
            State.templates = [];
            await localforage.iterate((value) => { State.templates.push(value); });

            // Auto-inject a default template if none exist
            if (State.templates.length === 0) {
                const defCanvas = document.createElement('canvas');
                defCanvas.width = 1080; defCanvas.height = 1920;
                const dct = defCanvas.getContext('2d');
                dct.fillStyle = '#F2C94C'; // HARVES Yellow
                dct.fillRect(0, 0, 1080, 1920);
                dct.fillStyle = '#fffdf7'; // HARVES White
                dct.fillRect(40, 40, 1000, 1840);

                // Draw some text
                dct.fillStyle = '#1d1d1f';
                dct.font = 'bold 60px Inter, sans-serif';
                dct.textAlign = 'center';
                dct.fillText('HARVES PHOTOBOOTH', 540, 1850);

                // Cut out 3 photo areas
                dct.globalCompositeOperation = 'destination-out';
                for (let i = 0; i < 3; i++) dct.fillRect(90, 120 + i * 530, 900, 500);

                const defData = defCanvas.toDataURL('image/png');
                const defId = 'tpl_default';
                const defTpl = {
                    id: defId, timestamp: Date.now(),
                    imageDataUrl: defData, thumbDataUrl: defData,
                    areas: [
                        { id: 1, bounds: { x: 90, y: 120, w: 900, h: 500 }, photoX: 90, photoY: 120, photoScale: 1 },
                        { id: 2, bounds: { x: 90, y: 650, w: 900, h: 500 }, photoX: 90, photoY: 650, photoScale: 1 },
                        { id: 3, bounds: { x: 90, y: 1180, w: 900, h: 500 }, photoX: 90, photoY: 1180, photoScale: 1 }
                    ]
                };
                await localforage.setItem(defId, defTpl);
                State.templates.push(defTpl);
            }

            State.templates.sort((a, b) => b.timestamp - a.timestamp);
            if (State.step === 1) renderTemplateGallery();
        } catch (err) { console.error("Error loading templates", err); }
    };

    const renderTemplateGallery = () => {
        if (State.templates.length === 0) {
            els.templateGallery.innerHTML = '<div class="text-muted w-100 text-center" style="padding:60px 20px"><i class="bi bi-images" style="font-size:3rem;display:block;margin-bottom:12px"></i>No templates yet.<br>Upload via <b>Settings</b> (⚙️).</div>';
            els.btnContinueToTimer.disabled = true;
            return;
        }
        // Render skeletons first
        els.templateGallery.innerHTML = State.templates.map((t, i) => `
            <div class="template-thumb-card skeleton ${State.activeTemplateId === t.id ? 'selected' : ''}" data-id="${t.id}">
                <img alt="Template ${i + 1}">
                <div class="template-info"><i class="bi bi-camera-fill"></i> ${t.areas.length} Photo${t.areas.length > 1 ? 's' : ''}</div>
                <button class="template-delete-btn" data-id="${t.id}" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
        `).join('');

        // Lazy load images with error fallbacks
        $$('.template-thumb-card').forEach((card, i) => {
            const img = card.querySelector('img');
            const t = State.templates[i];
            setTimeout(() => {
                img.onload = () => { img.classList.add('loaded'); card.classList.remove('skeleton'); };
                img.onerror = () => {
                    // Fallback to raw imageDataUrl if thumb fails
                    if (img.src !== t.imageDataUrl) {
                        img.src = t.imageDataUrl;
                    } else {
                        card.classList.remove('skeleton');
                        card.style.background = '#ffeb3b'; // highlight broken
                    }
                };
                img.src = t.thumbDataUrl || t.imageDataUrl;
            }, 50 * i);

            card.onclick = (e) => {
                if (e.target.closest('.template-delete-btn')) return;
                $$('.template-thumb-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const tpl = State.templates.find(x => x.id === card.dataset.id);
                if (!tpl) return;
                State.activeTemplateId = tpl.id;
                State.areas = (tpl.areas || []).map(a => ({ ...a, photo: null }));
                const tImg = new Image();
                tImg.onload = () => {
                    State.template = tImg;
                    els.templateCanvas.width = els.photoCanvas.width = tImg.width;
                    els.templateCanvas.height = els.photoCanvas.height = tImg.height;
                    ctx.template.clearRect(0, 0, tImg.width, tImg.height);
                    ctx.template.drawImage(tImg, 0, 0);
                    els.btnContinueToTimer.disabled = false;
                };
                tImg.src = tpl.imageDataUrl;
            };
        });

        $$('.template-delete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this template?')) return;
                await localforage.removeItem(btn.dataset.id);
                if (State.activeTemplateId === btn.dataset.id) {
                    State.activeTemplateId = null; State.template = null; State.areas = [];
                    els.btnContinueToTimer.disabled = true;
                }
                await loadTemplateLibrary();
            };
        });
    };

    // --- ADMIN SETTINGS & TEMPLATE UPLOAD ---
    els.settingsBtn.onclick = () => {
        els.tgBotTokenInput.value = State.tgToken; els.tgChannelInput.value = State.tgChannel;
        els.templatePreviewSection.style.display = 'none';
        els.settingsModal.show();
    };
    els.saveSettingsBtn.onclick = () => {
        State.tgToken = els.tgBotTokenInput.value.trim(); State.tgChannel = els.tgChannelInput.value.trim();
        localStorage.setItem('tgToken', State.tgToken); localStorage.setItem('tgChannel', State.tgChannel);
        els.settingsModal.hide();
        updateMirror();
    };

    els.factoryResetBtn.onclick = async () => {
        if (confirm("WARNING: This will delete ALL templates, settings, and clear camera permissions. This action cannot be undone. Continue?")) {
            withLoading('Resetting Everything...', async () => {
                localStorage.clear();
                sessionStorage.clear();
                await localforage.clear();
                window.location.reload();
            });
        }
    };

    els.loadImageBtn.onclick = () => els.imageInput.click();
    els.imageInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        els.templatePreviewSection.style.display = 'block';
        els.btnSaveTemplatePreview.disabled = true;
        els.chromaSettings.style.display = 'none';
        els.templateStatusText.textContent = "Analyzing image...";
        els.templateStatusText.className = "text-warning mt-2 small fw-bold";

        const img = new Image();
        img.onload = () => {
            State.adminRawTemplate = img;
            els.previewCanvasSettings.width = img.width;
            els.previewCanvasSettings.height = img.height;
            ctx.preview.drawImage(img, 0, 0);

            // Check Alpha
            const imgData = ctx.preview.getImageData(0, 0, img.width, img.height);
            const data = imgData.data;
            let hasTransparency = false;
            const mask = new Uint8Array(img.width * img.height);

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 50) {
                    hasTransparency = true;
                    mask[i / 4] = 1;
                    data[i + 3] = 0;
                }
            }

            State.adminHasTransparency = hasTransparency;

            if (hasTransparency) {
                ctx.preview.putImageData(imgData, 0, 0);
                const areas = detectAreas(mask, img.width, img.height, 500);
                State.adminAreas = areas;

                els.templateStatusText.textContent = `Smart Detect: Transparent PNG recognized! Found ${areas.length} photo area(s).`;
                els.templateStatusText.className = "text-success mt-2 small fw-bold";
                els.btnSaveTemplatePreview.disabled = areas.length === 0;
                drawAdminAreas();
            } else {
                els.templateStatusText.textContent = `Solid Image: No transparency found. Please use Chroma Key config below.`;
                els.templateStatusText.className = "text-danger mt-2 small fw-bold";
                els.chromaSettings.style.display = 'block';
                els.btnSaveTemplatePreview.disabled = true;
            }
        };
        img.src = URL.createObjectURL(file);
    };

    const detectAreas = (mask, w, h, minAreaSize) => {
        const areas = [];
        const visited = new Uint8Array(w * h);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (mask[idx] && !visited[idx]) {
                    const stack = [{ x, y }];
                    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;

                    while (stack.length) {
                        const p = stack.pop();
                        const pi = p.y * w + p.x;
                        if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h || visited[pi] || !mask[pi]) continue;
                        visited[pi] = 1; count++;
                        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
                        stack.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
                    }

                    if (count >= minAreaSize) {
                        areas.push({
                            id: areas.length + 1,
                            bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
                            photo: null, photoX: minX, photoY: minY, photoScale: 1.0
                        });
                    }
                }
            }
        }
        return areas;
    };

    els.btnDetectPreview.onclick = () => {
        const img = State.adminRawTemplate;
        if (!img) return;
        const { mask, w, h } = applyChromaMask(ctx.preview, img);
        const areas = detectAreas(mask, w, h, parseInt(els.minArea.value));
        State.adminAreas = areas;
        els.templateStatusText.textContent = `Chroma Key processed. Found ${areas.length} photo area(s).`;
        els.templateStatusText.className = areas.length > 0 ? "text-success mt-2 small fw-bold" : "text-danger mt-2 small fw-bold";
        els.btnSaveTemplatePreview.disabled = areas.length === 0;
        drawAdminAreas();
    };

    const drawAdminAreas = () => {
        State.adminAreas.forEach(a => {
            const b = a.bounds;
            ctx.preview.fillStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.preview.fillRect(b.x, b.y, b.w, b.h);
            ctx.preview.strokeStyle = 'red';
            ctx.preview.lineWidth = 4;
            ctx.preview.strokeRect(b.x, b.y, b.w, b.h);
            ctx.preview.font = "bold 40px sans-serif";
            ctx.preview.fillStyle = "red";
            ctx.preview.fillText(`Area ${a.id}`, b.x + 10, b.y + 50);
        });
    };

    // Shared chroma mask applicator — used by detect preview AND save
    const applyChromaMask = (canvasCtx, img) => {
        canvasCtx.clearRect(0, 0, img.width, img.height);
        canvasCtx.drawImage(img, 0, 0);
        const w = img.width, h = img.height;
        const imgData = canvasCtx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const hex = els.chromaColor.value;
        const cR = parseInt(hex.substr(1, 2), 16), cG = parseInt(hex.substr(3, 2), 16), cB = parseInt(hex.substr(5, 2), 16);
        const tol = parseInt(els.tolerance.value);
        const mask = new Uint8Array(w * h);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (Math.sqrt((r - cR) ** 2 * 0.3 + (g - cG) ** 2 * 0.6 + (b - cB) ** 2 * 0.1) <= tol) {
                mask[i / 4] = 1; data[i + 3] = 0;
            }
        }
        const feather = parseInt(els.feathering.value);
        if (feather > 0) {
            const exp = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
                for (let dy = -feather; dy <= feather; dy++) for (let dx = -feather; dx <= feather; dx++) {
                    if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) { exp[(y + dy) * w + (x + dx)] = 1; data[((y + dy) * w + (x + dx)) * 4 + 3] = 0; }
                }
            }
            mask.set(exp);
        }
        canvasCtx.putImageData(imgData, 0, 0);
        return { mask, w, h };
    };

    els.btnSaveTemplatePreview.onclick = async () => {
        if (!State.adminRawTemplate || State.adminAreas.length === 0) return;
        withLoading('Saving Template...', async () => {
            // Produce clean transparent template
            ctx.preview.clearRect(0, 0, els.previewCanvasSettings.width, els.previewCanvasSettings.height);
            ctx.preview.drawImage(State.adminRawTemplate, 0, 0);
            if (!State.adminHasTransparency) applyChromaMask(ctx.preview, State.adminRawTemplate);
            else {
                // Re-apply alpha cleanup for transparent PNGs
                const id2 = ctx.preview.getImageData(0, 0, els.previewCanvasSettings.width, els.previewCanvasSettings.height);
                for (let i = 0; i < id2.data.length; i += 4) if (id2.data[i + 3] < 50) id2.data[i + 3] = 0;
                ctx.preview.putImageData(id2, 0, 0);
            }
            let transparentDataUrl;
            try {
                transparentDataUrl = els.previewCanvasSettings.toDataURL('image/png');
            } catch (e) {
                alert("Security Error saving template image. Please ensure you are running this via a local server (http://localhost) and not directly from the file system (file:///) to avoid CORS issues.");
                return;
            }

            // Build mockup thumbnail
            const thumbCanvas = document.createElement('canvas');
            const aspect = State.adminRawTemplate.width / State.adminRawTemplate.height;
            thumbCanvas.width = 400; thumbCanvas.height = Math.round(400 / aspect);
            const tc = thumbCanvas.getContext('2d');
            const scale = thumbCanvas.width / State.adminRawTemplate.width;

            // Wait for at least some mockups
            await Promise.all(State.mockupImages.map(m => m.complete ? Promise.resolve() : new Promise(r => { m.onload = r; m.onerror = r; })));

            try {
                State.adminAreas.forEach(a => {
                    const mockImg = State.mockupImages[Math.floor(Math.random() * State.mockupImages.length)];
                    if (!mockImg || !mockImg.complete || !mockImg.naturalWidth) return;
                    const mAsp = mockImg.width / mockImg.height, aAsp = a.bounds.w / a.bounds.h;
                    let dw, dh, dx, dy;
                    if (mAsp > aAsp) { dh = a.bounds.h; dw = dh * mAsp; dx = a.bounds.x - (dw - a.bounds.w) / 2; dy = a.bounds.y; }
                    else { dw = a.bounds.w; dh = dw / mAsp; dx = a.bounds.x; dy = a.bounds.y - (dh - a.bounds.h) / 2; }
                    tc.drawImage(mockImg, dx * scale, dy * scale, dw * scale, dh * scale);
                });
            } catch (e) { console.warn("Could not draw mockups:", e); }

            tc.drawImage(els.previewCanvasSettings, 0, 0, thumbCanvas.width, thumbCanvas.height);

            let thumbDataUrl;
            try {
                thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.9);
            } catch (e) {
                console.warn("Canvas tainted by mockups, falling back to raw template thumb.");
                thumbDataUrl = transparentDataUrl; // fallback
            }

            const id = 'tpl_' + Date.now();
            await localforage.setItem(id, {
                id, timestamp: Date.now(),
                imageDataUrl: transparentDataUrl,
                thumbDataUrl,
                areas: State.adminAreas.map(a => ({ id: a.id, bounds: a.bounds, photoX: a.photoX, photoY: a.photoY, photoScale: a.photoScale }))
            });
            els.templatePreviewSection.style.display = 'none';
            els.imageInput.value = '';
            await loadTemplateLibrary();
        });
    };


    // --- CAMERA ---
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const cams = devices.filter(d => d.kind === 'videoinput');
        els.cameraSelect.innerHTML = '<option value="">Select Camera</option>' + cams.map((c, i) => `<option value="${c.deviceId}">${c.label || 'Cam ' + (i + 1)}</option>`).join('');
    });

    const startCamera = () => {
        if (State.stream) return;
        const res = els.resolutionSelect.value.split('x');
        navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: els.cameraSelect.value ? { exact: els.cameraSelect.value } : undefined,
                width: { ideal: parseInt(res[0]) }, height: { ideal: parseInt(res[1]) }
            }
        }).then(s => {
            State.stream = s;
            els.webcamVideo.srcObject = s;
            updateMirror();
            els.webcamVideo.onloadedmetadata = () => {
                els.captureOverlay.width = els.webcamVideo.videoWidth;
                els.captureOverlay.height = els.webcamVideo.videoHeight;
                if (State.step === 3) updateCaptureOverlay();
            };
        });
    };

    const updateMirror = () => {
        els.webcamVideo.style.transform = els.mirrorCamera.checked ? 'scaleX(-1)' : 'none';
    };
    els.mirrorCamera.onchange = () => { if (State.step === 0) updateMirror(); }; // Handled by settings save normally

    const resizeCanvas = (container) => {
        if (!State.template) return;
        const aspect = els.templateCanvas.width / els.templateCanvas.height;
        let w = container.clientWidth, h = container.clientHeight;
        if (w / h > aspect) w = h * aspect; else h = w / aspect;
        [els.templateCanvas, els.photoCanvas].forEach(c => {
            c.style.width = `${w}px`; c.style.height = `${h}px`;
        });
    };
    window.addEventListener('resize', () => {
        if (State.step !== 4 || !State.template) return;
        const slot = els.resultCanvasSlot, parent = slot.parentElement;
        const tAsp = els.templateCanvas.width / els.templateCanvas.height;
        let rw = parent.clientWidth, rh = parent.clientHeight;
        if (rw / rh > tAsp) rw = rh * tAsp; else rh = rw / tAsp;
        slot.style.width = rw + 'px'; slot.style.height = rh + 'px';
        [els.templateCanvas, els.photoCanvas].forEach(c => { c.style.width = rw + 'px'; c.style.height = rh + 'px'; });
    });

    // --- TIMERS & RANGES ---
    els.enableIdle.onchange = () => {
        els.idleRow.style.display = els.enableIdle.checked ? 'flex' : 'none';
    };
    const syncRangeValue = id => { $(id).oninput = e => { $(id + 'Value').textContent = e.target.value; }; };
    ['tolerance', 'minArea', 'feathering', 'idleTime', 'countdownTime'].forEach(syncRangeValue);

    // --- CAPTURE FLOW (STEP 3) ---
    const setupCaptureForCurrentArea = () => {
        if (State.currentAreaIdx >= State.areas.length) return goToStep(4);
        const area = State.areas[State.currentAreaIdx];
        els.captureProgress.textContent = `Photo ${State.currentAreaIdx + 1} of ${State.areas.length}`;
        els.captureAreaInfo.textContent = `Area ${area.id}`;
        updateCaptureOverlay();
    };

    const updateCaptureOverlay = () => {
        if (!els.webcamVideo.videoWidth || State.currentAreaIdx < 0 || State.currentAreaIdx >= State.areas.length) return;
        const area = State.areas[State.currentAreaIdx];
        ctx.overlay.clearRect(0, 0, els.captureOverlay.width, els.captureOverlay.height);

        const vidAsp = els.captureOverlay.width / els.captureOverlay.height;
        const areaAsp = area.bounds.w / area.bounds.h;
        let bw, bh;
        if (vidAsp > areaAsp) { bh = els.captureOverlay.height; bw = bh * areaAsp; }
        else { bw = els.captureOverlay.width; bh = bw / areaAsp; }

        const bx = (els.captureOverlay.width - bw) / 2;
        const by = (els.captureOverlay.height - bh) / 2;

        ctx.overlay.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.overlay.fillRect(0, 0, els.captureOverlay.width, els.captureOverlay.height);
        ctx.overlay.clearRect(bx, by, bw, bh);
        ctx.overlay.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.overlay.lineWidth = 4;
        ctx.overlay.strokeRect(bx, by, bw, bh);
        State.dimBox = { x: bx, y: by, w: bw, h: bh };
    };

    els.retakeAllBtn.onclick = () => {
        stopAutoCapture();
        State.areas.forEach(a => a.photo = null);
        State.currentAreaIdx = 0;
        setupCaptureForCurrentArea();
        startAutoCaptureSequence();
    };

    const capturePhoto = () => {
        if (!State.dimBox) return;
        els.flashOverlay.classList.add('flash');
        setTimeout(() => els.flashOverlay.classList.remove('flash'), 100);

        const tmp = document.createElement('canvas');
        tmp.width = State.dimBox.w; tmp.height = State.dimBox.h;
        const tctx = tmp.getContext('2d');
        if (els.mirrorCamera.checked) { tctx.translate(tmp.width, 0); tctx.scale(-1, 1); }
        tctx.drawImage(els.webcamVideo, State.dimBox.x, State.dimBox.y, State.dimBox.w, State.dimBox.h, 0, 0, tmp.width, tmp.height);

        State.tempPhoto = new Image();
        State.tempPhoto.onload = () => {
            els.reviewCanvas.width = tmp.width; els.reviewCanvas.height = tmp.height;
            ctx.review.clearRect(0, 0, tmp.width, tmp.height);
            ctx.review.drawImage(State.tempPhoto, 0, 0);
            els.reviewOverlay.classList.add('show');
            stopAutoCapture(); // Wait for user decision
        };
        State.tempPhoto.src = tmp.toDataURL('image/jpeg', 0.9);
    };

    els.captureBtn.onclick = capturePhoto;

    els.retakeBtn.onclick = () => {
        els.reviewOverlay.classList.remove('show');
        startAutoCaptureSequence(); // Restart timer for current
    };
    els.acceptBtn.onclick = () => {
        els.reviewOverlay.classList.remove('show');
        const area = State.areas[State.currentAreaIdx];
        area.photo = State.tempPhoto;
        area.photoScale = Math.min(area.bounds.w / State.tempPhoto.width, area.bounds.h / State.tempPhoto.height);

        State.currentAreaIdx++;
        if (State.currentAreaIdx >= State.areas.length) {
            goToStep(4);
        } else {
            setupCaptureForCurrentArea();
            startAutoCaptureSequence();
        }
    };

    const startAutoCaptureSequence = () => {
        els.manualControls.style.display = 'none';
        const idle = els.enableIdle.checked ? parseInt(els.idleTime.value) : 0;
        const count = parseInt(els.countdownTime.value);

        if (idle > 0) {
            els.countdownMessage.textContent = '🕐 Get Ready...';
            els.countdownMessage.classList.remove('countdown-warning');
            els.countdownMessage.style.display = 'block';

            let c = idle;
            els.countdownDisplay.textContent = c;
            els.countdownDisplay.classList.remove('countdown-warning');
            els.countdownDisplay.style.opacity = '0.5';
            els.countdownDisplay.style.display = 'block';

            State.countInterval = setInterval(() => {
                c--;
                if (c > 0) {
                    els.countdownDisplay.textContent = c;
                    els.countdownMessage.textContent = `🕐 Get Ready... (${c}s)`;
                } else {
                    clearInterval(State.countInterval);
                    els.countdownDisplay.style.opacity = '1';
                    doCountdown(count);
                }
            }, 1000);
        } else doCountdown(count);
    };

    const doCountdown = (secs) => {
        els.countdownMessage.textContent = '📸 Smile!';
        els.countdownMessage.classList.add('countdown-warning');
        els.countdownMessage.style.display = 'block';

        let c = secs;
        els.countdownDisplay.textContent = c;
        els.countdownDisplay.style.display = 'block';
        els.countdownDisplay.classList.remove('countdown-warning');
        els.countdownDisplay.style.opacity = '1';

        State.countInterval = setInterval(() => {
            c--;
            if (c <= 3) els.countdownDisplay.classList.add('countdown-warning');
            if (c > 0) els.countdownDisplay.textContent = c;
            else {
                clearInterval(State.countInterval);
                els.countdownMessage.style.display = 'none';
                els.countdownDisplay.style.display = 'none';
                capturePhoto();
            }
        }, 1000);
    };

    const stopAutoCapture = () => {
        clearTimeout(State.autoTimer); clearInterval(State.countInterval);
        State.autoTimer = null;
        els.countdownMessage.style.display = 'none';
        els.countdownDisplay.style.display = 'none';
        els.manualControls.style.display = 'flex';
    };

    els.autoCaptureBtn.onclick = startAutoCaptureSequence;

    // --- STEP 4: RESULT ---
    const redrawPhotos = () => {
        ctx.photo.clearRect(0, 0, els.photoCanvas.width, els.photoCanvas.height);
        ctx.photo.imageSmoothingEnabled = true; ctx.photo.imageSmoothingQuality = 'high';
        State.areas.forEach(a => {
            if (a.photo) ctx.photo.drawImage(a.photo, a.photoX, a.photoY, a.photo.width * a.photoScale, a.photo.height * a.photoScale);
        });
    };

    const generateHighResCanvas = (dpi, quality) => {
        const scale = dpi / 96;
        const c = document.createElement('canvas');
        c.width = els.templateCanvas.width * scale; c.height = els.templateCanvas.height * scale;
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        State.areas.forEach(a => {
            if (a.photo) cx.drawImage(a.photo, a.photoX * scale, a.photoY * scale, a.photo.width * a.photoScale * scale, a.photo.height * a.photoScale * scale);
        });
        cx.drawImage(els.templateCanvas, 0, 0, els.templateCanvas.width, els.templateCanvas.height, 0, 0, c.width, c.height);
        return new Promise(res => c.toBlob(blob => res(blob), 'image/jpeg', quality));
    };

    els.exportBtn.onclick = () => {
        withLoading('Saving image...', async () => {
            const blob = await generateHighResCanvas(600, 1.0);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `harves-photobooth-${Date.now()}.jpg`;
            a.click(); URL.revokeObjectURL(url);
        });
    };

    els.createGifBtn.onclick = () => {
        withLoading('Creating Ultra GIF...', async () => {
            return new Promise((resolve, reject) => {
                const photos = State.areas.filter(a => a.photo).sort((a, b) => a.id - b.id);
                if (!photos.length) return reject(new Error('No photos'));

                const w = els.photoCanvas.width, h = els.photoCanvas.height;
                const gif = new GIF({ workers: 2, quality: 1, width: w, height: h, workerScript: 'gif.worker.js', background: '#fff' });

                photos.forEach(a => {
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    const cx = c.getContext('2d');
                    cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
                    const pAsp = a.photo.width / a.photo.height, cAsp = w / h;
                    let dw, dh, dx, dy;
                    if (pAsp > cAsp) { dw = w; dh = w / pAsp; dx = 0; dy = (h - dh) / 2; }
                    else { dh = h; dw = h * pAsp; dx = (w - dw) / 2; dy = 0; }
                    cx.drawImage(a.photo, dx, dy, dw, dh);
                    gif.addFrame(c, { delay: 1000 });
                });

                gif.on('finished', blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `harves-photobooth-${Date.now()}.gif`;
                    a.click(); URL.revokeObjectURL(url);
                    resolve();
                });
                gif.render();
            });
        });
    };

    els.sendTelegramBtn.onclick = () => {
        if (!State.tgToken || !State.tgChannel) return alert('Admin Note: Telegram Bot Token and Channel Link not configured.');

        withLoading('Generating QR Code...', async () => {
            const blob = await generateHighResCanvas(96, 0.85);
            const fd = new FormData();

            let chatId = State.tgChannel;
            if (chatId.includes('t.me/')) chatId = '@' + chatId.split('/').pop();
            if (chatId.includes('/s/')) chatId = '@' + chatId.split('/s/').pop();

            fd.append('chat_id', chatId); fd.append('photo', blob, 'photobooth.jpg');

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
                    const qr = qrcode(0, 'M'); qr.addData(directUrl); qr.make();
                    els.qrCodeContainer.innerHTML = qr.createImgTag(5, 0);
                    els.qrSection.style.display = 'block';
                } else throw new Error("Failed to get direct file path from Telegram.");
            } else throw new Error(data.description);
        });
    };

    // Initialize
    loadTemplateLibrary();
    startCamera(); // Warm up camera
});