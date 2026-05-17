// Google Apps Script – ORIGINTERRA Umfragen
// Anleitung: siehe unten nach dem Code

var SHEET_BAUERN      = 'Bauern-Umfrage';
var SHEET_KONSUMENTEN = 'Konsumenten-Umfrage';
var SHEET_TESTER      = 'Prototyp-Tester';

function doPost(e) {
  try {
    var payload  = JSON.parse(e.postData.contents);
    var surveyId = payload.surveyId;
    var response = payload.response;

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
