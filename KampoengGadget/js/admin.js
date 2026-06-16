document.addEventListener('DOMContentLoaded', () => {
    const loginArea = document.getElementById('login-area');
    const appArea = document.getElementById('app-dashboard');
    const authInput = document.getElementById('auth-key');
    const btnLogin = document.getElementById('btn-login');
    const loginError = document.getElementById('login-error');
    const btnLogout = document.getElementById('btn-logout');

    const adminTable = document.getElementById('admin-table');
    const adminTbody = document.getElementById('admin-tbody');
    const loadingEl = document.getElementById('admin-loading');
    const btnRefresh = document.getElementById('btn-refresh');

    const form = document.getElementById('product-form');
    const formAction = document.getElementById('form-action');
    const oldMessageIds = document.getElementById('old-message-ids');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const formTitle = document.getElementById('form-title');
    const btnSubmit = document.getElementById('btn-submit');
    
    let currentAuthKey = sessionStorage.getItem('kg_dashboard_key');
    
    // Auth Logic
    if (currentAuthKey) {
        showApp();
    }

    btnLogin.addEventListener('click', () => {
        const key = authInput.value.trim();
        if (key) {
            // Verify key by making a test request or just accept and let api_write reject later
            currentAuthKey = key;
            sessionStorage.setItem('kg_dashboard_key', key);
            showApp();
        }
    });

    btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem('kg_dashboard_key');
        currentAuthKey = null;
        loginArea.style.display = 'flex';
        appArea.style.display = 'none';
        authInput.value = '';
    });

    function showApp() {
        loginArea.style.display = 'none';
        appArea.style.display = 'block';
        loginError.style.display = 'none';
        setupUploadSlots();
        loadData();
    }

    // Format Rupiah
    const formatRp = (angka) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(angka);
    };

    // Load Products
    function loadData() {
        loadingEl.style.display = 'block';
        adminTable.style.display = 'none';
        adminTbody.innerHTML = '';

        fetch('/api/api_read.php')
            .then(res => res.json())
            .then(res => {
                loadingEl.style.display = 'none';
                if (res.success && res.data) {
                    adminTable.style.display = 'table';
                    renderTable(res.data);
                } else {
                    adminTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Gagal memuat atau tidak ada data.</td></tr>';
                    adminTable.style.display = 'table';
                }
            })
            .catch(e => {
                console.error(e);
                loadingEl.style.display = 'none';
                adminTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:red;">Koneksi error.</td></tr>';
                adminTable.style.display = 'table';
            });
    }

    btnRefresh.addEventListener('click', loadData);

    let currentProducts = [];

    function renderTable(products) {
        currentProducts = products;
        adminTbody.innerHTML = '';
        products.forEach(p => {
            const tr = document.createElement('tr');
            const mainImg = p.images && p.images.length > 0 ? p.images[0] : 'img/placeholder.png';
            
            tr.innerHTML = `
                <td><img src="${mainImg}" alt="img"></td>
                <td>
                    <strong style="color:var(--text-light);">${p.nama || '-'}</strong><br>
                    <span style="font-size:0.8rem; color:var(--primary-red);">${p.kategori || '-'}</span>
                </td>
                <td style="font-weight:bold;">${formatRp(p.harga)}</td>
                <td style="text-align: right;">
                    <button class="admin-action-btn" title="Edit" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>
                    <button class="admin-action-btn" title="Hapus" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            adminTbody.appendChild(tr);
        });
    }

    // Upload Slots
    const selectedFiles = new Array(7).fill(null);
    function setupUploadSlots() {
        const grid = document.getElementById('upload-grid');
        grid.innerHTML = '';
        for (let i = 0; i < 7; i++) {
            const slot = document.createElement('div');
            slot.className = 'file-upload-slot';
            slot.innerHTML = `
                <i class="fas fa-plus"></i>
                <input type="file" accept="image/jpeg, image/png, image/webp">
            `;
            const input = slot.querySelector('input');
            input.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        slot.style.backgroundImage = `url('${re.target.result}')`;
                        slot.classList.add('has-image');
                        selectedFiles[i] = file;
                    };
                    reader.readAsDataURL(file);
                }
            });
            grid.appendChild(slot);
        }
    }

    function clearUploadSlots() {
        const slots = document.querySelectorAll('.file-upload-slot');
        slots.forEach((slot, i) => {
            slot.style.backgroundImage = 'none';
            slot.classList.remove('has-image');
            slot.querySelector('input').value = '';
            selectedFiles[i] = null;
        });
    }

    // Canvas Compression
    function compressImage(file) {
        return new Promise((resolve) => {
            if (!file) { resolve(null); return; }
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1080;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                    }, 'image/jpeg', 0.7);
                };
            };
        });
    }

    // Form Handling
    btnCancelEdit.addEventListener('click', () => {
        form.reset();
        clearUploadSlots();
        formAction.value = 'add';
        oldMessageIds.value = '[]';
        formTitle.textContent = 'Tambah Produk Baru';
        btnCancelEdit.style.display = 'none';
        btnSubmit.innerHTML = '<i class="fas fa-save"></i> Simpan Produk';
    });

    window.editProduct = (id) => {
        const p = currentProducts.find(x => x.id === id);
        if (!p) return;
        
        document.getElementById('input-kategori').value = p.kategori || '';
        document.getElementById('input-nama').value = p.nama || '';
        document.getElementById('input-harga').value = p.harga || '';
        
        let desc = p.deskripsi || p.raw_text || '';
        if (p.raw_text && !p.deskripsi) {
            desc = p.raw_text.replace(/^[A-Z_]+::.*$/gm, '').trim();
        }
        document.getElementById('input-desc').value = desc;

        formAction.value = 'edit'; // Custom logic needed: edit_text vs replace_all
        oldMessageIds.value = JSON.stringify(p.message_ids || []);
        
        formTitle.textContent = `Edit: ${p.nama}`;
        btnCancelEdit.style.display = 'block';
        btnSubmit.innerHTML = '<i class="fas fa-save"></i> Perbarui Produk';
        clearUploadSlots(); // Tell user to upload all 7 if they want to replace images
        alert("Mode Edit Teks aktif. Jika Anda ingin mengubah GAMBAR, unggah ulang SEMUA gambar yang diinginkan. Jika kolom foto dibiarkan kosong, sistem HANYA akan mengubah teks saja.");
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.deleteProduct = (id) => {
        const p = currentProducts.find(x => x.id === id);
        if (!p) return;
        if (!confirm(`Hapus produk ${p.nama}? Tindakan ini tidak bisa dibatalkan.`)) return;

        const fd = new FormData();
        fd.append('auth_key', currentAuthKey);
        fd.append('action', 'delete');
        fd.append('message_ids', JSON.stringify(p.message_ids));

        btnRefresh.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        fetch('/api/api_write.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(res => {
                if (res.success) { alert('Berhasil dihapus.'); loadData(); }
                else { alert('Gagal: ' + (res.message || 'Unauthorized')); }
            }).catch(e => alert('Error jaringan'));
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const isEditing = formAction.value === 'edit';
        const hasNewImages = selectedFiles.some(f => f !== null);

        let actionToPerform = 'add';
        if (isEditing) {
            actionToPerform = hasNewImages ? 'replace_all' : 'edit_text';
        }

        if (actionToPerform === 'add' && !hasNewImages) {
            alert('Wajib mengunggah setidaknya 1 gambar untuk produk baru!');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

        try {
            // Build Caption
            const nama = document.getElementById('input-nama').value.trim();
            const harga = document.getElementById('input-harga').value.trim();
            const kategori = document.getElementById('input-kategori').value.trim();
            const desc = document.getElementById('input-desc').value.trim();
            
            const caption = `NAMA::${nama}\nHARGA::${harga}\nKATEGORI::${kategori}\nDESKRIPSI::${desc}`;

            const fd = new FormData();
            fd.append('auth_key', currentAuthKey);
            fd.append('action', actionToPerform);
            
            if (actionToPerform === 'edit_text') {
                const ids = JSON.parse(oldMessageIds.value);
                // Telegram editMessageCaption takes the specific ID. Usually index 0 has the caption.
                fd.append('message_id', ids[0]);
                fd.append('caption', caption);
            } else {
                fd.append('caption', caption);
                if (actionToPerform === 'replace_all') {
                    fd.append('old_message_ids', oldMessageIds.value);
                }
                
                // Compress and append images
                let validImageIndex = 0;
                for (let i = 0; i < 7; i++) {
                    if (selectedFiles[i]) {
                        const compressed = await compressImage(selectedFiles[i]);
                        if (compressed) {
                            fd.append(`image_${validImageIndex}`, compressed);
                            validImageIndex++;
                        }
                    }
                }
            }

            const response = await fetch('/api/api_write.php', { method: 'POST', body: fd });
            const res = await response.json();

            if (res.success) {
                alert('Berhasil!');
                btnCancelEdit.click();
                loadData();
            } else {
                alert('Gagal: ' + (res.message || 'Unauthorized'));
                if (res.message && res.message.includes('Unauthorized')) {
                    btnLogout.click();
                }
            }
        } catch (error) {
            alert('Terjadi kesalahan jaringan.');
            console.error(error);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = isEditing ? '<i class="fas fa-save"></i> Perbarui Produk' : '<i class="fas fa-save"></i> Simpan Produk';
        }
    });
});
