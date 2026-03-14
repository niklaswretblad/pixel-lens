const btn = document.getElementById('toggle-btn');
const label = btn.querySelector('.btn-label');

chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
  if (response?.active) {
    label.textContent = 'Disable';
    btn.classList.add('active');
  }
});

btn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'toggle' });
  const isActive = btn.classList.toggle('active');
  label.textContent = isActive ? 'Disable' : 'Enable';
});
