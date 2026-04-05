// main.js — Kampoeng Gadget, core interaction engine

document.addEventListener('DOMContentLoaded', () => {

  // ── 1. Lucide Icons ──────────────────────────────────────
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // ── 2. GSAP Register ─────────────────────────────────────
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  // ── 3. Nav scroll state ───────────────────────────────────
  const nav = document.getElementById('main-nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 40) {
        nav.classList.add('nav-scrolled');
      } else {
        nav.classList.remove('nav-scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── 4. Hamburger menu ─────────────────────────────────────
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu    = document.getElementById('mobile-menu');
  const menuIcon      = document.getElementById('menu-icon');
  const closeIcon     = document.getElementById('close-icon');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      const isHidden = mobileMenu.classList.toggle('hidden');
      menuIcon.classList.toggle('hidden', !isHidden);
      closeIcon.classList.toggle('hidden', isHidden);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!mobileMenuBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.add('hidden');
        menuIcon.classList.remove('hidden');
        closeIcon.classList.add('hidden');
      }
    });
  }

  // ── 5. Route page-specific init ───────────────────────────
  const page = document.body.getAttribute('data-page');
  if (page === 'home')      initHome();
  if (page === 'about')     initAbout();
  if (page === 'portfolio') initPortfolio();
  if (page === 'products')  initProducts();
});


// =============================================================
//  HOME PAGE
// =============================================================
function initHome() {

  // ── Gradient Bars ──
  buildGradientBars();

  // ── Hero entrance ──
  const tl = gsap.timeline({ delay: 0.1 });
  tl.from('#hero-badge',    { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' })
    .from('#hero-headline', { y: 40, opacity: 0, duration: 0.8, ease: 'power3.out' }, '-=0.4')
    .from('#hero-sub',      { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=0.5')
    .from('#hero-cta',      { y: 20, opacity: 0, duration: 0.6, ease: 'power3.out' }, '-=0.4');

  // ── Tablet Scroll (3D tilt) ──
  const card   = document.getElementById('home-tablet-card');
  const header = document.getElementById('home-tablet-header');

  if (card && header) {
    const isMobile = () => window.innerWidth <= 768;
    const scaleFrom = () => isMobile() ? 0.72 : 1.06;
    const scaleTo   = () => isMobile() ? 0.92 : 1.00;

    gsap.set(card, { rotationX: 28, scale: scaleFrom(), transformOrigin: 'center top' });

    gsap.timeline({
      scrollTrigger: {
        trigger: '#home-tablet-container',
        start: 'top bottom',
        end: 'bottom 80%',
        scrub: 1.2,
      }
    })
    .to(header, { y: -90, ease: 'none' }, 0)
    .to(card,   { rotationX: 0, scale: scaleTo, ease: 'none' }, 0);
  }

  // ── Stat counters ──
  initCounters();

  // ── ScrollReveal for generic classes ──
  initScrollReveal();

  // ── Red glow on stat section entrance ──
  gsap.from('.stat-card', {
    y: 40,
    opacity: 0,
    stagger: 0.12,
    duration: 0.8,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.stat-card', start: 'top 85%' }
  });

  // ── Service cards stagger ──
  gsap.from('.service-card', {
    y: 60,
    opacity: 0,
    stagger: 0.15,
    duration: 0.8,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.service-card', start: 'top 85%' }
  });
}

// =============================================================
//  BUILD GRADIENT BARS
// =============================================================
function buildGradientBars() {
  const container = document.getElementById('gradient-bars-container');
  if (!container) return;

  const numBars    = 18;
  const colorFrom  = '#CC0000';
  const colorTo    = 'transparent';
  const duration   = 2.2;

  const calcHeight = (i, total) => {
    const pos  = i / (total - 1);
    const dist = Math.abs(pos - 0.5);
    return 28 + (100 - 28) * Math.pow(dist * 2, 1.15);
  };

  container.style.cssText = 'width:100%;transform:translateZ(0)';

  for (let i = 0; i < numBars; i++) {
    const h = calcHeight(i, numBars);
    const bar = document.createElement('div');
    bar.className = 'gradient-bar';
    Object.assign(bar.style, {
      flex:             `1 0 calc(100% / ${numBars})`,
      maxWidth:         `calc(100% / ${numBars})`,
      height:           '100%',
      background:       `linear-gradient(to top, ${colorFrom}, ${colorTo})`,
      transform:        `scaleY(${h / 100})`,
      animation:        `pulseBar ${duration}s ease-in-out infinite alternate`,
      animationDelay:   `${i * 0.09}s`,
      boxSizing:        'border-box',
    });
    bar.style.setProperty('--initial-scale', h / 100);
    container.appendChild(bar);
  }
}

// =============================================================
//  STAT COUNTER ANIMATION
// =============================================================
function initCounters() {
  const counters = document.querySelectorAll('[data-target]');
  if (!counters.length) return;

  counters.forEach(el => {
    const target = +el.getAttribute('data-target');
    const obj    = { val: 0 };

    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(obj, {
          val: target,
          duration: 2,
          ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.val); }
        });
      }
    });
  });
}

// =============================================================
//  SCROLL REVEAL UTILITY
// =============================================================
function initScrollReveal() {
  const up    = document.querySelectorAll('.reveal-up');
  const left  = document.querySelectorAll('.reveal-left');
  const right = document.querySelectorAll('.reveal-right');
  const scale = document.querySelectorAll('.reveal-scale');

  const reveal = (els, fromProps) => {
    els.forEach((el, i) => {
      gsap.from(el, {
        ...fromProps,
        duration: 0.85,
        ease: 'power2.out',
        delay: (parseFloat(el.style.transitionDelay) || 0) + i * 0.04,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  };

  reveal(up,    { y: 50, opacity: 0 });
  reveal(left,  { x: -50, opacity: 0 });
  reveal(right, { x:  50, opacity: 0 });
  reveal(scale, { scale: 0.9, opacity: 0 });
}


// =============================================================
//  ABOUT PAGE
// =============================================================
function initAbout() {
  if (typeof gsap === 'undefined') return;

  gsap.from('.about-header', {
    y: 50, opacity: 0, duration: 1, ease: 'power3.out'
  });

  const card   = document.getElementById('tablet-card');
  const header = document.getElementById('tablet-header');

  if (card && header) {
    const isMobile = () => window.innerWidth <= 768;
    gsap.set(card, { rotationX: 22, scale: isMobile() ? 0.72 : 1.05, transformOrigin: 'center center' });

    gsap.timeline({
      scrollTrigger: { trigger: '#tablet-container', start: 'top bottom', end: 'bottom bottom', scrub: 1 }
    })
    .to(header, { y: -100, ease: 'none' }, 0)
    .to(card,   { rotationX: 0, scale: isMobile() ? 0.92 : 1, ease: 'none' }, 0);
  }
}


// =============================================================
//  PORTFOLIO PAGE — Horizontal Scroll
// =============================================================
function initPortfolio() {
  if (typeof gsap === 'undefined') return;

  const items = gsap.utils.toArray('.portfolio-item');
  if (!items.length) return;

  gsap.to(items, {
    xPercent: -100 * (items.length - 1),
    ease: 'none',
    scrollTrigger: {
      trigger: '.portfolio-container',
      pin: true,
      scrub: 1,
      end: () => '+=' + document.querySelector('.portfolio-container').offsetWidth * (items.length - 1)
    }
  });
}


// =============================================================
//  PRODUCTS PAGE — Stagger Enter
// =============================================================
function initProducts() {
  if (typeof gsap === 'undefined') return;

  gsap.from('.product-card', {
    y: 50, opacity: 0, stagger: 0.1, duration: 0.8, ease: 'power2.out',
    scrollTrigger: { trigger: '.products-grid', start: 'top 80%' }
  });
}
