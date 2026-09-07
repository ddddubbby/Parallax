/* Windtunnel brand site — progressive enhancement only.
   Readable with JS disabled. No page zoom. No scroll listeners. */
(function () {
  "use strict";
  var nav = document.getElementById("nav");
  var hamburger = document.querySelector(".hamburger");
  var navMenu = document.getElementById("nav-menu");
  var navScrim = document.getElementById("nav-scrim");
  if (nav && hamburger && navMenu) {
    var mobileQuery = window.matchMedia("(max-width: 960px)");
    var setMenuAvailability = function () {
      var hidden = mobileQuery.matches && !nav.classList.contains("menu-open");
      navMenu.toggleAttribute("inert", hidden);
      navMenu.setAttribute("aria-hidden", hidden ? "true" : "false");
    };
    var openMenu = function () {
      nav.classList.add("menu-open");
      hamburger.setAttribute("aria-expanded", "true");
      setMenuAvailability();
      var firstLink = navMenu.querySelector("a");
      if (firstLink) firstLink.focus();
    };
    var closeMenu = function (returnFocus) {
      if (!nav.classList.contains("menu-open")) return;
      nav.classList.remove("menu-open");
      hamburger.setAttribute("aria-expanded", "false");
      setMenuAvailability();
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
      if (ev.key === "Tab" && nav.classList.contains("menu-open")) {
        var focusable = Array.prototype.slice.call(nav.querySelectorAll("a, button:not([disabled])"));
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    });
    navMenu.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) closeMenu(false);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 960) closeMenu(false);
      setMenuAvailability();
    });
    setMenuAvailability();
  }
})();
