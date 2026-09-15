const PAYPAL_URL = 'https://www.paypal.com/paypalme/chrisdejoya';

export function createDonateButton() {
  const button = document.createElement('a');
  button.className = 'donateButton';
  button.href = PAYPAL_URL;
  button.target = '_blank';
  button.rel = 'noopener noreferrer';
  button.setAttribute('aria-label', 'Support Trailpad');
  button.innerHTML = '<img src="images/donate.svg" alt="">';

  const panel = document.createElement('div');
  panel.className = 'donatePanel';
  panel.innerHTML = '<img src="images/qr-trailpad-icon.svg" alt="Trailpad donation QR code"><span>Support Trailpad</span>';
  document.body.appendChild(panel);

  let hideTimer = null;

  const showPanel = () => {
    clearTimeout(hideTimer);
    panel.classList.add('is-visible');
  };

  const hidePanel = () => {
    hideTimer = setTimeout(() => {
      panel.classList.remove('is-visible');
    }, 100);
  };

  button.addEventListener('mouseenter', showPanel);
  button.addEventListener('focus', showPanel);
  panel.addEventListener('mouseenter', showPanel);

  button.addEventListener('mouseleave', hidePanel);
  button.addEventListener('blur', hidePanel);
  panel.addEventListener('mouseleave', hidePanel);

  button.addEventListener('click', () => {
    button.classList.remove('is-clicked');
    void button.offsetWidth;
    button.classList.add('is-clicked');
  });

  return {
    element: button,
    show() {
      button.classList.remove('is-auto-hidden');
    },
    hide() {
      button.classList.add('is-auto-hidden');
    }
  };
}