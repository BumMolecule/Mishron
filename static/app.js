// মিশ্রণ: small progressive enhancements. Every page works without this file.
(function () {
  "use strict";

  // Show all / hide all chemistry notes on a dish page.
  var toggle = document.querySelector("[data-toggle-all]");
  var labs = Array.prototype.slice.call(document.querySelectorAll("details.lab"));
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

  // Printing a recipe should include its chemistry.
  var printOpened = [];
  window.addEventListener("beforeprint", function () {
    printOpened = labs.filter(function (d) { return !d.open; });
    printOpened.forEach(function (d) { d.open = true; });
  });
  window.addEventListener("afterprint", function () {
    printOpened.forEach(function (d) { d.open = false; });
  });

  // Quiz: check answers in place. Without JS, the "Show the answer" reveal is the fallback.
  document.querySelectorAll("form.q").forEach(function (form) {
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
})();
