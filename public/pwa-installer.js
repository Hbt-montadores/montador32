// public/pwa-installer.js - Versão 2 (Comunicação via Classe CSS)

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  console.log('Evento "beforeinstallprompt" capturado.');
  e.preventDefault();
  deferredPrompt = e;

  // SINALIZA PARA OS OUTROS SCRIPTS QUE O APP É INSTALÁVEL
  // Adiciona a classe 'installable' ao body da página.
  document.body.classList.add('installable');

  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
  }
});
