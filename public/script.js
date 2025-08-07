// script.js - Versão 11.0 (Definitiva e Completa)

// 1. REGISTRO DO SERVICE WORKER (PARA FUNCIONALIDADE PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker registrado com sucesso:', registration);
      })
      .catch(error => {
        console.error('Falha ao registrar Service Worker:', error);
      });
  });
}

// 2. ESTADO DA APLICAÇÃO
let currentStep = 1;

// 3. INICIALIZAÇÃO QUANDO O DOCUMENTO ESTIVER PRONTO
document.addEventListener('DOMContentLoaded', () => {
  startNewSermon();
});


// 4. FUNÇÕES DE MANIPULAÇÃO DA INTERFACE

/**
 * Reseta a interface para o estado inicial, pronto para criar um novo sermão.
 */
function startNewSermon() {
  currentStep = 1;

  const stepContainer = document.getElementById('step-container');
  const sermonResult = document.getElementById('sermonResult');
  const loadingDiv = document.getElementById('loading');
  
  stepContainer.innerHTML = `
    <h2 id="question">Qual será o tema do seu sermão?</h2>
    <div class="input-area">
      <input type="text" id="user-input" placeholder="Ex: A Parábola do Filho Pródigo" onkeydown="if(event.key==='Enter') nextStep()">
      <button onclick="nextStep()">Próximo</button>
    </div>
    <div id="options"></div>
  `;

  stepContainer.style.display = 'block';
  sermonResult.style.display = 'none';
  sermonResult.innerHTML = '';
  loadingDiv.style.display = 'none';
}

/**
 * Exibe a pergunta e as opções recebidas do servidor.
 * @param {object} data - O objeto contendo a pergunta e as opções.
 */
function displayQuestion(data) {
  document.getElementById('question').innerText = data.question;
  
  const inputArea = document.querySelector('.input-area');
  if(inputArea) inputArea.style.display = 'none';

  const optionsContainer = document.getElementById('options');
  optionsContainer.innerHTML = ''; 
  data.options.forEach(option => {
    const button = document.createElement('button');
    button.className = 'option-button';
    button.innerText = option;
    button.onclick = () => nextStep(option);
    optionsContainer.appendChild(button);
  });
}

/**
 * Lida com todos os tipos de erro de fetch, exibindo a mensagem apropriada.
 * @param {object} error - O objeto de erro capturado.
 */
function handleFetchError(error) {
    console.error('Erro na comunicação com o servidor:', error);
    const loadingDiv = document.getElementById('loading');
    const sermonResult = document.getElementById('sermonResult');
    const stepContainer = document.getElementById('step-container');

    // Esconde os elementos de loading e de passos
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (stepContainer) stepContainer.style.display = 'none';
    
    // Lógica para exibir a mensagem de erro correta
    if (error && error.error === "Limite de cortesia atingido.") {
        // Erro específico de cortesia
        sermonResult.innerHTML = `
            <h2>Atenção!</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message}</p>
            <a href="${error.renewal_url}" target="_blank" class="action-button" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; font-size: 1.5em; border-radius: 8px; display: inline-block; margin-top: 10px;">LIBERAR ACESSO</a>
            <br><br>
            <button onclick="startNewSermon()" style="margin-top: 20px;">Voltar ao Início</button>
        `;
    } else {
        // Erro genérico para qualquer outra falha
        sermonResult.innerHTML = `
            <h2>Ocorreu um Erro</h2>
            <p>Não foi possível continuar. Por favor, verifique sua conexão com a internet e tente novamente.</p>
            <button onclick="startNewSermon()">Tentar Novamente</button>
        `;
    }
    
    sermonResult.style.display = 'block';
}


// 5. FUNÇÕES DE COMUNICAÇÃO COM O SERVIDOR

/**
 * Processa a resposta do usuário e avança para a próxima etapa.
 * @param {string} [response] - A resposta do usuário (opcional, usado para cliques em botões).
 */
function nextStep(response) {
  let userResponse = response;
  
  if (!userResponse) {
    const userInputField = document.getElementById('user-input');
    if (userInputField && userInputField.value.trim() !== '') {
      userResponse = userInputField.value.trim();
    } else {
      return; 
    }
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
    if (!response.ok) {
        return response.json().then(errorData => {
            throw errorData || new Error('Erro de servidor'); 
        });
    }
    return response.json();
  })
  .then(data => {
    if (data.question) {
      currentStep = data.step;
      displayQuestion(data);
    } else {
      throw new Error('Resposta inválida do servidor.');
    }
  })
  .catch(handleFetchError);
}

/**
 * Envia todos os dados coletados para o back-end para gerar o sermão final.
 * @param {string} userResponse - A resposta da última etapa (duração).
 */
function generateSermon(userResponse) {
  const loadingDiv = document.getElementById('loading');
  const stepContainer = document.getElementById('step-container');

  stepContainer.style.display = 'none';
  loadingDiv.style.display = 'block';

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 4, userResponse: userResponse })
  })
  .then(response => {
      if (!response.ok) {
          return response.json().then(errorData => {
              throw errorData || new Error('Erro de servidor');
          });
      }
      return response.json();
  })
  .then(data => {
      if (data.sermon) {
          const sermonResult = document.getElementById('sermonResult');
          const formattedSermon = data.sermon.replace(/\n/g, '<br>');
          sermonResult.innerHTML = `
              <h2>Seu Sermão:</h2>
              <div class="sermon-content">${formattedSermon}</div>
              <button onclick="copySermon()">Copiar Sermão</button>
              <button onclick="startNewSermon()">Criar Novo Sermão</button>
          `;
          sermonResult.style.display = 'block';
          loadingDiv.style.display = 'none';
      } else {
          throw new Error('Resposta inválida do servidor.');
      }
  })
  .catch(handleFetchError);
}


// 6. FUNÇÕES AUXILIARES

/**
 * Copia o conteúdo do sermão gerado para a área de transferência.
 */
function copySermon() {
  const sermonContent = document.querySelector('.sermon-content');
  if (sermonContent) {
    // Converte <br> de volta para quebras de linha reais para a cópia
    const textToCopy = sermonContent.innerHTML.replace(/<br\s*[\/]?>/gi, "\n");
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        alert('Sermão copiado para a área de transferência!');
      })
      .catch(err => {
        console.error('Erro ao copiar sermão: ', err);
        alert('Não foi possível copiar o texto.');
      });
  }
}
