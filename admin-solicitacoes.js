(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";

  const client = new Appwrite.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);
  const account = new Appwrite.Account(client);
  const functions = new Appwrite.Functions(client);

  const message = document.getElementById("requestsMessage");
  const list = document.getElementById("requestsList");
  const refreshButton = document.getElementById("refreshRequests");

  function showMessage(text, isError = false) {
    message.hidden = false;
    message.textContent = text;
    message.style.background = isError ? "#f8e8e6" : "#f4f1e9";
    message.style.color = isError ? "#8b2820" : "inherit";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "Data não disponível";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleString("pt-BR");
  }

  async function callAdmin(payload) {
    const execution = await functions.createExecution({
      functionId: FUNCTION_ID,
      body: JSON.stringify(payload),
      async: false,
      xpath: "/",
      method: "POST",
      headers: { "content-type": "application/json" }
    });

    let result = {};
    try {
      result = JSON.parse(execution.responseBody || "{}");
    } catch (_) {
      throw new Error("A Function respondeu em um formato inesperado.");
    }

    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !result.ok) {
      throw new Error(result.message || "A operação não foi autorizada.");
    }
    return result;
  }

  function renderRequests(requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      list.innerHTML = '<p class="empty-state">Nenhuma solicitação encontrada.</p>';
      return;
    }

    list.innerHTML = requests.map((request) => {
      const status = request.status || "pending";
      const statusLabel = status === "approved" ? "Aprovada" : status === "rejected" ? "Rejeitada" : "Pendente";
      const canReview = status === "pending";
      return `
        <article class="request-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
            <h2 style="margin:0;font-size:19px">${escapeHtml(request.displayName || "Sem nome informado")}</h2>
            <span class="request-status ${escapeHtml(status)}">${statusLabel}</span>
          </div>
          <p class="request-meta">Enviada em ${escapeHtml(formatDate(request.createdAt))}</p>
          <div class="request-motivation">${escapeHtml(request.motivation || "Sem mensagem.")}</div>
          ${request.reviewedAt ? `<p class="request-meta">Analisada em ${escapeHtml(formatDate(request.reviewedAt))}</p>` : ""}
          <div class="request-actions">
            ${canReview ? `
              <button class="approve" type="button" data-review="approved" data-id="${escapeHtml(request.id)}">Aprovar</button>
              <button class="reject" type="button" data-review="rejected" data-id="${escapeHtml(request.id)}">Rejeitar</button>
            ` : ""}
          </div>
        </article>`;
    }).join("");
  }

  async function loadRequests() {
    refreshButton.disabled = true;
    showMessage("Carregando solicitações…");
    try {
      const result = await callAdmin({ action: "list" });
      renderRequests(result.requests);
      showMessage("Solicitações carregadas. A autorização foi validada pelo servidor.");
    } catch (error) {
      console.error("RUMR admin panel:", error);
      list.innerHTML = "";
      showMessage(error.message || "Não foi possível carregar as solicitações.", true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-review]");
    if (!button) return;

    const status = button.dataset.review;
    const rowId = button.dataset.id;
    const actionLabel = status === "approved" ? "aprovar" : "rejeitar";
    if (!window.confirm(`Confirma ${actionLabel} esta solicitação?`)) return;

    const card = button.closest(".request-card");
    const buttons = card.querySelectorAll("button");
    buttons.forEach((item) => { item.disabled = true; });
    showMessage("Registrando decisão…");

    try {
      const result = await callAdmin({ action: "review", rowId, status });
      showMessage(result.message || "Decisão registrada.");
      await loadRequests();
    } catch (error) {
      console.error("RUMR review:", error);
      buttons.forEach((item) => { item.disabled = false; });
      showMessage(error.message || "Não foi possível registrar a decisão.", true);
    }
  });

  refreshButton.addEventListener("click", loadRequests);

  account.get()
    .then((user) => {
      if (!user.emailVerification) {
        showMessage("Seu e-mail precisa estar verificado. Saia, confirme o endereço e entre novamente.", true);
        list.innerHTML = "";
        return;
      }
      loadRequests();
    })
    .catch(() => {
      showMessage("Você precisa entrar na sua conta antes de acessar esta página.", true);
      list.innerHTML = '<p class="empty-state"><a href="login.html">Ir para o login</a></p>';
    });
})();
