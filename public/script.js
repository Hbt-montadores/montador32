// public/script.js - Versão Definitiva com Correção de Escopo e Log

// ===================================================================
// SEÇÃO 1: LOGGING DE ERROS DO CLIENTE E SERVICE WORKER
// ===================================================================

/**
 * Envia uma mensagem de erro para o servidor para registro nos logs.
 * @param {string} level - O nível do log (ex: 'error', 'info').
 * @param {string} message - A mensagem de erro detalhada.
 */
function logErrorToServer(level, message) {
  // Garante que 'level' e 'message' tenham valores padrão se forem indefinidos.
  const errorLevel = level || 'error';
  const errorMessage = message || 'Mensagem de erro não fornecida.';

  try {
    // sendBeacon é ideal para enviar logs antes de o usuário sair da página
    navigator.sendBeacon('/api/log-error', JSON.stringify({ level: errorLevel, message: errorMessage }));
  } catch (e) {
    // Fallback para fetch caso sendBeacon não seja suportado
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: errorLevel, message: errorMessage }),
      keepalive: true // Garante que a requisição continue mesmo se a página for fechada
    }).catch(console.error); // Log local se a API de log falhar
  }
}

/**
 * Captura global de erros de JavaScript não tratados na página.
 */
window.onerror = function(message, source, lineno, colno, error) {
  const errorMessage = `Erro não capturado: ${message} em ${source}:${lineno}:${colno}. Stack: ${error ? error.stack : 'N/A'}`;
  logErrorToServer('error', errorMessage);
  return false; // Permite que o erro também apareça no console do navegador
};

// Registra o Service Worker
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
let installButton; 

const longSermonMessages = [
    "Consultando as referências e o contexto bíblico...",
    "Estruturando a espinha dorsal da sua mensagem...",
    "Definindo os pontos principais e a sequência lógica...",
    "Esboçando a introdução para capturar a atenção...",
    "Aprofundando na exegese para uma base sólida...",
    "Desenvolvendo cada ponto com clareza e profundidade...",
    "Buscando ilustrações e aplicações práticas...",
    "Construindo uma conclusão impactante para sua mensagem...",
    "Quase pronto! Polindo os detalhes finais do seu sermão."
];

// Mapeia os elementos do DOM quando a página carrega
window.addEventListener('load', () => {
  if (document.getElementById('step-container')) {
    elements = {
        stepContainer: document.getElementById('step-container'),
        question: document.getElementById('question'),
        inputArea: document.getElementById('input-area'),
        userInput: document.getElementById('user-input'),
        options: document.getElementById('options'),
        loading: document.getElementById('loading'),
        loadingText: document.getElementById('loading-text'),
        sermonResult: document.getElementById('sermon-result'),
        errorContainer: document.getElementById('error-container')
    };
    
    installButton = document.getElementById('install-button');

    // Verifica periodicamente se o app se tornou instalável
    setInterval(() => {
        if (document.body.classList.contains('installable') && installButton && installButton.style.display === 'none') {
            installButton.style.display = 'block';
        }
    }, 1000);

    // Adiciona a lógica de clique ao botão de instalação persistente
    if (installButton) {
        installButton.addEventListener('click', async () => {
            // A variável 'deferredPrompt' é definida no escopo global pelo 'pwa-installer.js'
            if (window.deferredPrompt) {
                window.deferredPrompt.prompt();
                const { outcome } = await window.deferredPrompt.userChoice;
                logErrorToServer('info', `Resultado da instalação (app.html): ${outcome}`);
                if (outcome === 'accepted') {
                    installButton.style.display = 'none';
                    document.body.classList.remove('installable');
                }
                window.deferredPrompt = null;
            }
        });
    }

    startNewSermon();
  }
});

/**
 * Reseta a aplicação para o estado inicial.
 */
function startNewSermon() {
  currentStep = 1;
  if (!elements || !elements.question) return;

  elements.question.innerText = 'Qual será o tema do seu sermão?';
  elements.userInput.value = '';
  elements.options.innerHTML = '';
  
  elements.stepContainer.style.display = 'block';
  elements.inputArea.style.display = 'block';
  elements.options.style.display = 'none';
  elements.sermonResult.style.display = 'none';
  elements.loading.style.display = 'none';
  elements.errorContainer.style.display = 'none';

  if (elements.loadingText) elements.loadingText.textContent = "Gerando sermão, por favor aguarde...";
  clearInterval(loadingInterval);

  // Ao resetar, mostra o botão de instalar se a oportunidade ainda existir
  if (installButton && document.body.classList.contains('installable')) {
    installButton.style.display = 'block';
  }
}

/**
 * Lida com erros de fetch.
 */
function handleFetchError(error) {
    const errorMessage = `Erro na comunicação com o servidor: ${JSON.stringify(error)}`;
    logErrorToServer('error', errorMessage);

    elements.loading.style.display = 'none';
    elements.stepContainer.style.display = 'none';
    
    let errorHTML;
    if (error && error.renewal_url) {
        errorHTML = `
            <h2>Atenção!</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message}</p>
            <a href="${error.renewal_url}" target="_blank" class="action-button" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; font-size: 1.5em; border-radius: 8px; display: inline-block; margin-top: 10px;">LIBERAR ACESSO</a>
            <br><br><button onclick="startNewSermon()" style="margin-top: 20px;">Voltar ao Início</button>`;
    } else {
        errorHTML = `
            <h2>Ocorreu um Erro Inesperado</h2>
            <p>Não foi possível continuar. Por favor, verifique sua conexão ou tente novamente mais tarde.</p>
            <button onclick="startNewSermon()">Tentar Novamente</button>`;
    }

    elements.errorContainer.innerHTML = errorHTML;
    elements.errorContainer.style.display = 'block';
}

/**
 * Avança para o próximo passo do fluxo.
 */
function nextStep(response) {
  let userResponse = response;
  
  if (!userResponse) {
    if (elements.userInput && elements.userInput.value.trim() !== '') {
      userResponse = elements.userInput.value.trim();
    } else {
      alert("Por favor, insira o tema do sermão.");
      return;
    }
  }

  if (currentStep === 4) {
    generateSermon(userResponse);
    return;
  }
  
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'block';

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: currentStep, userResponse: userResponse })
  })
  .then(res => {
    elements.loading.style.display = 'none';
    if (!res.ok) { return res.json().then(err => { throw err; }); }
    return res.json();
  })
  .then(data => {
    if (data.question) {
      currentStep = data.step;
      displayQuestion(data);
    } else { throw new Error('Resposta inválida do servidor.'); }
  })
  .catch(handleFetchError);
}

/**
 * Exibe a próxima pergunta e as opções.
 */
function displayQuestion(data) {
  elements.question.innerText = data.question;
  elements.inputArea.style.display = 'none';
  
  elements.options.innerHTML = ''; 
  data.options.forEach(option => {
    const button = document.createElement('button');
    button.className = 'option-button';
    button.innerText = option;
    button.onclick = () => nextStep(option);
    elements.options.appendChild(button);
  });
  elements.options.style.display = 'block';
  elements.stepContainer.style.display = 'block';
}

/**
 * Função final que gera o sermão.
 */
function generateSermon(userResponse) {
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'block';

  // Esconde o botão de instalar para não poluir a tela do sermão
  if (installButton) {
    installButton.style.display = 'none';
  }

  const longSermonTriggers = ["Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"];
  if (longSermonTriggers.includes(userResponse)) {
    elements.loadingText.textContent = "Você escolheu um sermão mais longo. A preparação pode levar um pouco mais de tempo...";
    
    let messageIndex = 0;
    setTimeout(() => {
        elements.loadingText.textContent = longSermonMessages[messageIndex];
        loadingInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % longSermonMessages.length;
            elements.loadingText.textContent = longSermonMessages[messageIndex];
        }, 7000); 
    }, 4000);
  } else {
    elements.loadingText.textContent = "Gerando seu sermão, por favor aguarde...";
  }

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 4, userResponse: userResponse })
  })
  .then(res => {
      clearInterval(loadingInterval);
      elements.loading.style.display = 'none';
      if (!res.ok) { return res.json().then(err => { throw err; }); }
      return res.json();
  })
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

/**
 * Salva o sermão como um arquivo de texto (.txt).
 */
function saveAsTxt() {
  const sermonContent = document.querySelector('.sermon-content');
  if (sermonContent) {
    const textToSave = sermonContent.innerText;
    const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'meu_sermao.txt';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logErrorToServer('info', 'Usuário salvou o sermão como .txt');
  } else {
    logErrorToServer('error', 'Falha ao encontrar .sermon-content para salvar como .txt');
  }
}
