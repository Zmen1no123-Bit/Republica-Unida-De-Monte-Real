/* Autenticação RUMR — Appwrite Web SDK 17.0.0.
   O Project ID e o endpoint são identificadores públicos. Nunca colocar API keys
   ou tokens administrativos neste arquivo ou em qualquer arquivo do GitHub Pages. */
(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const showMessage = (message, type = "info") => {
    const el = byId("authMessage");
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
  };

  if (!window.Appwrite) {
    showMessage("O serviço de autenticação não carregou. Atualize a página e tente novamente.", "error");
    return;
  }

  const requiredParts = ["Client", "Account", "Databases", "ID", "Permission", "Role"];
  const missingSdkParts = requiredParts.filter((name) => !window.Appwrite[name]);
  if (missingSdkParts.length) {
    showMessage("O SDK foi carregado, mas faltam componentes: " + missingSdkParts.join(", ") + ". Atualize a página e tente novamente.", "error");
    return;
  }

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const APP_URL = "https://zmen1no123-bit.github.io/Republica-Unida-De-Monte-Real/";
  const VERIFY_URL = APP_URL + "verificar.html";
  const DATABASE_ID = "6aeb8a27000848e802b4";
  const REQUESTS_TABLE_ID = "membership_requests";

  const client = new Appwrite.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);
  const account = new Appwrite.Account(client);
   const functions = new Appwrite.Functions(client);
  const databases = new Appwrite.Databases(client);

  const friendlyError = (error) => {
    const code = error && error.code;
    if (code === 409) return "Este e-mail já possui uma conta. Tente entrar.";
    if (code === 401) return "E-mail ou senha incorretos.";
    if (code === 429) return "Muitas tentativas em pouco tempo. Aguarde e tente novamente.";
    if (code === 400) return "Confira os dados informados e tente novamente.";
    return "Não foi possível concluir a operação. Confira sua conexão e tente novamente.";
  };

  const signupForm = byId("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = byId("name").value.trim();
      const email = byId("email").value.trim().toLowerCase();
      const password = byId("password").value;
      const confirm = byId("confirmPassword").value;
      if (password !== confirm) return showMessage("As senhas não coincidem.", "error");
      if (password.length < 8) return showMessage("Use uma senha com pelo menos 8 caracteres.", "error");

      const button = signupForm.querySelector('button[type="submit"]');
      button.disabled = true;
      showMessage("Criando sua conta…");
      try {
        await account.create(Appwrite.ID.unique(), email, password, name);
        await account.createEmailPasswordSession(email, password);
        await account.createVerification(VERIFY_URL);
        showMessage("Conta criada! Enviamos um link de verificação para o e-mail informado. Confira também a pasta de spam. Depois, abra o link recebido.", "success");
        signupForm.reset();
      } catch (error) {
        console.error("RUMR signup error:", error);
        showMessage(friendlyError(error), "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  const loginForm = byId("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = byId("email").value.trim().toLowerCase();
      const password = byId("password").value;
      const button = loginForm.querySelector('button[type="submit"]');
      button.disabled = true;
      showMessage("Entrando…");
      try {
        await account.createEmailPasswordSession(email, password);
        const user = await account.get();
        if (!user.emailVerification) {
          showMessage("Login realizado, mas seu e-mail ainda não foi verificado. Use o botão abaixo para solicitar um novo link.");
          return;
        }
        window.location.href = "painel.html";
      } catch (error) {
        console.error("RUMR login error:", error);
        showMessage(friendlyError(error), "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  const resend = byId("resendVerification");
  if (resend) {
    resend.addEventListener("click", async () => {
      resend.disabled = true;
      try {
        const user = await account.get();
        if (user.emailVerification) {
          showMessage("Este e-mail já está verificado. Você pode entrar normalmente.", "success");
        } else {
          await account.createVerification(VERIFY_URL);
          showMessage("Novo link de verificação solicitado. Confira sua caixa de entrada e a pasta de spam.", "success");
        }
      } catch (error) {
        showMessage("Entre primeiro com seu e-mail e senha. Depois, clique novamente para solicitar a verificação.", "error");
      } finally {
        resend.disabled = false;
      }
    });
  }

  if (window.location.pathname.endsWith("/verificar.html")) {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("userId");
    const secret = params.get("secret");
    if (!userId || !secret) {
      showMessage("O link está incompleto ou já foi aberto. Entre na sua conta e solicite outro link de verificação.", "error");
    } else {
      account.updateVerification(userId, secret)
        .then(() => showMessage("E-mail verificado com sucesso! Agora você já pode entrar na sua conta.", "success"))
        .catch((error) => {
          console.error("RUMR verification error:", error);
          showMessage("Não foi possível validar este link. Ele pode ter expirado ou já ter sido utilizado. Entre na sua conta e solicite outro.", "error");
        });
    }
  }
     const requestForm = byId("membershipForm");
  if (requestForm) {
    requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = requestForm.querySelector('button[type="submit"]');
      const displayName = byId("requestDisplayName").value.trim();
      const motivation = byId("requestMotivation").value.trim();
      if (displayName.length < 2 || displayName.length > 60 || motivation.length < 10 || motivation.length > 500) {
        showMessage("Use um nome de 2 a 60 caracteres e uma mensagem de 10 a 500 caracteres.", "error");
        return;
      }
      submit.disabled = true;
      showMessage("Enviando sua solicitação…");
      try {
        const user = await account.get();
        if (!user.emailVerification) {
          showMessage("Verifique seu e-mail antes de enviar a solicitação.", "error");
          return;
        }
        const execution = await functions.createExecution(
          "rumr-admin",
          JSON.stringify({ action: "request", displayName, motivation }),
          false,
          "/",
          "POST",
          { "content-type": "application/json" }
        );
        const result = JSON.parse(execution.responseBody || "{}");
        if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !result.ok) {
          throw new Error(result.message || "Não foi possível enviar a solicitação.");
        }
        showMessage(result.message, "success");
        requestForm.reset();
        submit.textContent = "Solicitação enviada";
      } catch (error) {
        console.error("RUMR membership request error:", error);
        showMessage(error.message || "Falha ao enviar a solicitação. Confira sua conexão e tente novamente.", "error");
      } finally {
        submit.disabled = submit.textContent === "Solicitação enviada";
      }
    });
  }

  const logoutBtn = byId("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      try { await account.deleteSession("current"); }
      catch (error) { console.error("RUMR logout error:", error); }
      window.location.href = "login.html";
    });
  }

  const greeting = byId("memberGreeting");
  if (greeting) {
    account.get().then((user) => {
      if (!user.emailVerification) {
        showMessage("Seu e-mail ainda não foi verificado. Saia e entre novamente após confirmar o endereço.", "error");
        greeting.textContent = "Verificação de e-mail pendente.";
        return;
      }
      greeting.textContent = "Sessão autenticada como " + (user.name || "participante") + ".";
    }).catch(() => {
      window.location.replace("login.html");
    });
  }

  window.RUMR_AUTH_READY = true;
})();
