/**
 * 민준의 기록 - Google Sheets 기반 회원 API (MVP)
 *
 * 웹 앱의 첫 요청에서 Users/Sessions 시트와 인증 비밀값을 자동 초기화합니다.
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1lHyPD4zLCcZ81rgj_h1tSdtcL_zFgioC_ChUH-s10xQ',
  USERS_SHEET: 'Users',
  SESSIONS_SHEET: 'Sessions',
  SESSION_TTL_MS: 24 * 60 * 60 * 1000,
  LOGIN_LIMIT: 5,
  LOGIN_WINDOW_SECONDS: 10 * 60,
});

const USER_HEADERS = [
  'id', 'email', 'name', 'nickname', 'passwordHash', 'salt',
  'status', 'createdAt', 'lastLoginAt',
];

const SESSION_HEADERS = [
  'tokenHash', 'userId', 'expiresAt', 'createdAt', 'revokedAt',
];

function doGet(e) {
  ensureAuthReady_();
  const action = String((e && e.parameter && e.parameter.action) || 'health');

  if (action === 'health') {
    return json_({ success: true, service: 'auth', timestamp: new Date().toISOString() });
  }

  return json_({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'POST 요청을 사용해 주세요.' });
}

function doPost(e) {
  try {
    ensureAuthReady_();
    const data = requestData_(e);
    const action = String(data.action || '').trim().toLowerCase();

    if (action === 'signup') return signup_(data);
    if (action === 'login') return login_(data);
    if (action === 'session') return session_(data);
    if (action === 'logout') return logout_(data);

    return json_({ success: false, code: 'INVALID_ACTION', message: '지원하지 않는 요청입니다.' });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({
      success: false,
      code: error.code || 'SERVER_ERROR',
      message: error.publicMessage || '요청 처리 중 오류가 발생했습니다.',
    });
  }
}

function signup_(data) {
  const email = normalizeEmail_(data.email);
  const password = String(data.password || '');
  const name = cleanText_(data.name, 40);
  const nickname = cleanText_(data.nickname, 30);

  assertEmail_(email);
  assertPassword_(password);
  if (name.length < 2) fail_('INVALID_NAME', '이름은 2자 이상 입력해 주세요.');
  if (nickname.length < 2) fail_('INVALID_NICKNAME', '닉네임은 2자 이상 입력해 주세요.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = sheet_(CONFIG.USERS_SHEET);
    const users = rowsAsObjects_(sheet);

    if (users.some(function (user) { return normalizeEmail_(user.email) === email; })) {
      fail_('EMAIL_EXISTS', '이미 가입된 이메일입니다.');
    }

    if (users.some(function (user) { return String(user.nickname).toLowerCase() === nickname.toLowerCase(); })) {
      fail_('NICKNAME_EXISTS', '이미 사용 중인 닉네임입니다.');
    }

    const salt = randomToken_();
    const now = new Date();

    sheet.appendRow([
      Utilities.getUuid(),
      email,
      safeCell_(name),
      safeCell_(nickname),
      hashPassword_(password, salt),
      salt,
      'active',
      now,
      '',
    ]);

    return json_({ success: true, message: '회원가입이 완료되었습니다.' });
  } finally {
    lock.releaseLock();
  }
}

function login_(data) {
  const email = normalizeEmail_(data.email);
  const password = String(data.password || '');

  assertEmail_(email);
  if (!password) fail_('INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
  checkLoginRate_(email);

  const sheet = sheet_(CONFIG.USERS_SHEET);
  const users = rowsAsObjects_(sheet);
  const user = users.find(function (item) { return normalizeEmail_(item.email) === email; });

  const valid = user && constantTimeEqual_(
    String(user.passwordHash),
    hashPassword_(password, String(user.salt))
  );

  if (!valid || user.status !== 'active') {
    recordLoginFailure_(email);
    fail_('INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  clearLoginFailures_(email);
  sheet.getRange(user._row, USER_HEADERS.indexOf('lastLoginAt') + 1).setValue(new Date());

  const session = createSession_(String(user.id));
  return json_({
    success: true,
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: publicUser_(user),
  });
}

function session_(data) {
  const token = String(data.token || '');
  if (!token) fail_('UNAUTHORIZED', '로그인이 필요합니다.');

  const sessionSheet = sheet_(CONFIG.SESSIONS_SHEET);
  const tokenHash = hashToken_(token);
  const sessions = rowsAsObjects_(sessionSheet);
  const current = sessions.find(function (item) {
    return constantTimeEqual_(String(item.tokenHash), tokenHash) && !item.revokedAt;
  });

  if (!current || new Date(current.expiresAt).getTime() <= Date.now()) {
    fail_('SESSION_EXPIRED', '로그인 세션이 만료되었습니다.');
  }

  const user = rowsAsObjects_(sheet_(CONFIG.USERS_SHEET)).find(function (item) {
    return String(item.id) === String(current.userId);
  });

  if (!user || user.status !== 'active') fail_('UNAUTHORIZED', '사용자 정보를 확인할 수 없습니다.');
  return json_({ success: true, user: publicUser_(user), expiresAt: new Date(current.expiresAt).toISOString() });
}

function logout_(data) {
  const token = String(data.token || '');
  if (!token) return json_({ success: true, message: '로그아웃되었습니다.' });

  const tokenHash = hashToken_(token);
  const sheet = sheet_(CONFIG.SESSIONS_SHEET);
  const sessions = rowsAsObjects_(sheet);
  const current = sessions.find(function (item) {
    return constantTimeEqual_(String(item.tokenHash), tokenHash) && !item.revokedAt;
  });

  if (current) sheet.getRange(current._row, SESSION_HEADERS.indexOf('revokedAt') + 1).setValue(new Date());
  return json_({ success: true, message: '로그아웃되었습니다.' });
}

function createSession_(userId) {
  const token = randomToken_() + randomToken_();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.SESSION_TTL_MS);

  sheet_(CONFIG.SESSIONS_SHEET).appendRow([
    hashToken_(token), userId, expiresAt, now, '',
  ]);

  return { token: token, expiresAt: expiresAt };
}

function publicUser_(user) {
  return {
    id: String(user.id),
    email: String(user.email),
    name: String(user.name),
    nickname: String(user.nickname),
  };
}

function hashPassword_(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER');
  if (!pepper) fail_('NOT_CONFIGURED', '서버 인증 설정이 완료되지 않았습니다.');
  return base64Url_(Utilities.computeHmacSha256Signature(salt + ':' + password, pepper));
}

function hashToken_(token) {
  const pepper = PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER');
  if (!pepper) fail_('NOT_CONFIGURED', '서버 인증 설정이 완료되지 않았습니다.');
  return base64Url_(Utilities.computeHmacSha256Signature('session:' + token, pepper));
}

function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function checkLoginRate_(email) {
  const count = Number(CacheService.getScriptCache().get(loginKey_(email)) || 0);
  if (count >= CONFIG.LOGIN_LIMIT) fail_('TOO_MANY_ATTEMPTS', '로그인 시도가 너무 많습니다. 10분 뒤 다시 시도해 주세요.');
}

function recordLoginFailure_(email) {
  const cache = CacheService.getScriptCache();
  const key = loginKey_(email);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), CONFIG.LOGIN_WINDOW_SECONDS);
}

function clearLoginFailures_(email) {
  CacheService.getScriptCache().remove(loginKey_(email));
}

function loginKey_(email) {
  return 'login:' + base64Url_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)).slice(0, 24);
}

function requestData_(e) {
  if (!e) return {};
  const type = String((e.postData && e.postData.type) || '').toLowerCase();
  if (type.indexOf('application/json') !== -1) {
    try { return JSON.parse(e.postData.contents || '{}'); }
    catch (error) { fail_('INVALID_JSON', '요청 JSON 형식이 올바르지 않습니다.'); }
  }
  return e.parameter || {};
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function assertEmail_(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    fail_('INVALID_EMAIL', '올바른 이메일 주소를 입력해 주세요.');
  }
}

function assertPassword_(password) {
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    fail_('WEAK_PASSWORD', '비밀번호는 영문과 숫자를 포함해 10자 이상이어야 합니다.');
  }
}

function cleanText_(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function safeCell_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function base64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function sheet_(name) {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(name);
  if (!sheet) fail_('SHEET_NOT_FOUND', name + ' 시트를 찾을 수 없습니다.');
  return sheet;
}

function rowsAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function (row, index) {
    const item = { _row: index + 2 };
    headers.forEach(function (header, column) { item[header] = row[column]; });
    return item;
  });
}

function fail_(code, publicMessage) {
  const error = new Error(publicMessage);
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/** 선택 사항: 편집기에서 수동 초기화가 필요할 때 실행합니다. */
function setupAuthSheets() {
  ensureAuthReady_();
}

function ensureAuthReady_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    createSheet_(spreadsheet, CONFIG.USERS_SHEET, USER_HEADERS);
    createSheet_(spreadsheet, CONFIG.SESSIONS_SHEET, SESSION_HEADERS);

    if (!properties.getProperty('AUTH_PEPPER')) {
      properties.setProperty('AUTH_PEPPER', randomToken_() + randomToken_());
    }
  } finally {
    lock.releaseLock();
  }
}

function createSheet_(spreadsheet, name, headers) {
  const existing = spreadsheet.getSheetByName(name);
  if (existing && existing.getLastRow() > 0) return existing;
  const sheet = existing || spreadsheet.insertSheet(name);
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#244c3c').setFontColor('#ffffff');
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

/** 선택 사항: 만료 또는 폐기된 지 7일이 지난 세션을 정리합니다. */
function cleanupExpiredSessions() {
  const sheet = sheet_(CONFIG.SESSIONS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (let row = values.length; row >= 2; row -= 1) {
    const expiresAt = new Date(values[row - 1][2]).getTime();
    const revokedAt = values[row - 1][4] ? new Date(values[row - 1][4]).getTime() : 0;
    if (expiresAt < cutoff || (revokedAt && revokedAt < cutoff)) sheet.deleteRow(row);
  }
}
