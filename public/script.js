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
      body: JSON.stringify({ response: topic, step: 1 }),
    });

    const data = await response.json();
    document.getElementById("loading-screen").style.display = "none";
    showOptions(data);
  });

document.getElementById("restart-button").addEventListener("click", () => {
  location.reload();
});

document.getElementById("print-button").addEventListener("click", () => {
  window.print();
});

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

async function nextStep(response, step) {
  document.getElementById("options-container").style.display = "none";
  document.getElementById("loading-screen").style.display = "flex";

  const res = await fetch("/api/next-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response, step }),
  });

  const data = await res.json();
  document.getElementById("loading-screen").style.display = "none";

  if (data.question) {
    showOptions(data);
  } else if (data.sermon) {
    showSermon(data.sermon);
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
