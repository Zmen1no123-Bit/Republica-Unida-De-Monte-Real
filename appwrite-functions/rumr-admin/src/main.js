import { Client, Account, Teams, TablesDB, Query, ID, Permission, Role } from "node-appwrite";

const PROJECT_ID = process.env.APPWRITE_FUNCTION_PROJECT_ID;
const ENDPOINT = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
const TEAM_ID = "rumr-admin";
const DATABASE_ID = "6aeb8a27000848e802b4";
const REQUESTS_TABLE_ID = "membership_requests";
const PROFILES_TABLE_ID = "member_profiles";
const ADMIN_ACTIONS_TABLE_ID = "admin_actions";
const APPOINTMENTS_TABLE_ID = "appointments";
const DOCUMENTS_TABLE_ID = "documents";
const PROPOSALS_TABLE_ID = "proposals";
const VOTES_TABLE_ID = "votes";

const PENDING_VALUES = ["pending", "Pending"];
const APPROVED_VALUES = ["approved", "Approved"];
const REJECTED_VALUES = ["rejected", "Rejected"];
const DOCUMENT_CATEGORIES = ["decreto", "ministerio", "instituicao", "constituicao", "regimento"];
const VOTE_CHOICES = ["favoravel", "contrario", "abstencao"];

// Quórum mínimo de votos para encerrar uma proposta.
const QUORUM = 5;

// Cargos permitidos. Qualquer outro valor é recusado pelo servidor.
const POSITIONS = {
  "Presidente": "Presidência",
  "Vice-presidente": "Presidência",
  "Ministro": "Ministérios",
  "Parlamentar": "Congresso",
  "Magistrado": "Supremo Tribunal"
};

function json(res, statusCode, body) {
  return res.json(body, statusCode);
}

// Cliente com a chave de serviço. Retorna null se a chave não estiver configurada.
function serviceDB() {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) return null;
  const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(key);
  return new TablesDB(client);
}

function applicantIdFrom(row) {
  for (const permission of row.$permissions || []) {
    const match = /^read\("user:([^"]+)"\)$/.exec(permission);
    if (match) return match[1];
  }
  return null;
}

function validateReason(reason) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < 10 || text.length > 300) return null;
  return text;
}

function validateText(value, min, max) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) return null;
  return text;
}

async function createMemberProfile(tablesDB, userId, displayName) {
  const last = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: PROFILES_TABLE_ID,
    queries: [Query.orderDesc("MemberNumber"), Query.limit(1)]
  });
  const nextNumber = last.rows.length ? Number(last.rows[0].MemberNumber) + 1 : 1;
  const now = new Date().toISOString();

  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: PROFILES_TABLE_ID,
      rowId: ID.unique(),
      data: {
        UserId: userId,
        DisplayName: displayName || "Membro",
        MemberNumber: nextNumber,
        JoinedAt: now,
        AccountStatus: "active",
        UpdatedAt: now
      },
      permissions: [Permission.read(Role.user(userId))]
    });
  } catch (err) {
    if (err?.code === 409) return "already-exists";
    throw err;
  }
  return "created";
}

async function logAdminAction(tablesDB, { actorId, action, targetUserId, targetRowId, reason }) {
  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: ADMIN_ACTIONS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      ActorId: actorId,
      Action: action,
      TargetUserId: targetUserId,
      TargetRowId: targetRowId || null,
      Reason: reason || null
    }
  });
}

async function countRows(tablesDB, tableId, queries = []) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId,
    queries: [...queries, Query.limit(1)]
  });
  return result.total;
}

async function findActiveAppointment(tablesDB, userId) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: APPOINTMENTS_TABLE_ID,
    queries: [Query.equal("UserId", userId), Query.isNull("EndedAt"), Query.limit(1)]
  });
  return result.rows[0] || null;
}

async function endActiveAppointments(tablesDB, userId, reason) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: APPOINTMENTS_TABLE_ID,
    queries: [Query.equal("UserId", userId), Query.isNull("EndedAt"), Query.limit(100)]
  });
  const now = new Date().toISOString();
  for (const row of result.rows) {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: APPOINTMENTS_TABLE_ID,
      rowId: row.$id,
      data: { EndedAt: now, EndedReason: reason }
    });
  }
  return result.rows.length;
}

// Verifica se o usuário ocupa o cargo de Parlamentar com nomeação ativa.
// Verifica se o usuário ocupa cargo com direito a propor e votar (Parlamentar ou Presidente).
async function isActiveParlamentar(tablesDB, userId) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: APPOINTMENTS_TABLE_ID,
    queries: [
      Query.equal("UserId", userId),
      Query.equal("Position", ["Parlamentar", "Presidente"]),
      Query.isNull("EndedAt"),
      Query.limit(1)
    ]
  });
  return result.rows.length > 0;
}

// Conta os votos de uma proposta, por escolha.
async function tallyVotes(tablesDB, proposalId) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: VOTES_TABLE_ID,
    queries: [Query.equal("ProposalId", proposalId), Query.limit(100)]
  });
  const counts = { favoravel: 0, contrario: 0, abstencao: 0 };
  for (const row of result.rows) {
    counts[row.Choice] = (counts[row.Choice] || 0) + 1;
  }
  return { counts, total: result.rows.length };
}

export default async ({ req, res, error }) => {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { ok: false, message: "Método não permitido." });
    }

    const body = req.bodyJson || {};

    // Rota pública: documentos publicados, sem login. Só devolve campos seguros.
    if (body.action === "public-documents") {
      const publicDB = serviceDB();
      if (!publicDB) {
        error("Variável APPWRITE_API_KEY ausente.");
        return json(res, 500, { ok: false, message: "Configuração interna incompleta." });
      }

      const result = await publicDB.listRows({
        databaseId: DATABASE_ID,
        tableId: DOCUMENTS_TABLE_ID,
        queries: [Query.equal("Published", [true]), Query.orderAsc("Slug"), Query.limit(100)]
      });

      return json(res, 200, {
        ok: true,
        documents: result.rows.map((row) => ({
          slug: row.Slug,
          title: row.Title,
          category: row.Category,
          institution: row.Institution || "",
          number: row.Number ?? null,
          content: row.Content,
          publishedAt: row.PublishedAt || null,
          updatedAt: row.UpdatedAt || null
        }))
      });
    }

    const jwt = req.headers["x-appwrite-user-jwt"];
    if (!jwt) {
      return json(res, 401, { ok: false, message: "Faça login para continuar." });
    }

    if (!PROJECT_ID || !ENDPOINT) {
      error("Variáveis de ambiente do Appwrite ausentes.");
      return json(res, 500, { ok: false, message: "Configuração interna incompleta." });
    }

    const userClient = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(userClient);
    const teams = new Teams(userClient);

    const user = await account.get();

    if (!user.emailVerification) {
      return json(res, 403, { ok: false, message: "Verifique seu e-mail antes de acessar a administração." });
    }

    // Envio de solicitação de ingresso: qualquer usuário verificado, sem ser administrador.
    if (body.action === "request") {
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      const motivation = typeof body.motivation === "string" ? body.motivation.trim() : "";

      if (displayName.length < 2 || displayName.length > 60 || motivation.length < 10 || motivation.length > 500) {
        return json(res, 400, { ok: false, message: "Use um nome de 2 a 60 caracteres e uma mensagem de 10 a 500 caracteres." });
      }

      const requestDB = serviceDB();
      if (!requestDB) {
        error("Variável APPWRITE_API_KEY ausente.");
        return json(res, 500, { ok: false, message: "Configuração interna incompleta." });
      }

      const profiles = await requestDB.listRows({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        queries: [Query.equal("UserId", user.$id), Query.limit(1)]
      });
      if (profiles.rows.length && String(profiles.rows[0].AccountStatus).toLowerCase() === "suspended") {
        return json(res, 403, { ok: false, message: "Sua conta está suspensa. Não é possível enviar novas solicitações." });
      }

      await requestDB.createRow({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        rowId: ID.unique(),
        data: { DisplayName: displayName, Motivation: motivation },
        permissions: [Permission.read(Role.user(user.$id))]
      });

      return json(res, 200, { ok: true, message: "Solicitação enviada. Criar uma conta não significa aprovação automática." });
    }

    const tablesDB = serviceDB();
    if (!tablesDB) {
      error("Variável APPWRITE_API_KEY ausente.");
      return json(res, 500, { ok: false, message: "A chave de serviço da função não está configurada." });
    }

    const teamResult = await teams.listMemberships({ teamId: TEAM_ID, total: false });
    const adminUserIds = new Set(
      teamResult.memberships.filter((m) => m.confirm === true).map((m) => m.userId)
    );
    const isAdmin = adminUserIds.has(user.$id);
    const isParlamentar = await isActiveParlamentar(tablesDB, user.$id);
    const action = body.action;
    
        if (action === "whoami") {
      return json(res, 200, {
        ok: true,
        isAdmin,
        isParlamentar
      });
    }

    // Ações do Congresso: parlamentares propõem e votam; administradores também consultam a lista.
    if (action === "proposals") {
      if (!isAdmin && !isParlamentar) {
        return json(res, 403, { ok: false, message: "Acesso restrito a parlamentares e administradores." });
      }

      const [proposalRows, voteRows, profileRows] = await Promise.all([
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: PROPOSALS_TABLE_ID,
          queries: [Query.orderDesc("ProposedAt"), Query.limit(100)]
        }),
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: VOTES_TABLE_ID,
          queries: [Query.limit(100)]
        }),
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: PROFILES_TABLE_ID,
          queries: [Query.limit(100)]
        })
      ]);

      const nameByUser = new Map(profileRows.rows.map((p) => [p.UserId, p.DisplayName]));
      const votesByProposal = new Map();
      for (const vote of voteRows.rows) {
        if (!votesByProposal.has(vote.ProposalId)) votesByProposal.set(vote.ProposalId, []);
        votesByProposal.get(vote.ProposalId).push(vote);
      }

      return json(res, 200, {
        ok: true,
        proposals: proposalRows.rows.map((row) => {
          const votes = votesByProposal.get(row.$id) || [];
          const counts = { favoravel: 0, contrario: 0, abstencao: 0 };
          for (const vote of votes) counts[vote.Choice] = (counts[vote.Choice] || 0) + 1;
          const mine = votes.find((vote) => vote.VoterId === user.$id);

          return {
            id: row.$id,
            title: row.Title,
            body: row.Body,
            status: String(row.Status || "pending").toLowerCase(),
            proposedAt: row.ProposedAt,
            proposedByName: nameByUser.get(row.ProposedBy) || "Parlamentar",
            decidedAt: row.DecidedAt || null,
            decisionReason: row.DecisionReason || null,
            counts,
            total: votes.length,
            myVote: mine ? mine.Choice : null,
            documentSlug: row.DocumentSlug || null
          };
        })
      });
    }

    if (action === "propose") {
      if (!isParlamentar) {
        return json(res, 403, { ok: false, message: "Apenas parlamentares podem apresentar propostas." });
      }

      const title = validateText(body.title, 5, 200);
      const text = validateText(body.body, 50, 50000);
      if (!title || !text) {
        return json(res, 400, { ok: false, message: "Use um título de 5 a 200 caracteres e um texto de 50 a 50000 caracteres." });
      }

      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: PROPOSALS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          Title: title,
          Body: text,
          Status: "pending",
          ProposedBy: user.$id,
          ProposedAt: new Date().toISOString()
        }
      });

      return json(res, 200, { ok: true, message: "Proposta apresentada." });
    }

    if (action === "vote") {
      if (!isParlamentar) {
        return json(res, 403, { ok: false, message: "Apenas parlamentares podem votar." });
      }

      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const choice = body.choice;
      if (!proposalId || proposalId.length > 36 || !VOTE_CHOICES.includes(choice)) {
        return json(res, 400, { ok: false, message: "Dados de voto inválidos." });
      }

      const proposal = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: PROPOSALS_TABLE_ID,
        rowId: proposalId
      });
      if (String(proposal.Status).toLowerCase() !== "pending") {
        return json(res, 409, { ok: false, message: "Esta proposta já foi encerrada." });
      }

      const existing = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: VOTES_TABLE_ID,
        queries: [Query.equal("ProposalId", proposalId), Query.equal("VoterId", user.$id), Query.limit(1)]
      });
      if (existing.rows.length) {
        return json(res, 409, { ok: false, message: "Você já votou nesta proposta." });
      }

      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: VOTES_TABLE_ID,
        rowId: ID.unique(),
        data: {
          ProposalId: proposalId,
          VoterId: user.$id,
          Choice: choice,
          CastAt: new Date().toISOString()
        }
      });

      return json(res, 200, { ok: true, message: "Voto registrado." });
    }

    // Daqui em diante, só administradores.
    if (!isAdmin) {
      return json(res, 403, { ok: false, message: "Acesso restrito à equipe Administradores RUMR." });
    }

    if (action === "stats") {
      const [members, membersActive, membersSuspended, pending, approved, rejected] = await Promise.all([
        countRows(tablesDB, PROFILES_TABLE_ID),
        countRows(tablesDB, PROFILES_TABLE_ID, [Query.equal("AccountStatus", ["active"])]),
        countRows(tablesDB, PROFILES_TABLE_ID, [Query.equal("AccountStatus", ["suspended"])]),
        countRows(tablesDB, REQUESTS_TABLE_ID, [Query.equal("Status", PENDING_VALUES)]),
        countRows(tablesDB, REQUESTS_TABLE_ID, [Query.equal("Status", APPROVED_VALUES)]),
        countRows(tablesDB, REQUESTS_TABLE_ID, [Query.equal("Status", REJECTED_VALUES)])
      ]);

      return json(res, 200, {
        ok: true,
        stats: { members, membersActive, membersSuspended, pending, approved, rejected }
      });
    }

    if (action === "list") {
      const result = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        queries: [Query.orderDesc("$createdAt"), Query.limit(100)]
      });

      return json(res, 200, {
        ok: true,
        requests: result.rows.map((row) => ({
          id: row.$id,
          displayName: row.DisplayName || "",
          motivation: row.Motivation || "",
          status: String(row.Status || "pending").toLowerCase(),
          createdAt: row.$createdAt,
          reviewedAt: row.ReviewedAt || null,
          reviewedBy: row.ReviewedBy || null
        }))
      });
    }

    if (action === "members") {
      const [profiles, activeAppointments] = await Promise.all([
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: PROFILES_TABLE_ID,
          queries: [Query.orderAsc("MemberNumber"), Query.limit(100)]
        }),
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: APPOINTMENTS_TABLE_ID,
          queries: [Query.isNull("EndedAt"), Query.limit(100)]
        })
      ]);

      const positionByUser = new Map(activeAppointments.rows.map((row) => [row.UserId, row]));

      return json(res, 200, {
        ok: true,
        members: profiles.rows.map((row) => {
          const appointment = positionByUser.get(row.UserId);
          return {
            rowId: row.$id,
            userId: row.UserId,
            displayName: row.DisplayName || "",
            memberNumber: row.MemberNumber,
            joinedAt: row.JoinedAt || null,
            accountStatus: String(row.AccountStatus || "active").toLowerCase(),
            position: appointment ? appointment.Position : null,
            institution: appointment ? appointment.Institution : null
          };
        })
      });
    }

    if (action === "suspend" || action === "reactivate") {
      const targetUserId = typeof body.userId === "string" ? body.userId : "";
      const reason = validateReason(body.reason);

      if (!targetUserId || targetUserId.length > 36) {
        return json(res, 400, { ok: false, message: "Membro inválido." });
      }
      if (!reason) {
        return json(res, 400, { ok: false, message: "Informe um motivo entre 10 e 300 caracteres." });
      }
      if (targetUserId === user.$id) {
        return json(res, 403, { ok: false, message: "Você não pode alterar a própria conta." });
      }
      if (adminUserIds.has(targetUserId)) {
        return json(res, 403, { ok: false, message: "Membros da equipe de administração não podem ser suspensos." });
      }

      const found = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        queries: [Query.equal("UserId", targetUserId), Query.limit(1)]
      });
      if (!found.rows.length) {
        return json(res, 404, { ok: false, message: "Perfil de membro não encontrado." });
      }

      const profile = found.rows[0];
      const currentStatus = String(profile.AccountStatus || "active").toLowerCase();
      const newStatus = action === "suspend" ? "suspended" : "active";

      if (currentStatus === newStatus) {
        const message = newStatus === "suspended" ? "Esta conta já está suspensa." : "Esta conta já está ativa.";
        return json(res, 409, { ok: false, message });
      }

      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        rowId: profile.$id,
        data: {
          AccountStatus: newStatus,
          UpdatedAt: new Date().toISOString()
        }
      });

      if (newStatus === "suspended") {
        await endActiveAppointments(tablesDB, targetUserId, "Conta suspensa.");
      }

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action,
        targetUserId,
        targetRowId: profile.$id,
        reason
      });

      return json(res, 200, {
        ok: true,
        message: newStatus === "suspended" ? "Conta suspensa." : "Conta reativada.",
        member: { userId: targetUserId, accountStatus: newStatus }
      });
    }

    if (action === "appoint") {
      const targetUserId = typeof body.userId === "string" ? body.userId : "";
      const position = body.position;

      if (!targetUserId || targetUserId.length > 36) {
        return json(res, 400, { ok: false, message: "Membro inválido." });
      }
      if (!Object.prototype.hasOwnProperty.call(POSITIONS, position)) {
        return json(res, 400, { ok: false, message: "Cargo inválido." });
      }

      const profiles = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        queries: [Query.equal("UserId", targetUserId), Query.limit(1)]
      });
      if (!profiles.rows.length) {
        return json(res, 404, { ok: false, message: "Perfil de membro não encontrado." });
      }
      if (String(profiles.rows[0].AccountStatus).toLowerCase() !== "active") {
        return json(res, 409, { ok: false, message: "Só membros com conta ativa podem ser nomeados." });
      }
      if (await findActiveAppointment(tablesDB, targetUserId)) {
        return json(res, 409, { ok: false, message: "Este membro já ocupa um cargo. Exonere antes de nomear outro." });
      }

      const created = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: APPOINTMENTS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          UserId: targetUserId,
          Position: position,
          Institution: POSITIONS[position],
          StartedAt: new Date().toISOString(),
          AppointedBy: user.$id
        }
      });

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: "appoint",
        targetUserId,
        targetRowId: created.$id,
        reason: null
      });

      return json(res, 200, { ok: true, message: "Cargo atribuído." });
    }

    if (action === "dismiss") {
      const targetUserId = typeof body.userId === "string" ? body.userId : "";
      const reason = validateReason(body.reason);

      if (!targetUserId || targetUserId.length > 36) {
        return json(res, 400, { ok: false, message: "Membro inválido." });
      }
      if (!reason) {
        return json(res, 400, { ok: false, message: "Informe um motivo entre 10 e 300 caracteres." });
      }
      if (targetUserId === user.$id) {
        return json(res, 403, { ok: false, message: "Você não pode alterar o próprio cargo." });
      }

      const active = await findActiveAppointment(tablesDB, targetUserId);
      if (!active) {
        return json(res, 404, { ok: false, message: "Este membro não ocupa cargo ativo." });
      }

      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: APPOINTMENTS_TABLE_ID,
        rowId: active.$id,
        data: { EndedAt: new Date().toISOString(), EndedReason: reason }
      });

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: "dismiss",
        targetUserId,
        targetRowId: active.$id,
        reason
      });

      return json(res, 200, { ok: true, message: "Cargo encerrado." });
    }

    if (action === "documents-admin") {
      const result = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: DOCUMENTS_TABLE_ID,
        queries: [Query.orderAsc("Slug"), Query.limit(100)]
      });

      return json(res, 200, {
        ok: true,
        documents: result.rows.map((row) => ({
          rowId: row.$id,
          slug: row.Slug,
          title: row.Title,
          category: row.Category,
          institution: row.Institution || "",
          number: row.Number ?? null,
          content: row.Content,
          published: row.Published === true,
          publishedAt: row.PublishedAt || null,
          updatedAt: row.UpdatedAt || null
        }))
      });
    }

    if (action === "document-save") {
      const rowId = typeof body.rowId === "string" ? body.rowId : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const content = typeof body.content === "string" ? body.content : "";
      const institution = typeof body.institution === "string" ? body.institution.trim() : "";
      const published = body.published === true;
      const reason = validateReason(body.reason);

      if (!title || title.length > 200) {
        return json(res, 400, { ok: false, message: "Título inválido (até 200 caracteres)." });
      }
      if (!content || content.length > 100000) {
        return json(res, 400, { ok: false, message: "Conteúdo vazio ou acima de 100000 caracteres." });
      }
      if (!reason) {
        return json(res, 400, { ok: false, message: "Informe um motivo entre 10 e 300 caracteres." });
      }

      const now = new Date().toISOString();
      const data = { Title: title, Content: content, Institution: institution, Published: published, UpdatedAt: now };

      let savedId = rowId;
      if (rowId) {
        await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: DOCUMENTS_TABLE_ID, rowId, data });
      } else {
        const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
        const category = typeof body.category === "string" ? body.category.trim() : "";
        if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
          return json(res, 400, { ok: false, message: "Identificador inválido: use letras minúsculas, números e hífens (3 a 80 caracteres)." });
        }
        if (!DOCUMENT_CATEGORIES.includes(category)) {
          return json(res, 400, { ok: false, message: "Categoria inválida." });
        }
        const created = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: DOCUMENTS_TABLE_ID,
          rowId: ID.unique(),
          data: { ...data, Slug: slug, Category: category, PublishedAt: published ? now : null }
        });
        savedId = created.$id;
      }

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: rowId ? "document-update" : "document-create",
        targetUserId: user.$id,
        targetRowId: savedId,
        reason
      });

      return json(res, 200, { ok: true, message: "Documento salvo.", rowId: savedId });
    }

    if (action === "close-proposal") {
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const reason = validateReason(body.reason);

      if (!proposalId || proposalId.length > 36) {
        return json(res, 400, { ok: false, message: "Proposta inválida." });
      }
      if (!reason) {
        return json(res, 400, { ok: false, message: "Informe um motivo entre 10 e 300 caracteres." });
      }

      const proposal = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: PROPOSALS_TABLE_ID,
        rowId: proposalId
      });
      if (String(proposal.Status).toLowerCase() !== "pending") {
        return json(res, 409, { ok: false, message: "Esta proposta já foi encerrada." });
      }

      const tally = await tallyVotes(tablesDB, proposalId);
      if (tally.total < QUORUM) {
        return json(res, 409, {
          ok: false,
          message: `Quórum mínimo de ${QUORUM} votos não atingido (${tally.total} até agora).`
        });
      }

      const approved = tally.counts.favoravel > tally.counts.contrario;
      const newStatus = approved ? "approved" : "rejected";

      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: PROPOSALS_TABLE_ID,
        rowId: proposalId,
        data: {
          Status: newStatus,
          DecidedAt: new Date().toISOString(),
          DecidedBy: user.$id,
          DecisionReason: reason,
          VotesFor: tally.counts.favoravel,
          VotesAgainst: tally.counts.contrario,
          VotesAbstain: tally.counts.abstencao
        }
      });

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: "proposal-close",
        targetUserId: proposal.ProposedBy,
        targetRowId: proposalId,
        reason
      });

      return json(res, 200, {
        ok: true,
        message: approved ? "Proposta aprovada." : "Proposta rejeitada."
      });
    }

    if (action === "publish-proposal") {
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const reason = validateReason(body.reason);

      if (!proposalId || proposalId.length > 36) {
        return json(res, 400, { ok: false, message: "Proposta inválida." });
      }
      if (!reason) {
        return json(res, 400, { ok: false, message: "Informe um motivo entre 10 e 300 caracteres." });
      }

      const proposal = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: PROPOSALS_TABLE_ID,
        rowId: proposalId
      });
      const status = String(proposal.Status).toLowerCase();
      if (status === "pending") {
        return json(res, 409, { ok: false, message: "Só propostas encerradas podem ser publicadas." });
      }
      if (proposal.DocumentSlug) {
        return json(res, 409, { ok: false, message: "Esta proposta já foi publicada." });
      }

      const now = new Date().toISOString();
      const slug = `proposta-${proposalId.toLowerCase()}`;
      const situation = status === "approved" ? "Aprovada" : "Rejeitada";
      const content = [
        `# ${proposal.Title}`,
        "",
        proposal.Body,
        "",
        "---",
        "",
        `**Situação:** ${situation}`,
        "",
        `**Votos:** favoráveis ${proposal.VotesFor || 0}, contrários ${proposal.VotesAgainst || 0}, abstenções ${proposal.VotesAbstain || 0}.`
      ].join("\n");

      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: DOCUMENTS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          Slug: slug,
          Title: proposal.Title,
          Category: "instituicao",
          Institution: "Congresso",
          Content: content,
          Published: true,
          PublishedAt: now,
          UpdatedAt: now
        }
      });

      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: PROPOSALS_TABLE_ID,
        rowId: proposalId,
        data: { DocumentSlug: slug, PublishedAt: now }
      });

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: "proposal-publish",
        targetUserId: proposal.ProposedBy,
        targetRowId: proposalId,
        reason
      });

      return json(res, 200, { ok: true, message: "Proposta publicada no site.", slug });
    }

    if (action === "review") {
      const rowId = typeof body.rowId === "string" ? body.rowId : "";
      const status = body.status;
      const reason = validateReason(body.reason);

      if (!rowId || rowId.length > 36 || !["approved", "rejected"].includes(status)) {
        return json(res, 400, { ok: false, message: "Dados de revisão inválidos." });
      }

      const row = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        rowId
      });

      const applicantId = applicantIdFrom(row);
      if (!applicantId) {
        error("Não foi possível identificar o solicitante da linha " + rowId);
        return json(res, 422, { ok: false, message: "Não foi possível identificar o solicitante desta solicitação." });
      }

      if (status === "approved") {
        await createMemberProfile(tablesDB, applicantId, row.DisplayName);
      }

      const updated = await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        rowId,
        data: {
          Status: status,
          ReviewedAt: new Date().toISOString(),
          ReviewedBy: user.$id
        }
      });

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: status === "approved" ? "approve" : "reject",
        targetUserId: applicantId,
        targetRowId: rowId,
        reason
      });

      return json(res, 200, {
        ok: true,
        message: status === "approved" ? "Solicitação aprovada e perfil criado." : "Solicitação rejeitada.",
        request: { id: updated.$id, status }
      });
    }

    return json(res, 400, { ok: false, message: "Ação desconhecida." });
  } catch (err) {
    error("RUMR admin function error: " + (err?.stack || err?.message || String(err)));
    const code = Number(err?.code) || 500;
    if (code === 404) {
      return json(res, 404, { ok: false, message: "Tabela ou solicitação não encontrada. Confira a configuração do banco." });
    }
    if (code === 401 || code === 403) {
      return json(res, code, { ok: false, message: "Acesso negado. Confira a sessão e as permissões da função." });
    }
    return json(res, 500, { ok: false, message: "Não foi possível concluir a operação. Consulte os logs da função." });
  }
};
