// public/script.js - Versão Definitiva com controle do botão de instalar

// ===================================================================
// SEÇÃO 1: LOGGING DE ERROS E SERVICE WORKER
// ===================================================================

function logErrorToServer(level, message) {
  try {
    navigator.sendBeacon('/api/log-error', JSON.stringify({ level, message }));
  } catch (e) {
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message }),
      keepalive: true
    }).catch(console.error);
  }
}

window.onerror = function(message, source, lineno, colno, error) {
  const errorMessage = `Erro não capturado: ${message} em ${source}:${lineno}:${colno}. Stack: ${error ? error.stack : 'N/A'}`;
  logErrorToServer('error', errorMessage);
  return false;
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registrado com sucesso no app.html.'))
      .catch(err => logErrorToServer('error', `Falha ao registrar Service Worker: ${err.message}`));
  });
}

// ===================================================================
// SEÇÃO 2: LÓGICA PRINCIPAL DA APLICAÇÃO
// ===================================================================

let currentStep = 1;
let elements = {};
let loadingInterval;
// ADICIONADO: Referência global para o botão de instalação
let installButton; 

const longSermonMessages = [ /* ... suas mensagens ... */ ];

window.addEventListener('load', () => {
  if (document.getElementById('step-container')) {
    elements = { /* ... seus elementos ... */ };
    // ADICIONADO: Encontra o botão de instalação no cabeçalho
    installButton = document.getElementById('install-button');

    // ADICIONADO: Verifica periodicamente se o app se tornou instalável
    // Isso garante que o botão apareça mesmo que o evento demore para ser capturado
    setInterval(() => {
        if(deferredPrompt && installButton && installButton.style.display === 'none') {
            installButton.style.display = 'block';
        }
    }, 1000);

    // ADICIONADO: Adiciona a lógica de clique ao botão de instalação persistente
    if (installButton) {
        installButton.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                logErrorToServer('info', `Resultado da instalação (app.html): ${outcome}`);
                if(outcome === 'accepted') {
                    installButton.style.display = 'none';
                }
                deferredPrompt = null;
            }
        });
    }

    startNewSermon();
  }
});

function startNewSermon() {
  currentStep = 1;
  /* ... resto da função startNewSermon ... */
  
  // ADICIONADO: Ao resetar, mostra o botão de instalar se a oportunidade ainda existir
  if (installButton && deferredPrompt) {
    installButton.style.display = 'block';
  }
}

/* ... as funções handleFetchError, nextStep, displayQuestion continuam as mesmas ... */

function generateSermon(userResponse) {
  /* ... sua lógica de mostrar o loading e as mensagens ... */

  // ADICIONADO: Esconde o botão de instalar para não poluir a tela do sermão
  if (installButton) {
    installButton.style.display = 'none';
  }

  fetch('/api/next-step', { /* ... */ })
  .then(res => { /* ... */ })
  .then(data => {
      if (data.sermon) {
          const formattedSermon = data.sermon.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
          elements.sermonResult.innerHTML = `
              <h2>Seu Sermão está Pronto!</h2>
              <div class="sermon-content">${formattedSermon}</div>
              <div class="sermon-actions">
                <button onclick="saveAsTxt()">Salvar como .txt</button>
                <button onclick="startNewSermon()">Criar Novo Sermão</button>
              </div>`;
          elements.sermonResult.style.display = 'block';
      } else { throw new Error('Resposta final inválida do servidor.'); }
  })
  .catch(handleFetchError);
}

/* ... a função saveAsTxt continua a mesma ... */
