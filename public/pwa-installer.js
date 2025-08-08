// public/pwa-installer.js - Versão 4 (Autossuficiente)

// Esta variável guardará o evento para que possa ser usado quando o botão for clicado.
let deferredPrompt;

// Ouve o evento que o navegador dispara quando o app é instalável.
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('Evento "beforeinstallprompt" capturado.');
  e.preventDefault(); // Impede o pop-up padrão do navegador.
  deferredPrompt = e; // Guarda o evento.

  // Encontra o botão de instalação na página.
  const installButton = document.getElementById('install-button');
  if (installButton) {
    // Torna o botão visível para o usuário.
    installButton.style.display = 'block';

    // Adiciona a lógica de clique diretamente aqui.
    installButton.addEventListener('click', async () => {
      // Esconde o botão para que não seja clicado novamente.
      installButton.style.display = 'none';
      
      if (deferredPrompt) {
        // Mostra o prompt de instalação nativo do navegador.
        deferredPrompt.prompt();
        // Espera pela escolha do usuário.
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Resultado da instalação: ${outcome}`);
        // Limpa a referência, pois o evento só pode ser usado uma vez.
        deferredPrompt = null;
      }
    });
  }
});
