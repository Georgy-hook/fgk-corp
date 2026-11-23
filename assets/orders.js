const relay = 'https://fgk-corp-orders.netlify.app/';
const form = document.querySelector('#order-form');

if (form) {
  form.classList.add('order-form');
  form.innerHTML = `
    <div class="order-fields">
      <label>Имя
        <input name="name" autocomplete="name" maxlength="100" required>
      </label>
      <label>Способ связи
        <select name="channel">
          <option value="Почта">Почта</option>
          <option value="Telegram">Telegram</option>
          <option value="ВКонтакте">ВКонтакте</option>
        </select>
      </label>
      <label class="order-wide"><span id="order-contact-label">Электронная почта</span>
        <input name="contact" type="email" inputmode="email" autocomplete="email"
          maxlength="160" placeholder="name@example.com" required>
      </label>
      <label class="order-wide">Модель
        <select name="model" id="order-model">
          <option value="">Помогите выбрать модель</option>
        </select>
      </label>
      <label class="order-wide">Комментарий <span class="order-optional">· по желанию</span>
        <textarea name="message" rows="3" maxlength="2000" placeholder="Окрас, количество или другие детали"></textarea>
      </label>
    </div>
    <p id="order-color" class="order-color" hidden></p>
    <label hidden>Оставьте это поле пустым
      <input name="company-website" tabindex="-1" autocomplete="off">
    </label>
    <button type="submit" class="button button-accent order-submit">Отправить заявку</button>
    <p class="order-privacy">Указанный контакт передаётся через Netlify Forms и используется для ответа на заявку.</p>
    <p class="order-status" role="status" aria-live="polite"></p>
  `;

  const channels = {
    Почта: { label: 'Электронная почта', type: 'email', placeholder: 'name@example.com' },
    Telegram: { label: 'Имя в Telegram', type: 'text', placeholder: '@username или https://t.me/username' },
    ВКонтакте: { label: 'Профиль ВКонтакте', type: 'text', placeholder: 'https://vk.com/username' },
  };
  const channel = form.elements.namedItem('channel');
  const contact = form.elements.namedItem('contact');
  const model = form.elements.namedItem('model');
  const colorReading = form.querySelector('#order-color');
  const status = form.querySelector('.order-status');
  const button = form.querySelector('button');
  let color = '';

  function updateChannel() {
    const detail = channels[channel.value];
    form.querySelector('#order-contact-label').textContent = detail.label;
    contact.type = detail.type;
    contact.inputMode = detail.type;
    contact.autocomplete = detail.type === 'email' ? 'email' : 'off';
    contact.placeholder = detail.placeholder;
    contact.setCustomValidity('');
  }

  function showColor(next = '') {
    color = next;
    colorReading.hidden = !color;
    colorReading.textContent = color ? `Окрас: ${color}` : '';
  }

  function addModel({ slug, name }) {
    if (!slug || !name) return;
    if (!Array.from(model.options).some((option) => option.value === slug)) {
      model.add(new Option(name, slug));
    }
  }

  window.addEventListener('fgk:catalog', ({ detail }) => {
    if (Array.isArray(detail)) detail.forEach(addModel);
  });
  channel.addEventListener('change', updateChannel);
  contact.addEventListener('input', () => contact.setCustomValidity(''));
  model.addEventListener('change', () => showColor());
  window.addEventListener('fgk:order-model', ({ detail }) => {
    if (!detail?.name || !detail?.slug) return;
    addModel(detail);
    model.value = detail.slug;
    showColor(detail.color);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const values = new FormData(form);
    const contactValue = contact.value.trim();
    if (!contactValue) {
      contact.setCustomValidity('Укажите контакт для связи.');
      contact.reportValidity();
      return;
    }
    if (!String(values.get('name')).trim()) {
      const name = form.elements.namedItem('name');
      name.setCustomValidity('Укажите ваше имя.');
      name.addEventListener('input', () => name.setCustomValidity(''), { once: true });
      name.reportValidity();
      return;
    }
    const body = new URLSearchParams({
      'form-name': 'fgk-order',
      name: String(values.get('name')).trim(),
      contact: contactValue,
      email: channel.value === 'Почта' ? contactValue : '',
      channel: channel.value,
      model: model.selectedOptions[0]?.textContent || 'Помогите выбрать модель',
      color,
      message: String(values.get('message')).trim(),
      subject: 'FGK Corp — новая заявка',
      'company-website': String(values.get('company-website')),
    });
    button.disabled = true;
    button.textContent = 'Отправляем…';
    status.dataset.state = '';
    status.textContent = 'Отправляем заявку.';
    try {
      const response = await fetch(relay, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) throw new Error('Order was rejected');
      form.reset();
      updateChannel();
      showColor();
      status.textContent = 'Заявка принята. Мы свяжемся с вами по указанному контакту.';
      status.dataset.state = 'success';
    } catch {
      status.textContent = 'Не удалось отправить заявку. Проверьте подключение и попробуйте ещё раз.';
      status.dataset.state = 'error';
    } finally {
      button.disabled = false;
      button.textContent = 'Отправить заявку';
    }
  });
}
