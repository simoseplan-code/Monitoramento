"use client";

import Link from "next/link";
import { useState } from "react";
import { Turnstile } from "@/components/Turnstile";

export default function CadastroPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [token, setToken] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const resp = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, senha, turnstileToken: token }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setErro(data.error ?? "Erro ao cadastrar.");
        return;
      }
      setEnviado(true);
    } finally {
      setCarregando(false);
    }
  }

  if (enviado) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">Cadastro enviado</h1>
        <p className="text-slate-600">
          Seu cadastro foi recebido e está aguardando aprovação de um administrador. Você será avisado quando puder acessar.
        </p>
        <Link href="/login" className="font-medium text-slate-900 underline">
          Voltar para o login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Criar cadastro</h1>
        <p className="text-sm text-slate-500">Seu acesso precisa ser aprovado por um administrador.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          required
          placeholder="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Senha (mín. 8 caracteres)"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <Turnstile onToken={setToken} />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button
          type="submit"
          disabled={carregando}
          className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {carregando ? "Enviando..." : "Cadastrar"}
        </button>
      </form>

      <p className="text-sm text-slate-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-slate-900 underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
