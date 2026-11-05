(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";

  const CATEGORIES = [
    { value: "constituicao", label: "Constituição" },
    { value: "regimento", label: "Regimento" },
    { value: "instituicao", label: "Instituição" },
    { value: "ministerio", label: "Ministério" },
    { value: "decreto", label: "Decreto" }
  ];

  const client = new Appwrite.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);
  const functions = new Appwrite.Functions(client);

  const anchor = document.getElementById("membersSection") || document.getElementById("requestsList");
  if (!anchor) return;

  const style = document.createElement("style");
  style.textContent = `
    #docsSection{margin-top:40px}
    #docsSection .docs-title{font-family:"Playfair Display",Georgia,serif;font-size:26px;margin:0 0 6px}
    #docsSection .docs-note{font-size:14px;color:#6b6b66;margin:0 0 16px}
    #docsSection .docs-toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}
    #docsSection .docs-message{padding:12px 16px;border-radius:10px;background:#f4f1e9;margin:0 0 16px}
    #docsSection .doc-card{background:#fff;border:1px solid #e4dfd2;border-radius:12px;padding:14px 18px;margin-bottom:10px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
    #docsSection .doc-card h3{margin:0;font-size:17px}
    #docsSection .doc-card p{margin:4px 0 0;font-size:13px;color:#6b6b66}
    #docsSection .doc-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;margin-left:8px}
    #docsSection .doc-badge.on{background:#e6f2e6;color:#2d5f2d}
    #docsSection .doc-badge.off{background:#f4f1e9;color:#6b6b66}
    #docsSection form{background:#fff;border:1px solid #e4dfd2;border-radius:12px;padding:18px;margin-top:16px;display:grid;gap:12px}
    #docsSection form label{display:grid;gap:4px;font-size:13px;font-weight:700;color:#111}
    #docsSection form .check{display:flex;align-items:center;gap:8px}
    #docsSection input[type=text],#docsSection select,#docsSection textarea{padding:9px 10px;border:1px solid #e4dfd2;border-radius:8px;font:inherit;font-weight:400;background:#fff}
    #docsSection textarea{font-family:ui-monospace,Consolas,monospace;font-size:13px;min-height:320px;resize:vertical}
    #docsSection .doc-form-actions{display:flex;gap:8px;flex-wrap:wrap}
    #docsSection button{border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
    #docsSection button:disabled{opacity:.5;cursor:not-allowed}
    #docsSection .btn-primary{background:#111;color:#D6AA3B}
    #docsSection .btn-secondary{background:#f4f1e9;color:#111}
  `;
  document.head.appendChild(style);

  const section = document.createElement("section");
  section.id = "docsSection";
  section.innerHTML = `
    <h2 class="docs-title">Documentos institucionais</h2>
    <p class="docs-note">Documentos publicados aparecem no site assim que salvos. Cada salvamento exige um motivo e fica registrado. Um documento que for despublicado some do site.</p>
    <div class="docs-toolbar"><button id="docNew" class="btn-primary" type="button">Novo documento</button></div>
    <p id="docsMessage" class="docs-message" hidden></p>
    <div id="docsList"></div>
    <form id="docForm" hidden>
      <h3 id="docFormTitle" style="margin:0;font-size:18px"></h3>
      <label>Identificador (slug)
        <input type="text" id="docSlug" maxlength="80">
      </label>
      <label>Categoria
        <select id="docCategory"></select>
      </label>
      <label>Título
        <input type="text" id="docTitle" maxlength="200" required>
      </label>
      <label>Instituição
        <input type="text" id="docInstitution" maxlength="120">
      </label>
      <label class="check">
        <input type="checkbox" id="docPublished"> Publicado no site
      </label>
      <label>Conteúdo (Markdown)
        <textarea id="docContent" required></textarea>
      </label>
      <label>Motivo da alteração (de 10 a 300 caracteres)
        <input type="text" id="docReason" maxlength="300" required>
      </label>
      <div class="doc-form-actions">
        <button class="btn-primary" type="submit" id="docSave">Salvar</button>
        <button class="btn-secondary" type="button" id="docCancel">Cancelar</button>
      </div>
    </form>`;
  (document.getElementById("membersSection") || anchor).after(section);

  const messageBox = document.getElementById("docsMessage");
  const listBox = document.getElementById("docsList");
  const form = document.getElementById("docForm");
  const formTitle = document.getElementById("docFormTitle");
  const slugInput = document.getElementById("docSlug");
  const categorySelect = document.getElementById("docCategory");
  const titleInput = document.getElementById("docTitle");
  const institutionInput = document.getElementById("docInstitution");
  const publishedInput = document.getElementById("docPublished");
  const contentInput = document.getElementById("docContent");
  const reasonInput = document.getElementById("docReason");
  const saveButton = document.getElementById("docSave");

  let documentsCache = [];
  let editingRowId = null;

  CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.value;
    option.textContent = category.label;
    categorySelect.appendChild(option);
  });

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

  function categoryLabel(value) {
    const found = CATEGORIES.find((category) => category.value === value);
    return found ? found.label : value;
  }

  function formatDate(value) {
    if (!value) return "Data não disponível";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleString("pt-BR");
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

  function renderList(documents) {
    if (!documents.length) {
      listBox.innerHTML = '<p class="empty-state">Nenhum documento cadastrado.</p>';
      return;
    }

    listBox.innerHTML = documents.map((doc) => `
      <article class="doc-card">
        <div>
          <h3>${escapeHtml(doc.title)}
            <span class="doc-badge ${doc.published ? "on" : "off"}">${doc.published ? "Publicado" : "Rascunho"}</span>
          </h3>
          <p>${escapeHtml(categoryLabel(doc.category))}${doc.institution ? " • " + escapeHtml(doc.institution) : ""} • <code>${escapeHtml(doc.slug)}</code></p>
          <p>Atualizado em ${escapeHtml(formatDate(doc.updatedAt))}</p>
        </div>
        <div><button class="btn-primary" type="button" data-doc-edit="${escapeHtml(doc.rowId)}">Editar</button></div>
      </article>`).join("");
  }

  function openForm(doc) {
    editingRowId = doc ? doc.rowId : null;
    formTitle.textContent = doc ? "Editar: " + doc.title : "Novo documento";
    slugInput.value = doc ? doc.slug : "";
    slugInput.disabled = Boolean(doc);
    categorySelect.value = doc ? doc.category : CATEGORIES[0].value;
    categorySelect.disabled = Boolean(doc);
    titleInput.value = doc ? doc.title : "";
    institutionInput.value = doc ? doc.institution : "";
    publishedInput.checked = doc ? doc.published : false;
    contentInput.value = doc ? doc.content : "";
    reasonInput.value = "";
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    titleInput.focus();
  }

  function closeForm() {
    editingRowId = null;
    form.hidden = true;
    form.reset();
  }

  async function loadDocuments() {
    try {
      const result = await callAdmin({ action: "documents-admin" });
      documentsCache = result.documents || [];
      renderList(documentsCache);
    } catch (error) {
      console.error("RUMR documents:", error);
      listBox.innerHTML = "";
      showMessage(error.message || "Não foi possível carregar os documentos.", true);
    }
  }

  document.getElementById("docNew").addEventListener("click", () => openForm(null));
  document.getElementById("docCancel").addEventListener("click", closeForm);

  listBox.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-doc-edit]");
    if (!button) return;
    const doc = documentsCache.find((item) => item.rowId === button.dataset.docEdit);
    if (doc) openForm(doc);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const reason = reasonInput.value.trim();
    if (reason.length < 10 || reason.length > 300) {
      showMessage("O motivo precisa ter entre 10 e 300 caracteres.", true);
      return;
    }

    const title = titleInput.value.trim();
    const payload = {
      action: "document-save",
      title,
      institution: institutionInput.value.trim(),
      published: publishedInput.checked,
      content: contentInput.value,
      reason
    };

    if (editingRowId) {
      payload.rowId = editingRowId;
    } else {
      payload.slug = slugInput.value.trim().toLowerCase();
      payload.category = categorySelect.value;
    }

    if (!window.confirm(`Salvar alterações em "${title}"?`)) return;

    saveButton.disabled = true;
    showMessage("Salvando documento…");

    try {
      const result = await callAdmin(payload);
      showMessage(result.message || "Documento salvo.");
      closeForm();
      await loadDocuments();
    } catch (error) {
      console.error("RUMR document save:", error);
      showMessage(error.message || "Não foi possível salvar o documento.", true);
    } finally {
      saveButton.disabled = false;
    }
  });

  loadDocuments();
})();
