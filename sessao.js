(() => {
  "use strict";

  if (!window.Appwrite) return;

  const client = new Appwrite.Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject("6aeb2aec002a69ad90ef");
  const account = new Appwrite.Account(client);
  const page = location.pathname.split("/").pop() || "index.html";

  account.get()
    .then((user) => {
      // Só considera logado quem verificou o e-mail.
      if (!user.emailVerification) return;

      // Qualquer link para login.html passa a levar à área do membro.
      document.querySelectorAll('a[href$="login.html"]').forEach((link) => {
        link.setAttribute("href", "painel.html");
        if (/entrar|login/i.test(link.textContent)) {
          link.textContent = "Área do membro";
        }
      });

      // Quem já está logado não precisa ver a tela de login.
      if (page === "login.html") {
        location.replace("painel.html");
      }
    })
    .catch(() => {
      // Sem sessão: a página continua como está.
    });
})();
