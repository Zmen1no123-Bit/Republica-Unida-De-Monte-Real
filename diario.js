(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";

  // Funciona na página completa (#diarioList) e na prévia da inicial (#diarioPreview).
  const target = document.getElementById("diarioList") || document.getElementById("diarioPreview");
  if (!target || !window.Appwrite) return;
  const limit = Number(target.dataset.limit) || Infinity;

  const style = document.createElement("style");
  style.textContent = `
    .diario-item{display:block;background:#fff;border:1px solid #e4dfd2;border-left:4px solid #D6AA3B;border-radius:12px;padding:16px 18px;margin-bottom:12px;text-decoration:none;color:#1d1d1b}
    .diario-item:hover{box-shadow:0 6px 18px rgba(17,17,17,.08)}
    .diario-item .diario-num{font-size:12px;letter-spacing:.14em;font-weight:700;color:#8a6d1f;text-transform:uppercase}
    .diario-item h3{margin:4px 0;font-family:"Playfair Display",Georgia,serif;font-size:19px;color:#111}
    .diario-item p{margin:2px 0;font-size:13px;color:#6b6b66}
    .diario-empty{color:#6b6b66}
  `;
  document.head.appendChild(style);

  const client = new Appwrite.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);
  const functions = new Appwrite.Functions(client);

  function showMessage(text) {
    target.replaceChildren();
    const p = document.createElement("p");
    p.className = "diario-empty";
    p.textContent = text;
    target.appendChild(p);
  }

  // Documentos sem data de publicação (rascunhos que foram publicados depois) usam a data da última edição.
  function dateOf(doc) {
    return doc.publishedAt || doc.updatedAt || null;
  }

  function formatDate(value) {
    if (!value) return "Data não informada";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR");
  }

  // Decretos numerados primeiro, do maior número para o menor. Sem número, pela data.
  function sortDecrees(a, b) {
    const na = a.number ?? -1;
    const nb = b.number ?? -1;
    if (na !== nb) return nb - na;
    return new Date(dateOf(b) || 0) - new Date(dateOf(a) || 0);
  }

  async function fetchDecrees() {
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify({ action: "public-documents" }),
      false,
      "/",
      "POST",
      { "content-type": "application/json" }
    );

    let result = {};
    try {
      result = JSON.parse(execution.responseBody || "{}");
    } catch (_) {
      throw new Error("Resposta inesperada do servidor.");
    }

    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !result.ok) {
      throw new Error(result.message || "Não foi possível carregar o diário.");
    }

    return result.documents
      .filter((doc) => doc.category === "decreto")
      .sort(sortDecrees);
  }

  function render(decrees) {
    const items = decrees.slice(0, limit);
    if (!items.length) {
      showMessage("Nenhum ato publicado ainda.");
      return;
    }

    target.replaceChildren(...items.map((doc) => {
      const link = document.createElement("a");
      link.className = "diario-item";
      link.href = "documento.html?doc=" + encodeURIComponent(doc.slug);

      const label = document.createElement("span");
      label.className = "diario-num";
      label.textContent = doc.number != null ? `Decreto nº ${doc.number}` : "Decreto";

      const title = document.createElement("h3");
      title.textContent = doc.title;

      const meta = document.createElement("p");
      meta.textContent = [doc.institution, formatDate(dateOf(doc))].filter(Boolean).join(" • ");

      link.append(label, title, meta);
      return link;
    }));
  }

  fetchDecrees()
    .then(render)
    .catch((error) => {
      console.error("RUMR diário:", error);
      showMessage("Não foi possível carregar o diário agora. Tente novamente em instantes.");
    });
})();
