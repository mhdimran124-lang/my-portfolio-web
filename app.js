/**
 * Apple-grade Scroll-Driven Frame Animation Engine
 * Smooth 60fps+ scrubbing with zero black frames, canvas aspect ratio management,
 * preloading pipeline, and dynamic frame count discovery.
 * (No text overlays on the 3D animation)
 */

(function () {
  'use strict';

  // Configuration & State
  const PIXELS_PER_FRAME = 25; // Proportional scroll distance per frame
  let totalFrames = 0;
  let frameUrls = [];
  const images = [];
  let loadedCount = 0;
  let currentRenderedIndex = -1;
  let isTicking = false;
  let fitMode = 'cover'; // 'cover' or 'contain'

  // DOM Elements
  const preloader = document.getElementById('preloader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderPercent = document.getElementById('loader-percent');
  const loaderStatus = document.getElementById('loader-status');
  const scrollContainer = document.getElementById('scroll-container');
  const canvas = document.getElementById('product-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const frameCounter = document.getElementById('frame-counter');
  const scrollThumb = document.getElementById('scroll-thumb');
  const fitBtn = document.getElementById('fit-btn');
  const headerNav = document.getElementById('header-nav');
  const heroOverlay = document.getElementById('hero-overlay');

  /**
   * 1. Initialize Application: Fetch frame manifest from API
   */
  async function init() {
    try {
      if (loaderStatus) loaderStatus.textContent = 'Discovering sequence frames...';
      let res = await fetch('frames.json').catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('/api/frames');
      }
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 'Error'}: Failed to retrieve frames`);

      const data = await res.json();
      totalFrames = data.totalFrames;
      frameUrls = data.frames;

      if (!totalFrames || totalFrames === 0) {
        if (loaderStatus) loaderStatus.textContent = 'No frames detected in target directory.';
        return;
      }

      if (loaderStatus) loaderStatus.textContent = `Preloading ${totalFrames} high-definition frames...`;
      updateScrollTrackHeight();
      resizeCanvas();
      preloadAllFrames();
    } catch (err) {
      console.error('Initialization error:', err);
      if (loaderStatus) loaderStatus.textContent = 'Error loading sequence: ' + err.message;
    }
  }

  /**
   * 2. Compute dynamic scroll track height based on total frame count
   */
  function updateScrollTrackHeight() {
    if (totalFrames <= 0) return;
    const windowHeight = window.innerHeight;
    const computedHeight = windowHeight + (totalFrames * PIXELS_PER_FRAME);
    scrollContainer.style.height = `${computedHeight}px`;
  }

  /**
   * 3. Preload all frames into memory before enabling scroll
   */
  function preloadAllFrames() {
    let completed = false;

    frameUrls.forEach((url, index) => {
      const img = new Image();
      img.decoding = 'async';

      const handleImageEvent = () => {
        loadedCount++;
        const pct = Math.floor((loadedCount / totalFrames) * 100);
        if (loaderBar) loaderBar.style.width = `${pct}%`;
        if (loaderPercent) loaderPercent.textContent = `${pct}%`;
        if (loaderStatus) loaderStatus.textContent = `Loading asset ${loadedCount} of ${totalFrames}...`;

        if (loadedCount === totalFrames && !completed) {
          completed = true;
          onPreloadComplete();
        }
      };

      img.onload = handleImageEvent;
      img.onerror = () => {
        console.warn(`Frame failed to load: ${url}`);
        handleImageEvent();
      };

      img.src = url;
      images[index] = img;
    });
  }

  /**
   * 4. Unlock scroll and render the initial frame at scroll top
   */
  function onPreloadComplete() {
    if (loaderStatus) loaderStatus.textContent = 'Ready.';
    if (loaderPercent) loaderPercent.textContent = '100%';

    // Draw the first frame immediately at scroll top (0%)
    drawFrame(0);

    setTimeout(() => {
      if (preloader) preloader.classList.add('hidden');
      document.body.classList.remove('loading-state');
      if (heroOverlay) {
        heroOverlay.style.opacity = '1';
        heroOverlay.style.visibility = 'visible';
        heroOverlay.style.transform = 'translate(-50%, -50%)';
      }
      setupEventListeners();
      // Ensure first frame is rendered cleanly post-transition
      drawFrame(0);
      onScroll();
    }, 400);
  }

  /**
   * 5. Canvas resizing and high-DPI scaling
   */
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    if (currentRenderedIndex >= 0) {
      renderFrame(currentRenderedIndex);
    }
  }

  /**
   * 6. Render frame with aspect ratio preservation (cover/contain)
   */
  function renderFrame(index) {
    if (index < 0 || index >= images.length) return;
    const img = images[index];
    if (!img || !img.complete) return;

    const canvasW = window.innerWidth;
    const canvasH = window.innerHeight;
    const imgW = img.naturalWidth || 1280;
    const imgH = img.naturalHeight || 720;

    let scale;
    if (fitMode === 'cover') {
      scale = Math.max(canvasW / imgW, canvasH / imgH);
    } else {
      scale = Math.min(canvasW / imgW, canvasH / imgH);
    }

    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (canvasW - drawW) / 2;
    const offsetY = (canvasH - drawH) / 2;

    ctx.fillStyle = '#08090d';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

    currentRenderedIndex = index;
    updateUI(index);
  }

  /**
   * 7. Frame drawing dispatcher (avoids redrawing identical frames)
   */
  function drawFrame(index) {
    if (index === currentRenderedIndex) return;
    renderFrame(index);
  }

  /**
   * 8. Throttled scroll listener via requestAnimationFrame
   * Formula:
   * frameIndex = Math.min(totalFrames - 1, Math.floor(scrollProgress * totalFrames))
   * where scrollProgress = window.scrollY / (scrollableHeight - windowHeight)
   */
  function onScroll() {
    if (isTicking) return;
    isTicking = true;

    requestAnimationFrame(() => {
      const scrollableHeight = scrollContainer.offsetHeight;
      const windowHeight = window.innerHeight;
      const maxScroll = scrollableHeight - windowHeight;

      // Clamped progress between 0 and 1
      const rawProgress = maxScroll > 0 ? (window.scrollY / maxScroll) : 0;
      const scrollProgress = Math.max(0, Math.min(1, rawProgress));

      // Map progress to frame index
      const targetFrameIndex = Math.min(
        totalFrames - 1,
        Math.floor(scrollProgress * totalFrames)
      );

      // Render target frame
      drawFrame(targetFrameIndex);

      // Smoothly fade out hero title & tagline across first 30% of the scroll animation section
      if (heroOverlay) {
        if (scrollProgress <= 0.30) {
          const fadeRatio = scrollProgress / 0.30; // 0.0 at scroll top, 1.0 at 30%
          const opacity = Math.max(0, Math.min(1, 1 - fadeRatio));
          const translateY = fadeRatio * -35; // smooth upward float
          const scale = 1 - (fadeRatio * 0.04);
          heroOverlay.style.opacity = opacity.toFixed(4);
          heroOverlay.style.transform = `translate(-50%, calc(-50% + ${translateY.toFixed(1)}px)) scale(${scale.toFixed(3)})`;
          heroOverlay.style.visibility = opacity > 0.001 ? 'visible' : 'hidden';
        } else {
          heroOverlay.style.opacity = '0';
          heroOverlay.style.visibility = 'hidden';
        }
      }

      // Update right-edge progress tracker
      if (scrollThumb) {
        scrollThumb.style.height = `${scrollProgress * 100}%`;
      }

      // Smoothly transition navbar style when scrolling past 3D animation into white/cream store
      if (headerNav) {
        if (window.scrollY > maxScroll * 0.92) {
          headerNav.classList.add('nav-light');
        } else {
          headerNav.classList.remove('nav-light');
        }
      }

      isTicking = false;
    });
  }

  /**
   * 9. Update UI badges and status
   */
  function updateUI(frameIndex) {
    if (frameCounter) {
      const formatted = String(frameIndex + 1).padStart(3, '0');
      const totalFormatted = String(totalFrames).padStart(3, '0');
      frameCounter.textContent = `FRAME ${formatted} / ${totalFormatted}`;
    }
  }

  /**
   * 10. Interactive E-commerce & Modal System (Every Button Functional)
   */
  function initStitchInteractions() {
    // Current Active Product Configuration
    const currentConfig = {
      title: "Signature Aviator",
      priceNum: 149,
      priceStr: "$149",
      color: "Soot Black / Polished Gold",
      lens: "Polarized Smoke",
      size: "Standard 54mm",
      qty: 1,
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuA2kuxjSFws5wF9IDI4lkEYAGWrLhBYcUPBDAfIQXshfKI1_8NWnjayC7WvhKq-7DGKSvyVaM3yYKgrK85YTiZsRhCJI4jr3tIxGp7qCw9xBUppukaF8UCC0Fc-XIbGYLdf4YzIuPGy05WwsrXHU0LmcqmToffCleEmYsSl-JZtFHmseezH0TCEsVQuFy2uguOsLVO3oBpZAxkWsKuOIhMMT6o2JVxtRcP6s-rG9pSgDm8EIjs-ydjjTw"
    };

    // Cart State
    let cartItem = { ...currentConfig };
    let cartCount = 1;

    // UI Elements
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    let toastTimeout = null;

    function showToast(msg) {
      if (!toast) return;
      if (toastTimeout) clearTimeout(toastTimeout);
      if (toastMsg) toastMsg.textContent = msg;
      toast.classList.remove('opacity-0', 'translate-y-12', 'pointer-events-none');
      toast.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      toastTimeout = setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
        toast.classList.add('opacity-0', 'translate-y-12', 'pointer-events-none');
      }, 3000);
    }

    // --- CART DRAWER SYSTEM ---
    const cartDrawer = document.getElementById('cart-drawer');
    const cartBackdrop = document.getElementById('cart-backdrop');
    const cartPanel = document.getElementById('cart-panel');
    const navCartBtn = document.getElementById('nav-cart-btn');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const continueShoppingBtn = document.getElementById('continue-shopping-btn');
    const cartBadge = document.getElementById('cart-badge');

    const cartItemImg = document.getElementById('cart-item-img');
    const cartItemTitle = document.getElementById('cart-item-title');
    const cartItemPrice = document.getElementById('cart-item-price');
    const cartItemSpecs = document.getElementById('cart-item-specs');
    const cartItemQty = document.getElementById('cart-item-qty');
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartIncBtn = document.getElementById('cart-inc-btn');
    const cartDecBtn = document.getElementById('cart-dec-btn');
    const cartRemoveBtn = document.getElementById('cart-remove-btn');
    const drawerCheckoutBtn = document.getElementById('drawer-checkout-btn');

    function syncCartUI() {
      if (cartBadge) cartBadge.textContent = cartCount;
      if (cartItemImg) cartItemImg.src = cartItem.img;
      if (cartItemTitle) cartItemTitle.textContent = cartItem.title;
      if (cartItemPrice) cartItemPrice.textContent = `$${cartItem.priceNum * cartItem.qty}`;
      if (cartItemSpecs) cartItemSpecs.textContent = `${cartItem.color} • ${cartItem.lens} • ${cartItem.size}`;
      if (cartItemQty) cartItemQty.textContent = cartItem.qty;
      if (cartSubtotal) cartSubtotal.textContent = `$${cartItem.priceNum * cartItem.qty}`;
    }

    function openCart() {
      if (!cartDrawer) return;
      syncCartUI();
      cartDrawer.classList.remove('pointer-events-none');
      if (cartBackdrop) {
        cartBackdrop.classList.remove('opacity-0', 'pointer-events-none');
        cartBackdrop.classList.add('opacity-100', 'pointer-events-auto');
      }
      if (cartPanel) {
        cartPanel.classList.remove('translate-x-full');
      }
    }

    function closeCart() {
      if (!cartDrawer) return;
      if (cartBackdrop) {
        cartBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
        cartBackdrop.classList.add('opacity-0', 'pointer-events-none');
      }
      if (cartPanel) {
        cartPanel.classList.add('translate-x-full');
      }
      setTimeout(() => {
        cartDrawer.classList.add('pointer-events-none');
      }, 300);
    }

    if (navCartBtn) navCartBtn.addEventListener('click', openCart);
    if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
    if (cartBackdrop) cartBackdrop.addEventListener('click', closeCart);
    if (continueShoppingBtn) continueShoppingBtn.addEventListener('click', closeCart);

    if (cartIncBtn) {
      cartIncBtn.addEventListener('click', () => {
        cartItem.qty++;
        cartCount = cartItem.qty;
        syncCartUI();
      });
    }

    if (cartDecBtn) {
      cartDecBtn.addEventListener('click', () => {
        if (cartItem.qty > 1) {
          cartItem.qty--;
          cartCount = cartItem.qty;
          syncCartUI();
        }
      });
    }

    if (cartRemoveBtn) {
      cartRemoveBtn.addEventListener('click', () => {
        cartItem.qty = 0;
        cartCount = 0;
        if (cartBadge) cartBadge.textContent = '0';
        if (cartSubtotal) cartSubtotal.textContent = '$0';
        showToast('Bag emptied');
        closeCart();
      });
    }

    // --- ADD TO BAG BUTTON ---
    const addToBagBtn = document.getElementById('add-to-bag-btn');
    if (addToBagBtn) {
      addToBagBtn.addEventListener('click', () => {
        cartItem = { ...currentConfig };
        cartCount = cartItem.qty;
        syncCartUI();
        showToast(`✓ Added to Bag: ${cartItem.title} (${cartItem.qty})`);
        openCart();
      });
    }

    // --- BUY NOW BUTTON & CHECKOUT MODAL ---
    const buyNowBtn = document.getElementById('buy-now-btn');
    const checkoutModal = document.getElementById('checkout-modal');
    const closeCheckoutBtn = document.getElementById('close-checkout-btn');
    const checkoutFormView = document.getElementById('checkout-form-view');
    const checkoutSuccessView = document.getElementById('checkout-success-view');
    const closeSuccessBtn = document.getElementById('close-success-btn');
    const checkoutProdName = document.getElementById('checkout-prod-name');
    const checkoutProdDetails = document.getElementById('checkout-prod-details');
    const checkoutTotalVal = document.getElementById('checkout-total-val');

    function openCheckout() {
      closeCart();
      if (!checkoutModal) return;
      if (checkoutProdName) checkoutProdName.textContent = currentConfig.title;
      if (checkoutProdDetails) checkoutProdDetails.textContent = `Qty: ${currentConfig.qty} • ${currentConfig.color} • ${currentConfig.size}`;
      if (checkoutTotalVal) checkoutTotalVal.textContent = `$${currentConfig.priceNum * currentConfig.qty}`;
      if (checkoutFormView) checkoutFormView.classList.remove('hidden');
      if (checkoutSuccessView) checkoutSuccessView.classList.add('hidden');

      checkoutModal.classList.remove('pointer-events-none', 'opacity-0');
      checkoutModal.classList.add('pointer-events-auto', 'opacity-100');
    }

    function closeCheckout() {
      if (!checkoutModal) return;
      checkoutModal.classList.remove('pointer-events-auto', 'opacity-100');
      checkoutModal.classList.add('pointer-events-none', 'opacity-0');
    }

    if (buyNowBtn) buyNowBtn.addEventListener('click', openCheckout);
    if (drawerCheckoutBtn) drawerCheckoutBtn.addEventListener('click', openCheckout);
    if (closeCheckoutBtn) closeCheckoutBtn.addEventListener('click', closeCheckout);
    if (checkoutModal) {
      checkoutModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) closeCheckout();
      });
    }

    window.submitCheckoutOrder = function () {
      if (checkoutFormView) checkoutFormView.classList.add('hidden');
      if (checkoutSuccessView) checkoutSuccessView.classList.remove('hidden');
      cartCount = 0;
      if (cartBadge) cartBadge.textContent = '0';
      showToast('✓ Order #LX-89240 Successfully Placed');
    };

    if (closeSuccessBtn) closeSuccessBtn.addEventListener('click', closeCheckout);

    // --- FIT GUIDE MODAL ---
    const fitGuideBtn = document.getElementById('fit-guide-btn');
    const fitGuideModal = document.getElementById('fit-guide-modal');
    const closeFitBtn = document.getElementById('close-fit-btn');
    const applyFitBtn = document.getElementById('apply-fit-btn');

    function openFitGuide() {
      if (!fitGuideModal) return;
      fitGuideModal.classList.remove('pointer-events-none', 'opacity-0');
      fitGuideModal.classList.add('pointer-events-auto', 'opacity-100');
    }

    function closeFitGuide() {
      if (!fitGuideModal) return;
      fitGuideModal.classList.remove('pointer-events-auto', 'opacity-100');
      fitGuideModal.classList.add('pointer-events-none', 'opacity-0');
    }

    if (fitGuideBtn) fitGuideBtn.addEventListener('click', openFitGuide);
    if (closeFitBtn) closeFitBtn.addEventListener('click', closeFitGuide);
    if (applyFitBtn) applyFitBtn.addEventListener('click', closeFitGuide);
    if (fitGuideModal) {
      fitGuideModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) closeFitGuide();
      });
    }

    // --- HELP & POLICY INFO MODAL ---
    const infoModal = document.getElementById('info-modal');
    const closeInfoBtn = document.getElementById('close-info-btn');
    const dismissInfoBtn = document.getElementById('dismiss-info-btn');
    const infoModalTitle = document.getElementById('info-modal-title');
    const infoModalTopic = document.getElementById('info-modal-topic');
    const infoModalBody = document.getElementById('info-modal-body');

    const infoContentMap = {
      shipping: {
        topic: 'DISPATCH & FULFILLMENT',
        title: 'Global Express Delivery',
        body: '<p>Every pair of LUXORA eyewear is packed by hand in our Veneto atelier and dispatched via expedited DHL Express or FedEx Priority.</p><p><strong>Delivery Timelines:</strong><br>• Western Europe: 1–2 business days<br>• North America & UK: 2–3 business days<br>• Asia-Pacific & Worldwide: 3–4 business days</p><p>All orders are fully insured with tracking provided upon dispatch. Complimentary shipping is included on all orders over $100.</p>'
      },
      returns: {
        topic: 'CLIENT ASSURANCE',
        title: '30-Day Atelier Trial',
        body: '<p>We want you to experience the weight, optical clarity, and silhouette of your LUXORA eyewear with complete confidence in your everyday environment.</p><p>If you are not thoroughly captivated, return your eyewear within 30 days of receipt in pristine condition for a complimentary exchange or full refund.</p><p>Prepaid return shipping labels are included in every presentation box.</p>'
      },
      faqs: {
        topic: 'CLIENT INQUIRIES',
        title: 'Frequently Asked Questions',
        body: '<p><strong>Are LUXORA lenses prescription-ready?</strong><br>Yes. Our frames are engineered with standard optical bevel grooves, allowing any licensed optometrist to glaze custom corrective lenses into your frame.</p><p><strong>What is the titanium alloy grade?</strong><br>We forge our dual-bridges and hinges from Grade 5 Aerospace Titanium (Ti-6Al-4V), offering supreme tensile strength at just 18.4 grams.</p><p><strong>How do I clean my polarized optics?</strong><br>Use the micro-woven optical silk cloth provided. Avoid harsh alcohol cleaners to preserve the hydrophobic and oleophobic crystal coatings.</p>'
      },
      'size-guide': {
        topic: 'FRAME GEOMETRY',
        title: 'Optical Sizing Guide',
        body: '<p>Choosing the correct frame scale ensures effortless weight distribution and prevents cheek pressure.</p><p><strong>Standard 54mm:</strong> Tailored for narrow to average facial profiles (temple width 130mm – 138mm). Classic aviator proportion.</p><p><strong>Wide 58mm:</strong> Tailored for wider cheekbones or those seeking an oversized architectural silhouette (temple width 139mm+).</p>'
      },
      sustainability: {
        topic: 'RESPONSIBLE LUXURY',
        title: 'Eco-Craft & Circularity',
        body: '<p>LUXORA operates on limited production runs to eliminate deadstock waste. Our acetate is 100% bio-based cellulose derived from renewable cotton seeds and wood pulp.</p><p>Presentation boxes are crafted from FSC-certified recycled paperboard with vegetable-based non-toxic inks.</p>'
      },
      contact: {
        topic: 'CONCIERGE DESK',
        title: 'Atelier Concierge',
        body: '<p>Our client advisors are available Monday through Friday to assist with bespoke orders, styling consultations, and optical inquiries.</p><p><strong>Email:</strong> concierge@luxora-atelier.com<br><strong>Phone:</strong> +39 041 528 9200 (Venice)<br><strong>Hours:</strong> 09:00 – 18:00 CET</p>'
      },
      privacy: {
        topic: 'DATA SOVEREIGNTY',
        title: 'Privacy Policy',
        body: '<p>LUXORA respects your personal privacy. We never sell, monetize, or disclose your client data to third-party advertising networks.</p><p>Payment transactions are processed through tokenized, 256-bit encrypted gateways complying with PCI-DSS Level 1 security standards.</p>'
      },
      terms: {
        topic: 'LEGAL COVENANT',
        title: 'Terms of Service',
        body: '<p>By placing an order on LUXORA, you enter an agreement covered by European Union consumer protection standards and Italian commercial law.</p><p>All eyewear carries an international 2-year warranty against manufacturing defects from the date of registered dispatch.</p>'
      }
    };

    function openInfoModal(topic) {
      if (!infoModal) return;
      const data = infoContentMap[topic] || infoContentMap.faqs;
      if (infoModalTopic) infoModalTopic.textContent = data.topic;
      if (infoModalTitle) infoModalTitle.textContent = data.title;
      if (infoModalBody) infoModalBody.innerHTML = data.body;

      infoModal.classList.remove('pointer-events-none', 'opacity-0');
      infoModal.classList.add('pointer-events-auto', 'opacity-100');
    }

    function closeInfoModal() {
      if (!infoModal) return;
      infoModal.classList.remove('pointer-events-auto', 'opacity-100');
      infoModal.classList.add('pointer-events-none', 'opacity-0');
    }

    document.querySelectorAll('.footer-modal-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const topic = link.getAttribute('data-topic');
        openInfoModal(topic);
      });
    });

    if (closeInfoBtn) closeInfoBtn.addEventListener('click', closeInfoModal);
    if (dismissInfoBtn) dismissInfoBtn.addEventListener('click', closeInfoModal);
    if (infoModal) {
      infoModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) closeInfoModal();
      });
    }

    // --- CURATED CATALOGUE PRODUCT SWITCHING (4 VIEW PRODUCT BUTTONS) ---
    const mainProductImg = document.getElementById('main-product-img');
    const mainProductTitle = document.querySelector('#featured-signature .font-headline-lg');
    const mainProductPrice = document.querySelector('#featured-signature .font-subheading-editorial.text-2xl');
    const mainProductSeries = document.querySelector('#featured-signature .font-label-caps.uppercase.text-secondary');

    document.querySelectorAll('.view-product-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const title = btn.getAttribute('data-title');
        const price = btn.getAttribute('data-price');
        const series = btn.getAttribute('data-series');
        const img = btn.getAttribute('data-img');

        // Update main showcase
        if (mainProductTitle) mainProductTitle.textContent = title;
        if (mainProductPrice) mainProductPrice.textContent = price;
        if (mainProductSeries) mainProductSeries.textContent = series;
        if (mainProductImg && img) {
          mainProductImg.style.opacity = '0';
          setTimeout(() => {
            mainProductImg.src = img;
            mainProductImg.style.opacity = '1';
          }, 200);
        }

        // Update currentConfig
        currentConfig.title = title;
        currentConfig.priceStr = price;
        currentConfig.priceNum = parseInt(price.replace('$', ''), 10) || 149;
        if (img) currentConfig.img = img;

        showToast(`Loaded: ${title} in Flagship Showcase`);

        // Smooth scroll to featured showcase
        const target = document.getElementById('featured-signature');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // --- THUMBNAILS GALLERY HIGHLIGHTING ---
    const thumbnailButtons = document.querySelectorAll('#featured-signature .grid-cols-3 button');
    thumbnailButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        thumbnailButtons.forEach(b => {
          b.classList.remove('ring-2', 'ring-secondary', 'opacity-100');
          b.classList.add('opacity-70');
        });
        btn.classList.add('ring-2', 'ring-secondary', 'opacity-100');
        btn.classList.remove('opacity-70');
        // Update current config image if thumbnail image exists
        const thumbImg = btn.querySelector('img');
        if (thumbImg) currentConfig.img = thumbImg.src;
      });
    });

    // --- COLOR SELECTOR BUTTONS ---
    const colorLabel = document.getElementById('selected-color-label');
    const colorButtons = document.querySelectorAll('button[aria-label="Black with Gold"], button[aria-label="Champagne Gold"], button[aria-label="Dark Amber Tortoise"]');
    colorButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        colorButtons.forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-primary'));
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
        const label = btn.getAttribute('aria-label');
        if (colorLabel) colorLabel.textContent = label;
        currentConfig.color = label;
      });
    });

    // --- LENS TINT SELECTOR BUTTONS ---
    const tintContainer = document.querySelector('#featured-signature .grid-cols-3');
    if (tintContainer) {
      const tintButtons = tintContainer.querySelectorAll('button');
      tintButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          tintButtons.forEach(b => {
            b.className = 'px-space-sm py-2 text-center font-label-caps text-label-caps uppercase bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer';
          });
          btn.className = 'px-space-sm py-2 text-center font-label-caps text-label-caps uppercase bg-primary text-on-primary cursor-pointer';
          currentConfig.lens = `Polarized ${btn.textContent.trim()}`;
        });
      });
    }

    // --- SIZE SELECTOR BUTTONS ---
    const sizeContainer = document.querySelector('#featured-signature .grid-cols-2');
    if (sizeContainer) {
      const sizeButtons = sizeContainer.querySelectorAll('button');
      sizeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          sizeButtons.forEach(b => {
            b.className = 'px-space-sm py-2 text-center font-label-caps text-label-caps uppercase bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer';
          });
          btn.className = 'px-space-sm py-2 text-center font-label-caps text-label-caps uppercase bg-primary text-on-primary cursor-pointer';
          currentConfig.size = btn.textContent.trim();
        });
      });
    }

    // --- QUANTITY BUTTONS (+/-) ---
    const decBtn = document.querySelector('button[aria-label="Decrease quantity"]');
    const incBtn = document.querySelector('button[aria-label="Increase quantity"]');
    if (decBtn && incBtn) {
      const qtySpan = decBtn.parentElement.querySelector('span');
      decBtn.addEventListener('click', () => {
        if (currentConfig.qty > 1) {
          currentConfig.qty--;
          if (qtySpan) qtySpan.textContent = currentConfig.qty;
        }
      });
      incBtn.addEventListener('click', () => {
        currentConfig.qty++;
        if (qtySpan) qtySpan.textContent = currentConfig.qty;
      });
    }

    // --- NEWSLETTER FORM SUBMIT ---
    const newsletterForm = document.querySelector('section.bg-surface-container-high form');
    const newsletterMsg = document.getElementById('newsletter-msg');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = newsletterForm.querySelector('input[type="email"]');
        const email = input ? input.value : '';
        if (email) {
          if (newsletterMsg) newsletterMsg.classList.remove('hidden');
          if (input) input.value = '';
          showToast(`✓ Subscribed to Dispatch: ${email}`);
        }
      });
    }

    // --- SMOOTH SCROLLING FOR NAVIGATION LINKS ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#' || !href) return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  /**
   * 11. Register event listeners
   */
  function setupEventListeners() {
    window.addEventListener('scroll', onScroll, { passive: true });

    window.addEventListener('resize', () => {
      updateScrollTrackHeight();
      resizeCanvas();
      onScroll();
    }, { passive: true });

    // Fit Mode button toggle (Cover vs Contain)
    if (fitBtn) {
      fitBtn.addEventListener('click', () => {
        fitMode = fitMode === 'cover' ? 'contain' : 'cover';
        fitBtn.textContent = fitMode === 'cover' ? 'Cover' : 'Contain';
        if (currentRenderedIndex >= 0) {
          renderFrame(currentRenderedIndex);
        }
      });
    }

    // Initialize all interactive buttons and modals
    initStitchInteractions();
  }

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
