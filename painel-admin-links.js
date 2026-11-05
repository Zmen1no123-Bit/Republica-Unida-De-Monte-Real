(() => {
  "use strict";

  const PROJECT_ID = "6aeb2aec002a69ad90ef";
  const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
  const FUNCTION_ID = "rumr-admin";

  const box = document.getElementById("adminLinks");
  if (!box || !window.Appwrite) return;

  const client = new Appwrite.Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
  const account = new Appwrite.Account(client);
  const functions = new Appwrite.Functions(client);

  account.get()
    .then(async (user) => {
      if (!user.emailVerification) return;

      const execution = await functions.createExecution(
        FUNCTION_ID,
        JSON.stringify({ action: "whoami" }),
        false,
        "/",
        "POST",
        { "content-type": "application/json" }
      );

      const result = JSON.parse(execution.responseBody || "{}");
      if (result.ok && result.isAdmin) {
        box.hidden = false;
      }
    })
    .catch(() => {
      // Sem sessão, o botão continua escondido.
    });
})();
