const PAYPAL_URL = 'https://www.paypal.com/paypalme/chrisdejoya';

export function createDonateButton() {
  const button = document.createElement('a');
  button.className = 'donateButton';
  button.href = PAYPAL_URL;
  button.target = '_blank';
  button.rel = 'noopener noreferrer';
  button.setAttribute('aria-label', 'Support Trailpad');
  button.innerHTML = '<span class="donateButtonLabel">Support Trailpad</span><img src="images/donate.svg" alt="">';

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