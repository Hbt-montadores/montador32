// public/pwa-installer.js - Versão 2 (Comunicação via Classe CSS)
// Este script centraliza a lógica de instalação do PWA.

let deferredPrompt; // Guarda o evento para ser usado mais tarde

// Ouve o evento que o navegador dispara quando o app é instalável
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('Evento "beforeinstallprompt" capturado.');
  // Previne que o mini-infobar padrão do navegador apareça
  e.preventDefault();
  // Guarda o evento
  deferredPrompt = e;

  // SINALIZA PARA OS OUTROS SCRIPTS QUE O APP É INSTALÁVEL
  // Adiciona a classe 'installable' ao body da página.
  document.body.classList.add('installable');

  // Procura por QUALQUER botão com o id 'install-button' na página e o torna visível
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
  }
});
