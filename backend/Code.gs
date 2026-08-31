/**
 * =========================================================================
 * CSIT PRESENTS: THE LAST SOIREE / WELCOME PARTY 2026
 * EVENT QR PASS GENERATION & SCANNING API
 * =========================================================================
 * 
 * Google Apps Script Web App acting as a JSON API for Google Sheets.
 * Handles:
 *  1. generatePass: Creates a unique pass, logs in Sheet, sends QR email & returns WhatsApp link.
 *  2. checkAndScanPass: Real-time scan validation with LockService to prevent race conditions.
 *  3. getStats: Summary counts and recent passes for dashboard overview.
 *  4. getPasses: Search and fetch attendee pass list.
 */

var CONFIG = {
  DEFAULT_ADMIN_CODE: 'FRESHIE2026',
  SHEET_NAME: 'Attendees',
  EVENT_NAME: 'The Last Soiree - Annual Dinner',
  PRESENTER: 'CSIT JUNIORS PRESENTS',
  EVENT_TAGLINE: 'AN EVENING OF CELEBRATION | CONNECTION | LEGACY',
  EVENT_DATE: '16 MAY 2026',
  EVENT_TIME: '07:00 PM ONWARDS',
  EVENT_VENUE: 'Grand Arena, Main Campus',
  ORGANIZER_NAME: 'CSIT Organizing Team',
  ORGANIZER_CONTACT: '+1 (555) 019-2834'
};

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'ping';

    if (action === 'ping') {
      return jsonResponse({
        success: true,
        message: 'CSIT Event Pass API is online!',
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'getStats') {
      var adminCode = params.adminCode || '';
      if (!validateAdminCode(adminCode)) {
        return jsonResponse({ success: false, error: 'Unauthorized: Invalid Admin Code' });
      }
      return jsonResponse(getStatsData());
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
        if (!validateAdminCode(requestData.adminCode)) {
          return jsonResponse({ success: false, error: 'Unauthorized: Invalid Admin Code' });
        }
        return jsonResponse(getStatsData());

      case 'getPasses':
        if (!validateAdminCode(requestData.adminCode)) {
          return jsonResponse({ success: false, error: 'Unauthorized: Invalid Admin Code' });
        }
        return jsonResponse(handleGetPasses(requestData));

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
  if (!providedCode) return false;
  var scriptPropCode = PropertiesService.getScriptProperties().getProperty('ADMIN_CODE');
  var expectedCode = scriptPropCode || CONFIG.DEFAULT_ADMIN_CODE;
  return String(providedCode).trim() === String(expectedCode).trim();
}

/**
 * Generates formatted Pass ID matching the theme (e.g. #LSAD26-042 or #CSIT26-042)
 */
function generateUniquePassId(sheet) {
  var count = Math.max(1, sheet.getLastRow());
  var paddedNum = ('000' + count).slice(-3);
  var candidateId = '#LSAD26-' + paddedNum;

  // Check if exists
  if (!findRowByPassId(sheet, candidateId)) {
    return candidateId;
  }

  // Fallback random suffix
  var randomSuffix = Math.floor(100 + Math.random() * 900);
  return '#LSAD26-' + randomSuffix;
}

function getQrCodeUrl(passId) {
  var encodedData = encodeURIComponent(passId);
  return 'https://quickchart.io/qr?text=' + encodedData + '&size=400&ecLevel=H&margin=2';
}

function createWhatsAppLink(phoneNumber, name, rollNo, passId) {
  if (!phoneNumber) return '';
  var cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
  
  var message = 
    '✨ *' + CONFIG.PRESENTER + '*\n' +
    '🌟 *' + CONFIG.EVENT_NAME + '*\n\n' +
    '🎉 *Hello ' + name + '!*\n' +
    (rollNo ? '🎓 *Roll No:* `' + rollNo + '`\n' : '') +
    '🎫 *Pass ID:* `' + passId + '`\n\n' +
    '📅 *Date:* ' + CONFIG.EVENT_DATE + '\n' +
    '⏰ *Time:* ' + CONFIG.EVENT_TIME + '\n' +
    '📍 *Venue:* ' + CONFIG.EVENT_VENUE + '\n\n' +
    '⚠️ *Important:* Please present your official QR entry pass attached in this chat at the entrance. Each pass is strictly valid for 1 entry.\n\n' +
    '✨ _' + CONFIG.EVENT_TAGLINE + '_ 🚀';

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
  var batch = (data.batch || '').trim();
  var email = (data.email || '').trim();
  var whatsapp = (data.whatsapp || '').trim();
  var category = (data.category || 'Standard Entry').trim();
  var notes = (data.notes || '').trim();

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

    // Schema: [Pass ID, Name, Roll No, Batch, Email, WhatsApp, Category, Status, Created Timestamp, Scanned-at Timestamp, Notes]
    sheet.appendRow([
      passId,
      name,
      rollNo,
      batch,
      email,
      whatsapp,
      category,
      'unused',
      nowIso,
      '',
      notes
    ]);

    var emailSent = false;
    var emailError = null;
    if (email) {
      try {
        emailSent = sendPassEmail(name, rollNo, batch, category, email, passId, qrUrl);
      } catch (e) {
        emailError = e.toString();
      }
    }

    var waLink = createWhatsAppLink(whatsapp, name, rollNo, passId);

    return {
      success: true,
      passId: passId,
      name: name,
      rollNo: rollNo,
      batch: batch,
      category: category,
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
        message: 'Pass ID not found in system.'
      };
    }

    var rowIdx = match.rowIndex;
    var rowData = match.data;
    
    // Status is in column index 8 (1-based sheet is 8)
    var currentStatus = String(rowData[7] || '').toLowerCase().trim();
    var name = rowData[1] || 'Guest';
    var rollNo = rowData[2] || '';
    var batch = rowData[3] || '';
    var previousScanTimestamp = rowData[9] || '';

    if (currentStatus === 'used') {
      return {
        success: true,
        result: 'already_used',
        passId: searchId,
        name: name,
        rollNo: rollNo,
        batch: batch,
        scannedAt: previousScanTimestamp,
        message: 'This pass has already been used!'
      };
    }

    var scanTimeIso = new Date().toISOString();
    sheet.getRange(rowIdx, 8).setValue('used');
    sheet.getRange(rowIdx, 10).setValue(scanTimeIso);
    SpreadsheetApp.flush();

    return {
      success: true,
      result: 'valid',
      passId: searchId,
      name: name,
      rollNo: rollNo,
      batch: batch,
      scannedAt: scanTimeIso,
      message: 'Entry Approved! Welcome ' + name + '!'
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
      scannedPercentage: 0,
      recentPasses: []
    };
  }

  var total = 0;
  var scanned = 0;
  var unused = 0;
  var recent = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var passId = row[0];
    if (!passId) continue;
    
    total++;
    var status = String(row[7] || '').toLowerCase().trim();
    if (status === 'used') {
      scanned++;
    } else {
      unused++;
    }

    recent.push({
      passId: passId,
      name: row[1] || '',
      rollNo: row[2] || '',
      batch: row[3] || '',
      email: row[4] || '',
      whatsapp: row[5] || '',
      category: row[6] || '',
      status: status || 'unused',
      createdAt: row[8] || '',
      scannedAt: row[9] || '',
      notes: row[10] || ''
    });
  }

  recent.reverse();

  return {
    success: true,
    totalPasses: total,
    scannedPasses: scanned,
    unusedPasses: unused,
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
    passes: filtered
  };
}

function sendPassEmail(name, rollNo, batch, category, email, passId, qrUrl) {
  try {
    var qrBlob;
    try {
      var response = UrlFetchApp.fetch(qrUrl);
      qrBlob = response.getBlob().setName('Pass_' + passId.replace('#', '') + '.png');
    } catch (fetchErr) {
      Logger.log('Could not fetch QR blob: ' + fetchErr);
    }

    var subject = '🎫 Official Entry Pass: ' + CONFIG.EVENT_NAME + ' [' + passId + ']';

    var htmlBody = 
      '<div style="font-family: \'Cinzel\', \'Georgia\', \'Segoe UI\', serif; max-width: 500px; margin: 0 auto; background: #030714; color: #f0f2f5; border-radius: 20px; overflow: hidden; border: 2px solid #3b82f6; box-shadow: 0 15px 35px rgba(0,0,0,0.8);">' +
        
        '<!-- Royal Header -->' +
        '<div style="background: radial-gradient(circle, #1d4ed8 0%, #030714 100%); padding: 28px 20px; text-align: center; border-bottom: 1px solid rgba(147, 197, 253, 0.3);">' +
          '<div style="font-size: 11px; letter-spacing: 4px; color: #93c5fd; text-transform: uppercase; margin-bottom: 4px;">' + CONFIG.PRESENTER + '</div>' +
          '<h1 style="margin: 0; color: #ffffff; font-size: 26px; font-style: italic; font-weight: bold; letter-spacing: 1px;">' + CONFIG.EVENT_NAME + '</h1>' +
          '<div style="font-size: 11px; letter-spacing: 4px; color: #60a5fa; text-transform: uppercase; margin-top: 4px;">ANNUAL DINNER • ENTRY PASS</div>' +
        '</div>' +

        '<div style="padding: 24px 20px; text-align: center;">' +
          '<div style="background: rgba(13, 27, 62, 0.8); border: 1px solid rgba(147, 197, 253, 0.3); border-radius: 12px; padding: 10px; margin-bottom: 20px; display: inline-block; width: 85%;">' +
            '<span style="font-size: 13px; color: #93c5fd; letter-spacing: 2px;">📅 <strong>' + CONFIG.EVENT_DATE + '</strong> &nbsp;|&nbsp; ⏰ <strong>' + CONFIG.EVENT_TIME + '</strong></span>' +
          '</div>' +

          '<!-- QR Box -->' +
          '<div style="background: #ffffff; padding: 14px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.5); margin-bottom: 16px;">' +
            '<img src="' + (qrBlob ? 'cid:qrInline' : qrUrl) + '" alt="QR Pass" style="width: 200px; height: 200px; display: block; margin: 0 auto;" />' +
            '<div style="font-family: monospace; font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 8px; letter-spacing: 2px;">' + passId + '</div>' +
          '</div>' +

          '<!-- Attendee Details -->' +
          '<div style="background: #070d1e; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 20px; border: 1px solid rgba(147, 197, 253, 0.2);">' +
            '<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">' +
              '<span style="color: #93c5fd; letter-spacing: 1px;">NAME:</span>' +
              '<strong style="color: #ffffff; text-transform: uppercase;">' + name + '</strong>' +
            '</div>' +
            (rollNo ? 
            '<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">' +
              '<span style="color: #93c5fd; letter-spacing: 1px;">ROLL NO:</span>' +
              '<strong style="color: #93c5fd; font-family: monospace;">' + rollNo + '</strong>' +
            '</div>' : '') +
            (batch ? 
            '<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">' +
              '<span style="color: #93c5fd; letter-spacing: 1px;">BATCH/DEPT:</span>' +
              '<strong style="color: #cbd5e1;">' + batch + '</strong>' +
            '</div>' : '') +
            '<div style="display: flex; justify-content: space-between; font-size: 14px;">' +
              '<span style="color: #93c5fd; letter-spacing: 1px;">VENUE:</span>' +
              '<strong style="color: #cbd5e1;">' + CONFIG.EVENT_VENUE + '</strong>' +
            '</div>' +
          '</div>' +

          '<div style="font-size: 11px; color: #60a5fa; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">' +
            CONFIG.EVENT_TAGLINE +
          '</div>' +
          '<div style="font-size: 11px; color: #64748b;">' +
            '⚡ Strictly valid for 1 entry. Please present this QR code at the entrance.' +
          '</div>' +
        '</div>' +

        '<div style="background: #02040a; padding: 12px; text-align: center; font-size: 11px; color: #475569; border-top: 1px solid rgba(147, 197, 253, 0.15);">' +
          'Questions? Contact organizer at ' + CONFIG.ORGANIZER_CONTACT +
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
    var headers = [
      'Pass ID',
      'Name',
      'Roll No',
      'Batch',
      'Email',
      'WhatsApp',
      'Category',
      'Status',
      'Created Timestamp',
      'Scanned-at Timestamp',
      'Notes'
    ];
    sheet.appendRow(headers);
    
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0d1630');
    headerRange.setFontColor('#93c5fd');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function initialSetup() {
  var sheet = getOrCreateSheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('CSIT Event sheet initialized successfully!', 'Setup Complete', 5);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
