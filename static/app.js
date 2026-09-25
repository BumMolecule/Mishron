// মিশ্রণ: small progressive enhancements. Every page works without this file.
(function () {
  "use strict";

  // Wire up the chemistry toggle and quizzes inside `root` (a page, or a recipe
  // sheet loaded into the window on the contents page).
  function enhance(root) {
    // Show all / hide all chemistry notes on a dish page.
    var toggle = root.querySelector("[data-toggle-all]");
    var labs = Array.prototype.slice.call(root.querySelectorAll("details.lab"));
    if (toggle && labs.length) {
      toggle.hidden = false;
      var sync = function () {
        var allOpen = labs.every(function (d) { return d.open; });
        toggle.setAttribute("aria-pressed", String(allOpen));
        toggle.textContent = allOpen ? "Hide all the chemistry" : "Show all the chemistry";
      };
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-pressed") !== "true";
        labs.forEach(function (d) { d.open = open; });
        sync();
      });
      labs.forEach(function (d) { d.addEventListener("toggle", sync); });
      sync();
    }

    // Quiz: check answers in place. Without JS, the "Show the answer" reveal is the fallback.
    root.querySelectorAll("form.q").forEach(function (form) {
      var check = form.querySelector(".q-check");
      var error = form.querySelector(".q-error");
      var result = form.querySelector(".q-result");
      var reveal = form.querySelector(".q-reveal");
      var explainTpl = form.querySelector("template.q-explain");
      var answer = Number(form.dataset.answer);
      var options = Array.prototype.slice.call(form.querySelectorAll(".opt"));

      check.hidden = false;
      if (reveal) reveal.hidden = true;

      form.addEventListener("change", function () {
        error.hidden = true;
        options.forEach(function (o) { o.classList.remove("is-right", "is-wrong"); });
        result.hidden = true;
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var picked = form.querySelector("input[type=radio]:checked");
        if (!picked) {
          error.hidden = false;
          return;
        }
        var choice = Number(picked.value);
        var explain = explainTpl ? explainTpl.content.textContent.trim() : "";
        options[answer].classList.add("is-right");
        if (choice === answer) {
          result.className = "q-result is-right";
          result.textContent = "ঠিক! " + explain;
        } else {
          options[choice].classList.add("is-wrong");
          result.className = "q-result";
          result.textContent = "Not quite. " + explain;
        }
        result.hidden = false;
      });
    });
  }

  enhance(document);

  // Printing a recipe should include its chemistry.
  var printOpened = [];
  window.addEventListener("beforeprint", function () {
    printOpened = Array.prototype.filter.call(document.querySelectorAll("details.lab"), function (d) { return !d.open; });
    printOpened.forEach(function (d) { d.open = true; });
  });
  window.addEventListener("afterprint", function () {
    printOpened.forEach(function (d) { d.open = false; });
  });

  // The sheet window: on the contents page, a recipe opens over the page as a
  // sheet of paper instead of navigating away. The URL still changes to the
  // dish page, so reloading, sharing and the back button all behave.
  var win = document.querySelector("dialog.sheet-window");
  if (!win || typeof win.showModal !== "function" || !window.fetch || !window.DOMParser) return;

  var body = win.querySelector("[data-sheet-body]");
  var pageLink = win.querySelector("[data-sheet-page]");
  // While a sheet is open the address bar shows the dish page, so resolve the
  // contents page's own links against where it really lives.
  var homeUrl = location.href.split("#")[0];
  var pagePath = function (href) { var u = new URL(href, homeUrl); return u.origin + u.pathname.replace(/index\.html$/, ""); };
  var sameDoc = function (href) { return pagePath(href) === pagePath(homeUrl); };
  var homeTitle = document.title;
  var isDish = function (url) { return /\/dishes\/[^/]+\.html$/.test(url.pathname) && url.origin === location.origin; };
  var plainClick = function (e) { return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey; };

  function load(href, how) {
    var url = new URL(href, location.href);
    body.classList.add("is-loading");
    return fetch(url.href)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var sheet = doc.querySelector("article.sheet");
        if (!sheet) throw new Error("no sheet");
        // Links in the fetched page are relative to the dish page; pin them down.
        sheet.querySelectorAll("a[href]").forEach(function (a) { a.href = new URL(a.getAttribute("href"), url).href; });
        body.replaceChildren(document.adoptNode(sheet));
        body.scrollTop = 0;
        body.classList.remove("is-loading");
        enhance(body);
        pageLink.href = url.href;
        document.title = doc.title;
        if (how === "push") history.pushState({ sheet: url.href }, "", url.href);
        if (how === "replace") history.replaceState({ sheet: url.href }, "", url.href);
        if (!win.open) win.showModal();
        var title = body.querySelector(".recipe-title");
        if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
      })
      .catch(function () { location.href = url.href; });
  }

  // Open a recipe from the contents.
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a.menu-row");
    if (!a || !plainClick(e)) return;
    e.preventDefault();
    load(new URL(a.getAttribute("href"), homeUrl).href, "push");
  });

  // Inside the sheet: previous/next swap the sheet; links back to the contents close it.
  body.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]");
    if (!a || !plainClick(e)) return;
    var url = new URL(a.href);
    if (isDish(url)) {
      e.preventDefault();
      load(url.href, "replace");
    } else if (sameDoc(url.href)) {
      e.preventDefault();
      closeSheet(url.href);
      if (url.hash) {
        var target = document.getElementById(url.hash.slice(1));
        if (target) target.scrollIntoView();
      }
    }
  });

  win.querySelector("[data-sheet-close]").addEventListener("click", function () { closeSheet(); });
  // Clicking the dimmed backdrop (outside the sheet) closes it too.
  win.addEventListener("click", function (e) { if (e.target === win) closeSheet(); });

  // Closing puts the contents page's address back straight away (no history.back(),
  // and no waiting for the dialog's close event), so nothing races the next click.
  function closeSheet(to) {
    if (history.state && history.state.sheet) history.replaceState(null, "", to || homeUrl);
    document.title = homeTitle;
    if (win.open) win.close();
  }
  // Esc closes the dialog natively; tidy up the address after it.
  win.addEventListener("close", function () { if (!win.open) closeSheet(); });

  window.addEventListener("popstate", function (e) {
    if (e.state && e.state.sheet) load(e.state.sheet);
    else closeSheet();
  });
})();
