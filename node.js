const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexão segura com o Supabase usando a SERVICE_ROLE_KEY no servidor
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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

// 1. Listar Provas (Público)
app.get("/api/provas", async (req, res) => {
  const { data, error } = await supabase.from("provas").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 2. Criar Prova (Protegido - Requer Senha)
app.post("/api/provas", verificarAutenticacao, async (req, res) => {
  const { data, error } = await supabase.from("provas").insert([req.body]);
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// 3. Deletar Prova (Protegido - Requer Senha)
app.delete("/api/provas/:id", verificarAutenticacao, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("provas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Prova removida com sucesso" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
