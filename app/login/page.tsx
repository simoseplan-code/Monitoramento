"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Turnstile } from "@/components/Turnstile";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [token, setToken] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha, turnstileToken: token }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setErro(data.error ?? "Erro ao entrar.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Monitoramento de Obras</h1>
        <p className="text-sm text-slate-500">Entre com sua conta da equipe.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          placeholder="Senha"
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
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="text-sm text-slate-500">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-slate-900 underline">
          Cadastre-se
        </Link>
      </p>
    </main>
  );
}
