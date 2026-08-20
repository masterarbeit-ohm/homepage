// Google Apps Script – ORIGINTERRA Umfragen
// Anleitung: siehe unten nach dem Code

var SHEET_BAUERN      = 'Bauern-Umfrage';
var SHEET_KONSUMENTEN = 'Konsumenten-Umfrage';
var SHEET_TESTER      = 'Prototyp-Tester';

var MAX_PER_HOUR = 120; // max. Einreichungen pro Stunde (global)

// Alias-Map: alte Feldnamen (vor Umnummerierung der Formularfragen) →
// aktuelle kanonische Feldnamen. Verhindert doppelte Spalten im Sheet,
// falls z.B. ein gecachtes/altes Formular noch alte Feldnamen sendet.
var FIELD_ALIASES = {
  b3_mehr_kaufen: 'b2_mehr_kaufen',
  b4_standort: 'b3_standort',
  b4_verfuegbarkeit: 'b3_verfuegbarkeit',
  b4_herkunft: 'b3_herkunft',
  b4_hofinfo: 'b3_hofinfo',
  b4_bewertungen: 'b3_bewertungen',
  b4_kontakt: 'b3_kontakt',

  c3_kontakt_erleichtert: 'c2_kontakt_erleichtert',

  // C3 (Modelle-Checkbox) und C4 (Funktionen-Bipolar) wurden getauscht.
  // Zwischenzeitliche Feldnamen aus der ursprünglichen Umnummerierung
  // zeigen jetzt direkt auf die finalen, aktuellen Feldnamen.
  c3_karte: 'c4_karte',
  c3_oeffnungszeiten: 'c4_oeffnungszeiten',
  c3_herkunft: 'c4_herkunft',
  c3_bestellung: 'c4_bestellung',
  c3_abholung: 'c4_abholung',
  c3_benachrichtigung: 'c4_benachrichtigung',
  c3_kontakt: 'c4_kontakt',
  c3_bewertungen: 'c4_bewertungen',
  c3_rezepte: 'c4_rezepte',

  c5_modell: 'c3_modell',
  c5_modell_sonstiges: 'c3_modell_sonstiges',
  c5_modell_sonstiges_cb: 'c3_modell_sonstiges_cb',
  c4_modell: 'c3_modell',
  c4_modell_sonstiges: 'c3_modell_sonstiges',
  c4_modell_sonstiges_cb: 'c3_modell_sonstiges_cb',

  c6_plattform_wahrscheinlich: 'c5_plattform_wahrscheinlich',
  c7_nutzung: 'c6_nutzung',

  d3_mehr_zahlen: 'd4_mehr_zahlen',
  d4_mehrpreis: 'd5_mehrpreis',
  d5_vertrauen_verringern: 'd6_vertrauen_verringern',
  d5_vertrauen_verringern_sonstiges: 'd6_vertrauen_verringern_sonstiges'
};

function normalizeKeys(response) {
  var normalized = {};
  Object.keys(response).forEach(function(k) {
    var canonical = FIELD_ALIASES[k] || k;
    normalized[canonical] = response[k];
  });
  return normalized;
}

function errorResponse(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload  = JSON.parse(e.postData.contents);
    var surveyId = payload.surveyId;
    var response = payload.response;

    // 1. Honeypot: Bots füllen dieses Feld – Menschen nicht
    if (response._hp) {
      return errorResponse('rejected');
    }

    // 2. Timestamp-Token: muss zwischen 20 Sek. und 3 Std. alt sein
    var t   = parseInt(response._t || '0', 10);
    var age = Date.now() - t;
    if (!t || age < 20000 || age > 10800000) {
      return errorResponse('invalid token');
    }

    // 3. Rate-Limit: max. MAX_PER_HOUR Einreichungen pro Stunde
    var props   = PropertiesService.getScriptProperties();
    var hourKey = 'rl_' + new Date().toISOString().slice(0, 13); // z.B. "rl_2026-05-26T14"
    var count   = parseInt(props.getProperty(hourKey) || '0', 10);
    if (count >= MAX_PER_HOUR) {
      return errorResponse('rate limit');
    }
    props.setProperty(hourKey, String(count + 1));

    // Interne Felder vor dem Speichern entfernen
    delete response._hp;
    delete response._t;

    // Alte Feldnamen auf aktuelles Schema mappen
    response = normalizeKeys(response);

    var ss        = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = surveyId === 'bauern'           ? SHEET_BAUERN
                  : surveyId === 'prototyp-tester'  ? SHEET_TESTER
                  : SHEET_KONSUMENTEN;
    var sheet     = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

    var keys = Object.keys(response);

    if (sheet.getLastRow() === 0) {
      // Erste Zeile: Spaltenüberschriften
      sheet.appendRow(keys);
      sheet.getRange(1, 1, 1, keys.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // Neue Felder als zusätzliche Spalten anhängen
      var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      keys.forEach(function(k) {
        if (existingHeaders.indexOf(k) === -1) {
          sheet.getRange(1, existingHeaders.length + 1).setValue(k);
          sheet.getRange(1, existingHeaders.length + 1).setFontWeight('bold');
          existingHeaders.push(k);
        }
      });
      keys = existingHeaders;
    }

    // Aktuelle Headerreihe nochmal lesen (inkl. evtl. neuer Spalten)
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = headers.map(function(h) {
      var val = response[h];
      return val !== undefined ? val : '';
    });
    sheet.appendRow(row);

    // Spaltenbreite automatisch anpassen
    sheet.autoResizeColumns(1, sheet.getLastColumn());

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, row: sheet.getLastRow() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Testfunktion – direkt in Apps Script ausführen um die Verbindung zu prüfen
function testSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Verbunden mit: ' + ss.getName());
  Logger.log('Tabellen: ' + ss.getSheets().map(function(s){ return s.getName(); }).join(', '));
}

/*
==============================================================
  EINRICHTUNG – einmalig, dauert ca. 3 Minuten
==============================================================

1. Öffne Google Drive → "Neu" → "Google Tabellen"
   Benenne die Tabelle z.B. "ORIGINTERRA Umfragen"

2. In der Tabelle: Erweiterungen → Apps Script

3. Lösche den vorhandenen Code (function myFunction...) und
   füge den gesamten Inhalt dieser Datei ein. Klicke "Speichern".

4. Klicke auf "Ausführen" → Funktion "testSetup" wählen →
   Berechtigungen erteilen (Google fragt einmalig nach Zugriff)

5. Klicke oben rechts auf "Bereitstellen" → "Neue Bereitstellung"
   - Typ: Web-App
   - Beschreibung: ORIGINTERRA Umfragen v1
   - Ausführen als: Ich (deine Google-Adresse)
   - Zugriff: Jeder (auch anonym)
   → "Bereitstellen" klicken

6. Kopiere die angezeigte Web-App URL
   (sieht so aus: https://script.google.com/macros/s/XXXXX.../exec)

7. Öffne in VS Code:
   - umfrage-bauern.html    → suche nach SCRIPT_URL_HIER_EINSETZEN
   - umfrage-konsumenten.html → suche nach SCRIPT_URL_HIER_EINSETZEN
   Ersetze den Platzhalter in BEIDEN Dateien mit deiner URL.

8. Fertig! Jede Antwort erscheint sofort in deiner Google Tabelle.

HINWEIS: Bei jeder Code-Änderung in Apps Script musst du eine
neue Bereitstellung erstellen (nicht die bestehende aktualisieren),
damit die Änderungen aktiv werden.
==============================================================
*/
