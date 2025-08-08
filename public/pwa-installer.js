// public/pwa-installer.js - Versão 3 (Comunicação via Objeto Window)

// A variável deferredPrompt agora será anexada ao objeto 'window'
// para ser acessível por outros scripts na mesma página.

window.addEventListener('beforeinstallprompt', (e) => {
  console.log('Evento "beforeinstallprompt" capturado.');
  e.preventDefault();
  
  // Anexa o evento ao objeto window para torná-lo global
  window.deferredPrompt = e;

  // Adiciona uma classe ao body para que o CSS ou outros scripts possam reagir
  document.body.classList.add('installable');

  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
  }
});
