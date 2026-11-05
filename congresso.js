(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";
  const QUORUM = 5; // mesmo valor usado na Function

  const VOTE_LABELS = { favoravel: "A favor", contrario: "Contra", abstencao: "Abstenção" };
  const STATUS_LABELS = { pending: "Em análise", approved: "Aprovada", rejected: "Rejeitada" };

  const client = new Appwrite.Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
  const account = new Appwrite.Account(client);
  const functions = new Appwrite.Functions(client);

  const msg = document.getElementById("congressMessage");
  const proposeBox = document.getElementById("proposeBox");
  const list = document.getElementById("proposalsList");

  function showMessage(text, isError = false) {
    msg.hidden = false;
    msg.textContent = text;
    msg.style.background = isError ? "#f8e8e6" : "#f4f1e9";
    msg.style.color = isError ? "#8b2820" : "inherit";
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function fmtDate(value) {
    if (!value) return "Data não disponível";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleDateString("pt-BR");
  }

  async function callFn(payload) {
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify(payload),
      false,
      "/",
      "POST",
      { "content-type": "application/json" }
    );

    let result = {};
    try {
      result = JSON.parse(execution.responseBody || "{}");
    } catch (_) {
      throw new Error("A Function respondeu em um formato inesperado.");
    }

    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !result.ok) {
      throw new Error(result.message || `Falha na Function (status ${execution.responseStatusCode}).`);
    }
    return result;
  }

  function renderProposeForm() {
    proposeBox.innerHTML = `
      <form class="prop-form" id="proposeForm">
        <h2>Apresentar proposta</h2>
        <label>Título (5 a 200 caracteres)
          <input type="text" id="propTitle" maxlength="200" required>
        </label>
        <label>Texto da proposta (50 a 50.000 caracteres)
          <textarea id="propBody" maxlength="50000" required></textarea>
        </label>
        <button type="submit">Apresentar proposta</button>
      </form>`;

    document.getElementById("proposeForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = document.getElementById("propTitle").value.trim();
      const body = document.getElementById("propBody").value.trim();

      if (title.length < 5 || body.length < 50) {
        showMessage("Use um título de pelo menos 5 caracteres e um texto de pelo menos 50.", true);
        return;
      }
      if (!window.confirm("Apresentar esta proposta ao Congresso?")) return;

      const button = event.target.querySelector("button");
      button.disabled = true;
      try {
        const result = await callFn({ action: "propose", title, body });
        showMessage(result.message);
        event.target.reset();
        await loadProposals();
      } catch (error) {
        console.error("RUMR propose:", error);
        showMessage(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  }

  function renderProposals(proposals) {
    if (!proposals.length) {
      list.innerHTML = '<p class="empty-state">Nenhuma proposta apresentada ainda.</p>';
      return;
    }

    list.innerHTML = proposals.map((p) => {
      const pending = p.status === "pending";
      const counts = `A favor: ${p.counts.favoravel} • Contra: ${p.counts.contrario} • Abstenções: ${p.counts.abstencao} • Votos: ${p.total} de ${QUORUM} necessários`;

      let voteArea = "";
      if (pending && !p.myVote) {
        voteArea = `<div class="prop-actions">${Object.entries(VOTE_LABELS).map(([value, label]) =>
          `<button type="button" class="${value === "favoravel" ? "" : "alt"}" data-vote="${value}" data-id="${esc(p.id)}">${label}</button>`
        ).join("")}</div>`;
      } else if (p.myVote) {
        voteArea = `<p class="prop-meta">Seu voto: <strong>${esc(VOTE_LABELS[p.myVote] || p.myVote)}</strong></p>`;
      }

      const decision = !pending && p.decisionReason
        ? `<p class="prop-meta">Motivo da decisão: ${esc(p.decisionReason)}</p>`
        : "";

      return `
        <article class="prop-card">
          <h2>${esc(p.title)} <span class="badge-st ${esc(p.status)}">${esc(STATUS_LABELS[p.status] || p.status)}</span></h2>
          <p class="prop-meta">Apresentada por ${esc(p.proposedByName)} em ${esc(fmtDate(p.proposedAt))}</p>
          <div class="prop-body">${esc(p.body)}</div>
          <p class="prop-counts">${counts}</p>
          ${decision}
          ${voteArea}
        </article>`;
    }).join("");
  }

  async function loadProposals() {
    try {
      const result = await callFn({ action: "proposals" });
      renderProposals(result.proposals);
    } catch (error) {
      console.error("RUMR proposals:", error);
      list.innerHTML = "";
      showMessage(error.message || "Não foi possível carregar as propostas.", true);
    }
  }

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-vote]");
    if (!button) return;

    const choice = button.dataset.vote;
    const proposalId = button.dataset.id;
    if (!window.confirm(`Confirmar voto: ${VOTE_LABELS[choice]}? O voto não pode ser alterado depois.`)) return;

    button.disabled = true;
    try {
      const result = await callFn({ action: "vote", proposalId, choice });
      showMessage(result.message);
      await loadProposals();
    } catch (error) {
      console.error("RUMR vote:", error);
      button.disabled = false;
      showMessage(error.message, true);
    }
  });

  account.get()
    .then((user) => {
      if (!user.emailVerification) {
        showMessage("Verifique seu e-mail para acessar o Congresso.", true);
        return;
      }
      renderProposeForm();
      loadProposals();
    })
    .catch(() => {
      showMessage("Entre na sua conta para acessar o Congresso.", true);
      list.innerHTML = '<p class="empty-state"><a href="login.html">Ir para o login</a></p>';
    });
})();
