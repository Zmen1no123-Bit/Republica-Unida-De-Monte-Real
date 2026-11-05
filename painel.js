  if (!container) return;
  if (!window.Appwrite || !window.Appwrite.Databases) {
    container.innerHTML = '<p class="notice">O serviço de perfil não carregou. Atualize a página.</p>';
    return;
  }
