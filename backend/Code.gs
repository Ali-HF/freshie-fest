/**
 * =========================================================================
 * FRESHIE FEST 2026 - EVENT QR PASS GENERATION & SCANNING API
 * =========================================================================
 * 
 * Google Apps Script Web App acting as a JSON API for Google Sheets.
 * Handles:
 *  1. generatePass: Creates a unique pass, logs in Sheet, sends QR email & returns WhatsApp link.
 *  2. checkAndScanPass: Real-time scan validation with LockService to prevent race conditions.
 *  3. getStats: Summary counts and recent passes for dashboard overview.
 *  4. getPasses: Search and fetch attendee pass list.
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open your Google Sheet.
 * 2. Extensions > Apps Script. Paste this entire file into Code.gs.
 * 3. Run initialSetup() once to create sheet headers.
 * 4. Deploy > New deployment > Select type: "Web app".
 *    - Description: "Freshie Fest Pass API"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (allows static web app to call it)
 * 5. Copy the Web App URL and paste it into your web app config/settings!
 */

// Configuration Defaults (can also be set in Script Properties: File > Project Properties > Script Properties)
var CONFIG = {
  DEFAULT_ADMIN_CODE: 'FRESHIE2026', // Change this to your secure secret code
  SHEET_NAME: 'Attendees',
  EVENT_NAME: 'Freshie Fest 2026',
  EVENT_DATE: 'Saturday, October 24, 2026',
  EVENT_VENUE: 'Grand Arena, Main Campus',
  ORGANIZER_NAME: 'Freshie Fest Organizing Team',
  ORGANIZER_CONTACT: '+1 (555) 019-2834'
};

/**
 * Handles HTTP GET requests (useful for testing health and simple lookups)
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'ping';

    if (action === 'ping') {
      return jsonResponse({
        success: true,
        message: 'Freshie Fest API is online!',
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

/**
 * Handles HTTP POST requests (Primary JSON API endpoint)
 */
function doPost(e) {
  try {
    var requestData = {};
    
    // Parse request payload safely (handles both text/plain JSON and standard JSON POST)
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

/**
 * Validates admin code against Script Properties or fallback constant
 */
function validateAdminCode(providedCode) {
  if (!providedCode) return false;
  var scriptPropCode = PropertiesService.getScriptProperties().getProperty('ADMIN_CODE');
  var expectedCode = scriptPropCode || CONFIG.DEFAULT_ADMIN_CODE;
  return String(providedCode).trim() === String(expectedCode).trim();
}

/**
 * Generates a unique, non-sequential, unguessable Pass ID
 * Format: FF-XXXX-XXXX (e.g. FF-7K9M-2R8Q)
 */
function generateUniquePassId(sheet) {
  var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude ambiguous chars like 0/O, 1/I
  var maxAttempts = 10;
  
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    var part1 = '';
    var part2 = '';
    for (var i = 0; i < 4; i++) {
      part1 += chars.charAt(Math.floor(Math.random() * chars.length));
      part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    var candidateId = 'FF-' + part1 + '-' + part2;
    
    // Check if ID already exists in sheet
    if (!findRowByPassId(sheet, candidateId)) {
      return candidateId;
    }
  }
  
  // Fallback to timestamp hash
  return 'FF-' + Utilities.getUuid().substring(0, 8).toUpperCase();
}

/**
 * Generates reliable QR Code URL
 */
function getQrCodeUrl(passId) {
  // Uses QuickChart QR API for crisp, high-resolution QR with high error correction
  var encodedData = encodeURIComponent(passId);
  return 'https://quickchart.io/qr?text=' + encodedData + '&size=400&ecLevel=H&margin=2';
}

/**
 * Creates pre-filled WhatsApp deep link
 */
function createWhatsAppLink(phoneNumber, name, passId) {
  if (!phoneNumber) return '';
  
  // Clean phone number: remove spaces, dashes, parentheses, plus
  var cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
  
  var message = 
    '🎉 *Hello ' + name + '!*\n\n' +
    'Your entry pass for *' + CONFIG.EVENT_NAME + '* is confirmed!\n\n' +
    '🎫 *Pass ID:* `' + passId + '`\n' +
    '📅 *Date:* ' + CONFIG.EVENT_DATE + '\n' +
    '📍 *Venue:* ' + CONFIG.EVENT_VENUE + '\n\n' +
    '⚠️ *Important:* Please present your QR code pass attached in this chat at the door for entry. Each QR pass is valid for 1 entry only.\n\n' +
    'See you there! 🚀';

  return 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(message);
}

/**
 * Handler: Generate a new Pass
 */
function handleGeneratePass(data) {
  // 1. Validate Admin Code
  if (!validateAdminCode(data.adminCode)) {
    return { success: false, error: 'Unauthorized: Invalid Admin Code' };
  }

  // 2. Validate Name
  var name = (data.name || '').trim();
  if (!name) {
    return { success: false, error: 'Attendee name is required.' };
  }

  var email = (data.email || '').trim();
  var whatsapp = (data.whatsapp || '').trim();
  var notes = (data.notes || '').trim();

  // 3. Acquire Script Lock to ensure atomic write
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

    // Row Schema: [Pass ID, Name, Email, WhatsApp, Status, Created Timestamp, Scanned-at Timestamp, Notes]
    sheet.appendRow([
      passId,
      name,
      email,
      whatsapp,
      'unused',
      nowIso,
      '',
      notes
    ]);

    // 4. Send Email if provided
    var emailSent = false;
    var emailError = null;
    if (email) {
      try {
        emailSent = sendPassEmail(name, email, passId, qrUrl);
      } catch (e) {
        emailError = e.toString();
      }
    }

    // 5. Generate WhatsApp deep link
    var waLink = createWhatsAppLink(whatsapp, name, passId);

    return {
      success: true,
      passId: passId,
      name: name,
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

/**
 * Handler: Check and Scan Pass (Door Staff Scanner)
 * Returns status: 'valid', 'already_used', or 'invalid'
 */
function handleCheckAndScanPass(data) {
  var rawPassId = (data.passId || '').trim();
  if (!rawPassId) {
    return { success: false, result: 'invalid', message: 'No Pass ID provided.' };
  }

  // Sanitize Pass ID (case insensitive matching)
  var searchId = rawPassId.toUpperCase();

  // Acquire lock to handle simultaneous scans safely
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
    var currentStatus = String(rowData[4] || '').toLowerCase().trim();
    var name = rowData[1] || 'Guest';
    var createdTimestamp = rowData[5] || '';
    var previousScanTimestamp = rowData[6] || '';

    // If ALREADY USED
    if (currentStatus === 'used') {
      return {
        success: true,
        result: 'already_used',
        passId: searchId,
        name: name,
        scannedAt: previousScanTimestamp,
        message: 'This pass has already been used!'
      };
    }

    // If UNUSED -> Mark as USED
    var scanTimeIso = new Date().toISOString();
    
    // Column E is Status (index 5 in 1-based sheet), Column G is Scanned Timestamp (index 7)
    sheet.getRange(rowIdx, 5).setValue('used');
    sheet.getRange(rowIdx, 7).setValue(scanTimeIso);

    // Flush spreadsheet changes immediately
    SpreadsheetApp.flush();

    return {
      success: true,
      result: 'valid',
      passId: searchId,
      name: name,
      scannedAt: scanTimeIso,
      message: 'Entry Approved! Welcome ' + name + '!'
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Handler: Fetch Stats for Dashboard
 */
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
    var status = String(row[4] || '').toLowerCase().trim();
    if (status === 'used') {
      scanned++;
    } else {
      unused++;
    }

    // Capture recent entries (up to last 50)
    recent.push({
      passId: passId,
      name: row[1] || '',
      email: row[2] || '',
      whatsapp: row[3] || '',
      status: status || 'unused',
      createdAt: row[5] || '',
      scannedAt: row[6] || '',
      notes: row[7] || ''
    });
  }

  // Sort recent passes descending by created date
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

/**
 * Handler: Search and List Passes
 */
function handleGetPasses(data) {
  var stats = getStatsData();
  var query = (data.query || '').toLowerCase().trim();

  if (!query) {
    return stats;
  }

  var filtered = stats.recentPasses.filter(function(item) {
    return item.name.toLowerCase().indexOf(query) !== -1 ||
           item.passId.toLowerCase().indexOf(query) !== -1 ||
           item.email.toLowerCase().indexOf(query) !== -1 ||
           item.whatsapp.indexOf(query) !== -1;
  });

  return {
    success: true,
    totalPasses: stats.totalPasses,
    scannedPasses: stats.scannedPasses,
    unusedPasses: stats.unusedPasses,
    passes: filtered
  };
}

/**
 * Sends formatted HTML email with inline/attached QR code
 */
function sendPassEmail(name, email, passId, qrUrl) {
  try {
    // Fetch QR code image blob
    var qrBlob;
    try {
      var response = UrlFetchApp.fetch(qrUrl);
      qrBlob = response.getBlob().setName('FreshieFest_Pass_' + passId + '.png');
    } catch (fetchErr) {
      Logger.log('Could not fetch QR blob: ' + fetchErr);
    }

    var subject = '🎫 Your Entry Pass for ' + CONFIG.EVENT_NAME + ' [' + passId + ']';

    var htmlBody = 
      '<div style="font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; background: #0f111a; color: #f0f2f5; border-radius: 16px; overflow: hidden; border: 1px solid #2d3748; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">' +
        '<div style="background: linear-gradient(135deg, #7928ca 0%, #ff0080 100%); padding: 32px 24px; text-align: center;">' +
          '<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">' + CONFIG.EVENT_NAME + '</h1>' +
          '<p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Official Entry Pass</p>' +
        '</div>' +
        '<div style="padding: 28px 24px; text-align: center;">' +
          '<p style="font-size: 16px; margin: 0 0 16px 0; color: #e2e8f0;">Hello <strong>' + name + '</strong>,</p>' +
          '<p style="font-size: 14px; line-height: 1.5; color: #a0aec0; margin-bottom: 24px;">Your payment has been verified and your entry pass is confirmed! Present this QR code at the entrance.</p>' +
          
          '<div style="background: #ffffff; padding: 20px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.3); margin-bottom: 20px;">' +
            '<img src="' + (qrBlob ? 'cid:qrInline' : qrUrl) + '" alt="QR Pass" style="width: 220px; height: 220px; display: block; margin: 0 auto;" />' +
            '<div style="font-family: monospace; font-size: 16px; font-weight: bold; color: #1a202c; margin-top: 12px; letter-spacing: 2px;">' + passId + '</div>' +
          '</div>' +

          '<div style="background: #1a202c; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 24px; border: 1px solid #2d3748;">' +
            '<div style="font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Event Details</div>' +
            '<div style="font-size: 14px; color: #edf2f7; margin-bottom: 8px;">📅 <strong>Date:</strong> ' + CONFIG.EVENT_DATE + '</div>' +
            '<div style="font-size: 14px; color: #edf2f7;">📍 <strong>Venue:</strong> ' + CONFIG.EVENT_VENUE + '</div>' +
          '</div>' +

          '<div style="font-size: 12px; color: #718096; line-height: 1.5;">' +
            '⚡ <em>Each QR code is strictly valid for one entry only. Do not share this pass.</em>' +
          '</div>' +
        '</div>' +
        '<div style="background: #090a0f; padding: 16px; text-align: center; font-size: 12px; color: #4a5568; border-top: 1px solid #1a202c;">' +
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

/**
 * Helper: Find row index and data by Pass ID
 */
function findRowByPassId(sheet, passId) {
  var data = sheet.getDataRange().getValues();
  var normalizedSearch = String(passId).toUpperCase().trim();
  
  for (var i = 1; i < data.length; i++) {
    var cellId = String(data[i][0] || '').toUpperCase().trim();
    if (cellId === normalizedSearch) {
      return {
        rowIndex: i + 1, // 1-based index in Sheet
        data: data[i]
      };
    }
  }
  return null;
}

/**
 * Helper: Get or Create Attendees sheet with standard headers
 */
function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  // If new or empty, setup column headers
  if (sheet.getLastRow() === 0) {
    var headers = [
      'Pass ID',
      'Name',
      'Email',
      'WhatsApp',
      'Status',
      'Created Timestamp',
      'Scanned-at Timestamp',
      'Notes'
    ];
    sheet.appendRow(headers);
    
    // Style headers
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a202c');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * One-time setup utility to run manually from Apps Script Editor
 */
function initialSetup() {
  var sheet = getOrCreateSheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('Freshie Fest sheet initialized successfully!', 'Setup Complete', 5);
}

/**
 * JSON Response Helper with CORS headers
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
