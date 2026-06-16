// Initialize Leaflet Map
document.addEventListener("DOMContentLoaded", function () {
    var mapContainer = document.getElementById('kampoeng-map');
    if (mapContainer) {
        var map = L.map('kampoeng-map', {
            zoomControl: false,
            scrollWheelZoom: false // Prevent accidental scrolling while scrolling the page
        }).setView([-0.3125917, 100.3812145], 16);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(map);

        var customIcon = L.divIcon({
            className: 'custom-map-marker',
            html: '<i class="fas fa-map-marker-alt" style="color: var(--primary-red); font-size: 32px; filter: drop-shadow(0 0 10px rgba(255,0,0,0.8));"></i>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });

        L.marker([-0.3125917, 100.3812145], { icon: customIcon }).addTo(map);

        L.control.zoom({ position: 'bottomleft' }).addTo(map);
    }
});

// Initialize AOS
if (typeof AOS !== 'undefined') {
    AOS.init({
        duration: 800,
        once: false,
        offset: 100
    });
}

// Hamburger Menu Toggle
const hamburger = document.getElementById('hamburger-menu');
const mobileMenu = document.getElementById('mobile-menu');

if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
        mobileMenu.classList.toggle('open');
        hamburger.querySelector('i').classList.toggle('fa-bars');
        hamburger.querySelector('i').classList.toggle('fa-times');
    });

    // Close mobile menu on link click
    document.querySelectorAll('.mobile-menu a').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('open');
            hamburger.querySelector('i').classList.add('fa-bars');
            hamburger.querySelector('i').classList.remove('fa-times');
        });
    });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Consultation Modal Logic
document.addEventListener('DOMContentLoaded', () => {
    const consultationLinks = document.querySelectorAll('.consultation-link');
    const modalOverlay = document.getElementById('consultation-modal');
    
    if (!modalOverlay || consultationLinks.length === 0) return;

    const btnCancel = document.getElementById('btn-cancel-redirect');
    const btnCloseIcon = document.getElementById('modal-close-icon');
    const countdownNumber = document.getElementById('countdown-number');
    const countdownProgress = document.getElementById('countdown-progress');
    
    let countdownInterval;
    const TOTAL_SECONDS = 7;
    const whatsappUrl = 'https://wa.me/6283180700717';

    function closeModal() {
        clearInterval(countdownInterval);
        modalOverlay.classList.remove('active');
        countdownProgress.style.transition = 'none';
        countdownProgress.style.strokeDashoffset = '0';
    }

    function openModalAndStartCountdown() {
        modalOverlay.classList.add('active');
        
        let secondsLeft = TOTAL_SECONDS;
        countdownNumber.textContent = secondsLeft;
        
        // Reset SVG animation
        countdownProgress.style.transition = 'none';
        countdownProgress.style.strokeDashoffset = '0';
        
        // Force reflow
        countdownProgress.getBoundingClientRect();
        
        // Start animation (283 is the stroke-dasharray circumference for r=45)
        countdownProgress.style.transition = `stroke-dashoffset ${TOTAL_SECONDS}s linear`;
        countdownProgress.style.strokeDashoffset = '283';

        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                countdownNumber.textContent = secondsLeft;
            } else {
                clearInterval(countdownInterval);
                countdownNumber.textContent = '0';
                window.location.href = whatsappUrl;
                // Close modal after redirect trigger
                setTimeout(closeModal, 500);
            }
        }, 1000);
    }

    consultationLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openModalAndStartCountdown();
        });
    });

    if (btnCancel) btnCancel.addEventListener('click', closeModal);
    if (btnCloseIcon) btnCloseIcon.addEventListener('click', closeModal);
});

// Katalog Fetch Logic
document.addEventListener('DOMContentLoaded', () => {
    const katalogGrid = document.getElementById('katalog-grid');
    const loadingEl = document.getElementById('loading-katalog');
    
    if (!katalogGrid || !loadingEl) return;

    // Format Rupiah
    const formatRp = (angka) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(angka);
    };

    fetch('/api/api_read.php')
        .then(response => response.json())
        .then(res => {
            loadingEl.style.display = 'none';
            katalogGrid.style.display = 'grid';

            if (!res.success || !res.data || res.data.length === 0) {
                katalogGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Belum ada produk di katalog.</p>';
                return;
            }

            // Cache data for product.html to use without refetching
            localStorage.setItem('kg_katalog_data', JSON.stringify(res.data));

            res.data.forEach(product => {
                // Determine main image
                const mainImage = product.images && product.images.length > 0 ? product.images[0] : 'img/placeholder.png';
                
                const card = document.createElement('a');
                card.href = `product.html?id=${product.id}`;
                card.className = 'katalog-card';
                card.dataset.aos = 'fade-up';
                
                card.innerHTML = `
                    <div class="katalog-card-img" style="background-image: url('${mainImage}');"></div>
                    <div class="katalog-card-body">
                        <h3 class="katalog-card-title">${product.nama || 'Produk Tanpa Nama'}</h3>
                        <span class="katalog-card-price">${formatRp(product.harga)}</span>
                    </div>
                `;
                
                katalogGrid.appendChild(card);
            });
            
            // Re-init AOS for new elements if loaded dynamically
            if (typeof AOS !== 'undefined') {
                AOS.refresh();
            }
        })
        .catch(error => {
            console.error("Error fetching katalog:", error);
            loadingEl.innerHTML = '<p style="color: red;">Gagal memuat katalog. Pastikan koneksi dan server aktif.</p>';
        });
});

// Product Detail Logic
document.addEventListener('DOMContentLoaded', () => {
    const productContent = document.getElementById('product-content');
    if (!productContent) return; // Not on product page

    const loadingEl = document.getElementById('product-loading');
    const notFoundEl = document.getElementById('product-not-found');
    
    // Format Rupiah
    const formatRp = (angka) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(angka);
    };

    const urlParams = new URLSearchParams(window.location.search);
    let productId = urlParams.get('id');
    
    if (!productId && window.location.hash) {
        productId = window.location.hash.substring(1);
    }

    if (!productId) {
        loadingEl.style.display = 'none';
        notFoundEl.style.display = 'block';
        return;
    }

    const cachedData = localStorage.getItem('kg_katalog_data');
    if (cachedData) {
        try {
            const products = JSON.parse(cachedData);
            const product = products.find(p => p.id === productId);
            
            if (product) {
                renderProduct(product);
            } else {
                fetchProductFallback();
            }
        } catch (e) {
            fetchProductFallback();
        }
    } else {
        fetchProductFallback();
    }

    function fetchProductFallback() {
        fetch('/api/api_read.php')
            .then(res => res.json())
            .then(res => {
                if (res.success && res.data) {
                    localStorage.setItem('kg_katalog_data', JSON.stringify(res.data));
                    const product = res.data.find(p => p.id === productId);
                    if (product) {
                        renderProduct(product);
                    } else {
                        showNotFound();
                    }
                } else {
                    showNotFound();
                }
            })
            .catch(() => showNotFound());
    }

    function showNotFound() {
        loadingEl.style.display = 'none';
        notFoundEl.style.display = 'block';
    }

    function renderProduct(product) {
        loadingEl.style.display = 'none';
        productContent.style.display = 'flex';

        document.title = `${product.nama || 'Produk'} - Kampoeng Gadget`;
        document.getElementById('prod-nama').textContent = product.nama || 'Produk Tanpa Nama';
        document.getElementById('prod-harga').textContent = formatRp(product.harga || 0);
        document.getElementById('prod-kategori').textContent = product.kategori || 'UNCATEGORIZED';
        
        let desc = product.deskripsi || product.raw_text || '';
        // Clean up raw text if needed (remove the metadata lines like NAMA::)
        if (product.raw_text && !product.deskripsi) {
            desc = product.raw_text.replace(/^[A-Z_]+::.*$/gm, '').trim();
        }
        document.getElementById('prod-desc').textContent = desc || 'Tidak ada deskripsi tersedia.';

        // Setup WhatsApp link
        const waText = encodeURIComponent(`Halo Kampoeng Gadget, saya tertarik dengan produk:\n\nNama: ${product.nama}\nHarga: ${formatRp(product.harga)}\nID: ${product.id}\n\nApakah stoknya masih tersedia?`);
        document.getElementById('btn-checkout').href = `https://wa.me/6283180700717?text=${waText}`;

        // Setup Gallery
        const mainImg = document.getElementById('main-img');
        const thumbContainer = document.getElementById('thumb-container');
        
        if (product.images && product.images.length > 0) {
            mainImg.style.backgroundImage = `url('${product.images[0]}')`;
            
            product.images.forEach((imgUrl, idx) => {
                const thumb = document.createElement('div');
                thumb.className = `product-thumb ${idx === 0 ? 'active' : ''}`;
                thumb.style.backgroundImage = `url('${imgUrl}')`;
                
                thumb.addEventListener('click', () => {
                    mainImg.style.backgroundImage = `url('${imgUrl}')`;
                    document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });
                
                thumbContainer.appendChild(thumb);
            });
        } else {
            mainImg.style.backgroundImage = `url('img/placeholder.png')`;
        }
    }
});
