/* =====================================================
   Общая логика аккаунтов (подключается на всех страницах).
   У сайта нет сервера, поэтому аккаунты хранятся в браузере (localStorage).
   Пароль в открытом виде не хранится: сохраняется SHA-256 с «солью».

   Аккаунт удаляется ТОЛЬКО функцией deleteAccount (по запросу самого
   пользователя, с вводом пароля). Больше ничто на сайте его не стирает:
   • logout() убирает только сессию, не аккаунт;
   • при нехватке места чистится только кэш автопарка, но не аккаунты;
   • браузеру отправляется запрос на «постоянное» хранилище, чтобы он
     не вычищал данные сайта сам.
   ===================================================== */
const Auth = (() => {
  const USERS_KEY   = 'luxorides_users';
  const SESSION_KEY = 'luxorides_session';

  /* Ключи кэша автопарка из script.js (марки, модели, фото, описания). Их можно стирать. */
  const CACHE_KEY = /^(makes|models:|img:|info:)/;
  const pruneCache = () => {
    try { Object.keys(localStorage).filter(k => CACHE_KEY.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  };

  /* Просим браузер не удалять данные сайта самостоятельно (при нехватке места, по давности и т.п.) */
  function keepStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {}
  }
  keepStorage();

  const readUsers = () => {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      // Данные повреждены: сохраняем копию, чтобы новая запись их не затёрла безвозвратно
      try { localStorage.setItem(USERS_KEY + '_broken', raw); } catch (e2) {}
      return [];
    }
  };
  /* Запись в localStorage; при нехватке места освобождаем её за счёт кэша (аккаунты и брони не трогаем) */
  const safeSet = (key, json) => {
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      pruneCache();
      localStorage.setItem(key, json);
    }
  };
  const writeUsers = users => safeSet(USERS_KEY, JSON.stringify(users));

  const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const randomSalt = () => {
    const bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else bytes.forEach((_, i) => bytes[i] = Math.floor(Math.random() * 256));
    return toHex(bytes);
  };

  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + ':' + password);
    if (window.crypto && crypto.subtle) {
      return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
    }
    let h = 5381;                       // запасной вариант, если браузер не даёт crypto.subtle
    data.forEach(byte => { h = ((h << 5) + h + byte) >>> 0; });
    return 'x' + h.toString(16);
  }

  /* ---------- Фильтр нецензурных слов ----------
     Ловит и «обходы»: латинские буквы-двойники (хуй → xуй), растянутые буквы (хууууй),
     разделители (х.у.й, х у й) и звёздочки (бл*дь). Слова ищутся целиком (по корню с началом слова),
     поэтому «хлеб», «оскорбление», «Херсон» и т.п. не блокируются. */
  const Profanity = (() => {
    const LOOK = {a:'а', b:'б', c:'с', e:'е', h:'н', k:'к', m:'м', o:'о', p:'р', t:'т', x:'х', y:'у', '0':'о', '3':'з', '6':'б'};
    const WILD = /[*#$%@]/;
    const FILL = 'аеиоуыюяэaeiouy';
    const RU = [
      /^[а-я]{0,5}ху(?:й|я|е|ил)/,
      /^[а-я]{0,5}пизд/,
      /^бля(?:т?ь)?$/, /^[а-я]{0,3}бляд/, /^[а-я]{0,3}блят[ьи]?$/,
      /^(?:на|по|за|вы|от|до|об|раз|рас|съ|у|с|при|пере|про|под|недо|вз|в|не|о|)(?:ебат|ебан|ебал|ебну|ебуч|ебыч|ебар|ебис|ебок|ебк|ебл[аоуы]|ебон|ебаш|ебут|ебет)/,
      /^еб$/, /^долбоеб/, /^[а-я]{1,6}[оа]еб(?:ок|ки|ы|а|ам|ов)?$/,
      /^сук(?:а|и|е|у|ой|ою|ам|ами|ах|ин[а-я]*)$/, /^сучк(?:а|у|е|ой|ою)$/, /^сучар/,
      /^муд(?:ак|ач|ил|озвон)/,
      /^[а-я]{0,3}говн/, /^гавн/, /^дерьм/, /^[а-я]{0,3}залуп/,
      /^(?:пидор|пидар|педераст)/, /^педик(?:и|а|ов|у|ом|ам)?$/,
      /^шлюх/, /^шалав/,
      /^(?:за|на|вы|по|)дроч(?:ить|ил|ила|ишь|ун|ер)$/,
      /^жоп(?:а|у|е|ы|ой|ою|ам|ах|ами|ник|олиз)?$/,
      /^(?:на|по|за|от|)хер(?:а|у|ом|ня|овый|ово|овина)?$/,
      /^гандон/, /^ублюд/, /^манда(?:вошк[а-я]*)?$/
    ];
    const EN = /^(?:fuck|fck|fuk$|shit|bitch|cunt|whore|slut|ashole|motherfuck|pizd|blyat|blyad|xuy|nahuy|nahui|pohuy|pohui|ebat|ebal|ebany|pidor|pidar|mudak|gandon|zalup|suka$)/;

    const norm = s => String(s).toLowerCase().replace(/ё/g, 'е');

    // варианты слова: звёздочки заменяем буквами (бл*дь → блядь)
    function expand(tok) {
      const n = (tok.match(/[*#$%@]/g) || []).length;
      if (!n) return [tok];
      if (n > 3) return [];
      let list = [tok];
      for (let i = 0; i < n; i++) list = list.flatMap(t => [...FILL].map(c => t.replace(WILD, c)));
      return list;
    }

    function badWord(raw) {
      for (let tok of expand(raw)) {
        tok = tok.replace(/\d+$/, '');
        if (!tok) continue;
        const en = tok.replace(/(.)\1+/g, '$1');
        if (/^[a-z]+$/.test(en) && EN.test(en)) return true;
        const ru = (/[а-я]/.test(tok) ? tok.replace(/[a-z0-9]/g, c => LOOK[c] || c) : tok).replace(/(.)\1+/g, '$1');
        if (RU.some(re => re.test(ru))) return true;
      }
      return false;
    }

    function has(text) {
      const low = norm(text || '');
      if (!low.trim()) return false;
      const words = new Set();
      const A = low.split(/[^a-zа-я0-9*#$%@]+/).filter(Boolean);          // знаки = границы слов
      const B = low.split(/\s+/).map(t => t.replace(/[^a-zа-я0-9*#$%@]/g, '')).filter(Boolean);   // знаки внутри слова убираем: х.у.й
      A.concat(B).forEach(w => words.add(w));
      // буквы через пробел: «х у й»
      let run = '', cnt = 0;
      A.concat(['']).forEach(w => {
        if (w.length === 1 && /[a-zа-я]/.test(w)) { run += w; cnt++; }
        else { if (cnt >= 3) words.add(run); run = ''; cnt = 0; }
      });
      for (const w of words) if (badWord(w)) return true;
      return false;
    }
    return {has};
  })();

  const hasProfanity = text => Profanity.has(text);

  const normEmail = email => String(email).trim().toLowerCase();

  function currentUser() {
    const email = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!email) return null;
    return readUsers().find(u => u.email === email) || null;
  }

  /* Выход: убирается только сессия, аккаунт остаётся в хранилище */
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function startSession(email, remember) {
    logout();
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, email);
    keepStorage();
  }

  /* Возраст по дате рождения (строка YYYY-MM-DD). Некорректная дата → NaN */
  function ageOf(birth) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth || ''));
    if (!m) return NaN;
    const y = +m[1], mo = +m[2], d = +m[3];
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return NaN;
    const now = new Date();
    if (date > now) return NaN;
    let age = now.getFullYear() - y;
    if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) age--;
    return age;
  }
  const MIN_AGE = 18;

  async function register({name, email, phone, birth, password}, remember = true) {
    const users = readUsers();
    email = normEmail(email);
    const age = ageOf(birth);
    if (isNaN(age)) throw new Error('birth');
    if (age < MIN_AGE) throw new Error('underage');
    if (hasProfanity(name)) throw new Error('profanity');
    if (users.some(u => u.email === email)) throw new Error('exists');
    const salt = randomSalt();
    users.push({name: name.trim(), email, phone: phone.trim(), birth, photo: '', salt,
                hash: await hashPassword(password, salt), created: Date.now()});
    writeUsers(users);
    startSession(email, remember);
  }

  /* Сохранение профиля: ФИО, дата рождения, фото (data-URL или '') */
  function updateProfile({name, birth, photo, phone}) {
    const user = currentUser();
    if (!user) throw new Error('auth');
    if (hasProfanity(name)) throw new Error('profanity');
    const users = readUsers();
    const i = users.findIndex(u => u.email === user.email);
    // Дата рождения (и возраст) задаётся один раз: если она уже есть — её не меняем.
    // Новую принимаем только у старых аккаунтов, где даты ещё не было.
    let savedPhone = users[i].phone;
    if (phone !== undefined) {
      if (String(phone).replace(/\D/g, '').length < 10) throw new Error('phone');
      savedPhone = String(phone).trim();
    }
    let savedBirth = users[i].birth;
    if (!savedBirth) {
      const age = ageOf(birth);
      if (isNaN(age)) throw new Error('birth');
      if (age < MIN_AGE) throw new Error('underage');
      savedBirth = birth;
    }
    users[i] = {...users[i], name: name.trim(), phone: savedPhone, birth: savedBirth, photo: photo || ''};
    writeUsers(users);   // если не хватит места даже после очистки кэша — бросит исключение
  }

  /* Единственное место, где аккаунт удаляется: по запросу пользователя, с паролем. */
  async function deleteAccount(password) {
    const user = currentUser();
    if (!user) throw new Error('auth');
    if (user.hash !== await hashPassword(password, user.salt)) throw new Error('invalid');
    writeUsers(readUsers().filter(u => u.email !== user.email));
    // бронирования удаляются вместе с аккаунтом и только вместе с ним
    try { const all = readBookings(); delete all[user.email]; safeSet(BOOKINGS_KEY, JSON.stringify(all)); } catch (e) {}
    logout();
  }

  async function login(email, password, remember = true) {
    email = normEmail(email);
    const user = readUsers().find(u => u.email === email);
    if (!user || user.hash !== await hashPassword(password, user.salt)) throw new Error('invalid');
    startSession(email, remember);
  }

  /* ---------- Бронирования пользователя ---------- */
  // Формат: {email: [{key, name, title, img, date}]}. Хранятся отдельно от аккаунтов,
  // не входят в кэш (его чистка их не касается) и стираются только вместе с аккаунтом.
  const BOOKINGS_KEY = 'luxorides_bookings';
  const readBookings = () => {
    const raw = localStorage.getItem(BOOKINGS_KEY);
    if (!raw) return {};
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) {
      try { localStorage.setItem(BOOKINGS_KEY + '_broken', raw); } catch (e2) {}
      return {};
    }
  };
  // Ключ для сравнения названий: «Audi R8» и «audi  r-8» считаются одной машиной
  const bookingKey = name => String(name).toLowerCase().replace(/[^a-z0-9а-яё]/g, '');

  function getBookings() {
    const user = currentUser();
    return user ? (readBookings()[user.email] || []) : [];
  }

  /* Добавляет бронь текущему пользователю. false — такая машина уже забронирована. */
  function addBooking(car) {
    const user = currentUser();
    if (!user) throw new Error('auth');
    const key = bookingKey(car.name);
    if (!key) return false;
    const all = readBookings(), list = all[user.email] || [];
    if (list.some(b => b.key === key)) return false;
    list.push({key, name: String(car.name), title: car.title ? String(car.title) : '', img: car.img ? String(car.img) : '', date: Date.now()});
    all[user.email] = list;
    safeSet(BOOKINGS_KEY, JSON.stringify(all));
    return true;
  }

  /* Отмена брони по ключу машины: убирает её из списка текущего пользователя. false — такой брони нет. */
  function removeBooking(key) {
    const user = currentUser();
    if (!user) throw new Error('auth');
    const all = readBookings(), list = all[user.email] || [];
    const next = list.filter(b => b.key !== key);
    if (next.length === list.length) return false;
    all[user.email] = next;
    safeSet(BOOKINGS_KEY, JSON.stringify(all));
    return true;
  }

  return {currentUser, logout, register, login, updateProfile, deleteAccount, getBookings, addBooking, removeBooking, bookingKey, ageOf, hasProfanity, MIN_AGE};
})();
