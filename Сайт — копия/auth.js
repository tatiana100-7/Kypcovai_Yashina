/* Логика страницы входа и регистрации (использует auth-core.js) */

// Уже вошли — сразу открываем сайт с автомобилями
if (Auth.currentUser()) location.replace('home.html');

const tabLogin     = document.getElementById('tabLogin');
const tabRegister  = document.getElementById('tabRegister');
const loginForm    = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const REDIRECT_URL   = 'home.html';   // страница с автомобилями и бронированием
const REDIRECT_DELAY = 600;

/* ---------- Переключение вкладок ---------- */
function showTab(mode) {
  const isLogin = mode !== 'register';
  tabLogin.classList.toggle('is-active', isLogin);
  tabRegister.classList.toggle('is-active', !isLogin);
  tabLogin.setAttribute('aria-selected', String(isLogin));
  tabRegister.setAttribute('aria-selected', String(!isLogin));
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  history.replaceState(null, '', isLogin ? '#login' : '#register');
  clearErrors(loginForm); clearErrors(registerForm);
}
tabLogin.addEventListener('click', () => showTab('login'));
tabRegister.addEventListener('click', () => showTab('register'));
document.querySelectorAll('[data-go]').forEach(btn =>
  btn.addEventListener('click', () => showTab(btn.dataset.go)));

/* ---------- Показать / скрыть пароль ---------- */
document.querySelectorAll('.auth-pass__eye').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Скрыть' : 'Показать';
  });
});

/* ---------- Ошибки ---------- */
function clearErrors(form) {
  form.querySelectorAll('[data-error]').forEach(el => el.textContent = '');
  form.querySelectorAll('.is-error').forEach(el => el.classList.remove('is-error'));
  const msg = form.querySelector('[data-msg]');
  msg.textContent = ''; msg.className = 'auth-form__msg';
}
function setError(form, field, text) {
  form.querySelector(`[data-error="${field}"]`).textContent = text;
  form.elements[field].classList.add('is-error');
}
function setMessage(form, text, ok) {
  const msg = form.querySelector('[data-msg]');
  msg.textContent = text;
  msg.className = 'auth-form__msg ' + (ok ? 'is-ok' : 'is-error');
}

const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const phoneOk = v => v.replace(/\D/g, '').length >= 10;

/* ---------- Защита от перебора: блокировка после неудачных попыток ---------- */
const LOCK_KEY  = 'luxorides_login_lock';
const MAX_FAILS = 5;         // столько неверных паролей подряд
const LOCK_MS   = 60 * 1000; // и вход блокируется на минуту
const readLock  = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || {fails: 0, until: 0}; } catch (e) { return {fails: 0, until: 0}; } };
const writeLock = v => { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch (e) {} };
const lockLeft  = () => Math.max(0, Math.ceil((readLock().until - Date.now()) / 1000));

let lockTimer;
function showLock() {
  clearInterval(lockTimer);
  const btn = loginForm.querySelector('.auth-form__btn');
  const tick = () => {
    const left = lockLeft();
    if (left > 0) {
      btn.disabled = true;
      setMessage(loginForm, `Слишком много неудачных попыток. Повторите через ${left} сек.`, false);
    } else {
      clearInterval(lockTimer);
      btn.disabled = false;
      clearErrors(loginForm);
    }
  };
  tick();
  if (lockLeft() > 0) lockTimer = setInterval(tick, 1000);
}

/* ---------- Вход ---------- */
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (lockLeft() > 0) { showLock(); return; }
  clearErrors(loginForm);
  const f = loginForm.elements;
  let valid = true;
  if (!emailOk(f.email.value)) { setError(loginForm, 'email', 'Введите корректный email'); valid = false; }
  if (!f.password.value)       { setError(loginForm, 'password', 'Введите пароль'); valid = false; }
  if (!valid) return;

  const btn = loginForm.querySelector('.auth-form__btn');
  btn.disabled = true;
  try {
    await Auth.login(f.email.value, f.password.value, f.remember.checked);
    writeLock({fails: 0, until: 0});
    setMessage(loginForm, 'Вы вошли! Переходим на сайт…', true);
    setTimeout(() => location.href = REDIRECT_URL, REDIRECT_DELAY);
  } catch (err) {
    const lock = readLock();
    lock.fails++;
    if (lock.fails >= MAX_FAILS) { lock.fails = 0; lock.until = Date.now() + LOCK_MS; }
    writeLock(lock);
    if (lockLeft() > 0) { showLock(); return; }
    setMessage(loginForm, `Неверный email или пароль (попыток до блокировки: ${MAX_FAILS - lock.fails})`, false);
    btn.disabled = false;
  }
});

/* ---------- Регистрация ---------- */
registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearErrors(registerForm);
  const f = registerForm.elements;
  let valid = true;
  if (f.name.value.trim().length < 2)  { setError(registerForm, 'name', 'Введите имя (минимум 2 символа)'); valid = false; }
  else if (Auth.hasProfanity(f.name.value)) { setError(registerForm, 'name', 'В имени нельзя использовать нецензурные слова'); valid = false; }
  if (!emailOk(f.email.value))         { setError(registerForm, 'email', 'Введите корректный email'); valid = false; }
  if (!phoneOk(f.phone.value))         { setError(registerForm, 'phone', 'Введите телефон (минимум 10 цифр)'); valid = false; }
  const age = Auth.ageOf(f.birth.value);
  if (isNaN(age))                      { setError(registerForm, 'birth', 'Укажите корректную дату рождения'); valid = false; }
  else if (age < Auth.MIN_AGE)         { setError(registerForm, 'birth', 'Регистрация доступна только с 18 лет'); valid = false; }
  if (f.password.value.length < 6)     { setError(registerForm, 'password', 'Пароль — минимум 6 символов'); valid = false; }
  if (f.password2.value !== f.password.value) { setError(registerForm, 'password2', 'Пароли не совпадают'); valid = false; }
  if (!valid) return;

  const btn = registerForm.querySelector('.auth-form__btn');
  btn.disabled = true;
  try {
    await Auth.register({
      name: f.name.value, email: f.email.value,
      phone: f.phone.value, birth: f.birth.value, password: f.password.value
    });
    setMessage(registerForm, 'Аккаунт создан! Переходим на сайт…', true);
    setTimeout(() => location.href = REDIRECT_URL, REDIRECT_DELAY);
  } catch (err) {
    if (err.message === 'exists') setError(registerForm, 'email', 'Пользователь с таким email уже существует');
    else if (err.message === 'profanity') setError(registerForm, 'name', 'В имени нельзя использовать нецензурные слова');
    else if (err.message === 'underage') setError(registerForm, 'birth', 'Регистрация доступна только с 18 лет');
    else if (err.message === 'birth') setError(registerForm, 'birth', 'Укажите корректную дату рождения');
    else setMessage(registerForm, 'Не удалось создать аккаунт. Проверьте настройки браузера (localStorage).', false);
    btn.disabled = false;
  }
});

/* ---------- Возраст рядом с датой рождения ---------- */
const birthInput = registerForm.elements.birth;
birthInput.max = new Date().toISOString().slice(0, 10);
birthInput.addEventListener('input', () => {
  const age = Auth.ageOf(birthInput.value);
  registerForm.querySelector('[data-age]').textContent = isNaN(age) ? '' : 'Ваш возраст: ' + age;
});

showTab(location.hash === '#register' ? 'register' : 'login');
if (lockLeft() > 0) showLock();
