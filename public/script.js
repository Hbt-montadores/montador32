document
  .getElementById("next-step-button")
  .addEventListener("click", async () => {
    const topic = document.getElementById("topic").value.trim();
    if (!topic) {
      alert("Por favor, digite o tema do sermão.");
      return;
    }

    document.getElementById("form-container").style.display = "none";
    document.getElementById("loading-screen").style.display = "flex";

    const response = await fetch("/api/next-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userResponse: topic, step: 1 }),
    });

    const data = await response.json();
    document.getElementById("loading-screen").style.display = "none";
    showOptions(data);
  });

document.getElementById("restart-button").addEventListener("click", () => resetApp());
document.getElementById("print-button").addEventListener("click", () => window.print());
document.getElementById("home-button").addEventListener("click", () => resetApp());

function showOptions(data) {
  const optionsContainer = document.getElementById("options-container");
  optionsContainer.innerHTML = "";
  optionsContainer.style.display = "block";
  data.options.forEach((option) => {
    const button = document.createElement("button");
    button.textContent = option;
    button.addEventListener("click", () => nextStep(option, data.step));
    optionsContainer.appendChild(button);
  });
}

let loadingInterval;
// MUDANÇA: Lista de mensagens conforme sua escolha
const longSermonMessages = [
    "Consultando as referências e o contexto bíblico.",
    "Estruturando a espinha dorsal da sua mensagem.",
    "Definindo os pontos principais e a sequência lógica do sermão.",
    "Esboçando a introdução para capturar a atenção dos ouvintes.",
    "Aprofundando na exegese para uma base bíblica sólida.",
    "Desenvolvendo cada ponto com clareza e profundidade.",
    "Buscando ilustrações e aplicações práticas para o dia a dia.",
    "Construindo uma conclusão impactante para a sua mensagem.",
    "Revisando o texto para garantir fluidez e coesão.",
    "Quase pronto! Polindo os detalhes finais do seu sermão."
];

async function nextStep(response, step) {
  const loadingScreen = document.getElementById("loading-screen");
  const loadingTextElement = document.getElementById("loading-text");
  
  document.getElementById("options-container").style.display = "none";
  loadingScreen.style.display = "flex";

  const longSermonTriggers = ["Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"];

  if (step === 4 && longSermonTriggers.includes(response)) {
    // CASO ESPECIAL: Sermão longo
    loadingTextElement.textContent = "Você escolheu um sermão mais longo. A preparação pode levar um pouco mais de tempo, mas o resultado valerá a pena!";
    
    // Inicia o ciclo de mensagens detalhadas após um breve delay
    let messageIndex = 0;
    setTimeout(() => {
        loadingTextElement.textContent = longSermonMessages[messageIndex];
        loadingInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % longSermonMessages.length;
            loadingTextElement.textContent = longSermonMessages[messageIndex];
        }, 8000); // Muda a mensagem a cada 8 segundos
    }, 4000); // Delay de 4 segundos para a primeira mensagem
  } else {
    // CASO PADRÃO: Sermões mais curtos
    loadingTextElement.textContent = "Gerando sermão, por favor aguarde...";
  }

  try {
    const res = await fetch("/api/next-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userResponse: response, step }),
    });
    
    clearInterval(loadingInterval);
    loadingScreen.style.display = "none";
    
    const data = await res.json();
    
    if (data.question) {
      showOptions(data);
    } else if (data.sermon) {
      showSermon(data.sermon);
    } else {
      showErrorScreen(); 
    }
  } catch (error) {
    clearInterval(loadingInterval);
    loadingScreen.style.display = "none";
    showErrorScreen();
  }
}

function showSermon(content) {
  const sermonResult = document.getElementById("sermon-result");
  sermonResult.innerHTML = content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  sermonResult.style.display = "block";
  document.getElementById("restart-button").style.display = "block";
  document.getElementById("print-button").style.display = "block";
}

function showErrorScreen() {
    document.getElementById("form-container").style.display = "none";
    document.getElementById("options-container").style.display = "none";
    document.getElementById("loading-screen").style.display = "none";
    document.getElementById("sermon-result").style.display = "none";
    document.getElementById("restart-button").style.display = "none";
    document.getElementById("print-button").style.display = "none";
    document.getElementById("error-container").style.display = "block";
}

function resetApp() {
    document.getElementById("options-container").style.display = "none";
    document.getElementById("sermon-result").style.display = "none";
    document.getElementById("restart-button").style.display = "none";
    document.getElementById("print-button").style.display = "none";
    document.getElementById("error-container").style.display = "none";
    document.getElementById("topic").value = "";
    document.getElementById("form-container").style.display = "block";
}
