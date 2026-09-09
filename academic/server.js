const express = require("express");
const cors = require("cors");
const multer = require("multer"); // Biblioteca para receber arquivos
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuração do Multer (Armazena o arquivo na memória RAM temporariamente)
const upload = multer({ storage: multer.memoryStorage() });

// Conexão segura com o Supabase usando a SERVICE_ROLE_KEY no servidor
const supabase = createClient(
  process.env.SUPABASE_URL = "https://jnkonklwmaseeylebhdt.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_publishable_lQ1jnvO5jio3YqNRNDUkuw_a33pg5s7",
);

const SENHA_MESTRA = process.env.SENHA_REPRESENTANTE || "info2026";

// Middleware para verificar a senha enviada nos cabeçalhos (Headers)
const verificarAutenticacao = (req, res, next) => {
  const senhaEnviada = req.headers["x-admin-password"];
  if (!senhaEnviada || senhaEnviada !== SENHA_MESTRA) {
    return res
      .status(401)
      .json({ error: "Acesso não autorizado. Senha incorreta." });
  }
  next();
};

// ==========================================
// FILTRO DE LINGUAGEM OFENSIVA (mesma lógica do frontend, replicada aqui)
// Isso é obrigatório no servidor: o filtro do cliente pode ser burlado por
// quem chamar a API diretamente (Postman, curl, DevTools). Esta é a camada
// que realmente impede a gravação de conteúdo ofensivo no banco.
// ==========================================
const PALAVRAS_BLOQUEADAS = [
  "idiota",
  "burro",
  "burra",
  "imbecil",
  "estupido",
  "estúpido",
  "estupida",
  "estúpida",
  "otario",
  "otário",
  "otaria",
  "otária",
  "lixo",
  "inutil",
  "inútil",
  "porra",
  "merda",
  "bosta",
  "cretino",
  "cretina",
  "retardado",
  "retardada",
  "vagabundo",
  "vagabunda",
  "escroto",
  "escrota",
  "desgraçado",
  "desgraçada",
  "vadia",
  "vadio",
  "puta",
  "viado",
  "bicha",
];

function normalizarTexto(txt) {
  return String(txt)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

function contemOfensa(texto) {
  const normalizado = normalizarTexto(texto);
  return PALAVRAS_BLOQUEADAS.some((palavra) =>
    normalizado.includes(normalizarTexto(palavra)),
  );
}

// Rota de Login/Validação de Senha
app.post("/api/login", (req, res) => {
  const { senha } = req.body;
  if (senha === SENHA_MESTRA) {
    return res.json({ success: true, message: "Autenticado com sucesso" });
  }
  return res.status(401).json({ success: false, message: "Senha incorreta" });
});

// ==========================================
// ROTAS DE PROVAS (EVENTOS)
// ==========================================

app.get("/api/provas", async (req, res) => {
  const { data, error } = await supabase.from("provas").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/provas", verificarAutenticacao, async (req, res) => {
  const { data, error } = await supabase.from("provas").insert([req.body]);
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put("/api/provas/:id", verificarAutenticacao, async (req, res) => {
  const { id } = req.params;
  const { title, tipo, start, descricao } = req.body;

  const { data, error } = await supabase
    .from("provas")
    .update({ title, tipo, start, descricao })
    .eq("id", id)
    .select();

  if (error) return res.status(500).json({ error: error.message });

  if (!data || data.length === 0) {
    return res.status(404).json({ error: "Prova não encontrada." });
  }

  res.json({ message: "Prova atualizada com sucesso", data: data[0] });
});

app.delete("/api/provas/:id", verificarAutenticacao, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("provas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Prova removida com sucesso" });
});

// ==========================================
// ROTAS DE MATERIAIS (PDFs)
// ==========================================

app.get("/api/materiais", async (req, res) => {
  const { data, error } = await supabase.from("materiais").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post(
  "/api/materiais",
  verificarAutenticacao,
  upload.single("arquivo"),
  async (req, res) => {
    try {
      const { nome, disciplina } = req.body;
      const arquivo = req.file;

      if (!arquivo)
        return res.status(400).json({ error: "Nenhum arquivo enviado." });

      const extensao = arquivo.originalname.split(".").pop();
      const nomeArquivoUnico = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extensao}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from("MATERIAIS_PDF")
        .upload(nomeArquivoUnico, arquivo.buffer, {
          contentType: arquivo.mimetype,
        });

      if (storageError) throw storageError;

      const { data: publicUrlData } = supabase.storage
        .from("MATERIAIS_PDF")
        .getPublicUrl(nomeArquivoUnico);

      const { error: dbError } = await supabase.from("materiais").insert([
        {
          nome: nome,
          url: publicUrlData.publicUrl,
          disciplina: disciplina || "Geral",
        },
      ]);

      if (dbError) throw dbError;

      res.status(201).json({ message: "Material enviado com sucesso!" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

app.delete("/api/materiais/:id", verificarAutenticacao, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: material } = await supabase
      .from("materiais")
      .select("url")
      .eq("id", id)
      .single();

    if (material && material.url) {
      const partesUrl = material.url.split("/");
      const nomeArquivo = partesUrl[partesUrl.length - 1];
      await supabase.storage.from("MATERIAIS_PDF").remove([nomeArquivo]);
    }

    const { error } = await supabase.from("materiais").delete().eq("id", id);
    if (error) throw error;

    res.json({ message: "Material removido com sucesso" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROTAS DO FÓRUM (Sugestões dos alunos)
// ==========================================

// 1. Listar sugestões (Público) — mais recentes primeiro
app.get("/api/forum", async (req, res) => {
  const { data, error } = await supabase
    .from("forum")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 2. Criar sugestão (Público — qualquer aluno pode postar, sem senha)
//    Bloqueia automaticamente se detectar linguagem ofensiva.
app.post("/api/forum", async (req, res) => {
  const { nome, texto } = req.body;

  if (!nome || !nome.trim() || !texto || !texto.trim()) {
    return res
      .status(400)
      .json({ error: "Nome e sugestão são obrigatórios." });
  }

  if (nome.length > 100 || texto.length > 2000) {
    return res.status(400).json({ error: "Texto muito longo." });
  }

  if (contemOfensa(nome) || contemOfensa(texto)) {
    return res.status(422).json({
      error:
        "Sua mensagem contém linguagem ofensiva e não foi publicada. Reescreva de forma construtiva.",
    });
  }

  const { data, error } = await supabase
    .from("forum")
    .insert([
      {
        nome: nome.trim(),
        texto: texto.trim(),
        criado_em: new Date().toISOString(),
      },
    ])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ message: "Sugestão publicada com sucesso!", data: data[0] });
});

// 3. Apagar sugestão (Protegido — só o Representante/Editor)
app.delete("/api/forum/:id", verificarAutenticacao, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("forum").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Sugestão removida com sucesso" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));