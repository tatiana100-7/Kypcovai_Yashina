/* =====================================================
   Мои бронирования. Подключается на home.html ПОСЛЕ script.js
   (использует auth-core.js и данные state из script.js).
   • после успешной брони машина сохраняется в аккаунт пользователя;
   • кнопка «Забронировать» у такой машины превращается в
     «Вы забронировали этот авто» (в карточке и в окне характеристик);
   • кнопка «Мои брони» в шапке открывает список всех броней.
   ===================================================== */
(function () {
  if (typeof Auth === 'undefined' || !Auth.currentUser()) return;

  const BOOKED_TEXT = 'Вы забронировали этот авто';

  const cardsEl     = document.getElementById('cards');
  const carBook     = document.getElementById('carBook');
  const modal       = document.getElementById('bookingsModal');
  const listEl      = document.getElementById('bookingsList');
  const emptyEl     = document.getElementById('bookingsEmpty');
  const openBtn     = document.getElementById('bookingsBtn');
  const countEl     = document.getElementById('bookingsCount');

  const cancelModal   = document.getElementById('cancelModal');
  const cancelCar     = document.getElementById('cancelCar');
  const cancelReasons = document.getElementById('cancelReasons');
  const cancelMsg     = document.getElementById('cancelMsg');
  const cancelOk      = document.getElementById('cancelOk');
  let cancelTarget = null;   // бронь, которую собираются отменить

  let booked = new Set();

  /* ---------- Подпись на кнопках ---------- */
  function markButton(btn, name, normalText) {
    const on = booked.has(Auth.bookingKey(name));
    btn.classList.toggle('is-booked', on);
    if (on) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
    btn.textContent = on ? BOOKED_TEXT : normalText;
  }

  function markAll() {
    const list = Auth.getBookings();
    booked = new Set(list.map(b => b.key));
    cardsEl.querySelectorAll('.card__btn').forEach(b => markButton(b, b.dataset.name || '', 'Забронировать'));
    if (carBook.dataset.name) markButton(carBook, carBook.dataset.name, 'Забронировать эту машину');
    countEl.textContent = String(list.length);
    countEl.hidden = list.length === 0;
  }

  // Уже забронированную машину повторно забронировать нельзя: клик по такой кнопке гасим
  document.addEventListener('click', e => {
    if (e.target.closest('.card__btn.is-booked, #carBook.is-booked')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // Карточки подгружаются и пересоздаются в script.js — помечаем новые
  new MutationObserver(markAll).observe(cardsEl, {childList: true});
  // Окно характеристик: script.js каждый раз записывает название машины в data-name
  new MutationObserver(markAll).observe(carBook, {attributes: true, attributeFilter: ['data-name']});

  /* ---------- Сохранение брони после успешной отправки формы ---------- */
  function findCar(name) {
    const key = Auth.bookingKey(name);
    try {
      for (const car of state.cars.values()) if (Auth.bookingKey(car.name) === key) return car;
    } catch (e) {}
    return {name};
  }

  // Слушатель в фазе перехвата срабатывает раньше обработчиков script.js: запоминаем машину
  // до очистки формы, а результат проверки читаем уже после них.
  document.addEventListener('submit', e => {
    const form = e.target;
    let name, msg;
    if (form.id === 'bookingForm') {
      name = document.getElementById('carSelect').value;
      msg = document.getElementById('formMsg');
    } else if (form.id === 'modalForm') {
      name = document.getElementById('modalTitle').textContent.replace(/^Забронировать:\s*/, '');
      msg = document.getElementById('modalMsg');
    } else return;

    setTimeout(() => {
      if (!name || !msg.classList.contains('is-ok')) return;   // форма не прошла проверку
      try { Auth.addBooking(findCar(name)); } catch (err) { return; }
      markAll();
      renderList();
    }, 0);
  }, true);

  /* ---------- Окно «Мои брони» ---------- */
  function renderList() {
    const items = Auth.getBookings().slice().reverse();   // новые сверху
    listEl.innerHTML = '';
    emptyEl.hidden = items.length > 0;
    items.forEach(b => {
      const li = document.createElement('li');
      li.className = 'mybookings__item';
      if (b.img) {
        const img = document.createElement('img');
        img.className = 'mybookings__img';
        img.alt = b.name;
        img.addEventListener('error', () => img.remove());
        img.src = b.img;
        li.append(img);
      }
      const info = document.createElement('div');
      info.className = 'mybookings__info';
      const name = document.createElement('span');
      name.className = 'mybookings__name';
      name.textContent = b.name;
      const date = document.createElement('span');
      date.className = 'mybookings__date';
      date.textContent = 'Забронировано: ' + new Date(b.date).toLocaleDateString('ru-RU');
      info.append(name, date);

      // Отмена брони: после подтверждения машина убирается из списка, а кнопка на карточке снова «Забронировать»
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'mybookings__cancel';
      cancel.textContent = 'Отменить';
      cancel.addEventListener('click', () => openCancel(b));

      li.append(info, cancel);
      listEl.append(li);
    });
  }

  const openList = () => {
    renderList();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  };
  const closeList = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  };

  openBtn.addEventListener('click', openList);
  document.getElementById('bookingsClose').addEventListener('click', closeList);
  modal.addEventListener('click', e => { if (e.target === modal) closeList(); });
  /* ---------- Окно «Вы уверены в отмене?» ---------- */
  function openCancel(b) {
    cancelTarget = b;
    cancelCar.textContent = b.name;
    cancelReasons.querySelectorAll('input').forEach(i => { i.checked = false; });
    cancelMsg.textContent = '';
    cancelModal.classList.add('is-open');
    cancelModal.setAttribute('aria-hidden', 'false');
    cancelReasons.querySelector('input').focus();
  }
  // Закрыть окно = передумать: бронь остаётся как есть
  function closeCancel() {
    cancelTarget = null;
    cancelModal.classList.remove('is-open');
    cancelModal.setAttribute('aria-hidden', 'true');
  }

  cancelReasons.addEventListener('change', () => { cancelMsg.textContent = ''; });

  cancelOk.addEventListener('click', () => {
    const reason = cancelReasons.querySelector('input:checked');
    if (!reason) { cancelMsg.textContent = 'Выберите причину отмены'; return; }
    if (!cancelTarget) return;
    try { Auth.removeBooking(cancelTarget.key); } catch (err) { return; }
    // Причина (reason.value) пока нигде не сохраняется: сервера нет.
    // Когда он появится, её можно отправить здесь: fetch('/api/cancel', {method:'POST', body: ...})
    closeCancel();
    markAll();
    renderList();
  });
  document.getElementById('cancelClose').addEventListener('click', closeCancel);
  document.getElementById('cancelDismiss').addEventListener('click', closeCancel);
  cancelModal.addEventListener('click', e => { if (e.target === cancelModal) closeCancel(); });

  // Escape: если открыто окно отмены — закрываем только его (бронь остаётся), иначе список броней
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (cancelModal.classList.contains('is-open')) closeCancel(); else closeList();
  });

  markAll();
})();
