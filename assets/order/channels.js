// Option values belong to the existing relay contract; only their labels change.
const channels = {
  Telegram: { label: 'telegramContact', hint: 'telegramHint', type: 'text' },
  ВКонтакте: { label: 'vkContact', hint: 'vk.com/username', type: 'text' },
  Почта: { label: 'email', hint: 'name@example.com', type: 'email' },
};

export function updateContact(form, t) {
  const { channel, contact } = form.elements;
  const { label, hint, type } = channels[channel.value];
  form.querySelector('#order-contact-label').textContent = t(label);
  contact.placeholder = channel.value === 'Telegram' ? t(hint) : hint;
  // Changing the input type can move the caret. Locale changes never need it.
  if (contact.type !== type) {
    contact.type = type;
    contact.inputMode = type;
    contact.autocomplete = type === 'email' ? 'email' : 'off';
  }
}

export function contactProblem(contact) {
  if (!contact.value.trim()) return 'contactRequired';
  if (contact.validity.typeMismatch) return 'invalidEmail';
  return '';
}
