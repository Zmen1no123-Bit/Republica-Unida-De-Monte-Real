(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";

  const target = document.getElementById("documentosList");
  if (!target || !window.Appwrite) return;

  // Ordem e nome dos grupos exibidos na página.
  const GROUPS = [
    { key: "constituicao", label: "Constituição" },
    { key: "regimento", label: "Regimento" },
    { key: "instituicao", label: "Instituições" },
    { key: "ministerio", label: "Ministérios" },
    { key: "decreto", label: "Decretos" }
  ];

  const style = document.createElement("style");
  style.textContent = `
    .doc-group{margin-bottom:36px}
    .doc-group h3{font-family:"Playfair Display",Georgia,serif;font-size:22px;margin:0 0 12px;color:#111;padding-bottom:8px;border-bottom:2px solid #D6AA3B}
    .doc-link{display:block;background:#fff;border:1px solid #e4dfd2;border-radius:12px;padding:14px 18px;margin-bottom:10px;text-decoration:none;color:#1d1d1b}
    .doc-link:hover{box-shadow:0 6px 18px rgba(17,17,17,.08)}
    .doc-link strong{display:block;font-size:16px;color:#111}
    .doc-link small{display:block;margin-top:2px;font-size:13px;color:#6b6b66}
    .doc-empty{color:#6b6b66}
  `;
  document.head.appendChild(style);

  const client = new Appwrite.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);
  const functions = new Appwrite.Functions(client);

  function showMessage(text) {
    target.replaceChildren();
    const p = document.createElement("p");
    p.className = "doc-empty";
    p.textContent = text;
    target.appendChild(p);
  }

  async function fetchDocuments() {
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
      throw new Error(result.message || "Não foi possível carregar os documentos.");
    }
    return result.documents;
  }

  function render(documents) {
    const sections = GROUPS.map((group) => {
      const items = documents
        .filter((doc) => doc.category === group.key)
        .sort((a, b) => String(a.title).localeCompare(String(b.title), "pt-BR"));

      if (!items.length) return null;

      const wrapper = document.createElement("div");
      wrapper.className = "doc-group";

      const heading = document.createElement("h3");
      heading.textContent = group.label;
      wrapper.appendChild(heading);

      items.forEach((doc) => {
        const link = document.createElement("a");
        link.className = "doc-link";
        link.href = "documento.html?doc=" + encodeURIComponent(doc.slug);

        const title = document.createElement("strong");
        title.textContent = doc.title;

        const meta = document.createElement("small");
        meta.textContent = [
          doc.institution,
          doc.number != null ? `nº ${doc.number}` : null
        ].filter(Boolean).join(" • ");

        link.appendChild(title);
        if (meta.textContent) link.appendChild(meta);
        wrapper.appendChild(link);
      });

      return wrapper;
    }).filter(Boolean);

    if (!sections.length) {
      showMessage("Nenhum documento publicado ainda.");
      return;
    }
    target.replaceChildren(...sections);
  }

  fetchDocuments()
    .then(render)
    .catch((error) => {
      console.error("RUMR documentos:", error);
      showMessage("Não foi possível carregar os documentos agora. Tente novamente em instantes.");
    });
})();
