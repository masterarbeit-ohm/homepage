/* Survey data engine — localStorage + Google Sheets */

/* ── Sicherheits-Token ins Formular injizieren ── */
function injectFormTokens(form) {
  // Timestamp-Token (serverseitig auf Alter geprüft)
  var t = document.createElement('input');
  t.type = 'hidden';
  t.name = '_t';
  t.value = Date.now().toString();
  form.appendChild(t);

  // Honeypot: off-screen, tabindex=-1 → Menschen tippen hier nie rein, Bots oft schon
  var hp = document.createElement('input');
  hp.type = 'text';
  hp.name = '_hp';
  hp.setAttribute('tabindex', '-1');
  hp.setAttribute('autocomplete', 'off');
  hp.setAttribute('aria-hidden', 'true');
  hp.className = 'hp-field';
  form.appendChild(hp);
}

/* ── Duplikat-Guard: warnt wenn Umfrage bereits ausgefüllt ── */
function initDuplicateGuard(surveyId, formId) {
  var key  = 'survey_done_' + surveyId;
  var form = document.getElementById(formId);
  if (!form || !localStorage.getItem(key)) return;

  var banner = document.createElement('div');
  banner.className = 'already-submitted-notice';
  banner.innerHTML =
    '<strong>Hinweis:</strong> Sie haben diese Umfrage auf diesem Gerät bereits abgeschlossen. ' +
    'Ihre Antworten wurden gespeichert. ' +
    '<button type="button" class="btn btn--sm btn--outline" id="duplicate-proceed-btn">' +
    'Trotzdem erneut ausfüllen</button>';
  form.parentNode.insertBefore(banner, form);
  form.hidden = true;

  document.getElementById('duplicate-proceed-btn').addEventListener('click', function() {
    banner.remove();
    form.hidden = false;
  });
}

/* ── Formulardaten sammeln ── */
function collectFormData(formElement) {
  var data = {};
  var fd = new FormData(formElement);
  fd.forEach(function(value, key) {
    if (data[key] !== undefined) {
      if (!Array.isArray(data[key])) data[key] = [data[key]];
      data[key].push(value);
    } else {
      data[key] = value;
    }
  });
  // Arrays → kommagetrennte Strings (besser für Google Sheets)
  Object.keys(data).forEach(function(k) {
    if (Array.isArray(data[k])) data[k] = data[k].join(', ');
  });
  data._timestamp = new Date().toISOString();
  return data;
}

/* ── localStorage Backup ── */
function saveToLocalStorage(surveyId, data) {
  var key = 'survey_' + surveyId;
  var existing = [];
  try { existing = JSON.parse(localStorage.getItem(key)) || []; } catch(e) { existing = []; }
  existing.push(data);
  localStorage.setItem(key, JSON.stringify(existing));
  return existing.length;
}

/* ── Google Sheets senden ── */
function sendToGoogleSheets(scriptUrl, surveyId, data) {
  if (!scriptUrl || scriptUrl === 'SCRIPT_URL_HIER_EINSETZEN') {
    return Promise.resolve({ skipped: true });
  }
  var payload = JSON.stringify({ surveyId: surveyId, response: data });
  return fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // kein Preflight nötig
    body: payload,
    redirect: 'follow'
  }).then(function(res) { return res.json(); });
}

/* ── Kombiniertes Speichern ── */
function saveSurveyResponse(surveyId, formElement, scriptUrl) {
  var data = collectFormData(formElement);
  var total = saveToLocalStorage(surveyId, data);
  return {
    data: data,
    totalResponses: total,
    sheetsPromise: sendToGoogleSheets(scriptUrl, surveyId, data)
  };
}

/* ── Hilfsfunktionen (unverändert) ── */
function loadSurveyResponses(surveyId) {
  try { return JSON.parse(localStorage.getItem('survey_' + surveyId)) || []; }
  catch(e) { return []; }
}

function getResponseCount(surveyId) {
  return loadSurveyResponses(surveyId).length;
}

function exportAsJSON(surveyId) {
  var responses = loadSurveyResponses(surveyId);
  var payload = {
    surveyId: surveyId,
    exportedAt: new Date().toISOString(),
    totalResponses: responses.length,
    responses: responses
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'umfrage-' + surveyId + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function updateCounterElements() {
  document.querySelectorAll('[data-survey-counter]').forEach(function(el) {
    var id = el.getAttribute('data-survey-counter');
    el.textContent = getResponseCount(id);
  });
}

function initConditional(triggerSelector, targetSelector) {
  var triggers = document.querySelectorAll(triggerSelector);
  var target = document.querySelector(targetSelector);
  if (!target) return;
  function check() {
    var any = Array.from(triggers).some(function(t) { return t.checked; });
    target.classList.toggle('is-visible', any);
    if (!any) { var inp = target.querySelector('input,textarea'); if (inp) inp.value = ''; }
  }
  triggers.forEach(function(t) { t.addEventListener('change', check); });
  check();
}

function initConditionalByValue(triggerName, value, targetSelector) {
  var target = document.querySelector(targetSelector);
  if (!target) return;
  function check() {
    var sel = document.querySelector('input[name="' + triggerName + '"]:checked');
    var show = sel && (sel.value === value || (Array.isArray(value) && value.includes(sel.value)));
    target.classList.toggle('is-visible', !!show);
  }
  document.querySelectorAll('input[name="' + triggerName + '"]').forEach(function(r) {
    r.addEventListener('change', check);
  });
  check();
}

function initCharCounter(textareaId, counterId, max) {
  var ta = document.getElementById(textareaId);
  var counter = document.getElementById(counterId);
  if (!ta || !counter) return;
  function update() { counter.textContent = ta.value.length + ' / ' + max; }
  ta.addEventListener('input', update);
  update();
}

function initSurveyProgress(formId) {
  var form = document.getElementById(formId);
  if (!form) return;
  var inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
  var bar = document.querySelector('.survey-progress__bar');
  if (!bar || inputs.length === 0) return;
  function update() {
    var filled = Array.from(inputs).filter(function(i) {
      if (i.type === 'radio' || i.type === 'checkbox') {
        return form.querySelector('input[name="' + i.name + '"]:checked') !== null;
      }
      return i.value.trim() !== '';
    });
    var pct = Math.round((filled.length / inputs.length) * 100);
    bar.style.width = pct + '%';
  }
  form.addEventListener('change', update);
  form.addEventListener('input', update);

  // Fehler-Markierung beim Ausfüllen entfernen
  form.addEventListener('change', function(e) {
    var group = e.target.closest('.form-group');
    if (group && group.classList.contains('field-error')) {
      group.classList.remove('field-error');
      group.querySelectorAll('.validation-msg').forEach(function(m) { m.remove(); });
    }
  });
  form.addEventListener('input', function(e) {
    var group = e.target.closest('.form-group');
    if (group && group.classList.contains('field-error')) {
      group.classList.remove('field-error');
      group.querySelectorAll('.validation-msg').forEach(function(m) { m.remove(); });
    }
  });

  update();
}

/* ── Formular-Validierung ── */
function validateForm(form) {
  // Fehler-Markierungen zurücksetzen
  form.querySelectorAll('.field-error').forEach(function(el) { el.classList.remove('field-error'); });
  form.querySelectorAll('.validation-msg').forEach(function(el) { el.remove(); });

  var firstError = null;

  function markError(group) {
    group.classList.add('field-error');
    var msg = document.createElement('p');
    msg.className = 'validation-msg';
    msg.textContent = 'Bitte ausfüllen.';
    group.appendChild(msg);
    if (!firstError) firstError = group;
  }

  // Pflichtfelder prüfen (nur sichtbare — keine versteckten conditionals)
  function isVisible(el) {
    var conditional = el.closest('.conditional');
    return !conditional || conditional.classList.contains('is-visible');
  }

  // Select und Texteingaben
  form.querySelectorAll('select[required], input[required]:not([type="radio"]):not([type="checkbox"]), textarea[required]').forEach(function(input) {
    if (!isVisible(input)) return;
    if (!input.value.trim()) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  // Radio-Gruppen (nur einmal pro name prüfen)
  var checkedNames = {};
  form.querySelectorAll('input[type="radio"][required]').forEach(function(input) {
    if (checkedNames[input.name] !== undefined) return;
    if (!isVisible(input)) { checkedNames[input.name] = true; return; }
    var anyChecked = form.querySelector('input[name="' + input.name + '"]:checked');
    checkedNames[input.name] = !!anyChecked;
    if (!anyChecked) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  // Checkbox-Gruppen (mindestens eine muss ausgewählt sein)
  var checkedCheckboxNames = {};
  form.querySelectorAll('input[type="checkbox"][required]').forEach(function(input) {
    if (checkedCheckboxNames[input.name] !== undefined) return;
    if (!isVisible(input)) { checkedCheckboxNames[input.name] = true; return; }
    var anyChecked = form.querySelector('input[name="' + input.name + '"]:checked') ||
                     form.querySelector('input[name="' + input.name + '_sonstiges_cb"]:checked');
    checkedCheckboxNames[input.name] = !!anyChecked;
    if (!anyChecked) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  // Sichtbare Sonstiges-Textfelder müssen ausgefüllt sein
  form.querySelectorAll('.conditional.is-visible input[type="text"], .conditional.is-visible textarea').forEach(function(input) {
    if (!input.value.trim()) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  if (firstError) {
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  return true;
}

/* ── Abschnitts-Validierung (für mehrstufige Formulare) ── */
function validateSection(form, section) {
  section.querySelectorAll('.field-error').forEach(function(el) { el.classList.remove('field-error'); });
  section.querySelectorAll('.validation-msg').forEach(function(el) { el.remove(); });

  var firstError = null;
  function markError(group) {
    group.classList.add('field-error');
    var msg = document.createElement('p');
    msg.className = 'validation-msg';
    msg.textContent = 'Bitte ausfüllen.';
    group.appendChild(msg);
    if (!firstError) firstError = group;
  }
  function isVisible(el) {
    var c = el.closest('.conditional');
    return !c || c.classList.contains('is-visible');
  }

  section.querySelectorAll('select[required], input[required]:not([type="radio"]):not([type="checkbox"]), textarea[required]').forEach(function(input) {
    if (!isVisible(input)) return;
    if (!input.value.trim()) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  var checkedNames = {};
  section.querySelectorAll('input[type="radio"][required]').forEach(function(input) {
    if (checkedNames[input.name] !== undefined) return;
    if (!isVisible(input)) { checkedNames[input.name] = true; return; }
    var anyChecked = form.querySelector('input[name="' + input.name + '"]:checked');
    checkedNames[input.name] = !!anyChecked;
    if (!anyChecked) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  var checkedCbNames = {};
  section.querySelectorAll('input[type="checkbox"][required]').forEach(function(input) {
    if (checkedCbNames[input.name] !== undefined) return;
    if (!isVisible(input)) { checkedCbNames[input.name] = true; return; }
    var anyChecked = form.querySelector('input[name="' + input.name + '"]:checked') ||
                     form.querySelector('input[name="' + input.name + '_sonstiges_cb"]:checked');
    checkedCbNames[input.name] = !!anyChecked;
    if (!anyChecked) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  section.querySelectorAll('.conditional.is-visible input[type="text"], .conditional.is-visible textarea').forEach(function(input) {
    if (!input.value.trim()) {
      var group = input.closest('.form-group');
      if (group && !group.classList.contains('field-error')) markError(group);
    }
  });

  if (firstError) { firstError.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
  return true;
}

/* ── Mehrstufiges Formular ── */
function initSteppedForm(formId, surveyId, modalId) {
  var form  = document.getElementById(formId);
  var modal = document.getElementById(modalId);
  if (!form) return;

  var scriptUrl  = form.getAttribute('data-script-url') || '';

  injectFormTokens(form);
  initDuplicateGuard(surveyId, formId);
  var steps      = Array.from(form.querySelectorAll('fieldset[data-step]'));
  var totalSteps = steps.length;
  var current    = 0;

  var bar       = document.querySelector('.survey-progress__bar');
  var stepLabel = document.getElementById('survey-step-label');
  var backBtn   = document.getElementById('step-back');
  var nextBtn   = document.getElementById('step-next');
  var submitBtn = document.getElementById('step-submit');

  form.addEventListener('change', function(e) {
    var g = e.target.closest('.form-group');
    if (g && g.classList.contains('field-error')) {
      g.classList.remove('field-error');
      g.querySelectorAll('.validation-msg').forEach(function(m) { m.remove(); });
    }
  });
  form.addEventListener('input', function(e) {
    var g = e.target.closest('.form-group');
    if (g && g.classList.contains('field-error')) {
      g.classList.remove('field-error');
      g.querySelectorAll('.validation-msg').forEach(function(m) { m.remove(); });
    }
  });

  function showStep(index) {
    steps.forEach(function(s, i) { s.hidden = i !== index; });
    current = index;
    var pct = Math.round((index / totalSteps) * 100);
    if (bar)       bar.style.width = pct + '%';
    if (stepLabel) stepLabel.textContent = 'Abschnitt ' + (index + 1) + ' von ' + totalSteps;
    if (backBtn)   backBtn.style.display   = index === 0 ? 'none' : '';
    if (nextBtn)   nextBtn.style.display   = index < totalSteps - 1 ? '' : 'none';
    if (submitBtn) submitBtn.style.display = index === totalSteps - 1 ? '' : 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showStep(0);

  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      if (validateSection(form, steps[current])) showStep(current + 1);
    });
  }
  if (backBtn) {
    backBtn.addEventListener('click', function() { showStep(current - 1); });
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateSection(form, steps[current])) return;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gespeichert …'; }

    var result = saveSurveyResponse(surveyId, form, scriptUrl);

    function showModal(status) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Antworten absenden →'; }
      if (modal) {
        var statusEl = modal.querySelector('[data-sheets-status]');
        if (statusEl) {
          if (status === 'ok')       statusEl.innerHTML = '✅ Antwort in Google Sheets gespeichert.';
          else if (status === 'skip') statusEl.innerHTML = '💾 Lokal gespeichert (Google Sheets nicht konfiguriert).';
          else                        statusEl.innerHTML = '⚠️ Lokal gespeichert – Google Sheets konnte nicht erreicht werden.';
          statusEl.style.display = 'block';
        }
        modal.classList.add('is-open');
      }
      localStorage.setItem('survey_done_' + surveyId, Date.now().toString());
      form.reset();
      document.querySelectorAll('.conditional').forEach(function(el) { el.classList.remove('is-visible'); });
      // Timestamp-Token erneuern für den Fall eines erneuten Ausfüllens
      var tField = form.querySelector('input[name="_t"]');
      if (tField) tField.value = Date.now().toString();
      showStep(0);
    }

    result.sheetsPromise
      .then(function(res) { showModal(res && res.skipped ? 'skip' : 'ok'); })
      .catch(function()   { showModal('error'); });
  });

  var exportBtn = document.getElementById('btn-export-' + surveyId);
  if (exportBtn) exportBtn.addEventListener('click', function() { exportAsJSON(surveyId); });
  var closeBtn = modal && modal.querySelector('[data-modal-close]');
  if (closeBtn) closeBtn.addEventListener('click', function() { modal.classList.remove('is-open'); });

  updateCounterElements();
}

/* ── Haupt-Init ── */
function initSurveyForm(formId, surveyId, modalId) {
  var form = document.getElementById(formId);
  var modal = document.getElementById(modalId);
  if (!form) return;

  var scriptUrl = form.getAttribute('data-script-url') || '';

  injectFormTokens(form);
  initDuplicateGuard(surveyId, formId);
  initSurveyProgress(formId);

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    if (!validateForm(form)) return;

    var submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Wird gespeichert …';
    }

    var result = saveSurveyResponse(surveyId, form, scriptUrl);

    function showModal(status) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Antworten absenden →'; }
      if (modal) {
        var countEl = modal.querySelector('[data-modal-count]');
        if (countEl) countEl.textContent = result.totalResponses;
        var statusEl = modal.querySelector('[data-sheets-status]');
        if (statusEl) {
          if (status === 'ok')      statusEl.innerHTML = '✅ Antwort in Google Sheets gespeichert.';
          else if (status === 'skip') statusEl.innerHTML = '💾 Lokal gespeichert (Google Sheets nicht konfiguriert).';
          else                       statusEl.innerHTML = '⚠️ Lokal gespeichert – Google Sheets konnte nicht erreicht werden.';
          statusEl.style.display = 'block';
        }
        modal.classList.add('is-open');
      }
      localStorage.setItem('survey_done_' + surveyId, Date.now().toString());
      form.reset();
      // Timestamp-Token erneuern
      var tField = form.querySelector('input[name="_t"]');
      if (tField) tField.value = Date.now().toString();
      document.querySelectorAll('.conditional').forEach(function(el) { el.classList.remove('is-visible'); });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    result.sheetsPromise
      .then(function(res) { showModal(res && res.skipped ? 'skip' : 'ok'); })
      .catch(function()   { showModal('error'); });
  });

  var exportBtn = document.getElementById('btn-export-' + surveyId);
  if (exportBtn) exportBtn.addEventListener('click', function() { exportAsJSON(surveyId); });

  var closeBtn = modal && modal.querySelector('[data-modal-close]');
  if (closeBtn) closeBtn.addEventListener('click', function() { modal.classList.remove('is-open'); });

  updateCounterElements();
}

document.addEventListener('DOMContentLoaded', updateCounterElements);
