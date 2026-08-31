/**
 * =========================================================================
 * CSIT EVENT OPERATIONS - PASS ISSUANCE & GATE ADMISSION API
 * =========================================================================
 * 
 * Serverless Google Apps Script API connecting to Google Sheets.
 * 
 * Features:
 *  1. generatePass: Creates Pass ID, logs attendee + amount, sends email with QR & returns WhatsApp link.
 *  2. checkAndScanPass: High-concurrency gate scan validator using LockService.
 *  3. getStats: Metric aggregations (Total Passes, Scanned, Unused, Total Revenue).
 *  4. getPasses: Search and filter attendee records.
 *  5. prettifySheet: Automated high-end corporate styling, formatting, conditional colors & column alignments.
 *  6. repairAndFormatSheet: Fixes shifted/mismatched columns from previous test runs and re-applies executive styling.
 */

var CONFIG = {
  SHEET_NAME: 'Attendees',
  EVENT_NAME: 'The Last Soiree 2026',
  EVENT_SUBTITLE: 'Annual Dinner & Welcome Gala',
  PRESENTER: 'CSIT OPERATIONS',
  EVENT_DATE: '16 MAY 2026',
  EVENT_TIME: '07:00 PM ONWARDS',
  EVENT_VENUE: 'Grand Arena, Main Campus',
  CURRENCY_SYMBOL: 'Rs. ',
  ORGANIZER_CONTACT: 'CSIT Organizing Committee'
};

/**
 * Custom Menu inside Google Sheets for 1-click styling & management
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🎟️ Event Pass Tools')
    .addItem('✨ Prettify & Format Sheet', 'prettifySheet')
    .addItem('🔄 Repair Shifted Columns & Format', 'repairAndFormatSheet')
    .addSeparator()
    .addItem('⚡ Reset Sheet to Clean Template', 'setupSheet')
    .addToUi();
}

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'ping';

    if (action === 'ping') {
      return jsonResponse({
        success: true,
        message: 'CSIT Event Operations API is active and operational.',
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'getStats') {
      return jsonResponse(getStatsData());
    }

    if (action === 'prettify' || action === 'repair') {
      repairAndFormatSheet();
      return jsonResponse({ success: true, message: 'Google Sheet repaired and beautifully formatted!' });
    }

    return jsonResponse({ success: false, error: 'Unknown GET action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    var requestData = {};
    
    if (e && e.postData && e.postData.contents) {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        requestData = e.parameter || {};
      }
    } else if (e && e.parameter) {
      requestData = e.parameter;
    }

    var action = requestData.action;

    switch (action) {
      case 'generatePass':
        return jsonResponse(handleGeneratePass(requestData));

      case 'checkAndScanPass':
        return jsonResponse(handleCheckAndScanPass(requestData));

      case 'getStats':
        return jsonResponse(getStatsData());

      case 'getPasses':
        return jsonResponse(handleGetPasses(requestData));

      case 'prettify':
        repairAndFormatSheet();
        return jsonResponse({ success: true, message: 'Sheet repaired and styled successfully!' });

      case 'ping':
        return jsonResponse({ success: true, message: 'Pong! API is operational.' });

      default:
        return jsonResponse({ success: false, error: 'Invalid action specified: ' + action });
    }
  } catch (err) {
    return jsonResponse({
      success: false,
      error: 'Server Error: ' + err.toString(),
      stack: err.stack
    });
  }
}

function validateAdminCode(providedCode) {
  var expectedCode = PropertiesService.getScriptProperties().getProperty('ADMIN_CODE');
  if (!expectedCode || expectedCode.trim().length === 0) return true;
  if (!providedCode) return false;
  return String(providedCode).trim() === String(expectedCode).trim();
}

/**
 * Generates formatted Pass ID: #LSAD26-001, #LSAD26-002, etc.
 */
function generateUniquePassId(sheet) {
  var lastRow = sheet.getLastRow();
  var count = Math.max(1, lastRow);
  var paddedNum = ('000' + count).slice(-3);
  var candidateId = '#LSAD26-' + paddedNum;

  if (!findRowByPassId(sheet, candidateId)) {
    return candidateId;
  }

  var randomSuffix = Math.floor(100 + Math.random() * 900);
  return '#LSAD26-' + randomSuffix;
}

function getQrCodeUrl(passId) {
  var encodedData = encodeURIComponent(passId);
  return 'https://quickchart.io/qr?text=' + encodedData + '&size=400&ecLevel=H&margin=2';
}

function createWhatsAppLink(phoneNumber, name, rollNo, amount, passId) {
  if (!phoneNumber) return '';
  var cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
  
  var message = 
    '*' + CONFIG.PRESENTER + '*\n' +
    '*' + CONFIG.EVENT_NAME + ' — ' + CONFIG.EVENT_SUBTITLE + '*\n\n' +
    'Hello ' + name + ',\n' +
    (rollNo ? 'Roll No: ' + rollNo + '\n' : '') +
    'Pass ID: ' + passId + '\n' +
    (amount ? 'Amount Paid: ' + CONFIG.CURRENCY_SYMBOL + amount + '\n' : '') +
    '\n' +
    'Date: ' + CONFIG.EVENT_DATE + '\n' +
    'Time: ' + CONFIG.EVENT_TIME + '\n' +
    'Venue: ' + CONFIG.EVENT_VENUE + '\n\n' +
    'Please present your digital QR code pass at the entrance gate. Valid for 1 entry.';

  return 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(message);
}

function handleGeneratePass(data) {
  if (!validateAdminCode(data.adminCode)) {
    return { success: false, error: 'Unauthorized: Invalid Admin Code' };
  }

  var name = (data.name || '').trim();
  if (!name) {
    return { success: false, error: 'Attendee name is required.' };
  }

  var rollNo = (data.rollNo || '').trim();
  var amount = Number(data.amount) || 0;
  var email = (data.email || '').trim();
  var whatsapp = (data.whatsapp || '').trim();

  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(10000);
  if (!hasLock) {
    return { success: false, error: 'Server busy. Please try again in a few seconds.' };
  }

  try {
    var sheet = getOrCreateSheet();
    var passId = generateUniquePassId(sheet);
    var nowIso = new Date().toISOString();
    var qrUrl = getQrCodeUrl(passId);

    // Schema: [Pass ID, Name, Roll No, Amount, Email, WhatsApp, Status, Created Timestamp, Scanned-at Timestamp]
    sheet.appendRow([
      passId,
      name,
      rollNo,
      amount,
      email,
      whatsapp,
      'unused',
      nowIso,
      ''
    ]);

    // Apply format to new row
    var newRowIdx = sheet.getLastRow();
    formatSingleDataRow(sheet, newRowIdx);

    var emailSent = false;
    var emailError = null;
    if (email) {
      try {
        emailSent = sendPassEmail(name, rollNo, amount, email, passId, qrUrl);
      } catch (e) {
        emailError = e.toString();
      }
    }

    var waLink = createWhatsAppLink(whatsapp, name, rollNo, amount, passId);

    return {
      success: true,
      passId: passId,
      name: name,
      rollNo: rollNo,
      amount: amount,
      email: email,
      whatsapp: whatsapp,
      status: 'unused',
      createdAt: nowIso,
      qrUrl: qrUrl,
      whatsappLink: waLink,
      emailSent: emailSent,
      emailError: emailError
    };
  } finally {
    lock.releaseLock();
  }
}

function handleCheckAndScanPass(data) {
  var rawPassId = (data.passId || '').trim();
  if (!rawPassId) {
    return { success: false, result: 'invalid', message: 'No Pass ID provided.' };
  }

  var searchId = rawPassId.toUpperCase();

  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(10000);
  if (!hasLock) {
    return { success: false, result: 'error', message: 'System busy, please scan again immediately.' };
  }

  try {
    var sheet = getOrCreateSheet();
    var match = findRowByPassId(sheet, searchId);

    if (!match) {
      return {
        success: true,
        result: 'invalid',
        passId: searchId,
        message: 'Pass ID not found in system database.'
      };
    }

    var rowIdx = match.rowIndex;
    var rowData = match.data;
    
    // Status is in column index 7 (0-indexed: 6)
    var currentStatus = String(rowData[6] || '').toLowerCase().trim();
    var name = rowData[1] || 'Guest';
    var rollNo = rowData[2] || '';
    var amount = rowData[3] || 0;
    var previousScanTimestamp = rowData[8] || '';

    if (currentStatus === 'used') {
      return {
        success: true,
        result: 'already_used',
        passId: searchId,
        name: name,
        rollNo: rollNo,
        amount: amount,
        scannedAt: previousScanTimestamp,
        message: 'Pass has already been used!'
      };
    }

    var scanTimeIso = new Date().toISOString();
    sheet.getRange(rowIdx, 7).setValue('used');
    sheet.getRange(rowIdx, 9).setValue(scanTimeIso);
    SpreadsheetApp.flush();

    return {
      success: true,
      result: 'valid',
      passId: searchId,
      name: name,
      rollNo: rollNo,
      amount: amount,
      scannedAt: scanTimeIso,
      message: 'Gate Entry Approved: ' + name
    };
  } finally {
    lock.releaseLock();
  }
}

function getStatsData() {
  var sheet = getOrCreateSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return {
      success: true,
      totalPasses: 0,
      scannedPasses: 0,
      unusedPasses: 0,
      totalRevenue: 0,
      scannedPercentage: 0,
      recentPasses: []
    };
  }

  var total = 0;
  var scanned = 0;
  var unused = 0;
  var totalRevenue = 0;
  var recent = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var passId = row[0];
    if (!passId) continue;
    
    total++;
    var rowAmount = Number(row[3]) || 0;
    totalRevenue += rowAmount;

    var status = String(row[6] || '').toLowerCase().trim();
    if (status === 'used') {
      scanned++;
    } else {
      unused++;
    }

    recent.push({
      passId: passId,
      name: row[1] || '',
      rollNo: row[2] || '',
      amount: rowAmount,
      email: row[4] || '',
      whatsapp: row[5] || '',
      status: status || 'unused',
      createdAt: row[7] || '',
      scannedAt: row[8] || ''
    });
  }

  recent.reverse();

  return {
    success: true,
    totalPasses: total,
    scannedPasses: scanned,
    unusedPasses: unused,
    totalRevenue: totalRevenue,
    scannedPercentage: total > 0 ? Math.round((scanned / total) * 100) : 0,
    recentPasses: recent.slice(0, 50)
  };
}

function handleGetPasses(data) {
  var stats = getStatsData();
  var query = (data.query || '').toLowerCase().trim();

  if (!query) {
    return stats;
  }

  var filtered = stats.recentPasses.filter(function(item) {
    return item.name.toLowerCase().indexOf(query) !== -1 ||
           item.passId.toLowerCase().indexOf(query) !== -1 ||
           (item.rollNo && item.rollNo.toLowerCase().indexOf(query) !== -1) ||
           (item.email && item.email.toLowerCase().indexOf(query) !== -1) ||
           (item.whatsapp && String(item.whatsapp).indexOf(query) !== -1);
  });

  return {
    success: true,
    totalPasses: stats.totalPasses,
    scannedPasses: stats.scannedPasses,
    unusedPasses: stats.unusedPasses,
    totalRevenue: stats.totalRevenue,
    passes: filtered
  };
}

function sendPassEmail(name, rollNo, amount, email, passId, qrUrl) {
  try {
    var qrBlob;
    try {
      var response = UrlFetchApp.fetch(qrUrl);
      qrBlob = response.getBlob().setName('Credential_' + passId.replace('#', '') + '.png');
    } catch (fetchErr) {
      Logger.log('Could not fetch QR blob: ' + fetchErr);
    }

    var subject = 'Official Event Entry Credential: ' + CONFIG.EVENT_NAME + ' [' + passId + ']';

    var htmlBody = 
      '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; color: #0f172a; border-radius: 2px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">' +
        
        '<!-- Header Accent Bar -->' +
        '<div style="background: #6d28d9; height: 6px; width: 100%;"></div>' +

        '<!-- Header -->' +
        '<div style="padding: 24px 24px 16px 24px; border-bottom: 1px solid #e2e8f0; background: #faf5ff;">' +
          '<div style="font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #6d28d9; text-transform: uppercase; margin-bottom: 4px;">' + CONFIG.PRESENTER + '</div>' +
          '<h1 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; letter-spacing: -0.3px;">' + CONFIG.EVENT_NAME + '</h1>' +
          '<div style="font-size: 13px; color: #64748b; margin-top: 2px;">' + CONFIG.EVENT_SUBTITLE + ' • Official Entry Credential</div>' +
        '</div>' +

        '<div style="padding: 24px;">' +
          '<!-- Event Meta Box -->' +
          '<div style="background: #f8fafc; border-radius: 2px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #334155; border: 1px solid #e2e8f0;">' +
            '<div style="margin-bottom: 4px;"><strong>Date & Time:</strong> ' + CONFIG.EVENT_DATE + ' • ' + CONFIG.EVENT_TIME + '</div>' +
            '<div><strong>Venue:</strong> ' + CONFIG.EVENT_VENUE + '</div>' +
          '</div>' +

          '<!-- QR Pass Centerpiece -->' +
          '<div style="text-align: center; margin-bottom: 20px;">' +
            '<div style="background: #ffffff; padding: 14px; border-radius: 2px; display: inline-block; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">' +
              '<img src="' + (qrBlob ? 'cid:qrInline' : qrUrl) + '" alt="QR Pass" style="width: 180px; height: 180px; display: block; margin: 0 auto;" />' +
              '<div style="font-family: monospace; font-size: 16px; font-weight: bold; color: #6d28d9; margin-top: 8px; letter-spacing: 1px;">' + passId + '</div>' +
            '</div>' +
            '<div style="font-size: 12px; color: #64748b; margin-top: 8px;">Present this QR code at the admission gate</div>' +
          '</div>' +

          '<!-- Attendee Information -->' +
          '<div style="background: #f8fafc; border-radius: 2px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 20px;">' +
            '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">' +
              '<tr>' +
                '<td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 40%;">ATTENDEE NAME</td>' +
                '<td style="padding: 6px 0; color: #0f172a; font-weight: 700; text-align: right;">' + name.toUpperCase() + '</td>' +
              '</tr>' +
              (rollNo ? 
              '<tr>' +
                '<td style="padding: 6px 0; color: #64748b; font-weight: 600;">ROLL NUMBER</td>' +
                '<td style="padding: 6px 0; color: #6d28d9; font-weight: 700; font-family: monospace; text-align: right;">' + rollNo + '</td>' +
              '</tr>' : '') +
              (amount ? 
              '<tr>' +
                '<td style="padding: 6px 0; color: #64748b; font-weight: 600;">AMOUNT PAID</td>' +
                '<td style="padding: 6px 0; color: #059669; font-weight: 700; text-align: right;">' + CONFIG.CURRENCY_SYMBOL + amount + '</td>' +
              '</tr>' : '') +
            '</table>' +
          '</div>' +

          '<div style="font-size: 12px; color: #64748b; text-align: center; line-height: 1.4;">' +
            'This credential is tied to your registration and is strictly valid for single gate check-in.' +
          '</div>' +
        '</div>' +

        '<div style="background: #f8fafc; padding: 14px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">' +
          'Department of Computer Science & IT • Event Operations Support' +
        '</div>' +
      '</div>';

    var mailOptions = {
      to: email,
      subject: subject,
      htmlBody: htmlBody
    };

    if (qrBlob) {
      mailOptions.attachments = [qrBlob];
      mailOptions.inlineImages = {
        qrInline: qrBlob
      };
    }

    MailApp.sendEmail(mailOptions);
    return true;
  } catch (err) {
    Logger.log('Error sending email: ' + err);
    return false;
  }
}

function findRowByPassId(sheet, passId) {
  var data = sheet.getDataRange().getValues();
  var normalizedSearch = String(passId).toUpperCase().trim();
  
  for (var i = 1; i < data.length; i++) {
    var cellId = String(data[i][0] || '').toUpperCase().trim();
    if (cellId === normalizedSearch) {
      return {
        rowIndex: i + 1,
        data: data[i]
      };
    }
  }
  return null;
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    setupSheet();
  }

  return sheet;
}

/**
 * High-End Corporate Google Sheet Styler & Header Builder
 */
function prettifySheet() {
  var sheet = getOrCreateSheet();
  var headers = [
    'Pass ID',
    'Attendee Name',
    'Roll Number',
    'Amount (PKR)',
    'Email Address',
    'WhatsApp Contact',
    'Admission Status',
    'Registration Time',
    'Gate Check-in Time'
  ];

  // Freeze top row
  sheet.setFrozenRows(1);

  // Set & Style Header Row
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4c1d95'); // Royal Corporate Deep Purple
  headerRange.setFontColor('#ffffff');
  headerRange.setFontFamily('Inter');
  headerRange.setFontSize(11);
  headerRange.setVerticalAlignment('middle');
  headerRange.setHorizontalAlignment('center');
  sheet.setRowHeight(1, 38);

  // Generous column widths for clean readability
  var colWidths = [140, 200, 140, 130, 240, 160, 130, 180, 180];
  for (var c = 0; c < colWidths.length; c++) {
    sheet.setColumnWidth(c + 1, colWidths[c]);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    dataRange.setFontFamily('Inter');
    dataRange.setFontSize(10);
    dataRange.setVerticalAlignment('middle');

    // Column Alignments & Number Formats
    sheet.getRange(2, 1, lastRow - 1, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#6d28d9'); // Pass ID
    sheet.getRange(2, 2, lastRow - 1, 1).setHorizontalAlignment('left').setFontWeight('bold').setFontColor('#0f172a');   // Name
    sheet.getRange(2, 3, lastRow - 1, 1).setHorizontalAlignment('center').setFontColor('#4c1d95');                       // Roll No
    sheet.getRange(2, 4, lastRow - 1, 1).setHorizontalAlignment('right').setNumberFormat('#,##0 "PKR"').setFontWeight('bold').setFontColor('#059669'); // Amount
    sheet.getRange(2, 5, lastRow - 1, 1).setHorizontalAlignment('left').setFontColor('#334155');                        // Email
    sheet.getRange(2, 6, lastRow - 1, 1).setHorizontalAlignment('center').setFontColor('#334155');                      // WhatsApp
    sheet.getRange(2, 7, lastRow - 1, 1).setHorizontalAlignment('center').setFontWeight('bold');                         // Status
    sheet.getRange(2, 8, lastRow - 1, 2).setHorizontalAlignment('center').setFontColor('#64748b');                      // Timestamps

    // Set uniform row heights for data rows
    for (var r = 2; r <= lastRow; r++) {
      sheet.setRowHeight(r, 30);
    }
  }

  // Clear existing and set smart conditional formatting for Status column (G)
  sheet.clearConditionalFormatRules();
  var statusRange = sheet.getRange('G2:G' + Math.max(2, lastRow));
  
  var usedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('used')
    .setBackground('#d1fae5')
    .setFontColor('#065f46')
    .setBold(true)
    .setRanges([statusRange])
    .build();

  var unusedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('unused')
    .setBackground('#fef3c7')
    .setFontColor('#92400e')
    .setBold(true)
    .setRanges([statusRange])
    .build();

  sheet.setConditionalFormatRules([usedRule, unusedRule]);
}

function formatSingleDataRow(sheet, rowIdx) {
  try {
    sheet.setRowHeight(rowIdx, 30);
    sheet.getRange(rowIdx, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#6d28d9');
    sheet.getRange(rowIdx, 2).setHorizontalAlignment('left').setFontWeight('bold').setFontColor('#0f172a');
    sheet.getRange(rowIdx, 3).setHorizontalAlignment('center').setFontColor('#4c1d95');
    sheet.getRange(rowIdx, 4).setHorizontalAlignment('right').setNumberFormat('#,##0 "PKR"').setFontWeight('bold').setFontColor('#059669');
    sheet.getRange(rowIdx, 5).setHorizontalAlignment('left').setFontColor('#334155');
    sheet.getRange(rowIdx, 6).setHorizontalAlignment('center').setFontColor('#334155');
    sheet.getRange(rowIdx, 7).setHorizontalAlignment('center').setFontWeight('bold');
    sheet.getRange(rowIdx, 8, 1, 2).setHorizontalAlignment('center').setFontColor('#64748b');
  } catch (e) {
    Logger.log('Row formatting error: ' + e);
  }
}

/**
 * Repairs previously shifted/misaligned rows and applies high-end styling
 */
function repairAndFormatSheet() {
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    prettifySheet();
    return;
  }

  var rawData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var repairedRows = [];

  for (var i = 0; i < rawData.length; i++) {
    var row = rawData[i];
    var passId = String(row[0] || '').trim();
    if (!passId) continue;

    var name = String(row[1] || '').trim();
    var rollNo = '';
    var amount = 2500;
    var email = '';
    var whatsapp = '';
    var status = 'unused';
    var createdAt = '';
    var scannedAt = '';

    // Check if this is a row created with the 9-column format
    if (String(row[2]).includes('BSCS') || String(row[2]).includes('CSIT') || String(row[2]).length < 15 && isNaN(Number(row[2]))) {
      rollNo = String(row[2] || '').trim();
      amount = Number(row[3]) || 2500;
      email = String(row[4] || '').trim();
      whatsapp = String(row[5] || '').trim();
      status = String(row[6] || 'unused').toLowerCase().trim();
      createdAt = row[7] || '';
      scannedAt = row[8] || '';
    } else {
      // Legacy 7-column row: [Pass ID, Name, Email, WhatsApp, Status, CreatedAt, ScannedAt, Notes]
      email = String(row[2] || '').trim();
      whatsapp = String(row[3] || '').trim();
      status = String(row[4] || 'unused').toLowerCase().trim();
      createdAt = row[5] || '';
      scannedAt = row[6] || '';
      rollNo = 'CSIT-2026';
      amount = 2500;
    }

    if (status !== 'used' && status !== 'unused') {
      status = 'unused';
    }

    repairedRows.push([
      passId,
      name,
      rollNo,
      amount,
      email,
      whatsapp,
      status,
      createdAt,
      scannedAt
    ]);
  }

  // Clear sheet and rewrite with repaired structure
  sheet.clear();
  sheet.clearConditionalFormatRules();

  if (repairedRows.length > 0) {
    sheet.getRange(2, 1, repairedRows.length, 9).setValues(repairedRows);
  }

  prettifySheet();
}

function setupSheet() {
  var sheet = getOrCreateSheet();
  sheet.clear();
  prettifySheet();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
