export const relay = 'https://fgk-corp-orders.netlify.app/';

export function orderBody(form, productName) {
  const value = (key) => form.elements.namedItem(key).value;
  const contact = value('contact').trim();
  return new URLSearchParams({
    'form-name': 'fgk-order',
    model: productName,
    color: value('color'),
    channel: value('channel'),
    contact,
    email: value('channel') === 'Почта' ? contact : '',
    name: value('name').trim(),
    message: value('message').trim(),
    subject: 'FGK Corp — новая заявка',
    'company-website': value('company-website'),
  });
}

export async function sendOrder(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    // Netlify confirms a form POST with an HTML success page, not a JSON receipt.
    const response = await fetch(relay, {
      method: 'POST',
      body,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (response.ok) return { key: 'accepted' };
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      return { key: 'rejected', code: response.status };
    }
    return { key: 'unconfirmed' };
  } catch {
    return { key: 'unconfirmed' };
  } finally {
    clearTimeout(timeout);
  }
}
