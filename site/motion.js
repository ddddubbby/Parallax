/* Resonance brand site — motion.
   Progressive enhancement only: the site is fully readable with JS disabled.
   No scroll listeners anywhere (IntersectionObserver + CSS scroll-driven only). */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- A.4 entrance reveals ---- */
  var items = document.querySelectorAll("[data-reveal]");
  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -10% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---- nav scrolled state (sentinel, not a scroll listener) ---- */
  var nav = document.getElementById("nav");
  var sentinel = document.getElementById("nav-sentinel");
  if (nav && sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      nav.classList.toggle("scrolled", !entries[0].isIntersecting);
    }, { rootMargin: "-80px 0px 0px 0px" }).observe(sentinel);
  } else if (nav) {
    nav.classList.add("scrolled");
  }

  /* ---- A.5 nav zoom-through ---- */
  var main = document.querySelector("main");
  var zooming = false;
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (ev) {
      var href = a.getAttribute("href");
      if (href === "#" || href === "#top") return; // let brand/home jump natively
      var target = document.querySelector(href);
      if (!target || reduced || !main) return;      // reduced motion: native jump
      if (zooming) return;                           // transition already in flight
      ev.preventDefault();
      zooming = true;
      main.classList.add("zoom-out");
      var done = false;
      var go = function () {
        if (done) return; done = true;
        main.removeEventListener("transitionend", go);
        target.scrollIntoView({ behavior: "instant", block: "start" });
        main.classList.remove("zoom-out");
        main.classList.add("zoom-in");
        void main.offsetWidth;                      // reflow so zoom-in start state applies
        main.classList.remove("zoom-in");
        if (history.pushState) history.pushState(null, "", href);
        zooming = false;
      };
      main.addEventListener("transitionend", go, { once: true });
      setTimeout(go, 500);                          // fallback if transitionend never fires
    });
  });

  /* ---- mobile hamburger menu ---- */
  var hamburger = document.querySelector(".hamburger");
  var navMenu = document.getElementById("nav-menu");
  var navScrim = document.getElementById("nav-scrim");
  if (nav && hamburger && navMenu) {
    var openMenu = function () {
      nav.classList.add("menu-open");
      hamburger.setAttribute("aria-expanded", "true");
      var firstLink = navMenu.querySelector("a");
      if (firstLink) firstLink.focus();
    };
    var closeMenu = function (returnFocus) {
      if (!nav.classList.contains("menu-open")) return;
      nav.classList.remove("menu-open");
      hamburger.setAttribute("aria-expanded", "false");
      if (returnFocus) hamburger.focus();
    };
    hamburger.addEventListener("click", function () {
      if (nav.classList.contains("menu-open")) closeMenu(true);
      else openMenu();
    });
    if (navScrim) {
      navScrim.addEventListener("click", function () { closeMenu(true); });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && nav.classList.contains("menu-open")) closeMenu(true);
    });
    navMenu.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) closeMenu(false);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) closeMenu(false);
    });
  }
})();
