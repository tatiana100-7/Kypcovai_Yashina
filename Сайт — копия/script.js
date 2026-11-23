/* =====================================================
   Автопарк подгружается из интернета при каждом открытии страницы:
   • список марок и моделей — NHTSA vPIC API (бесплатно, без ключа)
   • фотографии           — Wikipedia / Wikimedia Commons (бесплатно, без ключа)
   • поиск любой машины   — поиск по Wikipedia
   Если интернета нет — показываются 6 машин из папки images/.
   ===================================================== */

const NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const WIKI  = 'https://en.wikipedia.org/w/api.php';
const PAGE_SIZE = 6;

const POPULAR_MAKES = ['Lamborghini','Ferrari','Porsche','McLaren','Aston Martin','Bentley',
  'Rolls-Royce','Maserati','Bugatti','Mercedes-Benz','BMW','Audi','Chevrolet','Ford','Tesla',
  'Jaguar','Lotus','Dodge','Nissan','Toyota','Lexus','Cadillac','Alfa Romeo','Land Rover'];

// Запасной список — работает без интернета
const FALLBACK = [
  {name:'Lamborghini Huracan Spyder', drive:'полный', engine:'5.2 л.с.', seats:2, img:'images/huracan.png'},
  {name:'Chevrolet Corvette',         drive:'полный', engine:'6.2 л.с.', seats:2, img:'images/corvette.png'},
  {name:'Ferrari California',         drive:'полный', engine:'3.9 л.с.', seats:4, img:'images/ferrari.png'},
  {name:'Lamborghini Urus',           drive:'полный', engine:'4.0 л.с.', seats:5, img:'images/urus-card.png'},
  {name:'Audi R8',                    drive:'полный', engine:'5.2 л.с.', seats:2, img:'images/audi-r8.png'},
  {name:'Chevrolet Camaro',           drive:'полный', engine:'2.0 л.с.', seats:4, img:'images/camaro.png'}
];

const cardsEl     = document.getElementById('cards');
const carSelect   = document.getElementById('carSelect');
const statusEl    = document.getElementById('status');
const moreBtn     = document.getElementById('moreBtn');
const searchInput = document.getElementById('searchInput');
const makeSelect  = document.getElementById('makeSelect');
const refreshBtn  = document.getElementById('refreshBtn');

/* ---------- Вспомогательные функции ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

async function fetchJSON(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {signal: ctrl.signal});
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Кэш в браузере, чтобы не грузить одно и то же
const store = {
  get(key) {
    try { const v = JSON.parse(localStorage.getItem(key)); if (v && Date.now() - v.t < v.ttl) return v.d; } catch (e) {}
    return undefined;
  },
  set(key, d, hours) {
    try { localStorage.setItem(key, JSON.stringify({d, t: Date.now(), ttl: hours * 3600e3})); } catch (e) {}
  }
};

const ACRONYMS = ['BMW','GMC','MG','AMC','DS','RAM'];
function titleMake(m) {
  if (m !== m.toUpperCase()) return m;
  return m.toLowerCase().replace(/(^|[\s-])([a-zа-я])/g, (_, a, b) => a + b.toUpperCase())
    .split(' ').map(w => ACRONYMS.includes(w.toUpperCase()) ? w.toUpperCase() : w).join(' ');
}
function titleModel(m) {
  return m.trim().split(' ').map(word => word.split('-').map(t => {
    if (t !== t.toUpperCase() || t.length <= 3 || /\d/.test(t)) return t;
    return t.charAt(0) + t.slice(1).toLowerCase();
  }).join('-')).join(' ');
}
const cleanTitle = t => t.replace(/\s*\(.*?\)\s*/g, '').trim();

/* ---------- Марки и модели (NHTSA) ---------- */
async function getMakes() {
  const cached = store.get('makes');
  if (cached) return cached;
  const data = await fetchJSON(`${NHTSA}/GetMakesForVehicleType/car?format=json`);
  const list = [...new Set(data.Results.map(r => titleMake(r.MakeName)))].sort((a, b) => a.localeCompare(b));
  store.set('makes', list, 24 * 7);
  return list;
}

async function getModels(make) {
  const key = 'models:' + make.toLowerCase();
  const cached = store.get(key);
  if (cached) return cached;
  const data = await fetchJSON(`${NHTSA}/GetModelsForMake/${encodeURIComponent(make)}?format=json`);
  let rows = data.Results || [];
  const exact = rows.filter(r => r.Make_Name.toLowerCase() === make.toLowerCase());
  if (exact.length) rows = exact;
  const list = [...new Set(rows.map(r => `${titleMake(r.Make_Name)} ${titleModel(r.Model_Name)}`))];
  store.set(key, list, 24 * 7);
  return list;
}

/* ---------- Фотографии (Wikipedia) ---------- */
const wikiParams = 'action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=700';

async function searchOneImage(name) {
  try {
    const data = await fetchJSON(`${WIKI}?${wikiParams}&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(name + ' car')}`);
    const model = name.split(' ').slice(-1)[0].toLowerCase();
    const pages = Object.values((data.query || {}).pages || {}).sort((a, b) => a.index - b.index);
    const hit = pages.find(p => p.thumbnail && p.title.toLowerCase().includes(model));
    return hit ? hit.thumbnail.source : '';
  } catch (e) { return ''; }
}

async function getImages(names) {
  const result = {}, todo = [];
  names.forEach(n => { const c = store.get('img:' + n); if (c !== undefined) result[n] = c; else todo.push(n); });

  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    try {
      const data = await fetchJSON(`${WIKI}?${wikiParams}&redirects=1&pilimit=50&titles=${encodeURIComponent(chunk.join('|'))}`);
      const q = data.query || {}, alias = {}, thumbs = {};
      (q.normalized || []).forEach(x => alias[x.from] = x.to);
      (q.redirects  || []).forEach(x => alias[x.from] = x.to);
      Object.values(q.pages || {}).forEach(p => { if (p.thumbnail) thumbs[p.title] = p.thumbnail.source; });
      chunk.forEach(n => { let t = n; if (alias[t]) t = alias[t]; if (alias[t]) t = alias[t]; result[n] = thumbs[t] || ''; });
    } catch (e) { /* сеть недоступна — пропускаем */ }
  }

  // Если у страницы нет фото — ищем через поиск Wikipedia
  await Promise.all(todo.filter(n => result[n] === '').map(async n => { result[n] = await searchOneImage(n); }));
  todo.forEach(n => { if (result[n] !== undefined) store.set('img:' + n, result[n], result[n] ? 72 : 24); });
  return result;
}

/* ---------- Источники списка машин ---------- */
function namesSource(names) {
  let i = 0;
  return {
    async next(n) {
      const items = [];
      while (items.length < n && i < names.length) {
        const batch = names.slice(i, i + 12); i += 12;
        const imgs = await getImages(batch);
        batch.forEach(nm => { if (imgs[nm]) items.push({name: nm, title: nm, img: imgs[nm]}); });
      }
      return {items, done: i >= names.length};
    }
  };
}

// Названия, которые не являются моделью авто (списки, сервисы, дилеры, компании, двигатели и т.п.)
const NOT_A_CAR = /^list of|\b(dealer(ship)?s?|service|services|garage|repair|workshop|company|corporation|automotive|racing|museum|club|engine|platform|factory|plant)\b/i;

function searchSource(query) {
  let offset = 0, done = false;
  return {
    async next(n) {
      const items = [];
      for (let tries = 0; items.length < n && !done && tries < 4; tries++) {
        // insource:"infobox automobile" — только статьи о моделях авто (у автосервисов, дилеров
        // и компаний другая карточка), плюс отсев по названию на случай исключений
        const q = `${query} insource:"infobox automobile"`;
        const data = await fetchJSON(`${WIKI}?${wikiParams}&generator=search&gsrlimit=15&gsroffset=${offset}&gsrsearch=${encodeURIComponent(q)}`);
        const pages = Object.values((data.query || {}).pages || {}).sort((a, b) => a.index - b.index);
        pages.forEach(p => {
          const name = cleanTitle(p.title);
          if (p.thumbnail && !NOT_A_CAR.test(name) && !items.some(x => x.name === name)) items.push({name, title: p.title, img: p.thumbnail.source});
        });
        if (data.continue) offset = data.continue.gsroffset; else done = true;
      }
      return {items, done};
    }
  };
}

async function randomSource() {
  const makes = shuffle([...POPULAR_MAKES]).slice(0, 6);
  const lists = await Promise.all(makes.map(m => getModels(m).catch(() => [])));
  const names = shuffle(lists.flatMap(l => shuffle([...l]).slice(0, 10)));
  if (!names.length) throw new Error('no models');
  return namesSource(names);
}

async function makeSource(make) {
  return namesSource(await getModels(make));
}

/* ---------- Отрисовка ---------- */
// shown — ключи уже показанных машин, imgs — их фотографии (для защиты от повторов),
// cars — данные машин по ключу (нужны для окна характеристик)
let state = {source: null, token: 0, shown: new Set(), imgs: new Set(), pages: new Set(), cars: new Map()};

// Ключ для сравнения названий: «Audi R8» и «audi  r-8» считаются одной машиной
const carKey = name => String(name).toLowerCase().replace(/[^a-z0-9а-яё]/g, '');

function cardHTML(car, key) {
  const specs = car.drive ? `
      <div class="card__specs">
        <div class="card__spec"><img class="card__spec-icon" src="images/icon-drive.png" alt=""><b class="card__spec-label">Привод</b><span class="card__spec-value">${esc(car.drive)}</span></div>
        <div class="card__spec"><img class="card__spec-icon" src="images/icon-engine.png" alt=""><b class="card__spec-label">Двигатель</b><span class="card__spec-value">${esc(car.engine)}</span></div>
        <div class="card__spec"><img class="card__spec-icon" src="images/icon-seats.png" alt=""><b class="card__spec-label">Кол-во мест</b><span class="card__spec-value">${esc(car.seats)}</span></div>
      </div>` : '';
  return `
    <article class="card" data-key="${esc(key)}" tabindex="0" role="button" aria-label="Характеристики: ${esc(car.name)}">
      <img class="card__img" src="${esc(car.img)}" alt="${esc(car.name)}" loading="lazy">
      <h3 class="card__name">${esc(car.name)}</h3>${specs}
      <button class="card__btn" data-name="${esc(car.name)}">Забронировать</button>
    </article>`;
}

// Возвращает, сколько новых карточек добавлено. Повторы (по названию или по фото) пропускаются.
// Ключ фотографии: имя файла из ссылки (одна и та же картинка в разных размерах — один ключ)
function imgKey(url) {
  let u = String(url);
  try { u = decodeURIComponent(u); } catch (e) {}
  const m = /\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//.exec(u);
  const file = m ? m[1] : u.split('?')[0].split('/').pop();
  return file.toLowerCase().replace(/^\d+px-/, '').replace(/\.(jpe?g|png|webp|gif)$/, '').replace(/[^a-z0-9а-яё]/g, '');
}

function addCards(items) {
  let added = 0;
  items.forEach(car => {
    const key = carKey(car.name), ik = imgKey(car.img), pk = car.info ? car.info.url : '';
    if (!key || state.shown.has(key) || state.imgs.has(ik) || (pk && state.pages.has(pk))) return;
    if (pk) state.pages.add(pk);
    state.shown.add(key);
    state.imgs.add(ik);
    state.cars.set(key, car);
    added++;
    cardsEl.insertAdjacentHTML('beforeend', cardHTML(car, key));
    const card = cardsEl.lastElementChild;
    card.querySelector('.card__img').addEventListener('error', () => {
      card.remove();
      state.cars.delete(key);
      state.shown.delete(key);
      state.imgs.delete(ik);
      if (pk) state.pages.delete(pk);
    });
    carSelect.add(new Option(car.name, car.name));
  });
  return added;
}

function resetList(source) {
  state = {source, token: state.token + 1, shown: new Set(), imgs: new Set(), pages: new Set(), cars: new Map()};
  cardsEl.innerHTML = '';
  while (carSelect.options.length > 1) carSelect.remove(1);
  moreBtn.hidden = true;
}

async function loadMore(count = PAGE_SIZE) {
  const token = state.token;
  moreBtn.disabled = true;
  statusEl.textContent = 'Загружаем автомобили…';
  try {
    // если часть машин оказалась повторами — докачиваем, пока не наберём нужное количество
    let added = 0, done = false;
    for (let tries = 0; tries < 8 && added < count && !done; tries++) {
      const res = await state.source.next(count - added);
      if (token !== state.token) return;        // пришёл устаревший ответ
      const good = await enrichItems(res.items);
      if (token !== state.token) return;
      added += addCards(good);
      done = res.done;
    }
    statusEl.textContent = state.shown.size ? '' : 'Ничего не найдено. Попробуйте другое название.';
    moreBtn.hidden = done;
  } catch (e) {
    if (token !== state.token) return;
    if (!state.shown.size) { showFallback(); }
    else statusEl.textContent = 'Не удалось загрузить. Проверьте интернет и нажмите «Показать ещё».';
  } finally {
    if (token === state.token) moreBtn.disabled = false;
  }
}

function showFallback() {
  resetList({next: async () => ({items: [], done: true})});
  addCards(FALLBACK);
  statusEl.textContent = 'Нет связи с интернетом — показываем автомобили из резервного списка.';
}

async function start(sourcePromise) {
  resetList({next: async () => ({items: [], done: true})});
  const token = state.token;
  statusEl.textContent = 'Подбираем автомобили…';
  try {
    const source = await sourcePromise;
    if (token !== state.token) return;
    state.source = source;
    await loadMore(PAGE_SIZE);
  } catch (e) {
    if (token === state.token) showFallback();
  }
}

/* ---------- Управление: подборка, марка, поиск ---------- */
refreshBtn.addEventListener('click', () => { searchInput.value = ''; makeSelect.value = ''; start(randomSource()); });
moreBtn.addEventListener('click', () => loadMore(PAGE_SIZE));

makeSelect.addEventListener('change', () => {
  searchInput.value = '';
  start(makeSelect.value ? makeSource(makeSelect.value) : randomSource());
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = searchInput.value.trim();
    makeSelect.value = '';
    if (q.length >= 2) start(searchSource(q));
    else if (!q) start(randomSource());
  }, 600);
});

// Список марок в фильтре: сначала популярные, затем все остальные
(async function fillMakes() {
  const group = (label, list) => {
    const g = document.createElement('optgroup'); g.label = label;
    list.forEach(m => g.appendChild(new Option(m, m)));
    makeSelect.appendChild(g);
  };
  group('Премиум и популярные', POPULAR_MAKES);
  try { group('Все марки', await getMakes()); } catch (e) {}
})();

start(randomSource());

/* ---------- Проверка форм ---------- */
const phoneOk = v => v.replace(/\D/g, '').length >= 10;

function handleForm(form, msgEl, onSuccess) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll('[required]').forEach(field => {
      const bad = !field.value.trim() || (field.name === 'phone' && !phoneOk(field.value));
      field.classList.toggle('is-error', bad);
      if (bad) valid = false;
    });
    msgEl.classList.toggle('is-ok', valid);
    msgEl.classList.toggle('is-error', !valid);
    if (!valid) { msgEl.textContent = 'Проверьте заполнение полей'; return; }
    msgEl.textContent = 'Спасибо! Мы скоро свяжемся с вами.';
    // Отправка на сервер: fetch('/api', {method:'POST', body:new FormData(form)})
    // Форму не очищаем: имя, телефон и выбранная машина остаются на месте
    if (onSuccess) setTimeout(onSuccess, 1500);
  });
}

/* ---------- Модальное окно ---------- */
const modal      = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalMsg   = document.getElementById('modalMsg');

const openModal = name => {
  modalTitle.textContent = 'Забронировать: ' + name;
  modalMsg.textContent = '';
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  modal.querySelector('.modal__input').focus();
};
const closeModal = () => {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
};

/* ---------- Окно характеристик машины ---------- */
const carModal = document.getElementById('carModal');
const carImg   = document.getElementById('carImg');
const carName  = document.getElementById('carName');
const carSpecs = document.getElementById('carSpecs');
const carDesc  = document.getElementById('carDesc');
const carLink  = document.getElementById('carLink');
const carBook  = document.getElementById('carBook');
const carLang  = document.getElementById('carLang');
let detailToken = 0;

// Чистим викитекст (шаблоны, ссылки, сноски) до обычного текста
function decodeEntities(s) {
  const t = document.createElement('textarea');
  for (let i = 0; i < 2 && /&[#\w]+;/.test(s); i++) { t.innerHTML = s; s = t.value; }
  return s.replace(/\u00a0/g, ' ');
}
function wikiClean(s) {
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');   // ссылки раскрываем до шаблонов, иначе их «|» ломают разбор
  for (let i = 0; i < 6 && /\{\{[^{}]*\}\}/.test(s); i++) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
      const p = inner.split('|').map(x => x.trim()), n = p[0].toLowerCase();
      if (n === 'convert' || n === 'cvt') return (p[1] || '') + ' ' + (p[2] || '');
      if (/^(plainlist|flatlist|unbulleted list|ubl|bulleted list|nowrap|nobr|small)/.test(n)) return p.slice(1).join(', ');
      return '';
    });
  }
  s = decodeEntities(s);
  return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '').replace(/^\s*\*\s*/gm, '').replace(/\n+/g, ', ').replace(/\s+/g, ' ')
    .replace(/\{\{[^}]*$/, '').replace(/[{}]|\[\[|\]\]/g, '').replace(/(,\s*)+$/, '').replace(/^(\s*,)+/, '').trim();
}

function findInfobox(w) {
  const i = w.search(/\{\{\s*infobox automobile\b/i);
  if (i < 0) return '';
  let depth = 0, j = i;
  for (; j < w.length - 1; j++) {
    if (w[j] === '{' && w[j + 1] === '{') { depth++; j++; }
    else if (w[j] === '}' && w[j + 1] === '}') { depth--; j++; if (depth === 0) { j++; break; } }
  }
  return w.slice(i, j);
}

const INFO_FIELDS = [['production', 'Годы выпуска'], ['class', 'Класс'], ['body_style', 'Кузов'],
  ['layout', 'Компоновка / привод'], ['engine', 'Двигатель'], ['transmission', 'Трансмиссия']];

// Значение поля инфобокса: читаем до следующего поля верхнего уровня, учитывая вложенные {{ }} и [[ ]]
function infoField(box, field) {
  const m = new RegExp('\\n\\s*\\|\\s*' + field + '\\s*=', 'i').exec(box);
  if (!m) return '';
  let depth = 0, out = '';
  for (let i = m.index + m[0].length; i < box.length; i++) {
    const two = box.substr(i, 2);
    if (two === '{{' || two === '[[') { depth++; out += two; i++; continue; }
    if (two === '}}' || two === ']]') { if (depth === 0) break; depth--; out += two; i++; continue; }
    if (depth === 0 && box[i] === '\n' && /^\n\s*\|/.test(box.slice(i, i + 40))) break;
    out += box[i];
  }
  return out;
}

// Разбор одной статьи Wikipedia: характеристики из инфобокса + вводный текст
function parseCarPage(page, fallbackTitle) {
  const rev = (page.revisions || [])[0] || {};
  const wikitext = ((rev.slots || {}).main || {})['*'] || '';
  const box = findInfobox(wikitext), rows = [];
  INFO_FIELDS.forEach(([field, label]) => {
    const value = wikiClean(infoField(box, field));
    if (value) rows.push([label, value.length > 160 ? value.slice(0, 157) + '…' : value]);
  });
  return {rows, extract: (page.extract || '').trim(), hasBox: !!box,
    url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent((page.title || fallbackTitle).replace(/ /g, '_'))};
}
const WIKI_PAGE = 'prop=extracts|revisions&exintro=1&explaintext=1&exchars=700&exlimit=20&rvprop=content&rvslots=main';
// Инфобокс всегда в начале статьи, поэтому просим только нулевой раздел (в разы меньше данных).
// Если API это не принял — повторяем запрос без ограничения.
async function fetchPages(params) {
  const base = `${WIKI}?action=query&format=json&origin=*&redirects=1&${WIKI_PAGE}&`;
  try { return await fetchJSON(base + 'rvsection=0&' + params); }
  catch (e) { return fetchJSON(base + params); }
}

// Описание и характеристики из Wikipedia. Если статьи с точным названием нет (или в ней пусто) —
// ищем подходящую статью через поиск Wikipedia.
async function getCarInfo(title) {
  const key = 'info:v3:' + title;
  const cached = store.get(key);
  if (cached !== undefined) return cached;
  const model = title.split(' ').slice(-1)[0].toLowerCase();
  let netOk = false, best = null;
  try {
    const data = await fetchPages(`titles=${encodeURIComponent(title)}`);
    netOk = true;
    const page = Object.values((data.query || {}).pages || {})[0] || {};
    if (page.missing === undefined) {
      const info = parseCarPage(page, title);
      if (info.rows.length) best = info; else if (info.extract) best = info;   // запасной вариант, если поиск ничего лучше не найдёт
    }
  } catch (e) {}
  if (!best || !best.rows.length) {
    const queries = [title + ' car', title];
    for (const q of queries) {
      try {
        const data = await fetchPages(`generator=search&gsrlimit=6&gsrsearch=${encodeURIComponent(q)}`);
        netOk = true;
        const pages = Object.values((data.query || {}).pages || {}).sort((x, y) => x.index - y.index)
          .filter(p => p.title.toLowerCase().includes(model) && !/^list of/i.test(p.title));
        const parsed = pages.map(p => parseCarPage(p, title));
        const hit = parsed.find(i => i.rows.length) || (!best ? parsed.find(i => i.extract) : null);
        if (hit) { if (!best || hit.rows.length) best = hit; if (hit.rows.length) break; }
      } catch (e) {}
    }
  }
  if (!best) return netOk ? {} : {error: true};   // при ошибке сети ничего не кэшируем
  store.set(key, best, 72);
  return best;
}


/* ---------- Отбор машин: только с характеристиками, без старых и без повторов ---------- */
const MIN_END_YEAR = new Date().getFullYear() - 5;   // снятые с производства раньше — не показываем

function productionOk(rows) {
  const r = rows.find(x => x[0] === 'Годы выпуска');
  if (!r) return false;
  if (/present|current|ongoing|н\.\s?в/i.test(r[1])) return true;          // выпускается сейчас
  const years = (r[1].match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
  return years.length > 0 && Math.max(...years) >= MIN_END_YEAR;
}

// Одним запросом тянем инфобокс и описание сразу для нескольких машин
async function batchInfo(titles) {
  const out = {};
  const todo = [];
  titles.forEach(t => { const c = store.get('info:v3:' + t); if (c !== undefined) out[t] = c; else todo.push(t); });
  for (let i = 0; i < todo.length; i += 15) {
    const chunk = todo.slice(i, i + 15);
    try {
      const data = await fetchPages(`titles=${encodeURIComponent(chunk.join('|'))}`);
      const q = data.query || {}, alias = {}, pages = {};
      (q.normalized || []).forEach(x => alias[x.from] = x.to);
      (q.redirects  || []).forEach(x => alias[x.from] = x.to);
      Object.values(q.pages || {}).forEach(p => { if (p.missing === undefined) pages[p.title] = p; });
      chunk.forEach(n => {
        let t = n; if (alias[t]) t = alias[t]; if (alias[t]) t = alias[t];
        if (pages[t]) { const info = parseCarPage(pages[t], n); if (info.hasBox && info.rows.length) { out[n] = info; store.set('info:v3:' + n, info, 72); } }
      });
    } catch (e) { /* сеть недоступна — ниже сработает запасной путь */ }
  }
  return out;
}

async function enrichItems(items) {
  const own = items.filter(c => !c.drive);                 // у запасных машин характеристики уже есть
  const got = await batchInfo(own.map(c => c.title || c.name));
  await Promise.all(own.map(async c => {
    const t = c.title || c.name;
    let info = got[t];
    if (!info) info = await getCarInfo(t);                  // поиск подходящей статьи
    if (info && info.hasBox && info.rows.length >= 2 && productionOk(info.rows)) c.info = info;
  }));
  return items.filter(c => c.drive || c.info);
}

// Машинный перевод (бесплатные сервисы; если один не отвечает — пробуем другой)
async function mtOne(text) {
  const q = encodeURIComponent(text);
  try {
    const d = await fetchJSON(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${q}`, 10000);
    const out = (d[0] || []).map(x => x[0]).join('');
    if (out) return out;
  } catch (e) {}
  try {
    const d = await fetchJSON(`https://api.mymemory.translated.net/get?q=${q}&langpair=en|ru`, 10000);
    const out = (d.responseData || {}).translatedText || '';
    if (out && !/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) return out;
  } catch (e) {}
  return '';
}
// Длинный текст режем по предложениям, чтобы укладываться в лимиты сервисов
async function translateText(text) {
  text = (text || '').trim();
  if (!text) return '';
  const key = 'tr:' + text.slice(0, 200) + '|' + text.length;
  const cached = store.get(key);
  if (cached) return cached;
  const parts = [];
  let cur = '';
  text.split(/(?<=[.!?])\s+|\n+/).forEach(sen => {
    if ((cur + ' ' + sen).length > 450 && cur) { parts.push(cur); cur = sen; } else cur = cur ? cur + ' ' + sen : sen;
  });
  if (cur) parts.push(cur);
  const res = await Promise.all(parts.map(mtOne));
  if (res.some(r => !r)) return '';              // перевод не удался — вызывающий код решит, что показать
  const out = res.join(' ').replace(/\s+/g, ' ').trim();
  store.set(key, out, 24 * 30);
  return out;
}

// Описание на русском: сначала статья русской Википедии, если её нет — машинный перевод английского текста
const WIKI_RU = 'https://ru.wikipedia.org/w/api.php';
async function getRuExtract(title, enText) {
  const key = 'ru:' + title;
  const cached = store.get(key);
  if (cached) return cached;
  try {
    const d1 = await fetchJSON(`${WIKI}?action=query&format=json&origin=*&redirects=1&prop=langlinks&lllang=ru&titles=${encodeURIComponent(title)}`);
    const p1 = Object.values((d1.query || {}).pages || {})[0] || {};
    const ruTitle = ((p1.langlinks || [])[0] || {})['*'];
    if (ruTitle) {
      const d2 = await fetchJSON(`${WIKI_RU}?action=query&format=json&origin=*&redirects=1&prop=extracts&exintro=1&explaintext=1&exchars=700&titles=${encodeURIComponent(ruTitle)}`);
      const p2 = Object.values((d2.query || {}).pages || {})[0] || {};
      const text = (p2.extract || '').trim();
      if (text) { store.set(key, text, 72); return text; }
    }
  } catch (e) {}
  return translateText(enText);
}

// Состояние текущего открытого окна
let detail = {car: null, base: [], info: {}, ru: false, ruDesc: null, ruRows: null};

function renderSpecs(rows) {
  carSpecs.innerHTML = rows.map(([label, value]) =>
    `<div class="cardetail__row"><dt class="cardetail__label">${esc(label)}</dt><dd class="cardetail__value">${esc(value)}</dd></div>`).join('');
}

const NO_NET = 'Не удалось загрузить характеристики. Проверьте интернет и откройте карточку ещё раз.';
const NO_INFO = 'Подробные характеристики для этой машины пока недоступны — уточните их у менеджера при бронировании.';

function renderDetail() {
  const {base, info, ru, ruDesc, ruRows} = detail;
  const have = new Set(base.map(r => r[0]));
  let extra = (info.rows || []).filter(r => !have.has(r[0]));
  if (ru && ruRows) extra = ruRows;
  renderSpecs(base.concat(extra));
  let desc = info.extract || '';
  if (ru) desc = ruDesc || desc;
  carDesc.textContent = desc || (base.length || extra.length ? '' : (info.error ? NO_NET : NO_INFO));
  carLang.textContent = ru ? 'Показать оригинал' : 'Перевести на русский';
  carLang.hidden = !(extra.length || info.extract);
  carLang.disabled = false;
}

async function openDetails(car) {
  const token = ++detailToken;
  carImg.src = car.img;
  carImg.alt = car.name;
  carName.textContent = car.name;
  carBook.dataset.name = car.name;
  const base = car.drive ? [['Привод', car.drive], ['Двигатель', car.engine], ['Кол-во мест', String(car.seats)]] : [];
  detail = {car, base, info: {}, ru: false, ruDesc: null, ruRows: null};
  renderSpecs(base);
  carLang.hidden = true;
  carDesc.textContent = 'Загружаем характеристики…';
  carLink.hidden = true;
  carModal.querySelector('.cardetail__body').scrollTop = 0;
  carModal.classList.add('is-open');
  carModal.setAttribute('aria-hidden', 'false');
  carBook.focus();

  const info = car.info || await getCarInfo(car.title || car.name);
  if (token !== detailToken) return;            // окно уже закрыли или открыли другую машину
  detail.info = info;
  renderDetail();
  if (info.url) { carLink.href = info.url; carLink.hidden = false; }
}

// Кнопка перевода: русский ↔ оригинал
carLang.addEventListener('click', async () => {
  if (detail.ru) { detail.ru = false; renderDetail(); return; }
  const token = detailToken;
  if (detail.ruRows === null) {
    carLang.disabled = true;
    carLang.textContent = 'Переводим…';
    const have = new Set(detail.base.map(r => r[0]));
    const rows = (detail.info.rows || []).filter(r => !have.has(r[0]));
    const [desc, ...vals] = await Promise.all([
      getRuExtract(detail.car.title || detail.car.name, detail.info.extract),
      ...rows.map(r => translateText(r[1]))
    ]);
    if (token !== detailToken) return;
    // если сервис перевода не ответил — для значений используем встроенный словарь
    detail.ruRows = rows.map((r, i) => [r[0], vals[i] || ruValue(r[1])]);
    detail.ruDesc = desc || '';
  }
  detail.ru = true;
  renderDetail();
});

const closeDetails = () => {
  detailToken++;
  carModal.classList.remove('is-open');
  carModal.setAttribute('aria-hidden', 'true');
};

function openCard(card) {
  const car = state.cars.get(card.dataset.key);
  if (car) openDetails(car);
}

cardsEl.addEventListener('click', e => {
  const btn = e.target.closest('.card__btn');
  if (btn) { openModal(btn.dataset.name); return; }
  const card = e.target.closest('.card');
  if (card) openCard(card);
});
cardsEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.closest('.card__btn')) return;
  const card = e.target.closest('.card');
  if (card) openCard(card);
});

// Кнопка «Забронировать» в окне характеристик → окно бронирования этой машины
carBook.addEventListener('click', () => { const name = carBook.dataset.name; closeDetails(); openModal(name); });
document.getElementById('carClose').addEventListener('click', closeDetails);
carModal.addEventListener('click', e => { if (e.target === carModal) closeDetails(); });

document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDetails(); } });

handleForm(document.getElementById('bookingForm'), document.getElementById('formMsg'));
handleForm(document.getElementById('modalForm'), modalMsg, closeModal);

/* ---------- Rolls-Royce выезжает, когда его видно на экране ---------- */
// duration — время в миллисекундах (больше = медленнее), distance — откуда выезжает
const REVEAL = {duration: 3500, distance: '30vw', easing: 'cubic-bezier(.22,.61,.36,1)'};
const bookingCar = document.querySelector('.booking__car');

function revealBookingCar() {
  bookingCar.classList.add('is-visible');
  bookingCar.animate([
    {transform: `translateX(${REVEAL.distance})`, opacity: 0},
    {opacity: 1, offset: 0.3},
    {transform: 'translateX(0)', opacity: 1}
  ], {duration: REVEAL.duration, easing: REVEAL.easing});
}

if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries, observer) => {
    if (entries[0].isIntersecting) { revealBookingCar(); observer.disconnect(); }
  }, {threshold: 0.25}).observe(bookingCar);
} else {
  bookingCar.classList.add('is-visible');
}

/* ---------- Большие машины выезжают заново при наведении мыши ---------- */
// Настройки: duration — время в миллисекундах (больше = медленнее),
// distance — откуда выезжает (меньше = спокойнее), easing — плавность.
const DRIVE = {
  duration: 3000,
  distance: '35vw',
  easing: 'cubic-bezier(.22,.61,.36,1)'
};

function driveOnHover(car) {
  let locked = false;    // идёт анимация или мышь ещё не уходила с машины
  let settled = false;   // анимация закончилась

  car.addEventListener('mouseenter', () => {
    if (locked) return;
    locked = true;
    settled = false;

    const drive = car.animate([
      {transform: `translateX(${DRIVE.distance})`, opacity: 0},
      {opacity: 1, offset: 0.25},
      {transform: 'translateX(0)', opacity: 1}
    ], {duration: DRIVE.duration, easing: DRIVE.easing});

    drive.onfinish = () => {
      settled = true;
      // если мышь уже ушла, пока машина ехала, — разрешаем новый выезд сразу
      if (!car.matches(':hover')) { locked = false; settled = false; }
    };
  });

  car.addEventListener('mouseleave', () => {
    // повторный выезд — только после окончания анимации и ухода мыши с машины
    if (settled) { locked = false; settled = false; }
  });
}

// Urus: блок с текстом не должен перекрывать машину для мыши
document.querySelector('.hero__inner').style.pointerEvents = 'none';
document.querySelector('.hero__content').style.pointerEvents = 'auto';

driveOnHover(document.querySelector('.hero__car'));
driveOnHover(document.querySelector('.booking__car'));

/* ---------- Аккаунт: кнопка в шапке и подстановка данных в формы ---------- */
(function renderAccount() {
  if (typeof Auth === 'undefined') return;
  let user = Auth.currentUser();
  if (!user) return;

  // Аватар: фото или первая буква имени
  const setAvatar = (el, photo, name) => {
    if (photo) { el.style.backgroundImage = `url("${photo}")`; el.textContent = ''; }
    else { el.style.backgroundImage = ''; el.textContent = (name || '?').trim().charAt(0).toUpperCase(); }
  };

  const box = document.getElementById('headerAuth');
  function renderHeader() {
    user = Auth.currentUser() || user;
    box.innerHTML = '';
    const profileBtn = document.createElement('button');
    profileBtn.className = 'header__profile';
    profileBtn.type = 'button';
    profileBtn.title = 'Редактировать профиль';
    const avatar = document.createElement('span');
    avatar.className = 'header__avatar';
    setAvatar(avatar, user.photo, user.name);
    const nameEl = document.createElement('span');
    nameEl.className = 'header__user';
    nameEl.textContent = user.name;
    profileBtn.append(avatar, nameEl);
    profileBtn.addEventListener('click', openProfile);
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'header__logout';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Выйти';
    logoutBtn.addEventListener('click', () => { Auth.logout(); location.href = 'index.html'; });
    box.append(profileBtn, logoutBtn);
  }

  // имя и телефон подставляются в формы бронирования
  const fill = form => {
    const name = form.querySelector('input[name=name]');
    const phone = form.querySelector('input[name=phone]');
    if (name && !name.value) name.value = user.name;
    if (phone && !phone.value) phone.value = user.phone || '';
  };
  fill(document.getElementById('bookingForm'));
  fill(document.getElementById('modalForm'));

  /* ---------- Редактирование профиля: ФИО, дата рождения, фото ---------- */
  const profileModal  = document.getElementById('profileModal');
  const profileForm   = document.getElementById('profileForm');
  const profileAvatar = document.getElementById('profileAvatar');
  const profilePhoto  = document.getElementById('profilePhoto');
  const profileMsg    = document.getElementById('profileMsg');
  const profileAge    = document.getElementById('profileAge');
  const profileBirth  = profileForm.elements.birth;
  const profileBirthLabel = document.getElementById('profileBirthLabel');
  const deleteBtn     = document.getElementById('profileDelete');
  const deleteForm    = document.getElementById('deleteForm');
  const deleteMsg     = document.getElementById('deleteMsg');
  let pendingPhoto = '';

  function resetDelete() {
    deleteForm.hidden = true;
    deleteBtn.hidden = false;
    deleteForm.reset();
    deleteMsg.textContent = '';
    deleteMsg.className = 'profile__msg';
  }

  const profileSay = (text, ok) => {
    profileMsg.textContent = text;
    profileMsg.className = 'profile__msg ' + (text ? (ok ? 'is-ok' : 'is-error') : '');
  };
  const showAge = () => {
    const age = Auth.ageOf(profileBirth.value);
    profileAge.textContent = isNaN(age) ? '' : 'Возраст: ' + age;
  };
  const closeProfile = () => {
    profileModal.classList.remove('is-open');
    profileModal.setAttribute('aria-hidden', 'true');
  };

  function openProfile() {
    const u = Auth.currentUser() || user;
    pendingPhoto = u.photo || '';
    profileForm.elements.name.value = u.name || '';
    profileBirth.value = u.birth || '';
    profileBirth.max = new Date().toISOString().slice(0, 10);
    // дату рождения (возраст) менять нельзя; вводится только если её не было у старого аккаунта
    profileBirth.disabled = !!u.birth;
    profileBirthLabel.textContent = u.birth ? 'Дата рождения (изменить нельзя)' : 'Дата рождения (указывается один раз)';
    resetDelete();
    profileForm.elements.email.value = u.email;
    profileForm.elements.phone.value = u.phone || '';
    profileForm.elements.phone.classList.remove('is-error');
    setAvatar(profileAvatar, pendingPhoto, u.name);
    profilePhoto.value = '';
    profileSay('');
    showAge();
    profileModal.classList.add('is-open');
    profileModal.setAttribute('aria-hidden', 'false');
    profileForm.elements.name.focus();
  }

  // Фото уменьшаем до 256×256, чтобы оно поместилось в localStorage
  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const S = 256, c = document.createElement('canvas');
        c.width = c.height = S;
        const side = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }

  profilePhoto.addEventListener('change', async () => {
    const file = profilePhoto.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { profileSay('Выберите файл-изображение', false); return; }
    try {
      pendingPhoto = await resizePhoto(file);
      setAvatar(profileAvatar, pendingPhoto, profileForm.elements.name.value);
      profileSay('');
    } catch (e) { profileSay('Не удалось прочитать изображение', false); }
  });
  document.getElementById('profileRemove').addEventListener('click', () => {
    pendingPhoto = '';
    profilePhoto.value = '';
    setAvatar(profileAvatar, '', profileForm.elements.name.value);
  });
  profileBirth.addEventListener('input', showAge);

  profileForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = profileForm.elements.name.value.trim();
    const age = Auth.ageOf(profileBirth.value);
    profileForm.elements.name.classList.toggle('is-error', name.length < 2);
    profileBirth.classList.toggle('is-error', isNaN(age) || age < Auth.MIN_AGE);
    if (name.length < 2) { profileSay('Введите ФИО (минимум 2 символа)', false); return; }
    if (Auth.hasProfanity(name)) {
      profileForm.elements.name.classList.add('is-error');
      profileSay('В имени нельзя использовать нецензурные слова', false);
      return;
    }
    if (isNaN(age))      { profileSay('Укажите корректную дату рождения', false); return; }
    if (age < Auth.MIN_AGE) { profileSay('Пользователям младше 18 лет аккаунт недоступен', false); return; }
    const phone = profileForm.elements.phone.value.trim();
    profileForm.elements.phone.classList.toggle('is-error', !phoneOk(phone));
    if (!phoneOk(phone)) { profileSay('Введите телефон (минимум 10 цифр)', false); return; }
    try {
      Auth.updateProfile({name, birth: profileBirth.value, photo: pendingPhoto, phone});
    } catch (err) {
      if (err.message === 'profanity') { profileSay('В имени нельзя использовать нецензурные слова', false); return; }
      profileSay('Не удалось сохранить: в браузере не хватает места или хранилище отключено', false);
      return;
    }
    renderHeader();
    // новые ФИО и телефон сразу попадают в формы бронирования
    ['bookingForm', 'modalForm'].forEach(id => {
      const f = document.getElementById(id);
      f.elements.name.value = name;
      f.elements.phone.value = phone;
    });
    profileSay('Профиль сохранён', true);
    setTimeout(closeProfile, 900);
  });

  /* ---------- Удаление аккаунта ---------- */
  deleteBtn.addEventListener('click', () => {
    deleteBtn.hidden = true;
    deleteForm.hidden = false;
    deleteForm.elements.password.focus();
  });
  document.getElementById('deleteCancel').addEventListener('click', resetDelete);
  deleteForm.addEventListener('submit', async e => {
    e.preventDefault();
    const sayDelete = text => { deleteMsg.textContent = text; deleteMsg.className = 'profile__msg is-error'; };
    const password = deleteForm.elements.password.value;
    if (!password) { sayDelete('Введите пароль'); return; }
    const btn = deleteForm.querySelector('.profile__confirm-btn');
    btn.disabled = true;
    try {
      await Auth.deleteAccount(password);
      location.replace('index.html');
    } catch (err) {
      sayDelete(err.message === 'invalid' ? 'Неверный пароль' : 'Не удалось удалить аккаунт');
      btn.disabled = false;
    }
  });

  document.getElementById('profileClose').addEventListener('click', closeProfile);
  profileModal.addEventListener('click', e => { if (e.target === profileModal) closeProfile(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfile(); });

  renderHeader();
})();
