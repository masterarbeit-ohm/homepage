/* Survey data engine — localStorage + Google Sheets */

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
  update();
}

/* ── Haupt-Init ── */
function initSurveyForm(formId, surveyId, modalId) {
  var form = document.getElementById(formId);
  var modal = document.getElementById(modalId);
  if (!form) return;

  var scriptUrl = form.getAttribute('data-script-url') || '';

  initSurveyProgress(formId);

  form.addEventListener('submit', function(e) {
    e.preventDefault();

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
      form.reset();
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
