/* Progressive enhancement: article links and sharing work without this script. */
const button = document.querySelector('[data-copy-url]');
if (button && navigator.clipboard) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const status = document.querySelector('.copy-status');
    try {
      await navigator.clipboard.writeText(button.dataset.copyUrl);
      status.textContent = 'Link copied.';
    } catch {
      status.textContent = 'Copy the permanent article link below.';
    }
  });
}
