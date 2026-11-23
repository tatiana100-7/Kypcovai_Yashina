/* =====================================================
   Чат-помощник Luxorides.
   • «Подбор авто» — имитация ИИ: разбирает ваши пожелания по ключевым словам
     (без сервера и без интернета) и подбирает машины из своего каталога.
   • «Поддержка» — форма обращения: письмо уходит на почту владельца сайта (через сервис FormSubmit),
     в письме указана почта клиента как «Ответить» — ответ из Gmail приходит прямо клиенту.
   • Окно открывается кружком справа внизу, размер меняется мышью (левый/верхний край и угол).
   ===================================================== */
(function () {
  'use strict';

  // Куда приходят обращения. Ответ на письмо автоматически уйдёт на почту клиента (Reply-To).
  const SUPPORT_EMAIL = 'uninkorn143@gmail.com';

  // Отправка обращения:
  //  • сайт открыт через адрес (http://…) — письмо уходит само через FormSubmit;
  //  • сайт открыт двойным щелчком (file://) или автоотправка не удалась — открывается готовое письмо
  //    в почтовой программе клиента (mailto), остаётся нажать «Отправить».
  // Почта клиента стоит в «Ответить» (Reply-To) / в поле «От», так что ответ уходит клиенту.
  // Возвращает 'sent' (ушло само) или 'mailto' (открыто письмо).
  async function sendMail(f) {
    if (location.protocol !== 'file:') {
      try {
        const res = await fetch('https://formsubmit.co/ajax/' + SUPPORT_EMAIL, {
          method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
          body: JSON.stringify({_subject: f.subject, _template: 'table', _captcha: 'false', 'Номер обращения': f.id,
            'Тема': f.topic, 'Имя клиента': f.name, email: f.email, 'Сообщение': f.text})
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false && data.success !== 'false') return 'sent';
      } catch (e) { /* пробуем mailto */ }
    }
    const body = `${f.text}\n\n—\nИмя: ${f.name}\nПочта для ответа: ${f.email}\nТема: ${f.topic}\nОбращение №${f.id}`;
    // Открываем письмо в новой вкладке/программе, чтобы сайт не закрывался (если почта — Gmail в браузере)
    const link = document.createElement('a');
    link.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(f.subject)}&body=${encodeURIComponent(body)}`;
    link.target = '_blank'; link.rel = 'noopener';
    document.body.append(link); link.click(); link.remove();
    return 'mailto';
  }

  /* ---------- Каталог машин ---------- */
  // n — название, s — мест, t — теги, k — как ещё называют (для поиска по тексту)
  const CATALOG = [
    {n:'Lamborghini Huracán', s:2, t:'sport fast conv show luxury ita rare', k:'хуракан huracan'},
    {n:'Lamborghini Urus', s:5, t:'suv sport luxury family show ita comfort travel', k:'урус urus'},
    {n:'Lamborghini Aventador', s:2, t:'sport fast show luxury ita rare', k:'авентадор aventador'},
    {n:'Ferrari California', s:4, t:'conv sport luxury ita comfort travel show wedding', k:'калифорния california'},
    {n:'Ferrari 458 Italia', s:2, t:'sport fast ita luxury show coupe', k:'458'},
    {n:'Chevrolet Corvette', s:2, t:'usa sport fast conv coupe show', k:'корвет corvette'},
    {n:'Chevrolet Camaro', s:4, t:'usa sport retro coupe conv show', k:'камаро camaro'},
    {n:'Chevrolet Tahoe', s:7, t:'usa suv family travel comfort', k:'тахо tahoe'},
    {n:'Audi R8', s:2, t:'ger sport fast luxury coupe show', k:'r8 р8'},
    {n:'Porsche 911', s:4, t:'ger sport luxury coupe city travel fast', k:'911 порше'},
    {n:'Porsche Cayenne', s:5, t:'ger suv luxury family comfort travel', k:'кайен cayenne'},
    {n:'Porsche Panamera', s:4, t:'ger sedan luxury comfort sport travel wedding', k:'панамера panamera'},
    {n:'McLaren 720S', s:2, t:'brit sport fast rare show luxury coupe', k:'720s'},
    {n:'Aston Martin DB11', s:4, t:'brit luxury sport comfort travel wedding coupe', k:'db11'},
    {n:'Bentley Continental GT', s:4, t:'brit luxury comfort travel wedding coupe', k:'континенталь continental'},
    {n:'Rolls-Royce Phantom', s:5, t:'brit luxury comfort wedding sedan show family', k:'фантом phantom'},
    {n:'Rolls-Royce Cullinan', s:5, t:'brit suv luxury comfort wedding show family', k:'куллинан cullinan'},
    {n:'Bugatti Chiron', s:2, t:'rare fast show luxury sport coupe', k:'широн chiron'},
    {n:'Maserati Ghibli', s:5, t:'ita sedan luxury sport comfort', k:'гибли ghibli'},
    {n:'Mercedes-Benz S-Class', s:5, t:'ger sedan luxury comfort wedding travel family', k:'s-class эс класс s класс'},
    {n:'Mercedes-Benz G-Class', s:5, t:'ger suv offroad luxury show family travel', k:'гелик гелендваген g-class g класс'},
    {n:'Mercedes-Benz SL', s:2, t:'ger conv luxury comfort travel wedding', k:'sl'},
    {n:'Mercedes-AMG GT', s:2, t:'ger sport fast luxury coupe show', k:'amg gt'},
    {n:'BMW M4', s:4, t:'ger sport fast coupe conv city', k:'m4 м4'},
    {n:'BMW X5', s:5, t:'ger suv family comfort travel luxury', k:'x5 х5'},
    {n:'Tesla Model S', s:5, t:'usa elec sedan comfort fast family city travel', k:'model s'},
    {n:'Tesla Model X', s:6, t:'usa elec suv family comfort travel show', k:'model x'},
    {n:'Jaguar F-Type', s:2, t:'brit sport conv coupe fast show', k:'f-type ф-тайп'},
    {n:'Lotus Evora', s:2, t:'brit sport rare coupe fast', k:'эвора evora'},
    {n:'Dodge Challenger', s:5, t:'usa retro sport coupe fast show', k:'челленджер challenger'},
    {n:'Ford Mustang', s:4, t:'usa retro sport conv coupe show', k:'мустанг mustang'},
    {n:'Nissan GT-R', s:4, t:'jap sport fast coupe show', k:'gt-r гтр'},
    {n:'Toyota Land Cruiser', s:7, t:'jap suv offroad family travel comfort', k:'круизер крузак land cruiser'},
    {n:'Lexus LX', s:5, t:'jap suv luxury comfort family travel', k:'lx лх'},
    {n:'Cadillac Escalade', s:7, t:'usa suv luxury family wedding show comfort', k:'эскалейд escalade'},
    {n:'Alfa Romeo Giulia', s:5, t:'ita sedan sport city', k:'джулия giulia'},
    {n:'Land Rover Range Rover', s:5, t:'brit suv luxury offroad comfort family travel', k:'рендж ровер range rover'},
    {n:'Land Rover Range Rover Evoque', s:5, t:'brit suv city luxury', k:'эвок evoque'}
  ];
  CATALOG.forEach(c => { c.tags = c.t.split(' '); });

  const BRANDS = {
    'lamborghini':'ламборгини ламборджини','ferrari':'феррари','chevrolet':'шевроле','audi':'ауди','porsche':'порше',
    'mclaren':'макларен','aston martin':'астон мартин','bentley':'бентли','rolls-royce':'роллс ройс роллс-ройс','bugatti':'бугатти',
    'maserati':'мазерати','mercedes':'мерседес мерс','bmw':'бмв бумер','tesla':'тесла','jaguar':'ягуар','lotus':'лотус',
    'dodge':'додж','ford':'форд','nissan':'ниссан','toyota':'тойота','lexus':'лексус','cadillac':'кадиллак',
    'alfa romeo':'альфа ромео','land rover':'ленд ровер'
  };

  /* ---------- Что понимаем в тексте ---------- */
  const TAGS = {
    sport:   /спорт|быстр|скорост|драйв|адреналин|гонк|мощн|разгон/,
    fast:    /быстр|скорост|мощн|разгон|гонк/,
    luxury:  /люкс|премиум|роскош|дорог|богат|статус|представител|\bvip\b|вип/,
    comfort: /комфорт|удобн|плавн|тих[оаи]|мягк/,
    family:  /семь|дет(и|ьми|ей|ск)|ребён|ребен|родител/,
    suv:     /внедорожник|кроссовер|\bsuv\b|высок|проходим|джип/,
    conv:    /кабриолет|открыт\S* верх|родстер|спайдер|спайдр|ветер|без крыши/,
    retro:   /ретро|классик|винтаж|старин/,
    usa:     /американск|мускул|muscle|сша/,
    ita:     /итальянск/,
    ger:     /немецк/,
    brit:    /британск|английск/,
    jap:     /японск/,
    elec:    /электр|эколог/,
    wedding: /свадьб|невест|торжеств|церемони|выпускн|жених/,
    travel:  /путешеств|поездк|дальн|трасс|отпуск|море|дорог[аеу] /,
    city:    /город|центр|повседнев|парковк|по городу/,
    show:    /впечатл|эффектн|выделить|ярк|привлеч|фото|съёмк|съемк|блог|показать/,
    rare:    /редк|эксклюзив|необычн|уникальн|коллекц|что-то особенн/,
    offroad: /бездорож|горы|горах|лес|снег|зим/,
    coupe:   /купе/,
    sedan:   /седан/
  };
  const WHY = {
    sport:'настоящий спорткар', fast:'очень быстрая', luxury:'премиальный уровень', comfort:'очень комфортная',
    family:'подойдёт для семьи', suv:'высокий и вместительный', conv:'открытый верх — ветер и солнце',
    retro:'классический характер', usa:'американский характер', ita:'итальянский стиль', ger:'немецкое качество',
    brit:'британская элегантность', jap:'японская надёжность', elec:'электромобиль', wedding:'смотрится отлично на свадьбе',
    travel:'хороша для дальних поездок', city:'удобна в городе', show:'привлекает внимание', rare:'редкая и необычная',
    offroad:'справится с бездорожьем', coupe:'кузов купе', sedan:'кузов седан'
  };
  const OCCASION = ['wedding','travel','city','family','show','offroad'];

  const NEG = /(?:^|\s)(?:не|без|кроме|никаких|ни)\s+(?:\S+\s+)?$/;

  function parse(text) {
    const low = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
    const res = {tags: {}, seats: 0, brands: [], models: [], signal: false};
    Object.keys(TAGS).forEach(tag => {
      const re = new RegExp(TAGS[tag].source.replace(/ё/g, 'е'), 'g');
      let m;
      while ((m = re.exec(low))) {
        const neg = NEG.test(low.slice(Math.max(0, m.index - 22), m.index));
        res.tags[tag] = (res.tags[tag] || 0) + (neg ? -1 : 1);
        res.signal = true;
      }
    });
    const num = /(\d+)\s*(?:чел|человек|пассаж|мест|взросл)/.exec(low);
    if (num) res.seats = Math.min(8, +num[1]);
    else if (/вдво[её]м|для двоих|вдвоем|с девушкой|с парнем|с женой|с мужем|пара/.test(low)) res.seats = 2;
    else if (/впятером|компани|друзьями|большой семь/.test(low)) res.seats = 5;
    else if (/семь|дет(и|ьми|ей)|ребен/.test(low)) res.seats = Math.max(res.seats, 4);
    else if (/\bодин\b|один поеду|сам\b/.test(low)) res.seats = 1;
    if (res.seats) res.signal = true;
    Object.entries(BRANDS).forEach(([en, ru]) => {
      if (low.includes(' ' + en) || ru.split(' ').some(w => w.length > 3 && low.includes(w))) { res.brands.push(en); res.signal = true; }
    });
    CATALOG.forEach(c => {
      const words = c.k.split(' ').filter(w => w.length > 3);
      if (words.some(w => low.includes(w))) { res.models.push(c.n); res.signal = true; }
    });
    return res;
  }

  /* ---------- Память разговора ---------- */
  let prefs, shown, lastRecs;
  function resetPrefs() { prefs = {tags: {}, seats: 0, brands: [], models: []}; shown = new Set(); lastRecs = []; }
  resetPrefs();

  function merge(p) {
    Object.entries(p.tags).forEach(([t, v]) => { prefs.tags[t] = (prefs.tags[t] || 0) + v; });
    if (p.seats) prefs.seats = p.seats;
    p.brands.forEach(b => { if (!prefs.brands.includes(b)) prefs.brands.push(b); });
    p.models.forEach(m => { if (!prefs.models.includes(m)) prefs.models.push(m); });
  }

  function score(car) {
    let sc = 0; const hit = [];
    if (prefs.seats && car.s < prefs.seats) sc -= 100;
    Object.entries(prefs.tags).forEach(([t, w]) => {
      const has = car.tags.includes(t);
      if (w > 0 && has) { sc += 2 + Math.min(w, 3); hit.push(t); }
      if (w < 0 && has) sc -= 6;
    });
    if (prefs.brands.some(b => car.n.toLowerCase().includes(b))) sc += 6;
    if (prefs.models.includes(car.n)) sc += 10;
    if (prefs.seats && car.s >= prefs.seats && car.s <= prefs.seats + 1) sc += 1;
    return {sc, hit};
  }

  function recommend(n = 3, fresh = true) {
    const ranked = CATALOG.map(c => ({c, ...score(c)})).filter(r => r.sc > 0).sort((a, b) => b.sc - a.sc);
    let pool = fresh ? ranked.filter(r => !shown.has(r.c.n)) : ranked;
    return pool.slice(0, n);
  }

  /* ---------- Интерфейс ---------- */
  const $ = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  const fab = $('button', 'lx-fab', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5z"/></svg><span class="lx-fab__dot"></span>');
  fab.type = 'button'; fab.setAttribute('aria-label', 'Открыть чат'); fab.setAttribute('aria-expanded', 'false');

  const box = $('section', 'lx-chat');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Чат Luxorides');
  box.innerHTML = `
    <div class="lx-rs lx-rs--l" data-rs="l"></div><div class="lx-rs lx-rs--t" data-rs="t"></div><div class="lx-rs lx-rs--tl" data-rs="tl"></div>
    <div class="lx-head"><div class="lx-head__title">Luxorides Ассистент<small>Подберу машину под ваши пожелания</small></div>
      <button class="lx-head__btn" type="button" data-close aria-label="Закрыть">×</button></div>
    <div class="lx-tabs" role="tablist">
      <button class="lx-tab is-active" type="button" data-tab="ai" role="tab">Подбор машины</button>
      <button class="lx-tab" type="button" data-tab="support" role="tab">Поддержка</button></div>
    <div class="lx-pane is-active" data-pane="ai">
      <div class="lx-log" id="lxLog" aria-live="polite"></div>
      <div class="lx-chips" id="lxChips"></div>
      <form class="lx-form" id="lxForm" autocomplete="off">
        <input class="lx-input" id="lxInput" type="text" placeholder="Напишите, какую машину ищете…" maxlength="400">
        <button class="lx-send" type="submit">Отправить</button></form>
    </div>
    <div class="lx-pane" data-pane="support">
      <form class="lx-support" id="lxSupport" novalidate>
        <p class="lx-support__hint">Опишите вопрос — сообщение уйдёт менеджеру, ответ придёт на указанный email.</p>
        <label class="lx-field">Ваше имя<input class="lx-input" name="name" type="text" maxlength="60"></label>
        <label class="lx-field">Email<input class="lx-input" name="email" type="email" maxlength="80"></label>
        <label class="lx-field">Тема<select class="lx-input" name="topic">
          <option>Бронирование</option><option>Оплата</option><option>Аккаунт</option><option>Автомобили</option><option>Другое</option></select></label>
        <label class="lx-field">Сообщение<textarea class="lx-input" name="text" maxlength="1500" placeholder="Что случилось или что хотите узнать?"></textarea></label>
        <button class="lx-send" id="lxSupportBtn" type="submit" style="height:42px">Отправить в поддержку</button>
        <p class="lx-support__msg" id="lxSupportMsg" role="status"></p>
        <div class="lx-tickets" id="lxTickets" hidden></div>
      </form>
    </div>`;
  document.body.append(box, fab);

  const log = box.querySelector('#lxLog'), chips = box.querySelector('#lxChips'),
        form = box.querySelector('#lxForm'), input = box.querySelector('#lxInput');

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };
  function say(text, who = 'bot') { const m = $('div', 'lx-msg lx-msg--' + who); m.textContent = text; log.append(m); scrollDown(); return m; }
  function setChips(list) {
    chips.innerHTML = '';
    list.forEach(t => { const b = $('button', 'lx-chip'); b.type = 'button'; b.textContent = t; b.onclick = () => send(t); chips.append(b); });
  }
  const START_CHIPS = ['Для свадьбы', 'Быстрый спорткар', 'Кабриолет на лето', 'Для семьи из 5 человек', 'Внедорожник', 'Что-то необычное'];

  /* ---------- Связь с сайтом ---------- */
  const keyOf = name => (typeof carKey === 'function' ? carKey(name) : name.toLowerCase().replace(/[^a-z0-9]/g, ''));
  function findCard(name) {
    const want = keyOf(name);
    const cards = [...document.querySelectorAll('#cards .card')];
    return cards.find(c => c.dataset.key === want) || cards.find(c => c.dataset.key.includes(want) || want.includes(c.dataset.key));
  }
  function showOnSite(name) {
    const open = card => { card.scrollIntoView({behavior: 'smooth', block: 'center'}); setTimeout(() => card.click(), 450); };
    const card = findCard(name);
    if (card) { open(card); return; }
    const search = document.getElementById('searchInput');
    if (!search) return;
    search.value = name;
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const fleet = document.getElementById('fleet'); if (fleet) fleet.scrollIntoView({behavior: 'smooth'});
    let tries = 0;
    const timer = setInterval(() => {
      const c = findCard(name);
      if (c) { clearInterval(timer); open(c); } else if (++tries > 14) clearInterval(timer);
    }, 700);
  }
  function bookCar(name) { if (typeof openModal === 'function') openModal(name); else showOnSite(name); }

  function recCard(r) {
    const why = r.hit.slice(0, 3).map(t => WHY[t]).filter(Boolean);
    const brandHit = prefs.brands.some(b => r.c.n.toLowerCase().includes(b)) || prefs.models.includes(r.c.n);
    if (brandHit) why.unshift('как вы и просили');
    const el = $('div', 'lx-rec');
    el.innerHTML = `<img class="lx-rec__img" alt="" hidden>
      <div class="lx-rec__body"><div class="lx-rec__name">${esc(r.c.n)}</div>
      <div class="lx-rec__why">${esc((why.length ? why.join(', ') : 'хороший универсальный выбор') + ' · мест: ' + r.c.s)}</div>
      <div class="lx-rec__row"><button class="lx-btn lx-btn--ghost" type="button" data-a="look">Смотреть</button>
      <button class="lx-btn" type="button" data-a="book">Забронировать</button></div></div>`;
    el.querySelector('[data-a=look]').onclick = () => showOnSite(r.c.n);
    el.querySelector('[data-a=book]').onclick = () => bookCar(r.c.n);
    const img = el.querySelector('img'), onSite = findCard(r.c.n);
    if (onSite) { img.src = onSite.querySelector('.card__img').src; img.hidden = false; }
    else if (typeof getImages === 'function') {
      getImages([r.c.n]).then(m => { if (m && m[r.c.n]) { img.src = m[r.c.n]; img.hidden = false; } }).catch(() => {});
    }
    return el;
  }

  /* ---------- «Мозг» ассистента ---------- */
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  let busy = false;

  function reply(text) {
    const low = text.toLowerCase().replace(/ё/g, 'е');
    if (/^(привет|здравствуй|добрый|хай|hello|hi)\b/.test(low) && low.length < 30)
      return {text: 'Здравствуйте! Расскажите, какую машину ищете: для чего она нужна, сколько человек поедет, какой стиль нравится — и я подберу варианты.', chips: START_CHIPS};
    if (/спасибо|благодар/.test(low)) return {text: 'Пожалуйста! Если захотите посмотреть другие варианты — просто напишите.', chips: ['Покажи другие', 'Начать заново']};
    if (/заново|сброс|очист|с нуля/.test(low)) { resetPrefs(); return {text: 'Хорошо, начинаем сначала. Что ищете?', chips: START_CHIPS}; }
    if (/поддержк|оператор|менеджер|живой человек|жалоб/.test(low)) { switchTab('support'); return {text: 'Открыл вкладку «Поддержка» — опишите вопрос, и менеджер ответит на ваш email.'}; }
    if (/как.*(забронир|арендов|снять)|заказать/.test(low))
      return {text: 'Всё просто: выберите машину в автопарке, нажмите «Забронировать» и заполните форму. А я могу сразу подобрать подходящую — расскажите, что вам нужно.'};
    if (/цен|стоим|сколько стоит|дорого ли|тариф/.test(low) && !parse(text).signal)
      return {text: 'Стоимость аренды зависит от машины и срока — её называет менеджер при бронировании. Могу подобрать машину, а цену уточните через «Поддержку».', chips: ['Подобрать машину']};
    if (/что (ты )?умеешь|кто ты|ты бот|ты ии/.test(low))
      return {text: 'Я виртуальный помощник Luxorides: подбираю машину по вашим пожеланиям (повод, число пассажиров, стиль, марка). Это не живой человек — по вопросам брони и оплаты лучше написать в «Поддержку».', chips: START_CHIPS};

    const more = /друг(ие|ое)|ещ[её]|еще|другой вариант|не нравится|не то|покажи ещ/.test(low);
    const p = parse(text);
    if (!p.signal && !more) {
      return {text: pick(['Пока не получилось понять, что именно вам нужно. Попробуйте описать повод (свадьба, поездка, фотосессия), число пассажиров или стиль (спорткар, внедорожник, кабриолет).',
        'Расскажите чуть подробнее: для чего машина, сколько человек поедет и какой стиль нравится?']), chips: START_CHIPS};
    }
    if (p.signal) merge(p);
    let recs = recommend(3, true);
    if (!recs.length) recs = recommend(3, false);
    if (!recs.length) {
      return {text: 'С такими условиями ничего не нашлось. Попробуйте смягчить пожелания — например, убрать ограничение по числу мест или кузову.', chips: ['Начать заново']};
    }
    recs.forEach(r => shown.add(r.c.n));
    const intro = more && !p.signal ? 'Вот ещё варианты:' : pick(['Вот что можно предложить:', 'По вашим пожеланиям хорошо подходят:', 'Посмотрите эти варианты:']);
    const hasOcc = OCCASION.some(t => prefs.tags[t] > 0);
    let ask = '';
    if (!prefs.seats) ask = 'Сколько человек поедет? От этого зависит выбор.';
    else if (!hasOcc) ask = 'Для какого случая нужна машина — свадьба, поездка, фотосессия?';
    else ask = 'Нравятся? Могу показать другие или уточнить пожелания.';
    return {text: intro, recs, after: ask, chips: ['Покажи другие', 'Только кабриолеты', 'Только внедорожники', 'Начать заново']};
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    say(text, 'me'); input.value = ''; chips.innerHTML = '';
    const dots = $('div', 'lx-msg lx-msg--bot', '<span class="lx-typing"><i></i><i></i><i></i></span>');
    log.append(dots); scrollDown();
    const r = reply(text);
    await new Promise(res => setTimeout(res, 600 + Math.random() * 600));
    dots.remove();
    say(r.text);
    if (r.recs) r.recs.forEach(x => log.append(recCard(x)));
    if (r.after) say(r.after);
    scrollDown();
    if (r.chips) setChips(r.chips);
    busy = false;
    input.focus();
  }
  form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });

  /* ---------- Поддержка ---------- */
  const sForm = box.querySelector('#lxSupport'), sMsg = box.querySelector('#lxSupportMsg'), sList = box.querySelector('#lxTickets');
  const readTickets = () => { try { return JSON.parse(safeGet('luxorides_support') || '[]'); } catch (e) { return []; } };
  function me() { try { return (typeof Auth !== 'undefined' && Auth.currentUser && Auth.currentUser()) || null; } catch (e) { return null; } }
  function renderTickets() {
    const u = me(), mail = (sForm.email.value || (u && u.email) || '').trim().toLowerCase();
    const mine = readTickets().filter(t => t.email === mail).reverse();
    sList.hidden = !mine.length;
    sList.innerHTML = mine.length ? '<h4>Ваши обращения</h4>' + mine.map(t =>
      `<div class="lx-ticket"><b>№${t.id} · ${esc(t.topic)}</b>${esc(t.text.length > 90 ? t.text.slice(0, 90) + '…' : t.text)}<br><small>${new Date(t.t).toLocaleString('ru-RU')} · отправлено, ждёт ответа</small></div>`).join('') : '';
  }
  function fillSupport() {
    const u = me();
    if (u) {
      sForm.name.value = sForm.name.value || u.name || '';
      sForm.email.value = u.email || '';
      sForm.email.readOnly = true;                 // ответ всегда уходит владельцу аккаунта
    }
    renderTickets();
  }
  sForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = box.querySelector('#lxSupportBtn');
    const name = sForm.name.value.trim(), email = sForm.email.value.trim().toLowerCase(), text = sForm.text.value.trim();
    const swear = s => typeof Auth !== 'undefined' && Auth.hasProfanity && Auth.hasProfanity(s);
    const bad = !name ? 'Укажите имя.' : swear(name) ? 'В имени нельзя использовать нецензурные слова.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Введите корректный email.' : text.length < 5 ? 'Опишите вопрос подробнее.' : swear(text) ? 'В обращении нельзя использовать нецензурные слова. Опишите вопрос корректно.' : '';
    sMsg.className = 'lx-support__msg';
    if (bad) { sMsg.textContent = bad; sMsg.classList.add('is-error'); return; }
    const all = readTickets();
    const id = (all.reduce((m, t) => Math.max(m, t.id), 1000)) + 1;
    const topic = sForm.topic.value;
    btn.disabled = true; btn.textContent = 'Отправляем…'; sMsg.textContent = '';
    try {
      const how = await sendMail({id, name, email, topic, text, subject: `Luxorides: обращение №${id} — ${topic}`});
      all.push({id, name, email, topic, text, t: Date.now()});
      safeSet('luxorides_support', JSON.stringify(all));
      sForm.text.value = '';
      sMsg.textContent = how === 'sent' ? `Обращение №${id} отправлено. Ответ придёт на ${email}.`
        : 'Открылось готовое письмо в вашей почтовой программе — нажмите в ней «Отправить». Ответ придёт на ' + email + '.';
      sMsg.classList.add('is-ok');
      renderTickets();
      // После отправки возвращаем человека на сайт: закрываем чат и прокручиваем страницу к началу
      setTimeout(() => {
        setOpen(false);
        window.scrollTo({top: 0, behavior: 'smooth'});
        switchTab('ai');
      }, 2500);
    } catch (err) {
      sMsg.textContent = 'Не удалось отправить сообщение. Проверьте интернет и попробуйте ещё раз.';
      sMsg.classList.add('is-error');
    } finally {
      btn.disabled = false; btn.textContent = 'Отправить в поддержку';
    }
  });

  /* ---------- Вкладки, открытие, размер ---------- */
  function switchTab(name) {
    box.querySelectorAll('.lx-tab').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    box.querySelectorAll('.lx-pane').forEach(p => p.classList.toggle('is-active', p.dataset.pane === name));
    if (name === 'support') fillSupport(); else input.focus();
  }
  box.querySelectorAll('.lx-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  let greeted = false;
  function setOpen(on) {
    box.classList.toggle('is-open', on); fab.classList.toggle('is-open', on); fab.setAttribute('aria-expanded', on);
    fab.setAttribute('aria-label', on ? 'Закрыть чат' : 'Открыть чат');
    if (on) {
      if (!greeted) {
        greeted = true;
        say('Здравствуйте! Я помощник Luxorides. Расскажите, какую машину ищете: для чего она нужна, сколько человек поедет, какой стиль нравится — подберу варианты.');
        setChips(START_CHIPS);
      }
      input.focus();
    }
  }
  fab.addEventListener('click', () => setOpen(!box.classList.contains('is-open')));
  box.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('is-open') && !document.querySelector('.modal.is-open')) setOpen(false); });

  // Размер: по умолчанию 1/4 экрана (половина ширины × половина высоты), дальше меняется мышью
  const MIN_W = 320, MIN_H = 400;
  const clampSize = (w, h) => [
    Math.max(MIN_W, Math.min(w, window.innerWidth - 32)),
    Math.max(MIN_H, Math.min(h, window.innerHeight - 120))
  ];
  function applySize(w, h) { const [cw, ch] = clampSize(w, h); box.style.width = cw + 'px'; box.style.height = ch + 'px'; }
  try {
    const saved = JSON.parse(safeGet('luxorides_chat_size') || 'null');
    if (saved && window.innerWidth > 600) applySize(saved.w, saved.h);
  } catch (e) {}
  window.addEventListener('resize', () => { if (box.style.width && window.innerWidth > 600) applySize(box.offsetWidth, box.offsetHeight); });

  box.querySelectorAll('.lx-rs').forEach(h => {
    h.addEventListener('pointerdown', e => {
      e.preventDefault();
      const mode = h.dataset.rs, sx = e.clientX, sy = e.clientY, sw = box.offsetWidth, sh = box.offsetHeight;
      h.setPointerCapture(e.pointerId);
      const move = ev => {
        const w = mode.includes('l') ? sw + (sx - ev.clientX) : sw;
        const hh = mode.includes('t') ? sh + (sy - ev.clientY) : sh;
        applySize(w, hh);
      };
      const up = () => {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        safeSet('luxorides_chat_size', JSON.stringify({w: box.offsetWidth, h: box.offsetHeight}));
      };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
  });
})();
