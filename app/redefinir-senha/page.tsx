"use client";

import Link from "next/link";
import { useState } from "react";

export default function RedefinirSenhaPage() {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 10) return setErro("A senha precisa ter pelo menos 10 caracteres.");
    if (senha !== confirmacao) return setErro("As duas senhas não são iguais.");
    setSalvando(true);
    try {
      const resp = await fetch("/api/auth/redefinir-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) return setErro(data.error ?? "Não foi possível salvar a nova senha.");
      setPronto(true);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  if (pronto) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">Senha alterada</h1>
        <p className="text-slate-600">Entre com a sua nova senha. Por segurança, os outros acessos abertos foram encerrados.</p>
        <Link href="/login" className="rounded bg-slate-900 px-3 py-2 text-white">
          Ir para o login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Crie uma nova senha</h1>
        <p className="text-sm text-slate-500">Escolha uma senha só sua, com pelo menos 10 caracteres.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="Nova senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="Repita a nova senha"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button type="submit" disabled={salvando} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
          {salvando ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </main>
  );
}
