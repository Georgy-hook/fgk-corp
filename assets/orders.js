const relay = 'https://fgk-corp-orders.netlify.app/';
const form = document.querySelector('#order-form');

if (form) {
  form.classList.add('order-form');
  form.method = 'post';
  form.action = relay;
  form.innerHTML = `
    <fieldset class="order-fields" aria-label="Параметры заявки">
      <label>Модель
        <select name="model" id="order-model" required disabled>
          <option value="">Загружаем каталог…</option>
        </select>
      </label>
      <label>Окрас
        <span class="order-finish">
          <span class="order-swatch" aria-hidden="true" hidden></span>
          <select name="color" id="order-color" required disabled>
            <option value="">Сначала выберите модель</option>
          </select>
        </span>
      </label>
      <label>Способ связи
        <select name="channel">
          <option>Telegram</option>
          <option value="ВКонтакте">ВКонтакте</option>
          <option value="Почта">Электронная почта</option>
        </select>
      </label>
      <label><span id="order-contact-label">Имя или ссылка в Telegram</span>
        <input name="contact" type="text" autocomplete="off" autocapitalize="none"
          spellcheck="false" maxlength="160" required>
      </label>
      <details class="order-more">
        <summary>Добавить пожелания к заказу</summary>
        <label>Как к вам обращаться (необязательно)
          <input name="name" autocomplete="name" maxlength="100">
        </label>
        <label>Комментарий (необязательно)
          <textarea name="message" rows="3" maxlength="2000" placeholder="Например, нужное количество или детали окраса"></textarea>
        </label>
      </details>
    </fieldset>
    <label hidden>Оставьте это поле пустым
      <input name="company-website" tabindex="-1" autocomplete="off">
    </label>
    <p class="order-privacy">Контакт передаётся через Netlify Forms только для ответа на заявку.</p>
    <button class="order-submit" type="submit" disabled>Отправить заявку</button>
    <p class="order-status" role="status" aria-atomic="true"></p>
  `;

  const channels = {
    Telegram: { label: 'Имя или ссылка в Telegram', placeholder: '@username или t.me/username' },
    ВКонтакте: { label: 'Профиль ВКонтакте', placeholder: 'vk.com/username' },
    Почта: { label: 'Электронная почта', placeholder: 'name@example.com' },
  };
  const { model, color, channel, contact } = form.elements;
  const fields = form.querySelector('fieldset');
  const status = form.querySelector('.order-status');
  const button = form.querySelector('.order-submit');
  const swatch = form.querySelector('.order-swatch');
  const products = new Map();
  let sending = false;

  function announce(text = '', state = '') {
    status.dataset.state = state;
    status.textContent = text;
  }

  function updateChannel() {
    const detail = channels[channel.value];
    const email = channel.value === 'Почта';
    form.querySelector('#order-contact-label').textContent = detail.label;
    contact.type = email ? 'email' : 'text';
    contact.inputMode = email ? 'email' : 'text';
    contact.autocomplete = email ? 'email' : 'off';
    contact.placeholder = detail.placeholder;
    contact.setCustomValidity('');
  }

  function updateSwatch() {
    const hex = products.get(model.value)?.colors.find((entry) => entry.name === color.value)?.hex;
    swatch.hidden = !/^#[\da-f]{6}$/i.test(hex || '');
    swatch.style.backgroundColor = swatch.hidden ? '' : hex;
  }

  function selectModel(slug, preferredColor) {
    model.value = slug;
    const product = products.get(slug);
    model.disabled = !product;
    color.disabled = !product;
    const choices = product?.colors.map((entry) => entry.name) || [];
    if (product && !choices.length) choices.push('Обсудим в переписке');
    color.replaceChildren(...choices.map((name) => new Option(name, name)));
    if (!product) color.add(new Option('Нет вариантов', ''));
    if (choices.includes(preferredColor)) color.value = preferredColor;
    updateSwatch();
    button.disabled = sending || !product;
  }

  function addProduct({ slug, name, colors = [] }) {
    if (!slug || !name) return;
    if (!products.has(slug)) model.add(new Option(name, slug));
    products.set(slug, { name, colors: colors.filter((entry) => entry?.name) });
  }

  window.addEventListener('fgk:catalog', ({ detail }) => {
    if (!Array.isArray(detail)) return;
    const previousSlug = model.value;
    const previousColor = color.value;
    products.clear();
    model.replaceChildren();
    detail.forEach(addProduct);
    if (!products.size) model.add(new Option('Каталог недоступен', ''));
    selectModel(products.has(previousSlug) ? previousSlug : model.value, previousColor);
    if (!products.size) announce('Каталог недоступен. Чтобы выбрать модель, попробуйте обновить страницу.', 'error');
    else if (!previousSlug) announce();
  });

  window.addEventListener('fgk:order-model', ({ detail }) => {
    if (!detail?.name || !detail.slug) return;
    if (!products.has(detail.slug)) {
      if (!products.size) model.replaceChildren();
      addProduct(detail);
    }
    const choices = products.get(detail.slug).colors;
    if (detail.color && !choices.some((entry) => entry.name === detail.color)) {
      choices.push({ name: detail.color, hex: detail.colorHex });
    }
    selectModel(detail.slug, detail.color);
  });

  model.addEventListener('change', () => selectModel(model.value));
  color.addEventListener('change', updateSwatch);
  channel.addEventListener('change', updateChannel);
  form.addEventListener('input', () => {
    contact.setCustomValidity('');
    if (!sending) announce();
  });
  updateChannel();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || !products.has(model.value)) return;
    const address = contact.value.trim();
    if (!address) contact.setCustomValidity('Укажите контакт для ответа.');
    if (!form.reportValidity()) return;

    const productName = products.get(model.value).name;
    const finish = color.value;
    const body = new URLSearchParams({
      'form-name': 'fgk-order',
      model: productName,
      color: finish,
      channel: channel.value,
      contact: address,
      email: channel.value === 'Почта' ? address : '',
      name: form.elements.namedItem('name').value.trim(),
      message: form.elements.namedItem('message').value.trim(),
      subject: 'FGK Corp — новая заявка',
      'company-website': form.elements.namedItem('company-website').value,
    });
    sending = true;
    fields.disabled = true;
    button.disabled = true;
    button.textContent = 'Отправляем…';
    announce('Отправляем заявку.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      // URLSearchParams sends a simple urlencoded POST. Netlify returns a success page, not a JSON receipt.
      const response = await fetch(relay, {
        method: 'POST',
        body,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        announce(`Сервис не принял заявку (код ${response.status}). Проверьте данные и попробуйте ещё раз.`, 'error');
      } else if (!response.ok) {
        throw new Error('Нет подтверждения приёма');
      } else {
        contact.value = '';
        form.elements.namedItem('name').value = '';
        form.elements.namedItem('message').value = '';
        announce(`Заявка принята: ${productName}, окрас — ${finish}. Условия обсудим по указанному контакту.`, 'success');
      }
    } catch {
      announce('Неизвестно, принята ли заявка. Проверьте соединение. Данные остались в форме; при повторной отправке возможен дубликат.', 'error');
    } finally {
      clearTimeout(timeout);
      sending = false;
      fields.disabled = false;
      button.disabled = !products.has(model.value);
      button.textContent = 'Отправить заявку';
    }
  });
}
