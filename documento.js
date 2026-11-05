(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";

  // Links antigos do portal apontam para estes nomes. Os slugs do banco são os da direita.
  // Se algum slug criado no Appwrite for diferente, ajuste aqui.
  const ALIASES = {
    "migracao": "ministerio-migracao",
    "decreto-modelo": "decreto-001-modelo"
  };

  const root = document.getElementById("documentContent");
  const params = new URLSearchParams(location.search);
  const requested = params.get("doc") || "";
  const slug = ALIASES[requested] || requested;

  function showError(title, text) {
    root.replaceChildren();
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const p = document.createElement("p");
    p.textContent = text;
    root.append(h1, p);
  }

  async function fetchPublicDocuments() {
    const client = new Appwrite.Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID);
    const functions = new Appwrite.Functions(client);

    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify({ action: "public-documents" }),
      false,
      "/",
      "POST",
      { "content-type": "application/json" }
    );

    const result = JSON.parse(execution.responseBody || "{}");
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !result.ok) {
      throw new Error(result.message || "Não foi possível carregar os documentos.");
    }
    return result.documents;
  }

  if (!slug) {
    showError("Documento não encontrado", "Escolha um documento no portal institucional.");
    return;
  }

  fetchPublicDocuments()
    .then((documents) => {
      const doc = documents.find((item) => item.slug === slug);
      if (!doc) {
        showError("Documento não encontrado", "Este documento não existe ou não está publicado.");
        return;
      }

      document.title = doc.title + " • RUMR";
      const html = marked.parse(doc.content || "", { gfm: true, breaks: false });
      root.innerHTML = DOMPurify.sanitize(html);
    })
    .catch((error) => {
      console.error("RUMR documento:", error);
      showError("Falha ao carregar", "Tente novamente em instantes ou volte ao portal.");
    });
})();
