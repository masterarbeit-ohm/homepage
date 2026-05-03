/* Animated radial progress counter on index.html */
(function() {
  function animateCounter(el, target, duration) {
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var elapsed = ts - start;
      var val = Math.min(Math.round((elapsed / duration) * target), target);
      el.textContent = val;
      if (elapsed < duration) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function setCirclePct(el, pct) {
    el.style.setProperty('--pct', pct + '%');
  }

  document.addEventListener('DOMContentLoaded', function() {
    var circle   = document.querySelector('.progress-circle');
    var numEl    = document.querySelector('.progress-circle__num');
    if (!circle || !numEl) return;

    var target = parseInt(circle.getAttribute('data-progress') || '40', 10);
    var animated = false;

    var observer = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting && !animated) {
        animated = true;
        animateCounter(numEl, target, 1200);
        var step = function(ts) {
          if (!step._start) step._start = ts;
          var pct = Math.min(((ts - step._start) / 1200) * target, target);
          setCirclePct(circle, pct);
          if (pct < target) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.3 });

    observer.observe(circle);

    /* mobile nav toggle */
    var toggleBtn = document.getElementById('nav-toggle');
    var navLinks  = document.getElementById('nav-links');
    if (toggleBtn && navLinks) {
      toggleBtn.addEventListener('click', function() {
        navLinks.classList.toggle('is-open');
        var expanded = navLinks.classList.contains('is-open');
        toggleBtn.setAttribute('aria-expanded', expanded);
      });
    }
  });
})();
