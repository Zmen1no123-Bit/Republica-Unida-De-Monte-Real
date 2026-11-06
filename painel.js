/* Perfil do membro no painel (painel.html).
   Lê apenas o próprio perfil. A permissão da linha em member_profiles já limita o acesso. */
(() => {
  "use strict";

  const container = document.getElementById("memberProfile");
  if (!container) return;
  if (!window.Appwrite || !window.Appwrite.Databases) {
    container.innerHTML = '<p class="notice">O serviço de perfil não carregou. Atualize a página.</p>';
    return;
  }

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const DATABASE_ID = "6aeb8a27000848e802b4";
  const PROFILES_TABLE_ID = "member_profiles";

  const client = new Appwrite.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);
  const account = new Appwrite.Account(client);
  const databases = new Appwrite.Databases(client);
  const requestBlock = document.getElementById("requestBlock");

  function setRequestVisible(visible) {
    if (requestBlock) requestBlock.style.display = visible ? "" : "none";
  }

  function showNotice(text) {
    container.replaceChildren();
    const p = document.createElement("p");
    p.className = "notice";
    p.textContent = text;
    container.appendChild(p);
  }

  function addRow(label, value, extraClass) {
    const row = document.createElement("div");
    row.className = "row";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    if (extraClass) {
      const badge = document.createElement("span");
      badge.className = "badge " + extraClass;
      badge.textContent = value;
      strong.appendChild(badge);
    } else {
      strong.textContent = value;
    }
    row.append(span, strong);
    container.appendChild(row);
  }

  function formatDate(value) {
    if (!value) return "Não informada";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Não informada" : date.toLocaleDateString("pt-BR");
  }

  function renderProfile(profile) {
    container.replaceChildren();
    addRow("Nome de exibição", profile.DisplayName || "Não informado");
    addRow("Número de membro", String(profile.MemberNumber));
    addRow("Data de ingresso", formatDate(profile.JoinedAt));
    addRow("Situação da conta", "Ativa", "active");
  }

  async function load() {
    setRequestVisible(false);
    try {
      const user = await account.get();
      if (!user.emailVerification) {
        showNotice("Verifique seu e-mail para ver seu perfil de membro.");
        return;
      }

      const result = await databases.listDocuments(
        DATABASE_ID,
        PROFILES_TABLE_ID,
        [Appwrite.Query.equal("UserId", user.$id), Appwrite.Query.limit(1)]
      );

      if (!result.documents.length) {
        showNotice("Sua solicitação ainda está em análise. Seu perfil de membro aparecerá aqui depois da aprovação.");
        setRequestVisible(true);
        return;
      }

      const profile = result.documents[0];
      if (profile.AccountStatus === "suspended") {
        showNotice("Sua conta está suspensa. A área de membros e o envio de novas solicitações ficam indisponíveis enquanto a suspensão durar. Procure a administração para esclarecimentos.");
        return;
      }

      renderProfile(profile);
    } catch (error) {
      console.error("RUMR member profile:", error);
      showNotice("Não foi possível carregar seu perfil. Atualize a página e tente novamente.");
    }
  }

  load();
})();
