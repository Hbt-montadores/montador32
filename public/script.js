// script.js - Versão 12.2 (Final com Logging de Erros no Servidor)

// ===================================================================
// NOVA SEÇÃO: LOGGING DE ERROS DO CLIENT-SIDE
// ===================================================================

/**
 * Envia uma mensagem de erro para o servidor para que possa ser registrada nos logs.
 * @param {string} level - O nível do erro (ex: 'error', 'info').
 * @param {string} message - A mensagem de erro detalhada.
 */
function logErrorToServer(level, message) {
  try {
    navigator.sendBeacon('/api/log-error', JSON.stringify({ level, message }));
  } catch (e) {
    // Fallback para fetch se sendBeacon não for suportado
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message }),
      keepalive: true
    }).catch(console.error);
  }
}

/**
 * "Rede de Segurança": Captura qualquer erro de JavaScript não tratado na página.
 */
window.onerror = function(message, source, lineno, colno, error) {
  const errorMessage = `Erro: ${message} no arquivo ${source}, linha ${lineno}, coluna ${colno}. Stack: ${error ? error.stack : 'N/A'}`;
  logErrorToServer('error', errorMessage);
  return false; // Permite que o erro também apareça no console do navegador para depuração local.
};

// ===================================================================
// FIM DA NOVA SEÇÃO
// ===================================================================


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registrado.'))
      .catch(err => logErrorToServer('error', `Falha ao registrar Service Worker: ${err.message}`));
  });
}

let currentStep = 1;
let elements;

window.addEventListener('load', () => {
  if (document.getElementById('step-container')) {
    elements = {
        stepContainer: document.getElementById('step-container'),
        question: document.getElementById('question'),
        inputArea: document.getElementById('input-area'),
        userInput: document.getElementById('user-input'),
        options: document.getElementById('options'),
        loading: document.getElementById('loading'),
        sermonResult: document.getElementById('sermonResult')
    };
    startNewSermon();
  }
});

function startNewSermon() {
  currentStep = 1;
  if (!elements || !elements.question) return;
  elements.question.innerText = 'Qual será o tema do seu sermão?';
  elements.userInput.value = '';
  elements.options.innerHTML = '';
  elements.inputArea.style.display = 'block';
  elements.options.style.display = 'none';
  elements.stepContainer.style.display = 'block';
  elements.sermonResult.style.display = 'none';
  elements.loading.style.display = 'none';
}

function handleFetchError(error) {
    const errorMessage = `Erro na comunicação com o servidor: ${JSON.stringify(error)}`;
    logErrorToServer('error', errorMessage);

    elements.loading.style.display = 'none';
    elements.stepContainer.style.display = 'none';
    
    if (error && error.error === "Limite de cortesia atingido.") {
        elements.sermonResult.innerHTML = `
            <h2>Atenção!</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message}</p>
            <a href="${error.renewal_url}" target="_blank" class="action-button" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; font-size: 1.5em; border-radius: 8px; display: inline-block; margin-top: 10px;">LIBERAR ACESSO</a>
            <br><br><button onclick="startNewSermon()" style="margin-top: 20px;">Voltar ao Início</button>`;
    } else {
        elements.sermonResult.innerHTML = `
            <h2>Ocorreu um Erro</h2>
            <p>Não foi possível continuar. Por favor, verifique sua conexão e tente novamente.</p>
            <button onclick="startNewSermon()">Tentar Novamente</button>`;
    }
    elements.sermonResult.style.display = 'block';
}

function nextStep(response) {
  let userResponse = response;
  
  if (!userResponse) {
    if (elements.userInput && elements.userInput.value.trim() !== '') {
      userResponse = elements.userInput.value.trim();
    } else { return; }
  }

  if (currentStep === 4) {
    generateSermon(userResponse);
    return;
  }

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: currentStep, userResponse: userResponse })
  })
  .then(response => {
    if (!response.ok) { return response.json().then(err => { throw err; }); }
    return response.json();
  })
  .then(data => {
    if (data.question) {
      currentStep = data.step;
      displayQuestion(data);
    } else { throw new Error('Resposta inválida do servidor.'); }
  })
  .catch(handleFetchError);
}

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
}

function generateSermon(userResponse) {
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'block';

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 4, userResponse: userResponse })
  })
  .then(response => {
      if (!response.ok) { return response.json().then(err => { throw err; }); }
      return response.json();
  })
  .then(data => {
      if (data.sermon) {
          const formattedSermon = data.sermon.replace(/\n/g, '<br>');
          elements.sermonResult.innerHTML = `
              <h2>Seu Sermão:</h2>
              <div class="sermon-content">${formattedSermon}</div>
              <button onclick="copySermon()">Copiar Sermão</button>
              <button onclick="startNewSermon()">Criar Novo Sermão</button>`;
          elements.sermonResult.style.display = 'block';
          elements.loading.style.display = 'none';
      } else { throw new Error('Resposta inválida do servidor.'); }
  })
  .catch(handleFetchError);
}

function copySermon() {
  const sermonContent = document.querySelector('.sermon-content');
  if (sermonContent) {
    const textToCopy = sermonContent.innerHTML.replace(/<br\s*[\/]?>/gi, "\n");
    navigator.clipboard.writeText(textToCopy)
      .then(() => alert('Sermão copiado para a área de transferência!'))
      .catch(err => logErrorToServer('error', `Falha ao copiar texto: ${err.message}`));
  }
}
