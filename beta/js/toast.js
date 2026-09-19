// Toast notifications for Trailpad.
//
// Owns showToast(); the #toast element is injected (it lives in index.html
// and is looked up in main.js).

export function createToast({ toastEl }) {
  function showToast(msg, dur = 1000, type = 'info') {
    toastEl.textContent = msg;
    toastEl.className = 'show ' + type;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.className = ''; }, dur);
  }

  return { showToast };
}
