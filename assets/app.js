/* SiHalal gallery — gallery rendering + presentation player.
   No dependencies. Reads window.GALLERIES from assets/manifest.js. */
(function () {
  "use strict";

  var GALLERIES = window.GALLERIES || {};

  /* ---------------------------------------------------------------- utils */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === "class") node.className = props[k];
        else if (k === "text") node.textContent = props[k];
        else if (k === "html") node.innerHTML = props[k];
        else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), props[k]);
        else if (props[k] != null) node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function srcOf(gallery, image) {
    return gallery.dir + "/" + image.f;
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Inline glyph for cards that leave the site -- no icon font, no extra request. */
  var EXTERNAL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/>' +
    '<path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>';

  /* Inline play glyph for video cards. */
  var PLAY_GLYPH =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M9 6.5v11l9-5.5z"/></svg>';

  /* ----------------------------------------------------------- landing page */

  function initLanding() {
    var mount = document.querySelector("[data-cards]");
    if (!mount) return;

    var keys = Object.keys(GALLERIES);
    var links = window.EXTERNAL_LINKS || [];

    if (!keys.length && !links.length) {
      mount.appendChild(el("p", { class: "lede", text: "Nothing to show. Run build.py first." }));
      return;
    }

    keys.forEach(function (key) {
      var g = GALLERIES[key];
      var previews = g.images.slice(0, 3).map(function (img) {
        return el("img", { src: srcOf(g, img), alt: "", loading: "lazy" });
      });

      mount.appendChild(
        el("a", { class: "card", href: g.page }, [
          el("div", { class: "card-thumbs" }, previews),
          el("h2", { text: g.title }),
          el("p", { text: g.subtitle || "" }),
          el("div", { class: "card-meta" }, [
            el("span", { class: "pill", text: g.images.length + " langkah" }),
            el("span", { text: "Buka presentasi →" })
          ])
        ])
      );
    });

    /* Video cards: a poster frame with a play glyph, linking to a page that
       hosts the video. Only the poster loads here -- the video itself is not
       fetched until that page is opened. */
    (window.VIDEOS || []).forEach(function (v) {
      mount.appendChild(
        el("a", { class: "card card-video", href: v.page }, [
          el("div", { class: "card-poster" }, [
            el("img", { src: v.poster, alt: "", loading: "lazy" }),
            el("span", { class: "card-play", html: PLAY_GLYPH }),
            v.duration ? el("span", { class: "card-dur", text: v.duration }) : null
          ]),
          el("h2", { text: v.title }),
          el("p", { text: v.subtitle || "" }),
          el("div", { class: "card-meta" }, [
            el("span", { class: "pill", text: "Video" }),
            el("span", { text: "Tonton →" })
          ])
        ])
      );
    });

    /* Cards that leave the site: a glyph stands in for the thumbnail strip, and
       the destination domain is shown so the click is not a surprise. */
    links.forEach(function (link) {
      mount.appendChild(
        el("a", {
          class: "card card-external",
          href: link.url,
          target: "_blank",
          rel: "noopener noreferrer"
        }, [
          el("div", { class: "card-icon", html: EXTERNAL_ICON }),
          el("h2", { text: link.title }),
          el("p", { text: link.subtitle || "" }),
          el("div", { class: "card-meta" }, [
            el("span", { class: "pill pill-alt", text: link.tag || "Tautan" }),
            el("span", { text: (link.site || "") + " ↗" }),
            el("span", { class: "visually-hidden", text: " (buka di tab baru)" })
          ])
        ])
      );
    });
  }

  /* ---------------------------------------------------------- gallery page */

  function initGallery() {
    var key = document.body.getAttribute("data-gallery");
    var gallery = GALLERIES[key];
    var grid = document.querySelector("[data-grid]");
    if (!grid) return;

    if (!gallery || !gallery.images.length) {
      grid.appendChild(el("p", { class: "lede", text: "No images found for this gallery." }));
      return;
    }

    var images = gallery.images;

    /* --- header ------------------------------------------------------- */
    var h1 = document.querySelector("[data-title]");
    var sub = document.querySelector("[data-subtitle]");
    var cnt = document.querySelector("[data-count]");
    if (h1) h1.textContent = gallery.title;
    if (sub) sub.textContent = gallery.subtitle || "";
    if (cnt) cnt.textContent = images.length + " langkah";

    /* --- grid --------------------------------------------------------- */
    images.forEach(function (img, i) {
      var tile = el("button", {
        class: "tile",
        type: "button",
        "aria-label": "Buka langkah " + (i + 1) + ": " + img.t
      }, [
        el("img", { src: srcOf(gallery, img), alt: img.t, loading: "lazy" }),
        el("span", { class: "tile-num", text: String(i + 1) }),
        el("span", { class: "tile-label", text: img.t })
      ]);
      tile.addEventListener("click", function () { open(i, true); });
      grid.appendChild(tile);
    });

    /* --- viewer scaffolding ------------------------------------------- */
    var viewer = el("div", {
      class: "viewer",
      "data-open": "false",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": gallery.title + " — presentasi"
    });

    var stageImg = el("img", { alt: "", decoding: "async" });
    var hudTitle = el("div", { class: "hud-title" });
    var counter = el("div", { class: "counter" });
    var progressBar = el("div", { class: "progress-bar" });

    var prevBtn = el("button", { class: "nav nav-prev", type: "button", "aria-label": "Sebelumnya", html: "&#10094;" });
    var nextBtn = el("button", { class: "nav nav-next", type: "button", "aria-label": "Berikutnya", html: "&#10095;" });

    var stage = el("div", { class: "stage" }, [
      el("div", { class: "hud hud-top" }, [hudTitle, counter]),
      stageImg, prevBtn, nextBtn
    ]);

    var filmstrip = el("div", { class: "filmstrip", role: "tablist", "aria-label": "Pilih langkah" });

    var playBtn = el("button", { class: "play btn", type: "button", "data-state": "paused" });
    var speedSel = el("select", { class: "speed", "aria-label": "Durasi per langkah" });
    [3, 5, 8, 12].forEach(function (s) {
      var opt = el("option", { value: String(s), text: s + " detik" });
      if (s === 5) opt.selected = true;
      speedSel.appendChild(opt);
    });

    var fsBtn = el("button", { class: "btn", type: "button", text: "Layar penuh" });
    var closeBtn = el("button", { class: "btn", type: "button", text: "Tutup" });

    /* Control-bar buttons are their own elements -- not clones of the floating
       stage arrows, whose .nav class would absolutely-position them. */
    var ctrlPrev = el("button", { class: "btn", type: "button", html: "&#10094; Sebelumnya" });
    var ctrlNext = el("button", { class: "btn", type: "button", html: "Berikutnya &#10095;" });

    var controls = el("div", { class: "controls" }, [
      ctrlPrev, playBtn, ctrlNext, speedSel, fsBtn, closeBtn,
      el("div", {
        class: "hint",
        html: "<kbd>←</kbd> <kbd>→</kbd> navigasi &nbsp;·&nbsp; <kbd>Spasi</kbd> putar/jeda " +
              "&nbsp;·&nbsp; <kbd>F</kbd> layar penuh &nbsp;·&nbsp; <kbd>Esc</kbd> tutup"
      })
    ]);

    viewer.appendChild(stage);
    viewer.appendChild(el("div", { class: "progress" }, [progressBar]));
    viewer.appendChild(filmstrip);
    viewer.appendChild(controls);
    document.body.appendChild(viewer);

    /* --- filmstrip ----------------------------------------------------- */
    var thumbs = images.map(function (img, i) {
      var b = el("button", {
        type: "button",
        role: "tab",
        "aria-label": "Langkah " + (i + 1) + ": " + img.t
      }, [el("img", { src: srcOf(gallery, img), alt: "", loading: "lazy" })]);
      b.addEventListener("click", function () { show(i); });
      filmstrip.appendChild(b);
      return b;
    });

    /* --- player state --------------------------------------------------- */
    var index = 0;
    var playing = false;
    var elapsed = 0;
    var lastFrame = 0;
    var rafId = null;
    var interval = 5000;

    function show(i) {
      index = Math.max(0, Math.min(images.length - 1, i));
      var img = images[index];
      stageImg.src = srcOf(gallery, img);
      stageImg.alt = img.t;
      hudTitle.textContent = img.t;
      counter.textContent = (index + 1) + " / " + images.length;

      prevBtn.disabled = ctrlPrev.disabled = index === 0;
      nextBtn.disabled = ctrlNext.disabled = index === images.length - 1;

      thumbs.forEach(function (b, n) {
        if (n === index) b.setAttribute("aria-current", "true");
        else b.removeAttribute("aria-current");
      });
      var active = thumbs[index];
      if (active && active.scrollIntoView) {
        active.scrollIntoView({ inline: "center", block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      }

      /* Preload the next frame so advancing feels instant. */
      var upcoming = images[index + 1];
      if (upcoming) { var p = new Image(); p.src = srcOf(gallery, upcoming); }

      resetProgress();
    }

    function next() { if (index < images.length - 1) show(index + 1); else pause(); }
    function prev() { show(index - 1); }

    function resetProgress() {
      elapsed = 0;
      lastFrame = 0;
      progressBar.style.width = "0%";
      if (playing) startLoop();
    }

    function startLoop() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    }

    function tick(now) {
      if (!playing) return;
      if (!lastFrame) lastFrame = now;
      var dt = now - lastFrame;
      lastFrame = now;
      elapsed += dt;

      if (elapsed >= interval) { next(); return; }
      progressBar.style.width = (elapsed / interval * 100) + "%";
      rafId = requestAnimationFrame(tick);
    }

    function play() {
      if (playing) return;
      playing = true;
      playBtn.setAttribute("data-state", "playing");
      playBtn.textContent = "⏸ Jeda";
      lastFrame = 0;
      startLoop();
    }

    function pause() {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(rafId);
      playBtn.setAttribute("data-state", "paused");
      playBtn.textContent = "▶ Putar";
    }

    function toggle() { playing ? pause() : play(); }

    /* --- open / close --------------------------------------------------- */
    var lastFocused = null;

    function open(i, autoplay) {
      lastFocused = document.activeElement;
      viewer.setAttribute("data-open", "true");
      document.body.style.overflow = "hidden";
      show(i);
      if (autoplay && !reduceMotion) play();
      else pause();
      closeBtn.focus();
    }

    function close() {
      pause();
      viewer.setAttribute("data-open", "false");
      document.body.style.overflow = "";
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    /* --- wiring --------------------------------------------------------- */
    var startBtn = document.querySelector("[data-start]");
    if (startBtn) startBtn.addEventListener("click", function () { open(0, true); });

    prevBtn.addEventListener("click", prev);
    ctrlPrev.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);
    ctrlNext.addEventListener("click", next);
    playBtn.addEventListener("click", toggle);
    closeBtn.addEventListener("click", close);

    speedSel.addEventListener("change", function () {
      interval = parseInt(speedSel.value, 10) * 1000;
      resetProgress();
    });

    fsBtn.addEventListener("click", function () {
      if (!document.fullscreenElement) {
        if (viewer.requestFullscreen) viewer.requestFullscreen().catch(function () {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    });

    document.addEventListener("fullscreenchange", function () {
      fsBtn.textContent = document.fullscreenElement ? "Keluar layar penuh" : "Layar penuh";
    });

    document.addEventListener("keydown", function (e) {
      if (viewer.getAttribute("data-open") !== "true") return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); }
      else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        fsBtn.click();
      }
    });

    /* Pause when the tab is hidden so returning users don't miss frames. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause();
    });

    /* Swipe on touch devices. */
    var startX = null;
    viewer.addEventListener("touchstart", function (e) {
      startX = e.changedTouches[0].clientX;
    }, { passive: true });
    viewer.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) < 55) return;
      dx < 0 ? next() : prev();
    }, { passive: true });

    /* Pointer users: tap the stage background to toggle playback. */
    stage.addEventListener("click", function (e) {
      if (e.target === stage || e.target === stageImg) toggle();
    });

    /* Deep link: sihalal-pu.html#12 opens straight to step 12. */
    var hash = parseInt((location.hash || "").replace("#", ""), 10);
    if (!isNaN(hash) && hash >= 1 && hash <= images.length) {
      open(hash - 1, !reduceMotion);
    }
  }

  /* ------------------------------------------------------------ video page */

  function initVideo() {
    var key = document.body.getAttribute("data-video");
    var videos = window.VIDEOS || [];
    var v = videos.filter(function (x) { return x.key === key; })[0] || videos[0];
    var mount = document.querySelector("[data-video-mount]");
    if (!v || !mount) return;

    var h1 = document.querySelector("[data-title]");
    var sub = document.querySelector("[data-subtitle]");
    if (h1) h1.textContent = v.title;
    if (sub) sub.textContent = v.subtitle || "";

    /* width/height give the element its 16:9 box up front, so the layout does
       not jump when metadata arrives. preload="metadata" fetches just enough
       to show the poster and the runtime -- the video waits for a click. */
    var player = el("video", {
      class: "player",
      controls: "controls",
      playsinline: "playsinline",
      preload: "metadata",
      poster: v.poster,
      width: "1276",
      height: "718"
    });
    player.muted = true;   /* property as well as attribute: the attribute
                              alone is not reliably honoured after a reload */
    player.appendChild(el("source", { src: v.src, type: "video/mp4" }));
    player.appendChild(document.createTextNode(
      "Browser Anda tidak mendukung pemutar video."));
    mount.appendChild(el("div", { class: "player-wrap" }, [player]));

    var src = document.querySelector("[data-source]");
    if (src && v.source_url) {
      src.appendChild(document.createTextNode("Sumber: "));
      src.appendChild(el("a", {
        href: v.source_url, target: "_blank", rel: "noopener noreferrer",
        text: v.site + " ↗"
      }));
      if (v.duration) src.appendChild(document.createTextNode(" · " + v.duration));
    }
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    if (document.body.getAttribute("data-gallery")) initGallery();
    else if (document.body.getAttribute("data-video")) initVideo();
    else initLanding();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
