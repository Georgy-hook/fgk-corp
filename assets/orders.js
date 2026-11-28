import { onLocaleChange } from './i18n.js';
import { updateContact, contactProblem } from './order/channels.js';
import { mountChoices, selectedLabels } from './order/choices.js';
import { t } from './order/messages.js';
import { orderBody, relay, sendOrder } from './order/submission.js';
import { mountOrderFields } from './order/view.js';

function mountOrder(form) {
  const view = mountOrderFields(form, relay);
  const choices = mountChoices(form, t);
  const { contact, channel } = form.elements;
  let sending = false;
  let notice = null;

  function refreshStatus() {
    const vars =
      notice?.key === 'accepted' ? selectedLabels(notice.product, notice.finish, t) : notice?.vars;
    const text = notice ? t(notice.key, vars) : '';
    view.showStatus(text, notice?.state || '');
    view.setValidation(notice?.field === 'contact' ? text : '');
  }

  function announce(next = null) {
    notice = next;
    refreshStatus();
  }

  function refreshButton() {
    view.setSending(sending, Boolean(choices.current()), t);
  }

  function translate() {
    view.translate(t);
    choices.translate();
    updateContact(form, t);
    refreshButton();
    refreshStatus();
  }

  window.addEventListener('fgk:catalog', ({ detail }) => {
    if (!Array.isArray(detail)) return;
    choices.load(detail);
    refreshButton();
    if (!choices.current()) announce({ key: 'catalogError', state: 'error' });
    else if (notice?.key === 'catalogError') announce();
  });
  window.addEventListener('fgk:order-model', ({ detail }) => {
    if (!detail?.slug || !detail.name) return;
    choices.select(detail);
    refreshButton();
    if (notice?.key === 'catalogError') announce();
  });
  channel.addEventListener('change', () => updateContact(form, t));
  form.addEventListener('input', () => {
    if (!sending && notice) announce();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const product = choices.current();
    if (sending || !product) return;
    const problem = contactProblem(contact);
    if (problem) {
      announce({ key: problem, state: 'error', field: 'contact' });
      contact.focus();
      return;
    }

    const finish = form.elements.color.value;
    const body = orderBody(form, product.name);
    sending = true;
    refreshButton();
    announce({ key: 'sendingStatus' });
    const result = await sendOrder(body);
    sending = false;
    refreshButton();
    if (result.key === 'accepted') {
      view.clearPersonalData();
      announce({ key: 'accepted', state: 'success', product, finish });
    } else {
      announce({ key: result.key, state: 'error', vars: { code: result.code } });
    }
  });

  onLocaleChange(translate);
  translate();
}

const form = document.querySelector('#order-form');
if (form) mountOrder(form);
