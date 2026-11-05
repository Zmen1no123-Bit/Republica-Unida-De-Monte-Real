(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";

  // Mesma lista usada na Function. Cargos fora dela são recusados pelo servidor.
  const POSITIONS = [
    { name: "Presidente", institution: "Presidência" },
    { name: "Vice-presidente", institution: "Presidência" },
    { name: "Ministro", institution: "Ministérios" },
    { name: "Parlamentar", institution: "Congresso" },
    { name: "Magistrado", institution: "Supremo Tribunal" }
  ];

  const client = new Appwrite.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);
  const functions = new Appwrite.Functions(client);

  const anchor = document.getElementById("requestsList");
  if (!anchor) return;

  const style = document.createElement("style");
  style.textContent = `
    #membersSection{margin-top:40px}
    #membersSection .members-title{font-family:"Playfair Display",Georgia,serif;font-size:26px;margin:0 0 6px}
    #membersSection .members-note{font-size:14px;color:#6b6b66;margin:0 0 16px}
    #membersSection .members-message{padding:12px 16px;border-radius:10px;background:#f4f1e9;margin:0 0 16px}
    #membersSection .member-card{background:#fff;border:1px solid #e4dfd2;border-radius:12px;padding:16px 18px;margin-bottom:12px;display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}
    #membersSection .member-card h3{margin:0;font-size:18px}
    #membersSection .member-card p{margin:4px 0 0;font-size:13px;color:#6b6b66}
    #membersSection .member-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;margin-left:8px}
    #membersSection .member-badge.active{background:#e6f2e6;color:#2d5f2d}
    #membersSection .member-badge.suspended{background:#f8e8e6;color:#8b2820}
    #membersSection .member-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
    #membersSection .member-card select{padding:8px 10px;border:1px solid #e4dfd2;border-radius:8px;background:#fff}
    #membersSection button{border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
    #membersSection button:disabled{opacity:.5;cursor:not-allowed}
    #membersSection .btn-suspend{background:#f8e8e6;color:#8b2820}
    #membersSection .btn-reactivate{background:#e6f2e6;color:#2d5f2d}
    #membersSection .btn-appoint{background:#111;color:#D6AA3B}
    #membersSection .btn-dismiss{background:#f4f1e9;color:#111}
  `;
  document.head.appendChild(style);

  const section = document.createElement("section");
  section.id = "membersSection";
  section.innerHTML = `
    <h2 class="members-title">Membros</h2>
    <p class="members-note">Suspender encerra o cargo ativo e bloqueia o acesso aos painéis e o envio de novas solicitações. Cada membro ocupa um cargo por vez.</p>
    <p id="membersMessage" class="members-message" hidden></p>
    <div id="membersList"></div>`;
  anchor.after(section);

  const messageBox = document.getElementById("membersMessage");
  const membersList = document.getElementById("membersList");

  function showMessage(text, isError = false) {
    messageBox.hidden = false;
    messageBox.textContent = text;
    messageBox.style.background = isError ? "#f8e8e6" : "#f4f1e9";
    messageBox.style.color = isError ? "#8b2820" : "inherit";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "Data não disponível";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleDateString("pt-BR");
  }

  async function callAdmin(payload) {
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
      const detail = result.message || `Falha na Function (status ${execution.responseStatusCode}).`;
      throw new Error(detail + (execution.errors ? " " + execution.errors.slice(0, 200) : ""));
    }
    return result;
  }

  function renderMembers(members) {
    if (!Array.isArray(members) || members.length === 0) {
      membersList.innerHTML = '<p class="empty-state">Nenhum membro cadastrado.</p>';
      return;
    }

    membersList.innerHTML = members.map((member) => {
      const suspended = member.accountStatus === "suspended";
      const userAttr = `data-user="${escapeHtml(member.userId)}"`;
      let actions;

      if (suspended) {
        actions = `<button class="btn-reactivate" type="button" data-member-action="reactivate" ${userAttr}>Reativar</button>`;
      } else {
        const suspendButton = `<button class="btn-suspend" type="button" data-member-action="suspend" ${userAttr}>Suspender</button>`;
        if (member.position) {
          actions = `<button class="btn-dismiss" type="button" data-member-action="dismiss" ${userAttr}>Exonerar</button>${suspendButton}`;
        } else {
          const options = POSITIONS.map((p) =>
            `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${escapeHtml(p.institution)})</option>`
          ).join("");
          actions = `
            <select aria-label="Cargo">
              <option value="">Escolha um cargo</option>${options}
            </select>
            <button class="btn-appoint" type="button" data-member-action="appoint" ${userAttr}>Nomear</button>${suspendButton}`;
        }
      }

      const positionLine = member.position
        ? `<p>Cargo: <strong>${escapeHtml(member.position)}</strong> (${escapeHtml(member.institution || "")})</p>`
        : "";

      return `
        <article class="member-card">
          <div>
            <h3>${escapeHtml(member.displayName || "Sem nome")}
              <span class="member-badge ${suspended ? "suspended" : "active"}">${suspended ? "Suspensa" : "Ativa"}</span>
            </h3>
            <p>Membro nº ${escapeHtml(member.memberNumber)} • Ingresso em ${escapeHtml(formatDate(member.joinedAt))}</p>
            ${positionLine}
          </div>
          <div class="member-actions">${actions}</div>
        </article>`;
    }).join("");
  }

  async function loadMembers() {
    try {
      const result = await callAdmin({ action: "members" });
      renderMembers(result.members);
    } catch (error) {
      console.error("RUMR members:", error);
      membersList.innerHTML = "";
      showMessage(error.message || "Não foi possível carregar os membros.", true);
    }
  }

  membersList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-member-action]");
    if (!button) return;

    const action = button.dataset.memberAction;
    const userId = button.dataset.user;
    let payload;

    if (action === "appoint") {
      const select = button.closest(".member-card").querySelector("select");
      const position = select ? select.value : "";
      if (!position) {
        showMessage("Escolha um cargo antes de nomear.", true);
        return;
      }
      if (!window.confirm(`Nomear este membro como ${position}?`)) return;
      payload = { action, userId, position };
    } else {
      const verbs = { suspend: "suspender", reactivate: "reativar", dismiss: "exonerar" };
      const reason = window.prompt(`Motivo para ${verbs[action]} (de 10 a 300 caracteres):`);
      if (reason === null) return;

      const trimmed = reason.trim();
      if (trimmed.length < 10 || trimmed.length > 300) {
        showMessage("O motivo precisa ter entre 10 e 300 caracteres.", true);
        return;
      }
      payload = { action, userId, reason: trimmed };
    }

    button.disabled = true;
    showMessage("Registrando alteração…");

    try {
      const result = await callAdmin(payload);
      showMessage(result.message || "Alteração registrada.");
      await loadMembers();
      document.getElementById("refreshRequests")?.click();
    } catch (error) {
      console.error("RUMR member action:", error);
      button.disabled = false;
      showMessage(error.message || "Não foi possível concluir a alteração.", true);
    }
  });

  loadMembers();
})();
