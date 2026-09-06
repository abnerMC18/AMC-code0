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

app.delete("/api/provas/:id", verificarAutenticacao, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("provas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Prova removida com sucesso" });
});

// ==========================================
// ROTAS DE MATERIAIS (PDFs)
// ==========================================

// 1. Listar Materiais (Público)
app.get("/api/materiais", async (req, res) => {
  const { data, error } = await supabase.from("materiais").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 2. Criar Material com Upload (Protegido) - Usa upload.single("arquivo")
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

      // Gera um nome único para o arquivo no Supabase Storage
      const extensao = arquivo.originalname.split(".").pop();
      const nomeArquivoUnico = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extensao}`;

      // Upload do buffer para o Storage do Supabase (Bucket MATERIAIS_PDF)
      const { data: storageData, error: storageError } = await supabase.storage
        .from("MATERIAIS_PDF")
        .upload(nomeArquivoUnico, arquivo.buffer, {
          contentType: arquivo.mimetype,
        });

      if (storageError) throw storageError;

      // Pega a URL pública
      const { data: publicUrlData } = supabase.storage
        .from("MATERIAIS_PDF")
        .getPublicUrl(nomeArquivoUnico);

      // Salva no banco de dados
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

// 3. Deletar Material (Protegido)
app.delete("/api/materiais/:id", verificarAutenticacao, async (req, res) => {
  try {
    const { id } = req.params;

    // Busca o material para pegar a URL e deletar do Storage
    const { data: material } = await supabase
      .from("materiais")
      .select("url")
      .eq("id", id)
      .single();

    if (material && material.url) {
      const partesUrl = material.url.split("/");
      const nomeArquivo = partesUrl[partesUrl.length - 1];
      // Apaga o arquivo físico do Storage
      await supabase.storage.from("MATERIAIS_PDF").remove([nomeArquivo]);
    }

    // Apaga o registro do banco de dados
    const { error } = await supabase.from("materiais").delete().eq("id", id);
    if (error) throw error;

    res.json({ message: "Material removido com sucesso" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
