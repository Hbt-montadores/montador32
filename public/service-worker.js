// service-worker.js - Versão 1.0

/**
 * Este é um service worker mínimo.
 * Sua principal função aqui é simplesmente existir e ser registrado com sucesso,
 * o que é um dos requisitos para que um site seja considerado um Progressive Web App (PWA)
 * e para que o navegador ofereça a opção "Adicionar à Tela Inicial".
 */

// O evento 'fetch' é disparado para cada requisição que a página faz (imagens, css, etc.).
self.addEventListener('fetch', (event) => {
  /**
   * Por enquanto, não vamos fazer cache offline.
   * A estratégia aqui é "network first": simplesmente pegamos a requisição original
   * e a passamos para a rede, como se o service worker não estivesse aqui.
   * Isso garante que o site funcione normalmente online.
   */
  event.respondWith(fetch(event.request));
});
