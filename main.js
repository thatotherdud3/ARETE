(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Loader + page transitions
  const loader = $('.page-loader');
  let hidden = false;
  const hide = () => {
    if (!loader || hidden) return;
    hidden = true;
    loader.classList.remove('leaving');
    loader.classList.add('done');
  };
  addEventListener('load', () => hide(), { once: true });
  setTimeout(hide, 1800); // safety net if 'load' is slow/never fires
  addEventListener('pageshow', e => e.persisted && hide());
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || !loader || a.target || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname === location.pathname) return;
    e.preventDefault();
    hidden = false;
    loader.classList.remove('done'); loader.classList.add('leaving');
    setTimeout(() => (location.href = a.href), 450);
  });

  // Nav hide on scroll down, reveal on scroll up
  const nav = $('.global-nav');
  if (nav) {
    let lastY = scrollY, ticking = false;
    const onScroll = () => {
      const y = Math.max(scrollY, 0);
      if (y > lastY && y > 140) nav.classList.add('nav-hidden');
      else if (y < lastY) nav.classList.remove('nav-hidden');
      lastY = y;
      ticking = false;
    };
    addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
  }

  // Scroll reveal
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0.12 });
    $$('section > *:not(.grid-3), .class-card, .cotm, .schedule-block, .quote-card, .newsletter, .product-card').forEach(el => {
      el.classList.add('reveal');
      if (el.matches('.product-card, .class-card')) el.style.transitionDelay = (($$(el.tagName + '.' + el.classList[0], el.parentElement).indexOf(el)) % 3) * 120 + 'ms';
      io.observe(el);
    });
  }

  // Slow hero parallax (skips "contain" heroes)
  const imgs = $$('.hero .photo:not(.contain)');
  if (!reduce && imgs.length) {
    const tick = () => imgs.forEach(img => {
      const r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight));
      img.style.transform = `translate3d(0,${p * r.height * 0.05}px,0) scale(1.12)`;
    });
    addEventListener('scroll', () => requestAnimationFrame(tick), { passive: true });
    tick();
  }

  // Mobile menu
  const left = $('.nav-left'), links = $$('.pill-nav a');
  if (left && links.length) {
    const b = document.createElement('button');
    b.className = 'menu-btn'; b.setAttribute('aria-label', 'Menu'); b.innerHTML = '<span></span><span></span>';
    left.appendChild(b);
    const m = document.createElement('div'); m.className = 'mobile-menu';
    const hasHome = links.some(a => a.getAttribute('href') === 'index.html');
    m.innerHTML = (hasHome ? '' : '<a href="index.html">HOME</a>') + links.map(a => `<a href="${a.getAttribute('href')}">${a.textContent}</a>`).join('');
    document.body.appendChild(m);
    b.addEventListener('click', () => document.body.classList.toggle('menu-open'));
  }

  // Product quick view
  if ($('.plus-btn')) {
    const qv = document.createElement('div'); qv.className = 'qv';
    qv.innerHTML = `<div class="qv-box" role="dialog" aria-modal="true"><button class="qv-close" aria-label="Close">&times;</button><div class="qv-img"><img alt=""></div><div class="qv-info"><span class="qv-badge">Members only</span><h3></h3><div class="qv-price"></div><p>Balenciaga Active, crafted from performance fabrics. Available exclusively to ARETE members.</p><div class="qv-sizes">${['XS','S','M','L','XL'].map(s => `<button type="button"${s === 'M' ? ' class="on"' : ''}>${s}</button>`).join('')}</div><button class="qv-add" type="button">Add to bag</button></div></div>`;
    document.body.append(qv);
    const close = () => qv.classList.remove('open');
    let currentCard = null;
    $$('.plus-btn').forEach(btn => btn.addEventListener('click', () => {
      currentCard = btn.closest('.product-card');
      $('.qv-img img', qv).src = $('img', currentCard).src;
      $('h3', qv).textContent = $('.product-name', currentCard).textContent;
      $('.qv-price', qv).innerHTML = $('.product-price', currentCard).innerHTML;
      qv.classList.add('open');
    }));
    qv.addEventListener('click', e => { if (e.target === qv || e.target.closest('.qv-close')) close(); });
    addEventListener('keydown', e => e.key === 'Escape' && close());
    $$('.qv-sizes button', qv).forEach(s => s.addEventListener('click', () => { $$('.qv-sizes button', qv).forEach(x => x.classList.remove('on')); s.classList.add('on'); }));
    $('.qv-add', qv).addEventListener('click', () => {
      if (!currentCard || !window.ARETE_CART) return close();
      const priceMatches = $('.product-price', currentCard).textContent.match(/\$[\d,]+/g) || ['$0'];
      const price = parseInt(priceMatches[priceMatches.length - 1].replace(/[$,]/g, ''), 10);
      const size = $('.qv-sizes button.on', qv)?.textContent || 'M';
      window.ARETE_CART.addToCart({
        name: $('.product-name', currentCard).textContent,
        image: $('img', currentCard).src,
        price, size, qty: 1
      });
      close();
      window.ARETE_CART.openCart();
    });
  }
})();

// - Cart (localStorage-backed, shared across every page) -
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = 'arete_cart';
  const money = n => '$' + n.toLocaleString('en-US');
  const getCart = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

  function setCart(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
    renderCart();
    updateBadge();
  }
  function addToCart(item) {
    const cart = getCart();
    const match = cart.find(i => i.name === item.name && i.size === item.size);
    if (match) match.qty += item.qty; else cart.push(item);
    setCart(cart);
  }
  function changeQty(i, delta) {
    const cart = getCart();
    if (!cart[i]) return;
    cart[i].qty += delta;
    if (cart[i].qty <= 0) cart.splice(i, 1);
    setCart(cart);
  }
  function removeItem(i) {
    const cart = getCart();
    cart.splice(i, 1);
    setCart(cart);
  }
  function updateBadge() {
    const count = getCart().reduce((s, i) => s + i.qty, 0);
    $$('.cart-count').forEach(b => { b.textContent = count; b.classList.toggle('show', count > 0); });
    $$('.cart-icon').forEach(b => b.setAttribute('aria-label', `Cart, ${count} item${count === 1 ? '' : 's'}`));
  }

  const drawer = document.createElement('div');
  drawer.className = 'cart-drawer';
  drawer.innerHTML = `
    <div class="cart-panel" role="dialog" aria-label="Shopping bag">
      <div class="cart-head">
        <h3>Your Bag</h3>
        <button class="cart-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="cart-items"></div>
      <div class="cart-footer">
        <div class="cart-subtotal"><span>Subtotal</span><span class="cart-subtotal-amt">$0</span></div>
        <button class="btn-line cart-checkout" type="button">Checkout</button>
      </div>
    </div>`;
  document.body.appendChild(drawer);

  function renderCart() {
    const cart = getCart();
    const itemsEl = $('.cart-items', drawer);
    itemsEl.innerHTML = cart.length ? cart.map((item, i) => `
      <div class="cart-item">
        <img src="${item.image}" alt="">
        <div>
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-size">Size ${item.size}</div>
          <div class="cart-item-qty">
            <button type="button" data-qty="-1" data-i="${i}" aria-label="Decrease quantity">&minus;</button>
            <span>${item.qty}</span>
            <button type="button" data-qty="1" data-i="${i}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="cart-item-right">
          <div class="cart-item-price">${money(item.price * item.qty)}</div>
          <button class="cart-item-remove" type="button" data-remove="${i}">Remove</button>
        </div>
      </div>`).join('') : `<p class="cart-empty">Your bag is empty.</p>`;
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    $('.cart-subtotal-amt', drawer).textContent = money(subtotal);
  }

  drawer.addEventListener('click', e => {
    const qtyBtn = e.target.closest('[data-qty]');
    if (qtyBtn) return changeQty(+qtyBtn.dataset.i, +qtyBtn.dataset.qty);
    const rmBtn = e.target.closest('[data-remove]');
    if (rmBtn) return removeItem(+rmBtn.dataset.remove);
    if (e.target === drawer || e.target.closest('.cart-close')) closeCart();
  });
  $('.cart-checkout', drawer).addEventListener('click', () => {
    if (!getCart().length) return;
    alert("Checkout isn't connected yet — email hello@aretefitness.nyc with your order and we'll take care of it.");
  });

  function openCart() { drawer.classList.add('open'); document.body.classList.add('scroll-lock'); }
  function closeCart() { drawer.classList.remove('open'); document.body.classList.remove('scroll-lock'); }

  $$('.cart-icon').forEach(btn => btn.addEventListener('click', openCart));
  addEventListener('keydown', e => e.key === 'Escape' && drawer.classList.contains('open') && closeCart());

  window.ARETE_CART = { addToCart, openCart, closeCart };
  renderCart();
  updateBadge();
})();

// -micro-interactions-
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];


  const loaderEl = $('.page-loader');
  if (loaderEl) {
    const reveal = () => document.body.classList.add('hero-ready');
    const mo = new MutationObserver(() => {
      if (loaderEl.classList.contains('done')) { reveal(); mo.disconnect(); }
    });
    mo.observe(loaderEl, { attributes: true, attributeFilter: ['class'] });
    // safety net in case the loader is already done 
    if (loaderEl.classList.contains('done')) reveal();
  } else {
    document.body.classList.add('hero-ready');
  }

  // Magnetic buttons
  if (!reduce) {
    $$('.btn-line, .btn-outline').forEach(btn => {
      const strength = 0.35;
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const mx = (e.clientX - r.left - r.width / 2) * strength;
        const my = (e.clientY - r.top - r.height / 2) * strength;
        btn.style.setProperty('--mx', mx.toFixed(1) + 'px');
        btn.style.setProperty('--my', my.toFixed(1) + 'px');
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  // Sliding pill nav indicator
  const nav = $('.pill-nav');
  if (nav) {
    const items = $$('.pill-item', nav);
    const indicator = document.createElement('div');
    indicator.className = 'pill-indicator';
    nav.insertBefore(indicator, nav.firstChild);

    const moveTo = el => {
      if (!el) return;
      indicator.style.width = el.offsetWidth + 'px';
      indicator.style.transform = `translateX(${el.offsetLeft - 4}px)`;
    };
    const settle = () => moveTo($('.pill-item.grey', nav) || items[0]);

    requestAnimationFrame(() => {
      settle();
      nav.classList.add('indicator-on');
    });
    addEventListener('resize', settle);

    items.forEach(item => {
      item.addEventListener('mouseenter', () => moveTo(item));
      item.addEventListener('focus', () => moveTo(item));
    });
    nav.addEventListener('mouseleave', settle);
  }
})();

// ---------- Booking / inquiry modal ----------
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const triggers = $$('[data-booking]');
  if (!triggers.length) return;

  const CLASS_OPTIONS = [
    'Pilates — with Claire', 'Boxing — with Andre', 'Spin — with Marcela',
    'Endurance Run Club — with Marcus', 'Powerlifting Fundamentals',
    'Strength & Conditioning Circuit', 'Mindful Mobility', 'Restorative Yoga Flow',
    'Core Dynamics', 'High-Performance Running Drills', 'Boxing Technique & Conditioning',
    'Pilates Sculpt', 'Spin Endurance Ride', 'HIIT Power 45'
  ];
  const TIER_OPTIONS = ['Monthly Membership', 'Yearly Membership', "Founders' Circle"];
  const netlifySubmit = (formName, data) =>
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'form-name': formName, ...data }).toString()
    });

  const overlay = document.createElement('div');
  overlay.className = 'bk';
  document.body.appendChild(overlay);

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render(type, meta) {
    const isClass = type === 'class';
    const classOpts = CLASS_OPTIONS.map(c =>
      `<option value="${escapeHtml(c)}"${c === meta.class ? ' selected' : ''}>${escapeHtml(c)}</option>`
    ).join('');
    const tierOpts = TIER_OPTIONS.map(t =>
      `<option value="${escapeHtml(t)}"${t === meta.tier ? ' selected' : ''}>${escapeHtml(t)}</option>`
    ).join('');
    const isFounders = meta.tier === "Founders' Circle";

    overlay.innerHTML = `
      <div class="bk-box" role="dialog" aria-modal="true">
        <button class="bk-close" type="button" aria-label="Close">&times;</button>
        <span class="bk-badge">${isClass ? 'Class Booking' : (isFounders ? 'Invitation Only' : 'Membership Inquiry')}</span>
        <h3 class="bk-title">${isClass ? 'Book a class' : (isFounders ? "Founders' Circle Application" : 'Join ARETE')}</h3>
        <p class="bk-sub">${isClass
          ? "Tell us when you'd like to train and we'll confirm your spot by email."
          : (isFounders
              ? "Founders' Circle is invitation-only. Tell us a little about yourself and we'll follow up personally."
              : "Leave your details and a membership advisor will reach out within one business day.")}</p>

        <form class="bk-form" novalidate>
          <input class="bk-hp" tabindex="-1" autocomplete="off" name="bot-field">
          <div class="bk-row2">
            <div class="bk-field">
              <label for="bk-name">Full name</label>
              <input id="bk-name" name="name" type="text" required autocomplete="name">
            </div>
            <div class="bk-field">
              <label for="bk-email">Email</label>
              <input id="bk-email" name="email" type="email" required autocomplete="email">
            </div>
          </div>
          <div class="bk-field">
            <label for="bk-phone">Phone <span style="opacity:.6">(optional)</span></label>
            <input id="bk-phone" name="phone" type="tel" autocomplete="tel">
          </div>

          ${isClass ? `
            <div class="bk-row2">
              <div class="bk-field">
                <label for="bk-class">Class</label>
                <select id="bk-class" name="class" required>
                  <option value="" disabled${meta.class ? '' : ' selected'}>Select a class</option>
                  ${classOpts}
                </select>
              </div>
              <div class="bk-field">
                <label for="bk-date">Preferred date</label>
                <input id="bk-date" name="preferred_date" type="date">
              </div>
            </div>
            <div class="bk-field">
              <label for="bk-notes">Notes <span style="opacity:.6">(optional)</span></label>
              <textarea id="bk-notes" name="notes" placeholder="Anything we should know — injuries, experience level, etc."></textarea>
            </div>
          ` : `
            <div class="bk-field">
              <label for="bk-tier">Membership tier</label>
              <select id="bk-tier" name="tier" required>${tierOpts}</select>
            </div>
            <div class="bk-field">
              <label for="bk-source">How did you hear about ARETE?</label>
              <select id="bk-source" name="source">
                <option value="">Prefer not to say</option>
                <option>Referral</option>
                <option>Instagram</option>
                <option>Google</option>
                <option>Walked past the club</option>
                <option>Other</option>
              </select>
            </div>
            <div class="bk-field">
              <label for="bk-details">${isFounders ? "What are you looking for?" : "Anything we should know?"} <span style="opacity:.6">(optional)</span></label>
              <textarea id="bk-details" name="details" placeholder="${isFounders ? 'Training goals, schedule, what draws you to Founders\u2019 Circle…' : 'Goals, preferred hours, questions for us…'}"></textarea>
            </div>
          `}

          <button class="bk-submit" type="submit">${isClass ? 'Confirm Booking' : (isFounders ? 'Submit Application' : 'Submit Inquiry')}</button>
          <p class="bk-error">Something went wrong sending this. Please try again, or email us directly at <a href="mailto:hello@aretefitness.nyc" style="color:#f5f3ee">hello@aretefitness.nyc</a>.</p>
        </form>
      </div>`;

    const form = $('.bk-form', overlay);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.elements['bot-field'].value) return; 
      const btn = $('.bk-submit', form);
      const errEl = $('.bk-error', form);
      errEl.classList.remove('show');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      const data = Object.fromEntries(new FormData(form).entries());
      delete data['bot-field'];

      try {
        const res = await netlifySubmit(isClass ? 'class-booking' : 'membership-inquiry', data);
        if (!res.ok) throw new Error('bad status');
        showSuccess(isClass, meta);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = isClass ? 'Confirm Booking' : (isFounders ? 'Submit Application' : 'Submit Inquiry');
        errEl.classList.add('show');
      }
    });
  }

  function showSuccess(isClass) {
    $('.bk-box', overlay).innerHTML = `
      <button class="bk-close" type="button" aria-label="Close">&times;</button>
      <div class="bk-success">
        <svg width="46" height="46" viewBox="0 0 46 46" fill="none"><circle cx="23" cy="23" r="22" stroke="#f5f3ee" stroke-width="1.4"/><path d="M14 23.5l6 6L32 17" stroke="#f5f3ee" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3>${isClass ? "You're booked in" : 'Thank you'}</h3>
        <p>${isClass
          ? "We'll confirm your spot by email shortly. See you on the floor."
          : "A member of our team will be in touch within one business day."}</p>
      </div>`;
  }

  function open(btn) {
    const type = btn.dataset.booking;
    render(type, { class: btn.dataset.class || '', tier: btn.dataset.tier || '' });
    overlay.classList.add('open');
    document.body.classList.add('scroll-lock');
    setTimeout(() => $('.bk-form input, .bk-form select', overlay)?.focus(), 350);
  }
  function close() {
    overlay.classList.remove('open');
    document.body.classList.remove('scroll-lock');
  }

  triggers.forEach(btn => btn.addEventListener('click', () => open(btn)));
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.bk-close')) close();
  });
  addEventListener('keydown', e => e.key === 'Escape' && overlay.classList.contains('open') && close());
})();
