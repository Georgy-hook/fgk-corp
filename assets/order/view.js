// Mounted once. Locale updates touch caption text and hints, not the controls.
export function mountOrderFields(form, action) {
  form.classList.add('order-form');
  form.method = 'post';
  form.action = action;
  form.noValidate = true;
  form.innerHTML = `
    <fieldset class="order-fields">
      <label><span data-order-text="model"></span>
        <select name="model" id="order-model" required disabled><option value=""></option></select>
      </label>
      <label><span data-order-text="color"></span>
        <span class="order-finish">
          <span class="order-swatch" aria-hidden="true" hidden></span>
          <select name="color" id="order-color" required disabled><option value=""></option></select>
        </span>
      </label>
      <label><span data-order-text="channel"></span>
        <select name="channel">
          <option value="Telegram">Telegram</option>
          <option value="ВКонтакте" data-order-text="vk"></option>
          <option value="Почта" data-order-text="email"></option>
        </select>
      </label>
      <label><span id="order-contact-label"></span>
        <input name="contact" type="text" autocomplete="off" autocapitalize="none"
          spellcheck="false" maxlength="160" required>
      </label>
      <details class="order-more">
        <summary data-order-text="more"></summary>
        <label><span data-order-text="name"></span>
          <input name="name" autocomplete="name" maxlength="100">
        </label>
        <label><span data-order-text="comment"></span>
          <textarea name="message" rows="3" maxlength="2000"></textarea>
        </label>
      </details>
    </fieldset>
    <label hidden><span data-order-text="honeypot"></span>
      <input name="company-website" tabindex="-1" autocomplete="off">
    </label>
    <p class="order-privacy" data-order-text="privacy"></p>
    <button class="order-submit" type="submit" disabled></button>
    <p id="order-status" class="order-status" role="status" aria-atomic="true"></p>
  `;
  const captions = form.querySelectorAll('[data-order-text]');
  const fields = form.querySelector('.order-fields');
  const button = form.querySelector('.order-submit');
  const status = form.querySelector('.order-status');
  const { contact } = form.elements;
  return {
    translate(t) {
      captions.forEach((node) => {
        node.textContent = t(node.dataset.orderText);
      });
      fields.setAttribute('aria-label', t('fields'));
      form.elements.message.placeholder = t('commentHint');
    },
    showStatus(text, state) {
      status.dataset.state = state;
      status.textContent = text;
    },
    setValidation(text) {
      contact.setCustomValidity(text);
      if (text) {
        contact.setAttribute('aria-invalid', 'true');
        contact.setAttribute('aria-describedby', status.id);
      } else {
        contact.removeAttribute('aria-invalid');
        contact.removeAttribute('aria-describedby');
      }
    },
    setSending(sending, ready, t) {
      fields.disabled = sending;
      button.disabled = sending || !ready;
      button.textContent = t(sending ? 'sending' : 'submit');
    },
    clearPersonalData() {
      for (const key of ['contact', 'name', 'message']) form.elements.namedItem(key).value = '';
    },
  };
}
